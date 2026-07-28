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

export type CourseProfile = {
  subjectArea: string;
  materialType: string;
  learningGoal: string;
  recommendedApproach: string;
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
  courseProfile: CourseProfile;
  divisionStrategy: string;
  summary: string;
  keyConcepts: string[];
  outline: PdfOutlineItem[];
  quests: PdfQuestSuggestion[];
  confidence: "low" | "medium" | "high";
  missingEvidence: string[];
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
    courseProfile: {
      subjectArea:
        text(
          (candidate.courseProfile as Record<string, unknown> | undefined)
            ?.subjectArea,
          120,
        ) || "과목 분야를 직접 확인해 주세요.",
      materialType:
        text(
          (candidate.courseProfile as Record<string, unknown> | undefined)
            ?.materialType,
          120,
        ) || "학습 자료",
      learningGoal:
        text(
          (candidate.courseProfile as Record<string, unknown> | undefined)
            ?.learningGoal,
          300,
        ) || "핵심 내용을 이해하고 자신의 말로 설명한다.",
      recommendedApproach:
        text(
          (candidate.courseProfile as Record<string, unknown> | undefined)
            ?.recommendedApproach,
          500,
        ) || "개념을 확인한 뒤 자료를 덮고 회상하세요.",
    },
    divisionStrategy:
      text(candidate.divisionStrategy, 800) ||
      "페이지 분량과 추출된 제목을 기준으로 학습 구간을 나눴습니다.",
    summary: text(candidate.summary, 3000),
    keyConcepts: Array.isArray(candidate.keyConcepts)
      ? candidate.keyConcepts
          .map((item) => text(item, 80))
          .filter(Boolean)
          .slice(0, 15)
      : [],
    outline,
    quests,
    confidence:
      candidate.confidence === "high" || candidate.confidence === "medium"
        ? candidate.confidence
        : "low",
    missingEvidence: Array.isArray(candidate.missingEvidence)
      ? candidate.missingEvidence
          .map((item) => text(item, 240))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    provider:
      provider ?? (candidate.provider === "openai" ? "openai" : "guided"),
    warning: text(candidate.warning, 500),
  };
}

export function sanitizePdfAnalysisForStorage(analysis: PdfAnalysis): PdfAnalysis {
  return JSON.parse(
    JSON.stringify(analysis, (_key, value) =>
      typeof value === "string" ? value.replace(/\u0000/g, "") : value,
    ),
  ) as PdfAnalysis;
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
  "통해", "위한", "경우", "때문", "이러한", "내용", "핵심", "개념",
  "설명", "설명합니다", "예시", "함께", "자료", "페이지", "정리",
  "사용", "필요", "위해", "형성", "관련", "다음", "그림", "표시",
  "the", "and", "for", "with", "from", "this", "that", "are", "was",
  "int", "void", "return", "static", "public", "private", "class", "string",
]);

function topConcepts(pages: PdfPageText[]) {
  const counts = new Map<string, { count: number; pages: Set<number> }>();
  for (const page of pages) {
    const words =
      page.text.toLowerCase().match(/[가-힣]{2,}|[a-z][a-z0-9-]{2,}/g) ?? [];
    for (const word of words) {
      if (
        stopwords.has(word) ||
        /^[a-z]{2,3}$/.test(word) ||
        /^(합니다|됩니다|있습니다|것입니다)$/.test(word)
      ) {
        continue;
      }
      const current = counts.get(word) ?? { count: 0, pages: new Set<number>() };
      current.count += 1;
      current.pages.add(page.pageNumber);
      counts.set(word, current);
    }
  }
  return [...counts.entries()]
    .filter(([, value]) => value.count >= 2 || value.pages.size >= 2)
    .sort(
      (left, right) =>
        right[1].pages.size * 3 +
        right[1].count -
        (left[1].pages.size * 3 + left[1].count),
    )
    .slice(0, 10)
    .map(([word]) => word);
}

function pageHeading(page: PdfPageText) {
  return (
    page.text
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find(
        (line) =>
          line.length >= 4 &&
          line.length <= 70 &&
          !/^(page|페이지)?\s*\d+\s*$/i.test(line),
      ) ??
    `${page.pageNumber}쪽 핵심 내용`
  );
}

function roundFive(value: number) {
  return Math.max(5, Math.round(value / 5) * 5);
}

type SubjectKind =
  | "computing"
  | "quantitative"
  | "science"
  | "language"
  | "humanities"
  | "general";

