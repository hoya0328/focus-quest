import { expect, test } from "@playwright/test";

import {
  openHome,
  openSetup,
  resetGuestStorage,
  setInputValue,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetGuestStorage(page);
});

test("a guest can choose a companion and start a focus session", async ({
  page,
}) => {
  await openHome(page);
  await openSetup(page);

  await setInputValue(page, ".setup-intent-field input", "운영체제 3장 복습");
  await setInputValue(page, ".custom-time input", "1");
  await page.locator(".bgm-grid button").last().dispatchEvent("click");
  await page.locator(".primary-button").dispatchEvent("click");

  await expect(page.locator(".focus-screen.focus-hike")).toBeVisible();
  await expect(page.locator(".focus-world-stage")).toHaveText(
    "세계 복원 1/5 · 숲길의 첫 숨",
  );
  await expect(page.locator(".pause-button")).toHaveText("잠시 멈춤");
});

test("a cloud failure never blocks the guest timer path", async ({ page }) => {
  await openHome(page);

  await expect(page.getByText("이 기기에 저장 중")).toBeVisible();
  await openSetup(page);
  await expect(page.locator(".primary-button")).toBeEnabled();
});

test("offline navigation has a private-data-free recovery screen", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 10_000 }).toBe(true);
    const cachedRecovery = await page.evaluate(async () => {
      const response = await caches.match("/offline.html");
      return {
        version: await caches.keys(),
        controller: navigator.serviceWorker.controller?.scriptURL,
        hasRecovery: Boolean(response && (await response.text()).includes("연결을 잠시 놓쳤어요")),
        hasNavigationCache: Boolean(await caches.match("/__focus-quest-offline")),
      };
    });
    console.log("Offline cache control", cachedRecovery);
    expect(cachedRecovery.hasRecovery).toBe(true);
    // Chromium can keep a worker online when only its page is emulated offline.
    await context.route("**/offline-probe", (route) =>
      route.request().serviceWorker() ? route.abort("internetdisconnected") : route.continue(),
    );
    await context.setOffline(true);
    await page.goto(`${baseURL}/offline-probe`);
    await expect(page.getByRole("heading", { name: "연결을 잠시 놓쳤어요." })).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 연결하기" })).toBeVisible();
    await context.setOffline(false);
    await page.goto(baseURL!);
    await expect(page.getByRole("heading", { name: "누구와 집중할까요?" })).toBeVisible();
  } finally {
    await context.close();
  }
});
