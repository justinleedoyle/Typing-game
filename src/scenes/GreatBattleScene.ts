import Phaser from "phaser";
import { type AmbientHandle, playAmbientBattle } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playDamageThud } from "../audio/damageThud";
import { playPeriodSnapSting } from "../audio/quietLordSting";
import { getRunaLine } from "../audio/runaLines";
import { NarrationManager } from "../game/narrationManager";
import { ConsoleBand } from "../game/ui/consoleBand";
import { cornerTicks, UI_HEX } from "../game/ui/uiTheme";
import { flashDamageVignette } from "../game/vfx";
import { flashQuietLordFragment } from "../game/quietLordIntrusion";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { candleAfterHit, candleAfterCleanWave } from "../game/winterMechanics";
import { COMPANION_IDS, selectFinalPhrase } from "../game/relicAlignment";
import { getActiveRelicEffects } from "../game/relicEffects";
import {
  type Facet,
  type FacetId,
  type FacetResolution,
  resolveFacets,
} from "../game/finaleFacets";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { makeQuietLordSprite, preloadQuietLord } from "../game/quietLord";
import {
  pickAdaptiveWords,
  WINTER_WORD_BANK,
  SUNKEN_BELL_WORD_BANK,
  FORGE_WORD_BANK,
  SKY_ISLAND_WORD_BANK,
  HAUNTED_WOOD_WORD_BANK,
} from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  addAmbientDrift,
  addBackdropDrift,
  addContainerWake,
  addIdleBreath,
  addLocalGroundShadow,
  attachWordBodyAnchor,
  addLivingLight,
  dismissCompanionCameo,
  playBodyImpact,
  playBodyTypePulse,
  playActorAttention,
  playClaimLine,
  playSceneEventPulse,
  pulseUiObject,
  stageContainerEntrance,
  stageCompanionCameo,
  type AmbientKind,
  type ContainerWakeOptions,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import {
  makeWrenSprite,
  playWrenHurt,
  preloadWren,
} from "../game/wren";
import greatBattleBackdrop from "../../art/references/great-battle-clean.png";
import runaPortrait from "../../art/runa/runa-front.png";
import finaleWolfSprite from "../../art/wolf/wolf-pack.png";
import finaleBellGhostSprite from "../../art/bell/ghost.png";
import finaleGolemSprite from "../../art/forge/golem.png";
import finaleLanternSpiritSprite from "../../art/sky/lantern-spirit.png";
import finaleWoodGhostSprite from "../../art/wood/ghost.png";
import snowFoxSprite from "../../art/companions/snow-fox.png";
import glassFishSprite from "../../art/companions/glass-fish.png";
import brassSongbirdSprite from "../../art/companions/brass-songbird.png";
import lanternMothSprite from "../../art/companions/lantern-moth.png";
import wispCatSprite from "../../art/companions/wisp-cat.png";

// ─── Scene data ────────────────────────────────────────────────────────────────

interface BattleSceneData {
  store: SaveStore;
  devWaveRealmId?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WAVE_CANDLES = 3;
const WAVE_CHARGES = 2;
const WALL_WARD = {
  x: 960,
  y: 824,
  width: 960,
  height: 88,
} as const;

const BATTLE_WORD_BANK = [
  "hold", "stand", "speak", "word", "voice", "again",
  "name", "ring", "light", "true", "still", "turn",
  "last", "kept", "long", "clear", "break", "found",
] as const;

// §5.5.11 — counter-loadout: how long Wren has to type a facet's defense word
// before it lands (uncountered facets only). "Tune on live build."
const FACET_CHALLENGE_MS = 6000;
const FINALE_ENEMY_WORD_ATTACH_DELAY_MS = 140;
const FINALE_ENEMY_WORD_OFFSET_Y = -88;
const FINALE_ENEMY_ANCHOR_SOURCE_OFFSET_Y = -54;

// Per-facet narration ids. Kept as string literals here (not built dynamically)
// so the sayResolution test's id-shaped-token scan over the scene source can
// verify each one resolves to a real Runa line. telegraph = the Lord channels
// it; countered = a relic answers it.
const FACET_LINES: Record<FacetId, { telegraph: string; countered: string }> = {
  cold: { telegraph: "finale_facet_cold_telegraph", countered: "finale_facet_cold_countered" },
  toll: { telegraph: "finale_facet_toll_telegraph", countered: "finale_facet_toll_countered" },
  armor: { telegraph: "finale_facet_armor_telegraph", countered: "finale_facet_armor_countered" },
  light: { telegraph: "finale_facet_light_telegraph", countered: "finale_facet_light_countered" },
  grief: { telegraph: "finale_facet_grief_telegraph", countered: "finale_facet_grief_countered" },
};

// ─── Wave definition ───────────────────────────────────────────────────────────

interface WaveDef {
  realmId: string;
  bank: readonly string[];
  baseY: number;
  companionId: string;
  companionLine: string;
  label: string;
}

interface CompanionCameoSpec {
  textureKey: string;
  startX: number;
  endX: number;
  exitX: number;
  y: number;
  height: number;
  shadowWidth: number;
  shadowHeight: number;
  shadowY: number;
  shadowAlpha: number;
  wake: ContainerWakeOptions;
  liftY?: number;
  bobMs?: number;
  flipX?: boolean;
}

type FinaleCompanionActionId =
  | "glass-fish"
  | "brass-songbird"
  | "lantern-moth"
  | "wisp-cat";

interface LordWordFxOptions {
  kind?: AmbientKind;
  color?: number;
  claimColor?: number;
  ringRadius?: number;
  pulseOffsetX?: number;
  impactOffsetX?: number;
}

interface FinaleEnemyArtSpec {
  textureKey: string;
  height: number;
  shadowWidth: number;
  shadowHeight: number;
  shadowY: number;
  shadowAlpha: number;
  spriteY: number;
  tint?: number;
  alpha?: number;
  flipX?: boolean;
  glowColor?: number;
  glowAlpha?: number;
  glowY?: number;
  glowWidth?: number;
  glowHeight?: number;
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

function finaleEnemyArtForRealm(realmId: string): FinaleEnemyArtSpec {
  switch (realmId) {
    case "winter-mountain":
      return {
        textureKey: "finale-wolf-pack",
        height: 150,
        shadowWidth: 220,
        shadowHeight: 18,
        shadowY: 72,
        shadowAlpha: 0.16,
        spriteY: -6,
        alpha: 0.98,
        tint: 0xdfeaff,
        flipX: true,
        glowColor: PALETTE_HEX.frost,
        glowAlpha: 0.18,
        glowY: -4,
        glowWidth: 238,
        glowHeight: 104,
      };
    case "sunken-bell":
      return {
        textureKey: "finale-bell-ghost",
        height: 124,
        shadowWidth: 126,
        shadowHeight: 24,
        shadowY: 50,
        shadowAlpha: 0.22,
        spriteY: -8,
        alpha: 0.8,
        glowColor: 0xa7d2dd,
        glowAlpha: 0.14,
        glowY: -4,
        glowWidth: 118,
        glowHeight: 124,
      };
    case "clockwork-forge":
      return {
        textureKey: "finale-forge-golem",
        height: 152,
        shadowWidth: 184,
        shadowHeight: 36,
        shadowY: 58,
        shadowAlpha: 0.48,
        spriteY: -13,
        glowColor: PALETTE_HEX.ember,
        glowAlpha: 0.1,
        glowY: -8,
        glowWidth: 142,
        glowHeight: 124,
      };
    case "sky-island":
      return {
        textureKey: "finale-lantern-spirit",
        height: 126,
        shadowWidth: 110,
        shadowHeight: 22,
        shadowY: 48,
        shadowAlpha: 0.22,
        spriteY: -9,
        glowColor: 0xf5c842,
        glowAlpha: 0.2,
        glowY: -10,
        glowWidth: 132,
        glowHeight: 132,
      };
    case "haunted-wood":
      return {
        textureKey: "finale-wood-ghost",
        height: 120,
        shadowWidth: 128,
        shadowHeight: 24,
        shadowY: 50,
        shadowAlpha: 0.24,
        spriteY: -7,
        alpha: 0.84,
        tint: 0xd8e2cf,
        glowColor: 0xd8e2cf,
        glowAlpha: 0.13,
        glowY: -8,
        glowWidth: 118,
        glowHeight: 120,
      };
    default:
      return {
        textureKey: "finale-wood-ghost",
        height: 96,
        shadowWidth: 86,
        shadowHeight: 18,
        shadowY: 38,
        shadowAlpha: 0.18,
        spriteY: 0,
        alpha: 0.74,
      };
  }
}

function finaleWakeForRealm(realmId: string): ContainerWakeOptions {
  switch (realmId) {
    case "winter-mountain":
      return {
        kind: "snow",
        intervalMs: 230,
        spreadX: 46,
        spreadY: 8,
        alpha: 0.34,
        size: 5,
        driftX: 30,
        driftY: -10,
        durationMs: 820,
      };
    case "sunken-bell":
      return {
        kind: "bubble",
        intervalMs: 320,
        spreadX: 24,
        spreadY: 10,
        alpha: 0.3,
        size: 4,
        driftX: 18,
        driftY: -38,
        durationMs: 1200,
      };
    case "clockwork-forge":
      return {
        kind: "ember",
        intervalMs: 190,
        spreadX: 38,
        spreadY: 8,
        alpha: 0.38,
        size: 4,
        driftX: 20,
        driftY: -30,
        durationMs: 760,
      };
    case "sky-island":
      return {
        kind: "mote",
        intervalMs: 230,
        spreadX: 22,
        spreadY: 16,
        color: 0xf5c842,
        alpha: 0.42,
        size: 4,
        driftX: 22,
        driftY: -32,
        durationMs: 900,
      };
    default:
      return {
        kind: "mist",
        intervalMs: 300,
        spreadX: 34,
        spreadY: 10,
        alpha: 0.2,
        size: 8,
        driftX: 26,
        driftY: -18,
        durationMs: 1050,
      };
  }
}

function finaleClaimColorForRealm(realmId: string): number {
  switch (realmId) {
    case "winter-mountain":
      return PALETTE_HEX.frost;
    case "sunken-bell":
      return 0x4ab8d6;
    case "clockwork-forge":
      return PALETTE_HEX.ember;
    case "sky-island":
      return 0xf5c842;
    default:
      return 0xd8e2cf;
  }
}

function finaleTypedPulseForRealm(realmId: string): {
  kind: "bubble" | "ember" | "mist" | "mote" | "snow";
  color: number;
  ringRadius: number;
} {
  switch (realmId) {
    case "winter-mountain":
      return { kind: "snow", color: PALETTE_HEX.frost, ringRadius: 24 };
    case "sunken-bell":
      return { kind: "bubble", color: 0x4ab8d6, ringRadius: 22 };
    case "clockwork-forge":
      return { kind: "ember", color: PALETTE_HEX.ember, ringRadius: 24 };
    case "sky-island":
      return { kind: "mote", color: 0xf5c842, ringRadius: 22 };
    default:
      return { kind: "mist", color: 0xd8e2cf, ringRadius: 24 };
  }
}

function finaleEnemyWordOffsetForRealm(realmId: string): number {
  if (realmId === "sunken-bell") return -100;
  if (realmId === "sky-island") return -98;
  if (realmId === "haunted-wood") return -96;
  return realmId === "clockwork-forge" ? -108 : FINALE_ENEMY_WORD_OFFSET_Y;
}

// ─── Enemy entity ──────────────────────────────────────────────────────────────

interface Enemy {
  graphic: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  target: TextWordTarget | null;
  wordAnchor: WordBodyAnchorHandle | null;
  advanceTween: Phaser.Tweens.Tween | null;
  arrivalTimer: Phaser.Time.TimerEvent | null;
  x: number;
  y: number;
  realmId: string;
  word: string;
  defeated: boolean;
  waveIdx: number;
}

// ─── Scene ─────────────────────────────────────────────────────────────────────

export class GreatBattleScene extends Phaser.Scene {
  private store!: SaveStore;
  private devWaveRealmId?: string;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private band!: ConsoleBand;
  private activeTargets: TextWordTarget[] = [];
  private targetAnchors = new Map<TextWordTarget, WordBodyAnchorHandle>();

  // HUD
  private candleGroup!: Phaser.GameObjects.Container;
  private chargeGroup!: Phaser.GameObjects.Container;
  private wallWard?: Phaser.GameObjects.Container;
  private wallWardFlames: Phaser.GameObjects.Graphics[] = [];
  private wrenDefender?: Phaser.GameObjects.Container;
  private wrenDefenderSprite?: Phaser.GameObjects.Image;
  private drawnCandles: number | null = null;
  private drawnCharges: number | null = null;
  private candles = WAVE_CANDLES;
  private charges = WAVE_CHARGES;

  // Fail state (Tier 3) — candles are now a real, losable economy across the
  // whole finale (not the old never-decrementing prop). A breach in Phase 1 or
  // a fumbled counter in Phase 2 snuffs a candle (candleAfterHit); a clean
  // Phase-1 wave relights one (candleAfterCleanWave, capped). At zero candles
  // the run is LOST → the canon "we begin again" loss ending (§5.5.11), not a
  // game-over. `runOver` severs the in-flight phase flow once that fires.
  private runOver = false;
  private waveCandleLost = false;

  // Phase 1
  private enemies: Enemy[] = [];
  private waveQueue: WaveDef[] = [];
  private currentWaveIdx = -1;

  // Phase 1 — ally modifier state
  private waveCharges = WAVE_CHARGES; // may be bumped by king-aurland
  // §5.5.11 — shrine-token: first miss per wave forgives the camera-shake
  // side effect. Accuracy still recorded (recordKeystroke path is inside
  // typingInput and not interceptable without deeper changes).
  private shrineTokenForgivenThisWave = false;
  private untetheredWindSlowMult = 1.0; // untethered-wind: <1 slows advance
  // Damage-feedback parity (#73): onMiss fires per keystroke, so the thud +
  // edge vignette are throttled to avoid strobing on a burst of mistyping.
  private lastMissFeedbackAt = 0;

