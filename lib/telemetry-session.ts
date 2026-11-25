const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

export function telemetryStorageKeys(userId: string) {
  return {
    lastOpened: `focus-quest-telemetry-last-opened:${userId}`,
    reported: `focus-quest-telemetry-session-reported:${userId}`,
  };
}

export function isDormantReturn(previous: string | null, now: number) {
  if (!previous) return false;
  const timestamp = Number(previous);
  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp >= SEVEN_DAYS_MS;
}
