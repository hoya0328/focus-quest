"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createCampInviteUrl,
  createSecureCampCode,
  electSilentCampLeader,
  normalizeCampChatMessage,
  normalizeCampCode,
  normalizeCampNickname,
  parseSilentCampChatMessage,
  parseSilentCampMember,
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

const MAX_CHAT_MESSAGES = 50;
const CHAT_COOLDOWN_MS = 700;
const REMOTE_CHAT_COOLDOWN_MS = 250;

export function useSilentCamp({
  activeTimer,
  adventureId,
  focusMinutes,
  nickname,
  onRemoteTimer,
}: {
  activeTimer: SilentCampTimer | null;
  adventureId: AdventureId;
  focusMinutes: number;
  nickname: string;
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const memberIdRef = useRef("");
  const joinedAtRef = useRef("");
  const leaderIdRef = useRef<string | null>(null);
  const membersRef = useRef<SilentCampMember[]>([]);
  const lastChatAtRef = useRef(0);
  const lastRemoteChatAtRef = useRef(new Map<string, number>());
  const onRemoteTimerRef = useRef(onRemoteTimer);
  const joinRef = useRef<(requestedCode?: string) => Promise<void>>(async () => {});

  useEffect(() => {
    onRemoteTimerRef.current = onRemoteTimer;
  }, [onRemoteTimer]);

  const setCode = useCallback((value: string) => {
    setCodeState(normalizeCampCode(value));
  }, []);

  const appendChatMessage = useCallback((next: SilentCampChatMessage) => {
    setChatMessages((current) => {
      if (current.some((item) => item.id === next.id)) return current;
      return [...current, next].slice(-MAX_CHAT_MESSAGES);
    });
  }, []);

  const leave = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (client && channelRef.current) {
      await client.removeChannel(channelRef.current);
    }
    channelRef.current = null;
    leaderIdRef.current = null;
    membersRef.current = [];
    lastRemoteChatAtRef.current.clear();
    setStatus("idle");
    setRole(null);
    setLeaderId(null);
    setCurrentMemberId("");
    setMembers([]);
    setChatMessages([]);
    setMessage("캠프를 나왔어요. 개인 집중 기록은 그대로 남아 있어요.");
  }, []);

  const join = useCallback(
    async (requestedCode?: string) => {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setStatus("error");
        setMessage("캠프 연결 설정을 찾지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const nextCode =
        normalizeCampCode(requestedCode ?? code) || createSecureCampCode();
      if (nextCode.length < 6) {
        setStatus("error");
        setMessage("캠프 코드는 6자 이상 입력해 주세요.");
        return;
      }
      if (channelRef.current) await client.removeChannel(channelRef.current);

      const memberId = memberIdRef.current || crypto.randomUUID();
      const joinedAt = new Date().toISOString();
      memberIdRef.current = memberId;
      setCurrentMemberId(memberId);
      joinedAtRef.current = joinedAt;
      leaderIdRef.current = null;
      membersRef.current = [];
      setCodeState(nextCode);
      setRole(null);
      setLeaderId(null);
      setMembers([]);
      setChatMessages([]);
      lastRemoteChatAtRef.current.clear();
      setStatus("connecting");
      setMessage("캠프 불을 밝히고 있어요.");

      const channel = client.channel(`silent-camp:${nextCode}`, {
        config: { presence: { key: memberId } },
      });
      channel.on("presence", { event: "sync" }, () => {
        const presenceMembers = Object.values(channel.presenceState())
          .flatMap((entries) => entries)
          .map(parseSilentCampMember)
          .filter((entry): entry is SilentCampMember => entry !== null);
        const nextMembers = [
          ...new Map(
            presenceMembers.map((member) => [member.memberId, member]),
          ).values(),
        ]
          .sort(
            (left, right) =>
              Date.parse(left.joinedAt) - Date.parse(right.joinedAt) ||
              left.memberId.localeCompare(right.memberId),
          );
        const nextLeaderId = electSilentCampLeader(
          nextMembers,
          leaderIdRef.current,
        );
        leaderIdRef.current = nextLeaderId;
        membersRef.current = nextMembers;
        setLeaderId(nextLeaderId);
        setMembers(nextMembers);
        setRole(nextLeaderId === memberId ? "leader" : "member");
        setMessage(
          nextLeaderId === memberId
            ? "친구가 준비되면 출발할 수 있어요."
            : "방장이 출발하면 같은 순간에 타이머가 시작돼요.",
        );
      });
      channel.on("broadcast", { event: "timer-state" }, ({ payload }) => {
        const event = payload as { senderId?: unknown; timer?: unknown };
        if (
          typeof event.senderId !== "string" ||
          event.senderId !== leaderIdRef.current ||
          event.senderId === memberIdRef.current
        ) {
          return;
        }
        const timer = parseSilentCampTimer(event.timer);
        if (timer) onRemoteTimerRef.current(timer);
      });
      channel.on("broadcast", { event: "camp-chat" }, ({ payload }) => {
        const chat = parseSilentCampChatMessage(payload);
        const sender = membersRef.current.find(
          (member) => member.memberId === chat?.senderId,
        );
        if (!chat || chat.senderId === memberIdRef.current || !sender) {
          return;
        }
        const receivedAt = Date.now();
        const lastReceivedAt =
          lastRemoteChatAtRef.current.get(chat.senderId) ?? 0;
        if (receivedAt - lastReceivedAt < REMOTE_CHAT_COOLDOWN_MS) return;
        lastRemoteChatAtRef.current.set(chat.senderId, receivedAt);
        appendChatMessage({ ...chat, nickname: sender.nickname });
      });
      channel.subscribe(async (channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          await channel.track({
            memberId,
            joinedAt,
            nickname: normalizeCampNickname(nickname) || "모험가",
            adventureId,
            focusMinutes,
          });
          setStatus("joined");
        } else if (
          channelStatus === "CHANNEL_ERROR" ||
          channelStatus === "TIMED_OUT"
        ) {
          setStatus("error");
          setMessage("캠프에 연결하지 못했어요. 코드와 네트워크를 확인해 주세요.");
        }
      });
      channelRef.current = channel;
    },
    [adventureId, appendChatMessage, code, focusMinutes, nickname],
  );

  useEffect(() => {
    joinRef.current = join;
  }, [join]);

  useEffect(() => {
    const inviteCode = readCampCodeFromUrl(window.location.href);
    if (inviteCode.length < 6) return;
    const timer = window.setTimeout(() => void joinRef.current(inviteCode), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "joined" || !channelRef.current) return;
    void channelRef.current.track({
      memberId: memberIdRef.current,
      joinedAt: joinedAtRef.current,
      nickname: normalizeCampNickname(nickname) || "모험가",
      adventureId,
      focusMinutes,
    });
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

  const sendChat = useCallback(
    async (value: string) => {
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
    },
    [appendChatMessage, nickname, status],
  );

  const copyInvite = useCallback(async () => {
    await navigator.clipboard.writeText(
      createCampInviteUrl(window.location.href, code),
    );
    setMessage("초대 링크를 복사했어요.");
  }, [code]);

  useEffect(
    () => () => {
      const client = getSupabaseBrowserClient();
      if (client && channelRef.current) void client.removeChannel(channelRef.current);
    },
    [],
  );

  return {
    chatMessages,
    code,
    copyInvite,
    count: members.length,
    currentMemberId,
    join,
    leaderId,
    leave,
    members,
    message,
    role,
    sendChat,
    setCode,
    status,
  };
}
