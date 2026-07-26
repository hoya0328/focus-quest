import type { AdventureId } from "@/lib/pomodoro";

export type QuestStatus = "planned" | "in_progress" | "completed";

export type StudySubject = {
  id: string;
  userId: string;
  name: string;
  goal: string;
  targetDate: string | null;
  weeklyMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type StudyQuest = {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  objective: string;
  status: QuestStatus;
  adventureId: AdventureId;
  focusMinutes: number;
  breakMinutes: number;
  targetSets: number;
  completedSets: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SubjectDraft = {
  name: string;
  goal: string;
  targetDate: string;
  weeklyMinutes: number;
};

export type QuestDraft = {
  subjectId: string;
  title: string;
  objective: string;
  adventureId: AdventureId;
  focusMinutes: number;
  breakMinutes: number;
  targetSets: number;
};

export type SubjectRow = {
  id: string;
  user_id: string;
  name: string;
  goal: string;
  target_date: string | null;
  weekly_minutes: number;
  created_at: string;
  updated_at: string;
};

export type QuestRow = {
  id: string;
  user_id: string;
  subject_id: string;
  title: string;
  objective: string;
  status: QuestStatus;
  adventure_id: AdventureId;
  focus_minutes: number;
  break_minutes: number;
  target_sets: number;
  completed_sets: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function subjectFromRow(row: SubjectRow): StudySubject {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    goal: row.goal,
    targetDate: row.target_date,
    weeklyMinutes: row.weekly_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function questFromRow(row: QuestRow): StudyQuest {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    title: row.title,
    objective: row.objective,
    status: row.status,
    adventureId: row.adventure_id,
    focusMinutes: row.focus_minutes,
    breakMinutes: row.break_minutes,
    targetSets: row.target_sets,
    completedSets: row.completed_sets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function questProgress(quest: StudyQuest) {
  return Math.min(1, quest.completedSets / Math.max(1, quest.targetSets));
}

export function normalizeQuestDraft(draft: QuestDraft): QuestDraft {
  return {
    ...draft,
    title: draft.title.trim().slice(0, 100),
    objective: draft.objective.trim().slice(0, 500),
    focusMinutes: Math.min(120, Math.max(1, Math.round(draft.focusMinutes))),
    breakMinutes: Math.min(30, Math.max(1, Math.round(draft.breakMinutes))),
    targetSets: Math.min(12, Math.max(1, Math.round(draft.targetSets))),
  };
}

export function normalizeSubjectDraft(draft: SubjectDraft): SubjectDraft {
  return {
    ...draft,
    name: draft.name.trim().slice(0, 60),
    goal: draft.goal.trim().slice(0, 300),
    weeklyMinutes: Math.min(
      10080,
      Math.max(0, Math.round(draft.weeklyMinutes)),
    ),
  };
}
