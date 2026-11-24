import type { QuizFeedbackValue } from "./quiz-feedback.ts";

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

export type StudyQuizFeedbackRow = {
  quest_id: string;
  quiz_key: string;
  feedback_value: QuizFeedbackValue;
  created_at: string;
};

export type StudyQuizQualitySignal = {
  helpful: number;
  unclear: number;
  outOfScope: number;
  rejectedQuizKeys: string[];
  latestAt: string | null;
};

export type AdaptiveReviewPlan = {
  kind: "review_now" | "review_soon" | "replace_question" | "continue";
  durationMinutes: number | null;
  label: string;
  reason: string;
};

export type StudyAttemptSummary = {
  attemptKeysByQuest: Record<string, string[]>;
  learningSignalsByQuest: Record<string, StudyLearningSignal>;
};

export const EMPTY_STUDY_QUALITY_SIGNAL: StudyQuizQualitySignal = {
  helpful: 0,
  unclear: 0,
  outOfScope: 0,
  rejectedQuizKeys: [],
  latestAt: null,
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

export function summarizeStudyQuizFeedback(
  rows: StudyQuizFeedbackRow[],
): Record<string, StudyQuizQualitySignal> {
  const byQuest: Record<string, StudyQuizQualitySignal> = {};
  const seenQuizKeys = new Set<string>();
  const newestFirst = [...rows].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );

  for (const row of newestFirst) {
    if (
      !row.quest_id ||
      !row.quiz_key ||
      !["helpful", "unclear", "out_of_scope"].includes(row.feedback_value)
    ) {
      continue;
    }
    const uniqueKey = `${row.quest_id}:${row.quiz_key}`;
    if (seenQuizKeys.has(uniqueKey)) continue;
    seenQuizKeys.add(uniqueKey);

    const signal = byQuest[row.quest_id] ?? {
      ...EMPTY_STUDY_QUALITY_SIGNAL,
      rejectedQuizKeys: [],
    };
    signal.latestAt ??= row.created_at;
    if (row.feedback_value === "helpful") signal.helpful += 1;
    if (row.feedback_value === "unclear") signal.unclear += 1;
    if (row.feedback_value === "out_of_scope") signal.outOfScope += 1;
    if (row.feedback_value !== "helpful") {
      signal.rejectedQuizKeys.push(row.quiz_key);
    }
    byQuest[row.quest_id] = signal;
  }

  return byQuest;
}

export function getAdaptiveReviewPlan(
  learning: StudyLearningSignal,
  quality: StudyQuizQualitySignal = EMPTY_STUDY_QUALITY_SIGNAL,
): AdaptiveReviewPlan {
  if (learning.incorrect > 0) {
    return {
      kind: "review_now",
      durationMinutes: 15,
      label: "15분 회복 복습",
      reason: `아직 남은 오답 ${learning.incorrect}개를 새 진도보다 먼저 회수해요.`,
    };
  }
  if (learning.skipped > 0) {
    return {
      kind: "review_soon",
      durationMinutes: 10,
      label: "10분 가벼운 복습",
      reason: `건너뛴 확인 ${learning.skipped}개를 짧게 다시 꺼내 봐요.`,
    };
  }
  const rejected = quality.unclear + quality.outOfScope;
  if (rejected > 0) {
    return {
      kind: "replace_question",
      durationMinutes: null,
      label: "다음 문제 교체",
      reason: `맞지 않았던 문제 ${rejected}개는 다음 확인에서 제외해요.`,
    };
  }
  return {
    kind: "continue",
    durationMinutes: null,
    label: "새 진도 계속",
    reason: learning.correct > 0
      ? `확인한 문제 ${learning.correct}개를 통과했어요.`
      : "학습 기록이 쌓이면 복습 시점을 조정해요.",
  };
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
