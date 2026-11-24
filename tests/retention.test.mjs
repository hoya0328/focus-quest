import test from "node:test";
import assert from "node:assert/strict";

import { createFocusRecord } from "../lib/pomodoro.ts";
import {
  RECOVERY_QUEST_LIFETIME_MS,
  createRecoveryQuest,
  getAdventureTraceProgress,
  getBehaviorInsights,
  getCompanionMemory,
  getWorldProgress,
  parseRecoveryQuest,
} from "../lib/retention.ts";
import {
  getCompanionGrowth,
  growthEntriesFromHistory,
  mergeCompanionGrowthEntries,
  parseStoredCompanionGrowth,
} from "../lib/companion-growth.ts";
import {
  getWorldBackgroundKey,
  getWorldBackgroundPath,
} from "../lib/world-growth.ts";

const now = Date.parse("2026-11-13T08:00:00.000Z");

test("a recovery quest is bounded to seven days and a five or ten minute return", () => {
  const short = createRecoveryQuest({
    adventureId: "hike",
    bgm: "forest",
    focusIntent: " 운영체제   복습 ",
    remainingSeconds: 240,
    now,
  });
  const long = createRecoveryQuest({
    adventureId: "fish",
    bgm: "lake",
    focusIntent: "데이터베이스",
    remainingSeconds: 601,
    now,
  });

  assert.equal(short.durationMinutes, 5);
  assert.equal(short.focusIntent, "운영체제 복습");
  assert.equal(long.durationMinutes, 10);
  assert.equal(Date.parse(short.expiresAt) - now, RECOVERY_QUEST_LIFETIME_MS);
  assert.deepEqual(parseRecoveryQuest(JSON.stringify(short), now), short);
  assert.equal(parseRecoveryQuest(JSON.stringify(short), Date.parse(short.expiresAt)), null);
  assert.equal(
    parseRecoveryQuest(
      JSON.stringify({ ...short, expiresAt: "2026-12-01T08:00:00.000Z" }),
      now,
    ),
    null,
  );
});

test("legacy recovery quests receive the original seven-day expiry", () => {
  const legacy = {
    createdAt: "2026-11-13T08:00:00.000Z",
    focusIntent: "자료구조",
    durationMinutes: 10,
    adventureId: "swim",
    bgm: "waves",
  };
  const parsed = parseRecoveryQuest(JSON.stringify(legacy), now);

  assert.ok(parsed);
  assert.equal(
    parsed.expiresAt,
    new Date(now + RECOVERY_QUEST_LIFETIME_MS).toISOString(),
  );
});

test("each world grows through five increasingly demanding milestones", () => {
  const history = Array.from({ length: 25 }, (_, index) =>
    createFocusRecord({
      durationMinutes: 25,
      adventureId: "hike",
      completedAt: new Date(now - index * 60_000),
    }),
  );
  const progress = getWorldProgress(history, "hike");

  assert.equal(progress.level, 3);
  assert.equal(progress.nextTarget, 50);
  assert.equal(progress.remaining, 25);
  assert.equal(progress.progressPercent, 0);
  assert.deepEqual(getWorldProgress([], "swim"), {
    adventureId: "swim",
    completed: 0,
    level: 1,
    nextTarget: 10,
    nextUnlockLabel: "산호빛 길",
    remaining: 10,
    progressPercent: 0,
    unlockedLabel: "잠든 유적",
  });
});

test("world growth counts completed sets of at least ten minutes per companion", () => {
  const history = [
    ...Array.from({ length: 10 }, (_, index) =>
      createFocusRecord({
        durationMinutes: 10,
        adventureId: "hike",
        completedAt: new Date(now - index * 60_000),
      }),
    ),
    createFocusRecord({
      durationMinutes: 5,
      adventureId: "hike",
      completedAt: new Date(now - 20 * 60_000),
    }),
    createFocusRecord({
      durationMinutes: 60,
      adventureId: "swim",
      completedAt: new Date(now - 21 * 60_000),
    }),
  ];

  assert.deepEqual(getWorldProgress(history, "hike"), {
    adventureId: "hike",
    completed: 10,
    level: 2,
    nextTarget: 25,
    nextUnlockLabel: "능선 쉼터",
    remaining: 15,
    progressPercent: 0,
    unlockedLabel: "길잡이의 표식",
  });
  assert.equal(getWorldProgress(history, "swim").completed, 1);
  assert.equal(getWorldProgress(history, "fish").completed, 0);
});

test("a world reaches its final form at one hundred valid completed sets", () => {
  const history = Array.from({ length: 100 }, (_, index) =>
    createFocusRecord({
      durationMinutes: index % 2 === 0 ? 25 : 60,
      adventureId: "fish",
      completedAt: new Date(now - index * 60_000),
    }),
  );

  assert.deepEqual(getWorldProgress(history, "fish"), {
    adventureId: "fish",
    completed: 100,
    level: 5,
    nextTarget: null,
    nextUnlockLabel: null,
    remaining: 0,
    progressPercent: 100,
    unlockedLabel: "황금빛 호수",
  });
});

