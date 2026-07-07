import Phaser from "phaser";
import { type AmbientHandle, playAmbientSkyIsland } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { playBellToll } from "../audio/bellToll";
import { playSparkZap } from "../audio/sparkZap";
import { flashDamageVignette } from "../game/vfx";
import {
  isOffensiveOneShot,
  type OffensiveOneShot,
} from "../game/oneShotInvocation";
import { OneShotInvoker, type OneShotThreat } from "../game/oneShotInvoker";
import { HeartSoulHud } from "../game/heartSoulHud";
import { showLowHeartFeedback } from "../game/lowHeartFeedback";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { ScrollingPhrase } from "../game/scrollingPhrase";
import { blurAmountAt } from "../game/skyBlur";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import {
  type CombatLoadout,
  ONESHOT_SOUL_COST,
  resolveCombatLoadout,
} from "../game/relicEffects";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import {
  pickAdaptiveWords,
  SKY_ISLAND_PHRASE_BANK,
  SKY_ISLAND_WORD_BANK,
} from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons } from "../game/ui/satchelIcons";
import {
  addAmbientDrift,
  addBackdropDrift,
  addContainerWake,
  attachWordBodyAnchor,
  dismissCompanionCameo,
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playActorAttention,
  playPortalArrivalWake,
  playRealmClearResonance,
  playSceneEventPulse,
  stageContainerEntrance,
  stageAnchoredSprite,
  stageCompanionCameo,
  stageTrueNameSeal,
  dismissTrueNameSeal,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import {
  bobWrenSprite,
  flashWrenMiss,
  makeWrenSprite,
  playWrenAction,
  playWrenFocus,
  playWrenHurt,
  preloadWren,
} from "../game/wren";
import skyIslandBackdrop from "../../art/references/sky-island-clean.png";
import lanternSpiritSprite from "../../art/sky/lantern-spirit.png";
import scholarSpiritSprite from "../../art/sky/scholar-spirit.png";
import ettaSprite from "../../art/sky/etta.png";
import runaPortrait from "../../art/runa/runa-front.png";
import lanternMothSprite from "../../art/companions/lantern-moth.png";

// Danger ramps in over the LAST 60% of a spirit's advance — earlier portion
// stays cream so players can read the word, then it shifts red as the spirit
// closes. Mirrors the Winter Mountain ramp so the typing feel is consistent.
const DANGER_RAMP_START = 0.4;

// Painted-sprite display heights (px). The lantern-spirit used to match the old
// tiny procedural ellipse; it now needs enough stage presence to read as an
// actor in the scene rather than a marker beneath a word.
const LANTERN_SPIRIT_HEIGHT = 124;
const SCHOLAR_SPIRIT_HEIGHT = 160;
const SPIRIT_WORD_ATTACH_DELAY_MS = 140;
const SPIRIT_ARRIVAL_SETTLE_SCALE = 0.026;
// Painted Scholar Etta — a small amber book-spirit child shown during her side
// encounter. Smallish (~280px) and translucent (resting alpha 0.9). Positioning
// is tune-later: left of centre (x≈520) so she's clear of the centred typed
// targets, depth above the backdrop (-100) and below the narration band (y≈150).
const ETTA_SPRITE_HEIGHT = 280;
const ETTA_SPRITE_X = 520;
const ETTA_SPRITE_Y = 760;
const ETTA_SPRITE_DEPTH = 50;
const ETTA_RESTING_ALPHA = 0.9;
const LIGHTER_SPRITE_HEIGHT = 188;
const LIGHTER_SPRITE_X = 1288;
const LIGHTER_SPRITE_Y = 750;
const LIGHTER_SPRITE_DEPTH = 42;
const LIGHTER_RESTING_ALPHA = 0.94;

interface SkyIslandSceneData {
  store: SaveStore;
  revisit?: boolean;
}

interface LanternSpirit {
  container: Phaser.GameObjects.Container;
  /** Painted lantern-spirit body (replaces the old amber body ellipse). */
  lanternSprite: Phaser.GameObjects.Image;
  glowGfx: Phaser.GameObjects.Graphics;
  pulseTween: Phaser.Tweens.Tween | null;
  target: TextWordTarget | null;
  wordAnchor: WordBodyAnchorHandle | null;
  spawnX: number;
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  arrivalTimer: Phaser.Time.TimerEvent | null;
  advanceMs: number;
}

// ─── Act 1 constants ───────────────────────────────────────────────────────────

/** Path exploration words: traversal moments */
const PATH_BEATS = ["balance", "lantern", "stepping"] as const;
const SKY_WREN_STAGE_X = 960;
const SKY_WREN_STAGE_Y = 826;
const SKY_BALANCE_CUE_Y = 776;
const SKY_LANTERN_CUE_Y = 748;
const SKY_STEPPING_CUE_Y = 788;

/** Lantern-Lighter typed conversation */
const LIGHTER_LINE_1 =
  "you came through a portal. i have not seen one open in a long time.";
const WREN_RESPONSE = "i came to help.";
const LIGHTER_LINE_2 =
  "the scholar-spirit guards the summit. it will ask you things. long things. answer carefully.";
const LIGHTER_LINE_3 = "i will light the way if you choose well.";

// ─── Act 2 constants ───────────────────────────────────────────────────────────

/** Temple encounter configs: [spiritCount, minLen, maxLen] */
/** Per-temple scrolling-phrase config: count = banners in this temple,
 *  durationMs = how long each banner takes to cross the screen (lower =
 *  harder), staggerMs = delay between sibling banner spawns. */
const TEMPLE_PHRASE_CONFIGS = [
  { count: 1, durationMs: 14000, staggerMs: 0 },
  { count: 2, durationMs: 12500, staggerMs: 2400 },
  { count: 2, durationMs: 11000, staggerMs: 2000 },
  { count: 3, durationMs: 9500, staggerMs: 1600 },
  { count: 3, durationMs: 8000, staggerMs: 1300 },
] as const;

/** Y positions for stacked banners — keeps multiple in a temple from
 *  overlapping while leaving the narration row (y=150) untouched. */
const PHRASE_BANNER_Y_SLOTS = [320, 430, 540] as const;

/** The middle temple is a stationary "sealed scroll": no scroll timeout, but a
 *  no-miss precision test — any wrong key reseals it (resets to the start) in
 *  every difficulty. A change of pace between the scrolling-banner temples. */
const SEALED_SCROLL_TEMPLE_IDX = 2;
const SEALED_SCROLL_PHRASE = "every book is a window to the sky";

/** Lantern light columns active during temple play. Each x is a vertical
 *  beam that obscures any phrase scrolling through it — the §5.5.4 sensory
 *  mechanic. Phrases between beams are clear; the player picks their window. */
const LANTERN_BLUR_XS = [480, 960, 1440] as const;
const LANTERN_BLUR_RADIUS = 130;

/** Scholar Etta interaction */
const ETTA_LINE = "my last unburned book. help me place it.";
const ETTA_HELP_TRIGGER = "help her";
const ETTA_CHAIN_1 = "lift the book";
const ETTA_CHAIN_2 = "place it gently";

// ─── Act 3 constants ───────────────────────────────────────────────────────────

/** Boss phase riddles */
const RIDDLE_1_DISPLAY = "What opens without a door?";
const RIDDLE_2_DISPLAY = "What travels without moving?";
const RIDDLE_3_DISPLAY = "Name this island, as it truly is.";

/** Boss full-sentence answers — typed in one go, no sequential word steps */
const BOSS_PHASE1_ANSWER = "a portal";
const BOSS_PHASE2_ANSWER = "a written word";
const BOSS_PHASE3_ANSWER = "the sky that held the light";

/** True-name passage */
const TRUE_NAME_PASSAGE =
  "the sky remembers every page that ever lit. nothing burned is truly gone.";

// ─── Spawn positions ───────────────────────────────────────────────────────────


export class SkyIslandScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private band!: ConsoleBand;
  private spirits: LanternSpirit[] = [];
  private activeTargets: TextWordTarget[] = [];
  /** Temple scrolling-phrase banners currently in flight. */
  private activePhrases: ScrollingPhrase[] = [];
  private templePhrasesRemaining = 0;
  /** Lantern light-beam graphics. Drawn on the first temple, destroyed in
   *  scene shutdown — they persist across all five temples. */
  private templeLanterns: Phaser.GameObjects.Graphics[] = [];
  private warmLightCueShown = false;
  private graceSaveNoticed = false;

  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  private lighterSprite: Phaser.GameObjects.Image | null = null;
  private lighterReplyAnchors: WordBodyAnchorHandle[] = [];

  // Fork / companion flags
  private fork1Choice: "help-etta" | "steal-flame" | null = null;
  private fork2Choice: "answer-kindly" | "cut-tether" | null = null;
  private ettaDone = false;      // Etta side encounter completed
  /** Painted Scholar Etta figure, shown only while her encounter is on screen.
   *  Faded in when her encounter begins, faded/destroyed out when it resolves;
   *  also cleaned up on SHUTDOWN as a safety net. */
  private ettaSprite: Phaser.GameObjects.Image | null = null;
  private ettaWordAnchors: WordBodyAnchorHandle[] = [];
  private ettaBookCue: Phaser.GameObjects.Container | null = null;
  private ettaBookWordAnchors: WordBodyAnchorHandle[] = [];
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private beaconFlameCue: Phaser.GameObjects.Container | null = null;
  private kindAnswerCue: Phaser.GameObjects.Container | null = null;
  private tetherThreadCue: Phaser.GameObjects.Container | null = null;
  private companionChoice: "take" | "let-go" | null = null;
  private lanternMothCompanion: Phaser.GameObjects.Container | null = null;
  private lanternMothWordAnchors: WordBodyAnchorHandle[] = [];

  // Boss state
  private bossContainer: Phaser.GameObjects.Container | null = null;
  private bossWordAnchors: WordBodyAnchorHandle[] = [];
  /** Painted Scholar-Spirit boss body — kept so beats can tint-flash it. */
  private bossSprite: Phaser.GameObjects.Image | null = null;
  private bossRingTween: Phaser.Tweens.Tween | null = null;
  private quietLordFiredInPhase2 = false;
  /** True after the realm-level §5.5.10 intrusion has fired this playthrough.
   *  Separate from `quietLordFiredInPhase2`, which gates a boss-phase moment. */
  private quietLordIntruded = false;

  // Temple state — which temple are we on
  private templeIndex = 0;

  // Tier 4 — relics from earlier realms shape this realm's combat. Sky is the
  // showcase for warm-light (the lantern-blur softens) and unseal (the Master
  // Key pardons sealed-scroll reseals via the grace pool). Resolved once in
  // create() (neutral on a revisit, which has no combat); the hooks read it.
  private combat: CombatLoadout = resolveCombatLoadout([], "sky-island");
  // Tier 4 — Soul-charged typed invocation for offensive one-shots. In the Sky
  // that's toll-strike (bells-tongue) + jam-foe (sabotage-wrench, earned in the
  // Forge), both acting on the scrolling banners. Null until create().
  private oneShotInvoker: OneShotInvoker<ScrollingPhrase> | null = null;
  private pathCue: Phaser.GameObjects.Container | null = null;
  private pathCueBeat: (typeof PATH_BEATS)[number] | null = null;
  private pathWordAnchors: WordBodyAnchorHandle[] = [];
  private ambientLanterns: Phaser.GameObjects.Graphics[] = [];
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;

  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("SkyIslandScene");
  }

  init(data: SkyIslandSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.spirits = [];
    this.activeTargets = [];
    this.activePhrases = [];
    this.warmLightCueShown = false;
    this.graceSaveNoticed = false;
    this.oneShotInvoker = null;
    this.pathCue = null;
    this.pathCueBeat = null;
    this.pathWordAnchors = [];
    this.lighterSprite = null;
    this.lighterReplyAnchors = [];
    this.ambientLanterns = [];
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.ettaDone = false;
    this.ettaSprite = null;
    this.ettaWordAnchors = [];
    this.ettaBookCue = null;
    this.ettaBookWordAnchors = [];
    this.forkChoiceWordAnchors = [];
    this.beaconFlameCue = null;
    this.kindAnswerCue = null;
    this.tetherThreadCue = null;
    this.companionChoice = null;
    this.lanternMothCompanion = null;
    this.lanternMothWordAnchors = [];
    this.bossContainer = null;
    this.bossWordAnchors = [];
    this.bossSprite = null;
    this.bossRingTween = null;
    this.quietLordFiredInPhase2 =
      this.store.get().realms["sky-island"]?.quietLordFragmentRevealed ?? false;
    this.quietLordIntruded =
      this.store.get().realms["sky-island"]?.quietLordIntruded ?? false;
    this.templeIndex = 0;
  }

  preload(): void {
    this.load.image("sky-island-backdrop", skyIslandBackdrop);
    this.load.image("sky-lantern-spirit", lanternSpiritSprite);
    this.load.image("scholar-spirit", scholarSpiritSprite);
    this.load.image("etta", ettaSprite);
    this.load.image("sky-companion-lantern-moth", lanternMothSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 26, 16, 8);
    const backdrop = this.add
      .image(0, 0, "sky-island-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 17500, driftX: -2, driftY: -6 });
    addAmbientDrift(this, {
      kind: "mote",
      count: 38,
      depth: -2,
      area: { x: 80, y: 100, width: this.scale.width - 160, height: 700 },
      alpha: 0.24,
      minSize: 1.5,
      maxSize: 4.5,
      driftX: 90,
      driftY: -170,
      minDurationMs: 6200,
      maxDurationMs: 13000,
    });
    addLivingLight(this, {
      x: 960,
      y: 322,
      width: 480,
      height: 190,
      color: 0xf2cc65,
      alpha: 0.055,
      depth: -5,
      durationMs: 3100,
    });
    addLivingLight(this, {
      x: 1450,
      y: 435,
      width: 420,
      height: 190,
      color: 0xe9b44e,
      alpha: 0.045,
      depth: -5,
      durationMs: 3500,
      delayMs: 850,
    });
    addLivingLight(this, {
      x: 960,
      y: 650,
      width: 780,
      height: 300,
      color: 0x9ad8ff,
      alpha: 0.035,
      depth: -6,
      durationMs: 4300,
      delayMs: 500,
      scale: 1.035,
    });
    addAmbientDrift(this, {
      kind: "mote",
      count: 14,
      depth: -1.45,
      area: { x: 80, y: 300, width: this.scale.width - 160, height: 470 },
      alpha: 0.16,
      minSize: 4,
      maxSize: 9,
      driftX: 120,
      driftY: -210,
      minDurationMs: 5200,
      maxDurationMs: 10800,
    });
    addAmbientDrift(this, {
      kind: "mote",
      count: 12,
      depth: -0.35,
      area: {
        x: this.scale.width / 2 - 340,
        y: SKY_WREN_STAGE_Y - 190,
        width: 680,
        height: 220,
      },
      color: 0xf2cc65,
      alpha: 0.16,
      minSize: 2.5,
      maxSize: 7,
      driftX: 120,
      driftY: -120,
      minDurationMs: 3800,
      maxDurationMs: 8600,
    });
    this.drawTempleStones();
    this.drawAmbientLanterns();
    this.wrenContainer = this.drawWren(this.scale.width / 2, SKY_WREN_STAGE_Y);
    playSceneEventPulse(this, {
      kind: "mote",
      color: 0xf2cc65,
      x: this.wrenContainer.x,
      y: this.wrenContainer.y - 90,
      depth: -0.25,
      durationMs: 720,
      ringWidth: 270,
      ringHeight: 92,
      count: 8,
      alpha: 0.1,
      spreadX: 126,
      spreadY: 38,
    });

    // Tier 4 — a revisit is a free-passage replay (no combat) → neutral loadout.
    // Resolved before the band so the passive relic icons can populate it.
    this.combat = resolveCombatLoadout(
      this.revisit ? [] : this.store.get().satchel,
      "sky-island",
    );

    // UI cohesion — the console band: the crafted bottom zone (TTT two-zone
    // composition) that houses the meters + satchel. Passive relics show as icon
    // tiles ("always on"); the offensive one-shots drop in as charge cards. This
    // replaces the floating top-right HUD and the centered one-shot stack.
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
      maxOneShots: this.combat.oneShots.filter(isOffensiveOneShot).length,
    });
    const band = this.band;

    this.narration = new NarrationManager(this, {
      y: 150,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    const offensiveOneShots = this.combat.oneShots.filter(isOffensiveOneShot);
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      showSoul: offensiveOneShots.length > 0,
      onSustainedLowHeart: () =>
        showLowHeartFeedback({
          scene: this,
          band: this.band,
          body: this.wrenContainer,
          kind: "mote",
          color: PALETTE_HEX.brass,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Tier 4 — offensive one-shots act on the scrolling banners. The charge cards
    // dock into the console band's one-shot slots; they only respond while a
    // scrolling temple has live banners (the sealed-scroll temple and the
    // between-temple lulls clear activePhrases, so the invoker is inert there).
    this.oneShotInvoker = new OneShotInvoker<ScrollingPhrase>({
      scene: this,
      typingInput: this.typingInput,
      available: offensiveOneShots,
      cost: ONESHOT_SOUL_COST,
      getSoul: () => this.typingInput.getStats().getSoul(),
      spendSoul: (cost) => this.typingInput.getStats().spendSoul(cost),
      getThreats: () => this.liveBannerThreats(),
      applyEffect: (effect, targets) => this.applyOneShot(effect, targets),
      isActive: () => this.activePhrases.some((p) => p.isReady() && !p.isFrozen()),
      announce: (text) => this.band.showNotice(text, { label: "one-shot" }),
      slots: band.oneShotSlots,
      compact: true,
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.oneShotInvoker?.destroy();
      this.oneShotInvoker = null;
      this.bossRingTween?.stop();
      if (this.wrenContainer?.scene) this.tweens.killTweensOf(this.wrenContainer);
      this.pathCue = null;
      this.pathCueBeat = null;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
      this.clearAmbientLanterns();
      this.templeLanterns.forEach((g) => g.destroy());
      this.templeLanterns = [];
      this.clearSkyForkCues();
      this.dismissRevisitMemoryCue(false);
      this.clearLighterReplyAnchors();
      this.lighterSprite?.destroy();
      this.lighterSprite = null;
      this.clearEttaWordAnchors();
      this.clearEttaBookCue();
      this.ettaSprite?.destroy();
      this.ettaSprite = null;
    });

    this.ambientHandle = playAmbientSkyIsland();

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
    const choices = this.store.get().realms["sky-island"]?.choices ?? {};
    let narratorLine: string;
    let words: string[];

    if (choices["fork2"] === "cut-tether") {
      narratorLine = "The island is higher now. You can barely see the lanterns from here.";
      words = ["the", "sky", "is", "wide", "and", "open"];
    } else if (choices["fork2"] === "answer-kindly") {
      narratorLine = "The wind still circles where the island was. It hasn't found a new question.";
      words = ["the", "lanterns", "hold", "the", "dark"];
    } else {
      narratorLine = "The lanterns are still burning. Someone is keeping them.";
      words = ["golden", "and", "still", "and", "far"];
    }

    this.setNarrator(narratorLine);
    this.band.setObjective("Type the sky memory to return to the Almanac.");
    this.time.delayedCall(2400, () => this.deliverRevisitPassage(words));
  }

  private deliverRevisitPassage(words: string[]): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= words.length) {
        this.time.delayedCall(800, () => {
          this.cameras.main.fadeOut(700, 26, 16, 8);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => this.scene.start("PortalChamberScene", {
              store: this.store,
              arrival: "sky-island",
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
          playWrenAction(this.wrenSprite);
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
    const cue = this.add.container(pos.x, pos.y).setDepth(42).setAlpha(0);
    this.revisitMemoryCue = cue;

    cue.add(addLocalGroundShadow(this, 116, 18, { y: 14, alpha: 0.14 }));

    const lantern = this.add.graphics();
    lantern.fillStyle(PALETTE_HEX.brass, 0.1);
    lantern.fillEllipse(0, -7, 112, 52);
    lantern.lineStyle(2, PALETTE_HEX.brass, 0.38);
    lantern.strokeEllipse(0, -7, 94, 38);
    lantern.lineStyle(1.5, 0xf3ead2, 0.38);
    lantern.lineBetween(-18, -18, -10, 14);
    lantern.lineBetween(18, -18, 10, 14);
    lantern.lineBetween(-10, 14, 10, 14);
    lantern.fillStyle(0xffd878, 0.54);
    lantern.fillCircle(0, -1, 6);
    lantern.fillStyle(0xf3ead2, 0.28);
    lantern.fillCircle(-36, 1, 2.8);
    lantern.fillCircle(36, 1, 2.8);
    cue.add(lantern);

    this.tweens.add({
      targets: cue,
      alpha: 0.84,
      y: pos.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -2, durationMs: 2700 }),
    });
  }

  private revisitMemoryCuePosition(idx: number, total: number): { x: number; y: number } {
    const spacing = total <= 4 ? 190 : 160;
    const startX = this.scale.width / 2 - ((total - 1) * spacing) / 2;
    return {
      x: startX + idx * spacing,
      y: idx % 2 === 0 ? 760 : 720,
    };
  }

  private revisitMemoryWordPosition(idx: number, total: number): { x: number; y: number } {
    const cue = this.revisitMemoryCuePosition(idx, total);
    return { x: cue.x, y: cue.y - 110 };
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
        color: PALETTE_HEX.brass,
        alpha: 0.12,
        depth: 44,
        sourceOffsetY: -20,
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
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: -20,
      depth: 48,
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
  // ACT 1 — Arrival on the Island
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct1(): void {
    this.narration.say("sky_intro_arrival");
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "mote",
      color: 0xf5c842,
    });
    this.setAmbientLanternFieldAlpha(0.12, 520);
    this.showPathCue("balance");
    this.time.delayedCall(780, () => this.stageWrenAtPathEntrance());
    this.time.delayedCall(1500, () => this.runPathBeats(0));
  }

  /** Three exploration beats: balance / lantern / stepping */
  private runPathBeats(idx: number): void {
    if (idx >= PATH_BEATS.length) {
      this.dismissPathCue();
      this.resetWrenToSkyStage();
      this.setAmbientLanternFieldAlpha(0.42, 760);
      this.time.delayedCall(780, () => this.startLanternLighter());
      return;
    }
    const beat = PATH_BEATS[idx];
    const narrations: readonly string[] = [
      "A narrow stone bridge arches between two floating rocks. Keep your balance.",
      "A paper lantern hangs right across the path, still lit. Lift it aside gently.",
      "Stepping stones. The gaps are wide, the island hums below your feet.",
    ];
    if (idx === 0) {
      this.band.setObjective("Type each path word to cross the floating stones.");
    }
    this.showPathCue(beat);
    this.setNarrator(narrations[idx] ?? "");
    const wordPos = this.pathWordPosition(beat);
    const target = this.makePathWord({
      scene: this,
      word: beat,
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 44,
      onClaim: () => {
        const destination = this.pathWrenPosition(beat);
        playWrenFocus(this.wrenSprite, {
          faceLeft: destination.x < this.wrenContainer.x,
        });
        this.walkWrenToPathBeat(beat);
        this.pulsePathCue(false);
      },
      onComplete: () => {
        playWrenAction(this.wrenSprite);
        this.pulsePathCue(true);
        playChime();
        this.time.delayedCall(600, () => this.runPathBeats(idx + 1));
      },
    });
    this.registerActiveTarget(target);
  }

  private showPathCue(beat: (typeof PATH_BEATS)[number]): void {
    if (this.pathCue?.scene && this.pathCueBeat === beat) return;
    this.dismissPathCue(false);
    const cue =
      beat === "balance"
        ? this.drawBalanceBridgeCue()
        : beat === "lantern"
          ? this.drawPathLanternCue()
          : this.drawSteppingStonesCue();
    this.pathCue = cue;
    this.pathCueBeat = beat;
    this.tweens.add({
      targets: cue,
      alpha: beat === "balance" ? 0.97 : 0.88,
      y: cue.y - 8,
      duration: 380,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -3, durationMs: 2700 }),
    });
  }

  private pathWordPosition(beat: (typeof PATH_BEATS)[number]): { x: number; y: number } {
    const cue = this.pathCue;
    if (!cue?.scene) return { x: this.scale.width / 2, y: this.scale.height / 2 };

    switch (beat) {
      case "balance":
        return { x: cue.x - 238, y: cue.y - 118 };
      case "lantern":
        return { x: cue.x + 100, y: cue.y - 108 };
      case "stepping":
        return { x: cue.x + 206, y: cue.y - 100 };
    }
  }

  private pathWrenPosition(beat: (typeof PATH_BEATS)[number]): { x: number; y: number } {
    const cue = this.pathCue;
    if (!cue?.scene) return { x: SKY_WREN_STAGE_X, y: SKY_WREN_STAGE_Y };

    switch (beat) {
      case "balance":
        return { x: cue.x - 112, y: cue.y + 56 };
      case "lantern":
        return { x: cue.x + 18, y: cue.y + 86 };
      case "stepping":
        return { x: cue.x + 138, y: cue.y + 34 };
    }
  }

  private stageWrenAtPathEntrance(): void {
    const cue = this.pathCue;
    if (!cue?.scene) return;
    this.moveWrenTo(cue.x - 36, cue.y + 60, {
      durationMs: 840,
      quiet: true,
    });
  }

  private walkWrenToPathBeat(beat: (typeof PATH_BEATS)[number]): void {
    const destination = this.pathWrenPosition(beat);
    this.moveWrenTo(destination.x, destination.y, {
      durationMs: beat === "lantern" ? 620 : 560,
      ringWidth: beat === "lantern" ? 170 : 220,
    });
  }

  private resetWrenToSkyStage(): void {
    this.moveWrenTo(SKY_WREN_STAGE_X, SKY_WREN_STAGE_Y, {
      durationMs: 580,
      ringWidth: 210,
      quiet: true,
    });
  }

  private moveWrenTo(
    x: number,
    y: number,
    opts: { durationMs?: number; ringWidth?: number; quiet?: boolean } = {},
  ): void {
    if (!this.wrenContainer?.scene) return;
    this.tweens.killTweensOf(this.wrenContainer);
    this.tweens.add({
      targets: this.wrenContainer,
      x,
      y,
      duration: opts.durationMs ?? 560,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!this.wrenContainer?.scene) return;
        addIdleBreath(this, this.wrenContainer, { dy: -5, durationMs: 2200 });
      },
    });
    if (opts.quiet) return;
    playSceneEventPulse(this, {
      kind: "mote",
      color: 0xf2cc65,
      x,
      y: y - 16,
      depth: -0.2,
      durationMs: 520,
      ringWidth: opts.ringWidth ?? 210,
      ringHeight: 54,
      count: 6,
      alpha: 0.1,
      spreadX: 76,
      spreadY: 18,
    });
  }

  private drawBalanceBridgeCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 - 92, SKY_BALANCE_CUE_Y).setDepth(-1).setAlpha(0);
    c.add(addLocalGroundShadow(this, 426, 32, { y: 35, alpha: 0.18 }));
    const drawStone = (
      g: Phaser.GameObjects.Graphics,
      points: Array<{ x: number; y: number }>,
      fill: number,
      fillAlpha: number,
      strokeAlpha: number,
      lineWidth = 2,
      stroke = 0xd6c386,
    ): void => {
      if (points.length === 0) return;
      const first = points[0];
      if (first === undefined) return;
      g.fillStyle(fill, fillAlpha);
      g.lineStyle(lineWidth, stroke, strokeAlpha);
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i];
        if (point !== undefined) g.lineTo(point.x, point.y);
      }
      g.closePath();
      g.fillPath();
      g.strokePath();
    };

    const air = this.add.graphics();
    air.lineStyle(2, 0xf3ead2, 0.035);
    air.lineBetween(-270, 42, -178, 30);
    air.lineBetween(-178, 30, -92, 50);
    air.lineBetween(-92, 50, 18, 22);
    air.lineBetween(18, 22, 96, 6);
    air.lineBetween(96, 6, 186, 20);
    air.lineStyle(1.5, PALETTE_HEX.brass, 0.035);
    air.lineBetween(-250, 40, -194, 33);
    air.lineBetween(-156, 38, -108, 47);
    air.lineBetween(92, 10, 146, 18);
    c.add(air);

    const rocks = this.add.graphics().setAngle(-3);
    rocks.fillStyle(0x252a2b, 0.92);
    rocks.fillEllipse(-252, 32, 104, 38);
    rocks.fillStyle(0x3d423e, 0.92);
    rocks.fillEllipse(-156, 18, 122, 46);
    rocks.fillEllipse(156, 22, 130, 50);
    rocks.fillStyle(0x6d7159, 0.34);
    rocks.fillEllipse(-252, 22, 56, 14);
    rocks.fillEllipse(-158, 6, 66, 16);
    rocks.fillEllipse(158, 9, 72, 18);
    rocks.lineStyle(2, 0x181613, 0.34);
    rocks.strokeEllipse(-252, 32, 82, 26);
    rocks.strokeEllipse(-156, 18, 100, 30);
    rocks.strokeEllipse(156, 22, 104, 32);
    rocks.lineStyle(1.5, 0xc7b886, 0.14);
    rocks.lineBetween(-194, 6, -154, 14);
    rocks.lineBetween(126, 14, 176, 8);
    c.add(rocks);

    const landing = this.add.graphics().setAngle(-4);
    landing.fillStyle(0x151611, 0.62);
    landing.fillEllipse(-244, -44, 146, 34);
    drawStone(
      landing,
      [
        { x: -314, y: -67 },
        { x: -279, y: -84 },
        { x: -223, y: -86 },
        { x: -177, y: -74 },
        { x: -191, y: -52 },
        { x: -258, y: -44 },
        { x: -310, y: -52 },
      ],
      0x4b4e42,
      1,
      0.28,
      3,
      0x222018,
    );
    landing.fillStyle(0x7b805f, 0.2);
    landing.fillEllipse(-260, -72, 52, 12);
    landing.lineStyle(1.5, 0x1e211d, 0.42);
    landing.lineBetween(-290, -63, -246, -70);
    landing.lineBetween(-230, -79, -204, -66);
    landing.lineBetween(-276, -55, -236, -58);
    landing.lineBetween(-246, -82, -214, -75);
    landing.lineStyle(4, 0x2b2318, 0.84);
    landing.lineBetween(-306, -72, -184, -70);
    landing.lineStyle(2, PALETTE_HEX.brass, 0.2);
    landing.lineBetween(-300, -80, -190, -78);
    landing.lineStyle(5, 0x2b2318, 0.9);
    landing.lineBetween(-308, -82, -300, -38);
    landing.lineBetween(-184, -80, -190, -38);
    landing.fillStyle(PALETTE_HEX.brass, 0.36);
    landing.fillCircle(-304, -82, 3.5);
    landing.fillCircle(-186, -80, 3.5);
    c.add(landing);

    const entrance = this.add.graphics().setAngle(-5);
    entrance.lineStyle(7, 0x221a13, 0.9);
    entrance.lineBetween(-280, 10, -140, -4);
    entrance.lineStyle(2, PALETTE_HEX.brass, 0.09);
    entrance.lineBetween(-282, -18, -142, -28);
    entrance.lineBetween(-282, 18, -142, 6);
    entrance.lineStyle(4, 0x2b2318, 0.88);
    entrance.lineBetween(-282, -20, -282, 24);
    entrance.lineBetween(-142, -30, -142, 12);
    [
      [
        { x: -266, y: -6 },
        { x: -228, y: -13 },
        { x: -217, y: 8 },
        { x: -254, y: 15 },
      ],
      [
        { x: -213, y: -13 },
        { x: -169, y: -18 },
        { x: -158, y: 3 },
        { x: -202, y: 9 },
      ],
    ].forEach((points, i) =>
      drawStone(entrance, points, i === 0 ? 0x514d3f : 0x5d5644, 1, 0.18, 1.5, 0x201b15),
    );
    entrance.lineStyle(1.4, 0x1b1712, 0.34);
    entrance.lineBetween(-250, -1, -230, 4);
    entrance.lineBetween(-198, -10, -178, -5);
    c.add(entrance);

    const bridge = this.add.graphics().setAngle(-3);
    [
      { x: -122, y: 58, w: 92, h: 22 },
      { x: -38, y: 54, w: 98, h: 23 },
      { x: 48, y: 50, w: 96, h: 22 },
      { x: 136, y: 47, w: 96, h: 22 },
    ].forEach((shadow) => {
      bridge.fillStyle(0x17120f, 0.6);
      bridge.fillEllipse(shadow.x, shadow.y, shadow.w, shadow.h);
    });
    bridge.lineStyle(3, 0x211b15, 0.58);
    bridge.lineBetween(-176, 35, 184, 12);
    bridge.lineBetween(-168, 71, 188, 48);
    bridge.lineStyle(1.5, PALETTE_HEX.brass, 0.08);
    bridge.lineBetween(-176, 29, 184, 6);
    const bridgeSlabs = [
      [
        { x: -166, y: 40 },
        { x: -145, y: 23 },
        { x: -106, y: 17 },
        { x: -78, y: 30 },
        { x: -86, y: 56 },
        { x: -129, y: 68 },
        { x: -162, y: 58 },
      ],
      [
        { x: -90, y: 44 },
        { x: -64, y: 24 },
        { x: -25, y: 16 },
        { x: 8, y: 29 },
        { x: 2, y: 55 },
        { x: -45, y: 67 },
        { x: -84, y: 60 },
      ],
      [
        { x: -4, y: 40 },
        { x: 24, y: 20 },
        { x: 68, y: 18 },
        { x: 98, y: 31 },
        { x: 90, y: 55 },
        { x: 43, y: 64 },
        { x: 4, y: 58 },
      ],
      [
        { x: 90, y: 39 },
        { x: 118, y: 20 },
        { x: 163, y: 20 },
        { x: 196, y: 33 },
        { x: 181, y: 58 },
        { x: 132, y: 65 },
        { x: 98, y: 56 },
      ],
    ];
    bridgeSlabs.forEach((points, i) => {
      drawStone(
        bridge,
        points,
        i % 2 === 0 ? 0x45473c : 0x514f41,
        1,
        0.36,
        2.5,
        0x201d18,
      );
      const midX = (points[1]!.x + points[3]!.x) / 2;
      bridge.lineStyle(1.4, 0x191611, 0.42);
      bridge.lineBetween(midX - 16, points[1]!.y + 17, midX + 13, points[4]!.y - 9);
      bridge.fillStyle(0xf3ead2, 0.055);
      bridge.fillEllipse(midX - 9, points[1]!.y + 8, 32, 7);
    });
    bridge.fillStyle(0x7d8061, 0.18);
    bridge.fillEllipse(-136, 52, 28, 7);
    bridge.fillEllipse(46, 55, 24, 6);
    bridge.fillEllipse(142, 43, 26, 7);
    c.add(bridge);
    return c;
  }

  private drawPathLanternCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 + 22, SKY_LANTERN_CUE_Y).setDepth(-1).setAlpha(0);
    const cord = this.add.graphics();
    cord.lineStyle(1.4, 0x8a7060, 0.5);
    cord.lineBetween(-72, -92, 0, -55);
    cord.lineBetween(72, -92, 0, -55);
    cord.lineBetween(0, -118, 0, -55);
    cord.lineStyle(2, 0xc9a14a, 0.3);
    cord.lineBetween(-42, -55, 42, -55);
    cord.lineStyle(1, 0xf7d882, 0.2);
    cord.lineBetween(-31, -51, 31, -51);
    c.add(cord);

    const glow = this.add.graphics();
    glow.fillStyle(0xf5c842, 0.12);
    glow.fillEllipse(0, -5, 174, 142);
    glow.fillStyle(0xf5c842, 0.08);
    glow.fillEllipse(0, -4, 116, 118);
    glow.lineStyle(2, 0xf5c842, 0.13);
    glow.strokeEllipse(0, -4, 112, 104);
    c.add(glow);

    const paper = this.add.graphics();
    paper.fillStyle(0x30251a, 0.28);
    paper.fillEllipse(5, -8, 80, 100);
    paper.fillStyle(0xd99c36, 0.36);
    paper.fillEllipse(0, -12, 76, 96);
    paper.fillStyle(0xf5d889, 0.24);
    paper.fillEllipse(0, -12, 54, 82);
    paper.lineStyle(2.4, 0xfdedb0, 0.68);
    paper.strokeEllipse(0, -12, 76, 96);
    paper.lineStyle(1.5, 0xfdedb0, 0.34);
    paper.strokeEllipse(0, -36, 58, 18);
    paper.strokeEllipse(0, -15, 70, 22);
    paper.strokeEllipse(0, 8, 62, 18);
    paper.lineStyle(1.2, 0x8a5d25, 0.5);
    paper.lineBetween(-26, -42, -20, 22);
    paper.lineBetween(-12, -48, -9, 31);
    paper.lineBetween(12, -48, 9, 31);
    paper.lineBetween(26, -42, 20, 22);
    paper.fillStyle(0xb47a2b, 0.82);
    paper.fillRoundedRect(-21, -61, 42, 9, 5);
    paper.fillRoundedRect(-22, 34, 44, 8, 5);
    paper.lineStyle(1.3, 0xfdedb0, 0.36);
    paper.strokeRoundedRect(-21, -61, 42, 9, 5);
    paper.strokeRoundedRect(-22, 34, 44, 8, 5);
    paper.fillStyle(0xffdf83, 0.78);
    paper.fillEllipse(0, -6, 18, 32);
    paper.lineStyle(1, 0xc07a2d, 0.54);
    paper.lineBetween(0, 42, 0, 67);
    paper.fillStyle(0xf3c563, 0.72);
    paper.fillCircle(0, 55, 3.5);
    paper.fillEllipse(0, 68, 12, 7);
    c.add(paper);

    this.tweens.add({
      targets: [glow, paper],
      scaleX: 1.045,
      scaleY: 1.07,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private drawSteppingStonesCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 + 36, SKY_STEPPING_CUE_Y).setDepth(-1).setAlpha(0);
    c.add(addLocalGroundShadow(this, 390, 30, { x: 34, y: 24, alpha: 0.13 }));
    const stones = this.add.graphics();
    const stoneSpecs = [
      { x: -112, y: 22, w: 82, h: 32, tint: 0x565d50 },
      { x: -36, y: -4, w: 94, h: 36, tint: 0x626b5a },
      { x: 58, y: 12, w: 82, h: 32, tint: 0x596453 },
      { x: 132, y: -14, w: 92, h: 36, tint: 0x69745e },
      { x: 206, y: 4, w: 106, h: 40, tint: 0x737a65 },
    ];
    stoneSpecs.forEach((stone, i) => {
      stones.fillStyle(stone.tint, i === stoneSpecs.length - 1 ? 0.86 : 0.76);
      stones.fillEllipse(stone.x, stone.y, stone.w, stone.h);
      stones.lineStyle(
        i === stoneSpecs.length - 1 ? 3 : 2,
        0xd6c386,
        i === stoneSpecs.length - 1 ? 0.28 : 0.18,
      );
      stones.strokeEllipse(stone.x, stone.y, stone.w * 0.9, stone.h * 0.78);
      stones.fillStyle(0xf3ead2, 0.08);
      stones.fillEllipse(stone.x - 12, stone.y - 5, stone.w * 0.28, stone.h * 0.22);
    });
    stones.lineStyle(2, 0xd6c386, 0.16);
    stones.beginPath();
    stones.moveTo(-76, 13);
    stones.lineTo(-48, 0);
    stones.lineTo(18, 7);
    stones.lineTo(86, -4);
    stones.lineTo(162, 0);
    stones.strokePath();
    stones.fillStyle(0xf5c842, 0.08);
    stones.fillEllipse(206, 4, 146, 70);
    c.add(stones);
    return c;
  }

  private pulsePathCue(completion: boolean): void {
    if (!this.pathCue?.scene) return;
    const sourceOffset = this.pathCueSourceOffset();
    playActorAttention(this, this.pathCue, {
      scale: completion ? 1.035 : 1.018,
      durationMs: completion ? 260 : 180,
    });
    playBodyImpact(this, this.pathCue, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetX: sourceOffset.x,
      offsetY: sourceOffset.y,
      depth: 12,
      ringRadius: completion ? 44 : 28,
      count: completion ? 9 : 5,
      durationMs: completion ? 460 : 260,
    });
  }

  private dismissPathCue(animate = true): void {
    const cue = this.pathCue;
    this.clearPathWordAnchors();
    if (!cue?.scene) {
      this.pathCue = null;
      this.pathCueBeat = null;
      return;
    }
    this.pathCue = null;
    this.pathCueBeat = null;
    this.tweens.killTweensOf(cue);
    if (!animate) {
      cue.destroy();
      return;
    }
    this.tweens.add({
      targets: cue,
      alpha: 0,
      y: cue.y - 20,
      duration: 260,
      ease: "Sine.easeIn",
      onComplete: () => cue.destroy(),
    });
  }

  // ─── Lantern-Lighter NPC ──────────────────────────────────────────────────

  private startLanternLighter(): void {
    this.band.setObjective("Answer the Lantern-Lighter before the spirits wake.");
    this.showLanternLighter();
    this.narration.say("sky_lantern_lighter_intro");
    this.time.delayedCall(2000, () => {
      this.setNarrator(LIGHTER_LINE_1, "Lantern-Lighter");
      this.time.delayedCall(600, () => {
        const replyPos = this.lighterReplyWordPosition();
        const t = this.makeLighterReplyWord({
          scene: this,
          word: WREN_RESPONSE,
          x: replyPos.x,
          y: replyPos.y,
          fontSize: 36,
          onClaim: () => playWrenFocus(this.wrenSprite),
          onComplete: () => {
            playWrenAction(this.wrenSprite);
            playChime();
            this.clearActiveTargets();
            this.setNarrator(LIGHTER_LINE_2, "Lantern-Lighter");
            this.time.delayedCall(3200, () => {
              this.setNarrator(LIGHTER_LINE_3, "Lantern-Lighter");
              this.time.delayedCall(2800, () => this.onLighterConvoComplete());
            });
          },
        });
        this.registerActiveTarget(t);
      });
    });
  }

  private onLighterConvoComplete(): void {
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-lantern-lighters-vigil")) {
        s.almanacLore.push("the-lantern-lighters-vigil");
      }
    });
    this.setNarrator("The Lantern-Lighter's Vigil — a page appears in the Almanac.");
    this.time.delayedCall(1600, () => this.hideLanternLighter());
    this.time.delayedCall(2000, () => this.startFirstSpiritEncounterFixed());
  }

  // ─── First lantern-spirit encounter ──────────────────────────────────────

  private startFirstSpiritEncounter(): void {
    // Tier 4 — announce the relic loadout once before the realm's first combat,
    // then begin. Empty loadout (incl. revisits) passes straight through.
    this.announceCombatLoadout(() => this.beginFirstSpiritEncounter());
  }

  private beginFirstSpiritEncounter(): void {
    // Wave-start bookend — same audio + shake pattern as the temple waves so
    // the first spirit encounter lands with the same weight.
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseSkyWave({ y: 710, ringWidth: 980, ringHeight: 160 });

    this.setNarrator("Two lantern-spirits drift from the tower path, pale and unhurried.");
    this.band.setObjective("Clear the lantern-spirits before they reach Wren.");
    const words = pickAdaptiveWords(
      filterWordsByLength(SKY_ISLAND_WORD_BANK, 6, 8),
      2,
      this.store.get().keyStats,
    );
    const positions = [
      { x: 620, y: 780 },
      { x: 1300, y: 780 },
    ];
    this.spirits = [];
    positions.forEach((pos, i) => {
      this.spawnSpirit(
        pos.x < this.scale.width / 2 ? -120 : this.scale.width + 120,
        pos.x,
        pos.y,
        words[i] ?? "lantern",
        i * 300,
        20000,
      );
    });
  }

  private onFirstEncounterCleared(): void {
    this.setNarrator("Each lantern blooms as the spirit fades — the glow blooms wide and then rests.");
    this.time.delayedCall(2000, () => this.startAct2());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 2 — Through the Temple
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct2(): void {
    this.templeIndex = 0;
    this.startTemple(0);
  }

  private startTemple(idx: number): void {
    this.templeIndex = idx;
    const cfg = TEMPLE_PHRASE_CONFIGS[idx];
    if (!cfg) return;

    // Wave-start bookend — audio sting + screen shake so each temple feels
    // like an event, not just "more text appears."
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseSkyWave();

    if (this.templeLanterns.length === 0) {
      this.drawTempleLanterns();
    }
    this.maybePlayWarmLightCue();

    // The middle temple is the sealed-scroll no-miss test — a different stake.
    if (idx === SEALED_SCROLL_TEMPLE_IDX) {
      this.startSealedScrollTemple();
      return;
    }

    // §5.5.10 — a lantern's inscription flickers between two readings, one
    // beautiful, one his. Fires on the second temple so the player has just
    // settled into the scrolling-phrase rhythm before the disruption.
    if (!this.quietLordIntruded && idx === 1) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["sky-island"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(1800, () => {
        const anchor = this.quietLordIntrusionAnchor();
        playQuietLordIntrusion(this, {
          x: anchor.x,
          y: anchor.y,
          text: "every page goes blank.",
        });
      });
    }

    const templeNames = [
      "The first gate. The lantern-beams eat the words you haven't typed yet — read ahead, and type before the light reaches them.",
      "The second gate. Two scrolls now, on different winds. Read both; save what you can.",
      "The third chamber. Two scrolls at once now.", // unused — idx 2 is the sealed scroll
      "The fourth chamber. Three scrolls, and the beams are hungry. Triage.",
      "The fifth and final chamber. They fly, three at once. Type before they leave you.",
    ];
    this.setNarrator(templeNames[idx] ?? "");
    this.band.setObjective(
      cfg.count === 1
        ? "Finish the moving scroll before it leaves the path."
        : `Triage ${cfg.count} moving scrolls before they leave the path.`,
    );

    // Pick `cfg.count` distinct phrases from the long-phrase bank.
    const phrases = shuffleArr(
      SKY_ISLAND_PHRASE_BANK as readonly string[],
    ).slice(0, cfg.count);

    this.activePhrases = [];
    this.templePhrasesRemaining = phrases.length;

    phrases.forEach((phrase, i) => {
      const phraseObj = new ScrollingPhrase({
        scene: this,
        typingInput: this.typingInput,
        phrase,
        fromSide: i % 2 === 0 ? "left" : "right",
        y: PHRASE_BANNER_Y_SLOTS[i] ?? PHRASE_BANNER_Y_SLOTS[0],
        // Tier 4 — quiet-advance buys more time before a banner scrolls off.
        durationMs: cfg.durationMs * this.combat.advanceMult,
        delayMs: i * cfg.staggerMs,
        claimLineFrom: () => ({
          x: this.wrenContainer.x,
          y: this.wrenContainer.y - 116,
        }),
        claimLineColor: 0xf5c842,
        onComplete: () => this.onPhraseResolved(true),
        onMissCue: (source) => this.playPhraseMissCue(source),
        onMiss: () => this.onPhraseResolved(false),
      });
      this.activePhrases.push(phraseObj);
    });
  }

  private maybePlayWarmLightCue(): void {
    if (this.warmLightCueShown || this.combat.warmLight <= 0) return;
    this.warmLightCueShown = true;
    const x = LANTERN_BLUR_XS[1]!;
    const y = 420;
    this.time.delayedCall(260, () => {
      if (!this.scene.isActive()) return;
      playClaimLine(
        this,
        this.band.satchelAnchor.x + 58,
        this.band.bandTopY - 10,
        x,
        y - 130,
        { color: 0xfdedb0, depth: 20, durationMs: 360 },
      );
      playSceneEventPulse(this, {
        kind: "mote",
        color: 0xfdedb0,
        x,
        y,
        depth: 16,
        durationMs: 620,
        ringWidth: 980,
        ringHeight: 280,
        count: 18,
        alpha: 0.09,
        spreadX: 500,
        spreadY: 150,
      });
    });
  }

  private quietLordIntrusionAnchor(): { x: number; y: number } {
    let threat: ScrollingPhrase | null = null;
    for (const phrase of this.activePhrases) {
      if (phrase.isResolved()) continue;
      if (!threat || phrase.getProgress() > threat.getProgress()) {
        threat = phrase;
      }
    }

    if (!threat) return { x: this.scale.width / 2, y: 380 };
    return {
      x: Phaser.Math.Clamp(threat.getX(), 340, this.scale.width - 340),
      y: Phaser.Math.Clamp(threat.getY(), 280, this.scale.height - 360),
    };
  }

  /** Called when a scrolling phrase finishes — either typed (`success=true`)
   *  or scrolled off the far side (`success=false`). Either way it counts
   *  against the temple's remaining-phrases count; a miss also costs Heart
   *  and shakes Wren. */
  private onPhraseResolved(success: boolean): void {
    if (!success) {
      playWrenHurt(this.wrenSprite, { knockX: 0 });
      this.cameras.main.shake(180, 0.004);
      this.typingInput.getStats().record(false);
    }
    this.templePhrasesRemaining -= 1;
    if (this.templePhrasesRemaining <= 0) {
      this.onTempleCleared();
    }
  }

  private playPhraseMissCue(source: Phaser.GameObjects.Container): void {
    if (!source.scene || !this.wrenContainer.scene) return;
    const sourceX = Phaser.Math.Clamp(source.x, 40, this.scale.width - 40);
    const sourceY = source.y;
    const targetX = this.wrenContainer.x;
    const targetY = this.wrenContainer.y - 112;
    playClaimLine(this, sourceX, sourceY, targetX, targetY, {
      color: 0xf5c842,
      depth: 58,
      durationMs: 300,
    });
    playBodyImpact(this, source, {
      kind: "mote",
      color: 0xf5c842,
      offsetX: sourceX - source.x,
      offsetY: 0,
      depth: 58,
      ringRadius: 30,
      count: 7,
      durationMs: 320,
    });
    playBodyImpact(this, this.wrenContainer, {
      kind: "mote",
      color: 0xf5c842,
      offsetY: -104,
      depth: 59,
      ringRadius: 34,
      count: 8,
      durationMs: 360,
    });
  }

  private onTempleCleared(): void {
    const nextIdx = this.templeIndex + 1;

    // Between Temple 3 and 4: Scholar Etta side encounter
    if (this.templeIndex === 2) {
      this.time.delayedCall(1200, () => this.startEttaEncounter(nextIdx));
      return;
    }

    if (nextIdx < TEMPLE_PHRASE_CONFIGS.length) {
      this.time.delayedCall(1400, () => this.startTemple(nextIdx));
    } else {
      // All 5 temples cleared → Fork 1. Almanac lore page 3 — the five
      // riddle inscriptions, stamped at the moment Wren finishes the last.
      this.store.update((s) => {
        if (!s.almanacLore.includes("the-five-temple-riddles")) {
          s.almanacLore.push("the-five-temple-riddles");
        }
      });
      this.time.delayedCall(1400, () => this.startFork1());
    }
  }

  // ─── Sealed-scroll temple (no-miss precision test) ───────────────────────

  /** A stationary scroll with no timeout — but it reseals (resets to the start)
   *  on ANY wrong key, in every difficulty. The precision counterpart to the
   *  speed-stake scrolling temples. */
  private startSealedScrollTemple(): void {
    this.setNarrator(
      "A sealed scroll, pinned in still air. No haste here — but no mistakes. One slip and it reseals.",
    );
    this.band.setObjective("Type the sealed scroll with no mistakes.");
    // No scrolling banners this temple — clear the blur-driven list.
    this.activePhrases = [];
    this.templePhrasesRemaining = 0;

    this.time.delayedCall(1600, () => {
      const cx = this.scale.width / 2;
      const cy = 720;
      const seal = this.drawSealedScroll(cx, cy);
      const target = this.makeWord({
        scene: this,
        word: SEALED_SCROLL_PHRASE,
        x: cx,
        y: cy,
        fontSize: 32,
        burstColor: 0xf5c842,
        resetOnMiss: true,
        onMiss: () => this.flashScrollReseal(seal),
        // Tier 4 unseal — the Master Key (via the grace pool) reopens a reseal:
        // progress is kept and a gentle gold cue replaces the wax-red snap.
        onResetForgiven: () => this.flashSealForgiven(seal),
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.tweens.add({
            targets: seal,
            alpha: 0,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 500,
            ease: "Sine.easeOut",
            onComplete: () => seal.destroy(),
          });
          this.setNarrator("The scroll holds. The seal opens of its own accord.");
          this.time.delayedCall(1400, () => this.onTempleCleared());
        },
      });
      // Tier 4 — feed the grace pool (Master Key / Lock-Bar / Golem Heart /
      // Cairn-Token) into the no-miss temple as forgive-reset tokens (cap 2).
      target.setForgiveResets(this.combat.gracePool);
      this.registerActiveTarget(target);
    });
  }

  /** Parchment backing + wax seal for the sealed-scroll temple. Created BEFORE
   *  the phrase target so the (equal-depth) text renders on top of it. */
  private drawSealedScroll(cx: number, cy: number): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const shadow = this.add.graphics();
    const g = this.add.graphics();
    const w = 920;
    const h = 120;
    shadow.fillStyle(0x05030a, 0.28);
    shadow.fillRoundedRect(-w / 2 + 10, -h / 2 + 14, w, h, 14);
    c.add(shadow);
    // Hanging cords/pins: the scroll is "pinned in still air", not a loose UI
    // card. Keep these subtle so the phrase remains the focal point.
    g.lineStyle(2, 0xc9a14a, 0.38);
    g.lineBetween(-w / 2 + 110, -h / 2 - 58, -w / 2 + 76, -h / 2 + 8);
    g.lineBetween(w / 2 - 110, -h / 2 - 58, w / 2 - 76, -h / 2 + 8);
    g.fillStyle(0xc9a14a, 0.66);
    g.fillCircle(-w / 2 + 110, -h / 2 - 58, 6);
    g.fillCircle(w / 2 - 110, -h / 2 - 58, 6);
    g.fillStyle(0xf3ead2, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.fillStyle(0xe1d2ad, 0.55);
    g.fillTriangle(-w / 2 + 18, -h / 2 + 12, -w / 2 + 66, -h / 2 + 12, -w / 2 + 18, -h / 2 + 46);
    g.fillTriangle(w / 2 - 18, h / 2 - 12, w / 2 - 66, h / 2 - 12, w / 2 - 18, h / 2 - 46);
    g.lineStyle(3, 0xc9a14a, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    // Rolled ends.
    g.fillStyle(0xc9a14a, 0.85);
    g.fillRoundedRect(-w / 2 - 14, -h / 2 - 6, 14, h + 12, 6);
    g.fillRoundedRect(w / 2, -h / 2 - 6, 14, h + 12, 6);
    g.lineStyle(2, 0x8a7060, 0.55);
    g.lineBetween(-w / 2 + 34, -h / 2 + 22, w / 2 - 34, -h / 2 + 22);
    g.lineBetween(-w / 2 + 34, h / 2 - 22, w / 2 - 34, h / 2 - 22);
    c.add(g);
    // Wax seal motif at the bottom edge.
    const seal = this.add.graphics();
    seal.fillStyle(0xa33b2a, 0.9);
    seal.fillCircle(0, h / 2 - 8, 16);
    seal.fillStyle(0x7a2a1e, 0.9);
    seal.fillCircle(0, h / 2 - 8, 8);
    c.add(seal);
    this.tweens.add({
      targets: seal,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    c.once(Phaser.GameObjects.Events.DESTROY, () => this.tweens.killTweensOf(seal));
    playBodyImpact(this, c, {
      kind: "mote",
      color: 0xf5c842,
      offsetY: 0,
      depth: 21,
      ringRadius: 58,
      count: 10,
      durationMs: 420,
    });
    return c;
  }

  /** Wax-red flash + shake when the sealed scroll reseals (a miss). The target's
   *  resetOnMiss has already wiped the typed progress; this is the cue. */
  private flashScrollReseal(seal: Phaser.GameObjects.Container): void {
    this.cameras.main.shake(120, 0.003);
    // Reset any in-flight flash so a flurry of misses can't strand the alpha.
    this.tweens.killTweensOf(seal);
    seal.setAlpha(1);
    seal.setScale(1);
    this.playScrollResealSnap(seal);
    this.tweens.add({
      targets: seal,
      alpha: { from: 1, to: 0.45 },
      yoyo: true,
      duration: 150,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: seal,
      scaleX: { from: 1.014, to: 0.992 },
      scaleY: { from: 1.014, to: 0.992 },
      yoyo: true,
      duration: 110,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (seal.scene) seal.setScale(1);
      },
    });
  }

  private playScrollResealSnap(seal: Phaser.GameObjects.Container): void {
    if (!seal.scene) return;

    const waxX = seal.x;
    const waxY = seal.y + 52;
    const snap = this.add.graphics().setDepth(58).setAlpha(0.82);
    snap.lineStyle(2.5, 0xa33b2a, 0.58);
    snap.lineBetween(seal.x - 410, seal.y - 34, waxX - 24, waxY - 2);
    snap.lineBetween(seal.x + 410, seal.y - 34, waxX + 24, waxY - 2);
    snap.lineStyle(1.5, PALETTE_HEX.brass, 0.3);
    snap.lineBetween(seal.x - 360, seal.y + 36, waxX - 18, waxY + 8);
    snap.lineBetween(seal.x + 360, seal.y + 36, waxX + 18, waxY + 8);
    this.tweens.add({
      targets: snap,
      alpha: 0,
      duration: 340,
      ease: "Sine.easeOut",
      onComplete: () => snap.destroy(),
    });

    playSceneEventPulse(this, {
      kind: "mote",
      color: 0xa33b2a,
      x: waxX,
      y: waxY,
      depth: 52,
      durationMs: 360,
      ringWidth: 230,
      ringHeight: 54,
      count: 6,
      alpha: 0.045,
      spreadX: 84,
      spreadY: 24,
    });
    playBodyImpact(this, seal, {
      kind: "mote",
      color: 0xa33b2a,
      offsetY: 50,
      depth: 59,
      ringRadius: 30,
      count: 8,
      durationMs: 340,
    });
  }

  /** Tier 4 unseal/grace — the gentle counterpart to flashScrollReseal: a soft
   *  gold shimmer when the defensive grace pool pardons a reseal (progress kept),
   *  so the player reads it as a relic saving them, not a slip. */
  private flashSealForgiven(seal: Phaser.GameObjects.Container): void {
    this.tweens.killTweensOf(seal);
    seal.setAlpha(1);
    this.tweens.add({
      targets: seal,
      alpha: { from: 1, to: 0.7 },
      yoyo: true,
      duration: 220,
      ease: "Sine.easeInOut",
    });
    const x = seal.scene ? seal.x : this.scale.width / 2;
    const y = seal.scene
      ? Math.max(280, Math.min(this.scale.height - 360, seal.y - 96))
      : 640;
    const glint = this.add.graphics().setPosition(x, y).setDepth(59).setAlpha(0.78);
    glint.fillStyle(0x2a2112, 0.36);
    glint.fillRoundedRect(-118, -24, 236, 48, 12);
    glint.lineStyle(2, PALETTE_HEX.brass, 0.54);
    glint.strokeRoundedRect(-110, -18, 220, 36, 10);
    glint.lineStyle(3, PALETTE_HEX.brass, 0.62);
    glint.lineBetween(-82, 0, -30, 0);
    glint.strokeCircle(-20, 0, 8);
    glint.lineBetween(-70, 0, -78, 8);
    glint.lineBetween(-58, 0, -66, 8);
    playBodyImpact(this, seal, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: -64,
      depth: 58,
      ringRadius: 34,
      count: 8,
      durationMs: 360,
    });
    this.noticeGraceSave("A warding relic holds the seal.");
    const txt = this.add
      .text(x + 22, y, "the ward holds", {
        fontFamily: SERIF,
        fontSize: "24px",
        fontStyle: "italic",
        color: PALETTE.brass,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0.9);
    this.tweens.add({
      targets: [glint, txt],
      alpha: 0,
      y: "-=28",
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => {
        glint.destroy();
        txt.destroy();
      },
    });
  }

  private noticeGraceSave(text: string): void {
    if (this.graceSaveNoticed) return;
    this.graceSaveNoticed = true;
    this.band.showNotice(text, {
      label: "relic",
      durationMs: 1700,
    });
  }

  /** The live scrolling banners summarised for an offensive one-shot's "strongest
   *  foe" pick. Progress is how far a banner has scrolled toward its exit (nearest
   *  = most urgent); the phrase length breaks ties. Resolved banners drop out. The
   *  stationary sealed-scroll temple isn't here — it's a precision puzzle, not an
   *  advancing foe — so a one-shot can't trivialise it. */
  private liveBannerThreats(): OneShotThreat<ScrollingPhrase>[] {
    const threats: OneShotThreat<ScrollingPhrase>[] = [];
    for (const p of this.activePhrases) {
      if (!p.isReady() || p.isResolved() || p.isFrozen()) continue;
      threats.push({
        enemy: p,
        progress: p.getProgress(),
        wordLength: p.getPhraseLength(),
      });
    }
    return threats;
  }

  /** Run an offensive one-shot's consequence on the scrolling banners. The invoker
   *  has already picked the target, spent the Soul, and consumed the once-per-realm
   *  charge. toll-strike fells the strongest banner (the bell's tongue); jam-foe
   *  freezes it in place (still typeable, but no longer scrolling off). bind-beat
   *  isn't reachable in the Sky (tether-cord is earned here → Wood). */
  private applyOneShot(
    effect: OffensiveOneShot,
    targets: readonly ScrollingPhrase[],
  ): void {
    const target = targets[0];
    if (!target) return;
    if (effect === "toll-strike") {
      this.playOneShotSourceLine(
        effect,
        target.getX(),
        target.getY(),
        PALETTE_HEX.ember,
      );
      playBellToll();
      this.cameras.main.shake(160, 0.004);
      target.strike();
    } else if (effect === "jam-foe") {
      this.playOneShotSourceLine(
        effect,
        target.getX(),
        target.getY(),
        PALETTE_HEX.frost,
      );
      playSparkZap();
      target.freeze();
    }
  }

  private oneShotSource(effect: OffensiveOneShot): { x: number; y: number } | null {
    const offensiveOneShots = this.combat.oneShots.filter(isOffensiveOneShot);
    const idx = offensiveOneShots.indexOf(effect);
    return idx >= 0 ? this.band.oneShotSlots[idx] ?? null : null;
  }

  private playOneShotSourceLine(
    effect: OffensiveOneShot,
    toX: number,
    toY: number,
    color: number,
  ): void {
    const source = this.oneShotSource(effect);
    if (!source) return;
    playClaimLine(this, source.x, source.y - 24, toX, toY, {
      color,
      depth: 62,
      durationMs: 420,
    });
  }

  /** Surface that the satchel is doing something here, once and briefly. The
   *  persistent console-band icons show what you carry, so avoid flooding the
   *  narration card with one line per relic. */
  private announceCombatLoadout(onDone: () => void): void {
    const lines = this.combat.announcements;
    if (lines.length === 0) {
      onDone();
      return;
    }
    this.band.showNotice(
      lines.length === 1
        ? lines[0]!
        : "Your satchel stirs; its relics answer here.",
      { label: "satchel" },
    );
    this.time.delayedCall(1900, onDone);
  }

  // ─── Scholar Etta side encounter ─────────────────────────────────────────

  private startEttaEncounter(nextTempleIdx: number): void {
    this.setNarrator(
      "A side chamber off the temple path. A spirit scholar crouches over a single unburned book.",
    );
    this.showEtta();
    this.time.delayedCall(2000, () => {
      this.setNarrator(ETTA_LINE, "Etta");
      this.time.delayedCall(600, () => {
        const helpPos = this.skyOwnedWordPosition(this.ettaSprite, -120, ETTA_HELP_TRIGGER, {
          side: "left",
        });
        const helpTarget = this.makeEttaWord({
          scene: this,
          word: ETTA_HELP_TRIGGER,
          x: helpPos.x,
          y: helpPos.y,
          frame: "banner",
          fontSize: 36,
          onComplete: () => {
            playActorAttention(this, this.ettaSprite, {
              tint: PALETTE_HEX.brass,
            });
            this.clearActiveTargets();
            this.startEttaHelp(nextTempleIdx);
          },
        });
        // Any other typed word (typing something that doesn't start with 'h')
        // will just fail to claim — but we also offer a "skip" word
        const skipPos = this.skyOwnedWordPosition(this.ettaSprite, -120, "keep moving", {
          side: "right",
        });
        const skipTarget = this.makeEttaWord({
          scene: this,
          word: "keep moving",
          x: skipPos.x,
          y: skipPos.y,
          frame: "banner",
          fontSize: 36,
          onComplete: () => {
            playActorAttention(this, this.ettaSprite, {
              tint: PALETTE_HEX.brass,
            });
            this.clearActiveTargets();
            this.hideEtta();
            this.setNarrator("The scholar watches you go in silence.");
            this.time.delayedCall(1600, () => this.startTemple(nextTempleIdx));
          },
        });
        this.registerActiveTarget(helpTarget, skipTarget);
      });
    });
  }

  private startEttaHelp(nextTempleIdx: number): void {
    this.setNarrator("You approach the book. Scholar Etta holds her breath.");
    this.time.delayedCall(1200, () => {
      const bookCue = this.showEttaBookCue();
      const liftTarget = this.makeEttaBookWord({
        scene: this,
        word: ETTA_CHAIN_1,
        x: bookCue.x + 110,
        y: bookCue.y - 132,
        fontSize: 38,
        onComplete: () => {
          playChime();
          playActorAttention(this, this.ettaSprite, {
            tint: PALETTE_HEX.brass,
          });
          this.clearActiveTargets();
          this.setNarrator("The book is heavier than it looks. Old paper, dense with writing.");
          this.time.delayedCall(1400, () => {
            const placeTarget = this.makeEttaBookWord({
              scene: this,
              word: ETTA_CHAIN_2,
              x: bookCue.x + 110,
              y: bookCue.y - 132,
              fontSize: 38,
              onComplete: () => {
                playChime();
                playActorAttention(this, this.ettaSprite, {
                  tint: PALETTE_HEX.brass,
                });
                this.clearActiveTargets();
                this.ettaDone = true;
                this.store.update((s) => {
                  if (!s.almanacLore.includes("scholar-ettas-last-volume")) {
                    s.almanacLore.push("scholar-ettas-last-volume");
                  }
                });
                this.setNarrator(
                  "Scholar Etta's Last Volume — a page appears in the Almanac.",
                );
                this.clearEttaBookCue(true);
                this.hideEtta();
                this.time.delayedCall(2200, () => this.startTemple(nextTempleIdx));
              },
            });
            this.registerActiveTarget(placeTarget);
          });
        },
      });
      this.registerActiveTarget(liftTarget);
    });
  }

  /** Fade Scholar Etta in on the platform. Visual only — additive, and safe to
   *  call more than once (the side encounter and the fork-1 help path both use
   *  it). Stored in `ettaSprite` so it can be faded out / cleaned up. */
  private showEtta(): void {
    if (this.ettaSprite) return;
    const sprite = this.add
      .image(ETTA_SPRITE_X, ETTA_SPRITE_Y, "etta")
      .setOrigin(0.5, 1)
      .setDepth(ETTA_SPRITE_DEPTH);
    sprite.setScale(ETTA_SPRITE_HEIGHT / sprite.height);
    this.ettaSprite = sprite;
    stageAnchoredSprite(this, sprite, {
      shadowWidth: 110,
      shadowHeight: 22,
      shadowOffsetY: 8,
      shadowAlpha: 0.18,
      shadowDepth: ETTA_SPRITE_DEPTH - 0.1,
      restAlpha: ETTA_RESTING_ALPHA,
      entranceOffsetY: 14,
      entranceMs: 760,
      breathDy: -3,
      breathMs: 2500,
    });
  }

  /** Fade Scholar Etta out and destroy her. No-op if she isn't on screen. */
  private hideEtta(): void {
    const sprite = this.ettaSprite;
    if (!sprite) return;
    this.clearEttaWordAnchors();
    this.clearEttaBookCue(true);
    this.ettaSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  private showEttaBookCue(): Phaser.GameObjects.Container {
    if (this.ettaBookCue?.scene) return this.ettaBookCue;

    const c = this.add.container(760, 806).setDepth(43).setAlpha(0);
    c.add(addLocalGroundShadow(this, 150, 20, { y: 16, alpha: 0.18 }));

    const g = this.add.graphics();
    g.fillStyle(0x2d2119, 0.84);
    g.fillRoundedRect(-62, -30, 124, 42, 8);
    g.fillStyle(0x5f4731, 0.94);
    g.fillRoundedRect(-56, -42, 112, 58, 8);
    g.lineStyle(2, PALETTE_HEX.brass, 0.52);
    g.strokeRoundedRect(-56, -42, 112, 58, 8);
    g.lineStyle(1.5, 0xf3ead2, 0.34);
    g.lineBetween(0, -38, 0, 12);
    g.lineBetween(-42, -22, -10, -18);
    g.lineBetween(10, -18, 42, -22);
    g.fillStyle(PALETTE_HEX.brass, 0.42);
    g.fillCircle(0, -12, 8);
    g.fillStyle(0xf3ead2, 0.18);
    g.fillEllipse(-26, -17, 34, 8);
    g.fillEllipse(28, -17, 34, 8);
    c.add(g);

    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 420,
      spreadX: 34,
      spreadY: 12,
      offsetY: -34,
      alpha: 0.22,
      size: 3.2,
      depth: 42,
      driftY: -42,
      durationMs: 980,
    });

    this.tweens.add({
      targets: c,
      alpha: 0.9,
      y: 788,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (c.scene) addIdleBreath(this, c, { dy: -3, durationMs: 2400 });
      },
    });

    this.ettaBookCue = c;
    return c;
  }

  private pulseEttaBookCue(complete = false): void {
    const cue = this.ettaBookCue;
    if (!cue?.scene) return;
    playBodyImpact(this, cue, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: -26,
      depth: 58,
      ringRadius: complete ? 48 : 30,
      count: complete ? 10 : 6,
    });
    playActorAttention(this, cue, {
      tint: PALETTE_HEX.brass,
      scale: complete ? 1.03 : 1.018,
      durationMs: complete ? 220 : 160,
    });
  }

  private clearEttaBookCue(fade = false): void {
    this.clearEttaBookWordAnchors();
    const cue = this.ettaBookCue;
    this.ettaBookCue = null;
    if (!cue?.scene) return;
    this.tweens.killTweensOf(cue);
    if (!fade) {
      cue.destroy();
      return;
    }
    this.tweens.add({
      targets: cue,
      y: cue.y - 14,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (cue.scene) cue.destroy();
      },
    });
  }

  // ─── Fork 1 — Library Tower ──────────────────────────────────────────────

  private startFork1(): void {
    this.narration.say("sky_fork1_intro");
    this.band.setObjective("Choose whether to help Etta or take the flame.");
    this.showFork1Cues();

    const helpPos = this.skyOwnedWordPosition(this.ettaSprite, -120, "help scholar etta", {
      side: "left",
    });
    const helpTarget = this.makeEttaWord({
      scene: this,
      word: "help scholar etta",
      x: helpPos.x,
      y: helpPos.y,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "help-etta";
        this.startFork1HelpEtta();
      },
    });
    const stealPos = this.skyOwnedWordPosition(this.beaconFlameCue, -76, "steal the flame", {
      side: "right",
    });
    const stealTarget = this.makeSkyForkWord(this.beaconFlameCue, {
      scene: this,
      word: "steal the flame",
      x: stealPos.x,
      y: stealPos.y,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "steal-flame";
        this.startFork1StealFlame();
      },
    }, -76);
    this.registerActiveTarget(helpTarget, stealTarget);
  }

  private startFork1HelpEtta(): void {
    this.fadeOutForkCue(this.beaconFlameCue);
    this.beaconFlameCue = null;
    if (!this.ettaDone) {
      // Formal commit to the etta path if side encounter was skipped
      this.store.update((s) => {
        if (!s.almanacLore.includes("scholar-ettas-last-volume")) {
          s.almanacLore.push("scholar-ettas-last-volume");
        }
      });
    }
    this.showEtta();
    this.setNarrator("You carry her books to the shelves. The beacon brightens.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        ["carry her books", "the shelves hold them", "etta thanks you quietly", "the beacon brightens"],
        [
          "One by one the shelves fill up.",
          "Scholar Etta traces a title with one finger.",
          "She says nothing, but the lanterns flicker warmly.",
          "The great beacon above brightens. It was watching.",
        ],
        () => {
          this.hideEtta();
          this.startAct3();
        },
      );
    });
  }

  private startFork1StealFlame(): void {
    this.hideEtta();
    this.setNarrator("You reach into the beacon and close your hand around the flame.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"],
        [
          "The flame does not burn you. It simply waits.",
          "A tremor passes through the island. The lanterns dip.",
          "You hold a curl of golden fire in your palm.",
          "Something shifts in the air. The summit calls louder.",
        ],
        () => {
          this.fadeOutForkCue(this.beaconFlameCue);
          this.beaconFlameCue = null;
          this.startAct3();
        },
        { body: this.beaconFlameCue, sourceOffsetY: -76 },
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3 — The Scholar-Spirit Boss
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct3(): void {
    this.clearActiveTargets();
    this.narration.say("sky_scholar_spirit_rise");
    this.bossContainer = this.drawScholarSpirit();
    this.time.delayedCall(2400, () => this.startBossPhase1());
  }

  private startBossPhase1(): void {
    // Boss-phase bookend — audio sting + shake so each riddle phase lands
    // with the same event-weight as a wave.
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseSkyWave({ y: 560, ringWidth: 820, ringHeight: 190, count: 14 });
    this.playScholarStagePulse();
    this.setNarrator(RIDDLE_1_DISPLAY, "Scholar-Spirit");
    this.band.setObjective("Answer the Scholar-Spirit's riddle.");
    this.time.delayedCall(1200, () => {
      const pos = this.scholarBossWordPosition(BOSS_PHASE1_ANSWER);
      const target = this.makeScholarBossWord({
        scene: this,
        word: BOSS_PHASE1_ANSWER,
        x: pos.x,
        y: pos.y,
        fontSize: 44,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.tweenBossBow();
          this.setNarrator("The spirit bows slightly. It is satisfied — for now.");
          this.time.delayedCall(2000, () => this.startBossPhase2());
        },
      });
      this.registerActiveTarget(target);
    });
  }

  private startBossPhase2(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseSkyWave({ y: 560, ringWidth: 820, ringHeight: 190, count: 14 });
    this.playScholarStagePulse(true);
    this.setNarrator(RIDDLE_2_DISPLAY, "Scholar-Spirit");
    this.band.setObjective("Answer the second riddle.");
    this.time.delayedCall(1200, () => {
      const pos = this.scholarBossWordPosition(BOSS_PHASE2_ANSWER);
      const target = this.makeScholarBossWord({
        scene: this,
        word: BOSS_PHASE2_ANSWER,
        x: pos.x,
        y: pos.y,
        fontSize: 44,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.flashBossEyes();
          this.setNarrator("The spirit's eyes shift colour. Something else stirs within it.");
          this.time.delayedCall(1800, () => {
            if (!this.quietLordFiredInPhase2) {
              this.quietLordFiredInPhase2 = true;
              this.store.update((s) => {
                const realm = s.realms["sky-island"];
                if (realm) realm.quietLordFragmentRevealed = true;
              });
              flashQuietLordFragment(this, {
                text: "Agai",
                x: this.bossContainer?.scene ? this.bossContainer.x : this.scale.width / 2,
                y: this.bossContainer?.scene
                  ? Phaser.Math.Clamp(this.bossContainer.y - 56, 260, this.scale.height - 360)
                  : this.scale.height / 2 - 40,
              });
            }
            this.time.delayedCall(1600, () => this.startBossPhase3());
          });
        },
      });
      this.registerActiveTarget(target);
    });
  }

  private startBossPhase3(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseSkyWave({ y: 560, ringWidth: 820, ringHeight: 190, count: 14 });
    this.playScholarStagePulse(true);
    this.setNarrator(RIDDLE_3_DISPLAY, "Scholar-Spirit");
    this.band.setObjective("Type the final answer before the spirit fades.");
    this.time.delayedCall(1400, () => {
      // Track typed characters to progressively dim the spirit as the
      // sentence fills in — mirrors the per-word alpha from the old sequential
      // runner but driven by cursor position at quarter-sentence milestones.
      const totalChars = BOSS_PHASE3_ANSWER.length;
      let lastFadeBand = 0;
      const pos = this.scholarBossWordPosition(BOSS_PHASE3_ANSWER);
      const target = this.makeScholarBossWord({
        scene: this,
        word: BOSS_PHASE3_ANSWER,
        x: pos.x,
        y: pos.y,
        fontSize: 44,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.onBossDefeated();
        },
      });

      // Wrap advance() to trigger alpha fades at 25 %, 50 %, 75 %, and 100 %
      // of the sentence typed — preserves the "spirit fades as Wren answers" feel.
      const originalAdvance = target.advance.bind(target);
      target.advance = () => {
        originalAdvance();
        if (this.bossContainer) {
          const typed = totalChars - target.remaining().length;
          const band = Math.floor((typed / totalChars) * 4); // 0-4
          if (band > lastFadeBand) {
            lastFadeBand = band;
            const targetAlpha = Math.max(0.1, 1 - band * 0.22);
            this.tweens.add({
              targets: this.bossContainer,
              alpha: targetAlpha,
              duration: 400,
              ease: "Sine.easeOut",
            });
          }
        }
      };

      this.registerActiveTarget(target);
    });
  }

  private scholarBossWordPosition(word: string): { x: number; y: number } {
    const body = this.bossContainer;
    if (!body?.scene) return { x: this.scale.width / 2, y: this.scale.height / 2 - 40 };

    const long = word.length > 18;
    return {
      x: Phaser.Math.Clamp(body.x, long ? 430 : 330, this.scale.width - (long ? 430 : 330)),
      y: Phaser.Math.Clamp(body.y + (long ? 158 : 138), 300, this.scale.height - 430),
    };
  }

  private onBossDefeated(): void {
    // Dissolve the boss into floating lanterns
    if (this.bossContainer) {
      this.bossRingTween?.stop();
      this.tweens.add({
        targets: this.bossContainer,
        alpha: 0,
        y: (this.bossContainer.y ?? 400) - 100,
        duration: 1200,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.bossContainer?.destroy();
          this.bossContainer = null;
          this.bossSprite = null;
        },
      });
      // Spawn floating lantern particles effect
      this.spawnBossLanternBurst();
    }

    // Fire ~~Agai~~ if not already fired in Phase 2 (and not yet revealed this run)
    if (!this.quietLordFiredInPhase2) {
      this.quietLordFiredInPhase2 = true;
      this.store.update((s) => {
        const realm = s.realms["sky-island"];
        if (realm) realm.quietLordFragmentRevealed = true;
      });
      flashQuietLordFragment(this, {
        text: "Agai",
        x: this.bossContainer?.scene ? this.bossContainer.x : this.scale.width / 2,
        y: this.bossContainer?.scene
          ? Phaser.Math.Clamp(this.bossContainer.y - 56, 260, this.scale.height - 360)
          : this.scale.height / 2 - 40,
      });
    }
    // Almanac lore page 4 — the Scholar-Spirit's riddles, stamped at boss defeat.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-scholar-spirits-riddles")) {
        s.almanacLore.push("the-scholar-spirits-riddles");
      }
    });

    this.time.delayedCall(800, () => {
      this.narration.say("sky_scholar_spirit_defeated");
      this.time.delayedCall(3000, () => this.startFork2());
    });
  }

  // ─── Fork 2 — After the Boss ─────────────────────────────────────────────

  private startFork2(): void {
    this.setNarrator("The summit is quiet. Two choices remain.");
    this.band.setObjective("Choose how to answer the tethered spirit.");
    this.showFork2Cues();

    const kindPos = this.skyOwnedWordPosition(this.kindAnswerCue, -56, "answer kindly", {
      side: "left",
    });
    const kindTarget = this.makeSkyForkWord(this.kindAnswerCue, {
      scene: this,
      word: "answer kindly",
      x: kindPos.x,
      y: kindPos.y,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "answer-kindly";
        this.startFork2KindEnding();
      },
    }, -56);
    const tetherPos = this.skyOwnedWordPosition(this.tetherThreadCue, -58, "cut the tether", {
      side: "right",
    });
    const tetherTarget = this.makeSkyForkWord(this.tetherThreadCue, {
      scene: this,
      word: "cut the tether",
      x: tetherPos.x,
      y: tetherPos.y,
      frame: "banner",
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "cut-tether";
        this.startFork2CutTether();
      },
    }, -58);
    this.registerActiveTarget(kindTarget, tetherTarget);
  }

  private startFork2KindEnding(): void {
    this.fadeOutForkCue(this.tetherThreadCue);
    this.tetherThreadCue = null;
    this.setNarrator("You speak to what remains of the spirit.");
    this.time.delayedCall(1400, () => {
      const pos = this.skyOwnedWordPosition(
        this.kindAnswerCue,
        -56,
        "you kept the light",
        { side: "right" },
      );
      const t = this.makeSkyForkWord(this.kindAnswerCue, {
        scene: this,
        word: "you kept the light",
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.setNarrator("The lanterns around the summit brighten. The island breathes.");
          this.fadeOutForkCue(this.kindAnswerCue);
          this.kindAnswerCue = null;
          this.time.delayedCall(2200, () => this.startLanternMothGate());
        },
      }, -56);
      this.registerActiveTarget(t);
    });
  }

  private startFork2CutTether(): void {
    this.fadeOutForkCue(this.kindAnswerCue);
    this.kindAnswerCue = null;
    this.setNarrator("You find the thread that binds the spirit to the beacon.");
    this.time.delayedCall(1400, () => {
      this.runPassageChain(
        ["pull the thread", "the tether falls"],
        [
          "The thread is thin as spider-silk, strong as iron.",
          "The island lurches once, then steadies. A wind rushes past — freed.",
        ],
        () => {
          this.fadeOutForkCue(this.tetherThreadCue);
          this.tetherThreadCue = null;
          this.startLanternMothGate();
        },
        { body: this.tetherThreadCue, sourceOffsetY: -58 },
      );
    });
  }

  // ─── Lantern-moth companion gate ─────────────────────────────────────────

  private startLanternMothGate(): void {
    // Single condition: fork1 was help-etta
    if (this.fork1Choice === "help-etta") {
      this.setNarrator(
        "A lantern-moth drifts down from the beacon's height, wings lit like paper.",
      );
      this.showLanternMothCompanion();
      this.time.delayedCall(1200, () => {
        const takePos = this.skyOwnedWordPosition(
          this.lanternMothCompanion,
          -54,
          "take her with you",
          { side: "left" },
        );
        const letGoPos = this.skyOwnedWordPosition(
          this.lanternMothCompanion,
          -54,
          "let her go",
          { side: "right" },
        );
        const takeTarget = this.makeLanternMothWord({
          scene: this,
          word: "take her with you",
          x: takePos.x,
          y: takePos.y,
          frame: "banner",
          fontSize: 32,
          onComplete: () => {
            this.clearActiveTargets();
            this.companionChoice = "take";
            this.store.update((s) => {
              if (!s.satchel.includes("lantern-moth")) {
                s.satchel.push("lantern-moth");
              }
            });
            this.setNarrator(
              "The moth lands on your wrist, wings folding. She is coming with you.",
            );
            this.pulseLanternMothCompanion();
            this.time.delayedCall(2400, () => this.startTrueNamePassage());
          },
        });
        const letGoTarget = this.makeLanternMothWord({
          scene: this,
          word: "let her go",
          x: letGoPos.x,
          y: letGoPos.y,
          frame: "banner",
          fontSize: 32,
          onComplete: () => {
            this.clearActiveTargets();
            this.companionChoice = "let-go";
            this.setNarrator(
              "She rises again into the golden air, wings a bright smear against the dusk.",
            );
            this.dismissLanternMothCompanion(1270, 500);
            this.time.delayedCall(2000, () => this.startTrueNamePassage());
          },
        });
        this.registerActiveTarget(takeTarget, letGoTarget);
      });
    } else {
      // Gate not met — no near-miss (single condition, as specified)
      this.startTrueNamePassage();
    }
  }

  private showLanternMothCompanion(): void {
    if (this.lanternMothCompanion?.scene) return;
    this.lanternMothCompanion = stageCompanionCameo(this, {
      textureKey: "sky-companion-lantern-moth",
      startX: 1320,
      startY: 520,
      x: 1160,
      y: 650,
      height: 104,
      depth: 43,
      flipX: true,
      shadowWidth: 70,
      shadowHeight: 10,
      shadowOffsetY: 34,
      shadowAlpha: 0.12,
      breathDy: -22,
      breathMs: 1450,
      wake: {
        kind: "mote",
        intervalMs: 120,
        offsetY: -42,
        spreadX: 26,
        spreadY: 24,
        depth: 42,
        alpha: 0.42,
      },
    });
  }

  private pulseLanternMothCompanion(): void {
    playActorAttention(this, this.lanternMothCompanion, {
      scale: 1.045,
      durationMs: 220,
    });
  }

  private dismissLanternMothCompanion(x: number, y: number): void {
    this.clearLanternMothWordAnchors();
    dismissCompanionCameo(this, this.lanternMothCompanion, {
      x,
      y,
      durationMs: 720,
    });
    this.lanternMothCompanion = null;
  }

  // ─── True-name passage ────────────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.narration.say("sky_truename_intro");
    this.time.delayedCall(1800, () => {
      const sealY = this.scale.height / 2 + 104;
      const seal = stageTrueNameSeal(this, {
        color: PALETTE_HEX.brass,
        kind: "mote",
        y: sealY,
        depth: 42,
      });
      let sealAnchor: WordBodyAnchorHandle | null = null;
      const releaseSealAnchor = (): void => {
        sealAnchor?.destroy();
        sealAnchor = null;
      };
      const target = this.makeWord({
        scene: this,
        word: TRUE_NAME_PASSAGE,
        x: this.scale.width / 2,
        y: sealY - 118,
        fontSize: 28,
        burstColor: PALETTE_HEX.brass,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          playClaimLine(
            this,
            this.wrenContainer.x,
            this.wrenContainer.y - 112,
            seal.x,
            seal.y - 8,
            { color: PALETTE_HEX.brass, depth: 58 },
          );
          playActorAttention(this, seal, {
            tint: PALETTE_HEX.brass,
            scale: 1.024,
            durationMs: 180,
          });
        },
        onAdvance: () =>
          playBodyTypePulse(this, seal, {
            kind: "mote",
            color: PALETTE_HEX.brass,
            offsetY: -8,
            depth: 58,
            ringRadius: 24,
          }),
        onComplete: () => {
          releaseSealAnchor();
          playBodyImpact(this, seal, {
            kind: "mote",
            color: PALETTE_HEX.brass,
            offsetY: -8,
            depth: 58,
            ringRadius: 54,
            count: 12,
          });
          dismissTrueNameSeal(this, seal);
          playChime();
          // Almanac lore page 5 — the Sky-Island's true name.
          this.store.update((s) => {
            if (!s.almanacLore.includes("the-sky-true-name")) {
              s.almanacLore.push("the-sky-true-name");
            }
          });
          this.time.delayedCall(800, () => this.startEnding());
        },
      });
      sealAnchor = attachWordBodyAnchor(
        this,
        seal,
        () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
        {
          color: PALETTE_HEX.brass,
          alpha: 0.2,
          depth: 43,
          sourceOffsetY: -12,
          targetOffsetY: 24,
        },
      );
      seal.once(Phaser.GameObjects.Events.DESTROY, releaseSealAnchor);
      this.registerActiveTarget(target);
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.narration.say("sky_almanac_stamp");

    this.store.update((s) => {
      s.realms["sky-island"] = {
        cleared: true,
        choices: {
          fork1: this.fork1Choice ?? "none",
          fork2: this.fork2Choice ?? "none",
          companion: this.companionChoice ?? "none",
        },
      };

      const fork1Relic =
        this.fork1Choice === "help-etta" ? "ettas-ledger" : "beacon-spark";
      const fork2Relic =
        this.fork2Choice === "answer-kindly" ? "wind-phrase" : "tether-cord";

      if (!s.satchel.includes(fork1Relic)) s.satchel.push(fork1Relic);
      if (!s.satchel.includes(fork2Relic)) s.satchel.push(fork2Relic);

      if (
        this.fork2Choice === "cut-tether" &&
        !s.satchel.includes("untethered-wind")
      ) {
        s.satchel.push("untethered-wind");
      }
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 26, 16, 8);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => this.scene.start("PortalChamberScene", {
          store: this.store,
          arrival: "sky-island",
        }),
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    playRealmClearResonance(this, {
      color: PALETTE_HEX.brass,
      y: this.scale.height / 2 - 60,
    });
    showAlmanacStampCard(this, "the sky island of lanterns", onDone, {
      fontSize: 50,
      onReveal: playChime,
    });
  }

  // ─── Lantern-spirit enemies ───────────────────────────────────────────────

  private spawnSpirit(
    startX: number,
    targetX: number,
    targetY: number,
    word: string,
    delay: number,
    advanceMs: number,
  ): void {
    const container = this.add.container(startX, targetY).setDepth(18);

    container.add(this.makeLanternSpiritLumenBase());

    // Glow halo (outer)
    const glowGfx = this.add.graphics();
    glowGfx.fillStyle(0xf5c842, 0.15);
    glowGfx.fillEllipse(0, -10, 132, 148);
    glowGfx.fillStyle(0xfdedb0, 0.08);
    glowGfx.fillEllipse(0, -18, 82, 106);
    container.add(glowGfx);

    // Lantern body — painted sprite with enough scale to carry the encounter.
    const lanternSprite = this.add.image(0, 0, "sky-lantern-spirit");
    lanternSprite.setScale(LANTERN_SPIRIT_HEIGHT / lanternSprite.height);
    container.add(lanternSprite);
    addContainerWake(this, container, {
      kind: "mote",
      intervalMs: 230,
      spreadX: 30,
      spreadY: 22,
      offsetY: -18,
      color: 0xf5c842,
      alpha: 0.42,
      size: 4,
      depth: -1,
      driftX: 22,
      driftY: -32,
      durationMs: 900,
    });
    container.setAlpha(0);

    const spirit: LanternSpirit = {
      container,
      lanternSprite,
      glowGfx,
      pulseTween: null,
      target: null,
      wordAnchor: null,
      spawnX: targetX,
      restY: targetY,
      word,
      defeated: false,
      advanceTween: null,
      arrivalTimer: null,
      advanceMs,
    };

    this.tweens.add({
      targets: container,
      x: targetX,
      alpha: 1,
      duration: 800,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (spirit.defeated) return;
        playBodyImpact(this, container, {
          kind: "mote",
          color: 0xf5c842,
          offsetY: -54,
          depth: 21,
          ringRadius: 42,
          count: 8,
          durationMs: 360,
        });
        this.playSpiritArrivalSettle(spirit);
        // Idle pulse — a soft alpha breathe on the painted body.
        spirit.pulseTween = this.tweens.add({
          targets: lanternSprite,
          alpha: { from: 0.75, to: 1 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.beginSpiritThreat(spirit);
      },
    });

    this.spirits.push(spirit);
  }

  private beginSpiritThreat(spirit: LanternSpirit): void {
    spirit.arrivalTimer?.remove(false);
    spirit.arrivalTimer = this.time.delayedCall(
      SPIRIT_WORD_ATTACH_DELAY_MS,
      () => {
        spirit.arrivalTimer = null;
        if (spirit.defeated || !spirit.container.scene) return;
        this.idleBob(spirit.container);
        this.attachSpiritTarget(spirit);
        this.startSpiritAdvance(spirit);
      },
    );
  }

  private playSpiritArrivalSettle(spirit: LanternSpirit): void {
    spirit.container.setScale(1, 1);
    this.tweens.add({
      targets: spirit.container,
      scaleX: 1 + SPIRIT_ARRIVAL_SETTLE_SCALE,
      scaleY: 1 - SPIRIT_ARRIVAL_SETTLE_SCALE * 0.46,
      duration: 70,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!spirit.container.scene || spirit.defeated) return;
        spirit.container.setScale(1, 1);
      },
    });
  }

  private attachSpiritTarget(spirit: LanternSpirit): void {
    const target = this.makeWord({
      scene: this,
      word: spirit.word,
      x: spirit.container.x,
      y: spirit.restY - 98,
      fontSize: 34,
      // Lantern-amber burst on completion — spirits "bloom out" in their own
      // light, matching the theme rather than the default brass.
      burstColor: 0xf5c842,
      onClaim: () =>
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 116,
          spirit.container.x,
          spirit.restY - 98,
          { color: 0xf5c842 },
        ),
      onAdvance: () =>
        playBodyTypePulse(this, spirit.container, {
          kind: "mote",
          color: 0xf5c842,
          offsetY: -58,
          depth: 22,
          ringRadius: 28,
        }),
      onComplete: () => this.defeatSpirit(spirit),
    });
    spirit.target = target;
    spirit.wordAnchor?.destroy();
    spirit.wordAnchor = attachWordBodyAnchor(
      this,
      spirit.container,
      () =>
        spirit.target
          ? { x: spirit.target.getAnchorX(), y: spirit.target.getAnchorY() }
          : null,
      {
        color: 0xf5c842,
        alpha: 0.24,
        depth: 20,
        sourceOffsetY: -58,
        targetOffsetY: 24,
      },
    );
    this.registerActiveTarget(target);
  }

  private makeLanternSpiritLumenBase(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const groundY = LANTERN_SPIRIT_HEIGHT * 0.43;
    c.add(addLocalGroundShadow(this, 118, 20, {
      y: groundY + 2,
      alpha: 0.24,
      color: 0x03030a,
    }));

    const glow = this.add.graphics();
    glow.fillStyle(0xf5c842, 0.11);
    glow.fillEllipse(0, groundY, 140, 34);
    glow.fillStyle(0xfdedb0, 0.08);
    glow.fillEllipse(0, groundY - 2, 82, 20);
    glow.lineStyle(1, 0xf5c842, 0.18);
    glow.strokeEllipse(0, groundY, 154, 38);
    c.add(glow);
    return c;
  }

  private startSpiritAdvance(spirit: LanternSpirit): void {
    const wrenX = this.wrenContainer.x;
    const remaining = Math.abs(spirit.container.x - wrenX);
    const totalRange = Math.abs(spirit.spawnX - wrenX);
    // Tier 4 — quiet-advance lengthens the spirit's close, capped.
    const duration =
      spirit.advanceMs *
      Math.max(0.3, remaining / Math.max(1, totalRange)) *
      this.combat.advanceMult;

    spirit.advanceTween = this.tweens.add({
      targets: spirit.container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        if (!spirit.target) return;
        spirit.target.setAnchorX(spirit.container.x);
        // Danger pulse — as the spirit crosses DANGER_RAMP_START of its
        // advance, the floating word shifts cream → ember. Communicates
        // urgency without needing additional UI chrome.
        const dangerLevel = Math.max(
          0,
          (tween.progress - DANGER_RAMP_START) / (1 - DANGER_RAMP_START),
        );
        spirit.target.setDanger(dangerLevel);
      },
      onComplete: () => {
        spirit.advanceTween = null;
        if (!spirit.defeated) {
          this.spiritReachesWren(spirit);
        }
      },
    });
  }

  private defeatSpirit(spirit: LanternSpirit): void {
    if (spirit.defeated) return;
    playChime();
    spirit.defeated = true;

    // Stop pulse, fully light the lantern (bloom effect)
    spirit.pulseTween?.stop();
    spirit.pulseTween = null;
    spirit.arrivalTimer?.remove(false);
    spirit.arrivalTimer = null;

    if (spirit.target) {
      this.typingInput.unregister(spirit.target);
      const idx = this.activeTargets.indexOf(spirit.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      spirit.target = null;
    }
    spirit.wordAnchor?.destroy();
    spirit.wordAnchor = null;
    spirit.advanceTween?.stop();
    spirit.advanceTween = null;
    this.tweens.killTweensOf(spirit.container);
    playBodyImpact(this, spirit.container, {
      kind: "mote",
      color: 0xf5c842,
      offsetY: -42,
      ringRadius: 48,
    });

    // Bloom: expand glow radius briefly
    this.tweens.add({
      targets: spirit.glowGfx,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 700,
      ease: "Sine.easeOut",
    });
    // Bloom: the spirit flares to full light — a white tint flash on the body
    // (replaces the old fully-lit-core ellipse redraw now that it's a sprite).
    spirit.lanternSprite.setAlpha(1);
    spirit.lanternSprite.setTint(0xfff4b0);

    this.tweens.add({
      targets: spirit.container,
      alpha: 0,
      y: spirit.container.y - 80,
      duration: 900,
      delay: 400,
      ease: "Sine.easeOut",
      onComplete: () => spirit.container.destroy(),
    });

    if (this.spirits.every((s) => s.defeated)) {
      this.spirits = [];
      if (this.templeIndex === -1) {
        // First encounter
        this.time.delayedCall(1600, () => this.onFirstEncounterCleared());
      } else {
        this.time.delayedCall(1600, () => this.onTempleCleared());
      }
    }
  }

  private spiritReachesWren(spirit: LanternSpirit): void {
    // Gentle flash — no wave reset
    this.playSpiritHitWrenCue(spirit);
    this.cameras.main.flash(300, 26, 16, 8, false);
    playWrenHurt(this.wrenSprite, { knockX: 0 });
    playDamageThud();
    flashDamageVignette(this);

    if (spirit.target) {
      this.typingInput.unregister(spirit.target);
      const idx = this.activeTargets.indexOf(spirit.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      spirit.target.destroy();
      spirit.target = null;
    }
    spirit.wordAnchor?.destroy();
    spirit.wordAnchor = null;
    spirit.arrivalTimer?.remove(false);
    spirit.arrivalTimer = null;
    this.tweens.killTweensOf(spirit.container);

    this.tweens.add({
      targets: spirit.container,
      x: spirit.spawnX,
      duration: 800,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (spirit.defeated) return;
        this.time.delayedCall(2000, () => {
          if (spirit.defeated) return;
          this.idleBob(spirit.container);
          this.attachSpiritTarget(spirit);
          this.startSpiritAdvance(spirit);
        });
      },
    });
  }

  private playSpiritHitWrenCue(spirit: LanternSpirit): void {
    if (!spirit.container.scene || !this.wrenContainer.scene) return;

    const fromX = spirit.container.x;
    const fromY = spirit.container.y - 44;
    const toX = this.wrenContainer.x;
    const toY = this.wrenContainer.y - 112;
    playClaimLine(this, fromX, fromY, toX, toY, {
      color: 0xf5c842,
      depth: 58,
      durationMs: 260,
    });
    playBodyImpact(this, spirit.container, {
      kind: "mote",
      color: 0xf5c842,
      offsetY: -42,
      depth: 58,
      ringRadius: 28,
      count: 7,
      durationMs: 320,
    });
    playBodyImpact(this, this.wrenContainer, {
      kind: "mote",
      color: 0xf5c842,
      offsetY: -104,
      depth: 59,
      ringRadius: 34,
      count: 8,
      durationMs: 360,
    });
  }

  // Patch: first encounter sets templeIndex to -1 to distinguish from temple 0
  private startFirstSpiritEncounterFixed(): void {
    this.templeIndex = -1;
    this.startFirstSpiritEncounter();
  }

  // ─── Shared utilities ─────────────────────────────────────────────────────

  private skyOwnedWordPosition(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    sourceOffsetY: number,
    word: string,
    opts: { side?: "left" | "right"; lift?: number } = {},
  ): { x: number; y: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    if (!body?.scene) return { x: width / 2, y: height / 2 };

    const long = word.length > 16;
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1 : body.x < width / 2 ? 1 : -1;
    const lateral = long ? 220 : 180;
    const xInset = long ? 420 : 300;
    const lift = opts.lift ?? (long ? 116 : 102);

    return {
      x: Phaser.Math.Clamp(body.x + side * lateral, xInset, width - xInset),
      y: Phaser.Math.Clamp(body.y + sourceOffsetY - lift, 280, height - 410),
    };
  }

  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
    owner?: {
      body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined;
      sourceOffsetY?: number;
    },
  ): void {
    let step = 0;

    const advance = (): void => {
      if (step >= passages.length) {
        this.time.delayedCall(1400, onDone);
        return;
      }
      const word = passages[step] ?? "";
      const hasExplicitOwner = Boolean(owner?.body?.scene);
      const ownerBody = hasExplicitOwner ? owner?.body : this.ettaSprite;
      const sourceOffsetY = hasExplicitOwner ? (owner?.sourceOffsetY ?? -48) : -120;
      const pos = this.skyOwnedWordPosition(ownerBody, sourceOffsetY, word);
      const opts: TextWordTargetOptions = {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        onClaim: () => playWrenFocus(this.wrenSprite),
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          if (!hasExplicitOwner) {
            playActorAttention(this, this.ettaSprite, {
              tint: PALETTE_HEX.brass,
            });
          }
          playBodyImpact(this, this.wrenContainer, {
            kind: "mote",
            color: PALETTE_HEX.brass,
            offsetY: -108,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          step += 1;
          this.setNarrator(narratorLines[step - 1] ?? "");
          this.time.delayedCall(1400, advance);
        },
      };
      const target = owner?.body?.scene
        ? this.makeSkyForkWord(owner.body, opts, owner.sourceOffsetY)
        : this.makeEttaWord(opts);
      this.registerActiveTarget(target);
    };

    advance();
  }

  private idleBob(c: Phaser.GameObjects.Container): void {
    c.setScale(1, 1);
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 8 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: c,
      scaleX: 0.992,
      scaleY: 1.022,
      duration: 1450,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode from inside the realm.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }
    if (event.key.length === 1 || event.key === " ") playClack();
    this.typingInput.handleChar(event.key);
  }

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);
    if (speakerName === "Etta") {
      playActorAttention(this, this.ettaSprite, {
        tint: PALETTE_HEX.brass,
        scale: 1.03,
        durationMs: 220,
      });
    } else if (speakerName === "Scholar-Spirit") {
      playActorAttention(this, this.bossContainer, {
        tint: PALETTE_HEX.brass,
        scale: 1.02,
        durationMs: 220,
      });
    } else if (speakerName === "Lantern-Lighter") {
      playActorAttention(this, this.lighterSprite, {
        tint: PALETTE_HEX.brass,
        scale: 1.025,
        durationMs: 220,
      });
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Etta") {
      this.band.setPortrait("etta", "Etta");
    } else if (speakerName === "Scholar-Spirit") {
      this.band.setPortrait("scholar-spirit", "Scholar-Spirit");
    } else if (speakerName === "Lantern-Lighter") {
      this.band.setPortrait("sky-lantern-spirit", "Lantern-Lighter");
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private pulseSkyWave(
    opts: { y?: number; ringWidth?: number; ringHeight?: number; count?: number } = {},
  ): void {
    playSceneEventPulse(this, {
      kind: "mote",
      color: 0xffc96f,
      x: this.scale.width / 2,
      y: 650,
      ringWidth: 1120,
      ringHeight: 170,
      count: 12,
      alpha: 0.14,
      ...opts,
    });
  }

  /** UI-cohesion: every Sky-Island word target gets the legibility outline by
   *  default (TTT-style). Fork choices pass frame: "banner". */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    return new TextWordTarget({
      outline: true,
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

  private makePathWord(opts: TextWordTargetOptions): TextWordTarget {
    const cue = this.pathCue;
    if (!cue?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.pathWordAnchors.indexOf(anchor);
      if (idx >= 0) this.pathWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        const sourceOffset = this.pathCueSourceOffset();
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          cue.x + sourceOffset.x,
          cue.y + sourceOffset.y,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        playActorAttention(this, cue, {
          tint: PALETTE_HEX.brass,
          scale: 1.022,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        const sourceOffset = this.pathCueSourceOffset();
        playBodyTypePulse(this, cue, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetX: sourceOffset.x,
          offsetY: sourceOffset.y,
          depth: 58,
          ringRadius: 28,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        const sourceOffset = this.pathCueSourceOffset();
        playBodyImpact(this, cue, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetX: sourceOffset.x,
          offsetY: sourceOffset.y,
          depth: 58,
          ringRadius: 48,
          count: 10,
        });
        onComplete();
      },
    });

    const sourceOffset = this.pathCueSourceOffset();
    anchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetX: sourceOffset.x,
        sourceOffsetY: sourceOffset.y,
        targetOffsetY: 24,
      },
    );
    this.pathWordAnchors.push(anchor);
    cue.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private pathCueSourceOffset(): { x: number; y: number } {
    switch (this.pathCueBeat) {
      case "balance":
        return { x: -244, y: -62 };
      case "lantern":
        return { x: 0, y: -18 };
      case "stepping":
        return { x: 206, y: 4 };
      default:
        return { x: 0, y: -18 };
    }
  }

  private makeEttaWord(opts: TextWordTargetOptions): TextWordTarget {
    const etta = this.ettaSprite;
    if (!etta?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.ettaWordAnchors.indexOf(anchor);
      if (idx >= 0) this.ettaWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          etta.x,
          etta.y - 120,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        playActorAttention(this, etta, {
          tint: PALETTE_HEX.brass,
          scale: 1.02,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, etta, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -120,
          depth: 58,
          ringRadius: 28,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, etta, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -120,
          depth: 58,
          ringRadius: 52,
          count: 12,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      etta,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -120,
        targetOffsetY: 24,
      },
    );
    this.ettaWordAnchors.push(anchor);
    etta.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeLighterReplyWord(opts: TextWordTargetOptions): TextWordTarget {
    const lighter = this.lighterSprite;
    if (!lighter?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.lighterReplyAnchors.indexOf(anchor);
      if (idx >= 0) this.lighterReplyAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          lighter.x,
          lighter.y - LIGHTER_SPRITE_HEIGHT * 0.58,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        playActorAttention(this, lighter, {
          tint: PALETTE_HEX.brass,
          scale: 1.025,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, lighter, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -LIGHTER_SPRITE_HEIGHT * 0.58,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, lighter, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -LIGHTER_SPRITE_HEIGHT * 0.58,
          depth: 58,
          ringRadius: 44,
          count: 10,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      lighter,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -LIGHTER_SPRITE_HEIGHT * 0.58,
        targetOffsetY: 24,
      },
    );
    this.lighterReplyAnchors.push(anchor);
    lighter.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private clearLighterReplyAnchors(): void {
    for (const anchor of this.lighterReplyAnchors) anchor.destroy();
    this.lighterReplyAnchors = [];
  }

  private lighterReplyWordPosition(): { x: number; y: number } {
    const lighter = this.lighterSprite;
    const wrenX = this.wrenContainer?.scene ? this.wrenContainer.x : SKY_WREN_STAGE_X;
    const wrenY = this.wrenContainer?.scene ? this.wrenContainer.y : SKY_WREN_STAGE_Y;
    if (!lighter?.scene) return { x: wrenX, y: wrenY - 176 };

    return {
      x: Phaser.Math.Clamp(
        Phaser.Math.Linear(wrenX, lighter.x, 0.4),
        380,
        this.scale.width - 380,
      ),
      y: Phaser.Math.Clamp(
        Math.min(wrenY - 270, lighter.y - LIGHTER_SPRITE_HEIGHT * 0.98),
        330,
        this.scale.height - 420,
      ),
    };
  }

  private makeEttaBookWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.ettaBookCue;
    if (!body?.scene) return this.makeEttaWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.ettaBookWordAnchors.indexOf(anchor);
      if (idx >= 0) this.ettaBookWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 26,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        this.pulseEttaBookCue(false);
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -26,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -26,
          depth: 58,
          ringRadius: 48,
          count: 10,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -26,
        targetOffsetY: 24,
      },
    );
    this.ettaBookWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeSkyForkWord(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    opts: TextWordTargetOptions,
    sourceOffsetY = -48,
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
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y + sourceOffsetY,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        playActorAttention(this, body, {
          tint: PALETTE_HEX.brass,
          scale: 1.022,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 46,
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
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY,
        targetOffsetY: 24,
      },
    );
    this.forkChoiceWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private showFork1Cues(): void {
    this.showEtta();
    if (!this.beaconFlameCue?.scene) {
      this.beaconFlameCue = this.createBeaconFlameCue();
    }
  }

  private showFork2Cues(): void {
    if (!this.kindAnswerCue?.scene) {
      this.kindAnswerCue = this.createKindAnswerCue();
    }
    if (!this.tetherThreadCue?.scene) {
      this.tetherThreadCue = this.createTetherThreadCue();
    }
  }

  private createBeaconFlameCue(): Phaser.GameObjects.Container {
    const c = this.add.container(1320, 792).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 126, 18, { y: 14, alpha: 0.18 }));
    const g = this.add.graphics();
    g.fillStyle(0x3b3025, 0.82);
    g.fillRoundedRect(-44, -38, 88, 46, 12);
    g.lineStyle(2, PALETTE_HEX.brass, 0.42);
    g.strokeRoundedRect(-44, -38, 88, 46, 12);
    g.fillStyle(PALETTE_HEX.brass, 0.78);
    g.fillTriangle(0, -126, -24, -62, 22, -62);
    g.fillStyle(0xfff0a8, 0.58);
    g.fillTriangle(4, -110, -12, -68, 18, -68);
    g.lineStyle(2, 0xffd989, 0.38);
    g.strokeEllipse(0, -78, 86, 54);
    g.strokeEllipse(0, -78, 118, 76);
    c.add(g);
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 430,
      spreadX: 34,
      spreadY: 20,
      offsetY: -72,
      alpha: 0.26,
      size: 4,
      depth: 41,
      driftY: -50,
      durationMs: 1300,
    });
    this.tweens.add({
      targets: c,
      y: 770,
      alpha: 0.92,
      duration: 680,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -4, durationMs: 2500 });
      },
    });
    return c;
  }

  private createKindAnswerCue(): Phaser.GameObjects.Container {
    const c = this.add.container(700, 798).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 134, 18, { y: 14, alpha: 0.18 }));
    const g = this.add.graphics();
    g.fillStyle(0x2c241b, 0.76);
    g.fillRoundedRect(-54, -46, 108, 54, 14);
    g.lineStyle(2, PALETTE_HEX.brass, 0.38);
    g.strokeRoundedRect(-54, -46, 108, 54, 14);
    g.lineStyle(2, 0xffe2a0, 0.42);
    g.lineBetween(-30, -21, 30, -21);
    g.lineBetween(-24, -6, 24, -6);
    g.fillStyle(0xffd989, 0.58);
    g.fillCircle(0, -80, 16);
    g.lineStyle(2, 0xffd989, 0.28);
    g.strokeCircle(0, -80, 32);
    c.add(g);
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 480,
      spreadX: 34,
      spreadY: 16,
      offsetY: -54,
      alpha: 0.22,
      size: 3.5,
      depth: 41,
      driftY: -44,
      durationMs: 1250,
    });
    this.tweens.add({
      targets: c,
      y: 778,
      alpha: 0.88,
      duration: 640,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -3, durationMs: 2600 });
      },
    });
    return c;
  }

  private createTetherThreadCue(): Phaser.GameObjects.Container {
    const c = this.add.container(1220, 798).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 132, 18, { y: 14, alpha: 0.18 }));
    const g = this.add.graphics();
    g.lineStyle(3, PALETTE_HEX.brass, 0.42);
    g.beginPath();
    g.moveTo(-52, -28);
    g.lineTo(-16, -72);
    g.lineTo(18, -38);
    g.lineTo(54, -92);
    g.strokePath();
    g.fillStyle(0x3f3120, 0.86);
    g.fillCircle(-52, -28, 9);
    g.fillCircle(54, -92, 10);
    g.fillStyle(0xffe4a8, 0.62);
    g.fillCircle(-16, -72, 6);
    g.fillCircle(18, -38, 6);
    g.lineStyle(1, 0xffe4a8, 0.24);
    g.strokeEllipse(0, -58, 130, 78);
    c.add(g);
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 500,
      spreadX: 38,
      spreadY: 20,
      offsetY: -50,
      alpha: 0.24,
      size: 3.5,
      depth: 41,
      driftY: -42,
      durationMs: 1250,
    });
    this.tweens.add({
      targets: c,
      y: 778,
      alpha: 0.9,
      duration: 640,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -4, durationMs: 2400 });
      },
    });
    return c;
  }

  private fadeOutForkCue(
    cue: Phaser.GameObjects.Container | null,
    opts: { riseY?: number; durationMs?: number } = {},
  ): void {
    if (!cue?.scene) return;
    this.tweens.killTweensOf(cue);
    this.tweens.add({
      targets: cue,
      y: cue.y + (opts.riseY ?? -18),
      alpha: 0,
      duration: opts.durationMs ?? 540,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (cue.scene) cue.destroy();
      },
    });
  }

  private clearSkyForkCues(): void {
    this.clearForkChoiceWordAnchors();
    for (const cue of [this.beaconFlameCue, this.kindAnswerCue, this.tetherThreadCue]) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
    this.beaconFlameCue = null;
    this.kindAnswerCue = null;
    this.tetherThreadCue = null;
  }

  private makeLanternMothWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.lanternMothCompanion;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.lanternMothWordAnchors.indexOf(anchor);
      if (idx >= 0) this.lanternMothWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 70,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        this.pulseLanternMothCompanion();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -70,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: -70,
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
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -70,
        targetOffsetY: 24,
      },
    );
    this.lanternMothWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private playWrenTypingPulse(): void {
    playBodyTypePulse(this, this.wrenContainer, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      offsetY: -108,
      depth: 58,
      ringRadius: 22,
    });
  }

  private makeScholarBossWord(opts: TextWordTargetOptions): TextWordTarget {
    if (!this.bossContainer) return this.makeWord(opts);
    const body = this.bossContainer;
    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.bossWordAnchors.indexOf(anchor);
      if (idx >= 0) this.bossWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.brass,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: 0,
          depth: 58,
          ringRadius: 30,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mote",
          color: PALETTE_HEX.brass,
          offsetY: 0,
          depth: 58,
          ringRadius: 58,
          count: 14,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.brass,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: 0,
        targetOffsetY: 24,
      },
    );
    this.bossWordAnchors.push(anchor);
    return target;
  }

  private clearBossWordAnchors(): void {
    for (const anchor of this.bossWordAnchors) anchor.destroy();
    this.bossWordAnchors = [];
  }

  private clearPathWordAnchors(): void {
    for (const anchor of this.pathWordAnchors) anchor.destroy();
    this.pathWordAnchors = [];
  }

  private clearEttaWordAnchors(): void {
    for (const anchor of this.ettaWordAnchors) anchor.destroy();
    this.ettaWordAnchors = [];
  }

  private clearEttaBookWordAnchors(): void {
    for (const anchor of this.ettaBookWordAnchors) anchor.destroy();
    this.ettaBookWordAnchors = [];
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private clearLanternMothWordAnchors(): void {
    for (const anchor of this.lanternMothWordAnchors) anchor.destroy();
    this.lanternMothWordAnchors = [];
  }

  private clearActiveTargets(): void {
    this.clearBossWordAnchors();
    this.clearPathWordAnchors();
    this.clearEttaWordAnchors();
    this.clearEttaBookWordAnchors();
    this.clearForkChoiceWordAnchors();
    this.clearLanternMothWordAnchors();
    this.dismissRevisitMemoryCue(false);
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawTempleStones(): void {
    // The painted Sky backdrop already carries the edge ruins and posts. Extra
    // procedural stones read as translucent UI bars during the opener.
  }

  /** Phaser update tick. Drives per-frame lantern blur on active phrases —
   *  alpha drops as a banner enters a lantern's beam, restores between. */
  update(): void {
    if (this.activePhrases.length === 0) return;
    // Tier 4 — warm-light (Firefly Lantern / Beacon Spark / Pelt) softens the
    // lantern blur that eats untyped letters, capped at 33% so the read-ahead
    // hazard still bites. 1 − 0 = full blur with no such relic.
    const blurScale = 1 - this.combat.warmLight;
    for (const phrase of this.activePhrases) {
      phrase.setBlur(
        blurAmountAt(phrase.getX(), LANTERN_BLUR_XS, LANTERN_BLUR_RADIUS) *
          blurScale,
      );
    }
  }

  /** Three vertical light beams that obscure phrases passing through them.
   *  Drawn once for the entire 5-temple sequence; the SHUTDOWN hook cleans up.
   *  Beam alpha is intentionally readable but soft — the player should see the
   *  zone, but the beams shouldn't compete with the phrase banners they obscure. */
  private drawTempleLanterns(): void {
    for (const x of LANTERN_BLUR_XS) {
      const g = this.add.graphics().setDepth(15);
      const beamTop = 220;
      const beamBottom = 660;
      const halfWidth = LANTERN_BLUR_RADIUS;
      // Outer halo — soft amber wash across the full blur radius
      g.fillStyle(0xf5c842, 0.12);
      g.fillRect(x - halfWidth, beamTop, halfWidth * 2, beamBottom - beamTop);
      // Inner brighter core — narrower column for the "you're in the zone" cue
      g.fillStyle(0xfdedb0, 0.18);
      g.fillRect(x - 36, beamTop, 72, beamBottom - beamTop);
      // Lantern body at the top of the beam
      g.fillStyle(0xd49020, 0.85);
      g.fillEllipse(x, beamTop + 20, 40, 54);
      g.fillStyle(0xfdedb0, 0.95);
      g.fillEllipse(x, beamTop + 20, 18, 24);
      // Hanging string
      g.lineStyle(1.5, 0x8a7060, 0.85);
      g.beginPath();
      g.moveTo(x, beamTop - 30);
      g.lineTo(x, beamTop);
      g.strokePath();
      // Gentle pulse — the beam breathes so it doesn't feel like dead UI
      this.tweens.add({
        targets: g,
        alpha: { from: 0.85, to: 1 },
        duration: 2200 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.templeLanterns.push(g);
    }
  }

  private drawAmbientLanterns(): void {
    this.clearAmbientLanterns();
    // Decorative background lanterns hanging at various heights. These stay
    // behind the active path cue so the opener does not read as scattered UI.
    const lanternPositions = [
      { x: 240, y: 420 },
      { x: 480, y: 360 },
      { x: 720, y: 440 },
      { x: 960, y: 320 },
      { x: 1200, y: 400 },
      { x: 1440, y: 360 },
      { x: 1680, y: 440 },
      { x: 380, y: 540 },
      { x: 840, y: 500 },
      { x: 1100, y: 520 },
      { x: 1540, y: 480 },
    ];

    lanternPositions.forEach(({ x, y }) => {
      const g = this.add.graphics().setDepth(-4).setAlpha(0.42);
      // Hanging string
      g.lineStyle(1, 0x8a7060, 0.34);
      g.beginPath();
      g.moveTo(x, y - 36);
      g.lineTo(x, y - 10);
      g.strokePath();
      // Glow halo
      g.fillStyle(0xf5c842, 0.045);
      g.fillEllipse(x, y, 56, 58);
      // Lantern body
      g.fillStyle(0xd49020, 0.3);
      g.fillRoundedRect(x - 10, y - 15, 20, 30, 9);
      g.lineStyle(1.4, 0xfdedb0, 0.24);
      g.strokeRoundedRect(x - 10, y - 15, 20, 30, 9);
      g.fillStyle(0xfdedb0, 0.42);
      g.fillEllipse(x, y, 8, 13);

      // Gentle idle drift
      this.tweens.add({
        targets: g,
        y: { from: 0, to: -6 },
        duration: 1400 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 1000,
      });
      this.ambientLanterns.push(g);
    });
  }

  private setAmbientLanternFieldAlpha(alpha: number, durationMs: number): void {
    const lanterns = this.ambientLanterns.filter((g) => g.scene);
    if (lanterns.length === 0) return;
    this.tweens.add({
      targets: lanterns,
      alpha,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });
  }

  private clearAmbientLanterns(): void {
    this.ambientLanterns.forEach((g) => {
      if (!g.scene) return;
      this.tweens.killTweensOf(g);
      g.destroy();
    });
    this.ambientLanterns = [];
  }

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 92, 20, { y: 6, alpha: 0.28 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    stageContainerEntrance(this, c, {
      breathDy: -5,
      breathMs: 2200,
    });
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 620,
      spreadX: 30,
      spreadY: 12,
      offsetY: -90,
      color: 0xf2cc65,
      alpha: 0.18,
      size: 2.8,
      depth: 0.28,
      driftX: 34,
      driftY: -34,
      durationMs: 920,
    });
    return c;
  }

  private showLanternLighter(): void {
    if (this.lighterSprite?.scene) return;

    const sprite = this.add
      .image(LIGHTER_SPRITE_X, LIGHTER_SPRITE_Y, "sky-lantern-spirit")
      .setOrigin(0.5, 1)
      .setDepth(LIGHTER_SPRITE_DEPTH);
    sprite.setScale(LIGHTER_SPRITE_HEIGHT / sprite.height);
    this.lighterSprite = sprite;

    stageAnchoredSprite(this, sprite, {
      shadowWidth: 96,
      shadowHeight: 18,
      shadowOffsetY: 8,
      shadowAlpha: 0.14,
      restAlpha: LIGHTER_RESTING_ALPHA,
      entranceOffsetY: 16,
      entranceMs: 720,
      breathDy: -5,
      breathMs: 2400,
      breathDelayMs: 120,
    });
    playSceneEventPulse(this, {
      kind: "mote",
      color: PALETTE_HEX.brass,
      x: sprite.x,
      y: sprite.y - LIGHTER_SPRITE_HEIGHT * 0.55,
      depth: LIGHTER_SPRITE_DEPTH + 1,
      durationMs: 620,
      ringWidth: 150,
      ringHeight: 86,
      count: 8,
      alpha: 0.14,
      spreadX: 54,
      spreadY: 26,
    });
  }

  private hideLanternLighter(): void {
    const sprite = this.lighterSprite;
    this.clearLighterReplyAnchors();
    if (!sprite?.scene) {
      this.lighterSprite = null;
      return;
    }
    this.lighterSprite = null;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 520,
      riseY: -22,
    });
  }

  /** Draw the Scholar-Spirit boss: rotating rings of amber dots */
  private drawScholarSpirit(): Phaser.GameObjects.Container {
    const bx = this.scale.width / 2;
    const by = 400;
    const c = this.add.container(bx, by);
    c.setAlpha(0);
    c.y = by - 24;
    c.add(this.makeScholarSpiritSigil());

    // Painted Scholar-Spirit body, scaled to the old ~160px silhouette height
    // (head + torso). Replaces the concentric-ellipse figure, orbiting dot
    // rings, and amber "eyes" — those reads now live in the painting.
    const sprite = this.add.image(0, 0, "scholar-spirit");
    sprite.setScale(SCHOLAR_SPIRIT_HEIGHT / sprite.height);
    c.add(sprite);
    this.bossSprite = sprite;

    // Slow shimmer — the same scale oscillation as before, on the container.
    this.bossRingTween = this.tweens.add({
      targets: c,
      scaleX: { from: 1, to: 1.04 },
      scaleY: { from: 1, to: 0.97 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.tweens.add({
      targets: c,
      alpha: 1,
      y: by,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => this.playScholarStagePulse(),
    });
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 560,
      spreadX: 54,
      spreadY: 24,
      offsetY: 38,
      color: 0xf5c842,
      alpha: 0.2,
      size: 3.2,
      depth: 0.22,
      driftX: 26,
      driftY: -38,
      durationMs: 1180,
    });

    return c;
  }

  private makeScholarSpiritSigil(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const y = SCHOLAR_SPIRIT_HEIGHT * 0.42;
    c.add(addLocalGroundShadow(this, 150, 22, {
      y: y + 4,
      alpha: 0.18,
      color: 0x020611,
    }));

    const sigil = this.add.graphics();
    sigil.fillStyle(0xf5c842, 0.09);
    sigil.fillEllipse(0, y, 176, 34);
    sigil.fillStyle(0x8ab4f5, 0.055);
    sigil.fillEllipse(0, y - 6, 116, 22);
    sigil.lineStyle(2, 0xf5c842, 0.22);
    sigil.strokeEllipse(0, y, 184, 38);
    sigil.lineStyle(1, 0xfdedb0, 0.2);
    sigil.lineBetween(-74, y - 2, -32, y - 8);
    sigil.lineBetween(-18, y + 7, 22, y - 6);
    sigil.lineBetween(34, y - 4, 78, y + 4);
    sigil.fillStyle(0xfdedb0, 0.2);
    sigil.fillCircle(-48, y - 7, 2.6);
    sigil.fillCircle(50, y - 3, 2.4);
    sigil.fillCircle(0, y - 10, 2);
    c.add(sigil);
    return c;
  }

  private playScholarStagePulse(intense = false): void {
    if (!this.bossContainer) return;
    playBodyImpact(this, this.bossContainer, {
      kind: "mote",
      color: intense ? 0x8ab4f5 : PALETTE_HEX.brass,
      offsetY: 0,
      depth: 58,
      ringRadius: intense ? 74 : 60,
      count: intense ? 18 : 14,
      durationMs: intense ? 560 : 480,
    });
  }

  /** "The spirit's eyes shift colour" — a brief tint flash on the boss body,
   *  the painted-sprite stand-in for the old amber-eye redraw. */
  private flashBossEyes(): void {
    if (!this.bossSprite) return;
    this.bossSprite.setTint(0x8ab4f5);
    this.time.delayedCall(600, () => this.bossSprite?.clearTint());
  }

  private tweenBossBow(): void {
    if (!this.bossContainer) return;
    this.tweens.add({
      targets: this.bossContainer,
      y: (this.bossContainer.y ?? 400) + 30,
      duration: 300,
      ease: "Sine.easeOut",
      yoyo: true,
    });
  }

  private spawnBossLanternBurst(): void {
    const cx = this.scale.width / 2;
    const cy = 400;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const g = this.add.graphics();
      g.fillStyle(0xf5c842, 0.7);
      g.fillEllipse(cx, cy, 18, 26);
      g.fillStyle(0xfdedb0, 0.9);
      g.fillEllipse(cx, cy, 8, 10);
      const targetX = cx + Math.cos(angle) * (120 + Math.random() * 80);
      const targetY = cy + Math.sin(angle) * 70 - 100 - Math.random() * 80;
      this.tweens.add({
        targets: g,
        x: targetX - cx,
        y: targetY - cy,
        alpha: 0,
        duration: 1200 + Math.random() * 600,
        ease: "Sine.easeOut",
        onComplete: () => g.destroy(),
      });
    }
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function filterWordsByLength(
  bank: readonly string[],
  minLen: number,
  maxLen: number,
): readonly string[] {
  const filtered = bank.filter((w) => w.length >= minLen && w.length <= maxLen);
  return filtered.length >= 3 ? filtered : bank;
}

function shuffleArr<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
