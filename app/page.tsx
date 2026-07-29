"use client";

/* Local-storage hydration intentionally restores several client-only state values. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  addFocusRecord,
  createActiveSession,
  createFocusRecord,
  getDailyCount,
  getWeeklySummary,
  normalizeFocusIntent,
  parseActiveSession,
  parseHistory,
  pauseActiveSession,
  resumeActiveSession,
  type ActiveSession,
  type AdventureId,
  type BgmId,
  type FocusRecord,
  type SessionMode,
} from "@/lib/pomodoro";
import type { StudyQuest } from "@/lib/study-quests";

type Screen = "select" | "setup" | "focus" | "complete";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const FOCUS_INTENT_KEY = "focus-quest-focus-intent";
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

type Adventure = {
  id: AdventureId;
  name: string;
  friend: string;
  tagline: string;
  description: string;
  image: string;
  color: string;
  soft: string;
  icon: string;
};

const adventures: Adventure[] = [
  {
    id: "hike",
    name: "구름산 등산",
    friend: "모모",
    tagline: "한 걸음씩 정상까지",
    description: "숲길을 지나 노을빛 정상에 도착해요.",
    image: `${publicBasePath}/characters/momo-hiking.png`,
    color: "#f0b13e",
    soft: "#173d37",
    icon: "⛰",
  },
  {
    id: "swim",
    name: "산호빛 수영",
    friend: "포도",
    tagline: "물결을 따라 첨벙첨벙",
    description: "맑은 바다를 건너 작은 섬을 찾아가요.",
    image: `${publicBasePath}/characters/podo-swimming.png`,
    color: "#36c4ce",
    soft: "#103b50",
    icon: "≈",
  },
  {
    id: "fish",
    name: "별빛 낚시",
    friend: "보리",
    tagline: "기다림도 멋진 모험",
    description: "잔잔한 호숫가에서 별 물고기를 기다려요.",
    image: `${publicBasePath}/characters/bori-fishing.png`,
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
  const audioRef = useRef<AudioContext | null>(null);
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const completionLockRef = useRef(false);
  const completeQuestSetRef = useRef<
    ((questId: string, sessionId: string, durationMinutes: number) => void) | null
  >(null);

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
              completedAt: new Date(session.endAt ?? Date.now()),
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          nextHistory = addFocusRecord(nextHistory, record);
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
        setCompletionMode(previousSession.mode);
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
    const stats = window.localStorage.getItem("haru-focus-stats");
    const storedHistory = window.localStorage.getItem(HISTORY_KEY);
    const storedSession = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    const storedSessionUpdatedAt = window.localStorage.getItem(
      ACTIVE_SESSION_UPDATED_AT_KEY,
    );
    let loadedFocusMinutes = 25;
    let loadedSelectedId: AdventureId = "hike";

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
              completedAt,
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          loadedHistory = addFocusRecord(loadedHistory, record);
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
    persistSession(null);

    if (session.mode === "focus") {
      const record = {
        ...createFocusRecord({
          durationMinutes: session.durationMinutes,
          adventureId: session.adventureId,
          questId: session.questId,
          focusIntent: session.focusIntent,
          completedAt: new Date(),
        }),
        id: `${session.startedAt}-${session.adventureId}`,
      };

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
    setEndAt(null);
    setPaused(false);
    setShowExit(false);

    if (session.mode === "focus") {
      setRemaining(0);
      setIsCelebrating(true);
      return;
    }

    setScreen("complete");
  }, [persistSession, stopAudio]);

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
    options?: { durationMinutes?: number; questId?: string | null },
  ) => {
    const durationMinutes =
      options?.durationMinutes ??
      (mode === "focus" ? focusMinutes : breakMinutes);
    const seconds = durationMinutes * 60;
    const theme = mode === "focus" ? bgm : "quiet";
    const intent =
      mode === "focus"
        ? normalizeFocusIntent(focusIntent) || "자유 집중"
        : undefined;
    const sessionQuestId =
      options?.questId === undefined ? activeQuestId : options.questId;
    const session = createActiveSession({
      mode,
      durationMinutes,
      adventureId: selectedId,
      bgm: theme,
      questId: sessionQuestId ?? undefined,
      focusIntent: intent,
    });

    completionLockRef.current = false;
    setIsCelebrating(false);
    if (mode === "focus") {
      setFocusMinutes(durationMinutes);
      setFocusIntent(intent ?? "");
    }
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

  const beginFocus = () => beginSession("focus");
  const beginBreak = () => beginSession("break");
  const beginQuickFocus = (durationMinutes: number) => {
    setActiveQuestId(null);
    beginSession("focus", { durationMinutes, questId: null });
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
    const returnScreen: Screen = sessionMode === "focus" ? "select" : "setup";
    stopAudio();
    persistSession(null);
    setShowExit(false);
    setEndAt(null);
    setPaused(false);
    setIsCelebrating(false);
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

  return (
    <main className={`app-shell screen-${screen}`} style={{ "--accent": selected.color } as React.CSSProperties}>
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
                } as React.CSSProperties
              }
              aria-label={`현재 모험 친구 ${selected.friend}`}
            >
              <div className="quick-companion-status">
                <span>READY</span>
                <i />
                지난 모험 이어가기
              </div>
              <div className="quick-companion-stage">
                <div className="companion-pixel-sun" />
                <div className="companion-route" />
                <img
                  src={selected.image}
                  alt={`${selected.name} 친구 ${selected.friend}`}
                />
              </div>
              <div className="quick-companion-copy">
                <span>{selected.icon} 오늘의 동행</span>
                <h2>{selected.friend}와 {selected.name}</h2>
                <p>
                  {selected.tagline} ·{" "}
                  {bgms.find((item) => item.id === bgm)?.name ?? "고요히"}
                </p>
              </div>

              <details className="adventure-switcher">
                <summary>모험 친구 바꾸기</summary>
                <div className="adventure-options">
                  {adventures.map((adventure) => (
                    <button
                      aria-pressed={selectedId === adventure.id}
                      className={selectedId === adventure.id ? "is-active" : ""}
                      key={adventure.id}
                      onClick={() => chooseAdventure(adventure.id)}
                      type="button"
                    >
                      <img src={adventure.image} alt="" />
                      <span>
                        <strong>{adventure.friend}</strong>
                        <small>{adventure.name}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            </aside>
          </section>

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
                  {history.slice(0, 4).map((record) => {
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
                          </small>
                        </div>
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

              <button className="primary-button" type="button" onClick={beginFocus}>
                <span>{selected.friend}와 집중 시작</span>
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
              {completionMode === "focus"
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
              {completionMode === "focus"
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
                ? `${sessionDurationMinutes}분 동안 온전히 집중했어요. 정말 멋진 모험이었어요.`
                : `${sessionDurationMinutes}분 동안 몸과 마음을 쉬었어요. 다음 모험을 시작해 볼까요?`}
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
                  {completionMode === "focus"
                    ? breakMinutes
                    : focusMinutes}
                </strong>
                <span>
                  {completionMode === "focus" ? "추천 휴식" : "다음 집중"}
                </span>
              </div>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={completionMode === "focus" ? beginBreak : beginFocus}
            >
              <span>
                {completionMode === "focus"
                  ? `${breakMinutes}분 쉬어가기`
                  : `${focusMinutes}분 집중 시작`}
              </span>
              <strong>→</strong>
            </button>
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
