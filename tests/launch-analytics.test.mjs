import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildDashboard, createOperationsEndpoint, operatorIds } from "../lib/operations-dashboard.ts";
import { robotsText, sitemapXml, PUBLIC_INDEX_PATHS } from "../lib/search-discovery.ts";
import { validAnalyticsToken, visitAnalyticsAllowed } from "../lib/visit-analytics.ts";
import { GOOGLE_SITE_VERIFICATION } from "../lib/service-config.ts";

test("Google ownership proof has a stable public fallback in server-rendered metadata", async () => {
  assert.equal(GOOGLE_SITE_VERIFICATION, "C5Dx4Gsws6Aav6vY-VEaChQoraxspO9EPBSqVcKR_I0");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /google: process\.env\.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION \|\| GOOGLE_SITE_VERIFICATION/);
});

const OPERATOR = "10000000-0000-4000-8000-000000000001";
const MEMBER = "10000000-0000-4000-8000-000000000002";
const now = new Date("2026-11-26T16:00:00Z"); // Nov 27 01:00 KST
const row = (event_name, created_at, user_id = OPERATOR, adventure_id = "swim") => ({ event_name, created_at, user_id, adventure_id, duration_minutes: 25 });
const fixture = [row("focus_started", "2026-11-26T15:01:00Z"), row("focus_completed", "2026-11-26T15:26:00Z"), row("companion_selected", "2026-11-25T00:00:00Z", MEMBER, "hike")];

test("dashboard uses Korean calendar days and does not expose account IDs", () => {
  const report = buildDashboard([...fixture, row("focus_started", "2020-01-01T00:00:00Z"), row("focus_started", "2030-01-01T00:00:00Z")], 7, now);
  assert.equal(report.daily.length, 7);
  assert.equal(report.today, "2026-11-27");
  assert.equal(report.daily.at(-1).started, 1);
  assert.equal(report.daily.at(-1).completed, 1);
  assert.equal(report.period.since, "2026-11-20T15:00:00.000Z");
  assert.equal(report.companions.find((item) => item.adventureId === "swim").completed, 1);
  assert.equal(report.companions.find((item) => item.adventureId === "hike").selected, 1);
  assert.equal(JSON.stringify(report).includes(OPERATOR), false);
  assert.equal(JSON.stringify(report).includes(MEMBER), false);
  assert.equal(report.summary.events, 3);
});

test("empty and 30-day reports keep exact calendar buckets without invented rates", () => {
  const report = buildDashboard([], 30, now);
  assert.equal(report.daily.length, 30);
  assert.equal(report.summary.uniqueUsers, 0);
  assert.equal(report.summary.completionRate, null);
});

function endpoint(overrides = {}) {
  let reads = 0;
  const handler = createOperationsEndpoint({
    configured: true, allowedIds: operatorIds(OPERATOR), now: () => now,
    authenticate: async (token) => token === "operator" ? OPERATOR : token === "member" ? MEMBER : null,
    loadEvents: async () => { reads++; return fixture; }, ...overrides,
  });
  return { handler, reads: () => reads };
}
const request = (token, query = "7", origin) => new Request(`https://focus.example/operations?days=${query}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) } });

test("anonymous, invalid JWT and non-operator never query analytics", async () => {
  const api = endpoint();
  assert.equal((await api.handler(request(null))).status, 401);
  assert.equal((await api.handler(request("invalid"))).status, 401);
  const denied = await api.handler(request("member"));
  assert.equal(denied.status, 403);
  assert.equal(JSON.stringify(await denied.json()).includes("events"), false);
  assert.equal(api.reads(), 0);
});

test("operator is a positive control; responses contain aggregates only and are never cacheable", async () => {
  const api = endpoint();
  const response = await api.handler(request("operator"));
  assert.equal(response.status, 200);
  assert.equal(api.reads(), 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  const body = await response.json();
  assert.equal(body.summary.events, 3);
  assert.equal(JSON.stringify(body).includes(OPERATOR), false);
});

test("origin, range, disabled configuration and upstream errors fail closed", async () => {
  const api = endpoint();
  assert.equal((await api.handler(request("operator", "7", "https://attacker.example"))).status, 403);
  assert.equal((await api.handler(request("operator", "9000"))).status, 400);
  assert.equal(api.reads(), 0);
  assert.equal((await endpoint({ allowedIds: operatorIds("") }).handler(request("operator"))).status, 503);
  const response = await endpoint({ loadEvents: async () => { throw new Error("private-secret-content"); } }).handler(request("operator"));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("private-secret-content"), false);
  assert.deepEqual([...operatorIds("admin,true,*,bad-id")], []);
});

test("search discovery indexes only public pages, never account or operator paths", () => {
  assert.deepEqual(PUBLIC_INDEX_PATHS, ["/", "/privacy", "/terms"]);
  assert.match(sitemapXml(), /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.equal((sitemapXml().match(/<url>/g) ?? []).length, 3);
  assert.equal(sitemapXml().includes("operations"), false);
  assert.match(robotsText(), /Disallow: \/api\//);
  assert.match(robotsText(), /Disallow: \/operations/);
  assert.match(robotsText(), /Sitemap: https:\/\/focus-quest\.hoya0328\.workers\.dev\/sitemap.xml/);
});

test("visit analytics requires explicit opt-in and excludes auth/operator URLs and DNT", () => {
  const home = new URL("https://focus.example/");
  assert.equal(visitAnalyticsAllowed(home, "allowed", null), true);
  for (const preference of [null, "denied", "true"]) assert.equal(visitAnalyticsAllowed(home, preference, null), false);
  assert.equal(visitAnalyticsAllowed(home, "allowed", "1"), false);
  for (const path of ["/operations", "/privacy", "/?code=secret", "/#access_token=secret", "/auth/callback"]) {
    assert.equal(visitAnalyticsAllowed(new URL(path, home), "allowed", null), false);
  }
  assert.equal(validAnalyticsToken("a".repeat(32)), true);
  for (const value of [null, "", "not-a-site-token", "https://attacker.example/", "a".repeat(33)]) assert.equal(validAnalyticsToken(value), false);
});

test("server route selects a minimal event projection and caps pagination", async () => {
  const source = await readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8");
  assert.match(source, /FOCUS_QUEST_OPERATOR_USER_IDS/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.doesNotMatch(source, /user_metadata|app_metadata|\.select\("\*"\)/);
  assert.match(source, /offset < 50_000/);
  assert.match(source, /Statistics safety limit exceeded/);
});
