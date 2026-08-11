export type SessionMode = "focus" | "break";
export type AdventureId = "hike" | "swim" | "fish";
export type BgmId = "forest" | "waves" | "lake" | "quiet";
export type CampOutcome = "finished" | "unfinished" | "split";

export type ExpeditionProgress = {
  id: string;
  currentSet: number;
  totalSets: number;
  focusMinutes: number;
  breakMinutes: number;
};

export type RecoveryQuest = {
  createdAt: string;
  focusIntent: string;
  durationMinutes: 5 | 10;
  adventureId: AdventureId;
  bgm: BgmId;
  questId?: string;
};

export type ActiveSession = {
  version: 1;
  mode: SessionMode;
  durationMinutes: number;
  remainingSeconds: number;
  endAt: number | null;
  paused: boolean;
  startedAt: string;
  adventureId: AdventureId;
  bgm: BgmId;
  questId?: string;
  focusIntent?: string;
  expedition?: ExpeditionProgress;
};

export type FocusRecord = {
  id: string;
  completedAt: string;
  durationMinutes: number;
  adventureId: AdventureId;
  questId?: string;
  focusIntent?: string;
  campOutcome?: CampOutcome;
  expeditionId?: string;
  expeditionSet?: number;
  expeditionTotal?: number;
};

export type WeeklyDay = {
  date: string;
  label: string;
  minutes: number;
  sessions: number;
};

export type WeeklySummary = {
  minutes: number;
  sessions: number;
  activeDays: number;
  days: WeeklyDay[];
};

export const ACTIVE_SESSION_KEY = "haru-focus-active-session";
export const HISTORY_KEY = "haru-focus-history";
export const MAX_HISTORY_RECORDS = 400;
export const MAX_FOCUS_INTENT_LENGTH = 80;
export const RECOVERY_QUEST_KEY = "focus-quest-recovery";

const adventureIds = new Set<AdventureId>(["hike", "swim", "fish"]);
const bgmIds = new Set<BgmId>(["forest", "waves", "lake", "quiet"]);
const modes = new Set<SessionMode>(["focus", "break"]);
const campOutcomes = new Set<CampOutcome>([
  "finished",
  "unfinished",
  "split",
]);
const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isValidExpedition(value: unknown): value is ExpeditionProgress {
  if (!value || typeof value !== "object") return false;
  const expedition = value as Partial<ExpeditionProgress>;
  return (
    typeof expedition.id === "string" &&
    expedition.id.length > 0 &&
    isIntegerInRange(expedition.totalSets, 2, 8) &&
    isIntegerInRange(expedition.currentSet, 1, expedition.totalSets ?? 0) &&
    isIntegerInRange(expedition.focusMinutes, 1, 120) &&
    isIntegerInRange(expedition.breakMinutes, 1, 30)
  );
}

export function normalizeFocusIntent(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_FOCUS_INTENT_LENGTH);
}

export function localDateKey(input: Date | number | string = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function createActiveSession({
  mode,
  durationMinutes,
  adventureId,
  bgm,
  questId,
  focusIntent,
  expedition,
  now = Date.now(),
}: {
  mode: SessionMode;
  durationMinutes: number;
  adventureId: AdventureId;
  bgm: BgmId;
  questId?: string;
  focusIntent?: string;
  expedition?: ExpeditionProgress;
  now?: number;
}): ActiveSession {
  const seconds = Math.max(1, Math.round(durationMinutes * 60));
  const normalizedIntent = normalizeFocusIntent(focusIntent);
  return {
    version: 1,
    mode,
    durationMinutes,
    remainingSeconds: seconds,
    endAt: now + seconds * 1000,
    paused: false,
    startedAt: new Date(now).toISOString(),
    adventureId,
    bgm,
    ...(questId ? { questId } : {}),
    ...(normalizedIntent ? { focusIntent: normalizedIntent } : {}),
    ...(expedition ? { expedition } : {}),
  };
}

export function remainingForSession(session: ActiveSession, now = Date.now()) {
  if (session.paused || session.endAt === null) {
    return Math.max(0, Math.ceil(session.remainingSeconds));
  }
  return Math.max(0, Math.ceil((session.endAt - now) / 1000));
}

export function pauseActiveSession(
  session: ActiveSession,
  remainingSeconds: number,
): ActiveSession {
  return {
    ...session,
    paused: true,
    endAt: null,
    remainingSeconds: Math.max(0, Math.ceil(remainingSeconds)),
  };
}

export function resumeActiveSession(
  session: ActiveSession,
  now = Date.now(),
): ActiveSession {
  const remainingSeconds = Math.max(1, Math.ceil(session.remainingSeconds));
  return {
    ...session,
    paused: false,
    remainingSeconds,
    endAt: now + remainingSeconds * 1000,
  };
}

export function parseActiveSession(raw: string | null, now = Date.now()) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ActiveSession>;
    if (
      value.version !== 1 ||
      !value.mode ||
      !modes.has(value.mode) ||
      !isFinitePositive(value.durationMinutes) ||
      !isFinitePositive(value.remainingSeconds) ||
      typeof value.paused !== "boolean" ||
      typeof value.startedAt !== "string" ||
      !value.adventureId ||
      !adventureIds.has(value.adventureId) ||
      !value.bgm ||
      !bgmIds.has(value.bgm) ||
      (value.questId !== undefined &&
        (typeof value.questId !== "string" || value.questId.length === 0)) ||
      (value.focusIntent !== undefined &&
        (normalizeFocusIntent(value.focusIntent) !== value.focusIntent ||
          value.focusIntent.length === 0)) ||
      (value.expedition !== undefined && !isValidExpedition(value.expedition)) ||
      (!value.paused && !isFinitePositive(value.endAt))
    ) {
      return null;
    }

    const session = value as ActiveSession;
    return {
      session,
      remainingSeconds: remainingForSession(session, now),
      expired: remainingForSession(session, now) <= 0,
    };
  } catch {
    return null;
  }
}

