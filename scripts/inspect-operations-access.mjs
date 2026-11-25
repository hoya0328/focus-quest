import { createClient } from "@supabase/supabase-js";
import { backupTables } from "./operations-data.mjs";

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
});
const results = [];
for (const table of Object.keys(backupTables)) {
  const result = await client.from(table).select("*", { count: "exact" }).limit(0);
  results.push({ table, allowed: !result.error, code: result.error?.code ?? null, message: result.error?.message ?? null, rows: result.count });
}
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.allowed)) process.exitCode = 1;
