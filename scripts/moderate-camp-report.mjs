import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Server-only Supabase operations credentials are required.");
const reportId = process.argv.find((value) => value.startsWith("--id="))?.slice(5);
const status = process.argv.find((value) => value.startsWith("--status="))?.slice(9);
if (!reportId || !/^[0-9a-f-]{36}$/i.test(reportId)) throw new Error("A valid --id=<report UUID> is required.");
if (!status || !["reviewed", "actioned", "dismissed"].includes(status)) {
  throw new Error("--status must be reviewed, actioned or dismissed.");
}
const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const result = await client.from("focus_quest_camp_reports")
  .update({ status, reviewed_at: new Date().toISOString() })
  .eq("id", reportId)
  .eq("status", "open")
  .select("id,status")
  .maybeSingle();
if (result.error) throw new Error(result.error.message);
if (!result.data) throw new Error("Open report not found. No record was changed.");
process.stdout.write(`Camp report ${result.data.id} marked ${result.data.status}.\n`);
