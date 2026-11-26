// Uses existing CLI authentication in memory; never prints credentials or account records.
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const operatorEmail = process.env.FOCUS_QUEST_OPERATOR_EMAIL?.trim().toLowerCase();
const hostname = "focus-quest.hoya0328.workers.dev";
const windows = process.platform === "win32";
function cli(args) {
  try {
    return execFileSync(windows ? "cmd.exe" : "npx", windows ? ["/d", "/s", "/c", "npx", "--no-install", ...args] : ["--no-install", ...args], {
      encoding: "utf8", timeout: 30_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch { throw new Error(`CLI authorization unavailable for ${args[0]}; raw output suppressed.`); }
}
const credential = JSON.parse(cli(["wrangler", "auth", "token", "--json"]));
if (!credential.token) throw new Error("A token-based Cloudflare login is required.");
async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`Cloudflare request failed (${response.status}; codes: ${(body.errors ?? []).map((item) => item.code).join(",")}).`);
  return body.result;
}
const accounts = await cloudflare("/accounts?per_page=50");
// A workers.dev subdomain is the positive control for selecting the deployment account.
const matching = [];
for (const account of accounts) {
  const domain = await cloudflare(`/accounts/${account.id}/workers/subdomain`);
  if (domain.subdomain === hostname.split(".")[1]) matching.push(account);
}
if (matching.length !== 1) throw new Error("Could not uniquely select the existing Worker account.");
const accountId = matching[0].id;
const summary = { workerAccountVerified: true, analyticsAvailable: false, analyticsConfigured: false, operatorFound: false, statisticsReadable: false, applied: false };
const pendingSecrets = {};
const suppliedSiteToken = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
if (suppliedSiteToken && /^[a-f0-9]{32}$/i.test(suppliedSiteToken)) {
  pendingSecrets.CLOUDFLARE_WEB_ANALYTICS_TOKEN = suppliedSiteToken;
  summary.analyticsConfigured = true;
} else try {
  const sites = await cloudflare(`/accounts/${accountId}/rum/site_info/list?per_page=100`);
  summary.analyticsAvailable = true;
  let site = sites.find((entry) => entry.ruleset?.zone_name === hostname || entry.rules?.some((rule) => rule.host === hostname));
  if (!site && apply) site = await cloudflare(`/accounts/${accountId}/rum/site_info`, {
    method: "POST", body: JSON.stringify({ host: hostname, auto_install: false }),
  });
  if (site?.site_token && /^[a-f0-9]{32}$/i.test(site.site_token)) {
    pendingSecrets.CLOUDFLARE_WEB_ANALYTICS_TOKEN = site.site_token;
    summary.analyticsConfigured = true;
  }
} catch (error) { summary.analyticsIssue = error.message; }

if (operatorEmail) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = url ? new URL(url).hostname.split(".")[0] : "";
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Valid Supabase URL is required.");
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) key = JSON.parse(cli(["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"]))
    .find((entry) => entry.name === "service_role")?.api_key;
  if (!key) throw new Error("Existing Supabase CLI authorization is required.");
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
  });
  const candidates = [];
  for (let page = 1; page <= 20; page++) {
    const result = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error("Could not verify the requested operator account.");
    candidates.push(...result.data.users.filter((user) => user.email?.toLowerCase() === operatorEmail && user.email_confirmed_at));
    if (result.data.users.length < 100) break;
    if (page === 20) throw new Error("Account search safety limit exceeded.");
  }
  if (candidates.length !== 1) throw new Error("Requested email does not match exactly one confirmed Focus Quest account.");
  pendingSecrets.FOCUS_QUEST_OPERATOR_USER_IDS = candidates[0].id;
  summary.operatorFound = true;
  const eventCheck = await client.from("focus_quest_product_events")
    .select("event_name,user_id,created_at,adventure_id,duration_minutes").limit(1);
  if (eventCheck.error) throw new Error("Server statistics read permission is unavailable.");
  summary.statisticsReadable = true;
}

if (apply && Object.keys(pendingSecrets).length) {
  const args = ["--no-install", "wrangler", "secret", "bulk", "--config", "wrangler.public.jsonc"];
  const result = spawnSync(windows ? "cmd.exe" : "npx", windows ? ["/d", "/s", "/c", "npx", ...args] : args, {
    input: JSON.stringify(pendingSecrets), encoding: "utf8", timeout: 60_000, windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error("Worker binding update failed; raw output suppressed.");
  summary.applied = true;
}
console.log(JSON.stringify(summary, null, 2));
