import {
  normalizeFocusIntent,
  type AdventureId,
  type BgmId,
  type FocusRecord,
} from "./pomodoro.ts";

export const RECOVERY_QUEST_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
export const RECOVERY_QUEST_KEY = "focus-quest-recovery";
export const RECOVERY_UPDATED_AT_KEY =
  "focus-quest-recovery-updated-at";

export type RecoveryQuest = {
  createdAt: string;
  expiresAt: string;
  focusIntent: string;
  durationMinutes: 5 | 10;
  adventureId: AdventureId;
  bgm: BgmId;
  questId?: string;
};

export type WorldProgress = {
  adventureId: AdventureId;
  completed: number;
  level: number;
  nextTarget: number | null;
  nextUnlockLabel: string | null;
  remaining: number;
  progressPercent: number;
  unlockedLabel: string;
};

export type AdventureTraceProgress = {
  adventureId: AdventureId;
  completed: number;
  unlockedCount: number;
  latestLabel: string | null;
  nextLabel: string | null;
  message: string;
  labels: readonly string[];
};

export type CompanionMemory = {
  completedTogether: number;
  lastFocusIntent: string | null;
  message: string;
};

export type BehaviorInsights = {
  sampleSize: number;
  averageMinutes: number | null;
  favoriteMinutes: number | null;
  favoriteHour: number | null;
  namedRate: number;
  recommendation: string;
};

const adventureIds = new Set<AdventureId>(["hike", "swim", "fish"]);
const bgmIds = new Set<BgmId>(["forest", "waves", "lake", "quiet"]);
export const WORLD_GROWTH_MINIMUM_MINUTES = 10;
export const WORLD_GROWTH_MILESTONES = [10, 25, 50, 100] as const;
const restorationLabels: Record<AdventureId, readonly string[]> = {
  hike: [
    "숲길의 첫 숨",
    "길잡이의 표식",
    "능선 쉼터",
    "산장과 구름다리",
    "해오름 정상",
  ],
  swim: [
    "잠든 유적",
    "산호빛 길",
    "유적의 등불",
    "바다의 정원",
    "유리산호 성소",
  ],
  fish: [
    "고요한 달빛",
    "첫 등불",
    "낚시꾼의 부두",
    "돌아온 호숫마을",
    "황금빛 호수",
  ],
};
const firstJourneyTraceLabels: Record<AdventureId, readonly string[]> = {
  hike: ["첫 발자국", "솔바람 표식", "정상으로 향한 지도"],
  swim: ["첫 기포", "산호빛 조각", "유적의 나침반"],
  fish: ["첫 물결", "달빛 찌의 흔적", "황금 잉어 소문"],
};

export function createRecoveryQuest({
  adventureId,
  bgm,
  focusIntent,
  questId,
  remainingSeconds,
  now = Date.now(),
}: {
  adventureId: AdventureId;
  bgm: BgmId;
  focusIntent: string;
  questId?: string;
  remainingSeconds: number;
  now?: number;
}): RecoveryQuest {
  return {
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RECOVERY_QUEST_LIFETIME_MS).toISOString(),
    focusIntent: normalizeFocusIntent(focusIntent) || "자유 집중",
    durationMinutes: remainingSeconds > 5 * 60 ? 10 : 5,
    adventureId,
    bgm,
    ...(questId ? { questId } : {}),
  };
}

export function parseRecoveryQuest(
  raw: string | null,
  now = Date.now(),
): RecoveryQuest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecoveryQuest>;
    if (
      typeof value.createdAt !== "string" ||
      Number.isNaN(Date.parse(value.createdAt)) ||
      typeof value.focusIntent !== "string" ||
      normalizeFocusIntent(value.focusIntent) !== value.focusIntent ||
      (value.durationMinutes !== 5 && value.durationMinutes !== 10) ||
      !value.adventureId ||
      !adventureIds.has(value.adventureId) ||
      !value.bgm ||
      !bgmIds.has(value.bgm) ||
      (value.questId !== undefined &&
        (typeof value.questId !== "string" || value.questId.length === 0))
    ) {
      return null;
    }

    const createdAt = Date.parse(value.createdAt);
    const maximumExpiry = createdAt + RECOVERY_QUEST_LIFETIME_MS;
    const expiresAt = value.expiresAt
      ? Date.parse(value.expiresAt)
      : maximumExpiry;
    if (
      Number.isNaN(expiresAt) ||
      expiresAt <= createdAt ||
      expiresAt > maximumExpiry ||
      expiresAt <= now
    ) {
      return null;
    }

    return {
      ...(value as Omit<RecoveryQuest, "expiresAt">),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  } catch {
    return null;
  }
}

