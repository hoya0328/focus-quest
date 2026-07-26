import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  normalizeQuestDraft,
  normalizeSubjectDraft,
  questProgress,
} from "../lib/study-quests.ts";
import {
  createActiveSession,
  createFocusRecord,
  parseActiveSession,
  parseHistory,
} from "../lib/pomodoro.ts";

test("quest inputs are trimmed and constrained to supported ranges", () => {
  const quest = normalizeQuestDraft({
    subjectId: "subject-1",
    title: "  운영체제 3장 정리  ",
    objective: " 핵심 개념 노트 ",
    adventureId: "hike",
    focusMinutes: 500,
    breakMinutes: 0,
    targetSets: 20,
  });
  const subject = normalizeSubjectDraft({
    name: "  운영체제 ",
    goal: " A 받기 ",
    targetDate: "2026-08-10",
    weeklyMinutes: -10,
  });

  assert.equal(quest.title, "운영체제 3장 정리");
  assert.equal(quest.focusMinutes, 120);
  assert.equal(quest.breakMinutes, 1);
  assert.equal(quest.targetSets, 12);
  assert.equal(subject.name, "운영체제");
  assert.equal(subject.weeklyMinutes, 0);
});

test("quest progress never exceeds one", () => {
  assert.equal(
    questProgress({
      id: "q",
      userId: "u",
      subjectId: "s",
      title: "test",
      objective: "",
      status: "completed",
      adventureId: "swim",
      focusMinutes: 25,
      breakMinutes: 5,
      targetSets: 4,
      completedSets: 4,
      createdAt: "",
      updatedAt: "",
      completedAt: "",
    }),
    1,
  );
});

test("quest id survives session reload and focus history parsing", () => {
  const session = createActiveSession({
    mode: "focus",
    durationMinutes: 25,
    adventureId: "fish",
    bgm: "lake",
    questId: "quest-123",
    now: 1_000,
  });
  const record = createFocusRecord({
    durationMinutes: 25,
    adventureId: "fish",
    questId: "quest-123",
    completedAt: new Date(2_000),
  });

  assert.equal(parseActiveSession(JSON.stringify(session), 2_000)?.session.questId, "quest-123");
  assert.equal(parseHistory(JSON.stringify([record]))[0].questId, "quest-123");
});

test("database migration isolates users and deduplicates completed sessions", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/202607260002_study_quests.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /enable row level security/g);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /on conflict \(session_id\) do nothing/i);
  assert.match(sql, /complete_study_quest_set/);
  assert.match(sql, /references public\.study_subjects\(id, user_id\)/);
});