  // Phase 2
  private quietLordContainer!: Phaser.GameObjects.Container;
  private againText!: Phaser.GameObjects.Text;
  private strikeLineGraphic!: Phaser.GameObjects.Graphics;
  private phase2Round1Words: string[] = [];
  private facetSigil: Phaser.GameObjects.Graphics | null = null;
  private facetChannel: Phaser.GameObjects.Graphics | null = null;

  // Phase 2 — relic state
  private bellsTongueSuperHitAvailable = false;
  private masterKeyFlankUsed = false;
  private tetherCordBindUsed = false;
  // §5.5.11 fork — the duel alignment (≥3 force / ≥3 kindness), resolved once at
  // startPhase2 from getActiveRelicEffects. Force RAISES the input ceiling (a
  // SECOND mixed-case counter); kindness demands cleaner play (a duel miss costs
  // a candle). kindnessMissCharged throttles that to one per beat.
  private isForceDuel = false;
  private isKindnessDuel = false;
  private kindnessMissCharged = false;
  // §5.5.11 — Wind-Phrase + Quiet Chant (both): the Lord's whirlwind attack
  // is permanently canceled. First cancel is narrated; subsequent calls skip
  // silently so the duel just flows past where the whirlwind would have been.
  private whirlwindCanceled = false;
  private whirlwindCancelAnnounced = false;

  // Phase 3
  private screenBrightnessOverlay!: Phaser.GameObjects.Graphics;
  private brightnessAlpha = 0;

  // Phase 3 — companion finale
  private brassSongbirdStallTimer: Phaser.Time.TimerEvent | null = null;
  private brassSongbirdActiveTarget: TextWordTarget | null = null;

  private ambientHandle?: AmbientHandle;

  constructor() {
    super("GreatBattleScene");
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(data: BattleSceneData): void {
    this.store = data.store;
    this.devWaveRealmId = WAVE_DEFS.some((wave) => wave.realmId === data.devWaveRealmId)
      ? data.devWaveRealmId
      : undefined;
    this.activeTargets = [];
    this.targetAnchors = new Map();
    this.enemies = [];
    this.waveQueue = [];
    this.currentWaveIdx = -1;
    this.candles = WAVE_CANDLES;
    this.charges = WAVE_CHARGES;
    this.wallWard = undefined;
    this.wallWardFlames = [];
    this.wrenDefender = undefined;
    this.wrenDefenderSprite = undefined;
    this.runOver = false;
    this.waveCandleLost = false;
    this.phase2Round1Words = [];
    this.brightnessAlpha = 0;

    // Ally modifier state
    this.waveCharges = WAVE_CHARGES;
    this.shrineTokenForgivenThisWave = false;
    this.untetheredWindSlowMult = 1.0;
    this.lastMissFeedbackAt = 0;

    // Phase 2 relic state
    this.bellsTongueSuperHitAvailable = false;
    this.masterKeyFlankUsed = false;
    this.tetherCordBindUsed = false;
    this.isForceDuel = false;
    this.isKindnessDuel = false;
    this.kindnessMissCharged = false;
    this.whirlwindCanceled = false;
    this.whirlwindCancelAnnounced = false;

    // Phase 3
    this.brassSongbirdStallTimer = null;
    this.brassSongbirdActiveTarget = null;
    this.facetSigil = null;
    this.facetChannel = null;
  }

  preload(): void {
    this.load.image("great-battle-backdrop", greatBattleBackdrop);
    this.load.image("band-portrait-runa", runaPortrait);
    this.load.image("finale-wolf-pack", finaleWolfSprite);
    this.load.image("finale-bell-ghost", finaleBellGhostSprite);
    this.load.image("finale-forge-golem", finaleGolemSprite);
    this.load.image("finale-lantern-spirit", finaleLanternSpiritSprite);
    this.load.image("finale-wood-ghost", finaleWoodGhostSprite);
    this.load.image("finale-companion-snow-fox", snowFoxSprite);
    this.load.image("finale-companion-glass-fish", glassFishSprite);
    this.load.image("finale-companion-brass-songbird", brassSongbirdSprite);
    this.load.image("finale-companion-lantern-moth", lanternMothSprite);
    this.load.image("finale-companion-wisp-cat", wispCatSprite);
    preloadQuietLord(this);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(700, 11, 10, 15);

    const backdrop = this.add
      .image(0, 0, "great-battle-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 21000, driftX: -5, driftY: -3 });
    addAmbientDrift(this, {
      kind: "ash",
      count: 48,
      depth: -2,
      area: { x: 0, y: 120, width: this.scale.width, height: 700 },
      alpha: 0.28,
      minSize: 1.5,
      maxSize: 4.5,
      driftX: 110,
      driftY: -220,
      minDurationMs: 5200,
      maxDurationMs: 12500,
    });
    addLivingLight(this, {
      x: 1210,
      y: 640,
      width: 900,
      height: 360,
      color: 0xd6754a,
      alpha: 0.045,
      depth: -5,
      durationMs: 3800,
      scale: 1.035,
    });
    addLivingLight(this, {
      x: 1540,
      y: 510,
      width: 320,
      height: 190,
      color: 0xf0ad58,
      alpha: 0.05,
      depth: -5,
      durationMs: 2600,
      delayMs: 700,
    });
    addLivingLight(this, {
      x: 420,
      y: 650,
      width: 520,
      height: 240,
      color: 0xb34b45,
      alpha: 0.035,
      depth: -6,
      durationMs: 4300,
      delayMs: 1100,
      scale: 1.04,
    });
    addAmbientDrift(this, {
      kind: "ash",
      count: 18,
      depth: -1.45,
      area: { x: 0, y: 260, width: this.scale.width, height: 540 },
      alpha: 0.17,
      minSize: 3.5,
      maxSize: 8,
      driftX: 150,
      driftY: -260,
      minDurationMs: 4200,
      maxDurationMs: 9800,
    });
    this.drawWallWard();
    this.drawWrenDefender();

    // UI cohesion — the console band. The finale has no heart/soul HUD; its candle
    // (fail-state) + spell-charge meters dock into the band, with Runa at the portrait
    // nook. No satchel icons here (the band's zone holds the two meters instead).
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: [],
      satchelLabel: "",
    });
    const band = this.band;

    // Narrator (framed dialogue card)
    this.narration = new NarrationManager(this, {
      y: 90,
      wordWrapWidth: 1500,
      depth: 5,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });

    // Candle & charge HUD, docked into the band — charges may be bumped by king-aurland.
    const satchel = this.store.get().satchel;
    if (satchel.includes("king-aurland")) {
      this.waveCharges = WAVE_CHARGES + 1; // +1 spell charge per wave
    }

    const meterY = band.bandTopY + 112;
    this.candleGroup = this.add.container(430, meterY).setDepth(1500);
    this.chargeGroup = this.add.container(720, meterY).setDepth(1500);
    const finaleHudLabel: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: SERIF,
      fontStyle: "italic",
      fontSize: "15px",
      color: "#a59b89",
    };
    const candleLabel = this.add
      .text(430, meterY - 40, "candles", finaleHudLabel)
      .setOrigin(0.5)
      .setDepth(1500);
    const chargeLabel = this.add
      .text(720, meterY - 40, "spells", finaleHudLabel)
      .setOrigin(0.5)
      .setDepth(1500);
    this.redrawCandles();
    this.redrawCharges();
    this.stageFinaleMeterObject(candleLabel, 70, { offsetY: 5 });
    this.stageFinaleMeterObject(this.candleGroup, 95, { offsetY: 8 });
    this.stageFinaleMeterObject(chargeLabel, 115, { offsetY: 5 });
    this.stageFinaleMeterObject(this.chargeGroup, 140, { offsetY: 8 });

    // Untethered Wind: slow enemy advance by ~15%
    if (satchel.includes("untethered-wind")) {
      this.untetheredWindSlowMult = 0.85;
    }

    // Screen brightness overlay (phase 3)
    this.screenBrightnessOverlay = this.add.graphics().setDepth(30).setAlpha(0);

    // Input
    this.typingInput = new TypingInputController(this.store);
    // §5.5.11 — shrine-token: forgive the camera-shake on the first miss of
    // each Phase 1 wave. Accuracy is still counted by recordKeystroke (inside
    // typingInput) — we only suppress the visible flinch.
    this.typingInput.setKeystrokeHooks({
      onMiss: () => {
        const hasShrineToken = this.store.get().satchel.includes("shrine-token");
        if (hasShrineToken && !this.shrineTokenForgivenThisWave) {
          this.shrineTokenForgivenThisWave = true;
          // First miss forgiven — skip the flinch entirely
          return;
        }
        this.cameras.main.shake(100, 0.003);
        // Damage-feedback parity (#73): a slip under the Lord's pressure reads
        // as a hit — same thud + edge vignette the five realms use. Throttled so
        // a burst of mistyping doesn't strobe (onMiss is per-keystroke).
        const now = Date.now();
        if (now - this.lastMissFeedbackAt > 700) {
          this.lastMissFeedbackAt = now;
          playDamageThud();
          flashDamageVignette(this);
        }
      },
    });
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.ambientHandle = playAmbientBattle();

    // Begin
    this.time.delayedCall(800, () => this.startPhase1());
  }

  private onShutdown(): void {
    this.typingInput.reset();
    this.clearTargetAnchors();
    this.dismissWrenDefender(0);
    this.input.keyboard?.off("keydown", this.onKeyDown, this);
    this.ambientHandle?.stop();
    this.clearFacetSigil(false);
    if (this.brassSongbirdStallTimer) {
      this.brassSongbirdStallTimer.remove();
      this.brassSongbirdStallTimer = null;
    }
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // The finale's Phase-2 climax is mixed-case caseSensitive (unMAKE): the
    // browser already encodes Shift into the keystroke's case, so no spell/Shift
    // tracking is needed here. (The old bellows-hammer Shift-spell cooldown was
    // inert — no finale target consumes the spell variant — and has been removed.)
    if (!event.key || (event.key.length !== 1 && event.key !== " ")) return;
    playClack();
    this.typingInput.handleChar(event.key);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);

    if (speakerName === "Quiet Lord") {
      playActorAttention(this, this.quietLordContainer, {
        tint: this.isForceDuel ? UI_HEX.ember : 0x6b5ea8,
        scale: 1.012,
        durationMs: 220,
      });
    } else if (speakerName === "Again") {
      playActorAttention(this, this.againText, {
        tint: 0xd4b8ff,
        scale: 1.025,
        durationMs: 220,
      });
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Quiet Lord") {
      this.band.setPortrait("quiet-lord", "Quiet Lord");
    } else if (speakerName === "Again") {
      this.band.setPortrait(undefined, "Again");
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private showRelicNotice(id: string, label = "relic", durationMs = 2200): void {
    this.band.showNotice(getRunaLine(id)?.text ?? id, { label, durationMs });
  }

  /** UI-cohesion: every finale word target gets the legibility outline (TTT-style). */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    return new TextWordTarget({ outline: true, depth: 6, ...opts });
  }

  private lordDuelWordPosition(
    index: number,
    total: number,
    y = 500,
  ): { x: number; y: number } {
    const cx = this.quietLordContainer?.x ?? this.scale.width / 2;

    if (total >= 3) {
      const lane = Math.max(0, Math.min(2, index));
      const offsets = [-360, 0, 360];
      return {
        x: cx + offsets[lane]!,
        y: y + (lane === 1 ? -44 : 18),
      };
    }

    if (total === 2) {
      return { x: cx + (index === 0 ? -250 : 250), y };
    }

    return { x: cx + (index % 2 === 0 ? 235 : -235), y };
  }

  private facetDefenseWordPosition(facet: Facet): { x: number; y: number } {
    const cx = this.facetSigil?.x ?? this.scale.width / 2;
    const cy = this.facetSigil?.y ?? 300;
    const offsets: Record<FacetId, { dx: number; dy: number }> = {
      cold: { dx: -260, dy: 210 },
      toll: { dx: 260, dy: 210 },
      armor: { dx: -230, dy: 165 },
      light: { dx: 230, dy: 165 },
      grief: { dx: 0, dy: 250 },
    };
    const offset = offsets[facet.id];
    return { x: cx + offset.dx, y: cy + offset.dy };
  }

  private facetClaimOrigin(): { x: number; y: number } {
    const sigil = this.facetSigil;
    if (!sigil?.scene) {
      return { x: this.scale.width / 2, y: 300 };
    }
    return { x: sigil.x, y: sigil.y };
  }

  private quietLordBodyTarget(): { x: number; y: number } {
    const lord = this.quietLordContainer;
    if (!lord?.scene) {
      return { x: this.scale.width / 2, y: 560 };
    }
    return { x: lord.x, y: lord.y + 560 };
  }

  private quietLordClaimOrigin(offsetX = 0, offsetY = 490): { x: number; y: number } {
    const lord = this.quietLordContainer;
    if (!lord?.scene) {
      return { x: this.scale.width / 2 + offsetX, y: offsetY };
    }
    return { x: lord.x + offsetX, y: lord.y + offsetY };
  }

  private finalPhraseWordPosition(index: number): { x: number; y: number } {
    const cx = this.againText?.x ?? this.scale.width / 2;
    const cy = this.againText?.y ?? 300;
    const offsets = [-225, 225, 0];
    return {
      x: cx + offsets[index % offsets.length]!,
      y: cy + 232 + (index % 2) * 30,
    };
  }

  /** Phase-2 boss words are attacks against the Quiet Lord, not free UI text. */
  private makeLordWord(
    opts: TextWordTargetOptions,
    fx: LordWordFxOptions = {},
  ): TextWordTarget {
    const originalOnClaim = opts.onClaim;
    const originalOnAdvance = opts.onAdvance;
    const originalOnComplete = opts.onComplete;
    const kind = fx.kind ?? "mist";
    const color = fx.color ?? (this.isForceDuel ? UI_HEX.ember : UI_HEX.brass);
    const claimColor = fx.claimColor ?? color;
    const sideOffset =
      fx.impactOffsetX ?? (opts.x - this.scale.width / 2) * 0.18;

    let target!: TextWordTarget;
    target = this.makeWord({
      ...opts,
      onClaim: (mods) => {
        const from = this.quietLordClaimOrigin(sideOffset);
        playClaimLine(
          this,
          from.x,
          from.y,
          opts.x,
          opts.y,
          { color: claimColor, depth: 6 },
        );
        originalOnClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, this.quietLordContainer, {
          kind,
          color,
          offsetX: fx.pulseOffsetX ?? sideOffset,
          offsetY: 508,
          depth: 7,
          ringRadius: fx.ringRadius ?? 34,
          durationMs: 250,
        });
        originalOnAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        this.clearTargetAnchor(target);
        playBodyImpact(this, this.quietLordContainer, {
          kind,
          color,
          offsetX: sideOffset,
          offsetY: 508,
          depth: 7,
          ringRadius: (fx.ringRadius ?? 42) + 18,
          count: 12,
          durationMs: 420,
        });
        originalOnComplete();
      },
    });

