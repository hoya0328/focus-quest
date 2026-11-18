import type {
  ActiveSession,
  AdventureId,
  BgmId,
  SessionMode,
} from "./pomodoro.ts";

const adventures = new Set<AdventureId>(["hike", "swim", "fish"]);
const bgms = new Set<BgmId>(["forest", "waves", "lake", "quiet"]);
const modes = new Set<SessionMode>(["focus", "break"]);
const CAMP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SilentCampMember = {
  memberId: string;
  joinedAt: string;
  nickname: string;
  adventureId: AdventureId;
  focusMinutes: number;
};

export type SilentCampChatMessage = {
  id: string;
  senderId: string;
  nickname: string;
  body: string;
  sentAt: string;
};

export type SilentCampTimer = {
  version: 1;
  mode: SessionMode;
  durationMinutes: number;
  remainingSeconds: number;
  endAt: number | null;
  paused: boolean;
  startedAt: string;
  adventureId: AdventureId;
  bgm: BgmId;
};

export function normalizeCampCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
}

export function createCampCode(random = Math.random) {
  let code = "";
  while (code.length < 8) {
    code += Math.floor(random() * 36).toString(36);
  }
  return normalizeCampCode(code).padEnd(8, "0");
}

export function createSecureCampCode() {
  if (!globalThis.crypto?.getRandomValues) return createCampCode();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(
    bytes,
    (value) => CAMP_CODE_ALPHABET[value % CAMP_CODE_ALPHABET.length],
  ).join("");
}

export function readCampCodeFromUrl(value: string | URL) {
  const url = typeof value === "string" ? new URL(value) : value;
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashCode = new URLSearchParams(hash).get("camp") ?? "";
  return normalizeCampCode(hashCode || url.searchParams.get("camp") || "");
}

export function createCampInviteUrl(value: string | URL, code: string) {
  const url = new URL(value.toString());
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  url.searchParams.delete("camp");
  hashParams.set("camp", normalizeCampCode(code));
  url.hash = hashParams.toString();
  return url.toString();
}

export function normalizeCampNickname(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 12);
}

export function normalizeCampChatMessage(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function parseSilentCampMember(value: unknown): SilentCampMember | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Partial<SilentCampMember>;
  const nickname = normalizeCampNickname(member.nickname ?? "");
  if (
    typeof member.memberId !== "string" ||
    member.memberId.length < 1 ||
    member.memberId.length > 64 ||
    typeof member.joinedAt !== "string" ||
    Number.isNaN(Date.parse(member.joinedAt)) ||
    !nickname ||
    !member.adventureId ||
    !adventures.has(member.adventureId) ||
    !Number.isInteger(member.focusMinutes) ||
    Number(member.focusMinutes) < 1 ||
    Number(member.focusMinutes) > 120
  ) {
    return null;
  }
  return {
    memberId: member.memberId,
    joinedAt: member.joinedAt,
    nickname,
    adventureId: member.adventureId,
    focusMinutes: Number(member.focusMinutes),
  };
}

export function parseSilentCampChatMessage(
  value: unknown,
): SilentCampChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<SilentCampChatMessage>;
  const nickname = normalizeCampNickname(message.nickname ?? "");
  const body = normalizeCampChatMessage(message.body ?? "");
  if (
    typeof message.id !== "string" ||
    message.id.length < 1 ||
    message.id.length > 64 ||
    typeof message.senderId !== "string" ||
    message.senderId.length < 1 ||
    message.senderId.length > 64 ||
    !nickname ||
    !body ||
    typeof message.sentAt !== "string" ||
    Number.isNaN(Date.parse(message.sentAt))
  ) {
    return null;
  }
  return {
    id: message.id,
    senderId: message.senderId,
    nickname,
    body,
    sentAt: message.sentAt,
  };
}

export function electSilentCampLeader(
  members: SilentCampMember[],
  currentLeaderId: string | null = null,
) {
  if (
    currentLeaderId &&
    members.some((member) => member.memberId === currentLeaderId)
  ) {
    return currentLeaderId;
  }
  return [...members]
    .filter(
      (member) =>
        member.memberId.length > 0 &&
        !Number.isNaN(Date.parse(member.joinedAt)),
    )
    .sort(
      (left, right) =>
        Date.parse(left.joinedAt) - Date.parse(right.joinedAt) ||
        left.memberId.localeCompare(right.memberId),
    )[0]?.memberId ?? null;
}

export function toSilentCampTimer(
  session: ActiveSession | null,
): SilentCampTimer | null {
  if (!session) return null;
  return {
    version: 1,
    mode: session.mode,
    durationMinutes: session.durationMinutes,
    remainingSeconds: session.remainingSeconds,
    endAt: session.endAt,
    paused: session.paused,
    startedAt: session.startedAt,
    adventureId: session.adventureId,
    bgm: session.bgm,
  };
}

export function parseSilentCampTimer(value: unknown): SilentCampTimer | null {
  if (!value || typeof value !== "object") return null;
  const timer = value as Partial<SilentCampTimer>;
  if (
    timer.version !== 1 ||
    !timer.mode ||
    !modes.has(timer.mode) ||
    !Number.isInteger(timer.durationMinutes) ||
    Number(timer.durationMinutes) < 1 ||
    Number(timer.durationMinutes) > 120 ||
    !Number.isInteger(timer.remainingSeconds) ||
    Number(timer.remainingSeconds) < 0 ||
    Number(timer.remainingSeconds) > 120 * 60 ||
    Number(timer.remainingSeconds) > Number(timer.durationMinutes) * 60 ||
    typeof timer.paused !== "boolean" ||
    typeof timer.startedAt !== "string" ||
    Number.isNaN(Date.parse(timer.startedAt)) ||
    !timer.adventureId ||
    !adventures.has(timer.adventureId) ||
    !timer.bgm ||
    !bgms.has(timer.bgm) ||
    (!timer.paused &&
      (typeof timer.endAt !== "number" ||
        !Number.isFinite(timer.endAt) ||
        timer.endAt <= 0)) ||
    (timer.paused && timer.endAt !== null)
  ) {
    return null;
  }
  return timer as SilentCampTimer;
}

export function createLocalCampSession(
  timer: SilentCampTimer,
  now = Date.now(),
  localAdventureId = timer.adventureId,
  localBgm = timer.bgm,
): ActiveSession {
  const remainingSeconds = timer.paused
    ? timer.remainingSeconds
    : Math.min(
        timer.remainingSeconds,
        Math.max(0, Math.ceil(((timer.endAt ?? now) - now) / 1_000)),
      );
  return {
    version: 1,
    mode: timer.mode,
    durationMinutes: timer.durationMinutes,
    remainingSeconds,
    endAt: timer.paused ? null : now + remainingSeconds * 1_000,
    paused: timer.paused,
    startedAt: timer.startedAt,
    adventureId: localAdventureId,
    bgm: localBgm,
    focusIntent: timer.mode === "focus" ? "친구와 함께 집중" : undefined,
  };
}
