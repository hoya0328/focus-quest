const required = [
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_ANON_KEY",
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
  "E2E_PRODUCTION_SUPABASE_URL",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing staging variables: ${missing.join(", ")}`);
  process.exit(1);
}

function normalizedOrigin(value, allowLocalHttp = false) {
  try {
    const url = new URL(value);
    const isLoopback = ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !(allowLocalHttp && isLoopback)) {
      throw new Error("HTTPS required");
    }
    return url.origin.toLowerCase();
  } catch {
    console.error("Supabase URLs must be HTTPS, except an explicit local loopback stack.");
    process.exit(1);
  }
}

const localStack = process.env.E2E_LOCAL_SUPABASE === "true";
const stagingOrigin = normalizedOrigin(
  process.env.E2E_SUPABASE_URL,
  localStack,
);
const productionOrigin = normalizedOrigin(
  process.env.E2E_PRODUCTION_SUPABASE_URL,
);

if (stagingOrigin === productionOrigin) {
  console.error(
    "Refusing to run destructive E2E setup against the production Supabase project.",
  );
  process.exit(1);
}

const stagingHost = new URL(stagingOrigin).hostname;
if (localStack && !["127.0.0.1", "localhost"].includes(stagingHost)) {
  console.error("Local E2E may only target a loopback Supabase stack.");
  process.exit(1);
}

if (!localStack && !stagingOrigin.endsWith(".supabase.co")) {
  console.error("E2E_SUPABASE_URL must point to a Supabase project.");
  process.exit(1);
}

if (process.env.E2E_BASE_URL) {
  const base = new URL(process.env.E2E_BASE_URL);
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1") {
    console.error("E2E_BASE_URL must use HTTPS unless it is localhost.");
    process.exit(1);
  }
}

console.log(`Staging guard passed for ${stagingHost}.`);
