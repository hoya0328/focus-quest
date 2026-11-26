"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getInstallPlatform } from "@/lib/pwa-install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const subscribePlatform = () => () => {};
const getPlatform = () => getInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
const getServerPlatform = () => "desktop" as const;
const getStandalone = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const getServerStandalone = () => false;
function subscribeStandalone(notify: () => void) {
  const mode = window.matchMedia("(display-mode: standalone)");
  mode.addEventListener("change", notify);
  return () => mode.removeEventListener("change", notify);
}

/** One deferred event per app, consumed synchronously on a user click, never reused. */
export function usePwaInstall() {
  const prompt = useRef<InstallEvent | null>(null);
  const inFlight = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = useSyncExternalStore(subscribePlatform, getPlatform, getServerPlatform);
  const standalone = useSyncExternalStore(subscribeStandalone, getStandalone, getServerStandalone);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); prompt.current = event as InstallEvent; };
    const complete = () => { prompt.current = null; setInstalled(true); setShowHelp(false); setMessage("이 기기의 앱 목록에 Focus Quest를 넣었어요."); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); };
  }, []);

  const install = async () => {
    if (inFlight.current || installed || standalone) return;
    const event = prompt.current;
    if (!event) { setShowHelp(true); return; }
    prompt.current = null;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted" ? "설치 요청을 전달했어요. 브라우저의 안내를 확인해 주세요." : "설치를 취소했어요. 필요할 때 설치 방법을 다시 확인할 수 있어요.");
      if (choice.outcome === "dismissed") setShowHelp(true);
    } catch {
      setMessage("브라우저 설치창을 열지 못했어요. 아래 방법으로 설치해 주세요."); setShowHelp(true);
    } finally { inFlight.current = false; setBusy(false); }
  };
  return { installed: installed || standalone, busy, platform, showHelp, setShowHelp, message, install };
}
