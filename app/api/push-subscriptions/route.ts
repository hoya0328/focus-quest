import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import type { PushSubscriptionBody } from "@/lib/push-reminders";
import { addOperationalHeaders, createApiRequestContext, logApiFailure, type ApiRequestContext } from "@/lib/server-observability";

export const dynamic = "force-dynamic";

type RequestBody = {
  nextDueAt?: unknown;
  reminderTime?: unknown;
  subscription?: unknown;
  timezone?: unknown;
};

function serverConfiguration() {
  const serverEnv = env as unknown as Record<string, string | undefined>;
  return serverEnv.SUPABASE_URL && serverEnv.SUPABASE_SERVICE_ROLE_KEY
    ? { url: serverEnv.SUPABASE_URL, key: serverEnv.SUPABASE_SERVICE_ROLE_KEY }
    : null;
}

function tokenFrom(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function validSubscription(value: unknown): value is PushSubscriptionBody {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PushSubscriptionBody>;
  return Boolean(
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.startsWith("https://") &&
    candidate.endpoint.length >= 20 &&
    candidate.endpoint.length <= 2048 &&
    typeof candidate.keys?.auth === "string" &&
    candidate.keys.auth.length >= 8 &&
    candidate.keys.auth.length <= 80 &&
    typeof candidate.keys?.p256dh === "string" &&
    candidate.keys.p256dh.length >= 40 &&
    candidate.keys.p256dh.length <= 180,
  );
}

function response(body: unknown, status: number, context: ApiRequestContext) {
  const headers = new Headers();
  addOperationalHeaders(headers, context);
  return Response.json(body, {
    status,
    headers,
  });
}

export async function POST(request: Request) {
  const context = createApiRequestContext(request, "push-subscriptions");
  const reply = (body: unknown, status = 200) => response(body, status, context);
  if (!sameOrigin(request)) return reply({ error: "허용되지 않은 요청입니다." }, 403);
  const configuration = serverConfiguration();
  if (!configuration) return reply({ error: "알림 서버가 준비되지 않았습니다." }, 503);
  const token = tokenFrom(request);
  if (!token) return reply({ error: "로그인이 필요합니다." }, 401);

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return reply({ error: "알림 설정이 올바르지 않습니다." }, 400);
  }
  if (
    !validSubscription(body.subscription) ||
    typeof body.reminderTime !== "string" ||
    !/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(body.reminderTime) ||
    typeof body.timezone !== "string" ||
    body.timezone.length < 1 ||
    body.timezone.length > 80 ||
    typeof body.nextDueAt !== "string" ||
    Number.isNaN(Date.parse(body.nextDueAt))
  ) return reply({ error: "알림 설정이 올바르지 않습니다." }, 400);

  const admin = createClient(configuration.url, configuration.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await admin.auth.getUser(token);
  const user = userResult.data.user;
  if (userResult.error || !user) return reply({ error: "로그인을 확인하지 못했습니다." }, 401);

  const subscription = body.subscription;
  const saved = await admin.from("focus_quest_push_subscriptions").upsert({
    auth: subscription.keys.auth,
    enabled: true,
    endpoint: subscription.endpoint,
    failed_attempts: 0,
    next_due_at: body.nextDueAt,
    p256dh: subscription.keys.p256dh,
    reminder_time: body.reminderTime,
    timezone: body.timezone,
    updated_at: new Date().toISOString(),
    user_id: user.id,
  }, { onConflict: "endpoint" });
  if (saved.error) {
    logApiFailure(context, "push_subscription_save_failed", 503);
    return reply({ error: "알림 시간을 저장하지 못했습니다." }, 503);
  }
  return reply({ saved: true });
}

export async function DELETE(request: Request) {
  const context = createApiRequestContext(request, "push-subscriptions");
  const reply = (body: unknown, status = 200) => response(body, status, context);
  if (!sameOrigin(request)) return reply({ error: "허용되지 않은 요청입니다." }, 403);
  const configuration = serverConfiguration();
  if (!configuration) return reply({ error: "알림 서버가 준비되지 않았습니다." }, 503);
  const token = tokenFrom(request);
  if (!token) return reply({ error: "로그인이 필요합니다." }, 401);
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || body.endpoint.length > 2048) {
    return reply({ error: "알림 구독이 올바르지 않습니다." }, 400);
  }
  const admin = createClient(configuration.url, configuration.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await admin.auth.getUser(token);
  const user = userResult.data.user;
  if (userResult.error || !user) return reply({ error: "로그인을 확인하지 못했습니다." }, 401);
  const deleted = await admin
    .from("focus_quest_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint);
  if (deleted.error) {
    logApiFailure(context, "push_subscription_delete_failed", 503);
    return reply({ error: "알림을 끄지 못했습니다." }, 503);
  }
  return reply({ deleted: true });
}
