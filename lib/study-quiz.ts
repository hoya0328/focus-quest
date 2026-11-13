export const QUIZ_SOURCE_KIND = "focus-quiz-source-v1";
export const MAX_QUIZ_SOURCE_CHARACTERS = 150_000;

export type StudyQuizSource = {
  kind: typeof QUIZ_SOURCE_KIND;
  pages: StudyPageText[];
};

export type StudyPageText = { pageNumber: number; text: string };

export type StudyQuiz = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourcePages: string;
};

const stopwords = new Set([
  "그리고", "그러나", "따라서", "대한", "에서", "으로", "하는", "있다", "있는",
  "통해", "위한", "경우", "때문", "이러한", "내용", "다음", "설명", "사용",
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were",
]);

function cleanText(value: string, max = 4_000) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function createStudyQuizSource(pages: StudyPageText[]): StudyQuizSource {
  let remaining = MAX_QUIZ_SOURCE_CHARACTERS;
  const normalized: StudyPageText[] = [];
  for (const page of pages) {
    if (remaining <= 0) break;
    const pageNumber = Math.max(1, Math.round(Number(page.pageNumber) || 1));
    const text = cleanText(page.text, Math.min(4_000, remaining));
    if (!text) continue;
    normalized.push({ pageNumber, text });
    remaining -= text.length;
  }
  return { kind: QUIZ_SOURCE_KIND, pages: normalized };
}

export function parseStudyQuizSource(value: unknown): StudyQuizSource | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== QUIZ_SOURCE_KIND || !Array.isArray(candidate.pages)) {
    return null;
  }
  const pages = candidate.pages
    .slice(0, 120)
    .map((page) => {
      const item = (page ?? {}) as Record<string, unknown>;
      return {
        pageNumber: Math.max(1, Math.round(Number(item.pageNumber) || 1)),
        text: typeof item.text === "string" ? cleanText(item.text) : "",
      };
    })
    .filter((page) => page.text);
  return pages.length ? { kind: QUIZ_SOURCE_KIND, pages } : null;
}

export function parseStudyPageRange(sourcePages: string, pageCount: number) {
  const values = sourcePages.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  const maximum = Math.max(1, Math.round(pageCount || 1));
  const startPage = Math.min(maximum, Math.max(1, Math.round(values[0] ?? 1)));
  const endPage = Math.min(
    maximum,
    Math.max(startPage, Math.round(values[1] ?? values[0] ?? maximum)),
  );
  return { startPage, endPage };
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function keywordCandidates(text: string) {
  const matches = text.match(/[가-힣]{2,15}|[A-Za-z][A-Za-z0-9_+-]{2,24}/g) ?? [];
  return matches.filter((word) => {
    const normalized = word.toLowerCase();
    return !stopwords.has(normalized) && !/^\d+$/.test(normalized);
  });
}

function sentencesForRange(source: StudyQuizSource, startPage: number, endPage: number) {
  return source.pages
    .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
    .flatMap((page) =>
      page.text
        .split(/(?<=[.!?。]|다\.)\s+|[\r\n]+/)
        .map((sentence) => ({ pageNumber: page.pageNumber, sentence: cleanText(sentence, 260) })),
    )
    .filter(({ sentence }) => sentence.length >= 24 && keywordCandidates(sentence).length >= 2);
}

export function createStudyQuiz(
  source: StudyQuizSource,
  startPage: number,
  endPage: number,
  variant = 0,
): StudyQuiz | null {
  const safeStart = Math.max(1, Math.min(startPage, endPage));
  const safeEnd = Math.max(safeStart, endPage);
  const sentences = sentencesForRange(source, safeStart, safeEnd);
  if (!sentences.length) return null;

  const seed = simpleHash(`${safeStart}:${safeEnd}:${variant}:${sentences.length}`);
  const selected = sentences[seed % sentences.length];
  const candidates = keywordCandidates(selected.sentence);
  const correct = candidates[(seed + variant) % candidates.length];
  const pool = Array.from(
    new Set(
      source.pages
        .flatMap((page) => keywordCandidates(page.text))
        .filter((word) => word.toLowerCase() !== correct.toLowerCase()),
    ),
  );
  const distractors = pool
    .sort((left, right) => simpleHash(`${left}:${seed}`) - simpleHash(`${right}:${seed}`))
    .slice(0, 3);
  if (distractors.length < 3) return null;

  const rawOptions = [correct, ...distractors];
  const shift = seed % rawOptions.length;
  const options = rawOptions.slice(shift).concat(rawOptions.slice(0, shift));
  const correctIndex = options.indexOf(correct);
  const blanked = selected.sentence.replace(correct, "＿＿＿");

  return {
    id: `${safeStart}-${safeEnd}-${variant}-${seed}`,
    question: `자료의 빈칸에 들어갈 말로 가장 알맞은 것은?\n“${blanked}”`,
    options,
    correctIndex,
    explanation: `${selected.pageNumber}쪽 원문: ${selected.sentence}`,
    sourcePages:
      safeStart === safeEnd ? `${safeStart}쪽` : `${safeStart}~${safeEnd}쪽`,
  };
}

export function createUnseenStudyQuiz(
  source: StudyQuizSource,
  startPage: number,
  endPage: number,
  initialVariant: number,
  attemptedQuizKeys: ReadonlySet<string>,
) {
  for (let offset = 0; offset < 16; offset += 1) {
    const quiz = createStudyQuiz(
      source,
      startPage,
      endPage,
      initialVariant + offset,
    );
    if (!quiz || attemptedQuizKeys.has(quiz.id)) continue;
    return quiz;
  }
  return null;
}
