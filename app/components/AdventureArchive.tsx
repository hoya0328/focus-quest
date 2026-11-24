"use client";

import type { AdventureArchive as AdventureArchiveState } from "@/lib/adventure-archive";
import {
  getNextMasteryTarget,
  isAdventureArchiveUnlocked,
} from "@/lib/adventure-archive";
import type { AdventureId } from "@/lib/pomodoro";
import { getSeasonalWorldEvent } from "@/lib/seasonal-events";

type AdventureArchiveProps = {
  archives: AdventureArchiveState[];
  selectedId: AdventureId;
  onSelect: (id: AdventureId) => void;
};

const worldNames: Record<AdventureId, string> = {
  hike: "해오름 봉우리",
  swim: "유리산호 유적",
  fish: "달비늘 호수",
};

export default function AdventureArchive({ archives, selectedId, onSelect }: AdventureArchiveProps) {
  if (!isAdventureArchiveUnlocked(archives)) return null;
  const selected = archives.find((archive) => archive.adventureId === selectedId) ?? archives[0];
  if (!selected) return null;
  const target = getNextMasteryTarget(selected.completed);
  const progressStart = target === 100 ? 0 : target - 50;
  const progress = Math.max(0, Math.min(100,
    Math.round(((selected.completed - progressStart) / (target - progressStart)) * 100),
  ));
  const seasonalEvent = getSeasonalWorldEvent(selected.adventureId);

  return (
    <section className="adventure-archive" aria-labelledby="adventure-archive-title">
      <header className="adventure-archive-heading">
        <div>
          <h2 id="adventure-archive-title">오래 걸은 길에는 유물이 남아요</h2>
          <p>월드 복원이 끝난 뒤에도 같은 친구와 쌓은 집중은 숙련과 발견으로 이어져요.</p>
        </div>
        <nav aria-label="유물 도감 세계 선택">
          {archives.map((archive) => (
            <button
              aria-pressed={archive.adventureId === selected.adventureId}
              key={archive.adventureId}
              onClick={() => onSelect(archive.adventureId)}
              type="button"
            >
              {worldNames[archive.adventureId]}
            </button>
          ))}
        </nav>
      </header>

      <div className={`adventure-archive-map archive-${selected.adventureId}`}>
        <div className="archive-mastery">
          <span>{selected.masteryRank > 0 ? `숙련 ${selected.masteryRank}` : "복원 여정"}</span>
          <strong>{selected.masteryLabel}</strong>
          <p>{selected.completed}번의 유효한 집중이 이 세계에 남아 있어요.</p>
          <div
            aria-label={`다음 숙련까지 ${progress}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="archive-progress"
            role="progressbar"
          >
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>다음 숙련 기록 · {Math.max(0, target - selected.completed)}회</small>
        </div>

        <ol className="archive-relic-path">
          {selected.relics.map((relic) => (
            <li className={relic.unlocked ? "is-unlocked" : ""} key={relic.id}>
              <span className="archive-relic-mark" aria-hidden="true"><i /></span>
              <div>
                <strong>{relic.unlocked ? relic.name : `${relic.requiredCompletions}번째 발견`}</strong>
                <p>{relic.unlocked ? relic.description : "아직 지도에 이름이 나타나지 않았어요."}</p>
              </div>
            </li>
          ))}
        </ol>
        <aside className="archive-seasonal-event">
          <span>지금 이 세계에서</span>
          <strong>{seasonalEvent.name}</strong>
          <p>{seasonalEvent.description}</p>
          <small>{seasonalEvent.ambientLabel}</small>
        </aside>
      </div>
    </section>
  );
}