test("the first three valid sessions leave immediate companion-specific traces", () => {
  const history = [
    createFocusRecord({
      durationMinutes: 25,
      adventureId: "hike",
      completedAt: new Date(now),
    }),
    createFocusRecord({
      durationMinutes: 10,
      adventureId: "hike",
      completedAt: new Date(now - 1_000),
    }),
    createFocusRecord({
      durationMinutes: 5,
      adventureId: "hike",
      completedAt: new Date(now - 2_000),
    }),
    createFocusRecord({
      durationMinutes: 25,
      adventureId: "fish",
      completedAt: new Date(now - 3_000),
    }),
  ];

  assert.deepEqual(getAdventureTraceProgress(history, "hike"), {
    adventureId: "hike",
    completed: 2,
    unlockedCount: 2,
    latestLabel: "솔바람 표식",
    nextLabel: "정상으로 향한 지도",
    message: "정상으로 향한 지도까지 1번의 첫 원정이 남았어요.",
    labels: ["첫 발자국", "솔바람 표식", "정상으로 향한 지도"],
  });
  assert.equal(getAdventureTraceProgress(history, "fish").latestLabel, "첫 물결");
  assert.equal(getAdventureTraceProgress(history, "swim").unlockedCount, 0);
});

test("completed first journey traces continue into the existing long-term world", () => {
  const history = Array.from({ length: 4 }, (_, index) =>
    createFocusRecord({
      durationMinutes: 25,
      adventureId: "swim",
      completedAt: new Date(now - index * 1_000),
    }),
  );
  const trace = getAdventureTraceProgress(history, "swim");

  assert.equal(trace.unlockedCount, 3);
  assert.equal(trace.latestLabel, "4번째 모험 흔적");
  assert.equal(trace.nextLabel, null);
  assert.match(trace.message, /세계가 깨어나기까지 6번/);
});

test("every world level resolves to a stable Phaser texture and asset path", () => {
  assert.equal(getWorldBackgroundKey("hike", 3), "world-hike-3");
  assert.equal(
    getWorldBackgroundPath("hike", 1),
    "/backgrounds/hike-pixel-summit-v1.png",
  );
  assert.equal(
    getWorldBackgroundPath("swim", 4),
    "/backgrounds/world-stages/swim-stage-4.webp",
  );
  assert.equal(
    getWorldBackgroundPath("fish", 99),
    "/backgrounds/world-stages/fish-stage-5.webp",
  );
});

test("a companion remembers only adventures completed together", () => {
  const history = [
    createFocusRecord({ durationMinutes: 25, adventureId: "hike", focusIntent: "운영체제", completedAt: new Date(now) }),
    createFocusRecord({ durationMinutes: 25, adventureId: "fish", focusIntent: "자료구조", completedAt: new Date(now - 1_000) }),
  ];
  const memory = getCompanionMemory(history, "hike");

  assert.equal(memory.completedTogether, 1);
  assert.equal(memory.lastFocusIntent, "운영체제");
  assert.match(memory.message, /운영체제/);
});

test("behavior recommendations wait for three completed sessions", () => {
  const history = [
    createFocusRecord({ durationMinutes: 25, adventureId: "hike", focusIntent: "운영체제", startedAt: "2026-11-13T09:00:00+09:00", completedAt: new Date("2026-11-13T09:25:00+09:00") }),
    createFocusRecord({ durationMinutes: 25, adventureId: "fish", startedAt: "2026-11-12T09:00:00+09:00", completedAt: new Date("2026-11-12T09:25:00+09:00") }),
    createFocusRecord({ durationMinutes: 40, adventureId: "swim", focusIntent: "자료구조", startedAt: "2026-11-11T11:00:00+09:00", completedAt: new Date("2026-11-11T11:40:00+09:00") }),
  ];

  assert.equal(getBehaviorInsights(history.slice(0, 2)).favoriteMinutes, null);
  assert.deepEqual(getBehaviorInsights(history), {
    sampleSize: 3,
    averageMinutes: 30,
    favoriteMinutes: 25,
    favoriteHour: 9,
    namedRate: 67,
    recommendation: "최근 3회 기록에서는 25분 집중이 가장 자주 완주됐어요.",
  });
});

test("start-time insight does not pretend legacy completion times are start times", () => {
  const legacy = Array.from({ length: 4 }, (_, index) =>
    createFocusRecord({
      durationMinutes: 25,
      adventureId: "hike",
      completedAt: new Date(now - index * 60_000),
    }),
  );

  assert.equal(getBehaviorInsights(legacy).favoriteHour, null);
});

test("companion growth is scoped by world and deduplicated by session", () => {
  const history = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `mori-${index}`,
      completedAt: `2026-11-24T1${index}:00:00.000Z`,
      durationMinutes: 120,
      adventureId: "hike",
    })),
    { id: "naru-1", completedAt: "2026-11-24T11:00:00.000Z", durationMinutes: 120, adventureId: "swim" },
  ];
  const entries = growthEntriesFromHistory(history);
  const merged = mergeCompanionGrowthEntries(entries, entries);

  assert.equal(merged.length, 6);
  assert.equal(getCompanionGrowth(merged, "hike").stage, 2);
  assert.equal(getCompanionGrowth(merged, "swim").stage, 1);
});

test("corrupt local growth data is discarded safely", () => {
  assert.deepEqual(parseStoredCompanionGrowth("{broken"), []);
  assert.deepEqual(parseStoredCompanionGrowth(JSON.stringify([{ sessionId: "x" }])), []);
});
