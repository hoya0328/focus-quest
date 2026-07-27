import type { AdventureId } from "@/lib/pomodoro";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 120;
export const MAX_ANALYSIS_CHARACTERS = 160_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStudyMaterialStoragePath(
  userId: string,
  materialId: string,
) {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(materialId)) {
    throw new Error("PDF 저장 경로를 만들 수 없어요.");
  }
  return `${userId}/${materialId}/source.pdf`;
}

export type PdfPageText = {
  pageNumber: number;
  text: string;
};

export type QuestContract = {
  safe: string;
  base: string;
  stretch: string;
};

export type PdfOutlineItem = {
  title: string;
  startPage: number;
  endPage: number;
};

export type PdfQuestSuggestion = {
  title: string;
  objective: string;
  sourcePages: string;
  startPage: number;
  endPage: number;
  studyMethod: string;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  focusMinutes: number;
  breakMinutes: number;
  targetSets: number;
  adventureId: AdventureId;
  contract: QuestContract;
  rationale: string;
  registered: boolean;
};

export type PdfAnalysis = {
  summary: string;
  keyConcepts: string[];
  outline: PdfOutlineItem[];
  quests: PdfQuestSuggestion[];
  provider: "guided" | "openai";
  warning: string;
};

export type StudyMaterial = {
  id: string;
  userId: string;
  subjectId: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  pageCount: number;
  status: "uploaded" | "analyzing" | "ready" | "failed";
  summary: string;
  analysis: PdfAnalysis | null;
  analysisProvider: "guided" | "openai";
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
  analyzedAt: string | null;
};

export type MaterialRow = {
  id: string;
  user_id: string;
  subject_id: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number;
  page_count: number;
  status: StudyMaterial["status"];
  summary: string;
  analysis: unknown;
  analysis_provider: StudyMaterial["analysisProvider"];
  error_message: string;
  created_at: string;
  updated_at: string;
  analyzed_at: string | null;
};

const adventures = new Set<AdventureId>(["hike", "swim", "fish"]);

function clampInteger(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parsePdfAnalysis(
  value: unknown,
  provider?: PdfAnalysis["provider"],
): PdfAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.quests) || candidate.quests.length < 3) return null;

  const quests = candidate.quests.slice(0, 7).map((raw, index) => {
    const quest = (raw ?? {}) as Record<string, unknown>;
    const startPage = clampInteger(quest.startPage, 1, MAX_PDF_PAGES);
    const endPage = Math.max(
      startPage,
      clampInteger(quest.endPage, startPage, MAX_PDF_PAGES),
    );
    const contract = (quest.contract ?? {}) as Record<string, unknown>;
    const adventureId = adventures.has(quest.adventureId as AdventureId)
      ? (quest.adventureId as AdventureId)
      : (["hike", "swim", "fish"][index % 3] as AdventureId);
    const minimum = clampInteger(quest.estimatedMinutesMin, 5, 720);
    const maximum = Math.max(
      minimum,
      clampInteger(quest.estimatedMinutesMax, minimum, 720),
    );
    return {
      title: text(quest.title, 100) || `학습 퀘스트 ${index + 1}`,
      objective:
        text(quest.objective, 500) || "핵심 내용을 자신의 말로 설명한다.",
      sourcePages:
        text(quest.sourcePages, 120) ||
        (startPage === endPage ? `${startPage}쪽` : `${startPage}~${endPage}쪽`),
      startPage,
      endPage,
      studyMethod:
        text(quest.studyMethod, 500) ||
        "핵심 개념을 읽고 짧은 요약과 회상 질문을 만든다.",
      estimatedMinutesMin: minimum,
      estimatedMinutesMax: maximum,
      focusMinutes: clampInteger(quest.focusMinutes, 10, 120),
      breakMinutes: clampInteger(quest.breakMinutes, 3, 30),
      targetSets: clampInteger(quest.targetSets, 1, 12),
      adventureId,
      contract: {
        safe: text(contract.safe, 300) || "핵심 용어 3개를 찾는다.",
        base:
          text(contract.base, 300) || "핵심 개념을 자신의 말로 설명한다.",
        stretch:
          text(contract.stretch, 300) || "연습문제나 적용 사례까지 해결한다.",
      },
      rationale:
        text(quest.rationale, 500) ||
        "페이지 분량과 개념 밀도를 기준으로 학습 단위를 나눴습니다.",
      registered: quest.registered === true,
    } satisfies PdfQuestSuggestion;
  });

  const outline = Array.isArray(candidate.outline)
    ? candidate.outline.slice(0, 20).map((raw, index) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        const startPage = clampInteger(item.startPage, 1, MAX_PDF_PAGES);
        return {
          title: text(item.title, 160) || `구간 ${index + 1}`,
          startPage,
          endPage: Math.max(
            startPage,
            clampInteger(item.endPage, startPage, MAX_PDF_PAGES),
          ),
        };
      })
    : [];

  return {
    summary: text(candidate.summary, 3000),
    keyConcepts: Array.isArray(candidate.keyConcepts)
      ? candidate.keyConcepts
          .map((item) => text(item, 80))
          .filter(Boolean)
          .slice(0, 15)
      : [],
    outline,
    quests,
    provider:
      provider ?? (candidate.provider === "openai" ? "openai" : "guided"),
    warning: text(candidate.warning, 500),
  };
}

