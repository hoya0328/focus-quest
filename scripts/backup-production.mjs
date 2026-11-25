import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { backupTables, readAllRows } from "./operations-data.mjs";

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Keep it in an ignored local environment file.`);
  return value;
}

function safeStamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

const url = requireEnvironment("SUPABASE_URL");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const hostname = new URL(url).hostname;
const projectRef = ["localhost", "127.0.0.1"].includes(hostname)
  ? "local-supabase"
  : hostname.split(".")[0];
const requestedDir = process.argv.find((argument) => argument.startsWith("--out="))?.slice(6);
const outputDir = path.resolve(requestedDir || path.join("backups", safeStamp()));
const backupRoot = path.resolve("backups");
if (!outputDir.startsWith(`${backupRoot}${path.sep}`)) {
  throw new Error("Backup output must be a new directory inside the ignored backups folder.");
}
const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
});

await mkdir(path.join(outputDir, "tables"), { recursive: true });
const manifest = { version: 1, createdAt: new Date().toISOString(), projectRef, files: [] };

for (const [table, columns] of Object.entries(backupTables)) {
  const rows = await readAllRows(() => {
    let query = client.from(table).select("*");
    for (const column of columns) query = query.order(column);
    return query;
  });
  const relativePath = `tables/${table}.json`;
  const body = `${JSON.stringify(rows, null, 2)}\n`;
  await writeFile(path.join(outputDir, relativePath), body, { encoding: "utf8", flag: "wx" });
  manifest.files.push({
    path: relativePath,
    records: rows.length,
    sha256: createHash("sha256").update(body).digest("hex"),
  });
  process.stdout.write(`${table}: ${rows.length} rows\n`);
}

await writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { encoding: "utf8", flag: "wx" },
);
process.stdout.write(`Local JSON export created at ${outputDir}\n`);
process.stdout.write("This export is not encrypted by this tool and is not a transaction-consistent database backup. Keep it on protected storage.\n");
process.stdout.write("PDF objects are not copied by this command. Export the private bucket separately only when a protected destination is ready.\n");
