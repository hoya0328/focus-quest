import assert from "node:assert/strict";
import test from "node:test";
import { getSeasonalWorldEvent } from "../lib/seasonal-events.ts";

test("each world has a distinct winter event", () => {
  const date = new Date(2026, 11, 10);
  const events = ["hike", "swim", "fish"].map((id) => getSeasonalWorldEvent(id, date));
  assert.deepEqual(events.map((event) => event.name), ["첫눈 봉우리", "심해의 별", "얼음꽃 물결"]);
  assert.equal(new Set(events.map((event) => event.id)).size, 3);
});
