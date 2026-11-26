"use client";

import { useRef, useState, type FormEvent } from "react";
import { SUPPORT_CATEGORIES, SUPPORT_MAX_LENGTH, SUPPORT_NOTICE_VERSION, type SupportCategory } from "@/lib/support-requests";
import "../support.css";

export default function SupportButton({ onOpen }: { onOpen?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submissionId = useRef<string | null>(null);
  const sending = useRef(false);
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    if (!consent || message.trim().length < 10) { setError("내용을 10자 이상 작성하고 보관 안내를 확인해 주세요."); return; }
    sending.current = true; setBusy(true); setError("");
    submissionId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ id: submissionId.current, category, message, consent, noticeVersion: SUPPORT_NOTICE_VERSION }),
      });
      const body = await response.json();
      if (!response.ok || body.id !== submissionId.current) throw new Error(typeof body.error === "string" ? body.error : "접수하지 못했어요. 잠시 후 다시 보내 주세요.");
      setReceipt(body.id); setMessage(""); setConsent(false); submissionId.current = null;
    } catch (failure) {
      setError(failure instanceof Error && failure.name === "Error" ? failure.message : "연결을 확인한 뒤 다시 보내 주세요. 작성한 내용은 지우지 않았어요.");
    } finally { sending.current = false; setBusy(false); }
  };

  return <>
    <button className="support-open-button" type="button" onClick={() => { dialog.current?.showModal(); onOpen?.(); }}>버그 신고 · 문의</button>
    <dialog className="support-notepad" ref={dialog} aria-labelledby="support-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <header className="support-notepad-heading"><div><h2 id="support-title">운영자에게 메모 남기기</h2><p>작은 불편도 다음 모험을 바꾸는 힌트가 돼요.</p></div><button className="support-close" type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="문의 메모 닫기">닫기</button></header>
      {receipt ? <section className="support-success" role="status">
        <h3>운영자 문의함에 전달했어요</h3><p>보내주신 메모를 확인하고 서비스 개선에 반영하겠습니다. 별도 이메일이나 답장은 발송되지 않아요.</p><p className="support-receipt">접수 번호 {receipt.slice(0, 8).toUpperCase()}</p>
        <button type="button" onClick={() => { setReceipt(""); setError(""); }}>다른 메모 남기기</button>
      </section> : <form onSubmit={submit}>
        <label>어떤 메모인가요?<select value={category} disabled={busy} onChange={(event) => { setCategory(event.target.value as SupportCategory); submissionId.current = null; }}>{Object.entries(SUPPORT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor="support-message">메모 내용</label>
        <textarea id="support-message" name="message" value={message} required minLength={10} maxLength={SUPPORT_MAX_LENGTH} disabled={busy} autoFocus aria-describedby="support-writing-hint support-count" placeholder={"어느 화면에서 어떤 일이 있었나요?\n예: 휴대폰에서 설치 버튼을 눌렀는데 아무 안내가 나오지 않았어요."} onChange={(event) => { setMessage(event.target.value); submissionId.current = null; }} />
        <div className="support-writing-meta"><span id="support-writing-hint">비밀번호·인증 링크·개인정보·공부 자료는 적지 마세요.</span><span id="support-count">{message.length.toLocaleString()} / 3,000</span></div>
        <label className="support-consent"><input type="checkbox" checked={consent} required disabled={busy} onChange={(event) => setConsent(event.target.checked)} /><span>문의 내용의 운영자 전달과 접수 후 90일 보관에 동의합니다.</span></label>
        <p className="support-privacy-note">로그인과 이메일 없이 보낼 수 있어요. 운영자만 열람하며, 동의하지 않아도 타이머는 이용할 수 있습니다. <a href="/privacy#retention" target="_blank" rel="noopener noreferrer">보관·삭제 안내 (새 탭)</a></p>
        {error && <p className="support-error" role="alert">{error}</p>}
        <button className="support-send" disabled={busy} type="submit">{busy ? "문의함에 전달하는 중…" : "메모 보내기"}</button>
      </form>}
    </dialog>
  </>;
}
