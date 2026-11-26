"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { validAnalyticsToken, visitAnalyticsAllowed, VISIT_ANALYTICS_PREFERENCE } from "@/lib/visit-analytics";
import "./visit-analytics.css";

export default function VisitAnalytics() {
  const path = usePathname();
  const [preference, setPreference] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    if (path !== "/" && path !== "/privacy") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let cancelled = false;
    const init = async () => {
      try {
        const saved = localStorage.getItem(VISIT_ANALYTICS_PREFERENCE);
        setPreference(saved);
        const result = await fetch("/api/visit-analytics", { cache: "no-store", signal: controller.signal });
        if (!result.ok) return;
        const config = await result.json();
        if (cancelled || !config.enabled || !validAnalyticsToken(config.token)) return;
        setAvailable(true);
        if (!visitAnalyticsAllowed(new URL(location.href), saved, navigator.doNotTrack) || loaded.current) return;
        const script = document.createElement("script");
        script.src = "https://static.cloudflareinsights.com/beacon.min.js";
        script.type = "module";
        script.defer = true;
        script.dataset.cfBeacon = JSON.stringify({ token: config.token, spa: false });
        script.onerror = () => { if (!cancelled) setNotice("브라우저에서 방문 분석을 차단했습니다. 타이머는 그대로 이용할 수 있어요."); };
        document.head.appendChild(script);
        loaded.current = true;
      } catch { /* Analytics failure never blocks the timer, including storage restrictions. */ }
    };
    void init();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== VISIT_ANALYTICS_PREFERENCE) return;
      if (loaded.current) location.reload();
      else setPreference(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); window.removeEventListener("storage", onStorage); };
  }, [path, preference]);

  if ((path !== "/" && path !== "/privacy") || !available) return null;

  const change = (next: "allowed" | "denied") => {
    try {
      localStorage.setItem(VISIT_ANALYTICS_PREFERENCE, next);
      if (loaded.current && next === "denied") { location.reload(); return; }
      setPreference(next);
      setNotice(next === "allowed" ? "방문 통계를 허용했습니다. 로그인 사용 통계와는 별도로 처리됩니다." : "외부 방문 통계를 사용하지 않습니다.");
    } catch { setNotice("이 브라우저는 설정 저장을 허용하지 않아 방문 분석을 켜지 않았습니다."); }
  };
  return <section className="visit-analytics" id="visit-analytics" aria-labelledby="visit-analytics-title">
    <div><h2 id="visit-analytics-title">방문 통계 설정</h2><p>사이트 방문과 로딩 품질을 Cloudflare로 측정하도록 허용할 수 있어요. 이메일·공부 내용은 전송하지 않습니다. 허용하지 않아도 모든 기능을 쓸 수 있습니다.</p>
      <p className="visit-analytics-note">기본은 꺼짐입니다. 끄면 분석 중지를 위해 분석이 실행 중인 Focus Quest 탭을 새로고침합니다. 진행 중인 집중은 저장된 기록으로 복구됩니다.</p></div>
    <div className="visit-analytics-actions">
      <button type="button" aria-pressed={preference === "allowed"} disabled={navigator.doNotTrack === "1"} onClick={() => change("allowed")}>방문 통계 허용</button>
      <button type="button" aria-pressed={preference !== "allowed"} onClick={() => change("denied")}>사용하지 않기</button>
    </div>
    <p role="status">{navigator.doNotTrack === "1" ? "브라우저의 추적 금지 설정에 따라 방문 분석을 사용하지 않습니다." : notice || (preference === "allowed" ? "이 브라우저에서 허용됨" : "이 브라우저에서 꺼짐")}</p>
  </section>;
}
