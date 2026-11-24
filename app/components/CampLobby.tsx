"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type {
  CampContact,
  CampHistoryEntry,
  CampInvitation,
  CampRole,
  CampStatus,
} from "@/app/hooks/useSilentCamp";
import type { AdventureId } from "@/lib/pomodoro";
import type {
  SilentCampChatMessage,
  SilentCampMember,
} from "@/lib/silent-camp";

export type CampCompanion = {
  id: AdventureId;
  friend: string;
  name: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  color: string;
};

type CampLobbyProps = {
  authenticated: boolean;
  chatMessages: SilentCampChatMessage[];
  code: string;
  companions: CampCompanion[];
  contacts: CampContact[];
  currentMemberId: string;
  focusMinutes: number;
  history: CampHistoryEntry[];
  invitations: CampInvitation[];
  leaderId: string | null;
  members: SilentCampMember[];
  message: string;
  nickname: string;
  role: CampRole;
  selectedId: AdventureId;
  status: CampStatus;
  onBack: () => void;
  onCodeChange: (value: string) => void;
  onCopyInvite: () => void;
  onCreate: () => void;
  onFocusMinutesChange: (minutes: number) => void;
  onJoin: (code?: string) => void;
  onLogin: () => void;
  onInviteContact: (userId: string) => Promise<boolean>;
  onLeave: () => void;
  onNicknameChange: (value: string) => void;
  onRemoveMember: (memberId: string, shouldBlock: boolean) => Promise<boolean>;
  onReopenCamp: (campId: string) => Promise<boolean>;
  onReportMember: (
    memberId: string,
    reason: "spam" | "harassment" | "privacy" | "other",
  ) => Promise<boolean>;
  onSelectCompanion: (id: AdventureId) => void;
  onSendChat: (message: string) => Promise<boolean>;
  onStart: () => void;
};

