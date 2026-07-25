"use client";

import { useEffect, useRef } from "react";

type SceneKind = "hike" | "swim";

type AdventureQuestSceneProps = {
  kind: SceneKind;
  progress: number;
  paused: boolean;
  celebrating: boolean;
  assetBasePath?: string;
};

type SceneController = {
  setProgress: (value: number) => void;
  setPaused: (value: boolean) => void;
  setCelebrating: (value: boolean) => void;
};

export default function AdventureQuestScene({
  kind,
  progress,
  paused,
  celebrating,
  assetBasePath = "",
}: AdventureQuestSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const latestRef = useRef({ progress, paused, celebrating });
  latestRef.current = { progress, paused, celebrating };

  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | null = null;

    async function mountGame() {
      const Phaser = await import("phaser");
      if (disposed || !mountRef.current) return;

      class AdventureScene extends Phaser.Scene implements SceneController {
        private backdrop!: import("phaser").GameObjects.Graphics;
        private hero!: import("phaser").GameObjects.Sprite;
        private goal!: import("phaser").GameObjects.Container;
        private reward!: import("phaser").GameObjects.Arc;
        private successLabel!: import("phaser").GameObjects.Text;
        private ambient: import("phaser").GameObjects.Arc[] = [];
        private currentProgress = 0;
        private isPaused = false;
        private isCelebrating = false;

        constructor() {
          super(`${kind}-quest`);
        }

        preload() {
          const sheet =
            kind === "hike" ? "momo-walk-phaser.png" : "podo-swim-phaser.png";
          this.load.spritesheet("quest-hero", `${assetBasePath}/sprites/${sheet}`, {
            frameWidth: kind === "hike" ? 360 : 420,
            frameHeight: kind === "hike" ? 360 : 340,
          });
        }

        create() {
          this.backdrop = this.add.graphics().setDepth(0);

          for (let index = 0; index < (kind === "hike" ? 13 : 16); index += 1) {
            const particle = this.add.circle(
              0,
              0,
              kind === "hike" ? 3 + (index % 3) : 3 + (index % 4),
              kind === "hike" ? 0xe5ad4d : 0x9ee8e0,
              0.42,
            );
            particle.setDepth(7);
            this.ambient.push(particle);
            this.tweens.add({
              targets: particle,
              x: kind === "hike" ? `+=${35 + (index % 4) * 12}` : `+=${8 + (index % 3) * 5}`,
              y: kind === "hike" ? `+=${65 + (index % 5) * 15}` : `-=${75 + (index % 5) * 18}`,
              alpha: { from: 0.18, to: 0.72 },
              duration: 2200 + index * 145,
              delay: index * 90,
              repeat: -1,
              yoyo: true,
              ease: "Sine.InOut",
            });
          }

          this.anims.create({
            key: `${kind}-motion`,
            frames: this.anims.generateFrameNumbers("quest-hero", { start: 0, end: 7 }),
            frameRate: kind === "hike" ? 8.5 : 7.5,
            repeat: -1,
          });

          this.hero = this.add.sprite(0, 0, "quest-hero", 0);
          this.hero.setDepth(12);
          this.hero.play(`${kind}-motion`);

          const goalGraphics = this.add.graphics();
          if (kind === "hike") {
            goalGraphics.fillStyle(0x173b31, 1);
            goalGraphics.fillTriangle(-68, 58, 0, -12, 75, 58);
            goalGraphics.fillStyle(0xf7dda0, 1);
            goalGraphics.fillRect(0, -80, 6, 102);
            goalGraphics.fillStyle(0xef784e, 1);
            goalGraphics.fillTriangle(6, -78, 70, -58, 6, -39);
          } else {
            goalGraphics.fillStyle(0x563623, 1);
            goalGraphics.fillRect(-54, -12, 108, 60);
            goalGraphics.fillStyle(0xd49332, 1);
            goalGraphics.fillRect(-48, -5, 96, 17);
            goalGraphics.fillStyle(0x7b4a25, 1);
            goalGraphics.fillRoundedRect(-57, -43, 114, 38, 9);
            goalGraphics.lineStyle(5, 0xf0ba4c, 1);
            goalGraphics.strokeRoundedRect(-57, -43, 114, 38, 9);
            goalGraphics.fillStyle(0xf4cf62, 1);
            goalGraphics.fillRect(-7, 10, 14, 22);
          }

          this.reward = this.add.circle(
            0,
            kind === "hike" ? -118 : -68,
            kind === "hike" ? 34 : 24,
            kind === "hike" ? 0xffd35f : 0xf7f0d2,
            0.96,
          );
          this.reward.setStrokeStyle(6, kind === "hike" ? 0xff9b45 : 0x74ddd1);
          this.reward.setVisible(false);
          this.goal = this.add.container(0, 0, [goalGraphics, this.reward]);
          this.goal.setDepth(10);

          this.successLabel = this.add.text(
            0,
            0,
            kind === "hike" ? "정상에 도착했어요!" : "빛나는 진주를 찾았어요!",
            {
              fontFamily: '"Malgun Gothic", "Courier New", monospace',
              fontSize: "17px",
              fontStyle: "bold",
              color: "#ffe8a8",
              backgroundColor: "#082437",
              padding: { x: 13, y: 8 },
              stroke: "#082437",
              strokeThickness: 2,
            },
          );
          this.successLabel.setOrigin(0.5);
          this.successLabel.setDepth(15);
          this.successLabel.setVisible(false);

          this.scale.on("resize", this.layoutScene, this);
          this.layoutScene();

          const initial = latestRef.current;
          this.setProgress(initial.progress);
          this.setCelebrating(initial.celebrating);
          this.setPaused(initial.paused);
          controllerRef.current = this;
        }

        private getRoute(progress: number) {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 600;
          const start = compact
            ? { x: width * 0.15, y: height * 0.56 }
            : { x: width * 0.1, y: height * 0.75 };
          const end =
            kind === "hike"
              ? compact
                ? { x: width * 0.67, y: height * 0.36 }
                : { x: width * 0.62, y: height * 0.36 }
              : compact
                ? { x: width * 0.55, y: height * 0.51 }
                : { x: width * 0.58, y: height * 0.56 };

          const x = Phaser.Math.Linear(start.x, end.x, progress);
          const baseY = Phaser.Math.Linear(start.y, end.y, progress);
          const curve =
            kind === "hike"
              ? -Math.sin(progress * Math.PI) * height * 0.025
              : Math.sin(progress * Math.PI * 2) * height * 0.025;
          return { x, y: baseY + curve, start, end };
        }

        private layoutScene() {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 600;
          const unit = Math.max(0.68, Math.min(width / 1200, height / 700));
          this.backdrop.clear();

          if (kind === "hike") {
            const skyColors = [0x2f7371, 0x4e8975, 0x8aa26f, 0xd1a862];
            skyColors.forEach((color, index) => {
              this.backdrop.fillStyle(color, 1);
              this.backdrop.fillRect(0, (height * 0.48 * index) / 4, width, height * 0.12 + 1);
            });
            this.backdrop.fillStyle(0xffd67b, 0.8);
            this.backdrop.fillCircle(width * 0.79, height * 0.14, 55 * unit);
            this.backdrop.fillStyle(0x315a50, 0.75);
            this.backdrop.fillPoints([
              { x: 0, y: height * 0.56 },
              { x: 0, y: height * 0.44 },
              { x: width * 0.18, y: height * 0.24 },
              { x: width * 0.35, y: height * 0.46 },
              { x: width * 0.55, y: height * 0.2 },
              { x: width * 0.78, y: height * 0.45 },
              { x: width, y: height * 0.27 },
              { x: width, y: height * 0.58 },
            ], true);
            this.backdrop.fillStyle(0x173d31, 1);
            this.backdrop.fillRect(0, height * 0.49, width, height * 0.51);

            for (let index = 0; index < 18; index += 1) {
              const treeX = ((index * 97) % Math.max(120, width + 80)) - 30;
              const treeY = height * (0.48 + (index % 4) * 0.11);
              const size = (33 + (index % 5) * 8) * unit;
              this.backdrop.fillStyle(0x0b2c28, 0.82);
              this.backdrop.fillRect(treeX - 4 * unit, treeY, 8 * unit, height - treeY);
              this.backdrop.fillTriangle(treeX - size, treeY + 15, treeX, treeY - size, treeX + size, treeY + 15);
              this.backdrop.fillTriangle(treeX - size * 0.8, treeY + size * 0.55, treeX, treeY - size * 0.35, treeX + size * 0.8, treeY + size * 0.55);
            }

            const route = this.getRoute(0);
            const finish = this.getRoute(1);
            const middleX = (route.start.x + finish.end.x) * 0.52;
            const middleY = (route.start.y + finish.end.y) * 0.52 + height * 0.05;
            this.backdrop.lineStyle(Math.max(54, 82 * unit), 0x806643, 1);
            this.backdrop.beginPath();
            this.backdrop.moveTo(-30, route.start.y + 35);
            this.backdrop.lineTo(route.start.x, route.start.y + 18);
            this.backdrop.lineTo(middleX, middleY);
            this.backdrop.lineTo(finish.end.x + 55, finish.end.y + 25);
            this.backdrop.strokePath();
            this.backdrop.lineStyle(Math.max(4, 7 * unit), 0xb89b64, 0.8);
            for (let index = 0; index < 8; index += 1) {
              const point = this.getRoute(index / 7);
              this.backdrop.lineBetween(point.x - 17, point.y + 38 * unit, point.x + 17, point.y + 34 * unit);
            }
          } else {
            const waterColors = [0x1490a3, 0x0c718c, 0x095574, 0x073a5e, 0x052b4d];
            waterColors.forEach((color, index) => {
              this.backdrop.fillStyle(color, 1);
              this.backdrop.fillRect(0, (height * index) / 5, width, height / 5 + 1);
            });
            for (let index = 0; index < 6; index += 1) {
              const rayX = width * (0.04 + index * 0.18);
              this.backdrop.fillStyle(0xb9f2e2, 0.075);
              this.backdrop.fillTriangle(rayX, 0, rayX + width * 0.08, 0, rayX + width * 0.2, height * 0.72);
            }
            this.backdrop.fillStyle(0x083a49, 1);
            this.backdrop.fillPoints([
              { x: 0, y: height },
              { x: 0, y: height * 0.82 },
              { x: width * 0.14, y: height * 0.75 },
              { x: width * 0.3, y: height * 0.84 },
              { x: width * 0.46, y: height * 0.72 },
              { x: width * 0.64, y: height * 0.81 },
              { x: width * 0.82, y: height * 0.7 },
              { x: width, y: height * 0.78 },
              { x: width, y: height },
            ], true);

            for (let index = 0; index < 11; index += 1) {
              const coralX = ((index * 173) % Math.max(100, width));
              const coralY = height * (0.75 + (index % 3) * 0.07);
              this.backdrop.fillStyle(index % 2 ? 0xd26769 : 0xdf9a4b, 0.68);
              this.backdrop.fillRect(coralX, coralY, 8 * unit, height - coralY);
              this.backdrop.fillCircle(coralX - 7 * unit, coralY + 8 * unit, 8 * unit);
              this.backdrop.fillCircle(coralX + 12 * unit, coralY - 4 * unit, 7 * unit);
            }

            this.backdrop.fillStyle(0x154c58, 0.72);
            this.backdrop.fillRect(width * 0.72, height * 0.54, 34 * unit, height * 0.3);
            this.backdrop.fillRect(width * 0.88, height * 0.49, 42 * unit, height * 0.36);
            this.backdrop.fillStyle(0x2c6c70, 0.5);
            this.backdrop.fillRect(width * 0.7, height * 0.52, width * 0.24, 13 * unit);
          }

          this.ambient.forEach((particle, index) => {
            particle.setPosition(
              18 + ((index * 137) % Math.max(80, width - 36)),
              kind === "hike"
                ? height * (0.18 + ((index * 0.071) % 0.52))
                : height * (0.25 + ((index * 0.093) % 0.62)),
            );
            particle.setScale(unit);
          });

          const heroWidth =
            kind === "hike"
              ? compact
                ? Math.min(176, width * 0.45)
                : Math.min(250, width * 0.2)
              : compact
                ? Math.min(205, width * 0.53)
                : Math.min(330, width * 0.28);
          const sourceRatio = kind === "hike" ? 1 : 340 / 420;
          this.hero.setDisplaySize(heroWidth, heroWidth * sourceRatio);
          this.setProgress(this.currentProgress);

          const finish = this.getRoute(1).end;
          this.goal.setPosition(
            kind === "hike" ? finish.x + 75 * unit : compact ? width * 0.78 : width * 0.63,
            kind === "hike" ? finish.y + 45 * unit : compact ? height * 0.55 : height * 0.62,
          );
          this.goal.setScale(unit);
          this.successLabel.setPosition(
            Math.min(width - 130, Math.max(130, this.goal.x)),
            Math.max(48, this.goal.y - (kind === "hike" ? 145 : 100) * unit),
          );
        }

        setProgress(value: number) {
          this.currentProgress = Phaser.Math.Clamp(value, 0, 1);
          if (!this.hero) return;
          const point = this.getRoute(this.currentProgress);
          this.hero.setPosition(point.x, point.y);
        }

        setPaused(value: boolean) {
          if (this.isPaused === value) return;
          this.isPaused = value;
          if (value) {
            this.hero.anims.pause();
            this.tweens.pauseAll();
          } else {
            this.hero.anims.resume();
            this.tweens.resumeAll();
          }
        }

        setCelebrating(value: boolean) {
          if (this.isCelebrating === value) return;
          this.isCelebrating = value;
          if (!value) {
            this.reward.setVisible(false);
            this.successLabel.setVisible(false);
            if (!this.hero.anims.isPlaying) this.hero.play(`${kind}-motion`);
            return;
          }

          this.hero.anims.stop();
          this.hero.setFrame(kind === "hike" ? 4 : 2);
          this.setProgress(1);
          this.reward.setVisible(true);
          this.reward.setAlpha(0);
          this.successLabel.setVisible(true);
          this.successLabel.setAlpha(0);
          this.tweens.add({
            targets: this.reward,
            y: `-=${kind === "hike" ? 18 : 48}`,
            scale: { from: 0.45, to: 1.2 },
            alpha: 1,
            duration: 650,
            yoyo: true,
            hold: 1900,
            ease: "Back.Out",
          });
          this.tweens.add({
            targets: this.successLabel,
            alpha: 1,
            y: "-=8",
            delay: 260,
            duration: 300,
            yoyo: true,
            hold: 2500,
          });
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: mountRef.current,
        width: mountRef.current.clientWidth || 1200,
        height: mountRef.current.clientHeight || 700,
        backgroundColor: kind === "hike" ? "#173d31" : "#052b4d",
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
        scene: AdventureScene,
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

  useEffect(() => controllerRef.current?.setProgress(progress), [progress]);
  useEffect(() => controllerRef.current?.setPaused(paused), [paused]);
  useEffect(
    () => controllerRef.current?.setCelebrating(celebrating),
    [celebrating],
  );

  const label =
    kind === "hike"
      ? "모모가 숲길을 따라 정상으로 올라가는 애니메이션"
      : "포도가 산호 사이를 헤엄쳐 보물상자로 향하는 애니메이션";

  return <div ref={mountRef} className="phaser-adventure-scene" role="img" aria-label={label} />;
}
