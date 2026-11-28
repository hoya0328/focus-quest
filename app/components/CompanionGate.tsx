import type { CSSProperties, KeyboardEvent } from "react";
import Image from "next/image";
import CompanionEvolutionSprite from "@/app/components/CompanionEvolutionSprite";
import { getCompanionGrowth, type CompanionGrowthEntry } from "@/lib/companion-growth";
import { QUICK_START_RHYTHM, type AdventureId } from "@/lib/pomodoro";

type CompanionChoice = {
  id: AdventureId;
  name: string;
  friend: string;
  role: string;
  tagline: string;
  color: string;
};

type CompanionGateProps = {
  choices: readonly CompanionChoice[];
  selected: CompanionChoice;
  growth: CompanionGrowthEntry[];
  assetBasePath: string;
  ready: boolean;
  onChoose: (id: AdventureId) => void;
  onStart: () => void;
  onCustomize: () => void;
};

export default function CompanionGate({
  choices,
  selected,
  growth,
  assetBasePath,
  ready,
  onChoose,
  onStart,
  onCustomize,
}: CompanionGateProps) {
  const { focusMinutes, breakMinutes } = QUICK_START_RHYTHM;

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % choices.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + choices.length) % choices.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = choices.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const id = choices[next].id;
    const group = event.currentTarget.closest('[role="radiogroup"]');
    onChoose(id);
    group?.querySelector<HTMLButtonElement>(`[data-companion-id="${id}"]`)?.focus();
  }

  return (
    <section className="companion-gate" aria-labelledby="companion-gate-title">
      <header className="companion-gate-copy">
        <h1 id="companion-gate-title">누구와 집중할까요?</h1>
        <p>동료를 골라 첫 {focusMinutes}분을 시작해요.</p>
      </header>

      <div className="companion-choice-grid" role="radiogroup" aria-label="함께 공부할 친구">
        {choices.map((choice, index) => {
          const active = selected.id === choice.id;
          const preview = `${assetBasePath}/previews/${choice.id}`;
          return (
            <button
              aria-checked={active}
              className={`companion-choice theme-${choice.id}${active ? " is-active" : ""}`}
              data-companion-id={choice.id}
              key={choice.id}
              onClick={() => onChoose(choice.id)}
              onKeyDown={(event) => moveSelection(event, index)}
              role="radio"
              style={{ "--choice-accent": choice.color } as CSSProperties}
              tabIndex={active ? 0 : -1}
              type="button"
            >
              <span className="companion-choice-world" aria-hidden="true">
                <picture>
                  <source media="(max-width: 48rem)" srcSet={`${preview}-landscape-small.webp`} />
                  <Image
                    alt=""
                    className="companion-choice-backdrop"
                    fetchPriority={index === 0 ? "high" : "auto"}
                    height={360}
                    loading="eager"
                    src={`${preview}-landscape.webp`}
                    unoptimized
                    width={640}
                  />
                </picture>
                <CompanionEvolutionSprite
                  adventureId={choice.id}
                  assetBasePath={assetBasePath}
                  className="companion-choice-character"
                  friend={choice.friend}
                  rendition="preview"
                  stage={getCompanionGrowth(growth, choice.id).stage}
                />
              </span>
              <span className="companion-choice-copy">
                <small>{choice.role}</small>
                <strong>{choice.friend}</strong>
                <span>{choice.name}</span>
                <span className="companion-choice-description">{choice.tagline}</span>
              </span>
              {active && <span className="companion-choice-mark" aria-hidden="true">선택됨</span>}
            </button>
          );
        })}
      </div>

      <footer className="companion-gate-action">
        <div className="companion-gate-selection">
          <strong>{selected.friend} · {selected.name}</strong>
          <span>{focusMinutes}분 집중 · {breakMinutes}분 휴식</span>
        </div>
        <div className="companion-gate-buttons">
          <button className="companion-quick-start" disabled={!ready} onClick={onStart} type="button">
            {selected.friend}와 {focusMinutes}분 시작
          </button>
          <button className="companion-customize" disabled={!ready} onClick={onCustomize} type="button">
            시간·음악 설정
          </button>
        </div>
      </footer>
    </section>
  );
}
