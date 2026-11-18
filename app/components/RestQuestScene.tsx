"use client";

import { useEffect, useRef } from "react";
import type { AdventureId } from "@/lib/pomodoro";
import {
  clampWorldLevel,
  getWorldBackgroundKey,
  getWorldBackgroundPath,
  WORLD_LEVEL_MAX,
} from "@/lib/world-growth";

type RestQuestSceneProps = {
  kind: AdventureId;
  paused: boolean;
  worldLevel: number;
  assetBasePath?: string;
};

type RestSceneController = {
  setPaused: (value: boolean) => void;
  setWorldLevel: (value: number) => void;
};

const sceneAssets: Record<
  AdventureId,
  { companion: string; label: string }
> = {
  hike: {
    companion: "mori-rest.png",
    label: "모리가 해오름 봉우리 능선에서 따뜻한 차를 마시며 쉬는 장면",
  },
  swim: {
    companion: "naru-rest.png",
    label: "나루가 유리산호 유적의 기포 정원에서 쉬는 장면",
  },
  fish: {
    companion: "bori-rest.png",
    label: "보리가 달비늘 호수의 달빛 부두에서 차를 마시며 쉬는 장면",
  },
};

export default function RestQuestScene({
  kind,
  paused,
  worldLevel,
  assetBasePath = "",
}: RestQuestSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<RestSceneController | null>(null);
  const pausedRef = useRef(paused);
  const worldLevelRef = useRef(worldLevel);
  pausedRef.current = paused;
  worldLevelRef.current = worldLevel;

  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | null = null;

    async function mountGame() {
      const Phaser = await import("phaser");
      if (disposed || !mountRef.current) return;

      const assets = sceneAssets[kind];

      class RestScene extends Phaser.Scene implements RestSceneController {
        private backdropFill!: import("phaser").GameObjects.Image;
        private backdrop!: import("phaser").GameObjects.Image;
        private companion!: import("phaser").GameObjects.Image;
        private ambience: import("phaser").GameObjects.Arc[] = [];
        private companionBaseY = 0;
        private currentWorldLevel = 1;
        private isPaused = false;

        constructor() {
          super(`${kind}-rest`);
        }

        preload() {
          for (let level = 1; level <= WORLD_LEVEL_MAX; level += 1) {
            this.load.image(
              getWorldBackgroundKey(kind, level),
              `${assetBasePath}${getWorldBackgroundPath(kind, level)}`,
            );
          }
          this.load.image(
            "rest-companion",
            `${assetBasePath}/characters/${assets.companion}`,
          );
        }

        create() {
          this.backdropFill = this.add
            .image(0, 0, getWorldBackgroundKey(kind, this.currentWorldLevel))
            .setOrigin(0.5)
            .setDepth(-1)
            .setAlpha(0);
          this.backdrop = this.add
            .image(0, 0, getWorldBackgroundKey(kind, this.currentWorldLevel))
            .setOrigin(0.5)
            .setDepth(0);
          this.companion = this.add
            .image(0, 0, "rest-companion")
            .setOrigin(0.5)
            .setDepth(5);

          const ambienceColor =
            kind === "hike" ? 0xffd783 : kind === "swim" ? 0xa7f3ef : 0xffdf8a;
          const ambienceCount = kind === "swim" ? 12 : 9;

          for (let index = 0; index < ambienceCount; index += 1) {
            const mote = this.add
              .circle(0, 0, kind === "swim" ? 3 + (index % 3) : 2 + (index % 2), ambienceColor, 0.34)
              .setDepth(3);
            if (kind === "swim") {
              mote.setStrokeStyle(1, 0xe5fffb, 0.62).setFillStyle(0x9de8e9, 0.12);
            }
            this.ambience.push(mote);
            this.tweens.add({
              targets: mote,
              y: kind === "swim" ? `-=${90 + index * 6}` : `-=${16 + (index % 4) * 8}`,
              x: `+=${index % 2 === 0 ? 12 : -12}`,
              alpha: { from: 0.12, to: kind === "swim" ? 0.62 : 0.48 },
              duration: 2400 + index * 190,
              delay: index * 160,
              repeat: -1,
              yoyo: kind !== "swim",
              ease: "Sine.InOut",
            });
          }

          this.scale.on("resize", this.layoutScene, this);
          this.layoutScene();
          this.setWorldLevel(worldLevelRef.current);
          this.setPaused(pausedRef.current);
          controllerRef.current = this;
        }

        update(time: number) {
          if (this.isPaused || this.companionBaseY === 0) return;
          this.companion.setY(this.companionBaseY + Math.sin(time / 720) * 3);
          if (kind === "swim") {
            this.companion.setAngle(Math.sin(time / 1100) * 0.6);
          }
        }

        private layoutScene() {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 720;
          const shortLandscape = height < 560;
          const containScene = compact || shortLandscape;
          const topReserve = compact && !shortLandscape ? Math.max(58, height * 0.07) : 0;
          const availableHeight = height - topReserve;
          const fillScale = Math.max(
            width / this.backdropFill.frame.realWidth,
            height / this.backdropFill.frame.realHeight,
          );
          const backdropScale = containScene
            ? Math.min(
                width / this.backdrop.frame.realWidth,
                availableHeight / this.backdrop.frame.realHeight,
              )
            : Math.max(
                width / this.backdrop.frame.realWidth,
                height / this.backdrop.frame.realHeight,
              );

          this.backdropFill
            .setScale(fillScale)
            .setPosition(width / 2, height / 2)
            .setAlpha(compact && !shortLandscape ? 0.48 : 0);
          if (compact && !shortLandscape) {
            this.backdropFill.setTint(
              kind === "hike" ? 0x405043 : kind === "swim" ? 0x17465b : 0x242d4e,
            );
          } else {
            this.backdropFill.clearTint();
          }

          const displayHeight = this.backdrop.frame.realHeight * backdropScale;
          this.backdrop.setScale(backdropScale);
          this.backdrop.setPosition(
            width / 2,
            compact && !shortLandscape
              ? topReserve + displayHeight / 2
              : containScene
                ? topReserve + availableHeight / 2
                : height / 2,
          );

          const sceneWidth = this.backdrop.frame.realWidth * this.backdrop.scaleX;
          const sceneHeight = this.backdrop.frame.realHeight * this.backdrop.scaleY;
          const sceneLeft = this.backdrop.x - sceneWidth / 2;
          const sceneTop = this.backdrop.y - sceneHeight / 2;
          const companionWidth = compact
            ? Math.min(width * (kind === "fish" ? 0.68 : 0.52), 350)
            : Math.min(width * (kind === "fish" ? 0.3 : 0.24), height * 0.48);
          const companionRatio =
            this.companion.frame.realHeight / this.companion.frame.realWidth;

          this.companion.setDisplaySize(
            companionWidth,
            companionWidth * companionRatio,
          );

          const anchor = compact
            ? kind === "fish"
              ? { x: 0.38, y: 0.61 }
              : { x: 0.25, y: 0.62 }
            : kind === "hike"
              ? { x: 0.2, y: 0.69 }
              : kind === "swim"
                ? { x: 0.21, y: 0.69 }
                : { x: 0.22, y: 0.71 };

          this.companion.setPosition(
            sceneLeft + sceneWidth * anchor.x,
            sceneTop + sceneHeight * anchor.y,
          );
          this.companionBaseY = this.companion.y;

          this.ambience.forEach((mote, index) => {
            const xSeed = ((index * 0.173) % 0.76) + 0.08;
            const ySeed = ((index * 0.117) % 0.52) + 0.16;
            mote.setPosition(
              sceneLeft + sceneWidth * xSeed,
              sceneTop + sceneHeight * ySeed,
            );
            mote.setScale(Math.max(0.7, Math.min(1.35, backdropScale)));
          });
        }

        setWorldLevel(value: number) {
          const nextLevel = clampWorldLevel(value);
          this.currentWorldLevel = nextLevel;
          if (!this.backdrop || !this.backdropFill) return;

          const texture = getWorldBackgroundKey(kind, nextLevel);
          this.backdropFill.setTexture(texture);
          this.backdrop.setTexture(texture).setAlpha(0.35);
          this.tweens.add({
            targets: this.backdrop,
            alpha: 1,
            duration: 420,
            ease: "Sine.Out",
          });
          this.ambience.forEach((mote, index) => {
            mote.setVisible(index < Math.min(this.ambience.length, 3 + nextLevel * 2));
          });
          this.layoutScene();
        }

        setPaused(value: boolean) {
          if (this.isPaused === value) return;
          this.isPaused = value;
          if (value) this.tweens.pauseAll();
          else this.tweens.resumeAll();
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: mountRef.current,
        width: mountRef.current.clientWidth || 1200,
        height: mountRef.current.clientHeight || 700,
        backgroundColor: kind === "hike" ? "#16261d" : kind === "swim" ? "#07334a" : "#081b36",
        transparent: false,
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
          powerPreference: "high-performance",
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: "100%",
          height: "100%",
        },
        scene: RestScene,
        audio: { noAudio: true },
      });
    }

    void mountGame();
    return () => {
      disposed = true;
      controllerRef.current = null;
      game?.destroy(true);
    };
  }, [assetBasePath, kind]);

  useEffect(() => controllerRef.current?.setPaused(paused), [paused]);
  useEffect(
    () => controllerRef.current?.setWorldLevel(worldLevel),
    [worldLevel],
  );

  return (
    <div
      ref={mountRef}
      className={`phaser-rest-scene phaser-rest-scene-${kind}`}
      role="img"
      aria-label={sceneAssets[kind].label}
    />
  );
}
