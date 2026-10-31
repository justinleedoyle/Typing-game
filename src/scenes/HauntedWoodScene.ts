import { beginAssetLoad, assetLoadBlocked } from "../game/assetLoadRecovery";
import { installChapterMenu } from "../game/ui/pauseMenu";
import { applySceneActorLighting } from "../game/actorLighting";
import { rememberRealmFork, resolveRealmFork, resolveCompanionDecision, rememberCompanionDecision, type RealmFork } from "../game/realmChoices";
import { ChapterReading } from "../game/ui/chapterReading";
import { reducedFlashes, reducedMotion } from "../game/presentation";
import Phaser from "phaser";
import { type AmbientHandle, playAmbientWood } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { playBellToll } from "../audio/bellToll";
import { playSparkZap } from "../audio/sparkZap";
import { flashDamageVignette, playWordCompleteBurst } from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
import { showLowHeartFeedback } from "../game/lowHeartFeedback";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import {
  BIND_BEAT_FREEZE_MS,
  type CombatLoadout,
  COMPANION_TRIP_DELAY_MS,
  ONESHOT_SOUL_COST,
  resolveCombatLoadout,
} from "../game/relicEffects";
import {
  isOffensiveOneShot,
  type OffensiveOneShot,
} from "../game/oneShotInvocation";
import { OneShotInvoker, type OneShotThreat } from "../game/oneShotInvoker";
import { tripMostAdvancedFoe } from "../game/companionTrip";
import type { SaveStore, SaveCheckpoint } from "../game/saveState";
import { WOOD_STEPS, woodStep, woodIndex, type WoodStep } from "../game/woodCheckpoint";
import { TypingInputController } from "../game/typingInput";
import { MovingWordEnemy } from "../game/movingWordEnemy";
import {
  HAUNTED_WOOD_BASE_BANK,
  pickAdaptiveWords,
  type WoodDirection,
  WOOD_DIRECTION_PUNCTUATION,
  woodWardWord,
} from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  addAmbientDrift,
  addContainerWake,
  attachWordBodyAnchor,
  dismissCompanionCameo,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  playActorAttention,
  playBodyContactCue,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playPortalArrivalWake,
  playRealmClearResonance,
  playRealmReturnDeparture,
  playSceneEventPulse,
  stageCompanionCameo,
  stageContainerEntrance,
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
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons } from "../game/ui/satchelIcons";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import hauntedWoodBackdrop from "../../art/references/haunted-wood-clean.png";
import woodGhostSprite from "../../art/wood/ghost.png";
import ghostKingSprite from "../../art/wood/ghost-king.png";
import rootThroneSprite from "../../art/wood/root-throne.png";
import runaPortrait from "../../art/runa/runa-front.png";
import wispCatSprite from "../../art/companions/wisp-cat.png";
import snowFoxSprite from "../../art/companions/snow-fox.png";
import groveFireSprite from "../../art/effects/grove-fire.png";
import boneFluteSprite from "../../art/relics/bone-flute.png";
import ashVialSprite from "../../art/relics/ash-vial.png";
import offeringShrineSprite from "../../art/wood/offering-shrine.png";
import fluteHollowSprite from "../../art/wood/flute-hollow.png";

interface HauntedWoodSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// ─── Ghost enemy ──────────────────────────────────────────────────────────────

// Wood ghosts are now the shared MovingWordEnemy. Their compass direction only
// matters at spawn (it picks the punctuation + the off-screen start position), so
// it's threaded through spawnGhost rather than stored on the enemy.

// ─── Constants ────────────────────────────────────────────────────────────────

const WREN_X = 960;
const WREN_Y = 826;
const WOOD_PATH_STAGE_Y = 826;
const WOOD_ROOT_CUE_Y = 792;
const WOOD_CANOPY_CUE_Y = 674;
const WOOD_LANTERN_CUE_Y = 782;
const WOOD_NORTH_GHOST_REST_Y = 340;
const WOOD_SOUTH_GHOST_REST_Y = 792;
const WOOD_SIDE_GHOST_REST_Y = 704;
const WOOD_SIDE_GHOST_STEP_Y = 46;
const WOOD_BRANCH_WORD_Y = 500;
const GHOST_KNOCKBACK_PAUSE_MS = 1800;
const WARD_INPUT_HINT = "At · use the approach mark: above . / below ! / left , / right ?; type the other letters.";

// Ghost advance durations (ms). Words with punctuation chars are faster.
const GHOST_ADVANCE_SLOW = 18000;
const GHOST_ADVANCE_FAST = 11000;

// Mist roll fires every 30 s
const MIST_INTERVAL_MS = 30000;

// Danger ramps in over the LAST 50% of a ghost's advance — later than wolves
// (WM uses 0.4) because Haunted Wood ghost words are shorter punctuated
// fragments that resolve quickly; a later ramp keeps the warning readable.
const DANGER_RAMP_START = 0.5;

// Wisp-themed pale gray-green burst — frame ghost defeats as "down in mist,"
// not the default brass. Matches the ghost body tint.
const GHOST_BURST_COLOR = 0xdde8dd;

