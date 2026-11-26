"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { SUPPORT_CATEGORIES, type SupportPage, type SupportTicket } from "@/lib/support-requests";

export default function SupportInbox() {
  const [page, setPage] = useState<SupportPage | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setPage(null); setError(""); setUpdateError("");
      try {
        const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
        if (!session) throw new Error("홈에서 운영자 계정으로 로그인한 뒤 다시 열어 주세요.");
        const response = await fetch(`/api/support${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "문의함을 불러오지 못했어요.");
        if (!cancelled) setPage(body);
      } catch (failure) { if (!cancelled) setError(failure instanceof Error ? failure.message : "연결을 확인해 주세요."); }
    };
    void load();
    const invalidate = () => {
      if (cancelled) return;
      cancelled = true; controller.abort(); setPage(null); setCursor(null); setRefresh(value => value + 1);
    };
    const subscription = getSupabaseBrowserClient()?.auth.onAuthStateChange((event) => {
      if (event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") invalidate();
    });
    const onStorage = (event: StorageEvent) => { if (event.key === null || /^sb-[a-z0-9]+-auth-token$/.test(event.key)) invalidate(); };
    window.addEventListener("storage", onStorage);
    return () => { cancelled = true; controller.abort(); subscription?.data.subscription.unsubscribe(); window.removeEventListener("storage", onStorage); };
  }, [cursor, refresh]);

  const update = async (ticket: SupportTicket) => {
    if (busyId) return;
    setBusyId(ticket.id); setUpdateError("");
    try {
      const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
      if (!session) throw new Error("다시 로그인해 주세요.");
      const status = ticket.status === "open" ? "closed" : "open";
      const response = await fetch("/api/support", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ id: ticket.id, status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "상태를 변경하지 못했어요.");
      setPage(current => current && { ...current, tickets: current.tickets.map(item => item.id === ticket.id ? { ...item, status } : item) });
    } catch (failure) { setUpdateError(failure instanceof Error ? failure.message : "연결을 확인해 주세요."); }
    finally { setBusyId(null); }
  };

  return <div className="operations-page">
    <header className="operations-header"><Link className="operations-brand" href="/" prefetch={false}>Focus Quest</Link><nav className="support-inbox-nav"><Link href="/operations" prefetch={false}>운영 통계</Link><Link href="/" prefetch={false}>타이머로 돌아가기</Link></nav></header>
    <main className="operations-main support-inbox">
      <div className="operations-heading"><div><h1>운영자 문의함</h1><p>사용자가 남긴 불편과 다음 모험을 위한 아이디어.</p></div><button type="button" onClick={() => { setCursor(null); setRefresh(value => value + 1); }} disabled={Boolean(busyId)}>최신 문의 새로고침</button></div>
      <p className="operations-scope">운영자 계정만 볼 수 있습니다. 메모는 접수 후 90일 동안 보관하며 별도 메일·답장은 발송하지 않습니다.</p>
      {!page && !error && <p role="status">문의함을 불러오는 중…</p>}
      {error && <section className="operations-error" role="alert"><h2>문의함을 열 수 없어요</h2><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>다시 확인</button></section>}
      {updateError && <p role="alert" className="support-error">{updateError}</p>}
      {page && <>
        {page.tickets.length === 0 && <p className="operations-empty" role="status">아직 도착한 메모가 없습니다. 홈페이지에서 접수된 메모가 이곳에 쌓여요.</p>}
        <ol className="support-ticket-list">{page.tickets.map(ticket => <li key={ticket.id}><article className="support-ticket">
          <header><h2>{SUPPORT_CATEGORIES[ticket.category]}</h2><span className={`support-ticket-status is-${ticket.status}`}>{ticket.status === "open" ? "확인 대기" : "처리 완료"}</span></header>
          <p className="support-ticket-date"><time dateTime={ticket.created_at}>{new Date(ticket.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time> · {ticket.id.slice(0, 8).toUpperCase()}</p>
          <p className="support-ticket-message">{ticket.message}</p>
          <button type="button" disabled={Boolean(busyId)} onClick={() => void update(ticket)}>{busyId === ticket.id ? "저장 중…" : ticket.status === "open" ? "처리 완료로 표시" : "다시 확인 대기로"}</button>
        </article></li>)}</ol>
        {page.nextCursor && <button type="button" onClick={() => setCursor(page.nextCursor)}>이전 문의 보기</button>}
      </>}
    </main>
  </div>;
}
