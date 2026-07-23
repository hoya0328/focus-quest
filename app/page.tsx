"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AdventureId = "hike" | "swim" | "fish";
type BgmId = "forest" | "waves" | "lake" | "quiet";
type Screen = "select" | "setup" | "focus" | "complete";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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

function padTime(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${padTime(Math.floor(safe / 60))}:${padTime(safe % 60)}`;
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
  const [endAt, setEndAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [completedToday, setCompletedToday] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const selected = useMemo(
    () => adventures.find((item) => item.id === selectedId) ?? adventures[0],
    [selectedId],
  );

  const totalSeconds = focusMinutes * 60;
  const progress = Math.min(1, Math.max(0, 1 - remaining / totalSeconds));

  useEffect(() => {
    const stored = window.localStorage.getItem("haru-focus-preferences");
    const stats = window.localStorage.getItem("haru-focus-stats");

    if (stored) {
      try {
        const preferences = JSON.parse(stored) as {
          focusMinutes?: number;
          breakMinutes?: number;
          bgm?: BgmId;
          selectedId?: AdventureId;
        };
        if (preferences.focusMinutes) setFocusMinutes(preferences.focusMinutes);
        if (preferences.breakMinutes) setBreakMinutes(preferences.breakMinutes);
        if (preferences.bgm) setBgm(preferences.bgm);
        if (preferences.selectedId) setSelectedId(preferences.selectedId);
      } catch {
        window.localStorage.removeItem("haru-focus-preferences");
      }
    }

    if (stats) {
      try {
        const parsed = JSON.parse(stats) as { date: string; count: number };
        if (parsed.date === new Date().toDateString()) setCompletedToday(parsed.count);
      } catch {
        window.localStorage.removeItem("haru-focus-stats");
      }
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${publicBasePath}/service-worker.js`);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "haru-focus-preferences",
      JSON.stringify({ focusMinutes, breakMinutes, bgm, selectedId }),
    );
  }, [focusMinutes, breakMinutes, bgm, selectedId]);

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

  const completeSession = useCallback(() => {
    stopAudio();
    const nextCount = completedToday + 1;
    setCompletedToday(nextCount);
    window.localStorage.setItem(
      "haru-focus-stats",
      JSON.stringify({ date: new Date().toDateString(), count: nextCount }),
    );
    setScreen("complete");
    setEndAt(null);
    setPaused(false);
  }, [completedToday, stopAudio]);

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
    setSelectedId(id);
    const defaultBgm: Record<AdventureId, BgmId> = {
      hike: "forest",
      swim: "waves",
      fish: "lake",
    };
    setBgm(defaultBgm[id]);
    setScreen("setup");
  };

  const beginFocus = () => {
    const seconds = focusMinutes * 60;
    setRemaining(seconds);
    setEndAt(Date.now() + seconds * 1000);
    setPaused(false);
    setScreen("focus");
    startAudio(bgm);
    if (document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const togglePause = () => {
    if (paused) {
      setEndAt(Date.now() + remaining * 1000);
      setPaused(false);
      startAudio(bgm);
    } else {
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
      if (bgm !== "quiet") audioRef.current = createAmbientSound(bgm);
    }
  };

  const exitSession = () => {
    stopAudio();
    setShowExit(false);
    setEndAt(null);
    setPaused(false);
    setScreen("setup");
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  return (
    <main className={`app-shell screen-${screen}`} style={{ "--accent": selected.color } as React.CSSProperties}>
      {screen !== "focus" && (
        <header className="topbar">
          <button className="brand" type="button" onClick={() => setScreen("select")} aria-label="모험 한 칸 홈">
            <span className="brand-mark">●</span>
            <span>모험 한 칸</span>
          </button>
          <div className="today-chip" aria-label={`오늘 ${completedToday}번 집중 완료`}>
            <span>✦</span>
            오늘 {completedToday}칸
          </div>
        </header>
      )}

      {screen === "select" && (
        <section className="select-screen">
          <div className="intro-copy">
            <span className="eyebrow">오늘의 집중 친구</span>
            <h1>
              누구와 함께
              <br />
              모험을 떠날까요?
            </h1>
            <p>집중하는 동안 작은 친구의 하루가 한 칸씩 앞으로 나아가요.</p>
          </div>

          <div className="starter-grid">
            {adventures.map((adventure, index) => (
              <article
                className="starter-card"
                style={
                  {
                    "--card-accent": adventure.color,
                    "--card-soft": adventure.soft,
                    "--delay": `${index * 90}ms`,
                  } as React.CSSProperties
                }
                key={adventure.id}
              >
                <button type="button" onClick={() => chooseAdventure(adventure.id)} aria-label={`${adventure.friend}와 ${adventure.name} 선택`}>
                  <div className="card-number">0{index + 1}</div>
                  <div className="character-stage">
                    <div className="stage-orbit" />
                    <img src={adventure.image} alt={`${adventure.name} 친구 ${adventure.friend}`} />
                  </div>
                  <div className="card-copy">
                    <span className="adventure-icon">{adventure.icon}</span>
                    <div>
                      <span className="friend-name">{adventure.friend}</span>
                      <h2>{adventure.name}</h2>
                      <p>{adventure.tagline}</p>
                    </div>
                    <span className="pick-arrow">→</span>
                  </div>
                </button>
              </article>
            ))}
          </div>

          <div className="select-note">
            <span>FULL SCREEN FOCUS</span>
            <i />
            <p>알림 대신 모험을 바라보는 부드러운 집중</p>
          </div>
        </section>
      )}

      {screen === "setup" && (
        <section className="setup-screen">
          <button className="back-button" type="button" onClick={() => setScreen("select")}>
            ← 다른 친구 고르기
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
        <section className={`focus-screen focus-${selected.id}`}>
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

          <div className="scene-progress-track">
            <div style={{ width: `${progress * 100}%` }} />
          </div>

          <img
            src={selected.image}
            alt={`${selected.friend}의 집중 모험`}
            className="focus-character"
            style={{ "--journey": progress } as React.CSSProperties}
          />

          <div className="focus-top">
            <div className="focus-status">
              <span className="live-dot" />
              {paused ? "잠시 멈춤" : `${selected.friend}와 집중 중`}
            </div>
            <div className="focus-actions">
              <button type="button" onClick={toggleSound} aria-label={soundOn ? "소리 끄기" : "소리 켜기"}>
                {soundOn && bgm !== "quiet" ? "♪" : "×♪"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  } else {
                    void document.documentElement.requestFullscreen().catch(() => undefined);
                  }
                }}
                aria-label="전체 화면 전환"
              >
                ⛶
              </button>
            </div>
          </div>

          <div className="timer-card">
            <span>{selected.name}</span>
            <strong>{formatTime(remaining)}</strong>
            <div className="timer-progress">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <p>{paused ? "괜찮아요. 준비되면 다시 출발해요." : `${Math.round(progress * 100)}% · 한 칸씩 잘 가고 있어요`}</p>
            <div className="timer-controls">
              <button className="pause-button" type="button" onClick={togglePause}>
                {paused ? "계속하기" : "잠시 멈춤"}
              </button>
              <button className="exit-button" type="button" onClick={() => setShowExit(true)}>
                그만하기
              </button>
            </div>
          </div>

          {showExit && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-title">
              <div className="exit-modal">
                <div className="modal-character">
                  <img src={selected.image} alt="" />
                </div>
                <span>아직 모험이 끝나지 않았어요</span>
                <h2 id="exit-title">여기서 돌아갈까요?</h2>
                <p>지금까지의 기록은 오늘의 완료 칸에 포함되지 않아요.</p>
                <button className="keep-going" type="button" onClick={() => setShowExit(false)}>
                  계속 집중할래요
                </button>
                <button className="confirm-exit" type="button" onClick={exitSession}>
                  이번 모험 그만하기
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "complete" && (
        <section className={`complete-screen complete-${selected.id}`}>
          <div className="sparkles">✦　·　✧　　✦　·　✧</div>
          <div className="complete-card">
            <span className="complete-kicker">ADVENTURE COMPLETE</span>
            <div className="complete-character-wrap">
              <div className="complete-halo" />
              <img src={selected.image} alt={`${selected.friend} 모험 완료`} />
              <span className="badge">+1</span>
            </div>
            <h1>{selected.friend}와 한 칸 완성!</h1>
            <p>{focusMinutes}분 동안 온전히 집중했어요. 정말 멋진 모험이었어요.</p>
            <div className="session-stats">
              <div>
                <strong>{focusMinutes}</strong>
                <span>집중한 분</span>
              </div>
              <div>
                <strong>{completedToday}</strong>
                <span>오늘의 칸</span>
              </div>
              <div>
                <strong>{breakMinutes}</strong>
                <span>추천 휴식</span>
              </div>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setRemaining(breakMinutes * 60);
                setFocusMinutes(breakMinutes);
                setBgm("quiet");
                setScreen("setup");
              }}
            >
              <span>{breakMinutes}분 쉬어가기</span>
              <strong>→</strong>
            </button>
            <button className="text-button" type="button" onClick={() => setScreen("select")}>
              새 모험 고르기
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
