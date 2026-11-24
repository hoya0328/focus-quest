import test from "node:test";
import assert from "node:assert/strict";

import {
  createCampCode,
  createCampInviteUrl,
  createLocalCampSession,
  createSecureCampCode,
  electSilentCampLeader,
  normalizeCampChatMessage,
  normalizeCampCode,
  normalizeCampNickname,
  parseSilentCampChatMessage,
  parseSilentCampMember,
  parseSilentCampResumeState,
  parseSilentCampTimer,
  readCampCodeFromUrl,
  toSilentCampTimer,
} from "../lib/silent-camp.ts";
import { createActiveSession } from "../lib/pomodoro.ts";

test("camp links use a bounded uppercase room code", () => {
  assert.equal(normalizeCampCode(" ab-cd_1234 "), "ABCD1234");
  assert.match(createCampCode(() => 0.5), /^[A-Z0-9]{8}$/);
  assert.match(createSecureCampCode(), /^[A-HJ-NP-Z2-9]{8}$/);

  const invite = createCampInviteUrl(
    "https://focus.example/?camp=LEGACY#view=lobby",
    "ABCD2345",
  );
  assert.equal(new URL(invite).searchParams.has("camp"), false);
  assert.equal(readCampCodeFromUrl(invite), "ABCD2345");
  assert.equal(
    readCampCodeFromUrl("https://focus.example/?camp=OLD12345"),
    "OLD12345",
  );
});

test("the earliest valid presence member becomes leader", () => {
  assert.equal(
    electSilentCampLeader([
      { memberId: "later", joinedAt: "2026-11-13T10:01:00.000Z" },
      { memberId: "first", joinedAt: "2026-11-13T10:00:00.000Z" },
    ]),
    "first",
  );
  assert.equal(
    electSilentCampLeader(
      [
        { memberId: "later", joinedAt: "2026-11-13T10:01:00.000Z" },
        { memberId: "first", joinedAt: "2026-11-13T10:00:00.000Z" },
      ],
      "later",
    ),
    "later",
  );
});

test("camp profiles and chat are bounded before realtime use", () => {
  assert.equal(normalizeCampNickname("  긴   모험가 이름입니다  "), "긴 모험가 이름입니다");
  assert.equal(normalizeCampChatMessage("  같이   시작해요  "), "같이 시작해요");
  assert.deepEqual(
    parseSilentCampMember({
      memberId: "member-1",
      joinedAt: "2026-11-13T10:00:00.000Z",
      nickname: "호야",
      adventureId: "fish",
      focusMinutes: 25,
    }),
    {
      memberId: "member-1",
      joinedAt: "2026-11-13T10:00:00.000Z",
      nickname: "호야",
      adventureId: "fish",
      focusMinutes: 25,
    },
  );
  assert.equal(
    parseSilentCampChatMessage({
      id: "message-1",
      senderId: "member-1",
      nickname: "호야",
      body: "   ",
      sentAt: "2026-11-13T10:00:00.000Z",
    }),
    null,
  );
});

test("camp reconnect state restores only bounded session identity", () => {
  const restored = parseSilentCampResumeState({
    version: 1,
    code: " abcd-2345 ",
    memberId: "member-1",
    joinedAt: "2026-11-13T10:00:00.000Z",
    chatMessages: ["must not persist"],
  });

  assert.deepEqual(restored, {
    version: 1,
    code: "ABCD2345",
    memberId: "member-1",
    joinedAt: "2026-11-13T10:00:00.000Z",
  });
  assert.equal(parseSilentCampResumeState({ ...restored, code: "BAD" }), null);
  assert.equal(
    parseSilentCampResumeState({ ...restored, memberId: "x".repeat(65) }),
    null,
  );
});

test("camp timer payload excludes private quest data and restores local time", () => {
  const session = createActiveSession({
    mode: "focus",
    durationMinutes: 25,
    adventureId: "swim",
    bgm: "waves",
    questId: "private-quest",
    focusIntent: "private study goal",
    now: 1_000,
  });
  const payload = toSilentCampTimer(session);
  const parsed = parseSilentCampTimer(payload);

  assert.ok(parsed);
  assert.equal("questId" in payload, false);
  assert.equal("focusIntent" in payload, false);
  assert.equal(createLocalCampSession(parsed, 2_000).focusIntent, "친구와 함께 집중");
  assert.equal(
    createLocalCampSession(parsed, 2_000, "fish", "lake").adventureId,
    "fish",
  );
  assert.equal(
    createLocalCampSession(
      { ...parsed, remainingSeconds: 30, endAt: 9_999_999_999_999 },
      2_000,
    ).remainingSeconds,
    30,
  );
  assert.equal(parseSilentCampTimer({ ...payload, durationMinutes: 999 }), null);
  assert.equal(
    parseSilentCampTimer({ ...payload, durationMinutes: 1, remainingSeconds: 120 }),
    null,
  );
});
