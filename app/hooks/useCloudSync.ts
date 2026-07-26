"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLOUD_SYNC_DISABLED_KEY,
  mergeCloudStates,
  parseCloudStateData,
  type CloudAccount,
  type CloudStateData,
  type CloudStateRecord,
} from "@/lib/cloud-state";
import {
  getSupabaseBrowserClient,
  isGoogleAuthEnabled,
  isSupabaseConfigured,
} from "@/lib/supabase-client";

export type CloudSyncStatus =
  | "checking"
  | "guest"
  | "saving"
  | "saved"
  | "error"
  | "disabled";

export type AuthActionResult = {
  message: string;
  ok: boolean;
};

type CloudApiResponse = {
  account?: CloudAccount;
  cloudState?: CloudStateRecord | null;
  error?: string;
};

type CloudBackendResponse = {
  body: CloudApiResponse;
  status: number;
};

type CloudBackend = {
  delete: () => Promise<CloudBackendResponse>;
  get: () => Promise<CloudBackendResponse>;
  put: (
    baseVersion: number,
    data: CloudStateData,
  ) => Promise<CloudBackendResponse>;
};

type UseCloudSyncOptions = {
  applyCloudState: (data: CloudStateData) => void;
  data: CloudStateData;
  hydrated: boolean;
};

const SUPABASE_TABLE = "focus_quest_cloud_states";

function accountForSupabaseUser(user: User): CloudAccount {
  const email = user.email ?? "";
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  return {
    displayName: fullName || email.split("@")[0] || "Focus Quest 사용자",
    email,
  };
}

function decodeSupabaseRow(row: unknown): CloudStateRecord | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as {
    payload?: unknown;
    updated_at?: unknown;
    version?: unknown;
  };
  const payload =
    typeof candidate.payload === "string"
      ? (() => {
          try {
            return JSON.parse(candidate.payload) as unknown;
          } catch {
            return null;
          }
        })()
      : candidate.payload;
  const data = parseCloudStateData(payload);
  if (
    !data ||
    typeof candidate.version !== "number" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }
  return {
    data,
    updatedAt: candidate.updated_at,
    version: candidate.version,
  };
}

