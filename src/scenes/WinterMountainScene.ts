import Phaser from "phaser";
import { type AmbientHandle, playAmbientWinter } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { flashDamageVignette } from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
import { NarrationManager } from "../game/narrationManager";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { ConsoleBand } from "../game/ui/consoleBand";
import runaPortrait from "../../art/runa/runa-front.png";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import type { SaveStore } from "../game/saveState";
import { SPELL_COST } from "../game/sessionStats";
import { TypingInputController } from "../game/typingInput";
import { WaveDirector } from "../game/waveDirector";
import {
  candleAfterCleanWave,
  candleAfterHit,
  CANDLE_RESET_FLOOR,
  circlerY,
} from "../game/winterMechanics";
import { MovingWordEnemy } from "../game/movingWordEnemy";
import {
  addAmbientDrift,
  addContainerWake,
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  playRealmClearResonance,
  stageContainerEntrance,
  stageAnchoredSprite,
} from "../game/livingScene";
import { pickAdaptiveWords, WINTER_WORD_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  makeHeldurSprite,
  makeHuntressSprite,
  preloadWinterNpcs,
} from "../game/winterNpcs";
import { makeWolfSprite, preloadWolves } from "../game/wolf";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, playWrenAction, preloadWren, setWrenPose } from "../game/wren";
import winterBackdrop from "../../art/references/winter-mountain-clean.png";

// Danger ramps in over the LAST 60% of a wolf's advance — earlier portion
// stays cream so players can read the word, then it shifts red as the wolf
// closes. Tweak this constant to make the warning earlier or later.
const DANGER_RAMP_START = 0.4;

interface WinterSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// Wolves (and the Pack-Leader boss) are now the shared MovingWordEnemy. The boss
// is tracked separately (this.boss) so the pack-vs-boss gate and its body-sprite
// ward flash stay legible.

// ─── Act 1 constants ──────────────────────────────────────────────────────────

/** Frozen river exploration beats */
const RIVER_BEATS = ["lift", "step", "duck"] as const;

/** Wren's side of the Heldur exchange — short prompts the player types as
 *  Wren's question/word, not Heldur's words. Each pairs with a narrator
 *  cue and a spoken response that surfaces above the knight. */
const HELDUR_QUESTIONS = ["name", "story", "Holdfast"] as const;

/** Narrator prompt that precedes each typed question, framing what Wren is
 *  about to ask. */
const HELDUR_NARRATOR_PROMPTS = [
  "Ask his name.",
  "Ask his story.",
  "Speak the name he last guarded.",
] as const;

/** Heldur's spoken responses — appear in dialog above the knight after each
 *  question is typed. Proper capitalization + quotes because they're speech. */
const HELDUR_RESPONSES = [
  "I am called Heldur.",
  "I held this pass once. A hundred years now.",
  "Holdfast...",
] as const;

// COLD_DECAY_NARRATOR moved into runaLines.ts as winter_cold_decay (Connection Pass).

/** Interval at which the cold snuffs one candle in Act 1 (ms) */
const COLD_DECAY_INTERVAL_MS = 55_000;

// ─── Act 2 constants ──────────────────────────────────────────────────────────

const WAVE_CANDLES = 3;
// Thunder is no longer a per-wave refill — it's bought with Soul (SPELL_COST
// each). This is just how many pips the "thunder" row draws: SOUL_MAX/SPELL_COST.
const WAVE_CHARGES = 2;
const WOLF_KNOCKBACK_PAUSE_MS = 1500;

// The Old One's true name is SPOKEN with its capitals — caseSensitive, so the
// caps demand Shift (required typing, free). Starts lowercase so the claim
// captures no Shift (else the first-letter Shift would fire the thunderclap
// spell instead of claiming — same lowercase-first trick as the Forge commands).
const BOSS_PHRASE = "the Old One, STIRRING.";
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
  /** Spawn all wolves at the same instant (no stagger). Used by the paired
   *  Wave 2 — both wolves arrive together so the player must split
   *  attention between two targets instead of handling them one at a time. */
  simultaneous?: boolean;
  /** Boss spawn delay (ms) override. Default 600 — used by Wave 3 to make
   *  the alpha visible from the moment the pack arrives, not after. */
  bossSpawnDelayMs?: number;
}

// Three waves, three distinct encounter shapes (not "more wolves faster"):
//
//   Wave 1 — Solo. One wolf, slow advance. The player learns the verb
//            without panic. Long word so adaptive picking can stretch.
//   Wave 2 — Paired alternation. Two wolves arrive at the same instant,
//            forcing the player to split attention between two
//            advancing targets at once.
//   Wave 3 — Pack with alpha. Three regular wolves plus the named
//            alpha (Pack-Leader) visible from the start of the wave —
//            the alpha lurks unclaimable until the pack falls, then
//            engages with its long titled phrase.
const WAVES: readonly WaveConfig[] = [
  {
    wolfCount: 1,
    advanceMs: 16_000,
    intro:
      "one wolf, alone in the trees. type its name to drive it back. hold Shift on the first letter for a thunderclap.",
  },
  {
    wolfCount: 2,
    advanceMs: 12_500,
    intro: "two more — together, this time. they come as a pair.",
    simultaneous: true,
  },
  {
    wolfCount: 3,
    advanceMs: 9_500,
    intro: "the pack closes. something larger watches from behind them.",
    hasBoss: true,
    bossSpawnDelayMs: 200,
  },
];

