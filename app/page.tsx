"use client";

/* Local-storage hydration intentionally restores several client-only state values. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import AuthDialog from "@/app/components/AuthDialog";
import CampLobby from "@/app/components/CampLobby";
import CampReflectionPanel from "@/app/components/CampReflectionPanel";
import RetentionPanel from "@/app/components/RetentionPanel";
import { StudyCheckpointPanel, StudyRecallPanel } from "@/app/components/StudyQuizPanel";
import { useCloudSync } from "@/app/hooks/useCloudSync";
import { useProductTelemetry } from "@/app/hooks/useProductTelemetry";
import { useStudyProgress } from "@/app/hooks/useStudyProgress";
import { useStudyQuests } from "@/app/hooks/useStudyQuests";
import { useSilentCamp } from "@/app/hooks/useSilentCamp";
import {
  ACTIVE_SESSION_UPDATED_AT_KEY,
  CLOUD_STATE_SCHEMA_VERSION,
  EMPTY_SESSION_UPDATED_AT,
  type CloudStateData,
} from "@/lib/cloud-state";
import {
  COMPANION_GROWTH_STORAGE_KEY,
  growthEntriesFromHistory,
  mergeCompanionGrowthEntries,
  parseStoredCompanionGrowth,
  getCompanionGrowth,
  type CompanionGrowthEntry,
} from "@/lib/companion-growth";
import {
  ACTIVE_SESSION_KEY,
  HISTORY_KEY,
  addCampReflection,
  addCampOutcome,
  addFocusRecord,
  createActiveSession,
  createFocusRecord,
  createExpeditionProgress,
  getDailyCount,
  getFocusStreak,
  getWeeklySummary,
  normalizeFocusIntent,
  parseActiveSession,
  parseHistory,
  pauseActiveSession,
  resumeActiveSession,
  type ActiveSession,
  type AdventureId,
  type BgmId,
  type CampOutcome,
  type CampDifficulty,
  type FocusRecord,
  type ExpeditionProgress,
  type SessionMode,
} from "@/lib/pomodoro";
import {
  RECOVERY_QUEST_KEY,
  RECOVERY_UPDATED_AT_KEY,
  createRecoveryQuest,
  getAdventureTraceProgress,
  getBehaviorInsights,
  getCompanionMemory,
  getWorldProgress,
  parseRecoveryQuest,
  type RecoveryQuest,
} from "@/lib/retention";
import type { StudyQuest } from "@/lib/study-quests";
import type { StudyMaterial } from "@/lib/pdf-analysis";
import {
  createUnseenStudyQuiz,
  parseStudyPageRange,
  type StudyQuiz,
} from "@/lib/study-quiz";
import {
  emptyQuizFeedback,
  type QuizFeedbackStage,
  type QuizFeedbackState,
  type QuizFeedbackValue,
} from "@/lib/quiz-feedback";
import {
  createLocalCampSession,
  normalizeCampNickname,
  readCampCodeFromUrl,
  toSilentCampTimer,
  type SilentCampTimer,
} from "@/lib/silent-camp";

const AdventureQuestScene = lazy(
  () => import("@/app/components/AdventureQuestScene"),
);
const FishingQuestScene = lazy(
  () => import("@/app/components/FishingQuestScene"),
);
const RestQuestScene = lazy(
  () => import("@/app/components/RestQuestScene"),
);
const QuestBoard = lazy(() => import("@/app/components/QuestBoard"));

type Screen = "select" | "camp" | "setup" | "focus" | "complete";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const FOCUS_INTENT_KEY = "focus-quest-focus-intent";
const EXPEDITION_SETS_KEY = "focus-quest-expedition-sets";
const NOTIFICATION_KEY = "focus-quest-notifications";
const REMINDER_TIME_KEY = "focus-quest-reminder-time";
const REMINDER_SENT_KEY = "focus-quest-reminder-sent";
const DISTRACTION_NOTES_KEY = "focus-quest-distraction-notes";
const CAMP_NICKNAME_KEY = "focus-quest-camp-nickname";
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

type AmbientAudioContext = AudioContext & {
  focusQuestBellTimer?: number;
};

type Adventure = {
  id: AdventureId;
  chapter: string;
  name: string;
  friend: string;
  role: string;
  tagline: string;
  reward: string;
  description: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  background: string;
  color: string;
  soft: string;
  icon: string;
};

const adventures: Adventure[] = [
  {
    id: "hike",
    chapter: "첫 번째 길",
    name: "해오름 봉우리",
    friend: "모리",
    role: "씩씩한 산길잡이",
    tagline: "노을숲 능선을 올라 정상에 깃발을 세워요.",
    reward: "정상에 깃발 세우기",
    description:
      "한 걸음씩 오를수록 숲이 걷히고, 마지막엔 바람 부는 정상에서 깃발이 펼쳐져요.",
    image: `${publicBasePath}/characters/momo-hiking.png`,
    imageWidth: 1254,
    imageHeight: 1254,
    background: `${publicBasePath}/backgrounds/hike-pixel-summit-v1.png`,
    color: "#f0b13e",
    soft: "#173d37",
    icon: "산길",
  },
  {
    id: "swim",
    chapter: "두 번째 길",
    name: "유리산호 유적",
    friend: "나루",
    role: "호기심 많은 유적 잠수부",
    tagline: "산호길 끝의 오래된 보물상자를 깨워요.",
    reward: "황금 보물상자 열기",
    description:
      "햇빛이 스미는 해저 유적을 건너면, 잠들어 있던 보물상자가 황금빛으로 열려요.",
    image: `${publicBasePath}/characters/podo-swimming.png`,
    imageWidth: 1402,
    imageHeight: 1122,
    background: `${publicBasePath}/backgrounds/swim-pixel-depth.png`,
    color: "#36c4ce",
    soft: "#103b50",
    icon: "해저",
  },
  {
    id: "fish",
    chapter: "세 번째 길",
    name: "달비늘 호수",
    friend: "보리",
    role: "느긋한 전설 낚시꾼",
    tagline: "달빛 부두에서 전설의 황금 잉어를 기다려요.",
    reward: "황금 잉어 낚기",
    description:
      "잔잔한 수면에 낚싯줄을 드리우고 기다리면, 마지막엔 황금 잉어가 힘차게 뛰어올라요.",
    image: `${publicBasePath}/characters/bori-fishing.png`,
    imageWidth: 1448,
    imageHeight: 1086,
    background: `${publicBasePath}/backgrounds/fish-pixel-lake-v1.png`,
    color: "#ef8b47",
    soft: "#204847",
    icon: "호수",
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

const restScenes: Record<
  AdventureId,
  { title: string; narration: string; progressLabel: string }
> = {
  hike: {
    title: "능선에서 쉬는 중",
    narration: "바람이 잦아들 때까지 잠시 숨을 골라요.",
    progressLabel: "차 한 잔의 여유",
  },
  swim: {
    title: "기포 정원에서 쉬는 중",
    narration: "올라가는 기포를 보며 천천히 숨을 골라요.",
    progressLabel: "물결을 쉬어 가는 시간",
  },
  fish: {
    title: "달빛 부두에서 쉬는 중",
    narration: "잔잔한 물결을 보며 잠시 눈을 쉬어 가요.",
    progressLabel: "찌도 잠시 쉬는 시간",
  },
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
  if (mode === "break") return "숨을 고르며 다음 모험을 준비하고 있어요";

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

  const context = new AudioContextClass() as AmbientAudioContext;
  const now = context.currentTime;
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const toneFilter = context.createBiquadFilter();
  const reverb = context.createConvolver();
  const dry = context.createGain();
  const wet = context.createGain();

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.18, now + 2.8);
  compressor.threshold.value = -28;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.08;
  compressor.release.value = 0.8;
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = theme === "waves" ? 720 : 620;
  toneFilter.Q.value = 0.45;
  dry.gain.value = 0.78;
  wet.gain.value = 0.2;

  const impulseLength = context.sampleRate * 2.6;
  const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < impulseLength; index += 1) {
      const envelope = Math.pow(1 - index / impulseLength, 2.8);
      data[index] = (Math.random() * 2 - 1) * envelope * 0.45;
    }
  }
  reverb.buffer = impulse;

  toneFilter.connect(dry);
  toneFilter.connect(reverb);
  reverb.connect(wet);
  dry.connect(master);
  wet.connect(master);
  master.connect(compressor);
  compressor.connect(context.destination);

  const frequencies =
    theme === "forest"
      ? [98, 146.83, 196, 246.94]
      : theme === "lake"
        ? [110, 164.81, 220, 261.63]
        : [87.31, 130.81, 174.61, 220];

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = index % 2 === 0 ? -3 : 3;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      index === 0 ? 0.042 : 0.024,
      now + 2.2 + index * 0.35,
    );
    lfo.frequency.value = 0.035 + index * 0.012;
    lfoGain.gain.value = 4 + index;
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.detune);
    oscillator.connect(gain);
    gain.connect(toneFilter);
    oscillator.start();
    lfo.start();
  });

  if (theme === "lake") {
    const strikeBell = () => {
      if (context.state === "closed") return;
      const strikeAt = context.currentTime + 0.05;
      [392, 784.8].forEach((frequency, index) => {
        const bell = context.createOscillator();
        const bellGain = context.createGain();
        bell.type = "sine";
        bell.frequency.value = frequency;
        bellGain.gain.setValueAtTime(0.0001, strikeAt);
        bellGain.gain.exponentialRampToValueAtTime(
          index === 0 ? 0.014 : 0.006,
          strikeAt + 0.08,
        );
        bellGain.gain.exponentialRampToValueAtTime(0.0001, strikeAt + 4.2);
        bell.connect(bellGain);
        bellGain.connect(master);
        bell.start(strikeAt);
        bell.stop(strikeAt + 4.3);
      });
    };
    window.setTimeout(strikeBell, 4_500);
    context.focusQuestBellTimer = window.setInterval(strikeBell, 16_000);
  }

  if (theme === "waves" || theme === "forest") {
    const buffer = context.createBuffer(1, context.sampleRate * 5, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.992 + white * 0.008;
      data[i] = last * 1.8;
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = theme === "waves" ? 540 : 360;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(
      theme === "waves" ? 0.024 : 0.012,
      now + 3.4,
    );
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(toneFilter);
    noise.start();
  }

  void context.resume();
  return context;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("select");
  const [showStudyTools, setShowStudyTools] = useState(false);
  const [selectedId, setSelectedId] = useState<AdventureId>("hike");
  const [campNickname, setCampNickname] = useState("모험가");
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
  const [campReflectionNote, setCampReflectionNote] = useState("");
  const [campConfidence, setCampConfidence] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [campDifficulty, setCampDifficulty] = useState<CampDifficulty>("steady");
  const [campReflectionSaved, setCampReflectionSaved] = useState(false);
  const [companionGrowth, setCompanionGrowth] = useState<CompanionGrowthEntry[]>([]);
  const [completedRecordId, setCompletedRecordId] = useState<string | null>(null);
  const [completedQuestId, setCompletedQuestId] = useState<string | null>(null);
  const [completedSessionKey, setCompletedSessionKey] = useState<string | null>(null);
  const [expeditionSets, setExpeditionSets] = useState(1);
  const [sessionExpedition, setSessionExpedition] = useState<ExpeditionProgress | null>(null);
  const [completedExpedition, setCompletedExpedition] = useState<ExpeditionProgress | null>(null);
  const [recoveryQuest, setRecoveryQuest] = useState<RecoveryQuest | null>(null);
  const [recoveryUpdatedAt, setRecoveryUpdatedAt] = useState(
    EMPTY_SESSION_UPDATED_AT,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("");
  const [miniTimerSupported, setMiniTimerSupported] = useState(false);
  const [activeStudyMaterial, setActiveStudyMaterial] = useState<StudyMaterial | null>(null);
  const [studyRangeStart, setStudyRangeStart] = useState(1);
  const [studyRangeEnd, setStudyRangeEnd] = useState(1);
  const [reachedPage, setReachedPage] = useState("1");
  const [checkpointQuiz, setCheckpointQuiz] = useState<StudyQuiz | null>(null);
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | null>(null);
  const [checkpointSkipped, setCheckpointSkipped] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState("");
  const [reviewQuiz, setReviewQuiz] = useState<StudyQuiz | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState<number | null>(null);
  const [checkpointFeedback, setCheckpointFeedback] =
    useState<QuizFeedbackState>(emptyQuizFeedback);
  const [reviewFeedback, setReviewFeedback] =
    useState<QuizFeedbackState>(emptyQuizFeedback);
  const [distractionDraft, setDistractionDraft] = useState("");
  const [distractionNotes, setDistractionNotes] = useState<string[]>([]);
  const audioRef = useRef<AmbientAudioContext | null>(null);
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const completionLockRef = useRef(false);
  const completeQuestSetRef = useRef<
    ((questId: string, sessionId: string, durationMinutes: number) => void) | null
  >(null);
  const miniTimerWindowRef = useRef<Window | null>(null);

  const selected = useMemo(
    () => adventures.find((item) => item.id === selectedId) ?? adventures[0],
    [selectedId],
  );

  useEffect(() => {
    const inviteCode = readCampCodeFromUrl(window.location.href);
    if (inviteCode.length >= 6) setScreen("camp");
  }, []);

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
  const longTermGrowthHistory = useMemo<FocusRecord[]>(
    () => companionGrowth.map((entry) => ({
      id: entry.sessionId,
      completedAt: entry.completedAt,
      durationMinutes: entry.minutes,
      adventureId: entry.adventureId,
    })),
    [companionGrowth],
  );
  const worldProgress = useMemo(
    () =>
      adventures.map((adventure) => ({
        friend: adventure.friend,
        name: adventure.name,
        progress: getWorldProgress(longTermGrowthHistory, adventure.id),
        trace: getAdventureTraceProgress(longTermGrowthHistory, adventure.id),
      })),
    [longTermGrowthHistory],
  );
  const selectedWorld =
    worldProgress.find((world) => world.progress.adventureId === selectedId) ??
    worldProgress[0];
  const companionMemory = useMemo(
    () => getCompanionMemory(history, selectedId),
    [history, selectedId],
  );
  const selectedCompanionGrowth = useMemo(
    () => getCompanionGrowth(companionGrowth, selectedId),
    [companionGrowth, selectedId],
  );
  const focusStreak = useMemo(() => getFocusStreak(history), [history]);
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
  const lastAdventure = history[0] ?? null;
  const completedRecord = completedRecordId
    ? history.find((record) => record.id === completedRecordId) ?? null
    : null;
  const completedTrace = useMemo(
    () =>
      completedRecord && completedRecord.durationMinutes >= 10
        ? getAdventureTraceProgress(longTermGrowthHistory, completedRecord.adventureId)
        : null,
    [completedRecord, longTermGrowthHistory],
  );
  const selectedWorldLevel = selectedWorld.progress.level;
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
      recoveryQuest,
      recoveryUpdatedAt,
      companionGrowth,
    }),
    [
      bgm,
      breakMinutes,
      cloudActiveSession,
      focusMinutes,
      history,
      companionGrowth,
      recoveryQuest,
      recoveryUpdatedAt,
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
    setRecoveryQuest(data.recoveryQuest);
    setRecoveryUpdatedAt(data.recoveryUpdatedAt);
    if (data.recoveryQuest) {
      window.localStorage.setItem(
        RECOVERY_QUEST_KEY,
        JSON.stringify(data.recoveryQuest),
      );
    } else {
      window.localStorage.removeItem(RECOVERY_QUEST_KEY);
    }
    window.localStorage.setItem(
      RECOVERY_UPDATED_AT_KEY,
      data.recoveryUpdatedAt,
    );
    setCompanionGrowth(data.companionGrowth);
    window.localStorage.setItem(
      COMPANION_GROWTH_STORAGE_KEY,
      JSON.stringify(data.companionGrowth),
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
              startedAt: session.startedAt,
              completedAt: new Date(session.endAt ?? Date.now()),
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          nextHistory = addFocusRecord(nextHistory, record);
          setCompletedRecordId(record.id);
          setCompletedQuestId(session.questId ?? null);
          setCompletedSessionKey(record.id);
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
        setCompletedSessionKey(completedId);
        setCampOutcome(completedRecord?.campOutcome ?? null);
        setCampReflectionNote(completedRecord?.campReflection?.note ?? "");
        setCampConfidence(completedRecord?.campReflection?.confidence ?? 3);
        setCampDifficulty(completedRecord?.campReflection?.difficulty ?? "steady");
        setCampReflectionSaved(Boolean(completedRecord?.campReflection));
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
  const studyProgress = useStudyProgress(questLoggedIn);
  const completedLearningSignal = completedQuestId
    ? studyProgress.getLearningSignal(completedQuestId)
    : null;
  const { track: trackProductEvent } = useProductTelemetry(questLoggedIn);
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
    const storedRecoveryUpdatedAt = window.localStorage.getItem(
      RECOVERY_UPDATED_AT_KEY,
    );
    const storedReminderTime = window.localStorage.getItem(REMINDER_TIME_KEY) ?? "";
    const stats = window.localStorage.getItem("haru-focus-stats");
    const storedHistory = window.localStorage.getItem(HISTORY_KEY);
    const storedCompanionGrowth = window.localStorage.getItem(
      COMPANION_GROWTH_STORAGE_KEY,
    );
    const storedSession = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    const storedSessionUpdatedAt = window.localStorage.getItem(
      ACTIVE_SESSION_UPDATED_AT_KEY,
    );
    const storedDistractionNotes = window.localStorage.getItem(
      DISTRACTION_NOTES_KEY,
    );
    const storedCampNickname = window.localStorage.getItem(CAMP_NICKNAME_KEY);
    let loadedFocusMinutes = 25;
    let loadedSelectedId: AdventureId = "hike";

    if (storedCampNickname) {
      setCampNickname(normalizeCampNickname(storedCampNickname) || "모험가");
    }

    if (storedDistractionNotes) {
      try {
        const notes = JSON.parse(storedDistractionNotes);
        if (Array.isArray(notes)) {
          setDistractionNotes(
            notes
              .filter((note): note is string => typeof note === "string")
              .map((note) => note.trim().slice(0, 80))
              .filter(Boolean)
              .slice(0, 8),
          );
        }
      } catch {
        window.localStorage.removeItem(DISTRACTION_NOTES_KEY);
      }
    }

    if (Number.isInteger(storedExpeditionSets) && storedExpeditionSets >= 1 && storedExpeditionSets <= 8) {
      setExpeditionSets(storedExpeditionSets);
    }
    const loadedRecoveryQuest = parseRecoveryQuest(storedRecoveryQuest);
    setRecoveryQuest(loadedRecoveryQuest);
    if (storedRecoveryQuest && !loadedRecoveryQuest) {
      const clearedAt = new Date().toISOString();
      window.localStorage.removeItem(RECOVERY_QUEST_KEY);
      window.localStorage.setItem(RECOVERY_UPDATED_AT_KEY, clearedAt);
      setRecoveryUpdatedAt(clearedAt);
    } else if (loadedRecoveryQuest) {
      const loadedRecoveryUpdatedAt =
        storedRecoveryUpdatedAt &&
        !Number.isNaN(Date.parse(storedRecoveryUpdatedAt))
          ? storedRecoveryUpdatedAt
          : loadedRecoveryQuest.createdAt;
      window.localStorage.setItem(
        RECOVERY_UPDATED_AT_KEY,
        loadedRecoveryUpdatedAt,
      );
      setRecoveryUpdatedAt(loadedRecoveryUpdatedAt);
    } else if (
      storedRecoveryUpdatedAt &&
      !Number.isNaN(Date.parse(storedRecoveryUpdatedAt))
    ) {
      setRecoveryUpdatedAt(storedRecoveryUpdatedAt);
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
    const parsedGrowth = parseStoredCompanionGrowth(storedCompanionGrowth);
    const loadedGrowth = mergeCompanionGrowthEntries(
      parsedGrowth,
      growthEntriesFromHistory(loadedHistory),
    );
    setCompanionGrowth(loadedGrowth);
    window.localStorage.setItem(
      COMPANION_GROWTH_STORAGE_KEY,
      JSON.stringify(loadedGrowth),
    );
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
              startedAt: session.startedAt,
              completedAt,
            }),
            id: `${session.startedAt}-${session.adventureId}`,
          };
          loadedHistory = addFocusRecord(loadedHistory, record);
          setCompletedRecordId(record.id);
          setCompletedQuestId(session.questId ?? null);
          setCompletedSessionKey(record.id);
          setCampOutcome(record.campOutcome ?? null);
          setCampReflectionNote(record.campReflection?.note ?? "");
          setCampConfidence(record.campReflection?.confidence ?? 3);
          setCampDifficulty(record.campReflection?.difficulty ?? "steady");
          setCampReflectionSaved(Boolean(record.campReflection));
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
    setCompanionGrowth((current) => {
      const merged = mergeCompanionGrowthEntries(
        current,
        growthEntriesFromHistory(history),
      );
      if (JSON.stringify(merged) === JSON.stringify(current)) return current;
      window.localStorage.setItem(
        COMPANION_GROWTH_STORAGE_KEY,
        JSON.stringify(merged),
      );
      return merged;
    });
  }, [history, hydrated]);

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
      CAMP_NICKNAME_KEY,
      normalizeCampNickname(campNickname) || "모험가",
    );
  }, [campNickname, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      FOCUS_INTENT_KEY,
      normalizeFocusIntent(focusIntent),
    );
  }, [focusIntent, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (distractionNotes.length > 0) {
      window.localStorage.setItem(
        DISTRACTION_NOTES_KEY,
        JSON.stringify(distractionNotes),
      );
    } else {
      window.localStorage.removeItem(DISTRACTION_NOTES_KEY);
    }
  }, [distractionNotes, hydrated]);

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
          icon: `${publicBasePath}/brand/focus-quest-mark.png`,
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
      if (audioRef.current.focusQuestBellTimer) {
        window.clearInterval(audioRef.current.focusQuestBellTimer);
      }
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
          startedAt: session.startedAt,
          completedAt: new Date(),
        }),
        id: `${session.startedAt}-${session.adventureId}`,
      };
      setCompletedRecordId(record.id);
      setCompletedQuestId(session.questId ?? null);
      setCompletedSessionKey(record.id);
      setCompletedExpedition(session.expedition ?? null);
      setCampOutcome(null);
      setCampReflectionNote("");
      setCampConfidence(3);
      setCampDifficulty("steady");
      setCampReflectionSaved(false);

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
      void trackProductEvent("focus_completed", {
        adventureId: session.adventureId,
        durationMinutes: session.durationMinutes,
        questId: session.questId ?? null,
        outcome: "completed",
      });
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
  }, [notificationsEnabled, persistSession, stopAudio, trackProductEvent]);

  useEffect(() => {
    if (!isCelebrating) return;
    const celebrationTimer = window.setTimeout(() => {
      setIsCelebrating(false);
      setScreen("complete");
    }, 4200);
    return () => window.clearTimeout(celebrationTimer);
  }, [isCelebrating]);

  useEffect(() => {
    if (screen === "camp" || screen === "complete") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [screen]);

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
    setActiveStudyMaterial(null);
    setCheckpointQuiz(null);
    setReviewQuiz(null);
    setCheckpointFeedback(emptyQuizFeedback());
    setReviewFeedback(emptyQuizFeedback());
    setSelectedId(id);
    setBgm(adventureBgms[id]);
    setSessionMode("focus");
    setSessionDurationMinutes(focusMinutes);
    setRemaining(focusMinutes * 60);
  };

  const commitRecoveryQuest = useCallback(
    (next: RecoveryQuest | null, updatedAt = new Date().toISOString()) => {
      setRecoveryQuest(next);
      setRecoveryUpdatedAt(updatedAt);
      window.localStorage.setItem(RECOVERY_UPDATED_AT_KEY, updatedAt);
      if (next) {
        window.localStorage.setItem(RECOVERY_QUEST_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(RECOVERY_QUEST_KEY);
      }
    },
    [],
  );

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
      commitRecoveryQuest(null);
      setDistractionDraft("");
      setDistractionNotes([]);
      window.localStorage.removeItem(DISTRACTION_NOTES_KEY);
    }
    setSelectedId(sessionAdventureId);
    if (mode === "focus") setBgm(sessionBgm);
    setSessionExpedition(options?.expedition ?? null);
    setCampOutcome(null);
    setCampReflectionNote("");
    setCampConfidence(3);
    setCampDifficulty("steady");
    setCampReflectionSaved(false);
    persistSession(session);
    setSessionMode(mode);
    setSessionDurationMinutes(durationMinutes);
    setRemaining(seconds);
    setEndAt(session.endAt);
    setPaused(false);
    setScreen("focus");
    startAudio(theme);
    enterFullscreen();
    if (mode === "focus") {
      void trackProductEvent("focus_started", {
        adventureId: sessionAdventureId,
        durationMinutes,
        questId: sessionQuestId ?? null,
      });
    }
  };

  const beginFocus = () => {
    if (completionMode === "break" && activeStudyMaterial) {
      const nextStart = Math.min(studyRangeEnd, Math.max(studyRangeStart, Number(reachedPage) + 1));
      setStudyRangeStart(nextStart);
      setReachedPage(String(studyRangeEnd));
      setCheckpointQuiz(null);
      setCheckpointAnswer(null);
      setCheckpointSkipped(false);
      setCheckpointMessage("");
      setReviewQuiz(null);
      setReviewAnswer(null);
      setCheckpointFeedback(emptyQuizFeedback());
      setReviewFeedback(emptyQuizFeedback());
    }
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
  const parkDistraction = () => {
    const note = distractionDraft.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!note) return;
    setDistractionNotes((current) => [...current, note].slice(-8));
    setDistractionDraft("");
  };

  const restartAdventure = (record: FocusRecord) => {
    const adventureBgm = adventureBgms[record.adventureId];
    commitRecoveryQuest(null);
    setActiveStudyMaterial(null);
    setCheckpointQuiz(null);
    setReviewQuiz(null);
    setCheckpointFeedback(emptyQuizFeedback());
    setReviewFeedback(emptyQuizFeedback());
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
    commitRecoveryQuest(null);
    beginSession("focus", {
      durationMinutes: next.durationMinutes,
      questId: next.questId ?? null,
      focusIntent: next.focusIntent,
      adventureId: next.adventureId,
      bgm: next.bgm,
      updateFocusPreference: false,
    });
  };

  const dismissRecoveryQuest = () => commitRecoveryQuest(null);

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

  const applySilentCampTimer = useCallback(
    (timer: SilentCampTimer) => {
      const next = createLocalCampSession(
        timer,
        Date.now(),
        selectedId,
        adventureBgms[selectedId],
      );
      if (next.remainingSeconds <= 0) return;
      const current = activeSessionRef.current;
      if (
        current?.startedAt === next.startedAt &&
        current.paused === next.paused &&
        (next.paused
          ? current.remainingSeconds === next.remainingSeconds
          : Math.abs((current.endAt ?? 0) - (next.endAt ?? 0)) < 1_500)
      ) {
        return;
      }

      completionLockRef.current = false;
      persistSession(next);
      setSelectedId(next.adventureId);
      setBgm(next.bgm);
      setSessionMode(next.mode);
      setSessionDurationMinutes(next.durationMinutes);
      setRemaining(next.remainingSeconds);
      setEndAt(next.endAt);
      setPaused(next.paused);
      setFocusIntent(next.focusIntent ?? "조용한 집중 캠프");
      setActiveQuestId(null);
      setSessionExpedition(null);
      setShowExit(false);
      setIsCelebrating(false);
      setScreen("focus");
      if (!next.paused) startAudio(next.mode === "focus" ? next.bgm : "quiet");
    },
    [persistSession, selectedId, startAudio],
  );
  const activeCampTimer = useMemo(
    () => toSilentCampTimer(cloudActiveSession),
    [cloudActiveSession],
  );
  const {
    chatMessages: silentCampChatMessages,
    code: silentCampCode,
    copyInvite: copySilentCampLink,
    count: silentCampCount,
    currentMemberId: silentCampMemberId,
    join: joinSilentCamp,
    leaderId: silentCampLeaderId,
    leave: leaveSilentCamp,
    members: silentCampMembers,
    message: silentCampMessage,
    role: silentCampRole,
    sendChat: sendSilentCampChat,
    setCode: setSilentCampCode,
    status: silentCampStatus,
  } = useSilentCamp({
    activeTimer: activeCampTimer,
    adventureId: selectedId,
    focusMinutes,
    nickname: campNickname,
    onRemoteTimer: applySilentCampTimer,
  });

  useEffect(() => {
    if (
      screen === "select" &&
      (silentCampStatus === "connecting" || silentCampStatus === "joined")
    ) {
      setScreen("camp");
    }
  }, [screen, silentCampStatus]);

  const beginCampFocus = () => {
    if (silentCampRole !== "leader") return;
    beginSession("focus", {
      focusIntent: "친구와 함께 집중",
      questId: null,
    });
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

  const saveCampReflection = () => {
    if (!completedRecordId) return;
    setHistory((current) => {
      const nextHistory = addCampReflection(current, completedRecordId, {
        confidence: campConfidence,
        difficulty: campDifficulty,
        note: campReflectionNote,
      });
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      return nextHistory;
    });
    setCampReflectionSaved(true);
  };

  const persistReachedPage = (reached: number) => {
    if (!completedQuestId || !activeStudyMaterial) return;
    void studyProgress.saveProgress(
      completedQuestId,
      activeStudyMaterial.id,
      reached,
    );
  };

  const persistQuizAttempt = (
    stage: "checkpoint" | "review",
    quizKey: string,
    selectedIndex: number | null,
    correct: boolean | null,
    skipped: boolean,
  ) => {
    if (!completedQuestId || !completedSessionKey || !activeStudyMaterial) return;
    const reached = Math.min(
      studyRangeEnd,
      Math.max(studyRangeStart, Math.round(Number(reachedPage) || studyRangeStart)),
    );
    void studyProgress.recordAttempt({
      questId: completedQuestId,
      materialId: activeStudyMaterial.id,
      sessionKey: completedSessionKey,
      stage,
      quizKey,
      rangeStart: studyRangeStart,
      rangeEnd: studyRangeEnd,
      reachedPage: reached,
      selectedIndex,
      isCorrect: correct,
      skipped,
    });
  };

  const prepareCheckpointQuiz = () => {
    const source = activeStudyMaterial?.quizSource;
    if (!source) {
      setCheckpointSkipped(true);
      setCheckpointMessage("이 자료에서는 읽을 수 있는 글자를 찾지 못해 범위만 기록했어요.");
      return;
    }
    const reached = Math.min(
      studyRangeEnd,
      Math.max(studyRangeStart, Math.round(Number(reachedPage) || studyRangeStart)),
    );
    setReachedPage(String(reached));
    persistReachedPage(reached);
    const attemptedKeys = completedQuestId
      ? studyProgress.attemptedQuizKeys(completedQuestId)
      : new Set<string>();
    const quiz = createUnseenStudyQuiz(
      source,
      studyRangeStart,
      reached,
      0,
      attemptedKeys,
    );
    if (!quiz) {
      setCheckpointSkipped(true);
      setCheckpointMessage("이 범위의 글자가 짧아 문제 대신 공부한 페이지를 기록했어요.");
      persistQuizAttempt(
        "checkpoint",
        `no-question:${studyRangeStart}:${reached}`,
        null,
        null,
        true,
      );
      void trackProductEvent("quiz_skipped", {
        questId: completedQuestId,
        outcome: "skipped",
      });
      return;
    }
    setCheckpointQuiz(quiz);
    setCheckpointAnswer(null);
    setCheckpointFeedback(emptyQuizFeedback());
    setReviewQuiz(
      createUnseenStudyQuiz(
        source,
        studyRangeStart,
        reached,
        1,
        new Set([...attemptedKeys, quiz.id]),
      ),
    );
    setReviewAnswer(null);
    setReviewFeedback(emptyQuizFeedback());
    setCheckpointMessage("");
  };

  const skipCheckpointQuiz = () => {
    const reached = Math.min(
      studyRangeEnd,
      Math.max(studyRangeStart, Math.round(Number(reachedPage) || studyRangeStart)),
    );
    setReachedPage(String(reached));
    setCheckpointSkipped(true);
    setReviewQuiz(null);
    persistReachedPage(reached);
    persistQuizAttempt(
      "checkpoint",
      `user-skip:${studyRangeStart}:${reached}`,
      null,
      null,
      true,
    );
    void trackProductEvent("quiz_skipped", {
      questId: completedQuestId,
      outcome: "skipped",
    });
  };

  const answerCheckpointQuiz = (index: number) => {
    if (!checkpointQuiz || checkpointAnswer !== null) return;
    const correct = index === checkpointQuiz.correctIndex;
    setCheckpointAnswer(index);
    persistQuizAttempt("checkpoint", checkpointQuiz.id, index, correct, false);
    void trackProductEvent("quiz_answered", {
      questId: completedQuestId,
      outcome: correct ? "correct" : "incorrect",
    });
  };

  const answerReviewQuiz = (index: number) => {
    if (!reviewQuiz || reviewAnswer !== null) return;
    const correct = index === reviewQuiz.correctIndex;
    setReviewAnswer(index);
    persistQuizAttempt("review", reviewQuiz.id, index, correct, false);
    void trackProductEvent("quiz_answered", {
      questId: completedQuestId,
      outcome: correct ? "correct" : "incorrect",
    });
  };

  const submitQuizFeedback = async (
    stage: QuizFeedbackStage,
    quiz: StudyQuiz,
    value: QuizFeedbackValue,
  ) => {
    const current = stage === "checkpoint" ? checkpointFeedback : reviewFeedback;
    if (current.status === "saving" || current.status === "saved") return;
    const setFeedback =
      stage === "checkpoint" ? setCheckpointFeedback : setReviewFeedback;
    setFeedback({ value, status: "saving" });
    const saved = Boolean(completedQuestId) && await trackProductEvent(
      "quiz_feedback_submitted",
      {
        feedbackValue: value,
        questId: completedQuestId,
        quizKey: quiz.id,
        quizStage: stage,
      },
    );
    setFeedback({ value, status: saved ? "saved" : "error" });
    if (saved) void studyProgress.refresh();
  };

  const replaceStudyQuiz = (stage: QuizFeedbackStage) => {
    const source = activeStudyMaterial?.quizSource;
    if (!source || !completedQuestId) return false;
    const reached = Math.min(
      studyRangeEnd,
      Math.max(studyRangeStart, Math.round(Number(reachedPage) || studyRangeStart)),
    );
    const attemptedKeys = studyProgress.attemptedQuizKeys(completedQuestId);
    const rejectedKeys = studyProgress.getQualitySignal(completedQuestId).rejectedQuizKeys;
    const excluded = new Set([
      ...attemptedKeys,
      ...rejectedKeys,
      ...(checkpointQuiz ? [checkpointQuiz.id] : []),
      ...(reviewQuiz ? [reviewQuiz.id] : []),
    ]);
    const replacement = createUnseenStudyQuiz(
      source,
      studyRangeStart,
      reached,
      stage === "checkpoint" ? 0 : 1,
      excluded,
    );
    if (!replacement) return false;
    if (stage === "checkpoint") {
      setCheckpointQuiz(replacement);
      setCheckpointAnswer(null);
      setCheckpointFeedback(emptyQuizFeedback());
    } else {
      setReviewQuiz(replacement);
      setReviewAnswer(null);
      setReviewFeedback(emptyQuizFeedback());
    }
    return true;
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

  const launchQuest = async (
    quest: StudyQuest,
    material: StudyMaterial | null,
    options: { mode?: "standard" | "review"; durationMinutes?: number } = {},
  ) => {
    const started = await questStore.startQuest(quest.id);
    if (!started) return;
    const range = material
      ? parseStudyPageRange(quest.sourcePages, material.pageCount)
      : { startPage: 1, endPage: 1 };
    const previousReached = studyProgress.getReachedPage(quest.id);
    const isReview = options.mode === "review";
    const nextStart =
      !isReview &&
      previousReached !== null &&
      previousReached >= range.startPage &&
      previousReached < range.endPage
        ? previousReached + 1
        : range.startPage;
    persistSession(null);
    setActiveQuestId(quest.id);
    setActiveStudyMaterial(material?.quizSource ? material : null);
    setStudyRangeStart(nextStart);
    setStudyRangeEnd(range.endPage);
    setReachedPage(String(range.endPage));
    setCheckpointQuiz(null);
    setCheckpointAnswer(null);
    setCheckpointSkipped(false);
    setCheckpointMessage("");
    setReviewQuiz(null);
    setReviewAnswer(null);
    setCheckpointFeedback(emptyQuizFeedback());
    setReviewFeedback(emptyQuizFeedback());
    const sessionMinutes = Math.min(
      120,
      Math.max(1, Math.round(options.durationMinutes ?? quest.focusMinutes)),
    );
    setFocusIntent(isReview ? `복습 · ${quest.title}` : quest.title);
    setSelectedId(quest.adventureId);
    setBgm(adventureBgms[quest.adventureId]);
    setFocusMinutes(sessionMinutes);
    setBreakMinutes(quest.breakMinutes);
    setExpeditionSets(
      isReview
        ? 1
        : Math.min(8, Math.max(1, quest.targetSets - quest.completedSets)),
    );
    setSessionMode("focus");
    setSessionDurationMinutes(sessionMinutes);
    setRemaining(sessionMinutes * 60);
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
      const recovery = createRecoveryQuest({
        adventureId: abandoned.adventureId,
        bgm: abandoned.bgm,
        focusIntent: abandoned.focusIntent || "자유 집중",
        questId: abandoned.questId,
        remainingSeconds: remaining,
      });
      commitRecoveryQuest(recovery, recovery.createdAt);
      void trackProductEvent("focus_abandoned", {
        adventureId: abandoned.adventureId,
        durationMinutes: abandoned.durationMinutes,
        questId: abandoned.questId ?? null,
        outcome: "abandoned",
      });
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
    if (silentCampStatus === "joined") void leaveSilentCamp();
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
  const studyCheckpointRequired = Boolean(
    completionMode === "focus" && completedQuestId && activeStudyMaterial?.quizSource,
  );
  const studyCheckpointDone =
    !studyCheckpointRequired || checkpointSkipped || checkpointAnswer !== null;

  return (
    <main
      className={`app-shell focus-quest-app screen-${screen}`}
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
            <Image
              className="brand-logo"
              src={`${publicBasePath}/brand/focus-quest-logo.png`}
              alt=""
              width={2172}
              height={724}
              priority
              unoptimized
              aria-hidden="true"
            />
            <span className="sr-only">Focus Quest</span>
          </button>
          <div className="topbar-actions">
            <div className="today-chip" aria-label={`오늘 ${completedToday}번 집중 완료`}>
              <span>오늘</span>
              {completedToday}칸 완성
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
                    <>
                      <button type="button" onClick={cloudSync.signOut}>
                        로그아웃
                      </button>
                      <button
                        className="account-delete-button"
                        type="button"
                        onClick={() => void cloudSync.deleteAccount()}
                      >
                        계정과 모든 자료 삭제
                      </button>
                    </>
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
        <section className="select-screen entry-screen">
          <section className="companion-gate" aria-labelledby="companion-gate-title">
            <header className="companion-gate-copy">
              <span>오늘의 동행</span>
              <h1 id="companion-gate-title">누구와 집중할까요?</h1>
              <p>친구마다 걷는 길과 마지막 장면이 달라요. 오늘 마음이 가는 한 명을 골라 주세요.</p>
            </header>

            <div className="companion-choice-grid" role="radiogroup" aria-label="함께 공부할 친구">
              {adventures.map((adventure) => {
                const active = selectedId === adventure.id;
                return (
                  <button
                    aria-checked={active}
                    className={`companion-choice theme-${adventure.id} ${active ? "is-active" : ""}`}
                    key={adventure.id}
                    onClick={() => chooseAdventure(adventure.id)}
                    role="radio"
                    style={
                      {
                        "--choice-accent": adventure.color,
                        "--choice-bg": `url("${adventure.background}")`,
                      } as React.CSSProperties
                    }
                    type="button"
                  >
                    <span className="companion-choice-world" aria-hidden="true">
                      <Image
                        className="companion-choice-backdrop"
                        src={adventure.background}
                        alt=""
                        height={941}
                        priority
                        unoptimized
                        width={1672}
                      />
                      <Image
                        className="companion-choice-character"
                        src={adventure.image}
                        alt=""
                        height={adventure.imageHeight}
                        priority
                        unoptimized
                        width={adventure.imageWidth}
                      />
                    </span>
                    <span className="companion-choice-copy">
                      <small>{adventure.role}</small>
                      <strong>{adventure.friend}</strong>
                      <span>{adventure.name}</span>
                      <span className="companion-choice-description">{adventure.tagline}</span>
                    </span>
                    <span className="companion-choice-mark" aria-hidden="true">
                      {active ? "함께하기" : "선택"}
                    </span>
                  </button>
                );
              })}
            </div>

            <footer className="companion-gate-action">
              <div>
                <span>선택한 친구</span>
                <strong>{selected.friend} · {selected.name}</strong>
                <small>{selected.reward}</small>
              </div>
              <button
                onClick={() => {
                  setActiveQuestId(null);
                  setScreen("setup");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                type="button"
              >
                {selected.friend}와 준비하기
              </button>
            </footer>
          </section>

          {hydrated && history.length === 0 && !recoveryQuest && (
            <ol className="first-expedition-guide" aria-label="첫 집중 시작 순서">
              <li>
                <span>1</span>
                <div><strong>친구 고르기</strong><small>오늘 함께할 모험을 정해요.</small></div>
              </li>
              <li>
                <span>2</span>
                <div><strong>준비하기</strong><small>시간과 자료를 한곳에서 정해요.</small></div>
              </li>
              <li>
                <span>3</span>
                <div><strong>장면과 함께 완주</strong><small>끝나면 모험 기록이 남아요.</small></div>
              </li>
            </ol>
          )}

          {lastAdventure && !recoveryQuest && (
            <aside className="returning-route" aria-label="지난 집중 다시 시작">
              <div>
                <span>지난 모험</span>
                <strong>{lastAdventure.focusIntent || "자유 집중"}</strong>
                <small>
                  {adventures.find((item) => item.id === lastAdventure.adventureId)?.name ?? "모험"}
                  {` · ${lastAdventure.durationMinutes}분`}
                </small>
              </div>
              <button type="button" onClick={() => restartAdventure(lastAdventure)}>
                같은 리듬으로 시작
              </button>
            </aside>
          )}

          <div className="select-note quick-start-note">
            <span>다음은 준비실</span>
            <i />
            <p>{selected.friend}와 함께 시간, 목표, 공부 자료를 정할 수 있어요.</p>
          </div>

          <RetentionPanel
            companionMemory={companionMemory}
            companionGrowth={selectedCompanionGrowth}
            insights={behaviorInsights}
            onDismissRecovery={dismissRecoveryQuest}
            onSelectAdventure={chooseAdventure}
            onStartRecovery={startRecoveryQuest}
            onUseRecommendation={(minutes) => {
              setFocusMinutes(minutes);
              setSessionDurationMinutes(minutes);
              setRemaining(minutes * 60);
              setScreen("setup");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            recoveryQuest={recoveryQuest}
            selectedFriend={selected.friend}
            selectedId={selectedId}
            worlds={worldProgress}
          />

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

          <section className="camp-entry-banner" aria-labelledby="camp-entry-title">
            <div>
              <span className="camp-beta-badge">초대 전용 베타</span>
              <h2 id="camp-entry-title">친구와 함께 모험하기</h2>
              <p>캠프 로비에서 서로의 캐릭터를 확인하고, 같은 순간에 집중을 시작해요.</p>
            </div>
            <div className="camp-entry-meta">
              <span>{silentCampStatus === "joined" ? `${silentCampCount}명 접속 중` : "코드로 초대"}</span>
              <button type="button" onClick={() => setScreen("camp")}>
                {silentCampStatus === "joined" ? "캠프로 돌아가기" : "캠프 로비 열기"}
              </button>
            </div>
          </section>

          <section className="weekly-summary" aria-labelledby="weekly-title">
            <div className="weekly-heading">
              <div>
                <span className="section-intro">이번 주의 발자국</span>
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
              <div>
                <strong>{focusStreak}</strong>
                <span>연속 집중일</span>
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

          <footer className="support-footer">
            <div>
              <strong>모험 중 불편한 점을 발견했나요?</strong>
              <span>목표나 공부 내용은 적지 말고, 발생한 화면과 상황만 알려주세요.</span>
            </div>
            <a
              href="mailto:letshoya@naver.com?subject=Focus%20Quest%20%EB%B2%84%EA%B7%B8%20%EB%B0%8F%20%EB%AC%B8%EC%9D%98"
              onClick={() => void trackProductEvent("feedback_opened")}
            >
              버그 신고 · 문의
            </a>
          </footer>
        </section>
      )}

      {screen === "camp" && (
        <CampLobby
          chatMessages={silentCampChatMessages}
          code={silentCampCode}
          companions={adventures}
          currentMemberId={silentCampMemberId}
          focusMinutes={focusMinutes}
          leaderId={silentCampLeaderId}
          members={silentCampMembers}
          message={silentCampMessage}
          nickname={campNickname}
          role={silentCampRole}
          selectedId={selectedId}
          status={silentCampStatus}
          onBack={() => {
            if (silentCampStatus === "joined") void leaveSilentCamp();
            setScreen("select");
          }}
          onCodeChange={setSilentCampCode}
          onCopyInvite={() => void copySilentCampLink()}
          onCreate={() => void joinSilentCamp("")}
          onFocusMinutesChange={(minutes) => {
            setFocusMinutes(minutes);
            setSessionDurationMinutes(minutes);
            setRemaining(minutes * 60);
          }}
          onJoin={() => void joinSilentCamp()}
          onLeave={() => void leaveSilentCamp()}
          onNicknameChange={(value) => setCampNickname(value.slice(0, 12))}
          onSelectCompanion={chooseAdventure}
          onSendChat={sendSilentCampChat}
          onStart={beginCampFocus}
        />
      )}

      {screen === "setup" && (
        <section className="setup-screen">
          <button className="back-button" type="button" onClick={() => setScreen("select")}>
            친구 선택으로 돌아가기
          </button>

          <div className="setup-layout">
            <div className={`preview-panel theme-${selected.id}`}>
              <div className="preview-ground" />
              <Image
                src={selected.image}
                alt={selected.friend}
                className="setup-character"
                height={selected.imageHeight}
                unoptimized
                width={selected.imageWidth}
              />
              <div className="preview-label">
                <span>{selected.icon} 오늘의 모험</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            </div>

            <div className="settings-panel">
              <div className="settings-heading">
                <span className="section-intro">모험 준비</span>
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

              <button
                className="primary-button"
                disabled={silentCampStatus === "joined" && silentCampRole === "member"}
                type="button"
                onClick={beginFocus}
              >
                <span>
                  {silentCampStatus === "joined" && silentCampRole === "member"
                    ? "방장의 출발을 기다리는 중"
                    : `${selected.friend}와 ${expeditionSets > 1 ? `${expeditionSets}세트 원정 시작` : "집중 시작"}`}
                </span>
                <strong>{focusMinutes}:00</strong>
              </button>
              <p className="copyright-note">음악은 이 기기에서 실시간 생성되어 별도의 음원 저작권이 없어요.</p>
            </div>
          </div>

          <section className="setup-materials" aria-labelledby="setup-materials-title">
            <header>
              <span>선택 사항</span>
              <h2 id="setup-materials-title">공부 자료를 함께 준비할까요?</h2>
              <p>
                PDF나 과목 퀘스트가 있다면 여기서 연결하세요. 자료 없이 타이머만 시작해도 괜찮아요.
              </p>
            </header>
            <button
              aria-expanded={showStudyTools}
              className="setup-material-toggle"
              onClick={() => setShowStudyTools((current) => !current)}
              type="button"
            >
              {showStudyTools ? "자료와 퀘스트 닫기" : "자료와 퀘스트 열기"}
            </button>
            {showStudyTools && (
              <Suspense
                fallback={
                  <section className="feature-loading" aria-live="polite">
                    공부 자료를 준비하고 있어요.
                  </section>
                }
              >
                <QuestBoard
                  loggedIn={questLoggedIn}
                  status={questStore.status}
                  message={questStore.message}
                  subjects={questStore.subjects}
                  quests={questStore.quests}
                  history={history}
                  getLearningSignal={studyProgress.getLearningSignal}
                  getQualitySignal={studyProgress.getQualitySignal}
                  onLogin={() => setShowAuthDialog(true)}
                  onCreateSubject={questStore.createSubject}
                  onDeleteSubject={questStore.deleteSubject}
                  onCreateQuest={questStore.createQuest}
                  onUpdateQuest={questStore.updateQuest}
                  onDeleteQuest={questStore.deleteQuest}
                  onStartQuest={launchQuest}
                />
              </Suspense>
            )}
          </section>
        </section>
      )}

      {screen === "focus" && (
        <section
          className={`focus-screen focus-${selected.id} session-${sessionMode} ${paused ? "is-paused" : ""} ${isCelebrating ? "is-celebrating" : ""}`}
          style={{ "--journey": progress } as React.CSSProperties}
        >
          <Suspense
            fallback={
              <div className="scene-loading" role="status">
                {selected.friend}가 모험 장면을 준비하고 있어요.
              </div>
            }
          >
            {selected.id === "fish" && sessionMode === "focus" && (
              <FishingQuestScene
                progress={progress}
                paused={paused}
                celebrating={isCelebrating}
                worldLevel={selectedWorldLevel}
                assetBasePath={publicBasePath}
              />
            )}
            {selected.id !== "fish" && sessionMode === "focus" && (
              <AdventureQuestScene
                kind={selected.id}
                progress={progress}
                paused={paused}
                celebrating={isCelebrating}
                worldLevel={selectedWorldLevel}
                assetBasePath={publicBasePath}
              />
            )}
            {sessionMode === "break" && (
              <RestQuestScene
                kind={selected.id}
                paused={paused}
                worldLevel={selectedWorldLevel}
                assetBasePath={publicBasePath}
              />
            )}
          </Suspense>

          <div className="scene-progress-track">
            <div style={{ width: `${progress * 100}%` }} />
          </div>

          <div className="focus-top">
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
            <header className="timer-card-heading">
              <strong>
                {sessionMode === "focus"
                  ? focusIntent || "자유 집중"
                  : restScenes[selected.id].title}
              </strong>
              <small>
                {selected.friend} · {selected.name} · {sessionMode === "focus" ? "모험 중" : "쉬는 중"}
              </small>
              {sessionMode === "focus" && (
                <span className="focus-world-stage">
                  세계 복원 {selectedWorldLevel}/5 · {selectedWorld.progress.unlockedLabel}
                </span>
              )}
            </header>
            {sessionExpedition && (
              <div className="expedition-route" aria-label={`${sessionExpedition.totalSets}세트 중 ${sessionExpedition.currentSet}세트`}>
                <span>원정 경로</span>
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
            <div
              className={`timer-dial timer-dial-${selected.id} timer-dial-${sessionMode}`}
              aria-label={`${Math.round(progress * 100)}% 진행`}
            >
              <i className="timer-dial-marker" aria-hidden="true" />
              <div className="timer-dial-face">
                <span className="timer-adventure-label">
                  {sessionMode === "focus" ? "집중 시간" : "회복 시간"}
                </span>
                <strong>{formatTime(remaining)}</strong>
                <span className="timer-percent">
                  {sessionMode === "focus"
                    ? `${Math.round(progress * 100)}% 이동`
                    : restScenes[selected.id].progressLabel}
                </span>
              </div>
            </div>
            <p className="timer-narration">
              {isCelebrating
                ? "100% · 캐릭터와 함께 목표를 완성했어요!"
                : paused
                ? "괜찮아요. 준비되면 다시 출발해요."
                : sessionMode === "focus"
                  ? adventureNarration
                  : restScenes[selected.id].narration}
            </p>
            {sessionMode === "focus" && !isCelebrating && (
              <details className="distraction-capture">
                <summary>
                  딴생각 잠시 보관
                  {distractionNotes.length > 0 && <span>{distractionNotes.length}</span>}
                </summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    parkDistraction();
                  }}
                >
                  <input
                    aria-label="나중에 확인할 생각"
                    maxLength={80}
                    onChange={(event) => setDistractionDraft(event.target.value)}
                    placeholder="예: 장보기 목록 확인"
                    value={distractionDraft}
                  />
                  <button type="submit">보관</button>
                </form>
                <small>지금 처리하지 않고 집중이 끝난 뒤 다시 볼 수 있어요.</small>
              </details>
            )}
            <div className="timer-controls">
              {isCelebrating ? (
                <span className="celebration-caption">성공 장면 재생 중…</span>
              ) : (
                <>
                  <button
                    className="pause-button"
                    disabled={silentCampStatus === "joined" && silentCampRole === "member"}
                    type="button"
                    onClick={togglePause}
                  >
                    {silentCampStatus === "joined" && silentCampRole === "member"
                      ? "방장 타이머를 따라가는 중"
                      : paused ? "계속하기" : "잠시 멈춤"}
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
                  <Image
                    src={selected.image}
                    alt=""
                    height={selected.imageHeight}
                    unoptimized
                    width={selected.imageWidth}
                  />
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
          <div className="complete-card">
            <div
              className="complete-hero"
              style={{ backgroundImage: `url("${selected.background}")` }}
            >
              <div className="complete-scene-copy">
                <span>
                  {isExpeditionCheckpoint
                    ? "중간 지점"
                    : completionMode === "focus"
                      ? selected.name
                      : "휴식 지점"}
                </span>
                <strong>
                  {isExpeditionCheckpoint
                    ? `${completedExpedition?.currentSet}구간 통과`
                    : completionMode === "focus"
                      ? selected.reward
                      : "다음 모험 준비 완료"}
                </strong>
              </div>
              <div className="complete-character-wrap">
                <Image
                  src={selected.image}
                  alt={
                    completionMode === "focus"
                      ? `${selected.friend} 모험 완료`
                      : `${selected.friend} 휴식 완료`
                  }
                  height={selected.imageHeight}
                  unoptimized
                  width={selected.imageWidth}
                />
              </div>
            </div>
            <h1>
              {isExpeditionCheckpoint
                ? `${completedExpedition?.currentSet}번째 구간 통과!`
                : completionMode === "focus"
                  ? `${selected.friend}와 오늘의 집중 완료`
                  : "휴식 완료, 다시 출발"}
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
                  : `${sessionDurationMinutes}분 집중을 마쳤어요.`
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
                  {completedExpedition ? "원정 구간" : completionMode === "focus" ? "설정한 휴식" : "다음 집중"}
                </span>
              </div>
            </div>
            {completionMode === "focus" && distractionNotes.length > 0 && (
              <section className="distraction-review" aria-labelledby="distraction-review-title">
                <div>
                  <span>집중 방해 보관함</span>
                  <h2 id="distraction-review-title">이제 확인해도 괜찮아요.</h2>
                </div>
                <ul>
                  {distractionNotes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
                <button type="button" onClick={() => setDistractionNotes([])}>
                  모두 확인했어요
                </button>
              </section>
            )}
            {studyCheckpointRequired && (
              <StudyCheckpointPanel
                answer={checkpointAnswer}
                endPage={studyRangeEnd}
                feedback={checkpointFeedback}
                message={checkpointMessage}
                onAnswer={answerCheckpointQuiz}
                onBuildQuiz={prepareCheckpointQuiz}
                onFeedback={(value) => {
                  if (checkpointQuiz) {
                    void submitQuizFeedback("checkpoint", checkpointQuiz, value);
                  }
                }}
                onReplaceQuiz={() => replaceStudyQuiz("checkpoint")}
                onSkip={skipCheckpointQuiz}
                quiz={checkpointQuiz}
                reachedPage={reachedPage}
                setReachedPage={setReachedPage}
                startPage={studyRangeStart}
              />
            )}
            {studyCheckpointDone && (isExpeditionCheckpoint ? (
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
                  <strong>다음</strong>
                </button>
              </div>
            ) : completionMode === "focus" ? (
              <div className="camp-log" aria-labelledby="camp-log-title">
                {completedTrace && (
                  <section className="journey-trace-reward" aria-label="오늘 남긴 모험 흔적">
                    <div>
                      <span>오늘의 모험 흔적</span>
                      <strong>{completedTrace.latestLabel}</strong>
                      <p>{completedTrace.message}</p>
                    </div>
                    <ol aria-label={`첫 원정 기록 ${completedTrace.unlockedCount}/3`}>
                      {completedTrace.labels.map((label, index) => (
                        <li
                          className={index < completedTrace.unlockedCount ? "is-unlocked" : ""}
                          key={label}
                        >
                          <i>{index + 1}</i>
                          <small>{label}</small>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <div className="camp-log-heading">
                  <span>집중 기록</span>
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
                      {campOutcome === "finished" && `오늘의 한 칸을 잘 닫았어요. ${restScenes[selectedId].title}이에요.`}
                      {campOutcome === "unfinished" && "흐름이 남아 있을 때 10분만 더 가볍게 이어가요."}
                      {campOutcome === "split" && "부담을 낮췄어요. 지금 할 수 있는 한 조각만 골라 출발해요."}
                    </p>
                    {campOutcome === "finished" && (
                      <button className="primary-button" type="button" onClick={beginBreak}>
                        <span>{breakMinutes}분 쉬어가기</span><strong>다음</strong>
                      </button>
                    )}
                    {campOutcome === "unfinished" && (
                      <button className="primary-button" type="button" onClick={() => beginCampFollowUp(10)}>
                        <span>같은 목표로 10분 더</span><strong>시작</strong>
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
                {campOutcome && (
                  <CampReflectionPanel
                    confidence={campConfidence}
                    difficulty={campDifficulty}
                    expedition={completedExpedition}
                    learningSignal={completedLearningSignal}
                    note={campReflectionNote}
                    onConfidenceChange={(value) => {
                      setCampConfidence(value);
                      setCampReflectionSaved(false);
                    }}
                    onDifficultyChange={(value) => {
                      setCampDifficulty(value);
                      setCampReflectionSaved(false);
                    }}
                    onNoteChange={(value) => {
                      setCampReflectionNote(value);
                      setCampReflectionSaved(false);
                    }}
                    onSave={saveCampReflection}
                    saved={campReflectionSaved}
                  />
                )}
              </div>
            ) : reviewQuiz ? (
              <StudyRecallPanel
                answer={reviewAnswer}
                continueLabel={
                  completedExpedition && completedExpedition.currentSet < completedExpedition.totalSets
                    ? `${completedExpedition.currentSet + 1}번째 구간 시작`
                    : `${focusMinutes}분 집중 시작`
                }
                feedback={reviewFeedback}
                onAnswer={answerReviewQuiz}
                onContinue={beginFocus}
                onFeedback={(value) => {
                  void submitQuizFeedback("review", reviewQuiz, value);
                }}
                onReplaceQuiz={() => replaceStudyQuiz("review")}
                quiz={reviewQuiz}
              />
            ) : (
              <button className="primary-button" type="button" onClick={beginFocus}>
                <span>
                  {completedExpedition && completedExpedition.currentSet < completedExpedition.totalSets
                    ? `${completedExpedition.currentSet + 1}번째 구간 시작`
                    : `${focusMinutes}분 집중 시작`}
                </span>
                <strong>시작</strong>
              </button>
            ))}
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
