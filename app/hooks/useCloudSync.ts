"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLOUD_SYNC_DISABLED_KEY,
  mergeCloudStates,
  type CloudAccount,
  type CloudStateData,
  type CloudStateRecord,
} from "@/lib/cloud-state";

export type CloudSyncStatus =
  | "checking"
  | "guest"
  | "saving"
  | "saved"
  | "error"
  | "disabled";

type CloudApiResponse = {
  account?: CloudAccount;
  cloudState?: CloudStateRecord | null;
  error?: string;
};

type UseCloudSyncOptions = {
  applyCloudState: (data: CloudStateData) => void;
  data: CloudStateData;
  hydrated: boolean;
};

export function useCloudSync({
  applyCloudState,
  data,
  hydrated,
}: UseCloudSyncOptions) {
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [status, setStatus] = useState<CloudSyncStatus>("checking");
  const [message, setMessage] = useState("계정 확인 중");
  const dataRef = useRef(data);
  const versionRef = useRef(0);
  const readyRef = useRef(false);
  const syncingRef = useRef(false);
  const pullingRef = useRef(false);
  const queuedSaveRef = useRef<CloudStateData | null>(null);
  const lastSyncedRef = useRef("");

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const save = useCallback(
    async (nextData: CloudStateData, retryOnConflict = true) => {
      if (!readyRef.current) {
        return;
      }
      if (syncingRef.current || pullingRef.current) {
        queuedSaveRef.current = nextData;
        return;
      }
      queuedSaveRef.current = null;
      syncingRef.current = true;
      setStatus("saving");
      setMessage("클라우드 저장 중");

      try {
        const attempt = async (
          payload: CloudStateData,
          baseVersion: number,
          allowRetry: boolean,
        ): Promise<CloudStateRecord> => {
          const response = await fetch("/api/cloud-state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              baseVersion,
              data: payload,
            }),
          });
          const result = (await response.json()) as CloudApiResponse;

          if (response.status === 409 && result.cloudState && allowRetry) {
            const merged = mergeCloudStates(payload, result.cloudState.data);
            versionRef.current = result.cloudState.version;
            applyCloudState(merged);
            return attempt(merged, result.cloudState.version, false);
          }

          if (!response.ok || !result.cloudState) {
            throw new Error(result.error ?? "클라우드 저장에 실패했습니다.");
          }
          return result.cloudState;
        };

        const saved = await attempt(
          nextData,
          versionRef.current,
          retryOnConflict,
        );
        versionRef.current = saved.version;
        lastSyncedRef.current = JSON.stringify(saved.data);
        setStatus("saved");
        setMessage("클라우드 저장됨");
      } catch {
        setStatus("error");
        setMessage("저장 연결을 확인해 주세요");
      } finally {
        syncingRef.current = false;
      }
    },
    [applyCloudState],
  );

  const pullLatest = useCallback(async () => {
    if (
      !readyRef.current ||
      syncingRef.current ||
      pullingRef.current
    ) {
      return;
    }
    pullingRef.current = true;
    let pendingSave: CloudStateData | null = null;

    try {
      const response = await fetch("/api/cloud-state", {
        headers: { accept: "application/json" },
      });
      const result = (await response.json()) as CloudApiResponse;
      if (!response.ok || !result.account || !result.cloudState) return;
      if (result.cloudState.version <= versionRef.current) return;

      const merged = mergeCloudStates(
        dataRef.current,
        result.cloudState.data,
      );
      const serializedCloud = JSON.stringify(result.cloudState.data);
      const serializedMerged = JSON.stringify(merged);
      versionRef.current = result.cloudState.version;
      lastSyncedRef.current = serializedCloud;
      applyCloudState(merged);
      setStatus("saved");
      setMessage("다른 기기 변경 반영됨");

      if (serializedMerged !== serializedCloud) pendingSave = merged;
    } catch {
      setStatus("error");
      setMessage("다른 기기 기록을 확인하지 못했어요");
    } finally {
      pullingRef.current = false;
    }

    const queuedSave = queuedSaveRef.current;
    queuedSaveRef.current = null;
    const saveAfterPull = queuedSave
      ? mergeCloudStates(pendingSave ?? dataRef.current, queuedSave)
      : pendingSave;
    if (saveAfterPull) {
      await save(saveAfterPull);
    }
  }, [applyCloudState, save]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const connect = async () => {
      setStatus("checking");
      setMessage("계정 확인 중");

      try {
        const response = await fetch("/api/cloud-state", {
          headers: { accept: "application/json" },
        });

        if (response.status === 401) {
          if (cancelled) return;
          readyRef.current = false;
          setAccount(null);
          setStatus("guest");
          setMessage("이 기기에 저장 중");
          return;
        }

        const result = (await response.json()) as CloudApiResponse;
        if (!response.ok || !result.account) {
          throw new Error(result.error ?? "계정을 확인하지 못했습니다.");
        }
        if (cancelled) return;

        setAccount(result.account);
        if (
          window.localStorage.getItem(CLOUD_SYNC_DISABLED_KEY) === "true"
        ) {
          readyRef.current = false;
          setStatus("disabled");
          setMessage("클라우드 저장 꺼짐");
          return;
        }

        const local = dataRef.current;
        if (result.cloudState) {
          const merged = mergeCloudStates(local, result.cloudState.data);
          const serializedCloud = JSON.stringify(result.cloudState.data);
          const serializedMerged = JSON.stringify(merged);
          versionRef.current = result.cloudState.version;
          lastSyncedRef.current = serializedCloud;
          readyRef.current = true;
          applyCloudState(merged);

          if (serializedCloud !== serializedMerged) {
            await save(merged);
          } else {
            lastSyncedRef.current = serializedMerged;
            setStatus("saved");
            setMessage("클라우드 기록 불러옴");
          }
        } else {
          versionRef.current = 0;
          lastSyncedRef.current = "";
          readyRef.current = true;
          await save(local);
        }
      } catch {
        if (cancelled) return;
        readyRef.current = false;
        setStatus("error");
        setMessage("클라우드 연결을 확인해 주세요");
      }
    };

    void connect();
    return () => {
      cancelled = true;
    };
  }, [applyCloudState, hydrated, save]);

  useEffect(() => {
    if (!hydrated || !readyRef.current || !account) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSyncedRef.current) return;

    const timer = window.setTimeout(() => {
      void save(data);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [account, data, hydrated, save, status]);

  useEffect(() => {
    if (!hydrated || !account || status === "disabled") return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void pullLatest();
    };
    const timer = window.setInterval(refreshWhenVisible, 10_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [account, hydrated, pullLatest, status]);

  const deleteCloudData = useCallback(async () => {
    const confirmed = window.confirm(
      "클라우드에 저장된 기록을 삭제할까요? 이 기기의 기록은 그대로 남습니다.",
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("클라우드 기록 삭제 중");
    try {
      const response = await fetch("/api/cloud-state", { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      window.localStorage.setItem(CLOUD_SYNC_DISABLED_KEY, "true");
      readyRef.current = false;
      versionRef.current = 0;
      lastSyncedRef.current = "";
      setStatus("disabled");
      setMessage("클라우드 기록 삭제됨");
    } catch {
      setStatus("error");
      setMessage("클라우드 기록을 삭제하지 못했어요");
    }
  }, []);

  const resumeCloudSync = useCallback(() => {
    window.localStorage.removeItem(CLOUD_SYNC_DISABLED_KEY);
    readyRef.current = true;
    versionRef.current = 0;
    lastSyncedRef.current = "";
    void save(dataRef.current);
  }, [save]);

  return {
    account,
    status,
    message,
    deleteCloudData,
    resumeCloudSync,
  };
}
