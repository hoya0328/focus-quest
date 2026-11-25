"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  createCampInviteUrl,
  createSecureCampCode,
  normalizeCampChatMessage,
  normalizeCampCode,
  normalizeCampNickname,
  parseSilentCampChatMessage,
  parseSilentCampMember,
  parseSilentCampResumeState,
  parseSilentCampTimer,
  readCampCodeFromUrl,
  type SilentCampChatMessage,
  type SilentCampMember,
  type SilentCampTimer,
} from "@/lib/silent-camp";
import type { AdventureId } from "@/lib/pomodoro";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export type CampStatus = "idle" | "connecting" | "joined" | "error";
export type CampRole = "leader" | "member" | null;
export type CampContact = {
  userId: string;
  nickname: string;
  adventureId: AdventureId;
  sessionsTogether: number;
  lastMetAt: string;
};
export type CampHistoryEntry = {
  campId: string;
  code: string;
  adventureId: AdventureId;
  durationMinutes: number;
  memberCount: number;
  completedAt: string;
};
export type CampInvitation = {
  campId: string;
  code: string;
  inviterNickname: string;
  expiresAt: string;
};

type CampRoom = {
  camp_id: string;
  code: string;
  leader_user_id: string;
};

const MAX_CHAT_MESSAGES = 50;
const CHAT_COOLDOWN_MS = 700;
const REMOTE_CHAT_COOLDOWN_MS = 250;
const CAMP_RESUME_KEY = "focus-quest-camp-resume";

