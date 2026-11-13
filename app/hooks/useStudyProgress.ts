"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  clampStudyPage,
  studyProgressStorageKey,
  type StudyQuestProgressRow,
  type StudyQuizAttemptDraft,
  type StudyQuizAttemptRow,
} from "@/lib/study-progress";

type ProgressByQuest = Record<string, number>;
type AttemptKeysByQuest = Record<string, string[]>;

export function useStudyProgress(enabled: boolean) {
  const client = getSupabaseBrowserClient();
  const [progressByQuest, setProgressByQuest] = useState<ProgressByQuest>({});
  const [attemptKeysByQuest, setAttemptKeysByQuest] =
    useState<AttemptKeysByQuest>({});
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!client || !enabled) {
      setProgressByQuest({});
      setAttemptKeysByQuest({});
      return;
    }

    const [progressResult, attemptsResult] = await Promise.all([
      client
        .from("study_quest_progress")
        .select("quest_id,user_id,material_id,last_reached_page,updated_at"),
      client
        .from("study_quiz_attempts")
        .select("quest_id,quiz_key")
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
    const nextAttemptKeys: AttemptKeysByQuest = {};
    for (const row of attemptsResult.data as StudyQuizAttemptRow[]) {
      nextAttemptKeys[row.quest_id] ??= [];
      if (!nextAttemptKeys[row.quest_id].includes(row.quiz_key)) {
        nextAttemptKeys[row.quest_id].push(row.quiz_key);
      }
    }
    setProgressByQuest(nextProgress);
    setAttemptKeysByQuest(nextAttemptKeys);
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

  return {
    attemptedQuizKeys,
    available,
    getReachedPage,
    recordAttempt,
    refresh,
    saveProgress,
  };
}
