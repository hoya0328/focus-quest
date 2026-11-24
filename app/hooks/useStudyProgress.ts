"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  clampStudyPage,
  summarizeStudyAttempts,
  studyProgressStorageKey,
  type StudyQuestProgressRow,
  type StudyLearningSignal,
  type StudyQuizAttemptDraft,
  type StudyQuizAttemptRow,
} from "@/lib/study-progress";

type ProgressByQuest = Record<string, number>;
type AttemptKeysByQuest = Record<string, string[]>;
type LearningSignalsByQuest = Record<string, StudyLearningSignal>;

export function useStudyProgress(enabled: boolean) {
  const client = getSupabaseBrowserClient();
  const [progressByQuest, setProgressByQuest] = useState<ProgressByQuest>({});
  const [attemptKeysByQuest, setAttemptKeysByQuest] =
    useState<AttemptKeysByQuest>({});
  const [learningSignalsByQuest, setLearningSignalsByQuest] =
    useState<LearningSignalsByQuest>({});
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!client || !enabled) {
      setProgressByQuest({});
      setAttemptKeysByQuest({});
      setLearningSignalsByQuest({});
      return;
    }

    const [progressResult, attemptsResult] = await Promise.all([
      client
        .from("study_quest_progress")
        .select("quest_id,user_id,material_id,last_reached_page,updated_at"),
      client
        .from("study_quiz_attempts")
        .select("quest_id,quiz_key,is_correct,skipped,stage,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const error = progressResult.error ?? attemptsResult.error;
    if (error) {
      setAvailable(false);
      return;
    }

    const nextProgress: ProgressByQuest = {};
    for (const row of progressResult.data as StudyQuestProgressRow[]) {
      nextProgress[row.quest_id] = clampStudyPage(row.last_reached_page);
    }
    const { attemptKeysByQuest: nextAttemptKeys, learningSignalsByQuest: nextSignals } =
      summarizeStudyAttempts(attemptsResult.data as StudyQuizAttemptRow[]);
    setProgressByQuest(nextProgress);
    setAttemptKeysByQuest(nextAttemptKeys);
    setLearningSignalsByQuest(nextSignals);
    setAvailable(true);
  }, [client, enabled]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);

  const getReachedPage = useCallback(
    (questId: string) => {
      const remote = progressByQuest[questId];
      if (remote) return remote;
      const local = Number(window.localStorage.getItem(studyProgressStorageKey(questId)));
      return Number.isFinite(local) ? clampStudyPage(local) : null;
    },
    [progressByQuest],
  );

  const saveProgress = useCallback(
    async (questId: string, materialId: string, reachedPage: number) => {
      const page = clampStudyPage(reachedPage);
      window.localStorage.setItem(studyProgressStorageKey(questId), String(page));
      setProgressByQuest((current) => ({
        ...current,
        [questId]: Math.max(current[questId] ?? 0, page),
      }));
      if (!client || !enabled) return false;

      const { error } = await client.rpc("save_study_quest_progress", {
        p_material_id: materialId,
        p_quest_id: questId,
        p_reached_page: page,
      });
      if (error) {
        setAvailable(false);
        return false;
      }
      setAvailable(true);
      return true;
    },
    [client, enabled],
  );

  const recordAttempt = useCallback(
    async (attempt: StudyQuizAttemptDraft) => {
      setAttemptKeysByQuest((current) => ({
        ...current,
        [attempt.questId]: Array.from(
          new Set([...(current[attempt.questId] ?? []), attempt.quizKey]),
        ),
      }));
      setLearningSignalsByQuest((current) => {
        const previous = current[attempt.questId] ?? {
          correct: 0,
          incorrect: 0,
          skipped: 0,
          latestStage: null,
          latestAt: null,
        };
        return {
          ...current,
          [attempt.questId]: {
            correct:
              previous.correct +
              (!attempt.skipped && attempt.isCorrect === true ? 1 : 0),
            incorrect:
              previous.incorrect +
              (!attempt.skipped && attempt.isCorrect === false ? 1 : 0),
            skipped: previous.skipped + (attempt.skipped ? 1 : 0),
            latestStage: attempt.stage,
            latestAt: new Date().toISOString(),
          },
        };
      });
      if (!client || !enabled) return false;
      const user = (await client.auth.getUser()).data.user;
      if (!user) return false;

      const { error } = await client.from("study_quiz_attempts").upsert(
        {
          user_id: user.id,
          quest_id: attempt.questId,
          material_id: attempt.materialId,
          session_key: attempt.sessionKey.slice(0, 160),
          stage: attempt.stage,
          quiz_key: attempt.quizKey.slice(0, 200),
          range_start: clampStudyPage(attempt.rangeStart),
          range_end: clampStudyPage(attempt.rangeEnd),
          reached_page: clampStudyPage(attempt.reachedPage),
          selected_index: attempt.selectedIndex,
          is_correct: attempt.isCorrect,
          skipped: attempt.skipped,
        },
        { onConflict: "user_id,session_key,stage" },
      );
      if (error) {
        setAvailable(false);
        return false;
      }
      setAvailable(true);
      return true;
    },
    [client, enabled],
  );

  const attemptedQuizKeys = useMemo(
    () => (questId: string) => new Set(attemptKeysByQuest[questId] ?? []),
    [attemptKeysByQuest],
  );

  const getLearningSignal = useCallback(
    (questId: string) =>
      learningSignalsByQuest[questId] ?? {
        correct: 0,
        incorrect: 0,
        skipped: 0,
        latestStage: null,
        latestAt: null,
      },
    [learningSignalsByQuest],
  );

  return {
    attemptedQuizKeys,
    available,
    getReachedPage,
    getLearningSignal,
    recordAttempt,
    refresh,
    saveProgress,
  };
}
