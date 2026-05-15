import Phaser from "phaser";
import { type AmbientHandle, playAmbientWinter } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, WINTER_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";
import { makeWrenSprite, preloadWren } from "../game/wren";
import winterBackdrop from "../../art/references/winter-mountain-clean.png";

interface WinterSceneData {
  store: SaveStore;
  revisit?: boolean;
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
  isBoss: boolean;
  eye?: Phaser.GameObjects.Graphics;
}

// ─── Act 1 constants ──────────────────────────────────────────────────────────

/** Frozen river exploration beats */
const RIVER_BEATS = ["lift", "step", "duck"] as const;

/** Heldur's typed inscription */
const HELDUR_INSCRIPTION =
  "i am called heldur. i held this pass once. tell me of holdfast.";

/** Runa's cold-decay candle warning (Acts 1→2 transition) */
const COLD_DECAY_NARRATOR =
  "Wren — something moves in the trees. The cold is pressing in. Keep your candles lit.";

/** Interval at which the cold snuffs one candle in Act 1 (ms) */
const COLD_DECAY_INTERVAL_MS = 55_000;

// ─── Act 2 constants ──────────────────────────────────────────────────────────

const WAVE_CANDLES = 3;
const WAVE_CHARGES = 2;
const WOLF_KNOCKBACK_PAUSE_MS = 1500;

const BOSS_PHRASE = "the old one, stirring.";
const BOSS_ADVANCE_MS = 17_000;
const BOSS_SPAWN_X = 1100;
const BOSS_SPAWN_Y = 800;

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
  hasBoss?: boolean;
}

const WAVES: readonly WaveConfig[] = [
  {
    wolfCount: 3,
    advanceMs: 14_000,
    intro:
      "type the wolves' names to drive them back. hold Shift on the first letter to call a thunderclap.",
  },
  {
    wolfCount: 3,
    advanceMs: 11_000,
    intro: "more eyes glint in the dark. the pack tightens.",
  },
  {
    wolfCount: 4,
    advanceMs: 9_000,
    intro: "the snow shifts. they come faster now. something larger watches.",
    hasBoss: true,
  },
];

// ─── Act 3 passages ──────────────────────────────────────────────────────────

const HUNTRESS_PASSAGES = ["free her hands", "she gives you her horn"];
const FIREFLY_PASSAGES = ["follow the lights", "take the lantern"];

/** Passage typed after bury-fork choice */
const BURY_PASSAGES = ["carry the stones", "let him rest here"];
/** Passage typed after pelt-fork choice */
const PELT_PASSAGES = ["claim the pelt", "carry it home"];