    this.trackTargetAnchor(
      target,
      attachWordBodyAnchor(
        this,
        this.quietLordContainer,
        () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
        {
          color: claimColor,
          alpha: 0.14,
          depth: 7,
          sourceOffsetX: sideOffset,
          sourceOffsetY: 490,
          targetOffsetY: 24,
        },
      ),
    );
    return target;
  }

  /** Final phrase words rebuild the revealed `Again`, rather than floating alone. */
  private makeFinalPhraseWord(opts: TextWordTargetOptions): TextWordTarget {
    const originalOnClaim = opts.onClaim;
    const originalOnAdvance = opts.onAdvance;
    const originalOnComplete = opts.onComplete;
    const phraseColor = 0xd4b8ff;

    let target!: TextWordTarget;
    target = this.makeWord({
      ...opts,
      onClaim: (mods) => {
        playClaimLine(
          this,
          opts.x,
          opts.y - 10,
          this.againText.x,
          this.againText.y + 24,
          { color: phraseColor, depth: 8, durationMs: 440 },
        );
        originalOnClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, this.againText, {
          kind: "mote",
          color: phraseColor,
          offsetY: 4,
          depth: 11,
          ringRadius: 30,
          durationMs: 240,
        });
        originalOnAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        this.clearTargetAnchor(target);
        playBodyImpact(this, this.againText, {
          kind: "mote",
          color: phraseColor,
          offsetY: 4,
          depth: 11,
          ringRadius: 54,
          count: 10,
          durationMs: 430,
        });
        originalOnComplete();
      },
    });

