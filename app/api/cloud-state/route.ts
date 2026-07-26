import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  parseCloudStateData,
  type CloudStateData,
} from "@/lib/cloud-state";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 256_000;

type CloudRow = {
  payload: string;
  updated_at: string;
  version: number;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function userIdForEmail(email: string) {
  const normalized = `chatgpt:${email.trim().toLowerCase()}`;
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureCloudStateTable() {
  if (!env.DB) throw new Error("Cloud storage is unavailable.");
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_cloud_states (
      user_id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function readCloudRow(userId: string) {
  const row = await env.DB.prepare(
    `SELECT version, payload, updated_at
     FROM user_cloud_states
     WHERE user_id = ?1`,
  )
    .bind(userId)
    .first();
  return row as CloudRow | null;
}

function decodeRow(row: CloudRow | null) {
  if (!row) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.payload);
  } catch {
    return null;
  }
  const data = parseCloudStateData(raw);
  if (!data) return null;
  return {
    version: row.version,
    updatedAt: row.updated_at,
    data,
  };
}

async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return {
    account: {
      displayName: user.displayName,
      email: user.email,
    },
    userId: await userIdForEmail(user.email),
  };
}

export async function GET() {
  const identity = await requireApiUser();
  if (!identity) return jsonError("로그인이 필요합니다.", 401);

  try {
    await ensureCloudStateTable();
    const cloudState = decodeRow(await readCloudRow(identity.userId));
    return Response.json({
      account: identity.account,
      cloudState,
    });
  } catch {
    return jsonError("클라우드 기록을 불러오지 못했습니다.", 503);
  }
}

export async function PUT(request: Request) {
  const identity = await requireApiUser();
  if (!identity) return jsonError("로그인이 필요합니다.", 401);

  let body: { baseVersion?: unknown; data?: unknown };
  try {
    body = (await request.json()) as { baseVersion?: unknown; data?: unknown };
  } catch {
    return jsonError("저장할 기록의 형식이 올바르지 않습니다.", 400);
  }

  if (
    !Number.isInteger(body.baseVersion) ||
    (body.baseVersion as number) < 0
  ) {
    return jsonError("클라우드 버전이 올바르지 않습니다.", 400);
  }

  const data = parseCloudStateData(body.data);
  if (!data) return jsonError("저장할 기록의 형식이 올바르지 않습니다.", 400);

  const payload = JSON.stringify(data satisfies CloudStateData);
  if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
    return jsonError("저장할 기록이 너무 큽니다.", 413);
  }

  try {
    await ensureCloudStateTable();
    const currentRow = await readCloudRow(identity.userId);
    const currentState = decodeRow(currentRow);
    const baseVersion = body.baseVersion as number;

    if ((currentRow?.version ?? 0) !== baseVersion) {
      return Response.json(
        {
          error: "다른 기기의 기록이 먼저 저장되었습니다.",
          cloudState: currentState,
        },
        { status: 409 },
      );
    }

    const updatedAt = new Date().toISOString();
    const nextVersion = baseVersion + 1;

    if (!currentRow) {
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO user_cloud_states
          (user_id, version, payload, updated_at)
         VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(identity.userId, nextVersion, payload, updatedAt)
        .run();
      if (!inserted.meta.changes) {
        return Response.json(
          {
            error: "다른 기기의 기록이 먼저 저장되었습니다.",
            cloudState: decodeRow(await readCloudRow(identity.userId)),
          },
          { status: 409 },
        );
      }
    } else {
      const updated = await env.DB.prepare(
        `UPDATE user_cloud_states
         SET version = ?1, payload = ?2, updated_at = ?3
         WHERE user_id = ?4 AND version = ?5`,
      )
        .bind(
          nextVersion,
          payload,
          updatedAt,
          identity.userId,
          baseVersion,
        )
        .run();
      if (!updated.meta.changes) {
        return Response.json(
          {
            error: "다른 기기의 기록이 먼저 저장되었습니다.",
            cloudState: decodeRow(await readCloudRow(identity.userId)),
          },
          { status: 409 },
        );
      }
    }

    return Response.json({
      cloudState: {
        version: nextVersion,
        updatedAt,
        data,
      },
    });
  } catch {
    return jsonError("클라우드 기록을 저장하지 못했습니다.", 503);
  }
}

export async function DELETE() {
  const identity = await requireApiUser();
  if (!identity) return jsonError("로그인이 필요합니다.", 401);

  try {
    await ensureCloudStateTable();
    await env.DB.prepare(
      "DELETE FROM user_cloud_states WHERE user_id = ?1",
    )
      .bind(identity.userId)
      .run();
    return Response.json({ deleted: true });
  } catch {
    return jsonError("클라우드 기록을 삭제하지 못했습니다.", 503);
  }
}
