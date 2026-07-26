import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeCloudStates,
  parseCloudStateData,
} from "../lib/cloud-state.ts";

const preferences = {
  focusMinutes: 35,
  breakMinutes: 7,
  bgm: "forest",
  selectedId: "hike",
  soundOn: true,
};
const emptySessionUpdatedAt = "1970-01-01T00:00:00.000Z";

function state(
  history = [],
  overrides = {},
  activeSession = null,
  sessionUpdatedAt = emptySessionUpdatedAt,
) {
  return {
    schemaVersion: 2,
    preferences: { ...preferences, ...overrides },
    history,
    activeSession,
    sessionUpdatedAt,
  };
}

test("valid cloud data is accepted and unsafe preferences are rejected", () => {
  assert.deepEqual(parseCloudStateData(state()), state());
  assert.equal(
    parseCloudStateData(state([], { focusMinutes: 0 })),
    null,
  );
  assert.equal(
    parseCloudStateData(state([], { selectedId: "unknown" })),
    null,
  );
});

test("version 1 cloud data migrates to the current empty-session shape", () => {
  const legacy = {
    schemaVersion: 1,
    preferences,
    history: [],
  };
  const parsed = parseCloudStateData(legacy);

  assert.ok(parsed);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.activeSession, null);
  assert.equal(parsed.sessionUpdatedAt, emptySessionUpdatedAt);
});

test("cloud merge deduplicates sessions and keeps the newest records first", () => {
  const older = {
    id: "older",
    completedAt: "2026-07-20T12:00:00.000Z",
    durationMinutes: 25,
    adventureId: "hike",
  };
  const newer = {
    id: "newer",
    completedAt: "2026-07-21T12:00:00.000Z",
    durationMinutes: 40,
    adventureId: "swim",
  };
  const cloud = state([older], { focusMinutes: 50, selectedId: "fish" });
  const local = state([newer, older], { focusMinutes: 15 });
  const merged = mergeCloudStates(local, cloud);

  assert.deepEqual(
    merged.history.map((record) => record.id),
    ["newer", "older"],
  );
  assert.equal(merged.preferences.focusMinutes, 50);
  assert.equal(merged.preferences.selectedId, "fish");
});

test("the most recently changed active-session state wins across devices", () => {
  const session = {
    version: 1,
    mode: "focus",
    durationMinutes: 25,
    remainingSeconds: 900,
    endAt: null,
    paused: true,
    startedAt: "2026-07-26T04:00:00.000Z",
    adventureId: "fish",
    bgm: "lake",
  };
  const cloudActive = state(
    [],
    {},
    session,
    "2026-07-26T04:01:00.000Z",
  );
  const localClearedLater = state(
    [],
    {},
    null,
    "2026-07-26T04:02:00.000Z",
  );
  const localActiveLater = state(
    [],
    {},
    session,
    "2026-07-26T04:03:00.000Z",
  );

  assert.equal(
    mergeCloudStates(localClearedLater, cloudActive).activeSession,
    null,
  );
  assert.deepEqual(
    mergeCloudStates(localActiveLater, localClearedLater).activeSession,
    session,
  );
});

test("corrupt history prevents the full cloud payload from being accepted", () => {
  const invalid = state([
    {
      id: "broken",
      completedAt: "not-a-date",
      durationMinutes: 25,
      adventureId: "hike",
    },
  ]);

  assert.equal(parseCloudStateData(invalid), null);
});