/** 70-char realm true-name passage */
const TRUE_NAME_PASSAGE =
  "the winter mountain settles. its old breath warms. the snow rests.";

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

  // Act 1 companion gate — set when the player shows kindness to the fox
  private foxSpared = false;

  // Cold-decay timer active in Act 1
  private coldDecayTimer: Phaser.Time.TimerEvent | null = null;
  // True once the combat candle-stake system takes over (Act 2+)
  private combatCandlesActive = false;

  // Fork 1 result — tracked for snow-fox compound gate
  private fork1Choice: "huntress" | "firefly" | null = null;
  // Fork 2 result
  private fork2Choice: "bury" | "pelt" | null = null;

  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("WinterMountainScene");
  }

  init(data: WinterSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.wolves = [];
    this.activeTargets = [];
    this.candles = WAVE_CANDLES;
    this.charges = WAVE_CHARGES;
    this.shiftHeld = false;
    this.waveActive = false;
    this.waveIndex = 0;
    this.foxSpared = false;
    this.coldDecayTimer = null;
    this.combatCandlesActive = false;
    this.fork1Choice = null;
    this.fork2Choice = null;
  }

  preload(): void {
    this.load.image("winter-backdrop", winterBackdrop);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.add.image(0, 0, "winter-backdrop").setOrigin(0).setDepth(-100);
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
      this.coldDecayTimer?.remove();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
      this.ambientHandle?.stop();
    });

    this.ambientHandle = playAmbientWinter();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.startAct1();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVISIT MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private startRevisit(): void {
    const choices = this.store.get().realms["winter-mountain"]?.choices ?? {};
    let narratorLine: string;
    let words: string[];

    if (choices["fork2"] === "bury") {
      narratorLine = "The cairn is still standing.";
      words = ["the", "snow", "keeps", "the", "quiet"];
    } else if (choices["fork2"] === "pelt") {
      narratorLine = "The mountain remembers the weight you carried.";
      words = ["the", "old", "one", "rests", "now"];
    } else {
      narratorLine = "The mountain is quieter than you left it.";
      words = ["cold,", "and", "still,", "and", "clean"];
    }

    this.setNarrator(narratorLine);
    this.time.delayedCall(2400, () => this.deliverRevisitPassage(words));
  }

  private deliverRevisitPassage(words: string[]): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= words.length) {
        this.time.delayedCall(800, () => {
          this.cameras.main.fadeOut(700, 11, 10, 15);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => this.scene.start("PortalChamberScene", { store: this.store }),
          );
        });
        return;
      }
      const word = words[idx];
      if (word === undefined) return;
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 260,
        fontSize: 44,
        onComplete: () => {
          playChime();
          idx += 1;
          this.typingInput.unregister(target);
          this.time.delayedCall(200, advance);
        },
      });
      this.typingInput.register(target);
    };
    advance();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1 — Down the Foothills
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct1(): void {
    this.setNarrator(
      "The portal closes behind you. Snow muffles the world. The frozen river stretches ahead.",
    );
    this.time.delayedCall(2600, () => this.runRiverBeats(0));
  }

  /** Three short exploration beats: lift / step / duck */
  private runRiverBeats(idx: number): void {
    if (idx >= RIVER_BEATS.length) {
      this.time.delayedCall(800, () => this.startHeldur());
      return;
    }
    const beat = RIVER_BEATS[idx];
    const narrations: readonly string[] = [
      "A fallen pine blocks the path.",
      "The ice looks thin here. Place your feet carefully.",
      "A low branch catches the light. Duck under it.",
    ];
    this.setNarrator(narrations[idx]);
    const target = new TextWordTarget({
      scene: this,
      word: beat,
      x: this.scale.width / 2,
      y: this.scale.height - 260,
      fontSize: 44,
      onComplete: () => {
        playChime();
        this.time.delayedCall(700, () => this.runRiverBeats(idx + 1));
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  /** The Wayshrine Knight — Heldur */
  private startHeldur(): void {
    this.setNarrator(
      "An old wayshrine. A knight stands frozen over it, armored in frost.",
    );
    this.time.delayedCall(2200, () => {
      this.setNarrator(
        "Words are carved into the stone. Type them, and he will hear you.",
      );
      const target = new TextWordTarget({
        scene: this,
        word: HELDUR_INSCRIPTION,
        x: this.scale.width / 2,
        y: this.scale.height - 260,
        fontSize: 30,
        onComplete: () => {
          playChime();
          this.onHeldurSpoken();
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  private onHeldurSpoken(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "The knight's eyes open. He tells you of a hundred years without a Portalwright. Then the frost returns.",
    );
    // Almanac lore page 1 unlocked
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-hundred-quiet-years")) {
        s.almanacLore.push("the-hundred-quiet-years");
      }
    });
    this.time.delayedCall(3000, () => this.startColdDecay());
  }

  /** Edge of the Dark Wood — cold-decay candle mechanic begins */
  private startColdDecay(): void {
    this.setNarrator(COLD_DECAY_NARRATOR);
    // Candles are visible from the start; now they start dimming
    this.startColdDecayTimer();
    // First `kindle` prompt — gives Aiden ~3s to read before timer fires
    this.time.delayedCall(3200, () => this.promptKindle());
  }

  private startColdDecayTimer(): void {
    this.coldDecayTimer = this.time.addEvent({
      delay: COLD_DECAY_INTERVAL_MS,
      callback: () => {
        if (this.combatCandlesActive) return;
        this.snuffCandle(false);
      },
      loop: true,
    });
  }

  private promptKindle(): void {
    if (this.combatCandlesActive) return;
    this.setNarrator(
      "The cold dims your light. Type 'kindle' to keep the candles burning.",
    );
    const target = new TextWordTarget({
      scene: this,
      word: "kindle",
      x: this.scale.width / 2,
      y: this.scale.height - 260,
      fontSize: 40,
      onComplete: () => {
        playChime();
        this.restoreCandles();
        this.setNarrator("The flames steady. Press on.");
        this.time.delayedCall(1800, () => this.transitionToAct2());
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private restoreCandles(): void {
    this.candles = WAVE_CANDLES;
    this.redrawCandles();
  }

  private transitionToAct2(): void {
    this.clearActiveTargets();
    this.coldDecayTimer?.remove();
    this.coldDecayTimer = null;
    this.combatCandlesActive = true;
    this.candles = WAVE_CANDLES;
    this.redrawCandles();
    this.startWave(0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 2 — Through the Pack
  // ═══════════════════════════════════════════════════════════════════════════

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

    if (config.hasBoss) {
      this.spawnBoss();
    }
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
      isBoss: false,
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

  private spawnBoss(): void {
    const startX = -200;
    const container = this.add.container(startX, BOSS_SPAWN_Y);
    container.setScale(1.6);
    const eye = this.drawBossInto(container);
    container.setAlpha(0);

    const boss: Wolf = {
      container,
      target: null,
      spawnX: BOSS_SPAWN_X,
      restY: BOSS_SPAWN_Y,
      word: BOSS_PHRASE,
      defeated: false,
      advanceTween: null,
      advanceMs: BOSS_ADVANCE_MS,
      isBoss: true,
      eye,
    };

    this.tweens.add({
      targets: container,
      x: BOSS_SPAWN_X,
      alpha: 1,
      duration: 1100,
      delay: 600,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!this.waveActive || boss.defeated) return;
        this.idleBob(container);
        this.startWolfAdvance(boss);
      },
    });

    this.wolves.push(boss);
  }

  private releaseBossWard(boss: Wolf): void {
    if (boss.target || boss.defeated) return;
    // Snow-drift sensory beat: 2s of falling snow obscures words briefly
    this.triggerSnowDrift(() => {
      this.setNarrator("the pack leader rises. type its name to fell it.");
      if (boss.eye) {
        boss.eye.clear();
        boss.eye.fillStyle(0xffd277, 1);
        boss.eye.fillCircle(36, -10, 4);
      }
      this.cameras.main.shake(180, 0.003);
      this.attachWolfTarget(boss);
    });
  }

  private triggerSnowDrift(onDone: () => void): void {
    // Overlay a translucent white rect that fades in and out over 2s
    const overlay = this.add.graphics();
    overlay.fillStyle(0xe8f0f8, 1);
    overlay.fillRect(0, 0, this.scale.width, this.scale.height);
    overlay.setAlpha(0).setDepth(10);
    this.tweens.add({
      targets: overlay,
      alpha: 0.7,
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration: 600,
            ease: "Sine.easeIn",
            onComplete: () => {
              overlay.destroy();
              onDone();
            },
          });
        });
      },
    });
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
      if (wolf.isBoss) {
        this.setNarrator("the old one slumps. the trail breathes again.");
        this.time.delayedCall(2200, () => this.onBossDefeated());
      } else {
        this.time.delayedCall(900, () => this.onWaveCleared());
      }
      return;
    }

    // Release boss ward when all regular wolves are down
    const boss = this.wolves.find((w) => w.isBoss);
    if (boss && !boss.defeated && !boss.target) {
      const regularsAllDown = this.wolves
        .filter((w) => !w.isBoss)
        .every((w) => w.defeated);
      if (regularsAllDown) this.releaseBossWard(boss);
    }
  }

  private onWaveCleared(): void {
    const nextIdx = this.waveIndex + 1;

    // Between wave 1 and wave 2: Wounded Fox beat
    if (this.waveIndex === 0) {
      this.startWoundedFox(nextIdx);
      return;
    }

    // Between wave 2 and wave 3: CYOA Fork 1
    if (this.waveIndex === 1) {
      this.startFork1(nextIdx);
      return;
    }

    // Should not reach here in normal flow — boss defeat handles Act 3
    if (nextIdx < WAVES.length) {
      this.time.delayedCall(1800, () => this.startWave(nextIdx));
    }
  }

  // ─── Wounded Fox (between Wave 1 and Wave 2) ─────────────────────────────

  private startWoundedFox(nextWave: number): void {
    this.setNarrator(
      "A clearing. A small white fox curled in the snow — hurt. She watches you with one open eye.",
    );

    const kindTarget = new TextWordTarget({
      scene: this,
      word: "i mean no harm",
      x: this.scale.width / 2 - 320,
      y: this.scale.height - 220,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = true;
        this.setNarrator(
          "The fox's ear tilts. She watches you from the treeline as you move on.",
        );
        this.time.delayedCall(2200, () => this.startWave(nextWave));
      },
    });

    const hurtTarget = new TextWordTarget({
      scene: this,
      word: "i don't have time",
      x: this.scale.width / 2 + 320,
      y: this.scale.height - 220,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = false;
        this.setNarrator("The fox vanishes into the snow. The trail is quiet.");
        this.time.delayedCall(1800, () => this.startWave(nextWave));
      },
    });

    this.typingInput.register(kindTarget);
    this.typingInput.register(hurtTarget);
    this.activeTargets.push(kindTarget, hurtTarget);
  }

  // ─── CYOA Fork 1 (after Wave 2, before Wave 3) ───────────────────────────

  private startFork1(nextWave: number): void {
    this.setNarrator(
      "The trail forks. Someone calls from the drift to your left. A trail of fireflies hovers to your right.",
    );

    const huntress = new TextWordTarget({
      scene: this,
      word: "save the huntress",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => {
        this.fork1Choice = "huntress";
        this.startHuntressBranch(nextWave);
      },
    });
    const firefly = new TextWordTarget({
      scene: this,
      word: "follow the fireflies",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => {
        this.fork1Choice = "firefly";
        this.startFireflyBranch(nextWave);
      },
    });
    this.typingInput.register(huntress);
    this.typingInput.register(firefly);
    this.activeTargets.push(huntress, firefly);
  }

  private startHuntressBranch(nextWave: number): void {
    this.clearActiveTargets();
    this.setNarrator("A woman, half-buried in snow, lifts her head as you approach.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        HUNTRESS_PASSAGES,
        [
          "She speaks a few words in the wolf-tongue. The howls behind you fade.",
          "She presses a spiral horn into your hand and gestures uphill.",
        ],
        () => this.startWave(nextWave),
      );
    });
  }

  private startFireflyBranch(nextWave: number): void {
    this.clearActiveTargets();
    this.setNarrator("Three fireflies hover at eye level, then dart up the slope.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        FIREFLY_PASSAGES,
        [
          "The lights bob between the pines, patient, waiting for you.",
          "They settle inside a paper lantern hidden in a hollow tree.",
        ],
        () => this.startWave(nextWave),
      );
    });
  }

  // ─── Stakes: wolf reaches Wren ───────────────────────────────────────────

  private wolfReachesWren(wolf: Wolf): void {
    this.cameras.main.shake(220, 0.005);
    this.snuffCandle(true);

    if (!this.waveActive) return;

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

  /**
   * @param combat - true means a wolf knocked it out (wave-reset on 0);
   *                 false means cold-decay in Act 1 (no wave reset).
   */
  private snuffCandle(combat: boolean): void {
    this.candles = Math.max(0, this.candles - 1);
    this.redrawCandles();
    if (combat && this.candles === 0) {
      this.resetWave();
    }
  }

  private resetWave(): void {
    if (!this.waveActive) return;
    this.waveActive = false;
    this.setNarrator("the dark presses in. steady your hands and try again.");

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
      this.startWave(this.waveIndex);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3 — The Boss Aftermath
  // ═══════════════════════════════════════════════════════════════════════════

  private onBossDefeated(): void {
    // Quiet Lord fragment ~~A~~ scratched text flash
    this.flashQuietLordFragment("A");
    this.time.delayedCall(1600, () => this.startFork2());
  }

  /** Renders a brief strikethrough-text flash in the centre of the screen */
  private flashQuietLordFragment(fragment: string): void {
    const text = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 80, `~~${fragment}~~`, {
        fontFamily: SERIF,
        fontSize: "56px",
        color: PALETTE.dim,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20);

    this.tweens.add({
      targets: text,
      alpha: 0.85,
      duration: 300,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 400,
            onComplete: () => text.destroy(),
          });
        });
      },
    });
  }

  /** Fork 2 — Aftermath: bury under cairn stones OR take the pelt */
  private startFork2(): void {
    this.setNarrator(
      "The pack leader is still. What do you do?",
    );

    const buryTarget = new TextWordTarget({
      scene: this,
      word: "bury the pack leader",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 220,
      fontSize: 30,
      onComplete: () => {
        this.fork2Choice = "bury";
        this.clearActiveTargets();
        this.runPassageChain(
          BURY_PASSAGES,
          [
            "Stone by stone, you build the cairn. The mountain is quiet.",
            "The pack will not follow here again.",
          ],
          () => this.startFoxGate(),
        );
      },
    });

    const peltTarget = new TextWordTarget({
      scene: this,
      word: "take the pelt",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 220,
      fontSize: 30,
      onComplete: () => {
        this.fork2Choice = "pelt";
        this.clearActiveTargets();
        this.runPassageChain(
          PELT_PASSAGES,
          [
            "The old one's pelt is heavy with winter. You roll it carefully.",
            "It smells of frost and old forests. It will mean something at the battle.",
          ],
          () => this.startFoxGate(),
        );
      },
    });

    this.typingInput.register(buryTarget);
    this.typingInput.register(peltTarget);
    this.activeTargets.push(buryTarget, peltTarget);
  }

  /** Snow-fox companion gate — only if all three kindness conditions met.
   *  Two out of three gets a specific near-miss line from Runa so the player
   *  understands what they'd change on a replay, without being punished. */
  private startFoxGate(): void {
    const condFox      = this.foxSpared;
    const condHuntress = this.fork1Choice === "huntress";
    const condBury     = this.fork2Choice === "bury";
    const foxEarned    = condFox && condHuntress && condBury;

    if (!foxEarned) {
      const metCount = [condFox, condHuntress, condBury].filter(Boolean).length;
      if (metCount === 2) {
        // Near-miss: acknowledge specifically what was one step away
        let nearMissLine: string;
        if (!condFox) {
          // Fox was never spared — she can't return
          nearMissLine =
            "You made this place kinder than you found it. But there was a fox in the snow on the way up — she would have followed you home, if you had paused for her.";
        } else if (!condHuntress) {
          // Firefly branch taken — fox returns but looks for Sigrid
          nearMissLine =
            "The fox steps into the clearing, nose working. She looks past you — searching for something, or someone. She waits a long moment. Then turns back into the pines.";
        } else {
          // Pelt taken — fox sees what Wren carries and steps away
          nearMissLine =
            "The fox pads to the clearing's edge. Her eye finds the pelt in your hands. She holds very still. Then she steps back. She is gone.";
        }
        this.setNarrator(nearMissLine);
        this.time.delayedCall(3200, () => this.startTrueNamePassage());
      } else {
        this.startTrueNamePassage();
      }
      return;
    }

    this.setNarrator(
      "The small white fox pads back into the clearing. She watches you steadily.",
    );

    const whisperTarget = new TextWordTarget({
      scene: this,
      word: "whisper to her",
      x: this.scale.width / 2 - 260,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.store.update((s) => {
          if (!s.satchel.includes("snow-fox-cub")) s.satchel.push("snow-fox-cub");
        });
        this.setNarrator("She steps forward. Her nose brushes your hand. She is coming with you.");
        this.time.delayedCall(2400, () => this.startTrueNamePassage());
      },
    });

    const letGoTarget = new TextWordTarget({
      scene: this,
      word: "let her go",
      x: this.scale.width / 2 + 260,
      y: this.scale.height - 220,
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.setNarrator("She holds your gaze a moment longer. Then she slips into the pines.");
        this.time.delayedCall(2000, () => this.startTrueNamePassage());
      },
    });

    this.typingInput.register(whisperTarget);
    this.typingInput.register(letGoTarget);
    this.activeTargets.push(whisperTarget, letGoTarget);
  }

  /** The realm's true-name passage — 70-char long-form climax */
  private startTrueNamePassage(): void {
    this.setNarrator(
      "The mountain speaks. Listen, and type back what it says.",
    );
    this.time.delayedCall(1800, () => {
      const target = new TextWordTarget({
        scene: this,
        word: TRUE_NAME_PASSAGE,
        x: this.scale.width / 2,
        y: this.scale.height - 260,
        fontSize: 28,
        onComplete: () => {
          playChime();
          this.time.delayedCall(800, () => this.startEnding());
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.setNarrator("You return to the portal. The Almanac stamps a new page.");

    this.store.update((s) => {
      s.realms["winter-mountain"] = {
        cleared: true,
        choices: {
          fox: this.foxSpared ? "spared" : "ignored",
          fork1: this.fork1Choice ?? "none",
          fork2: this.fork2Choice ?? "none",
        },
      };
      const fork1Relic = this.fork1Choice === "huntress" ? "hunters-horn" : "firefly-lantern";
      const fork2Relic = this.fork2Choice === "bury" ? "cairn-token" : "pelt-of-the-old-one";
      if (!s.satchel.includes(fork1Relic)) s.satchel.push(fork1Relic);
      if (!s.satchel.includes(fork2Relic)) s.satchel.push(fork2Relic);
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => this.scene.start("PortalChamberScene", { store: this.store }),
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

  // ─── Shared utilities ─────────────────────────────────────────────────────

  /**
   * Run an alternating sequence: typed passage → narrator line → … → onDone.
   */
  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
  ): void {
    let step = 0;

    const advance = (): void => {
      if (step >= passages.length) {
        this.time.delayedCall(1400, onDone);
        return;
      }
      const target = new TextWordTarget({
        scene: this,
        word: passages[step],
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

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Shift") {
      this.setShiftHeld(true);
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    const spell = this.shiftHeld && this.charges > 0 && this.waveActive;
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
      g.fillStyle(0xe8dcb5, 1);
      g.fillRect(x - 4, -10, 8, 28);
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
    this.updateWrenGlow();
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    this.wrenGlow = this.add.graphics();
    this.wrenGlow.fillStyle(PALETTE_HEX.brass, 1);
    this.wrenGlow.fillCircle(0, -40, 60);
    this.wrenGlow.setAlpha(0);
    c.add(this.wrenGlow);

    c.add(makeWrenSprite(this));
    return c;
  }

  private drawWolfInto(c: Phaser.GameObjects.Container, facingLeft: boolean): void {
    const g = this.add.graphics();
    const flip = facingLeft ? -1 : 1;
    g.fillStyle(0x1a1a22, 1);
    g.fillEllipse(0, 0, 80, 30);
    g.fillEllipse(flip * 30, -10, 30, 22);
    g.fillTriangle(flip * 24, -22, flip * 30, -32, flip * 36, -22);
    g.fillTriangle(flip * 32, -22, flip * 38, -32, flip * 44, -22);
    g.fillEllipse(flip * -36, -10, 22, 8);
    g.fillRect(-14, 12, 5, 14);
    g.fillRect(10, 12, 5, 14);
    g.fillStyle(0xd6754a, 0.9);
    g.fillCircle(flip * 36, -10, 2.5);
    c.add(g);
  }

  private drawBossInto(c: Phaser.GameObjects.Container): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x2a2832, 1);
    g.fillEllipse(0, 0, 100, 38);
    g.fillEllipse(36, -12, 38, 28);
    g.fillTriangle(28, -28, 36, -42, 44, -28);
    g.fillTriangle(40, -28, 48, -42, 56, -28);
    g.fillEllipse(-46, -10, 28, 10);
    g.fillRect(-18, 16, 6, 18);
    g.fillRect(12, 16, 6, 18);
    g.fillStyle(PALETTE_HEX.brass, 0.7);
    g.fillRect(-22, -16, 40, 3);
    g.lineStyle(2, PALETTE_HEX.brass, 0.85);
    g.strokeCircle(30, -8, 16);
    c.add(g);

    const eye = this.add.graphics();
    eye.fillStyle(0xd6754a, 0.85);
    eye.fillCircle(36, -10, 3);
    c.add(eye);
    return eye;
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
