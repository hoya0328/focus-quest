import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { backupTables } from "./operations-data.mjs";
import { loadBackupKey, protectDirectory, writeArchive, pruneArchives, removeArchive } from "./encrypted-backup.mjs";
import { cleanupDeletedPdfs } from "../lib/cleanup-deleted-pdfs.ts";

const root = path.resolve("backups");
const applyRetention = process.argv.includes("--apply-retention");
const migrateLegacy = process.argv.includes("--migrate-legacy");
await protectDirectory(root);
const key = await loadBackupKey(root);
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Server backup credentials are required.");
const host = new URL(url).hostname;
const projectRef = ["127.0.0.1", "localhost"].includes(host) ? "local-supabase" : host.split(".")[0];
const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
});
if (applyRetention) await cleanupDeletedPdfs(client);
const snapshot = await client.rpc("export_focus_quest_backup");
if (snapshot.error || snapshot.data?.version !== 2) throw new Error("Consistent backup snapshot unavailable; no old backup was removed.");
const required = [...Object.keys(backupTables), "focus_quest_account_acknowledgements"].sort();
if (JSON.stringify(Object.keys(snapshot.data.tables).sort()) !== JSON.stringify(required)) throw new Error("Incomplete backup table set.");
const { deletions, ...recoverableSnapshot } = snapshot.data;
const files = new Map([["snapshot.json", Buffer.from(JSON.stringify(recoverableSnapshot))]]);
for (const material of snapshot.data.tables.study_materials) {
  if (!material.storage_path.startsWith(`${material.user_id}/`)) throw new Error("Invalid private PDF reference.");
  const result = await client.storage.from("study-materials").download(material.storage_path);
  if (result.error || !result.data) throw new Error("A referenced PDF is missing; the snapshot is not complete.");
  files.set(`pdf/${material.id}`, Buffer.from(await result.data.arrayBuffer()));
}
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const directory = await mkdtemp(path.join(root, `daily-${stamp}-`));
await writeArchive(directory, files, key, { projectRef });

// Migrate verified plaintext legacy exports only after the new full backup verifies.
let converted = 0;
for (const entry of migrateLegacy ? await readdir(root, { withFileTypes: true }) : []) {
  if (!entry.isDirectory() || !/^(weekly-|\d{4}-\d{2}-\d{2})/.test(entry.name)) continue;
  const source = path.join(root, entry.name);
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8")); } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  execFileSync(process.execPath, ["scripts/verify-backup.mjs", source], { stdio: "pipe", timeout: 30_000 });
  const legacyFiles = new Map();
  for (const file of manifest.files) legacyFiles.set(file.path, await readFile(path.join(source, file.path)));
  legacyFiles.set("legacy-manifest.json", Buffer.from(JSON.stringify(manifest)));
  const destination = await mkdtemp(path.join(root, "legacy-"));
  await writeArchive(destination, legacyFiles, key, { projectRef, createdAt: manifest.createdAt, coverage: "legacy-app-tables-only" });
  await removeArchive(root, source);
  converted++;
}
const removed = applyRetention ? await pruneArchives(root, key, deletions, directory) : 0;
if (applyRetention && deletions.length) {
  const acknowledgement = await client.rpc("acknowledge_focus_quest_backup_cleanup", { request_ids: deletions.map((item) => item.id) });
  if (acknowledgement.error) throw new Error("Backup verified, but deletion cleanup acknowledgement failed.");
}
console.log(JSON.stringify({ status: "verified", directory, encrypted: true, appTables: required.length, accounts: snapshot.data.accounts.length, pdfs: files.size - 1, retentionDays: 30, retentionApplied: applyRetention, converted, removed, externalCopy: "not-configured", keyRecovery: "current-Windows-account-only" }));
