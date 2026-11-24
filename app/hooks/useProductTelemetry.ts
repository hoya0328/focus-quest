"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AdventureId } from "@/lib/pomodoro";
import type {
  QuizFeedbackStage,
  QuizFeedbackValue,
} from "@/lib/quiz-feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

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

const LAST_OPENED_KEY = "focus-quest-telemetry-last-opened";
const SESSION_REPORTED_KEY = "focus-quest-telemetry-session-reported";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

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
    if (!enabled) return;
    try {
      if (window.sessionStorage.getItem(SESSION_REPORTED_KEY)) return;
      window.sessionStorage.setItem(SESSION_REPORTED_KEY, "1");
      const now = Date.now();
      const lastOpened = Number(window.localStorage.getItem(LAST_OPENED_KEY));
      window.localStorage.setItem(LAST_OPENED_KEY, String(now));
      void track("app_opened");
      if (Number.isFinite(lastOpened) && now - lastOpened >= SEVEN_DAYS_MS) {
        void track("returned_after_7d");
      }
    } catch {
      // Storage can be unavailable in strict privacy modes. Core focus stays usable.
    }
  }, [enabled, track]);

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
