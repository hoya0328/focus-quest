import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { operatorIds } from "@/lib/operations-dashboard";
import { createSupportEndpoint, type SupportTicket } from "@/lib/support-requests";

export const dynamic = "force-dynamic";

function handler() {
  const serverEnv = env as unknown as Record<string, string | undefined>;
  const url = serverEnv.SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  const client = url && key ? createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  }) : null;
  return createSupportEndpoint({
    configured: Boolean(client), allowedIds: operatorIds(serverEnv.FOCUS_QUEST_OPERATOR_USER_IDS),
    authenticate: async (token) => {
      const result = await client!.auth.getUser(token);
      return result.error ? null : result.data.user?.id ?? null;
    },
    submit: async (submission, request) => {
      // Cloudflare overwrites this header at its edge. Never trust X-Forwarded-For.
      const rawIp = request.headers.get("cf-connecting-ip") ?? "unknown";
      const ip = /^[0-9a-f.:]{3,64}$/i.test(rawIp) ? rawIp : "unknown";
      const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(`support:${new Date().toISOString().slice(0, 10)}:${ip}`));
      const rateKey = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const result = await client!.rpc("submit_focus_quest_support", {
        requested_id: submission.id, requested_category: submission.category, requested_message: submission.message,
        requested_rate_key: rateKey, requested_notice_version: submission.noticeVersion,
      });
      if (result.error?.message === "support_rate_limited") return "limited";
      if (result.error?.message === "support_conflict") return "conflict";
      if (result.error || result.data !== submission.id) throw new Error("Support intake unavailable.");
      return "saved";
    },
    list: async (cursor) => {
      let query = client!.from("focus_quest_support_requests")
        .select("id,category,message,status,created_at,reviewed_at")
        .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
      if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
      const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
      if (result.error || !Array.isArray(result.data)) throw new Error("Inbox unavailable.");
      const tickets = result.data.slice(0, 50) as SupportTicket[];
      const last = tickets.at(-1);
      return { tickets, nextCursor: result.data.length > 50 && last ? `${new Date(last.created_at).toISOString()},${last.id}` : null };
    },
    update: async (id, status) => {
      const result = await client!.from("focus_quest_support_requests")
        .update({ status, reviewed_at: status === "closed" ? new Date().toISOString() : null })
        .eq("id", id).gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()).select("id").maybeSingle();
      if (result.error) throw new Error("Inbox update unavailable.");
      return Boolean(result.data);
    },
  });
}

export async function POST(request: Request) { return handler()(request); }
export async function GET(request: Request) { return handler()(request); }
export async function PATCH(request: Request) { return handler()(request); }
