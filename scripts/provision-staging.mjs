import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const stagingName = "Focus Quest Staging";
const cliVersion = "3.2.0";
const localEnvPath = join(root, ".env.local");
const stagingEnvPath = join(root, ".env.staging.local");
const supabaseTempPath = join(root, "supabase", ".temp");

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")]),
  );
}

function runSupabase(args, { json = false } = {}) {
  const npxCli = process.env.npm_execpath
    ? join(dirname(process.env.npm_execpath), "npx-cli.js")
    : null;
  const command = npxCli ? process.execPath : "npx";
  const commandArgs = [
    ...(npxCli ? [npxCli] : []),
    "--yes",
    `supabase@${cliVersion}`,
    ...(json ? ["-o", "json"] : []),
    ...args,
  ];
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      stdio: json ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );

  if (result.status !== 0) {
    const detail = json ? result.stderr?.trim() : "";
    throw new Error(
      detail || result.error?.message || `Supabase command failed: ${args[0]}`,
    );
  }

  if (!json) return null;

  const jsonStarts = [result.stdout.indexOf("{"), result.stdout.indexOf("[")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  for (const start of jsonStarts) {
    try {
      return JSON.parse(result.stdout.slice(start));
    } catch {
      // The CLI can print a warning before its JSON payload; try the next token.
    }
  }
  throw new Error(`Supabase returned invalid JSON for: ${args[0]}`);
}

function unwrapProjects(payload) {
  return Array.isArray(payload) ? payload : payload.projects ?? [];
}

function unwrapCreatedProject(payload) {
  return payload.project ?? payload;
}

function unwrapApiKeys(payload) {
  return Array.isArray(payload) ? payload : payload.api_keys ?? payload.keys ?? [];
}

function selectProject(projects, name) {
  return projects.find((project) => project.name === name);
}

function selectApiKey(keys, kind) {
  const names =
    kind === "public"
      ? new Set(["anon", "publishable"])
      : new Set(["service_role", "secret"]);
  return keys.find((key) => names.has(key.name) || names.has(key.type))?.api_key;
}

function createPassword() {
  return `${randomBytes(24).toString("base64url")}!Aa9`;
}

function writeStagingEnv({ anonKey, dbPassword, productionUrl, serviceRoleKey, stagingUrl }) {
  const source = [
    `E2E_SUPABASE_URL=${stagingUrl}`,
    `E2E_SUPABASE_ANON_KEY=${anonKey}`,
    `E2E_SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    `E2E_PRODUCTION_SUPABASE_URL=${productionUrl}`,
    `E2E_SUPABASE_DB_PASSWORD=${dbPassword}`,
    "",
  ].join("\n");
  writeFileSync(stagingEnvPath, source, { encoding: "utf8", mode: 0o600 });
}

function withProductionLinkPreserved(callback) {
  const backupRoot = mkdtempSync(join(tmpdir(), "focus-quest-supabase-"));
  const backupPath = join(backupRoot, ".temp");
  if (existsSync(supabaseTempPath)) cpSync(supabaseTempPath, backupPath, { recursive: true });

  try {
    callback();
  } finally {
    if (existsSync(backupPath)) {
      rmSync(supabaseTempPath, { force: true, recursive: true });
      cpSync(backupPath, supabaseTempPath, { recursive: true });
    }
    rmSync(backupRoot, { force: true, recursive: true });
  }
}

if (!existsSync(localEnvPath)) {
  throw new Error(".env.local is required to identify the production Supabase URL.");
}

const productionEnv = parseEnv(readFileSync(localEnvPath, "utf8"));
const productionUrl = productionEnv.NEXT_PUBLIC_SUPABASE_URL;
if (!productionUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.");

let projects = unwrapProjects(
  runSupabase(["projects", "list"], { json: true }),
);
const linkedProject = projects.find((project) => project.linked);
if (!linkedProject) throw new Error("No linked production Supabase project was found.");

let stagingProject = selectProject(projects, stagingName);
let stagingEnv = existsSync(stagingEnvPath)
  ? parseEnv(readFileSync(stagingEnvPath, "utf8"))
  : {};
let dbPassword = stagingEnv.E2E_SUPABASE_DB_PASSWORD;

if (!stagingProject) {
  dbPassword = createPassword();
  console.log(`Creating ${stagingName} in ${linkedProject.region}...`);
  stagingProject = unwrapCreatedProject(runSupabase(
    [
      "projects",
      "create",
      stagingName,
      "--org-id",
      linkedProject.organization_id,
      "--db-password",
      dbPassword,
      "--region",
      linkedProject.region,
      "--yes",
    ],
    { json: true },
  ));
  console.log("Staging project created.");
} else if (!dbPassword) {
  throw new Error(
    `${stagingName} exists, but E2E_SUPABASE_DB_PASSWORD is missing from .env.staging.local.`,
  );
}

const stagingRef = stagingProject.id;
const stagingUrl = `https://${stagingRef}.supabase.co`;
if (stagingUrl === productionUrl) {
  throw new Error("Refusing to use the production Supabase project as staging.");
}

const keys = unwrapApiKeys(
  runSupabase(
    ["projects", "api-keys", "--project-ref", stagingRef],
    { json: true },
  ),
);
const anonKey = selectApiKey(keys, "public");
const serviceRoleKey = selectApiKey(keys, "service");
if (!anonKey || !serviceRoleKey) {
  throw new Error("The staging public or service API key could not be identified.");
}

writeStagingEnv({ anonKey, dbPassword, productionUrl, serviceRoleKey, stagingUrl });
console.log("Staging credentials saved to ignored .env.staging.local.");

withProductionLinkPreserved(() => {
  runSupabase([
    "link",
    "--project-ref",
    stagingRef,
    "--password",
    dbPassword,
    "--yes",
  ]);
  runSupabase(["db", "push", "--include-all", "--password", dbPassword, "--yes"]);
});

projects = unwrapProjects(
  runSupabase(["projects", "list"], { json: true }),
);
const restoredProduction = projects.find((project) => project.linked);
if (restoredProduction?.id !== linkedProject.id) {
  throw new Error("The local Supabase production link was not restored.");
}

console.log("Staging migrations applied; production link restored.");