export function parseHistory(raw: string | null): FocusRecord[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (record): record is FocusRecord =>
          record &&
          typeof record.id === "string" &&
          typeof record.completedAt === "string" &&
          !Number.isNaN(Date.parse(record.completedAt)) &&
          isFinitePositive(record.durationMinutes) &&
          adventureIds.has(record.adventureId) &&
          (record.questId === undefined ||
            (typeof record.questId === "string" && record.questId.length > 0)) &&
          (record.focusIntent === undefined ||
            (typeof record.focusIntent === "string" &&
              normalizeFocusIntent(record.focusIntent) === record.focusIntent &&
              record.focusIntent.length > 0)) &&
          (record.campOutcome === undefined ||
            campOutcomes.has(record.campOutcome)) &&
          ((record.expeditionId === undefined &&
            record.expeditionSet === undefined &&
            record.expeditionTotal === undefined) ||
            (typeof record.expeditionId === "string" &&
              record.expeditionId.length > 0 &&
              isIntegerInRange(record.expeditionTotal, 2, 8) &&
              isIntegerInRange(record.expeditionSet, 1, record.expeditionTotal))),
      )
      .slice(0, MAX_HISTORY_RECORDS);
  } catch {
    return [];
  }
}

export function createFocusRecord({
  durationMinutes,
  adventureId,
  questId,
  focusIntent,
  expedition,
  completedAt = new Date(),
}: {
  durationMinutes: number;
  adventureId: AdventureId;
  questId?: string;
  focusIntent?: string;
  expedition?: ExpeditionProgress;
  completedAt?: Date;
}): FocusRecord {
  const iso = completedAt.toISOString();
  const normalizedIntent = normalizeFocusIntent(focusIntent);
  return {
    id: `${completedAt.getTime()}-${adventureId}`,
    completedAt: iso,
    durationMinutes,
    adventureId,
    ...(questId ? { questId } : {}),
    ...(normalizedIntent ? { focusIntent: normalizedIntent } : {}),
    ...(expedition
      ? {
          expeditionId: expedition.id,
          expeditionSet: expedition.currentSet,
          expeditionTotal: expedition.totalSets,
        }
      : {}),
  };
}

export function addFocusRecord(
  history: FocusRecord[],
  record: FocusRecord,
) {
  if (history.some((item) => item.id === record.id)) return history;
  return [record, ...history].slice(0, MAX_HISTORY_RECORDS);
}

export function addCampOutcome(
  history: FocusRecord[],
  recordId: string,
  campOutcome: CampOutcome,
) {
  return history.map((record) =>
    record.id === recordId ? { ...record, campOutcome } : record,
  );
}

export function getDailyCount(
  history: FocusRecord[],
  date: Date | number | string = new Date(),
) {
  const key = localDateKey(date);
  return history.filter((record) => localDateKey(record.completedAt) === key)
    .length;
}

export function getWeeklySummary(
  history: FocusRecord[],
  input: Date | number | string = new Date(),
): WeeklySummary {
  const date = input instanceof Date ? new Date(input) : new Date(input);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - mondayOffset);

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return {
      date: localDateKey(day),
      label: dayLabels[day.getDay()],
      minutes: 0,
      sessions: 0,
    };
  });

  const dayMap = new Map(days.map((day) => [day.date, day]));
  history.forEach((record) => {
    const day = dayMap.get(localDateKey(record.completedAt));
    if (!day) return;
    day.sessions += 1;
    day.minutes += record.durationMinutes;
  });

  return {
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    sessions: days.reduce((sum, day) => sum + day.sessions, 0),
    activeDays: days.filter((day) => day.sessions > 0).length,
    days,
  };
}

export function createExpeditionProgress({
  totalSets,
  focusMinutes,
  breakMinutes,
  now = Date.now(),
}: {
  totalSets: number;
  focusMinutes: number;
  breakMinutes: number;
  now?: number;
}): ExpeditionProgress {
  return {
    id: `expedition-${now}`,
    currentSet: 1,
    totalSets: Math.min(8, Math.max(2, Math.round(totalSets))),
    focusMinutes: Math.min(120, Math.max(1, Math.round(focusMinutes))),
    breakMinutes: Math.min(30, Math.max(1, Math.round(breakMinutes))),
  };
}

export function parseRecoveryQuest(raw: string | null): RecoveryQuest | null {
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
    return value as RecoveryQuest;
  } catch {
    return null;
  }
}

export function getBehaviorInsights(history: FocusRecord[]) {
  if (history.length === 0) {
    return { favoriteMinutes: null, favoriteHour: null, namedRate: 0 };
  }
  const durationCounts = new Map<number, number>();
  const hourCounts = new Map<number, number>();
  history.forEach((record) => {
    durationCounts.set(record.durationMinutes, (durationCounts.get(record.durationMinutes) ?? 0) + 1);
    const hour = new Date(record.completedAt).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  });
  const topKey = (counts: Map<number, number>) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  return {
    favoriteMinutes: topKey(durationCounts),
    favoriteHour: topKey(hourCounts),
    namedRate: Math.round((history.filter((record) => record.focusIntent && record.focusIntent !== "자유 집중").length / history.length) * 100),
  };
}
