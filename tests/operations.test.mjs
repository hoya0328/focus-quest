import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsReport, validateBackupManifest } from "../lib/operations.ts";

test("operations report aggregates unique users without retaining content", () => {
  const events = [
    { event_name: "app_opened", user_id: "a", created_at: "2026-11-25T00:00:00Z" },
    { event_name: "focus_started", user_id: "a", created_at: "2026-11-25T00:01:00Z" },
    { event_name: "focus_started", user_id: "b", created_at: "2026-11-25T00:01:00Z" },
    { event_name: "focus_completed", user_id: "a", created_at: "2026-11-25T00:26:00Z" },
  ];
  const report = buildOperationsReport(events);
  assert.equal(report.uniqueUsers, 2);
  assert.equal(report.users.focus_started, 2);
  assert.equal(report.completionRate, 50);
  assert.equal("userIds" in report, false);
});

test("backup manifest requires bounded project and checksum metadata", () => {
  assert.equal(validateBackupManifest({
    version: 1,
    createdAt: "2026-11-25T00:00:00Z",
    projectRef: "uaqmmsuhnwupckakagmi",
    files: [{ path: "tables/study_quests.json", sha256: "a".repeat(64), records: 0 }],
  }), true);
  assert.equal(validateBackupManifest({ version: 1, files: [] }), false);
});
