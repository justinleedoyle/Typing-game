import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, WINTER_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";

interface WinterSceneData {
  store: SaveStore;
}

interface Wolf {
  container: Phaser.GameObjects.Container;
  target: TextWordTarget | null;
  spawnX: number;
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  advanceMs: number;
}

const HUNTRESS_PASSAGES = ["free her hands", "she gives you her horn"];
const FIREFLY_PASSAGES = ["follow the lights", "take the lantern"];

const WAVE_CANDLES = 3;
const WAVE_CHARGES = 2;
const WOLF_KNOCKBACK_PAUSE_MS = 1500;

/** Four canonical spawn slots — earlier slots are closer to Wren. Each wave
 *  picks `wolfCount` of these. */
const SPAWN_SLOTS = [
  { x: 320, y: 820 },
  { x: 620, y: 850 },
  { x: 1320, y: 850 },
  { x: 1620, y: 820 },
] as const;

interface WaveConfig {
  wolfCount: number;
  advanceMs: number;
  intro: string;
}

const WAVES: readonly WaveConfig[] = [
  {
    wolfCount: 3,
    advanceMs: 14000,
    intro:
      "type the wolves' names to drive them back. hold Shift on the first letter to call a thunderclap.",
  },
  {
    wolfCount: 3,
    advanceMs: 11000,
    intro: "more eyes glint in the dark. the pack tightens.",
  },
  {
    wolfCount: 4,
    advanceMs: 9000,
    intro: "the snow shifts. they come faster now.",
  },
];

