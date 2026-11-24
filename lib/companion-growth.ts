import type { AdventureId, FocusRecord } from "./pomodoro.ts";

export const COMPANION_GROWTH_STORAGE_KEY = "focus-quest-companion-growth";
export const MAX_COMPANION_GROWTH_ENTRIES = 2_000;

export type CompanionGrowthEntry = {
  sessionId: string;
  adventureId: AdventureId;
  minutes: number;
  completedAt: string;
};

export type CompanionStage = 1 | 2 | 3 | 4;

export type CompanionGrowth = {
  adventureId: AdventureId;
  totalMinutes: number;
  stage: CompanionStage;
  stageLabel: string;
  hint: string;
  nextStageHint: string | null;
};

const adventureIds = new Set<AdventureId>(["hike", "swim", "fish"]);

// The exact thresholds stay out of the interface so evolution remains a surprise.
const stageRules = [
  { minimumMinutes: 0, label: "첫걸음 친구", hint: "아직 낯설지만, 같은 길을 걷기 시작했어요." },
  { minimumMinutes: 600, label: "든든한 길동무", hint: "함께한 시간이 쌓여 몸짓과 표정이 한층 또렷해졌어요." },
  { minimumMinutes: 1_500, label: "노련한 모험가", hint: "스스로 길을 읽고 당신의 집중 리듬을 알아봐요." },
  { minimumMinutes: 3_600, label: "오래된 수호자", hint: "오랜 집중의 기억을 품은 특별한 모습으로 자랐어요." },
] as const;

function isGrowthEntry(value: unknown): value is CompanionGrowthEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CompanionGrowthEntry>;
  return (
    typeof entry.sessionId === "string" &&
    entry.sessionId.length > 0 &&
    Boolean(entry.adventureId && adventureIds.has(entry.adventureId)) &&
    typeof entry.minutes === "number" &&
    Number.isFinite(entry.minutes) &&
    entry.minutes > 0 &&
    entry.minutes <= 120 &&
    typeof entry.completedAt === "string" &&
    !Number.isNaN(Date.parse(entry.completedAt))
  );
}

export function parseCompanionGrowthEntries(
  value: unknown,
): CompanionGrowthEntry[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(isGrowthEntry)) return null;
  return mergeCompanionGrowthEntries(value);
}

export function parseStoredCompanionGrowth(raw: string | null) {
  if (!raw) return [];
  try {
    return parseCompanionGrowthEntries(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

export function growthEntriesFromHistory(
  history: FocusRecord[],
): CompanionGrowthEntry[] {
  return history.map((record) => ({
    sessionId: record.id,
    adventureId: record.adventureId,
    minutes: record.durationMinutes,
    completedAt: record.completedAt,
  }));
}

export function mergeCompanionGrowthEntries(
  ...sources: CompanionGrowthEntry[][]
): CompanionGrowthEntry[] {
  const entries = new Map<string, CompanionGrowthEntry>();
  for (const source of sources) {
    for (const entry of source) {
      if (!isGrowthEntry(entry) || entries.has(entry.sessionId)) continue;
      entries.set(entry.sessionId, entry);
    }
  }
  return [...entries.values()]
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    )
    .slice(0, MAX_COMPANION_GROWTH_ENTRIES);
}

export function addCompanionGrowthRecord(
  entries: CompanionGrowthEntry[],
  record: FocusRecord,
) {
  return mergeCompanionGrowthEntries(entries, growthEntriesFromHistory([record]));
}

export function getCompanionGrowth(
  entries: CompanionGrowthEntry[],
  adventureId: AdventureId,
): CompanionGrowth {
  const totalMinutes = Math.round(
    entries
      .filter((entry) => entry.adventureId === adventureId)
      .reduce((sum, entry) => sum + entry.minutes, 0),
  );
  const ruleIndex = stageRules.findLastIndex(
    (rule) => totalMinutes >= rule.minimumMinutes,
  );
  const safeIndex = Math.max(0, ruleIndex);
  const rule = stageRules[safeIndex];
  const nextRule = stageRules[safeIndex + 1];

  return {
    adventureId,
    totalMinutes,
    stage: (safeIndex + 1) as CompanionStage,
    stageLabel: rule.label,
    hint: rule.hint,
    nextStageHint: nextRule
      ? "함께 집중하다 보면 예상하지 못한 순간에 새로운 모습이 찾아와요."
      : null,
  };
}