const focusOptions = [15, 25, 40, 50];
const partySize = 4;

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CampLobby({
  authenticated,
  chatMessages,
  code,
  companions,
  contacts,
  currentMemberId,
  focusMinutes,
  history,
  invitations,
  leaderId,
  members,
  message,
  nickname,
  role,
  selectedId,
  status,
  onBack,
  onCodeChange,
  onCopyInvite,
  onCreate,
  onFocusMinutesChange,
  onJoin,
  onLogin,
  onInviteContact,
  onLeave,
  onNicknameChange,
  onRemoveMember,
  onReopenCamp,
  onReportMember,
  onSelectCompanion,
  onSendChat,
  onStart,
}: CampLobbyProps) {
  const [chatDraft, setChatDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const selected = companions.find((item) => item.id === selectedId) ?? companions[0];
  const isJoined = status === "joined";
  const isConnecting = status === "connecting";
  const leader = members.find((member) => member.memberId === leaderId);
  const openSlots = Math.max(0, partySize - members.length);
  const shownFocusOptions = focusOptions.includes(focusMinutes)
    ? focusOptions
    : [focusMinutes, ...focusOptions];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatMessages]);

  useEffect(() => {
    if (isJoined) window.scrollTo({ top: 0, behavior: "auto" });
  }, [isJoined]);

  const submitChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onSendChat(chatDraft)) setChatDraft("");
  };

  return (
    <section
      className={`camp-lobby camp-lobby-${selectedId}`}
      style={{ "--camp-accent": selected.color } as React.CSSProperties}
    >
      <button className="back-button camp-back" type="button" onClick={onBack}>
        혼자 집중하기로 돌아가기
      </button>

      <div className="camp-lobby-heading">
        <div>
          <span className="camp-beta-badge">비공개 집중 캠프</span>
          <h1>친구와 함께 모험하기</h1>
          <p>각자 좋아하는 친구를 고르고, 같은 순간에 집중을 시작해요.</p>
        </div>
        {isJoined && (
          <div className="camp-room-code" aria-label={`캠프 코드 ${code}`}>
            <span>캠프 코드</span>
            <strong>{code}</strong>
            <button type="button" onClick={onCopyInvite}>초대 링크 복사</button>
          </div>
        )}
      </div>

      {!isJoined ? (
        <div className="camp-entry-layout">
          <div className="camp-entry-scene">
            <Image
              src={selected.image}
              alt={`${selected.friend} 캠프 참가 모습`}
              width={selected.imageWidth}
              height={selected.imageHeight}
              priority
              unoptimized
            />
            <div>
              <strong>{nickname || "모험가"}</strong>
              <span>{selected.friend} · {selected.name}</span>
            </div>
          </div>

          <div className="camp-entry-panel">
            <p className="camp-beta-notice">
              {authenticated
                ? "초대 멤버만 캠프에 연결돼요. 목표와 공부 자료는 공유되지 않으며, 대화에는 개인정보를 남기지 않는 것이 좋아요."
                : "캠프는 로그인한 초대 멤버끼리만 연결돼요. 먼저 로그인하면 새 캠프를 만들거나 받은 코드로 참가할 수 있어요."}
            </p>
            <label className="camp-field">
              <span>캠프에서 사용할 이름</span>
              <input
                maxLength={12}
                value={nickname}
                onChange={(event) => onNicknameChange(event.target.value)}
                placeholder="예: 호야"
              />
            </label>

            <fieldset className="camp-companion-picker">
              <legend>함께할 친구</legend>
              <div>
                {companions.map((companion) => (
                  <button
                    aria-pressed={selectedId === companion.id}
                    key={companion.id}
                    type="button"
                    onClick={() => onSelectCompanion(companion.id)}
                  >
                    <Image
                      src={companion.image}
                      alt=""
                      width={companion.imageWidth}
                      height={companion.imageHeight}
                      unoptimized
                    />
                    <span>{companion.friend}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {authenticated ? (
              <div className="camp-entry-actions">
                <button
                  className="camp-create-button"
                  disabled={isConnecting}
                  type="button"
                  onClick={onCreate}
                >
                  {isConnecting ? "캠프 여는 중…" : "새 캠프 만들기"}
                </button>
                <span>또는</span>
                <label className="camp-code-entry">
                  <span>받은 코드</span>
                  <input
                    inputMode="text"
                    maxLength={8}
                    value={code}
                    onChange={(event) => onCodeChange(event.target.value)}
                    placeholder="CAMP1234"
                  />
                  <button
                    disabled={isConnecting || code.length < 6}
                    type="button"
                    onClick={() => onJoin()}
                  >
                    {status === "error" ? "다시 연결" : "들어가기"}
                  </button>
                </label>
              </div>
            ) : (
              <div className="camp-entry-actions">
                <button className="camp-create-button" type="button" onClick={onLogin}>
                  로그인하고 캠프 시작
                </button>
                <small className="camp-connection-message">
                  받은 초대 코드는 로그인 뒤에도 그대로 유지돼요.
                </small>
              </div>
            )}
            <p className={`camp-connection-message status-${status}`} role="status">
              {message}
            </p>

            {(invitations.length > 0 || history.length > 0) && (
              <section className="camp-returning" aria-labelledby="camp-returning-title">
                <h2 id="camp-returning-title">다시 모일 수 있는 캠프</h2>
                {invitations.map((invitation) => (
                  <article key={invitation.campId}>
                    <div>
                      <strong>{invitation.inviterNickname}의 초대</strong>
                      <span>캠프 {invitation.code}</span>
                    </div>
                    <button type="button" onClick={() => onJoin(invitation.code)}>참가하기</button>
                  </article>
                ))}
                {history.slice(0, 3).map((entry) => (
                  <article key={entry.campId}>
                    <div>
                      <strong>{entry.memberCount}명이 함께한 {entry.durationMinutes}분</strong>
                      <span>{new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(entry.completedAt))}</span>
                    </div>
                    <button type="button" onClick={() => void onReopenCamp(entry.campId)}>다시 모이기</button>
                  </article>
                ))}
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="camp-room-layout">
          <div className="camp-party-area">
            <div className="camp-party-status">
              <div>
                <h2>{members.length}명의 모험가가 모였어요</h2>
                <p>{message}</p>
              </div>
              <button className="camp-leave-button" type="button" onClick={onLeave}>
                캠프 나가기
              </button>
            </div>

            <div className="camp-party-stage" aria-label="캠프 참가자">
              {members.map((member) => {
                const companion = companions.find((item) => item.id === member.adventureId) ?? companions[0];
                const isMe = member.memberId === currentMemberId;
                const isLeader = member.memberId === leaderId;
                return (
                  <article className={`camp-member ${isMe ? "is-me" : ""}`} key={member.memberId}>
                    <div className="camp-member-name">
                      <strong>{member.nickname}</strong>
                      <span>{isLeader ? "방장" : isMe ? "나" : "준비 중"}</span>
                    </div>
                    <Image
                      src={companion.image}
                      alt={`${member.nickname}의 ${companion.friend}`}
                      width={companion.imageWidth}
                      height={companion.imageHeight}
                      unoptimized
                    />
                    <small>{companion.friend}</small>
                    {role === "leader" && !isMe && (
                      <div className="camp-member-actions">
                        <button
                          type="button"
                          onClick={() => void onRemoveMember(member.memberId, false)}
                        >
                          내보내기
                        </button>
                        <button
                          type="button"
                          onClick={() => void onRemoveMember(member.memberId, true)}
                        >
                          차단
                        </button>
                      </div>
                    )}
                    {!isMe && (
                      <details className="camp-report-menu">
                        <summary>신고</summary>
                        <div>
                          <button type="button" onClick={() => void onReportMember(member.memberId, "spam")}>반복 메시지</button>
                          <button type="button" onClick={() => void onReportMember(member.memberId, "harassment")}>불쾌한 행동</button>
                          <button type="button" onClick={() => void onReportMember(member.memberId, "privacy")}>개인정보 문제</button>
                        </div>
                      </details>
                    )}
                  </article>
                );
              })}
              {Array.from({ length: openSlots }, (_, index) => (
                <div className="camp-empty-slot" key={`empty-${index}`}>
                  <span>친구를 기다리는 자리</span>
                </div>
              ))}
            </div>

            <div className="camp-ready-controls">
              <div className="camp-profile-controls">
                <label className="camp-field compact">
                  <span>내 이름</span>
                  <input
                    maxLength={12}
                    value={nickname}
                    onChange={(event) => onNicknameChange(event.target.value)}
                  />
                </label>
                <fieldset className="camp-companion-picker compact">
                  <legend>내 친구</legend>
                  <div>
                    {companions.map((companion) => (
                      <button
                        aria-label={`${companion.friend} 선택`}
                        aria-pressed={selectedId === companion.id}
                        key={companion.id}
                        type="button"
                        onClick={() => onSelectCompanion(companion.id)}
                      >
                        <Image
                          src={companion.image}
                          alt=""
                          width={companion.imageWidth}
                          height={companion.imageHeight}
                          unoptimized
                        />
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              {role === "leader" ? (
                <div className="camp-leader-controls">
                  <fieldset>
                    <legend>집중 시간</legend>
                    <div>
                      {shownFocusOptions.map((minutes) => (
                        <button
                          aria-pressed={focusMinutes === minutes}
                          key={minutes}
                          type="button"
                          onClick={() => onFocusMinutesChange(minutes)}
                        >
                          {minutes}분
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <button className="camp-start-button" type="button" onClick={onStart}>
                    함께 집중 시작
                    <strong>{focusMinutes}:00</strong>
                  </button>
                </div>
              ) : (
                <div className="camp-waiting-callout" role="status">
                  <strong>{leader?.nickname ?? "방장"}의 출발을 기다리고 있어요</strong>
                  <span>{leader?.focusMinutes ?? focusMinutes}분 집중으로 준비 중</span>
                </div>
              )}
            </div>
          </div>

          <aside className="camp-chat" aria-labelledby="camp-chat-title">
            <div className="camp-chat-heading">
              <h2 id="camp-chat-title">캠프 대화</h2>
              <span>접속 중에만 보여요</span>
            </div>
            <p className="camp-chat-safety">
              채팅은 저장되지 않아요. 불편한 행동은 참가자 카드에서 범주만 골라 신고할 수 있어요.
            </p>
            {role === "leader" && contacts.length > 0 && (
              <section className="camp-known-friends" aria-labelledby="camp-known-friends-title">
                <h3 id="camp-known-friends-title">함께했던 친구</h3>
                {contacts.slice(0, 4).map((contact) => (
                  <div key={contact.userId}>
                    <span><strong>{contact.nickname}</strong> · {contact.sessionsTogether}회</span>
                    <button type="button" onClick={() => void onInviteContact(contact.userId)}>초대</button>
                  </div>
                ))}
              </section>
            )}
            <div className="camp-chat-log" aria-live="polite">
              {chatMessages.length === 0 ? (
                <p>친구가 오면 짧게 인사를 건네 보세요.</p>
              ) : (
                chatMessages.map((chat) => (
                  <div
                    className={chat.senderId === currentMemberId ? "is-mine" : ""}
                    key={chat.id}
                  >
                    <span>{chat.nickname} · {formatChatTime(chat.sentAt)}</span>
                    <p>{chat.body}</p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="camp-chat-form" onSubmit={submitChat}>
              <label>
                <span className="sr-only">캠프 메시지</span>
                <input
                  maxLength={120}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder="응원이나 준비 상태를 알려주세요"
                />
              </label>
              <button disabled={!chatDraft.trim()} type="submit">보내기</button>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
