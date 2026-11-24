import { spawnSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["--yes", "supabase@3.3.0", "status", "--output", "json"],
  { encoding: "utf8", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  throw new Error("The isolated Supabase stack is not ready.");
}

const status = JSON.parse(result.stdout);
const apiUrl = status.API_URL ?? status.api_url;
const anonKey = status.ANON_KEY ?? status.anon_key;
const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase status did not return the required local credentials.");
}

const values = {
  E2E_LOCAL_SUPABASE: "true",
  E2E_PRODUCTION_SUPABASE_URL: "https://uaqmmsuhnwupckakagmi.supabase.co",
  E2E_SUPABASE_ANON_KEY: anonKey,
  E2E_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  E2E_SUPABASE_URL: apiUrl,
};

for (const [name, value] of Object.entries(values)) {
  if (String(value).includes("\n")) throw new Error(`Unsafe ${name} value.`);
  process.stdout.write(`${name}=${value}\n`);
}
