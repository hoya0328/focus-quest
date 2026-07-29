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
        private hikeBackdrop?: import("phaser").GameObjects.Image;
        private swimBackdrop?: import("phaser").GameObjects.Image;
        private backdrop!: import("phaser").GameObjects.Graphics;
        private hero!: import("phaser").GameObjects.Sprite;
        private swimChest?: import("phaser").GameObjects.Sprite;
        private hikePole?: import("phaser").GameObjects.Rectangle;
        private hikeFlag?: import("phaser").GameObjects.Polygon;
        private goal!: import("phaser").GameObjects.Container;
        private reward!: import("phaser").GameObjects.Arc;
        private successLabel!: import("phaser").GameObjects.Text;
        private ambient: import("phaser").GameObjects.Arc[] = [];
        private swimRewardBaseScale = 1;
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
          if (kind === "hike") {
            this.load.image(
              "hike-pixel-summit",
              `${assetBasePath}/backgrounds/hike-pixel-summit-v1.png`,
            );
          } else {
            this.load.image(
              "swim-pixel-depth",
              `${assetBasePath}/backgrounds/swim-pixel-depth.png`,
            );
            this.load.spritesheet(
              "swim-treasure",
              `${assetBasePath}/sprites/treasure-chest-swim-v2.png`,
              {
                frameWidth: 423,
                frameHeight: 465,
              },
            );
          }
        }

        create() {
          if (kind === "hike") {
            this.hikeBackdrop = this.add
              .image(0, 0, "hike-pixel-summit")
              .setOrigin(0.5)
              .setDepth(0);
          } else {
            this.swimBackdrop = this.add
              .image(0, 0, "swim-pixel-depth")
              .setOrigin(0.5)
              .setDepth(0);
          }
          this.backdrop = this.add.graphics().setDepth(1);

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
          if (kind === "swim") {
            this.anims.create({
              key: "swim-chest-bump",
              frames: [
                { key: "swim-treasure", frame: 0 },
                { key: "swim-treasure", frame: 1 },
                { key: "swim-treasure", frame: 2 },
                { key: "swim-treasure", frame: 0 },
              ],
              frameRate: 7,
              repeat: 0,
            });
            this.anims.create({
              key: "swim-chest-open",
              frames: this.anims.generateFrameNumbers("swim-treasure", {
                start: 3,
                end: 7,
              }),
              frameRate: 7,
              repeat: 0,
            });
          }

          this.hero = this.add.sprite(0, 0, "quest-hero", 0);
          this.hero.setDepth(12);
          this.hero.play(`${kind}-motion`);

          const goalGraphics = this.add.graphics();
          if (kind === "hike") {
            goalGraphics.fillStyle(0x263a30, 0.88);
            goalGraphics.fillEllipse(0, 24, 82, 22);
            goalGraphics.fillStyle(0x465348, 1);
            goalGraphics.fillEllipse(-14, 15, 27, 19);
            goalGraphics.fillStyle(0x5d6251, 1);
            goalGraphics.fillEllipse(10, 12, 24, 18);
            goalGraphics.fillStyle(0x74705a, 1);
            goalGraphics.fillEllipse(-1, 0, 20, 16);
            this.hikePole = this.add
              .rectangle(10, 18, 5, 76, 0xf5dda3)
              .setOrigin(0.5, 1)
              .setVisible(false);
            this.hikePole.setStrokeStyle(2, 0x765331);
            this.hikeFlag = this.add
              .polygon(14, -52, [0, 0, 48, 13, 0, 28], 0xef784e)
              .setOrigin(0, 0.5)
              .setVisible(false);
            this.hikeFlag.setStrokeStyle(2, 0x8f3f34);
          } else {
            this.swimChest = this.add.sprite(0, 0, "swim-treasure", 0);
          }

          this.reward = this.add.circle(
            0,
            kind === "hike" ? -118 : 0,
            kind === "hike" ? 24 : 76,
            kind === "hike" ? 0xffd35f : 0xf7f0d2,
            kind === "hike" ? 0.26 : 0.72,
          );
          this.reward.setStrokeStyle(4, kind === "hike" ? 0xff9b45 : 0x74ddd1);
          if (kind === "swim") {
            this.reward.setBlendMode(Phaser.BlendModes.ADD);
          }
          this.reward.setVisible(false);
          this.goal = this.add.container(
            0,
            0,
            kind === "hike"
              ? [this.reward, goalGraphics, this.hikePole!, this.hikeFlag!]
              : [this.reward, goalGraphics, this.swimChest!],
          );
          this.goal.setDepth(10);

          if (kind === "swim") {
            this.time.addEvent({
              delay: 5200,
              loop: true,
              callback: () => {
                if (
                  !this.isPaused &&
                  !this.isCelebrating &&
                  this.swimChest &&
                  !this.swimChest.anims.isPlaying
                ) {
                  this.swimChest.play("swim-chest-bump");
                }
              },
            });
          }

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

        private getHikeSourcePoint(progress: number) {
          const clamped = Phaser.Math.Clamp(progress, 0, 1);
          return {
            x: Phaser.Math.Interpolation.CatmullRom(
              [0.07, 0.17, 0.29, 0.4, 0.5, 0.59, 0.66],
              clamped,
            ),
            y: Phaser.Math.Interpolation.CatmullRom(
              [0.85, 0.78, 0.7, 0.61, 0.52, 0.42, 0.31],
              clamped,
            ),
          };
        }

        private positionHikeBackdrop(progress: number) {
          const image = this.hikeBackdrop;
          if (!image) return;
          const width = this.scale.width;
          const height = this.scale.height;
          const displayWidth = image.frame.realWidth * image.scaleX;
          const compact = width < 600;
          let imageLeft = (width - displayWidth) / 2;

          if (compact && displayWidth > width) {
            const sourcePoint = this.getHikeSourcePoint(progress);
            const targetX = width * (0.3 + progress * 0.1);
            imageLeft = Phaser.Math.Clamp(
              targetX - sourcePoint.x * displayWidth,
              width - displayWidth,
              0,
            );
          }

          image.setPosition(imageLeft + displayWidth / 2, height / 2);
        }

        private mapHikePoint(progress: number) {
          const image = this.hikeBackdrop;
          if (!image) return { x: 0, y: 0 };
          const sourcePoint = this.getHikeSourcePoint(progress);
          const displayWidth = image.frame.realWidth * image.scaleX;
          const displayHeight = image.frame.realHeight * image.scaleY;
          return {
            x: image.x - displayWidth / 2 + sourcePoint.x * displayWidth,
            y: image.y - displayHeight / 2 + sourcePoint.y * displayHeight,
          };
        }

        private getRoute(progress: number) {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 600;
          if (kind === "hike" && this.hikeBackdrop) {
            return {
              ...this.mapHikePoint(progress),
              start: this.mapHikePoint(0),
              end: this.mapHikePoint(1),
            };
          }

          const start = compact
            ? { x: width * 0.15, y: height * 0.56 }
            : { x: width * 0.1, y: height * 0.75 };
          const end = compact
            ? { x: width * 0.55, y: height * 0.51 }
            : { x: width * 0.47, y: height * 0.56 };

          const x = Phaser.Math.Linear(start.x, end.x, progress);
          const baseY = Phaser.Math.Linear(start.y, end.y, progress);
          const curve = Math.sin(progress * Math.PI * 2) * height * 0.025;
          return { x, y: baseY + curve, start, end };
        }

        private layoutScene() {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 600;
          const unit = Math.max(0.68, Math.min(width / 1200, height / 700));
          this.backdrop.clear();

          if (kind === "hike") {
            const image = this.hikeBackdrop;
            if (image) {
              const coverScale =
                Math.max(
                  width / image.frame.realWidth,
                  height / image.frame.realHeight,
                ) * 1.015;
              image.setScale(coverScale);
              this.positionHikeBackdrop(this.currentProgress);
            }

            this.backdrop.fillStyle(0x071f1c, 0.1);
            this.backdrop.fillRect(0, height * 0.77, width, height * 0.23);
            this.backdrop.fillStyle(0xffd77a, 0.045);
            this.backdrop.fillTriangle(
              width * 0.72,
              0,
              width,
              0,
              width * 0.56,
              height * 0.68,
            );

            for (let index = 0; index < (compact ? 5 : 9); index += 1) {
              const leafX = 18 + ((index * 149) % Math.max(90, width - 36));
              const leafY = height * (0.08 + ((index * 0.093) % 0.68));
              this.backdrop.fillStyle(
                index % 2 === 0 ? 0x6d8d45 : 0xd39c49,
                0.22,
              );
              this.backdrop.fillEllipse(
                leafX,
                leafY,
                (8 + (index % 3) * 3) * unit,
                (4 + (index % 2) * 2) * unit,
              );
            }
          } else {
            const image = this.swimBackdrop;
            if (image) {
              const frameWidth = image.frame.realWidth;
              const frameHeight = image.frame.realHeight;
              const coverScale =
                Math.max(width / frameWidth, height / frameHeight) * 1.04;
              image.setScale(coverScale);
              image.setPosition(width / 2, height / 2);
            }

            // The painted image supplies the far and middle depths. These quiet,
            // translucent foreground shapes keep the live swimmer inside the world.
            this.backdrop.fillStyle(0x062e50, 0.12);
            this.backdrop.fillRect(0, height * 0.78, width, height * 0.22);
            for (let index = 0; index < 4; index += 1) {
              const rayX = width * (0.12 + index * 0.22);
              this.backdrop.fillStyle(0xb9f2e2, 0.035);
              this.backdrop.fillTriangle(
                rayX,
                0,
                rayX + width * 0.05,
                0,
                rayX + width * 0.13,
                height * 0.7,
              );
            }

            const kelpXs = compact
              ? [width * 0.03, width * 0.94]
              : [width * 0.025, width * 0.08, width * 0.91, width * 0.97];
            kelpXs.forEach((kelpX, index) => {
              const kelpHeight = height * (0.13 + (index % 3) * 0.035);
              this.backdrop.lineStyle(7 * unit, 0x073b4c, 0.72);
              this.backdrop.beginPath();
              this.backdrop.moveTo(kelpX, height);
              this.backdrop.lineTo(
                kelpX + (index % 2 ? -10 : 10) * unit,
                height - kelpHeight * 0.55,
              );
              this.backdrop.lineTo(kelpX, height - kelpHeight);
              this.backdrop.strokePath();
            });
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

          if (kind === "hike") {
            this.goal.setScale(unit);
          } else {
            this.goal.setPosition(
              compact ? width * 0.78 : width * 0.54,
              compact ? height * 0.55 : height * 0.62,
            );
            this.goal.setScale(1);
            const chestWidth = compact
              ? Math.min(238, width * 0.61)
              : Math.min(330, width * 0.2);
            this.swimChest?.setDisplaySize(chestWidth, chestWidth * (465 / 423));
            this.swimRewardBaseScale = chestWidth / 250;
            this.reward.setScale(this.swimRewardBaseScale);
            this.successLabel.setPosition(
              Math.min(width - 130, Math.max(130, this.goal.x)),
              Math.max(48, this.goal.y - 100 * unit),
            );
          }
        }

        setProgress(value: number) {
          this.currentProgress = Phaser.Math.Clamp(value, 0, 1);
          if (!this.hero) return;
          if (kind === "hike") {
            this.positionHikeBackdrop(this.currentProgress);
          }
          const point = this.getRoute(this.currentProgress);
          this.hero.setPosition(point.x, point.y);
          if (kind === "hike") {
            const width = this.scale.width;
            const unit = Math.max(
              0.68,
              Math.min(width / 1200, this.scale.height / 700),
            );
            const finish = this.getRoute(1).end;
            this.goal.setPosition(
              finish.x + 42 * unit,
              finish.y + 30 * unit,
            );
            this.goal.setAlpha(
              Phaser.Math.Clamp((this.currentProgress - 0.72) / 0.24, 0, 1),
            );
            this.successLabel.setPosition(
              Math.min(width - 130, Math.max(130, this.goal.x)),
              Math.max(48, this.goal.y - 142 * unit),
            );
          }
          if (this.swimBackdrop) {
            const width = this.scale.width;
            const frameWidth =
              this.swimBackdrop.frame.realWidth * this.swimBackdrop.scaleX;
            const availablePan = Math.max(0, frameWidth - width);
            const travel = Math.min(width * 0.025, availablePan * 0.18);
            this.swimBackdrop.x =
              width / 2 - (this.currentProgress - 0.5) * travel * 2;
          }
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
            this.tweens.killTweensOf(this.reward);
            this.tweens.killTweensOf(this.hero);
            this.hero.setAngle(0);
            if (this.swimChest) {
              this.swimChest.anims.stop();
              this.swimChest.setFrame(0);
              this.reward.setPosition(0, 0);
              this.reward.setScale(this.swimRewardBaseScale);
            }
            if (this.hikePole && this.hikeFlag) {
              this.tweens.killTweensOf(this.hikePole);
              this.tweens.killTweensOf(this.hikeFlag);
              this.hikePole.setVisible(false).setScale(1, 0);
              this.hikeFlag.setVisible(false).setScale(0, 1).setAlpha(0);
            }
            this.reward.setVisible(false);
            this.successLabel.setVisible(false);
            if (!this.hero.anims.isPlaying) this.hero.play(`${kind}-motion`);
            return;
          }

          this.hero.anims.stop();
          this.hero.setFrame(kind === "hike" ? 4 : 2);
          this.setProgress(1);
          this.swimChest?.play("swim-chest-open");
          this.reward.setVisible(true);
          this.reward.setAlpha(0);
          if (kind === "hike" && this.hikePole && this.hikeFlag) {
            this.hikePole.setVisible(true).setScale(1, 0);
            this.hikeFlag.setVisible(true).setScale(0, 1).setAlpha(0);
            this.tweens.add({
              targets: this.hero,
              angle: 7,
              x: "+=12",
              y: "+=6",
              duration: 240,
              yoyo: true,
              hold: 130,
              ease: "Sine.InOut",
            });
            this.tweens.add({
              targets: this.hikePole,
              scaleY: 1,
              duration: 560,
              delay: 260,
              ease: "Back.Out",
            });
            this.tweens.add({
              targets: this.hikeFlag,
              scaleX: 1,
              alpha: 1,
              duration: 440,
              delay: 790,
              ease: "Back.Out",
            });
          }
          if (kind === "swim") {
            this.reward.setScale(this.swimRewardBaseScale);
          }
          this.successLabel.setVisible(true);
          this.successLabel.setAlpha(0);
          this.tweens.add({
            targets: this.reward,
            y: kind === "hike" ? "-=18" : 0,
            scale: kind === "hike"
              ? { from: 0.45, to: 1.2 }
              : {
                  from: this.swimRewardBaseScale * 0.35,
                  to: this.swimRewardBaseScale * 1.65,
                },
            alpha: kind === "hike" ? 1 : 0.9,
            duration: kind === "hike" ? 650 : 720,
            delay: kind === "hike" ? 760 : 0,
            yoyo: true,
            hold: kind === "hike" ? 1900 : 900,
            repeat: kind === "hike" ? 0 : 1,
            ease: "Back.Out",
          });
          this.tweens.add({
            targets: this.successLabel,
            alpha: 1,
            y: "-=8",
            delay: kind === "hike" ? 1080 : 260,
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
      ? "모리가 노을숲 능선을 따라 해오름 봉우리로 올라가는 애니메이션"
      : "나루가 유리산호 유적을 헤엄쳐 보물상자로 향하는 애니메이션";

  return <div ref={mountRef} className="phaser-adventure-scene" role="img" aria-label={label} />;
}
