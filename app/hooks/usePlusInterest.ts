"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type PlusInterestLevel = "interested" | "not_now";
export type PlusPriceBand = 4900 | 5900 | 6900;

type PlusInterest = {
  level: PlusInterestLevel;
  priceBand: PlusPriceBand | null;
};

type PlusInterestRow = {
  interest_level: PlusInterestLevel;
  price_band: PlusPriceBand | null;
};

export function usePlusInterest(enabled: boolean) {
  const client = getSupabaseBrowserClient();
  const [interest, setInterest] = useState<PlusInterest | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!client || !enabled) {
      setInterest(null);
      setStatus("idle");
      setMessage("");
      return;
    }
    setStatus("loading");
    const { data, error } = await client
      .from("focus_quest_plus_interest")
      .select("interest_level,price_band")
      .maybeSingle();
    if (error) {
      setStatus("error");
      setMessage(
        error.code === "42P01"
          ? "의견 저장소를 준비하고 있어요. 잠시 후 다시 확인해 주세요."
          : "저장한 의견을 불러오지 못했어요.",
      );
      return;
    }
    const row = data as PlusInterestRow | null;
    setInterest(row ? { level: row.interest_level, priceBand: row.price_band } : null);
    setStatus("idle");
    setMessage("");
  }, [client, enabled]);

  useEffect(() => {
    // Hydrate the current user's private research response after authentication.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (level: PlusInterestLevel, priceBand: PlusPriceBand | null) => {
      if (!client || !enabled || (level === "interested" && priceBand === null)) {
        return false;
      }
      setStatus("saving");
      setMessage("");
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        setStatus("error");
        setMessage("로그인을 다시 확인해 주세요.");
        return false;
      }
      const nextPrice = level === "interested" ? priceBand : null;
      const { error } = await client.from("focus_quest_plus_interest").upsert(
        {
          user_id: authData.user.id,
          interest_level: level,
          price_band: nextPrice,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        setStatus("error");
        setMessage("의견을 저장하지 못했어요. 다시 시도해 주세요.");
        return false;
      }
      setInterest({ level, priceBand: nextPrice });
      setStatus("saved");
      setMessage("의견을 저장했어요. 결제되거나 예약된 항목은 없어요.");
      return true;
    },
    [client, enabled],
  );

  return { interest, message, refresh, save, status };
}
