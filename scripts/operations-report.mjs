import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { buildOperationsReport } from "../lib/operations.ts";
import { readAllRows } from "./operations-data.mjs";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in an ignored local environment file.");
}
const days = Math.min(90, Math.max(1, Number(process.argv.find((value) => value.startsWith("--days="))?.slice(7)) || 30));
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString();
const until = new Date().toISOString();
const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
});
const [events, reports] = await Promise.all([
  readAllRows(() => client.from("focus_quest_product_events")
    .select("event_name,user_id,created_at")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at").order("id")),
  readAllRows(() => client.from("focus_quest_camp_reports")
    .select("reason,status,created_at")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at").order("id")),
]);
const moderation = reports.reduce((summary, item) => {
  summary.byReason[item.reason] = (summary.byReason[item.reason] ?? 0) + 1;
  summary.byStatus[item.status] = (summary.byStatus[item.status] ?? 0) + 1;
  return summary;
}, { total: reports.length, byReason: {}, byStatus: {} });
const report = {
  generatedAt: new Date().toISOString(),
  audience: "authenticated-users-only",
  period: { since, until },
  metricNote: "Window-based unique-user ratios, not visitor conversion or cohort retention. Guest events are not collected.",
  ...buildOperationsReport(events, days),
  moderation,
};
await mkdir("reports", { recursive: true });
const output = path.resolve("reports", `operations-${report.generatedAt.slice(0, 10)}.json`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Body-free aggregate report saved to ${output}\n`);
