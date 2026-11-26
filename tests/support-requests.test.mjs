import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSupportEndpoint, parseSupportCursor, parseSupportSubmission, SUPPORT_NOTICE_VERSION } from "../lib/support-requests.ts";
import { getInstallPlatform, INSTALL_STEPS } from "../lib/pwa-install.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const OPERATOR = "10000000-0000-4000-8000-000000000002";
const MEMBER = "10000000-0000-4000-8000-000000000003";
const draft = { id: ID, category: "bug", message: "설치 버튼을 눌러도 안내가 열리지 않아요.", consent: true, noticeVersion: SUPPORT_NOTICE_VERSION };
const request = (method = "POST", body = draft, token, headers = {}) => new Request("https://focus.example/api/support", { method,
  headers: { Origin: "https://focus.example", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
});
function endpoint(overrides = {}) {
  const calls = { submitted: 0, read: 0, updated: 0 };
  const handler = createSupportEndpoint({ configured: true, allowedIds: new Set([OPERATOR]),
    authenticate: async token => token === "operator" ? OPERATOR : token === "member" ? MEMBER : null,
    submit: async () => { calls.submitted++; return "saved"; },
    list: async () => { calls.read++; return { tickets: [{ ...draft, status: "open" }], nextCursor: null }; },
    update: async () => { calls.updated++; return true; }, ...overrides,
  });
  return { handler, calls };
}

test("support input is bounded and requires its own explicit current notice confirmation", () => {
  assert.equal(parseSupportSubmission(draft).message, draft.message);
  for (const patch of [{ message: "짧음" }, { message: "가".repeat(3001) }, { category: "__proto__" }, { consent: false }, { noticeVersion: "old" }, { website: "spam" }, { message: "invalid\u0000message" }, { id: "bad" }]) assert.equal(parseSupportSubmission({ ...draft, ...patch }), null);
  assert.equal(Object.hasOwn(parseSupportSubmission({ ...draft, user_id: MEMBER, is_admin: true }), "user_id"), false);
  assert.equal(parseSupportCursor("bad"), undefined);
  assert.equal(parseSupportCursor(`2026-11-26T10:00:00.000Z,${ID}`).id, ID);
  assert.equal(parseSupportCursor(`2026-11-26T10:00:00.000Z,${ID},injected`), undefined);
});

test("any visitor can submit a memo; receipt never contains private inbox contents", async () => {
  const api = endpoint();
  const response = await api.handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: ID, message: "운영자 문의함에 전달했어요." });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(api.calls.submitted, 1);
});

test("intake rejects cross-origin, absent Origin, bad JSON, large streams and missing consent before storage", async () => {
  const api = endpoint();
  assert.equal((await api.handler(request("POST", draft, null, { Origin: "https://other.example" }))).status, 403);
  const missing = request(); missing.headers.delete("origin");
  assert.equal((await api.handler(missing)).status, 403);
  assert.equal((await api.handler(request("POST", draft, null, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  assert.equal((await api.handler(request("POST", { ...draft, consent: false }))).status, 400);
  assert.equal((await api.handler(request("POST", { ...draft, message: "a".repeat(17000) }))).status, 413);
  const bad = new Request("https://focus.example/api/support", { method: "POST", headers: { Origin: "https://focus.example", "Content-Type": "application/json" }, body: "{bad" });
  assert.equal((await api.handler(bad)).status, 400);
  assert.equal(api.calls.submitted, 0);
});

test("inbox and status updates reject anonymous, invalid and ordinary user JWTs without reading or writing", async () => {
  const api = endpoint();
  for (const method of ["GET", "PATCH"]) {
    for (const [token, expected] of [[null, 401], ["invalid", 401], ["member", 403]]) assert.equal((await api.handler(request(method, { id: ID, status: "closed" }, token))).status, expected);
  }
  assert.equal(api.calls.read, 0); assert.equal(api.calls.updated, 0);
});

test("operator positive control reads the synthetic memo and can change its state", async () => {
  const api = endpoint();
  const response = await api.handler(request("GET", null, "operator"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tickets[0].message, draft.message);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.equal((await api.handler(request("PATCH", { id: ID, status: "closed" }, "operator"))).status, 200);
  assert.equal((await api.handler(request("PATCH", { id: ID, status: "admin" }, "operator"))).status, 400);
  assert.equal(api.calls.updated, 1);
});

test("operator shortcut does not load contents, rate limiting is explicit, and failures never leak text or keys", async () => {
  const api = endpoint();
  const access = new Request("https://focus.example/api/support?access=1", { headers: { Authorization: "Bearer operator" } });
  assert.deepEqual(await (await api.handler(access)).json(), { allowed: true });
  assert.equal(api.calls.read, 0);
  const limited = await endpoint({ submit: async () => "limited" }).handler(request());
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "3600");
  assert.equal((await endpoint({ submit: async () => "conflict" }).handler(request())).status, 409);
  const failure = await endpoint({ submit: async () => { throw new Error("private-key-and-message"); } }).handler(request());
  assert.equal(failure.status, 503); assert.equal((await failure.text()).includes("private-key"), false);
});

test("inbox has no client grants; only bounded admission RPC inserts, only daily cleanup deletes", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202611260001_support_inbox.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.focus_quest_support_requests from public, anon, authenticated, service_role/);
  assert.match(sql, /grant update\(status, reviewed_at\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /interval '90 days'/);
  assert.doesNotMatch(sql, /grant (?:all|insert|delete).*to (?:anon|authenticated|service_role)/i);
});

test("installation platform guidance covers iPad desktop mode and unsupported native prompts", () => {
  assert.equal(getInstallPlatform("Mozilla Macintosh", 5), "ios");
  assert.equal(getInstallPlatform("iPhone"), "ios");
  assert.equal(getInstallPlatform("Android"), "android");
  assert.equal(getInstallPlatform("Windows Chrome"), "desktop");
  for (const platform of ["ios", "android", "desktop"]) assert.equal(INSTALL_STEPS[platform].length, 3);
});
