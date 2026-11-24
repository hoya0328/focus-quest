export const VAPID_PUBLIC_KEY =
  "BH1xACLUSGeZP2oG3LACS6hP6t1zsLlan8Ql45Gcc8FmThx3SmIx3a7PdltKi0u7wSoK7fyzu4iYPzfvmIwS0Sw";

export type PushSubscriptionBody = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function nextReminderAt(time: string, now = new Date()) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function parsePushSubscription(value: PushSubscription | null) {
  if (!value) return null;
  const json = value.toJSON();
  if (
    typeof json.endpoint !== "string" ||
    typeof json.keys?.auth !== "string" ||
    typeof json.keys?.p256dh !== "string"
  ) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
  } satisfies PushSubscriptionBody;
}
