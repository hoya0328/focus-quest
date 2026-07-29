import test from "node:test";
import assert from "node:assert/strict";

import {
  addFocusRecord,
  createActiveSession,
  createFocusRecord,
  getDailyCount,
  getWeeklySummary,
  normalizeFocusIntent,
  parseActiveSession,
  parseHistory,
  pauseActiveSession,
  remainingForSession,
  resumeActiveSession,
} from "../lib/pomodoro.ts";

test("a running focus session survives reload with the correct remaining time", () => {
  const startedAt = Date.parse("2026-07-20T09:00:00.000Z");
  const session = createActiveSession({
    mode: "focus",
    durationMinutes: 25,
    adventureId: "hike",
    bgm: "forest",
    focusIntent: "  운영체제   3장 복습  ",
    now: startedAt,
  });

  const restored = parseActiveSession(
    JSON.stringify(session),
    startedAt + 4 * 60 * 1000,
  );

  assert.ok(restored);
  assert.equal(restored.expired, false);
  assert.equal(restored.remainingSeconds, 21 * 60);
  assert.equal(restored.session.mode, "focus");
  assert.equal(restored.session.focusIntent, "운영체제 3장 복습");
});

test("pause and resume preserve the remaining duration", () => {
  const session = createActiveSession({
    mode: "break",
    durationMinutes: 5,
    adventureId: "swim",
    bgm: "quiet",
    now: 1_000,
  });
  const paused = pauseActiveSession(session, 183);
  const resumed = resumeActiveSession(paused, 10_000);

  assert.equal(paused.endAt, null);
  assert.equal(paused.paused, true);
  assert.equal(remainingForSession(paused, 9_000), 183);
  assert.equal(resumed.paused, false);
  assert.equal(resumed.endAt, 193_000);
});

test("an expired session is detected without mutating focus history", () => {
  const session = createActiveSession({
    mode: "break",
    durationMinutes: 1,
    adventureId: "fish",
    bgm: "quiet",
    now: 1_000,
  });
  const history = [];
  const restored = parseActiveSession(JSON.stringify(session), 61_001);

  assert.ok(restored);
  assert.equal(restored.expired, true);
  assert.equal(restored.session.mode, "break");
  assert.deepEqual(history, []);
});

test("focus records are deduplicated and summarized by week", () => {
  const first = {
    ...createFocusRecord({
      durationMinutes: 25,
      adventureId: "hike",
      focusIntent: "운영체제 3장 복습",
      completedAt: new Date("2026-07-20T12:00:00.000Z"),
    }),
    id: "focus-1",
  };
  const second = {
    ...createFocusRecord({
      durationMinutes: 40,
      adventureId: "swim",
      completedAt: new Date("2026-07-22T12:00:00.000Z"),
    }),
    id: "focus-2",
  };
  const history = addFocusRecord(
    addFocusRecord(addFocusRecord([], first), first),
    second,
  );
  const summary = getWeeklySummary(
    history,
    new Date("2026-07-23T12:00:00.000Z"),
  );

  assert.equal(history.length, 2);
  assert.equal(parseHistory(JSON.stringify(history))[0].focusIntent, undefined);
  assert.equal(
    parseHistory(JSON.stringify(history))[1].focusIntent,
    "운영체제 3장 복습",
  );
  assert.equal(summary.minutes, 65);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.activeDays, 2);
  assert.equal(
    getDailyCount(history, new Date("2026-07-20T12:30:00.000Z")),
    1,
  );
});

test("focus intent is normalized and bounded for safe persistence", () => {
  assert.equal(normalizeFocusIntent("  자료구조   복습  "), "자료구조 복습");
  assert.equal(normalizeFocusIntent("가".repeat(100)).length, 80);
  assert.deepEqual(
    parseHistory(
      JSON.stringify([
        {
          id: "bad-intent",
          completedAt: "2026-07-20T12:00:00.000Z",
          durationMinutes: 10,
          adventureId: "hike",
          focusIntent: "  정리되지 않은 목표  ",
        },
      ]),
    ),
    [],
  );
});

test("corrupt persisted data is ignored", () => {
  assert.equal(parseActiveSession("{broken"), null);
  assert.deepEqual(parseHistory('{"not":"an array"}'), []);
  assert.deepEqual(
    parseHistory('[{"id":"x","durationMinutes":0,"adventureId":"hike"}]'),
    [],
  );
});
