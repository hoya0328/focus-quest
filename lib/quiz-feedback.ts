export type QuizFeedbackStage = "checkpoint" | "review";

export type QuizFeedbackValue = "helpful" | "unclear" | "out_of_scope";

export type QuizFeedbackState = {
  value: QuizFeedbackValue | null;
  status: "idle" | "saving" | "saved" | "error";
};

export const QUIZ_FEEDBACK_OPTIONS: ReadonlyArray<{
  label: string;
  value: QuizFeedbackValue;
}> = [
  { label: "도움 됨", value: "helpful" },
  { label: "조금 애매함", value: "unclear" },
  { label: "범위 밖", value: "out_of_scope" },
];

export function emptyQuizFeedback(): QuizFeedbackState {
  return { value: null, status: "idle" };
}
