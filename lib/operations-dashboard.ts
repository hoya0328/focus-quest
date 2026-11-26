import { buildOperationsReport, type ProductEventSnapshot } from "./operations.ts";

export type DashboardEvent = ProductEventSnapshot & {
  adventure_id: string | null;
  duration_minutes: number | null;
};

const ADVENTURES = ["hike", "swim", "fish"] as const;
const DAY = 86_400_000;
const KST_OFFSET = 9 * 60 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function operatorIds(value = "") {
  return new Set(value.split(",").map((id) => id.trim().toLowerCase()).filter((id) => UUID.test(id)));
}

function koreanDate(timestamp: number) {
  return new Date(timestamp + KST_OFFSET).toISOString().slice(0, 10);
}

/** Counts received product signals, not authoritative study sessions or cohort retention. */
export function buildDashboard(events: DashboardEvent[], days: 7 | 30, now: Date) {
  const today = koreanDate(now.getTime());
  const daily = Array.from({ length: days }, (_, index) => ({
    date: koreanDate(now.getTime() - (days - index - 1) * DAY),
    opened: 0, started: 0, completed: 0, abandoned: 0,
  }));
  const dailyMap = new Map(daily.map((row) => [row.date, row]));
  const companions = ADVENTURES.map((adventureId) => ({ adventureId, selected: 0, started: 0, completed: 0 }));
  const periodStart = `${daily[0].date}T00:00:00+09:00`;
  const filtered = events.filter((event) => {
    const time = Date.parse(event.created_at);
    return Number.isFinite(time) && time >= Date.parse(periodStart) && time <= now.getTime();
  });
  for (const event of filtered) {
    const day = dailyMap.get(koreanDate(Date.parse(event.created_at)));
    if (day) {
      if (event.event_name === "app_opened") day.opened++;
      if (event.event_name === "focus_started") day.started++;
      if (event.event_name === "focus_completed") day.completed++;
      if (event.event_name === "focus_abandoned") day.abandoned++;
    }
    const companion = companions.find((row) => row.adventureId === event.adventure_id);
    if (companion) {
      if (event.event_name === "companion_selected") companion.selected++;
      if (event.event_name === "focus_started") companion.started++;
      if (event.event_name === "focus_completed") companion.completed++;
    }
  }
  return {
    generatedAt: now.toISOString(),
    period: { days, since: new Date(periodStart).toISOString(), until: now.toISOString(), timezone: "Asia/Seoul" },
    audience: "authenticated-users-only" as const,
    summary: buildOperationsReport(filtered, days),
    daily,
    companions,
    today,
  };
}

export type OperationsDashboard = ReturnType<typeof buildDashboard>;

type Dependencies = {
  configured: boolean;
  allowedIds: Set<string>;
  authenticate: (token: string) => Promise<string | null>;
  loadEvents: (since: string, until: string) => Promise<DashboardEvent[]>;
  now?: () => Date;
};

/** Server-side allowlist is authoritative; user-editable profile metadata is never trusted. */
export function createOperationsEndpoint(deps: Dependencies) {
  return async (request: Request) => {
    const headers = {
      "Cache-Control": "private, no-store",
      "Vary": "Authorization",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
    };
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return respond({ error: "허용되지 않은 요청입니다." }, 403);
    const match = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get("authorization") ?? "");
    if (!match) return respond({ error: "Focus Quest에서 로그인한 뒤 다시 열어 주세요." }, 401);
    if (!deps.configured || deps.allowedIds.size === 0) return respond({ error: "운영자 통계 설정을 확인해 주세요." }, 503);
    try {
      const userId = await deps.authenticate(match[1]);
      if (!userId) return respond({ error: "로그인이 만료되었습니다. 다시 로그인해 주세요." }, 401);
      if (!deps.allowedIds.has(userId.toLowerCase())) return respond({ error: "운영자만 볼 수 있는 화면입니다." }, 403);
      const daysParam = new URL(request.url).searchParams.get("days") ?? "7";
      if (daysParam !== "7" && daysParam !== "30") return respond({ error: "기간은 7일 또는 30일로 선택해 주세요." }, 400);
      const days = Number(daysParam) as 7 | 30;
      const now = deps.now?.() ?? new Date();
      const empty = buildDashboard([], days, now);
      const events = await deps.loadEvents(empty.period.since, empty.period.until);
      return respond(buildDashboard(events, days, now));
    } catch {
      // Do not return upstream errors, account IDs, credentials or raw event rows.
      return respond({ error: "통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
    }
  };
}