    this.trackTargetAnchor(
      target,
      attachWordBodyAnchor(
        this,
        this.againText,
        () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
        {
          color: phraseColor,
          alpha: 0.15,
          depth: 9,
          sourceOffsetY: 22,
          targetOffsetY: 24,
        },
      ),
    );
    return target;
  }

  private trackTargetAnchor(
    target: TextWordTarget,
    anchor: WordBodyAnchorHandle,
  ): void {
    this.clearTargetAnchor(target);
    this.targetAnchors.set(target, anchor);
  }

  private clearTargetAnchor(target: TextWordTarget): void {
    this.targetAnchors.get(target)?.destroy();
    this.targetAnchors.delete(target);
  }

  private clearTargetAnchors(): void {
    for (const anchor of this.targetAnchors.values()) anchor.destroy();
    this.targetAnchors.clear();
  }

  private clearActiveTargets(): void {
    for (const t of this.activeTargets) {
      this.clearTargetAnchor(t);
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  private drawWallWard(): void {
    this.wallWard?.destroy();
    this.wallWardFlames = [];

    const ward = this.add
      .container(WALL_WARD.x, WALL_WARD.y)
      .setDepth(2)
      .setAlpha(0.76);
    const base = this.add.graphics();
    base.fillStyle(0x15100d, 0.28);
    base.fillEllipse(0, 23, WALL_WARD.width * 0.9, 28);
    base.fillStyle(UI_HEX.panel, 0.22);
    base.fillRoundedRect(-WALL_WARD.width / 2 + 74, 5, WALL_WARD.width - 148, 18, 8);
    base.lineStyle(2, UI_HEX.brass, 0.3);
    base.strokeRoundedRect(-WALL_WARD.width / 2 + 74, 5, WALL_WARD.width - 148, 18, 8);
    base.lineStyle(1, 0x8b6ad8, 0.18);
    base.lineBetween(-WALL_WARD.width / 2 + 116, 14, WALL_WARD.width / 2 - 116, 14);
    base.lineStyle(1, UI_HEX.brass, 0.18);
    base.strokeEllipse(0, 12, WALL_WARD.width * 0.74, WALL_WARD.height * 0.56);

    for (let i = -4; i <= 4; i++) {
      const tickX = i * 92;
      base.lineStyle(1, UI_HEX.brass, i === 0 ? 0.34 : 0.2);
      base.lineBetween(tickX, 5, tickX, 23);
      if (Math.abs(i) <= 2) {
        base.fillStyle(0x8b6ad8, i === 0 ? 0.16 : 0.09);
        base.fillCircle(tickX, 14, i === 0 ? 5 : 3);
      }
    }

    ward.add(base);

    for (let i = 0; i < WAVE_CANDLES; i++) {
      const flame = this.add.graphics().setPosition((i - 1) * 92, 4);
      this.wallWardFlames.push(flame);
      ward.add(flame);
    }

    this.wallWard = ward;
    this.redrawWallWardCandles();
  }

  private redrawWallWardCandles(): void {
    for (let i = 0; i < this.wallWardFlames.length; i++) {
      const flame = this.wallWardFlames[i]!;
      const lit = i < this.candles;
      flame.clear();
      flame.fillStyle(0x0b0908, 0.34);
      flame.fillEllipse(0, 25, 42, 12);
      flame.fillStyle(UI_HEX.panel, 0.48);
      flame.fillRoundedRect(-19, 5, 38, 14, 5);
      flame.lineStyle(1, UI_HEX.brass, lit ? 0.42 : 0.22);
      flame.strokeRoundedRect(-19, 5, 38, 14, 5);
      flame.lineStyle(2, lit ? UI_HEX.brass : 0x746957, lit ? 0.44 : 0.24);
      flame.lineBetween(-13, 5, -5, -3);
      flame.lineBetween(13, 5, 5, -3);
      flame.fillStyle(lit ? 0xe8dcb5 : 0x4a4236, lit ? 0.9 : 0.56);
      flame.fillRoundedRect(-5, -20, 10, 25, 3);
      flame.fillStyle(0x1f170f, lit ? 0.9 : 0.6);
      flame.fillRect(-1, -26, 2, 7);
      if (lit) {
        flame.fillStyle(0xf2be68, 0.18);
        flame.fillEllipse(0, -30, 32, 42);
        flame.fillStyle(PALETTE_HEX.ember, 0.78);
        flame.fillEllipse(0, -34, 11, 21);
        flame.fillStyle(0xffe5a0, 0.44);
        flame.fillEllipse(0, -37, 6, 13);
      } else {
        flame.lineStyle(1, 0x746957, 0.3);
        flame.lineBetween(-8, -23, 8, -14);
      }
    }
  }

  private playWallWardPulse(
    mode: "arrival" | "wave" | "breach" | "clean" | "hold",
  ): void {
    if (!this.wallWard?.active) return;

    const color = mode === "breach"
      ? 0xb34b45
      : mode === "clean"
        ? 0xf5e3a2
        : mode === "arrival"
          ? 0x8b6ad8
          : UI_HEX.brass;
    const impactKind: AmbientKind = mode === "breach" ? "ash" : "mote";

    pulseUiObject(this, this.wallWard, {
      scale: mode === "breach" ? 1.055 : 1.025,
      durationMs: mode === "breach" ? 320 : 240,
    });
    this.pulseWrenDefender(mode);
    playSceneEventPulse(this, {
      kind: impactKind,
      color,
      x: WALL_WARD.x,
      y: WALL_WARD.y,
      depth: 6,
      durationMs: mode === "breach" ? 580 : 460,
      ringWidth: mode === "breach" ? WALL_WARD.width * 0.88 : WALL_WARD.width * 0.72,
      ringHeight: mode === "breach" ? WALL_WARD.height * 1.45 : WALL_WARD.height,
      count: mode === "breach" ? 12 : 8,
      alpha: mode === "breach" ? 0.12 : 0.075,
      spreadX: WALL_WARD.width * 0.32,
      spreadY: mode === "breach" ? 42 : 28,
    });
  }

  private dismissWallWard(durationMs = 520): void {
    const ward = this.wallWard;
    if (!ward?.active) return;
    this.wallWard = undefined;
    this.wallWardFlames = [];
    this.tweens.killTweensOf(ward);
    this.tweens.add({
      targets: ward,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.16,
      duration: durationMs,
      ease: "Sine.easeIn",
      onComplete: () => ward.destroy(),
    });
    this.dismissWrenDefender(durationMs);
  }

  private drawWrenDefender(): void {
    this.dismissWrenDefender(0);

    const c = this.add
      .container(WALL_WARD.x, WALL_WARD.y + 10)
      .setDepth(1.8)
      .setAlpha(0);
    c.add(addLocalGroundShadow(this, 122, 22, { y: 5, alpha: 0.34 }));

    const sprite = makeWrenSprite(this);
    const displayHeight = 204;
    const scale = displayHeight / sprite.height;
    sprite.setScale(scale);
    sprite.setTint(0xe5e0d4);
    c.add(sprite);

    this.wrenDefender = c;
    this.wrenDefenderSprite = sprite;

    stageContainerEntrance(this, c, {
      breathDy: -3,
      breathMs: 2400,
    });
    addContainerWake(this, c, {
      kind: "ash",
      intervalMs: 420,
      spreadX: 42,
      spreadY: 8,
      alpha: 0.12,
      size: 3,
      driftX: 58,
      driftY: -42,
      durationMs: 1100,
      depth: 4,
      offsetY: -72,
    });
  }

  private pulseWrenDefender(mode: "arrival" | "wave" | "breach" | "clean" | "hold"): void {
    const defender = this.wrenDefender;
    if (!defender?.scene) return;
    if (mode === "breach") {
      if (this.wrenDefenderSprite?.scene) {
        playWrenHurt(this.wrenDefenderSprite, { knockX: 0 });
      }
      playBodyImpact(this, defender, {
        kind: "ash",
        color: 0xb34b45,
        offsetY: -88,
        depth: 7,
        ringRadius: 34,
        count: 8,
        durationMs: 420,
      });
      return;
    }
    playActorAttention(this, defender, {
      scale: mode === "clean" ? 1.028 : 1.015,
      durationMs: mode === "clean" ? 260 : 190,
    });
  }

  private wrenDefenderClaimOrigin(): { x: number; y: number } {
    const defender = this.wrenDefender;
    if (!defender?.scene) {
      return { x: this.scale.width / 2, y: this.scale.height - 250 };
    }
    return { x: defender.x, y: defender.y - 112 };
  }

  private dismissWrenDefender(durationMs = 420): void {
    const defender = this.wrenDefender;
    this.wrenDefender = undefined;
    this.wrenDefenderSprite = undefined;
    if (!defender?.scene) return;
    this.tweens.killTweensOf(defender);
    if (durationMs <= 0) {
      defender.destroy();
      return;
    }
    this.tweens.add({
      targets: defender,
      alpha: 0,
      y: defender.y + 18,
      duration: durationMs,
      ease: "Sine.easeIn",
      onComplete: () => defender.destroy(),
    });
  }

  private redrawCandles(): void {
    const previous = this.drawnCandles;
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
    if (previous !== null && previous !== this.candles) {
      pulseUiObject(this, this.candleGroup, { scale: 1.14 });
    }
    this.drawnCandles = this.candles;
    this.redrawWallWardCandles();
  }

  private redrawCharges(): void {
    const previous = this.drawnCharges;
    this.chargeGroup.removeAll(true);
    for (let i = 0; i < this.waveCharges; i++) {
      const ready = i < this.charges;
      const x = (i - (this.waveCharges - 1) / 2) * 24;
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
    if (previous !== null && previous !== this.charges) {
      pulseUiObject(this, this.chargeGroup, { scale: 1.16 });
    }
    this.drawnCharges = this.charges;
  }

  private stageFinaleMeterObject(
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

  /** Snuff one candle — a Phase-1 breach or a fumbled Phase-2 counter. Reuses
   *  the Winter candle economy (candleAfterHit). At zero, the run is lost → the
   *  canon "we begin again" loss ending. No-op once the run is already over. */
  private loseCandle(): void {
    if (this.runOver) return;
    this.candles = candleAfterHit(this.candles);
    this.redrawCandles();
    this.playWallWardPulse("breach");
    if (this.candles <= 0) {
      this.runLossEnding();
    }
  }

  /** A Phase-1 enemy reached the wall undefeated — it breaks through, costs a
   *  candle, and leaves the board (so the wave can still clear). Marked
   *  `defeated` only to take it off the board: no chime/burst (it wasn't a
   *  kill), and the realms' hit cue (shake + thud + edge vignette) fires. */
  private breachEnemy(enemy: Enemy): void {
    if (enemy.defeated || this.runOver) return;
    enemy.defeated = true;
    enemy.advanceTween?.stop();
    enemy.advanceTween = null;
    enemy.arrivalTimer?.remove(false);
    enemy.arrivalTimer = null;
    enemy.wordAnchor?.destroy();
    enemy.wordAnchor = null;
    this.stopFinaleEnemyMotion(enemy);
    if (enemy.target) {
      this.typingInput.unregister(enemy.target);
      const idx = this.activeTargets.indexOf(enemy.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      enemy.target.destroy();
      enemy.target = null;
    }
    this.cameras.main.shake(180, 0.006);
    playDamageThud();
    flashDamageVignette(this);
    const wake = finaleWakeForRealm(enemy.realmId);
    playBodyImpact(this, enemy.graphic, {
      kind: wake.kind,
      color: wake.color,
      offsetX: enemy.body.x,
      offsetY: enemy.body.y + 34,
      depth: 48,
      ringRadius: 58,
    });
    this.tweens.add({
      targets: enemy.graphic,
      alpha: 0,
      duration: 250,
      onComplete: () => enemy.graphic.destroy(),
    });
    this.waveCandleLost = true;
    this.loseCandle();
  }

  /** The candles are out — the canon loss ending (§5.5.11). The Lord still
   *  whispers "Again."; Runa closes with "we begin again, then." A losing run
   *  is its own ending, not a game-over: we return to the hub with all realm
   *  progress + the satchel intact so the finale can be re-entered, and the
   *  great-battle realm is deliberately NOT marked cleared. */
  private runLossEnding(): void {
    if (this.runOver) return;
    this.runOver = true;
    // Sever the in-flight phase flow: cancel every pending timer, drop all live
    // targets, and stop listening for keystrokes.
    this.time.removeAllEvents();
    this.clearActiveTargets();
    this.dismissWallWard(760);
    this.input.keyboard?.off("keydown", this.onKeyDown, this);
    this.ambientHandle?.stop();

    this.cameras.main.shake(260, 0.008);
    const dim = this.add.graphics().setDepth(40).setAlpha(0);
    dim.fillStyle(0x05050a, 1);
    dim.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({ targets: dim, alpha: 0.55, duration: 900, ease: "Sine.easeIn" });

    // His word lands. On a loss the period is simply there (his victory); the
    // triumphant period click-in is the WIN seal, saved for the Phase-3 rebuild.
    this.time.delayedCall(700, () => {
      const parent = this.againText?.parentContainer;
      const x = this.againText?.scene
        ? (parent ? parent.x + this.againText.x : this.againText.x)
        : this.scale.width / 2;
      const y = this.againText?.scene
        ? (parent ? parent.y + this.againText.y : this.againText.y)
        : this.scale.height / 2 - 40;
      flashQuietLordFragment(this, { text: "Again.", durationMs: 2600, x, y });
    });
    this.time.delayedCall(2600, () =>
      this.narration.say("finale_loss_we_begin_again"),
    );
    this.time.delayedCall(7000, () => {
      this.cameras.main.fadeOut(1200, 0, 0, 0);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => this.scene.start("PortalChamberScene", {
          store: this.store,
          arrival: "great-battle",
        }),
      );
    });
  }

  // ─── PHASE 1 — The Wall ─────────────────────────────────────────────────────

  private startPhase1(): void {
    this.narration.say("finale_phase1_arrival");
    playSceneEventPulse(this, {
      kind: "ash",
      color: 0xc9a14a,
      x: this.scale.width / 2,
      y: 690,
      ringWidth: 1200,
      ringHeight: 190,
      count: 16,
      alpha: 0.11,
    });
    this.playWallWardPulse("arrival");

    // Build wave queue from cleared realms
    this.waveQueue = [];
    const state = this.store.get();
    for (const waveDef of WAVE_DEFS) {
      if (state.realms[waveDef.realmId]?.cleared) {
        this.waveQueue.push(waveDef);
      }
    }
    if (this.devWaveRealmId) {
      this.waveQueue = this.waveQueue.filter(
        (waveDef) => waveDef.realmId === this.devWaveRealmId,
      );
    }

    // §5.5.11 — Zero allies: Walked Alone tone — no chorus, quiet music
    if (this.waveQueue.length === 0) {
      this.narration.say("finale_phase1_walked_alone");
      this.time.delayedCall(2000, () => this.transitionToPhase2());
      return;
    }

    // §5.5.11 — Firefly Drift: dusk becomes dawn — all enemy words render brighter
    if (state.satchel.includes("firefly-lantern")) {
      // Lay a very subtle warm-light overlay; individual enemy targets will use
      // brighter color (handled in spawnEnemy via this flag)
      const dawnLight = this.add.graphics().setDepth(1);
      dawnLight.fillStyle(0xfff4c0, 0.06);
      dawnLight.fillRect(0, 0, this.scale.width, this.scale.height);
    }

    // §5.5.11 — Untethered Wind narration cue
    if (state.satchel.includes("untethered-wind")) {
      this.time.delayedCall(400, () => {
        this.showRelicNotice("finale_ally_untethered_wind", "wind");
      });
    }

    this.time.delayedCall(2200, () => this.runNextWave());
  }

  private runNextWave(): void {
    if (this.runOver) return;
    const satchel = this.store.get().satchel;

    if (this.waveQueue.length === 0) {
      // All waves done
      this.time.delayedCall(1000, () => {
        this.narration.say("finale_phase1_lord_arrives");
        this.time.delayedCall(1800, () => this.transitionToPhase2());
      });
      return;
    }

    const waveDef = this.waveQueue.shift()!;
    this.currentWaveIdx += 1;

    // Reset per-wave ally state
    this.charges = this.waveCharges;
    this.redrawCharges();
    // §5.5.11 — shrine-token: each new wave gets a fresh forgiveness slot
    this.shrineTokenForgivenThisWave = false;
    // Fail state: track whether this wave costs a candle, for the clean-wave
    // relight in onWaveCleared.
    this.waveCandleLost = false;

    this.setNarrator(`The ${waveDef.label} pour over the wall.`);
    this.band.setObjective("Hold the wall: clear the realm echoes before candles fall.");
    playSceneEventPulse(this, {
      kind: "ash",
      color: 0xc9a14a,
      x: this.scale.width / 2,
      y: 720,
      ringWidth: 1120,
      ringHeight: 170,
      count: 12,
      alpha: 0.1,
    });
    this.playWallWardPulse("wave");

    let words = pickAdaptiveWords(
      waveDef.bank as readonly string[],
      3,
      this.store.get().keyStats,
    );

    // §5.5.11 — Apprentices' Cabal (sabotage-wrench): enemy words shortened by 1 char
    if (satchel.includes("sabotage-wrench")) {
      words = words.map((w) => (w.length > 2 ? w.slice(0, -1) : w));
    }

    const xPositions = [this.scale.width * 0.25, this.scale.width * 0.5, this.scale.width * 0.75];

    for (let i = 0; i < 3; i++) {
      this.spawnEnemy(waveDef, xPositions[i]!, words[i]!, this.currentWaveIdx);
    }

    // §5.5.11 — Sigrid (hunters-horn): extra interrupts — occasionally an enemy
    // jitters/stalls mid-advance (simulated by a brief tween pause on one enemy)
    if (satchel.includes("hunters-horn")) {
      this.time.delayedCall(1200, () => this.applyHuntersHornInterrupt());
    }

    // §5.5.11 — Scholar Etta (ettas-ledger): auto-complete the easiest enemy
    // (shortest word) after a short delay each wave
    if (satchel.includes("ettas-ledger")) {
      this.time.delayedCall(2500, () => this.applyEttasLedgerAutoComplete());
    }

    // §5.5.11 — Ghost-King (ghost-kings-promise): intercept one minion per wave —
    // defeat one enemy before it engages (after a short delay)
    if (satchel.includes("ghost-kings-promise")) {
      this.time.delayedCall(1800, () => this.applyGhostKingIntercept());
    }

    this.watchForWaveClear(waveDef);
  }

  // §5.5.11 — hunters-horn: jitter one live enemy graphic briefly
  private applyHuntersHornInterrupt(): void {
    const waveEnemies = this.enemies.filter(
      (e) => e.waveIdx === this.currentWaveIdx && !e.defeated,
    );
    if (waveEnemies.length === 0) return;
    const target = waveEnemies[Math.floor(Math.random() * waveEnemies.length)]!;
    // Stutter: shake the graphic horizontally twice
    this.tweens.add({
      targets: target.graphic,
      x: { from: target.graphic.x - 10, to: target.graphic.x + 10 },
      duration: 80,
      yoyo: true,
      repeat: 3,
    });
  }

  // §5.5.11 — ettas-ledger: defeat the shortest-word live enemy automatically
  private applyEttasLedgerAutoComplete(): void {
    const waveEnemies = this.enemies.filter(
      (e) => e.waveIdx === this.currentWaveIdx && !e.defeated,
    );
    if (waveEnemies.length === 0) return;
    // Find shortest word
    const easiest = waveEnemies.reduce((a, b) =>
      a.word.length <= b.word.length ? a : b,
    );
    this.showRelicNotice("finale_ally_etta_ledger", "ledger");
    this.defeatEnemy(easiest);
  }

  // §5.5.11 — ghost-kings-promise: kill one random minion before it engages
  private applyGhostKingIntercept(): void {
    const waveEnemies = this.enemies.filter(
      (e) => e.waveIdx === this.currentWaveIdx && !e.defeated,
    );
    if (waveEnemies.length === 0) return;
    const victim = waveEnemies[Math.floor(Math.random() * waveEnemies.length)]!;
    this.showRelicNotice("finale_ally_ghost_king", "ally");
    this.defeatEnemy(victim);
  }

  private spawnEnemy(waveDef: WaveDef, x: number, word: string, waveIdx: number): void {
    const enemyArt = this.drawFinaleEnemyBody(waveDef.realmId, x, waveDef.baseY);
    const graphic = enemyArt.container
      .setDepth(3)
      .setAlpha(0);
    addContainerWake(this, graphic, {
      ...finaleWakeForRealm(waveDef.realmId),
      offsetX: x,
      offsetY: waveDef.baseY + 8,
      depth: 2,
    });
    graphic.y = -95;

    const enemy: Enemy = {
      graphic,
      body: enemyArt.body,
      target: null,
      wordAnchor: null,
      advanceTween: null,
      arrivalTimer: null,
      x,
      y: waveDef.baseY,
      realmId: waveDef.realmId,
      word,
      defeated: false,
      waveIdx,
    };

    this.enemies.push(enemy);

    const laneOffset = (x / this.scale.width - 0.5) * 50;
    this.tweens.add({
      targets: graphic,
      y: 0,
      alpha: 1,
      duration: 560,
      delay: Math.abs(laneOffset) * 8,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (enemy.defeated || this.runOver) return;
        this.beginEnemyThreat(enemy, waveDef);
      },
    });
    this.tweens.add({
      targets: enemy.body,
      scaleX: { from: 0.98, to: 1.03 },
      scaleY: { from: 1, to: 0.97 },
      duration: 1300 + Math.abs(laneOffset) * 10,
      delay: 560,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private beginEnemyThreat(enemy: Enemy, waveDef: WaveDef): void {
    const wake = finaleWakeForRealm(enemy.realmId);
    playBodyImpact(this, enemy.graphic, {
      kind: wake.kind,
      color: wake.color,
      offsetX: enemy.body.x,
      offsetY: enemy.body.y - 12,
      depth: 6,
      ringRadius: 34,
      count: 7,
      durationMs: 300,
    });
    enemy.arrivalTimer?.remove(false);
    enemy.arrivalTimer = this.time.delayedCall(
      FINALE_ENEMY_WORD_ATTACH_DELAY_MS,
      () => {
        enemy.arrivalTimer = null;
        if (enemy.defeated || this.runOver || !enemy.graphic.scene) return;
        this.attachEnemyWord(enemy, waveDef);
        this.beginEnemyAdvance(enemy);
      },
    );
  }

  private attachEnemyWord(enemy: Enemy, waveDef: WaveDef): void {
    // §5.5.11 — firefly-lantern: enemy word text rendered brighter via the
    // dawn-light overlay applied in startPhase1 (TextWordTarget doesn't expose
    // a per-instance color override; the overlay tints the whole battlefield).
    const wordOffsetY = finaleEnemyWordOffsetForRealm(waveDef.realmId);
    const target = this.makeWord({
      scene: this,
      word: enemy.word,
      x: enemy.graphic.x + enemy.body.x,
      y: enemy.graphic.y + enemy.body.y + wordOffsetY,
      fontSize: 34,
      onClaim: () => {
        const from = this.wrenDefenderClaimOrigin();
        playClaimLine(
          this,
          from.x,
          from.y,
          enemy.graphic.x + enemy.body.x,
          enemy.graphic.y + enemy.body.y + wordOffsetY,
          { color: finaleClaimColorForRealm(waveDef.realmId) },
        );
      },
      onAdvance: () =>
        playBodyTypePulse(this, enemy.graphic, {
          ...finaleTypedPulseForRealm(waveDef.realmId),
          offsetX: enemy.body.x,
          offsetY: enemy.body.y + wordOffsetY,
          depth: 6,
        }),
      onComplete: () => this.defeatEnemy(enemy),
    });
    enemy.target = target;
    enemy.wordAnchor?.destroy();
    enemy.wordAnchor = attachWordBodyAnchor(
      this,
      enemy.graphic,
      () =>
        enemy.target
          ? { x: enemy.target.getAnchorX(), y: enemy.target.getAnchorY() }
          : null,
      {
        color: finaleClaimColorForRealm(waveDef.realmId),
        alpha: 0.16,
        depth: 5,
        sourceOffsetX: enemy.body.x,
        sourceOffsetY: enemy.body.y + FINALE_ENEMY_ANCHOR_SOURCE_OFFSET_Y,
        targetOffsetY: 24,
      },
    );
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private beginEnemyAdvance(enemy: Enemy): void {
    // §5.5.11 — untethered-wind: slow enemy advance by ~15% via longer tween.
    // Enemy advance is a slow downward drift toward the wall; if it completes
    // before the enemy is defeated, the line is breached → a candle is snuffed
    // (the fail-state stake). untethered-wind buys more time to clear it.
    const advanceDuration = 12000 * (1 / this.untetheredWindSlowMult);
    this.startFinaleEnemyGait(enemy);
    enemy.advanceTween = this.tweens.add({
      targets: enemy.graphic,
      y: `+=${80}`,
      duration: advanceDuration,
      ease: "Linear",
      onUpdate: () => {
        enemy.target?.setAnchorX(enemy.graphic.x + enemy.body.x);
        enemy.target?.setAnchorY(
          enemy.graphic.y + enemy.body.y + finaleEnemyWordOffsetForRealm(enemy.realmId),
        );
      },
      onComplete: () => {
        enemy.advanceTween = null;
        this.breachEnemy(enemy);
      },
    });
  }

  private startFinaleEnemyGait(enemy: Enemy): void {
    const body = enemy.body;
    this.tweens.killTweensOf(body);
    body.setScale(1).setAngle(0);

    const dir = body.x < this.scale.width / 2 ? 1 : -1;
    const homeX = body.x;
    const homeY = body.y;

    if (enemy.realmId === "winter-mountain") {
      this.tweens.add({
        targets: body,
        x: homeX + dir * 10,
        y: homeY - 4,
        angle: dir * -1.8,
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      return;
    }

    if (enemy.realmId === "clockwork-forge") {
      this.tweens.add({
        targets: body,
        x: homeX + dir * 5,
        y: homeY - 2,
        angle: dir * -0.9,
        duration: 430,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      return;
    }

    const floatMs =
      enemy.realmId === "sky-island"
        ? 760
        : enemy.realmId === "sunken-bell"
          ? 900
          : 820;
    const lift =
      enemy.realmId === "sky-island"
        ? -14
        : enemy.realmId === "sunken-bell"
          ? -10
          : -8;

    this.tweens.add({
      targets: body,
      x: homeX + dir * (enemy.realmId === "sky-island" ? 9 : 6),
      y: homeY + lift,
      angle: dir * (enemy.realmId === "sky-island" ? 2.2 : 1.2),
      duration: floatMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private stopFinaleEnemyMotion(enemy: Enemy): void {
    this.tweens.killTweensOf(enemy.graphic);
    this.tweens.killTweensOf(enemy.body);
  }

  private drawFinaleEnemyBody(
    realmId: string,
    x: number,
    y: number,
  ): { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Container } {
    const c = this.add.container(0, 0);
    const spec = finaleEnemyArtForRealm(realmId);
    const body = this.add.container(x, y);
    c.add(body);

    body.add(addLocalGroundShadow(this, spec.shadowWidth, spec.shadowHeight, {
      y: spec.shadowY,
      alpha: spec.shadowAlpha,
    }));

    if (spec.glowColor) {
      const glow = this.add.graphics();
      glow.fillStyle(spec.glowColor, spec.glowAlpha ?? 0.14);
      glow.fillEllipse(
        0,
        spec.glowY ?? 0,
        spec.glowWidth ?? 92,
        spec.glowHeight ?? 92,
      );
      body.add(glow);
    }

    this.addFinaleEnemyContactMark(realmId, body);

    const sprite = this.add.image(0, spec.spriteY, spec.textureKey);
    sprite.setScale(spec.height / sprite.height);
    if (spec.tint) sprite.setTint(spec.tint);
    if (spec.alpha !== undefined) sprite.setAlpha(spec.alpha);
    if (spec.flipX) sprite.setFlipX(true);
    body.add(sprite);
    return { container: c, body };
  }

  private addFinaleEnemyContactMark(
    realmId: string,
    body: Phaser.GameObjects.Container,
  ): void {
    const footing = this.add.graphics();

    if (realmId === "winter-mountain") {
      footing.fillStyle(0xbfd3e4, 0.06);
      footing.fillEllipse(10, 70, 208, 12);
      footing.lineStyle(2, 0xe6f3ff, 0.08);
      footing.lineBetween(-98, 62, -50, 60);
      footing.lineBetween(-18, 61, 32, 60);
      footing.lineBetween(78, 62, 116, 60);
      body.add(footing);
      return;
    }

    if (realmId === "sunken-bell") {
      footing.fillStyle(0x102c3a, 0.18);
      footing.fillEllipse(0, 52, 136, 20);
      footing.lineStyle(2, 0xa7d2dd, 0.2);
      footing.strokeEllipse(-14, 47, 82, 10);
      footing.strokeEllipse(20, 54, 68, 9);
      footing.lineStyle(1, 0x4ab8d6, 0.16);
      footing.lineBetween(-60, 48, -28, 45);
      footing.lineBetween(-18, 54, 16, 50);
      footing.lineBetween(32, 51, 68, 48);
      footing.fillStyle(0xa7d2dd, 0.14);
      footing.fillCircle(-42, 47, 2.2);
      footing.fillCircle(46, 52, 2);
      body.add(footing);
      return;
    }

    if (realmId === "clockwork-forge") {
      footing.fillStyle(0x1d100c, 0.24);
      footing.fillEllipse(0, 62, 194, 32);
      footing.lineStyle(3, PALETTE_HEX.ember, 0.16);
      footing.lineBetween(-76, 52, -36, 59);
      footing.lineBetween(-28, 61, 20, 54);
      footing.lineBetween(30, 57, 86, 63);
      footing.lineStyle(2, PALETTE_HEX.brass, 0.11);
      footing.lineBetween(-68, 66, -18, 69);
      footing.lineBetween(26, 68, 78, 65);
      footing.fillStyle(PALETTE_HEX.ember, 0.16);
      footing.fillCircle(-58, 56, 3.2);
      footing.fillCircle(62, 59, 3);
      footing.fillStyle(PALETTE_HEX.brass, 0.14);
      footing.fillCircle(-28, 62, 2.4);
      footing.fillCircle(38, 64, 2.2);
      body.add(footing);
      return;
    }

    if (realmId === "sky-island") {
      footing.fillStyle(0xf5c842, 0.08);
      footing.fillEllipse(0, 51, 136, 18);
      footing.fillStyle(0xffe6a6, 0.1);
      footing.fillTriangle(-56, 43, -45, 31, -36, 44);
      footing.fillTriangle(36, 44, 49, 33, 58, 45);
      footing.fillTriangle(-8, 47, 4, 34, 15, 47);
      footing.lineStyle(2, 0xffe6a6, 0.18);
      footing.lineBetween(-58, 44, -24, 47);
      footing.lineBetween(-18, 49, 16, 43);
      footing.lineBetween(22, 45, 62, 48);
      footing.lineStyle(1, 0xf5c842, 0.22);
      footing.lineBetween(-42, 37, -22, 42);
      footing.lineBetween(18, 38, 42, 42);
      footing.fillStyle(0xfff0bd, 0.18);
      footing.fillCircle(-32, 42, 2.4);
      footing.fillCircle(33, 43, 2.2);
      footing.fillCircle(2, 39, 2);
      body.add(footing);
      return;
    }

    if (realmId === "haunted-wood") {
      footing.fillStyle(0x11180f, 0.24);
      footing.fillEllipse(0, 52, 138, 24);
      footing.fillStyle(0xd8e2cf, 0.07);
      footing.fillEllipse(-12, 47, 94, 14);
      footing.lineStyle(3, 0x6f8b68, 0.14);
      footing.lineBetween(-62, 48, -30, 52);
      footing.lineBetween(-36, 52, -4, 46);
      footing.lineBetween(2, 47, 40, 53);
      footing.lineBetween(32, 52, 68, 49);
      footing.lineStyle(1, 0xd8e2cf, 0.12);
      footing.lineBetween(-54, 43, -20, 39);
      footing.lineBetween(20, 43, 56, 40);
      footing.fillStyle(0xd8e2cf, 0.12);
      footing.fillCircle(-44, 43, 2.8);
      footing.fillCircle(44, 46, 2.4);
      footing.fillCircle(6, 41, 1.8);
      body.add(footing);
      return;
    }

    footing.destroy();
  }

  private defeatEnemy(enemy: Enemy): void {
    if (enemy.defeated) return;
    playChime();
    enemy.defeated = true;
    enemy.advanceTween?.stop();
    enemy.advanceTween = null;
    enemy.arrivalTimer?.remove(false);
    enemy.arrivalTimer = null;
    enemy.wordAnchor?.destroy();
    enemy.wordAnchor = null;
    this.stopFinaleEnemyMotion(enemy);
    const wake = finaleWakeForRealm(enemy.realmId);
    playBodyImpact(this, enemy.graphic, {
      kind: wake.kind,
      color: wake.color,
      offsetX: enemy.body.x,
      offsetY: enemy.body.y - 10,
      depth: 48,
    });
    if (enemy.target) {
      const target = enemy.target;
      this.typingInput.unregister(enemy.target);
      const idx = this.activeTargets.indexOf(enemy.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      if (!target.isComplete()) target.destroy();
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
      if (this.runOver) return;
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
    if (this.runOver) return;
    const satchel = this.store.get().satchel;

    // Clean-wave recovery (§5.5.11 economy, mirrors Winter): clearing a wave
    // without a breach relights one candle, capped — skill refills the pool, so
    // the fail state is real but recoverable. A wave that cost a candle earns
    // nothing back here.
    if (!this.waveCandleLost) {
      const before = this.candles;
      this.candles = candleAfterCleanWave(this.candles, WAVE_CANDLES);
      if (this.candles !== before) {
        this.redrawCandles();
        this.playWallWardPulse("clean");
      } else {
        this.playWallWardPulse("hold");
      }
    }

    if (satchel.includes(waveDef.companionId)) {
      this.showCompanionCameo(waveDef);
      this.band.showNotice(waveDef.companionLine, { label: "ally", durationMs: 2400 });
      this.time.delayedCall(2600, () => this.runNextWave());
    } else {
      // Brief pause, no cameo
      this.time.delayedCall(800, () => this.runNextWave());
    }
  }

  private showCompanionCameo(waveDef: WaveDef): void {
    const spec = this.companionCameoSpec(waveDef);
    if (!spec) return;

    const container = this.add
      .container(spec.startX, spec.y)
      .setDepth(7)
      .setAlpha(0);
    container.add(
      addLocalGroundShadow(this, spec.shadowWidth, spec.shadowHeight, {
        y: spec.shadowY,
        alpha: spec.shadowAlpha,
      }),
    );

    const sprite = this.add.image(0, 0, spec.textureKey).setOrigin(0.5, 1);
    sprite.setScale(spec.height / Math.max(1, sprite.height));
    if (spec.flipX) sprite.setFlipX(true);
    container.add(sprite);

    addContainerWake(this, container, {
      ...spec.wake,
      depth: spec.wake.depth ?? 6,
    });

    this.tweens.add({
      targets: container,
      x: spec.endX,
      alpha: 1,
      duration: 640,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: container,
      y: spec.y - (spec.liftY ?? 8),
      duration: spec.bobMs ?? 820,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: sprite,
      angle: { from: -2, to: 2 },
      duration: 360,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
    this.time.delayedCall(1780, () => {
      if (!container.scene) return;
      this.tweens.add({
        targets: container,
        x: spec.exitX,
        alpha: 0,
        duration: 680,
        ease: "Sine.easeIn",
        onComplete: () => container.destroy(),
      });
    });
  }

  private showFinaleCompanionAction(
    companionId: FinaleCompanionActionId,
  ): Phaser.GameObjects.Container {
    const width = this.scale.width;
    switch (companionId) {
      case "glass-fish":
        return stageCompanionCameo(this, {
          textureKey: "finale-companion-glass-fish",
          startX: width + 110,
          startY: 700,
          x: width * 0.62,
          y: 650,
          height: 94,
          depth: 8,
          flipX: true,
          shadowWidth: 78,
          shadowHeight: 12,
          shadowOffsetY: 24,
          shadowAlpha: 0.13,
          breathDy: -16,
          breathMs: 1450,
          wake: {
            kind: "bubble",
            intervalMs: 140,
            offsetY: -34,
            spreadX: 24,
            spreadY: 20,
            depth: 7,
            alpha: 0.34,
          },
        });
      case "lantern-moth":
        return stageCompanionCameo(this, {
          textureKey: "finale-companion-lantern-moth",
          startX: width + 95,
          startY: 530,
          x: width * 0.32,
          y: 575,
          height: 92,
          depth: 8,
          flipX: true,
          shadowWidth: 62,
          shadowHeight: 10,
          shadowOffsetY: 34,
          shadowAlpha: 0.12,
          breathDy: -22,
          breathMs: 1450,
          wake: {
            kind: "mote",
            intervalMs: 120,
            offsetY: -42,
            spreadX: 28,
            spreadY: 22,
            depth: 7,
            alpha: 0.42,
          },
        });
      case "wisp-cat":
        return stageCompanionCameo(this, {
          textureKey: "finale-companion-wisp-cat",
          startX: -100,
          startY: 770,
          x: width * 0.73,
          y: 760,
          height: 108,
          depth: 8,
          shadowWidth: 86,
          shadowHeight: 16,
          shadowOffsetY: 10,
          shadowAlpha: 0.2,
          breathDy: -5,
          breathMs: 1800,
          wake: {
            kind: "mist",
            intervalMs: 160,
            offsetY: -8,
            spreadX: 22,
            spreadY: 10,
            depth: 7,
            alpha: 0.24,
          },
        });
      case "brass-songbird":
        return stageCompanionCameo(this, {
          textureKey: "finale-companion-brass-songbird",
          startX: width + 90,
          startY: 485,
          x: width * 0.66,
          y: 510,
          height: 78,
          depth: 8,
          flipX: true,
          shadowWidth: 56,
          shadowHeight: 10,
          shadowOffsetY: 28,
          shadowAlpha: 0.14,
          breathDy: -14,
          breathMs: 1350,
          wake: {
            kind: "ember",
            intervalMs: 125,
            offsetY: -34,
            spreadX: 22,
            spreadY: 16,
            depth: 7,
            alpha: 0.42,
          },
        });
    }
  }

  private dismissFinaleCompanionAction(
    companion: Phaser.GameObjects.Container,
    exitX: number,
    exitY: number,
  ): void {
    dismissCompanionCameo(this, companion, {
      x: exitX,
      y: exitY,
      durationMs: 680,
    });
  }

  private companionCameoSpec(waveDef: WaveDef): CompanionCameoSpec | null {
    const width = this.scale.width;
    const wake = finaleWakeForRealm(waveDef.realmId);

    switch (waveDef.companionId) {
      case "snow-fox-cub":
        return {
          textureKey: "finale-companion-snow-fox",
          startX: -110,
          endX: width * 0.24,
          exitX: width * 0.36,
          y: 788,
          height: 118,
          shadowWidth: 96,
          shadowHeight: 18,
          shadowY: 9,
          shadowAlpha: 0.26,
          wake: { ...wake, intervalMs: 150, offsetY: -8, depth: 6 },
          liftY: 7,
          bobMs: 620,
        };
      case "glass-fish":
        return {
          textureKey: "finale-companion-glass-fish",
          startX: width + 100,
          endX: width * 0.72,
          exitX: width * 0.58,
          y: 690,
          height: 92,
          shadowWidth: 72,
          shadowHeight: 12,
          shadowY: 22,
          shadowAlpha: 0.16,
          wake: { ...wake, intervalMs: 150, offsetY: -32, spreadY: 18, depth: 6 },
          liftY: 18,
          bobMs: 720,
          flipX: true,
        };
      case "brass-songbird":
        return {
          textureKey: "finale-companion-brass-songbird",
          startX: width + 95,
          endX: width * 0.74,
          exitX: width * 0.61,
          y: 630,
          height: 82,
          shadowWidth: 58,
          shadowHeight: 10,
          shadowY: 28,
          shadowAlpha: 0.15,
          wake: { ...wake, intervalMs: 120, offsetY: -28, spreadY: 18, depth: 6 },
          liftY: 20,
          bobMs: 650,
          flipX: true,
        };
      case "lantern-moth":
        return {
          textureKey: "finale-companion-lantern-moth",
          startX: width + 90,
          endX: width * 0.7,
          exitX: width * 0.57,
          y: 615,
          height: 94,
          shadowWidth: 64,
          shadowHeight: 10,
          shadowY: 34,
          shadowAlpha: 0.14,
          wake: { ...wake, intervalMs: 120, offsetY: -30, spreadY: 22, depth: 6 },
          liftY: 24,
          bobMs: 700,
          flipX: true,
        };
      case "wisp-cat":
        return {
          textureKey: "finale-companion-wisp-cat",
          startX: -105,
          endX: width * 0.27,
          exitX: width * 0.41,
          y: 770,
          height: 112,
          shadowWidth: 90,
          shadowHeight: 16,
          shadowY: 10,
          shadowAlpha: 0.22,
          wake: { ...wake, intervalMs: 160, offsetY: -4, depth: 6 },
          liftY: 9,
          bobMs: 700,
        };
      default:
        return null;
    }
  }

  private transitionToPhase2(): void {
    this.clearActiveTargets();
    this.dismissWallWard();
    this.enemies = [];
    this.band.setObjective("The wall holds; the Quiet Lord is coming.");
    this.time.delayedCall(600, () => this.startPhase2());
  }

  // ─── PHASE 2 — The Duel ─────────────────────────────────────────────────────

  private startPhase2(): void {
    const satchel = this.store.get().satchel;

    // §5.5.11 fork — resolve the duel alignment once via the shared aggregator
    // (≥3 force = louder/harder; ≥3 kindness = quieter but cleaner-play).
    const effects = getActiveRelicEffects(satchel);
    this.isForceDuel = effects.isForceDuel;
    this.isKindnessDuel = effects.isKindnessDuel;

    // Stash relic availability for later methods
    this.bellsTongueSuperHitAvailable = satchel.includes("bells-tongue");
    this.tetherCordBindUsed = false;
    this.whirlwindCanceled =
      satchel.includes("wind-phrase") && satchel.includes("quiet-chant");
    this.whirlwindCancelAnnounced = false;

    this.band.setObjective("Face the Quiet Lord; watch for realm facets.");
    this.drawQuietLord(this.isForceDuel, this.isKindnessDuel);

    const lordX = this.quietLordContainer.x;
    const lordY = this.quietLordContainer.y + 560;
    playSceneEventPulse(this, {
      kind: "mist",
      color: this.isForceDuel ? 0x9b2424 : 0x6b5ea8,
      x: lordX,
      y: lordY,
      depth: 3,
      ringWidth: this.isForceDuel ? 760 : 640,
      ringHeight: 260,
      count: 14,
      alpha: 0.12,
    });
    this.showQuietLordDescription();
  }

  private drawQuietLord(forceDuel = false, kindnessDuel = false): void {
    this.quietLordContainer = this.add.container(this.scale.width / 2, 0).setDepth(4);

    const aura = this.add.graphics();
    aura.fillStyle(forceDuel ? 0x5a1010 : 0x2a2038, forceDuel ? 0.2 : 0.14);
    aura.fillEllipse(0, 310, 280, 520);
    aura.lineStyle(2, forceDuel ? 0x9b2424 : 0x4b3d7a, 0.32);
    aura.strokeEllipse(0, 310, 230, 480);

    const shadow = addLocalGroundShadow(this, 190, 30, {
      y: 560,
      alpha: forceDuel ? 0.5 : 0.4,
    });

    const lordFigure = this.add.container(0, 0);
    const lordSprite = makeQuietLordSprite(this).setPosition(0, 560);
    if (forceDuel) lordSprite.setTint(0xffd0d0);

    const eyes = this.add.graphics();
    const eyeColor = forceDuel ? 0xa01010 : 0x4a1010;
    const eyeAlpha = forceDuel ? 1.0 : 0.85;
    eyes.fillStyle(eyeColor, eyeAlpha);
    eyes.fillEllipse(-28, 190, 20, 12);
    eyes.fillEllipse(28, 190, 20, 12);
    lordFigure.add([lordSprite, eyes]);

    // §5.5.11 — ≥3 kindness relics: Lord is slightly smaller (he shrinks rather than cracks)
    if (kindnessDuel) {
      this.quietLordContainer.setScale(0.82);
    }

    this.quietLordContainer.add([aura, shadow, lordFigure]);
    addIdleBreath(this, lordFigure, {
      dy: forceDuel ? -6 : -4,
      durationMs: forceDuel ? 1800 : 2400,
    });

    // The accumulating word, WITHOUT its period (§5.5.10): the realms revealed
    // it letter by letter (A → Ag → … → Again, no period); the period only
    // clicks into place at the win seal (runPeriodSeal). With strikethrough.
    this.againText = this.add
      .text(0, 280, "Again", {
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
      this.time.delayedCall(3200, () => this.startFacetPhase());
    });
  }

  // ─── PHASE 2 — facet sequence (§5.5.11 counter-loadout) ─────────────────────
  //
  // The Lord channels one facet per cleared realm. A relic that counters it
  // neutralizes the facet (skip); a missing counter forces a timed defense —
  // failing it snuffs a candle. This is the duel's opening movement; the
  // existing counter rounds (startPhase2a onward) follow.

  private startFacetPhase(): void {
    if (this.runOver) return;
    const state = this.store.get();
    const clearedRealmIds = WAVE_DEFS.map((w) => w.realmId).filter(
      (id) => state.realms[id]?.cleared,
    );
    const facets = resolveFacets(clearedRealmIds, state.satchel);
    if (facets.length === 0) {
      // No cleared realms → nothing to channel. Straight to the counter rounds.
      this.band.setObjective("No realm facets answer him; type the counter-words.");
      this.startPhase2a();
      return;
    }
    this.narration.say("finale_facets_intro");
    this.band.setObjective("Watch each realm facet and answer any defense word.");
    this.time.delayedCall(2000, () => this.runFacetSequence(facets, 0));
  }

  private runFacetSequence(facets: FacetResolution[], idx: number): void {
    if (this.runOver) return;
    if (idx >= facets.length) {
      this.time.delayedCall(700, () => this.startPhase2a());
      return;
    }
    const { facet, counteredBy } = facets[idx]!;
    // Telegraph — name the facet so the player learns the counter over replays.
    this.showFacetSigil(facet, counteredBy ? "countered" : "threat");
    this.narration.say(FACET_LINES[facet.id].telegraph);
    this.band.setObjective(
      counteredBy
        ? `${facet.name} rises; a relic is ready to answer.`
        : `${facet.name} rises; prepare to type its defense word.`,
    );
    this.time.delayedCall(1700, () => {
      if (this.runOver) return;
      if (counteredBy) {
        // A relic answers it — neutralized, no challenge. The Lord flickers.
        this.narration.say(FACET_LINES[facet.id].countered);
        this.band.setObjective(`${facet.name} is answered; hold steady.`);
        const from = this.facetClaimOrigin();
        const to = this.quietLordBodyTarget();
        playClaimLine(
          this,
          from.x,
          from.y,
          to.x,
          to.y,
          { color: UI_HEX.brass, depth: 6, durationMs: 520 },
        );
        this.playFacetImpact(facet, "countered");
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: { from: this.quietLordContainer.alpha, to: 0.7 },
          duration: 260,
          yoyo: true,
        });
        this.time.delayedCall(1400, () => this.clearFacetSigil());
        this.time.delayedCall(1800, () => this.runFacetSequence(facets, idx + 1));
      } else {
        // No counter — survive the facet by typing its defense word in time.
        this.runFacetChallenge(facet, () => this.runFacetSequence(facets, idx + 1));
      }
    });
  }

  private runFacetChallenge(facet: Facet, onDone: () => void): void {
    if (this.runOver) return;
    // Dynamic prompt (the word varies) — same shape as the Phase-2c spell cue.
    this.setNarrator(`${facet.name} crashes down — type:  ${facet.defenseWord}`);
    this.band.setObjective(`Type ${facet.defenseWord} before the facet lands.`);

    let resolved = false;
    const finish = (): void => {
      if (this.runOver) return;
      this.time.delayedCall(1200, () => {
        if (!this.runOver) onDone();
      });
    };

    let target!: TextWordTarget;
    const wordPos = this.facetDefenseWordPosition(facet);
    const timer = this.time.delayedCall(FACET_CHALLENGE_MS, () => {
      if (resolved) return;
      resolved = true;
      this.clearTargetAnchor(target);
      this.clearActiveTargets();
      this.playFacetImpact(facet, "landed");
      this.clearFacetSigil();
      // It lands — the realms' hit cue + a candle gutters.
      this.cameras.main.shake(220, 0.006);
      playDamageThud();
      flashDamageVignette(this);
      this.narration.say("finale_facet_lands");
      this.loseCandle();
      finish(); // no-op if loseCandle emptied the pool (runOver guards it)
    });

    target = this.makeWord({
      scene: this,
      word: facet.defenseWord,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 46,
      onClaim: () => {
        const from = this.facetClaimOrigin();
        playClaimLine(
          this,
          from.x,
          from.y,
          wordPos.x,
          wordPos.y,
          { color: UI_HEX.brass, depth: 6 },
        );
      },
      onAdvance: () =>
        this.facetSigil &&
        playBodyTypePulse(this, this.facetSigil, {
          kind: this.facetParticleKind(facet),
          color: UI_HEX.brass,
          offsetY: 0,
          depth: 7,
          ringRadius: 34,
          durationMs: 260,
        }),
      onComplete: () => {
        if (resolved) return;
        resolved = true;
        timer.remove();
        this.clearTargetAnchor(target);
        playChime();
        this.clearActiveTargets();
        this.playFacetImpact(facet, "held");
        this.clearFacetSigil();
        this.narration.say("finale_facet_held");
        finish();
      },
    });
    if (this.facetSigil) {
      this.trackTargetAnchor(
        target,
        attachWordBodyAnchor(
          this,
          this.facetSigil,
          () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
          {
            color: UI_HEX.brass,
            alpha: 0.15,
            depth: 6,
            sourceOffsetY: 0,
            targetOffsetY: 24,
          },
        ),
      );
    }
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private showFacetSigil(facet: Facet, mode: "countered" | "threat"): void {
    this.clearFacetSigil(false);

    const color = mode === "countered" ? UI_HEX.brass : UI_HEX.ember;
    const alpha = mode === "countered" ? 0.46 : 0.6;
    const channel = this.add
      .graphics()
      .setDepth(2.8)
      .setAlpha(0)
      .setPosition(this.scale.width / 2, 0);
    this.drawFacetChannelInto(channel, color, mode);
    this.facetChannel = channel;

    const g = this.add.graphics().setDepth(3).setAlpha(0).setPosition(this.scale.width / 2, 300);
    this.drawFacetSigilInto(g, facet.id, color, mode);
    this.facetSigil = g;

    this.tweens.add({
      targets: g,
      alpha,
      scaleX: { from: 0.86, to: 1 },
      scaleY: { from: 0.86, to: 1 },
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: channel,
      alpha: mode === "countered" ? 0.34 : 0.46,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: channel,
      alpha: mode === "countered" ? 0.18 : 0.28,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: g,
      angle: mode === "countered" ? 3 : -3,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private clearFacetSigil(fade = true): void {
    const sigil = this.facetSigil;
    const channel = this.facetChannel;
    this.facetSigil = null;
    this.facetChannel = null;
    if (sigil) this.tweens.killTweensOf(sigil);
    if (channel) this.tweens.killTweensOf(channel);
    if (!fade) {
      sigil?.destroy();
      channel?.destroy();
      return;
    }
    if (sigil) {
      this.tweens.add({
        targets: sigil,
        alpha: 0,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 260,
        ease: "Sine.easeIn",
        onComplete: () => sigil.destroy(),
      });
    }
    if (channel) {
      this.tweens.add({
        targets: channel,
        alpha: 0,
        duration: 220,
        ease: "Sine.easeIn",
        onComplete: () => channel.destroy(),
      });
    }
  }

  private playFacetImpact(
    facet: Facet,
    outcome: "countered" | "held" | "landed",
  ): void {
    if (!this.facetSigil) return;
    playBodyImpact(this, this.facetSigil, {
      kind: this.facetParticleKind(facet),
      color: outcome === "landed" ? UI_HEX.ember : UI_HEX.brass,
      offsetY: 0,
      depth: 7,
      ringRadius: outcome === "landed" ? 86 : 64,
      count: outcome === "landed" ? 18 : 13,
      durationMs: outcome === "landed" ? 560 : 460,
    });
  }

  private facetParticleKind(facet: Facet): "ash" | "bubble" | "ember" | "mist" | "mote" | "snow" {
    switch (facet.id) {
      case "cold":
        return "snow";
      case "toll":
        return "bubble";
      case "armor":
        return "ember";
      case "light":
        return "mote";
      case "grief":
        return "mist";
    }
  }

  private drawFacetChannelInto(
    g: Phaser.GameObjects.Graphics,
    color: number,
    mode: "countered" | "threat",
  ): void {
    const alpha = mode === "countered" ? 0.38 : 0.48;
    g.clear();
    g.lineStyle(3, color, alpha);
    g.beginPath();
    g.moveTo(0, 372);
    g.lineTo(-72, 432);
    g.lineTo(-36, 505);
    g.lineTo(0, 548);
    g.lineTo(36, 505);
    g.lineTo(72, 432);
    g.lineTo(0, 372);
    g.strokePath();

    g.lineStyle(1, color, alpha * 0.72);
    g.lineBetween(0, 396, 0, 542);
    g.lineBetween(-58, 444, 58, 444);
    g.lineBetween(-28, 502, 28, 502);
    g.fillStyle(color, mode === "countered" ? 0.1 : 0.14);
    g.fillCircle(0, 548, 36);
  }

  private drawFacetSigilInto(
    g: Phaser.GameObjects.Graphics,
    facetId: FacetId,
    color: number,
    mode: "countered" | "threat",
  ): void {
    g.clear();
    g.lineStyle(3, color, mode === "countered" ? 0.82 : 0.74);
    g.strokeCircle(0, 0, 96);
    g.lineStyle(1, color, mode === "countered" ? 0.38 : 0.32);
    g.strokeCircle(0, 0, 122);

    if (facetId === "cold") {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const x1 = Math.cos(a) * 26;
        const y1 = Math.sin(a) * 26;
        const x2 = Math.cos(a) * 82;
        const y2 = Math.sin(a) * 82;
        g.lineBetween(x1, y1, x2, y2);
        g.lineBetween(Math.cos(a + 0.28) * 58, Math.sin(a + 0.28) * 58, x2, y2);
        g.lineBetween(Math.cos(a - 0.28) * 58, Math.sin(a - 0.28) * 58, x2, y2);
      }
      return;
    }

    if (facetId === "toll") {
      g.strokeEllipse(0, 12, 72, 94);
      g.lineBetween(-42, 50, 42, 50);
      g.lineBetween(-28, -35, 28, -35);
      g.fillStyle(color, 0.6);
      g.fillCircle(0, 56, 7);
      return;
    }

    if (facetId === "armor") {
      g.strokeRoundedRect(-46, -62, 92, 118, 10);
      g.lineBetween(-34, -20, 34, -20);
      g.lineBetween(-34, 18, 34, 18);
      g.fillStyle(color, 0.2);
      g.fillTriangle(0, -42, -26, 48, 26, 48);
      return;
    }

    if (facetId === "light") {
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        g.lineBetween(Math.cos(a) * 34, Math.sin(a) * 34, Math.cos(a) * 88, Math.sin(a) * 88);
      }
      g.fillStyle(color, 0.18);
      g.fillCircle(0, 0, 42);
      g.strokeCircle(0, 0, 34);
      return;
    }

    // grief
    g.lineBetween(0, -72, 0, 58);
    g.lineBetween(0, -24, -46, -54);
    g.lineBetween(0, -6, 48, -40);
    g.lineBetween(0, 18, -38, 48);
    g.lineBetween(0, 18, 38, 48);
    g.strokeEllipse(0, 18, 58, 84);
  }

  private startPhase2a(): void {
    const satchel = this.store.get().satchel;
    this.band.setObjective("Type the counter-words to unmake his silence.");

    // §5.5.11 — bells-tongue: one-shot massive hit — ends Phase 2a early
    if (this.bellsTongueSuperHitAvailable) {
      this.bellsTongueSuperHitAvailable = false; // consumed
      this.showRelicNotice("finale_relic_bells_tongue");
      this.band.setObjective("Bell's Tongue strikes; brace for the next counter.");
      this.time.delayedCall(1800, () => {
        // Camera flash to signal the super-hit
        this.cameras.main.flash(300, 200, 200, 255, false);
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: 0.5,
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 400,
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => {
            // Skip directly to Phase 2b
            this.startPhase2b();
          },
        });
      });
      return;
    }

    // §5.5.11 — sabotage-wrench: duel is shorter — skip 1 word from the counter-sequence
    const counterWords = satchel.includes("sabotage-wrench")
      ? ["unmake", "unsay"]  // one word skipped; Lord's armor jams
      : ["unmake", "unsay", "unfound"];

    if (satchel.includes("sabotage-wrench")) {
      this.showRelicNotice("finale_relic_sabotage_wrench");
    } else {
      this.narration.say("finale_phase2_unmake");
    }

    this.runSequentialWords(counterWords, 0, () => this.startPhase2b());
  }

  private runSequentialWords(words: string[], idx: number, onDone: () => void): void {
    if (idx >= words.length) {
      onDone();
      return;
    }
    const word = words[idx]!;
    this.band.setObjective(`Counter ${idx + 1}/${words.length}: type ${word}.`);
    const wordPos = this.lordDuelWordPosition(idx, words.length, 500);
    const target = this.makeLordWord({
      scene: this,
      word,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 44,
      onComplete: () => {
        playChime();

        // §5.5.11 — force duel: camera flash + shake on each defeat
        if (this.isForceDuel) {
          this.cameras.main.flash(200, 255, 180, 100, false);
          this.cameras.main.shake(180, 0.006);
        }

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

    const satchel = this.store.get().satchel;

    // §5.5.11 — tether-cord: bind the Lord for one beat — spawn an extra free phrase first
    if (satchel.includes("tether-cord") && !this.tetherCordBindUsed) {
      this.tetherCordBindUsed = true;
      this.showRelicNotice("finale_relic_tether_cord");
      this.band.setObjective("Type bound while the tether-cord holds him.");
      const wordPos = this.lordDuelWordPosition(0, 1, 492);
      const bindTarget = this.makeLordWord({
        scene: this,
        word: "bound",
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 44,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.narration.say("finale_phase2_breaks_free");
          this.time.delayedCall(600, () => this.runPhase2bRounds());
        },
      });
      this.typingInput.register(bindTarget);
      this.activeTargets.push(bindTarget);
      return;
    }

    this.runPhase2bRounds();
  }

  private runPhase2bRounds(): void {
    // §5.5.11 — master-key: unlock a flank route — extra hit window before round 1
    const satchel = this.store.get().satchel;
    if (satchel.includes("master-key") && !this.masterKeyFlankUsed) {
      this.masterKeyFlankUsed = true;
      this.showRelicNotice("finale_relic_master_key");
      this.band.setObjective("Type flank through the Master-Key opening.");
      const flankTarget = this.makeLordWord({
        scene: this,
        word: "flank",
        x: this.scale.width * 0.15,
        y: 500,
        fontSize: 38,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          // Deal bonus damage — Lord flickers
          this.tweens.add({
            targets: this.quietLordContainer,
            alpha: { from: this.quietLordContainer.alpha, to: 0.55 },
            duration: 300,
            yoyo: true,
            onComplete: () => this.startPhase2bMainRounds(),
          });
        },
      });
      this.typingInput.register(flankTarget);
      this.activeTargets.push(flankTarget);
      return;
    }

    this.startPhase2bMainRounds();
  }

  // §5.5.11 — Phase 2 companion payoffs:
  //   glass-fish  — lights a dark corridor when the Lord teleports (extra hit window)
  //   lantern-moth — lights the throne when shadow falls (extra hit window)
  //   wisp-cat   — opens a hidden flank (extra phrase target mid-phase)
  //
  // These are wired into startPhase2bMainRounds as injected hit windows.

  private startPhase2bMainRounds(): void {
    const satchel = this.store.get().satchel;
    const hasGlassFish = satchel.includes("glass-fish");
    const hasLanternMoth = satchel.includes("lantern-moth");
    const hasWispCat = satchel.includes("wisp-cat");
    this.band.setObjective("Clear all three duel words before the Lord steadies.");

    // Round 1: 3 words from BATTLE_WORD_BANK simultaneously
    const round1Words = pickAdaptiveWords(
      BATTLE_WORD_BANK as readonly string[],
      3,
      this.store.get().keyStats,
    );
    this.phase2Round1Words = round1Words;

    let remaining = 3;
    for (let i = 0; i < 3; i++) {
      const word = round1Words[i]!;
      const wordPos = this.lordDuelWordPosition(i, 3, 518);
      const target = this.makeLordWord({
        scene: this,
        word,
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 40,
        onComplete: () => {
          playChime();
          remaining -= 1;
          if (remaining === 0) {
            this.clearActiveTargets();

            // §5.5.9 — glass-fish: Lord teleports — light the dark corridor
            if (hasGlassFish) {
              this.applyGlassFishHitWindow(() => {
                // §5.5.9 — wisp-cat: open a hidden flank mid-phase
                if (hasWispCat) {
                  this.applyWispCatFlank(() => this.onPhase2Round1Done());
                } else {
                  this.onPhase2Round1Done();
                }
              });
            } else if (hasWispCat) {
              this.applyWispCatFlank(() => this.onPhase2Round1Done());
            } else {
              this.onPhase2Round1Done();
            }
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    }

    // §5.5.9 — lantern-moth: lights throne when shadow falls (injected ~halfway through)
    if (hasLanternMoth) {
      this.time.delayedCall(4000, () => this.applyLanternMothHitWindow());
    }
  }

  // §5.5.9 — glass-fish: brief flash + bonus hit window word
  private applyGlassFishHitWindow(onDone: () => void): void {
    this.showRelicNotice("finale_companion_glass_fish", "ally");
    this.band.setObjective("Type light while the glass-fish opens the corridor.");
    const companion = this.showFinaleCompanionAction("glass-fish");
    // Flash the screen briefly (light corridor effect)
    this.cameras.main.flash(400, 160, 220, 255, false);
    this.time.delayedCall(500, () => {
      const wordPos = { x: this.scale.width * 0.64, y: 560 };
      const bonusTarget = this.makeLordWord({
        scene: this,
        word: "light",
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 40,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          // Extra hit on the Lord
          this.tweens.add({
            targets: this.quietLordContainer,
            alpha: { from: this.quietLordContainer.alpha, to: 0.5 },
            duration: 300,
            yoyo: true,
            onComplete: () => {
              playActorAttention(this, companion, { scale: 1.05, durationMs: 220 });
              this.dismissFinaleCompanionAction(companion, this.scale.width * 0.48, 610);
              onDone();
            },
          });
        },
      }, { kind: "bubble", color: 0xa7d2dd, ringRadius: 38 });
      this.typingInput.register(bonusTarget);
      this.activeTargets.push(bonusTarget);
    });
  }

  // §5.5.9 — lantern-moth: lights throne when shadow falls
  private applyLanternMothHitWindow(): void {
    // Only fires if there are still live targets in play (avoid double-clear)
    if (this.activeTargets.length === 0) return;
    this.showRelicNotice("finale_companion_lantern_moth", "ally");
    this.band.setObjective("Type throne before the lantern-moth's light fades.");
    const companion = this.showFinaleCompanionAction("lantern-moth");
    // Warm light overlay
    const throneLight = this.add.graphics().setDepth(3).setAlpha(0);
    throneLight.fillStyle(0xffd080, 0.18);
    throneLight.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: throneLight,
      alpha: 1,
      duration: 400,
      yoyo: true,
      hold: 1200,
      onComplete: () => throneLight.destroy(),
    });

    // Spawn a bonus hit-window word on the side
    const bonusTarget = this.makeLordWord({
      scene: this,
      word: "throne",
      x: this.scale.width * 0.15,
      y: 460,
      fontSize: 36,
      onComplete: () => {
        playChime();
        // Extra hit — Lord flickers
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: { from: this.quietLordContainer.alpha, to: 0.6 },
          duration: 250,
          yoyo: true,
        });
        playActorAttention(this, companion, { scale: 1.05, durationMs: 220 });
        this.dismissFinaleCompanionAction(companion, 330, 510);
        this.typingInput.unregister(bonusTarget);
        const idx = this.activeTargets.indexOf(bonusTarget);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
        bonusTarget.destroy();
      },
    }, { kind: "mote", color: 0xffd080, ringRadius: 36 });
    this.typingInput.register(bonusTarget);
    this.activeTargets.push(bonusTarget);
    this.time.delayedCall(5200, () => {
      if (companion.scene) this.dismissFinaleCompanionAction(companion, 330, 510);
    });
  }

  // §5.5.11 — the Lord's whirlwind attack between rounds. Wren must type
  // "hold" to clear it before the duel continues. If Wind-Phrase + Quiet
  // Chant are both in the satchel, the whirlwind is permanently canceled:
  // a one-time narration acknowledges the cancel on first call, subsequent
  // calls skip silently so the duel just flows past it.
  private runWhirlwindAttack(onDone: () => void): void {
    if (this.whirlwindCanceled) {
      if (!this.whirlwindCancelAnnounced) {
        this.whirlwindCancelAnnounced = true;
        this.showRelicNotice("finale_relic_windphrase_chant");
        this.band.setObjective("Wind-Phrase and Quiet-Chant cancel the whirlwind.");
        const pulse = this.add.graphics().setDepth(3).setAlpha(0);
        pulse.fillStyle(PALETTE_HEX.frost, 0.22);
        pulse.fillRect(0, 0, this.scale.width, this.scale.height);
        this.tweens.add({
          targets: pulse,
          alpha: 1,
          duration: 350,
          yoyo: true,
          hold: 250,
          onComplete: () => {
            pulse.destroy();
            this.time.delayedCall(1100, () => onDone());
          },
        });
        return;
      }
      onDone();
      return;
    }

    this.narration.say("finale_phase2_whirlwind");
    this.band.setObjective("Type hold to brace through the whirlwind.");

    const overlay = this.add.graphics().setDepth(2).setAlpha(0);
    overlay.fillStyle(PALETTE_HEX.dim, 0.28);
    overlay.fillRect(0, 0, this.scale.width, this.scale.height);

    const swirl = this.add.graphics().setDepth(4).setAlpha(0);
    swirl.lineStyle(2, PALETTE_HEX.frost, 0.6);
    for (let r = 30; r <= 110; r += 20) {
      swirl.strokeCircle(0, 0, r);
    }
    swirl.x = this.scale.width / 2;
    swirl.y = 250;

    this.tweens.add({
      targets: [overlay, swirl],
      alpha: 1,
      duration: 350,
    });
    const swirlTween = this.tweens.add({
      targets: swirl,
      rotation: Math.PI * 4,
      duration: 6000,
    });

    this.cameras.main.shake(240, 0.004);

    const wordPos = this.lordDuelWordPosition(1, 2, 480);
    const defenseTarget = this.makeLordWord({
      scene: this,
      word: "hold",
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 48,
      onComplete: () => {
        playChime();
        swirlTween.stop();
        this.clearActiveTargets();
        this.tweens.add({
          targets: [overlay, swirl],
          alpha: 0,
          duration: 350,
          onComplete: () => {
            overlay.destroy();
            swirl.destroy();
            this.time.delayedCall(400, () => onDone());
          },
        });
      },
    }, { kind: "snow", color: PALETTE_HEX.frost, ringRadius: 40 });
    this.typingInput.register(defenseTarget);
    this.activeTargets.push(defenseTarget);
  }

  // §5.5.9 — wisp-cat: extra phrase target spawns mid-phase (flank)
  private applyWispCatFlank(onDone: () => void): void {
    this.showRelicNotice("finale_companion_wisp_cat", "ally");
    this.band.setObjective("Type flank through the wisp-cat opening.");
    const companion = this.showFinaleCompanionAction("wisp-cat");
    const flankTarget = this.makeLordWord({
      scene: this,
      word: "flank",
      x: this.scale.width * 0.85,
      y: 500,
      fontSize: 38,
      onComplete: () => {
        playChime();
        this.clearActiveTargets();
        // Extra hit
        this.tweens.add({
          targets: this.quietLordContainer,
          alpha: { from: this.quietLordContainer.alpha, to: 0.55 },
          duration: 300,
          yoyo: true,
          onComplete: () => {
            playActorAttention(this, companion, { scale: 1.05, durationMs: 220 });
            this.dismissFinaleCompanionAction(companion, this.scale.width * 0.88, 735);
            onDone();
          },
        });
      },
    }, { kind: "mist", color: 0x9fb69a, ringRadius: 36 });
    this.typingInput.register(flankTarget);
    this.activeTargets.push(flankTarget);
  }

  private onPhase2Round1Done(): void {
    this.narration.say("finale_phase2_wavers");
    this.band.setObjective("The Quiet Lord wavers; brace for his answer.");
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

    this.time.delayedCall(1200, () =>
      this.runWhirlwindAttack(() => this.startPhase2bRound2()),
    );
  }

  private startPhase2bRound2(): void {
    // Round 2: 3 more words with no overlap
    this.band.setObjective("Clear the last three duel words.");
    const allWords = (BATTLE_WORD_BANK as readonly string[]).filter(
      (w) => !this.phase2Round1Words.includes(w),
    );
    const round2Words = pickAdaptiveWords(
      allWords,
      3,
      this.store.get().keyStats,
    );

    let remaining = 3;
    for (let i = 0; i < 3; i++) {
      const word = round2Words[i]!;
      const wordPos = this.lordDuelWordPosition(i, 3, 518);
      const target = this.makeLordWord({
        scene: this,
        word,
        x: wordPos.x,
        y: wordPos.y,
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
    this.narration.say("finale_phase3_word_burns");
    this.band.setObjective("His word burns open; prepare for the capital answer.");

    // §5.5.11 — force duel: Lord visually cracks open (camera shake)
    if (this.isForceDuel) {
      this.cameras.main.shake(300, 0.01);
    }

    // §5.5.11 — kindness duel: Lord shrinks rather than cracks
    const targetScale = this.isKindnessDuel ? 0.6 : 1.0;
    const targetAlpha = this.isKindnessDuel ? 0.5 : 0.4;

    this.tweens.add({
      targets: this.quietLordContainer,
      alpha: { from: 0.85, to: targetAlpha },
      scaleX: targetScale,
      scaleY: targetScale,
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

    this.time.delayedCall(1400, () =>
      this.runWhirlwindAttack(() => this.startPhase2Depth()),
    );
  }

  // ─── PHASE 2 — input-depth climax (§5.5.11 fork + goal 4) ───────────────────
  //
  // The duel's last counter is MIXED-CASE case-sensitive (`unMAKE` — lowercase
  // head, Shift for the capital tail), matching the Forge boss's `stand DOWN`
  // peak demand. A FORCE duel chains a SECOND mixed-case counter (past the Forge
  // boss). A KINDNESS duel keeps one, but punishes a slip: the first miss on a
  // word costs a candle (cleaner play demanded). Mixed-case (Shift) is used
  // rather than Alt: holding Alt while typing produces dead-keys/special chars
  // on macOS, which would make a required-Alt beat untypeable there.

  private startPhase2Depth(): void {
    if (this.runOver) return;
    this.band.setObjective("Mind the capitals in the Quiet Lord's word.");
    // Lowercase head so the claim captures no Shift (routes onComplete); the
    // capital tail then requires Shift via case-sensitive matching. Force gets a
    // second, deeper counter.
    const words = this.isForceDuel ? ["unMAKE", "unBIND"] : ["unMAKE"];
    this.runDepthWords(words, 0);
  }

  private runDepthWords(words: string[], idx: number): void {
    if (this.runOver) return;
    if (idx >= words.length) {
      this.onSpellWordComplete();
      return;
    }
    const word = words[idx]!;
    this.kindnessMissCharged = false; // throttle: one candle per beat
    const lead =
      idx === 0
        ? "Answer in his own hand — mind the capitals:"
        : "Again, deeper — his name this time:";
    this.setNarrator(`${lead}  ${word}`, "Quiet Lord");
    this.band.setObjective("Mind the capitals in the Quiet Lord's word.");

    const wordPos = this.lordDuelWordPosition(idx, words.length, 520);
    const target = this.makeLordWord({
      scene: this,
      word,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 52,
      caseSensitive: true,
      onMiss: this.isKindnessDuel ? () => this.chargeKindnessMiss() : undefined,
      onComplete: () => {
        if (this.runOver) return;
        playChime();
        this.clearActiveTargets();
        this.time.delayedCall(idx + 1 < words.length ? 500 : 0, () =>
          this.runDepthWords(words, idx + 1),
        );
      },
    }, {
      kind: "ember",
      color: this.isForceDuel ? UI_HEX.ember : UI_HEX.brass,
      ringRadius: 44,
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // §5.5.11 kindness duel: a slip during a counter beat costs a candle, but at
  // most once per beat (kindnessMissCharged is reset when the beat spawns) so a
  // single fumble doesn't cascade into an instant loss.
  private chargeKindnessMiss(): void {
    if (this.runOver || this.kindnessMissCharged) return;
    this.kindnessMissCharged = true;
    this.narration.say("finale_kindness_slip");
    this.loseCandle();
  }

  private onSpellWordComplete(): void {
    this.band.setObjective("Again is loose; rebuild the final phrase.");
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

    const satchel = this.store.get().satchel;
    const hasAnyCompanion = COMPANION_IDS.some((id) => satchel.includes(id));
    const walkedAlone = satchel.length === 0;

    // §5.5.11 — Walked Alone (no allies, no creature): music drops out completely
    if (walkedAlone || !hasAnyCompanion) {
      // TODO: mute ambient track when audio layer exposes a volume knob
      // For now, stop ambient and let silence + typewriter carry the moment
      this.ambientHandle?.stop();
    }

    // Remove againText from quietLordContainer and place it at world coords
    // The container was at (width/2, 0); againText was at (0, 280) within it
    this.quietLordContainer.remove(this.againText);
    this.againText.setPosition(this.scale.width / 2, 300);
    this.againText.setColor("#d4b8ff");
    this.againText.setDepth(10);
    this.attendSpeaker("Again");
    playSceneEventPulse(this, {
      kind: "mote",
      color: 0xd4b8ff,
      x: this.againText.x,
      y: this.againText.y + 130,
      depth: 3,
      ringWidth: 680,
      ringHeight: 220,
      count: 14,
      alpha: 0.12,
    });

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
    const phrase = selectFinalPhrase(this.store.get().satchel);
    const words = phrase.split(" ");
    this.band.setObjective("Type the final phrase into Again.");
    this.runFinalPhraseWords(words, 0);
  }

  private runFinalPhraseWords(words: string[], idx: number): void {
    if (idx >= words.length) {
      this.time.delayedCall(600, () => this.onFinalPhraseComplete());
      return;
    }
    const word = words[idx]!;
    this.band.setObjective(`Final phrase ${idx + 1}/${words.length}: type ${word}.`);

    const wordPos = this.finalPhraseWordPosition(idx);
    const target = this.makeFinalPhraseWord({
      scene: this,
      word,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 44,
      onComplete: () => {
        // Cancel any pending brass-songbird stall timer for this word
        if (this.brassSongbirdStallTimer) {
          this.brassSongbirdStallTimer.remove();
          this.brassSongbirdStallTimer = null;
        }
        this.brassSongbirdActiveTarget = null;

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
    this.brassSongbirdActiveTarget = target;

    // §5.5.9 — brass-songbird: if Wren stalls >4s on a word, sing the next 3 letters
    const satchel = this.store.get().satchel;
    if (satchel.includes("brass-songbird")) {
      this.brassSongbirdStallTimer = this.time.delayedCall(4000, () => {
        this.brassSongbirdStallTimer = null;
        if (this.brassSongbirdActiveTarget === target) {
          this.applyBrassSongbirdHint(target, word);
        }
      });
    }
  }

  // §5.5.9 — brass-songbird: auto-fill the next 3 characters of the stalled word
  private applyBrassSongbirdHint(_target: TextWordTarget, word: string): void {
    this.showRelicNotice("finale_companion_songbird", "ally");
    const companion = this.showFinaleCompanionAction("brass-songbird");
    playActorAttention(this, companion, { scale: 1.05, durationMs: 220 });
    this.time.delayedCall(1350, () => {
      if (companion.scene) {
        this.dismissFinaleCompanionAction(companion, this.scale.width * 0.56, 485);
      }
    });

    // TextWordTarget doesn't expose a direct "advance N chars" API, so we
    // simulate by injecting up to 3 typed characters via the typingInput.
    // We read how far the player is from the target's typed progress if possible,
    // otherwise fall back to typing the first 3 chars of the full word.
    // TODO: expose a typed-so-far getter on TextWordTarget for a cleaner hint
    const hintChars = word.slice(0, Math.min(3, word.length));
    for (const ch of hintChars) {
      this.typingInput.handleChar(ch, { spell: false });
    }
  }

  private onFinalPhraseComplete(): void {
    this.clearActiveTargets();
    this.band.setObjective("Again is sealed; watch the final mark.");
    // §5.5.10 — the period click-in. The word the realms spelled out letter by
    // letter (A → Ag → … → Again, no period) completes HERE: after a still beat
    // on "Again", the period SNAPS into place — "that's been the word the whole
    // time." A discrete beat before the white-out.
    this.runPeriodSeal(() => this.runWinFlash());
  }

  private runPeriodSeal(onDone: () => void): void {
    // The period, slammed in at the right edge of the centered "Again". Same
    // serif/size/colour so it reads as the word completing, not a new element.
    const rightEdge = this.scale.width / 2 + this.againText.width / 2;
    const period = this.add
      .text(rightEdge, this.againText.y, ".", {
        fontFamily: SERIF,
        fontSize: "72px",
        color: "#d4b8ff",
      })
      .setOrigin(0, 0.5)
      .setDepth(10)
      .setAlpha(0)
      .setScale(3);

    // A still beat on "Again" (no period) so the absence registers — then snap.
    this.time.delayedCall(800, () => {
      playPeriodSnapSting();
      this.cameras.main.shake(120, 0.004);
      this.tweens.add({
        targets: period,
        alpha: 1,
        scale: 1,
        duration: 160,
        ease: "Back.easeOut",
      });
      // A small punch on the whole word as the period seats.
      this.tweens.add({
        targets: this.againText,
        scale: { from: 1, to: 1.06 },
        duration: 160,
        yoyo: true,
        ease: "Sine.easeOut",
      });
      // Hold the realization, then carry on to the white-out.
      this.time.delayedCall(1700, onDone);
    });
  }

  private runWinFlash(): void {
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

    const plateW = 880;
    const plateH = 460;
    const plate = this.add
      .container(this.scale.width / 2, 378)
      .setDepth(1)
      .setAlpha(0);
    const bg = this.add.graphics();
    bg.fillStyle(UI_HEX.panel, 0.72);
    bg.fillRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 10);
    bg.lineStyle(3, UI_HEX.brass, 0.76);
    bg.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 10);
    bg.lineStyle(1, UI_HEX.parchment, 0.18);
    bg.strokeRoundedRect(-plateW / 2 + 12, -plateH / 2 + 12, plateW - 24, plateH - 24, 8);
    bg.lineStyle(1, UI_HEX.brass, 0.32);
    bg.lineBetween(-plateW / 2 + 72, -76, plateW / 2 - 72, -76);
    plate.add(bg);
    plate.add(cornerTicks(this, plateW, plateH, { inset: 12, size: 20, width: 3 }));
    this.tweens.add({
      targets: plate,
      alpha: 1,
      duration: 700,
      ease: "Sine.easeOut",
    });

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
        .setAlpha(0)
        .setDepth(2);

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
      .setAlpha(0)
      .setDepth(2);

    this.tweens.add({
      targets: pressAny,
      alpha: 1,
      duration: 800,
      delay: 3000,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!this.creditsKeyListenerAdded) {
          this.creditsKeyListenerAdded = true;
          this.input.keyboard?.once("keydown", () => this.returnFromCredits());
        }
      },
    });
  }

  private returnFromCredits(): void {
    const cx = this.scale.width / 2;
    const cy = 560;
    playSceneEventPulse(this, {
      kind: "mote",
      color: UI_HEX.brass,
      x: cx,
      y: cy,
      depth: 12,
      durationMs: 620,
      ringWidth: 520,
      ringHeight: 150,
      count: 12,
      alpha: 0.12,
      spreadX: 220,
      spreadY: 56,
    });

    const seal = this.add.graphics().setPosition(cx, cy).setDepth(11).setAlpha(0.7);
    seal.lineStyle(2, UI_HEX.brass, 0.58);
    seal.strokeEllipse(0, 0, 260, 74);
    seal.lineStyle(1, 0x8b6ad8, 0.42);
    seal.strokeEllipse(0, 0, 180, 48);
    seal.fillStyle(UI_HEX.brass, 0.035);
    seal.fillEllipse(0, 0, 260, 74);
    this.tweens.add({
      targets: seal,
      alpha: 0,
      scaleX: 1.32,
      scaleY: 1.18,
      duration: 540,
      ease: "Sine.easeOut",
      onComplete: () => seal.destroy(),
    });

    this.time.delayedCall(160, () => {
      this.cameras.main.fadeOut(560, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", {
            store: this.store,
            arrival: "great-battle",
          });
        },
      );
    });
  }

  // ─── Drawing: Castle Background ─────────────────────────────────────────────

}