export function materialFromRow(row: MaterialRow): StudyMaterial {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
    pageCount: row.page_count,
    status: row.status,
    summary: row.summary,
    analysis: parsePdfAnalysis(row.analysis, row.analysis_provider),
    analysisProvider: row.analysis_provider,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analyzedAt: row.analyzed_at,
  };
}

const stopwords = new Set([
  "그리고", "그러나", "대한", "에서", "으로", "하는", "있다", "있는",
  "the", "and", "for", "with", "from", "this", "that", "are", "was",
]);

function topConcepts(pages: PdfPageText[]) {
  const counts = new Map<string, number>();
  const words = pages
    .map((page) => page.text)
    .join(" ")
    .toLowerCase()
    .match(/[가-힣]{2,}|[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const word of words) {
    if (stopwords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([word]) => word);
}

function pageHeading(page: PdfPageText) {
  return (
    page.text
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length >= 4 && line.length <= 70) ??
    `${page.pageNumber}쪽 핵심 내용`
  );
}

function roundFive(value: number) {
  return Math.max(5, Math.round(value / 5) * 5);
}

export function createGuidedPdfAnalysis({
  pages,
  subjectName,
  subjectGoal,
}: {
  pages: PdfPageText[];
  subjectName: string;
  subjectGoal: string;
}): PdfAnalysis {
  const usablePages = pages.filter((page) => page.text.trim());
  const firstPage = usablePages[0]?.pageNumber ?? 1;
  const lastPage = usablePages.at(-1)?.pageNumber ?? firstPage;
  const questCount = Math.min(7, Math.max(3, Math.ceil(usablePages.length / 18)));
  const segmentSize = Math.max(1, Math.ceil(usablePages.length / questCount));
  const concepts = topConcepts(usablePages);

  const outline = Array.from({ length: questCount }, (_, index) => {
    const segment = usablePages.slice(index * segmentSize, (index + 1) * segmentSize);
    const start = segment[0] ?? usablePages[0];
    const end = segment.at(-1) ?? start;
    return {
      title: pageHeading(start),
      startPage: start?.pageNumber ?? firstPage,
      endPage: end?.pageNumber ?? lastPage,
    };
  });

  const quests = outline.map((item, index) => {
    const segment = usablePages.filter(
      (page) => page.pageNumber >= item.startPage && page.pageNumber <= item.endPage,
    );
    const characters = segment.reduce((sum, page) => sum + page.text.length, 0);
    const midpoint = roundFive(Math.min(180, Math.max(20, characters / 500)));
    const minimum = roundFive(Math.max(15, midpoint * 0.8));
    const maximum = roundFive(Math.min(240, Math.max(minimum, midpoint * 1.25)));
    const focusMinutes = maximum <= 35 ? 20 : maximum >= 100 ? 40 : 25;
    const breakMinutes = focusMinutes >= 40 ? 10 : 5;
    const targetSets = Math.min(8, Math.max(1, Math.ceil(midpoint / focusMinutes)));
    const concept = concepts[index] ?? item.title;
    return {
      title: `${concept} 이해하기`,
      objective: `${item.startPage}~${item.endPage}쪽의 핵심 내용을 자신의 말로 설명한다.`,
      sourcePages:
        item.startPage === item.endPage
          ? `${item.startPage}쪽`
          : `${item.startPage}~${item.endPage}쪽`,
      startPage: item.startPage,
      endPage: item.endPage,
      studyMethod: "구간을 훑어본 뒤 핵심 개념을 요약하고, 자료를 덮고 3분간 회상하세요.",
      estimatedMinutesMin: minimum,
      estimatedMinutesMax: maximum,
      focusMinutes,
      breakMinutes,
      targetSets,
      adventureId: (["hike", "swim", "fish"][index % 3] as AdventureId),
      contract: {
        safe: `관련 용어 3개와 중요한 문장 1개를 표시한다.`,
        base: `${concept}을(를) 예시와 함께 자신의 말로 설명한다.`,
        stretch: `연습문제 또는 실제 사례 하나에 ${concept}을(를) 적용한다.`,
      },
      rationale: `${segment.length}쪽과 약 ${characters.toLocaleString("ko-KR")}자의 분량을 기준으로 ${minimum}~${maximum}분 범위로 추정했습니다.`,
      registered: false,
    } satisfies PdfQuestSuggestion;
  });

  return {
    summary: `${subjectName} 자료의 ${firstPage}~${lastPage}쪽을 ${quests.length}개 학습 단위로 나눴습니다.${subjectGoal ? ` 과목 목표는 “${subjectGoal}”입니다.` : ""}`,
    keyConcepts: concepts,
    outline,
    quests,
    provider: "guided",
    warning: "AI 키가 없어 페이지 분량과 반복 개념을 기준으로 만든 기본 제안입니다. 모든 내용을 확인하고 수정한 뒤 등록하세요.",
  };
}