export class WinterMountainScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;
  private wolves: Wolf[] = [];
  private activeTargets: TextWordTarget[] = [];

  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenGlow!: Phaser.GameObjects.Graphics;
  private candleGroup!: Phaser.GameObjects.Container;
  private chargeGroup!: Phaser.GameObjects.Container;

  private candles = WAVE_CANDLES;
  private charges = WAVE_CHARGES;
  private shiftHeld = false;
  private waveActive = false;
  private waveIndex = 0;

  constructor() {
    super("WinterMountainScene");
  }

  init(data: WinterSceneData): void {
    this.store = data.store;
    this.wolves = [];
    this.activeTargets = [];
    this.candles = WAVE_CANDLES;
    this.charges = WAVE_CHARGES;
    this.shiftHeld = false;
    this.waveActive = false;
    this.waveIndex = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.drawSky();
    this.drawMountains();
    this.drawSnowfield();
    this.wrenContainer = this.drawWren(this.scale.width / 2, 880);

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

    this.candleGroup = this.add.container(this.scale.width / 2 - 110, 880);
    this.chargeGroup = this.add.container(this.scale.width / 2 + 110, 880);
    this.redrawCandles();
    this.redrawCharges();

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
    });

    this.startIntro();
  }

  // ─── Beat: intro ──────────────────────────────────────────────────────────

  private startIntro(): void {
    this.setNarrator(
      "The portal closes behind you. Snow muffles the world. Something is moving in the dark...",
    );
    this.time.delayedCall(2400, () => this.startWave(0));
  }

  // ─── Beat: wolf pack (waves) ──────────────────────────────────────────────

  private startWave(idx: number): void {
    this.waveIndex = idx;
    this.waveActive = true;
    this.wolves = [];
    this.charges = WAVE_CHARGES;
    this.redrawCharges();
    const config = WAVES[idx];
    this.setNarrator(config.intro);

    const slots = shuffle(SPAWN_SLOTS).slice(0, config.wolfCount);
    const words = pickAdaptiveWords(
      WINTER_WORD_BANK,
      config.wolfCount,
      this.store.get().keyStats,
    );

    slots.forEach((pos, i) => {
      const fromLeft = pos.x < this.scale.width / 2;
      const startX = fromLeft ? -120 : this.scale.width + 120;
      this.spawnWolf(startX, pos.x, pos.y, words[i], i * 200, config.advanceMs);
    });
  }

  private spawnWolf(
    startX: number,
    targetX: number,
    targetY: number,
    word: string,
    delay: number,
    advanceMs: number,
  ): void {
    const facingLeft = startX > this.scale.width / 2;
    const container = this.add.container(startX, targetY);
    this.drawWolfInto(container, facingLeft);
    container.setAlpha(0);

    const wolf: Wolf = {
      container,
      target: null,
      spawnX: targetX,
      restY: targetY,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
    };

    this.tweens.add({
      targets: container,
      x: targetX,
      alpha: 1,
      duration: 700,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!this.waveActive || wolf.defeated) return;
        this.attachWolfTarget(wolf);
        this.idleBob(container);
        this.startWolfAdvance(wolf);
      },
    });

    this.wolves.push(wolf);
  }

  private attachWolfTarget(wolf: Wolf): void {
    const target = new TextWordTarget({
      scene: this,
      word: wolf.word,
      x: wolf.container.x,
      y: wolf.restY - 90,
      fontSize: 32,
      onComplete: () => this.defeatWolf(wolf),
      onSpellComplete: () => {
        this.defeatWolf(wolf);
        this.castThunderclap(wolf);
      },
    });
    wolf.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startWolfAdvance(wolf: Wolf): void {
    const wrenX = this.wrenContainer.x;
    const remaining = Math.abs(wolf.container.x - wrenX);
    const totalRange = Math.abs(wolf.spawnX - wrenX);
    // Scale duration by remaining distance so a wolf that was knocked back
    // partway still feels fair — closer wolves haven't "earned" full time.
    const duration = wolf.advanceMs * Math.max(0.3, remaining / totalRange);

    wolf.advanceTween = this.tweens.add({
      targets: wolf.container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: () => {
        if (wolf.target) wolf.target.setAnchorX(wolf.container.x);
      },
      onComplete: () => {
        wolf.advanceTween = null;
        if (!wolf.defeated && this.waveActive) {
          this.wolfReachesWren(wolf);
        }
      },
    });
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
    if (wolf.defeated) return;
    playChime();
    wolf.defeated = true;
    if (wolf.target) {
      this.typingInput.unregister(wolf.target);
      wolf.target = null;
    }
    wolf.advanceTween?.stop();
    wolf.advanceTween = null;
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
      this.waveActive = false;
      this.time.delayedCall(900, () => this.onWaveCleared());
    }
  }

  private onWaveCleared(): void {
    const nextIdx = this.waveIndex + 1;
    if (nextIdx >= WAVES.length) {
      this.startFork();
      return;
    }
    this.time.delayedCall(1800, () => this.startWave(nextIdx));
  }

  // ─── Stakes: wolf reaches Wren ───────────────────────────────────────────

  private wolfReachesWren(wolf: Wolf): void {
    this.cameras.main.shake(220, 0.005);
    this.snuffCandle();

    if (!this.waveActive) return;

    // Push the wolf back to its spawn position and pause before re-engaging.
    if (wolf.target) {
      this.typingInput.unregister(wolf.target);
      const idx = this.activeTargets.indexOf(wolf.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      wolf.target.destroy();
      wolf.target = null;
    }
    this.tweens.killTweensOf(wolf.container);
    this.tweens.add({
      targets: wolf.container,
      x: wolf.spawnX,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (wolf.defeated || !this.waveActive) return;
        this.time.delayedCall(WOLF_KNOCKBACK_PAUSE_MS, () => {
          if (wolf.defeated || !this.waveActive) return;
          this.idleBob(wolf.container);
          this.attachWolfTarget(wolf);
          this.startWolfAdvance(wolf);
        });
      },
    });
  }

  private snuffCandle(): void {
    this.candles = Math.max(0, this.candles - 1);
    this.redrawCandles();
    if (this.candles === 0) {
      this.resetWave();
    }
  }

  private resetWave(): void {
    if (!this.waveActive) return;
    this.waveActive = false;
    this.setNarrator("the dark presses in. steady your hands and try again.");

    // Sweep all wolves off-screen.
    for (const w of this.wolves) {
      if (w.target) {
        this.typingInput.unregister(w.target);
        w.target.destroy();
        w.target = null;
      }
      w.advanceTween?.stop();
      w.advanceTween = null;
      this.tweens.killTweensOf(w.container);
      this.tweens.add({
        targets: w.container,
        alpha: 0,
        duration: 350,
        onComplete: () => w.container.destroy(),
      });
      w.defeated = true;
    }

    this.cameras.main.flash(300, 20, 18, 30);
    this.time.delayedCall(1600, () => {
      this.wolves = [];
      this.activeTargets = [];
      this.candles = WAVE_CANDLES;
      this.redrawCandles();
      this.startWave(0);
    });
  }

  // ─── Thunderclap (Shift spell) ────────────────────────────────────────────

  private castThunderclap(source: Wolf): void {
    this.charges = Math.max(0, this.charges - 1);
    this.redrawCharges();
    this.cameras.main.flash(220, 240, 230, 200);
    playChime();

    for (const w of this.wolves) {
      if (w.defeated || w === source) continue;
      w.advanceTween?.stop();
      w.advanceTween = null;
      this.tweens.killTweensOf(w.container);
      this.tweens.add({
        targets: w.container,
        x: w.spawnX,
        duration: 450,
        ease: "Sine.easeOut",
        onComplete: () => {
          if (w.target) w.target.setAnchorX(w.container.x);
          this.time.delayedCall(2500, () => {
            if (w.defeated || !this.waveActive) return;
            this.idleBob(w.container);
            this.startWolfAdvance(w);
          });
        },
      });
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
    if (event.key === "Shift") {
      this.setShiftHeld(true);
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    const spell = this.shiftHeld && this.charges > 0;
    this.typingInput.handleChar(event.key, { spell });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.setShiftHeld(false);
  }

  private setShiftHeld(held: boolean): void {
    if (this.shiftHeld === held) return;
    this.shiftHeld = held;
    this.updateWrenGlow();
  }

  private updateWrenGlow(): void {
    const armed = this.shiftHeld && this.charges > 0 && this.waveActive;
    this.wrenGlow.setAlpha(armed ? 0.55 : 0);
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

  // ─── HUD: candles + charges ──────────────────────────────────────────────

  private redrawCandles(): void {
    this.candleGroup.removeAll(true);
    for (let i = 0; i < WAVE_CANDLES; i++) {
      const lit = i < this.candles;
      const x = (i - (WAVE_CANDLES - 1) / 2) * 26;
      const g = this.add.graphics();
      // Candle stick
      g.fillStyle(0xe8dcb5, 1);
      g.fillRect(x - 4, -10, 8, 28);
      // Wick
      g.fillStyle(0x2a1f12, 1);
      g.fillRect(x - 1, -16, 2, 6);
      // Flame
      if (lit) {
        g.fillStyle(PALETTE_HEX.ember, 1);
        g.fillEllipse(x, -22, 10, 16);
        g.fillStyle(PALETTE_HEX.brass, 1);
        g.fillEllipse(x, -22, 5, 10);
      } else {
        // Smoke wisp for out candles
        g.fillStyle(0x8a8275, 0.45);
        g.fillEllipse(x, -22, 6, 10);
      }
      this.candleGroup.add(g);
    }
  }

  private redrawCharges(): void {
    this.chargeGroup.removeAll(true);
    for (let i = 0; i < WAVE_CHARGES; i++) {
      const ready = i < this.charges;
      const x = (i - (WAVE_CHARGES - 1) / 2) * 24;
      const g = this.add.graphics();
      if (ready) {
        g.fillStyle(PALETTE_HEX.brass, 0.9);
        g.fillCircle(x, -10, 8);
        g.lineStyle(2, 0xf3ead2, 0.9);
        g.strokeCircle(x, -10, 8);
      } else {
        g.lineStyle(2, 0x8a8275, 0.6);
        g.strokeCircle(x, -10, 8);
      }
      this.chargeGroup.add(g);
    }
    this.updateWrenGlow();
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
    this.wrenGlow = this.add.graphics();
    this.wrenGlow.fillStyle(PALETTE_HEX.brass, 1);
    this.wrenGlow.fillCircle(0, -40, 60);
    this.wrenGlow.setAlpha(0);
    c.add(this.wrenGlow);

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
