"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  parseCloudStateData,
  type CloudAccount,
  type CloudStateData,
  type CloudStateRecord,
} from "@/lib/cloud-state";

const CLOUD_STATE_TABLE = "focus_quest_cloud_states";

type CloudApiResponse = {
  account?: CloudAccount;
  cloudState?: CloudStateRecord | null;
  error?: string;
};

export type CloudBackendResponse = {
  body: CloudApiResponse;
  status: number;
};

export type CloudBackend = {
  delete: () => Promise<CloudBackendResponse>;
  get: () => Promise<CloudBackendResponse>;
  put: (
    baseVersion: number,
    data: CloudStateData,
  ) => Promise<CloudBackendResponse>;
};

function accountFor(user: User): CloudAccount {
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

function decodeRow(row: unknown): CloudStateRecord | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as {
    payload?: unknown;
    updated_at?: unknown;
    version?: unknown;
  };
  const payload =
    typeof candidate.payload === "string"
      ? parseJson(candidate.payload)
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Legacy Sites/D1 adapter; the public Worker has no DB binding and returns 404. */
export function createApiCloudBackend(): CloudBackend {
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
    put: (baseVersion, data) => request("PUT", { baseVersion, data }),
  };
}

/**
 * Public account adapter. Writes are compare-and-swap on (user_id, version),
 * never unconditional upserts; 409 is a domain result consumed by useCloudSync.
 */
export function createSupabaseCloudBackend(
  client: SupabaseClient,
  user: User,
): CloudBackend {
  const account = accountFor(user);

  const get = async (): Promise<CloudBackendResponse> => {
    const { data, error } = await client
      .from(CLOUD_STATE_TABLE)
      .select("version,payload,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return {
      body: { account, cloudState: decodeRow(data) },
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
        .from(CLOUD_STATE_TABLE)
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      return { body: {}, status: 200 };
    },
    get,
    put: async (baseVersion, cloudData) => {
      const updatedAt = new Date().toISOString();
      const version = baseVersion + 1;
      const mutation = {
        payload: cloudData,
        updated_at: updatedAt,
        version,
      };

      if (baseVersion === 0) {
        const { data, error } = await client
          .from(CLOUD_STATE_TABLE)
          .insert({ ...mutation, user_id: user.id })
          .select("version,payload,updated_at")
          .maybeSingle();
        if (error?.code === "23505") return conflict();
        if (error) throw error;

        return successfulMutation(data, account);
      }

      const { data, error } = await client
        .from(CLOUD_STATE_TABLE)
        .update(mutation)
        .eq("user_id", user.id)
        .eq("version", baseVersion)
        .select("version,payload,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return conflict();

      return successfulMutation(data, account);
    },
  };
}

function successfulMutation(
  row: unknown,
  account: CloudAccount,
): CloudBackendResponse {
  const cloudState = decodeRow(row);
  if (!cloudState) throw new Error("invalid cloud response");
  return { body: { account, cloudState }, status: 200 };
}
