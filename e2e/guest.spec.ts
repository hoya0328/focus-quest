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
