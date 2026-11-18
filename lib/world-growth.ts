import type { AdventureId } from "./pomodoro.ts";

export const WORLD_LEVEL_MIN = 1;
export const WORLD_LEVEL_MAX = 5;

const baseBackgrounds: Record<AdventureId, string> = {
  hike: "hike-pixel-summit-v1.png",
  swim: "swim-pixel-depth.png",
  fish: "fish-pixel-lake-v1.png",
};

export function clampWorldLevel(level: number): number {
  if (!Number.isFinite(level)) return WORLD_LEVEL_MIN;
  return Math.min(
    WORLD_LEVEL_MAX,
    Math.max(WORLD_LEVEL_MIN, Math.round(level)),
  );
}

export function getWorldBackgroundKey(
  adventureId: AdventureId,
  level: number,
): string {
  return `world-${adventureId}-${clampWorldLevel(level)}`;
}

export function getWorldBackgroundPath(
  adventureId: AdventureId,
  level: number,
): string {
  const normalizedLevel = clampWorldLevel(level);
  return normalizedLevel === WORLD_LEVEL_MIN
    ? `/backgrounds/${baseBackgrounds[adventureId]}`
    : `/backgrounds/world-stages/${adventureId}-stage-${normalizedLevel}.webp`;
}
