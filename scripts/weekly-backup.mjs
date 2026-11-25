// Compatibility entry for the retired weekly plaintext workflow.
import { spawnSync } from "node:child_process";
import process from "node:process";
const result = spawnSync(process.execPath, ["scripts/run-linked-operations.mjs", "daily"], {
  stdio: "inherit", timeout: 300_000, windowsHide: true,
});
if (result.error) throw new Error("Encrypted backup did not finish within its bounded runtime.");
process.exitCode = result.status ?? 1;
