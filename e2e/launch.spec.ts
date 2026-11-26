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
test("visit analytics is opt-in, stays off for callbacks and does not block the timer", async ({ page }) => {
  let beacons = 0;
  await page.route("**/api/visit-analytics", (route) => route.fulfill({ json: { enabled: true, token: "a".repeat(32) } }));
  await page.route("https://static.cloudflareinsights.com/**", (route) => { beacons++; return route.fulfill({ contentType: "application/javascript", body: "/* synthetic analytics test */" }); });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "방문 통계 허용" })).toBeVisible();
  await page.getByRole("heading", { name: "방문 통계 설정" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".impeccable/review/visit-preference.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "방문 통계 설정" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".impeccable/review/visit-preference-mobile.png" });
  expect(beacons).toBe(0);
  await page.getByRole("button", { name: "방문 통계 허용" }).click();
  await expect.poll(() => beacons).toBe(1);
  await page.goto("/?code=synthetic-auth-code");
  await expect(page.getByRole("button", { name: "사용하지 않기" })).toBeVisible();
  expect(beacons).toBe(1);
  await page.goto("/operations");
  expect(beacons).toBe(1);
  await expect(page.locator(".visit-analytics")).toHaveCount(0);
});
});
