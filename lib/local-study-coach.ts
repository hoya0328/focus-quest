import type { StudyQuizSource } from "./study-quiz.ts";

export type LocalStudyGuide = {
  kind: "concept" | "calculation" | "code" | "mixed";
  label: string;
  keywords: string[];
  focusMinutes: 20 | 25 | 40;
  breakMinutes: 5 | 10;
  method: string;
  checkpoint: string;
};

const ignored = new Set([
  "그리고", "그러나", "따라서", "대한", "에서", "으로", "하는", "있다", "있는",
  "위한", "경우", "때문", "내용", "설명", "사용", "다음", "the", "and", "for",
  "with", "from", "this", "that", "are", "was", "were",
]);

function topKeywords(text: string) {
  const counts = new Map<string, number>();
  const words = text.match(/[가-힣]{2,12}|[A-Za-z][A-Za-z0-9_+-]{2,20}/g) ?? [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (ignored.has(key) || /^\d+$/.test(key)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, 5)
    .map(([word]) => word);
}

export function createLocalStudyGuide(source: StudyQuizSource): LocalStudyGuide {
  const text = source.pages.map((page) => page.text).join(" ").slice(0, 150_000);
  const length = Math.max(1, text.length);
  const codeSignals = (text.match(/[{};]|\b(function|class|const|SELECT|FROM|WHERE|JOIN|int|return)\b/gi) ?? []).length;
  const calculationSignals = (text.match(/[=<>±×÷∑]|\b(공식|계산|정리|증명|확률|함수|방정식)\b/g) ?? []).length;
  const conceptSignals = (text.match(/(의미|정의|개념|특징|원리|종류|분류|관계)/g) ?? []).length;
  const density = (codeSignals + calculationSignals + conceptSignals) / length * 1_000;
  let kind: LocalStudyGuide["kind"] = "concept";
  if (codeSignals > calculationSignals * 1.25 && codeSignals >= 4) kind = "code";
  else if (calculationSignals > codeSignals * 1.25 && calculationSignals >= 4) kind = "calculation";
  else if (density >= 0.3 && codeSignals + calculationSignals >= 6) kind = "mixed";

  const guides: Record<LocalStudyGuide["kind"], Omit<LocalStudyGuide, "kind" | "keywords">> = {
    concept: {
      label: "개념과 관계가 많은 자료",
      focusMinutes: 25,
      breakMinutes: 5,
      method: "한 구간을 읽은 뒤 핵심 개념을 보지 않고 세 문장으로 다시 적어 보세요.",
      checkpoint: "용어의 뜻보다 서로 어떤 관계인지 설명할 수 있는지 확인해요.",
    },
    calculation: {
      label: "계산과 풀이가 많은 자료",
      focusMinutes: 40,
      breakMinutes: 10,
      method: "예제를 가린 뒤 같은 순서로 직접 풀고, 막힌 단계만 자료에서 찾아보세요.",
      checkpoint: "정답보다 어떤 식과 조건을 먼저 골랐는지 말해 봐요.",
    },
    code: {
      label: "코드와 절차가 많은 자료",
      focusMinutes: 40,
      breakMinutes: 10,
      method: "코드를 읽은 뒤 입력과 출력만 남기고 핵심 흐름을 직접 다시 작성해 보세요.",
      checkpoint: "한 줄을 바꿨을 때 결과가 어떻게 달라지는지 예측해 봐요.",
    },
    mixed: {
      label: "개념과 적용이 섞인 자료",
      focusMinutes: 20,
      breakMinutes: 5,
      method: "20분마다 개념 한 가지와 적용 예시 한 가지를 짝지어 기록해 보세요.",
      checkpoint: "개념을 새 상황에 적용하는 짧은 예를 스스로 만들어 봐요.",
    },
  };
  return { kind, keywords: topKeywords(text), ...guides[kind] };
}
