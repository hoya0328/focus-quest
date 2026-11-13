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

function safeNetworkError(error) {
  const cause = error && typeof error === "object" ? error.cause : null;
  if (cause && typeof cause === "object" && "code" in cause) {
    return String(cause.code);
  }
  return error instanceof Error ? error.name : "NetworkError";
}

async function expectAnonymousTableDeniedOrEmpty(table, identityColumn) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=${identityColumn}&limit=1`,
      { headers: publicHeaders },
    );
    const data = await response.json().catch(() => null);
    const explicitlyDenied = response.status === 401 || response.status === 403;
    const emptyByRls =
      response.status === 200 && Array.isArray(data) && data.length === 0;
    checks.push({
      boundary: `anonymous:${table}:read`,
      passed: explicitlyDenied || emptyByRls,
      status: response.status,
      rows: Array.isArray(data) ? data.length : null,
    });
  } catch (error) {
    checks.push({
      boundary: `anonymous:${table}:read`,
      passed: false,
      status: null,
      error: safeNetworkError(error),
    });
  }
}

for (const [table, identityColumn] of Object.entries({
  focus_quest_cloud_states: "user_id",
  study_subjects: "id",
  study_quests: "id",
  study_quest_focus_sessions: "session_id",
  study_materials: "id",
  study_quest_progress: "quest_id",
  study_quiz_attempts: "id",
  focus_quest_product_events: "id",
})) {
  await expectAnonymousTableDeniedOrEmpty(table, identityColumn);
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
    error: safeNetworkError(error),
  });
}

const cloudResponse = await fetch(`${PUBLIC_BASE_URL}/api/cloud-state`);
checks.push({
  boundary: "anonymous:cloud-state-api:read",
  passed: cloudResponse.status === 401 || cloudResponse.status === 404,
  status: cloudResponse.status,
});

const accountDeleteResponse = await fetch(`${PUBLIC_BASE_URL}/api/account`, {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ confirmation: "delete-my-focus-quest-account" }),
});
checks.push({
  boundary: "anonymous:account-api:delete",
  passed: accountDeleteResponse.status === 401 || accountDeleteResponse.status === 404,
  status: accountDeleteResponse.status,
});

const forgedCloudResponse = await fetch(`${PUBLIC_BASE_URL}/api/cloud-state`, {
  headers: { "oai-authenticated-user-email": "security-check@example.invalid" },
});
checks.push({
  boundary: "forged-header:cloud-state-api:read",
  passed:
    forgedCloudResponse.status === 401 || forgedCloudResponse.status === 404,
  status: forgedCloudResponse.status,
});

console.log(JSON.stringify(checks, null, 2));
if (checks.some((check) => !check.passed)) process.exitCode = 1;
