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
        private backdrop!: import("phaser").GameObjects.Graphics;
        private waterGlints: import("phaser").GameObjects.Rectangle[] = [];
        private fishShadows: import("phaser").GameObjects.Ellipse[] = [];
        private fireflies: import("phaser").GameObjects.Arc[] = [];
        private angler!: import("phaser").GameObjects.Sprite;
        private goldenCatch!: import("phaser").GameObjects.Container;
        private successLabel!: import("phaser").GameObjects.Text;
        private currentProgress = 0;
        private isPaused = false;
        private isCelebrating = false;

        constructor() {
          super("fishing-quest");
        }

        preload() {
          this.load.spritesheet(
            "bori-fishing",
            `${assetBasePath}/sprites/bori-fish-phaser.png`,
            { frameWidth: 520, frameHeight: 430 },
          );
        }

        create() {
          this.backdrop = this.add.graphics();

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

          this.angler = this.add.sprite(0, 0, "bori-fishing", 0);
          this.angler.setOrigin(0.5);
          this.angler.setDepth(12);
          this.angler.play("bori-cast-loop");

          const fishBody = this.add.ellipse(0, 0, 88, 46, 0xf5b52f);
          fishBody.setStrokeStyle(5, 0x6b3c17);
          const fishBelly = this.add.ellipse(8, 8, 57, 23, 0xffe08a, 0.9);
          const fishTail = this.add.triangle(-54, 0, 0, 0, 42, -31, 42, 31, 0xe58b1f);
          fishTail.setStrokeStyle(4, 0x6b3c17);
          const fishFin = this.add.triangle(2, 20, 0, 0, 28, 0, 13, 19, 0xcc741b);
          const fishEye = this.add.circle(26, -9, 5, 0x221b15);
          const fishShine = this.add.rectangle(-1, -13, 25, 5, 0xfff1a8, 0.75);
          this.goldenCatch = this.add.container(0, 0, [
            fishTail,
            fishBody,
            fishBelly,
            fishFin,
            fishEye,
            fishShine,
          ]);
          this.goldenCatch.setDepth(14);
          this.goldenCatch.setVisible(false);

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

        private layoutScene() {
          const width = this.scale.width;
          const height = this.scale.height;
          const horizon = Math.max(180, height * 0.43);
          const dockY = Math.min(height - 54, Math.max(horizon + 115, height * 0.78));
          const unit = Math.max(0.72, Math.min(width / 1200, height / 700));

          this.backdrop.clear();

          const skyBands = [0xb85f4d, 0xa55d59, 0x84576a, 0x62516b];
          skyBands.forEach((color, index) => {
            const bandTop = (horizon / skyBands.length) * index;
            this.backdrop.fillStyle(color, 1);
            this.backdrop.fillRect(0, bandTop, width, horizon / skyBands.length + 1);
          });

          this.backdrop.fillStyle(0xf6c55f, 0.16);
          this.backdrop.fillCircle(width * 0.82, height * 0.18, 105 * unit);
          this.backdrop.fillStyle(0xffdb72, 0.88);
          this.backdrop.fillCircle(width * 0.82, height * 0.18, 66 * unit);

          this.backdrop.fillStyle(0x493e55, 0.75);
          this.backdrop.fillPoints([
            { x: 0, y: horizon },
            { x: 0, y: horizon - 55 * unit },
            { x: width * 0.12, y: horizon - 112 * unit },
            { x: width * 0.25, y: horizon - 42 * unit },
            { x: width * 0.41, y: horizon - 135 * unit },
            { x: width * 0.56, y: horizon - 50 * unit },
            { x: width * 0.72, y: horizon - 104 * unit },
            { x: width, y: horizon - 35 * unit },
            { x: width, y: horizon },
          ], true);

          this.backdrop.fillStyle(0x173f48, 0.9);
          this.backdrop.fillPoints([
            { x: 0, y: horizon + 12 },
            { x: 0, y: horizon - 18 * unit },
            { x: width * 0.16, y: horizon - 62 * unit },
            { x: width * 0.34, y: horizon - 15 * unit },
            { x: width * 0.52, y: horizon - 72 * unit },
            { x: width * 0.69, y: horizon - 20 * unit },
            { x: width * 0.86, y: horizon - 55 * unit },
            { x: width, y: horizon - 11 * unit },
            { x: width, y: horizon + 12 },
          ], true);

          this.backdrop.fillStyle(0x0d5361, 1);
          this.backdrop.fillRect(0, horizon, width, height - horizon);
          this.backdrop.fillStyle(0x083f52, 0.58);
          this.backdrop.fillRect(0, horizon + (height - horizon) * 0.43, width, height);
          this.backdrop.lineStyle(Math.max(2, 3 * unit), 0x78d1c9, 0.28);
          this.backdrop.lineBetween(0, horizon + 2, width, horizon + 2);

          for (let index = 0; index < 26; index += 1) {
            const lineY = horizon + 18 + ((index * 37) % Math.max(50, height - horizon - 24));
            const lineX = ((index * 173) % Math.max(120, width)) - 45;
            this.backdrop.fillStyle(index % 3 === 0 ? 0x58b7b3 : 0x2c8190, 0.16);
            this.backdrop.fillRect(lineX, lineY, 42 + (index % 5) * 18, 3 * unit);
          }

          this.backdrop.fillStyle(0x39291f, 1);
          this.backdrop.fillRect(0, dockY, Math.max(330, width * 0.34), Math.max(44, height * 0.075));
          this.backdrop.fillStyle(0x8e6037, 1);
          this.backdrop.fillRect(0, dockY - 12 * unit, Math.max(340, width * 0.35), 15 * unit);
          this.backdrop.lineStyle(Math.max(3, 5 * unit), 0x5e432c, 1);
          const dockWidth = Math.max(340, width * 0.35);
          for (let x = 20; x < dockWidth; x += 42 * unit) {
            this.backdrop.lineBetween(x, dockY - 10 * unit, x, dockY + height * 0.07);
          }
          this.backdrop.fillStyle(0x30251e, 1);
          this.backdrop.fillRect(dockWidth * 0.18, dockY + height * 0.05, 16 * unit, height - dockY);
          this.backdrop.fillRect(dockWidth * 0.78, dockY + height * 0.05, 16 * unit, height - dockY);

          for (let index = 0; index < 18; index += 1) {
            const reedX = width * 0.74 + ((index * 47) % Math.max(80, width * 0.25));
            const reedHeight = 25 + (index % 5) * 17;
            this.backdrop.fillStyle(index % 2 ? 0x1c5e4b : 0x214d42, 0.82);
            this.backdrop.fillRect(reedX, height - reedHeight, 5 * unit, reedHeight);
          }

          this.backdrop.fillStyle(0xf8dfac, 0.58);
          for (let index = 0; index < 24; index += 1) {
            const starX = ((index * 137) % Math.max(100, width - 30)) + 15;
            const starY = 24 + ((index * 73) % Math.max(60, horizon * 0.55));
            this.backdrop.fillRect(starX, starY, index % 5 === 0 ? 4 : 2, index % 5 === 0 ? 4 : 2);
          }

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

          const displayWidth = Math.max(330, Math.min(500, width * 0.44, height * 0.78));
          const displayHeight = displayWidth * (430 / 520);
          const anglerX = Math.max(displayWidth * 0.5 - 22, Math.min(width * 0.2, width - displayWidth * 0.5));
          const anglerY = dockY - displayHeight * 0.453;
          this.angler.setPosition(anglerX, anglerY);
          this.angler.setDisplaySize(displayWidth, displayHeight);

          const bobberX = anglerX + displayWidth * 0.112;
          const bobberY = anglerY + displayHeight * 0.39;
          this.goldenCatch.setPosition(bobberX + 18 * unit, bobberY - 56 * unit);
          this.goldenCatch.setScale(unit);
          this.successLabel.setPosition(
            Math.min(width - 155, Math.max(155, bobberX + 48 * unit)),
            Math.max(54, bobberY - 145 * unit),
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
            this.goldenCatch.setVisible(false);
            this.successLabel.setVisible(false);
            if (!this.angler.anims.isPlaying) this.angler.play("bori-cast-loop");
            return;
          }

          this.angler.anims.stop();
          this.angler.setFrame(2);
          this.goldenCatch.setVisible(true);
          this.successLabel.setVisible(true);
          this.goldenCatch.setAlpha(0);
          this.goldenCatch.setAngle(-16);
          this.successLabel.setAlpha(0);

          this.tweens.add({
            targets: this.goldenCatch,
            y: "-=74",
            angle: 12,
            alpha: 1,
            duration: 720,
            ease: "Back.Out",
            yoyo: true,
            hold: 1900,
          });
          this.tweens.add({
            targets: this.successLabel,
            alpha: 1,
            y: "-=8",
            duration: 320,
            delay: 320,
            yoyo: true,
            hold: 2600,
          });
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
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
      aria-label="보리가 낚싯대를 던지고 찌를 기다리는 별빛 호숫가 애니메이션"
    />
  );
}
