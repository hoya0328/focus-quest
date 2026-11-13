"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AdventureId } from "@/lib/pomodoro";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type ProductEventName =
  | "focus_started"
  | "focus_completed"
  | "focus_abandoned"
  | "quiz_answered"
  | "quiz_skipped"
  | "client_error";

type ProductEvent = {
  adventureId?: AdventureId;
  durationMinutes?: number;
  questId?: string | null;
  outcome?: "completed" | "abandoned" | "correct" | "incorrect" | "skipped";
  errorCode?: string;
};

export function useProductTelemetry(enabled: boolean) {
  const client = getSupabaseBrowserClient();
  const reportedErrors = useRef(new Set<string>());

  const track = useCallback(
    async (eventName: ProductEventName, event: ProductEvent = {}) => {
      if (!client || !enabled) return false;
      const user = (await client.auth.getUser()).data.user;
      if (!user) return false;
      const { error } = await client.from("focus_quest_product_events").insert({
        user_id: user.id,
        event_name: eventName,
        adventure_id: event.adventureId ?? null,
        duration_minutes: event.durationMinutes ?? null,
        quest_id: event.questId ?? null,
        outcome: event.outcome ?? null,
        error_code: event.errorCode?.slice(0, 80) ?? null,
      });
      return !error;
    },
    [client, enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const reportOnce = (code: string) => {
      if (reportedErrors.current.has(code)) return;
      reportedErrors.current.add(code);
      void track("client_error", { errorCode: code });
    };
    const onError = () => reportOnce("window-error");
    const onUnhandledRejection = () => reportOnce("unhandled-rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [enabled, track]);

  return { track };
}
