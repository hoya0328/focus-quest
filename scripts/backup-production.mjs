import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const tables = [
  "focus_quest_cloud_states",
  "study_subjects",
  "study_quests",
  "study_quest_focus_sessions",
  "study_materials",
  "study_quest_progress",
  "study_quiz_attempts",
  "focus_quest_product_events",
  "focus_quest_plus_interest",
  "focus_quest_camps",
  "focus_quest_camp_members",
  "focus_quest_camp_blocks",
  "focus_quest_camp_history",
  "focus_quest_camp_contacts",
  "focus_quest_camp_invitations",
  "focus_quest_camp_reports",
  "focus_quest_push_subscriptions",
];

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Keep it in an ignored local environment file.`);
  return value;
}

function safeStamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function readAll(client, table) {
  const rows = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const result = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) return rows;
  }
}

const url = requireEnvironment("SUPABASE_URL");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const projectRef = new URL(url).hostname.split(".")[0];
const requestedDir = process.argv.find((argument) => argument.startsWith("--out="))?.slice(6);
const outputDir = path.resolve(requestedDir || path.join("backups", safeStamp()));
const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await mkdir(path.join(outputDir, "tables"), { recursive: true });
const manifest = { version: 1, createdAt: new Date().toISOString(), projectRef, files: [] };

for (const table of tables) {
  const rows = await readAll(client, table);
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
process.stdout.write(`Encrypted-disk local backup created at ${outputDir}\n`);
process.stdout.write("PDF objects are not copied by this command. Export the private bucket separately only when a protected destination is ready.\n");
