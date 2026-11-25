import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateBackupManifest } from "../lib/operations.ts";
import { backupTables } from "./operations-data.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run backup:verify -- <backup-directory>");
const directory = path.resolve(input);
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
if (!validateBackupManifest(manifest)) throw new Error("The backup manifest is invalid.");
const expectedPaths = Object.keys(backupTables).map((table) => `tables/${table}.json`).sort();
if (JSON.stringify(manifest.files.map((file) => file.path).sort()) !== JSON.stringify(expectedPaths)) {
  throw new Error("The export does not contain exactly the required application tables.");
}

for (const file of manifest.files) {
  const body = await readFile(path.join(directory, file.path), "utf8");
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== file.sha256) throw new Error(`${file.path}: checksum mismatch`);
  const rows = JSON.parse(body);
  if (!Array.isArray(rows) || rows.length !== file.records) {
    throw new Error(`${file.path}: record count mismatch`);
  }
}

process.stdout.write(`PASS ${manifest.files.length} files, project ${manifest.projectRef}, ${manifest.createdAt}\n`);
process.stdout.write("This verifies backup integrity only. It does not overwrite production data.\n");
