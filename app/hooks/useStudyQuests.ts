"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  normalizeQuestDraft,
  normalizeSubjectDraft,
  questFromRow,
  subjectFromRow,
  type QuestDraft,
  type QuestRow,
  type StudyQuest,
  type StudySubject,
  type SubjectDraft,
  type SubjectRow,
} from "@/lib/study-quests";

export type QuestStoreStatus = "guest" | "loading" | "ready" | "saving" | "error";

export function useStudyQuests(enabled: boolean) {
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [quests, setQuests] = useState<StudyQuest[]>([]);
  const [status, setStatus] = useState<QuestStoreStatus>("guest");
  const [message, setMessage] = useState("로그인하면 과목과 퀘스트를 저장할 수 있어요.");
  const client = getSupabaseBrowserClient();

  const refresh = useCallback(async () => {
    if (!client || !enabled) {
      setSubjects([]);
      setQuests([]);
      setStatus("guest");
      return;
    }
    setStatus("loading");
    const [subjectResult, questResult] = await Promise.all([
      client.from("study_subjects").select("*").order("updated_at", { ascending: false }),
      client.from("study_quests").select("*").order("created_at", { ascending: true }),
    ]);
    const error = subjectResult.error ?? questResult.error;
    if (error) {
      setStatus("error");
      setMessage(
        error.code === "42P01"
          ? "퀘스트 데이터베이스 설정이 필요해요."
          : "퀘스트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    setSubjects((subjectResult.data as SubjectRow[]).map(subjectFromRow));
    setQuests((questResult.data as QuestRow[]).map(questFromRow));
    setStatus("ready");
    setMessage("계정에 안전하게 저장되고 있어요.");
  }, [client, enabled]);

  useEffect(() => {
    // Initial remote hydration intentionally updates the local query state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, refresh]);

  const createSubject = useCallback(
    async (draft: SubjectDraft) => {
      if (!client) return null;
      const user = (await client.auth.getUser()).data.user;
      const input = normalizeSubjectDraft(draft);
      if (!user || !input.name) return null;
      setStatus("saving");
      const { data, error } = await client
        .from("study_subjects")
        .insert({
          user_id: user.id,
          name: input.name,
          goal: input.goal,
          target_date: input.targetDate || null,
          weekly_minutes: input.weeklyMinutes,
        })
        .select()
        .single();
      if (error) {
        setStatus("error");
        setMessage("과목을 저장하지 못했어요.");
        return null;
      }
      const subject = subjectFromRow(data as SubjectRow);
      setSubjects((current) => [subject, ...current]);
      setStatus("ready");
      return subject;
    },
    [client],
  );

  const deleteSubject = useCallback(
    async (id: string) => {
      if (!client) return false;
      setStatus("saving");
      const { error } = await client.from("study_subjects").delete().eq("id", id);
      if (error) {
        setStatus("error");
        setMessage("과목을 삭제하지 못했어요.");
        return false;
      }
      setSubjects((current) => current.filter((item) => item.id !== id));
      setQuests((current) => current.filter((item) => item.subjectId !== id));
      setStatus("ready");
      return true;
    },
    [client],
  );

  const createQuest = useCallback(
    async (draft: QuestDraft) => {
      if (!client) return null;
      const user = (await client.auth.getUser()).data.user;
      const input = normalizeQuestDraft(draft);
      if (!user || !input.subjectId || !input.title) return null;
      setStatus("saving");
      const { data, error } = await client
        .from("study_quests")
        .insert({
          user_id: user.id,
          subject_id: input.subjectId,
          title: input.title,
          objective: input.objective,
          adventure_id: input.adventureId,
          focus_minutes: input.focusMinutes,
          break_minutes: input.breakMinutes,
          target_sets: input.targetSets,
        })
        .select()
        .single();
      if (error) {
        setStatus("error");
        setMessage("퀘스트를 저장하지 못했어요.");
        return null;
      }
      const quest = questFromRow(data as QuestRow);
      setQuests((current) => [...current, quest]);
      setStatus("ready");
      return quest;
    },
    [client],
  );

  const updateQuest = useCallback(
    async (id: string, draft: QuestDraft) => {
      if (!client) return null;
      const input = normalizeQuestDraft(draft);
      if (!input.subjectId || !input.title) return null;
      const currentQuest = quests.find((quest) => quest.id === id);
      setStatus("saving");
      const { data, error } = await client
        .from("study_quests")
        .update({
          subject_id: input.subjectId,
          title: input.title,
          objective: input.objective,
          adventure_id: input.adventureId,
          focus_minutes: input.focusMinutes,
          break_minutes: input.breakMinutes,
          target_sets: Math.max(input.targetSets, currentQuest?.completedSets ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        setStatus("error");
        setMessage("퀘스트 수정을 저장하지 못했어요.");
        return null;
      }
      const quest = questFromRow(data as QuestRow);
      setQuests((current) => current.map((item) => (item.id === id ? quest : item)));
      setStatus("ready");
      return quest;
    },
    [client, quests],
  );

  const deleteQuest = useCallback(
    async (id: string) => {
      if (!client) return false;
      setStatus("saving");
      const { error } = await client.from("study_quests").delete().eq("id", id);
      if (error) {
        setStatus("error");
        setMessage("퀘스트를 삭제하지 못했어요.");
        return false;
      }
      setQuests((current) => current.filter((item) => item.id !== id));
      setStatus("ready");
      return true;
    },
    [client],
  );

  const startQuest = useCallback(
    async (id: string) => {
      if (!client) return false;
      setStatus("saving");
      const { error } = await client
        .from("study_quests")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", id)
        .neq("status", "completed");
      if (error) {
        setStatus("error");
        setMessage("퀘스트를 시작 상태로 바꾸지 못했어요.");
        return false;
      }
      setQuests((current) =>
        current.map((item) =>
          item.id === id && item.status !== "completed"
            ? { ...item, status: "in_progress" }
            : item,
        ),
      );
      setStatus("ready");
      return true;
    },
    [client],
  );

  const completeSet = useCallback(
    async (questId: string, sessionId: string, durationMinutes: number) => {
      if (!client) return null;
      const { data, error } = await client.rpc("complete_study_quest_set", {
        p_quest_id: questId,
        p_session_id: sessionId,
        p_duration_minutes: durationMinutes,
      });
      if (error || !data) {
        setStatus("error");
        setMessage("집중 세트 기록을 저장하지 못했어요.");
        return null;
      }
      const quest = questFromRow(data as QuestRow);
      setQuests((current) => current.map((item) => (item.id === questId ? quest : item)));
      setStatus("ready");
      return quest;
    },
    [client],
  );

  return {
    completeSet,
    createQuest,
    createSubject,
    deleteQuest,
    deleteSubject,
    message,
    quests,
    refresh,
    startQuest,
    status,
    subjects,
    updateQuest,
  };
}
