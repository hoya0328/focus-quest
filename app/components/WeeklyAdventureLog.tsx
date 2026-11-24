"use client";

import Image from "next/image";
import type {
  AdventureId,
  FocusRecord,
  WeeklySummary,
} from "@/lib/pomodoro";

type AdventureSummary = {
  id: AdventureId;
  friend: string;
  name: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
};

type WeeklyAdventureLogProps = {
  adventures: AdventureSummary[];
  focusStreak: number;
  onRestart: (record: FocusRecord) => void;
  onStartFirst: () => void;
  recentAdventures: FocusRecord[];
  selectedAdventure: AdventureSummary;
  syncMessage: string;
  weeklySummary: WeeklySummary;
};

function historyLabel(record: FocusRecord, adventure: AdventureSummary) {
  const completedAt = new Date(record.completedAt);
  const date = completedAt.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  const expedition = record.expeditionTotal
    ? ` · ${record.expeditionTotal}세트`
    : "";
  const outcome =
    record.campOutcome === "finished"
      ? " · 완주"
      : record.campOutcome === "unfinished"
        ? " · 조금 남음"
        : record.campOutcome === "split"
          ? " · 이어가는 중"
          : "";
  return `${adventure.name} · ${date} · ${record.durationMinutes}분${expedition}${outcome}`;
}

export default function WeeklyAdventureLog({
  adventures,
  focusStreak,
  onRestart,
  onStartFirst,
  recentAdventures,
  selectedAdventure,
  syncMessage,
  weeklySummary,
}: WeeklyAdventureLogProps) {
  const maxMinutes = Math.max(1, ...weeklySummary.days.map((day) => day.minutes));
  const hasHistory = recentAdventures.length > 0;

  return (
    <section className="expedition-log" aria-labelledby="weekly-title">
      <header className="expedition-log-heading">
        <div>
          <h2 id="weekly-title">이번 주 원정 지도</h2>
          <p>
            {weeklySummary.sessions > 0
              ? `${weeklySummary.minutes}분 동안 ${weeklySummary.sessions}번, 오늘의 한 가지를 지켰어요.`
              : `${selectedAdventure.friend}와 첫 발자국을 남겨 보세요.`}
          </p>
        </div>
        <span className="expedition-sync-state">{syncMessage}</span>
      </header>

      <div className="expedition-log-body">
        <div className="expedition-week-route" aria-label="요일별 집중 시간">
          <div className="expedition-route-line" aria-hidden="true" />
          {weeklySummary.days.map((day) => {
            const intensity = day.minutes / maxMinutes;
            return (
              <div
                className={`expedition-route-day ${day.minutes > 0 ? "is-visited" : ""}`}
                key={day.date}
              >
                <span
                  aria-label={`${day.label}요일 ${day.minutes}분`}
                  className="expedition-waypoint"
                  style={{ "--waypoint-rise": `${Math.round(intensity * 46)}px` } as React.CSSProperties}
                >
                  <i aria-hidden="true" />
                </span>
                <strong>{day.label}</strong>
                <small>{day.minutes > 0 ? `${day.minutes}분` : "미탐험"}</small>
              </div>
            );
          })}
        </div>

        <dl className="expedition-log-facts">
          <div>
            <dt>완주</dt>
            <dd>{weeklySummary.sessions}<small>회</small></dd>
          </div>
          <div>
            <dt>모험한 날</dt>
            <dd>{weeklySummary.activeDays}<small>일</small></dd>
          </div>
          <div>
            <dt>이어온 불빛</dt>
            <dd>{focusStreak}<small>일</small></dd>
          </div>
        </dl>
      </div>

      <div className="expedition-recent">
        <h3>최근에 걸은 길</h3>
        {hasHistory ? (
          <ul>
            {recentAdventures.map((record) => {
              const adventure =
                adventures.find((item) => item.id === record.adventureId) ??
                adventures[0];
              return (
                <li key={record.id}>
                  <span className="expedition-history-portrait">
                    <Image
                      alt=""
                      height={adventure.imageHeight}
                      src={adventure.image}
                      unoptimized
                      width={adventure.imageWidth}
                    />
                  </span>
                  <div>
                    <strong>{record.focusIntent || `${adventure.friend}와 집중`}</strong>
                    <small>{historyLabel(record, adventure)}</small>
                  </div>
                  <button onClick={() => onRestart(record)} type="button">
                    {record.campOutcome === "unfinished" || record.campOutcome === "split"
                      ? "이 길 계속"
                      : "다시 걷기"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="expedition-empty-state">
            <span className="expedition-empty-companion">
              <Image
                alt=""
                height={selectedAdventure.imageHeight}
                src={selectedAdventure.image}
                unoptimized
                width={selectedAdventure.imageWidth}
              />
            </span>
            <div>
              <strong>지도는 첫 집중 뒤부터 채워져요.</strong>
              <p>시간보다 먼저, 오늘 끝낼 한 가지를 정해 보세요.</p>
            </div>
            <button onClick={onStartFirst} type="button">첫 원정 준비</button>
          </div>
        )}
      </div>
    </section>
  );
}
