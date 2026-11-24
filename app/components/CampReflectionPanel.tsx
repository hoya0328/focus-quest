"use client";

import { getCampReflectionRecommendation } from "@/lib/camp-reflection";
import type { CampDifficulty, ExpeditionProgress } from "@/lib/pomodoro";
import type { StudyLearningSignal } from "@/lib/study-progress";

type CampReflectionPanelProps = {
  confidence: 1 | 2 | 3 | 4 | 5;
  difficulty: CampDifficulty;
  expedition: ExpeditionProgress | null;
  learningSignal: StudyLearningSignal | null;
  note: string;
  saved: boolean;
  onConfidenceChange: (value: 1 | 2 | 3 | 4 | 5) => void;
  onDifficultyChange: (value: CampDifficulty) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
};

const confidenceOptions = [1, 2, 3, 4, 5] as const;
const difficultyOptions = [
  ["light", "가벼움"],
  ["steady", "적당함"],
  ["heavy", "버거움"],
] as const;

export default function CampReflectionPanel({
  confidence,
  difficulty,
  expedition,
  learningSignal,
  note,
  saved,
  onConfidenceChange,
  onDifficultyChange,
  onNoteChange,
  onSave,
}: CampReflectionPanelProps) {
  const recommendation = getCampReflectionRecommendation({
    confidence,
    difficulty,
    expeditionSets: expedition?.totalSets,
    learningSignal,
  });

  return (
    <section className="camp-reflection" aria-labelledby="camp-reflection-title">
      <div className="camp-reflection-heading">
        <div>
          <span>한 줄 회고 · 선택</span>
          <h3 id="camp-reflection-title">다음 집중을 더 잘 맞춰볼까요?</h3>
        </div>
        {saved && <strong role="status">기록했어요</strong>}
      </div>
      <label className="camp-reflection-note">
        방금 배운 것을 내 말로 한 줄만 남겨보세요
        <input
          maxLength={160}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="예: 교착 상태는 네 조건이 동시에 성립할 때 생긴다"
          value={note}
        />
      </label>
      <div className="camp-reflection-controls">
        <fieldset>
          <legend>다시 설명할 자신감</legend>
          <div className="confidence-scale">
            {confidenceOptions.map((value) => (
              <button
                aria-pressed={confidence === value}
                className={confidence === value ? "is-selected" : ""}
                key={value}
                onClick={() => onConfidenceChange(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>오늘 체감 난도</legend>
          <div className="difficulty-scale">
            {difficultyOptions.map(([value, label]) => (
              <button
                aria-pressed={difficulty === value}
                className={difficulty === value ? "is-selected" : ""}
                key={value}
                onClick={() => onDifficultyChange(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="camp-reflection-result">
        <p>{recommendation}</p>
        <button onClick={onSave} type="button">
          {saved ? "기록됨" : "회고 저장"}
        </button>
      </div>
    </section>
  );
}
