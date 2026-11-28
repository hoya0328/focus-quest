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
  await openSetup(page);
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

test("the first viewport contains the quick start and fetches only menu art", async ({ page }) => {
  const requests = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "image") requests.add(new URL(request.url()).pathname);
  });
  await openHome(page);
  const start = page.getByRole("button", { name: "모리와 25분 시작" });
  await expect(start).toBeEnabled();
  await expect(start).toBeInViewport({ ratio: 1 });
  await expectNoHorizontalOverflow(page);
  const variant = page.viewportSize()!.width <= 768 ? "landscape-small.webp" : "landscape.webp";
  for (const id of ["hike", "swim", "fish"]) {
    expect(requests.has(`/previews/${id}-${variant}`)).toBe(true);
  }
  expect([...requests].filter((path) => /^\/(backgrounds|characters|sprites)\//.test(path))).toEqual([]);
  const memoryCopy = await page.locator(".companion-memory-card > div:last-child").boundingBox();
  expect(memoryCopy?.width ?? 0).toBeGreaterThan(120);
  await page.locator(".world-restoration-card").first().scrollIntoViewIfNeeded();
  await expect.poll(() => requests.has("/backgrounds/world-stages/hike-stage-2.webp")).toBe(true);

  await page.getByRole("radio", { name: /나루/ }).click();
  await page.getByRole("button", { name: "나루와 25분 시작" }).click();
  await expect(page.locator(".focus-screen.focus-swim")).toBeVisible();
  await expect(page.locator(".timer-dial-face strong")).toHaveText(/^(25:00|24:[0-5]\d)$/);
  await expectNoHorizontalOverflow(page);
});