// Painted-sprite display heights (px). Combat ghosts started at the old
// procedural blob height, but the living-scene pass needs the painted body and
// mist source to carry the threat, not only the punctuated word. The king figure
// (crown down through the body ellipse, throne excluded) spanned ~232px.
// Tune on live.
const WOOD_GHOST_SPRITE_HEIGHT = 124;
const GHOST_KING_SPRITE_HEIGHT = 232;
const INGA_GHOST_SPRITE_HEIGHT = 92;
const INGA_FOREGROUND = { x: 560, y: 760 } as const;
const INGA_TREE_LINE = { x: 390, y: 642, alpha: 0.44, scale: 0.74 } as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the word contains any of . , ? ! ; : */
function hasPunctuation(word: string): boolean {
  return /[.,?!;:]/.test(word);
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class HauntedWoodScene extends Phaser.Scene {
  private store!: SaveStore;
  private resumeCheckpoint: SaveCheckpoint | null = null;
  private checkpointStep: WoodStep = "arrival";
  private combatSatchel: string[] = [];
  private usedOneShots: OffensiveOneShot[] = [];
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private reading!: ChapterReading;
  private chapterMenu?: ReturnType<typeof installChapterMenu>;
  private band!: ConsoleBand;
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  private ghosts: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  /** Continuation to run when the current ghost wave is fully cleared. Each
   *  spawner sets its own; checkGhostWaveComplete fires and clears it. This
   *  replaces the old "read the narrator caption and substring-match it"
   *  routing, which silently soft-locked the realm whenever a caption was
   *  reworded (it had, at crossroads 1). */
  private onWaveCleared: (() => void) | null = null;

  // Fork choices tracked for save state
  private fork1Choice: "offering" | "bone-flute" | null = null;
  private fork2Choice: "bargain" | "force" | null = null;
  private companionChoice: "call" | "leave" | null = null;
  /** True after the Quiet Lord's §5.5.10 intrusion has fired this playthrough. */
  private quietLordIntruded = false;

  // Tier 4 — relics from earlier realms shape this realm's combat. Wood is the
  // last realm, so this is the richest satchel: warm-light softens the mist's
  // blind, wind-phrase's mist-clear lifts it entirely, Etta's Ledger's auto-ease
  // marks the easiest ghost, and quiet-advance slows the approach. (Grace is
  // gated out — a Wood breach costs no resource.) Resolved once in create();
  // neutral on a revisit, which has no combat.
  private combat: CombatLoadout = resolveCombatLoadout([], "haunted-wood");
  private waveForgivenessReady = false;
  private snowFoxTripNoticed = false;
  private shrineForgivenessNoticed = false;
  // Tier 4 — Soul-charged typed invocation for offensive one-shots. Wood is the
  // last realm and richest satchel, so it can hold all three: toll-strike
  // (bells-tongue), jam-foe (sabotage-wrench), and bind-beat (tether-cord). Null
  // until create().
  private oneShotInvoker: OneShotInvoker<MovingWordEnemy> | null = null;

  private mistTimer: Phaser.Time.TimerEvent | null = null;
  private wardPracticeActive = false;
  private wardPracticeBody: Phaser.GameObjects.Container | null = null;
  private wardPracticeTarget: TextWordTarget | null = null;
  private wardPracticeGeneration = 0;
  private shrineFigure: Phaser.GameObjects.Container | null = null;
  private offeringCue: Phaser.GameObjects.Container | null = null;
  private boneFluteCue: Phaser.GameObjects.Container | null = null;
  private boneFluteProp: Phaser.GameObjects.Image | null = null;
  private heldWoodRelic: Phaser.GameObjects.Image | null = null;
  private fluteHandoffPending = false;
  private groveLightCue: Phaser.GameObjects.Container | null = null;
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private pathCue: Phaser.GameObjects.Container | null = null;
  private pathCueIndex: number | null = null;
  private pathCueWordAnchor: WordBodyAnchorHandle | null = null;
  private ambientMistFields: Phaser.GameObjects.Container[] = [];
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;
  private ingaFigure: Phaser.GameObjects.Container | null = null;
  private ingaWordAnchors: WordBodyAnchorHandle[] = [];
  private ghostKingBody: Phaser.GameObjects.Image | null = null;
  private bossWordAnchors: WordBodyAnchorHandle[] = [];
  private wispCatCompanion: Phaser.GameObjects.Container | null = null;
  private wispCatWordAnchors: WordBodyAnchorHandle[] = [];
  /** Four faint punctuation glyphs at N/S/E/W around Wren — teaches the
   *  direction-punctuation mapping diegetically. Drawn on first ghost
   *  spawn, persists through Act 2 + boss. */
  private compassGlyphs: Phaser.GameObjects.Text[] = [];
  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("HauntedWoodScene");
  }

  init(data: HauntedWoodSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    const saved = this.store.get();
    this.resumeCheckpoint = !this.revisit && !saved.realms["haunted-wood"]?.cleared
      && saved.checkpoint?.scene === "HauntedWoodScene" ? saved.checkpoint : null;
    this.checkpointStep = woodStep(this.resumeCheckpoint?.step);
    this.combatSatchel = typeof this.resumeCheckpoint?.data.combatSatchel === "string"
      ? this.resumeCheckpoint.data.combatSatchel.split(",").filter(Boolean) : [...saved.satchel];
    this.usedOneShots = typeof this.resumeCheckpoint?.data.spentOneShots === "string"
      ? this.resumeCheckpoint.data.spentOneShots.split(",").filter((effect): effect is OffensiveOneShot => ["toll-strike", "bind-beat", "jam-foe"].includes(effect)) : [];
    this.ghosts = [];
    this.activeTargets = [];
    this.oneShotInvoker = null;
    this.onWaveCleared = null;
    this.fork1Choice = resolveRealmFork("haunted-wood", "fork1", this.store.get().realms["haunted-wood"], this.store.get().satchel) as typeof this.fork1Choice;
    this.fork2Choice = resolveRealmFork("haunted-wood", "fork2", this.store.get().realms["haunted-wood"], this.store.get().satchel) as typeof this.fork2Choice;
    const companion = resolveCompanionDecision("haunted-wood", this.store.get().realms["haunted-wood"], this.store.get().satchel);
    this.companionChoice = companion === "accepted" ? "call" : companion === "declined" ? "leave" : null;
    this.mistTimer = null;
    this.wardPracticeActive = false;
    this.wardPracticeBody = null;
    this.wardPracticeTarget = null;
    this.wardPracticeGeneration += 1;
    this.shrineFigure = null;
    this.offeringCue = null;
    this.boneFluteCue = null;
    this.boneFluteProp = null;
    this.heldWoodRelic = null;
    this.fluteHandoffPending = false;
    this.groveLightCue = null;
    this.forkChoiceWordAnchors = [];
    this.snowFoxTripNoticed = false;
    this.shrineForgivenessNoticed = false;
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.pathCue = null;
    this.pathCueIndex = null;
    this.pathCueWordAnchor = null;
    this.ambientMistFields = [];
    this.ingaFigure = null;
    this.ingaWordAnchors = [];
    this.ghostKingBody = null;
    this.bossWordAnchors = [];
    this.wispCatCompanion = null;
    this.wispCatWordAnchors = [];
    this.quietLordIntruded =
      this.store.get().realms["haunted-wood"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    beginAssetLoad(this);
    this.load.image("haunted-wood-backdrop", hauntedWoodBackdrop);
    this.load.image("wood-ghost", woodGhostSprite);
    this.load.image("ghost-king", ghostKingSprite);
    this.load.image("wood-root-throne", rootThroneSprite);
    this.load.image("wood-companion-wisp-cat", wispCatSprite);
    this.load.image("wood-companion-snow-fox", snowFoxSprite);
    this.load.image("wood-grove-fire", groveFireSprite);
    this.load.image("wood-bone-flute", boneFluteSprite);
    this.load.image("wood-ash-vial", ashVialSprite);
    this.load.image("wood-offering-shrine", offeringShrineSprite);
    this.load.image("wood-flute-hollow", fluteHollowSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    if (assetLoadBlocked(this)) return;
    this.chapterMenu = installChapterMenu(this, {
      store: this.store,
      hasClaim: () => !!this.typingInput && (this.typingInput.hasClaim() || this.typingInput.getTypingBuffer().length > 0),
      onLeave: () => this.scene.start("PortalChamberScene", { store: this.store }),
      leaveHint: "Your progress is saved. Returning resumes this part of the journey; an unfinished encounter restarts from its entry state.",
    });
    this.cameras.main.fadeIn(600, 14, 18, 14);
    // The painted floor and its rooted props share one fixed physical frame.
    this.add
      .image(0, 0, "haunted-wood-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    this.ambientMistFields.push(
      addAmbientDrift(this, {
        kind: "mist",
        count: 24,
        depth: -2,
        area: { x: -160, y: 430, width: this.scale.width + 320, height: 330 },
        alpha: 0.1,
        minSize: 5,
        maxSize: 11,
        driftX: 260,
        driftY: -30,
        minDurationMs: 9000,
        maxDurationMs: 17000,
      }),
    );
    addLivingLight(this, {
      x: 960,
      y: 770,
      width: 500,
      height: 270,
      color: 0xa7d8a2,
      alpha: 0.045,
      depth: -5,
      durationMs: 3600,
    });
    addLivingLight(this, {
      x: 470,
      y: 520,
      width: 360,
      height: 230,
      color: 0x9271c9,
      alpha: 0.035,
      depth: -6,
      durationMs: 4700,
      delayMs: 900,
      scale: 1.04,
    });
    addLivingLight(this, {
      x: 1460,
      y: 520,
      width: 360,
      height: 230,
      color: 0x7fbf88,
      alpha: 0.035,
      depth: -6,
      durationMs: 4300,
      delayMs: 1300,
      scale: 1.04,
    });
    this.ambientMistFields.push(
      addAmbientDrift(this, {
        kind: "mist",
        count: 12,
        depth: -1.45,
        area: { x: -180, y: 500, width: this.scale.width + 360, height: 260 },
        alpha: 0.085,
        minSize: 11,
        maxSize: 24,
        driftX: 320,
        driftY: -42,
        minDurationMs: 8200,
        maxDurationMs: 16000,
      }),
    );
    this.ambientMistFields.push(
      addAmbientDrift(this, {
        kind: "mist",
        count: 10,
        depth: -0.35,
        area: { x: WREN_X - 330, y: WREN_Y - 170, width: 660, height: 190 },
        alpha: 0.08,
        minSize: 8,
        maxSize: 18,
        driftX: 220,
        driftY: -24,
        minDurationMs: 6400,
        maxDurationMs: 13000,
      }),
    );
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);
    playSceneEventPulse(this, {
      kind: "mist",
      color: 0xa7d8a2,
      x: this.wrenContainer.x,
      y: this.wrenContainer.y - 86,
      depth: -0.25,
      durationMs: 780,
      ringWidth: 260,
      ringHeight: 86,
      count: 8,
      alpha: 0.09,
      spreadX: 122,
      spreadY: 34,
    });

    // Tier 4 — a revisit is a free-passage replay (no combat) → neutral loadout.
    // Resolved here (before the band) so the console band can show the passive
    // relic icons. Wood is the richest satchel; neutral on a revisit.
    this.combat = resolveCombatLoadout(
      this.revisit ? [] : this.combatSatchel,
      "haunted-wood",
    );

    // UI cohesion — the console band houses the meters + satchel. Wood's mist is
    // a vision overlay (not a bottom meter), so the satchel zone shows the passive
    // relic icon tiles; the offensive one-shots drop into the band's charge cards.
    this.band = new ConsoleBand(this, {
      activity: () => (
        this.wardPracticeActive
        || this.ghosts.some(ghost => !ghost.isDefeated())
        || (["capstone", "final1", "final2"].includes(this.checkpointStep) && this.activeTargets.some(target => !target.isComplete()))) ? "combat" : "story",
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
    this.reading = new ChapterReading(this, () => Math.max(316, this.narration.bottom() + 40));

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        if (this.wardPracticeActive) return;
        // forgive-wave-miss (Shrine-Token): spare the first miss of a wave its
        // flinch. Dormant on a forward run (Shrine-Token is earned here, at the
        // end), wired for consistency + revisit-combat forward-compat.
        if (this.waveForgivenessReady) {
          this.waveForgivenessReady = false;
          this.flashForgiven();
          this.noticeShrineForgiveness();
          return;
        }
        flashWrenMiss(this.wrenSprite);
        if (!reducedMotion(this)) this.cameras.main.shake(80, 0.002);
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
          kind: "mist",
          color: PALETTE_HEX.moss,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Tier 4 — Wood is the richest satchel; it can hold all three offensive
    // one-shots. The widget sits just above Wren. Threats are the live, non-frozen
    // ghosts (the boss's every-punctuation capstone is a stationary passage, NOT
    // in `this.ghosts`, so a one-shot can't trivialise it).
    this.oneShotInvoker = new OneShotInvoker<MovingWordEnemy>({
      scene: this,
      typingInput: this.typingInput,
      available: offensiveOneShots,
      initialSpent: this.usedOneShots,
      cost: ONESHOT_SOUL_COST,
      getSoul: () => this.typingInput.getStats().getSoul(),
      spendSoul: (cost) => this.typingInput.getStats().spendSoul(cost),
      getThreats: () => this.liveGhostThreats(),
      applyEffect: (effect, targets) => this.applyOneShot(effect, targets),
      isActive: () =>
        !this.wardPracticeActive && this.ghosts.length > 0 && this.ghosts.some((g) => !g.isDefeated()),
      announce: (text) => this.band.showNotice(text, { label: "one-shot" }),
      slots: band.oneShotSlots,
      compact: true,
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.wardPracticeActive = false;
      this.clearWardPracticeVisual();
      this.reading.destroy();
      this.chapterMenu?.destroy();
      this.typingInput.reset();
      this.oneShotInvoker?.destroy();
      this.oneShotInvoker = null;
      this.mistTimer?.remove();
      if (this.wrenContainer?.scene) this.tweens.killTweensOf(this.wrenContainer);
      this.compassGlyphs.forEach((g) => g.destroy());
      this.compassGlyphs = [];
      this.clearWoodForkCues();
      this.shrineFigure = null;
      this.releasePathCueWordAnchor();
      this.pathCue = null;
      this.pathCueIndex = null;
      this.dismissRevisitMemoryCue(false);
      this.clearIngaWordAnchors();
      this.ingaFigure = null;
      this.ghostKingBody = null;
      this.wispCatCompanion = null;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
      this.ambientMistFields = [];
    });

    this.ambientHandle = playAmbientWood();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    if (this.resumeCheckpoint) {
      this.typingInput.getStats().restoreCheckpoint(this.resumeCheckpoint.data);
      this.resumeWood(this.resumeCheckpoint);
    } else this.startArrival();
  }

  private checkpoint(step: WoodStep, data: SaveCheckpoint["data"] = {}): void {
    if (this.revisit || this.store.get().realms["haunted-wood"]?.cleared) return;
    this.checkpointStep = step;
    const stats = this.typingInput.getStats().captureCheckpoint();
    this.store.update(state => {
      state.realms["haunted-wood"] ??= { cleared: false, choices: {} };
      state.checkpoint = { scene: "HauntedWoodScene", step, data: {
        ...stats, combatSatchel: this.combatSatchel.join(","),
        spentOneShots: this.usedOneShots.join(","), ...data,
      } };
    });
  }

  /** Rebuild the actors and grounded props before presenting the saved beat. */
  private resumeWood(checkpoint: SaveCheckpoint): void {
    const step = woodStep(checkpoint.step);
    const index = woodIndex(checkpoint.data.index, 100);
    const response = checkpoint.data.response === true;
    const begun = checkpoint.data.begun === true;
    const at = WOOD_STEPS.indexOf(step);
    if (step !== "arrival") {
      this.tweens.killTweensOf(this.wrenContainer);
      this.wrenContainer.setPosition(WREN_X, WREN_Y).setScale(1).setAlpha(1);
    }
    if (at >= WOOD_STEPS.indexOf("inga")) {
      this.drawInga(INGA_FOREGROUND.x, INGA_FOREGROUND.y);
      if (at >= WOOD_STEPS.indexOf("act2") &&
        !(this.fork1Choice === "offering" && at >= WOOD_STEPS.indexOf("offering-reward"))) this.stageIngaAtTreeLine();
    }
    if (at >= WOOD_STEPS.indexOf("fork1") && step !== "fork1") this.drawShrine();
    if (["offering", "flute", "flute-reward"].includes(step)) this.showFork1Cues();
    if (at >= WOOD_STEPS.indexOf("fork2")) {
      this.drawGhostKing(at < WOOD_STEPS.indexOf("sealed"));
      if (this.fork2Choice === "force" && step !== "fork2" && at < WOOD_STEPS.indexOf("sealed")) this.igniteGroveLightCue();
    }
    if (step === "path" || step === "inga") this.setAmbientMistFieldAlpha(0.2, 0);
    if (at >= WOOD_STEPS.indexOf("ward")) this.ensureCompassDrawn();
    if (at >= WOOD_STEPS.indexOf("act2")) {
      this.setAmbientMistFieldAlpha(0.78, 0);
      if (at < WOOD_STEPS.indexOf("fork1")) this.startWoodMist();
    }
    const routes: Record<WoodStep, () => void> = {
      arrival: () => this.startArrival(),
      path: () => {
        if (!response && index > 0) {
          this.showPathCue(Math.min(index - 1, 2));
          const previous = this.pathWrenPosition(Math.min(index - 1, 2));
          this.wrenContainer.setPosition(previous.x, previous.y);
        } else if (!response) this.stageWrenAtPathEntrance();
        this.startPathExploration(index, response);
      },
      inga: () => this.startIngaNPC(index),
      act2: () => this.startAct2(),
      "ward-intro": () => this.startCrossroads1(),
      ward: () => this.startWardPractice(index, response),
      crossroads1: () => this.beginCrossroads1(),
      "crossroads1-cleared": () => this.onCrossroads1Cleared(),
      "crossroads2-intro": () => this.startCrossroads2(),
      crossroads2: () => this.beginCrossroads2(),
      "crossroads3-intro": () => this.startCrossroads3(),
      crossroads3: () => this.beginCrossroads3(),
      fork1: () => this.startFork1(),
      offering: () => this.startFork1Offering(index, response, begun),
      "offering-reward": () => this.finishOffering(),
      "inga-name": () => this.startIngaNameReveal(),
      "inga-name-answer": () => this.finishIngaName(),
      flute: () => this.startFork1BoneFlute(index, response, begun),
      "flute-reward": () => {
        this.fadeOutForkCue(this.offeringCue);
        this.offeringCue = null;
        this.settleBoneFluteInHand(() => this.finishFlute());
      },
      act3: () => this.startAct3(),
      fork2: () => this.startFork2(),
      bargain: () => this.startFork2Bargain(index, response, begun),
      "bargain-reward": () => this.finishBargain(),
      force: () => this.startFork2Force(),
      "boss-intro": () => this.startBossFight(),
      "boss-a": () => this.spawnBossWaveA(),
      "boss-a-cleared": () => this.onBossWaveACleared(),
      "boss-b": () => this.spawnBossWaveB(),
      "boss-b-cleared": () => this.onBossWaveBCleared(),
      capstone: () => this.startBossCapstone(index, begun),
      "capstone-answer": () => this.finishCapstone(),
      "final-intro": () => this.startFinalPassage(),
      final1: () => this.deliverFinalPassage(index),
      final2: () => this.deliverFinalSecondPassage(index),
      sealed: () => this.onFinalPassageComplete(),
      "cat-gate": () => this.startWispCatGate(),
      "cat-answer": () => this.finishCatChoice(),
    };
    routes[step]();
  }

  private startWoodMist(): void {
    this.setAmbientMistFieldAlpha(0.78, 900);
    if (this.mistTimer) return;
    this.mistTimer = this.time.addEvent({ delay: MIST_INTERVAL_MS,
      callback: this.triggerMistRoll, callbackScope: this, loop: true });
  }

  // ─── Revisit mode ────────────────────────────────────────────────────────

  private startRevisit(): void {
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "mist",
      color: 0xd8e2cf,
    });
    const choices = this.store.get().realms["haunted-wood"]?.choices ?? {};
    let narratorLine: string;
    let words: string[];

    if (choices["fork2"] === "bargain") {
      narratorLine = "The wood is quiet. The Ghost-King kept his promise.";
      words = ["the", "remembered", "rest", "now"];
    } else if (choices["fork1"] === "offering") {
      narratorLine = "The crossroads shrine has a new candle. Someone else found it.";
      words = ["we", "are", "not", "forgotten"];
    } else {
      narratorLine = "The wood is less haunted than it was. Not unhaunted. Just less.";
      words = ["the", "quiet", "is", "not", "empty"];
    }

    this.setNarrator(narratorLine);
    this.band.setObjective("Type the wood memory to return to the Almanac.");
    this.readThen(() => this.deliverRevisitPassage(words));
  }

  private deliverRevisitPassage(words: string[]): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= words.length) {
        this.time.delayedCall(800, () => {
          this.cameras.main.fadeOut(700, 14, 18, 14);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => this.scene.start("PortalChamberScene", {
              store: this.store,
              arrival: "haunted-wood",
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

    cue.add(addLocalGroundShadow(this, 118, 18, { y: 12, alpha: 0.15 }));

    const glint = this.add.graphics();
    glint.fillStyle(GHOST_BURST_COLOR, 0.1);
    glint.fillEllipse(0, 0, 116, 36);
    glint.lineStyle(2, GHOST_BURST_COLOR, 0.32);
    glint.strokeEllipse(0, 0, 96, 28);
    glint.lineStyle(2, 0xdde8dd, 0.36);
    glint.lineBetween(-32, 2, -10, -12);
    glint.lineBetween(-10, -12, 12, 12);
    glint.lineBetween(12, 12, 34, -2);
    glint.fillStyle(0xdde8dd, 0.4);
    glint.fillCircle(-44, 0, 2.8);
    glint.fillCircle(0, -3, 3.4);
    glint.fillCircle(44, 1, 2.8);
    cue.add(glint);

    addContainerWake(this, cue, {
      kind: "mist",
      intervalMs: 640,
      spreadX: 44,
      spreadY: 16,
      offsetY: -18,
      alpha: 0.14,
      size: 3.4,
      depth: 41,
      driftX: 22,
      driftY: -24,
      durationMs: 1200,
    });

    this.tweens.add({
      targets: cue,
      alpha: 0.82,
      y: pos.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -2, durationMs: 2800 }),
    });
  }

  private revisitMemoryCuePosition(idx: number, total: number): { x: number; y: number } {
    const spacing = total <= 4 ? 190 : 160;
    const startX = this.scale.width / 2 - ((total - 1) * spacing) / 2;
    return {
      x: startX + idx * spacing,
      y: idx % 2 === 0 ? 810 : 774,
    };
  }

  private revisitMemoryWordPosition(idx: number, total: number): { x: number; y: number } {
    const cue = this.revisitMemoryCuePosition(idx, total);
    // Long middle answers such as "remembered" must clear Wren's hood.
    const y = Math.abs(cue.x - this.wrenContainer.x) < 160
      ? Math.min(cue.y - 110, this.wrenContainer.y - 280)
      : cue.y - 110;
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
        color: GHOST_BURST_COLOR,
        alpha: 0.12,
        depth: 44,
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
      kind: "mist",
      color: GHOST_BURST_COLOR,
      offsetY: -18,
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

  // ─── Act 1 — Into the Wood ────────────────────────────────────────────────

  private startArrival(): void {
    this.checkpoint("arrival");
    this.band.setObjective("Follow the path toward the lantern. Press Enter or Space when ready.");
    this.narration.say("wood_intro_arrival");
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "mist",
      color: 0xd8e2cf,
    });
    this.setAmbientMistFieldAlpha(0.2, 520);
    this.showPathCue(0);
    const pathReadyAt = this.time.now + 760;
    this.time.delayedCall(760, () => this.stageWrenAtPathEntrance());
    this.readThen(() => this.time.delayedCall(
      Math.max(0, pathReadyAt - this.time.now), () => this.startPathExploration(),
    ));
  }

  private startPathExploration(index = 0, response = false): void {
    // Three sequential single-word beats: step, → hush. → wait?
    const beats = [
      {
        word: "step,",
        prompt: "The path is narrow. Step over the old roots clutching the ground.",
        narrator: "You step over the roots and find firm ground beyond them.",
      },
      {
        word: "hush.",
        prompt: "Something listens from the canopy. Keep quiet as you pass.",
        narrator: "You fall quiet. The branches settle above you.",
      },
      {
        word: "wait?",
        prompt: "A small lantern glows farther down the path. Wait before you go closer.",
        narrator: "You stop by the light. Something stirs beyond the trees.",
      },
    ];
    let i = woodIndex(index, beats.length);
    const advance = (): void => {
      if (i >= beats.length) {
        this.dismissPathCue();
        this.resetWrenToWoodStage();
        this.time.delayedCall(860, () => this.startIngaNPC());
        return;
      }
      const beat = beats[i];
      if (!beat) return;
      this.checkpoint("path", { index: i });
      this.band.setObjective(`Type ${beat.word} including its punctuation to follow the path.`);
      this.showPathCue(i);
      this.setNarrator(beat.prompt);
      const wordPos = this.pathWordPosition(i);
      const target = this.makeWord({
        scene: this,
        word: beat.word,
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 40,
        onClaim: () => {
          const destination = this.pathWrenPosition(i);
          playWrenFocus(this.wrenSprite, {
            faceLeft: destination.x < this.wrenContainer.x,
          });
          this.walkWrenToPathBeat(i);
          this.pulsePathCue(false);
        },
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          this.releasePathCueWordAnchor();
          this.pulsePathCue(true);
          playChime();
          this.clearActiveTargets();
          this.checkpoint("path", { index: i, response: true });
          this.setNarrator(beat.narrator);
          this.band.setObjective("Path cleared. Press Enter or Space to continue.");
          i += 1;
          this.readThen(advance);
        },
      });
      this.attachPathCueWordAnchor(i, target);
      this.registerActiveTarget(target);
    };
    if (response && beats[i]) {
      this.showPathCue(i);
      const position = this.pathWrenPosition(i);
      this.wrenContainer.setPosition(position.x, position.y);
      this.setNarrator(beats[i]!.narrator);
      this.band.setObjective("Path cleared. Press Enter or Space to continue.");
      this.readThen(() => { i += 1; advance(); });
    } else advance();
  }

  private pathWordPosition(idx: number): { x: number; y: number } {
    const cue = this.pathCue;
    if (!cue?.scene) return { x: this.scale.width / 2, y: this.scale.height / 2 };
    if (idx === 0) return { x: cue.x - 58, y: cue.y - 116 };
    if (idx === 1) return { x: cue.x + 204, y: cue.y - 76 };
    return { x: cue.x + 214, y: cue.y - 124 };
  }

  private pathWrenPosition(idx: number): { x: number; y: number } {
    const cue = this.pathCue;
    if (!cue?.scene) return { x: WREN_X, y: WOOD_PATH_STAGE_Y };
    if (idx === 0) return { x: cue.x - 112, y: WOOD_PATH_STAGE_Y };
    if (idx === 1) return { x: cue.x - 24, y: WOOD_PATH_STAGE_Y - 10 };
    return { x: cue.x + 54, y: WOOD_PATH_STAGE_Y - 2 };
  }

  private stageWrenAtPathEntrance(): void {
    const cue = this.pathCue;
    if (!cue?.scene) return;
    this.moveWrenTo(cue.x - 262, WOOD_PATH_STAGE_Y + 4, {
      durationMs: 820,
      quiet: true,
    });
  }

  private walkWrenToPathBeat(idx: number): void {
    const destination = this.pathWrenPosition(idx);
    this.moveWrenTo(destination.x, destination.y, {
      durationMs: idx === 1 ? 620 : 560,
      ringWidth: idx === 1 ? 170 : 220,
    });
  }

  private resetWrenToWoodStage(): void {
    this.moveWrenTo(WREN_X, WREN_Y, {
      durationMs: 620,
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
        addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2300 });
      },
    });
    if (opts.quiet) return;
    playSceneEventPulse(this, {
      kind: "mist",
      color: 0xa7d8a2,
      x,
      y: y - 24,
      depth: -0.2,
      durationMs: 560,
      ringWidth: opts.ringWidth ?? 210,
      ringHeight: 56,
      count: 7,
      alpha: 0.09,
      spreadX: 72,
      spreadY: 22,
    });
  }

  private showPathCue(idx: number): void {
    if (this.pathCue?.scene && this.pathCueIndex === idx) return;
    this.dismissPathCue(false);
    const cue =
      idx === 0
        ? this.drawRootPathCue()
        : idx === 1
          ? this.drawCanopyPathCue()
          : this.drawLanternPostCue();
    this.pathCue = cue;
    this.pathCueIndex = idx;
    this.tweens.add({
      targets: cue,
      alpha: idx === 0 ? 0.96 : 0.82,
      y: idx === 0 ? cue.y : cue.y - 7,
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (idx !== 0) addIdleBreath(this, cue, { dy: -3, durationMs: 3100 });
      },
    });
  }

  private drawRootPathCue(): Phaser.GameObjects.Container {
    const c = this.add
      .container(this.scale.width / 2 - 22, WOOD_ROOT_CUE_Y)
      .setDepth(-1)
      .setAlpha(0);
    const roots = this.add.graphics().setAngle(-2);

    roots.fillStyle(0x090c09, 0.2);
    roots.fillEllipse(-86, 23, 92, 12);
    roots.fillEllipse(12, 20, 118, 13);
    roots.fillEllipse(108, 14, 74, 10);

    roots.lineStyle(9, 0x11140e, 0.72);
    roots.beginPath();
    roots.moveTo(-150, 24);
    roots.lineTo(-105, 12);
    roots.lineTo(-62, 18);
    roots.lineTo(-18, 7);
    roots.lineTo(32, 19);
    roots.lineTo(91, 7);
    roots.lineTo(146, 15);
    roots.strokePath();
    roots.lineStyle(3, 0x33291d, 0.56);
    roots.beginPath();
    roots.moveTo(-148, 21);
    roots.lineTo(-104, 9);
    roots.lineTo(-62, 15);
    roots.lineTo(-18, 4);
    roots.lineTo(33, 16);
    roots.lineTo(91, 4);
    roots.lineTo(144, 12);
    roots.strokePath();

    roots.lineStyle(7, 0x10130d, 0.64);
    roots.beginPath();
    roots.moveTo(-70, 15);
    roots.lineTo(-47, -3);
    roots.lineTo(-18, -10);
    roots.strokePath();
    roots.beginPath();
    roots.moveTo(31, 17);
    roots.lineTo(55, -1);
    roots.lineTo(87, -11);
    roots.strokePath();
    roots.lineStyle(2, 0x403522, 0.46);
    roots.lineBetween(-67, 12, -44, -5);
    roots.lineBetween(34, 14, 57, -3);

    roots.fillStyle(0x303c28, 0.52);
    roots.fillEllipse(-119, 17, 20, 6);
    roots.fillEllipse(-55, 12, 14, 5);
    roots.fillEllipse(72, 5, 18, 5);
    roots.fillEllipse(126, 11, 16, 5);
    roots.fillStyle(0x70805a, 0.18);
    roots.fillEllipse(-115, 14, 9, 3);
    roots.fillEllipse(76, 2, 8, 3);

    c.add(roots);
    return c;
  }

  private drawCanopyPathCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 + 46, WOOD_CANOPY_CUE_Y).setDepth(-1).setAlpha(0);
    const mist = this.add.graphics();
    mist.fillStyle(0xd7ded8, 0.12);
    mist.fillEllipse(0, 32, 190, 48);
    mist.fillEllipse(-44, 8, 118, 30);
    mist.fillEllipse(50, -4, 132, 32);
    c.add(mist);
    const leaves = this.add.graphics();
    leaves.fillStyle(0x233020, 0.82);
    leaves.fillEllipse(-80, -20, 92, 38);
    leaves.fillEllipse(-18, -34, 110, 44);
    leaves.fillEllipse(62, -24, 96, 40);
    leaves.lineStyle(2, 0x5d7452, 0.22);
    leaves.lineBetween(-98, -14, -54, -24);
    leaves.lineBetween(-12, -28, 28, -42);
    leaves.lineBetween(48, -18, 88, -34);
    c.add(leaves);
    this.tweens.add({
      targets: mist,
      scaleX: 1.08,
      alpha: 0.2,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private drawLanternPostCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 + 142, WOOD_LANTERN_CUE_Y).setDepth(-1).setAlpha(0);
    c.add(addLocalGroundShadow(this, 90, 18, { y: 18, alpha: 0.16 }));
    const post = this.add.graphics();
    post.lineStyle(4, 0x2f2a23, 0.9);
    post.lineBetween(0, -104, 0, 24);
    post.lineStyle(2, 0x504535, 0.76);
    post.lineBetween(0, -86, 36, -98);
    post.fillStyle(0x1a1711, 0.92);
    post.fillRoundedRect(26, -100, 32, 46, 7);
    post.fillStyle(0xd4a040, 0.52);
    post.fillEllipse(42, -76, 24, 30);
    post.fillStyle(0xf6e5a8, 0.82);
    post.fillEllipse(42, -78, 10, 16);
    c.add(post);
    const glow = this.add.graphics().setPosition(42, -78);
    glow.fillStyle(0xd4a040, 0.12);
    glow.fillEllipse(0, 0, 82, 70);
    c.addAt(glow, 0);
    this.tweens.add({
      targets: glow,
      scaleX: 1.12,
      scaleY: 1.18,
      alpha: 0.72,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private pulsePathCue(completion: boolean): void {
    if (!this.pathCue?.scene) return;
    if (this.pathCueIndex === 0) {
      playActorAttention(this, this.wrenContainer, {
        scale: completion ? 1.025 : 1.012,
        durationMs: completion ? 220 : 150,
      });
      playBodyImpact(this, this.wrenContainer, {
        kind: "mist",
        color: 0xd7ded8,
        offsetY: -22,
        depth: 58,
        ringRadius: completion ? 32 : 20,
        count: completion ? 7 : 4,
        durationMs: completion ? 400 : 220,
      });
      return;
    }
    playActorAttention(this, this.pathCue, {
      scale: completion ? 1.035 : 1.018,
      durationMs: completion ? 260 : 180,
    });
    playBodyImpact(this, this.pathCue, {
      kind: "mist",
      color: 0xd7ded8,
      offsetY: -20,
      depth: 12,
      ringRadius: completion ? 44 : 28,
      count: completion ? 9 : 5,
      durationMs: completion ? 460 : 260,
    });
  }

  private dismissPathCue(animate = true): void {
    this.releasePathCueWordAnchor();
    const cue = this.pathCue;
    if (!cue?.scene) {
      this.pathCue = null;
      this.pathCueIndex = null;
      return;
    }
    this.pathCue = null;
    this.pathCueIndex = null;
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

  private attachPathCueWordAnchor(idx: number, target: TextWordTarget): void {
    const cue = this.pathCue;
    if (!cue?.scene) return;
    this.releasePathCueWordAnchor();
    if (idx === 0) return;
    const sourceOffsetY = idx === 1 ? -34 : idx === 2 ? -76 : -44;
    this.pathCueWordAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.moss,
        alpha: 0.14,
        depth: 7,
        sourceOffsetY,
        targetOffsetY: 24,
      },
    );
  }

  private releasePathCueWordAnchor(): void {
    this.pathCueWordAnchor?.destroy();
    this.pathCueWordAnchor = null;
  }

  private setAmbientMistFieldAlpha(alpha: number, durationMs: number): void {
    const fields = this.ambientMistFields.filter((field) => field.scene);
    if (fields.length === 0) return;
    this.tweens.add({
      targets: fields,
      alpha,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });
  }

  // ─── Act 1 — Inga NPC ────────────────────────────────────────────────────

  private startIngaNPC(phase = 0): void {
    this.checkpoint("inga", { index: phase });
    this.band.setObjective("Answer the lost ghost and follow her toward the shrine.");
    if (!this.ingaFigure?.scene) this.drawInga(INGA_FOREGROUND.x, INGA_FOREGROUND.y);

    this.store.update((s) => {
      if (!s.almanacLore.includes("the-crossroads-ghost")) {
        s.almanacLore.push("the-crossroads-ghost");
      }
    });

    // Inga speaks
    this.setNarrator("i don't know my name.", "Lost ghost");
    const reply = (): void => {
      this.checkpoint("inga", { index: 1 });
      // Wren types a reply
      const pos = this.ownerPassageWordPosition(this.ingaFigure, -62);
      const reply = this.makeIngaWord({
        scene: this,
        word: "i'll find it.",
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        onComplete: () => {
          this.clearActiveTargets();
          this.checkpoint("inga", { index: 2 });
          this.setNarrator(
            "the shrine knows. the shrine keeper might tell you.",
            "Lost ghost",
          );
          this.pulseShrine();
          this.readThen(() => this.startAct2());
        },
      });
      this.registerActiveTarget(reply);
    };
    if (phase >= 2) {
      this.setNarrator("the shrine knows. the shrine keeper might tell you.", "Lost ghost");
      this.readThen(() => this.startAct2());
    } else if (phase === 1) reply();
    else this.readThen(reply);
  }

  // ─── Act 2 — Through the Wood ─────────────────────────────────────────────

  private startAct2(): void {
    this.checkpoint("act2");
    this.stageIngaAtTreeLine();
    this.startWoodMist();
    this.setNarrator("The crossroads. Shapes drift between the trees.");
    this.band.setObjective("Press Enter or Space to learn the ward marks.");
    this.readThen(() => this.startCrossroads1());
  }

  /** Keep Inga present at the crossroads without leaving her as a combat prop. */
  private stageIngaAtTreeLine(): void {
    const inga = this.ingaFigure;
    if (!inga?.scene) return;

    this.tweens.killTweensOf(inga);
    playBodyImpact(this, inga, {
      kind: "mist",
      color: PALETTE_HEX.moss,
      offsetY: -42,
      depth: 5,
      ringRadius: 26,
      count: 6,
      durationMs: 360,
    });
    this.tweens.add({
      targets: inga,
      x: INGA_TREE_LINE.x,
      y: INGA_TREE_LINE.y,
      alpha: INGA_TREE_LINE.alpha,
      scaleX: INGA_TREE_LINE.scale,
      scaleY: INGA_TREE_LINE.scale,
      duration: 820,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!inga.scene) return;
        addIdleBreath(this, inga, { dy: -2, durationMs: 3600 });
      },
    });
    addContainerWake(this, inga, {
      kind: "mist",
      intervalMs: 760,
      spreadX: 26,
      spreadY: 12,
      offsetY: -46,
      color: PALETTE_HEX.moss,
      alpha: 0.08,
      size: 3.2,
      depth: 2,
      driftX: 22,
      driftY: -20,
      durationMs: 980,
    });
  }

  private returnIngaToForeground(): void {
    const inga = this.ingaFigure;
    if (!inga?.scene) return;

    this.tweens.killTweensOf(inga);
    this.tweens.add({
      targets: inga,
      x: INGA_FOREGROUND.x,
      y: INGA_FOREGROUND.y,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 820,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!inga.scene) return;
        addIdleBreath(this, inga, { dy: -3, durationMs: 2600 });
        this.attendInga();
      },
    });
    playBodyImpact(this, inga, {
      kind: "mist",
      color: PALETTE_HEX.moss,
      offsetY: -42,
      depth: 5,
      ringRadius: 26,
      count: 6,
      durationMs: 360,
    });
  }

  // Encounter 1: 3 ghosts — west, east, north. Introduces 3 of 4 directions
  // gently so the player can learn each punctuation glyph in turn.
  private startCrossroads1(): void {
    this.checkpoint("ward-intro");
    this.wardPracticeActive = true;
    if (this.mistTimer) this.mistTimer.paused = true;
    this.narration.say("wood_crossroads1_intro");
    this.band.setObjective(WARD_INPUT_HINT);
    // Tier 4 — announce the relic loadout once before the realm's first combat,
    // then begin. Empty loadout (incl. revisits) passes straight through.
    this.readThen(() => this.startWardPractice());
  }

  /** Four waiting spirits rehearse the compass, one mark at a time. They use
   * the real body/word rendering and controller, without an enemy deadline. */
  private startWardPractice(index = 0, response = false): void {
    index = woodIndex(index, 4);
    this.checkpoint("ward", { index, response });
    const directions: readonly WoodDirection[] = ["north", "south", "west", "east"];
    const direction = directions[index];
    if (!direction) { this.finishWardPractice(); return; }
    this.clearWardPracticeVisual();
    this.clearActiveTargets();
    this.ghosts = [];
    this.wardPracticeActive = true;
    if (this.mistTimer) this.mistTimer.paused = true;
    this.ensureCompassDrawn();
    const teaching = {
      north: { side: "above", name: "period", mark: ".", compass: 0 },
      south: { side: "below", name: "exclamation mark", mark: "!", compass: 1 },
      west: { side: "the left", name: "comma", mark: ",", compass: 3 },
      east: { side: "the right", name: "question mark", mark: "?", compass: 2 },
    }[direction];
    this.compassGlyphs.forEach((glyph, i) => glyph.setAlpha(i === teaching.compass ? 1 : 0.4));
    if (response) {
      this.setNarrator(`The ${teaching.name} wards the spirit from ${teaching.side}. It fades back into the trees.`);
      this.band.setObjective(index === directions.length - 1
        ? "All four marks practiced. Press Enter or Space to meet the crossroads spirits."
        : "Mark practiced. Press Enter or Space for the next direction.");
      this.readThen(() => index === directions.length - 1 ? this.finishWardPractice() : this.startWardPractice(index + 1));
      return;
    }
    const word = woodWardWord("howl", direction);
    const article = teaching.name === "exclamation mark" ? "an" : "a";
    this.setNarrator(`A spirit comes from ${teaching.side}. Put ${article} ${teaching.name} (${teaching.mark}) in its hidden dot: ${word}. This spirit will wait.`);
    this.band.setObjective(`Practice ${index + 1}/4: type ${word}. No deadline; a wrong key simply waits.`);
    const position = this.spawnPositionFor(direction, 0);
    const body = this.add.container(position.startX, position.startY).setAlpha(0.6);
    this.drawGhostInto(body, true);
    this.wardPracticeBody = body;
    const generation = this.wardPracticeGeneration;
    this.tweens.add({
      targets: body, x: position.restX, y: position.restY,
      duration: reducedMotion(this) ? 0 : 900, ease: "Sine.easeOut",
      onComplete: () => {
        if (!this.wardPracticeActive || this.wardPracticeGeneration !== generation || this.wardPracticeBody !== body) return;
        const target = this.makeWord({
          scene: this, word, x: position.restX,
          y: Math.max(this.narration.bottom() + 48, position.restY - 92),
          fontSize: 38, maskMarks: true,
          onComplete: () => {
            if (!this.wardPracticeActive || this.wardPracticeTarget !== target) return;
            this.clearWardPracticeVisual();
            playChime();
            this.checkpoint("ward", { index, response: true });
            this.setNarrator(`The ${teaching.name} wards the spirit from ${teaching.side}. It fades back into the trees.`);
            this.band.setObjective(index === directions.length - 1
              ? "All four marks practiced. Press Enter or Space to meet the crossroads spirits."
              : "Mark practiced. Press Enter or Space for the next direction.");
            this.readThen(() => index === directions.length - 1
              ? this.finishWardPractice() : this.startWardPractice(index + 1));
          },
        });
        this.wardPracticeTarget = target;
        this.registerActiveTarget(target);
      },
    });
  }

  private clearWardPracticeVisual(): void {
    this.wardPracticeGeneration += 1;
    if (this.wardPracticeTarget) {
      const target = this.wardPracticeTarget;
      this.typingInput.unregister(target);
      target.destroy();
      this.activeTargets = this.activeTargets.filter((value) => value !== target);
      this.wardPracticeTarget = null;
    }
    if (this.wardPracticeBody?.scene) {
      this.tweens.killTweensOf(this.wardPracticeBody);
      this.wardPracticeBody.destroy();
    }
    this.wardPracticeBody = null;
  }

  private finishWardPractice(): void {
    this.clearWardPracticeVisual();
    this.wardPracticeActive = false;
    this.compassGlyphs.forEach((glyph) => glyph.setAlpha(0.5));
    this.announceCombatLoadout(() => this.beginCrossroads1());
  }

  private beginCrossroads1(): void {
    this.checkpoint("crossroads1");
    this.wardPracticeActive = false;
    if (this.mistTimer) this.mistTimer.paused = false;
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective(WARD_INPUT_HINT);

    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onCrossroads1Cleared();
    this.spawnGhostsByDirection(directions, 300);
  }

  private onCrossroads1Cleared(): void {
    this.checkpoint("crossroads1-cleared");
    // Almanac lore page 3 — the punctuation warding lesson, stamped after
    // Wren has cleared the first four-direction crossroads.
    this.store.update((s) => {
      if (!s.almanacLore.includes("punctuation-warding")) {
        s.almanacLore.push("punctuation-warding");
      }
    });
    this.time.delayedCall(1400, () => this.startCrossroads2());
  }

  // Encounter 2: 4 ghosts from all four compass directions. First time
  // the player sees south, completing the punctuation set.
  private startCrossroads2(): void {
    this.checkpoint("crossroads2-intro");
    this.narration.say("wood_crossroads2_intro");
    this.band.setObjective("First crossroads cleared. Press Enter or Space to meet the next spirits.");
    this.readThen(() => this.beginCrossroads2());
  }

  private beginCrossroads2(): void {
    this.checkpoint("crossroads2");
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective(WARD_INPUT_HINT);

    const directions: WoodDirection[] = ["north", "south", "east", "west"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onCrossroads2Cleared();
    this.spawnGhostsByDirection(directions, 280);

    // §5.5.10 — for a few seconds the ghosts speak his fragment instead of
    // their own grievances. Fires once on the second crossroads — late
    // enough that the punctuation-direction mapping is in muscle memory.
    if (!this.quietLordIntruded) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["haunted-wood"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(2000, () => {
        const anchor = this.quietLordIntrusionAnchor();
        playQuietLordIntrusion(this, {
          x: anchor.x,
          y: anchor.y,
          text: "we are all going quiet.",
        });
      });
    }
  }

  private quietLordIntrusionAnchor(): { x: number; y: number } {
    // Narration yields this lane before a live wave. Keeping the scar here
    // avoids the north ghost's word at248 and the side ghosts' moving labels.
    return { x: this.scale.width / 2, y: 120 };
  }

  private onCrossroads2Cleared(): void {
    this.time.delayedCall(1400, () => this.startCrossroads3());
  }

  // Encounter 3: 4 ghosts with two coming from the same direction —
  // tests that the player can handle multiple of the same punctuation in
  // a row without panicking.
  private startCrossroads3(): void {
    this.checkpoint("crossroads3-intro");
    this.setNarrator("Older things stir. They come in pairs now.");
    this.band.setObjective("Second crossroads cleared. Press Enter or Space to meet the paired spirits.");
    this.readThen(() => this.beginCrossroads3());
  }

  private beginCrossroads3(): void {
    this.checkpoint("crossroads3");
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective(WARD_INPUT_HINT);

    const directions: WoodDirection[] = ["north", "north", "east", "west"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onCrossroads3Cleared();
    this.spawnGhostsByDirection(directions, 300);
  }

  /** Spawn a batch of ghosts from given compass directions, staggering
   *  same-direction siblings into different slots. Each ghost's word is
   *  picked adaptively from that direction's punctuation-filtered bank. */
  private spawnGhostsByDirection(
    directions: readonly WoodDirection[],
    delayStepMs: number,
  ): void {
    // Story remains readable at its gate, then makes room for overhead wards.
    // The compass punctuation guide stays in the console throughout combat.
    this.narration.clear();
    const slotCounts: Record<WoodDirection, number> = {
      north: 0,
      south: 0,
      east: 0,
      west: 0,
    };
    // Pick DISTINCT base words for the whole batch up front. Same-direction
    // ghosts (crossroads 3, boss wave B) share a mark, so distinct bases keep
    // each full warded word unique — two identical words could never narrow to
    // a single claim (an unclaimable wave), and two identical masked "ho·wl"
    // would be impossible to tell apart anyway.
    const bases = pickAdaptiveWords(
      HAUNTED_WOOD_BASE_BANK,
      directions.length,
      this.store.get().keyStats,
    );
    directions.forEach((dir, i) => {
      const slot = slotCounts[dir];
      slotCounts[dir] += 1;
      // Insert the approach direction's ward mark mid-string; it's masked at the
      // target, so clearing this ghost demands the player know direction → mark
      // from the compass.
      const base =
        bases[i] ?? HAUNTED_WOOD_BASE_BANK[i % HAUNTED_WOOD_BASE_BANK.length];
      const word = woodWardWord(base, dir);
      this.spawnGhost(dir, word, i * delayStepMs, slot);
    });
    // Tier 4 — every ghost wave funnels through here, so re-arm the per-wave
    // procs (forgive-wave-miss + auto-ease) once per wave at this chokepoint.
    this.beginCombatWave();
  }

  private onCrossroads3Cleared(): void {
    this.mistTimer?.remove();
    this.mistTimer = null;
    this.time.delayedCall(1600, () => this.startFork1());
  }

  // ─── Fork 1 — The Crossroads Shrine ──────────────────────────────────────

  private startFork1(): void {
    this.checkpoint("fork1");
    this.drawShrine();
    this.narration.say("wood_fork1_intro");
    this.band.setObjective("Choose an offering or the bone-flute.");
    this.showFork1Cues();
    if (this.fork1Choice === "offering") { this.startFork1Offering(); return; }
    if (this.fork1Choice === "bone-flute") { this.startFork1BoneFlute(); return; }

    const offeringPos = this.ownerPassageWordPosition(this.offeringCue, -42, {
      side: "left",
    });
    const offeringTarget = this.makeWoodForkWord(this.offeringCue, {
      scene: this,
      word: "leave an offering",
      x: offeringPos.x,
      y: offeringPos.y,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "offering";
        this.startFork1Offering();
      },
    }, -42);
    const flutePos = this.ownerPassageWordPosition(this.boneFluteCue, -62, {
      side: "right",
    });
    const fluteTarget = this.makeWoodForkWord(this.boneFluteCue, {
      scene: this,
      word: "take the bone-flute",
      x: flutePos.x,
      y: flutePos.y,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "bone-flute";
        this.startFork1BoneFlute();
      },
    }, -62);
    this.registerActiveTarget(offeringTarget, fluteTarget);
  }

  // ─── Fork 1A — Offering ───────────────────────────────────────────────────

  private startFork1Offering(index = 0, response = false, begun = false): void {
    this.fork1Choice = this.commitFork("fork1", "offering") as typeof this.fork1Choice;
    if (this.fork1Choice !== "offering") { this.startFork1BoneFlute(); return; }
    this.fadeOutForkCue(this.boneFluteCue);
    this.boneFluteCue = null;
    this.checkpoint("offering", { index, response, begun });
    this.setNarrator("The bowl waits for a word of remembrance.");
    this.band.setObjective("Honor the lost at the shrine. Press Enter or Space to begin.");
    const begin = (): void => {
      this.runPassageChain(
        [
          {
            word: "i remember you.",
            narrator: "The shrine glows. Something settles.",
          },
        ],
        () => {
          this.finishOffering();
        },
        { body: this.offeringCue, sourceOffsetY: -42, side: "left", checkpoint: "offering", index, response },
      );
    };
    if (begun) begin(); else this.readThen(begin);
  }


  private startIngaNameReveal(): void {
    this.checkpoint("inga-name");
    this.setNarrator("Her name. Type it back to her.");
    this.band.setObjective("Type inga to return the lost ghost's name to her.");
    const pos = this.ownerPassageWordPosition(this.ingaFigure, -62);
    const target = this.makeIngaWord({
      scene: this,
      word: "inga",
      x: pos.x,
      y: pos.y,
      fontSize: 44,
      onComplete: () => {
        this.clearActiveTargets();
        playChime();
        this.finishIngaName();
      },
    });
    this.registerActiveTarget(target);
  }

  // ─── Fork 1B — Bone-Flute ─────────────────────────────────────────────────

  private startFork1BoneFlute(index = 0, response = false, begun = false): void {
    this.fork1Choice = this.commitFork("fork1", "bone-flute") as typeof this.fork1Choice;
    if (this.fork1Choice !== "bone-flute") { this.startFork1Offering(); return; }
    this.fadeOutForkCue(this.offeringCue);
    this.offeringCue = null;
    this.checkpoint("flute", { index, response, begun });
    this.setNarrator("The bone-flute is cold inside the stone hollow.");
    this.band.setObjective("Take the bone-flute. Press Enter or Space to begin.");
    const begin = (): void => {
      this.runPassageChain(
        [
          { word: "reach in", narrator: "Your fingers close around it." },
          {
            word: "take it",
            narrator: "The flute is cold. It makes no sound. The ghosts grow restless.",
            beforeResponse: (onSettled) => this.settleBoneFluteInHand(onSettled),
          },
        ],
        () => {
          this.finishFlute();
        },
        { body: this.boneFluteCue, sourceOffsetY: -62, checkpoint: "flute", index, response },
      );
    };
    if (begun) begin(); else this.readThen(begin);
  }


  // ─── Act 3 — The Ghost-King's Hall ────────────────────────────────────────

  private finishOffering(): void {
    this.checkpoint("offering-reward");
    // Shrine glows — award ally + relic
    this.pulseShrine();
    this.store.update((s) => {
      if (!s.satchel.includes("shrine-token")) {
        s.satchel.push("shrine-token");
      }
    });
    playChime();
    if (!reducedFlashes(this)) this.cameras.main.flash(400, 200, 220, 180, false);
    this.setNarrator("The lost ghost stirs. The shrine keeper whispers a name: Inga.");
    this.band.setObjective("Shrine Token collected. Press Enter or Space to listen to the remembered name.");
    this.returnIngaToForeground();
    this.fadeOutForkCue(this.offeringCue);
    this.offeringCue = null;
    this.readThen(() => this.startIngaNameReveal());
  }

  private finishFlute(): void {
    this.checkpoint("flute-reward");
    this.store.update((s) => {
      if (!s.satchel.includes("bone-flute")) {
        s.satchel.push("bone-flute");
      }
    });
    playChime();
    this.fadeOutForkCue(this.boneFluteCue);
    this.boneFluteCue = null;
    this.setNarrator("The Bone-Flute joins your satchel. Restless whispers follow you beyond the shrine. The lost ghost still waits by the trees, her name unfound.");
    this.band.setObjective("Bone-Flute collected. Press Enter or Space to continue into the wood.");
    this.readThen(() => {
      this.clearHeldWoodRelic();
      this.startAct3();
    });
  }

  private finishBargain(): void {
    this.checkpoint("bargain-reward");
    // Award bargain ally + relic
    this.store.update((s) => {
      if (!s.satchel.includes("ghost-kings-promise")) {
        s.satchel.push("ghost-kings-promise");
      }
    });
    playChime();
    this.attendGhostKing();
    this.setNarrator("The Ghost-King gives his promise. His test still waits among the roots.");
    this.band.setObjective("Ghost-King's Promise collected. Press Enter or Space to face his test.");
    this.readThen(() => this.startBossFight());
  }

  private finishIngaName(): void {
    this.checkpoint("inga-name-answer");
    this.store.update((s) => {
      if (!s.almanacLore.includes("ingas-name")) {
        s.almanacLore.push("ingas-name");
      }
    });
    this.setNarrator("She looks at her hands. 'Oh,' she says. 'Oh.'", "Inga");
    this.band.setObjective("Inga remembers. Press Enter or Space to continue.");
    this.attendInga();
    this.readThen(() => this.startAct3());
  }

  private startAct3(): void {
    this.checkpoint("act3");
    this.narration.say("wood_ghost_king_rise");
    this.band.setObjective("Approach the root-throne. Press Enter or Space when ready.");
    this.readThen(() => {
      this.drawGhostKing();
      this.time.delayedCall(1200, () => this.startFork2());
    });
  }

  // ─── Fork 2 — Dialogue/Bargain ────────────────────────────────────────────

  private startFork2(): void {
    this.checkpoint("fork2");
    this.setNarrator(
      "The Ghost-King guards these lost spirits. Ask him to remember who he is, or light his grove; fire will wake its restless dead.",
    );
    this.attendGhostKing();
    this.band.setObjective("Choose a bargain or light the grove.");
    this.showFork2Cues();
    if (this.fork2Choice === "bargain") { this.startFork2Bargain(); return; }
    if (this.fork2Choice === "force") { this.startFork2Force(); return; }

    const bargainPos = this.ownerPassageWordPosition(this.ghostKingBody, -30, {
      side: "left",
    });
    const bargainTarget = this.makeGhostKingWord({
      scene: this,
      word: "speak your true name",
      x: bargainPos.x,
      y: bargainPos.y,
      fontSize: 28,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "bargain";
        this.attendGhostKing();
        this.startFork2Bargain();
      },
    });
    const forcePos = this.ownerPassageWordPosition(this.groveLightCue, -58, {
      side: "right",
    });
    const forceTarget = this.makeWoodForkWord(this.groveLightCue, {
      scene: this,
      word: "light the grove",
      x: forcePos.x,
      y: forcePos.y,
      fontSize: 28,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "force";
        this.startFork2Force();
      },
    }, -58);
    this.registerActiveTarget(bargainTarget, forceTarget);
  }

  // ─── Fork 2A — Bargain ────────────────────────────────────────────────────

  private startFork2Bargain(index = 0, response = false, begun = false): void {
    this.fork2Choice = this.commitFork("fork2", "bargain") as typeof this.fork2Choice;
    if (this.fork2Choice !== "bargain") { this.startFork2Force(); return; }
    this.fadeOutForkCue(this.groveLightCue);
    this.groveLightCue = null;
    this.checkpoint("bargain", { index, response, begun });
    this.setNarrator("The Ghost-King pauses. He turns to face you fully.");
    this.band.setObjective("Speak to the Ghost-King. Press Enter or Space to begin the bargain.");
    this.attendGhostKing();
    const begin = (): void => {
      this.runPassageChain(
        [
          {
            word: "you are the keeper of what is lost.",
            narrator: "His roots uncurl. He listens.",
          },
          {
            word: "you are not gone.",
            narrator: "A long silence. The mist settles.",
          },
          {
            word: "you are remembered.",
            narrator: "The Ghost-King bows. Then: 'Then prove it.'",
          },
        ],
        () => {
          this.finishBargain();
        },
        {
          body: this.ghostKingBody,
          sourceOffsetY: -30,
          ghostKing: true,
          side: "left",
          checkpoint: "bargain", index, response,
        },
      );
    };
    if (begun) begin(); else this.readThen(begin);
  }


  // ─── Boss Fight — two waves ────────────────────────────────────────────────

  private startFork2Force(): void {
    this.fork2Choice = this.commitFork("fork2", "force") as typeof this.fork2Choice;
    if (this.fork2Choice !== "force") { this.startFork2Bargain(); return; }
    this.checkpoint("force");
    this.store.update(s => { if (!s.satchel.includes("ash-vial")) s.satchel.push("ash-vial"); });
    this.attendGhostKing();
    this.igniteGroveLightCue();
    this.showGatheredAshVial();
    this.setNarrator("The grove flares. You gather a vial of ash as the Ghost-King turns toward the fire.");
    this.band.setObjective("Ash Vial collected. Press Enter or Space to face what the fire wakes.");
    this.readThen(() => {
      this.clearHeldWoodRelic();
      this.startBossFight();
    });
  }

  private startBossFight(): void {
    this.checkpoint("boss-intro");
    this.setNarrator(this.fork2Choice === "force"
      ? "You bring fire to my grove. Then face what it wakes."
      : "Then prove it.", "Ghost-King");
    this.playGhostKingStagePulse();
    this.band.setObjective("Read the Ghost-King's challenge. Press Enter or Space to face the spirits.");
    this.ghosts = [];
    this.readThen(() => this.time.delayedCall(800, () => this.spawnBossWaveA()));
  }

  private spawnBossWaveA(): void {
    this.checkpoint("boss-a");
    this.band.setObjective(WARD_INPUT_HINT);
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave({ y: 650, ringWidth: 900, ringHeight: 210, count: 14 });
    // Wave A: three directions, slower spawn pace. The player should still
    // recognize the learned punctuation-direction mapping from Act 2.
    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onBossWaveACleared();
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveACleared(): void {
    this.checkpoint("boss-a-cleared");
    this.setNarrator("The first wave fades. More rise.");
    this.band.setObjective("First warding wave cleared. Press Enter or Space for the next wave.");
    this.attendGhostKing();
    this.readThen(() => this.time.delayedCall(1200, () => this.spawnBossWaveB()));
  }

  private spawnBossWaveB(): void {
    this.checkpoint("boss-b");
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave({ y: 650, ringWidth: 900, ringHeight: 210, count: 14 });
    this.band.setObjective(WARD_INPUT_HINT);
    // Wave B: south-heavy attack — two from below + one from above. Reads
    // as the Ghost-King's hall rising up against Wren.
    const directions: WoodDirection[] = ["south", "south", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onBossWaveBCleared();
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveBCleared(): void {
    this.checkpoint("boss-b-cleared");
    this.setNarrator("The clearing goes still. The Ghost-King rises fully.");
    this.band.setObjective("Warding waves cleared. Press Enter or Space for the Ghost-King's final words.");
    this.attendGhostKing();
    this.readThen(() => this.startBossCapstone());
  }

  // ─── Boss Phase 2 — Every-Punctuation Capstone ────────────────────────────
  //
  // The Ghost-King's last words. One passage that touches every punctuation
  // mark in the game: the four cardinal marks the realm has been teaching
  // (. , ? !) plus the two reserved (; :) that the player sees here for the
  // first time. Per §5.5.8 this is the boss's phase 2.

  private startBossCapstone(index = 0, begun = false): void {
    this.checkpoint("capstone", { index, begun });
    this.band.setObjective("Read the final warning. Press Enter or Space to begin his words.");
    this.playGhostKingStagePulse(true);
    const dimOverlay = this.add.graphics().setDepth(40).fillStyle(0x000000, 0.4);
    dimOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    dimOverlay.setAlpha(0);
    this.tweens.add({ targets: dimOverlay, alpha: 1, duration: 700 });

    this.narration.say("wood_ghost_king_phase2");
    this.attendGhostKing();
    const begin = (): void => {
      const passage = [
        "stop!",
        "who",
        "walks",
        "here:",
        "friend,",
        "or",
        "foe?",
        "listen;",
        "we",
        "remember.",
      ];
      this.runWordByWordPassage(passage, () => {
        this.tweens.add({
          targets: dimOverlay,
          alpha: 0,
          duration: 700,
          onComplete: () => dimOverlay.destroy(),
        });
        this.finishCapstone();
      }, "capstone", index);
    };
    if (begun) begin(); else this.readThen(begin);
  }

  private finishCapstone(): void {
    this.checkpoint("capstone-answer");
    this.setNarrator("His voice fades. The mist closes around the throne.");
    this.band.setObjective("His last words are heard. Press Enter or Space to continue.");
    // Almanac lore page 4 — the Ghost-King's true name, stamped after
    // his every-punctuation capstone resolves.
    this.store.update((s) => {
      if (!s.almanacLore.includes("ghost-kings-true-name")) {
        s.almanacLore.push("ghost-kings-true-name");
      }
    });
    this.readThen(() => this.startFinalPassage());
  }

  // ─── Realm Seal — True-Name Passage ───────────────────────────────────────

  private startFinalPassage(): void {
    this.checkpoint("final-intro");
    this.narration.say("wood_truename_intro");
    this.band.setObjective("Read the wood's final passage. Press Enter or Space to begin.");
    this.attendGhostKing();
    this.readThen(() => this.deliverFinalPassage());
  }

  private deliverFinalPassage(index = 0): void {
    this.runWordByWordPassage(["we", "are", "remembered.", "we", "are", "quiet."], () => {
      this.checkpoint("final2", { index: 0 });
      this.time.delayedCall(800, () => this.deliverFinalSecondPassage());
    }, "final1", index);
  }

  private deliverFinalSecondPassage(index = 0): void {
    this.runWordByWordPassage(["but", "we", "are", "not", "silent."],
      () => this.onFinalPassageComplete(), "final2", index);
  }

  /** Present words in sequence: one TextWordTarget at a time. */
  private runWordByWordPassage(words: string[], onDone: () => void, step: WoodStep, index = 0): void {
    let idx = woodIndex(index, words.length);
    const advance = (): void => {
      this.checkpoint(step, { index: idx, begun: true });
      if (idx >= words.length) {
        onDone();
        return;
      }
      const word = words[idx];
      if (word === undefined) return;
      this.band.setObjective(`Type the shown word (${idx + 1}/${words.length}), including punctuation. No spaces between prompts.`);
      const wordPos = this.ownerPassageWordPosition(this.ghostKingBody, -30, {
        side: "left",
      });
      const target = this.makeGhostKingWord({
        scene: this,
        word,
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 48,
        onClaim: () => playWrenFocus(this.wrenSprite),
        onComplete: () => {
          playChime();
          playBodyImpact(this, this.wrenContainer, {
            kind: "mist",
            color: PALETTE_HEX.moss,
            offsetY: -108,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          idx += 1;
          this.checkpoint(step, { index: idx, begun: true });
          this.clearActiveTargets();
          this.time.delayedCall(160, advance);
        },
      });
      this.registerActiveTarget(target);
    };
    advance();
  }

  private onFinalPassageComplete(): void {
    this.checkpoint("sealed");
    this.clearActiveTargets();
    this.fadeOutForkCue(this.groveLightCue, { durationMs: 800 });
    this.groveLightCue = null;
    this.band.setObjective("The wood's name is sealed. Read its final memory.");
    const ghostKing = this.ghostKingBody;
    const fragmentX = ghostKing?.scene ? ghostKing.x : this.scale.width / 2;
    const fragmentY = ghostKing?.scene
      ? Phaser.Math.Clamp(ghostKing.y - 92, 260, this.scale.height - 360)
      : this.scale.height / 2 - 40;
    // Ghost-King dissolves
    if (!reducedFlashes(this)) this.cameras.main.flash(500, 220, 230, 210, false);
    this.fadeGhostKingBody();
    this.narration.say("wood_ghost_king_defeated");
    // Almanac lore page 5 — the Wood's true name, stamped when the realm's
    // true-name passage resolves.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-wood-true-name")) {
        s.almanacLore.push("the-wood-true-name");
      }
    });

    // Quiet Lord fragment ~~Again~~ — fifth realm, full word, no period.
    // The period waits for the finale per §5.5.10. Once per playthrough.
    this.time.delayedCall(1200, () => {
      const alreadyRevealedWood =
        this.store.get().realms["haunted-wood"]?.quietLordFragmentRevealed ?? false;
      if (!alreadyRevealedWood) {
        this.store.update((s) => {
          const realm = s.realms["haunted-wood"];
          if (realm) realm.quietLordFragmentRevealed = true;
        });
        flashQuietLordFragment(this, {
          text: "Again",
          x: fragmentX,
          y: fragmentY,
          onDone: () => {
            this.readThen(() => this.startWispCatGate());
          },
        });
      } else {
        this.readThen(() => this.startWispCatGate());
      }
    });
  }

  // ─── Wisp-cat companion gate ──────────────────────────────────────────────

  private startWispCatGate(): void {
    this.checkpoint("cat-gate");
    if (resolveCompanionDecision("haunted-wood", this.store.get().realms["haunted-wood"], this.store.get().satchel)) {
      this.startEnding(); return;
    }
    if (this.fork2Choice !== "bargain") {
      // Gate not met — skip straight to ending
      this.time.delayedCall(400, () => this.startEnding());
      return;
    }

    this.setNarrator(
      "A small cat made of pale light watches from the root-throne. She flicks one ear.",
    );
    this.band.setObjective("A wisp-cat watches. Press Enter or Space to meet her.");
    this.showWispCatCompanion();
    this.readThen(() => {
      this.band.setObjective("Choose whether to call the wisp-cat or leave her in the clearing.");
      const callPos = this.ownerPassageWordPosition(this.wispCatCompanion, -58, {
        side: "left",
      });
      const leavePos = this.ownerPassageWordPosition(this.wispCatCompanion, -58, {
        side: "right",
      });
      const callTarget = this.makeWispCatWord({
        scene: this,
        word: "call to her",
        x: callPos.x,
        y: callPos.y,
        fontSize: 30,
        frame: "banner",
        onComplete: () => {
          this.clearActiveTargets();
          let accepted = false;
          this.store.update((s) => {
            accepted = rememberCompanionDecision(s, "haunted-wood", "accepted") === "accepted";
            if (accepted && !s.satchel.includes("wisp-cat")) {
              s.satchel.push("wisp-cat");
            }
          });
          this.companionChoice = accepted ? "call" : "leave";
          if (!accepted) { this.startEnding(); return; }
          this.finishCatChoice();
        },
      });
      const leaveTarget = this.makeWispCatWord({
        scene: this,
        word: "leave her",
        x: leavePos.x,
        y: leavePos.y,
        fontSize: 30,
        frame: "banner",
        onComplete: () => {
          this.clearActiveTargets();
          this.companionChoice = "leave";
          this.store.update(s => { rememberCompanionDecision(s, "haunted-wood", "declined"); });
          this.finishCatChoice();
        },
      });
      this.registerActiveTarget(callTarget, leaveTarget);
    });
  }

  private finishCatChoice(): void {
    this.checkpoint("cat-answer");
    this.showWispCatCompanion();
    if (this.companionChoice === "call") {
      playChime();
      this.setNarrator("At your call, the wisp-cat comes closer.");
      this.band.setObjective("The wisp-cat comes closer.");
      this.settleWispCatByWren(() => {
        this.setNarrator("She stands beside you, glowing softly at your feet.");
        this.band.setObjective("Wisp-Cat joined you. Press Enter or Space to continue.");
        this.pulseWispCatCompanion();
        this.readThen(() => this.startEnding());
      });
    } else {
      this.setNarrator("She watches you go. Her light stays in the clearing.");
      this.band.setObjective("The wisp-cat stays in the clearing. Press Enter or Space to continue.");
      this.dismissWispCatCompanion(1450, 740);
      this.readThen(() => this.startEnding());
    }
  }

  private settleWispCatByWren(onSettled: () => void): void {
    const cat = this.wispCatCompanion;
    if (!cat?.scene) { onSettled(); return; }
    // Stop the throne entrance/idle so it cannot pull her back after joining.
    // Her standing art keeps its ground shadow and the same feet origin as Wren.
    this.tweens.killTweensOf(cat);
    cat.setScale(1);
    const beside = { x: this.wrenContainer.x + 136, y: this.wrenContainer.y };
    if (reducedMotion(this)) {
      cat.setPosition(beside.x, beside.y).setAlpha(1);
      onSettled();
      return;
    }
    this.tweens.add({
      targets: cat,
      ...beside,
      alpha: 1,
      duration: 640,
      ease: "Sine.easeInOut",
      onComplete: onSettled,
    });
  }

  private showWispCatCompanion(): void {
    if (this.wispCatCompanion?.scene) return;
    this.wispCatCompanion = stageCompanionCameo(this, {
      textureKey: "wood-companion-wisp-cat",
      startX: 1460,
      startY: 770,
      x: 1300,
      y: 770,
      height: 104,
      depth: 43,
      shadowWidth: 82,
      shadowHeight: 16,
      shadowOffsetY: 9,
      shadowAlpha: 0.2,
      breathDy: -4,
      breathMs: 1800,
      wake: {
        kind: "mist",
        intervalMs: 170,
        offsetY: -10,
        spreadX: 20,
        spreadY: 10,
        depth: 42,
        alpha: 0.22,
      },
    });
  }

  private pulseWispCatCompanion(): void {
    playActorAttention(this, this.wispCatCompanion, {
      scale: 1.04,
      durationMs: 220,
    });
  }

  private dismissWispCatCompanion(x: number, y: number): void {
    this.clearWispCatWordAnchors();
    dismissCompanionCameo(this, this.wispCatCompanion, { x, y, durationMs: 720 });
    this.wispCatCompanion = null;
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.narration.say("wood_almanac_stamp");
    this.band.setObjective("Wood journey complete. Press Enter or Space to return to the chamber.");

    this.store.update((s) => {
      if (this.fork1Choice) rememberRealmFork(s, "haunted-wood", "fork1", this.fork1Choice);
      if (this.fork2Choice) rememberRealmFork(s, "haunted-wood", "fork2", this.fork2Choice);
      if (this.companionChoice) rememberCompanionDecision(s, "haunted-wood", this.companionChoice === "call" ? "accepted" : "declined");
      const realm = s.realms["haunted-wood"] ?? { cleared: false, choices: {} };
      realm.cleared = true;
      s.realms["haunted-wood"] = realm;
      if (!this.revisit && s.checkpoint?.scene === "HauntedWoodScene") s.checkpoint = null;
    });

    this.readThen(() => this.showAlmanacStamp(() => {
      playRealmReturnDeparture(this, this.wrenContainer, {
        kind: "mist",
        color: PALETTE_HEX.moss,
      });
      this.time.delayedCall(360, () => {
        this.cameras.main.fadeOut(700, 14, 18, 14);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start("PortalChamberScene", {
              store: this.store,
              arrival: "haunted-wood",
            });
          },
        );
      });
    }));
  }

  private readThen(next: () => void): void {
    this.reading.show(next, () => this.narration.replay());
  }

  private commitFork(fork: RealmFork, requested: string): string {
    let chosen = requested;
    this.store.update(s => { chosen = rememberRealmFork(s, "haunted-wood", fork, requested); });
    return chosen;
  }

  private showAlmanacStamp(onDone: () => void): void {
    playRealmClearResonance(this, {
      color: PALETTE_HEX.moss,
      y: this.scale.height / 2 - 30,
    });
    showAlmanacStampCard(this, "the haunted wood", onDone, { onReveal: playChime });
  }

  // ─── Ghost spawning + combat ──────────────────────────────────────────────

  /** Spawn a ghost approaching from a compass direction. Word is drawn
   *  from the direction's punctuation-filtered bank — north uses period,
   *  south exclamation, east question, west comma. `slot` lets multiple
   *  ghosts from the same direction be staggered along the cross-axis. */
  private spawnGhost(
    direction: WoodDirection,
    word: string,
    delay: number,
    slot: number = 0,
  ): void {
    this.ensureCompassDrawn();
    const pos = this.spawnPositionFor(direction, slot);
    const container = this.add.container(pos.startX, pos.startY);
    const isPunctWord = hasPunctuation(word);
    this.drawGhostInto(container, isPunctWord);
    addContainerWake(this, container, {
      kind: "mist",
      intervalMs: 300,
      spreadX: 34,
      spreadY: 10,
      offsetY: 8,
      alpha: 0.2,
      size: 8,
      depth: -1,
      driftX: 26,
      driftY: -18,
      durationMs: 1050,
    });
    container.setAlpha(0);

    const ghost = new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word,
      restX: pos.restX,
      restY: pos.restY,
      // Ghosts close in BOTH axes — N/S vertically, E/W horizontally — so the
      // advance is diagonal (wrenY set) and its duration scales by Euclidean
      // distance.
      wrenX: WREN_X,
      wrenY: WREN_Y,
      // Punctuated words advance faster (the realm's speed-under-pressure beat).
      advanceMs: isPunctWord ? GHOST_ADVANCE_FAST : GHOST_ADVANCE_SLOW,
      advanceMult: this.combat.advanceMult,
      entranceMs: 900,
      entranceDelayMs: delay,
      restAlpha: 0.6,
      knockbackMs: 700,
      knockbackPauseMs: GHOST_KNOCKBACK_PAUSE_MS,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -92,
      idleBobDy: 7,
      idleBobMs: 1000,
      defeatRiseY: -50,
      defeatMs: 500,
      fontSize: 34,
      // Wisp-themed pale gray-green burst — a ghost going down in mist, not brass.
      burstColor: GHOST_BURST_COLOR,
      defeatImpactKind: "mist",
      defeatImpactColor: GHOST_BURST_COLOR,
      claimLineFrom: () => ({
        x: this.wrenContainer.x,
        y: this.wrenContainer.y - 116,
      }),
      claimLineColor: GHOST_BURST_COLOR,
      // UI-cohesion: the legibility outline (TTT-style) so the word reads against
      // the painted wood + mist.
      outline: true,
      // Mask the ward mark — the player supplies the punctuation bound to this
      // ghost's approach direction (read off the compass), not read off the word.
      maskMarks: true,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      onDefeated: () => {
        playChime();
        this.checkGhostWaveComplete();
      },
      onReachWren: (self) => {
        playBodyContactCue(this, self.container, this.wrenContainer, {
          kind: "mist",
          color: GHOST_BURST_COLOR,
          sourceOffsetY: -60,
          targetOffsetY: -108,
          sourceRadius: 32,
          targetRadius: 36,
        });
        if (!reducedMotion(this)) this.cameras.main.shake(180, 0.004);
        playWrenHurt(this.wrenSprite, { knockX: 0 });
        playDamageThud();
        flashDamageVignette(this);
      },
    });

    this.ghosts.push(ghost);
  }

  /** Off-screen start + on-screen rest positions for each compass direction.
   *  Slots stagger ghosts along the axis perpendicular to their approach
   *  so two ghosts from the same direction don't overlap. */
  private spawnPositionFor(direction: WoodDirection, slot: number): {
    startX: number;
    startY: number;
    restX: number;
    restY: number;
  } {
    const screenW = this.scale.width;
    const screenH = this.scale.height;
    switch (direction) {
      case "north": {
        const restX = 760 + slot * 200;
        return {
          startX: restX,
          startY: -120,
          restX,
          restY: WOOD_NORTH_GHOST_REST_Y,
        };
      }
      case "south": {
        const restX = 800 + slot * 180;
        return {
          startX: restX,
          startY: screenH + 120,
          restX,
          restY: WOOD_SOUTH_GHOST_REST_Y,
        };
      }
      case "east": {
        const restY = WOOD_SIDE_GHOST_REST_Y + slot * WOOD_SIDE_GHOST_STEP_Y;
        return {
          startX: screenW + 120,
          startY: restY,
          restX: 1580,
          restY,
        };
      }
      case "west": {
        const restY = WOOD_SIDE_GHOST_REST_Y + slot * WOOD_SIDE_GHOST_STEP_Y;
        return { startX: -120, startY: restY, restX: 340, restY };
      }
    }
  }

  /** Draw the four punctuation glyphs at compass points around Wren on
   *  the first ghost spawn. Idempotent — repeat calls do nothing. */
  private ensureCompassDrawn(): void {
    if (this.compassGlyphs.length > 0) return;
    const RADIUS_X = 150;
    const RADIUS_Y = 104;
    const compassCenterY = WREN_Y - 84;
    const positions: Array<{ dir: WoodDirection; x: number; y: number }> = [
      { dir: "north", x: WREN_X, y: compassCenterY - RADIUS_Y },
      // Keep the south mark in the painted scene instead of under the console.
      { dir: "south", x: WREN_X, y: compassCenterY + RADIUS_Y },
      { dir: "east", x: WREN_X + RADIUS_X, y: compassCenterY },
      { dir: "west", x: WREN_X - RADIUS_X, y: compassCenterY },
    ];
    for (const p of positions) {
      const glyph = this.add
        .text(p.x, p.y, WOOD_DIRECTION_PUNCTUATION[p.dir], {
          fontFamily: SERIF,
          fontSize: "44px",
          color: PALETTE.cream,
          fontStyle: "italic",
        })
        .setOrigin(0.5)
        .setAlpha(0.50)
        .setDepth(2);
      this.compassGlyphs.push(glyph);
    }
  }

  private drawGhostInto(
    c: Phaser.GameObjects.Container,
    punctuated: boolean,
  ): void {
    // Painted wraith sprite replaces the old translucent-ellipse graphics. The
    // enemy applies restAlpha (0.6) to the whole container, keeping the ghostly
    // translucence while the local mist halo keeps the threat physically present.
    c.add(addLocalGroundShadow(this, 148, 24, { y: 28, alpha: 0.2 }));
    c.add(this.makeWoodGhostMistHalo(punctuated));
    const sprite = this.add.image(0, 0, "wood-ghost");
    sprite.setScale(WOOD_GHOST_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
  }

  private makeWoodGhostMistHalo(punctuated: boolean): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const accent = punctuated ? 0xf1fff1 : GHOST_BURST_COLOR;
    g.fillStyle(0xceddce, 0.13);
    g.fillEllipse(0, 8, 162, 92);
    g.fillStyle(0xe8f2e8, punctuated ? 0.13 : 0.1);
    g.fillEllipse(0, -8, 112, 142);
    g.lineStyle(punctuated ? 3 : 2, accent, punctuated ? 0.3 : 0.22);
    g.strokeEllipse(0, 4, 144, 82);
    g.lineStyle(1, 0xffffff, punctuated ? 0.18 : 0.12);
    g.strokeEllipse(0, -20, 82, 118);
    g.fillStyle(accent, punctuated ? 0.32 : 0.22);
    g.fillCircle(-54, -28, 4.5);
    g.fillCircle(56, -18, 3.8);
    g.fillCircle(-34, 42, 3.2);
    g.fillCircle(46, 36, 3.2);
    return g;
  }

  private checkGhostWaveComplete(): void {
    // The length guard is load-bearing: [].every() is true, so without it a
    // call between waves (when ghosts is empty) would re-fire the last
    // continuation. Only advance when a real wave is present and fully down.
    if (this.ghosts.length === 0 || !this.ghosts.every((g) => g.isDefeated())) {
      return;
    }

    const onCleared = this.onWaveCleared;
    this.ghosts = [];
    this.onWaveCleared = null;
    const next: Partial<Record<WoodStep, WoodStep>> = {
      crossroads1: "crossroads1-cleared", crossroads2: "crossroads3-intro", crossroads3: "fork1",
      "boss-a": "boss-a-cleared", "boss-b": "boss-b-cleared",
    };
    const boundary = next[this.checkpointStep];
    if (boundary) this.checkpoint(boundary);
    if (onCleared) this.time.delayedCall(1000, onCleared);
  }

  // ─── Mist roll mechanic ───────────────────────────────────────────────────

  private triggerMistRoll(): void {
    if (this.wardPracticeActive) return;
    // Tier 4 — mist-clear (Wind-Phrase): the mist still rolls (ambiance) but
    // never blinds. warm-light (Firefly / Beacon / Pelt): the blind is shorter,
    // capped. Both bounded so the realm's signature mist still reads as a hazard.
    const mistClears = this.combat.perWaveProcs.includes("mist-clear");
    const peakAlpha = 0.45 * (1 - this.combat.warmLight);
    const blindMs = 800 * (1 - this.combat.warmLight);

    const mist = this.add.graphics();
    mist.fillStyle(0xe8eee8, 0);
    mist.fillRect(0, 0, this.scale.width, this.scale.height);
    mist.setDepth(100);

    this.tweens.add({
      targets: mist,
      alpha: peakAlpha,
      duration: 600,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Mist peak: obscure ghost words for the hold duration. Player must
        // clear words before the roll, or hold their nerve and type blind —
        // unless the wind-phrase lifts the mist (words stay readable).
        if (mistClears) this.playWindPhraseClearCue();
        else this.setActiveGhostWordsHidden(true);
        this.time.delayedCall(blindMs, () => {
          if (!mistClears) this.setActiveGhostWordsHidden(false);
          this.tweens.add({
            targets: mist,
            alpha: 0,
            duration: 600,
            ease: "Sine.easeOut",
            onComplete: () => mist.destroy(),
          });
        });
      },
    });
  }

  private playWindPhraseClearCue(): void {
    const x = this.scale.width / 2;
    const y = Math.max(360, Math.min(this.scale.height - 360, this.wrenContainer.y - 220));
    playClaimLine(
      this,
      this.band.satchelAnchor.x + 58,
      this.band.bandTopY - 10,
      x,
      y,
      { color: 0xd8eecf, depth: 101, durationMs: 360 },
    );
    playSceneEventPulse(this, {
      kind: "mist",
      color: 0xd8eecf,
      x,
      y,
      depth: 101,
      durationMs: 520,
      ringWidth: 720,
      ringHeight: 150,
      count: 14,
      alpha: 0.1,
      spreadX: 330,
      spreadY: 78,
    });
  }

  private setActiveGhostWordsHidden(hidden: boolean): void {
    for (const ghost of this.ghosts) {
      if (ghost.isDefeated() || !ghost.target) continue;
      ghost.target.setHidden(hidden);
    }
  }

  // ─── Passage-chain helper ─────────────────────────────────────────────────

  private runPassageChain(
    steps: Array<{
      word: string;
      narrator: string;
      beforeResponse?: (onSettled: () => void) => void;
    }>,
    onDone: () => void,
    owner?: {
      body?: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined;
      sourceOffsetY?: number;
      ghostKing?: boolean;
      side?: "left" | "right";
      checkpoint?: WoodStep;
      index?: number;
      response?: boolean;
    },
  ): void {
    let idx = woodIndex(owner?.index, steps.length);
    const respond = (): void => {
      const step = steps[idx];
      if (!step) { onDone(); return; }
      if (owner?.checkpoint) this.checkpoint(owner.checkpoint, { index: idx, response: true, begun: true });
      this.setNarrator(step.narrator);
      this.band.setObjective("Phrase complete. Press Enter or Space to continue.");
      this.readThen(() => { idx += 1; advance(); });
    };
    const advance = (): void => {
      if (idx >= steps.length) {
        onDone();
        return;
      }
      const step = steps[idx];
      if (!step) return;
      if (owner?.checkpoint) this.checkpoint(owner.checkpoint, { index: idx, begun: true });
      this.band.setObjective(`Type the shown phrase (${idx + 1}/${steps.length}), including spaces and punctuation.`);
      const ownerWordPos = owner?.body?.scene
        ? this.ownerPassageWordPosition(owner.body, owner.sourceOffsetY, {
            side: owner.side,
          })
        : null;
      const opts: TextWordTargetOptions = {
        scene: this,
        word: step.word,
        x: ownerWordPos?.x ?? this.scale.width / 2,
        // A ground prop owns the phrase directly above its visible silhouette.
        // Unowned passages keep the original high lane above Wren.
        y: ownerWordPos?.y ?? WOOD_BRANCH_WORD_Y,
        fontSize: 36,
        onClaim: () => playWrenFocus(this.wrenSprite),
        onAdvance: (cursor, wordLength) => {
          // Completion fades the target before its callback runs. Protect that
          // interval too, so an early Continue cannot become a typing miss.
          if (step.beforeResponse && cursor === wordLength) this.fluteHandoffPending = true;
        },
        onComplete: () => {
          playChime();
          playWrenAction(this.wrenSprite);
          playBodyImpact(this, this.wrenContainer, {
            kind: "mist",
            color: PALETTE_HEX.moss,
            offsetY: -108,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          this.clearActiveTargets();
          if (owner?.checkpoint) this.checkpoint(owner.checkpoint, { index: idx, response: true, begun: true });
          if (step.beforeResponse) step.beforeResponse(respond);
          else respond();
        },
      };
      const target = owner?.ghostKing
        ? this.makeGhostKingWord(opts)
        : owner?.body?.scene
          ? this.makeWoodForkWord(owner.body, opts, owner.sourceOffsetY)
          : this.makeWord(opts);
      this.registerActiveTarget(target);
    };
    if (owner?.response && steps[idx]) {
      const step = steps[idx]!;
      if (step.beforeResponse) step.beforeResponse(respond); else respond();
    } else advance();
  }

  private ownerPassageWordPosition(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    sourceOffsetY = -48,
    opts: { side?: "left" | "right" } = {},
  ): { x: number; y: number } {
    if (!body?.scene) return { x: this.scale.width / 2, y: this.scale.height - 340 };
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1 : body.x < this.scale.width / 2 ? 1 : -1;
    const x = Math.max(330, Math.min(this.scale.width - 330, body.x + side * 185));
    if (body === this.groveLightCue && !body.getData?.("grove-ignited")) {
      return { x: 520, y: WOOD_BRANCH_WORD_Y };
    }
    if (body === this.offeringCue || body === this.boneFluteCue) {
      // These low, rooted props flank Wren. Center the command over the
      // bowl/hollow rather than displacing it toward an unrelated tree.
      return { x: body.x, y: body.y - 200 };
    }
    const y = Math.max(330, Math.min(this.scale.height - 360, body.y + sourceOffsetY - 92));
    return { x, y };
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
    if (this.fluteHandoffPending) {
      event.preventDefault();
      return;
    }
    if (this.wardPracticeActive && event.key.length === 1 &&
      event.key.toLowerCase() !== this.wardPracticeTarget?.remaining()[0]) {
      this.band.setObjective("Practice: use the shown direction's mark at the dot. The spirit will wait.");
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** UI-cohesion: every Wood word target gets the legibility outline by default
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

  private makeIngaWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.ingaFigure;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.ingaWordAnchors.indexOf(anchor);
      if (idx >= 0) this.ingaWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.moss,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 62,
          { color: PALETTE_HEX.moss, depth: 58 },
        );
        this.attendInga();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -62,
          depth: 58,
          ringRadius: 28,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -62,
          depth: 58,
          ringRadius: 46,
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
        color: PALETTE_HEX.moss,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -62,
        targetOffsetY: 24,
      },
    );
    this.ingaWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private playWrenTypingPulse(): void {
    playBodyTypePulse(this, this.wrenContainer, {
      kind: "mist",
      color: PALETTE_HEX.moss,
      offsetY: -108,
      depth: 58,
      ringRadius: 22,
    });
  }

  private makeGhostKingWord(opts: TextWordTargetOptions): TextWordTarget {
    if (!this.ghostKingBody) return this.makeWord(opts);
    const body = this.ghostKingBody;
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
      burstColor: opts.burstColor ?? PALETTE_HEX.moss,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 30,
          { color: PALETTE_HEX.moss, depth: 58 },
        );
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -28,
          depth: 58,
          ringRadius: 30,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -28,
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
        color: PALETTE_HEX.moss,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -30,
        targetOffsetY: 24,
      },
    );
    this.bossWordAnchors.push(anchor);
    return target;
  }

  private makeWoodForkWord(
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
      burstColor: opts.burstColor ?? PALETTE_HEX.moss,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y + sourceOffsetY,
          { color: PALETTE_HEX.moss, depth: 58 },
        );
        if (!body.getData?.("rooted-wood-prop")) {
          playActorAttention(this, body, {
            tint: PALETTE_HEX.moss,
            scale: 1.024,
            durationMs: 180,
          });
        }
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 46,
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
        color: PALETTE_HEX.moss,
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
    if (!this.offeringCue?.scene) {
      this.offeringCue = this.createOfferingCue();
    }
    if (!this.boneFluteCue?.scene) {
      this.boneFluteCue = this.createBoneFluteCue();
    }
  }

  private showFork2Cues(): void {
    if (!this.groveLightCue?.scene) {
      this.groveLightCue = this.createGroveLightCue();
    }
  }

  /** Solid stone/roots stay planted; only mist and the entrance alpha move. */
  private createRootedWoodProp(
    x: number,
    texture: "wood-offering-shrine" | "wood-flute-hollow",
    width: number,
    mistOffsetY: number,
    entranceMs: number,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, 812).setDepth(42)
      .setData("rooted-wood-prop", true).setAlpha(reducedMotion(this) ? 1 : 0);
    c.add(addLocalGroundShadow(this, width * 0.86, 18, { y: 4, alpha: 0.24 }));
    this.addRootedWoodPainting(c, texture, width);
    addContainerWake(this, c, {
      kind: "mist", intervalMs: 540, spreadX: 34, spreadY: 16,
      offsetY: mistOffsetY, alpha: 0.18, size: 4, depth: 41,
      driftX: 30, driftY: -30, durationMs: 1400,
    });
    if (!reducedMotion(this)) this.tweens.add({
      targets: c, alpha: 1, duration: entranceMs, ease: "Sine.easeOut",
    });
    return c;
  }

  private addRootedWoodPainting(
    owner: Phaser.GameObjects.Container,
    texture: "wood-offering-shrine" | "wood-flute-hollow",
    width: number,
  ): Phaser.GameObjects.Image {
    const image = this.add.image(0, 0, texture);
    // Measured solid alpha footprints of the accepted cutouts; transparent
    // export margins never become a floating floor or shrink the world prop.
    const footprint = texture === "wood-offering-shrine"
      ? { left: 20, right: 1428, bottom: 907 }
      : { left: 27, right: 1516, bottom: 991 };
    image.setOrigin((footprint.left + footprint.right) / 2 / image.width,
      footprint.bottom / image.height);
    image.setScale(width / (footprint.right - footprint.left));
    applySceneActorLighting(this, image);
    owner.add(image);
    return image;
  }

  private createOfferingCue(): Phaser.GameObjects.Container {
    return this.createRootedWoodProp(690, "wood-offering-shrine", 230, -72, 640);
  }

  private createBoneFluteCue(): Phaser.GameObjects.Container {
    const c = this.createRootedWoodProp(1230, "wood-flute-hollow", 260, -74, 660);
    const flute = this.add.image(0, -74, "wood-bone-flute");
    flute.setScale(104 / flute.height);
    applySceneActorLighting(this, flute);
    c.add(flute);
    this.boneFluteProp = flute;
    return c;
  }

  /** Leave the hollow empty before describing the flute in Wren's fingers. */
  private settleBoneFluteInHand(onSettled: () => void): void {
    const flute = this.boneFluteProp;
    if (!flute?.scene) {
      this.fluteHandoffPending = false;
      onSettled();
      return;
    }
    this.clearHeldWoodRelic();
    const world = flute.getWorldTransformMatrix();
    this.boneFluteCue?.remove(flute);
    this.add.existing(flute);
    flute.setPosition(world.tx, world.ty).setDepth(43).setAlpha(1);
    flute.setScale(86 / flute.height);
    this.boneFluteProp = null;
    this.heldWoodRelic = flute;
    const hand = { x: this.wrenContainer.x + 52, y: this.wrenContainer.y - 96 };
    if (reducedMotion(this)) {
      flute.setPosition(hand.x, hand.y);
      onSettled();
      return;
    }
    this.fluteHandoffPending = true;
    this.band.setObjective("Taking the flute…");
    this.tweens.add({
      targets: flute,
      ...hand,
      duration: 520,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!flute.scene) return;
        this.fluteHandoffPending = false;
        onSettled();
      },
    });
  }

  private showGatheredAshVial(): void {
    this.clearHeldWoodRelic();
    const vial = this.add.image(this.wrenContainer.x + 52, this.wrenContainer.y - 96, "wood-ash-vial");
    vial.setScale(62 / vial.height).setDepth(43);
    applySceneActorLighting(this, vial);
    this.heldWoodRelic = vial;
  }

  private clearHeldWoodRelic(): void {
    this.fluteHandoffPending = false;
    const relic = this.heldWoodRelic;
    this.heldWoodRelic = null;
    if (!relic?.scene) return;
    this.tweens.killTweensOf(relic);
    relic.destroy();
  }

  private createGroveLightCue(): Phaser.GameObjects.Container {
    return this.createRootedWoodProp(560, "wood-offering-shrine", 230, -72, 680);
  }

  /** Keep the chosen fire visible while the king answers what it has woken. */
  private igniteGroveLightCue(): void {
    const cue = this.groveLightCue ?? this.createGroveLightCue();
    this.groveLightCue = cue;
    if (cue.getData("grove-ignited")) return;
    cue.setData("grove-ignited", true);
    this.tweens.killTweensOf(cue);
    // Keep the consequence on the far-left foreground, outside the spirits'
    // resting lanes. Their containers use depth0, so the fire stays behind
    // them while its words and the king remain fully visible.
    cue.x = this.scale.width * 0.06;
    cue.y = 770;
    cue.setDepth(-0.5).setAlpha(1).setScale(1);

    // The lit choice becomes a small painted fire planted on the grove floor;
    // replace the unlit bowl without changing its gameplay/cleanup owner.
    cue.removeAll(true);
    cue.add(addLocalGroundShadow(this, 174, 22, { y: 4, alpha: 0.28 }));
    const fire = this.add.image(0, 4, "wood-grove-fire").setOrigin(0.5, 1);
    fire.setScale(196 / fire.height);
    cue.add(fire);

    const warmth = addLivingLight(this, {
      x: cue.x, y: cue.y - 64, width: 820, height: 420,
      color: 0xe77d32, alpha: 0.44, depth: -2,
      durationMs: 1900, scale: 1.04,
    });
    cue.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (warmth.scene) warmth.destroy();
    });
    if (!reducedMotion(this)) {
      addContainerWake(this, cue, {
        kind: "ember", color: 0xf2a04b, intervalMs: 230,
        offsetY: -108, spreadX: 42, spreadY: 24,
        alpha: 0.32, size: 3.5, depth: -0.5, driftY: -70,
        durationMs: 1100,
      });
    }
  }

  private fadeOutForkCue(
    cue: Phaser.GameObjects.Container | null,
    opts: { riseY?: number; durationMs?: number } = {},
  ): void {
    if (!cue?.scene) return;
    this.tweens.killTweensOf(cue);
    this.tweens.add({
      targets: cue,
      ...(cue.getData("rooted-wood-prop") && !cue.getData("grove-ignited")
        ? {} : { y: cue.y + (opts.riseY ?? 18) }),
      alpha: 0,
      duration: opts.durationMs ?? 540,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (cue.scene) cue.destroy();
      },
    });
  }

  private clearWoodForkCues(): void {
    this.clearForkChoiceWordAnchors();
    this.clearHeldWoodRelic();
    for (const cue of [this.offeringCue, this.boneFluteCue, this.groveLightCue]) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
    this.offeringCue = null;
    this.boneFluteCue = null;
    this.boneFluteProp = null;
    this.groveLightCue = null;
  }

  private makeWispCatWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.wispCatCompanion;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.wispCatWordAnchors.indexOf(anchor);
      if (idx >= 0) this.wispCatWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.moss,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 58,
          { color: PALETTE_HEX.moss, depth: 58 },
        );
        this.pulseWispCatCompanion();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -58,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "mist",
          color: PALETTE_HEX.moss,
          offsetY: -58,
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
        color: PALETTE_HEX.moss,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -58,
        targetOffsetY: 24,
      },
    );
    this.wispCatWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);
    if (speakerName === "Inga" || speakerName === "Lost ghost") {
      this.attendInga();
    } else if (speakerName === "Ghost-King") {
      this.attendGhostKing();
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Ghost-King") {
      this.band.setPortrait("ghost-king", "Ghost-King");
    } else if (speakerName === "Inga" || speakerName === "Lost ghost") {
      this.band.setPortrait("wood-ghost", speakerName);
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private pulseWoodWave(
    opts: { y?: number; ringWidth?: number; ringHeight?: number; count?: number } = {},
  ): void {
    playSceneEventPulse(this, {
      kind: "mist",
      color: 0xa7d8a2,
      x: this.scale.width / 2,
      y: 700,
      ringWidth: 1120,
      ringHeight: 190,
      count: 12,
      alpha: 0.13,
      ...opts,
    });
  }

  private attendInga(): void {
    playActorAttention(this, this.ingaFigure, {
      scale: 1.035,
      durationMs: 220,
    });
  }

  private attendGhostKing(): void {
    playActorAttention(this, this.ghostKingBody, {
      scale: 1.025,
      durationMs: 220,
      tint: PALETTE_HEX.moss,
    });
  }

  private pulseShrine(): void {
    if (!this.shrineFigure?.scene) return;
    playBodyImpact(this, this.shrineFigure, {
      kind: "mist",
      color: 0xd7ded8,
      offsetY: -78,
      depth: 8,
      ringRadius: 42,
      count: 8,
      durationMs: 500,
    });
  }

  private fadeGhostKingBody(): void {
    const body = this.ghostKingBody;
    if (!body?.scene) return;
    this.tweens.killTweensOf(body);
    this.tweens.add({
      targets: body,
      alpha: 0,
      y: body.y - 36,
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (body.scene) body.destroy();
        if (this.ghostKingBody === body) this.ghostKingBody = null;
      },
    });
  }

  // ─── Tier 4 relic helpers ───────────────────────────────────────────────────

  /** The live, non-frozen ghosts summarised for an offensive one-shot's "strongest
   *  foe" pick. Progress is the Euclidean close on Wren (the Wood advance is
   *  diagonal); the word length breaks ties. Defeated + jam-frozen ghosts drop out
   *  (the latter so a second one-shot isn't wasted re-seizing it); only worded
   *  ghosts count — one mid-entrance/knock-back isn't yet a threat. */
  private liveGhostThreats(): OneShotThreat<MovingWordEnemy>[] {
    const threats: OneShotThreat<MovingWordEnemy>[] = [];
    for (const g of this.ghosts) {
      if (g.isDefeated() || g.isFrozen() || !g.target) continue;
      threats.push({
        enemy: g,
        progress: g.advanceProgress(),
        wordLength: g.word.length,
      });
    }
    return threats;
  }

  /** Run an offensive one-shot's consequence on the ghosts. The invoker has
   *  already picked the target(s), spent the Soul, and consumed the once-per-realm
   *  charge. toll-strike fells the strongest ghost (the bell's tongue); jam-foe
   *  freezes it in place (still typeable, a sitting duck); bind-beat freezes EVERY
   *  live ghost for a breath, then they thaw and resume the approach. */
  private applyOneShot(
    effect: OffensiveOneShot,
    targets: readonly MovingWordEnemy[],
  ): void {
    if (!this.usedOneShots.includes(effect)) this.usedOneShots.push(effect);
    if (effect === "toll-strike") {
      const t = targets[0];
      if (!t || t.isDefeated()) return;
      this.playOneShotSourceLine(
        effect,
        t.container.x,
        t.container.y - 78,
        PALETTE_HEX.ember,
      );
      playBellToll();
      playBodyImpact(this, t.container, {
        kind: "ember",
        color: PALETTE_HEX.ember,
        offsetY: -78,
        depth: 63,
        ringRadius: 44,
        count: 10,
        durationMs: 380,
      });
      playWordCompleteBurst(this, t.container.x, t.restY - 80, {
        color: PALETTE_HEX.ember,
        count: 16,
        radius: 60,
      });
      if (!reducedMotion(this)) this.cameras.main.shake(160, 0.004);
      t.defeat();
    } else if (effect === "jam-foe") {
      const t = targets[0];
      if (!t || t.isDefeated()) return;
      this.playOneShotSourceLine(
        effect,
        t.container.x,
        t.container.y - 78,
        PALETTE_HEX.frost,
      );
      playSparkZap();
      playBodyImpact(this, t.container, {
        kind: "snow",
        color: PALETTE_HEX.frost,
        offsetY: -78,
        depth: 63,
        ringRadius: 38,
        count: 8,
        durationMs: 380,
      });
      t.freeze();
    } else if (effect === "bind-beat") {
      playWaveSting();
      if (!reducedMotion(this)) this.cameras.main.shake(220, 0.004);
      for (const g of targets) {
        if (!g.isDefeated()) {
          this.playOneShotSourceLine(
            effect,
            g.container.x,
            g.container.y - 78,
            PALETTE_HEX.brass,
          );
          playBodyImpact(this, g.container, {
            kind: "mist",
            color: PALETTE_HEX.brass,
            offsetY: -78,
            depth: 63,
            ringRadius: 34,
            count: 6,
            durationMs: 360,
          });
          g.freeze(BIND_BEAT_FREEZE_MS);
        }
      }
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

  /** Re-arm the per-wave relic procs at each ghost wave's start. */
  private beginCombatWave(): void {
    this.waveForgivenessReady =
      this.combat.perWaveProcs.includes("forgive-wave-miss");
    this.applyAutoEase();
    this.applyCompanionTrip();
  }

  /** companion-trip (snow-fox-cub): a short while into each wave the fox darts in
   *  and trips the most-advanced ghost (a stumble). No-op without the relic. */
  private applyCompanionTrip(): void {
    if (!this.combat.perWaveProcs.includes("companion-trip")) return;
    this.time.delayedCall(COMPANION_TRIP_DELAY_MS, () => {
      const tripped = tripMostAdvancedFoe(this, this.ghosts, {
        textureKey: "wood-companion-snow-fox",
        startX: this.wrenContainer.x - 120,
        startY: this.wrenContainer.y - 18,
        height: 72,
        depth: 58,
        color: PALETTE_HEX.frost,
        kind: "snow",
      });
      if (tripped && !this.snowFoxTripNoticed) {
        this.snowFoxTripNoticed = true;
        this.band.showNotice("Snow-fox trips the lead ghost.", {
          label: "companion",
          itemId: "snow-fox-cub",
          durationMs: 1600,
        });
      }
    });
  }

  /** auto-ease (Etta's Ledger — owned by the time Wren reaches the Wood): mark
   *  the easiest (shortest-word) ghost of the wave with a soft glow. A small
   *  edge against the all-sides pressure, not a free kill. */
  private applyAutoEase(): void {
    if (!this.combat.perWaveProcs.includes("auto-ease")) return;
    if (this.ghosts.length === 0) return;
    let easiest = this.ghosts[0]!;
    for (const g of this.ghosts) {
      if (g.word.length < easiest.word.length) easiest = g;
    }
    const glow = this.add.graphics();
    glow.fillStyle(0xc9a14a, 0.22);
    glow.fillEllipse(0, 0, 90, 110);
    easiest.container.addAt(glow, 0);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.22, to: 0.5 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.time.delayedCall(980, () => {
      if (easiest.isDefeated() || !easiest.container.scene) return;
      playClaimLine(
        this,
        this.band.satchelAnchor.x + 58,
        this.band.bandTopY - 10,
        easiest.container.x,
        easiest.container.y - 66,
        { color: PALETTE_HEX.brass, depth: 58, durationMs: 340 },
      );
      playBodyImpact(this, easiest.container, {
        kind: "mote",
        color: PALETTE_HEX.brass,
        offsetY: -66,
        depth: 58,
        ringRadius: 30,
        count: 7,
        durationMs: 360,
      });
    });
  }

  /** Gentle "forgiven" cue when forgive-wave-miss spares a slip — distinct from
   *  the harsh miss flinch. */
  private flashForgiven(): void {
    const x = this.wrenContainer?.scene ? this.wrenContainer.x : WREN_X;
    const y = this.wrenContainer?.scene
      ? Math.max(300, Math.min(this.scale.height - 330, this.wrenContainer.y - 120))
      : WREN_Y - 120;

    const plate = this.add
      .graphics()
      .setPosition(x, y)
      .setDepth(59)
      .setAlpha(0.76);
    plate.fillStyle(0x10180f, 0.42);
    plate.fillRoundedRect(-92, -23, 184, 46, 12);
    plate.lineStyle(2, PALETTE_HEX.moss, 0.48);
    plate.strokeRoundedRect(-84, -17, 168, 34, 10);
    plate.lineStyle(3, PALETTE_HEX.brass, 0.5);
    plate.lineBetween(-60, 6, -36, -7);
    plate.lineBetween(-36, -7, -12, 5);
    plate.lineBetween(12, 5, 38, -8);
    plate.lineBetween(38, -8, 62, 6);

    if (this.wrenContainer?.scene) {
      playBodyImpact(this, this.wrenContainer, {
        kind: "mist",
        color: PALETTE_HEX.moss,
        offsetY: -108,
        depth: 58,
        ringRadius: 32,
        count: 8,
        durationMs: 380,
      });
    }

    const txt = this.add
      .text(x, y, "forgiven", {
        fontFamily: SERIF,
        fontSize: "24px",
        fontStyle: "italic",
        color: PALETTE.brass,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0.9);
    this.tweens.add({
      targets: [plate, txt],
      alpha: 0,
      y: "-=36",
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => {
        plate.destroy();
        txt.destroy();
      },
    });
  }

  private noticeShrineForgiveness(): void {
    if (this.shrineForgivenessNoticed) return;
    this.shrineForgivenessNoticed = true;
    this.band.showNotice("Shrine-Token forgives the slip.", {
      label: "relic",
      itemId: "shrine-token",
      durationMs: 1600,
    });
  }

  private clearActiveTargets(): void {
    this.clearIngaWordAnchors();
    this.clearBossWordAnchors();
    this.clearForkChoiceWordAnchors();
    this.clearWispCatWordAnchors();
    this.releasePathCueWordAnchor();
    this.dismissRevisitMemoryCue(false);
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  private clearIngaWordAnchors(): void {
    for (const anchor of this.ingaWordAnchors) anchor.destroy();
    this.ingaWordAnchors = [];
  }

  private clearBossWordAnchors(): void {
    for (const anchor of this.bossWordAnchors) anchor.destroy();
    this.bossWordAnchors = [];
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private clearWispCatWordAnchors(): void {
    for (const anchor of this.wispCatWordAnchors) anchor.destroy();
    this.wispCatWordAnchors = [];
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawShrine(): void {
    const sx = 960;
    const sy = 810;
    const c = this.add.container(sx, sy).setDepth(-1).setAlpha(0);
    this.shrineFigure = c;

    c.add(addLocalGroundShadow(this, 150, 18, { y: 14, alpha: 0.18 }));

    const glow = this.add.graphics().setPosition(0, -78);
    glow.fillStyle(0xe8e5c6, 0.14);
    glow.fillEllipse(0, 0, 92, 56);
    glow.fillStyle(0xa7d8a2, 0.09);
    glow.fillEllipse(0, 14, 138, 44);
    c.add(glow);

    this.addRootedWoodPainting(c, "wood-offering-shrine", 180);

    const flame = this.add.graphics().setPosition(0, -82);
    flame.fillStyle(0xd4a040, 0.55);
    flame.fillEllipse(0, 4, 22, 28);
    flame.fillStyle(0xf6e5a8, 0.92);
    flame.fillEllipse(0, 0, 10, 18);
    c.add(flame);

    const wick = this.add.graphics().setPosition(0, -72);
    wick.lineStyle(1.5, 0x17100a, 0.65);
    wick.lineBetween(0, 0, 0, 10);
    c.add(wick);

    const wispOffsets = [-46, 44];
    for (let i = 0; i < wispOffsets.length; i += 1) {
      const offsetX = wispOffsets[i] ?? 0;
      const wisp = this.add
        .graphics()
        .setPosition(offsetX, -38 + i * 8)
        .setAlpha(0.16);
      wisp.fillStyle(0xd7ded8, 0.42);
      wisp.fillEllipse(0, 0, 72, 14);
      c.add(wisp);
      this.tweens.add({
        targets: wisp,
        x: offsetX + (i === 0 ? -18 : 18),
        y: wisp.y - 22,
        alpha: 0,
        duration: 2600 + i * 360,
        delay: 500 + i * 780,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.tweens.add({
      targets: glow,
      scaleX: 1.08,
      scaleY: 1.16,
      alpha: 0.82,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: flame,
      scaleX: 1.12,
      scaleY: 1.24,
      y: -86,
      duration: 740,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 480,
      ease: "Sine.easeOut",
    });
  }

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 92, 20, { y: 6, alpha: 0.27 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    stageContainerEntrance(this, c, {
      breathDy: -4,
      breathMs: 2300,
    });
    addContainerWake(this, c, {
      kind: "mist",
      intervalMs: 560,
      spreadX: 32,
      spreadY: 10,
      offsetY: -84,
      color: 0xa7d8a2,
      alpha: 0.13,
      size: 4.4,
      depth: 0.24,
      driftX: 48,
      driftY: -16,
      durationMs: 1100,
    });
    return c;
  }

  private drawInga(x: number, y: number): void {
    this.clearIngaWordAnchors();
    if (this.ingaFigure?.scene) this.ingaFigure.destroy();
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 72, 16, { y: 34, alpha: 0.2 }));

    const glow = this.add.graphics();
    glow.fillStyle(0xfaf4e8, 0.12);
    glow.fillEllipse(0, -4, 66, 96);
    c.add(glow);

    const sprite = this.add.image(0, -2, "wood-ghost");
    sprite
      .setScale(INGA_GHOST_SPRITE_HEIGHT / sprite.height)
      .setTint(0xf0e8d8)
      .setAlpha(0.72);
    c.add(sprite);

    const g = this.add.graphics();
    // A small ghost-lantern tethered to Inga. Keep it prop-like and warm so
    // it doesn't read as a UI selection marker in still screenshots.
    g.lineStyle(2, 0x4b4030, 0.74);
    g.beginPath();
    g.moveTo(24, -56);
    g.lineTo(20, 25);
    g.strokePath();
    g.lineStyle(1.5, 0x7e6a42, 0.66);
    g.beginPath();
    g.arc(26, -68, 14, Math.PI * 0.08, Math.PI * 0.92, true);
    g.strokePath();
    g.fillStyle(0xf0d78a, 0.14);
    g.fillCircle(26, -66, 31);
    g.fillStyle(0xf0d78a, 0.09);
    g.fillEllipse(26, -64, 48, 66);
    g.fillStyle(0x251b13, 0.4);
    g.fillEllipse(28, -61, 30, 46);
    g.fillStyle(0xf0d78a, 0.2);
    g.fillEllipse(26, -64, 28, 40);
    g.fillStyle(0xfaf4e8, 0.12);
    g.fillEllipse(26, -64, 18, 30);
    g.lineStyle(1.5, 0xc9a14a, 0.54);
    g.strokeEllipse(26, -64, 30, 42);
    g.lineStyle(1, 0xfaf4e8, 0.26);
    g.strokeEllipse(26, -75, 22, 8);
    g.strokeEllipse(26, -53, 21, 7);
    g.lineStyle(1, 0x7e6a42, 0.54);
    g.lineBetween(17, -76, 20, -53);
    g.lineBetween(35, -76, 32, -53);
    g.fillStyle(0x8a5c2c, 0.74);
    g.fillEllipse(26, -84, 18, 5);
    g.fillEllipse(26, -44, 16, 5);
    g.fillStyle(0xf6a35d, 0.75);
    g.fillEllipse(26, -63, 8, 15);
    g.fillStyle(0xfaf4e8, 0.68);
    g.fillEllipse(26, -66, 4, 8);
    g.lineStyle(1, 0xc9a14a, 0.42);
    g.lineBetween(26, -44, 26, -34);
    g.fillStyle(0xf0d78a, 0.5);
    g.fillCircle(26, -36, 2.4);
    c.add(g);
    this.ingaFigure = c;
    stageContainerEntrance(this, c, {
      entranceMs: 680,
      breathDy: -3,
      breathMs: 2600,
    });
  }

  private drawGhostKing(withKing = true): void {
    const gkx = 1400;
    const gky = 560;
    const rootBase = this.makeGhostKingRootBase(gkx, gky + 270);

    // The empty painted roots sit behind the unchanged, hovering king figure.
    const throne = this.drawGhostKingRootThrone(gkx, gky + 170).setAlpha(0);

    if (!withKing) {
      throne.setAlpha(1);
      rootBase.setAlpha(1);
      return;
    }

    // Ghost-King figure — painted sprite replaces the old translucent body +
    // head + crown + eye graphics. Scaled to the procedural figure height (crown
    // through body, throne excluded) and anchored on the figure's vertical
    // midpoint (~gky+44) so it sits on the throne the same way the flat shape did.
    const sprite = this.add.image(gkx, gky + 44, "ghost-king");
    sprite.setScale(GHOST_KING_SPRITE_HEIGHT / sprite.height);
    sprite.setAlpha(0);
    this.ghostKingBody = sprite;

    // Fade both in together.
    this.tweens.add({
      targets: [rootBase, throne, sprite],
      alpha: 1,
      duration: 1200,
      ease: "Sine.easeIn",
      onComplete: () => {
        addIdleBreath(this, sprite, { dy: -4, durationMs: 2600 });
        this.playGhostKingStagePulse();
      },
    });
  }

  private drawGhostKingRootThrone(x: number, y: number): Phaser.GameObjects.Image {
    // Preserve the original root envelope and ground contact. The transparent
    // center leaves the existing king visible, hovering just above the seat.
    const throne = this.add.image(x, y + 120, "wood-root-throne").setOrigin(0.5, 1);
    throne.setScale(360 / throne.width);
    return throne;
  }

  private makeGhostKingRootBase(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setAlpha(0);
    c.add(addLocalGroundShadow(this, 230, 34, {
      y: 16,
      alpha: 0.22,
      color: 0x020602,
    }));

    const mist = this.add.graphics();
    mist.fillStyle(0x11180f, 0.24);
    mist.fillEllipse(0, 4, 268, 46);
    mist.fillStyle(0xd8e2cf, 0.075);
    mist.fillEllipse(-34, -2, 178, 26);
    mist.fillEllipse(54, 8, 148, 23);
    mist.lineStyle(3, 0x6f8b68, 0.16);
    mist.lineBetween(-112, 2, -64, 10);
    mist.lineBetween(-54, 10, -8, -4);
    mist.lineBetween(4, -2, 58, 12);
    mist.lineBetween(50, 11, 118, 2);
    mist.lineStyle(1, 0xd8e2cf, 0.14);
    mist.lineBetween(-88, -8, -32, -14);
    mist.lineBetween(34, -10, 92, -14);
    mist.fillStyle(0xd8e2cf, 0.14);
    mist.fillCircle(-72, -8, 2.8);
    mist.fillCircle(72, -5, 2.5);
    mist.fillCircle(-8, -12, 2);
    c.add(mist);

    addContainerWake(this, c, {
      kind: "mist",
      intervalMs: 760,
      spreadX: 120,
      spreadY: 18,
      color: 0xd8e2cf,
      alpha: 0.12,
      size: 7,
      depth: 0.3,
      driftX: 76,
      driftY: -20,
      durationMs: 1260,
    });

    this.tweens.add({
      targets: c,
      scaleX: { from: 1.012, to: 0.988 },
      scaleY: { from: 0.992, to: 1.018 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private playGhostKingStagePulse(intense = false): void {
    if (!this.ghostKingBody) return;
    playBodyImpact(this, this.ghostKingBody, {
      kind: "mist",
      color: intense ? PALETTE_HEX.brass : PALETTE_HEX.moss,
      offsetY: -40,
      depth: 58,
      ringRadius: intense ? 88 : 68,
      count: intense ? 18 : 14,
      durationMs: intense ? 620 : 520,
    });
  }
}
