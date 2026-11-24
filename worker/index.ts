/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  next_due_at: string;
  failed_attempts: number;
};

async function sendDueReminders(env: Env) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_PUBLIC_KEY
  ) return;

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date();
  const due = await admin
    .from("focus_quest_push_subscriptions")
    .select("id,endpoint,p256dh,auth,next_due_at,failed_attempts")
    .eq("enabled", true)
    .lte("next_due_at", now.toISOString())
    .order("next_due_at", { ascending: true })
    .limit(100);
  if (due.error || !due.data?.length) return;

  webpush.setVapidDetails(
    "mailto:letshoya@naver.com",
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  await Promise.all((due.data as PushSubscriptionRow[]).map(async (row) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { auth: row.auth, p256dh: row.p256dh },
        },
        JSON.stringify({
          body: "오늘 끝낼 한 가지를 정하고 동료와 다시 출발해요.",
          title: "Focus Quest 출발 시간",
          url: "/",
        }),
        { TTL: 60 * 60, urgency: "normal" },
      );
      const previousDue = Date.parse(row.next_due_at);
      const nextDue = new Date(Math.max(Date.now(), previousDue) + 24 * 60 * 60 * 1_000);
      await admin.from("focus_quest_push_subscriptions").update({
        failed_attempts: 0,
        last_sent_at: now.toISOString(),
        next_due_at: nextDue.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", row.id);
    } catch (failure) {
      const statusCode =
        failure && typeof failure === "object" && "statusCode" in failure
          ? Number((failure as { statusCode?: unknown }).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("focus_quest_push_subscriptions").delete().eq("id", row.id);
        return;
      }
      const failedAttempts = Math.min(20, row.failed_attempts + 1);
      await admin.from("focus_quest_push_subscriptions").update({
        enabled: failedAttempts < 5,
        failed_attempts: failedAttempts,
        next_due_at: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", row.id);
    }
  }));
}

function contentSecurityPolicy(url: URL) {
  const localConnections = ["127.0.0.1", "localhost"].includes(url.hostname)
    ? " http://127.0.0.1:* ws://127.0.0.1:*"
    : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${localConnections}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy(url));
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (url.pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const imageResponse = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(imageResponse, url);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx), url);
  },
  async scheduled(
    _controller: unknown,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(sendDueReminders(env));
  },
};

export default worker;
