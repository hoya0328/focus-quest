import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve("backups");
await mkdir(root, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const directory = await mkdtemp(path.join(root, `weekly-${stamp}-`));
if (process.platform === "win32") {
  const identity = execFileSync("whoami.exe", [], { encoding: "utf8", windowsHide: true }).trim();
  execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`], {
    stdio: "pipe", windowsHide: true,
  });
} else {
  await chmod(directory, 0o700);
}

for (const args of [
  ["scripts/run-linked-operations.mjs", "backup", `--out=${directory}`],
  ["scripts/verify-backup.mjs", directory],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", timeout: 300_000, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error("Weekly export or verification failed. Preserve the partial folder for diagnosis; no existing backup was deleted.");
  }
}
console.log("Weekly application-data export and integrity verification completed. No files were deleted or uploaded.");
