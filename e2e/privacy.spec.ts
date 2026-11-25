import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openHome, resetGuestStorage } from "./helpers";

test("the guest footer opens a public readable notice without leaving the timer", async ({ page }) => {
  await resetGuestStorage(page);
  await openHome(page);
  const link = page.getByRole("navigation", { name: "서비스 안내" }).getByRole("link", { name: /개인정보 처리방침/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const policy = await popupPromise;
  await expect(policy.getByRole("heading", { level: 1, name: "개인정보 처리방침" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "누구와 집중할까요?" })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await policy.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(policy);
  }
  await policy.getByRole("navigation", { name: "개인정보 처리방침 목차" }).getByRole("link", { name: "내 정보 관리하기" }).click();
  await expect(policy).toHaveURL(/\/privacy#rights$/);
  await expect(policy.getByRole("heading", { name: "내 정보 관리하기" })).toBeInViewport();
  await expect(policy.locator("h1")).toHaveCount(1);
  await policy.close();
  const terms = page.getByRole("navigation", { name: "서비스 안내" }).getByRole("link", { name: /이용약관/ });
  const termsPopup = page.waitForEvent("popup");
  await terms.click();
  const termsPage = await termsPopup;
  await expect(termsPage.getByRole("heading", { level: 1, name: "이용약관" })).toBeVisible();
  for (const width of [1440, 834, 390]) {
    await termsPage.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(termsPage);
  }
  await termsPage.close();
});
