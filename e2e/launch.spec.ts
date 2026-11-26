import { expect, test } from "@playwright/test";
import { buildDashboard } from "../lib/operations-dashboard";

const syntheticUser = "10000000-0000-4000-8000-000000000001";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const project = url ? new URL(url).hostname.split(".")[0] : "";

test("discovery endpoints and anonymous operator boundary", async ({ request, page }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  expect(await sitemap.text()).not.toContain("/operations");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /operations");
  const denied = await request.get("/api/operations");
  expect(denied.status()).toBe(401);
  expect(denied.headers()["cache-control"]).toContain("no-store");
  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "지금은 통계를 볼 수 없어요" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("로그인");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await page.request.get("/operations")).headers()["x-robots-tag"]).toContain("noindex");
});

test("operator dashboard renders aggregate fixture, period changes, errors and mobile", async ({ page }) => {
  test.skip(!project, "Requires public Supabase build configuration, not real user credentials.");
  // Synthetic cached session + mocked API are UI-only evidence, never production authorization evidence.
  await page.addInitScript(({ project, syntheticUser }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
      access_token: "synthetic-ui-token", refresh_token: "synthetic-refresh", token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
      user: { id: syntheticUser, aud: "authenticated", role: "authenticated", email: "operator@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }));
  }, { project, syntheticUser });
  let mode: "data" | "empty" | "error" = "data";
  let requests = 0;
  await page.route("**/api/operations?*", async (route) => {
    requests++;
    if (mode === "error") return route.fulfill({ status: 403, json: { error: "운영자만 볼 수 있는 화면입니다." } });
    const days = Number(new URL(route.request().url()).searchParams.get("days")) as 7 | 30;
    const now = new Date("2026-11-26T09:00:00Z");
    const events = mode === "empty" ? [] : Array.from({ length: 12 }, (_, i) => ({
      event_name: i % 3 === 0 ? "focus_started" : i % 3 === 1 ? "focus_completed" : "app_opened",
      user_id: `synthetic-${i % 4}`, created_at: new Date(now.getTime() - (i % 6) * 86400000).toISOString(),
      adventure_id: ["hike", "swim", "fish"][i % 3], duration_minutes: 25,
    }));
    await route.fulfill({ json: buildDashboard(events, days, now) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/operations");
  await expect(page.getByText("기록이 있는 이용자", { exact: true })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "모리 · 해오름 봉우리" })).toBeVisible();
  expect(requests).toBeLessThan(5);
  await page.screenshot({ path: ".impeccable/review/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });
  await page.getByLabel("조회 기간").selectOption("30");
  await expect(page.locator(".operations-chart-day")).toHaveCount(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/mobile-30.png", fullPage: true });
  mode = "empty";
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("수집된 이용 기록이 없습니다");
  mode = "error";
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("운영자만");
  await expect(page.locator(".operations-metrics")).toHaveCount(0);
});

test.describe("analytics lifecycle with a synthetic site configuration", () => {
  // The local Worker intentionally has no analytics binding; only this fixture bypasses its CSP.
  // Real production CSP is separately verified after deployment.
  test.use({ bypassCSP: true });
test("visit settings stay off the home page and remain available for consent and withdrawal in privacy", async ({ page, context }) => {
  let beacons = 0;
  await context.route("**/api/visit-analytics", (route) => route.fulfill({ json: { enabled: true, token: "a".repeat(32) } }));
  await context.route("https://static.cloudflareinsights.com/**", (route) => { beacons++; return route.fulfill({ contentType: "application/javascript", body: "/* synthetic analytics test */" }); });
  await page.goto("/");
  await expect(page.locator(".visit-analytics")).toHaveCount(0);
  expect(beacons).toBe(0);
  await page.goto("/privacy");
  await expect(page.getByRole("button", { name: "방문 통계 허용" })).toBeVisible();
  await page.getByRole("heading", { name: "방문 통계 설정" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".impeccable/review/visit-preference.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "방문 통계 설정" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".impeccable/review/visit-preference-mobile.png" });
  expect(beacons).toBe(0);
  await page.getByRole("button", { name: "방문 통계 허용" }).click();
  expect(beacons).toBe(0);
  await page.goto("/");
  await expect.poll(() => beacons).toBe(1);
  await expect(page.locator(".visit-analytics")).toHaveCount(0);
  const privacy = await context.newPage();
  await privacy.goto("http://127.0.0.1:3110/privacy#visit-analytics");
  const reload = page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() });
  await privacy.getByRole("button", { name: "사용하지 않기" }).click();
  await reload;
  await expect(page.getByRole("heading", { name: "누구와 집중할까요?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("focus-quest-visit-analytics"))).toBe("denied");
  await privacy.close();
  await page.goto("/?code=synthetic-auth-code");
  await expect(page.locator(".visit-analytics")).toHaveCount(0);
  expect(beacons).toBe(1);
  await page.goto("/operations");
  expect(beacons).toBe(1);
  await expect(page.locator(".visit-analytics")).toHaveCount(0);
});

for (const scenario of ["unchecked", "allowed", "failed", "storage-blocked", "dnt"] as const) {
  test(`signup analytics choice: ${scenario}`, async ({ page }) => {
    test.skip(!project, "Requires public Supabase configuration; all signup requests are mocked, no account or email is created.");
    let beacons = 0;
    let signupCalls = 0;
    await page.route("**/api/visit-analytics", route => route.fulfill({ json: { enabled: true, token: "a".repeat(32) } }));
    await page.route("https://static.cloudflareinsights.com/**", route => { beacons++; return route.fulfill({ contentType: "application/javascript", body: "/* synthetic analytics */" }); });
    await page.route("**/auth/v1/signup*", async route => {
      signupCalls++;
      const data = route.request().postDataJSON().data;
      expect(data).toHaveProperty("privacy_notice_version");
      expect(data).not.toHaveProperty("analyticsConsent");
      if (scenario === "failed") return route.fulfill({ status: 422, json: { code: "signup_disabled", msg: "Synthetic signup failure" } });
      return route.fulfill({ json: { id: syntheticUser, aud: "authenticated", role: "authenticated", email: "signup@example.invalid", identities: [], created_at: new Date().toISOString() } });
    });
    if (scenario === "storage-blocked") await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === "focus-quest-visit-analytics") throw new DOMException("Synthetic storage denial"); return original.call(this, key, value); };
    });
    if (scenario === "dnt") await page.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { get: () => "1", configurable: true }));
    await page.goto("/");
    await page.getByRole("button", { name: "로그인하고 클라우드에 집중 기록 저장" }).click();
    const dialog = page.getByRole("dialog", { name: "모험 기록 이어하기" });
    await dialog.getByRole("tab", { name: "회원가입" }).click();
    const signup = page.getByRole("dialog", { name: "새 모험가 등록" });
    await signup.getByLabel("이메일", { exact: true }).fill("signup@example.invalid");
    await signup.getByLabel("비밀번호", { exact: true }).fill("Synthetic-passphrase-123");
    await signup.getByLabel(/만 14세 이상입니다/).check();
    await signup.getByLabel(/개인정보 처리방침의 수집 항목/).check();
    await signup.getByLabel(/이용약관에 동의합니다/).check();
    const choice = signup.getByLabel(/서비스 개선을 위한 방문 통계 측정에 동의합니다/);
    await expect(choice).not.toBeChecked();
    expect(await choice.getAttribute("required")).toBeNull();
    if (scenario === "dnt") await expect(choice).toBeDisabled();
    else if (scenario !== "unchecked") await choice.check();
    expect(beacons).toBe(0); // Checking/abandoning a form is not a completed signup grant.
    await page.setViewportSize({ width: 390, height: 844 });
    await choice.scrollIntoViewIfNeeded();
    if (scenario === "allowed") await page.screenshot({ path: ".impeccable/review/signup-analytics-mobile.png" });
    await signup.getByRole("button", { name: "계정 만들기", exact: true }).click();
    await expect.poll(() => signupCalls).toBe(1);
    if (scenario === "allowed") {
      await expect.poll(() => beacons).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem("focus-quest-visit-analytics"))).toBe("allowed");
    } else {
      await expect(signup.locator(".auth-dialog-notice")).not.toBeEmpty();
      expect(beacons).toBe(0);
      expect(await page.evaluate(() => localStorage.getItem("focus-quest-visit-analytics"))).toBeNull();
    }
    await expect(page.locator(".visit-analytics")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
});
