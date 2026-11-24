"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function InstallGuide() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [isIos] = useState(() =>
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setMessage("이 기기의 앱 목록에 Focus Quest를 넣었어요.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    setMessage(choice.outcome === "accepted"
      ? "설치가 시작됐어요."
      : "필요할 때 다시 설치할 수 있어요.");
  };

  return (
    <section className="install-guide" aria-labelledby="install-guide-title">
      <div>
        <h2 id="install-guide-title">자주 쓰는 기기에 모험 입구를 남겨 두세요</h2>
        <p>설치해도 기록 방식은 같고, 로그인하면 PC와 휴대폰에서 이어집니다.</p>
      </div>
      {installed ? (
        <strong className="install-state">이 기기에 설치됨</strong>
      ) : prompt ? (
        <button type="button" onClick={() => void install()}>Focus Quest 설치</button>
      ) : isIos ? (
        <p className="install-ios">Safari의 공유 버튼을 누른 뒤 <strong>홈 화면에 추가</strong>를 선택하세요.</p>
      ) : (
        <p className="install-ios">브라우저 메뉴의 <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 사용할 수 있어요.</p>
      )}
      {message && <small aria-live="polite">{message}</small>}
    </section>
  );
}
