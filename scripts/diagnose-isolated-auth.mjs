import { execFileSync, spawnSync } from "node:child_process";

// This reads only the disposable CI container. Never use it for production logs.
if (process.env.CI !== "true") throw new Error("This diagnostic is restricted to isolated CI.");
try {
  const state = execFileSync("docker", ["inspect", "--format", "{{.State.Status}}", "supabase_auth_focus-quest-e2e"], { encoding: "utf8", stdio: "pipe", timeout: 10_000 }).trim();
  console.log(`Isolated Auth container: ${/^[a-z]+$/.test(state) ? state : "unknown"}`);
  const result = spawnSync("docker", ["logs", "--tail", "80", "supabase_auth_focus-quest-e2e"], { encoding: "utf8", stdio: "pipe", timeout: 10_000 });
  const logs = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const codes = [...logs.matchAll(/SQLSTATE[ :]+([A-Z0-9]{5})/g)].map((match) => match[1]);
  console.log(JSON.stringify({ sqlStates: [...new Set(codes)], hasMigrationError: /migration.*(error|fail)|(error|fail).*migration/i.test(logs), hasDatabaseError: /database error|error saving|constraint/i.test(logs), hasConfirmationTriggerError: /focus_quest_signup_confirmation_required/i.test(logs) }));
} catch { console.log("Isolated Auth diagnostics unavailable; raw Docker output suppressed."); }
