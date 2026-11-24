import { expect, test } from "@playwright/test";

import {
  completedHistory,
  openHome,
  openSetup,
  seedHistory,
  setInputValue,
} from "./helpers";

const boundaries = [
  { count: 9, level: 1, remaining: 1 },
  { count: 10, level: 2, remaining: 15 },
  { count: 24, level: 2, remaining: 1 },
  { count: 25, level: 3, remaining: 25 },
  { count: 49, level: 3, remaining: 1 },
  { count: 50, level: 4, remaining: 50 },
  { count: 99, level: 4, remaining: 1 },
  { count: 100, level: 5, remaining: 0 },
] as const;

for (const boundary of boundaries) {
  test(`hike world changes at ${boundary.count} completed sets`, async ({
    page,
  }) => {
    await seedHistory(page, completedHistory(boundary.count, "hike"));
    await openHome(page);

    const card = page.getByRole("button", { name: /모리 · 해오름 봉우리/ });
    await expect(card).toContainText(`복원 ${boundary.level}/5`);
    if (boundary.remaining === 0) {
      await expect(card).toContainText("이 세계를 모두 깨웠어요");
    } else {
      await expect(card).toContainText(
        new RegExp(`다음: .+ · ${boundary.remaining}회`),
      );
    }
  });
}

test("world progress stays isolated to the selected companion", async ({
  page,
}) => {
  const history = [
    ...completedHistory(100, "hike"),
    ...completedHistory(10, "swim"),
    ...completedHistory(5, "fish", 5),
  ];
  await seedHistory(page, history);
  await openHome(page);

  await expect(
    page.getByRole("button", { name: /모리 · 해오름 봉우리/ }),
  ).toContainText("복원 5/5");
  await expect(
    page.getByRole("button", { name: /나루 · 유리산호 유적/ }),
  ).toContainText("복원 2/5");
  await expect(
    page.getByRole("button", { name: /보리 · 달비늘 호수/ }),
  ).toContainText("복원 1/5");
});

test("the unlocked world background is served inside the Phaser scene", async ({
  page,
}) => {
  await seedHistory(page, completedHistory(10, "hike"));
  await openHome(page);
  await openSetup(page);
  await setInputValue(page, ".custom-time input", "1");
  await page.locator(".bgm-grid button").last().dispatchEvent("click");

  const stageBackground = page.waitForResponse(
    (response) => response.url().endsWith("/world-stages/hike-stage-2.webp"),
  );
  await page.locator(".primary-button").dispatchEvent("click");

  await expect(page.locator(".focus-world-stage")).toHaveText(
    "세계 복원 2/5 · 길잡이의 표식",
  );
  expect((await stageBackground).ok()).toBe(true);
  await expect(page.locator("canvas")).toBeVisible();
});
