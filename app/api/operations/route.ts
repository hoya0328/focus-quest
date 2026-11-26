import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { createOperationsEndpoint, operatorIds, type DashboardEvent } from "@/lib/operations-dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const serverEnv = env as unknown as Record<string, string | undefined>;
  const url = serverEnv.SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  const client = url && key ? createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  }) : null;

  return createOperationsEndpoint({
    configured: Boolean(client),
    allowedIds: operatorIds(serverEnv.FOCUS_QUEST_OPERATOR_USER_IDS),
    authenticate: async (token) => {
      const result = await client!.auth.getUser(token);
      return result.error ? null : result.data.user?.id ?? null;
    },
    loadEvents: async (since, until) => {
      const rows: DashboardEvent[] = [];
      const deadline = Date.now() + 20_000;
      for (let offset = 0; offset < 50_000; offset += 500) {
        if (Date.now() > deadline) throw new Error("Query deadline exceeded.");
        const result = await client!.from("focus_quest_product_events")
          .select("event_name,user_id,created_at,adventure_id,duration_minutes")
          .gte("created_at", since).lte("created_at", until)
          .order("created_at").order("id").range(offset, offset + 499);
        if (result.error || !Array.isArray(result.data)) throw new Error("Statistics unavailable.");
        rows.push(...result.data as DashboardEvent[]);
        if (result.data.length < 500) return rows;
      }
      // Never present a truncated export as a complete report.
      throw new Error("Statistics safety limit exceeded.");
    },
  })(request);
}