function inferCourseProfile(
  subjectName: string,
  subjectGoal: string,
  pages: PdfPageText[],
) {
  const sample = `${subjectName} ${subjectGoal} ${pages
    .slice(0, 12)
    .map((page) => page.text.slice(0, 1_500))
    .join(" ")}`.toLowerCase();
  const candidates: Array<{
    kind: SubjectKind;
    pattern: RegExp;
    subjectArea: string;
    approach: string;
  }> = [
    {
      kind: "computing",
      pattern:
        /운영체제|소프트웨어|컴퓨터|프로그래밍|알고리즘|데이터베이스|네트워크|프로세스|스케줄링|메모리|코드/,
      subjectArea: "컴퓨터공학·소프트웨어",
      approach:
        "용어 암기보다 구성요소의 역할과 동작 흐름을 연결하고, 비교표·상태 변화·사례 문제로 확인하는 방식이 적합합니다.",
    },
    {
      kind: "quantitative",
      pattern: /수학|통계|확률|미적분|선형대수|정리|증명|공식|계산/,
      subjectArea: "수리·정량",
      approach:
        "공식의 조건을 확인한 뒤 대표 예제를 따라 풀고, 자료를 보지 않은 재풀이와 오답 원인 기록을 반복하는 방식이 적합합니다.",
    },
    {
      kind: "science",
      pattern: /물리|화학|생물|과학|실험|반응|세포|에너지/,
      subjectArea: "자연과학",
      approach:
        "현상·원리·변수 사이의 인과관계를 그림으로 연결하고, 예측 질문과 적용 문제로 이해를 확인하는 방식이 적합합니다.",
    },
    {
      kind: "language",
      pattern: /영어|국어|언어|문법|어휘|독해|작문|회화/,
      subjectArea: "언어·의사소통",
      approach:
        "어휘와 규칙을 문맥 속에서 확인하고, 짧은 회상·문장 만들기·요약 말하기를 반복하는 방식이 적합합니다.",
    },
    {
      kind: "humanities",
      pattern: /경영|경제|마케팅|정책|법|역사|철학|사회|심리|행정/,
      subjectArea: "인문·사회·경영",
      approach:
        "핵심 주장과 근거, 개념 간 차이를 표로 정리하고 실제 사례에 적용해 설명하는 방식이 적합합니다.",
    },
  ];
  const matched = candidates.find((candidate) => candidate.pattern.test(sample));
  const kind = matched?.kind ?? "general";
  const subjectArea = matched?.subjectArea ?? "일반 개념 학습";
  const recommendedApproach =
    matched?.approach ??
    "구간별 핵심 질문을 먼저 만들고, 읽기·요약·자료 없이 회상하기 순서로 학습하는 방식이 적합합니다.";
  const materialType = /기말|중간|시험|고사/.test(sample)
    ? "시험 대비 자료"
    : /문제|퀴즈|연습|풀이/.test(sample)
      ? "문제풀이 자료"
      : /강의|교안|lecture|chapter|장\s/.test(sample)
        ? "강의·교재 자료"
        : "개념 정리 자료";
  const learningGoal =
    subjectGoal ||
    `${subjectName}의 핵심 개념을 이해하고 자료 없이 설명할 수 있다.`;
  return {
    kind,
    profile: {
      subjectArea,
      materialType,
      learningGoal,
      recommendedApproach,
    } satisfies CourseProfile,
  };
}

