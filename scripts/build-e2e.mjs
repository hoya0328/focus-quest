import { spawnSync } from "node:child_process";

const staging = process.argv.includes("--staging");

if (staging && process.env.E2E_BASE_URL) {
  console.log("Remote staging URL configured; local E2E build skipped.");
  process.exit(0);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: "false",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: staging
    ? process.env.E2E_SUPABASE_ANON_KEY ?? ""
    : " ",
  NEXT_PUBLIC_SUPABASE_URL: staging
    ? process.env.E2E_SUPABASE_URL ?? ""
    : " ",
};
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build"], {
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
