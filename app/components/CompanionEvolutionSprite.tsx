import type { AdventureId } from "@/lib/pomodoro";
import type { CompanionStage } from "@/lib/companion-growth";

const evolutionSheets: Record<AdventureId, string> = {
  hike: "/characters/evolution/mori-evolution-v1.webp",
  swim: "/characters/evolution/naru-evolution-v1.webp",
  fish: "/characters/evolution/bori-evolution-v1.webp",
};

type CompanionEvolutionSpriteProps = {
  adventureId: AdventureId;
  className?: string;
  friend: string;
  stage: CompanionStage;
};

export default function CompanionEvolutionSprite({
  adventureId,
  className = "",
  friend,
  stage,
}: CompanionEvolutionSpriteProps) {
  const positions = [0, 32.58, 65.15, 97.73] as const;
  const position = positions[stage - 1];

  return (
    <span
      aria-label={`${friend} 성장 ${stage}단계 모습`}
      className={`companion-evolution-sprite companion-evolution-${adventureId} companion-evolution-stage-${stage} ${className}`.trim()}
      role="img"
      style={{
        backgroundImage: `url(${evolutionSheets[adventureId]})`,
        backgroundPosition: `${position}% center`,
      }}
    />
  );
}
