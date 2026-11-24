export type StudyQuizStage = "checkpoint" | "review";

export type StudyQuestProgressRow = {
  quest_id: string;
  user_id: string;
  material_id: string | null;
  last_reached_page: number;
  updated_at: string;
};

export type StudyQuizAttemptRow = {
  quest_id: string;
  quiz_key: string;
  is_correct: boolean | null;
  skipped: boolean;
  stage: StudyQuizStage;
  created_at: string;
};

export type StudyLearningSignal = {
  correct: number;
  incorrect: number;
  skipped: number;
  latestStage: StudyQuizStage | null;
  latestAt: string | null;
};

export type StudyAttemptSummary = {
  attemptKeysByQuest: Record<string, string[]>;
  learningSignalsByQuest: Record<string, StudyLearningSignal>;
};

export function summarizeStudyAttempts(
  rows: StudyQuizAttemptRow[],
): StudyAttemptSummary {
  const attemptKeysByQuest: Record<string, string[]> = {};
  const learningSignalsByQuest: Record<string, StudyLearningSignal> = {};
  const newestFirst = [...rows].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );

  for (const row of newestFirst) {
    attemptKeysByQuest[row.quest_id] ??= [];
    const isLatestForQuiz = !attemptKeysByQuest[row.quest_id].includes(
      row.quiz_key,
    );
    if (isLatestForQuiz) attemptKeysByQuest[row.quest_id].push(row.quiz_key);

    const signal = learningSignalsByQuest[row.quest_id] ?? {
      correct: 0,
      incorrect: 0,
      skipped: 0,
      latestStage: null,
      latestAt: null,
    };
    if (!signal.latestAt) {
      signal.latestAt = row.created_at;
      signal.latestStage = row.stage;
    }
    if (isLatestForQuiz) {
      if (row.skipped) signal.skipped += 1;
      else if (row.is_correct === true) signal.correct += 1;
      else if (row.is_correct === false) signal.incorrect += 1;
    }
    learningSignalsByQuest[row.quest_id] = signal;
  }

  return { attemptKeysByQuest, learningSignalsByQuest };
}

export type StudyQuizAttemptDraft = {
  questId: string;
  materialId: string;
  sessionKey: string;
  stage: StudyQuizStage;
  quizKey: string;
  rangeStart: number;
  rangeEnd: number;
  reachedPage: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  skipped: boolean;
};

export function clampStudyPage(value: number) {
  return Math.min(120, Math.max(1, Math.round(Number(value) || 1)));
}

export function studyProgressStorageKey(questId: string) {
  return `focus-quest-reached-page:${questId}`;
}
