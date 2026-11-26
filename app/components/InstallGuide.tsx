"use client";

import { INSTALL_STEPS } from "@/lib/pwa-install";
import type { usePwaInstall } from "@/app/hooks/usePwaInstall";

export default function InstallGuide({ installation }: { installation: ReturnType<typeof usePwaInstall> }) {
  const { installed, busy, platform, showHelp, setShowHelp, message, install } = installation;
  return <section className="install-guide" aria-labelledby="install-guide-title">
    <div><h2 id="install-guide-title">자주 쓰는 기기에 모험 입구를 남겨 두세요</h2><p>설치해도 기록 방식은 같고, 로그인하면 PC와 휴대폰에서 이어집니다.</p></div>
    {installed ? <strong className="install-state">앱으로 이용 중 · 이 기기에 설치됨</strong> : <button type="button" disabled={busy} onClick={() => void install()}>{busy ? "설치창 확인 중…" : "Focus Quest 설치"}</button>}
    {message && <p className="install-message" role="status">{message}</p>}
    {showHelp && !installed && <div className="install-help" role="region" aria-labelledby="install-help-title">
      <div className="install-help-heading"><h3 id="install-help-title">이 기기에 설치하는 방법</h3><button type="button" onClick={() => setShowHelp(false)} aria-label="설치 방법 접기">접기</button></div>
      <ol>{INSTALL_STEPS[platform].map(step => <li key={step}>{step}</li>)}</ol>
      <p>설치 메뉴는 브라우저마다 달라요. 카카오톡·인스타그램 안에서 열었다면 외부 브라우저로 다시 열어 주세요. 설치하지 않아도 모든 타이머 기능을 이용할 수 있습니다.</p>
    </div>}
  </section>;
}
