export type SessionMode = "focus" | "break";
export type AdventureId = "hike" | "swim" | "fish";
export type BgmId = "forest" | "waves" | "lake" | "quiet";

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
};

export type FocusRecord = {
  id: string;
  completedAt: string;
  durationMinutes: number;
  adventureId: AdventureId;
  questId?: string;
  focusIntent?: string;
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

const adventureIds = new Set<AdventureId>(["hike", "swim", "fish"]);
const bgmIds = new Set<BgmId>(["forest", "waves", "lake", "quiet"]);
const modes = new Set<SessionMode>(["focus", "break"]);
const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
  now = Date.now(),
}: {
  mode: SessionMode;
  durationMinutes: number;
  adventureId: AdventureId;
  bgm: BgmId;
  questId?: string;
  focusIntent?: string;
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
              record.focusIntent.length > 0)),
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
  completedAt = new Date(),
}: {
  durationMinutes: number;
  adventureId: AdventureId;
  questId?: string;
  focusIntent?: string;
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
  };
}

export function addFocusRecord(
  history: FocusRecord[],
  record: FocusRecord,
) {
  if (history.some((item) => item.id === record.id)) return history;
  return [record, ...history].slice(0, MAX_HISTORY_RECORDS);
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
