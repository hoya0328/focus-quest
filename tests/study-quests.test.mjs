import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getExamExpedition,
  getQuestLearningState,
  getRecommendedQuest,
  getSubjectProgress,
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
import { summarizeStudyAttempts } from "../lib/study-progress.ts";

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

test("subject goals use linked quest history for weekly progress and deadline", () => {
  const subject = {
    id: "subject-1",
    userId: "user-1",
    name: "운영체제",
    goal: "기말고사 준비",
    targetDate: "2026-11-20",
    weeklyMinutes: 100,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const quest = {
    id: "quest-1",
    userId: "user-1",
    subjectId: subject.id,
    title: "프로세스 복습",
    objective: "",
    status: "in_progress",
    adventureId: "hike",
    focusMinutes: 25,
    breakMinutes: 5,
    targetSets: 4,
    completedSets: 2,
    materialId: null,
    sourcePages: "",
    studyMethod: "",
    estimatedMinutesMin: null,
    estimatedMinutesMax: null,
    questContract: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
  };
  const history = [
    createFocusRecord({ durationMinutes: 25, adventureId: "hike", questId: quest.id, completedAt: new Date("2026-11-10T10:25:00+09:00") }),
    createFocusRecord({ durationMinutes: 25, adventureId: "hike", questId: quest.id, completedAt: new Date("2026-11-12T10:25:00+09:00") }),
    createFocusRecord({ durationMinutes: 40, adventureId: "fish", questId: "other", completedAt: new Date("2026-11-12T12:00:00+09:00") }),
  ];

  assert.deepEqual(
    getSubjectProgress({ subject, quests: [quest], history, now: new Date("2026-11-13T12:00:00+09:00") }),
    {
      weeklyMinutes: 50,
      weeklyTarget: 100,
      weeklyPercent: 50,
      weeklyRemaining: 50,
      deadlineLabel: "목표일까지 7일 남았어요",
      deadlineState: "upcoming",
    },
  );
});

test("learning route prioritizes a review before new progress", () => {
  const base = {
    userId: "user-1",
    subjectId: "subject-1",
    objective: "",
    adventureId: "hike",
    focusMinutes: 25,
    breakMinutes: 5,
    targetSets: 4,
    completedSets: 1,
    materialId: null,
    sourcePages: "",
    studyMethod: "",
    estimatedMinutesMin: null,
    estimatedMinutesMax: null,
    questContract: null,
    updatedAt: "2026-11-24T00:00:00.000Z",
    completedAt: null,
  };
  const review = { ...base, id: "review", title: "오답 복습", status: "in_progress", createdAt: "2026-11-22T00:00:00.000Z" };
  const planned = { ...base, id: "planned", title: "새 범위", status: "planned", createdAt: "2026-11-21T00:00:00.000Z" };
  const signal = (id) => id === "review"
    ? { correct: 0, incorrect: 1, skipped: 0, latestStage: "checkpoint", latestAt: "2026-11-24T00:00:00.000Z" }
    : { correct: 0, incorrect: 0, skipped: 0, latestStage: null, latestAt: null };

  assert.equal(getQuestLearningState(review, signal("review")), "review");
  assert.equal(getRecommendedQuest([planned, review], signal).id, "review");
});

test("exam expedition calculates the daily pace from remaining sets", () => {
  const subject = {
    id: "subject-1",
    userId: "user-1",
    name: "데이터베이스",
    goal: "기말고사",
    targetDate: "2026-11-27",
    weeklyMinutes: 300,
    createdAt: "",
    updatedAt: "",
  };
  const quest = {
    id: "quest-1",
    userId: "user-1",
    subjectId: subject.id,
    title: "SQL 복습",
    objective: "",
    status: "in_progress",
    adventureId: "fish",
    focusMinutes: 30,
    breakMinutes: 5,
    targetSets: 6,
    completedSets: 2,
    materialId: null,
    sourcePages: "",
    studyMethod: "",
    estimatedMinutesMin: null,
    estimatedMinutesMax: null,
    questContract: null,
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  };
  const expedition = getExamExpedition({
    subject,
    quests: [quest],
    now: new Date("2026-11-24T12:00:00+09:00"),
  });

  assert.equal(expedition.remainingSets, 4);
  assert.equal(expedition.remainingMinutes, 120);
  assert.equal(expedition.daysAvailable, 4);
  assert.equal(expedition.dailyMinutes, 30);
  assert.equal(expedition.risk, "steady");
});

test("a later correct answer clears the same quiz from review signals", () => {
  const summary = summarizeStudyAttempts([
    {
      quest_id: "quest-1",
      quiz_key: "sql-index",
      is_correct: false,
      skipped: false,
      stage: "checkpoint",
      created_at: "2026-11-24T10:00:00.000Z",
    },
    {
      quest_id: "quest-1",
      quiz_key: "sql-index",
      is_correct: true,
      skipped: false,
      stage: "review",
      created_at: "2026-11-24T10:10:00.000Z",
    },
  ]);

  assert.deepEqual(summary.attemptKeysByQuest["quest-1"], ["sql-index"]);
  assert.equal(summary.learningSignalsByQuest["quest-1"].correct, 1);
  assert.equal(summary.learningSignalsByQuest["quest-1"].incorrect, 0);
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
