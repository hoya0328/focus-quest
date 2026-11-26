import { expect, test, type Page } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const project = url ? new URL(url).hostname.split(".")[0] : "";
const ticketId = "10000000-0000-4000-8000-000000000091";

async function openMemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "버그 신고 · 문의", exact: true }).click();
  return page.getByRole("dialog", { name: "운영자에게 메모 남기기" });
}

test("guest memo submission stays in-app, survives failure and retries without duplication", async ({ page }) => {
  let requests = 0;
  const ids: string[] = [];
  await page.route("**/api/support", async route => {
    const body = route.request().postDataJSON(); ids.push(body.id); requests++;
    expect(body).not.toHaveProperty("email"); expect(body).not.toHaveProperty("user_id");
    return requests === 1 ? route.fulfill({ status: 503, json: { error: "다시 보내 주세요." } }) : route.fulfill({ json: { id: body.id } });
  });
  const dialog = await openMemo(page);
  await expect(dialog.getByLabel("메모 내용", { exact: true })).toBeFocused();
  await dialog.getByLabel("메모 내용", { exact: true }).fill("휴대폰에서 설치 버튼을 눌렀는데 아무 안내가 나오지 않았어요.");
  await dialog.getByLabel("문의 내용의 운영자 전달과 접수 후 90일 보관에 동의합니다.").check();
  await dialog.getByRole("button", { name: "메모 보내기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("다시 보내");
  await expect(dialog.getByLabel("메모 내용", { exact: true })).toHaveValue(/휴대폰/);
  await dialog.getByRole("button", { name: "메모 보내기", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("운영자 문의함에 전달했어요");
  expect(ids[0]).toBe(ids[1]);
  await page.screenshot({ path: ".impeccable/review/support-success.png" });
  await dialog.getByRole("button", { name: "문의 메모 닫기" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "버그 신고 · 문의", exact: true })).toBeFocused();
});

test("mobile notepad is usable, traps focus, preserves drafts on close and never navigates to mail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openMemo(page);
  await expect(dialog.getByRole("heading", { name: "운영자에게 메모 남기기" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "문의 메모 닫기" })).toBeInViewport();
  const memo = dialog.getByLabel("메모 내용", { exact: true });
  await memo.fill("테스트용 메모입니다. 보내기 전에는 기기에만 남아 있어요.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/support-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "버그 신고 · 문의", exact: true }).click();
  await expect(memo).toHaveValue(/테스트용 메모/);
  await expect(dialog.getByRole("button", { name: "메모 보내기" })).toBeEnabled();
  expect(page.url()).toMatch(/\/$/);
});

test("install button opens useful device guidance when no native prompt exists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Focus Quest 설치", exact: true }).click();
  await expect(page.getByRole("region", { name: "이 기기에 설치하는 방법" })).toBeVisible();
  await expect(page.getByRole("region", { name: "이 기기에 설치하는 방법" })).toContainText("Chrome 또는 Edge");
  await page.getByRole("button", { name: "설치 방법 접기" }).click();
  await expect(page.getByRole("region", { name: "이 기기에 설치하는 방법" })).not.toBeVisible();
});

test("native install event is consumed once; dismissal and rejection recover to guidance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Focus Quest 설치", exact: true }).click();
  for (const reject of [false, true]) {
    await page.evaluate(({ reject }) => {
      const state = window as unknown as { installCalls: number };
      state.installCalls = 0;
      const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => { state.installCalls++; if (reject) throw new Error("synthetic prompt failure"); },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    }, { reject });
    await page.getByRole("button", { name: "Focus Quest 설치", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(reject ? "열지 못했어요" : "취소했어요");
    await page.getByRole("button", { name: "Focus Quest 설치", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { installCalls: number }).installCalls)).toBe(1);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByText("앱으로 이용 중 · 이 기기에 설치됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Focus Quest 설치", exact: true })).toHaveCount(0);
});

test("iPhone installation guidance is device-specific and responsive", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3110/");
  await page.getByRole("button", { name: "Focus Quest 설치", exact: true }).click();
  await expect(page.getByRole("region", { name: "이 기기에 설치하는 방법" })).toContainText("Safari");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/install-ios.png", fullPage: true });
  await context.close();
});

test("operator inbox is private and noindex even when the page shell opens", async ({ page, request }) => {
  const response = await request.get("/api/support");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/operations/support");
  await expect(page.getByRole("alert")).toContainText("운영자 계정으로 로그인");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("operator inbox renders text safely, changes state and clears contents on account change", async ({ page }) => {
  test.skip(!project, "Requires public Supabase configuration, never real user credentials.");
  await page.addInitScript(({ project }) => localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
    access_token: "synthetic-inbox-ui-token", refresh_token: "synthetic-refresh", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "operator@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  })), { project });
  let closed = false;
  await page.route("**/api/support*", async route => {
    if (route.request().method() === "PATCH") { closed = true; return route.fulfill({ json: { updated: true } }); }
    return route.fulfill({ json: { tickets: [{ id: ticketId, category: "bug", message: '<img src=x onerror="window.leaked=true">\nSynthetic memo only.', status: closed ? "closed" : "open", created_at: "2026-11-26T12:00:00.000Z", reviewed_at: null }], nextCursor: null } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operations/support");
  await expect(page.locator(".support-ticket-message")).toContainText("<img src=x");
  await expect(page.locator(".support-ticket-message img")).toHaveCount(0);
  await page.getByRole("button", { name: "처리 완료로 표시" }).click();
  await expect(page.locator(".support-ticket-status")).toHaveText("처리 완료");
  expect(closed).toBe(true);
  await page.screenshot({ path: ".impeccable/review/support-inbox-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(({ project }) => { localStorage.removeItem(`sb-${project}-auth-token`); window.dispatchEvent(new StorageEvent("storage", { key: `sb-${project}-auth-token`, newValue: null })); }, { project });
  await expect(page.locator(".support-ticket")).toHaveCount(0);
});