function studyMethodFor(kind: SubjectKind, index: number, concept: string) {
  const methods: Record<SubjectKind, string[]> = {
    computing: [
      `“${concept}”의 정의·구성요소·동작 순서를 한 장의 흐름도로 연결하세요.`,
      `비슷한 개념과 “${concept}”의 차이를 조건·동작·결과 기준의 비교표로 정리하세요.`,
      `자료를 덮고 “${concept}”이 실제 시스템에서 작동하는 순서를 3분 동안 설명하세요.`,
      `대표 상황 하나를 골라 “${concept}”을 적용하고, 선택한 이유를 한 문장으로 남기세요.`,
    ],
    quantitative: [
      `“${concept}”의 적용 조건과 공식을 적은 뒤 대표 예제 한 문제를 따라 푸세요.`,
      `풀이를 가리고 같은 유형을 다시 풀며 막힌 단계를 오답 원인으로 기록하세요.`,
      `조건을 바꾼 변형 문제를 풀고 결과가 달라지는 이유를 설명하세요.`,
    ],
    science: [
      `“${concept}”과 관련된 현상·원인·결과를 화살표로 연결하세요.`,
      `변수 하나를 바꿨을 때 결과를 먼저 예측하고 자료의 설명과 비교하세요.`,
      `자료를 덮고 원리를 그림과 함께 설명한 뒤 적용 질문 하나에 답하세요.`,
    ],
    language: [
      `“${concept}”을 문맥 속 예문과 함께 정리하고 직접 문장 3개를 만드세요.`,
      `해당 구간을 읽은 뒤 핵심 내용을 3문장으로 요약하고 소리 내어 말하세요.`,
      `자료를 가리고 핵심 표현을 회상한 뒤 틀린 항목만 다시 확인하세요.`,
    ],
    humanities: [
      `“${concept}”의 정의·핵심 주장·근거를 표로 정리하세요.`,
      `비슷한 관점과 차이를 비교하고 실제 사례 하나에 적용하세요.`,
      `자료를 덮고 핵심 질문에 주장-근거-예시 순서로 답하세요.`,
    ],
    general: [
      `“${concept}”을 중심으로 핵심 질문 3개를 만든 뒤 답을 찾아 요약하세요.`,
      `구간을 읽은 뒤 키워드만 보고 내용을 자신의 말로 복원하세요.`,
      `자료를 덮고 3분 회상한 뒤 빠진 내용만 다른 색으로 보충하세요.`,
    ],
  };
  const choices = methods[kind];
  return choices[index % choices.length];
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
  const { kind, profile } = inferCourseProfile(
    subjectName,
    subjectGoal,
    usablePages,
  );

  const outline = Array.from({ length: questCount }, (_, index) => {
    const segment = usablePages.slice(index * segmentSize, (index + 1) * segmentSize);
    const start = segment[0] ?? usablePages[0];
    const end = segment.at(-1) ?? start;
    const segmentConcepts = topConcepts(segment).slice(0, 2);
    return {
      title: segmentConcepts.length
        ? segmentConcepts.join(" · ")
        : pageHeading(start),
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
    const concept = topConcepts(segment)[0] ?? concepts[index] ?? item.title;
    return {
      title: `${concept} 핵심 원리 정리`,
      objective: `“${concept}”의 핵심 원리와 대표 사례를 자료 없이 자신의 말로 설명한다.`,
      sourcePages:
        item.startPage === item.endPage
          ? `${item.startPage}쪽`
          : `${item.startPage}~${item.endPage}쪽`,
      startPage: item.startPage,
      endPage: item.endPage,
      studyMethod: studyMethodFor(kind, index, concept),
      estimatedMinutesMin: minimum,
      estimatedMinutesMax: maximum,
      focusMinutes,
      breakMinutes,
      targetSets,
      adventureId: (["hike", "swim", "fish"][index % 3] as AdventureId),
      contract: {
        safe: `“${concept}”과 연결되는 용어 3개와 근거 문장 1개를 찾는다.`,
        base: `“${concept}”의 원리와 사례를 자료 없이 3분 동안 설명한다.`,
        stretch: `새로운 문제나 실제 사례 하나에 “${concept}”을 적용하고 이유를 적는다.`,
      },
      rationale: `${item.startPage}~${item.endPage}쪽의 약 ${characters.toLocaleString("ko-KR")}자와 반복 개념 “${concept}”을 기준으로 한 학습 단위입니다. 읽기·정리·회상 시간을 합쳐 ${minimum}~${maximum}분으로 추정했습니다.`,
      registered: false,
    } satisfies PdfQuestSuggestion;
  });

  const totalCharacters = usablePages.reduce(
    (sum, page) => sum + page.text.length,
    0,
  );
  const uniqueHeadings = new Set(usablePages.map(pageHeading)).size;
  const missingEvidence = [
    !subjectGoal ? "과목 목표가 입력되지 않아 일반적인 완료 기준을 사용했습니다." : "",
    usablePages.length < pages.length
      ? `${pages.length - usablePages.length}쪽에서 읽을 수 있는 글자를 찾지 못했습니다.`
      : "",
    uniqueHeadings < 3
      ? "뚜렷한 목차·제목 신호가 부족해 페이지 분량을 우선해 구간을 나눴습니다."
      : "",
    totalCharacters < 2_000
      ? "추출된 글자가 적어 과목 성격과 핵심 개념의 정확도가 낮을 수 있습니다."
      : "",
  ].filter(Boolean);
  const confidence =
    totalCharacters >= 4_000 && concepts.length >= 4 && uniqueHeadings >= 3
      ? "medium"
      : "low";
  const divisionStrategy =
    `${usablePages.length}쪽의 약 ${totalCharacters.toLocaleString("ko-KR")}자를 ${quests.length}개 구간으로 나눴습니다. ` +
    (uniqueHeadings >= 3
      ? "페이지별 제목 후보와 반복되는 핵심어를 먼저 보고, 각 구간의 분량이 지나치게 차이 나지 않도록 경계를 조정했습니다."
      : "목차 신호가 충분하지 않아 페이지 분량을 균등하게 배치한 뒤, 각 구간에서 반복되는 핵심어로 이름을 붙였습니다.");

  return {
    courseProfile: profile,
    divisionStrategy,
    summary:
      `이 자료는 ${subjectName}의 ${profile.materialType}로 추정됩니다. ` +
      `${firstPage}~${lastPage}쪽을 ${quests.length}개 학습 단위로 구성했으며, ` +
      `${profile.learningGoal}를 목표로 읽기·정리·회상을 함께 수행하도록 제안했습니다.`,
    keyConcepts: concepts,
    outline,
    quests,
    confidence,
    missingEvidence,
    provider: "guided",
    warning:
      "현재는 무료 자료 분석 모드입니다. 추출된 제목·반복 개념·페이지 분량을 바탕으로 만든 초안이므로, 실제 목차와 수업 범위에 맞게 확인한 뒤 등록해 주세요.",
  };
}
