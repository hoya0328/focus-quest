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
  await page.getByRole("button", { name: "모리와 25분 시작" }).click();
  await expect(page.locator(".focus-screen.focus-hike")).toBeVisible();
  await expect(page.locator(".timer-dial-face strong")).toHaveText(/^(25:00|24:[0-5]\d)$/);
});

test("keyboard quick start finishes a single expedition and offers five minutes of rest", async ({ page }) => {
  await page.clock.install();
  await openHome(page);
  await openSetup(page);
  await setInputValue(page, ".custom-time input", "43");
  await setInputValue(page, 'input[aria-label="휴식 시간"]', "11");
  await setInputValue(page, ".setup-intent-field input", "기존 맞춤 목표");
  await page.getByRole("group", { name: "원정 세트 수" }).getByRole("button").nth(2).click();
  await page.getByRole("button", { name: "친구 선택으로 돌아가기" }).click();

  await page.getByRole("radio", { name: /모리/ }).focus();
  await page.keyboard.press("End");
  const bori = page.getByRole("radio", { name: /보리/ });
  await expect(bori).toBeFocused();
  await expect(bori).toBeChecked();
  await page.getByRole("button", { name: "보리와 25분 시작" }).click();
  await expect(page.locator(".focus-screen.focus-fish")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("haru-focus-active-session")!))).toMatchObject({
    mode: "focus", durationMinutes: 25, plannedBreakMinutes: 5,
    adventureId: "fish", focusIntent: "자유 집중",
  });
  await expect(page.locator(".expedition-route")).toHaveCount(0);

  await page.clock.fastForward(25 * 60_000 + 1000);
  await expect(page.locator(".focus-screen.is-celebrating")).toBeVisible();
  await page.clock.fastForward(4500);
  await expect(page.getByRole("heading", { name: "보리와 오늘의 집중 완료" })).toBeVisible();
  await page.getByRole("button", { name: /끝냈어요/ }).click();
  await page.getByRole("button", { name: /5분 쉬어가기/ }).click();
  await expect(page.locator(".focus-screen.session-break")).toBeVisible();
  const saved = await page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem("haru-focus-active-session")!),
    preferences: JSON.parse(localStorage.getItem("haru-focus-preferences")!),
    history: JSON.parse(localStorage.getItem("haru-focus-history")!),
  }));
  expect(saved.session).toMatchObject({ mode: "break", durationMinutes: 5 });
  expect(saved.preferences).toMatchObject({ focusMinutes: 43, breakMinutes: 11 });
  expect(saved.history).toHaveLength(1);
  expect(saved.history[0]).toMatchObject({ durationMinutes: 25, adventureId: "fish" });
});

test("a failed scene download leaves the timer and pause control usable", async ({ page }) => {
  await openHome(page);
  let failedModules = 0;
  await page.route("**/_next/static/chunks/*.js", (route) => {
    failedModules++;
    return route.abort("failed");
  });
  await page.getByRole("button", { name: "모리와 25분 시작" }).click();
  await expect(page.getByRole("status").filter({ hasText: "타이머는 계속 진행돼요" })).toBeVisible();
  expect(failedModules).toBeGreaterThan(0);
  await expect(page.locator(".timer-dial-face strong")).toHaveText(/^(25:00|24:[0-5]\d)$/);
  await page.getByRole("button", { name: "잠시 멈춤" }).click();
  await expect(page.getByRole("button", { name: "계속하기" })).toBeVisible();
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
