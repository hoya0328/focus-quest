export type ProductEventSnapshot = {
  event_name: string;
  user_id: string;
  created_at: string;
};

export type OperationsReport = {
  windowDays: number;
  events: number;
  uniqueUsers: number;
  counts: Record<string, number>;
  users: Record<string, number>;
  startRate: number | null;
  completionRate: number | null;
  clientErrorRate: number;
  alerts: string[];
};

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1_000) / 10 : null;
}

export function buildOperationsReport(
  events: ProductEventSnapshot[],
  windowDays = 30,
): OperationsReport {
  const counts: Record<string, number> = {};
  const userSets = new Map<string, Set<string>>();
  const allUsers = new Set<string>();
  for (const event of events) {
    if (!event.event_name || !event.user_id) continue;
    counts[event.event_name] = (counts[event.event_name] ?? 0) + 1;
    const users = userSets.get(event.event_name) ?? new Set<string>();
    users.add(event.user_id);
    userSets.set(event.event_name, users);
    allUsers.add(event.user_id);
  }
  const users = Object.fromEntries(
    [...userSets.entries()].map(([name, set]) => [name, set.size]),
  );
  const opens = users.app_opened ?? 0;
  const startedUsers = userSets.get("focus_started") ?? new Set<string>();
  const completedUsers = userSets.get("focus_completed") ?? new Set<string>();
  const openedUsers = userSets.get("app_opened") ?? new Set<string>();
  const starts = startedUsers.size;
  const startedAfterOpening = [...startedUsers].filter((id) => openedUsers.has(id)).length;
  const completed = [...completedUsers].filter((id) => startedUsers.has(id)).length;
  const errors = counts.client_error ?? 0;
  const clientErrorRate = events.length > 0
    ? Math.round((errors / events.length) * 10_000) / 100
    : 0;
  const startRate = rate(startedAfterOpening, opens);
  const completionRate = rate(completed, starts);
  const alerts: string[] = [];
  if (starts >= 5 && completionRate !== null && completionRate < 65) {
    alerts.push(`집중 완주율이 ${completionRate}%로 운영 기준 65%보다 낮아요.`);
  }
  if (events.length >= 20 && clientErrorRate > 2) {
    alerts.push(`클라이언트 오류 비중이 ${clientErrorRate}%로 확인 기준 2%를 넘었어요.`);
  }
  return {
    windowDays,
    events: events.length,
    uniqueUsers: allUsers.size,
    counts,
    users,
    startRate,
    completionRate,
    clientErrorRate,
    alerts,
  };
}

export type BackupManifest = {
  version: 1;
  createdAt: string;
  projectRef: string;
  files: Array<{ path: string; sha256: string; records: number }>;
};

export function validateBackupManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<BackupManifest>;
  return manifest.version === 1
    && typeof manifest.createdAt === "string"
    && !Number.isNaN(Date.parse(manifest.createdAt))
    && typeof manifest.projectRef === "string"
    && /^[a-z0-9]{20}$/.test(manifest.projectRef)
    && Array.isArray(manifest.files)
    && manifest.files.length > 0
    && new Set(manifest.files.map((file) => file?.path)).size === manifest.files.length
    && manifest.files.every((file) =>
      Boolean(file)
      && typeof file.path === "string"
      && /^tables\/[a-z][a-z0-9_]*\.json$/.test(file.path)
      && typeof file.sha256 === "string"
      && /^[a-f0-9]{64}$/.test(file.sha256)
      && Number.isInteger(file.records)
      && file.records >= 0,
    );
}