/** World growth counts this companion's completed >=10 minute records, not time. */
export function getWorldProgress(
  history: FocusRecord[],
  adventureId: AdventureId,
): WorldProgress {
  const completed = getValidWorldRecords(history, adventureId).length;
  const level = 1 + WORLD_GROWTH_MILESTONES.filter(
    (milestone) => completed >= milestone,
  ).length;
  const previousTarget =
    level === 1 ? 0 : (WORLD_GROWTH_MILESTONES[level - 2] ?? 0);
  const nextTarget = WORLD_GROWTH_MILESTONES[level - 1] ?? null;
  const progressPercent = nextTarget
    ? Math.round(
        ((completed - previousTarget) / (nextTarget - previousTarget)) * 100,
      )
    : 100;

  return {
    adventureId,
    completed,
    level,
    nextTarget,
    nextUnlockLabel: nextTarget
      ? (restorationLabels[adventureId][level] ?? null)
      : null,
    remaining: nextTarget ? Math.max(0, nextTarget - completed) : 0,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
    unlockedLabel:
      restorationLabels[adventureId][level - 1] ??
      restorationLabels[adventureId][0],
  };
}

export function getAdventureTraceProgress(
  history: FocusRecord[],
  adventureId: AdventureId,
): AdventureTraceProgress {
  const completed = getValidWorldRecords(history, adventureId).length;
  const labels = firstJourneyTraceLabels[adventureId];
  const unlockedCount = Math.min(labels.length, completed);
  const latestLabel =
    completed === 0
      ? null
      : completed <= labels.length
        ? labels[completed - 1]
        : `${completed}번째 모험 흔적`;
  const nextLabel = labels[unlockedCount] ?? null;
  const message = nextLabel
    ? completed === 0
      ? `${nextLabel}부터 천천히 발견해 보세요.`
      : `${nextLabel}까지 ${labels.length - unlockedCount}번의 첫 원정이 남았어요.`
    : completed < WORLD_GROWTH_MILESTONES[0]
      ? `첫 원정 기록 완성 · 세계가 깨어나기까지 ${WORLD_GROWTH_MILESTONES[0] - completed}번 남았어요.`
      : `${completed}번의 집중이 이 세계에 남아 있어요.`;

  return {
    adventureId,
    completed,
    unlockedCount,
    latestLabel,
    nextLabel,
    message,
    labels,
  };
}

export function getCompanionMemory(
  history: FocusRecord[],
  adventureId: AdventureId,
): CompanionMemory {
  const shared = history.filter(
    (record) => record.adventureId === adventureId,
  );
  const lastNamed = shared.find(
    (record) => record.focusIntent && record.focusIntent !== "자유 집중",
  );

  if (shared.length === 0) {
    return {
      completedTogether: 0,
      lastFocusIntent: null,
      message: "아직 함께 남긴 기록이 없어요. 오늘의 첫 모험을 기억해 둘게요.",
    };
  }

  const lastFocusIntent = lastNamed?.focusIntent ?? null;
  return {
    completedTogether: shared.length,
    lastFocusIntent,
    message: lastFocusIntent
      ? `“${lastFocusIntent}”을 함께했던 걸 기억하고 있어요.`
      : `${shared.length}번의 집중을 함께 완주했어요.`,
  };
}

export function getBehaviorInsights(
  history: FocusRecord[],
): BehaviorInsights {
  if (history.length === 0) {
    return {
      sampleSize: 0,
      averageMinutes: null,
      favoriteMinutes: null,
      favoriteHour: null,
      namedRate: 0,
      recommendation: "집중을 세 번 완주하면 나에게 맞는 리듬을 제안해요.",
    };
  }

  const durationCounts = new Map<number, number>();
  const hourCounts = new Map<number, number>();
  let totalMinutes = 0;
  let namedSessions = 0;
  let recordsWithStartTime = 0;

  for (const record of history) {
    durationCounts.set(
      record.durationMinutes,
      (durationCounts.get(record.durationMinutes) ?? 0) + 1,
    );
    if (record.startedAt) {
      const hour = new Date(record.startedAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      recordsWithStartTime += 1;
    }
    totalMinutes += record.durationMinutes;
    if (record.focusIntent && record.focusIntent !== "자유 집중") {
      namedSessions += 1;
    }
  }

  const favoriteMinutes = topNumericKey(durationCounts);
  const favoriteHour = recordsWithStartTime >= 3 ? topNumericKey(hourCounts) : null;
  const hasEnoughEvidence = history.length >= 3;

  return {
    sampleSize: history.length,
    averageMinutes: Math.round(totalMinutes / history.length),
    favoriteMinutes: hasEnoughEvidence ? favoriteMinutes : null,
    favoriteHour: hasEnoughEvidence ? favoriteHour : null,
    namedRate: Math.round((namedSessions / history.length) * 100),
    recommendation:
      hasEnoughEvidence && favoriteMinutes
        ? `최근 ${history.length}회 기록에서는 ${favoriteMinutes}분 집중이 가장 자주 완주됐어요.`
        : `기록 ${history.length}/3 · 조금 더 모이면 추천을 시작해요.`,
  };
}

function topNumericKey(counts: Map<number, number>) {
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0]?.[0] ?? null;
}

function getValidWorldRecords(
  history: FocusRecord[],
  adventureId: AdventureId,
) {
  return history.filter(
    (record) =>
      record.adventureId === adventureId &&
      record.durationMinutes >= WORLD_GROWTH_MINIMUM_MINUTES,
  );
}
