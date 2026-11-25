import { createClient } from "@supabase/supabase-js";
import { cleanupDeletedPdfs } from "../lib/cleanup-deleted-pdfs.ts";

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
});
if (process.argv.includes("--run-retention")) {
  await cleanupDeletedPdfs(client);
  const result = await client.rpc("run_focus_quest_retention");
  if (result.error) throw new Error(`Retention failed (${result.error.code ?? "unknown"}).`);
}
const status = await client.rpc("focus_quest_operation_status");
if (status.error) throw new Error(`Operation status unavailable (${status.error.code ?? "unknown"}).`);
console.log(JSON.stringify(status.data));
