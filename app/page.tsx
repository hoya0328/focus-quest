"use client";

/* Local-storage hydration intentionally restores several client-only state values. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import AdventureQuestScene from "@/app/components/AdventureQuestScene";
import AuthDialog from "@/app/components/AuthDialog";
import FishingQuestScene from "@/app/components/FishingQuestScene";
import QuestBoard from "@/app/components/QuestBoard";
import { useCloudSync } from "@/app/hooks/useCloudSync";
import { useStudyQuests } from "@/app/hooks/useStudyQuests";
import {
  ACTIVE_SESSION_UPDATED_AT_KEY,
  CLOUD_STATE_SCHEMA_VERSION,
  EMPTY_SESSION_UPDATED_AT,
  type CloudStateData,
} from "@/lib/cloud-state";
import {
  ACTIVE_SESSION_KEY,
  HISTORY_KEY,
  RECOVERY_QUEST_KEY,
  addCampOutcome,
  addFocusRecord,
  createActiveSession,
  createFocusRecord,
  createExpeditionProgress,
  getBehaviorInsights,
  getDailyCount,
  getWeeklySummary,
  normalizeFocusIntent,
  parseActiveSession,
  parseHistory,
  parseRecoveryQuest,
  pauseActiveSession,
  resumeActiveSession,
  type ActiveSession,
  type AdventureId,
  type BgmId,
  type CampOutcome,
  type FocusRecord,
  type ExpeditionProgress,
  type RecoveryQuest,
  type SessionMode,
} from "@/lib/pomodoro";
import type { StudyQuest } from "@/lib/study-quests";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

type Screen = "select" | "setup" | "focus" | "complete";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const FOCUS_INTENT_KEY = "focus-quest-focus-intent";
const EXPEDITION_SETS_KEY = "focus-quest-expedition-sets";
const NOTIFICATION_KEY = "focus-quest-notifications";
const REMINDER_TIME_KEY = "focus-quest-reminder-time";
const REMINDER_SENT_KEY = "focus-quest-reminder-sent";
const quickFocusOptions = [
  { minutes: 10, label: "몸풀기", note: "가볍게 시작" },
  { minutes: 25, label: "기본 집중", note: "한 칸 완주" },
  { minutes: 45, label: "깊은 집중", note: "긴 호흡 몰입" },
] as const;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type DocumentPictureInPicture = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};

type Adventure = {
  id: AdventureId;
  chapter: string;
  name: string;
  friend: string;
  role: string;
  tagline: string;
  description: string;
  image: string;
  background: string;
  color: string;
  soft: string;
  icon: string;
};

const adventures: Adventure[] = [
  {
    id: "hike",
    chapter: "ROUTE 01",
    name: "해오름 봉우리",
    friend: "모리",
    role: "씩씩한 산길잡이",
    tagline: "노을숲 능선을 올라 정상에 깃발을 세워요.",
    description:
      "한 걸음씩 오를수록 숲이 걷히고, 마지막엔 바람 부는 정상에서 깃발이 펼쳐져요.",
    image: `${publicBasePath}/characters/momo-hiking.png`,
    background: `${publicBasePath}/backgrounds/hike-pixel-summit-v1.png`,
    color: "#f0b13e",
    soft: "#173d37",
    icon: "⛰",
  },
  {
    id: "swim",
    chapter: "DIVE 02",
    name: "유리산호 유적",
    friend: "나루",
    role: "호기심 많은 유적 잠수부",
    tagline: "산호길 끝의 오래된 보물상자를 깨워요.",
    description:
      "햇빛이 스미는 해저 유적을 건너면, 잠들어 있던 보물상자가 황금빛으로 열려요.",
    image: `${publicBasePath}/characters/podo-swimming.png`,
    background: `${publicBasePath}/backgrounds/swim-pixel-depth.png`,
    color: "#36c4ce",
    soft: "#103b50",
    icon: "≈",
  },
  {
    id: "fish",
    chapter: "CAST 03",
    name: "달비늘 호수",
    friend: "보리",
    role: "느긋한 전설 낚시꾼",
    tagline: "달빛 부두에서 전설의 황금 잉어를 기다려요.",
    description:
      "잔잔한 수면에 낚싯줄을 드리우고 기다리면, 마지막엔 황금 잉어가 힘차게 뛰어올라요.",
    image: `${publicBasePath}/characters/bori-fishing.png`,
    background: `${publicBasePath}/backgrounds/fish-pixel-lake-v1.png`,
    color: "#ef8b47",
    soft: "#204847",
    icon: "◌",
  },
];

const bgms: { id: BgmId; name: string; note: string; icon: string }[] = [
  { id: "forest", name: "숲의 숨", note: "포근한 화음", icon: "♬" },
  { id: "waves", name: "푸른 물결", note: "잔잔한 파도", icon: "≈" },
  { id: "lake", name: "호숫가 오후", note: "느린 종소리", icon: "◌" },
  { id: "quiet", name: "고요히", note: "음악 없이", icon: "—" },
];

const adventureBgms: Record<AdventureId, BgmId> = {
  hike: "forest",
  swim: "waves",
  fish: "lake",
};

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${padTime(Math.floor(safe / 60))}:${padTime(safe % 60)}`;
}

function getAdventureNarration(
  adventureId: AdventureId,
  progress: number,
  mode: SessionMode,
) {
  if (mode === "break") return "모닥불 옆에서 다음 모험을 준비하고 있어요";

  const percent = Math.round(progress * 100);
  if (adventureId === "fish") {
    if (percent < 30) return "첫 번째 캐스팅 · 호수는 아직 조용해요";
    if (percent < 70) return "다시 한번 캐스팅 · 입질을 기다리는 중";
    if (percent < 95) return "마지막 포인트 탐색 · 집중을 유지해요";
    return "낚싯대가 크게 흔들려요 · 거의 다 왔어요!";
  }

  if (adventureId === "hike") {
    if (percent < 30) return "울창한 숲길 · 호흡을 맞추며 걷는 중";
    if (percent < 70) return "능선 오르막 · 한 걸음씩 정상을 향해";
    if (percent < 95) return "정상 바로 아래 · 마지막 발걸음";
    return "정상 깃발이 보여요 · 거의 다 왔어요!";
  }

  if (percent < 30) return "얕은 산호초 · 물살을 타고 탐험 중";
  if (percent < 70) return "푸른 해저 동굴 · 반짝임을 따라가는 중";
  if (percent < 95) return "보물의 흔적 발견 · 조금만 더 헤엄쳐요";
  return "해저 보물에 도착했어요 · 거의 다 왔어요!";
}

function isFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;
  return Boolean(
    document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement,
  );
}

function enterFullscreen() {
  const element = document.documentElement as FullscreenElement;
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  if (!request) return;
  try {
    const result = request.call(element);
    if (result instanceof Promise) void result.catch(() => undefined);
  } catch {
    // Standalone PWAs and iOS Safari already use the full viewport.
  }
}

function leaveFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;
  const exit =
    document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen;
  if (!exit || !isFullscreen()) return;
  try {
    const result = exit.call(document);
    if (result instanceof Promise) void result.catch(() => undefined);
  } catch {
    // Some mobile browsers do not expose a fullscreen exit API.
  }
}

function createAmbientSound(theme: Exclude<BgmId, "quiet">) {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.055;
  master.connect(context.destination);

  const frequencies =
    theme === "forest"
      ? [174.61, 261.63, 349.23]
      : theme === "lake"
        ? [220, 277.18, 329.63]
        : [130.81, 196, 261.63];

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    oscillator.type = index === 1 && theme === "lake" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = theme === "lake" ? 0.065 : 0.08;
    lfo.frequency.value = 0.03 + index * 0.015;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    lfo.start();
  });

  if (theme === "waves") {
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 2.4;
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const waveLfo = context.createOscillator();
    const waveDepth = context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 760;
    noiseGain.gain.value = 0.11;
    waveLfo.frequency.value = 0.08;
    waveDepth.gain.value = 0.08;
    waveLfo.connect(waveDepth);
    waveDepth.connect(noiseGain.gain);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    waveLfo.start();
  }

  void context.resume();
  return context;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("select");
  const [selectedId, setSelectedId] = useState<AdventureId>("hike");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [bgm, setBgm] = useState<BgmId>("forest");
  const [remaining, setRemaining] = useState(25 * 60);
  const [sessionMode, setSessionMode] = useState<SessionMode>("focus");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(25);
  const [completionMode, setCompletionMode] = useState<SessionMode>("focus");
  const [endAt, setEndAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [completedToday, setCompletedToday] = useState(0);
  const [history, setHistory] = useState<FocusRecord[]>([]);
  const [cloudActiveSession, setCloudActiveSession] =
    useState<ActiveSession | null>(null);
  const [sessionUpdatedAt, setSessionUpdatedAt] = useState(
    EMPTY_SESSION_UPDATED_AT,
  );
  const [showExit, setShowExit] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);
  const [focusIntent, setFocusIntent] = useState("");
  const [campOutcome, setCampOutcome] = useState<CampOutcome | null>(null);
  const [completedRecordId, setCompletedRecordId] = useState<string | null>(null);
  const [completedQuestId, setCompletedQuestId] = useState<string | null>(null);
  const [expeditionSets, setExpeditionSets] = useState(1);
  const [sessionExpedition, setSessionExpedition] = useState<ExpeditionProgress | null>(null);
  const [completedExpedition, setCompletedExpedition] = useState<ExpeditionProgress | null>(null);
  const [recoveryQuest, setRecoveryQuest] = useState<RecoveryQuest | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("");
  const [miniTimerSupported, setMiniTimerSupported] = useState(false);
  const [silentCampCode, setSilentCampCode] = useState("");
  const [silentCampStatus, setSilentCampStatus] = useState<"idle" | "connecting" | "joined" | "error">("idle");
  const [silentCampCount, setSilentCampCount] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const completionLockRef = useRef(false);
  const completeQuestSetRef = useRef<
    ((questId: string, sessionId: string, durationMinutes: number) => void) | null
  >(null);
  const miniTimerWindowRef = useRef<Window | null>(null);
  const silentCampChannelRef = useRef<RealtimeChannel | null>(null);

  const selected = useMemo(
    () => adventures.find((item) => item.id === selectedId) ?? adventures[0],
    [selectedId],
  );

  const totalSeconds = Math.max(1, sessionDurationMinutes * 60);
  const progress = Math.min(1, Math.max(0, 1 - remaining / totalSeconds));
  const adventureNarration = getAdventureNarration(
    selectedId,
    progress,
    sessionMode,
  );
  const weeklySummary = useMemo(
    () => getWeeklySummary(history),
    [history],
  );
  const behaviorInsights = useMemo(() => getBehaviorInsights(history), [history]);
  const recentAdventures = useMemo(() => {
    const seenExpeditions = new Set<string>();
    return history
      .filter((record) => {
        if (!record.expeditionId) return true;
        if (seenExpeditions.has(record.expeditionId)) return false;
        seenExpeditions.add(record.expeditionId);
        return true;
      })
      .slice(0, 4);
  }, [history]);
  const selectedWorldCount = history.filter(
    (record) => record.adventureId === selectedId,
  ).length;
  const selectedWorldLevel = Math.min(5, 1 + Math.floor(selectedWorldCount / 3));
  const companionMemory = history[0]
    ? `${history[0].focusIntent || "지난 목표"} 모험을 기억하고 있어요.`
    : `${selected.friend}와 첫 번째 발자국을 남겨 보세요.`;
  const maxDayMinutes = Math.max(
    1,
    ...weeklySummary.days.map((day) => day.minutes),
  );
  const cloudData = useMemo<CloudStateData>(
    () => ({
      schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
      preferences: {
        focusMinutes,
        breakMinutes,
        bgm,
        selectedId,
        soundOn,
      },
      history,
      activeSession: cloudActiveSession,
      sessionUpdatedAt,
    }),
    [
      bgm,
      breakMinutes,
      cloudActiveSession,
      focusMinutes,
      history,
      selectedId,
      sessionUpdatedAt,
      soundOn,
    ],
  );
  const applyCloudState = useCallback((data: CloudStateData) => {
    const { preferences } = data;
    const previousSession = activeSessionRef.current;
    setFocusMinutes(preferences.focusMinutes);
    setBreakMinutes(preferences.breakMinutes);
    setBgm(preferences.bgm);
    setSelectedId(preferences.selectedId);
    setSoundOn(preferences.soundOn);
    setHistory(data.history);
    setCompletedToday(getDailyCount(data.history));
    window.localStorage.setItem(
      "haru-focus-preferences",
      JSON.stringify(preferences),
    );
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(data.history));
    setCloudActiveSession(data.activeSession);
    setSessionUpdatedAt(data.sessionUpdatedAt);
    window.localStorage.setItem(
      ACTIVE_SESSION_UPDATED_AT_KEY,
      data.sessionUpdatedAt,
    );

    if (data.activeSession) {
      const restored = parseActiveSession(JSON.stringify(data.activeSession));
      if (restored && !restored.expired) {
        const { session, remainingSeconds } = restored;
        completionLockRef.current = false;
        activeSessionRef.current = session;
        window.localStorage.setItem(
          ACTIVE_SESSION_KEY,
          JSON.stringify(session),
        );
        setSelectedId(session.adventureId);
        setActiveQuestId(session.questId ?? null);
        setFocusIntent(session.focusIntent ?? "");
        setBgm(session.bgm);
        setSessionMode(session.mode);
        setSessionExpedition(session.expedition ?? null);
        setSessionDurationMinutes(session.durationMinutes);
        setRemaining(remainingSeconds);
        setEndAt(session.endAt);
        setPaused(session.paused);
        setShowExit(false);
        setIsCelebrating(false);
        setScreen("focus");
        return;
      }
      if (restored?.expired) {
        const { session } = restored;
        const clearedAt = new Date().toISOString();
        let nextHistory = data.history;
        if (session.mode === "focus") {
          const record = {
            ...createFocusRecord({
              durationMinutes: session.durationMinutes,
              adventureId: session.adventureId,
              questId: session.questId,
              focusIntent: session.focusIntent,
              expedition: session.expedition,
              completedAt: new Date(session.endAt ?? Date.now()),
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          nextHistory = addFocusRecord(nextHistory, record);
          setCompletedRecordId(record.id);
          setCompletedQuestId(session.questId ?? null);
          setCampOutcome(record.campOutcome ?? null);
          setHistory(nextHistory);
          setCompletedToday(getDailyCount(nextHistory));
          window.localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(nextHistory),
          );
          if (session.questId) {
            completeQuestSetRef.current?.(
              session.questId,
              `${session.startedAt}-${session.adventureId}`,
              session.durationMinutes,
            );
          }
        }
        activeSessionRef.current = null;
        setCloudActiveSession(null);
        setSessionUpdatedAt(clearedAt);
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        window.localStorage.setItem(
          ACTIVE_SESSION_UPDATED_AT_KEY,
          clearedAt,
        );
        setCompletionMode(session.mode);
        setCompletedExpedition(session.expedition ?? null);
        setFocusIntent(session.focusIntent ?? "");
        setEndAt(null);
        setPaused(false);
        setRemaining(0);
        setShowExit(false);
        setIsCelebrating(false);
        setScreen("complete");
        return;
      }
    }

    activeSessionRef.current = null;
    setActiveQuestId(null);
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    setEndAt(null);
    setPaused(false);
    setShowExit(false);
    setIsCelebrating(false);
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }

    if (previousSession) {
      const completedId = `${previousSession.startedAt}-${previousSession.adventureId}`;
      const completedElsewhere = data.history.some(
        (record) => record.id === completedId,
      );
      if (completedElsewhere) {
        const completedRecord = data.history.find(
          (record) => record.id === completedId,
        );
        setCompletedRecordId(completedId);
        setCompletedQuestId(previousSession.questId ?? null);
        setCampOutcome(completedRecord?.campOutcome ?? null);
        setCompletionMode(previousSession.mode);
        setCompletedExpedition(previousSession.expedition ?? null);
        setRemaining(0);
        setScreen("complete");
      } else {
        setSessionMode("focus");
        setSessionDurationMinutes(preferences.focusMinutes);
        setRemaining(preferences.focusMinutes * 60);
        setScreen("select");
      }
    }
  }, []);
  const cloudSync = useCloudSync({
    applyCloudState,
    data: cloudData,
    hydrated,
  });
  const questLoggedIn =
    cloudSync.authProvider === "supabase" && Boolean(cloudSync.account);
  const questStore = useStudyQuests(questLoggedIn);
  const completeQuestSet = questStore.completeSet;

  useEffect(() => {
    completeQuestSetRef.current = (questId, sessionId, durationMinutes) => {
      void completeQuestSet(questId, sessionId, durationMinutes)
        .then((quest) => {
          if (quest?.status === "completed") setActiveQuestId(null);
        });
    };
  }, [completeQuestSet]);

  useEffect(() => {
    const stored = window.localStorage.getItem("haru-focus-preferences");
    const storedFocusIntent = window.localStorage.getItem(FOCUS_INTENT_KEY);
    const storedExpeditionSets = Number(window.localStorage.getItem(EXPEDITION_SETS_KEY));
    const storedRecoveryQuest = window.localStorage.getItem(RECOVERY_QUEST_KEY);
    const storedReminderTime = window.localStorage.getItem(REMINDER_TIME_KEY) ?? "";
    const stats = window.localStorage.getItem("haru-focus-stats");
    const storedHistory = window.localStorage.getItem(HISTORY_KEY);
    const storedSession = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    const storedSessionUpdatedAt = window.localStorage.getItem(
      ACTIVE_SESSION_UPDATED_AT_KEY,
    );
    let loadedFocusMinutes = 25;
    let loadedSelectedId: AdventureId = "hike";

    if (Number.isInteger(storedExpeditionSets) && storedExpeditionSets >= 1 && storedExpeditionSets <= 8) {
      setExpeditionSets(storedExpeditionSets);
    }
    const loadedRecoveryQuest = parseRecoveryQuest(storedRecoveryQuest);
    setRecoveryQuest(loadedRecoveryQuest);
    if (storedRecoveryQuest && !loadedRecoveryQuest) {
      window.localStorage.removeItem(RECOVERY_QUEST_KEY);
    }
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(storedReminderTime)) {
      setReminderTime(storedReminderTime);
    }
    setNotificationsEnabled(
      window.localStorage.getItem(NOTIFICATION_KEY) === "true" &&
        "Notification" in window &&
        Notification.permission === "granted",
    );
    setMiniTimerSupported("documentPictureInPicture" in window);
    const sharedCampCode = new URLSearchParams(window.location.search).get("camp");
    if (sharedCampCode && /^[A-Z0-9]{4,8}$/i.test(sharedCampCode)) {
      setSilentCampCode(sharedCampCode.toUpperCase());
    }

    if (stored) {
      try {
        const preferences = JSON.parse(stored) as {
          focusMinutes?: number;
          breakMinutes?: number;
          bgm?: BgmId;
          selectedId?: AdventureId;
          soundOn?: boolean;
        };
        if (preferences.focusMinutes) {
          loadedFocusMinutes = preferences.focusMinutes;
          setFocusMinutes(preferences.focusMinutes);
        }
        if (preferences.breakMinutes) setBreakMinutes(preferences.breakMinutes);
        if (preferences.bgm) {
          setBgm(preferences.bgm);
        }
        if (preferences.selectedId) {
          loadedSelectedId = preferences.selectedId;
          setSelectedId(preferences.selectedId);
        }
        if (typeof preferences.soundOn === "boolean") {
          setSoundOn(preferences.soundOn);
        }
      } catch {
        window.localStorage.removeItem("haru-focus-preferences");
      }
    }

    let loadedHistory = parseHistory(storedHistory);
    if (stats) {
      try {
        const parsed = JSON.parse(stats) as { date: string; count: number };
        if (
          loadedHistory.length === 0 &&
          parsed.date === new Date().toDateString() &&
          parsed.count > 0
        ) {
          const now = Date.now();
          loadedHistory = Array.from({ length: parsed.count }, (_, index) => ({
            id: `legacy-${now}-${index}`,
            completedAt: new Date(now - index * 1000).toISOString(),
            durationMinutes: loadedFocusMinutes,
            adventureId: loadedSelectedId,
          }));
          window.localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(loadedHistory),
          );
        }
      } catch {
        window.localStorage.removeItem("haru-focus-stats");
      }
    }
    setHistory(loadedHistory);
    setCompletedToday(getDailyCount(loadedHistory));
    setFocusIntent(
      normalizeFocusIntent(storedFocusIntent) ||
        loadedHistory.find((record) => record.focusIntent)?.focusIntent ||
        "",
    );

    const restored = parseActiveSession(storedSession);
    if (restored) {
      const { session, remainingSeconds, expired } = restored;
      activeSessionRef.current = session;
      setCloudActiveSession(session);
      const restoredUpdatedAt =
        storedSessionUpdatedAt &&
        !Number.isNaN(Date.parse(storedSessionUpdatedAt))
          ? storedSessionUpdatedAt
          : session.startedAt;
      setSessionUpdatedAt(restoredUpdatedAt);
      window.localStorage.setItem(
        ACTIVE_SESSION_UPDATED_AT_KEY,
        restoredUpdatedAt,
      );
      setSelectedId(session.adventureId);
      setActiveQuestId(session.questId ?? null);
      setFocusIntent(session.focusIntent ?? "");
      setBgm(session.bgm);
      setSessionMode(session.mode);
      setSessionExpedition(session.expedition ?? null);
      setSessionDurationMinutes(session.durationMinutes);
      setRemaining(remainingSeconds);
      setEndAt(session.endAt);
      setPaused(session.paused);

      if (expired) {
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        activeSessionRef.current = null;
        setCloudActiveSession(null);
        const completedAt = new Date().toISOString();
        setSessionUpdatedAt(completedAt);
        window.localStorage.setItem(
          ACTIVE_SESSION_UPDATED_AT_KEY,
          completedAt,
        );
        setCompletionMode(session.mode);
        setCompletedExpedition(session.expedition ?? null);
        setEndAt(null);
        setPaused(false);
        setScreen("complete");

        if (session.mode === "focus") {
          const completedAt = new Date(session.endAt ?? Date.now());
          const record = {
            ...createFocusRecord({
              durationMinutes: session.durationMinutes,
              adventureId: session.adventureId,
              questId: session.questId,
              focusIntent: session.focusIntent,
              expedition: session.expedition,
              completedAt,
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          loadedHistory = addFocusRecord(loadedHistory, record);
          setCompletedRecordId(record.id);
          setCompletedQuestId(session.questId ?? null);
          setCampOutcome(record.campOutcome ?? null);
          setHistory(loadedHistory);
          setCompletedToday(getDailyCount(loadedHistory));
          window.localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(loadedHistory),
          );
          if (session.questId) {
            completeQuestSetRef.current?.(
              session.questId,
              `${session.startedAt}-${session.adventureId}`,
              session.durationMinutes,
            );
          }
        }
      } else {
        setScreen("focus");
      }
    } else {
      if (storedSession) window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      const hasValidStoredUpdate =
        storedSessionUpdatedAt &&
        !Number.isNaN(Date.parse(storedSessionUpdatedAt));
      const clearedAt = hasValidStoredUpdate
        ? storedSessionUpdatedAt
        : storedSession
          ? new Date().toISOString()
          : EMPTY_SESSION_UPDATED_AT;
      setSessionUpdatedAt(clearedAt);
      window.localStorage.setItem(ACTIVE_SESSION_UPDATED_AT_KEY, clearedAt);
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(`${publicBasePath}/service-worker.js`, {
          scope: `${publicBasePath}/`,
          updateViaCache: "none",
        })
        .then((registration) => registration.update());
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      );
    setShowIosInstallHint(
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone,
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "haru-focus-preferences",
      JSON.stringify({
        focusMinutes,
        breakMinutes,
        bgm,
        selectedId,
        soundOn,
      }),
    );
  }, [bgm, breakMinutes, focusMinutes, hydrated, selectedId, soundOn]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      FOCUS_INTENT_KEY,
      normalizeFocusIntent(focusIntent),
    );
  }, [focusIntent, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(EXPEDITION_SETS_KEY, String(expeditionSets));
    if (reminderTime) window.localStorage.setItem(REMINDER_TIME_KEY, reminderTime);
    else window.localStorage.removeItem(REMINDER_TIME_KEY);
  }, [expeditionSets, hydrated, reminderTime]);

  useEffect(() => {
    if (!hydrated || !notificationsEnabled || !reminderTime) return;
    const checkReminder = () => {
      const now = new Date();
      const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toDateString();
      if (
        current === reminderTime &&
        window.localStorage.getItem(REMINDER_SENT_KEY) !== today &&
        Notification.permission === "granted"
      ) {
        new Notification("Focus Quest 출발 시간", {
          body: `${selected.friend}가 오늘의 한 가지를 기다리고 있어요.`,
          icon: `${publicBasePath}/favicon.svg`,
        });
        window.localStorage.setItem(REMINDER_SENT_KEY, today);
      }
    };
    checkReminder();
    const timer = window.setInterval(checkReminder, 30_000);
    return () => window.clearInterval(timer);
  }, [hydrated, notificationsEnabled, reminderTime, selected.friend]);

  useEffect(() => {
    const miniWindow = miniTimerWindowRef.current;
    if (!miniWindow || miniWindow.closed) return;
    const goal = miniWindow.document.querySelector("[data-mini-goal]");
    const clock = miniWindow.document.querySelector("[data-mini-clock]");
    const route = miniWindow.document.querySelector("[data-mini-route]");
    if (goal) goal.textContent = focusIntent || "자유 집중";
    if (clock) clock.textContent = formatTime(remaining);
    if (route) {
      route.textContent = sessionExpedition
        ? `${sessionExpedition.currentSet}/${sessionExpedition.totalSets} 구간 · ${selected.name}`
        : selected.name;
    }
  }, [focusIntent, remaining, selected.name, sessionExpedition]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstallHint(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.close();
      audioRef.current = null;
    }
  }, []);

  const startAudio = useCallback(
    (theme: BgmId) => {
      stopAudio();
      if (theme !== "quiet" && soundOn) {
        audioRef.current = createAmbientSound(theme);
      }
    },
    [soundOn, stopAudio],
  );

  const persistSession = useCallback(
    (session: ActiveSession | null, updatedAt = new Date().toISOString()) => {
      activeSessionRef.current = session;
      setCloudActiveSession(session);
      setSessionUpdatedAt(updatedAt);
      window.localStorage.setItem(ACTIVE_SESSION_UPDATED_AT_KEY, updatedAt);
      if (session) {
        window.localStorage.setItem(
          ACTIVE_SESSION_KEY,
          JSON.stringify(session),
        );
      } else {
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    },
    [],
  );

  const completeSession = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session || completionLockRef.current) return;

    completionLockRef.current = true;
    stopAudio();
    if (miniTimerWindowRef.current && !miniTimerWindowRef.current.closed) {
      miniTimerWindowRef.current.close();
    }
    miniTimerWindowRef.current = null;
    persistSession(null);

    if (session.mode === "focus") {
      const record = {
        ...createFocusRecord({
          durationMinutes: session.durationMinutes,
          adventureId: session.adventureId,
          questId: session.questId,
          focusIntent: session.focusIntent,
          expedition: session.expedition,
          completedAt: new Date(),
        }),
        id: `${session.startedAt}-${session.adventureId}`,
      };
      setCompletedRecordId(record.id);
      setCompletedQuestId(session.questId ?? null);
      setCompletedExpedition(session.expedition ?? null);
      setCampOutcome(null);

      setHistory((current) => {
        const nextHistory = addFocusRecord(current, record);
        const nextCount = getDailyCount(nextHistory);
        setCompletedToday(nextCount);
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
        window.localStorage.setItem(
          "haru-focus-stats",
          JSON.stringify({ date: new Date().toDateString(), count: nextCount }),
        );
        return nextHistory;
      });
      if (session.questId) {
        completeQuestSetRef.current?.(
          session.questId,
          `${session.startedAt}-${session.adventureId}`,
          session.durationMinutes,
        );
      }
    }

    setCompletionMode(session.mode);
    setCompletedExpedition(session.expedition ?? null);
    setEndAt(null);
    setPaused(false);
    setShowExit(false);

    if (session.mode === "focus") {
      setRemaining(0);
      const reachedFinalDestination =
        !session.expedition ||
        session.expedition.currentSet >= session.expedition.totalSets;
      if (notificationsEnabled && Notification.permission === "granted") {
        new Notification(
          reachedFinalDestination ? "모험을 완주했어요!" : "원정 체크포인트 도착",
          { body: `${session.focusIntent || "집중"} · ${session.durationMinutes}분 완료` },
        );
      }
      setIsCelebrating(reachedFinalDestination);
      if (!reachedFinalDestination) setScreen("complete");
      return;
    }

    setScreen("complete");
  }, [notificationsEnabled, persistSession, stopAudio]);

  useEffect(() => {
    if (!isCelebrating) return;
    const celebrationTimer = window.setTimeout(() => {
      setIsCelebrating(false);
      setScreen("complete");
    }, 4200);
    return () => window.clearTimeout(celebrationTimer);
  }, [isCelebrating]);

  useEffect(() => {
    if (screen !== "focus" || paused || !endAt) return;

    const update = () => {
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) completeSession();
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [completeSession, endAt, paused, screen]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  useEffect(
    () => () => {
      const client = getSupabaseBrowserClient();
      if (client && silentCampChannelRef.current) {
        void client.removeChannel(silentCampChannelRef.current);
      }
    },
    [],
  );

  const chooseAdventure = (id: AdventureId) => {
    setActiveQuestId(null);
    setSelectedId(id);
    setBgm(adventureBgms[id]);
    setSessionMode("focus");
    setSessionDurationMinutes(focusMinutes);
    setRemaining(focusMinutes * 60);
  };

  const beginSession = (
    mode: SessionMode,
    options?: {
      durationMinutes?: number;
      questId?: string | null;
      focusIntent?: string;
      updateFocusPreference?: boolean;
      adventureId?: AdventureId;
      bgm?: BgmId;
      expedition?: ExpeditionProgress;
    },
  ) => {
    const durationMinutes =
      options?.durationMinutes ??
      (mode === "focus" ? focusMinutes : breakMinutes);
    const seconds = durationMinutes * 60;
    const sessionAdventureId = options?.adventureId ?? selectedId;
    const sessionBgm = options?.bgm ?? bgm;
    const theme = mode === "focus" ? sessionBgm : "quiet";
    const intent =
      mode === "focus"
        ? normalizeFocusIntent(options?.focusIntent ?? focusIntent) || "자유 집중"
        : undefined;
    const sessionQuestId =
      options?.questId === undefined ? activeQuestId : options.questId;
    const session = createActiveSession({
      mode,
      durationMinutes,
      adventureId: sessionAdventureId,
      bgm: theme,
      questId: sessionQuestId ?? undefined,
      focusIntent: intent,
      expedition: options?.expedition,
    });

    completionLockRef.current = false;
    setIsCelebrating(false);
    if (mode === "focus" && options?.updateFocusPreference !== false) {
      setFocusMinutes(durationMinutes);
    }
    if (mode === "focus") setFocusIntent(intent ?? "");
    if (mode === "focus") {
      setRecoveryQuest(null);
      window.localStorage.removeItem(RECOVERY_QUEST_KEY);
    }
    setSelectedId(sessionAdventureId);
    if (mode === "focus") setBgm(sessionBgm);
    setSessionExpedition(options?.expedition ?? null);
    setCampOutcome(null);
    persistSession(session);
    setSessionMode(mode);
    setSessionDurationMinutes(durationMinutes);
    setRemaining(seconds);
    setEndAt(session.endAt);
    setPaused(false);
    setScreen("focus");
    startAudio(theme);
    enterFullscreen();
  };

  const beginFocus = () => {
    if (
      completionMode === "break" &&
      completedExpedition &&
      completedExpedition.currentSet < completedExpedition.totalSets
    ) {
      beginSession("focus", {
        durationMinutes: completedExpedition.focusMinutes,
        expedition: {
          ...completedExpedition,
          currentSet: completedExpedition.currentSet + 1,
        },
        updateFocusPreference: false,
      });
      return;
    }
    const expedition =
      expeditionSets > 1
        ? createExpeditionProgress({ totalSets: expeditionSets, focusMinutes, breakMinutes })
        : undefined;
    beginSession("focus", { expedition });
  };
  const beginBreak = () =>
    beginSession("break", {
      durationMinutes: completedExpedition?.breakMinutes ?? breakMinutes,
      expedition:
        completedExpedition &&
        completedExpedition.currentSet < completedExpedition.totalSets
          ? completedExpedition
          : undefined,
    });
  const beginQuickFocus = (durationMinutes: number) => {
    setActiveQuestId(null);
    beginSession("focus", { durationMinutes, questId: null, expedition: undefined });
  };

  const restartAdventure = (record: FocusRecord) => {
    const adventureBgm = adventureBgms[record.adventureId];
    setRecoveryQuest(null);
    window.localStorage.removeItem(RECOVERY_QUEST_KEY);
    beginSession("focus", {
      durationMinutes: record.durationMinutes,
      questId:
        record.campOutcome === "unfinished" || record.campOutcome === "split"
          ? record.questId ?? null
          : null,
      focusIntent: record.focusIntent || "자유 집중",
      adventureId: record.adventureId,
      bgm: adventureBgm,
      updateFocusPreference: false,
      expedition:
        record.expeditionTotal && record.expeditionTotal > 1
          ? createExpeditionProgress({
              totalSets: record.expeditionTotal,
              focusMinutes: record.durationMinutes,
              breakMinutes,
            })
          : undefined,
    });
  };

  const startRecoveryQuest = () => {
    if (!recoveryQuest) return;
    const next = recoveryQuest;
    setRecoveryQuest(null);
    window.localStorage.removeItem(RECOVERY_QUEST_KEY);
    beginSession("focus", {
      durationMinutes: next.durationMinutes,
      questId: next.questId ?? null,
      focusIntent: next.focusIntent,
      adventureId: next.adventureId,
      bgm: next.bgm,
      updateFocusPreference: false,
    });
  };

  const toggleNotifications = async () => {
    if (!("Notification" in window)) return;
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      window.localStorage.setItem(NOTIFICATION_KEY, "false");
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setNotificationsEnabled(enabled);
    window.localStorage.setItem(NOTIFICATION_KEY, String(enabled));
  };

  const openMiniTimer = async () => {
    const pictureInPicture = (
      window as typeof window & { documentPictureInPicture?: DocumentPictureInPicture }
    ).documentPictureInPicture;
    if (!pictureInPicture) return;
    const miniWindow = await pictureInPicture.requestWindow({ width: 340, height: 210 });
    miniWindow.document.body.innerHTML = `
      <main style="height:100vh;box-sizing:border-box;padding:20px;background:#071a2d;color:#fff0c4;font-family:system-ui;text-align:center">
        <small data-mini-route style="color:#55ccd2"></small>
        <h2 data-mini-goal style="margin:12px 0 4px;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></h2>
        <strong data-mini-clock style="display:block;font:700 54px monospace;color:#ffd477"></strong>
        <span style="font-size:12px;color:#9db8b4">Focus Quest · 모험 진행 중</span>
      </main>`;
    miniTimerWindowRef.current = miniWindow;
    miniWindow.addEventListener("pagehide", () => {
      miniTimerWindowRef.current = null;
    });
    setRemaining((current) => current);
  };

  const joinSilentCamp = async () => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSilentCampStatus("error");
      return;
    }
    const code = (silentCampCode || Math.random().toString(36).slice(2, 8))
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8)
      .toUpperCase();
    if (code.length < 4) return;
    if (silentCampChannelRef.current) {
      await client.removeChannel(silentCampChannelRef.current);
    }
    setSilentCampCode(code);
    setSilentCampStatus("connecting");
    const channel = client.channel(`silent-camp:${code}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channel.on("presence", { event: "sync" }, () => {
      setSilentCampCount(Object.keys(channel.presenceState()).length);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ joinedAt: new Date().toISOString() });
        setSilentCampStatus("joined");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setSilentCampStatus("error");
      }
    });
    silentCampChannelRef.current = channel;
  };

  const copySilentCampLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("camp", silentCampCode);
    await navigator.clipboard.writeText(url.toString());
  };

  const recordCampOutcome = (outcome: CampOutcome) => {
    setCampOutcome(outcome);
    if (!completedRecordId) return;
    setHistory((current) => {
      const nextHistory = addCampOutcome(current, completedRecordId, outcome);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      return nextHistory;
    });
  };

  const beginCampFollowUp = (durationMinutes: number, split = false) => {
    const nextIntent = split
      ? normalizeFocusIntent(`${focusIntent || "자유 집중"} · 작은 한 조각`)
      : focusIntent;
    beginSession("focus", {
      durationMinutes,
      questId: completedQuestId,
      focusIntent: nextIntent,
      updateFocusPreference: false,
    });
  };

  const launchQuest = async (quest: StudyQuest) => {
    const started = await questStore.startQuest(quest.id);
    if (!started) return;
    persistSession(null);
    setActiveQuestId(quest.id);
    setFocusIntent(quest.title);
    setSelectedId(quest.adventureId);
    setBgm(adventureBgms[quest.adventureId]);
    setFocusMinutes(quest.focusMinutes);
    setBreakMinutes(quest.breakMinutes);
    setExpeditionSets(
      Math.min(8, Math.max(1, quest.targetSets - quest.completedSets)),
    );
    setSessionMode("focus");
    setSessionDurationMinutes(quest.focusMinutes);
    setRemaining(quest.focusMinutes * 60);
    setScreen("setup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const togglePause = () => {
    const session = activeSessionRef.current;
    if (!session) return;

    if (paused) {
      const resumed = resumeActiveSession(session);
      persistSession(resumed);
      setEndAt(resumed.endAt);
      setPaused(false);
      startAudio(session.mode === "focus" ? bgm : "quiet");
    } else {
      const pausedSession = pauseActiveSession(session, remaining);
      persistSession(pausedSession);
      setPaused(true);
      setEndAt(null);
      stopAudio();
    }
  };

  const toggleSound = () => {
    if (soundOn) {
      stopAudio();
      setSoundOn(false);
    } else {
      setSoundOn(true);
      if (sessionMode === "focus" && bgm !== "quiet") {
        audioRef.current = createAmbientSound(bgm);
      }
    }
  };

  const exitSession = () => {
    const abandoned = activeSessionRef.current;
    if (abandoned?.mode === "focus") {
      const recovery: RecoveryQuest = {
        createdAt: new Date().toISOString(),
        focusIntent: abandoned.focusIntent || "자유 집중",
        durationMinutes: remaining > 5 * 60 ? 10 : 5,
        adventureId: abandoned.adventureId,
        bgm: abandoned.bgm,
        ...(abandoned.questId ? { questId: abandoned.questId } : {}),
      };
      setRecoveryQuest(recovery);
      window.localStorage.setItem(RECOVERY_QUEST_KEY, JSON.stringify(recovery));
    }
    const returnScreen: Screen = sessionMode === "focus" ? "select" : "setup";
    stopAudio();
    persistSession(null);
    setShowExit(false);
    setEndAt(null);
    setPaused(false);
    setIsCelebrating(false);
    setSessionExpedition(null);
    if (miniTimerWindowRef.current && !miniTimerWindowRef.current.closed) {
      miniTimerWindowRef.current.close();
    }
    miniTimerWindowRef.current = null;
    setSessionMode("focus");
    setSessionDurationMinutes(focusMinutes);
    setRemaining(focusMinutes * 60);
    setScreen(returnScreen);
    leaveFullscreen();
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  const isExpeditionCheckpoint = Boolean(
    completionMode === "focus" &&
      completedExpedition &&
      completedExpedition.currentSet < completedExpedition.totalSets,
  );

  return (
    <main
      className={`app-shell screen-${screen}`}
      style={
        {
          "--accent": selected.color,
          "--page-bg": `url("${selected.background}")`,
        } as React.CSSProperties
      }
    >
      {screen !== "focus" && (
        <header className="topbar">
          <button className="brand" type="button" onClick={() => setScreen("select")} aria-label="Focus Quest 홈">
            <span className="brand-mark">●</span>
            <span>Focus Quest</span>
          </button>
          <div className="topbar-actions">
            <div className="today-chip" aria-label={`오늘 ${completedToday}번 집중 완료`}>
              <span>✦</span>
              오늘 {completedToday}칸
            </div>
            {cloudSync.account ? (
              <details className="account-menu">
                <summary
                  className={`account-chip sync-${cloudSync.status}`}
                  aria-label={`계정 메뉴, ${cloudSync.message}`}
                >
                  <span className="account-avatar" aria-hidden="true">
                    {cloudSync.account.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="account-chip-copy">
                    <strong>{cloudSync.account.displayName}</strong>
                    <small>{cloudSync.message}</small>
                  </span>
                </summary>
                <div className="account-popover">
                  <div>
                    <strong>{cloudSync.account.displayName}</strong>
                    <small>{cloudSync.account.email}</small>
                  </div>
                  {cloudSync.status === "disabled" ? (
                    <button type="button" onClick={cloudSync.resumeCloudSync}>
                      클라우드 저장 다시 켜기
                    </button>
                  ) : (
                    <button type="button" onClick={cloudSync.deleteCloudData}>
                      클라우드 기록 삭제
                    </button>
                  )}
                  {cloudSync.authProvider === "supabase" ? (
                    <button type="button" onClick={cloudSync.signOut}>
                      로그아웃
                    </button>
                  ) : (
                    <a href="/signout-with-chatgpt?return_to=%2F">로그아웃</a>
                  )}
                </div>
              </details>
            ) : cloudSync.authProvider === "supabase" ? (
              <button
                className={`account-chip account-signin sync-${cloudSync.status}`}
                onClick={() => setShowAuthDialog(true)}
                type="button"
                aria-label="로그인하고 클라우드에 집중 기록 저장"
              >
                <span className="cloud-icon" aria-hidden="true">☁</span>
                <span className="account-chip-copy">
                  <strong>기록 이어하기</strong>
                  <small>{cloudSync.message}</small>
                </span>
              </button>
            ) : (
              <a
                className={`account-chip account-signin sync-${cloudSync.status}`}
                href="/signin-with-chatgpt?return_to=%2F"
                aria-label="로그인하고 클라우드에 집중 기록 저장"
              >
                <span className="cloud-icon" aria-hidden="true">☁</span>
                <span className="account-chip-copy">
                  <strong>기록 이어하기</strong>
                  <small>{cloudSync.message}</small>
                </span>
              </a>
            )}
          </div>
        </header>
      )}

      {screen === "select" && (
        <section className="select-screen">
          <section className="quick-start-hero" aria-labelledby="quick-start-title">
            <div className="quick-start-copy">
              <span className="eyebrow">오늘의 한 가지</span>
              <h1 id="quick-start-title">
                지금 끝낼 일을 적고
                <br />
                바로 출발해요.
              </h1>
              <p>
                복잡한 계획은 잠시 내려두고, 이번 모험에서 집중할 한 가지만
                정해 보세요.
              </p>

              <label className="focus-intent-field">
                <span>이번에 집중할 일</span>
                <input
                  autoComplete="off"
                  maxLength={80}
                  onChange={(event) => setFocusIntent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      beginQuickFocus(25);
                    }
                  }}
                  placeholder="예: 운영체제 3장 복습"
                  value={focusIntent}
                />
                <small>
                  비워도 괜찮아요. 그럴 땐 자유 집중으로 기록할게요.
                </small>
              </label>

              <div className="quick-focus-options" aria-label="빠른 집중 시간">
                {quickFocusOptions.map((option) => (
                  <button
                    key={option.minutes}
                    onClick={() => beginQuickFocus(option.minutes)}
                    type="button"
                  >
                    <span>{option.label}</span>
                    <strong>{option.minutes}분 시작</strong>
                    <small>{option.note}</small>
                  </button>
                ))}
              </div>

              <button
                className="detail-settings-button"
                onClick={() => {
                  setActiveQuestId(null);
                  setScreen("setup");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                type="button"
              >
                시간·휴식·집중 소리 자세히 설정
                <span aria-hidden="true">→</span>
              </button>
            </div>

            <aside
              className={`quick-companion theme-${selected.id}`}
              style={
                {
                  "--companion-accent": selected.color,
                  "--companion-soft": selected.soft,
                  "--companion-bg": `url("${selected.background}")`,
                } as React.CSSProperties
              }
              aria-label={`현재 모험 친구 ${selected.friend}`}
            >
              <div className="quick-companion-status">
                <span>READY</span>
                <i />
                {selected.chapter} · WORLD LV.{selectedWorldLevel}
              </div>
              <div className="quick-companion-stage">
                <div className="companion-stage-hud">
                  <span>현재 지역</span>
                  <strong>{selected.name}</strong>
                </div>
                <img
                  src={selected.image}
                  alt={`${selected.name}의 ${selected.role} ${selected.friend}`}
                />
              </div>
              <div className="quick-companion-copy">
                <span>{selected.icon} {selected.role}</span>
                <h2>{selected.friend} · {selected.name}</h2>
                <p>
                  {selected.tagline} ·{" "}
                  {bgms.find((item) => item.id === bgm)?.name ?? "고요히"}
                </p>
                <small>{selected.description}</small>
                <div className="companion-memory">
                  <span>동료의 기억</span>
                  <p>{companionMemory}</p>
                </div>
              </div>

              <div className="adventure-switcher" aria-label="모험 지역 선택">
                <div className="adventure-switcher-heading">
                  <strong>모험 지도</strong>
                  <span>지역을 고르면 동행과 소리가 함께 바뀌어요</span>
                </div>
                <div className="adventure-options">
                  {adventures.map((adventure) => (
                    <button
                      aria-pressed={selectedId === adventure.id}
                      className={`adventure-option option-${adventure.id} ${
                        selectedId === adventure.id ? "is-active" : ""
                      }`}
                      key={adventure.id}
                      onClick={() => chooseAdventure(adventure.id)}
                      style={
                        {
                          "--option-accent": adventure.color,
                        } as React.CSSProperties
                      }
                      type="button"
                    >
                      <img src={adventure.image} alt="" />
                      <span>
                        <small>{adventure.chapter}</small>
                        <strong>{adventure.name}</strong>
                        <em>{adventure.friend} · {adventure.role}</em>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </section>

          {recoveryQuest && (
            <aside className="recovery-card" aria-label="중단한 집중 이어가기">
              <div>
                <span>RECOVERY QUEST</span>
                <h2>멈춘 곳은 실패가 아니라 다음 출발점이에요.</h2>
                <p>
                  “{recoveryQuest.focusIntent}”을 {recoveryQuest.durationMinutes}분짜리 작은 모험으로 줄여 두었어요.
                </p>
              </div>
              <button type="button" onClick={startRecoveryQuest}>
                {recoveryQuest.durationMinutes}분 복귀하기 →
              </button>
            </aside>
          )}

          <div className="select-note quick-start-note">
            <span>ONE TASK · ONE ADVENTURE</span>
            <i />
            <p>{selected.friend}가 준비됐어요. 시간만 고르면 바로 시작해요.</p>
          </div>

          {(installPrompt || showIosInstallHint) && (
            <aside className="install-card" aria-label="앱 설치 안내">
              <div>
                <strong>홈 화면에서 바로 모험하기</strong>
                <p>
                  {showIosInstallHint
                    ? "iPhone에서는 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택해 주세요."
                    : "앱처럼 설치하면 주소창 없이 더 몰입해서 사용할 수 있어요."}
                </p>
              </div>
              {installPrompt && (
                <button type="button" onClick={() => void installApp()}>
                  앱으로 설치
                </button>
              )}
            </aside>
          )}

          <QuestBoard
            loggedIn={questLoggedIn}
            status={questStore.status}
            message={questStore.message}
            subjects={questStore.subjects}
            quests={questStore.quests}
            onLogin={() => setShowAuthDialog(true)}
            onCreateSubject={questStore.createSubject}
            onDeleteSubject={questStore.deleteSubject}
            onCreateQuest={questStore.createQuest}
            onUpdateQuest={questStore.updateQuest}
            onDeleteQuest={questStore.deleteQuest}
            onStartQuest={launchQuest}
          />

          <section className="silent-camp" aria-labelledby="silent-camp-title">
            <div>
              <span>SILENT CAMP · BETA</span>
              <h2 id="silent-camp-title">같은 시간, 각자의 모험</h2>
              <p>랭킹과 채팅 없이 접속한 인원만 보여요. 방 코드를 친구와 나눠 조용히 함께 집중하세요.</p>
            </div>
            <div className="silent-camp-controls">
              <label>
                <span>캠프 코드</span>
                <input
                  maxLength={8}
                  onChange={(event) => setSilentCampCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
                  placeholder="비우면 자동 생성"
                  value={silentCampCode}
                />
              </label>
              <button disabled={silentCampStatus === "connecting"} onClick={() => void joinSilentCamp()} type="button">
                {silentCampStatus === "connecting" ? "합류 중…" : silentCampStatus === "joined" ? "다시 연결" : "캠프 합류"}
              </button>
              {silentCampStatus === "joined" && (
                <button onClick={() => void copySilentCampLink()} type="button">초대 링크 복사</button>
              )}
            </div>
            <strong className={`silent-camp-presence status-${silentCampStatus}`} aria-live="polite">
              {silentCampStatus === "joined" && `● 지금 ${silentCampCount}명이 조용히 집중 중`}
              {silentCampStatus === "error" && "연결하지 못했어요. 잠시 후 다시 시도해 주세요."}
              {silentCampStatus === "idle" && "코드 없이 합류하면 새 캠프가 열려요."}
            </strong>
          </section>

          <section className="weekly-summary" aria-labelledby="weekly-title">
            <div className="weekly-heading">
              <div>
                <span className="eyebrow">이번 주의 발자국</span>
                <h2 id="weekly-title">집중 모험 기록</h2>
              </div>
              <p>
                {cloudSync.account && cloudSync.status !== "disabled"
                  ? cloudSync.message
                  : "로그인하면 다른 기기에서도 기록이 이어져요."}
              </p>
            </div>

            <div className="weekly-metrics">
              <div>
                <strong>{weeklySummary.minutes}</strong>
                <span>집중한 분</span>
              </div>
              <div>
                <strong>{weeklySummary.sessions}</strong>
                <span>완료한 칸</span>
              </div>
              <div>
                <strong>{weeklySummary.activeDays}</strong>
                <span>모험한 날</span>
              </div>
            </div>

            <div className="behavior-report" aria-label="나에게 맞는 집중 패턴">
              <div>
                <span>잘 맞는 집중 길이</span>
                <strong>{behaviorInsights.favoriteMinutes ? `${behaviorInsights.favoriteMinutes}분` : "기록 중"}</strong>
              </div>
              <div>
                <span>자주 완주한 시간대</span>
                <strong>{behaviorInsights.favoriteHour === null ? "기록 중" : `${behaviorInsights.favoriteHour}시 무렵`}</strong>
              </div>
              <div>
                <span>목표를 적은 모험</span>
                <strong>{behaviorInsights.namedRate}%</strong>
              </div>
              <p>
                {behaviorInsights.favoriteMinutes
                  ? `다음 모험도 ${behaviorInsights.favoriteMinutes}분으로 시작하면 익숙한 리듬을 이어갈 수 있어요.`
                  : "집중을 세 번 완주하면 나에게 맞는 리듬이 선명해져요."}
              </p>
            </div>

            <div className="week-chart" aria-label="요일별 집중 시간">
              {weeklySummary.days.map((day) => (
                <div className="week-day" key={day.date}>
                  <span className="bar-track">
                    <i
                      style={{
                        height: `${Math.max(
                          day.minutes > 0 ? 12 : 2,
                          (day.minutes / maxDayMinutes) * 100,
                        )}%`,
                      }}
                    />
                  </span>
                  <strong>{day.label}</strong>
                  <small>{day.minutes > 0 ? `${day.minutes}분` : "·"}</small>
                </div>
              ))}
            </div>

            <div className="recent-history">
              <h3>최근 모험</h3>
              {history.length === 0 ? (
                <p className="empty-history">
                  첫 집중을 마치면 이곳에 모험 기록이 생겨요.
                </p>
              ) : (
                <ul>
                  {recentAdventures.map((record) => {
                    const adventure =
                      adventures.find((item) => item.id === record.adventureId) ??
                      adventures[0];
                    const completedAt = new Date(record.completedAt);
                    return (
                      <li key={record.id}>
                        <span>{adventure.icon}</span>
                        <div>
                          <strong>{record.focusIntent || adventure.name}</strong>
                          <small>
                            {record.focusIntent ? `${adventure.name} · ` : ""}
                            {completedAt.toLocaleDateString("ko-KR", {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            · {record.durationMinutes}분
                            {record.expeditionTotal && ` × ${record.expeditionTotal}세트 원정`}
                            {record.campOutcome === "finished" && " · 완주"}
                            {record.campOutcome === "unfinished" && " · 조금 남음"}
                            {record.campOutcome === "split" && " · 나눠서 계속"}
                          </small>
                        </div>
                        <button
                          className="restart-adventure"
                          onClick={() => restartAdventure(record)}
                          type="button"
                        >
                          {record.campOutcome === "unfinished" || record.campOutcome === "split"
                            ? "이어가기"
                            : "다시 도전"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </section>
      )}

      {screen === "setup" && (
        <section className="setup-screen">
          <button className="back-button" type="button" onClick={() => setScreen("select")}>
            ← 오늘의 한 가지로
          </button>

          <div className="setup-layout">
            <div className={`preview-panel theme-${selected.id}`}>
              <div className="preview-sun" />
              <div className="preview-cloud cloud-one" />
              <div className="preview-cloud cloud-two" />
              <div className="preview-ground" />
              <img src={selected.image} alt={selected.friend} className="setup-character" />
              <div className="preview-label">
                <span>{selected.icon} 오늘의 모험</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            </div>

            <div className="settings-panel">
              <div className="settings-heading">
                <span className="eyebrow">모험 준비</span>
                <h1>나만의 집중 시간을 만들어요.</h1>
              </div>

              <label className="setup-intent-field">
                <span>이번에 집중할 일</span>
                <input
                  autoComplete="off"
                  maxLength={80}
                  onChange={(event) => setFocusIntent(event.target.value)}
                  placeholder="예: 운영체제 3장 복습"
                  value={focusIntent}
                />
                <small>완료 기록에서 무엇에 집중했는지 바로 확인할 수 있어요.</small>
              </label>

              <fieldset>
                <legend>
                  집중 시간 <strong>{focusMinutes}분</strong>
                </legend>
                <div className="preset-row">
                  {[15, 25, 40, 50].map((value) => (
                    <button
                      type="button"
                      className={focusMinutes === value ? "active" : ""}
                      onClick={() => setFocusMinutes(value)}
                      key={value}
                    >
                      {value}
                    </button>
                  ))}
                  <label className="custom-time">
                    <span>직접</span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={focusMinutes}
                      onChange={(event) =>
                        setFocusMinutes(Math.min(120, Math.max(1, Number(event.target.value) || 1)))
                      }
                      aria-label="사용자 지정 집중 시간"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>
                  휴식 시간 <strong>{breakMinutes}분</strong>
                </legend>
                <div className="range-wrap">
                  <span>1</span>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={breakMinutes}
                    onChange={(event) => setBreakMinutes(Number(event.target.value))}
                    aria-label="휴식 시간"
                  />
                  <span>30</span>
                </div>
              </fieldset>

              <fieldset>
                <legend>
                  원정 길이 <strong>{expeditionSets}세트</strong>
                </legend>
                <div className="expedition-set-options" role="group" aria-label="원정 세트 수">
                  {[1, 2, 3, 4].map((sets) => (
                    <button
                      aria-pressed={expeditionSets === sets}
                      className={expeditionSets === sets ? "active" : ""}
                      key={sets}
                      onClick={() => setExpeditionSets(sets)}
                      type="button"
                    >
                      {sets === 1 ? "한 칸" : `${sets}세트 원정`}
                    </button>
                  ))}
                </div>
                <small className="setting-help">
                  여러 세트를 고르면 집중과 휴식을 체크포인트처럼 이어가요.
                </small>
              </fieldset>

              <fieldset>
                <legend>집중 소리</legend>
                <div className="bgm-grid">
                  {bgms.map((item) => (
                    <button
                      type="button"
                      className={bgm === item.id ? "active" : ""}
                      onClick={() => setBgm(item.id)}
                      key={item.id}
                    >
                      <span className="bgm-icon">{item.icon}</span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.note}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>집중 도구</legend>
                <div className="focus-tool-settings">
                  <button
                    aria-pressed={notificationsEnabled}
                    className={notificationsEnabled ? "active" : ""}
                    onClick={() => void toggleNotifications()}
                    type="button"
                  >
                    {notificationsEnabled ? "✓ 종료 알림 켜짐" : "종료 알림 켜기"}
                  </button>
                  <label>
                    <span>오늘 다시 만날 시간</span>
                    <input
                      aria-label="매일 집중 알림 시간"
                      disabled={!notificationsEnabled}
                      onChange={(event) => setReminderTime(event.target.value)}
                      type="time"
                      value={reminderTime}
                    />
                  </label>
                </div>
                <small className="setting-help">
                  앱이 열려 있을 때 설정한 시간과 세션 종료를 알려드려요.
                </small>
              </fieldset>

              <button className="primary-button" type="button" onClick={beginFocus}>
                <span>{selected.friend}와 {expeditionSets > 1 ? `${expeditionSets}세트 원정 시작` : "집중 시작"}</span>
                <strong>{focusMinutes}:00</strong>
              </button>
              <p className="copyright-note">음악은 이 기기에서 실시간 생성되어 별도의 음원 저작권이 없어요.</p>
            </div>
          </div>
        </section>
      )}

      {screen === "focus" && (
        <section
          className={`focus-screen focus-${selected.id} session-${sessionMode} ${paused ? "is-paused" : ""} ${isCelebrating ? "is-celebrating" : ""}`}
          style={{ "--journey": progress } as React.CSSProperties}
        >
          {selected.id === "fish" && sessionMode === "focus" && (
            <FishingQuestScene
              progress={progress}
              paused={paused}
              celebrating={isCelebrating}
              assetBasePath={publicBasePath}
            />
          )}
          {selected.id !== "fish" && sessionMode === "focus" && (
            <AdventureQuestScene
              kind={selected.id}
              progress={progress}
              paused={paused}
              celebrating={isCelebrating}
              assetBasePath={publicBasePath}
            />
          )}

          {sessionMode === "focus" && (
            <div
              className={`world-growth-markers growth-${selected.id} level-${selectedWorldLevel}`}
              aria-hidden="true"
            >
              {Array.from({ length: selectedWorldLevel }, (_, index) => (
                <i key={index} style={{ "--marker": index } as React.CSSProperties} />
              ))}
            </div>
          )}

          <div className="scene-sky">
            <div className="scene-sun" />
            <div className="scene-cloud scene-cloud-a" />
            <div className="scene-cloud scene-cloud-b" />
            <div className="scene-stars">·　✦　·　　·　✧　　·</div>
          </div>

          <div className="mountain-layer mountain-far" />
          <div className="mountain-layer mountain-near" />
          <div className="water-layer water-far" />
          <div className="water-layer water-near" />
          <div className="lake-shore" />
          <div className="reeds reeds-left">╿╿ ╿</div>
          <div className="reeds reeds-right">╿ ╿╿</div>

          {sessionMode === "break" && (
            <div className="break-scene" aria-hidden="true">
              <div className="break-moon" />
              <div className="break-campfire">
                <i />
                <span />
              </div>
              <div className="sleep-signal">z Z</div>
            </div>
          )}

          <div className="scene-progress-track">
            <div style={{ width: `${progress * 100}%` }} />
          </div>

          {sessionMode === "break" && (
            <div
              className={`focus-character-rig focus-character-rig-${selected.id} ${sessionMode === "break" ? "is-resting" : ""}`}
              style={
                {
                  "--journey": sessionMode === "break" ? 0.5 : progress,
                } as React.CSSProperties
              }
            >
              <img
                src={selected.image}
                alt={`${selected.friend}의 휴식 시간`}
                className="focus-character"
              />
            </div>
          )}

          <div className="focus-top">
            <div className="focus-status">
              <span className="live-dot" />
              {isCelebrating
                ? "목표 달성!"
                : paused
                ? "잠시 멈춤"
                : sessionMode === "focus"
                  ? `${selected.friend}와 집중 중`
                  : `${selected.friend}와 회복 중`}
            </div>
            <div className="focus-actions">
              {miniTimerSupported && sessionMode === "focus" && (
                <button type="button" onClick={() => void openMiniTimer()} aria-label="작은 타이머 열기">
                  ▣
                </button>
              )}
              {sessionMode === "focus" && (
                <button
                  type="button"
                  onClick={toggleSound}
                  aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
                >
                  {soundOn && bgm !== "quiet" ? "♪" : "×♪"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isFullscreen()) leaveFullscreen();
                  else enterFullscreen();
                }}
                aria-label="전체 화면 전환"
              >
                ⛶
              </button>
            </div>
          </div>

          <div className="timer-card">
            {sessionExpedition && (
              <div className="expedition-route" aria-label={`${sessionExpedition.totalSets}세트 중 ${sessionExpedition.currentSet}세트`}>
                <span>EXPEDITION</span>
                <div>
                  {Array.from({ length: sessionExpedition.totalSets }, (_, index) => (
                    <i
                      className={index + 1 <= sessionExpedition.currentSet ? "is-reached" : ""}
                      key={index}
                    >
                      {index + 1}
                    </i>
                  ))}
                </div>
              </div>
            )}
            {sessionMode === "focus" && (
              <span className="active-focus-intent">
                {focusIntent || "자유 집중"}
              </span>
            )}
            <span className="timer-adventure-label">
              {sessionMode === "focus" ? selected.name : "모닥불 옆 휴식"}
            </span>
            <strong>{formatTime(remaining)}</strong>
            <div className="timer-progress">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <p>
              {isCelebrating
                ? "100% · 캐릭터와 함께 목표를 완성했어요!"
                : paused
                ? "괜찮아요. 준비되면 다시 출발해요."
                : sessionMode === "focus"
                  ? `${Math.round(progress * 100)}% · ${adventureNarration}`
                  : `${Math.round(progress * 100)}% · 천천히 숨을 고르고 있어요`}
            </p>
            <div className="timer-controls">
              {isCelebrating ? (
                <span className="celebration-caption">성공 장면 재생 중…</span>
              ) : (
                <>
                  <button className="pause-button" type="button" onClick={togglePause}>
                    {paused ? "계속하기" : "잠시 멈춤"}
                  </button>
                  <button className="exit-button" type="button" onClick={() => setShowExit(true)}>
                    {sessionMode === "focus" ? "그만하기" : "휴식 끝내기"}
                  </button>
                </>
              )}
            </div>
          </div>

          {showExit && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-title">
              <div className="exit-modal">
                <div className="modal-character">
                  <img src={selected.image} alt="" />
                </div>
                <span>
                  {sessionMode === "focus"
                    ? "아직 모험이 끝나지 않았어요"
                    : "아직 쉴 시간이 남았어요"}
                </span>
                <h2 id="exit-title">
                  {sessionMode === "focus"
                    ? "여기서 돌아갈까요?"
                    : "휴식을 마칠까요?"}
                </h2>
                <p>
                  {sessionMode === "focus"
                    ? "지금까지의 기록은 오늘의 완료 칸에 포함되지 않아요."
                    : "바로 다음 집중 모험을 준비할 수 있어요."}
                </p>
                <button className="keep-going" type="button" onClick={() => setShowExit(false)}>
                  {sessionMode === "focus" ? "계속 집중할래요" : "조금 더 쉴래요"}
                </button>
                <button className="confirm-exit" type="button" onClick={exitSession}>
                  {sessionMode === "focus" ? "이번 모험 그만하기" : "휴식 마치기"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "complete" && (
        <section
          className={`complete-screen complete-${selected.id} complete-${completionMode}`}
        >
          <div className="sparkles">✦　·　✧　　✦　·　✧</div>
          <div className="complete-card">
            <span className="complete-kicker">
              {isExpeditionCheckpoint
                ? "CHECKPOINT REACHED"
                : completionMode === "focus"
                  ? "ADVENTURE COMPLETE"
                  : "BREAK COMPLETE"}
            </span>
            <div className="complete-character-wrap">
              <div className="complete-halo" />
              <img
                src={selected.image}
                alt={
                  completionMode === "focus"
                    ? `${selected.friend} 모험 완료`
                    : `${selected.friend} 휴식 완료`
                }
              />
              <span className="badge">
                {completionMode === "focus" ? "+1" : "♥"}
              </span>
            </div>
            <h1>
              {isExpeditionCheckpoint
                ? `${completedExpedition?.currentSet}번째 구간 통과!`
                : completionMode === "focus"
                  ? `${selected.friend}와 한 칸 완성!`
                  : "충전 완료, 다시 출발!"}
            </h1>
            {completionMode === "focus" && (
              <strong className="completed-focus-intent">
                “{focusIntent || "자유 집중"}”
              </strong>
            )}
            <p>
              {completionMode === "focus"
                ? isExpeditionCheckpoint
                  ? `원정의 ${completedExpedition?.currentSet}/${completedExpedition?.totalSets} 구간을 지나왔어요. 성공 장면은 마지막 도착지에서 기다리고 있어요.`
                  : `${sessionDurationMinutes}분 동안 온전히 집중했어요. 정말 멋진 모험이었어요.`
                : `${sessionDurationMinutes}분 동안 몸과 마음을 쉬었어요. 다음 구간을 시작해 볼까요?`}
            </p>
            <div className="session-stats">
              <div>
                <strong>{sessionDurationMinutes}</strong>
                <span>
                  {completionMode === "focus" ? "집중한 분" : "회복한 분"}
                </span>
              </div>
              <div>
                <strong>
                  {completionMode === "focus"
                    ? completedToday
                    : weeklySummary.minutes}
                </strong>
                <span>
                  {completionMode === "focus" ? "오늘의 칸" : "이번 주 분"}
                </span>
              </div>
              <div>
                <strong>
                  {completedExpedition
                    ? `${completedExpedition.currentSet}/${completedExpedition.totalSets}`
                    : completionMode === "focus"
                      ? breakMinutes
                      : focusMinutes}
                </strong>
                <span>
                  {completedExpedition ? "원정 구간" : completionMode === "focus" ? "추천 휴식" : "다음 집중"}
                </span>
              </div>
            </div>
            {isExpeditionCheckpoint ? (
              <div className="checkpoint-next">
                <div className="checkpoint-path" aria-label="원정 진행도">
                  {Array.from({ length: completedExpedition?.totalSets ?? 0 }, (_, index) => (
                    <i className={index < (completedExpedition?.currentSet ?? 0) ? "is-reached" : ""} key={index}>
                      {index + 1}
                    </i>
                  ))}
                </div>
                <button className="primary-button" type="button" onClick={beginBreak}>
                  <span>{completedExpedition?.breakMinutes ?? breakMinutes}분 쉬고 다음 구간으로</span>
                  <strong>→</strong>
                </button>
              </div>
            ) : completionMode === "focus" ? (
              <div className="camp-log" aria-labelledby="camp-log-title">
                <div className="camp-log-heading">
                  <span>CAMP LOG</span>
                  <h2 id="camp-log-title">오늘의 목표는 어디까지 왔나요?</h2>
                  <p>한 번만 고르면, 다음 걸음을 바로 준비해 드려요.</p>
                </div>
                <div className="camp-log-choices" role="group" aria-label="집중 결과 선택">
                  <button
                    aria-pressed={campOutcome === "finished"}
                    className={campOutcome === "finished" ? "is-selected" : ""}
                    onClick={() => recordCampOutcome("finished")}
                    type="button"
                  >
                    <span>✓</span>
                    <strong>끝냈어요</strong>
                    <small>이제 편하게 쉬어요</small>
                  </button>
                  <button
                    aria-pressed={campOutcome === "unfinished"}
                    className={campOutcome === "unfinished" ? "is-selected" : ""}
                    onClick={() => recordCampOutcome("unfinished")}
                    type="button"
                  >
                    <span>＋</span>
                    <strong>조금 남았어요</strong>
                    <small>10분만 더 이어가요</small>
                  </button>
                  <button
                    aria-pressed={campOutcome === "split"}
                    className={campOutcome === "split" ? "is-selected" : ""}
                    onClick={() => recordCampOutcome("split")}
                    type="button"
                  >
                    <span>◇</span>
                    <strong>더 작게 나눌래요</strong>
                    <small>작은 퀘스트로 바꿔요</small>
                  </button>
                </div>
                {campOutcome && (
                  <div className="camp-log-next" aria-live="polite">
                    <p>
                      {campOutcome === "finished" && "오늘의 한 칸을 잘 닫았어요. 모닥불 옆에서 숨을 돌려요."}
                      {campOutcome === "unfinished" && "흐름이 남아 있을 때 10분만 더 가볍게 이어가요."}
                      {campOutcome === "split" && "부담을 낮췄어요. 지금 할 수 있는 한 조각만 골라 출발해요."}
                    </p>
                    {campOutcome === "finished" && (
                      <button className="primary-button" type="button" onClick={beginBreak}>
                        <span>{breakMinutes}분 쉬어가기</span><strong>→</strong>
                      </button>
                    )}
                    {campOutcome === "unfinished" && (
                      <button className="primary-button" type="button" onClick={() => beginCampFollowUp(10)}>
                        <span>같은 목표로 10분 더</span><strong>→</strong>
                      </button>
                    )}
                    {campOutcome === "split" && (
                      <div className="mini-quest-actions">
                        <button type="button" onClick={() => beginCampFollowUp(5, true)}>5분 미니 퀘스트</button>
                        <button type="button" onClick={() => beginCampFollowUp(10, true)}>10분 미니 퀘스트</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button className="primary-button" type="button" onClick={beginFocus}>
                <span>
                  {completedExpedition && completedExpedition.currentSet < completedExpedition.totalSets
                    ? `${completedExpedition.currentSet + 1}번째 구간 시작`
                    : `${focusMinutes}분 집중 시작`}
                </span>
                <strong>→</strong>
              </button>
            )}
            <button
              className="text-button"
              type="button"
              onClick={() => {
                leaveFullscreen();
                setScreen(completionMode === "focus" ? "select" : "setup");
              }}
            >
              {completionMode === "focus" ? "홈으로 돌아가기" : "시간 다시 설정하기"}
            </button>
          </div>
        </section>
      )}
      <AuthDialog
        googleEnabled={cloudSync.googleAuthEnabled}
        onClose={() => setShowAuthDialog(false)}
        onGoogle={cloudSync.signInWithGoogle}
        onResetPassword={cloudSync.resetPassword}
        onSignIn={cloudSync.signIn}
        onSignUp={cloudSync.signUp}
        onUpdatePassword={cloudSync.updatePassword}
        open={showAuthDialog || cloudSync.passwordRecovery}
        passwordRecovery={cloudSync.passwordRecovery}
      />
    </main>
  );
}
