import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  openHome,
  openSetup,
  resetGuestStorage,
  setInputValue,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetGuestStorage(page);
});

test("entry, setup and focus screens fit the viewport", async ({ page }) => {
  await openHome(page);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("radio", { name: /나루/ }).dispatchEvent("click");
  await openSetup(page, "나루");
  await expectNoHorizontalOverflow(page);

  await setInputValue(page, ".custom-time input", "1");
  await page.locator(".bgm-grid button").last().dispatchEvent("click");
  await page.locator(".primary-button").dispatchEvent("click");

  await expect(page.locator(".focus-screen.focus-swim")).toBeVisible();
  await expect(page.locator(".pause-button")).toHaveText("잠시 멈춤");
  await expectNoHorizontalOverflow(page);

  const canvasBox = await page.locator("canvas").boundingBox();
  const viewport = page.viewportSize();
  expect(canvasBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(canvasBox?.width ?? 0).toBeLessThanOrEqual(viewport?.width ?? 0);
});
