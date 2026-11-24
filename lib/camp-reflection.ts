import type { CampDifficulty } from "./pomodoro.ts";
import type { StudyLearningSignal } from "./study-progress.ts";

export function getCampReflectionRecommendation({
  confidence,
  difficulty,
  expeditionSets,
  learningSignal,
}: {
  confidence: 1 | 2 | 3 | 4 | 5;
  difficulty: CampDifficulty;
  expeditionSets?: number;
  learningSignal: StudyLearningSignal | null;
}) {
  if (
    learningSignal &&
    (learningSignal.incorrect > 0 || learningSignal.skipped > 0)
  ) {
    return "확인이 남은 개념이 있어요. 다음 행동은 새 진도보다 이 퀘스트의 짧은 복습이 먼저예요.";
  }
  if (difficulty === "heavy" || confidence <= 2) {
    return "다음에는 같은 범위를 더 짧게 복습하는 편이 좋아요.";
  }
  if (confidence >= 4 && difficulty === "light") {
    return "다음에는 새 범위로 넘어가도 좋은 상태예요.";
  }
  if (expeditionSets) {
    return `계획한 ${expeditionSets}세트를 마쳤어요. 현재 리듬으로 다음 퀘스트를 이어가세요.`;
  }
  return "현재 리듬이 잘 맞아요. 같은 길이로 한 세트 더 이어가세요.";
}
