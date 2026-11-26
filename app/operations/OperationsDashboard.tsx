"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import type { OperationsDashboard as Dashboard } from "@/lib/operations-dashboard";

const number = new Intl.NumberFormat("ko-KR");
const COMPANIONS = { hike: "모리 · 해오름 봉우리", swim: "나루 · 유리산호 유적", fish: "보리 · 달비늘 호수" };
type View = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; report: Dashboard };

export default function OperationsDashboard() {
  const [days, setDays] = useState<7 | 30>(7);
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<View>({ status: "loading" });
  const graph = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view.status === "ready" && days === 30 && graph.current) {
      // A narrow monthly chart opens at the newest days, not an empty distant past.
      graph.current.scrollLeft = graph.current.scrollWidth;
    }
  }, [view, days]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      try {
        const client = getSupabaseBrowserClient();
        const session = client ? (await client.auth.getSession()).data.session : null;
        if (cancelled) return;
        if (!session) {
          setView({ status: "error", message: "Focus Quest 홈에서 운영자 계정으로 로그인한 뒤 다시 열어 주세요." });
          return;
        }
        const response = await fetch(`/api/operations?days=${days}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setView({ status: "error", message: typeof body.error === "string" ? body.error : "통계를 불러오지 못했습니다. 다시 시도해 주세요." });
          return;
        }
        setView({ status: "ready", report: body as Dashboard });
      } catch {
        if (!cancelled) setView({ status: "error", message: "연결을 확인하고 다시 시도해 주세요." });
      }
    };
    void load();
    // Clear an already rendered report as soon as the signed-in account changes.
    const subscription = getSupabaseBrowserClient()?.auth.onAuthStateChange((event) => {
      if (!cancelled && event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") {
        setView({ status: "loading" }); setRefresh((value) => value + 1);
      }
    });
    return () => { cancelled = true; controller.abort(); subscription?.data.subscription.unsubscribe(); };
  }, [days, refresh]);

  const report = view.status === "ready" ? view.report : null;
  const reload = () => { setView({ status: "loading" }); setRefresh((value) => value + 1); };
  const summary = report?.summary;
  const peak = Math.max(1, ...(report?.daily.map((row) => row.started) ?? []), ...(report?.daily.map((row) => row.completed) ?? []));
  return (
    <div className="operations-page">
      <a className="operations-skip" href="#operations-content">통계 본문으로 건너뛰기</a>
      <header className="operations-header">
        <Link className="operations-brand" href="/" prefetch={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/focus-quest-mark.png" width="36" height="36" alt="" />
          Focus Quest
        </Link>
        <nav className="support-inbox-nav"><Link href="/operations/support" prefetch={false}>문의 수신함</Link><Link href="/" prefetch={false}>타이머로 돌아가기</Link></nav>
      </header>
      <main id="operations-content" className="operations-main">
        <div className="operations-heading">
          <div><h1>운영 통계</h1><p>얼마나 찾아오고, 시작하고, 끝까지 함께했는지.</p></div>
          <div className="operations-controls">
            <label>조회 기간<select value={days} onChange={(event) => { setView({ status: "loading" }); setDays(Number(event.target.value) as 7 | 30); }}>
              <option value="7">최근 7일</option><option value="30">최근 30일</option>
            </select></label>
            <button type="button" disabled={view.status === "loading"} onClick={reload}>새로고침</button>
          </div>
        </div>
        <p className="operations-scope">로그인 사용자만 집계합니다. 비로그인 방문자와 전체 가입자 수는 포함하지 않습니다. 날짜는 한국 시간 기준입니다.</p>
        {view.status === "loading" && <div className="operations-loading" role="status" aria-live="polite"><div /><div /><div /><p>통계를 불러오고 있어요.</p></div>}
        {view.status === "error" && <section className="operations-error" role="alert"><h2>지금은 통계를 볼 수 없어요</h2><p>{view.message}</p><button type="button" onClick={reload}>다시 확인</button></section>}
        {report && summary && <>
          <p className="operations-updated">{new Date(report.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준 · 운영자 전용</p>
          {summary.events === 0 && <p className="operations-empty" role="status">이 기간에는 수집된 이용 기록이 없습니다. 로그인한 사용자가 집중을 시작하면 아래에 표시됩니다.</p>}
          <dl className="operations-metrics">
            <div><dt>기록이 있는 이용자</dt><dd>{number.format(summary.uniqueUsers)}<span>명</span></dd></div>
            <div><dt>집중 시작</dt><dd>{number.format(summary.counts.focus_started ?? 0)}<span>건</span></dd></div>
            <div><dt>집중 완료</dt><dd>{number.format(summary.counts.focus_completed ?? 0)}<span>건</span></dd></div>
            <div><dt>집중 중단</dt><dd>{number.format(summary.counts.focus_abandoned ?? 0)}<span>건</span></dd></div>
          </dl>
          <section className="operations-section" aria-labelledby="daily-title">
            <div className="operations-section-title"><h2 id="daily-title">날짜별 집중 흐름</h2><p><span className="operations-key operations-key-start" />시작 <span className="operations-key operations-key-complete" />완료</p></div>
            {report.period.days === 30 && <p className="operations-chart-hint">화면이 좁으면 그래프를 가로로 넘겨 나머지 날짜를 볼 수 있습니다.</p>}
            <div ref={graph} className="operations-chart" tabIndex={0} role="region" aria-label="날짜별 집중 그래프. 정확한 건수는 아래 표에서 확인할 수 있습니다.">{report.daily.map((row) => <div key={row.date} className="operations-chart-day" aria-hidden="true">
              <div className="operations-bars"><span style={{ height: `${row.started / peak * 100}%` }} /><span style={{ height: `${row.completed / peak * 100}%` }} /></div>
              <span>{Number(row.date.slice(-2))}</span>
            </div>)}</div>
            <div className="operations-table-wrap" tabIndex={0} role="region" aria-label="날짜별 집중 통계 표">
              <table><caption>정확한 날짜별 이용 건수</caption><thead><tr><th scope="col">날짜</th><th scope="col">화면 열기</th><th scope="col">시작</th><th scope="col">완료</th><th scope="col">중단</th></tr></thead>
                <tbody>{report.daily.map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{number.format(row.opened)}</td><td>{number.format(row.started)}</td><td>{number.format(row.completed)}</td><td>{number.format(row.abandoned)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="operations-section" aria-labelledby="companion-title"><h2 id="companion-title">함께한 동료</h2><div className="operations-table-wrap" tabIndex={0} role="region" aria-label="동료별 이용 통계 표"><table><thead><tr><th scope="col">동료와 모험</th><th scope="col">선택</th><th scope="col">집중 시작</th><th scope="col">집중 완료</th></tr></thead>
            <tbody>{report.companions.map((row) => <tr key={row.adventureId}><th scope="row">{COMPANIONS[row.adventureId]}</th><td>{number.format(row.selected)}</td><td>{number.format(row.started)}</td><td>{number.format(row.completed)}</td></tr>)}</tbody>
          </table></div></section>
          <section className="operations-section operations-reading" aria-labelledby="reading-title"><h2 id="reading-title">숫자를 읽을 때</h2><ul>
            <li>이용자 수는 이 기간에 이벤트를 남긴 계정 수입니다. 전체 방문자·가입자 수와 다릅니다.</li>
            <li>시작·완료는 각각 받은 이벤트 건수입니다. 기간 경계·기기 종료·통신 실패로 서로 맞지 않을 수 있어 세션 완주율로 나누지 않습니다.</li>
            <li>7일 이상 지난 뒤 복귀한 이용자: {number.format(summary.users.returned_after_7d ?? 0)}명. 같은 기기의 이전 방문 신호이며 가입 기준 D7 유지율이 아닙니다.</li>
            <li>캠프 생성 {number.format(summary.counts.camp_created ?? 0)}건 · 참가 {number.format(summary.counts.camp_joined ?? 0)}건 · 클라이언트 오류 신호 {number.format(summary.counts.client_error ?? 0)}건.</li>
          </ul></section>
        </>}
        <footer className="operations-footer"><p>목표 문장, PDF, 채팅, 이메일과 개별 계정 정보는 이 화면에 표시하지 않습니다.</p><Link href="/privacy" prefetch={false}>개인정보 처리방침</Link></footer>
      </main>
    </div>
  );
}
