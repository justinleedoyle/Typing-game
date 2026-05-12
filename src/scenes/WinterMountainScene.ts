import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";

interface WinterSceneData {
  store: SaveStore;
}

interface Wolf {
  container: Phaser.GameObjects.Container;
  target: TextWordTarget;
  defeated: boolean;
}

const WOLF_WORD_BANK = ["snow", "claw", "howl", "fang", "frost", "den"];

const HUNTRESS_PASSAGES = ["free her hands", "she gives you her horn"];
const FIREFLY_PASSAGES = ["follow the lights", "take the lantern"];

export class WinterMountainScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;
  private wolves: Wolf[] = [];
  private activeTargets: TextWordTarget[] = [];

  constructor() {
    super("WinterMountainScene");
  }

  init(data: WinterSceneData): void {
    this.store = data.store;
    this.wolves = [];
    this.activeTargets = [];
  }

  create(): void {
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.drawSky();
    this.drawMountains();
    this.drawSnowfield();
    this.drawWren(this.scale.width / 2, 880);

    this.narratorText = this.add
      .text(this.scale.width / 2, 160, "", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 1400 },
      })
      .setOrigin(0.5);

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    this.startIntro();
  }

  // ─── Beat: intro ──────────────────────────────────────────────────────────

  private startIntro(): void {
this.setNarrator(
      "The portal closes behind you. Snow muffles the world. Something is moving in the dark...",
    );
    this.time.delayedCall(2400, () => this.startWolves());
  }

  // ─── Beat: wolf pack ──────────────────────────────────────────────────────

  private startWolves(): void {
    this.setNarrator("type the words above the wolves to drive them back");

    const positions = [
      { x: 320, y: 820 },
      { x: 620, y: 850 },
      { x: 1320, y: 850 },
      { x: 1620, y: 820 },
    ];
    const words = shuffle(WOLF_WORD_BANK).slice(0, positions.length);

    positions.forEach((pos, i) => {
      const fromLeft = pos.x < this.scale.width / 2;
      const startX = fromLeft ? -120 : this.scale.width + 120;
      this.spawnWolf(startX, pos.x, pos.y, words[i], i * 200);
    });
  }

  private spawnWolf(
    startX: number,
    targetX: number,
    targetY: number,
    word: string,
    delay: number,
  ): void {
    const container = this.add.container(startX, targetY);
    this.drawWolfInto(container, startX > this.scale.width / 2);
    container.setAlpha(0);

    const wolf: Wolf = {
      container,
      target: null as unknown as TextWordTarget,
      defeated: false,
    };

    this.tweens.add({
      targets: container,
      x: targetX,
      alpha: 1,
      duration: 700,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        const target = new TextWordTarget({
          scene: this,
          word,
          x: targetX,
          y: targetY - 90,
          fontSize: 32,
          onComplete: () => this.defeatWolf(wolf),
        });
        wolf.target = target;
        this.typingInput.register(target);
        this.activeTargets.push(target);
        this.idleBob(container);
      },
    });

    this.wolves.push(wolf);
  }

  private idleBob(c: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 6 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private defeatWolf(wolf: Wolf): void {
    playChime();
    wolf.defeated = true;
    this.typingInput.unregister(wolf.target);
    this.tweens.killTweensOf(wolf.container);
    this.tweens.add({
      targets: wolf.container,
      alpha: 0,
      y: wolf.container.y - 60,
      duration: 500,
      ease: "Sine.easeOut",
      onComplete: () => wolf.container.destroy(),
    });

    if (this.wolves.every((w) => w.defeated)) {
      this.time.delayedCall(900, () => this.startFork());
    }
  }

  // ─── Beat: CYOA fork ──────────────────────────────────────────────────────

  private startFork(): void {
    this.setNarrator(
      "The trail forks. Someone is calling from the drift to your left. A trail of fireflies hovers to your right. Type a path to take it.",
    );

    const huntress = new TextWordTarget({
      scene: this,
      word: "save the huntress",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => this.startHuntressBranch(),
    });
    const firefly = new TextWordTarget({
      scene: this,
      word: "follow the fireflies",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => this.startFireflyBranch(),
    });
    this.typingInput.register(huntress);
    this.typingInput.register(firefly);
    this.activeTargets.push(huntress, firefly);
  }

  // ─── Branches ─────────────────────────────────────────────────────────────

  private startHuntressBranch(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "A woman, half-buried in snow, lifts her head as you approach.",
    );
    this.time.delayedCall(1800, () => {
      this.runPassageChain(HUNTRESS_PASSAGES, [
        "She speaks a few words in the wolf-tongue. The howls behind you fade.",
        "She presses a spiral horn into your hand and gestures uphill.",
      ], "huntress", "hunters-horn");
    });
  }

  private startFireflyBranch(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Three fireflies hover at eye level, then dart up the slope.",
    );
    this.time.delayedCall(1800, () => {
      this.runPassageChain(FIREFLY_PASSAGES, [
        "The lights bob between the pines, patient, waiting for you.",
        "They settle inside a paper lantern hidden in a hollow tree.",
      ], "firefly", "fireflys-lantern");
    });
  }

  /**
   * Run an alternating sequence of player-typed passages and narrator lines.
   * After the final passage completes, award the relic and start the ending.
   */
  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    ending: "huntress" | "firefly",
    relicId: string,
  ): void {
    let step = 0;

    const advance = (): void => {
      if (step >= passages.length) {
        this.time.delayedCall(1400, () => this.startEnding(ending, relicId));
        return;
      }
      const word = passages[step];
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 240,
        fontSize: 36,
        onComplete: () => {
          step += 1;
          this.setNarrator(narratorLines[step - 1] ?? "");
          this.time.delayedCall(1400, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Beat: ending ─────────────────────────────────────────────────────────

  private startEnding(
    ending: "huntress" | "firefly",
    relicId: string,
  ): void {
    this.clearActiveTargets();
    this.setNarrator(
      "You return to the portal. The Almanac stamps a new page.",
    );

    this.store.update((s) => {
      s.realms["winter-mountain"] = {
        cleared: true,
        choices: { ending },
      };
      if (!s.satchel.includes(relicId)) {
        s.satchel.push(relicId);
      }
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    const stamp = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "the winter mountain", {
        fontFamily: SERIF,
        fontSize: "64px",
        color: PALETTE.cream,
        backgroundColor: "#1a1018",
        padding: { left: 40, right: 40, top: 20, bottom: 20 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.6);
    this.tweens.add({
      targets: stamp,
      alpha: 1,
      scale: 1,
      duration: 350,
      ease: "Back.easeOut",
      onComplete: () => {
        playChime();
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: stamp,
            alpha: 0,
            duration: 300,
            onComplete: onDone,
          });
        });
      },
    });
  }

  // ─── Input + helpers ─────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  private setNarrator(text: string): void {
    this.narratorText.setText(text);
    this.narratorText.setAlpha(0);
    this.tweens.add({
      targets: this.narratorText,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  private clearActiveTargets(): void {
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawSky(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1a2230, 1);
    g.fillRect(0, 0, this.scale.width, 700);
    g.fillStyle(0x0e1018, 1);
    g.fillRect(0, 0, this.scale.width, 200);
  }

  private drawMountains(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2a3548, 1);
    this.drawJaggedRange(g, 540, 720, [180, 320, 240, 380, 220, 300, 260]);
    g.fillStyle(0x222b3c, 1);
    this.drawJaggedRange(g, 620, 720, [260, 220, 360, 280, 320, 240]);
  }

  private drawJaggedRange(
    g: Phaser.GameObjects.Graphics,
    baseY: number,
    bottomY: number,
    peakHeights: number[],
  ): void {
    const segmentWidth = this.scale.width / (peakHeights.length - 1);
    g.beginPath();
    g.moveTo(0, bottomY);
    g.lineTo(0, baseY);
    for (let i = 0; i < peakHeights.length; i++) {
      const x = i * segmentWidth;
      const y = baseY - peakHeights[i];
      g.lineTo(x, y);
    }
    g.lineTo(this.scale.width, baseY);
    g.lineTo(this.scale.width, bottomY);
    g.closePath();
    g.fillPath();
  }

  private drawSnowfield(): void {
    const g = this.add.graphics();
    g.fillStyle(0xc8d4e0, 1);
    g.fillRect(0, 720, this.scale.width, this.scale.height - 720);
    for (const x of [220, 540, 1380, 1700]) {
      this.drawPine(g, x, 720);
    }
  }

  private drawPine(
    g: Phaser.GameObjects.Graphics,
    x: number,
    baseY: number,
  ): void {
    const trunkW = 12;
    const trunkH = 30;
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(x - trunkW / 2, baseY - trunkH, trunkW, trunkH);
    g.fillStyle(0x14181f, 1);
    for (let i = 0; i < 3; i++) {
      const w = 90 - i * 22;
      const h = 60;
      const y = baseY - trunkH - i * 38;
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x + w / 2, y);
      g.lineTo(x, y - h);
      g.closePath();
      g.fillPath();
    }
  }

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    // Cloak
    g.fillStyle(0x6f8a5e, 1);
    g.fillTriangle(-30, 0, 30, 0, 0, -80);
    // Hood
    g.fillStyle(0x4f6440, 1);
    g.fillCircle(0, -75, 18);
    // Face
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(0, -68, 10);
    // Satchel strap
    g.lineStyle(2, 0x3a2a1a, 1);
    g.beginPath();
    g.moveTo(-22, -40);
    g.lineTo(18, -10);
    g.strokePath();
    c.add(g);
    return c;
  }

  private drawWolfInto(
    c: Phaser.GameObjects.Container,
    facingLeft: boolean,
  ): void {
    const g = this.add.graphics();
    const flip = facingLeft ? -1 : 1;
    // Body
    g.fillStyle(0x1a1a22, 1);
    g.fillEllipse(0, 0, 80, 30);
    // Head
    g.fillEllipse(flip * 30, -10, 30, 22);
    // Ears
    g.fillTriangle(
      flip * 24,
      -22,
      flip * 30,
      -32,
      flip * 36,
      -22,
    );
    g.fillTriangle(
      flip * 32,
      -22,
      flip * 38,
      -32,
      flip * 44,
      -22,
    );
    // Tail
    g.fillEllipse(flip * -36, -10, 22, 8);
    // Legs
    g.fillRect(-14, 12, 5, 14);
    g.fillRect(10, 12, 5, 14);
    // Eye
    g.fillStyle(0xd6754a, 0.9);
    g.fillCircle(flip * 36, -10, 2.5);
    c.add(g);
  }
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
