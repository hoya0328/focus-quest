import type { AdventureId } from "./pomodoro.ts";

export type SeasonalWorldEvent = {
  id: string;
  name: string;
  description: string;
  ambientLabel: string;
  particleColor: number;
};

const seasonalEvents: Record<AdventureId, readonly SeasonalWorldEvent[]> = {
  hike: [
    { id: "hike-spring", name: "새순 바람", description: "연둣빛 잎이 능선을 따라 깨어나는 계절이에요.", ambientLabel: "새잎이 바람을 타고 있어요", particleColor: 0xa8d36f },
    { id: "hike-summer", name: "긴 해의 숲", description: "해가 오래 머물고 깊은 숲에 반딧불이 모여요.", ambientLabel: "숲의 빛이 길게 머물러요", particleColor: 0xf0cf68 },
    { id: "hike-autumn", name: "단풍 능선", description: "붉고 금빛인 잎이 정상으로 가는 길을 표시해요.", ambientLabel: "단풍이 길 위를 지나가요", particleColor: 0xe18b4a },
    { id: "hike-winter", name: "첫눈 봉우리", description: "조용한 눈발 사이로 정상의 깃발이 더 선명해져요.", ambientLabel: "가벼운 눈이 내리고 있어요", particleColor: 0xd9f0ef },
  ],
  swim: [
    { id: "swim-spring", name: "산호의 산란", description: "작은 산호빛 입자가 유적의 물길을 따라 흘러요.", ambientLabel: "산호빛이 떠오르고 있어요", particleColor: 0xf0a7b7 },
    { id: "swim-summer", name: "유성해파리 밤", description: "푸른 해파리 무리가 성소 위를 천천히 지나가요.", ambientLabel: "해파리 불빛이 이동하고 있어요", particleColor: 0x83e4e3 },
    { id: "swim-autumn", name: "금빛 조류", description: "낮은 햇빛이 물결을 타고 유적 안쪽까지 닿아요.", ambientLabel: "금빛 조류가 유적을 감싸요", particleColor: 0xe7c36a },
    { id: "swim-winter", name: "심해의 별", description: "맑고 차가운 물에서 작은 발광 생물이 별처럼 보여요.", ambientLabel: "작은 심해 별이 반짝여요", particleColor: 0xc8e8ff },
  ],
  fish: [
    { id: "fish-spring", name: "꽃잎 수면", description: "호숫가 꽃잎이 잔물결을 따라 부두 곁으로 모여요.", ambientLabel: "꽃잎이 수면을 건너와요", particleColor: 0xf1b3ba },
    { id: "fish-summer", name: "반딧불 밤낚시", description: "따뜻한 밤공기에 반딧불이 더 오래 머물러요.", ambientLabel: "반딧불이 찌 주변에 모여요", particleColor: 0xffdd72 },
    { id: "fish-autumn", name: "달비늘 만월", description: "높은 달빛이 수면을 넓게 비추는 낚시철이에요.", ambientLabel: "만월이 물결 위에 번져요", particleColor: 0xf5d18a },
    { id: "fish-winter", name: "얼음꽃 물결", description: "차가운 공기가 호숫가에 얇고 반짝이는 무늬를 남겨요.", ambientLabel: "얼음꽃이 물가에 피었어요", particleColor: 0xb9e6e8 },
  ],
};

export function getSeasonIndex(date: Date | number | string = new Date()) {
  const month = new Date(date).getMonth();
  if (month >= 2 && month <= 4) return 0;
  if (month >= 5 && month <= 7) return 1;
  if (month >= 8 && month <= 10) return 2;
  return 3;
}

export function getSeasonalWorldEvent(
  adventureId: AdventureId,
  date: Date | number | string = new Date(),
) {
  return seasonalEvents[adventureId][getSeasonIndex(date)];
}
