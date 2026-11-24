import test from "node:test";
import assert from "node:assert/strict";
import { nextReminderAt } from "../lib/push-reminders.ts";

test("a future reminder stays on the current local day", () => {
  const now = new Date(2026, 10, 25, 18, 30, 0);
  const next = new Date(nextReminderAt("20:00", now));
  assert.equal(next.getDate(), 25);
  assert.equal(next.getHours(), 20);
  assert.equal(next.getMinutes(), 0);
});

test("a passed reminder rolls to the next local day", () => {
  const now = new Date(2026, 10, 25, 21, 0, 0);
  const next = new Date(nextReminderAt("20:00", now));
  assert.equal(next.getDate(), 26);
  assert.equal(next.getHours(), 20);
  assert.equal(next.getMinutes(), 0);
  assert.equal(nextReminderAt("25:99", now), null);
});
