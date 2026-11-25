import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsReport, validateBackupManifest } from "../lib/operations.ts";
import { readAllRows, backupTables } from "../scripts/operations-data.mjs";
import { isDormantReturn, telemetryStorageKeys } from "../lib/telemetry-session.ts";

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
  assert.equal(validateBackupManifest({
    version: 1, createdAt: new Date().toISOString(), projectRef: "local-supabase",
    files: [{ path: "tables/study_subjects.json", sha256: "a".repeat(64), records: 1 }],
  }), true);
});

test("operations pagination reads beyond the API page cap without accepting partial errors", async () => {
  const data = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const rows = await readAllRows(() => ({ range: async (from, to) => ({ data: data.slice(from, to + 1), error: null }) }));
  assert.equal(rows.length, 1201);
  await assert.rejects(readAllRows(() => ({ range: async () => ({ error: { code: "42501" }, data: null }) })), /42501/);
  await assert.rejects(readAllRows(() => ({ range: async () => ({ data, error: null }) }), { maxRows: 5 }), /safety limit/);
  assert.deepEqual(backupTables.study_quest_focus_sessions, ["session_id"]);
});

test("first visits and account switches are not dormant returns", () => {
  const now = Date.parse("2026-11-25T00:00:00Z");
  for (const previous of [null, "", "0", "NaN", String(now + 1)]) {
    assert.equal(isDormantReturn(previous, now), false);
  }
  assert.equal(isDormantReturn(String(now - 7 * 86400_000), now), true);
  assert.notDeepEqual(telemetryStorageKeys("a"), telemetryStorageKeys("b"));
});

test("backup manifests reject duplicate, absolute and nested paths", () => {
  const file = { path: "tables/study_quests.json", sha256: "a".repeat(64), records: 1 };
  const manifest = { version: 1, createdAt: new Date().toISOString(), projectRef: "uaqmmsuhnwupckakagmi", files: [file] };
  assert.equal(validateBackupManifest({ ...manifest, files: [] }), false);
  assert.equal(validateBackupManifest({ ...manifest, files: [file, file] }), false);
  for (const path of ["/tables/file.json", "tables/../file.json", "tables/nested/file.json"]) {
    assert.equal(validateBackupManifest({ ...manifest, files: [{ ...file, path }] }), false);
  }
});
