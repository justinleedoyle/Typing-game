import { beginAssetLoad, assetLoadBlocked } from "../game/assetLoadRecovery";
import Phaser from "phaser";
import { applySceneActorLighting, restoreSceneActorLighting } from "../game/actorLighting";
import { type AmbientHandle, playAmbientWinter } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { flashDamageVignette } from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
import {
  showLowHeartFeedback,
  showSpellReadyFeedback,
} from "../game/lowHeartFeedback";
import { NarrationManager } from "../game/narrationManager";
import { checkpointIndex, committedWinterChoices, winterStep, type WinterStep } from "../game/chapterFlow";
import { ChapterReading } from "../game/ui/chapterReading";
import { installChapterMenu } from "../game/ui/pauseMenu";
import { decorativeTween, reducedMotion, reducedFlashes } from "../game/presentation";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons, satchelIconFor } from "../game/ui/satchelIcons";
import runaPortrait from "../../art/runa/runa-front.png";
import { PALETTE_HEX, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import type { SaveCheckpoint, SaveStore } from "../game/saveState";
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
  attachWordBodyAnchor,
  dismissCompanionCameo,
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  addSoftLocalLight,
  addLivingLight,
  playBodyContactCue,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playActorAttention,
  playPortalArrivalWake,
  pulseUiObject,
  playRealmClearResonance,
  playRealmReturnDeparture,
  playSceneEventPulse,
  stageContainerEntrance,
  stageAnchoredSprite,
  stageCompanionCameo,
  stageTrueNameSeal,
  dismissTrueNameSeal,
  dismissStagedCue,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import { pickAdaptiveWords, WINTER_WORD_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  makeHeldurSprite,
  makeHuntressSprite,
  preloadWinterNpcs,
} from "../game/winterNpcs";
import { makeWolfSprite, preloadWolves } from "../game/wolf";
import {
  bobWrenSprite,
  flashWrenMiss,
  isWrenHurtPlaying,
  makeWrenSprite,
  playWrenAction,
  playWrenFocus,
  playWrenHurt,
  preloadWren,
  setWrenPose,
} from "../game/wren";
import winterBackdrop from "../../art/references/winter-mountain-clean.png";
import winterAftermathCairn from "../../art/winter/aftermath-cairn.png";
import winterAftermathPelt from "../../art/winter/aftermath-pelt.png";
import winterTrailBackdrop from "../../art/winter/frozen-trail.png";
import fallenPineSprite from "../../art/winter/fallen-pine.png";
import snowFoxSprite from "../../art/companions/snow-fox.png";

// Danger ramps in over the LAST 60% of a wolf's advance — earlier portion
// stays cream so players can read the word, then it shifts red as the wolf
// closes. Tweak this constant to make the warning earlier or later.
const DANGER_RAMP_START = 0.4;

interface WinterSceneData {
  store: SaveStore;
  revisit?: boolean;
}

type WinterPassageOwner = "huntress" | "firefly" | "cairn" | "pelt" | "none";

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
// Keep Wren and the first trail obstacles planted in the painted snowfield,
// not half-swallowed by the console band.
const WINTER_WREN_STAGE_Y = 842;
const WINTER_TRAIL_FEET_Y = 810;
const WINTER_TRAIL_PLATE_Y = -90;
const WINTER_TRAIL_LOG = { x: 610, y: 810 } as const;
const WINTER_TRAIL_LOG_ASIDE = { x: 730, y: 750, angle: -12 } as const;

// The Old One's true name is SPOKEN with its capitals — caseSensitive, so the
// caps demand Shift (required typing, free). Starts lowercase so the claim
// captures no Shift (else the first-letter Shift would fire the thunderclap
// spell instead of claiming — same lowercase-first trick as the Forge commands).
const BOSS_PHRASE = "the Old One, STIRRING.";
const BOSS_ADVANCE_MS = 17_000;
const BOSS_SPAWN_X = 1450;
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
      "one wolf, alone in the trees. type its name to drive it back. when thunder is ready, hold Shift on the first letter for a thunderclap.",
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
  private reading!: ChapterReading;
  private chapterMenu?: ReturnType<typeof installChapterMenu>;
  private resumeCheckpoint: SaveCheckpoint | null = null;
  private band!: ConsoleBand;
  private wolves: MovingWordEnemy[] = [];
  /** The Pack-Leader, also a wolf in `this.wolves`; held separately for the
   *  pack-cleared ward gate and the body-sprite tint on release. */
  private boss: MovingWordEnemy | null = null;
  private bossBodySprite: Phaser.GameObjects.Image | null = null;
  private activeTargets: TextWordTarget[] = [];

  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenGlow!: Phaser.GameObjects.Graphics;
  private wrenSprite!: Phaser.GameObjects.Image;
  private heldurSprite: Phaser.GameObjects.Image | null = null;
  private heldurWordAnchors: WordBodyAnchorHandle[] = [];
  private huntressSprite: Phaser.GameObjects.Image | null = null;
  private huntressHornSprite: Phaser.GameObjects.Image | null = null;
  private huntressHornTransferToken = 0;
  private huntressHornTransferPending = false;
  private riverCue: Phaser.GameObjects.Container | null = null;
  private riverCueBeat: (typeof RIVER_BEATS)[number] | null = null;
  private riverCueWordAnchor: WordBodyAnchorHandle | null = null;
  private trailBackdrop: Phaser.GameObjects.Image | null = null;
  private riverLandmarks: Partial<Record<(typeof RIVER_BEATS)[number], Phaser.GameObjects.Container>> = {};
  private trailTransitionPending = false;
  private trailGeneration = 0;
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;
  private fireflyCue: Phaser.GameObjects.Container | null = null;
  private fireflyLanternSprite: Phaser.GameObjects.Image | null = null;
  private cairnCue: Phaser.GameObjects.Container | null = null;
  private peltCue: Phaser.GameObjects.Container | null = null;
  private heldPeltSprite: Phaser.GameObjects.Image | null = null;
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private foxCompanion: Phaser.GameObjects.Container | null = null;
  private foxWordAnchors: WordBodyAnchorHandle[] = [];
  private candleGroup!: Phaser.GameObjects.Container;
  private chargeGroup!: Phaser.GameObjects.Container;
  private drawnCandles: number | null = null;
  private drawnThunderCharges: number | null = null;

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
  private foxDecided = false;

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
    this.chapterMenu = undefined;
    const savedCheckpoint = this.store.get().checkpoint;
    this.resumeCheckpoint = !this.revisit && savedCheckpoint?.scene === "WinterMountainScene"
      ? savedCheckpoint : null;
    // Stale sprite references from a previous visit point at destroyed
    // GameObjects; clear them so fadeInHeldur/fadeInHuntress create fresh ones.
    this.heldurSprite = null;
    this.heldurWordAnchors = [];
    this.huntressSprite = null;
    this.huntressHornSprite = null;
    this.huntressHornTransferToken += 1;
    this.huntressHornTransferPending = false;
    this.riverCue = null;
    this.riverCueBeat = null;
    this.riverCueWordAnchor = null;
    this.trailBackdrop = null;
    this.riverLandmarks = {};
    this.trailTransitionPending = false;
    this.trailGeneration += 1;
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.fireflyCue = null;
    this.clearFireflyLantern();
    this.cairnCue = null;
    this.peltCue = null;
    this.clearHeldPelt();
    this.forkChoiceWordAnchors = [];
    this.foxCompanion = null;
    this.foxWordAnchors = [];
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
    const foxChoice = this.store.get().realms["winter-mountain"]?.choices.fox;
    this.foxSpared = foxChoice === "spared";
    const earlyStep = this.resumeCheckpoint?.step;
    const beforeFox = earlyStep !== undefined && (["arrival", "trail", "heldur", "heldur-answer", "heldur-awake", "cold", "kindle", "fox"].includes(earlyStep)
      || (earlyStep === "wave" && this.resumeCheckpoint?.data.index === 0));
    this.foxDecided = typeof this.resumeCheckpoint?.data.foxDecided === "boolean"
      ? this.resumeCheckpoint.data.foxDecided
      : !beforeFox && (foxChoice === "spared" || foxChoice === "ignored");
    this.coldDecayTimer = null;
    this.combatCandlesActive = false;
    const choices = this.store.get().realms["winter-mountain"]?.choices;
    this.fork1Choice = choices?.fork1 === "huntress" || choices?.fork1 === "firefly" ? choices.fork1 : null;
    this.fork2Choice = choices?.fork2 === "bury" || choices?.fork2 === "pelt" ? choices.fork2 : null;
    const candleSave = this.resumeCheckpoint?.data.candles;
    if (typeof candleSave === "number") this.candles = Math.max(1, Math.min(WAVE_CANDLES, Math.round(candleSave)));
    this.quietLordIntruded =
      this.store.get().realms["winter-mountain"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    beginAssetLoad(this);
    this.load.image("winter-backdrop", winterBackdrop);
    this.load.image("winter-trail-backdrop", winterTrailBackdrop);
    this.load.image("winter-fallen-pine", fallenPineSprite);
    this.load.image("winter-aftermath-cairn", winterAftermathCairn);
    this.load.image("winter-aftermath-pelt", winterAftermathPelt);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadWren(this);
    preloadWolves(this);
    preloadWinterNpcs(this);
    preloadSatchelIcons(this, ["hunters-horn", "firefly-lantern"]);
    this.load.image("winter-companion-snow-fox", snowFoxSprite);
  }

  create(): void {
    if (assetLoadBlocked(this)) return;
    this.chapterMenu = installChapterMenu(this, {
      store: this.store,
      hasClaim: () => !!this.typingInput && (this.typingInput.hasClaim() || this.typingInput.getTypingBuffer().length > 0),
      onLeave: () => this.scene.start("PortalChamberScene", { store: this.store }),
    });
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.add
      .image(0, 0, "winter-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    // Rooted landmarks and aftermath props share the painted snowfield's fixed frame.
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
    addLivingLight(this, {
      x: 1100,
      y: 235,
      width: 650,
      height: 150,
      color: 0x8b7cff,
      alpha: 0.08,
      depth: -5,
      durationMs: 3600,
      scale: 1.045,
    });
    addLivingLight(this, {
      x: 1540,
      y: 245,
      width: 520,
      height: 120,
      color: 0x5cb7e8,
      alpha: 0.055,
      depth: -5,
      durationMs: 4100,
      delayMs: 900,
      scale: 1.05,
    });
    addLivingLight(this, {
      x: 258,
      y: 498,
      width: 180,
      height: 220,
      color: 0xbfd9ff,
      alpha: 0.06,
      depth: -4,
      durationMs: 3000,
      delayMs: 380,
    });
    addLivingLight(this, {
      x: 1818,
      y: 782,
      width: 120,
      height: 150,
      color: 0xf0ad58,
      alpha: 0.08,
      depth: -4,
      durationMs: 1800,
      delayMs: 700,
    });
    addAmbientDrift(this, {
      kind: "snow",
      count: 18,
      depth: -1.45,
      area: { x: -80, y: 240, width: this.scale.width + 160, height: 620 },
      alpha: 0.22,
      minSize: 5,
      maxSize: 11,
      driftX: -300,
      driftY: 560,
      minDurationMs: 4600,
      maxDurationMs: 9000,
    });
    addAmbientDrift(this, {
      kind: "snow",
      count: 16,
      depth: -0.35,
      area: { x: 360, y: WINTER_WREN_STAGE_Y - 150, width: 1200, height: 210 },
      alpha: 0.28,
      minSize: 2.5,
      maxSize: 7,
      driftX: -240,
      driftY: 165,
      minDurationMs: 3600,
      maxDurationMs: 7200,
    });
    this.wrenContainer = this.drawWren(
      this.scale.width / 2,
      WINTER_WREN_STAGE_Y,
    );
    playSceneEventPulse(this, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      x: this.wrenContainer.x,
      y: this.wrenContainer.y - 86,
      depth: -0.25,
      durationMs: 720,
      ringWidth: 260,
      ringHeight: 86,
      count: 8,
      alpha: 0.11,
      spreadX: 120,
      spreadY: 34,
    });

    // UI cohesion — the console band houses the meters + Winter's candle/thunder
    // status. Realm 1 has no satchel, so those dock in the satchel zone.
    this.band = new ConsoleBand(this, {
      activity: () => (this.waveActive || this.coldDecayTimer !== null) ? "combat" : "story",
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: [],
      maxOneShots: 0,
      satchelLabel: "",
    });
    const band = this.band;

    this.narration = new NarrationManager(this, {
      store: this.store,
      y: 160,
      depth: 100,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });

    const showCombatMeters = !this.revisit;

    // Candle + thunder meters dock into the band's satchel zone (above the band
    // surface, so depth > the band's DEPTH).
    this.candleGroup = this.add
      .container(band.satchelAnchor.x + 90, band.satchelAnchor.y)
      .setDepth(1500)
      .setVisible(showCombatMeters);
    this.chargeGroup = this.add
      .container(band.satchelAnchor.x + 370, band.satchelAnchor.y)
      .setDepth(1500)
      .setVisible(showCombatMeters);
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
    const candleLabel = this.add
      .text(band.satchelAnchor.x + 90, band.satchelAnchor.y - 38, "candles", hudLabelStyle)
      .setOrigin(0.5)
      .setDepth(1500)
      .setVisible(showCombatMeters);
    const thunderLabel = this.add
      .text(band.satchelAnchor.x + 370, band.satchelAnchor.y - 38, "thunder", hudLabelStyle)
      .setOrigin(0.5)
      .setDepth(1500)
      .setVisible(showCombatMeters);
    if (showCombatMeters) {
      this.stageWinterMeterObject(candleLabel, 70, { offsetY: 5 });
      this.stageWinterMeterObject(this.candleGroup, 95, { offsetY: 8 });
      this.stageWinterMeterObject(thunderLabel, 115, { offsetY: 5 });
      this.stageWinterMeterObject(this.chargeGroup, 140, { offsetY: 8 });
    }

    this.typingInput = new TypingInputController(this.store);
    this.director = new WaveDirector(this.typingInput.getStats());
    const checkpointData = this.resumeCheckpoint?.data;
    if (checkpointData) {
      this.typingInput.getStats().restoreCheckpoint(checkpointData);
      if (typeof checkpointData.statsSoul !== "number" && typeof checkpointData.soul === "number") {
        this.typingInput.getStats().bankSoulFraction(checkpointData.soul / 100);
      }
    }
    this.refreshThunderPips();
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => {
        if (!reducedMotion(this)) bobWrenSprite(this.wrenSprite);
        // A clean keystroke filled Soul — the thunder pips may have ticked up.
        this.refreshThunderPips();
      },
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        if (!reducedMotion(this)) this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      showSoul: !this.revisit,
      getCombo: () => this.typingInput.getStats().getCombo(),
      getCastReady: () => this.typingInput.getStats().canCast(SPELL_COST),
      onCastReady: () =>
        showSpellReadyFeedback({
          scene: this,
          band: this.band,
          body: this.wrenContainer,
          kind: "mote",
          color: PALETTE_HEX.brass,
          noticeText: "Thunder is ready.",
        }),
      onSustainedLowHeart: () =>
        showLowHeartFeedback({
          scene: this,
          band: this.band,
          body: this.wrenContainer,
          kind: "snow",
          color: PALETTE_HEX.frost,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });
    this.reading = new ChapterReading(this, () => Math.max(316, this.narration.bottom() + 40));

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.PAUSE, this.clearSpellModifiers, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.clearSpellModifiers, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.reading.destroy();
      this.chapterMenu?.destroy();
      this.typingInput.reset();
      this.coldDecayTimer?.remove();
      if (this.wrenContainer?.scene) this.tweens.killTweensOf(this.wrenContainer);
      this.dismissRiverCue(false);
      this.dismissRevisitMemoryCue(false);
      this.clearWinterForkCues();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
      this.events.off(Phaser.Scenes.Events.PAUSE, this.clearSpellModifiers, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.clearSpellModifiers, this);
      this.ambientHandle?.stop();
    });

    this.ambientHandle = playAmbientWinter();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.resumeWinter();
  }

  private checkpoint(step: WinterStep, data: SaveCheckpoint["data"] = {}): void {
    if (this.revisit) return;
    this.store.update((s) => {
      const realm = s.realms["winter-mountain"] ?? { cleared: false, choices: {} };
      realm.choices = committedWinterChoices(realm.choices, {
        fox: this.foxDecided ? (this.foxSpared ? "spared" : "ignored") : null,
        fork1: this.fork1Choice,
        fork2: this.fork2Choice,
      });
      s.realms["winter-mountain"] = realm;
    });
    this.store.setCheckpoint({ scene: "WinterMountainScene", step, data: {
      candles: this.candles, soul: this.typingInput.getStats().getSoul(),
      ...this.typingInput.getStats().captureCheckpoint(), ...data, foxDecided: this.foxDecided,
    } });
  }

  private readThen(next: () => void): void {
    this.reading.show(next, () => this.narration.replay());
  }

  private savedStageData(step: WinterStep): SaveCheckpoint["data"] {
    return this.resumeCheckpoint?.step === step ? this.resumeCheckpoint.data : {};
  }

  private hasSavedPassage(step: WinterStep, length: number): boolean {
    const index = this.savedStageData(step).index;
    return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < length;
  }

  private resumeWinter(): void {
    const saved = this.resumeCheckpoint;
    const step = winterStep(saved?.step);
    const index = saved?.data.index;
    if (step !== "arrival" && step !== "trail") this.resetWrenToWinterStage();
    if (["wave", "fox", "fox-answer", "fork1", "huntress", "firefly", "boss", "boss-defeated",
      "fork2", "bury", "pelt", "fox-gate", "companion-answer", "true-name", "ending"].includes(step)) {
      this.combatCandlesActive = true;
    }
    switch (step) {
      case "trail": this.runRiverBeats(checkpointIndex(index, RIVER_BEATS.length)); break;
      case "heldur":
        if (saved?.data.intro === true) this.startHeldur();
        else { this.fadeInHeldur(); this.runHeldurExchange(checkpointIndex(index, HELDUR_QUESTIONS.length)); }
        break;
      case "heldur-answer": this.fadeInHeldur(); this.showHeldurAnswer(checkpointIndex(index, HELDUR_RESPONSES.length)); break;
      case "heldur-awake": this.fadeInHeldur(); this.showHeldurAwake(); break;
      case "cold": this.startColdDecay(); break;
      case "kindle": this.startColdDecayTimer(); this.promptKindle(); break;
      case "wave": this.startWave(checkpointIndex(index, WAVES.length)); break;
      case "fox": this.startWoundedFox(1); break;
      case "fox-answer": this.showFoxAnswer(1); break;
      case "fork1": this.startFork1(2); break;
      case "huntress": this.startHuntressBranch(2); break;
      case "firefly": this.startFireflyBranch(2); break;
      case "boss": this.resumeBoss(); break;
      case "boss-defeated": this.onBossDefeated(); break;
      case "fork2": this.startFork2(); break;
      case "bury": this.startAftermathPassage("bury"); break;
      case "pelt": this.startAftermathPassage("pelt"); break;
      case "fox-gate": this.startFoxGate(); break;
      case "companion-answer": this.showCompanionAnswer(saved?.data.accepted === true); break;
      case "true-name": this.startTrueNamePassage(); break;
      case "ending": this.startEnding(); break;
      default: this.startAct1();
    }
  }

  private resumeBoss(): void {
    this.waveIndex = 2;
    this.checkpoint("boss");
    this.narration.say("winter_boss_rise");
    this.band.setObjective("Boss · Type the Old One, STIRRING. Capitals and punctuation matter; Shift here is typing, not a spell.");
    this.readThen(() => {
      this.waveActive = true;
      this.spawnBoss(0);
      this.time.delayedCall(1300, () => this.releaseBossWard());
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVISIT MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private startRevisit(): void {
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "snow",
      color: PALETTE_HEX.frost,
    });
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
    this.band.setObjective("Type the mountain memory to return to the Almanac.");
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
            () => this.scene.start("PortalChamberScene", {
              store: this.store,
              arrival: "winter-mountain",
            }),
          );
        });
        return;
      }
      const word = words[idx];
      if (word === undefined) return;
      this.showRevisitMemoryCue(idx, words.length);
      const wordPos = this.revisitMemoryWordPosition(idx, words.length);
      const target = this.makeWord({
        scene: this,
        word,
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 40,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          this.pulseRevisitMemoryCue(false);
        },
        onComplete: () => {
          this.playWrenTrailAction();
          this.pulseRevisitMemoryCue(true);
          playChime();
          idx += 1;
          this.typingInput.unregister(target);
          const activeIdx = this.activeTargets.indexOf(target);
          if (activeIdx >= 0) this.activeTargets.splice(activeIdx, 1);
          this.time.delayedCall(260, () => {
            this.dismissRevisitMemoryCue();
            this.time.delayedCall(120, advance);
          });
        },
      });
      this.attachRevisitMemoryWordAnchor(target);
      this.registerActiveTarget(target);
    };
    advance();
  }

  private showRevisitMemoryCue(idx: number, total: number): void {
    this.dismissRevisitMemoryCue(false);
    const pos = this.revisitMemoryCuePosition(idx, total);
    const cue = this.add.container(pos.x, pos.y).setDepth(-1).setAlpha(0);
    this.revisitMemoryCue = cue;

    cue.add(addLocalGroundShadow(this, 132, 18, { y: 10, alpha: 0.18 }));

    const frost = this.add.graphics();
    frost.fillStyle(0xdbeeff, 0.12);
    frost.fillEllipse(0, 0, 124, 34);
    frost.lineStyle(2, PALETTE_HEX.frost, 0.36);
    frost.strokeEllipse(0, 0, 112, 28);
    frost.lineStyle(1, 0xf4fbff, 0.34);
    frost.lineBetween(-38, -3, -12, 6);
    frost.lineBetween(-6, 5, 18, -6);
    frost.lineBetween(24, -5, 46, 4);
    frost.fillStyle(0xf4fbff, 0.42);
    frost.fillCircle(-46, 0, 3.4);
    frost.fillCircle(0, -2, 2.8);
    frost.fillCircle(44, 1, 3.1);
    cue.add(frost);

    this.tweens.add({
      targets: cue,
      alpha: 0.82,
      y: pos.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -2, durationMs: 2600 }),
    });
  }

  private revisitMemoryCuePosition(idx: number, total: number): { x: number; y: number } {
    const spacing = total <= 4 ? 185 : 160;
    const startX = this.scale.width / 2 - ((total - 1) * spacing) / 2;
    return {
      x: startX + idx * spacing,
      y: idx % 2 === 0 ? 818 : 790,
    };
  }

  private revisitMemoryWordPosition(idx: number, total: number): { x: number; y: number } {
    const cue = this.revisitMemoryCuePosition(idx, total);
    // The middle memory rests under Wren; keep its answer above the hood.
    const y = Math.abs(cue.x - this.wrenContainer.x) < 160
      ? Math.min(cue.y - 112, this.wrenContainer.y - 280)
      : cue.y - 112;
    return { x: cue.x, y };
  }

  private attachRevisitMemoryWordAnchor(target: TextWordTarget): void {
    const cue = this.revisitMemoryCue;
    if (!cue?.scene) return;
    this.releaseRevisitMemoryWordAnchor();
    this.revisitMemoryWordAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.frost,
        alpha: 0.11,
        depth: 7,
        sourceOffsetY: -18,
        targetOffsetY: 24,
      },
    );
  }

  private releaseRevisitMemoryWordAnchor(): void {
    this.revisitMemoryWordAnchor?.destroy();
    this.revisitMemoryWordAnchor = null;
  }

  private pulseRevisitMemoryCue(completion: boolean): void {
    if (!this.revisitMemoryCue?.scene) return;
    playActorAttention(this, this.revisitMemoryCue, {
      scale: completion ? 1.04 : 1.018,
      durationMs: completion ? 260 : 170,
    });
    playBodyImpact(this, this.revisitMemoryCue, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      offsetY: -16,
      depth: 10,
      ringRadius: completion ? 42 : 26,
      count: completion ? 8 : 5,
      durationMs: completion ? 430 : 240,
    });
  }

  private dismissRevisitMemoryCue(animate = true): void {
    this.releaseRevisitMemoryWordAnchor();
    const cue = this.revisitMemoryCue;
    if (!cue?.scene) {
      this.revisitMemoryCue = null;
      return;
    }
    this.revisitMemoryCue = null;
    this.tweens.killTweensOf(cue);
    if (!animate) {
      cue.destroy();
      return;
    }
    this.tweens.add({
      targets: cue,
      alpha: 0,
      y: cue.y + 14,
      duration: 220,
      ease: "Sine.easeIn",
      onComplete: () => cue.destroy(),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1 — Down the Foothills
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct1(): void {
    this.checkpoint("arrival");
    this.band.setObjective("Act I · The pass. Read the arrival, then press Enter or Space to continue.");
    this.narration.say("winter_intro_arrival");
    this.showRiverCue("lift");
    this.stageWrenAtTrailEntrance();
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "snow",
      color: PALETTE_HEX.frost,
    });
    this.readThen(() => this.runRiverBeats(0));
  }

  /** Three short exploration beats: lift / step / duck. The world stays put. */
  private runRiverBeats(idx: number): void {
    if (idx >= RIVER_BEATS.length) {
      this.checkpoint("heldur", { index: 0, intro: true });
      this.dismissRiverCue();
      this.trailTransitionPending = true;
      const generation = this.trailGeneration;
      this.resetWrenToWinterStage();
      this.time.delayedCall(900, () => {
        if (generation !== this.trailGeneration) return;
        setWrenPose(this.wrenSprite, "front");
        this.trailTransitionPending = false;
        this.startHeldur();
      });
      return;
    }
    this.checkpoint("trail", { index: idx });
    const beat = RIVER_BEATS[idx];
    const narrations: readonly string[] = [
      "A fallen pine blocks the path.",
      "The ice looks thin here. Place your feet carefully.",
      "A low branch catches the light. Duck under it.",
    ];
    this.showRiverCue(beat);
    this.trailTransitionPending = false;
    this.band.setObjective("Type each trail word. Backspace corrects; Esc cancels a word, then pauses.");
    this.setNarrator(narrations[idx]);
    const generation = this.trailGeneration;
    const wordPos = this.riverWordPosition(beat);
    const target = this.makeWord({
      scene: this,
      word: beat,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 42,
      onClaim: () => {
        if (generation !== this.trailGeneration) return;
        const destination = this.trailWrenPosition(beat);
        playWrenFocus(this.wrenSprite, { faceLeft: destination.x < this.wrenContainer.x });
        this.walkWrenToTrailBeat(beat);
        this.pulseRiverCue(false);
      },
      onAdvance: (cursor, length) => {
        if (generation !== this.trailGeneration || cursor !== length) return;
        // The target's 320ms exit precedes its completion callback. Own input
        // from the final letter through the existing physical-action interval.
        this.trailTransitionPending = true;
      },
      onComplete: () => {
        if (generation !== this.trailGeneration || !this.trailBackdrop?.scene) return;
        this.trailTransitionPending = true;
        this.completeRiverBeat(beat);
        playChime();
        this.releaseRiverCueWordAnchor();
        this.clearActiveTargets();
        if (idx + 1 < RIVER_BEATS.length) this.checkpoint("trail", { index: idx + 1 });
        else this.checkpoint("heldur", { index: 0, intro: true });
        this.time.delayedCall(700, () => {
          if (generation === this.trailGeneration) this.runRiverBeats(idx + 1);
        });
      },
    });
    this.attachRiverCueWordAnchor(target);
    this.registerActiveTarget(target);
  }

  private showRiverCue(beat: (typeof RIVER_BEATS)[number]): void {
    this.ensureTrailStage(RIVER_BEATS.indexOf(beat));
    this.releaseRiverCueWordAnchor();
    this.riverCue = this.riverLandmarks[beat] ?? null;
    this.riverCueBeat = beat;
  }

  /** The ice and branch belong to one static painting, not disposable props. */
  private ensureTrailStage(completedBeats: number): void {
    if (this.trailBackdrop?.scene) return;
    this.trailGeneration += 1;
    this.trailBackdrop = this.add.image(0, WINTER_TRAIL_PLATE_Y, "winter-trail-backdrop")
      .setOrigin(0).setDisplaySize(this.scale.width, this.scale.height).setDepth(-99);
    for (const beat of RIVER_BEATS) {
      const pos = this.riverCuePosition(beat);
      const cue = this.add.container(pos.x, pos.y).setDepth(-1);
      this.riverLandmarks[beat] = cue;
      if (beat !== "lift") continue;
      cue.add(addLocalGroundShadow(this, 252, 18, { y: 4, alpha: 0.24 }));
      const log = this.add.image(0, 0, "winter-fallen-pine").setOrigin(0.5, 0.83);
      log.setScale(320 / log.width);
      applySceneActorLighting(this, log);
      cue.add(log);
    }
    if (completedBeats > 0) {
      this.riverLandmarks.lift?.setPosition(WINTER_TRAIL_LOG_ASIDE.x, WINTER_TRAIL_LOG_ASIDE.y)
        .setAngle(WINTER_TRAIL_LOG_ASIDE.angle);
    }
    // Stable checkpoint states are reconstructed directly; no action replays.
    const restored = completedBeats >= 2
      ? { x: 1240, y: WINTER_TRAIL_FEET_Y }
      : completedBeats === 1 ? this.trailWrenPosition("lift")
        : { x: 330, y: WINTER_TRAIL_FEET_Y };
    this.tweens.killTweensOf(this.wrenContainer);
    this.wrenContainer.setPosition(restored.x, restored.y).setAlpha(1).setScale(1);
    setWrenPose(this.wrenSprite, "front");
  }

  private riverCuePosition(beat: (typeof RIVER_BEATS)[number]): { x: number; y: number } {
    if (beat === "lift") return WINTER_TRAIL_LOG;
    if (beat === "step") return { x: 976, y: 810 };
    return { x: 1350, y: 565 };
  }

  private riverWordPosition(beat: (typeof RIVER_BEATS)[number]): { x: number; y: number } {
    const cue = this.riverCuePosition(beat);
    return { x: cue.x, y: beat === "duck" ? 450 : cue.y - 164 };
  }

  /** Claiming approaches the landmark; only completing its word crosses it. */
  private trailWrenPosition(beat: (typeof RIVER_BEATS)[number]): { x: number; y: number } {
    if (beat === "lift") return { x: 430, y: WINTER_TRAIL_FEET_Y };
    if (beat === "step") return { x: 710, y: WINTER_TRAIL_FEET_Y };
    return { x: 1240, y: WINTER_TRAIL_FEET_Y };
  }

  private stageWrenAtTrailEntrance(): void {
    if (!this.trailBackdrop?.scene) return;
    this.tweens.killTweensOf(this.wrenContainer);
    this.wrenContainer.setPosition(330, WINTER_TRAIL_FEET_Y).setAlpha(1).setScale(1);
  }

  private walkWrenToTrailBeat(beat: (typeof RIVER_BEATS)[number]): void {
    const destination = this.trailWrenPosition(beat);
    this.moveWrenTo(destination.x, destination.y, {
      durationMs: beat === "step" ? 620 : 560,
      ringWidth: beat === "duck" ? 160 : 220,
    });
  }

  private completeRiverBeat(beat: (typeof RIVER_BEATS)[number]): void {
    if (beat === "lift") {
      this.band.setObjective("The pine lifts clear of the path.");
      const log = this.riverLandmarks.lift;
      if (!log?.scene) return;
      this.tweens.killTweensOf(log);
      if (reducedMotion(this)) {
        log.setPosition(WINTER_TRAIL_LOG_ASIDE.x, WINTER_TRAIL_LOG_ASIDE.y).setAngle(WINTER_TRAIL_LOG_ASIDE.angle);
      } else {
        const generation = this.trailGeneration;
        this.tweens.add({ targets: log, x: WINTER_TRAIL_LOG_ASIDE.x, y: WINTER_TRAIL_LOG_ASIDE.y - 18,
          angle: WINTER_TRAIL_LOG_ASIDE.angle, duration: 260, ease: "Sine.easeOut",
          onComplete: () => {
            if (generation !== this.trailGeneration || !log.scene) return;
            this.tweens.add({ targets: log, y: WINTER_TRAIL_LOG_ASIDE.y, duration: 300, ease: "Sine.easeInOut" });
          },
        });
      }
      this.pulseRiverCue(true);
      return;
    }
    this.band.setObjective(beat === "step" ? "Wren crosses the ice carefully." : "Wren ducks beneath the pine bough.");
    setWrenPose(this.wrenSprite, "walk");
    if (beat === "duck") this.wrenSprite.scaleY *= 0.62;
    const destination = beat === "step"
      ? { x: 1240, y: WINTER_TRAIL_FEET_Y }
      : { x: 1540, y: 800 };
    const generation = this.trailGeneration;
    const stand = (): void => {
      if (generation === this.trailGeneration && this.trailBackdrop?.scene) setWrenPose(this.wrenSprite, "front");
    };
    this.moveWrenTo(destination.x, destination.y, {
      durationMs: 620,
      quiet: true,
      onComplete: () => {
        if (beat === "duck" && reducedMotion(this)) this.time.delayedCall(620, stand);
        else stand();
      },
    });
    this.pulseRiverCue(true);
  }

  private resetWrenToWinterStage(): void {
    this.moveWrenTo(this.scale.width / 2, WINTER_WREN_STAGE_Y, {
      durationMs: 620,
      quiet: true,
    });
  }

  private moveWrenTo(
    x: number,
    y: number,
    opts: { durationMs?: number; ringWidth?: number; quiet?: boolean; onComplete?: () => void } = {},
  ): void {
    if (!this.wrenContainer?.scene) return;
    this.tweens.killTweensOf(this.wrenContainer);
    // Traversal can replace the arrival tween before it has faded in. Always
    // finish that visibility state when taking ownership of Wren's movement.
    this.wrenContainer.setAlpha(1);
    if (this.trailBackdrop?.scene && reducedMotion(this)) {
      this.wrenContainer.setPosition(x, y);
      opts.onComplete?.();
      return;
    }
    this.tweens.add({
      targets: this.wrenContainer,
      x,
      y,
      duration: opts.durationMs ?? 560,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.wrenContainer?.scene) return;
        if (!this.trailBackdrop?.scene) addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2100 });
        opts.onComplete?.();
      },
    });
    if (opts.quiet) return;
    playSceneEventPulse(this, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      x,
      y: y - 30,
      depth: -0.2,
      durationMs: 540,
      ringWidth: opts.ringWidth ?? 210,
      ringHeight: 58,
      count: 7,
      alpha: 0.1,
      spreadX: 82,
      spreadY: 24,
    });
  }

  private attachRiverCueWordAnchor(target: TextWordTarget): void {
    const cue = this.riverCue;
    if (!cue?.scene) return;
    this.releaseRiverCueWordAnchor();
    this.riverCueWordAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.frost,
        alpha: 0.13,
        depth: 7,
        sourceOffsetY: this.riverCueBeat === "duck" ? 0 : -26,
        targetOffsetY: 24,
      },
    );
  }

  private releaseRiverCueWordAnchor(): void {
    this.riverCueWordAnchor?.destroy();
    this.riverCueWordAnchor = null;
  }

  private pulseRiverCue(completion: boolean): void {
    if (!this.riverCue?.scene) return;
    // Snow marks the interaction; solid roots/ice never breathe or scale.
    playBodyImpact(this, this.riverCue, {
      kind: "snow", color: PALETTE_HEX.frost, offsetY: this.riverCueBeat === "duck" ? 0 : -18,
      depth: 10, ringRadius: completion ? 32 : 20, count: completion ? 6 : 3,
      durationMs: completion ? 400 : 220,
    });
  }

  private dismissRiverCue(animate = true): void {
    this.releaseRiverCueWordAnchor();
    this.trailGeneration += 1;
    this.trailTransitionPending = false;
    for (const cue of Object.values(this.riverLandmarks)) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
    this.riverLandmarks = {};
    this.riverCue = null;
    this.riverCueBeat = null;
    const plate = this.trailBackdrop;
    this.trailBackdrop = null;
    if (!plate?.scene) return;
    if (!animate || reducedMotion(this)) { plate.destroy(); return; }
    this.tweens.add({ targets: plate, alpha: 0, duration: 240, onComplete: () => plate.destroy() });
  }

  /** The Wayshrine Knight — Heldur */
  private startHeldur(): void {
    this.checkpoint("heldur", { index: 0, intro: true });
    this.narration.say("winter_wayshrine_intro");
    this.band.setObjective("Ask the frozen knight the words that wake the wayshrine.");
    this.fadeInHeldur();
    this.readThen(() => this.runHeldurExchange(0));
  }

  /** A back-and-forth where Wren types a short question and Heldur answers
   *  in dialog above him. After the third exchange, the eye-open flash
   *  fires and the scene moves on to cold-decay. */
  private runHeldurExchange(idx: number): void {
    if (idx >= HELDUR_QUESTIONS.length) { this.showHeldurAwake(); return; }
    this.checkpoint("heldur", { index: idx });

    this.setNarrator(HELDUR_NARRATOR_PROMPTS[idx]);
    const heldurPromptX = this.heldurSprite
      ? this.heldurSprite.x + 185
      : this.scale.width / 2;
    const heldurPromptY = this.heldurSprite
      ? this.heldurSprite.y - 255
      : this.scale.height / 2 + 40;

    const target = this.makeHeldurWord({
      scene: this,
      word: HELDUR_QUESTIONS[idx],
      x: heldurPromptX,
      y: heldurPromptY,
      fontSize: 44,
      onClaim: () => playWrenFocus(this.wrenSprite),
      onComplete: () => {
        this.playWrenTrailAction();
        playClack();
        this.clearActiveTargets();
        this.showHeldurAnswer(idx);
      },
    });
    this.registerActiveTarget(target);
  }

  private showHeldurAnswer(index: number): void {
    this.checkpoint("heldur-answer", { index });
    this.setNarrator(HELDUR_RESPONSES[index], "Heldur");
    this.readThen(() => this.runHeldurExchange(index + 1));
  }

  private showHeldurAwake(): void {
    this.checkpoint("heldur-awake");
    this.narration.say("winter_heldur_eyes_open");
    this.band.setObjective("Act I · The wayshrine wakes; keep Wren's candles lit.");
    if (this.heldurSprite) {
      this.heldurSprite.setTintFill(0xffd277);
      this.time.delayedCall(180, () => { if (this.heldurSprite) restoreSceneActorLighting(this.heldurSprite); });
    }
    this.readThen(() => this.onHeldurSpoken());
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
    this.heldurSprite.setPosition(420, WINTER_WREN_STAGE_Y);
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
    this.clearHeldurWordAnchors();
    const sprite = this.heldurSprite;
    this.heldurSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  /** Edge of the Dark Wood — cold-decay candle mechanic begins */
  private startColdDecay(): void {
    this.checkpoint("cold");
    this.narration.say("winter_cold_decay");
    this.band.setObjective("Keep the candles lit as the cold presses in.");
    // Candles are visible from the start; now they start dimming
    this.readThen(() => {
      this.startColdDecayTimer();
      this.promptKindle();
    });
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
    this.checkpoint("kindle");
    this.narration.say("winter_kindle_prompt");
    this.band.setObjective("Type kindle before the cold takes a candle.");
    const cue = this.add
      .container(this.wrenContainer.x + 124, this.wrenContainer.y - 132)
      .setDepth(42)
      .setAlpha(0);
    cue.add(addLocalGroundShadow(this, 104, 16, { y: 28, alpha: 0.18 }));
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE_HEX.dim, 0.5);
    g.lineBetween(-32, 22, 34, 8);
    g.lineBetween(-26, 8, 28, 22);
    g.fillStyle(PALETTE_HEX.ember, 0.58);
    g.fillEllipse(0, 2, 26, 54);
    g.fillStyle(0xf3ead2, 0.68);
    g.fillEllipse(0, 8, 11, 28);
    cue.add(g);
    addContainerWake(this, cue, {
      kind: "ember",
      intervalMs: 300,
      spreadX: 30,
      spreadY: 18,
      color: PALETTE_HEX.ember,
      alpha: 0.32,
      size: 3.2,
      depth: 43,
      driftX: 10,
      driftY: -28,
      durationMs: 820,
    });
    this.tweens.add({
      targets: cue,
      alpha: 0.86,
      y: cue.y - 10,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (cue.scene) addIdleBreath(this, cue, { dy: -3, durationMs: 2400 });
      },
    });
    let cueAnchor: WordBodyAnchorHandle | null = null;
    const releaseCueAnchor = (): void => {
      cueAnchor?.destroy();
      cueAnchor = null;
    };
    const target = this.makeWord({
      scene: this,
      word: "kindle",
      x: cue.x,
      y: cue.y - 86,
      fontSize: 40,
      burstColor: PALETTE_HEX.ember,
      onClaim: () => {
        playWrenFocus(this.wrenSprite);
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          cue.x,
          cue.y + 4,
          { color: PALETTE_HEX.ember, depth: 58 },
        );
        playActorAttention(this, cue, {
          scale: 1.028,
          durationMs: 180,
        });
      },
      onAdvance: () =>
        playBodyTypePulse(this, cue, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: 2,
          depth: 58,
          ringRadius: 22,
        }),
      onComplete: () => {
        releaseCueAnchor();
        this.playWrenTrailAction();
        playBodyImpact(this, cue, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: 2,
          depth: 58,
          ringRadius: 44,
          count: 10,
        });
        dismissStagedCue(this, cue);
        playChime();
        this.restoreCandles();
        this.narration.say("winter_kindle_steady");
        this.band.setObjective("The candles are steady. Continue when you are ready to meet the pack.");
        this.coldDecayTimer?.remove();
        this.coldDecayTimer = null;
        this.checkpoint("wave", { index: 0 });
        this.readThen(() => this.transitionToAct2());
      },
    });
    cueAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.2,
        depth: 43,
        sourceOffsetY: 2,
        targetOffsetY: 24,
      },
    );
    cue.once(Phaser.GameObjects.Events.DESTROY, releaseCueAnchor);
    this.registerActiveTarget(target);
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

  private startWave(idx: number, opts: { retry?: boolean } = {}): void {
    this.clearActiveTargets();
    this.waveActive = false;
    this.waveIndex = idx;
    this.checkpoint("wave", { index: idx });
    this.setNarrator(opts.retry
      ? "Your candles went out. You are back at the start of the same encounter, with one candle lit."
      : idx === 0
      ? "One wolf waits ahead. Type its word before it reaches Wren. Candles are your health; Heart shows accuracy. Clean typing fills Soul. When thunder is ready, hold Shift on the first letter to push the pack back. An empty Soul meter still lets you type normally."
      : WAVES[idx].intro);
    this.band.setObjective(opts.retry
      ? "Retry · Press Enter or Space to try this encounter again."
      : idx === 0
      ? "Act II · Type the wolf word. Candles keep Wren safe; Soul buys thunder."
      : idx === 1 ? "Act II · Two wolves. Type the nearer threat first; Esc releases your word."
      : "Act III · Clear the pack, then name the leader. Keep a candle lit.");
    this.readThen(() => this.spawnWave(idx));
  }

  private spawnWave(idx: number): void {
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
    this.band.setObjective(
      idx === 0
        ? "Type the wolf word before it reaches Wren."
        : idx === 1
          ? "Track both wolves and keep the candles lit."
          : "Clear the pack, then name the Pack-Leader.",
    );

    // Wave-start bookend — audio sting + screen shake so each wave feels
    // like an event, not just "more text appears."
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    playSceneEventPulse(this, {
      kind: "snow",
      color: 0xb7dcff,
      x: this.scale.width / 2,
      y: 690,
      ringWidth: 980,
      ringHeight: 170,
      count: 14,
    });

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
        const anchor = this.quietLordIntrusionAnchor();
        playQuietLordIntrusion(this, {
          x: anchor.x,
          y: anchor.y,
          text: "i have been listening from the cold.",
        });
      });
    }
  }

  private quietLordIntrusionAnchor(): { x: number; y: number } {
    let threat: MovingWordEnemy | null = null;
    for (const wolf of this.wolves) {
      if (wolf.isDefeated() || !wolf.container.scene) continue;
      if (!threat || wolf.advanceProgress() > threat.advanceProgress()) {
        threat = wolf;
      }
    }

    // The ink scar may track a threat horizontally, but its sentence belongs
    // in the empty lane below narration, clear of wolf heads and live words.
    return {
      x: threat
        ? Phaser.Math.Clamp(threat.container.x, 260, this.scale.width - 260)
        : this.scale.width / 2,
      y: Math.max(340, this.narration.bottom() + 90),
    };
  }

  /** UI-cohesion: every Winter word target gets the legibility outline by default
   *  (TTT-style). Fork choices pass frame: "banner". */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    return new TextWordTarget({
      outline: true,
      depth: 70,
      ...opts,
      onClaim: (mods) => {
        if (opts.frame === "banner") playWrenFocus(this.wrenSprite);
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        this.playWrenTypingPulse();
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        if (opts.frame === "banner") playWrenAction(this.wrenSprite);
        onComplete();
      },
    });
  }

  private registerActiveTarget(...targets: TextWordTarget[]): void {
    const entryMs = 180;
    targets.forEach((target, index) => {
      this.typingInput.register(target);
      this.activeTargets.push(target);
      target.playEntryWake({
        durationMs: entryMs,
        offsetY: 0,
      });
      target.playIdleFloat({
        delayMs: entryMs + 120 + index * 70,
        dy: -2,
        durationMs: 1800 + index * 90,
      });
    });
  }

  private makeHeldurWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.heldurSprite;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.heldurWordAnchors.indexOf(anchor);
      if (idx >= 0) this.heldurWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.frost,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 170,
          { color: PALETTE_HEX.frost, depth: 58 },
        );
        playActorAttention(this, body, {
          tint: PALETTE_HEX.frost,
          scale: 1.018,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "snow",
          color: PALETTE_HEX.frost,
          offsetY: -170,
          depth: 58,
          ringRadius: 30,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "snow",
          color: PALETTE_HEX.frost,
          offsetY: -170,
          depth: 58,
          ringRadius: 54,
          count: 11,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.frost,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -170,
        targetOffsetY: 24,
      },
    );
    this.heldurWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeFoxWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.foxCompanion;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.foxWordAnchors.indexOf(anchor);
      if (idx >= 0) this.foxWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.frost,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 60,
          { color: PALETTE_HEX.frost, depth: 58 },
        );
        this.pulseFoxCompanion();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "snow",
          color: PALETTE_HEX.frost,
          offsetY: -60,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "snow",
          color: PALETTE_HEX.frost,
          offsetY: -60,
          depth: 58,
          ringRadius: 42,
          count: 9,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.frost,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -60,
        targetOffsetY: 24,
      },
    );
    this.foxWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeWinterForkWord(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    opts: TextWordTargetOptions,
    vfx: { kind: "snow" | "mote"; color: number; sourceOffsetX?: number; sourceOffsetY: number },
  ): TextWordTarget {
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.forkChoiceWordAnchors.indexOf(anchor);
      if (idx >= 0) this.forkChoiceWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? vfx.color,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x + (vfx.sourceOffsetX ?? 0),
          body.y + vfx.sourceOffsetY,
          { color: vfx.color, depth: 58 },
        );
        playBodyTypePulse(this, body, {
          kind: vfx.kind,
          color: vfx.color,
          offsetX: vfx.sourceOffsetX ?? 0,
          offsetY: vfx.sourceOffsetY,
          depth: 58,
          ringRadius: 24,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: vfx.kind,
          color: vfx.color,
          offsetX: vfx.sourceOffsetX ?? 0,
          offsetY: vfx.sourceOffsetY,
          depth: 58,
          ringRadius: 22,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: vfx.kind,
          color: vfx.color,
          offsetX: vfx.sourceOffsetX ?? 0,
          offsetY: vfx.sourceOffsetY,
          depth: 58,
          ringRadius: 44,
          count: 9,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: vfx.color,
        alpha: 0.18,
        depth: 44,
        sourceOffsetX: vfx.sourceOffsetX ?? 0,
        sourceOffsetY: vfx.sourceOffsetY,
        targetOffsetY: 24,
      },
    );
    this.forkChoiceWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private clearHeldurWordAnchors(): void {
    for (const anchor of this.heldurWordAnchors) anchor.destroy();
    this.heldurWordAnchors = [];
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private clearFoxWordAnchors(): void {
    for (const anchor of this.foxWordAnchors) anchor.destroy();
    this.foxWordAnchors = [];
  }

  private playWrenTypingPulse(): void {
    playBodyTypePulse(this, this.wrenContainer, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      offsetY: -108,
      depth: 58,
      ringRadius: 22,
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
    const container = this.add.container(startX, targetY).setDepth(3);
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
      anchorOffsetY: -232,
      idleBobDy: 6,
      idleBobMs: 900,
      defeatRiseY: -60,
      defeatMs: 500,
      fontSize: 34,
      // Frost burst on completion — wolves go "down in snow," not "down in brass."
      burstColor: PALETTE_HEX.frost,
      defeatImpactKind: "snow",
      defeatImpactColor: PALETTE_HEX.frost,
      arrivalImpactKind: "snow",
      arrivalImpactColor: PALETTE_HEX.frost,
      claimLineFrom: () => ({
        x: this.wrenContainer.x,
        y: this.wrenContainer.y - 116,
      }),
      claimLineColor: PALETTE_HEX.frost,
      outline: true,
      // The circler (flanking) wolf weaves vertically as it closes.
      verticalOffset: circles ? circlerY : undefined,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => { t.setDepth(70); this.activeTargets.push(t); },
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
      onReachWren: (self) => this.onWolfHit(self),
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
    const startX = this.scale.width + 200;
    const container = this.add.container(startX, BOSS_SPAWN_Y).setDepth(2);
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
      anchorOffsetY: -286,
      idleBobDy: 6,
      idleBobMs: 900,
      defeatRiseY: -60,
      defeatMs: 500,
      fontSize: 32,
      burstColor: PALETTE_HEX.frost,
      defeatImpactKind: "snow",
      defeatImpactColor: PALETTE_HEX.frost,
      arrivalImpactKind: "snow",
      arrivalImpactColor: PALETTE_HEX.frost,
      claimLineFrom: () => ({
        x: this.wrenContainer.x,
        y: this.wrenContainer.y - 116,
      }),
      claimLineColor: PALETTE_HEX.frost,
      outline: true,
      // Warded: the boss advances mute until the pack falls; releaseBossWard()
      // attaches its true name then.
      manualAttach: true,
      // The Old One's true name is SPOKEN with its capitals — caseSensitive, so the
      // caps demand Shift (required typing, free). No spell routes — you name it,
      // you can't thunderclap or shatter it away.
      caseSensitive: true,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => { t.setDepth(70); this.activeTargets.push(t); },
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
      onReachWren: (self) => this.onWolfHit(self),
      onComplete: () => this.returnWrenToRest(),
    });

    this.boss = boss;
    this.wolves.push(boss);
  }

  private releaseBossWard(): void {
    const boss = this.boss;
    if (!boss || boss.isDefeated() || boss.target) return;
    this.checkpoint("boss");
    boss.knockBack(260, 2600);
    // Snow-drift sensory beat: 2s of falling snow obscures words briefly
    this.triggerSnowDrift(() => {
      this.narration.say("winter_boss_rise");
      if (this.bossBodySprite) {
        this.bossBodySprite.setTintFill(0xffd277);
        this.time.delayedCall(140, () => { if (this.bossBodySprite) restoreSceneActorLighting(this.bossBodySprite); });
      }
      this.band.setObjective("Type the Old One, STIRRING. Match capitals and punctuation; Shift is free required typing here.");
      playBodyImpact(this, boss.container, {
        kind: "snow",
        color: PALETTE_HEX.frost,
        offsetY: -132,
        depth: 58,
        ringRadius: 66,
        count: 14,
        durationMs: 520,
      });
      if (!reducedMotion(this)) this.cameras.main.shake(180, 0.003);
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
      alpha: reducedFlashes(this) ? 0.16 : 0.7,
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
  private onWolfHit(source: MovingWordEnemy): void {
    playBodyContactCue(this, source.container, this.wrenContainer, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      sourceOffsetY: -82,
      targetOffsetY: -110,
      sourceRadius: 34,
      targetRadius: 38,
    });
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
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
        this.checkpoint("boss-defeated");
        this.onBossDefeated();
      } else {
        this.checkpoint(this.waveIndex === 0 ? "fox" : "fork1");
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
    this.checkpoint("fox");
    this.narration.say("winter_fox_intro");
    this.band.setObjective("Choose how Wren answers the wounded fox.");
    this.showFoxCompanion({
      x: this.scale.width / 2 + 290,
      y: WINTER_WREN_STAGE_Y,
      startX: this.scale.width / 2 + 430,
      height: 118,
      shadowWidth: 96,
    });
    // The choice rail stays above the actors' heads, with each option in its
    // own empty snowfield. Neither banner can cover Wren or the fox.
    const choiceY = Math.max(510, this.narration.bottom() + 78);

    const kindTarget = this.makeFoxWord({
      scene: this,
      word: "i mean no harm",
      x: 590,
      y: choiceY,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = true;
        this.foxDecided = true;
        this.store.update((s) => {
          if (!s.almanacLore.includes("the-wounded-foxs-name")) {
            s.almanacLore.push("the-wounded-foxs-name");
          }
        });
        this.showFoxAnswer(nextWave);
      },
    });

    const hurtTarget = this.makeFoxWord({
      scene: this,
      word: "i don't have time",
      x: 1450,
      y: choiceY,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.foxSpared = false;
        this.foxDecided = true;
        this.showFoxAnswer(nextWave);
      },
    });

    this.registerActiveTarget(kindTarget, hurtTarget);
  }

  // ─── CYOA Fork 1 (after Wave 2, before Wave 3) ───────────────────────────

  private showFoxAnswer(nextWave: number): void {
    this.foxDecided = true;
    this.checkpoint("fox-answer");
    if (this.foxSpared) this.showFoxCompanion();
    else this.foxCompanion?.setVisible(false);
    this.narration.say(this.foxSpared ? "winter_fox_spared_ear" : "winter_fox_dismissed");
    this.band.setObjective(this.foxSpared ? "The fox remembers your patience." : "You leave the fox behind.");
    this.readThen(() => {
      this.foxCompanion?.setVisible(false);
      this.dismissFoxCompanion(this.foxSpared ? 1640 : 460, WINTER_WREN_STAGE_Y);
      this.startWave(nextWave);
    });
  }

  private winterForkChoiceWordPosition(kind: "huntress" | "firefly" | "cairn" | "pelt"): { x: number; y: number } {
    const subjects = {
      huntress: { body: this.huntressSprite, x: 560, y: 576 },
      firefly: { body: this.fireflyCue, x: 1330, y: 650 },
      cairn: { body: this.cairnCue, x: 650, y: 660 },
      pelt: { body: this.peltCue, x: 1270, y: 660 },
    };
    const subject = subjects[kind];
    return {
      x: subject.body?.scene ? subject.body.x : subject.x,
      y: Math.max(subject.y, this.narration.bottom() + 78),
    };
  }

  private startFork1(nextWave: number): void {
    if (this.fork1Choice === "huntress") { this.startHuntressBranch(nextWave); return; }
    if (this.fork1Choice === "firefly") { this.startFireflyBranch(nextWave); return; }
    this.checkpoint("fork1");
    this.narration.say("winter_fork1_intro");
    this.band.setObjective("Choose a path · The huntress offers her horn and friendship. The fireflies offer a lantern. Your choice will be remembered.");
    this.fadeInHuntress();
    const fireflies = this.showFireflyCue();

    const huntress = this.makeWinterForkWord(this.huntressSprite, {
      scene: this,
      word: "save the huntress",
      ...this.winterForkChoiceWordPosition("huntress"),
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.fork1Choice = "huntress";
        this.startHuntressBranch(nextWave);
      },
    }, { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -150 });
    const firefly = this.makeWinterForkWord(fireflies, {
      scene: this,
      word: "follow the fireflies",
      ...this.winterForkChoiceWordPosition("firefly"),
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.fork1Choice = "firefly";
        this.startFireflyBranch(nextWave);
      },
    }, { kind: "mote", color: PALETTE_HEX.brass, sourceOffsetY: -34 });
    this.registerActiveTarget(huntress, firefly);
  }

  private startHuntressBranch(nextWave: number): void {
    this.clearHuntressHorn();
    this.fork1Choice = "huntress";
    this.checkpoint("huntress", this.savedStageData("huntress"));
    this.clearActiveTargets();
    this.dismissFireflyCue();
    this.narration.say("winter_huntress_intro");
    this.band.setObjective("Help the huntress · Type the visible phrase; Enter / Space continues each response.");
    this.fadeInHuntress();
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-huntress-song")) {
        s.almanacLore.push("the-huntress-song");
      }
    });
    const beginPassage = () => {
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
        "huntress",
        undefined,
        "huntress",
      );
    };
    if (this.hasSavedPassage("huntress", HUNTRESS_PASSAGES.length)) beginPassage();
    else this.readThen(beginPassage);
  }

  private fadeInHuntress(): void {
    if (this.huntressSprite) return;
    this.huntressSprite = makeHuntressSprite(this);
    // Half-buried in the drift to Wren's left.
    this.huntressSprite.setPosition(560, WINTER_WREN_STAGE_Y);
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
    this.clearHuntressHorn();
    if (!this.huntressSprite) return;
    const sprite = this.huntressSprite;
    this.huntressSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  private clearHuntressHorn(): void {
    this.huntressHornTransferToken += 1;
    this.huntressHornTransferPending = false;
    const horn = this.huntressHornSprite;
    this.huntressHornSprite = null;
    if (!horn) return;
    this.tweens.killTweensOf(horn);
    horn.destroy();
  }

  /** This handoff illustrates the completed phrase. Inventory still changes
   * at the existing realm ending, and a restored reading never replays it. */
  private transferHuntressHorn(onSettled: () => void, restored = false): void {
    this.clearHuntressHorn();
    const icon = satchelIconFor("hunters-horn");
    if (!icon || !this.textures.exists(icon.key)) { onSettled(); return; }
    const token = this.huntressHornTransferToken;
    const end = { x: this.wrenContainer.x - 42, y: this.wrenContainer.y - 122 };
    const immediate = restored || reducedMotion(this);
    const from = this.huntressSprite?.scene
      ? { x: this.huntressSprite.x + 42, y: this.huntressSprite.y - 106 }
      : end;
    const horn = this.add.image(immediate ? end.x : from.x, immediate ? end.y : from.y, icon.key)
      .setOrigin(0.5).setDepth(61);
    horn.setScale(76 / Math.max(horn.width, horn.height));
    applySceneActorLighting(this, horn);
    this.huntressHornSprite = horn;
    if (immediate) { onSettled(); return; }
    this.huntressHornTransferPending = true;
    let settled = false;
    this.tweens.add({
      targets: horn, ...end, duration: 650, ease: "Sine.easeInOut",
      onComplete: () => {
        if (settled || token !== this.huntressHornTransferToken || this.huntressHornSprite !== horn || !horn.scene) return;
        settled = true;
        this.huntressHornTransferPending = false;
        onSettled();
      },
    });
  }

  private presentWinterPassageReaction(
    owner: WinterPassageOwner, step: number, reaction: string,
    onContinue: () => void, restored = false,
  ): void {
    const handoff = owner === "huntress" && step === HUNTRESS_PASSAGES.length - 1;
    const present = () => {
      if (owner === "firefly") {
        if (step === 0) this.showFireflyHollow();
        else this.receiveFireflyLanternVisual();
      }
      if (owner === "pelt" && step === PELT_PASSAGES.length - 1) {
        this.receivePeltVisual();
        this.band.setObjective("The pelt is in your hands. Press Enter or Space to continue.");
      }
      this.setNarrator(reaction);
      this.readThen(() => {
        if (handoff) this.clearHuntressHorn();
        onContinue();
      });
    };
    if (handoff) this.transferHuntressHorn(present, restored);
    else present();
  }

  private startFireflyBranch(nextWave: number): void {
    this.fork1Choice = "firefly";
    this.checkpoint("firefly", this.savedStageData("firefly"));
    this.showFireflyCue();
    this.clearActiveTargets();
    this.fadeOutHuntress();
    this.narration.say("winter_firefly_intro");
    this.band.setObjective("Type the passage words to follow the fireflies.");
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-firefly-trail")) {
        s.almanacLore.push("the-firefly-trail");
      }
    });
    const beginPassage = () => {
      this.runPassageChain(
        FIREFLY_PASSAGES,
        [
          "The lights lead you to a hollow tree. A paper lantern waits inside; the fireflies settle behind its thin walls.",
          "You lift the lantern from the hollow. Its three lights glow steadily in your hands.",
        ],
        () => {
          this.dismissFireflyCue();
          this.startWave(nextWave);
        },
        "firefly",
        undefined,
        "firefly",
      );
    };
    if (this.hasSavedPassage("firefly", FIREFLY_PASSAGES.length)) beginPassage();
    else this.readThen(beginPassage);
  }

  private showFireflyCue(): Phaser.GameObjects.Container {
    if (this.fireflyCue?.scene) return this.fireflyCue;

    const c = this.add.container(1330, 790).setDepth(43).setAlpha(0);
    c.add(addLocalGroundShadow(this, 120, 18, { y: 24, alpha: 0.12 }));

    const g = this.add.graphics();
    const motes = [
      { x: -42, y: -22, r: 5 },
      { x: -12, y: -48, r: 4 },
      { x: 18, y: -26, r: 5 },
      { x: 46, y: -58, r: 4 },
      { x: 66, y: -18, r: 4 },
    ];
    for (const mote of motes) {
      g.fillStyle(0xf8d070, 0.18);
      g.fillCircle(mote.x, mote.y, mote.r * 4);
      g.fillStyle(0xf7e0a0, 0.82);
      g.fillCircle(mote.x, mote.y, mote.r);
    }
    c.add(g);

    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 170,
      offsetY: -42,
      spreadX: 54,
      spreadY: 28,
      color: PALETTE_HEX.brass,
      depth: 42,
      alpha: 0.32,
    });
    this.tweens.add({
      targets: c,
      alpha: 0.95,
      y: 774,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (c.scene) addIdleBreath(this, c, { dy: -8, durationMs: 1600 });
      },
    });
    decorativeTween(this, this.tweens.add({
      targets: g,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    }));

    this.fireflyCue = c;
    return c;
  }

  /** Reuse the snowy fallen pine and the actual paper-lantern keepsake. The
   * tree is planted; only the earlier loose fireflies float above the snow. */
  private showFireflyHollow(): Phaser.GameObjects.Container {
    if (this.fireflyCue?.getByName("winter-firefly-tree")) return this.fireflyCue;
    const lights = this.fireflyCue;
    if (lights?.scene) {
      this.tweens.killTweensOf(lights);
      lights.destroy();
    }
    const cue = this.add.container(1330, 790).setDepth(43);
    cue.add(addLocalGroundShadow(this, 420, 26, { x: 70, y: 52, alpha: 0.22 }));
    const tree = this.add.image(80, 52, "winter-fallen-pine")
      .setName("winter-firefly-tree").setOrigin(0.5, 0.83);
    tree.setScale(520 / tree.width);
    applySceneActorLighting(this, tree);
    cue.add(tree);
    const hollow = this.add.graphics().setName("winter-firefly-hollow");
    hollow.fillStyle(0x100e12, 0.96);
    hollow.fillEllipse(-80, -4, 62, 88);
    hollow.lineStyle(4, 0x514344, 0.88);
    hollow.strokeEllipse(-80, -4, 64, 90);
    hollow.lineStyle(2, 0xb8c8d4, 0.5);
    hollow.strokeEllipse(-82, -7, 68, 94);
    cue.add(hollow);
    const icon = satchelIconFor("firefly-lantern");
    if (icon && this.textures.exists(icon.key)) {
      const lantern = this.add.image(-80, -4, icon.key).setName("winter-firefly-lantern");
      lantern.setScale(88 / lantern.height);
      applySceneActorLighting(this, lantern);
      cue.add(lantern);
      this.fireflyLanternSprite = lantern;
    }
    this.fireflyCue = cue;
    return cue;
  }

  /** The existing take-the-lantern result empties the hollow and carries the
   * same painting. Its inventory award stays at the original realm ending. */
  private receiveFireflyLanternVisual(): void {
    const cue = this.showFireflyHollow();
    const lantern = this.fireflyLanternSprite;
    if (!lantern?.scene) return;
    if (lantern.parentContainer === cue) {
      cue.remove(lantern);
      this.add.existing(lantern);
    }
    lantern.setPosition(this.wrenContainer.x + 54, this.wrenContainer.y - 120).setDepth(61);
  }

  private clearFireflyLantern(): void {
    const lantern = this.fireflyLanternSprite;
    this.fireflyLanternSprite = null;
    if (!lantern?.scene) return;
    this.tweens.killTweensOf(lantern);
    lantern.destroy();
  }

  private dismissFireflyCue(): void {
    this.clearFireflyLantern();
    const cue = this.fireflyCue;
    this.clearForkChoiceWordAnchors();
    if (!cue?.scene) {
      this.fireflyCue = null;
      return;
    }
    this.fireflyCue = null;
    this.tweens.killTweensOf(cue);
    this.tweens.add({
      targets: cue,
      alpha: 0,
      y: cue.y - 26,
      duration: 420,
      ease: "Sine.easeIn",
      onComplete: () => cue.destroy(),
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

    if (!reducedFlashes(this)) this.cameras.main.flash(300, 20, 18, 30);
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
      this.startWave(this.waveIndex, { retry: true });
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
    this.band.showNotice("Thunder rolls from Wren.", {
      label: "spell",
      durationMs: 1300,
    });
    if (!reducedFlashes(this)) this.cameras.main.flash(220, 240, 230, 200);
    playChime();
    this.playWrenTrailAction();

    // Shove the rest of the pack back to their rest points and pause before they
    // re-advance — breathing room, words intact (no kill, no candle cost).
    for (const w of this.wolves) {
      if (w.isDefeated() || w === source) continue;
      this.playWinterSpellLine(
        this.wrenContainer.x,
        this.wrenContainer.y - 116,
        w.container.x,
        w.container.y - 88,
        PALETTE_HEX.brass,
      );
      this.playWinterSpellImpact(w, PALETTE_HEX.brass, "mote");
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
    this.band.showNotice("Frost shatters through the pack.", {
      label: "spell",
      durationMs: 1300,
    });
    if (!reducedFlashes(this)) this.cameras.main.flash(220, 150, 200, 240); // icy blue, vs thunderclap white
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
    this.playWinterSpellLine(
      source.container.x,
      source.container.y - 98,
      nearest.container.x,
      nearest.container.y - 88,
      PALETTE_HEX.frost,
    );
    this.playWinterSpellImpact(nearest, PALETTE_HEX.frost, "snow");
    nearest.defeat();
  }

  private playWinterSpellLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
  ): void {
    playClaimLine(this, fromX, fromY, toX, toY, {
      color,
      depth: 62,
      durationMs: 420,
    });
  }

  private playWinterSpellImpact(
    target: MovingWordEnemy,
    color: number,
    kind: "mote" | "snow",
  ): void {
    playBodyImpact(this, target.container, {
      kind,
      color,
      offsetY: -88,
      depth: 63,
      ringRadius: 36,
      count: 7,
      durationMs: 360,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3 — The Boss Aftermath
  // ═══════════════════════════════════════════════════════════════════════════

  private onBossDefeated(): void {
    this.checkpoint("boss-defeated");
    this.narration.say("winter_boss_defeated");
    this.band.setObjective("The Pack-Leader falls. A scratched letter remains in the Almanac.");
    // Quiet Lord fragment ~~A~~ — first letter of the accumulating word.
    // Once per playthrough — skip if already revealed on a previous run.
    const alreadyRevealed =
      this.store.get().realms["winter-mountain"]?.quietLordFragmentRevealed ?? false;
    if (!alreadyRevealed) {
      this.store.update((s) => {
        const realm = s.realms["winter-mountain"];
        if (realm) realm.quietLordFragmentRevealed = true;
      });
      const boss = this.boss;
      flashQuietLordFragment(this, {
        text: "A",
        x: boss
          ? Phaser.Math.Clamp(boss.container.x || boss.restX, 320, this.scale.width - 320)
          : this.scale.width / 2,
        y: boss
          ? Phaser.Math.Clamp((boss.container.y || boss.restY) - 126, 260, this.scale.height - 360)
          : this.scale.height / 2 - 40,
      });
    }
    // Almanac lore page 4 — the pack leader's true name. Stamped at the
    // moment of defeat, alongside the fragment flash.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-pack-leader-true-name")) {
        s.almanacLore.push("the-pack-leader-true-name");
      }
    });
    this.readThen(() => this.startFork2());
  }

  /** Renders a brief strikethrough-text flash in the centre of the screen */
  /** Fork 2 — Aftermath: bury under cairn stones OR take the pelt */
  private startFork2(): void {
    if (this.fork2Choice) { this.startAftermathPassage(this.fork2Choice); return; }
    this.checkpoint("fork2");
    this.narration.say("winter_fork2_intro");
    this.band.setObjective("Choose an aftermath · A cairn honors the wolf and may earn trust. The pelt carries his winter into the final battle.");
    const cairn = this.showCairnCue();
    const pelt = this.showPeltCue();

    const buryTarget = this.makeWinterForkWord(cairn, {
      scene: this,
      word: "bury the pack leader",
      ...this.winterForkChoiceWordPosition("cairn"),
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.startAftermathPassage("bury");
      },
    }, { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -42 });

    const peltTarget = this.makeWinterForkWord(pelt, {
      scene: this,
      word: "take the pelt",
      ...this.winterForkChoiceWordPosition("pelt"),
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.startAftermathPassage("pelt");
      },
    }, { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -38 });

    this.registerActiveTarget(buryTarget, peltTarget);
  }

  private startAftermathPassage(choice: "bury" | "pelt"): void {
    this.fork2Choice = choice;
    this.clearActiveTargets();
    this.checkpoint(choice, this.savedStageData(choice));
    const bury = choice === "bury";
    const unusedCue = bury ? this.peltCue : this.cairnCue;
    if (unusedCue?.scene) {
      this.tweens.killTweensOf(unusedCue);
      unusedCue.destroy();
    }
    if (bury) this.peltCue = null; else this.cairnCue = null;
    if (bury) this.showCairnCue(); else this.showPeltCue();
    this.band.setObjective(bury ? "Type the cairn passage to lay the Pack-Leader down." : "Type the pelt passage to carry the winter home.");
    this.runPassageChain(bury ? BURY_PASSAGES : PELT_PASSAGES, bury ? [
      "Stone by stone, you build the cairn. The mountain is quiet.",
      "The pack will not follow here again.",
    ] : [
      "The old one's pelt is heavy with winter. You roll it carefully.",
      "It smells of frost and old forests. It will mean something at the battle.",
    ], () => { this.clearWinterForkCues({ keepHeldPelt: !bury }); this.startFoxGate(); },
      bury ? "cairn" : "pelt", undefined, choice);
  }

  /** Fit the accepted painted footprint, leaving the original owner origins
   * and word/tether positions intact. Export padding is not a floor contact. */
  private addWinterAftermathPainting(
    owner: Phaser.GameObjects.Container,
    texture: "winter-aftermath-cairn" | "winter-aftermath-pelt",
    groundOffsetY: number,
  ): Phaser.GameObjects.Image {
    const image = this.add.image(0, groundOffsetY, texture).setName(texture);
    this.fitWinterAftermathPainting(image, texture, 180);
    owner.add(image);
    return image;
  }

  private fitWinterAftermathPainting(
    image: Phaser.GameObjects.Image,
    texture: "winter-aftermath-cairn" | "winter-aftermath-pelt",
    visibleWidth: number,
  ): void {
    const footprint = texture === "winter-aftermath-cairn"
      ? { x: 79, y: 190, width: 1383, height: 666 }
      : { x: 14, y: 176, width: 1639, height: 617 };
    image.setOrigin((footprint.x + footprint.width / 2) / image.width,
      (footprint.y + footprint.height) / image.height);
    image.setScale(visibleWidth / footprint.width);
    applySceneActorLighting(this, image);
  }

  private showCairnCue(): Phaser.GameObjects.Container {
    if (this.cairnCue?.scene) return this.cairnCue;
    // The source was already settled at792; its low stones meet the snow at812.
    const c = this.add.container(650, 792).setDepth(43).setAlpha(reducedMotion(this) ? 1 : 0);
    c.add(addLocalGroundShadow(this, 184, 24, { y: 20, alpha: 0.3 }));
    this.addWinterAftermathPainting(c, "winter-aftermath-cairn", 20);
    if (!reducedMotion(this)) this.tweens.add({ targets: c, alpha: 1, duration: 560, ease: "Sine.easeOut" });
    this.cairnCue = c;
    return c;
  }

  private showPeltCue(): Phaser.GameObjects.Container {
    if (this.peltCue?.scene) return this.peltCue;
    const c = this.add.container(1270, 790).setDepth(43).setAlpha(reducedMotion(this) ? 1 : 0);
    c.add(addLocalGroundShadow(this, 170, 20, { y: 18, alpha: 0.18 }));
    this.addWinterAftermathPainting(c, "winter-aftermath-pelt", 18);
    if (!reducedMotion(this)) this.tweens.add({ targets: c, alpha: 1, duration: 560, ease: "Sine.easeOut" });
    this.peltCue = c;
    return c;
  }

  /** The same folded pelt leaves the snow before the story calls it carried. */
  private receivePeltVisual(): void {
    if (this.heldPeltSprite?.scene) return;
    const source = this.peltCue?.getByName("winter-aftermath-pelt") as Phaser.GameObjects.Image | null;
    const pelt = source?.scene ? source : this.add.image(0, 0, "winter-aftermath-pelt");
    if (source?.scene) {
      this.peltCue!.remove(pelt);
      this.peltCue!.removeAll(true);
      this.add.existing(pelt);
    }
    this.fitWinterAftermathPainting(pelt, "winter-aftermath-pelt", 104);
    pelt.setPosition(this.wrenContainer.x + 64, this.wrenContainer.y - 96).setDepth(61).setAlpha(1);
    this.heldPeltSprite = pelt;
  }

  private clearHeldPelt(): void {
    const pelt = this.heldPeltSprite;
    this.heldPeltSprite = null;
    if (!pelt?.scene) return;
    this.tweens.killTweensOf(pelt);
    pelt.destroy();
  }

  private clearWinterForkCues(opts: { keepHeldPelt?: boolean } = {}): void {
    this.clearHuntressHorn();
    this.clearFireflyLantern();
    if (!opts.keepHeldPelt) this.clearHeldPelt();
    this.clearForkChoiceWordAnchors();
    const cues = [this.fireflyCue, this.cairnCue, this.peltCue];
    this.fireflyCue = null;
    this.cairnCue = null;
    this.peltCue = null;
    for (const cue of cues) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
  }

  /** Snow-fox companion gate — only if all three kindness conditions met.
   *  Two out of three gets a specific near-miss line from Runa so the player
   *  understands what they'd change on a replay, without being punished. */
  private startFoxGate(): void {
    this.checkpoint("fox-gate");
    const companionChoice = this.store.get().realms["winter-mountain"]?.choices.companion;
    if (companionChoice === "accepted" || companionChoice === "declined") {
      this.startTrueNamePassage();
      return;
    }
    const condFox      = this.foxSpared;
    const condHuntress = this.fork1Choice === "huntress";
    const condBury     = this.fork2Choice === "bury";
    const foxEarned    = condFox && condHuntress && condBury;

    if (this.fork2Choice === "pelt") this.receivePeltVisual();

    if (!foxEarned) {
      this.band.setObjective("The mountain waits for its true name.");
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
          this.showFoxRefusalDeparture();
        } else {
          // Pelt taken — fox sees what Wren carries and steps away
          nearMissLine =
            "The fox pads to the clearing's edge. Her eye finds the pelt in your hands. She holds very still. Then she steps back. She is gone.";
          this.showFoxRefusalDeparture();
        }
        this.setNarrator(nearMissLine);
        this.readThen(() => this.startTrueNamePassage());
      } else {
        this.startTrueNamePassage();
      }
      return;
    }

    this.showFoxCompanion();
    this.narration.say("winter_fox_companion_accept");
    this.band.setObjective("Choose whether the snow-fox joins your satchel.");

    const whisperTarget = this.makeFoxWord({
      scene: this,
      word: "whisper to her",
      x: 590,
      y: Math.max(510, this.narration.bottom() + 78),
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.showCompanionAnswer(true);
      },
    });

    const letGoTarget = this.makeFoxWord({
      scene: this,
      word: "let her go",
      x: 1450,
      y: Math.max(510, this.narration.bottom() + 78),
      frame: "banner",
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.showCompanionAnswer(false);
      },
    });

    this.registerActiveTarget(whisperTarget, letGoTarget);
  }

  /** The refusal card describes a departure, not a companion still waiting.
   * Keep its existing Continue live while the normal step-back settles. */
  private showFoxRefusalDeparture(): void {
    this.showFoxCompanion();
    const fox = this.foxCompanion;
    if (!fox?.scene) return;
    this.tweens.killTweensOf(fox);
    fox.setPosition(700, 830).setScale(1).setAlpha(1);
    if (reducedMotion(this)) {
      this.clearFoxWordAnchors();
      this.foxCompanion = null;
      fox.destroy();
      return;
    }
    this.dismissFoxCompanion(620, 820);
  }

  private showCompanionAnswer(accepted: boolean): void {
    this.store.update((s) => {
      const realm = s.realms["winter-mountain"];
      if (realm) realm.choices.companion = accepted ? "accepted" : "declined";
      if (accepted && !s.satchel.includes("snow-fox-cub")) s.satchel.push("snow-fox-cub");
    });
    this.checkpoint("companion-answer", { accepted });
    if (accepted) {
      this.showFoxCompanion();
      this.setNarrator("At your whisper, the snow-fox comes closer.");
      this.band.setObjective("The snow-fox comes closer.");
      this.settleFoxByWren(() => {
        this.setNarrator("She settles beside your boots. She is coming with you.");
        this.band.setObjective("The snow-fox joins you; the true name waits.");
        this.readThen(() => this.startTrueNamePassage());
      });
      return;
    }
    this.narration.say("winter_fox_companion_no");
    this.band.setObjective("The snow-fox stays behind; the true name waits.");
    this.dismissFoxCompanion(620, 820);
    this.readThen(() => this.startTrueNamePassage());
  }

  private settleFoxByWren(onSettled: () => void): void {
    const fox = this.foxCompanion;
    if (!fox?.scene) { onSettled(); return; }
    this.tweens.killTweensOf(fox);
    fox.setScale(1);
    const beside = { x: this.wrenContainer.x - 124, y: this.wrenContainer.y };
    if (reducedMotion(this)) {
      fox.setPosition(beside.x, beside.y).setAlpha(1);
      onSettled();
      return;
    }
    this.tweens.add({
      targets: fox,
      ...beside,
      alpha: 1,
      duration: 640,
      ease: "Sine.easeInOut",
      onComplete: onSettled,
    });
  }

  private showFoxCompanion(
    opts: {
      x?: number;
      y?: number;
      startX?: number;
      startY?: number;
      height?: number;
      shadowWidth?: number;
    } = {},
  ): void {
    if (this.foxCompanion?.scene) return;
    this.foxCompanion = stageCompanionCameo(this, {
      textureKey: "winter-companion-snow-fox",
      startX: opts.startX ?? 610,
      startY: opts.startY,
      x: opts.x ?? 700,
      y: opts.y ?? 830,
      height: opts.height ?? 108,
      depth: 43,
      shadowWidth: opts.shadowWidth ?? 88,
      shadowHeight: 16,
      shadowAlpha: 0.24,
      breathDy: -3,
      breathMs: 1900,
      wake: {
        kind: "snow",
        intervalMs: 210,
        offsetY: -12,
        spreadX: 18,
        spreadY: 8,
        depth: 42,
        alpha: 0.35,
      },
    });
  }

  private pulseFoxCompanion(): void {
    playActorAttention(this, this.foxCompanion, {
      scale: 1.035,
      durationMs: 220,
    });
  }

  private dismissFoxCompanion(x: number, y: number): void {
    this.clearFoxWordAnchors();
    dismissCompanionCameo(this, this.foxCompanion, { x, y, durationMs: 760 });
    this.foxCompanion = null;
  }

  /** The realm's true-name passage — three short lines, the mountain
   *  settling one line at a time. */
  private startTrueNamePassage(): void {
    this.clearHeldPelt();
    this.checkpoint("true-name", this.savedStageData("true-name"));
    this.narration.say("winter_truename_intro");
    this.band.setObjective("Type the true-name passage to settle the mountain.");
    this.readThen(() => {
      const sealY = this.scale.height / 2 + 116;
      const seal = stageTrueNameSeal(this, {
        color: PALETTE_HEX.frost,
        kind: "snow",
        y: sealY,
        depth: 42,
      });
      this.runPassageChain(
        [...TRUE_NAME_LINES],
        [...TRUE_NAME_REACTIONS],
        () => {
          dismissTrueNameSeal(this, seal);
          playChime();
          this.time.delayedCall(600, () => this.startEnding());
        },
        "none",
        seal,
        "true-name",
      );
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.checkpoint("ending");
    this.clearActiveTargets();
    this.narration.say("winter_almanac_stamp");
    this.band.setObjective("The Almanac stamps the Winter Mountain.");

    this.store.update((s) => {
      s.realms["winter-mountain"] = {
        ...s.realms["winter-mountain"],
        cleared: true,
        choices: {
          ...s.realms["winter-mountain"]?.choices,
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

    this.store.clearCheckpoint();
    this.showAlmanacStamp(() => {
      playRealmReturnDeparture(this, this.wrenContainer, {
        kind: "snow",
        color: PALETTE_HEX.frost,
      });
      this.time.delayedCall(360, () => {
        this.cameras.main.fadeOut(700, 11, 10, 15);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => this.scene.start("PortalChamberScene", {
            store: this.store,
            arrival: "winter-mountain",
          }),
        );
      });
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
  private winterPassageOwnerBinding(owner: WinterPassageOwner): {
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined;
    vfx: { kind: "snow" | "mote"; color: number; sourceOffsetX?: number; sourceOffsetY: number };
  } | null {
    if (owner === "huntress") {
      return {
        body: this.huntressSprite,
        vfx: { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -150 },
      };
    }
    if (owner === "firefly") {
      const hollow = !!this.fireflyCue?.getByName("winter-firefly-hollow");
      return {
        body: this.fireflyCue,
        vfx: { kind: "mote", color: PALETTE_HEX.brass, sourceOffsetX: hollow ? -80 : 0, sourceOffsetY: hollow ? -4 : -34 },
      };
    }
    if (owner === "cairn") {
      return {
        body: this.cairnCue,
        vfx: { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -42 },
      };
    }
    if (owner === "pelt") {
      return {
        body: this.peltCue,
        vfx: { kind: "snow", color: PALETTE_HEX.frost, sourceOffsetY: -38 },
      };
    }
    return null;
  }

  private winterPassageWordPosition(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    sourceOffsetY: number,
    word: string,
    opts: { side?: "left" | "right"; long?: boolean } = {},
  ): { x: number; y: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    if (!body?.scene) return { x: width / 2, y: height / 2 };
    if (body === this.huntressSprite) return this.winterForkChoiceWordPosition("huntress");
    if (body === this.cairnCue) return this.winterForkChoiceWordPosition("cairn");
    if (body === this.peltCue) return this.winterForkChoiceWordPosition("pelt");
    if (body === this.fireflyCue) {
      const position = this.winterForkChoiceWordPosition("firefly");
      if (this.fireflyCue?.getByName("winter-firefly-hollow")) position.x -= 80;
      return position;
    }

    const long = opts.long ?? word.length > 16;
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1
        : body === this.cairnCue ? -1 : body === this.peltCue ? 1
          : body.x < width / 2 ? 1 : -1;
    const lateral = long ? 220 : 180;
    const xInset = long ? 420 : 300;
    const lift = long ? 116 : 102;

    return {
      x: Phaser.Math.Clamp(body.x + side * lateral, xInset, width - xInset),
      y: Phaser.Math.Clamp(body.y + sourceOffsetY - lift, 280, height - 410),
    };
  }

  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
    owner: WinterPassageOwner = "none",
    trueNameSeal?: Phaser.GameObjects.Container,
    checkpointStep?: WinterStep,
  ): void {
    const resume = checkpointStep ? this.savedStageData(checkpointStep) : {};
    let step = checkpointIndex(resume.index, passages.length);
    let resumeReading = resume.reading === true;
    if (checkpointStep && this.resumeCheckpoint?.step === checkpointStep) this.resumeCheckpoint = null;
    if (owner === "firefly" && step > 0) this.showFireflyHollow();

    const advance = (): void => {
      if (step >= passages.length) {
        if (checkpointStep === "true-name") this.checkpoint("ending");
        else if (checkpointStep === "huntress" || checkpointStep === "firefly") this.checkpoint("wave", { index: 2 });
        else if (checkpointStep === "bury" || checkpointStep === "pelt") this.checkpoint("fox-gate");
        this.time.delayedCall(900, onDone);
        return;
      }
      if (resumeReading) {
        resumeReading = false;
        const reaction = narratorLines[step] ?? "";
        if (!reaction) { step += 1; advance(); return; }
        this.presentWinterPassageReaction(owner, step, reaction, () => { step += 1; advance(); }, true);
        return;
      }
      if (checkpointStep) this.checkpoint(checkpointStep, { index: step, reading: false });
      let trueNameAnchor: WordBodyAnchorHandle | null = null;
      const releaseTrueNameAnchor = (): void => {
        trueNameAnchor?.destroy();
        trueNameAnchor = null;
      };
      const word = passages[step];
      if (!word) return;
      if (owner === "firefly") this.band.setObjective(`Type ${word}.`);
      const ownerBinding = trueNameSeal ? null : this.winterPassageOwnerBinding(owner);
      const pos = trueNameSeal
        ? { x: trueNameSeal.x, y: trueNameSeal.y - 118 }
        : ownerBinding
          ? this.winterPassageWordPosition(
              ownerBinding.body,
              ownerBinding.vfx.sourceOffsetY,
              word,
            )
          : { x: this.scale.width / 2, y: this.scale.height / 2 };
      const opts: TextWordTargetOptions = {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        burstColor: trueNameSeal ? PALETTE_HEX.frost : undefined,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          if (!trueNameSeal?.scene) return;
          playClaimLine(
            this,
            this.wrenContainer.x,
            this.wrenContainer.y - 112,
            trueNameSeal.x,
            trueNameSeal.y - 8,
            { color: PALETTE_HEX.frost, depth: 58 },
          );
          playActorAttention(this, trueNameSeal, {
            tint: PALETTE_HEX.frost,
            scale: 1.024,
            durationMs: 180,
          });
        },
        onAdvance: (cursor, wordLength) => {
          // The target's exit animation precedes onComplete by320ms. Own
          // early Continue as soon as the horn phrase is fully typed.
          if (owner === "huntress" && step === HUNTRESS_PASSAGES.length - 1 && cursor === wordLength) {
            this.huntressHornTransferPending = true;
          }
          if (!trueNameSeal?.scene) return;
          playBodyTypePulse(this, trueNameSeal, {
            kind: "snow",
            color: PALETTE_HEX.frost,
            offsetY: -8,
            depth: 58,
            ringRadius: 24,
          });
        },
        onComplete: () => {
          releaseTrueNameAnchor();
          playWrenAction(this.wrenSprite);
          if (trueNameSeal?.scene) {
            playBodyImpact(this, trueNameSeal, {
              kind: "snow",
              color: PALETTE_HEX.frost,
              offsetY: -8,
              depth: 58,
              ringRadius: 54,
              count: 12,
            });
          } else if (owner === "huntress") {
            playActorAttention(this, this.huntressSprite, {
              tint: PALETTE_HEX.frost,
            });
          }
          playBodyImpact(this, this.wrenContainer, {
            kind: "snow",
            color: PALETTE_HEX.frost,
            offsetY: -108,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          this.clearActiveTargets();
          const reaction = narratorLines[step] ?? "";
          if (checkpointStep) this.checkpoint(checkpointStep, { index: step, reading: true });
          if (reaction) {
            this.presentWinterPassageReaction(owner, step, reaction, () => { step += 1; advance(); });
          } else {
            step += 1;
            advance();
          }
        },
      };
      const target =
        ownerBinding && !trueNameSeal
          ? this.makeWinterForkWord(ownerBinding.body, opts, ownerBinding.vfx)
          : this.makeWord(opts);
      if (trueNameSeal?.scene) {
        trueNameAnchor = attachWordBodyAnchor(
          this,
          trueNameSeal,
          () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
          {
            color: PALETTE_HEX.frost,
            alpha: 0.2,
            depth: 43,
            sourceOffsetY: -12,
            targetOffsetY: 24,
          },
        );
        trueNameSeal.once(Phaser.GameObjects.Events.DESTROY, releaseTrueNameAnchor);
      }
      this.registerActiveTarget(target);
    };

    advance();
  }

  private playWrenTrailAction(): void {
    playWrenAction(this.wrenSprite);
    playBodyImpact(this, this.wrenContainer, {
      kind: "snow",
      color: PALETTE_HEX.frost,
      offsetY: -108,
      ringRadius: 26,
      count: 6,
      depth: 58,
    });
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (isPuristToggleKey(event)) {
      event.preventDefault();
      togglePuristMode(this, this.store);
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (this.chapterMenu?.handleKey(event)) return;
    if (this.reading.handleKey(event)) return;
    if (this.trailTransitionPending) { event.preventDefault(); return; }
    // The received-horn acknowledgment opens only after its short handoff.
    // Early Continue/typing must not count as a miss while no word is live.
    if (this.huntressHornTransferPending) { event.preventDefault(); return; }
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
      // A modifier can be released while a pause menu or another app owns
      // keyup. The printable event is the source of truth when typing resumes.
      this.setShiftHeld(event.shiftKey);
      this.setAltHeld(event.altKey);
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

  private clearSpellModifiers(): void {
    this.setShiftHeld(false);
    this.setAltHeld(false);
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
    if (isWrenHurtPlaying(this.wrenSprite)) return;
    setWrenPose(this.wrenSprite, armed ? "cast" : "front");
  }

  /** Briefly flash the hurt pose, then restore the resting pose. */
  private flashHurt(): void {
    if (!this.wrenSprite) return;
    playWrenHurt(this.wrenSprite, {
      durationMs: 420,
      knockX: 0,
      onComplete: () => this.updateWrenGlow(),
    });
  }

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);
    if (speakerName === "Heldur") {
      playActorAttention(this, this.heldurSprite, {
        tint: PALETTE_HEX.frost,
      });
    } else if (speakerName === "Huntress") {
      playActorAttention(this, this.huntressSprite, {
        tint: PALETTE_HEX.frost,
      });
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Heldur") {
      this.band.setPortrait("heldur", "Heldur");
    } else if (speakerName === "Huntress") {
      this.band.setPortrait("huntress", "Huntress");
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private clearActiveTargets(): void {
    this.clearHeldurWordAnchors();
    this.clearForkChoiceWordAnchors();
    this.clearFoxWordAnchors();
    this.dismissRevisitMemoryCue(false);
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── HUD: candles + charges ──────────────────────────────────────────────

  private redrawCandles(): void {
    const previous = this.drawnCandles;
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
    if (previous !== null && previous !== this.candles) {
      pulseUiObject(this, this.candleGroup, { scale: 1.14 });
    }
    this.drawnCandles = this.candles;
  }

  /** Recompute affordable thunderclaps from banked Soul; redraw the pip row
   *  only when that discrete count changes. Soul moves on every keystroke and
   *  every cast, so this is driven from the keystroke hook and after a cast —
   *  Winter has no per-frame update loop. */
  private refreshThunderPips(): void {
    const stats = this.typingInput.getStats();
    let castable = 0;
    while (castable < WAVE_CHARGES && stats.canCast((castable + 1) * SPELL_COST)) castable += 1;
    if (castable === this.castableThunder) return;
    this.castableThunder = castable;
    this.redrawCharges();
  }

  private redrawCharges(): void {
    const previous = this.drawnThunderCharges;
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
    if (previous !== null && previous !== this.castableThunder) {
      pulseUiObject(this, this.chargeGroup, { scale: 1.16 });
    }
    this.drawnThunderCharges = this.castableThunder;
    this.updateWrenGlow();
  }

  private stageWinterMeterObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
    opts: { offsetY?: number } = {},
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      y: number;
      setAlpha: (value: number) => unknown;
      setY: (value: number) => unknown;
    };
    if (typeof item.y !== "number" || !item.setAlpha || !item.setY) return;

    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + (opts.offsetY ?? 8));
    this.time.delayedCall(delayMs, () => {
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 230,
        ease: "Sine.easeOut",
      });
    });
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(4);
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
    addContainerWake(this, c, {
      kind: "snow",
      intervalMs: 420,
      spreadX: 34,
      spreadY: 12,
      offsetY: -82,
      color: PALETTE_HEX.frost,
      alpha: 0.28,
      size: 3.2,
      depth: -0.2,
      driftX: -36,
      driftY: 22,
      durationMs: 980,
    });
    return c;
  }

  private drawWolfInto(c: Phaser.GameObjects.Container, facingLeft: boolean): void {
    c.add(addLocalGroundShadow(this, 224, 36, { y: 12, alpha: 0.46 }));
    c.add(this.makeWolfFrostRim(false));
    c.add(makeWolfSprite(this, false, facingLeft));
    c.add(this.makeWolfSnowFooting(false));
  }

  private drawBossInto(c: Phaser.GameObjects.Container): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 286, 46, { y: 14, alpha: 0.5 }));
    c.add(this.makeWolfFrostRim(true));
    const sprite = makeWolfSprite(this, true, true);
    c.add(sprite);
    c.add(this.makeWolfSnowFooting(true));
    return sprite;
  }

  private makeWolfFrostRim(isBoss: boolean): Phaser.GameObjects.Graphics {
    const width = isBoss ? 410 : 330;
    const height = isBoss ? 170 : 128;
    const y = isBoss ? -150 : -112;
    return addSoftLocalLight(this, width, height, 0xb7dcff, isBoss ? 0.2 : 0.16).setY(y);
  }

  private makeWolfSnowFooting(isBoss: boolean): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const width = isBoss ? 330 : 260;
    // Broken grains sit at the paws; a continuous pale oval reads as a second
    // platform floating above the painted trail. The soft shadow owns contact.
    g.lineStyle(1.5, 0xdceaf8, isBoss ? 0.2 : 0.16);
    for (const [x, y, length] of [[-0.31, -2, 12], [-0.08, 2, 9], [0.18, -1, 13], [0.33, 3, 8]]) {
      g.lineBetween(width * x, y, width * x + length, y - 1);
    }
    g.fillStyle(0xdceaf8, isBoss ? 0.22 : 0.18);
    for (const [x, y, radius] of [[-0.25, 1, 1.8], [-0.02, -3, 1.4], [0.25, 3, 1.6]]) {
      g.fillCircle(width * x, y, radius);
    }
    return g;
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
