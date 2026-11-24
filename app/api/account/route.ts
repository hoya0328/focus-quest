import { env } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  addOperationalHeaders,
  createApiRequestContext,
  logApiFailure,
  type ApiRequestContext,
} from "@/lib/server-observability";

export const dynamic = "force-dynamic";

const ACCOUNT_DELETE_CONFIRMATION = "delete-my-focus-quest-account";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_LIST_PAGE_SIZE = 100;
const MAX_OWNED_STORAGE_ENTRIES = 5_000;

function response(
  body: unknown,
  init: ResponseInit = {},
  context?: ApiRequestContext,
) {
  const headers = new Headers(init.headers);
  addOperationalHeaders(headers, context);
  return Response.json(body, { ...init, headers });
}

function error(message: string, status: number, context?: ApiRequestContext) {
  return response(
    { error: message, ...(context ? { requestId: context.requestId } : {}) },
    { status },
    context,
  );
}

function serverConfiguration() {
  const serverEnv = env as unknown as Record<string, string | undefined>;
  const url = serverEnv.SUPABASE_URL;
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { serviceRoleKey, url } : null;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function isOwnedStudyMaterialPath(
  path: unknown,
  userId: string,
): path is string {
  if (typeof path !== "string") return false;
  const segments = path.split("/");
  return (
    segments.length === 3 &&
    segments[0] === userId &&
    UUID_PATTERN.test(segments[1]) &&
    segments[2] === "source.pdf"
  );
}

function isSafeStorageSegment(value: string) {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

async function listOwnedStorageObjects(
  admin: SupabaseClient,
  userId: string,
) {
  if (!UUID_PATTERN.test(userId)) throw new Error("Invalid storage owner.");
  const bucket = admin.storage.from("study-materials");
  const pendingPrefixes = [userId];
  const paths: string[] = [];
  let scannedEntries = 0;

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift();
    if (!prefix) continue;
    let offset = 0;

    while (true) {
      const listed = await bucket.list(prefix, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (listed.error) throw listed.error;
      const entries = listed.data ?? [];

      for (const entry of entries) {
        scannedEntries += 1;
        if (scannedEntries > MAX_OWNED_STORAGE_ENTRIES) {
          throw new Error("Storage cleanup limit exceeded.");
        }
        if (!isSafeStorageSegment(entry.name)) {
          throw new Error("Unsafe storage object name.");
        }
        const path = `${prefix}/${entry.name}`;
        if (path.length > 500 || !path.startsWith(`${userId}/`)) {
          throw new Error("Unsafe storage object path.");
        }
        if (entry.id) paths.push(path);
        else pendingPrefixes.push(path);
      }

      if (entries.length < STORAGE_LIST_PAGE_SIZE) break;
      offset += STORAGE_LIST_PAGE_SIZE;
    }
  }

  return paths;
}

export async function DELETE(request: Request) {
  const context = createApiRequestContext(request, "account");
  if (!sameOrigin(request)) {
    return error("허용되지 않은 요청입니다.", 403, context);
  }
  const configuration = serverConfiguration();
  if (!configuration) return error("찾을 수 없습니다.", 404, context);
  const token = bearerToken(request);
  if (!token) return error("로그인이 필요합니다.", 401, context);

  let body: { confirmation?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown };
  } catch {
    return error("확인 값이 올바르지 않습니다.", 400, context);
  }
  if (body.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return error("계정 삭제 확인이 필요합니다.", 400, context);
  }

  const admin = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return error("로그인 정보를 확인하지 못했습니다.", 401, context);
  }

  const materialResult = await admin
    .from("study_materials")
    .select("storage_path")
    .eq("user_id", user.id);
  if (materialResult.error && materialResult.error.code !== "42P01") {
    logApiFailure(context, "account_material_lookup_failed", 503);
    return error("업로드 자료를 확인하지 못했습니다.", 503, context);
  }
  const storagePaths = (materialResult.data ?? [])
    .map((row) => row.storage_path)
    .filter((path) => isOwnedStudyMaterialPath(path, user.id));

  try {
    const discoveredPaths = await listOwnedStorageObjects(admin, user.id);
    storagePaths.push(
      ...discoveredPaths.filter((path) => !storagePaths.includes(path)),
    );
  } catch {
    logApiFailure(context, "account_storage_discovery_failed", 503);
    return error("업로드 자료를 모두 확인하지 못했습니다.", 503, context);
  }

  for (let index = 0; index < storagePaths.length; index += 100) {
    const removed = await admin.storage
      .from("study-materials")
      .remove(storagePaths.slice(index, index + 100));
    if (removed.error) {
      logApiFailure(context, "account_storage_delete_failed", 503);
      return error("업로드 PDF를 삭제하지 못했습니다.", 503, context);
    }
  }

  const deleted = await admin.auth.admin.deleteUser(user.id);
  if (deleted.error) {
    logApiFailure(context, "account_auth_delete_failed", 503);
    return error("계정을 삭제하지 못했습니다.", 503, context);
  }
  return response({ deleted: true }, {}, context);
}
