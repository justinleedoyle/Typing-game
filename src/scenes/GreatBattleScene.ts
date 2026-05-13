import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import {
  pickAdaptiveWords,
  WINTER_WORD_BANK,
  SUNKEN_BELL_WORD_BANK,
  FORGE_WORD_BANK,
  SKY_ISLAND_WORD_BANK,
  HAUNTED_WOOD_WORD_BANK,
} from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";

// ─── Scene data ────────────────────────────────────────────────────────────────

interface BattleSceneData {
  store: SaveStore;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WAVE_CANDLES = 3;
const WAVE_CHARGES = 2;

const BATTLE_WORD_BANK = [
  "hold", "stand", "speak", "word", "voice", "again",
  "name", "ring", "light", "true", "still", "turn",
  "last", "kept", "long", "clear", "break", "found",
] as const;

const COMPANION_IDS = [
  "snow-fox-cub",
  "glass-fish",
  "brass-songbird",
  "lantern-moth",
  "wisp-cat",
] as const;

// ─── Wave definition ───────────────────────────────────────────────────────────

interface WaveDef {
  realmId: string;
  bank: readonly string[];
  baseY: number;
  companionId: string;
  companionLine: string;
  label: string;
}

const WAVE_DEFS: WaveDef[] = [
  {
    realmId: "winter-mountain",
    bank: WINTER_WORD_BANK,
    baseY: 580,
    companionId: "snow-fox-cub",
    companionLine: "The fox darts through the shadows. They scatter.",
    label: "shadow-wolves",
  },
  {
    realmId: "sunken-bell",
    bank: SUNKEN_BELL_WORD_BANK,
    baseY: 560,
    companionId: "glass-fish",
    companionLine: "The glass-fish leaps the harbor wall. The wraiths follow it back.",
    label: "tide-wraiths",
  },
  {
    realmId: "clockwork-forge",
    bank: FORGE_WORD_BANK,
    baseY: 540,
    companionId: "brass-songbird",
    companionLine: "The songbird sings one note. The golems fall still.",
    label: "rogue-golems",
  },
  {
    realmId: "sky-island",
    bank: SKY_ISLAND_WORD_BANK,
    baseY: 560,
    companionId: "lantern-moth",
    companionLine: "The lantern-moth opens her wings. The shards lose their edge.",
    label: "sky-shards",
  },
  {
    realmId: "haunted-wood",
    bank: HAUNTED_WOOD_WORD_BANK,
    baseY: 580,
    companionId: "wisp-cat",
    companionLine: "The wisp-cat leads the haunts back into the deep wood.",
    label: "wood-haunts",
  },
];

// ─── Enemy entity ──────────────────────────────────────────────────────────────

interface Enemy {
  graphic: Phaser.GameObjects.Graphics;
  target: TextWordTarget | null;
  x: number;
  y: number;
  word: string;
  defeated: boolean;
  waveIdx: number;
}

// ─── Scene ─────────────────────────────────────────────────────────────────────

export class GreatBattleScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;
  private activeTargets: TextWordTarget[] = [];

  // HUD
  private candleGroup!: Phaser.GameObjects.Container;
  private chargeGroup!: Phaser.GameObjects.Container;
  private candles = WAVE_CANDLES;
  private charges = WAVE_CHARGES;

  // Input
  private shiftHeld = false;

  // Phase 1
  private enemies: Enemy[] = [];
  private waveQueue: WaveDef[] = [];
  private currentWaveIdx = -1;

  // Phase 2
  private quietLordContainer!: Phaser.GameObjects.Container;
  private againText!: Phaser.GameObjects.Text;
  private strikeLineGraphic!: Phaser.GameObjects.Graphics;
  private phase2Round1Words: string[] = [];

  // Phase 3
  private screenBrightnessOverlay!: Phaser.GameObjects.Graphics;
  private brightnessAlpha = 0;

