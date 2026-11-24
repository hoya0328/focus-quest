import {
  getWeeklySummary,
  type AdventureId,
  type FocusRecord,
} from "./pomodoro.ts";
import type { StudyLearningSignal } from "./study-progress.ts";

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

export type QuestLearningState = "planned" | "active" | "review" | "mastered";

export type ExamExpedition = {
  completedSets: number;
  totalSets: number;
  remainingSets: number;
  remainingMinutes: number;
  dailyMinutes: number;
  daysAvailable: number | null;
  risk: "complete" | "steady" | "focused" | "tight" | "overdue";
  label: string;
  message: string;
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

const emptySignal: StudyLearningSignal = {
  correct: 0,
  incorrect: 0,
  skipped: 0,
  latestStage: null,
  latestAt: null,
};

export function getQuestLearningState(
  quest: StudyQuest,
  signal: StudyLearningSignal = emptySignal,
): QuestLearningState {
  if (signal.incorrect > 0 || signal.skipped > 0) return "review";
  if (quest.status === "completed") return "mastered";
  if (quest.status === "in_progress") return "active";
  return "planned";
}

export function getRecommendedQuest(
  quests: StudyQuest[],
  getSignal: (questId: string) => StudyLearningSignal = () => emptySignal,
) {
  const priority: Record<QuestLearningState, number> = {
    review: 0,
    active: 1,
    planned: 2,
    mastered: 3,
  };
  return [...quests]
    .filter((quest) => getQuestLearningState(quest, getSignal(quest.id)) !== "mastered")
    .sort((left, right) => {
      const stateGap =
        priority[getQuestLearningState(left, getSignal(left.id))] -
        priority[getQuestLearningState(right, getSignal(right.id))];
      if (stateGap !== 0) return stateGap;
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    })[0] ?? null;
}

export function getExamExpedition({
  subject,
  quests,
  now = new Date(),
}: {
  subject: StudySubject;
  quests: StudyQuest[];
  now?: Date;
}): ExamExpedition {
  const subjectQuests = quests.filter((quest) => quest.subjectId === subject.id);
  const totalSets = subjectQuests.reduce((sum, quest) => sum + quest.targetSets, 0);
  const completedSets = subjectQuests.reduce(
    (sum, quest) => sum + Math.min(quest.completedSets, quest.targetSets),
    0,
  );
  const remainingSets = Math.max(0, totalSets - completedSets);
  const remainingMinutes = subjectQuests.reduce(
    (sum, quest) =>
      sum +
      Math.max(0, quest.targetSets - quest.completedSets) * quest.focusMinutes,
    0,
  );

  if (remainingSets === 0 && totalSets > 0) {
    return {
      completedSets,
      totalSets,
      remainingSets,
      remainingMinutes,
      dailyMinutes: 0,
      daysAvailable: 0,
      risk: "complete",
      label: "원정 완료",
      message: "계획한 공부 구간을 모두 지나왔어요. 복습이 필요한 퀘스트만 확인해 보세요.",
    };
  }

  let daysAvailable: number | null = null;
  let overdue = false;
  if (subject.targetDate) {
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    const target = new Date(`${subject.targetDate}T12:00:00`);
    if (!Number.isNaN(target.getTime())) {
      const dayGap = Math.round((target.getTime() - today.getTime()) / 86_400_000);
      overdue = dayGap < 0;
      daysAvailable = Math.max(1, dayGap + 1);
    }
  }
  const paceDays = daysAvailable ?? 7;
  const dailyMinutes = remainingMinutes > 0
    ? Math.ceil(remainingMinutes / Math.max(1, paceDays))
    : 0;
  const risk = overdue
    ? "overdue"
    : dailyMinutes > 120
      ? "tight"
      : dailyMinutes > 60
        ? "focused"
        : "steady";
  const label =
    risk === "overdue"
      ? "경로 다시 짜기"
      : risk === "tight"
        ? "일정이 촘촘해요"
        : risk === "focused"
          ? "집중 구간이에요"
          : "좋은 속도예요";
  const message = overdue
    ? `${remainingSets}세트가 남았어요. 목표일을 조정하거나 퀘스트를 줄여 새 경로를 잡아보세요.`
    : `${remainingSets}세트 · 약 ${remainingMinutes}분 남았어요. 하루 ${dailyMinutes}분이면 목표일에 맞출 수 있어요.`;

  return {
    completedSets,
    totalSets,
    remainingSets,
    remainingMinutes,
    dailyMinutes,
    daysAvailable,
    risk,
    label,
    message,
  };
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
