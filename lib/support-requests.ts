export const SUPPORT_NOTICE_VERSION = "2026-11-26.1";
export const SUPPORT_MAX_LENGTH = 3000;
export const SUPPORT_CATEGORIES = { bug: "버그 신고", suggestion: "개선 제안", question: "기타 문의" } as const;
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;
export type SupportStatus = "open" | "closed";
export type SupportSubmission = { id: string; category: SupportCategory; message: string; noticeVersion: string };
export type SupportTicket = { id: string; category: SupportCategory; message: string; status: SupportStatus; created_at: string; reviewed_at: string | null };
export type SupportPage = { tickets: SupportTicket[]; nextCursor: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSupportSubmission(value: unknown): SupportSubmission | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || !UUID.test(data.id) || typeof data.category !== "string"
    || !Object.hasOwn(SUPPORT_CATEGORIES, data.category) || typeof data.message !== "string"
    || data.consent !== true || data.noticeVersion !== SUPPORT_NOTICE_VERSION || data.website) return null;
  const message = data.message.trim();
  if ([...message].length < 10 || message.length > SUPPORT_MAX_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(message)) return null;
  return { id: data.id, category: data.category as SupportCategory, message, noticeVersion: SUPPORT_NOTICE_VERSION };
}

export function parseSupportCursor(cursor: string | null) {
  if (!cursor) return null;
  const [at, id, extra] = cursor.split(",");
  if (extra !== undefined || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || !UUID.test(id ?? "")) return undefined;
  return { at, id };
}

/** Keep request bodies bounded even when Content-Length is absent or forged. */
async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("invalid_body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new Error("invalid_body");
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

type Dependencies = {
  configured: boolean;
  allowedIds: Set<string>;
  authenticate: (token: string) => Promise<string | null>;
  submit: (submission: SupportSubmission, request: Request) => Promise<"saved" | "limited" | "conflict">;
  list: (cursor: ReturnType<typeof parseSupportCursor>) => Promise<SupportPage>;
  update: (id: string, status: SupportStatus) => Promise<boolean>;
};

/** Public intake and private inbox share no client-trusted account/administrator fields. */
export function createSupportEndpoint(deps: Dependencies) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
    const origin = request.headers.get("origin");
    const write = request.method === "POST" || request.method === "PATCH";
    if ((write && origin !== new URL(request.url).origin) || (origin && origin !== new URL(request.url).origin)
      || request.headers.get("sec-fetch-site") === "cross-site") return respond({ error: "허용되지 않은 요청입니다." }, 403);
    if (!["GET", "POST", "PATCH"].includes(request.method)) return respond({ error: "허용되지 않은 요청입니다." }, 405);
    const bearer = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get("authorization") ?? "");
    if (request.method !== "POST" && !bearer) return respond({ error: "운영자 계정으로 로그인해 주세요." }, 401);
    if (!deps.configured) return respond({ error: "지금은 문의함에 연결할 수 없어요. 잠시 후 다시 보내 주세요." }, 503);
    try {
      if (request.method === "POST") {
        let submission;
        try { submission = parseSupportSubmission(await readJson(request)); }
        catch (error) { return respond({ error: "내용을 10~3,000자 이내로 작성하고 다시 보내 주세요." }, error instanceof Error && error.message === "body_too_large" ? 413 : 400); }
        if (!submission) return respond({ error: "내용과 보관 동의를 확인해 주세요. 내용은 10~3,000자까지 보낼 수 있어요." }, 400);
        const result = await deps.submit(submission, request);
        if (result === "limited") return Response.json({ error: "잠시 동안 접수가 많았어요. 한 시간 뒤 다시 보내 주세요." }, { status: 429, headers: { ...headers, "Retry-After": "3600" } });
        if (result === "conflict") return respond({ error: "접수 정보를 확인할 수 없어요. 내용을 수정한 뒤 다시 보내 주세요." }, 409);
        return respond({ id: submission.id, message: "운영자 문의함에 전달했어요." });
      }
      const userId = await deps.authenticate(bearer![1]);
      if (!userId) return respond({ error: "로그인이 만료되었습니다. 다시 로그인해 주세요." }, 401);
      if (!deps.allowedIds.has(userId.toLowerCase())) return respond({ error: "운영자만 볼 수 있는 문의함입니다." }, 403);
      if (request.method === "GET") {
        const url = new URL(request.url);
        if (url.searchParams.get("access") === "1") return respond({ allowed: true });
        const cursor = parseSupportCursor(url.searchParams.get("cursor"));
        if (cursor === undefined) return respond({ error: "목록 위치를 확인해 주세요." }, 400);
        return respond(await deps.list(cursor));
      }
      let data;
      try { data = await readJson(request); } catch { return respond({ error: "처리 상태를 확인해 주세요." }, 400); }
      if (!data || typeof data.id !== "string" || !UUID.test(data.id) || !["open", "closed"].includes(data.status)) return respond({ error: "처리 상태를 확인해 주세요." }, 400);
      return await deps.update(data.id, data.status) ? respond({ updated: true }) : respond({ error: "이미 삭제되었거나 보관 기간이 지난 문의입니다." }, 404);
    } catch {
      // Never echo database errors, submitted text, account identifiers or server credentials.
      return respond({ error: "문의함에 연결하지 못했어요. 작성한 내용은 그대로 두고 잠시 후 다시 시도해 주세요." }, 503);
    }
  };
}
