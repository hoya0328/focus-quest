import {
  getWeeklySummary,
  type AdventureId,
  type FocusRecord,
} from "./pomodoro.ts";

export type QuestContract = {
  safe: string;
  base: string;
  stretch: string;
};

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
  materialId: string | null;
  sourcePages: string;
  studyMethod: string;
  estimatedMinutesMin: number | null;
  estimatedMinutesMax: number | null;
  questContract: QuestContract | null;
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

export type SubjectProgress = {
  weeklyMinutes: number;
  weeklyTarget: number;
  weeklyPercent: number;
  weeklyRemaining: number;
  deadlineLabel: string;
  deadlineState: "none" | "upcoming" | "today" | "overdue";
};

export type QuestDraft = {
  subjectId: string;
  title: string;
  objective: string;
  adventureId: AdventureId;
  focusMinutes: number;
  breakMinutes: number;
  targetSets: number;
  materialId?: string | null;
  sourcePages?: string;
  studyMethod?: string;
  estimatedMinutesMin?: number | null;
  estimatedMinutesMax?: number | null;
  questContract?: QuestContract | null;
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
  material_id: string | null;
  source_pages: string;
  study_method: string;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
  quest_contract: unknown;
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
  const contract =
    row.quest_contract &&
    typeof row.quest_contract === "object" &&
    typeof (row.quest_contract as QuestContract).safe === "string" &&
    typeof (row.quest_contract as QuestContract).base === "string" &&
    typeof (row.quest_contract as QuestContract).stretch === "string"
      ? (row.quest_contract as QuestContract)
      : null;
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
    materialId: row.material_id,
    sourcePages: row.source_pages,
    studyMethod: row.study_method,
    estimatedMinutesMin: row.estimated_minutes_min,
    estimatedMinutesMax: row.estimated_minutes_max,
    questContract: contract,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function questProgress(quest: StudyQuest) {
  return Math.min(1, quest.completedSets / Math.max(1, quest.targetSets));
}

export function getSubjectProgress({
  subject,
  quests,
  history,
  now = new Date(),
}: {
  subject: StudySubject;
  quests: StudyQuest[];
  history: FocusRecord[];
  now?: Date;
}): SubjectProgress {
  const questIds = new Set(
    quests
      .filter((quest) => quest.subjectId === subject.id)
      .map((quest) => quest.id),
  );
  const weeklyMinutes = getWeeklySummary(
    history.filter((record) => record.questId && questIds.has(record.questId)),
    now,
  ).minutes;
  const weeklyTarget = Math.max(0, subject.weeklyMinutes);
  const weeklyPercent = weeklyTarget > 0
    ? Math.min(100, Math.round((weeklyMinutes / weeklyTarget) * 100))
    : 0;
  const weeklyRemaining = Math.max(0, weeklyTarget - weeklyMinutes);

  if (!subject.targetDate) {
    return {
      weeklyMinutes,
      weeklyTarget,
      weeklyPercent,
      weeklyRemaining,
      deadlineLabel: "목표일을 정하지 않았어요",
      deadlineState: "none",
    };
  }

  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const target = new Date(`${subject.targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) {
    return {
      weeklyMinutes,
      weeklyTarget,
      weeklyPercent,
      weeklyRemaining,
      deadlineLabel: "목표일을 다시 확인해 주세요",
      deadlineState: "none",
    };
  }
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const deadlineState = days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
  const deadlineLabel =
    days < 0
      ? `목표일이 ${Math.abs(days)}일 지났어요`
      : days === 0
        ? "오늘이 목표일이에요"
        : `목표일까지 ${days}일 남았어요`;

  return {
    weeklyMinutes,
    weeklyTarget,
    weeklyPercent,
    weeklyRemaining,
    deadlineLabel,
    deadlineState,
  };
}

export function normalizeQuestDraft(draft: QuestDraft): QuestDraft {
  return {
    ...draft,
    title: draft.title.trim().slice(0, 100),
    objective: draft.objective.trim().slice(0, 500),
    focusMinutes: Math.min(120, Math.max(1, Math.round(draft.focusMinutes))),
    breakMinutes: Math.min(30, Math.max(1, Math.round(draft.breakMinutes))),
    targetSets: Math.min(12, Math.max(1, Math.round(draft.targetSets))),
    materialId: draft.materialId ?? null,
    sourcePages: (draft.sourcePages ?? "").trim().slice(0, 120),
    studyMethod: (draft.studyMethod ?? "").trim().slice(0, 500),
    estimatedMinutesMin:
      draft.estimatedMinutesMin == null
        ? null
        : Math.min(720, Math.max(5, Math.round(draft.estimatedMinutesMin))),
    estimatedMinutesMax:
      draft.estimatedMinutesMax == null
        ? null
        : Math.min(
            720,
            Math.max(
              draft.estimatedMinutesMin ?? 5,
              Math.round(draft.estimatedMinutesMax),
            ),
          ),
    questContract: draft.questContract ?? null,
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