  constructor() {
    super("GreatBattleScene");
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(data: BattleSceneData): void {
    this.store = data.store;
    this.activeTargets = [];
    this.enemies = [];
    this.waveQueue = [];
    this.currentWaveIdx = -1;
    this.candles = WAVE_CANDLES;
    this.charges = WAVE_CHARGES;
    this.shiftHeld = false;
    this.phase2Round1Words = [];
    this.brightnessAlpha = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(700, 11, 10, 15);

    this.drawCastleBackground();

    // Narrator
    this.narratorText = this.add
      .text(this.scale.width / 2, 90, "", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 1500 },
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Candle & charge HUD
    this.candleGroup = this.add.container(this.scale.width / 2 - 120, 990).setDepth(6);
    this.chargeGroup = this.add.container(this.scale.width / 2 + 120, 990).setDepth(6);
    this.redrawCandles();
    this.redrawCharges();

    // Screen brightness overlay (phase 3)
    this.screenBrightnessOverlay = this.add.graphics().setDepth(30).setAlpha(0);

    // Input
    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    // Begin
    this.time.delayedCall(800, () => this.startPhase1());
  }

  private onShutdown(): void {
    this.typingInput.reset();
    this.input.keyboard?.off("keydown", this.onKeyDown, this);
    this.input.keyboard?.off("keyup", this.onKeyUp, this);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Shift") {
      this.shiftHeld = true;
      return;
    }
    if (!event.key || (event.key.length !== 1 && event.key !== " ")) return;
    playClack();
    this.typingInput.handleChar(event.key, { spell: this.shiftHeld });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = false;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

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

  // ─── HUD ────────────────────────────────────────────────────────────────────

  private redrawCandles(): void {
    this.candleGroup.removeAll(true);
    for (let i = 0; i < WAVE_CANDLES; i++) {
      const lit = i < this.candles;
      const x = (i - (WAVE_CANDLES - 1) / 2) * 26;
      const g = this.add.graphics();
      // Candle body
      g.fillStyle(0xe8dcb5, 1);
      g.fillRect(x - 4, -10, 8, 28);
      // Wick
      g.fillStyle(0x2a1f12, 1);
      g.fillRect(x - 1, -16, 2, 6);
      if (lit) {
        g.fillStyle(PALETTE_HEX.ember, 1);
        g.fillEllipse(x, -22, 10, 16);
        g.fillStyle(PALETTE_HEX.brass, 1);
        g.fillEllipse(x, -22, 5, 10);
      } else {
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
  }

  private restoreOneCandle(): void {
    if (this.candles < WAVE_CANDLES) {
      this.candles += 1;
      this.redrawCandles();
    }
  }

  // ─── PHASE 1 — The Wall ─────────────────────────────────────────────────────

  private startPhase1(): void {
    this.setNarrator("Hearthward. The castle walls at dusk. They are coming.");

    // Build wave queue from cleared realms
    this.waveQueue = [];
    const state = this.store.get();
    for (const waveDef of WAVE_DEFS) {
      if (state.realms[waveDef.realmId]?.cleared) {
        this.waveQueue.push(waveDef);
      }
    }

    if (this.waveQueue.length === 0) {
      // Edge case: no realms cleared — skip to phase 2
      this.time.delayedCall(1500, () => this.transitionToPhase2());
      return;
    }

    this.time.delayedCall(2200, () => this.runNextWave());
  }

  private runNextWave(): void {
    if (this.waveQueue.length === 0) {
      // All waves done
      this.time.delayedCall(1000, () => {
        this.setNarrator("He is here.");
        this.time.delayedCall(1800, () => this.transitionToPhase2());
      });
      return;
    }

    const waveDef = this.waveQueue.shift()!;
    this.currentWaveIdx += 1;
    this.setNarrator(`The ${waveDef.label} pour over the wall.`);

    const words = pickAdaptiveWords(
      waveDef.bank as readonly string[],
      3,
      this.store.get().keyStats,
    );

    const xPositions = [this.scale.width * 0.25, this.scale.width * 0.5, this.scale.width * 0.75];

    for (let i = 0; i < 3; i++) {
      this.spawnEnemy(waveDef, xPositions[i]!, words[i]!, this.currentWaveIdx);
    }

    this.watchForWaveClear(waveDef);
  }

  private spawnEnemy(waveDef: WaveDef, x: number, word: string, waveIdx: number): void {
    const graphic = this.add.graphics().setDepth(3);
    this.drawEnemyShape(graphic, waveDef.realmId, x, waveDef.baseY);

    const target = new TextWordTarget({
      scene: this,
      word,
      x,
      y: waveDef.baseY - 60,
      fontSize: 34,
      onComplete: () => this.defeatEnemy(enemy),
    });

    const enemy: Enemy = {
      graphic,
      target,
      x,
      y: waveDef.baseY,
      word,
      defeated: false,
      waveIdx,
    };

    this.enemies.push(enemy);
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private drawEnemyShape(g: Phaser.GameObjects.Graphics, realmId: string, x: number, y: number): void {
    switch (realmId) {
      case "winter-mountain":
        // Shadow-wolf: dark grey filled triangle (downward ▼)
        g.fillStyle(0x2a2832, 0.95);
        g.fillTriangle(x - 22, y - 10, x + 22, y - 10, x, y + 20);
        break;
      case "sunken-bell":
        // Tide-wraith: translucent blue-grey ellipse
        g.fillStyle(0x4a6080, 0.55);
        g.fillEllipse(x, y, 50, 70);
        break;
      case "clockwork-forge":
        // Rogue golem: brass-colored rectangle with a dot eye
        g.fillStyle(0x7a6030, 0.9);
        g.fillRect(x - 18, y - 30, 36, 50);
        g.fillStyle(PALETTE_HEX.ember, 0.9);
        g.fillCircle(x + 8, y - 12, 4);
        break;
      case "sky-island":
        // Sky-shard: bright gold thin triangle (upward ▲)
        g.fillStyle(0xd4b84a, 0.92);
        g.fillTriangle(x, y - 34, x - 14, y + 10, x + 14, y + 10);
        break;
      case "haunted-wood":
        // Wood-haunt: translucent pale green-grey ellipse
        g.fillStyle(0x6a8068, 0.45);
        g.fillEllipse(x, y, 46, 66);
        break;
    }
  }

  private defeatEnemy(enemy: Enemy): void {
    if (enemy.defeated) return;
    playChime();
    enemy.defeated = true;
    if (enemy.target) {
      this.typingInput.unregister(enemy.target);
      const idx = this.activeTargets.indexOf(enemy.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      enemy.target = null;
    }
    this.tweens.add({
      targets: enemy.graphic,
      alpha: 0,
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => enemy.graphic.destroy(),
    });
  }

  private watchForWaveClear(waveDef: WaveDef): void {
    const waveIdx = this.currentWaveIdx;
    const check = (): void => {
      const waveEnemies = this.enemies.filter((e) => e.waveIdx === waveIdx);
      if (waveEnemies.length > 0 && waveEnemies.every((e) => e.defeated)) {
        this.onWaveCleared(waveDef);
      } else {
        this.time.delayedCall(300, check);
      }
    };
    this.time.delayedCall(300, check);
  }

  private onWaveCleared(waveDef: WaveDef): void {
    const satchel = this.store.get().satchel;
    if (satchel.includes(waveDef.companionId)) {
      // Show companion cameo
      this.setNarrator(waveDef.companionLine);
      this.restoreOneCandle();
      this.time.delayedCall(2500, () => this.runNextWave());
    } else {
      // Brief pause, no cameo
      this.time.delayedCall(800, () => this.runNextWave());
    }
  }

  private transitionToPhase2(): void {
    this.clearActiveTargets();
    this.enemies = [];
    this.time.delayedCall(600, () => this.startPhase2());
  }

  // ─── PHASE 2 — The Duel ─────────────────────────────────────────────────────

  private startPhase2(): void {
    this.drawQuietLord();
    this.showQuietLordDescription();
  }

  private drawQuietLord(): void {
    this.quietLordContainer = this.add.container(this.scale.width / 2, 0).setDepth(4);

    const g = this.add.graphics();
    // Body: two overlapping rounded rectangles of deep shadow
    g.fillStyle(0x0e0c14, 0.92);
    g.fillRoundedRect(-80, 100, 160, 420, 16);
    g.fillRoundedRect(-60, 80, 120, 440, 12);
    // Head: larger ellipse
    g.fillStyle(0x1a1020, 0.9);
    g.fillEllipse(0, 80, 140, 140);
    // Eyes: two small dim red ellipses
    g.fillStyle(0x4a1010, 0.85);
    g.fillEllipse(-28, 68, 22, 14);
    g.fillEllipse(28, 68, 22, 14);

    this.quietLordContainer.add(g);

    // "Again." text with strikethrough effect
    this.againText = this.add
      .text(0, 280, "Again.", {
        fontFamily: SERIF,
        fontSize: "52px",
        color: "#3a3060",
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Strikethrough line overlay
    this.strikeLineGraphic = this.add.graphics().setDepth(6);
    this.updateStrikeLinePosition();

    this.quietLordContainer.add(this.againText);
    // Note: strikeLineGraphic is not in the container so we can control it separately

    this.quietLordContainer.setAlpha(0);
    this.tweens.add({
      targets: this.quietLordContainer,
      alpha: 1,
      duration: 1200,
      ease: "Sine.easeOut",
    });
  }

  private updateStrikeLinePosition(): void {
    this.strikeLineGraphic.clear();
    const ql = this.quietLordContainer;
    if (!ql) return;
    const tx = ql.x + this.againText.x;
    const ty = ql.y + this.againText.y;
    const hw = this.againText.width / 2;
    this.strikeLineGraphic.lineStyle(3, 0x3a3060, 1);
    this.strikeLineGraphic.beginPath();
    this.strikeLineGraphic.moveTo(tx - hw, ty);
    this.strikeLineGraphic.lineTo(tx + hw, ty);
    this.strikeLineGraphic.strokePath();
  }

  private showQuietLordDescription(): void {
    const state = this.store.get();
    const clearedCount = Object.values(state.realms).filter((r) => r?.cleared).length;

    let descLine: string;
    if (clearedCount >= 5) {
      descLine = "He is smaller than the stories said. The allies you gathered flicker at his edges.";
    } else if (clearedCount >= 3) {
      descLine = "He is vast but unsteady. Each realm you visited is a crack in his silence.";
    } else {
      descLine = "He is immense. His silence fills the courtyard.";
    }

    this.time.delayedCall(1400, () => {
      this.setNarrator(descLine);
      this.time.delayedCall(3200, () => this.startPhase2a());
    });
  }

  private startPhase2a(): void {
    this.setNarrator("He speaks to unmake. Answer him.");
    const counterWords = ["unmake", "unsay", "unfound"];
    this.runSequentialWords(counterWords, 0, () => this.startPhase2b());
  }

  private runSequentialWords(words: string[], idx: number, onDone: () => void): void {
    if (idx >= words.length) {
      onDone();
      return;
    }
    const word = words[idx]!;
    const target = new TextWordTarget({
      scene: this,
      word,
      x: this.scale.width / 2,
      y: 500,
      fontSize: 44,
      onComplete: () => {
        playChime();
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: { from: this.quietLordContainer.alpha, to: 0.8 },
          duration: 300,
          yoyo: true,
          onComplete: () => {
            this.time.delayedCall(400, () => {
              this.runSequentialWords(words, idx + 1, onDone);
            });
          },
        });
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startPhase2b(): void {
    this.clearActiveTargets();
    // Round 1: 3 words from BATTLE_WORD_BANK simultaneously
    const round1Words = pickAdaptiveWords(
      BATTLE_WORD_BANK as readonly string[],
      3,
      this.store.get().keyStats,
    );
    this.phase2Round1Words = round1Words;

    const xPositions = [
      this.scale.width * 0.25,
      this.scale.width * 0.5,
      this.scale.width * 0.75,
    ];

    let remaining = 3;
    for (let i = 0; i < 3; i++) {
      const word = round1Words[i]!;
      const x = xPositions[i]!;
      const target = new TextWordTarget({
        scene: this,
        word,
        x,
        y: 520,
        fontSize: 40,
        onComplete: () => {
          playChime();
          remaining -= 1;
          if (remaining === 0) {
            this.clearActiveTargets();
            this.onPhase2Round1Done();
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    }
  }

  private onPhase2Round1Done(): void {
    this.setNarrator("He wavers.");
    this.tweens.add({
      targets: this.quietLordContainer,
      alpha: { from: 1.0, to: 0.6 },
      duration: 500,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: 0.85,
          duration: 500,
          ease: "Sine.easeIn",
        });
      },
    });
    // Strikethrough fades to half opacity
    this.tweens.add({
      targets: this.strikeLineGraphic,
      alpha: 0.5,
      duration: 700,
    });

    this.time.delayedCall(1200, () => this.startPhase2bRound2());
  }

  private startPhase2bRound2(): void {
    // Round 2: 3 more words with no overlap
    const allWords = (BATTLE_WORD_BANK as readonly string[]).filter(
      (w) => !this.phase2Round1Words.includes(w),
    );
    const round2Words = pickAdaptiveWords(
      allWords,
      3,
      this.store.get().keyStats,
    );

    const xPositions = [
      this.scale.width * 0.25,
      this.scale.width * 0.5,
      this.scale.width * 0.75,
    ];

    let remaining = 3;
    for (let i = 0; i < 3; i++) {
      const word = round2Words[i]!;
      const x = xPositions[i]!;
      const target = new TextWordTarget({
        scene: this,
        word,
        x,
        y: 520,
        fontSize: 40,
        onComplete: () => {
          playChime();
          remaining -= 1;
          if (remaining === 0) {
            this.clearActiveTargets();
            this.onPhase2Round2Done();
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    }
  }

  private onPhase2Round2Done(): void {
    this.setNarrator("The word on him burns.");
    this.tweens.add({
      targets: this.quietLordContainer,
      alpha: { from: 0.85, to: 0.4 },
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: 0.7,
          duration: 600,
          ease: "Sine.easeIn",
        });
      },
    });
    // Strikethrough line fully disappears
    this.tweens.add({
      targets: this.strikeLineGraphic,
      alpha: 0,
      duration: 500,
      onComplete: () => this.strikeLineGraphic.destroy(),
    });
    // "Again." now glows
    this.tweens.add({
      targets: this.againText,
      duration: 700,
      onComplete: () => {
        this.againText.setColor("#b8a8f0");
      },
    });

    this.time.delayedCall(1400, () => this.startPhase2c());
  }

  private startPhase2c(): void {
    const satchel = this.store.get().satchel;
    let spellWord = "speak";
    if (satchel.includes("bells-tongue")) {
      spellWord = "ring";
    } else if (satchel.includes("hunters-horn")) {
      spellWord = "call";
    } else if (satchel.includes("brass-songbird")) {
      spellWord = "sing";
    } else if (satchel.includes("ghost-kings-promise")) {
      spellWord = "name";
    }

    this.setNarrator(`Hold the shift key and type: ${spellWord}`);

    const target = new TextWordTarget({
      scene: this,
      word: spellWord,
      x: this.scale.width / 2,
      y: 520,
      fontSize: 52,
      onComplete: () => {
        // Miss — re-register with hint
        this.clearActiveTargets();
        this.setNarrator(`Hold Shift while typing: ${spellWord}`);
        this.time.delayedCall(800, () => this.startPhase2c());
      },
      onSpellComplete: () => {
        playChime();
        this.clearActiveTargets();
        this.onSpellWordComplete();
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private onSpellWordComplete(): void {
    this.tweens.add({
      targets: this.quietLordContainer,
      alpha: 0,
      duration: 800,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Again. text stays visible — move it to screen center
        this.startPhase3();
      },
    });
  }

  // ─── PHASE 3 — The Final Phrase ─────────────────────────────────────────────

  private startPhase3(): void {
    this.clearActiveTargets();

    // Remove againText from quietLordContainer and place it at world coords
    // The container was at (width/2, 0); againText was at (0, 280) within it
    this.quietLordContainer.remove(this.againText);
    this.againText.setPosition(this.scale.width / 2, 300);
    this.againText.setColor("#d4b8ff");
    this.againText.setDepth(10);

    // Tween to center
    this.tweens.add({
      targets: this.againText,
      x: this.scale.width / 2,
      y: 300,
      duration: 600,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.againText.setStyle({ fontSize: "72px" });
      },
    });

    // Slightly dim the castle background
    const dimOverlay = this.add.graphics().setDepth(2);
    dimOverlay.fillStyle(0x000000, 0.25);
    dimOverlay.fillRect(0, 0, this.scale.width, this.scale.height);

    this.time.delayedCall(800, () => this.deliverFinalPhrase());
  }

  private deliverFinalPhrase(): void {
    const satchel = this.store.get().satchel;
    const companions = COMPANION_IDS.filter((c) => satchel.includes(c));

    let phrase: string;
    if (companions.length >= 3) {
      phrase = "the companions remember. the word holds. again.";
    } else if (satchel.includes("wisp-cat")) {
      phrase = "the wood remembers names. the word holds. again.";
    } else if (satchel.includes("snow-fox-cub")) {
      phrase = "the mountain is listening. the word holds. again.";
    } else if (satchel.includes("glass-fish")) {
      phrase = "the deep has heard. the bell rings out. again.";
    } else if (satchel.includes("brass-songbird")) {
      phrase = "the forge remembers song. the word holds. again.";
    } else if (satchel.includes("lantern-moth")) {
      phrase = "the lantern finds the dark. again.";
    } else {
      phrase = "the word holds. the quiet ends. again.";
    }

    const words = phrase.split(" ");
    this.runFinalPhraseWords(words, 0);
  }

  private runFinalPhraseWords(words: string[], idx: number): void {
    if (idx >= words.length) {
      this.time.delayedCall(600, () => this.onFinalPhraseComplete());
      return;
    }
    const word = words[idx]!;
    const target = new TextWordTarget({
      scene: this,
      word,
      x: this.scale.width / 2,
      y: 540,
      fontSize: 44,
      onComplete: () => {
        playChime();
        // Brighten the Again. text slightly
        const currentAlpha = this.againText.alpha;
        this.tweens.add({
          targets: this.againText,
          alpha: Math.min(1, currentAlpha + 0.05),
          duration: 200,
        });
        // Step up screen brightness overlay
        this.brightnessAlpha = Math.min(0.15, this.brightnessAlpha + 0.02);
        this.screenBrightnessOverlay.clear();
        this.screenBrightnessOverlay.fillStyle(0xffffff, this.brightnessAlpha);
        this.screenBrightnessOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
        this.screenBrightnessOverlay.setAlpha(1);

        this.time.delayedCall(200, () => {
          this.runFinalPhraseWords(words, idx + 1);
        });
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private onFinalPhraseComplete(): void {
    this.clearActiveTargets();

    // White flash
    const whiteFlash = this.add.graphics().setDepth(50);
    whiteFlash.fillStyle(0xffffff, 1);
    whiteFlash.fillRect(0, 0, this.scale.width, this.scale.height);
    whiteFlash.setAlpha(0);

    this.tweens.add({
      targets: whiteFlash,
      alpha: 1,
      duration: 600,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Hold white for 500ms
        this.time.delayedCall(500, () => {
          // Fade to black via camera
          whiteFlash.setAlpha(0);
          this.cameras.main.fadeOut(1000, 0, 0, 0);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => {
              // Mark great battle as cleared
              this.store.update((s) => {
                s.realms["great-battle"] = { cleared: true, choices: {} };
              });
              this.showCredits();
            },
          );
        });
      },
    });
  }

  // ─── Credits ────────────────────────────────────────────────────────────────

  private creditsKeyListenerAdded = false;

  private showCredits(): void {
    this.clearActiveTargets();

    // Destroy all existing game objects
    this.children.each((child) => {
      child.destroy();
    });

    // Rebuild
    this.cameras.main.setBackgroundColor(0x0b0a0f);
    this.cameras.main.fadeIn(500, 11, 10, 15);

    const lines: Array<{
      text: string;
      y: number;
      fontSize: string;
      color: string;
      delay: number;
    }> = [
      {
        text: "The Portalwright's Almanac",
        y: 200,
        fontSize: "52px",
        color: PALETTE.cream,
        delay: 0,
      },
      {
        text: "A story about words and the people who keep them.",
        y: 280,
        fontSize: "28px",
        color: PALETTE.dim,
        delay: 800,
      },
      {
        text: "Co-designed by Aiden.",
        y: 380,
        fontSize: "34px",
        color: "#c8a84b",
        delay: 1600,
      },
      {
        text: "Written and built by Justin.",
        y: 430,
        fontSize: "28px",
        color: PALETTE.dim,
        delay: 2400,
      },
    ];

    for (const line of lines) {
      const txt = this.add
        .text(this.scale.width / 2, line.y, line.text, {
          fontFamily: SERIF,
          fontSize: line.fontSize,
          color: line.color,
          align: "center",
        })
        .setOrigin(0.5)
        .setAlpha(0);

      this.tweens.add({
        targets: txt,
        alpha: 1,
        duration: 800,
        delay: line.delay,
        ease: "Sine.easeOut",
      });
    }

    // "Press any key" — shown after 3 seconds
    const pressAny = this.add
      .text(
        this.scale.width / 2,
        560,
        "Press any key to return to the library.",
        {
          fontFamily: SERIF,
          fontSize: "22px",
          color: "#5a5248",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: pressAny,
      alpha: 1,
      duration: 800,
      delay: 3000,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!this.creditsKeyListenerAdded) {
          this.creditsKeyListenerAdded = true;
          this.input.keyboard?.once("keydown", () => {
            this.scene.start("PortalChamberScene", { store: this.store });
          });
        }
      },
    });
  }

  // ─── Drawing: Castle Background ─────────────────────────────────────────────

  private drawCastleBackground(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Sky gradient: deep ink top (#0b0a0f) to #1a1020 bottom
    const skyG = this.add.graphics().setDepth(0);
    skyG.fillGradientStyle(0x0b0a0f, 0x0b0a0f, 0x1a1020, 0x1a1020, 1);
    skyG.fillRect(0, 0, w, 680);

    // Castle wall: dark grey stone band
    const wallG = this.add.graphics().setDepth(1);
    wallG.fillStyle(0x2a2830, 1);
    wallG.fillRect(0, 680, w, 80);

    // Battlements (crenellations) — rectangular cutouts from top of wall
    const battlementW = 48;
    const battlementH = 36;
    const gapW = 32;
    const totalUnit = battlementW + gapW;
    const count = Math.ceil(w / totalUnit) + 2;
    const merlonColor = 0x2a2830;
    const skyColor = 0x0d0b14;
    for (let i = 0; i < count; i++) {
      const bx = i * totalUnit - gapW;
      // Merlon (solid stone)
      wallG.fillStyle(merlonColor, 1);
      wallG.fillRect(bx, 680 - battlementH, battlementW, battlementH);
      // Embrasure (open gap — draw sky color to "cut" into wall top)
      wallG.fillStyle(skyColor, 1);
      wallG.fillRect(bx + battlementW, 680 - battlementH, gapW, battlementH);
    }

    // Three amber torches on the wall
    const torchXs = [w * 0.2, w * 0.5, w * 0.8];
    for (const tx of torchXs) {
      this.drawTorch(wallG, tx, 700);
    }

    // Courtyard below wall
    const courtG = this.add.graphics().setDepth(1);
    courtG.fillStyle(0x1a1820, 1);
    courtG.fillRect(0, 760, w, h - 760);
  }

  private drawTorch(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // Torch bracket
    g.fillStyle(0x4a4050, 1);
    g.fillRect(x - 5, y - 20, 10, 30);
    // Amber flame rect
    g.fillStyle(0xd4823a, 0.9);
    g.fillRect(x - 6, y - 36, 12, 18);
    // Glow ellipse
    g.fillStyle(0xd4823a, 0.18);
    g.fillEllipse(x, y - 28, 48, 48);
    g.fillStyle(0xd4823a, 0.1);
    g.fillEllipse(x, y - 28, 80, 80);
  }
}