// ─── Act 3 passages ──────────────────────────────────────────────────────────

const HUNTRESS_PASSAGES = ["free her hands", "she gives you her horn"];
const FIREFLY_PASSAGES = ["follow the lights", "take the lantern"];

/** Passage typed after bury-fork choice */
const BURY_PASSAGES = ["carry the stones", "let him rest here"];
/** Passage typed after pelt-fork choice */
const PELT_PASSAGES = ["claim the pelt", "carry it home"];

/** Realm-clear true-name passage — three short lines instead of one
 *  65-char block. The mountain "settles" line by line as Wren names it. */
const TRUE_NAME_LINES = [
  "the winter mountain settles",
  "its old breath warms",
  "the snow rests",
] as const;

const TRUE_NAME_REACTIONS = [
  "The wind drops by half.",
  "Color creeps back into the stones.",
  "",
] as const;

export class WinterMountainScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private director!: WaveDirector;
  private narration!: NarrationManager;
  private wolves: MovingWordEnemy[] = [];
  /** The Pack-Leader, also a wolf in `this.wolves`; held separately for the
   *  pack-cleared ward gate and the body-sprite tint on release. */
  private boss: MovingWordEnemy | null = null;
  private bossBodySprite: Phaser.GameObjects.Image | null = null;
  private activeTargets: TextWordTarget[] = [];

  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenGlow!: Phaser.GameObjects.Graphics;
  private wrenSprite!: Phaser.GameObjects.Image;
  private hurtPoseTimer: Phaser.Time.TimerEvent | null = null;
  private heldurSprite: Phaser.GameObjects.Image | null = null;
  private heldurDialogText: Phaser.GameObjects.Text | null = null;
  private huntressSprite: Phaser.GameObjects.Image | null = null;
  private candleGroup!: Phaser.GameObjects.Container;
  private chargeGroup!: Phaser.GameObjects.Container;

  private candles = WAVE_CANDLES;
  // How many thunderclaps the current Soul can afford — derived from Soul
  // (floor(soul / SPELL_COST)), cached so the pip row only redraws on change.
  private castableThunder = 0;
  private shiftHeld = false;
  private altHeld = false;
  /** Did a wolf snuff a candle this wave? Drives the clean-wave relight. */
  private tookCandleHitThisWave = false;
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
  /** True after the Quiet Lord's §5.5.10 intrusion has fired this playthrough. */
  private quietLordIntruded = false;

  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("WinterMountainScene");
  }

  init(data: WinterSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    // Stale sprite references from a previous visit point at destroyed
    // GameObjects; clear them so fadeInHeldur/fadeInHuntress create fresh ones.
    this.heldurSprite = null;
    this.heldurDialogText = null;
    this.huntressSprite = null;
    this.wolves = [];
    this.boss = null;
    this.bossBodySprite = null;
    this.activeTargets = [];
    this.candles = WAVE_CANDLES;
    this.castableThunder = 0;
    this.shiftHeld = false;
    this.altHeld = false;
    this.tookCandleHitThisWave = false;
    this.waveActive = false;
    this.waveIndex = 0;
    this.foxSpared = false;
    this.coldDecayTimer = null;
    this.combatCandlesActive = false;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.quietLordIntruded =
      this.store.get().realms["winter-mountain"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("winter-backdrop", winterBackdrop);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadWren(this);
    preloadWolves(this);
    preloadWinterNpcs(this);
  }

  create(): void {
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.add
      .image(0, 0, "winter-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addAmbientDrift(this, {
      kind: "snow",
      count: 70,
      depth: -2,
      area: { x: 0, y: 0, width: this.scale.width, height: 840 },
      alpha: 0.5,
      minSize: 2,
      maxSize: 6,
      driftX: -260,
      driftY: 620,
      minDurationMs: 5200,
      maxDurationMs: 10500,
    });
    this.wrenContainer = this.drawWren(this.scale.width / 2, 880);

    // UI cohesion — the console band houses the meters + Winter's candle/thunder
    // status. Realm 1 has no satchel, so those dock in the satchel zone.
    const band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: [],
      satchelLabel: "",
    });

    this.narration = new NarrationManager(this, { y: 160, framed: true });

    // Candle + thunder meters dock into the band's satchel zone (above the band
    // surface, so depth > the band's DEPTH).
    this.candleGroup = this.add
      .container(band.satchelAnchor.x + 90, band.satchelAnchor.y)
      .setDepth(1500);
    this.chargeGroup = this.add
      .container(band.satchelAnchor.x + 370, band.satchelAnchor.y)
      .setDepth(1500);
    this.redrawCandles();
    this.redrawCharges();

    // Small italic labels above each cluster — "candles" mirrors the narrator's
    // language ("Keep your candles lit"); "thunder" matches the thunderclap spell.
    const hudLabelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: SERIF,
      fontSize: "15px",
      fontStyle: "italic",
      color: "#a59b89",
    };
    this.add
      .text(band.satchelAnchor.x + 90, band.satchelAnchor.y - 38, "candles", hudLabelStyle)
      .setOrigin(0.5)
      .setDepth(1500);
    this.add
      .text(band.satchelAnchor.x + 370, band.satchelAnchor.y - 38, "thunder", hudLabelStyle)
      .setOrigin(0.5)
      .setDepth(1500);

    this.typingInput = new TypingInputController(this.store);
    this.director = new WaveDirector(this.typingInput.getStats());
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => {
        bobWrenSprite(this.wrenSprite);
        // A clean keystroke filled Soul — the thunder pips may have ticked up.
        this.refreshThunderPips();
      },
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      getCombo: () => this.typingInput.getStats().getCombo(),
      getCastReady: () => this.typingInput.getStats().canCast(SPELL_COST),
      onSustainedLowHeart: () => this.setNarrator(pickLowHeartLine().text),
      anchor: band.metersAnchor,
      plate: false,
    });
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
      const target = this.makeWord({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
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
    this.narration.say("winter_intro_arrival");
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
    const target = this.makeWord({
      scene: this,
      word: beat,
      x: this.scale.width / 2,
      y: this.scale.height / 2,
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
    this.narration.say("winter_wayshrine_intro");
    this.fadeInHeldur();
    this.time.delayedCall(1800, () => this.runHeldurExchange(0));
  }

  /** A back-and-forth where Wren types a short question and Heldur answers
   *  in dialog above him. After the third exchange, the eye-open flash
   *  fires and the scene moves on to cold-decay. */
  private runHeldurExchange(idx: number): void {
    if (idx >= HELDUR_QUESTIONS.length) {
      this.narration.say("winter_heldur_eyes_open");
      if (this.heldurSprite) {
        this.heldurSprite.setTintFill(0xffd277);
        this.time.delayedCall(180, () => this.heldurSprite?.clearTint());
      }
      this.time.delayedCall(1800, () => {
        this.clearHeldurDialog();
        this.onHeldurSpoken();
      });
      return;
    }

    this.setNarrator(HELDUR_NARRATOR_PROMPTS[idx]);
    this.clearHeldurDialog();

    const target = this.makeWord({
      scene: this,
      word: HELDUR_QUESTIONS[idx],
      x: this.scale.width / 2,
      y: this.scale.height / 2 + 40,
      fontSize: 44,
      onComplete: () => {
        playClack();
        this.clearActiveTargets();
        this.setHeldurDialog(HELDUR_RESPONSES[idx]);
        this.time.delayedCall(1800, () => this.runHeldurExchange(idx + 1));
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  /** Heldur's spoken line floats over his head with quotes so it reads as
   *  speech, not narration. Replaces any prior dialog cleanly. */
  private setHeldurDialog(text: string): void {
    if (!this.heldurSprite) return;
    if (!this.heldurDialogText) {
      this.heldurDialogText = this.add
        .text(this.heldurSprite.x, 540, "", {
          fontFamily: SERIF,
          fontSize: "28px",
          color: PALETTE.cream,
          align: "center",
          wordWrap: { width: 520 },
        })
        .setOrigin(0.5, 1);
    }
    this.heldurDialogText.setText(`"${text}"`).setAlpha(0);
    this.tweens.add({
      targets: this.heldurDialogText,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  private clearHeldurDialog(): void {
    if (!this.heldurDialogText) return;
    const t = this.heldurDialogText;
    this.heldurDialogText = null;
    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 350,
      ease: "Sine.easeIn",
      onComplete: () => t.destroy(),
    });
  }

  private onHeldurSpoken(): void {
    this.clearActiveTargets();
    // Almanac lore pages 1 + 5 — Heldur's history + the wayshrine carvings
    // beneath it. Both fire on the same beat per §5.5.6.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-hundred-quiet-years")) {
        s.almanacLore.push("the-hundred-quiet-years");
      }
      if (!s.almanacLore.includes("wayshrine-runes")) {
        s.almanacLore.push("wayshrine-runes");
      }
    });
    playChime();
    this.time.delayedCall(800, () => this.fadeOutHeldur());
    this.time.delayedCall(1400, () => this.startColdDecay());
  }

  private fadeInHeldur(): void {
    if (this.heldurSprite) return;
    this.heldurSprite = makeHeldurSprite(this);
    // Place Heldur on the path to the left of where Wren stands, near the
    // ruined wayshrine arch in the painted backdrop.
    this.heldurSprite.setPosition(420, 920);
    stageAnchoredSprite(this, this.heldurSprite, {
      shadowWidth: 132,
      shadowHeight: 24,
      shadowAlpha: 0.28,
      entranceOffsetY: 20,
      entranceMs: 760,
      breathDy: -3,
      breathMs: 2400,
    });
  }

  private fadeOutHeldur(): void {
    if (!this.heldurSprite) return;
    const sprite = this.heldurSprite;
    this.heldurSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  /** Edge of the Dark Wood — cold-decay candle mechanic begins */
  private startColdDecay(): void {
    this.narration.say("winter_cold_decay");
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
    this.narration.say("winter_kindle_prompt");
    const target = this.makeWord({
      scene: this,
      word: "kindle",
      x: this.scale.width / 2,
      y: this.scale.height / 2,
      fontSize: 40,
      onComplete: () => {
        playChime();
        this.restoreCandles();
        this.narration.say("winter_kindle_steady");
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
    this.tookCandleHitThisWave = false;
    this.wolves = [];
    this.boss = null;
    this.bossBodySprite = null;
    // Thunder no longer refills per wave — it carries over as banked Soul, so
    // a fast clean wave can stockpile casts and a sloppy one starts dry.
    this.refreshThunderPips();
    const config = WAVES[idx];
    this.setNarrator(config.intro);

    // Wave-start bookend — audio sting + screen shake so each wave feels
    // like an event, not just "more text appears."
    playWaveSting();
    this.cameras.main.shake(220, 0.005);

    // Speed-axis director: a fast, accurate typist draws faster-closing wolves
    // and longer words on EVERY wave — the floor rises to meet them, all bounded
    // by the director's tier cap. Concurrency escalates only on the pack wave,
    // the one whose narration ("the pack closes") supports a variable count; the
    // solo opener and the named pair state their counts in dialogue, so they
    // keep them (and still escalate on advance-speed + word-length).
    const advanceMs = this.director.advanceMs(config.advanceMs);
    const minLength = this.director.wordLengthBias();
    const wolfCount = config.hasBoss
      ? Math.min(this.director.enemyCount(config.wolfCount), SPAWN_SLOTS.length)
      : config.wolfCount;

    const slots = shuffle(SPAWN_SLOTS).slice(0, wolfCount);
    const words = pickAdaptiveWords(
      WINTER_WORD_BANK,
      wolfCount,
      this.store.get().keyStats,
      minLength,
    );

    slots.forEach((pos, i) => {
      const fromLeft = pos.x < this.scale.width / 2;
      const startX = fromLeft ? -120 : this.scale.width + 120;
      // Wave 2 (paired alternation) spawns both wolves at the same instant
      // — `simultaneous` zeroes the per-wolf stagger so they arrive
      // together and force split-attention typing.
      const delay = config.simultaneous ? 0 : i * 200;
      // The pack wave fields one circler (flanking) wolf — it weaves vertically
      // as it closes, so its word is harder to track than the straight-liners.
      const circles = config.hasBoss && i === slots.length - 1;
      this.spawnWolf(startX, pos.x, pos.y, words[i], delay, advanceMs, circles);
    });

    if (config.hasBoss) {
      this.spawnBoss(config.bossSpawnDelayMs);
    }

    // §5.5.10 — once per playthrough, a wolf's floating word briefly scratches
    // into the Quiet Lord's text. Fires on Wave 2 (paired alternation) so it
    // lands when the player is already split-tracking words.
    if (!this.quietLordIntruded && idx === 1) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["winter-mountain"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(1400, () => {
        playQuietLordIntrusion(this, {
          x: this.scale.width / 2,
          y: 340,
          text: "i have been listening from the cold.",
        });
      });
    }
  }

  /** UI-cohesion: every Winter word target gets the legibility outline by default
   *  (TTT-style). Fork choices pass frame: "banner". */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    const onComplete = opts.onComplete;
    return new TextWordTarget({
      outline: true,
      ...opts,
      onComplete: () => {
        if (opts.frame === "banner") playWrenAction(this.wrenSprite);
        onComplete();
      },
    });
  }

  private spawnWolf(
    startX: number,
    targetX: number,
    targetY: number,
    word: string,
    delay: number,
    advanceMs: number,
    circles = false,
  ): void {
    const facingLeft = startX > this.scale.width / 2;
    const container = this.add.container(startX, targetY);
    this.drawWolfInto(container, facingLeft);
    addContainerWake(this, container, {
      kind: "snow",
      intervalMs: circles ? 170 : 240,
      spreadX: 54,
      spreadY: 6,
      offsetY: 4,
      alpha: 0.34,
      size: 5,
      depth: -1,
      driftX: 30,
      driftY: -10,
      durationMs: 820,
    });
    container.setAlpha(0);

    const wolf = new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word,
      restX: targetX,
      restY: targetY,
      wrenX: this.scale.width / 2,
      advanceMs,
      entranceMs: 700,
      entranceDelayMs: delay,
      knockbackMs: 700,
      knockbackPauseMs: WOLF_KNOCKBACK_PAUSE_MS,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -90,
      idleBobDy: 6,
      idleBobMs: 900,
      defeatRiseY: -60,
      defeatMs: 500,
      fontSize: 32,
      // Frost burst on completion — wolves go "down in snow," not "down in brass."
      burstColor: PALETTE_HEX.frost,
      outline: true,
      // The circler (flanking) wolf weaves vertically as it closes.
      verticalOffset: circles ? circlerY : undefined,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      onClaim: () => this.leanWrenToward(container.x),
      onRelease: () => this.returnWrenToRest(),
      onDefeated: (self) => {
        playChime();
        this.afterWolfDefeated(self);
      },
      onReachWren: () => this.onWolfHit(),
      // Shift = thunderclap (knock the pack back), Alt = frost-shatter (kill the
      // nearest too). Any claim first returns Wren to rest.
      onComplete: (mods, self) => {
        this.returnWrenToRest();
        if (mods.alt) this.frostShatter(self);
        else if (mods.spell) this.castThunderclap(self);
      },
    });

    this.wolves.push(wolf);
  }

  private spawnBoss(delayMs: number = 600): void {
    const startX = -200;
    const container = this.add.container(startX, BOSS_SPAWN_Y);
    this.bossBodySprite = this.drawBossInto(container);
    addContainerWake(this, container, {
      kind: "snow",
      intervalMs: 180,
      spreadX: 78,
      spreadY: 8,
      offsetY: 8,
      alpha: 0.4,
      size: 7,
      depth: -1,
      driftX: 34,
      driftY: -12,
      durationMs: 900,
    });
    container.setAlpha(0);

    const boss = new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word: BOSS_PHRASE,
      restX: BOSS_SPAWN_X,
      restY: BOSS_SPAWN_Y,
      wrenX: this.scale.width / 2,
      // The alpha closes faster for a fast typist — its titled phrase is long, so
      // a shorter advance is fair pressure, not a spike.
      advanceMs: this.director.advanceMs(BOSS_ADVANCE_MS),
      entranceMs: 1100,
      entranceDelayMs: delayMs,
      knockbackMs: 700,
      knockbackPauseMs: WOLF_KNOCKBACK_PAUSE_MS,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -90,
      idleBobDy: 6,
      idleBobMs: 900,
      defeatRiseY: -60,
      defeatMs: 500,
      fontSize: 32,
      burstColor: PALETTE_HEX.frost,
      outline: true,
      // Warded: the boss advances mute until the pack falls; releaseBossWard()
      // attaches its true name then.
      manualAttach: true,
      // The Old One's true name is SPOKEN with its capitals — caseSensitive, so the
      // caps demand Shift (required typing, free). No spell routes — you name it,
      // you can't thunderclap or shatter it away.
      caseSensitive: true,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      onClaim: () => this.leanWrenToward(container.x),
      onRelease: () => this.returnWrenToRest(),
      onDefeated: (self) => {
        playChime();
        this.afterWolfDefeated(self);
      },
      onReachWren: () => this.onWolfHit(),
      onComplete: () => this.returnWrenToRest(),
    });

    this.boss = boss;
    this.wolves.push(boss);
  }

  private releaseBossWard(): void {
    const boss = this.boss;
    if (!boss || boss.isDefeated() || boss.target) return;
    // Snow-drift sensory beat: 2s of falling snow obscures words briefly
    this.triggerSnowDrift(() => {
      this.narration.say("winter_boss_rise");
      if (this.bossBodySprite) {
        this.bossBodySprite.setTintFill(0xffd277);
        this.time.delayedCall(140, () => this.bossBodySprite?.clearTint());
      }
      this.cameras.main.shake(180, 0.003);
      boss.attachWord();
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

  /** While the player is typing this wolf's name, Wren leans toward it —
   *  enough lateral travel to read as action, not so much that he leaves
   *  centre stage. */
  private leanWrenToward(targetX: number): void {
    const restX = this.scale.width / 2;
    const direction = targetX < restX ? -1 : 1;
    const lean = 90 * direction;
    this.tweens.killTweensOf(this.wrenContainer);
    this.tweens.add({
      targets: this.wrenContainer,
      x: restX + lean,
      duration: 240,
      ease: "Sine.easeOut",
    });
  }

  private returnWrenToRest(): void {
    if (this.wrenContainer.x === this.scale.width / 2) return;
    this.tweens.killTweensOf(this.wrenContainer);
    this.tweens.add({
      targets: this.wrenContainer,
      x: this.scale.width / 2,
      duration: 280,
      ease: "Sine.easeOut",
      onComplete: () =>
        addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2100 }),
    });
  }

  /** The hit feel when a wolf reaches Wren — shared by pack and boss. Snuffing a
   *  candle may end the wave (a wipe at zero), which the enemy's reachWren detects
   *  and halts on, so there's nothing to knock back. */
  private onWolfHit(): void {
    this.cameras.main.shake(220, 0.005);
    playDamageThud();
    flashDamageVignette(this);
    this.snuffCandle(true);
  }

  /** Wave bookkeeping after a wolf is felled (player completion OR a frost-shatter
   *  chain). The enemy handled the body teardown + chime; here we relight a candle
   *  on a clean clear, fire the wave/boss transition, or release the boss ward once
   *  the pack is down. NOT called for a candle-loss wipe (that uses dismiss()). */
  private afterWolfDefeated(self: MovingWordEnemy): void {
    if (this.wolves.every((w) => w.isDefeated())) {
      this.waveActive = false;
      // Clean-wave economy: clear a wave without losing a candle and you relight
      // one (capped). Candles are a persistent pool now — skill refills it.
      if (!this.tookCandleHitThisWave && this.candles < WAVE_CANDLES) {
        this.candles = candleAfterCleanWave(this.candles, WAVE_CANDLES);
        this.redrawCandles();
        this.flashCandleRelight();
      }
      if (self === this.boss) {
        this.narration.say("winter_boss_defeated");
        this.time.delayedCall(2200, () => this.onBossDefeated());
      } else {
        this.time.delayedCall(900, () => this.onWaveCleared());
      }
      return;
    }

    // Release boss ward when all regular wolves are down.
    const boss = this.boss;
    if (boss && !boss.isDefeated() && !boss.target) {
      const regularsAllDown = this.wolves
        .filter((w) => w !== this.boss)
        .every((w) => w.isDefeated());
      if (regularsAllDown) this.releaseBossWard();
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
    this.narration.say("winter_fox_intro");

    const kindTarget = this.makeWord({
      scene: this,
      word: "i mean no harm",
      x: this.scale.width / 2 - 320,
      y: this.scale.height - 340,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = true;
        this.store.update((s) => {
          if (!s.almanacLore.includes("the-wounded-foxs-name")) {
            s.almanacLore.push("the-wounded-foxs-name");
          }
        });
        this.narration.say("winter_fox_spared_ear");
        this.time.delayedCall(2200, () => this.startWave(nextWave));
      },
    });

    const hurtTarget = this.makeWord({
      scene: this,
      word: "i don't have time",
      x: this.scale.width / 2 + 320,
      y: this.scale.height - 340,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = false;
        this.narration.say("winter_fox_dismissed");
        this.time.delayedCall(1800, () => this.startWave(nextWave));
      },
    });

    this.typingInput.register(kindTarget);
    this.typingInput.register(hurtTarget);
    this.activeTargets.push(kindTarget, hurtTarget);
  }

  // ─── CYOA Fork 1 (after Wave 2, before Wave 3) ───────────────────────────

  private startFork1(nextWave: number): void {
    this.narration.say("winter_fork1_intro");

    const huntress = this.makeWord({
      scene: this,
      word: "save the huntress",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 340,
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.fork1Choice = "huntress";
        this.startHuntressBranch(nextWave);
      },
    });
    const firefly = this.makeWord({
      scene: this,
      word: "follow the fireflies",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 340,
      frame: "banner",
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
    this.narration.say("winter_huntress_intro");
    this.fadeInHuntress();
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-huntress-song")) {
        s.almanacLore.push("the-huntress-song");
      }
    });
    this.time.delayedCall(1100, () => {
      this.runPassageChain(
        HUNTRESS_PASSAGES,
        [
          "She speaks a few words in the wolf-tongue. The howls behind you fade.",
          "She presses a spiral horn into your hand and gestures uphill.",
        ],
        () => {
          this.fadeOutHuntress();
          this.time.delayedCall(600, () => this.startWave(nextWave));
        },
      );
    });
  }

  private fadeInHuntress(): void {
    if (this.huntressSprite) return;
    this.huntressSprite = makeHuntressSprite(this);
    // Half-buried in the drift to Wren's left.
    this.huntressSprite.setPosition(560, 960);
    stageAnchoredSprite(this, this.huntressSprite, {
      shadowWidth: 118,
      shadowHeight: 20,
      shadowAlpha: 0.22,
      entranceOffsetY: 16,
      entranceMs: 720,
      breathDy: -2,
      breathMs: 2300,
    });
  }

  private fadeOutHuntress(): void {
    if (!this.huntressSprite) return;
    const sprite = this.huntressSprite;
    this.huntressSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  private startFireflyBranch(nextWave: number): void {
    this.clearActiveTargets();
    this.narration.say("winter_firefly_intro");
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-firefly-trail")) {
        s.almanacLore.push("the-firefly-trail");
      }
    });
    this.time.delayedCall(1100, () => {
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

  /**
   * @param combat - true means a wolf knocked it out (wave-reset on 0);
   *                 false means cold-decay in Act 1 (no wave reset).
   */
  private snuffCandle(combat: boolean): void {
    this.candles = candleAfterHit(this.candles);
    if (combat) this.tookCandleHitThisWave = true;
    this.redrawCandles();
    this.flashHurt();
    if (combat && this.candles === 0) {
      this.resetWave();
    }
  }

  private resetWave(): void {
    if (!this.waveActive) return;
    this.waveActive = false;
    this.narration.say("winter_wave_reset");

    for (const w of this.wolves) w.dismiss();

    this.cameras.main.flash(300, 20, 18, 30);
    this.time.delayedCall(1600, () => {
      this.wolves = [];
      this.boss = null;
      this.bossBodySprite = null;
      this.activeTargets = [];
      // Non-refilling economy: a wipe relights only to the floor (1), not a
      // full tank — you retry the wave on the brink. Clean play earns the rest
      // back. (Was a free reset to 3, which made the candle stake theater.)
      this.candles = CANDLE_RESET_FLOOR;
      this.redrawCandles();
      this.startWave(this.waveIndex);
    });
  }

  /** Brief warm pulse on the candle row when a clean wave relights one. */
  private flashCandleRelight(): void {
    playChime();
    this.tweens.add({
      targets: this.candleGroup,
      scale: { from: 1, to: 1.15 },
      yoyo: true,
      duration: 180,
      ease: "Sine.easeOut",
    });
  }

  // ─── Thunderclap (Shift spell) ────────────────────────────────────────────

  private castThunderclap(source: MovingWordEnemy): void {
    this.typingInput.getStats().spendSoul(SPELL_COST);
    this.refreshThunderPips();
    this.cameras.main.flash(220, 240, 230, 200);
    playChime();

    // Shove the rest of the pack back to their rest points and pause before they
    // re-advance — breathing room, words intact (no kill, no candle cost).
    for (const w of this.wolves) {
      if (w.isDefeated() || w === source) continue;
      w.knockBack(450, 2500);
    }
  }

  /** Alt spell — frost-shatter. The wolf whose name was typed with Alt held is
   *  already defeated by the enemy; the ice cracks to the nearest live pack wolf,
   *  taking it too (a 2-for-1, distinct from the thunderclap's knock-back). Costs
   *  Soul; the warded boss is never a target (no live target until the pack falls). */
  private frostShatter(source: MovingWordEnemy): void {
    this.typingInput.getStats().spendSoul(SPELL_COST);
    this.refreshThunderPips();
    this.cameras.main.flash(220, 150, 200, 240); // icy blue, vs thunderclap white
    playChime();

    const others = this.wolves.filter(
      (w) => !w.isDefeated() && w !== source && w.target,
    );
    if (others.length === 0) return;
    let nearest = others[0]!;
    let best = Infinity;
    for (const w of others) {
      const d = Math.abs(w.container.x - source.container.x);
      if (d < best) {
        best = d;
        nearest = w;
      }
    }
    nearest.defeat();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3 — The Boss Aftermath
  // ═══════════════════════════════════════════════════════════════════════════

  private onBossDefeated(): void {
    // Quiet Lord fragment ~~A~~ — first letter of the accumulating word.
    // Once per playthrough — skip if already revealed on a previous run.
    const alreadyRevealed =
      this.store.get().realms["winter-mountain"]?.quietLordFragmentRevealed ?? false;
    if (!alreadyRevealed) {
      this.store.update((s) => {
        const realm = s.realms["winter-mountain"];
        if (realm) realm.quietLordFragmentRevealed = true;
      });
      flashQuietLordFragment(this, { text: "A" });
    }
    // Almanac lore page 4 — the pack leader's true name. Stamped at the
    // moment of defeat, alongside the fragment flash.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-pack-leader-true-name")) {
        s.almanacLore.push("the-pack-leader-true-name");
      }
    });
    this.time.delayedCall(1600, () => this.startFork2());
  }

  /** Renders a brief strikethrough-text flash in the centre of the screen */
  /** Fork 2 — Aftermath: bury under cairn stones OR take the pelt */
  private startFork2(): void {
    this.narration.say("winter_fork2_intro");

    const buryTarget = this.makeWord({
      scene: this,
      word: "bury the pack leader",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 340,
      frame: "banner",
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

    const peltTarget = this.makeWord({
      scene: this,
      word: "take the pelt",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 340,
      frame: "banner",
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

    this.narration.say("winter_fox_companion_accept");

    const whisperTarget = this.makeWord({
      scene: this,
      word: "whisper to her",
      x: this.scale.width / 2 - 260,
      y: this.scale.height - 340,
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.store.update((s) => {
          if (!s.satchel.includes("snow-fox-cub")) s.satchel.push("snow-fox-cub");
        });
        this.narration.say("winter_fox_companion_yes");
        this.time.delayedCall(2400, () => this.startTrueNamePassage());
      },
    });

    const letGoTarget = this.makeWord({
      scene: this,
      word: "let her go",
      x: this.scale.width / 2 + 260,
      y: this.scale.height - 340,
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.narration.say("winter_fox_companion_no");
        this.time.delayedCall(2000, () => this.startTrueNamePassage());
      },
    });

    this.typingInput.register(whisperTarget);
    this.typingInput.register(letGoTarget);
    this.activeTargets.push(whisperTarget, letGoTarget);
  }

  /** The realm's true-name passage — three short lines, the mountain
   *  settling one line at a time. */
  private startTrueNamePassage(): void {
    this.narration.say("winter_truename_intro");
    this.time.delayedCall(900, () => {
      this.runPassageChain(
        [...TRUE_NAME_LINES],
        [...TRUE_NAME_REACTIONS],
        () => {
          playChime();
          this.time.delayedCall(600, () => this.startEnding());
        },
      );
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.narration.say("winter_almanac_stamp");

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
    playRealmClearResonance(this, {
      color: PALETTE_HEX.frost,
      y: this.scale.height / 2 - 70,
    });
    showAlmanacStampCard(this, "the winter mountain", onDone, { onReveal: playChime });
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
        this.time.delayedCall(900, onDone);
        return;
      }
      const target = this.makeWord({
        scene: this,
        word: passages[step],
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 36,
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          step += 1;
          this.setNarrator(narratorLines[step - 1] ?? "");
          this.time.delayedCall(900, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }
    if (event.key === "Shift") {
      this.setShiftHeld(true);
      return;
    }
    if (event.key === "Alt") {
      this.setAltHeld(true);
      // Browser default for Alt focuses the menu bar — preventDefault so it
      // doesn't steal focus mid-spell.
      event.preventDefault();
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    const canCast =
      this.typingInput.getStats().canCast(SPELL_COST) && this.waveActive;
    // Shift = thunderclap (knock the pack back), Alt = frost-shatter (kill the
    // nearest too). Both cost Soul; an empty meter falls through to a normal
    // defeat, never a block. Alt wins if both held (the controller prioritises
    // Alt). caseSensitive boss capitals still need Shift, but the boss claims
    // lowercase-first so that Shift is free required typing, not a spell.
    this.typingInput.handleChar(event.key, {
      spell: this.shiftHeld && canCast,
      alt: this.altHeld && canCast,
    });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.setShiftHeld(false);
    if (event.key === "Alt") this.setAltHeld(false);
  }

  private setShiftHeld(held: boolean): void {
    if (this.shiftHeld === held) return;
    this.shiftHeld = held;
    this.updateWrenGlow();
  }

  private setAltHeld(held: boolean): void {
    if (this.altHeld === held) return;
    this.altHeld = held;
    this.updateWrenGlow();
  }

  private updateWrenGlow(): void {
    // redrawCharges() calls this during create(), before typingInput exists.
    if (!this.typingInput) return;
    const armed =
      (this.shiftHeld || this.altHeld) &&
      this.typingInput.getStats().canCast(SPELL_COST) &&
      this.waveActive;
    this.wrenGlow.setAlpha(armed ? 0.55 : 0);
    // Don't overwrite a hurt pose mid-flash; the timer restores from there.
    if (this.hurtPoseTimer) return;
    setWrenPose(this.wrenSprite, armed ? "cast" : "front");
  }

  /** Briefly flash the hurt pose, then restore the resting pose. */
  private flashHurt(): void {
    if (!this.wrenSprite) return;
    this.hurtPoseTimer?.remove();
    setWrenPose(this.wrenSprite, "hurt");
    this.hurtPoseTimer = this.time.delayedCall(420, () => {
      this.hurtPoseTimer = null;
      this.updateWrenGlow();
    });
  }

  private setNarrator(text: string): void {
    this.narration.sayRaw(text, { speakerName: null });
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

  /** Recompute affordable thunderclaps from banked Soul; redraw the pip row
   *  only when that discrete count changes. Soul moves on every keystroke and
   *  every cast, so this is driven from the keystroke hook and after a cast —
   *  Winter has no per-frame update loop. */
  private refreshThunderPips(): void {
    const castable = Math.min(
      WAVE_CHARGES,
      Math.floor(this.typingInput.getStats().getSoul() / SPELL_COST),
    );
    if (castable === this.castableThunder) return;
    this.castableThunder = castable;
    this.redrawCharges();
  }

  private redrawCharges(): void {
    this.chargeGroup.removeAll(true);
    for (let i = 0; i < WAVE_CHARGES; i++) {
      const ready = i < this.castableThunder;
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
    c.add(addLocalGroundShadow(this, 98, 22, { y: 7, alpha: 0.34 }));
    this.wrenGlow = this.add.graphics();
    this.wrenGlow.fillStyle(PALETTE_HEX.brass, 1);
    this.wrenGlow.fillCircle(0, -40, 60);
    this.wrenGlow.setAlpha(0);
    c.add(this.wrenGlow);

    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    stageContainerEntrance(this, c, {
      breathDy: -4,
      breathMs: 2100,
    });
    return c;
  }

  private drawWolfInto(c: Phaser.GameObjects.Container, facingLeft: boolean): void {
    c.add(addLocalGroundShadow(this, 118, 22, { y: 8, alpha: 0.38 }));
    c.add(makeWolfSprite(this, false, facingLeft));
  }

  private drawBossInto(c: Phaser.GameObjects.Container): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 160, 30, { y: 10, alpha: 0.42 }));
    const sprite = makeWolfSprite(this, true, false);
    c.add(sprite);
    return sprite;
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