function createApiBackend(): CloudBackend {
  const request = async (
    method: "DELETE" | "GET" | "PUT",
    body?: unknown,
  ): Promise<CloudBackendResponse> => {
    const response = await fetch("/api/cloud-state", {
      method,
      headers:
        body === undefined
          ? { accept: "application/json" }
          : {
              accept: "application/json",
              "content-type": "application/json",
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      body: (await response.json()) as CloudApiResponse,
      status: response.status,
    };
  };

  return {
    delete: () => request("DELETE"),
    get: () => request("GET"),
    put: (baseVersion, data) =>
      request("PUT", {
        baseVersion,
        data,
      }),
  };
}

function createSupabaseBackend(
  client: SupabaseClient,
  user: User,
): CloudBackend {
  const account = accountForSupabaseUser(user);

  const get = async (): Promise<CloudBackendResponse> => {
    const { data, error } = await client
      .from(SUPABASE_TABLE)
      .select("version,payload,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return {
      body: {
        account,
        cloudState: decodeSupabaseRow(data),
      },
      status: 200,
    };
  };

  const conflict = async (): Promise<CloudBackendResponse> => {
    const latest = await get();
    return {
      body: {
        ...latest.body,
        error: "다른 기기의 기록이 먼저 저장되었습니다.",
      },
      status: 409,
    };
  };

  return {
    delete: async () => {
      const { error } = await client
        .from(SUPABASE_TABLE)
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      return { body: {}, status: 200 };
    },
    get,
    put: async (baseVersion, cloudData) => {
      const updatedAt = new Date().toISOString();
      const version = baseVersion + 1;

      if (baseVersion === 0) {
        const { data, error } = await client
          .from(SUPABASE_TABLE)
          .insert({
            payload: cloudData,
            updated_at: updatedAt,
            user_id: user.id,
            version,
          })
          .select("version,payload,updated_at")
          .maybeSingle();
        if (error?.code === "23505") return conflict();
        if (error) throw error;
        const cloudState = decodeSupabaseRow(data);
        if (!cloudState) throw new Error("invalid cloud response");
        return { body: { account, cloudState }, status: 200 };
      }

      const { data, error } = await client
        .from(SUPABASE_TABLE)
        .update({
          payload: cloudData,
          updated_at: updatedAt,
          version,
        })
        .eq("user_id", user.id)
        .eq("version", baseVersion)
        .select("version,payload,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return conflict();
      const cloudState = decodeSupabaseRow(data);
      if (!cloudState) throw new Error("invalid cloud response");
      return { body: { account, cloudState }, status: 200 };
    },
  };
}

export function useCloudSync({
  applyCloudState,
  data,
  hydrated,
}: UseCloudSyncOptions) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [status, setStatus] = useState<CloudSyncStatus>("checking");
  const [message, setMessage] = useState("계정 확인 중");
  const dataRef = useRef(data);
  const backendRef = useRef<CloudBackend | null>(null);
  const versionRef = useRef(0);
  const readyRef = useRef(false);
  const syncingRef = useRef(false);
  const pullingRef = useRef(false);
  const queuedSaveRef = useRef<CloudStateData | null>(null);
  const lastSyncedRef = useRef("");

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (cancelled) return;
      setSupabaseUser(sessionData.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        setSupabaseUser(session?.user ?? null);
        setAuthReady(true);
      },
    );
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const save = useCallback(
    async (nextData: CloudStateData, retryOnConflict = true) => {
      const backend = backendRef.current;
      if (!readyRef.current || !backend) return;
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
          const response = await backend.put(baseVersion, payload);
          const result = response.body;

          if (response.status === 409 && result.cloudState && allowRetry) {
            const merged = mergeCloudStates(payload, result.cloudState.data);
            versionRef.current = result.cloudState.version;
            applyCloudState(merged);
            return attempt(merged, result.cloudState.version, false);
          }

          if (response.status >= 400 || !result.cloudState) {
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
    const backend = backendRef.current;
    if (
      !backend ||
      !readyRef.current ||
      syncingRef.current ||
      pullingRef.current
    ) {
      return;
    }
    pullingRef.current = true;
    let pendingSave: CloudStateData | null = null;

    try {
      const response = await backend.get();
      const result = response.body;
      if (
        response.status >= 400 ||
        !result.account ||
        !result.cloudState
      ) {
        return;
      }
      if (result.cloudState.version <= versionRef.current) return;

      const merged = mergeCloudStates(dataRef.current, result.cloudState.data);
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
    if (saveAfterPull) await save(saveAfterPull);
  }, [applyCloudState, save]);

  useEffect(() => {
    if (!hydrated || !authReady) return;
    let cancelled = false;

    const connect = async () => {
      readyRef.current = false;
      backendRef.current = null;
      versionRef.current = 0;
      lastSyncedRef.current = "";
      setStatus("checking");
      setMessage("계정 확인 중");

      if (supabase && !supabaseUser) {
        setAccount(null);
        setStatus("guest");
        setMessage("이 기기에 저장 중");
        return;
      }

      const backend =
        supabase && supabaseUser
          ? createSupabaseBackend(supabase, supabaseUser)
          : createApiBackend();
      backendRef.current = backend;

      try {
        const response = await backend.get();
        const result = response.body;
        if (response.status === 401) {
          if (cancelled) return;
          setAccount(null);
          setStatus("guest");
          setMessage("이 기기에 저장 중");
          return;
        }
        if (response.status >= 400 || !result.account) {
          throw new Error(result.error ?? "계정을 확인하지 못했습니다.");
        }
        if (cancelled) return;

        setAccount(result.account);
        if (
          window.localStorage.getItem(CLOUD_SYNC_DISABLED_KEY) === "true"
        ) {
          setStatus("disabled");
          setMessage("클라우드 저장 꺼짐");
          return;
        }

        const local = dataRef.current;
        readyRef.current = true;
        if (result.cloudState) {
          const merged = mergeCloudStates(local, result.cloudState.data);
          const serializedCloud = JSON.stringify(result.cloudState.data);
          const serializedMerged = JSON.stringify(merged);
          versionRef.current = result.cloudState.version;
          lastSyncedRef.current = serializedCloud;
          applyCloudState(merged);

          if (serializedCloud !== serializedMerged) {
            await save(merged);
          } else {
            lastSyncedRef.current = serializedMerged;
            setStatus("saved");
            setMessage("클라우드 기록 불러옴");
          }
        } else {
          await save(local);
        }
      } catch {
        if (cancelled) return;
        readyRef.current = false;
        setStatus("error");
        setMessage(
          supabase
            ? "클라우드 초기 설정을 확인해 주세요"
            : "클라우드 연결을 확인해 주세요",
        );
      }
    };

    void connect();
    return () => {
      cancelled = true;
    };
  }, [
    applyCloudState,
    authReady,
    hydrated,
    save,
    supabase,
    supabaseUser,
  ]);

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
    if (!confirmed || !backendRef.current) return;

    setStatus("saving");
    setMessage("클라우드 기록 삭제 중");
    try {
      const response = await backendRef.current.delete();
      if (response.status >= 400) throw new Error("delete failed");
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

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return { message: "공개 계정 연결이 아직 설정되지 않았습니다.", ok: false };
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error
        ? { message: "이메일 또는 비밀번호를 확인해 주세요.", ok: false }
        : { message: "로그인했습니다.", ok: true };
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return { message: "공개 계정 연결이 아직 설정되지 않았습니다.", ok: false };
      }
      const { data: authData, error } = await supabase.auth.signUp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
        password,
      });
      if (error) {
        return { message: error.message, ok: false };
      }
      return authData.session
        ? { message: "계정을 만들고 로그인했습니다.", ok: true }
        : {
            message: "인증 메일을 보냈습니다. 메일의 링크를 눌러 주세요.",
            ok: true,
          };
    },
    [supabase],
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase || !isGoogleAuthEnabled) {
      return { message: "Google 로그인이 아직 연결되지 않았습니다.", ok: false };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      options: { redirectTo: window.location.origin },
      provider: "google",
    });
    return error
      ? { message: "Google 로그인을 시작하지 못했습니다.", ok: false }
      : { message: "Google 로그인으로 이동합니다.", ok: true };
  }, [supabase]);

  const resetPassword = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return { message: "공개 계정 연결이 아직 설정되지 않았습니다.", ok: false };
      }
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: window.location.origin },
      );
      return error
        ? { message: "재설정 메일을 보내지 못했습니다.", ok: false }
        : { message: "비밀번호 재설정 메일을 보냈습니다.", ok: true };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    readyRef.current = false;
    backendRef.current = null;
    await supabase.auth.signOut();
  }, [supabase]);

  const updatePassword = useCallback(
    async (password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return { message: "공개 계정 연결이 아직 설정되지 않았습니다.", ok: false };
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return { message: "새 비밀번호를 저장하지 못했습니다.", ok: false };
      }
      setPasswordRecovery(false);
      return { message: "새 비밀번호를 저장했습니다.", ok: true };
    },
    [supabase],
  );

  return {
    account,
    authProvider: supabase ? ("supabase" as const) : ("chatgpt" as const),
    deleteCloudData,
    googleAuthEnabled: Boolean(supabase && isGoogleAuthEnabled),
    message,
    passwordRecovery,
    resetPassword,
    resumeCloudSync,
    signIn,
    signInWithGoogle,
    signOut,
    signUp,
    status,
    updatePassword,
  };
}
