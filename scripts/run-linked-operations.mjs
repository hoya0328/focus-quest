import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

const actions = {
  inspect: "scripts/inspect-operations-access.mjs",
  report: "scripts/operations-report.mjs",
  backup: "scripts/backup-production.mjs",
};
const action = actions[process.argv[2]];
if (!action) throw new Error("Usage: node scripts/run-linked-operations.mjs inspect|report|backup [options]");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = url ? new URL(url).hostname.split(".")[0] : "";
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("A valid configured Supabase URL is required.");

// Credentials are captured only in process memory. Never print or persist CLI output.
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  const windows = process.platform === "win32";
  const command = windows ? "cmd.exe" : "npx";
  const args = ["--no-install", "supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"];
  let output;
  try {
    output = execFileSync(command, windows ? ["/d", "/s", "/c", "npx", ...args] : args, {
      encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
  } catch {
    throw new Error("Supabase CLI authorization is unavailable; no credentials were printed or saved.");
  }
  let keys;
  try { keys = JSON.parse(output); } catch {
    throw new Error("Supabase CLI returned invalid credential metadata; raw output was suppressed.");
  }
  if (!Array.isArray(keys)) throw new Error("Supabase CLI returned an unexpected credential schema.");
  key = keys.find((entry) => entry.name === "service_role")?.api_key;
}
if (!key) throw new Error("Server-only operations credentials are unavailable.");
const result = spawnSync(process.execPath, [action, ...process.argv.slice(3)], {
  env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key },
  stdio: "inherit", timeout: 300_000, windowsHide: true,
});
if (result.error) throw new Error("Operations command could not finish within its bounded runtime.");
process.exitCode = result.status ?? 1;