function readCampResumeState() {
  try {
    const raw = window.sessionStorage.getItem(CAMP_RESUME_KEY);
    return raw ? parseSilentCampResumeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCampResumeState(
  state: Parameters<typeof parseSilentCampResumeState>[0] | null,
) {
  try {
    if (state) window.sessionStorage.setItem(CAMP_RESUME_KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(CAMP_RESUME_KEY);
  } catch {
    // Session storage can be unavailable; database membership remains canonical.
  }
}

function campFailureMessage(message: string) {
  if (message.includes("authentication_required")) return "로그인한 뒤 캠프에 참가할 수 있어요.";
  if (message.includes("camp_not_found")) return "열려 있는 캠프를 찾지 못했어요. 코드를 확인해 주세요.";
  if (message.includes("camp_access_blocked")) return "이 캠프에는 다시 참가할 수 없어요.";
  if (message.includes("duplicate key")) return "캠프 코드가 겹쳤어요. 새 코드로 다시 열어 주세요.";
  return "캠프에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

async function createCampRoom(
  client: SupabaseClient,
  nickname: string,
  adventureId: AdventureId,
  focusMinutes: number,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await client.rpc("create_focus_quest_camp", {
      requested_adventure_id: adventureId,
      requested_code: createSecureCampCode(),
      requested_focus_minutes: focusMinutes,
      requested_nickname: nickname,
    });
    if (!result.error) return (result.data?.[0] ?? null) as CampRoom | null;
    if (!result.error.message.includes("duplicate key")) throw result.error;
  }
  throw new Error("duplicate key");
}

export function useSilentCamp({
  activeTimer,
  adventureId,
  focusMinutes,
  nickname,
  onJoined,
  onNicknameRestored,
  onRemoteTimer,
}: {
  activeTimer: SilentCampTimer | null;
  adventureId: AdventureId;
  focusMinutes: number;
  nickname: string;
  onJoined?: (created: boolean) => void;
  onNicknameRestored?: (nickname: string) => void;
  onRemoteTimer: (timer: SilentCampTimer) => void;
}) {
  const [code, setCodeState] = useState("");
  const [status, setStatus] = useState<CampStatus>("idle");
  const [members, setMembers] = useState<SilentCampMember[]>([]);
  const [chatMessages, setChatMessages] = useState<SilentCampChatMessage[]>([]);
  const [currentMemberId, setCurrentMemberId] = useState("");
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [role, setRole] = useState<CampRole>(null);
  const [message, setMessage] = useState("캠프를 만들거나 받은 코드로 들어가세요.");
  const [contacts, setContacts] = useState<CampContact[]>([]);
  const [history, setHistory] = useState<CampHistoryEntry[]>([]);
  const [invitations, setInvitations] = useState<CampInvitation[]>([]);
  const [campId, setCampId] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const campIdRef = useRef("");
  const memberIdRef = useRef("");
  const joinedAtRef = useRef("");
  const leaderIdRef = useRef<string | null>(null);
  const membersRef = useRef<SilentCampMember[]>([]);
  const lastChatAtRef = useRef(0);
  const lastRemoteChatAtRef = useRef(new Map<string, number>());
  const onRemoteTimerRef = useRef(onRemoteTimer);
  const onJoinedRef = useRef(onJoined);
  const joinRef = useRef<(requestedCode?: string) => Promise<void>>(async () => {});

  const refreshCommunity = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const user = (await client.auth.getUser()).data.user;
    if (!user) {
      setContacts([]);
      setHistory([]);
      setInvitations([]);
      return;
    }
    const [contactResult, historyResult, invitationResult] = await Promise.all([
      client.from("focus_quest_camp_contacts")
        .select("contact_user_id,nickname,adventure_id,sessions_together,last_met_at")
        .order("last_met_at", { ascending: false }).limit(12),
      client.from("focus_quest_camp_history")
        .select("camp_id,camp_code,adventure_id,duration_minutes,member_count,completed_at")
        .order("completed_at", { ascending: false }).limit(8),
      client.from("focus_quest_camp_invitations")
        .select("camp_id,camp_code,inviter_nickname,expires_at,accepted_at")
        .eq("invitee_user_id", user.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(8),
    ]);
    if (!contactResult.error) setContacts((contactResult.data ?? []).map((row) => ({
      userId: row.contact_user_id as string,
      nickname: row.nickname as string,
      adventureId: row.adventure_id as AdventureId,
      sessionsTogether: row.sessions_together as number,
      lastMetAt: row.last_met_at as string,
    })));
    if (!historyResult.error) setHistory((historyResult.data ?? []).map((row) => ({
      campId: row.camp_id as string,
      code: row.camp_code as string,
      adventureId: row.adventure_id as AdventureId,
      durationMinutes: row.duration_minutes as number,
      memberCount: row.member_count as number,
      completedAt: row.completed_at as string,
    })));
    if (!invitationResult.error) setInvitations((invitationResult.data ?? []).map((row) => ({
      campId: row.camp_id as string,
      code: row.camp_code as string,
      inviterNickname: row.inviter_nickname as string,
      expiresAt: row.expires_at as string,
    })));
  }, []);

  useEffect(() => {
    onRemoteTimerRef.current = onRemoteTimer;
  }, [onRemoteTimer]);

  useEffect(() => {
    onJoinedRef.current = onJoined;
  }, [onJoined]);

  const setCode = useCallback((value: string) => {
    setCodeState(normalizeCampCode(value));
  }, []);

  const appendChatMessage = useCallback((next: SilentCampChatMessage) => {
    setChatMessages((current) => {
      if (current.some((item) => item.id === next.id)) return current;
      return [...current, next].slice(-MAX_CHAT_MESSAGES);
    });
  }, []);

  const resetLocalCamp = useCallback(async (nextMessage: string) => {
    const client = getSupabaseBrowserClient();
    if (client && channelRef.current) await client.removeChannel(channelRef.current);
    channelRef.current = null;
    campIdRef.current = "";
    setCampId("");
    memberIdRef.current = "";
    joinedAtRef.current = "";
    leaderIdRef.current = null;
    membersRef.current = [];
    lastRemoteChatAtRef.current.clear();
    setStatus("idle");
    setRole(null);
    setLeaderId(null);
    setCurrentMemberId("");
    setMembers([]);
    setChatMessages([]);
    setMessage(nextMessage);
    writeCampResumeState(null);
  }, []);

  const leave = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (client && campIdRef.current) {
      await client.rpc("leave_focus_quest_camp", { requested_camp_id: campIdRef.current });
    }
    await resetLocalCamp("캠프를 나왔어요. 개인 집중 기록은 그대로 남아 있어요.");
  }, [resetLocalCamp]);

  const refreshLeader = useCallback(async (client: SupabaseClient, campId: string) => {
    const result = await client
      .from("focus_quest_camps")
      .select("leader_user_id")
      .eq("id", campId)
      .maybeSingle();
    if (result.error || !result.data) return;
    const nextLeaderId = result.data.leader_user_id as string;
    leaderIdRef.current = nextLeaderId;
    setLeaderId(nextLeaderId);
    setRole(nextLeaderId === memberIdRef.current ? "leader" : "member");
  }, []);

  const join = useCallback(
    async (requestedCode?: string) => {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setStatus("error");
        setMessage("캠프 연결 설정을 찾지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const sessionResult = await client.auth.getSession();
      const user = sessionResult.data.session?.user;
      if (!user) {
        setStatus("error");
        setMessage("로그인한 뒤 캠프에 참가할 수 있어요.");
        return;
      }
      const requested = normalizeCampCode(requestedCode ?? code);
      const creatingRoom = requested.length === 0;
      if (requested && requested.length < 6) {
        setStatus("error");
        setMessage("캠프 코드는 6자 이상 입력해 주세요.");
        return;
      }
      if (channelRef.current) await client.removeChannel(channelRef.current);
      setStatus("connecting");
      setMessage("비공개 캠프를 준비하고 있어요.");

      try {
        let cleanNickname = normalizeCampNickname(nickname) || "모험가";
        const resume = readCampResumeState();
        if (requested && resume?.code === requested && resume.memberId === user.id) {
          const previousRoom = await client.from("focus_quest_camps")
            .select("id").eq("code", requested).maybeSingle();
          if (previousRoom.data) {
            const profile = await client.from("focus_quest_camp_members")
              .select("nickname").eq("camp_id", previousRoom.data.id)
              .eq("user_id", user.id).is("left_at", null).maybeSingle();
            const restoredName = normalizeCampNickname(profile.data?.nickname ?? "");
            if (restoredName) {
              cleanNickname = restoredName;
              onNicknameRestored?.(restoredName);
            }
          }
        }
        let room: CampRoom | null;
        if (requested) {
          const result = await client.rpc("join_focus_quest_camp", {
            requested_adventure_id: adventureId,
            requested_code: requested,
            requested_focus_minutes: focusMinutes,
            requested_nickname: cleanNickname,
          });
          if (result.error) throw result.error;
          room = (result.data?.[0] ?? null) as CampRoom | null;
        } else {
          room = await createCampRoom(client, cleanNickname, adventureId, focusMinutes);
        }
        if (!room) throw new Error("camp_not_found");

        const memberId = user.id;
        const joinedAt = new Date().toISOString();
        campIdRef.current = room.camp_id;
        setCampId(room.camp_id);
        memberIdRef.current = memberId;
        joinedAtRef.current = joinedAt;
        leaderIdRef.current = room.leader_user_id;
        membersRef.current = [];
        setCodeState(room.code);
        setCurrentMemberId(memberId);
        setLeaderId(room.leader_user_id);
        setRole(room.leader_user_id === memberId ? "leader" : "member");
        setMembers([]);
        setChatMessages([]);
        lastRemoteChatAtRef.current.clear();

        const channel = client.channel(`focus-quest-camp:${room.camp_id}`, {
          config: {
            broadcast: { ack: true },
            presence: { key: memberId },
            private: true,
          },
        });
        channel.on("presence", { event: "sync" }, () => {
          const nextMembers = Object.values(channel.presenceState())
            .flatMap((entries) => entries)
            .map(parseSilentCampMember)
            .filter((entry): entry is SilentCampMember => entry !== null)
            .filter((entry, index, entries) =>
              entries.findIndex((candidate) => candidate.memberId === entry.memberId) === index)
            .sort((left, right) => Date.parse(left.joinedAt) - Date.parse(right.joinedAt));
          membersRef.current = nextMembers;
          setMembers(nextMembers);
          void refreshLeader(client, room.camp_id);
          setMessage(
            leaderIdRef.current === memberId
              ? "친구가 준비되면 출발할 수 있어요."
              : "방장이 출발하면 같은 순간에 타이머가 시작돼요.",
          );
        });
        channel.on("broadcast", { event: "timer-state" }, ({ payload }) => {
          const event = payload as { senderId?: unknown; timer?: unknown };
          if (typeof event.senderId !== "string" ||
            event.senderId !== leaderIdRef.current ||
            event.senderId === memberIdRef.current) return;
          const timer = parseSilentCampTimer(event.timer);
          if (timer) onRemoteTimerRef.current(timer);
        });
        channel.on("broadcast", { event: "camp-chat" }, ({ payload }) => {
          const chat = parseSilentCampChatMessage(payload);
          const sender = membersRef.current.find((member) => member.memberId === chat?.senderId);
          if (!chat || chat.senderId === memberIdRef.current || !sender) return;
          const receivedAt = Date.now();
          const lastReceivedAt = lastRemoteChatAtRef.current.get(chat.senderId) ?? 0;
          if (receivedAt - lastReceivedAt < REMOTE_CHAT_COOLDOWN_MS) return;
          lastRemoteChatAtRef.current.set(chat.senderId, receivedAt);
          appendChatMessage({ ...chat, nickname: sender.nickname });
        });
        channel.on("broadcast", { event: "member-removed" }, ({ payload }) => {
          const event = payload as { targetUserId?: unknown };
          if (event.targetUserId === memberIdRef.current) {
            void resetLocalCamp("방장이 이 캠프에서 내보냈어요.");
          }
        });
        channel.subscribe(async (channelStatus) => {
          if (channelStatus === "SUBSCRIBED") {
            await channel.track({
              memberId,
              joinedAt,
              nickname: cleanNickname,
              adventureId,
              focusMinutes,
            });
            setStatus("joined");
            void client.rpc("accept_focus_quest_camp_invitation", {
              requested_camp_id: room.camp_id,
            });
            void refreshCommunity();
            onJoinedRef.current?.(creatingRoom);
            writeCampResumeState({ version: 1, code: room.code, memberId, joinedAt });
          } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
            setStatus("error");
            setMessage("비공개 캠프 연결을 확인하지 못했어요. 다시 시도해 주세요.");
          }
        });
        channelRef.current = channel;
      } catch (failure) {
        setStatus("error");
        setMessage(campFailureMessage(failure instanceof Error ? failure.message : ""));
      }
    },
    [adventureId, appendChatMessage, code, focusMinutes, nickname, onNicknameRestored, refreshCommunity, refreshLeader, resetLocalCamp],
  );

  useEffect(() => {
    joinRef.current = join;
  }, [join]);

  useEffect(() => {
    const inviteCode = readCampCodeFromUrl(window.location.href);
    const resume = readCampResumeState();
    const nextCode = inviteCode.length >= 6 ? inviteCode : resume?.code ?? "";
    if (nextCode.length < 6) return;
    const timer = window.setTimeout(() => void joinRef.current(nextCode), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCommunity(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshCommunity]);

  useEffect(() => {
    if (status !== "joined" || !channelRef.current || !campIdRef.current) return;
    const client = getSupabaseBrowserClient();
    const cleanNickname = normalizeCampNickname(nickname) || "모험가";
    void channelRef.current.track({
      memberId: memberIdRef.current,
      joinedAt: joinedAtRef.current,
      nickname: cleanNickname,
      adventureId,
      focusMinutes,
    });
    if (client) {
      void client.rpc("update_focus_quest_camp_member", {
        requested_adventure_id: adventureId,
        requested_camp_id: campIdRef.current,
        requested_focus_minutes: focusMinutes,
        requested_nickname: cleanNickname,
      });
    }
  }, [adventureId, focusMinutes, nickname, status]);

  useEffect(() => {
    if (status !== "joined" || role !== "leader") return;
    const channel = channelRef.current;
    if (!channel) return;
    const broadcast = () => {
      void channel.send({
        type: "broadcast",
        event: "timer-state",
        payload: { senderId: memberIdRef.current, timer: activeTimer },
      });
    };
    broadcast();
    const timer = window.setInterval(broadcast, 2_000);
    return () => window.clearInterval(timer);
  }, [activeTimer, role, status]);

  useEffect(() => {
    if (status !== "joined") return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const verifyMembership = async () => {
      const result = await client.rpc("is_active_focus_quest_camp_member", {
        requested_camp_id: campIdRef.current,
      });
      if (result.error || result.data !== true) {
        await resetLocalCamp("캠프 참가 권한이 끝났어요.");
      }
    };
    const timer = window.setInterval(() => void verifyMembership(), 20_000);
    return () => window.clearInterval(timer);
  }, [resetLocalCamp, status]);

  const removeMember = useCallback(async (targetUserId: string, shouldBlock: boolean) => {
    const client = getSupabaseBrowserClient();
    const channel = channelRef.current;
    if (!client || !channel || role !== "leader" || !campIdRef.current) return false;
    const result = await client.rpc("remove_focus_quest_camp_member", {
      requested_camp_id: campIdRef.current,
      requested_user_id: targetUserId,
      should_block: shouldBlock,
    });
    if (result.error) {
      setMessage("참가자를 내보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    await channel.send({
      type: "broadcast",
      event: "member-removed",
      payload: { senderId: memberIdRef.current, targetUserId },
    });
    setMembers((current) => current.filter((member) => member.memberId !== targetUserId));
    setMessage(shouldBlock ? "참가자를 내보내고 재입장을 막았어요." : "참가자를 내보냈어요.");
    return true;
  }, [role]);

  const sendChat = useCallback(async (value: string) => {
    const body = normalizeCampChatMessage(value);
    const channel = channelRef.current;
    if (!body || !channel || status !== "joined") return false;
    const now = Date.now();
    if (now - lastChatAtRef.current < CHAT_COOLDOWN_MS) {
      setMessage("메시지는 잠시 간격을 두고 보내 주세요.");
      return false;
    }
    lastChatAtRef.current = now;
    const chat: SilentCampChatMessage = {
      id: crypto.randomUUID(),
      senderId: memberIdRef.current,
      nickname: normalizeCampNickname(nickname) || "모험가",
      body,
      sentAt: new Date(now).toISOString(),
    };
    appendChatMessage(chat);
    await channel.send({ type: "broadcast", event: "camp-chat", payload: chat });
    return true;
  }, [appendChatMessage, nickname, status]);

  const inviteContact = useCallback(async (contactUserId: string) => {
    const client = getSupabaseBrowserClient();
    if (!client || !campIdRef.current || role !== "leader") return false;
    const result = await client.rpc("invite_focus_quest_camp_contact", {
      requested_camp_id: campIdRef.current,
      requested_contact_user_id: contactUserId,
    });
    setMessage(result.error ? "초대를 보내지 못했어요. 잠시 후 다시 시도해 주세요." : "함께했던 친구에게 초대를 보냈어요.");
    return !result.error;
  }, [role]);

  const reportMember = useCallback(async (
    targetUserId: string,
    reason: "spam" | "harassment" | "privacy" | "other",
  ) => {
    const client = getSupabaseBrowserClient();
    if (!client || !campIdRef.current) return false;
    const result = await client.rpc("report_focus_quest_camp_member", {
      requested_camp_id: campIdRef.current,
      requested_reason: reason,
      requested_user_id: targetUserId,
    });
    setMessage(result.error ? "신고를 접수하지 못했어요." : "신고를 접수했어요. 같은 내용은 한 번만 저장돼요.");
    return !result.error;
  }, []);

  const recordCompletion = useCallback(async (durationMinutes: number) => {
    const client = getSupabaseBrowserClient();
    if (!client || !campIdRef.current || role !== "leader") return false;
    const result = await client.rpc("record_focus_quest_camp_completion", {
      requested_camp_id: campIdRef.current,
      requested_duration_minutes: durationMinutes,
    });
    if (!result.error) await refreshCommunity();
    return !result.error;
  }, [refreshCommunity, role]);

  const reopenCamp = useCallback(async (previousCampId: string) => {
    const client = getSupabaseBrowserClient();
    if (!client) return false;
    setStatus("connecting");
    setMessage("지난 동료들에게 보낼 새 캠프를 준비하고 있어요.");
    try {
      const cleanNickname = normalizeCampNickname(nickname) || "모험가";
      let room: CampRoom | null = null;
      for (let attempt = 0; attempt < 3 && !room; attempt += 1) {
        const result = await client.rpc("reopen_focus_quest_camp", {
          previous_camp_id: previousCampId,
          requested_adventure_id: adventureId,
          requested_code: createSecureCampCode(),
          requested_focus_minutes: focusMinutes,
          requested_nickname: cleanNickname,
        });
        if (!result.error) room = (result.data?.[0] ?? null) as CampRoom | null;
        else if (!result.error.message.includes("duplicate key")) throw result.error;
      }
      if (!room) throw new Error("duplicate key");
      await join(room.code);
      return true;
    } catch (failure) {
      setStatus("error");
      setMessage(campFailureMessage(failure instanceof Error ? failure.message : ""));
      return false;
    }
  }, [adventureId, focusMinutes, join, nickname]);

  const copyInvite = useCallback(async () => {
    await navigator.clipboard.writeText(createCampInviteUrl(window.location.href, code));
    setMessage("초대 링크를 복사했어요.");
  }, [code]);

  useEffect(() => () => {
    const client = getSupabaseBrowserClient();
    if (client && channelRef.current) void client.removeChannel(channelRef.current);
  }, []);

  return {
    chatMessages,
    campId,
    code,
    contacts,
    copyInvite,
    count: members.length,
    currentMemberId,
    join,
    history,
    invitations,
    inviteContact,
    leaderId,
    leave,
    members,
    message,
    recordCompletion,
    refreshCommunity,
    reopenCamp,
    reportMember,
    removeMember,
    role,
    sendChat,
    setCode,
    status,
  };
}
