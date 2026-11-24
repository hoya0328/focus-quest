import assert from "node:assert/strict";
import test from "node:test";
import { getAdventureArchive, getNextMasteryTarget } from "../lib/adventure-archive.ts";

function records(count, adventureId = "hike") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${adventureId}-${index}`,
    completedAt: new Date(2026, 0, 1, 12, index % 60).toISOString(),
    durationMinutes: 25,
    adventureId,
  }));
}

test("archive begins after the five-stage world and keeps ranking every 50 sessions", () => {
  const archive = getAdventureArchive(records(176), "hike");
  assert.equal(archive.masteryRank, 2);
  assert.equal(archive.unlockedRelics, 2);
  assert.equal(archive.nextRelic?.requiredCompletions, 250);
  assert.equal(getNextMasteryTarget(176), 200);
});

test("archive ignores short recovery sessions and other worlds", () => {
  const history = [
    ...records(124, "swim"),
    { ...records(1, "swim")[0], id: "short", durationMinutes: 5 },
    ...records(20, "fish"),
  ];
  const archive = getAdventureArchive(history, "swim");
  assert.equal(archive.completed, 124);
  assert.equal(archive.unlockedRelics, 0);
});
