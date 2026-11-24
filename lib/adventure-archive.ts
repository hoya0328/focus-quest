import type { AdventureId, FocusRecord } from "./pomodoro.ts";

export type ArchiveRelic = {
  id: string;
  name: string;
  description: string;
  requiredCompletions: number;
  unlocked: boolean;
};

export type AdventureArchive = {
  adventureId: AdventureId;
  completed: number;
  masteryRank: number;
  masteryLabel: string;
  relics: ArchiveRelic[];
  unlockedRelics: number;
  nextRelic: ArchiveRelic | null;
};

const archiveRelics: Record<AdventureId, readonly Omit<ArchiveRelic, "unlocked">[]> = {
  hike: [
    { id: "hike-sun-compass", name: "햇살 나침반", description: "안개 속에서도 정상의 방향을 알려줘요.", requiredCompletions: 125 },
    { id: "hike-cloud-bell", name: "구름 종", description: "능선에 바람이 불면 맑은 소리를 내요.", requiredCompletions: 175 },
    { id: "hike-ancient-map", name: "오래된 능선 지도", description: "지금은 사라진 숲길이 그려져 있어요.", requiredCompletions: 250 },
    { id: "hike-dawn-emblem", name: "해오름 문장", description: "수백 번 정상을 찾은 모험가에게 남는 표식이에요.", requiredCompletions: 400 },
  ],
  swim: [
    { id: "swim-pearl-lens", name: "진주 렌즈", description: "어두운 유적의 글자를 또렷하게 비춰요.", requiredCompletions: 125 },
    { id: "swim-coral-key", name: "산호 열쇠", description: "잠든 정원의 작은 문을 열 수 있어요.", requiredCompletions: 175 },
    { id: "swim-tide-atlas", name: "조류 도감", description: "유적을 지나는 물길의 기억이 담겨 있어요.", requiredCompletions: 250 },
    { id: "swim-sanctuary-emblem", name: "성소의 문장", description: "유리산호 성소가 오래된 친구에게 건네는 표식이에요.", requiredCompletions: 400 },
  ],
  fish: [
    { id: "fish-moon-float", name: "달빛 찌", description: "잔잔한 밤에도 물결의 신호를 놓치지 않아요.", requiredCompletions: 125 },
    { id: "fish-lake-lure", name: "호수의 은빛 루어", description: "달비늘 호수의 오래된 낚시꾼이 남겼어요.", requiredCompletions: 175 },
    { id: "fish-carp-scale", name: "황금 비늘", description: "전설의 잉어가 한 번만 허락한 반짝임이에요.", requiredCompletions: 250 },
    { id: "fish-moon-emblem", name: "달비늘 문장", description: "호수의 사계절을 지켜본 모험가의 표식이에요.", requiredCompletions: 400 },
  ],
};

const masteryLabels = ["길을 잇는 사람", "풍경의 기록자", "세계의 벗", "오래된 수호자"] as const;

export function getAdventureArchive(
  history: FocusRecord[],
  adventureId: AdventureId,
): AdventureArchive {
  const completed = history.filter(
    (record) => record.adventureId === adventureId && record.durationMinutes >= 10,
  ).length;
  const masteryRank = completed < 100 ? 0 : Math.floor((completed - 100) / 50) + 1;
  const relics = archiveRelics[adventureId].map((relic) => ({
    ...relic,
    unlocked: completed >= relic.requiredCompletions,
  }));
  const unlockedRelics = relics.filter((relic) => relic.unlocked).length;
  return {
    adventureId,
    completed,
    masteryRank,
    masteryLabel: masteryRank === 0
      ? "월드 복원 중"
      : masteryLabels[Math.min(masteryLabels.length - 1, masteryRank - 1)],
    relics,
    unlockedRelics,
    nextRelic: relics.find((relic) => !relic.unlocked) ?? null,
  };
}

export function getNextMasteryTarget(completed: number) {
  if (completed < 100) return 100;
  return 100 + (Math.floor((completed - 100) / 50) + 1) * 50;
}
