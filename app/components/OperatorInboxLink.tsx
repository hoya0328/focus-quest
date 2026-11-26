"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export default function OperatorInboxLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const controller = new AbortController();
    let generation = 0;
    const check = async () => {
      const current = ++generation;
      setAllowed(false);
      try {
        const session = (await client.auth.getSession()).data.session;
        if (!session || controller.signal.aborted) return;
        const response = await fetch("/api/support?access=1", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: controller.signal });
        if (current === generation && !controller.signal.aborted) setAllowed(response.ok && (await response.json()).allowed === true);
      } catch { /* An optional operator shortcut must never block ordinary account use. */ }
    };
    void check();
    const subscription = client.auth.onAuthStateChange((event) => { if (event !== "INITIAL_SESSION" && event !== "TOKEN_REFRESHED") void check(); });
    const onStorage = (event: StorageEvent) => { if (event.key === null || /^sb-[a-z0-9]+-auth-token$/.test(event.key)) void check(); };
    window.addEventListener("storage", onStorage);
    return () => { generation++; controller.abort(); subscription.data.subscription.unsubscribe(); window.removeEventListener("storage", onStorage); };
  }, []);
  return allowed ? <a href="/operations/support">운영자 문의함</a> : null;
}
