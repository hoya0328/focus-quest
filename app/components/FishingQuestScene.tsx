"use client";

import { useEffect, useRef } from "react";

type FishingQuestSceneProps = {
  progress: number;
  paused: boolean;
  celebrating: boolean;
  assetBasePath?: string;
};

type FishingSceneController = {
  setProgress: (value: number) => void;
  setPaused: (value: boolean) => void;
  setCelebrating: (value: boolean) => void;
};

export default function FishingQuestScene({
  progress,
  paused,
  celebrating,
  assetBasePath = "",
}: FishingQuestSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FishingSceneController | null>(null);
  const latestStateRef = useRef({ progress, paused, celebrating });

  latestStateRef.current = { progress, paused, celebrating };

  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | null = null;

    async function mountGame() {
      const Phaser = await import("phaser");
      if (disposed || !mountRef.current) return;

      class FishingScene extends Phaser.Scene implements FishingSceneController {
        private lakeBackdrop!: import("phaser").GameObjects.Image;
        private backdrop!: import("phaser").GameObjects.Graphics;
        private waterGlints: import("phaser").GameObjects.Rectangle[] = [];
        private fishShadows: import("phaser").GameObjects.Ellipse[] = [];
        private fireflies: import("phaser").GameObjects.Arc[] = [];
        private bobberRipples: import("phaser").GameObjects.Ellipse[] = [];
        private angler!: import("phaser").GameObjects.Sprite;
        private goldenCatch!: import("phaser").GameObjects.Image;
        private catchSplash!: import("phaser").GameObjects.Container;
        private successLabel!: import("phaser").GameObjects.Text;
        private bobberX = 0;
        private bobberY = 0;
        private sceneUnit = 1;
        private currentProgress = 0;
        private isPaused = false;
        private isCelebrating = false;

        constructor() {
          super("fishing-quest");
        }

        preload() {
          this.load.image(
            "fishing-pixel-lake",
            `${assetBasePath}/backgrounds/fish-pixel-lake-v1.png`,
          );
          this.load.spritesheet(
            "bori-fishing",
            `${assetBasePath}/sprites/bori-fish-phaser.png`,
            { frameWidth: 520, frameHeight: 430 },
          );
          this.load.image(
            "golden-carp",
            `${assetBasePath}/sprites/golden-carp-jump-v1.png`,
          );
        }

        create() {
          this.lakeBackdrop = this.add
            .image(0, 0, "fishing-pixel-lake")
            .setOrigin(0.5)
            .setDepth(0);
          this.backdrop = this.add.graphics().setDepth(1);

          for (let index = 0; index < 22; index += 1) {
            const glint = this.add.rectangle(0, 0, 28 + (index % 5) * 13, 2, 0x6ec6c2, 0.18);
            this.waterGlints.push(glint);
            this.tweens.add({
              targets: glint,
              x: `+=${12 + (index % 4) * 5}`,
              alpha: { from: 0.08, to: 0.34 },
              duration: 1700 + (index % 6) * 310,
              delay: index * 90,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
          }

          for (let index = 0; index < 3; index += 1) {
            const shadow = this.add.ellipse(0, 0, 94 - index * 13, 16, 0x031a26, 0.32);
            this.fishShadows.push(shadow);
            this.tweens.add({
              targets: shadow,
              x: `+=${index % 2 === 0 ? 80 : -65}`,
              y: `+=${index % 2 === 0 ? 7 : -5}`,
              duration: 5200 + index * 1100,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
          }

          for (let index = 0; index < 9; index += 1) {
            const glow = this.add.circle(0, 0, 2 + (index % 2), 0xffe3a0, 0.55);
            this.fireflies.push(glow);
            this.tweens.add({
              targets: glow,
              y: `-=${12 + (index % 4) * 6}`,
              alpha: { from: 0.18, to: 0.8 },
              duration: 1300 + index * 170,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
          }

          this.anims.create({
            key: "bori-cast-loop",
            frames: [
              { key: "bori-fishing", frame: 0, duration: 760 },
              { key: "bori-fishing", frame: 1, duration: 180 },
              { key: "bori-fishing", frame: 2, duration: 460 },
              { key: "bori-fishing", frame: 1, duration: 180 },
            ],
            repeat: -1,
          });
          this.anims.create({
            key: "bori-catch",
            frames: [
              { key: "bori-fishing", frame: 2, duration: 130 },
              { key: "bori-fishing", frame: 1, duration: 240 },
            ],
            repeat: 0,
          });

          this.angler = this.add.sprite(0, 0, "bori-fishing", 0);
          this.angler.setOrigin(0.5);
          this.angler.setDepth(12);
          this.angler.play("bori-cast-loop");

          for (let index = 0; index < 3; index += 1) {
            const ripple = this.add
              .ellipse(0, 0, 54, 15, 0x4ca9b2, 0)
              .setStrokeStyle(3, 0x9ce3df, 0.52)
              .setDepth(8);
            this.bobberRipples.push(ripple);
            this.tweens.add({
              targets: ripple,
              scaleX: { from: 0.25, to: 1.35 },
              scaleY: { from: 0.4, to: 1 },
              alpha: { from: 0.64, to: 0 },
              duration: 1650,
              delay: index * 520,
              repeat: -1,
              ease: "Sine.Out",
            });
          }

          this.goldenCatch = this.add.image(0, 0, "golden-carp");
          this.goldenCatch.setDepth(14);
          this.goldenCatch.setVisible(false);

          const splashRing = this.add
            .ellipse(0, 10, 128, 30, 0x8fe1df, 0)
            .setStrokeStyle(5, 0xb7f0e8, 0.82);
          const splashLeft = this.add.circle(-42, -10, 9, 0xb7f0e8, 0.82);
          const splashMiddle = this.add.circle(0, -24, 12, 0xd7fff4, 0.9);
          const splashRight = this.add.circle(43, -7, 8, 0x8ed9db, 0.78);
          this.catchSplash = this.add.container(0, 0, [
            splashRing,
            splashLeft,
            splashMiddle,
            splashRight,
          ]);
          this.catchSplash.setDepth(13);
          this.catchSplash.setVisible(false);

          this.successLabel = this.add.text(0, 0, "황금 잉어를 낚았어요!", {
            fontFamily: '"Malgun Gothic", "Courier New", monospace',
            fontSize: "18px",
            fontStyle: "bold",
            color: "#ffe8a8",
            backgroundColor: "#082437",
            padding: { x: 14, y: 9 },
            stroke: "#082437",
            strokeThickness: 2,
          });
          this.successLabel.setOrigin(0.5);
          this.successLabel.setDepth(15);
          this.successLabel.setVisible(false);

          this.scale.on("resize", this.layoutScene, this);
          this.layoutScene();

          const initial = latestStateRef.current;
          this.setProgress(initial.progress);
          this.setCelebrating(initial.celebrating);
          this.setPaused(initial.paused);
          controllerRef.current = this;
        }

        update() {
          const bobberSettled =
            !this.isCelebrating && Number(this.angler.frame.name) === 0;
          this.bobberRipples.forEach((ripple) => {
            ripple.setVisible(bobberSettled);
          });
        }

        private positionLakeBackdrop() {
          const width = this.scale.width;
          const height = this.scale.height;
          const compact = width < 600;
          const coverScale =
            Math.max(
              width / this.lakeBackdrop.frame.realWidth,
              height / this.lakeBackdrop.frame.realHeight,
            ) * 1.015;
          this.lakeBackdrop.setScale(coverScale);
          const displayWidth =
            this.lakeBackdrop.frame.realWidth * this.lakeBackdrop.scaleX;
          let imageLeft = (width - displayWidth) / 2;

          if (compact && displayWidth > width) {
            imageLeft = Phaser.Math.Clamp(
              width * 0.44 - displayWidth * 0.43,
              width - displayWidth,
              0,
            );
          }
          this.lakeBackdrop.setPosition(
            imageLeft + displayWidth / 2,
            height / 2,
          );
        }

        private mapLakePoint(x: number, y: number) {
          const displayWidth =
            this.lakeBackdrop.frame.realWidth * this.lakeBackdrop.scaleX;
          const displayHeight =
            this.lakeBackdrop.frame.realHeight * this.lakeBackdrop.scaleY;
          return {
            x: this.lakeBackdrop.x - displayWidth / 2 + x * displayWidth,
            y: this.lakeBackdrop.y - displayHeight / 2 + y * displayHeight,
          };
        }

        private layoutScene() {
          const width = this.scale.width;
          const height = this.scale.height;
          const isCompact = width < 600;
          const unit = Math.max(0.72, Math.min(width / 1200, height / 700));
          this.sceneUnit = unit;

          this.backdrop.clear();
          this.positionLakeBackdrop();
          const horizon = this.mapLakePoint(0.5, 0.39).y;

          this.backdrop.fillStyle(0x031824, 0.08);
          this.backdrop.fillRect(
            0,
            horizon + (height - horizon) * 0.62,
            width,
            height,
          );
          this.backdrop.fillStyle(0x9ee6dc, 0.035);
          this.backdrop.fillTriangle(
            width * 0.14,
            horizon,
            width * 0.31,
            horizon,
            width * 0.48,
            height,
          );

          this.waterGlints.forEach((glint, index) => {
            glint.setPosition(
              20 + ((index * 151) % Math.max(90, width - 40)),
              horizon + 20 + ((index * 47) % Math.max(40, height - horizon - 60)),
            );
          });

          this.fishShadows.forEach((shadow, index) => {
            shadow.setPosition(
              width * (0.53 + index * 0.16),
              horizon + (height - horizon) * (0.35 + index * 0.17),
            );
            shadow.setScale(unit);
          });

          this.fireflies.forEach((glow, index) => {
            glow.setPosition(
              width * (0.05 + ((index * 0.109) % 0.86)),
              horizon * (0.2 + ((index * 0.17) % 0.68)),
            );
            glow.setScale(unit);
          });

          const displayWidth = isCompact
            ? Math.max(225, Math.min(280, width * 0.7))
            : Math.max(320, Math.min(440, width * 0.38, height * 0.72));
          const displayHeight = displayWidth * (430 / 520);
          const bobberTarget = this.mapLakePoint(0.455, 0.63);
          const anglerX = bobberTarget.x - displayWidth * 0.112;
          const anglerY = bobberTarget.y - displayHeight * 0.316;
          this.angler.setPosition(anglerX, anglerY);
          this.angler.setDisplaySize(displayWidth, displayHeight);

          this.bobberX = bobberTarget.x;
          this.bobberY = bobberTarget.y;
          this.bobberRipples.forEach((ripple) => {
            ripple.setPosition(this.bobberX, this.bobberY + 3 * unit);
            ripple.setScale(unit);
          });

          const catchSize = isCompact
            ? Math.min(220, width * 0.58)
            : Math.min(310, width * 0.23);
          this.goldenCatch.setPosition(
            this.bobberX,
            this.bobberY + 74 * unit,
          );
          this.goldenCatch.setDisplaySize(catchSize, catchSize);
          this.catchSplash.setPosition(this.bobberX, this.bobberY);
          this.catchSplash.setScale(unit);
          this.successLabel.setPosition(
            Math.min(width - 155, Math.max(155, this.bobberX + 36 * unit)),
            Math.max(54, this.bobberY - 176 * unit),
          );
        }

        setProgress(value: number) {
          this.currentProgress = Phaser.Math.Clamp(value, 0, 1);
          const dusk = 1 - this.currentProgress * 0.18;
          this.cameras.main.setAlpha(dusk);
        }

        setPaused(value: boolean) {
          if (this.isPaused === value) return;
          this.isPaused = value;
          if (value) {
            this.angler.anims.pause();
            this.tweens.pauseAll();
          } else {
            this.angler.anims.resume();
            this.tweens.resumeAll();
          }
        }

        setCelebrating(value: boolean) {
          if (this.isCelebrating === value) return;
          this.isCelebrating = value;

          if (!value) {
            this.tweens.killTweensOf(this.goldenCatch);
            this.tweens.killTweensOf(this.catchSplash);
            this.tweens.killTweensOf(this.successLabel);
            this.goldenCatch
              .setVisible(false)
              .setAlpha(0)
              .setAngle(10)
              .setPosition(
                this.bobberX,
                this.bobberY + 74 * this.sceneUnit,
              );
            this.catchSplash.setVisible(false).setAlpha(0);
            this.successLabel.setVisible(false);
            if (!this.angler.anims.isPlaying) this.angler.play("bori-cast-loop");
            return;
          }

          this.angler.play("bori-catch");
          this.goldenCatch
            .setVisible(true)
            .setPosition(
              this.bobberX,
              this.bobberY + 74 * this.sceneUnit,
            );
          this.catchSplash
            .setVisible(true)
            .setAlpha(1)
            .setScale(this.sceneUnit * 0.45);
          this.successLabel.setVisible(true);
          this.goldenCatch.setAlpha(0);
          this.goldenCatch.setAngle(12);
          this.successLabel.setAlpha(0);

          this.tweens.add({
            targets: this.catchSplash,
            scale: this.sceneUnit * 1.35,
            alpha: 0,
            duration: 680,
            ease: "Cubic.Out",
          });
          this.tweens.add({
            targets: this.goldenCatch,
            x: this.bobberX - 52 * this.sceneUnit,
            y: this.bobberY - 158 * this.sceneUnit,
            angle: -10,
            alpha: 1,
            duration: 820,
            ease: "Back.Out",
            onComplete: () => {
              this.tweens.add({
                targets: this.goldenCatch,
                y: "-=9",
                angle: -4,
                duration: 420,
                yoyo: true,
                repeat: 2,
                ease: "Sine.InOut",
              });
            },
          });
          this.tweens.add({
            targets: this.successLabel,
            alpha: 1,
            y: "-=8",
            duration: 320,
            delay: 720,
            yoyo: true,
            hold: 2450,
          });
        }
      }

      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: mountRef.current,
        width: mountRef.current.clientWidth || 1200,
        height: mountRef.current.clientHeight || 700,
        backgroundColor: "#082f43",
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
        scene: FishingScene,
        audio: { noAudio: true },
      });
    }

    void mountGame();

    return () => {
      disposed = true;
      controllerRef.current = null;
      game?.destroy(true);
    };
  }, [assetBasePath]);

  useEffect(() => {
    controllerRef.current?.setProgress(progress);
  }, [progress]);

  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    controllerRef.current?.setCelebrating(celebrating);
  }, [celebrating]);

  return (
    <div
      ref={mountRef}
      className="phaser-fishing-scene"
      role="img"
      aria-label="보리가 낚싯대를 던지고 황금 잉어를 기다리는 달비늘 호수 애니메이션"
    />
  );
}
