import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ACCOUNT_DELETE_CONFIRMATION = "delete-my-focus-quest-account";

function response(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function error(message: string, status: number) {
  return response({ error: message }, { status });
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

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return error("허용되지 않은 요청입니다.", 403);
  const configuration = serverConfiguration();
  if (!configuration) return error("찾을 수 없습니다.", 404);
  const token = bearerToken(request);
  if (!token) return error("로그인이 필요합니다.", 401);

  let body: { confirmation?: unknown };
  try {
    body = (await request.json()) as { confirmation?: unknown };
  } catch {
    return error("확인 값이 올바르지 않습니다.", 400);
  }
  if (body.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return error("계정 삭제 확인이 필요합니다.", 400);
  }

  const admin = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return error("로그인 정보를 확인하지 못했습니다.", 401);

  const materialResult = await admin
    .from("study_materials")
    .select("storage_path")
    .eq("user_id", user.id);
  if (materialResult.error && materialResult.error.code !== "42P01") {
    return error("업로드 자료를 확인하지 못했습니다.", 503);
  }
  const storagePaths = (materialResult.data ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  for (let index = 0; index < storagePaths.length; index += 100) {
    const removed = await admin.storage
      .from("study-materials")
      .remove(storagePaths.slice(index, index + 100));
    if (removed.error) return error("업로드 PDF를 삭제하지 못했습니다.", 503);
  }

  const deleted = await admin.auth.admin.deleteUser(user.id);
  if (deleted.error) return error("계정을 삭제하지 못했습니다.", 503);
  return response({ deleted: true });
}
