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
};

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
