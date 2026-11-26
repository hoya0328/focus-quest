import { access, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadBackupKey, readArchive } from "./encrypted-backup.mjs";
import { backupTables } from "./operations-data.mjs";
import { validateBackupManifest } from "../lib/operations.ts";

const root = path.resolve("backups");
// Verification never creates or replaces a key.
if (!process.env.BACKUP_ENCRYPTION_KEY) await access(path.join(root, ".keys", "master.dpapi"));
const key = await loadBackupKey(root);
let verified = 0;
let full = 0;
let legacy = 0;
let objects = 0;
const projects = new Set();
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^(daily-|legacy-)/.test(entry.name)) continue;
  const { index, files } = await readArchive(path.join(root, entry.name), key);
  projects.add(index.projectRef);
  if (index.coverage === "application-auth-pdf") {
    const snapshot = JSON.parse(files.get("snapshot.json")?.toString() ?? "null");
    const required = [...Object.keys(backupTables), "focus_quest_account_acknowledgements"].sort();
    if (snapshot?.version !== 2 || !Array.isArray(snapshot.accounts) || JSON.stringify(Object.keys(snapshot.tables ?? {}).sort()) !== JSON.stringify(required)) throw new Error("Incomplete application snapshot.");
    if (required.some((table) => !Array.isArray(snapshot.tables[table]))) throw new Error("Invalid table snapshot.");
    if (files.size !== snapshot.tables.study_materials.length + 1) throw new Error("PDF object count mismatch.");
    for (const material of snapshot.tables.study_materials) {
      const bytes = files.get(`pdf/${material.id}`);
      if (!bytes || bytes.length !== material.file_size_bytes) throw new Error("Referenced PDF is missing or truncated.");
    }
    full++;
  } else if (index.coverage === "legacy-app-tables-only") {
    const manifest = JSON.parse(files.get("legacy-manifest.json")?.toString() ?? "null");
    if (!validateBackupManifest(manifest) || files.size !== manifest.files.length + 1) throw new Error("Invalid converted legacy snapshot.");
    for (const file of manifest.files) {
      const body = files.get(file.path);
      if (!body || createHash("sha256").update(body).digest("hex") !== file.sha256 || JSON.parse(body).length !== file.records) throw new Error("Converted legacy content mismatch.");
    }
    legacy++;
  } else throw new Error("Unknown archive coverage.");
  verified++;
  objects += files.size;
}
if (!verified || projects.size !== 1) throw new Error("No coherent encrypted backup set was verified.");
console.log(JSON.stringify({ status: "verified", encryptedArchives: verified, fullSnapshots: full, convertedLegacy: legacy, objects, changes: 0 }));
