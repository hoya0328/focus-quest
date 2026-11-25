"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AdventureId } from "@/lib/pomodoro";
import type {
  QuizFeedbackStage,
  QuizFeedbackValue,
} from "@/lib/quiz-feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { isDormantReturn, telemetryStorageKeys } from "@/lib/telemetry-session";

export type ProductEventName =
  | "app_opened"
  | "returned_after_7d"
  | "feedback_opened"
  | "companion_selected"
  | "setup_opened"
  | "focus_started"
  | "focus_completed"
  | "focus_abandoned"
  | "camp_created"
  | "camp_joined"
  | "push_enabled"
  | "quiz_answered"
  | "quiz_skipped"
  | "quiz_feedback_submitted"
  | "client_error";

type ProductEvent = {
  adventureId?: AdventureId;
  durationMinutes?: number;
  questId?: string | null;
  outcome?: "completed" | "abandoned" | "correct" | "incorrect" | "skipped";
  errorCode?: string;
  quizKey?: string;
  quizStage?: QuizFeedbackStage;
  feedbackValue?: QuizFeedbackValue;
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
        quiz_key: event.quizKey?.slice(0, 160) ?? null,
        quiz_stage: event.quizStage ?? null,
        feedback_value: event.feedbackValue ?? null,
      });
      return !error;
    },
    [client, enabled],
  );

  useEffect(() => {
    if (!enabled || !client) return;
    let cancelled = false;
    const reportOpen = async () => {
      let reservedKey: string | null = null;
      try {
        const user = (await client.auth.getUser()).data.user;
        if (!user || cancelled) return;
        const keys = telemetryStorageKeys(user.id);
        if (window.sessionStorage.getItem(keys.reported)) return;
        // Reserve before awaiting network so duplicate effects cannot double-report.
        window.sessionStorage.setItem(keys.reported, "pending");
        reservedKey = keys.reported;
        const now = Date.now();
        const previous = window.localStorage.getItem(keys.lastOpened);
        if (!(await track("app_opened"))) {
          window.sessionStorage.removeItem(keys.reported);
          return;
        }
        window.sessionStorage.setItem(keys.reported, "1");
        window.localStorage.setItem(keys.lastOpened, String(now));
        if (isDormantReturn(previous, now)) await track("returned_after_7d");
      } catch {
        try { if (reservedKey) window.sessionStorage.removeItem(reservedKey); } catch { /* Storage is optional. */ }
        // Strict privacy modes must not block the core timer.
      }
    };
    void reportOpen();
    return () => { cancelled = true; };
  }, [client, enabled, track]);

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
