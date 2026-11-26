import {
  MAX_HISTORY_RECORDS,
  parseActiveSession,
  parseHistory,
  type ActiveSession,
  type AdventureId,
  type BgmId,
  type FocusRecord,
} from "./pomodoro.ts";
import {
  growthEntriesFromHistory,
  mergeCompanionGrowthEntries,
  parseCompanionGrowthEntries,
  type CompanionGrowthEntry,
} from "./companion-growth.ts";
import {
  parseRecoveryQuest,
  type RecoveryQuest,
} from "./retention.ts";

export const CLOUD_STATE_SCHEMA_VERSION = 4;
export const CLOUD_SYNC_DISABLED_KEY = "focus-quest-cloud-sync-disabled";
export const CLOUD_LOCAL_OWNER_KEY = "focus-quest-cloud-local-owner";
export const ACTIVE_SESSION_UPDATED_AT_KEY =
  "focus-quest-active-session-updated-at";
export const EMPTY_SESSION_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export type CloudPreferences = {
  focusMinutes: number;
  breakMinutes: number;
  bgm: BgmId;
  selectedId: AdventureId;
  soundOn: boolean;
};

export type CloudStateData = {
  schemaVersion: typeof CLOUD_STATE_SCHEMA_VERSION;
  preferences: CloudPreferences;
  history: FocusRecord[];
  activeSession: ActiveSession | null;
  sessionUpdatedAt: string;
  recoveryQuest: RecoveryQuest | null;
  recoveryUpdatedAt: string;
  companionGrowth: CompanionGrowthEntry[];
};

export type CloudStateRecord = {
  version: number;
  updatedAt: string;
  data: CloudStateData;
};

export type CloudAccount = {
  displayName: string;
  email: string;
};

export type AccountLocalStateResolution = {
  data: CloudStateData;
  source: "guest" | "same-account" | "empty-for-account-switch";
};

const adventureIds = new Set<AdventureId>(["hike", "swim", "fish"]);
const bgmIds = new Set<BgmId>(["forest", "waves", "lake", "quiet"]);

export function createEmptyCloudState(): CloudStateData {
  return {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    preferences: {
      focusMinutes: 25,
      breakMinutes: 5,
      bgm: "forest",
      selectedId: "hike",
      soundOn: true,
    },
    history: [],
    activeSession: null,
    sessionUpdatedAt: EMPTY_SESSION_UPDATED_AT,
    recoveryQuest: null,
    recoveryUpdatedAt: EMPTY_SESSION_UPDATED_AT,
    companionGrowth: [],
  };
}

/**
 * Guest data may migrate on first login; data owned by another account must not.
 * This is a cache isolation rule, not a substitute for database RLS.
 */
export function resolveLocalStateForAccount(
  local: CloudStateData,
  storedOwnerId: string | null,
  nextOwnerId: string,
): AccountLocalStateResolution {
  if (!storedOwnerId) {
    return { data: local, source: "guest" };
  }
  if (storedOwnerId === nextOwnerId) {
    return { data: local, source: "same-account" };
  }
  return {
    data: createEmptyCloudState(),
    source: "empty-for-account-switch",
  };
}

export function isCloudSyncDisabledForAccount(
  disabledOwnerId: string | null,
  currentOwnerId: string | null,
  localSource: AccountLocalStateResolution["source"] | null,
) {
  if (!disabledOwnerId) return false;
  if (currentOwnerId && disabledOwnerId === currentOwnerId) return true;
  return (
    disabledOwnerId === "true" &&
    localSource !== "empty-for-account-switch"
  );
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function parsePreferences(value: unknown): CloudPreferences | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CloudPreferences>;
  if (
    !isIntegerInRange(candidate.focusMinutes, 1, 120) ||
    !isIntegerInRange(candidate.breakMinutes, 1, 30) ||
    !candidate.bgm ||
    !bgmIds.has(candidate.bgm) ||
    !candidate.selectedId ||
    !adventureIds.has(candidate.selectedId) ||
    typeof candidate.soundOn !== "boolean"
  ) {
    return null;
  }

  return {
    focusMinutes: candidate.focusMinutes,
    breakMinutes: candidate.breakMinutes,
    bgm: candidate.bgm,
    selectedId: candidate.selectedId,
    soundOn: candidate.soundOn,
  };
}

