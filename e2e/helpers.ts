import { expect, type Page } from "@playwright/test";

export type AdventureId = "hike" | "swim" | "fish";

export function completedHistory(
  count: number,
  adventureId: AdventureId,
  durationMinutes = 25,
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${adventureId}-${durationMinutes}-${index}`,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, index + 1)).toISOString(),
    durationMinutes,
    adventureId,
    focusIntent: "E2E 집중",
  }));
}

async function stubGuestCloud(page: Page) {
  await page.route(/\/api\/(?:me|cloud-state)(?:\?.*)?$/, (route) =>
    route.fulfill({
      body: JSON.stringify({ authenticated: false }),
      contentType: "application/json",
      status: 401,
    }),
  );
}

export async function resetGuestStorage(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await stubGuestCloud(page);
}

export async function seedHistory(page: Page, history: unknown[]) {
  await stubGuestCloud(page);
  await page.addInitScript((records) => {
    window.localStorage.clear();
    window.localStorage.setItem("haru-focus-history", JSON.stringify(records));
  }, history);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
}

export async function openHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "누구와 집중할까요?" })).toBeVisible();
  await expect(page.locator(".account-chip small")).toHaveText("이 기기에 저장 중", {
    timeout: 15_000,
  });
  await page.waitForLoadState("load", { timeout: 15_000 });
}

export async function openSetup(page: Page) {
  await page.getByRole("button", { name: "시간·음악 설정" }).click();
  await expect(page.locator(".screen-setup h1")).toHaveText(
    "나만의 집중 시간을 만들어요.",
  );
}

export async function setInputValue(
  page: Page,
  selector: string,
  value: string,
) {
  await page.locator(selector).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
