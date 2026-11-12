import { readFile } from "node:fs/promises";

const PUBLIC_BASE_URL = "https://focus-quest.hoya0328.workers.dev";

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")]),
  );
}

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
}

const publicHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
};
const checks = [];

async function expectEmptyAnonymousTable(table) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
      headers: publicHeaders,
    });
    const data = await response.json().catch(() => null);
    checks.push({
      boundary: `anonymous:${table}:read`,
      passed: response.status === 200 && Array.isArray(data) && data.length === 0,
      status: response.status,
      rows: Array.isArray(data) ? data.length : null,
    });
  } catch (error) {
    checks.push({
      boundary: `anonymous:${table}:read`,
      passed: false,
      status: null,
      error: error instanceof Error ? error.name : "NetworkError",
    });
  }
}

for (const table of [
  "focus_quest_cloud_states",
  "study_subjects",
  "study_quests",
  "study_quest_focus_sessions",
  "study_materials",
]) {
  await expectEmptyAnonymousTable(table);
}

try {
  const storageResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/list/study-materials`,
    {
      method: "POST",
      headers: { ...publicHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1, offset: 0 }),
    },
  );
  const storageData = await storageResponse.json().catch(() => null);
  checks.push({
    boundary: "anonymous:study-materials:list",
    passed:
      storageResponse.status === 200 &&
      Array.isArray(storageData) &&
      storageData.length === 0,
    status: storageResponse.status,
    rows: Array.isArray(storageData) ? storageData.length : null,
  });
} catch (error) {
  checks.push({
    boundary: "anonymous:study-materials:list",
    passed: false,
    status: null,
    error: error instanceof Error ? error.name : "NetworkError",
  });
}

const cloudResponse = await fetch(`${PUBLIC_BASE_URL}/api/cloud-state`);
checks.push({
  boundary: "anonymous:cloud-state-api:read",
  passed: cloudResponse.status === 401,
  status: cloudResponse.status,
});

console.log(JSON.stringify(checks, null, 2));
if (checks.some((check) => !check.passed)) process.exitCode = 1;