/** Reads supported v1-v4 payloads and normalizes to v4; invalid records fail closed. */
export function parseCloudStateData(value: unknown): CloudStateData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<
    Omit<CloudStateData, "schemaVersion">
  > & { schemaVersion?: number };
  if (
    candidate.schemaVersion !== 1 &&
    candidate.schemaVersion !== 2 &&
    candidate.schemaVersion !== 3 &&
    candidate.schemaVersion !== 4
  ) {
    return null;
  }

  const preferences = parsePreferences(candidate.preferences);
  if (!preferences || !Array.isArray(candidate.history)) return null;

  const history = parseHistory(JSON.stringify(candidate.history));
  if (history.length !== candidate.history.length) return null;

  let activeSession: ActiveSession | null = null;
  let sessionUpdatedAt = EMPTY_SESSION_UPDATED_AT;
  if (candidate.schemaVersion >= 2) {
    if (
      typeof candidate.sessionUpdatedAt !== "string" ||
      Number.isNaN(Date.parse(candidate.sessionUpdatedAt))
    ) {
      return null;
    }
    sessionUpdatedAt = candidate.sessionUpdatedAt;
    if (candidate.activeSession !== null) {
      const parsed = parseActiveSession(JSON.stringify(candidate.activeSession));
      if (!parsed) return null;
      activeSession = parsed.session;
    }
  }

  let recoveryQuest: RecoveryQuest | null = null;
  let recoveryUpdatedAt = EMPTY_SESSION_UPDATED_AT;
  if (candidate.schemaVersion >= 3) {
    if (
      typeof candidate.recoveryUpdatedAt !== "string" ||
      Number.isNaN(Date.parse(candidate.recoveryUpdatedAt))
    ) {
      return null;
    }
    recoveryUpdatedAt = candidate.recoveryUpdatedAt;
    if (candidate.recoveryQuest !== null) {
      recoveryQuest = parseRecoveryQuest(
        JSON.stringify(candidate.recoveryQuest),
      );
    }
  }

  const companionGrowth =
    candidate.schemaVersion === 4
      ? parseCompanionGrowthEntries(candidate.companionGrowth)
      : growthEntriesFromHistory(history);
  if (!companionGrowth) return null;

  return {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    preferences,
    history,
    activeSession,
    sessionUpdatedAt,
    recoveryQuest,
    recoveryUpdatedAt,
    companionGrowth,
  };
}

/**
 * Merge policy: cloud preferences win; record IDs deduplicate history; the newest
 * session/recovery timestamps win (including null tombstones). Reflection savedAt
 * is resolved independently. Inputs are already validated and are not mutated.
 */
export function mergeCloudStates(
  local: CloudStateData,
  cloud: CloudStateData,
): CloudStateData {
  const records = new Map<string, FocusRecord>();
  [...cloud.history, ...local.history].forEach((record) => {
    const existing = records.get(record.id);
    const campOutcome = record.campOutcome ?? existing?.campOutcome;
    const existingReflection = existing?.campReflection;
    const incomingReflection = record.campReflection;
    const campReflection =
      incomingReflection && existingReflection
        ? Date.parse(incomingReflection.savedAt) >=
          Date.parse(existingReflection.savedAt)
          ? incomingReflection
          : existingReflection
        : incomingReflection ?? existingReflection;
    records.set(
      record.id,
      existing
        ? {
            ...existing,
            ...record,
            ...(campOutcome ? { campOutcome } : {}),
            ...(campReflection ? { campReflection } : {}),
          }
        : record,
    );
  });

  const history = [...records.values()]
    .sort(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    )
    .slice(0, MAX_HISTORY_RECORDS);
  const localSessionIsNewer =
    Date.parse(local.sessionUpdatedAt) > Date.parse(cloud.sessionUpdatedAt);
  const sessionSource = localSessionIsNewer ? local : cloud;
  const localRecoveryIsNewer =
    Date.parse(local.recoveryUpdatedAt) >
    Date.parse(cloud.recoveryUpdatedAt);
  const recoverySource = localRecoveryIsNewer ? local : cloud;
  const companionGrowth = mergeCompanionGrowthEntries(
    cloud.companionGrowth ?? growthEntriesFromHistory(cloud.history),
    local.companionGrowth ?? growthEntriesFromHistory(local.history),
    growthEntriesFromHistory(history),
  );

  return {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    preferences: cloud.preferences,
    history,
    activeSession: sessionSource.activeSession,
    sessionUpdatedAt: sessionSource.sessionUpdatedAt,
    recoveryQuest: recoverySource.recoveryQuest,
    recoveryUpdatedAt: recoverySource.recoveryUpdatedAt,
    companionGrowth,
  };
}
