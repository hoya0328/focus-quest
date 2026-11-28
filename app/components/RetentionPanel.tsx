"use client";

import { useEffect, useRef, useState } from "react";
import type { AdventureId } from "@/lib/pomodoro";
import type { CompanionGrowth } from "@/lib/companion-growth";
import type {
  AdventureTraceProgress,
  BehaviorInsights,
  CompanionMemory,
  RecoveryQuest,
  WorldProgress,
} from "@/lib/retention";
import { getWorldBackgroundPath } from "@/lib/world-growth";
import CompanionEvolutionSprite from "@/app/components/CompanionEvolutionSprite";

type WorldCard = {
  friend: string;
  name: string;
  progress: WorldProgress;
  trace: AdventureTraceProgress;
};

type RetentionPanelProps = {
  assetBasePath: string;
  companionMemory: CompanionMemory;
  companionGrowth: CompanionGrowth;
  insights: BehaviorInsights;
  onDismissRecovery: () => void;
  onSelectAdventure: (id: AdventureId) => void;
  onStartRecovery: () => void;
  onUseRecommendation: (minutes: number) => void;
  recoveryQuest: RecoveryQuest | null;
  selectedId: AdventureId;
  selectedFriend: string;
  worlds: WorldCard[];
};

export default function RetentionPanel({
  assetBasePath,
  companionMemory,
  companionGrowth,
  insights,
  onDismissRecovery,
  onSelectAdventure,
  onStartRecovery,
  onUseRecommendation,
  recoveryQuest,
  selectedId,
  selectedFriend,
  worlds,
}: RetentionPanelProps) {
  const worldGrid = useRef<HTMLDivElement>(null);
  const [showWorldPreviews, setShowWorldPreviews] = useState(false);

  useEffect(() => {
    const grid = worldGrid.current;
    if (!grid || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShowWorldPreviews(true);
        observer.disconnect();
      }
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="retention-panel" aria-labelledby="retention-title">
      <header className="retention-heading">
        <div>
          <span className="section-intro">다시 돌아올 이유</span>
          <h2 id="retention-title">모험은 오늘의 집중을 기억해요</h2>
        </div>
        <p>완주한 기록이 친구의 기억과 세 개의 세계를 천천히 바꿔요.</p>
      </header>

      {recoveryQuest && (
        <article className="retention-card recovery-card">
          <div>
            <span>7일 동안 남겨 둔 작은 길</span>
            <h3>멈춘 곳에서 가볍게 다시 출발해요.</h3>
            <p>
              “{recoveryQuest.focusIntent}”을 {recoveryQuest.durationMinutes}분
              모험으로 줄여 두었어요.
            </p>
          </div>
          <div className="recovery-card-actions">
            <button type="button" onClick={onStartRecovery}>
              {recoveryQuest.durationMinutes}분 복귀하기
            </button>
            <button className="quiet-action" type="button" onClick={onDismissRecovery}>
              이번에는 놓아주기
            </button>
          </div>
        </article>
      )}

      <div className="retention-grid">
        <article className="retention-card companion-memory-card">
          <div className={`companion-stage-portrait stage-${companionGrowth.stage}`}>
            <CompanionEvolutionSprite
              adventureId={selectedId}
              assetBasePath={assetBasePath}
              friend={selectedFriend}
              rendition="preview"
              stage={companionGrowth.stage}
            />
            <span>{companionGrowth.stage}단계 모습</span>
          </div>
          <div>
            <span>{selectedFriend}의 기억</span>
            <strong>{companionGrowth.stageLabel}</strong>
            <p>{companionGrowth.hint}</p>
            <small>{companionMemory.completedTogether}번 함께 완주 · {companionGrowth.totalMinutes}분의 기억</small>
            {companionGrowth.nextStageHint && (
              <em>{companionGrowth.nextStageHint}</em>
            )}
          </div>
        </article>

        <article className="retention-card behavior-report-card">
          <span>내 집중 리듬 · {insights.sampleSize}회 기록</span>
          <div className="behavior-report-metrics">
            <div>
              <small>평균 집중</small>
              <strong>{insights.averageMinutes ? `${insights.averageMinutes}분` : "기록 전"}</strong>
            </div>
            <div>
              <small>목표를 적은 모험</small>
              <strong>{insights.namedRate}%</strong>
            </div>
            <div>
              <small>자주 시작한 시간</small>
              <strong>{insights.favoriteHour === null ? "새 기록 3회 뒤" : `${insights.favoriteHour}시 무렵`}</strong>
            </div>
          </div>
          <p>{insights.recommendation}</p>
          {insights.favoriteMinutes && (
            <button
              className="quiet-action"
              type="button"
              onClick={() => onUseRecommendation(insights.favoriteMinutes!)}
            >
              {insights.favoriteMinutes}분으로 준비
            </button>
          )}
        </article>
      </div>

      <div className="world-restoration">
        <div className="world-restoration-heading">
          <div>
            <span>모험 월드 성장</span>
            <h3>집중할수록 잠든 풍경이 깨어나요</h3>
          </div>
          <small>각 세계 최대 5단계</small>
        </div>
        <div className="world-restoration-grid" ref={worldGrid}>
          {worlds.map(({ friend, name, progress, trace }) => (
            <button
              aria-pressed={selectedId === progress.adventureId}
              className="world-restoration-card"
              key={progress.adventureId}
              onClick={() => onSelectAdventure(progress.adventureId)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="world-next-preview"
                style={showWorldPreviews ? {
                  backgroundImage: `url(${assetBasePath}${getWorldBackgroundPath(
                    progress.adventureId,
                    progress.nextTarget ? progress.level + 1 : progress.level,
                  )})`,
                } : undefined}
              >
                <i>{progress.nextTarget ? "다음 풍경" : "완성된 풍경"}</i>
              </span>
              <span className="world-card-kicker">{friend} · {name}</span>
              <strong>복원 {progress.level}/5 · {progress.unlockedLabel}</strong>
              <span className="first-journey-traces" aria-label={`첫 원정 흔적 ${trace.unlockedCount}/3`}>
                {trace.labels.map((label, index) => (
                  <i
                    className={index < trace.unlockedCount ? "is-unlocked" : ""}
                    key={label}
                    title={label}
                  >
                    <b>{index + 1}</b>
                    <small>{label}</small>
                  </i>
                ))}
              </span>
              <span
                aria-label={`복원 진행도 ${progress.progressPercent}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress.progressPercent}
                className="world-progress-track"
                role="progressbar"
              >
                <i style={{ width: `${progress.progressPercent}%` }} />
              </span>
              <small>
                {progress.nextTarget
                  ? `다음: ${progress.nextUnlockLabel} · ${progress.remaining}회`
                  : "이 세계를 모두 깨웠어요"}
              </small>
              <small className="trace-message">{trace.message}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
