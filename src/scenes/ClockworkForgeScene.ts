import Phaser from "phaser";
import { type AmbientHandle, playAmbientForge } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { playDamageThud } from "../audio/damageThud";
import { playSparkZap } from "../audio/sparkZap";
import { playWaveSting } from "../audio/waveSting";
import { playBellToll } from "../audio/bellToll";
import {
  flashDamageVignette,
  playChainSpark,
  playWordCompleteBurst,
} from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
import {
  showLowHeartFeedback,
  showSpellReadyFeedback,
} from "../game/lowHeartFeedback";
import { NarrationManager } from "../game/narrationManager";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import {
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
import type { SaveStore } from "../game/saveState";
import { SPELL_COST } from "../game/sessionStats";
import { type ClaimMods, TypingInputController } from "../game/typingInput";
import { WaveDirector } from "../game/waveDirector";
import { MovingWordEnemy } from "../game/movingWordEnemy";
import {
  addAmbientDrift,
  addBackdropDrift,
  addContainerWake,
  attachWordBodyAnchor,
  dismissCompanionCameo,
  fadeOutStagedSprite,
  addLocalGroundShadow,
  addLivingLight,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playActorAttention,
  playRealmClearResonance,
  playSceneEventPulse,
  stageContainerEntrance,
  stageAnchoredSprite,
  stageCompanionCameo,
  stageTrueNameSeal,
  dismissTrueNameSeal,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import { pickAdaptiveWords, FORGE_COMMAND_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  bobWrenSprite,
  flashWrenMiss,
  makeWrenSprite,
  playWrenAction,
  playWrenFocus,
  playWrenHurt,
  preloadWren,
  setWrenPose,
} from "../game/wren";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons } from "../game/ui/satchelIcons";
import forgeBackdrop from "../../art/references/clockwork-forge-clean.png";
import forgeGolemSprite from "../../art/forge/golem.png";
import forgeCommandGolemSprite from "../../art/forge/command-golem.png";
import fornSprite from "../../art/forge/forn.png";
import runaPortrait from "../../art/runa/runa-front.png";
import brassSongbirdSprite from "../../art/companions/brass-songbird.png";
import snowFoxSprite from "../../art/companions/snow-fox.png";

// Danger ramps in over the LAST 60% of a golem's advance — earlier portion
// stays cream so players can read the word, then it shifts ember as the
// golem closes. Mirrors Winter Mountain.
const DANGER_RAMP_START = 0.4;

// ─── Scene data ───────────────────────────────────────────────────────────────

interface ForgeSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// ─── Golem entity ─────────────────────────────────────────────────────────────

// Advancing golems are now the shared MovingWordEnemy (this.golems). Only the
// stationary tutorial golem needs a bespoke record — it never advances or carries
// a word; Gregor's lesson drives it through golemTurnHead / golemCommandFlash.
interface StaticGolem {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
}

type ForgePassageOwner = "forn" | "apprentices" | "peaceful-order" | "none";
type ForgeChoiceCueKey = "apprentice" | "standDown" | "fight";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATWALK_Y = 440;
const FLOOR_Y = 780;

const GOLEM_ADVANCE_MS = 15000;

// Painted-sprite display heights (px), matching the old procedural body heights so
// the word anchor + hit feel line up. The boss is drawn inside a ×1.8 container,
// so its on-screen height is COMMAND_GOLEM_SPRITE_HEIGHT × 1.8. Tune on live.
const GOLEM_SPRITE_HEIGHT = 132;
const COMMAND_GOLEM_SPRITE_HEIGHT = 150;

// Smith Forn's standing portrait — a believable character height (px). He's a
// narration NPC, so this only affects his on-screen figure, not any hit/word
// anchor. Tune on live. Placed left-third, feet near FLOOR_Y.
const FORN_SPRITE_HEIGHT = 360;

/** Spawn slots on the foundry floor — same pattern as WinterMountainScene. */
const FLOOR_SLOTS = [
  { x: 340, y: FLOOR_Y },
  { x: 680, y: FLOOR_Y },
  { x: 1240, y: FLOOR_Y },
  { x: 1580, y: FLOOR_Y },
] as const;

/** Act 1: catwalk obstacle words */
const CATWALK_WORDS = ["step", "duck", "grip"] as const;
const CATWALK_NARRATIONS = [
  "A loose grate rattles under your boot. You test each step.",
  "A steam jet blasts from a pipe overhead. You duck just in time.",
  "The railing shakes violently. You grip the iron and hold on.",
] as const;

/** Fork 1 passage chains */
const FORN_PASSAGES = [
  "work the bellows",
  "seal the seam",
  "forn gives you his hammer",
  "the forge breathes again",
] as const;

const CABAL_PASSAGES = [
  "block the valve",
  "the apprentices cheer",
  "they hand you a wrench",
  "the forge chokes and slows",
] as const;

/** Boss phases */
const BOSS_PHASE1_WORDS = ["forge", "iron", "brass"] as const;
const BOSS_PHASE2_WORDS = ["HOLD", "STAND", "YIELD"] as const;

// ─── Scene ────────────────────────────────────────────────────────────────────

export class ClockworkForgeScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private director!: WaveDirector;
  private narration!: NarrationManager;
  private band!: ConsoleBand;
  private golems: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  private bossWordAnchors: WordBodyAnchorHandle[] = [];
  private tutorialWordAnchors: WordBodyAnchorHandle[] = [];
  private fornWordAnchors: WordBodyAnchorHandle[] = [];
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  private catwalkCue: Phaser.GameObjects.Container | null = null;
  private catwalkCueIndex: number | null = null;
  private catwalkCueWordAnchor: WordBodyAnchorHandle | null = null;
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;
  private apprenticeCue: Phaser.GameObjects.Container | null = null;
  private standDownCue: Phaser.GameObjects.Container | null = null;
  private fightCue: Phaser.GameObjects.Container | null = null;
  /** Smith Forn's standing portrait — only on screen during the Fork 1 beat. */
  private fornSprite?: Phaser.GameObjects.Image;

  private shiftHeld = false;
  private altHeld = false;
  private waveActive = false;

  // Tier 4 — relics from earlier realms shape this realm's combat. The Forge is
  // the only forward realm with a Soul-cast economy, so it's the home of
  // soul-banked (king-aurland) and soul-thrift (bellows-hammer). Resolved once
  // in create(); the hooks read it. `spellCost` folds in soul-thrift so every
  // cast site charges one shared, discounted price. Grace is gated OUT of the
  // Forge in the descriptor (no losable economy here).
  private combat: CombatLoadout = resolveCombatLoadout([], "clockwork-forge");
  private spellCost = SPELL_COST;
  private waveForgivenessReady = false;
  // Tier 4 — the Soul-charged, typed invocation for offensive one-shots. In the
  // Forge that's toll-strike (bells-tongue, earned in the Bell on a force fork):
  // a charged "toll" word strikes the strongest live golem. Null until create().
  private oneShotInvoker: OneShotInvoker<MovingWordEnemy> | null = null;

  /** Forge glow pools drawn on the floor. */
  private forgeGlowGraphics!: Phaser.GameObjects.Graphics;

  /** fork1: "forn" | "cabal" */
  private fork1Choice: "forn" | "cabal" | null = null;
  /** fork2: "peaceful" | "fought" */
  private fork2Choice: "peaceful" | "fought" | null = null;
  private companionAwarded = false;
  private songbirdCompanion: Phaser.GameObjects.Container | null = null;
  private songbirdWordAnchors: WordBodyAnchorHandle[] = [];
  /** True after the Quiet Lord's §5.5.10 intrusion has fired this playthrough. */
  private quietLordIntruded = false;
  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("ClockworkForgeScene");
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(data: ForgeSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.golems = [];
    this.activeTargets = [];
    this.bossWordAnchors = [];
    this.tutorialWordAnchors = [];
    this.fornWordAnchors = [];
    this.forkChoiceWordAnchors = [];
    this.catwalkCue = null;
    this.catwalkCueIndex = null;
    this.catwalkCueWordAnchor = null;
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.apprenticeCue = null;
    this.standDownCue = null;
    this.fightCue = null;
    this.oneShotInvoker = null;
    this.shiftHeld = false;
    this.waveActive = false;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.companionAwarded = false;
    this.songbirdCompanion = null;
    this.songbirdWordAnchors = [];
    this.quietLordIntruded =
      this.store.get().realms["clockwork-forge"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("forge-backdrop", forgeBackdrop);
    this.load.image("forge-golem", forgeGolemSprite);
    this.load.image("forge-command-golem", forgeCommandGolemSprite);
    this.load.image("forn", fornSprite);
    this.load.image("forge-companion-songbird", brassSongbirdSprite);
    this.load.image("forge-companion-snow-fox", snowFoxSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 26, 16, 8);
    const backdrop = this.add
      .image(0, 0, "forge-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 15500, driftX: -5, driftY: -2 });
    addAmbientDrift(this, {
      kind: "ember",
      count: 44,
      depth: -1,
      area: { x: 0, y: 360, width: this.scale.width, height: 480 },
      alpha: 0.55,
      minSize: 1.5,
      maxSize: 4.5,
      driftX: 70,
      driftY: -300,
      minDurationMs: 3600,
      maxDurationMs: 8200,
    });
    for (const gx of [380, 960, 1540]) {
      addLivingLight(this, {
        x: gx,
        y: FLOOR_Y + 12,
        width: 430,
        height: 170,
        color: PALETTE_HEX.ember,
        alpha: 0.07,
        depth: -5,
        durationMs: 1900 + gx / 4,
        delayMs: gx / 3,
        scale: 1.035,
      });
    }
    addAmbientDrift(this, {
      kind: "ember",
      count: 16,
      depth: -1.35,
      area: { x: 0, y: 420, width: this.scale.width, height: 360 },
      alpha: 0.22,
      minSize: 4,
      maxSize: 9,
      driftX: 85,
      driftY: -250,
      minDurationMs: 3400,
      maxDurationMs: 7600,
    });
    addAmbientDrift(this, {
      kind: "ember",
      count: 14,
      depth: -0.25,
      area: { x: 240, y: CATWALK_Y - 120, width: this.scale.width - 480, height: 210 },
      alpha: 0.24,
      minSize: 2.5,
      maxSize: 7,
      driftX: 80,
      driftY: -155,
      minDurationMs: 3000,
      maxDurationMs: 6800,
    });
    this.drawForgeGlow();
    this.drawCatwalk();
    this.drawWren(this.catwalkEntranceWrenX(), CATWALK_Y + 20);
    playSceneEventPulse(this, {
      kind: "ember",
      color: PALETTE_HEX.ember,
      x: this.wrenContainer.x,
      y: this.wrenContainer.y - 78,
      depth: -0.25,
      durationMs: 620,
      ringWidth: 245,
      ringHeight: 74,
      count: 8,
      alpha: 0.12,
      spreadX: 118,
      spreadY: 30,
    });

    this.narration = new NarrationManager(this, {
      y: 150,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });

    this.typingInput = new TypingInputController(this.store);
    this.director = new WaveDirector(this.typingInput.getStats());

    // Tier 4 — a revisit is a free-passage replay (no combat) → neutral loadout.
    // soul-thrift folds into one shared spellCost used at every cast site.
    this.combat = resolveCombatLoadout(
      this.revisit ? [] : this.store.get().satchel,
      "clockwork-forge",
    );
    this.spellCost = Math.ceil(SPELL_COST * this.combat.soulThriftMult);

    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        // forgive-wave-miss (Shrine-Token): the first miss of a wave is spared
        // the flinch. Revisit-only (Shrine-Token is a later realm's relic).
        if (this.waveForgivenessReady) {
          this.waveForgivenessReady = false;
          this.flashForgiven();
          return;
        }
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    // UI cohesion — the console band: the crafted bottom zone (TTT two-zone
    // composition) that houses the meters + satchel. Passive relics show as icon
    // tiles ("always on"); the offensive one-shots drop in as charge cards. This
    // replaces the floating top-right HUD and the centered one-shot stack.
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
    });
    const band = this.band;

    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      getCombo: () => this.typingInput.getStats().getCombo(),
      getCastReady: () => this.typingInput.getStats().canCast(this.spellCost),
      onCastReady: () =>
        showSpellReadyFeedback({
          scene: this,
          body: this.wrenContainer,
          kind: "ember",
          color: PALETTE_HEX.brass,
        }),
      onSustainedLowHeart: () =>
        showLowHeartFeedback({
          scene: this,
          band: this.band,
          body: this.wrenContainer,
          kind: "ember",
          color: PALETTE_HEX.ember,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Tier 4 — offensive one-shots fired by a Soul-charged, typed invocation
    // word. In the Forge the only forward-usable one is toll-strike (bells-tongue
    // from the Bell's force fork); a charged "toll" strikes the strongest golem.
    // The boss is NOT in `this.golems`, so its true-name challenge is never
    // skipped by a one-shot. Inert when no offensive relic is owned (empty list).
    const offensiveOneShots = this.combat.oneShots.filter(isOffensiveOneShot);
    this.oneShotInvoker = new OneShotInvoker<MovingWordEnemy>({
      scene: this,
      typingInput: this.typingInput,
      available: offensiveOneShots,
      cost: ONESHOT_SOUL_COST,
      getSoul: () => this.typingInput.getStats().getSoul(),
      spendSoul: (cost) => this.typingInput.getStats().spendSoul(cost),
      getThreats: () => this.liveGolemThreats(),
      applyEffect: (effect, targets) => this.applyOneShot(effect, targets),
      isActive: () => this.waveActive,
      announce: (text) => this.band.showNotice(text, { label: "relic" }),
      slots: band.oneShotSlots,
      compact: true,
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.oneShotInvoker?.destroy();
      this.oneShotInvoker = null;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
      this.ambientHandle?.stop();
      this.releaseCatwalkCueWordAnchor();
      this.catwalkCue?.destroy();
      this.catwalkCue = null;
      this.catwalkCueIndex = null;
      this.dismissRevisitMemoryCue(false);
      this.clearFornWordAnchors();
      this.clearForkChoiceWordAnchors();
      this.clearForgeChoiceCues(false);
      this.fornSprite?.destroy();
      this.fornSprite = undefined;
    });

    this.ambientHandle = playAmbientForge();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.startAct1Arrival();
  }

  // ─── Revisit mode ────────────────────────────────────────────────────────────

  private startRevisit(): void {
    const choices = this.store.get().realms["clockwork-forge"]?.choices ?? {};
    const ending = choices["ending"] ?? "";
    let narratorLine: string;
    let words: string[];

    if (ending.includes("peaceful")) {
      narratorLine = "The Forge is quiet. Forn is still at the bellows.";
      words = ["iron", "holds", "the", "heat"];
    } else if (ending.includes("fought")) {
      narratorLine = "The golem-heart you took left a silence in the core furnace.";
      words = ["gears", "turn", "without", "orders"];
    } else {
      narratorLine = "The Forge runs on its own now. It always did, really.";
      words = ["the", "forge", "remembers", "everything"];
    }

    this.setNarrator(narratorLine);
    this.band.setObjective("Type the forge memory to return to the Almanac.");
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
              arrival: "clockwork-forge",
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
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
  }

  private showRevisitMemoryCue(idx: number, total: number): void {
    this.dismissRevisitMemoryCue(false);
    const pos = this.revisitMemoryCuePosition(idx, total);
    const cue = this.add.container(pos.x, pos.y).setDepth(42).setAlpha(0);
    this.revisitMemoryCue = cue;

    cue.add(addLocalGroundShadow(this, 124, 20, { y: 12, alpha: 0.2 }));

    const gear = this.add.graphics();
    gear.fillStyle(PALETTE_HEX.ember, 0.1);
    gear.fillEllipse(0, 0, 120, 40);
    gear.lineStyle(2, PALETTE_HEX.ember, 0.38);
    gear.strokeEllipse(0, 0, 100, 30);
    gear.lineStyle(2, 0xf3c36a, 0.42);
    gear.strokeCircle(0, -3, 22);
    gear.lineStyle(1.5, 0xf3c36a, 0.34);
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const innerX = Math.cos(angle) * 16;
      const innerY = -3 + Math.sin(angle) * 16;
      const outerX = Math.cos(angle) * 30;
      const outerY = -3 + Math.sin(angle) * 30;
      gear.lineBetween(innerX, innerY, outerX, outerY);
    }
    gear.fillStyle(0xffd277, 0.44);
    gear.fillCircle(0, -3, 4);
    gear.fillCircle(-42, 2, 2.8);
    gear.fillCircle(42, 2, 2.8);
    cue.add(gear);

    this.tweens.add({
      targets: cue,
      alpha: 0.84,
      y: pos.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (cue.scene) this.idleBob(cue);
      },
    });
  }

  private revisitMemoryCuePosition(idx: number, total: number): { x: number; y: number } {
    const spacing = total <= 4 ? 190 : 165;
    const startX = this.scale.width / 2 - ((total - 1) * spacing) / 2;
    return {
      x: startX + idx * spacing,
      y: idx % 2 === 0 ? FLOOR_Y + 8 : FLOOR_Y - 28,
    };
  }

  private revisitMemoryWordPosition(idx: number, total: number): { x: number; y: number } {
    const cue = this.revisitMemoryCuePosition(idx, total);
    return { x: cue.x, y: cue.y - 108 };
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
        color: PALETTE_HEX.ember,
        alpha: 0.13,
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
      kind: "ember",
      color: PALETTE_HEX.ember,
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

  // ─── ACT 1 — Descent into the Forge ─────────────────────────────────────────

  private startAct1Arrival(): void {
    this.narration.say("forge_intro_arrival");
    this.band.setObjective("Type each catwalk word to reach Gregor's station.");
    this.showCatwalkCue(0, this.catwalkCueX(0));
    this.time.delayedCall(2600, () => this.startCatwalkBeats(0));
  }

  private startCatwalkBeats(idx: number): void {
    if (idx >= CATWALK_WORDS.length) {
      this.dismissCatwalkCue();
      this.walkWrenAlongCatwalk(this.scale.width / 2, () => {
        this.resetWrenToFront();
        this.time.delayedCall(420, () => this.startGregorConversation());
      });
      return;
    }
    const word = CATWALK_WORDS[idx];
    const narration = CATWALK_NARRATIONS[idx];
    const cueX = this.catwalkCueX(idx);
    const wordPos = this.catwalkWordPosition(idx);
    this.showCatwalkCue(idx, cueX);
    const target = this.makeWord({
      scene: this,
      word,
      x: wordPos.x,
      y: wordPos.y,
      depth: 40,
      fontSize: 34,
      onClaim: () => {
        playWrenFocus(this.wrenSprite, {
          faceLeft: wordPos.x < this.wrenContainer.x,
        });
        this.walkWrenAlongCatwalk(this.catwalkWrenX(idx));
        this.pulseCatwalkCue(false);
      },
      onComplete: () => {
        playWrenAction(this.wrenSprite, {
          faceLeft: wordPos.x < this.wrenContainer.x,
        });
        this.releaseCatwalkCueWordAnchor();
        this.pulseCatwalkCue(true);
        this.setNarrator(narration);
        this.time.delayedCall(1400, () => this.startCatwalkBeats(idx + 1));
      },
    });
    this.attachCatwalkCueWordAnchor(idx, target);
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Gregor tutorial ─────────────────────────────────────────────────────────

  private startGregorConversation(): void {
    this.clearActiveTargets();
    this.band.setObjective("Answer Gregor and test lowercase against capitals.");
    this.setNarrator(
      "You hold it wrong. Typewriters are not hammers.",
      "Old Gregor",
    );

    // First exchange: Wren types "i know."
    let replyAnchor: WordBodyAnchorHandle | null = null;
    const releaseReplyAnchor = (): void => {
      replyAnchor?.destroy();
      replyAnchor = null;
    };
    const replyPos = {
      x: this.wrenContainer.x - 170,
      y: this.wrenContainer.y - 154,
    };
    const reply1 = this.makeWord({
      scene: this,
      word: "i know.",
      x: replyPos.x,
      y: replyPos.y,
      fontSize: 36,
      onClaim: () => playWrenFocus(this.wrenSprite),
      onComplete: () => {
        releaseReplyAnchor();
        playWrenAction(this.wrenSprite);
        this.gregorStep2();
      },
    });
    replyAnchor = attachWordBodyAnchor(
      this,
      this.wrenContainer,
      () => ({ x: reply1.getAnchorX(), y: reply1.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.17,
        depth: 43,
        sourceOffsetY: -112,
        targetOffsetY: 24,
      },
    );
    this.wrenContainer.once(Phaser.GameObjects.Events.DESTROY, releaseReplyAnchor);
    this.typingInput.register(reply1);
    this.activeTargets.push(reply1);
  }

  private gregorStep2(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Lowercase moves them. CAPITALS command them. Try both.",
      "Old Gregor",
    );
    this.time.delayedCall(2000, () => this.gregorTutorialMove());
  }

  private gregorTutorialMove(): void {
    this.band.setObjective("Type turn to nudge the training golem.");
    this.setNarrator(
      "Type 'turn' — watch it.",
      "Old Gregor",
    );
    // Spawn a tutorial golem that doesn't advance
    const tutorialGolem = this.spawnStaticGolem(860, FLOOR_Y, false);

    const wordPos = this.staticGolemWordPosition(tutorialGolem, "turn");
    const target = this.makeStaticGolemWord(tutorialGolem, {
      scene: this,
      word: "turn",
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 36,
      onComplete: () => {
        this.golemTurnHead(tutorialGolem);
        this.setNarrator("The golem turns its head. It heard you.");
        this.time.delayedCall(1800, () =>
          this.gregorTutorialCommand(tutorialGolem),
        );
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private gregorTutorialCommand(tutorialGolem: StaticGolem): void {
    this.clearActiveTargets();
    this.band.setObjective("Hold Shift through TURN to command the golem.");
    this.setNarrator(
      "Now hold Shift and type 'TURN' — give it a command.",
      "Old Gregor",
    );

    const wordPos = this.staticGolemWordPosition(tutorialGolem, "TURN");
    const target = this.makeStaticGolemWord(tutorialGolem, {
      scene: this,
      word: "TURN",
      x: wordPos.x,
      y: wordPos.y,
      fontSize: 36,
      // Capital tutorial: must actually be typed with Shift now.
      caseSensitive: true,
      onComplete: () => {
        this.golemTurnHead(tutorialGolem);
        this.setNarrator(
          "The golem snaps to attention. A command — not just a nudge.",
        );
        this.time.delayedCall(1400, () =>
          this.gregorTutorialCommand(tutorialGolem),
        );
      },
      onSpellComplete: () => {
        this.golemCommandFlash(tutorialGolem);
        this.setNarrator(
          "The golem snaps to full attention. CAPITALS command. You understand now.",
        );
        this.store.update((s) => {
          if (!s.satchel.includes("gregor-lore-learned")) {
            // Record lore acquisition in realm choices
            const realm = s.realms["clockwork-forge"] ?? {
              cleared: false,
              choices: {},
            };
            realm.choices["almanacLore-golem-keepers-code"] = "learned";
            s.realms["clockwork-forge"] = realm;
          }
        });
        this.tweens.add({
          targets: tutorialGolem.container,
          alpha: 0,
          duration: 500,
          delay: 1800,
          onComplete: () => tutorialGolem.container.destroy(),
        });
        this.time.delayedCall(2400, () => this.startTutorialGolemFight());
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private staticGolemWordPosition(golem: StaticGolem, word: string): { x: number; y: number } {
    const side = golem.container.x < this.scale.width / 2 ? 1 : -1;
    const lateral = word.length > 8 ? 220 : 190;
    return {
      x: Phaser.Math.Clamp(golem.container.x + side * lateral, 330, this.scale.width - 330),
      y: Phaser.Math.Clamp(golem.container.y - 132, 300, this.scale.height - 390),
    };
  }

  private startTutorialGolemFight(): void {
    // Tier 4 — announce the relic loadout once before the realm's first combat,
    // then begin. Empty loadout (incl. revisits) passes straight through.
    this.announceCombatLoadout(() => this.beginTutorialGolemFight());
  }

  private beginTutorialGolemFight(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Now do it for real. That one won't wait.",
      "Old Gregor",
    );
    this.band.setObjective("Redirect the training golem before it reaches Wren.");

    const golem = this.spawnAdvancingGolem(1060, FLOOR_Y, "walk", GOLEM_ADVANCE_MS * 1.4, false);

    this.waveActive = true;
    this.time.delayedCall(2000, () => {
      if (!this.waveActive) return;
      this.setNarrator("The golem advances. Type 'walk' to redirect it.");
    });

    // Set up a watch: when all golems cleared, move to act 2
    this.golems.push(golem);
    this.beginCombatWave();
    this.time.delayedCall(800, () => this.watchForWaveClear(() => {
      this.time.delayedCall(800, () => this.startAct2());
    }));
  }

  // ─── ACT 2 — Through the Foundry Floor ──────────────────────────────────────

  private startAct2(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    // Almanac lore pages 1 + 2 — Gregor's lesson is conclusively done, and
    // the foundry's three-century setup is now visible. Both stamp here.
    this.store.update((s) => {
      if (!s.almanacLore.includes("golem-keepers-code")) {
        s.almanacLore.push("golem-keepers-code");
      }
      if (!s.almanacLore.includes("the-broken-bellows")) {
        s.almanacLore.push("the-broken-bellows");
      }
    });
    this.setNarrator(
      "You descend to the foundry floor. The heat is immense. Iron shapes move through the dark.",
    );
    this.time.delayedCall(2000, () => this.startWave1());
  }

  private startWave1(): void {
    this.waveActive = true;
    this.golems = [];
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseForgeWave();
    this.narration.say("forge_wave1_intro");
    this.band.setObjective("Type each mixed-case command cleanly.");

    // Tier 1 signature: every golem is a mixed-case command (lowercase head,
    // CAPITALIZED tail) — the brass only obeys when the capitals are typed with
    // Shift, so each kill demands a clean mid-word Shift-switch (canon §5.5.8).
    // Speed-axis director still scales word length + advance; count stays at the
    // narrated three ("Three golems stir."), concurrency is applied on wave 2.
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      3,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 3);
    slots.forEach((slot, i) => {
      const g = this.spawnAdvancingGolem(slot.x, slot.y, words[i], advanceMs, true);
      this.golems.push(g);
    });

    this.beginCombatWave();
    this.watchForWaveClear(() => this.startFornEncounter());
  }

  private startFornEncounter(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.setNarrator(
      "The bellows are broken. The forge fire dims. Someone needs to fix this — or let it fail.",
      "Runa",
    );
    this.band.setObjective("Reach Smith Forn through the moving foundry.");
    this.time.delayedCall(2400, () => this.startWave2());
  }

  private startWave2(): void {
    this.waveActive = true;
    this.golems = [];
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseForgeWave();
    this.narration.say("forge_wave2_intro");
    this.band.setObjective("Use Shift for CAPITAL order fragments.");

    // §5.5.10 — a golem's CAPITALIZED command comes out as scratched-out caps.
    // Fires on Wave 2 (the wave that introduces the capitalized golem) so it
    // lands as part of the realm's signature mechanic.
    if (!this.quietLordIntruded) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["clockwork-forge"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(1800, () => {
        const anchor = this.quietLordIntrusionAnchor();
        playQuietLordIntrusion(this, {
          x: anchor.x,
          y: anchor.y,
          text: "THE BRASS REMEMBERS A DIFFERENT NAME.",
        });
      });
    }

    // Every golem is a mixed-case command now — the lone all-caps "VALVE" is
    // retired; Tier 1 makes the whole wave demand the Shift-switch. Speed-axis
    // director scales length, advance, AND concurrency here (the intro line
    // states no fixed count), clamped to the floor slots.
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS * 0.85);
    const count = Math.min(this.director.enemyCount(3), FLOOR_SLOTS.length);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      count,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, count);
    for (let i = 0; i < count; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        words[i],
        advanceMs,
        true,
      );
      this.golems.push(g);
    }

    this.beginCombatWave();
    this.watchForWaveClear(() => this.startFork1());
  }

  private quietLordIntrusionAnchor(): { x: number; y: number } {
    let threat: MovingWordEnemy | null = null;
    for (const golem of this.golems) {
      if (golem.isDefeated() || !golem.container.scene) continue;
      if (!threat || golem.advanceProgress() > threat.advanceProgress()) {
        threat = golem;
      }
    }

    if (!threat) return { x: this.scale.width / 2, y: 360 };
    return {
      x: Phaser.Math.Clamp(threat.container.x, 260, this.scale.width - 260),
      y: Phaser.Math.Clamp(threat.container.y - 170, 280, this.scale.height - 360),
    };
  }

  // ─── Fork 1 ──────────────────────────────────────────────────────────────────

  /** Fade Smith Forn's standing portrait in on the foundry floor, left-third,
   *  feet near FLOOR_Y. Narration NPC only — no word/hit anchor. Idempotent. */
  private showFornSprite(): void {
    if (this.fornSprite) return;
    const sprite = this.add.image(400, FLOOR_Y, "forn");
    sprite.setOrigin(0.5, 1); // feet on the floor line
    sprite.setScale(FORN_SPRITE_HEIGHT / sprite.height);
    sprite.setDepth(40); // above backdrop (-100), below narration band (y≈150)
    stageAnchoredSprite(this, sprite, {
      shadowWidth: 120,
      shadowHeight: 22,
      shadowOffsetY: 8,
      shadowAlpha: 0.3,
      shadowDepth: 39.9,
      entranceOffsetY: 16,
      entranceMs: 720,
      breathDy: -3,
      breathMs: 2100,
    });
    this.fornSprite = sprite;
  }

  /** Fade Forn out and destroy him as the realm moves on past the fork. */
  private hideFornSprite(): void {
    const sprite = this.fornSprite;
    if (!sprite) return;
    this.clearFornWordAnchors();
    this.fornSprite = undefined;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 620,
      ease: "Sine.easeIn",
    });
  }

  private showFork1ChoiceCues(): void {
    if (!this.apprenticeCue?.scene) {
      this.apprenticeCue = this.drawApprenticeCue(1280, FLOOR_Y + 4);
    }
  }

  private showFork2ChoiceCues(): void {
    if (!this.standDownCue?.scene) {
      this.standDownCue = this.drawStandDownCue(690, FLOOR_Y + 8);
    }
    if (!this.fightCue?.scene) {
      this.fightCue = this.drawFightCue(1260, FLOOR_Y + 8);
    }
  }

  private drawApprenticeCue(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(39);
    c.add(addLocalGroundShadow(this, 148, 24, { y: 10, alpha: 0.28 }));

    const g = this.add.graphics();
    g.lineStyle(8, 0x1a120d, 0.98);
    g.lineBetween(-76, -96, -76, 0);
    g.lineBetween(56, -82, 56, 0);
    g.lineStyle(3, 0x5a4632, 0.62);
    g.lineBetween(-76, -94, 56, -82);
    g.fillStyle(0x251711, 0.98);
    g.fillRoundedRect(-108, -34, 216, 44, 9);
    g.lineStyle(2, PALETTE_HEX.brass, 0.38);
    g.strokeRoundedRect(-108, -34, 216, 44, 9);
    g.fillStyle(0x120d0a, 0.98);
    g.fillCircle(-28, -44, 34);
    g.lineStyle(4, PALETTE_HEX.ember, 0.5);
    g.strokeCircle(-28, -44, 25);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(
        -28,
        -44,
        -28 + Math.cos(a) * 24,
        -44 + Math.sin(a) * 24,
      );
    }
    g.lineStyle(7, 0x483322, 0.95);
    g.lineBetween(20, -28, 92, -80);
    g.lineStyle(3, PALETTE_HEX.brass, 0.7);
    g.lineBetween(22, -30, 88, -78);
    g.fillStyle(PALETTE_HEX.ember, 0.28);
    g.fillCircle(74, -70, 8);
    g.fillCircle(-64, -22, 6);
    c.add(g);

    addContainerWake(this, c, {
      kind: "ember",
      intervalMs: 170,
      spreadX: 44,
      spreadY: 20,
      offsetY: -46,
      alpha: 0.34,
      size: 3,
      depth: 38,
      driftY: -60,
    });
    stageContainerEntrance(this, c, {
      entranceOffsetY: 16,
      entranceMs: 620,
      breathDy: -3,
      breathMs: 2100,
    });
    return c;
  }

  private drawStandDownCue(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(39);
    c.add(addLocalGroundShadow(this, 140, 22, { y: 10, alpha: 0.24 }));

    const g = this.add.graphics();
    g.fillStyle(0x1d1712, 0.96);
    g.fillRoundedRect(-80, -38, 160, 48, 10);
    g.lineStyle(2, PALETTE_HEX.brass, 0.55);
    g.strokeRoundedRect(-80, -38, 160, 48, 10);
    g.lineStyle(5, 0x5a4632, 0.82);
    g.lineBetween(-54, -94, -22, -56);
    g.lineBetween(54, -94, 22, -56);
    g.lineStyle(4, PALETTE_HEX.brass, 0.5);
    g.strokeCircle(0, -56, 38);
    g.lineStyle(2, PALETTE_HEX.brass, 0.35);
    g.strokeCircle(0, -56, 24);
    g.fillStyle(PALETTE_HEX.brass, 0.18);
    g.fillCircle(0, -56, 30);
    g.fillStyle(0x0f0c09, 0.96);
    g.fillRoundedRect(-38, -72, 76, 28, 6);
    g.lineStyle(3, PALETTE_HEX.brass, 0.62);
    g.lineBetween(-24, -58, 24, -58);
    c.add(g);

    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 230,
      spreadX: 34,
      spreadY: 16,
      offsetY: -52,
      color: PALETTE_HEX.brass,
      alpha: 0.28,
      size: 2.5,
      depth: 38,
      driftY: -44,
    });
    stageContainerEntrance(this, c, {
      entranceOffsetY: 14,
      entranceMs: 620,
      breathDy: -2,
      breathMs: 2200,
    });
    return c;
  }

  private drawFightCue(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(39);
    c.add(addLocalGroundShadow(this, 148, 24, { y: 10, alpha: 0.28 }));

    const g = this.add.graphics();
    g.fillStyle(0x1a110d, 0.98);
    g.fillRoundedRect(-88, -34, 176, 44, 9);
    g.lineStyle(2, PALETTE_HEX.ember, 0.46);
    g.strokeRoundedRect(-88, -34, 176, 44, 9);
    g.fillStyle(0x4b3825, 0.96);
    g.fillRoundedRect(-48, -68, 96, 32, 7);
    g.lineStyle(5, 0x120c08, 0.96);
    g.lineBetween(-74, -18, -18, -94);
    g.lineBetween(20, -94, 78, -18);
    g.lineStyle(3, PALETTE_HEX.brass, 0.58);
    g.lineBetween(-70, -20, -20, -90);
    g.lineBetween(24, -90, 74, -20);
    g.fillStyle(PALETTE_HEX.ember, 0.35);
    g.fillCircle(-8, -86, 7);
    g.fillCircle(52, -32, 6);
    g.fillCircle(-62, -30, 5);
    c.add(g);

    addContainerWake(this, c, {
      kind: "ember",
      intervalMs: 135,
      spreadX: 48,
      spreadY: 22,
      offsetY: -46,
      alpha: 0.42,
      size: 3.2,
      depth: 38,
      driftY: -72,
    });
    stageContainerEntrance(this, c, {
      entranceOffsetY: 14,
      entranceMs: 620,
      breathDy: -3,
      breathMs: 1900,
    });
    return c;
  }

  private pulseForgeChoiceCue(
    cue: Phaser.GameObjects.Container | null | undefined,
    color: number = PALETTE_HEX.ember,
  ): void {
    if (!cue?.scene) return;
    playActorAttention(this, cue, {
      scale: 1.035,
      durationMs: 220,
      tint: color,
    });
    playBodyImpact(this, cue, {
      kind: "ember",
      color,
      offsetY: -54,
      depth: 58,
      ringRadius: 46,
      count: 9,
      durationMs: 420,
    });
  }

  private getForgeChoiceCue(kind: ForgeChoiceCueKey): Phaser.GameObjects.Container | null {
    if (kind === "apprentice") return this.apprenticeCue;
    if (kind === "standDown") return this.standDownCue;
    return this.fightCue;
  }

  private setForgeChoiceCue(kind: ForgeChoiceCueKey, cue: Phaser.GameObjects.Container | null): void {
    if (kind === "apprentice") {
      this.apprenticeCue = cue;
    } else if (kind === "standDown") {
      this.standDownCue = cue;
    } else {
      this.fightCue = cue;
    }
  }

  private dismissForgeChoiceCue(kind: ForgeChoiceCueKey, animate = true): void {
    const cue = this.getForgeChoiceCue(kind);
    this.setForgeChoiceCue(kind, null);
    if (!cue?.scene) return;
    this.tweens.killTweensOf(cue);
    for (const child of cue.list) this.tweens.killTweensOf(child);
    if (!animate) {
      cue.destroy();
      return;
    }
    this.tweens.add({
      targets: cue,
      alpha: 0,
      y: cue.y + 18,
      duration: 460,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (cue.scene) cue.destroy();
      },
    });
  }

  private clearForgeChoiceCues(animate = true): void {
    this.dismissForgeChoiceCue("apprentice", animate);
    this.dismissForgeChoiceCue("standDown", animate);
    this.dismissForgeChoiceCue("fight", animate);
  }

  private startFork1(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.narration.say("forge_fork1_intro");
    this.band.setObjective("Choose Forn or the apprentices.");
    this.showFornSprite();
    this.showFork1ChoiceCues();

    const helpForn = this.makeFornWord({
      scene: this,
      word: "help smith forn",
      ...this.forgeChoiceWordPosition(this.fornSprite, -128, "help smith forn", {
        side: "right",
        long: true,
        lift: 92,
      }),
      fontSize: 32,
      frame: "banner",
      onComplete: () => this.startFornBranch(),
    });
    const joinCabal = this.makeForgeChoiceWord(
      this.apprenticeCue,
      {
        scene: this,
        word: "join the apprentices",
        ...this.forgeChoiceWordPosition(this.apprenticeCue, -68, "join the apprentices", {
          side: "left",
          long: true,
        }),
        fontSize: 32,
        frame: "banner",
        onComplete: () => this.startCabalBranch(),
      },
      { sourceOffsetY: -68 },
    );
    this.typingInput.register(helpForn);
    this.typingInput.register(joinCabal);
    this.activeTargets.push(helpForn, joinCabal);
  }

  private startFornBranch(): void {
    this.fork1Choice = "forn";
    this.clearActiveTargets();
    this.dismissForgeChoiceCue("apprentice");
    this.setNarrator(
      "Aye. I could use steady hands.",
      "Forn",
    );
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        [...FORN_PASSAGES],
        [
          "The iron bellows groan back to life under your hands.",
          "Forn's deft fingers find the seam and press it shut.",
          "The old smith presses the hammer into your hands without a word.",
          "A deep breath moves through the entire foundry.",
        ],
        () => this.afterFork1("forn", "bellows-hammer"),
        "forn",
      );
    });
  }

  private startCabalBranch(): void {
    this.fork1Choice = "cabal";
    this.clearActiveTargets();
    this.hideFornSprite();
    this.pulseForgeChoiceCue(this.apprenticeCue);
    this.setNarrator(
      "About time someone helped us.",
      "Apprentice",
    );
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        [...CABAL_PASSAGES],
        [
          "The valve groans shut. The fire stutters.",
          "A ragged cheer goes up from the apprentices in the shadows.",
          "Something cold and heavy is pressed into your palm.",
          "The foundry slows. A chill spreads through the brass pipes.",
        ],
        () => this.afterFork1("cabal", "sabotage-wrench"),
        "apprentices",
      );
    });
  }

  private afterFork1(choice: "forn" | "cabal", relicId: string): void {
    // The fork is resolved — the realm moves on to the boss; Forn leaves.
    this.hideFornSprite();
    this.dismissForgeChoiceCue("apprentice");
    // Almanac lore page 3 — Forn's hammer song OR the Apprentices' manifesto.
    // Mutually exclusive per fork branch.
    const lorePageId =
      choice === "forn" ? "forn-bellows-song" : "apprentices-manifesto";
    this.store.update((s) => {
      const realm = s.realms["clockwork-forge"] ?? {
        cleared: false,
        choices: {},
      };
      realm.choices["fork1"] = choice;
      s.realms["clockwork-forge"] = realm;
      if (!s.satchel.includes(relicId)) {
        s.satchel.push(relicId);
      }
      if (!s.almanacLore.includes(lorePageId)) {
        s.almanacLore.push(lorePageId);
      }
    });
    this.time.delayedCall(1200, () => this.startAct3());
  }

  // ─── ACT 3 — The Command-Golem ────────────────────────────────────────────────

  private startAct3(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.cameras.main.shake(300, 0.006);
    this.narration.say("forge_command_golem_rise");
    this.time.delayedCall(2800, () => this.startBossPhase1());
  }

  // Boss sprite — kept so phase 2 can flash it "commanded" (brass).
  private bossContainer!: Phaser.GameObjects.Container;
  private bossSprite!: Phaser.GameObjects.Image;

  private spawnBossVisual(): void {
    const cx = this.scale.width / 2 + 200;
    const cy = FLOOR_Y - 10;
    this.bossContainer = this.add.container(cx, cy);
    this.bossContainer.setScale(1.8);
    this.bossSprite = this.drawCommandGolemInto(this.bossContainer, false);

    this.bossContainer.setAlpha(0);
    this.tweens.add({
      targets: this.bossContainer,
      alpha: 1,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => this.playCommandGolemStagePulse(),
    });
    this.idleBob(this.bossContainer);
  }

  private playCommandGolemStagePulse(intense = false): void {
    playBodyImpact(this, this.bossContainer, {
      kind: "ember",
      color: intense ? PALETTE_HEX.brass : PALETTE_HEX.ember,
      offsetY: -150,
      depth: 58,
      ringRadius: intense ? 78 : 64,
      count: intense ? 18 : 14,
      durationMs: intense ? 560 : 480,
    });
  }

  private startBossPhase1(): void {
    this.spawnBossVisual();
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseForgeWave({ y: FLOOR_Y - 130, ringWidth: 980, ringHeight: 150, count: 16 });
    this.setNarrator(
      "The Command-Golem — massive, iron-crowned, its eye burning orange. Phase one begins.",
    );
    this.band.setObjective("Break the Command-Golem's first words.");

    let phaseIdx = 0;
    const nextWord = (): void => {
      if (phaseIdx >= BOSS_PHASE1_WORDS.length) {
        this.time.delayedCall(1000, () => this.startBossPhase2());
        return;
      }
      const word = BOSS_PHASE1_WORDS[phaseIdx];
      const target = this.makeCommandGolemWord({
        scene: this,
        word,
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        onComplete: () => {
          playChime();
          this.cameras.main.shake(120, 0.003);
          phaseIdx++;
          this.time.delayedCall(700, nextWord);
        },
        onSpellComplete: () => {
          playChime();
          this.cameras.main.flash(200, 200, 120, 20);
          this.cameras.main.shake(200, 0.005);
          phaseIdx++;
          this.time.delayedCall(700, nextWord);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    this.time.delayedCall(1040, nextWord);
  }

  private startBossPhase2(): void {
    this.clearActiveTargets();
    // The Command-Golem is now under command — it glows brass for the rest of
    // the fight (persisted tint, no clear).
    this.flashGolemCommanded(this.bossSprite, true);
    this.playCommandGolemStagePulse(true);

    this.narration.say("forge_command_golem_phase2");
    this.band.setObjective("Hold Shift through each all-caps command.");

    let phaseIdx = 0;
    const nextWord = (): void => {
      if (phaseIdx >= BOSS_PHASE2_WORDS.length) {
        this.time.delayedCall(1000, () => this.startBossPhase3());
        return;
      }
      const word = BOSS_PHASE2_WORDS[phaseIdx];
      const target = this.makeCommandGolemWord({
        scene: this,
        word,
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        // BOSS_PHASE2_WORDS are all-caps — enforce case so the player
        // actually has to hold Shift.
        caseSensitive: true,
        onComplete: () => {
          playChime();
          this.cameras.main.shake(140, 0.003);
          phaseIdx++;
          this.time.delayedCall(700, nextWord);
        },
        onSpellComplete: () => {
          // Camera flash — the command lands hard
          this.cameras.main.flash(280, 220, 160, 20);
          this.cameras.main.shake(280, 0.006);
          playChime();
          // Golem staggers — brief displacement tween
          this.tweens.add({
            targets: this.bossContainer,
            x: this.bossContainer.x + 40,
            duration: 180,
            yoyo: true,
            ease: "Sine.easeOut",
          });
          phaseIdx++;
          this.time.delayedCall(900, nextWord);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    nextWord();
  }

  private startBossPhase3(): void {
    this.clearActiveTargets();
    this.playCommandGolemStagePulse(true);
    this.setNarrator(
      "Its true name is a command turned on itself — half-spoken, half-SHOUTED. Type it as it reads.",
    );

    // The Command-Golem's true name is ONE mixed-case phrase (canon §5.5.8):
    // "stand" lowercase into "DOWN" capitalized — a single mid-phrase Shift-
    // switch the player must land, not two separate tokens. Repeated twice;
    // the second completion fells the boss. caseSensitive starts lowercase, so
    // the claim never captures Shift → completion routes through onComplete.
    let repeatCount = 0;
    const runSequence = (): void => {
      const target = this.makeCommandGolemWord({
        scene: this,
        word: "stand DOWN",
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        caseSensitive: true,
        burstColor: PALETTE_HEX.ember,
        onComplete: () => {
          playChime();
          this.cameras.main.flash(300, 220, 160, 20);
          this.cameras.main.shake(260, 0.006);
          repeatCount++;
          if (repeatCount >= 2) {
            this.time.delayedCall(600, () => this.bossDefeated());
          } else {
            this.setNarrator(
              "The command rings through the forge. Once more — finish it.",
            );
            this.time.delayedCall(1000, runSequence);
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    runSequence();
  }

  private bossDefeated(): void {
    this.clearActiveTargets();
    // Boss falls
    this.tweens.add({
      targets: this.bossContainer,
      alpha: 0,
      y: this.bossContainer.y + 80,
      duration: 800,
      ease: "Sine.easeIn",
      onComplete: () => this.bossContainer.destroy(),
    });

    // Quiet Lord fragment ~~Aga~~ — third realm of the accumulating word.
    // Once per playthrough.
    const alreadyRevealedForge =
      this.store.get().realms["clockwork-forge"]?.quietLordFragmentRevealed ?? false;
    if (!alreadyRevealedForge) {
      this.store.update((s) => {
        const realm = s.realms["clockwork-forge"];
        if (realm) realm.quietLordFragmentRevealed = true;
      });
      flashQuietLordFragment(this, {
        text: "Aga",
        x: this.bossContainer?.scene ? this.bossContainer.x : this.scale.width / 2,
        y: this.bossContainer?.scene
          ? Phaser.Math.Clamp(this.bossContainer.y - 178, 260, this.scale.height - 360)
          : this.scale.height / 2 - 40,
      });
    }
    // Almanac lore page 4 — the Command-Golem's name, stamped at defeat.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-command-golems-name")) {
        s.almanacLore.push("the-command-golems-name");
      }
    });

    this.narration.say("forge_command_golem_defeated");
    this.time.delayedCall(3200, () => this.startFork2());
  }

  // ─── Fork 2 ──────────────────────────────────────────────────────────────────

  private startFork2(): void {
    this.clearActiveTargets();
    this.showFork2ChoiceCues();
    this.setNarrator(
      "The Command-Golem lies still. What now? Type a choice.",
    );
    this.band.setObjective("Choose the final order for the forge.");

    const peaceful = this.makeForgeChoiceWord(
      this.standDownCue,
      {
        scene: this,
        word: "give the peaceful order",
        ...this.forgeChoiceWordPosition(this.standDownCue, -54, "give the peaceful order", {
          side: "left",
          long: true,
        }),
        fontSize: 32,
        frame: "banner",
        onComplete: () => {
          this.fork2Choice = "peaceful";
          this.startFork2PeacefulBranch();
        },
      },
      { color: PALETTE_HEX.brass, sourceOffsetY: -54 },
    );
    const fight = this.makeForgeChoiceWord(
      this.fightCue,
      {
        scene: this,
        word: "fight to the end",
        ...this.forgeChoiceWordPosition(this.fightCue, -58, "fight to the end", {
          side: "right",
          long: true,
        }),
        fontSize: 32,
        frame: "banner",
        onComplete: () => {
          this.fork2Choice = "fought";
          this.startFork2FightBranch();
        },
      },
      { sourceOffsetY: -58 },
    );
    this.typingInput.register(peaceful);
    this.typingInput.register(fight);
    this.activeTargets.push(peaceful, fight);
  }

  private startFork2PeacefulBranch(): void {
    this.clearActiveTargets();
    this.dismissForgeChoiceCue("fight");
    this.pulseForgeChoiceCue(this.standDownCue);
    this.setNarrator(
      "You raise the typewriter keys and give the final command.",
    );
    this.band.setObjective("Type STAND DOWN with capitals.");

    // Type "STAND DOWN" (capitalized, spell mode preferred)
    const standDown = this.makeForgeChoiceWord(
      this.standDownCue,
      {
        scene: this,
        word: "STAND DOWN",
        ...this.forgeChoiceWordPosition(this.standDownCue, -54, "STAND DOWN", {
          side: "right",
        }),
        fontSize: 40,
        // The peaceful-branch finale demands the full capitalized order.
        caseSensitive: true,
        onComplete: () => {
          this.setNarrator("The last golems lower their arms. The forge grows quiet.");
          this.time.delayedCall(1800, () => this.afterFork2("peaceful", "master-key"));
        },
        onSpellComplete: () => {
          this.cameras.main.flash(350, 200, 180, 40);
          this.setNarrator("The command rings out. Every golem in the forge stills at once.");
          this.time.delayedCall(2000, () => this.afterFork2("peaceful", "master-key"));
        },
      },
      { color: PALETTE_HEX.brass, sourceOffsetY: -54 },
    );
    this.typingInput.register(standDown);
    this.activeTargets.push(standDown);
  }

  private startFork2FightBranch(): void {
    this.clearActiveTargets();
    this.dismissForgeChoiceCue("standDown");
    this.pulseForgeChoiceCue(this.fightCue);
    this.setNarrator(
      "Two more golems rise from the slag. You're not done yet.",
    );
    this.band.setObjective("Stop the last two command-golems.");

    this.waveActive = true;
    // Mixed-case command golems. Speed-axis director scales length + advance;
    // count stays at the narrated two ("Two more golems rise…").
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS * 0.75);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      2,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 2);
    this.golems = [];
    for (let i = 0; i < 2; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        words[i],
        advanceMs,
        true,
      );
      this.golems.push(g);
    }

    this.beginCombatWave();
    this.time.delayedCall(650, () => this.dismissForgeChoiceCue("fight"));
    this.watchForWaveClear(() => {
      this.waveActive = false;
      this.golems = [];
      this.setNarrator("The last golem falls. The forge is yours.");
      this.time.delayedCall(1600, () =>
        this.afterFork2("fought", "golem-heart"),
      );
    });
  }

  private afterFork2(choice: "peaceful" | "fought", relicId: string): void {
    this.clearForgeChoiceCues();
    this.store.update((s) => {
      const realm = s.realms["clockwork-forge"] ?? {
        cleared: false,
        choices: {},
      };
      realm.choices["fork2"] = choice;
      s.realms["clockwork-forge"] = realm;
      if (!s.satchel.includes(relicId)) {
        s.satchel.push(relicId);
      }
    });
    this.time.delayedCall(1000, () => this.startCompanionGate());
  }

  // ─── Brass Songbird companion gate ────────────────────────────────────────────

  private startCompanionGate(): void {
    this.clearActiveTargets();
    const fork1 = this.fork1Choice;
    const fork2 = this.fork2Choice;
    const fullGate = fork1 === "forn" && fork2 === "peaceful";
    const nearMiss =
      (fork1 === "forn" && fork2 === "fought") ||
      (fork1 === "cabal" && fork2 === "peaceful");

    if (fullGate) {
      this.setNarrator(
        "A small brass shape perches on a cooling pipe. It trills softly. Do you call to it?",
      );
      this.showSongbirdCompanion();
      const whistle = this.makeSongbirdWord({
        scene: this,
        word: "whistle softly",
        ...this.forgeChoiceWordPosition(this.songbirdCompanion, -54, "whistle softly", {
          side: "left",
          long: true,
        }),
        fontSize: 32,
        frame: "banner",
        onComplete: () => this.awardSongbird(),
      });
      const leave = this.makeSongbirdWord({
        scene: this,
        word: "leave it be",
        ...this.forgeChoiceWordPosition(this.songbirdCompanion, -54, "leave it be", {
          side: "right",
        }),
        fontSize: 32,
        frame: "banner",
        onComplete: () => {
          this.dismissSongbirdCompanion(1320, 470);
          this.startTrueNamePassage();
        },
      });
      this.typingInput.register(whistle);
      this.typingInput.register(leave);
      this.activeTargets.push(whistle, leave);
    } else if (nearMiss) {
      this.setNarrator(
        "A flash of brass among the pipes — something small and bright — then it's gone.",
      );
      this.showSongbirdCompanion(1380, 470);
      this.time.delayedCall(900, () => this.dismissSongbirdCompanion(1450, 430));
      this.time.delayedCall(2400, () => this.startTrueNamePassage());
    } else {
      this.time.delayedCall(600, () => this.startTrueNamePassage());
    }
  }

  private awardSongbird(): void {
    this.clearActiveTargets();
    this.companionAwarded = true;
    this.store.update((s) => {
      if (!s.satchel.includes("brass-songbird")) {
        s.satchel.push("brass-songbird");
      }
      const realm = s.realms["clockwork-forge"] ?? {
        cleared: false,
        choices: {},
      };
      realm.choices["companion"] = "songbird";
      s.realms["clockwork-forge"] = realm;
    });
    this.setNarrator(
      "The brass bird lands on your shoulder. It trills three notes — then goes still.",
    );
    this.pulseSongbirdCompanion();
    this.time.delayedCall(2200, () => this.startTrueNamePassage());
  }

  private showSongbirdCompanion(startX = 1380, startY = 430): void {
    if (this.songbirdCompanion?.scene) return;
    this.songbirdCompanion = stageCompanionCameo(this, {
      textureKey: "forge-companion-songbird",
      startX,
      startY,
      x: 1280,
      y: 470,
      height: 84,
      depth: 43,
      flipX: true,
      shadowWidth: 58,
      shadowHeight: 10,
      shadowOffsetY: 28,
      shadowAlpha: 0.14,
      breathDy: -14,
      breathMs: 1400,
      wake: {
        kind: "ember",
        intervalMs: 130,
        offsetY: -38,
        spreadX: 20,
        spreadY: 16,
        depth: 42,
        alpha: 0.46,
      },
    });
  }

  private pulseSongbirdCompanion(): void {
    playActorAttention(this, this.songbirdCompanion, {
      scale: 1.045,
      durationMs: 220,
    });
  }

  private dismissSongbirdCompanion(x: number, y: number): void {
    this.clearSongbirdWordAnchors();
    dismissCompanionCameo(this, this.songbirdCompanion, { x, y, durationMs: 640 });
    this.songbirdCompanion = null;
  }

  // ─── True-name passage + ending ──────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.narration.say("forge_truename_intro");
    const sealY = this.scale.height - 318;
    const seal = stageTrueNameSeal(this, {
      color: PALETTE_HEX.ember,
      kind: "ember",
      y: sealY,
      depth: 42,
    });

    const passages = [
      "the forge breathes.",
      "the brass remembers.",
      "its makers are remembered.",
    ];

    this.runPassageChain(passages, ["", "", ""], () => {
      dismissTrueNameSeal(this, seal);
      // Almanac lore page 5 — the Forge's true name, stamped at the end of
      // the realm's true-name passage.
      this.store.update((s) => {
        if (!s.almanacLore.includes("the-forge-true-name")) {
          s.almanacLore.push("the-forge-true-name");
        }
      });
      this.time.delayedCall(1000, () => this.startEnding());
    }, "none", seal);
  }

  private startEnding(): void {
    this.clearActiveTargets();
    this.setNarrator("You return to the portal. The Almanac stamps a new page.");

    // Determine ending key for almanac lore
    const fork1 = this.fork1Choice ?? "forn";
    const fork2 = this.fork2Choice ?? "peaceful";
    const endingKey = `${fork1}-${fork2}`;

    this.store.update((s) => {
      const realm = s.realms["clockwork-forge"] ?? {
        cleared: false,
        choices: {},
      };
      realm.cleared = true;
      realm.choices["ending"] = endingKey;
      if (this.companionAwarded) {
        realm.choices["companion"] = "songbird";
      }
      s.realms["clockwork-forge"] = realm;
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 26, 16, 8);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", {
            store: this.store,
            arrival: "clockwork-forge",
          });
        },
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    playRealmClearResonance(this, {
      color: PALETTE_HEX.brass,
      y: this.scale.height / 2 - 40,
    });
    showAlmanacStampCard(this, "the clockwork forge", onDone, { onReveal: playChime });
  }

  // ─── Golem spawning ───────────────────────────────────────────────────────────

  /** Spawn a static (non-advancing) tutorial golem. Returns the golem object. */
  private spawnStaticGolem(x: number, y: number, _isBoss: boolean): StaticGolem {
    const container = this.add.container(x, y);
    const sprite = this.drawGolemInto(container, false);
    this.idleBob(container);
    return { container, sprite };
  }

  /** Spawn a golem that advances toward Wren and can be defeated — now the shared
   *  MovingWordEnemy. The Forge keeps the body art (the eye it brightens on a
   *  command) and the consequence (onGolemComplete); the enemy owns the
   *  entrance / advance / knock-back / defeat lifecycle and the word target. */
  private spawnAdvancingGolem(
    x: number,
    y: number,
    word: string,
    advanceMs: number,
    isCapitalized: boolean,
  ): MovingWordEnemy {
    const startX = x < this.scale.width / 2 ? -120 : this.scale.width + 120;
    const container = this.add.container(startX, y);
    container.setAlpha(0);
    const sprite = this.drawGolemInto(container, false);
    addContainerWake(this, container, {
      kind: "ember",
      intervalMs: 190,
      spreadX: 40,
      spreadY: 8,
      offsetY: 12,
      alpha: 0.38,
      size: 4,
      depth: -1,
      driftX: 20,
      driftY: -30,
      durationMs: 760,
    });

    return new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word,
      restX: x,
      restY: y,
      wrenX: this.scale.width / 2,
      advanceMs,
      advanceMult: this.combat.advanceMult,
      entranceMs: 700,
      knockbackMs: 600,
      knockbackPauseMs: 1200,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -100,
      fontSize: 32,
      // Forge-fire burst on completion — an "ember bloom" rather than brass.
      burstColor: PALETTE_HEX.ember,
      defeatImpactKind: "ember",
      defeatImpactColor: PALETTE_HEX.ember,
      claimLineFrom: () => ({
        x: this.wrenContainer.x,
        y: this.wrenContainer.y - 112,
      }),
      claimLineColor: PALETTE_HEX.ember,
      // Mixed-case command golems enforce case — the CAPITALIZED tail misses
      // unless typed with Shift, so Gregor's lesson ("Lowercase moves them.
      // CAPITALS command them.") is a real mid-word demand, not a VFX gate.
      caseSensitive: isCapitalized,
      outline: true,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      onDefeated: () => playChime(),
      onReachWren: () => {
        // Golem retreats and tries again (no candle system in the Forge).
        this.cameras.main.shake(180, 0.004);
        playWrenHurt(this.wrenSprite, { knockX: 0 });
        playDamageThud();
        flashDamageVignette(this);
      },
      onComplete: (mods, self) =>
        this.onGolemComplete(self, sprite, isCapitalized, mods),
    });
  }

  /** Apply the Forge consequence after a player completes a golem's word. The
   *  shared MovingWordEnemy has already felled this golem and chimed; here we add
   *  the realm flourish, keyed on how the word was claimed:
   *   - Alt → chain-spark to the nearest live golem.
   *   - Shift, OR a mixed-case command finished with its required mid-word Shift
   *     (`isCapitalized` — the claim captured no Shift but finishing it demanded
   *     one) → the "command lands" flash (Gregor's lesson: CAPITALS command).
   *   - a plain lowercase nudge → the defeat alone. */
  private onGolemComplete(
    self: MovingWordEnemy,
    sprite: Phaser.GameObjects.Image,
    isCapitalized: boolean,
    mods: ClaimMods,
  ): void {
    if (mods.alt) {
      this.chainSpark(self);
    } else if (mods.spell || isCapitalized) {
      this.commandEffect(sprite);
    }
  }

  /** Alt-spell variant: chain spark. The Alt-claimed golem is already defeated by
   *  the shared enemy; the spark arcs to the nearest live golem and fells it too.
   *  If no other golems are alive, the spell is still a defeat — just no arc. */
  private chainSpark(self: MovingWordEnemy): void {
    // Spend the Soul this chain was armed against (canCast was checked when the
    // Alt-claim landed). The guard in spendSoul makes a stale arm a no-op.
    // spellCost folds in soul-thrift (bellows-hammer) so arm + spend agree.
    this.typingInput.getStats().spendSoul(this.spellCost);
    playSparkZap();
    const nearest = this.findNearestLiveGolem(self);
    if (!nearest) return;
    playChainSpark(
      this,
      self.container.x,
      self.restY - 80,
      nearest.container.x,
      nearest.restY - 80,
      PALETTE_HEX.brass,
    );
    // Brief delay before the chain target falls — gives the arc time to
    // visually land before the second defeat fires its own burst.
    this.time.delayedCall(140, () => {
      if (!nearest.isDefeated()) nearest.defeat();
    });
  }

  private findNearestLiveGolem(
    from: MovingWordEnemy,
  ): MovingWordEnemy | null {
    let best: MovingWordEnemy | null = null;
    let bestDist = Infinity;
    for (const g of this.golems) {
      if (g === from || g.isDefeated()) continue;
      const dx = g.container.x - from.container.x;
      const dy = g.container.y - from.container.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best;
  }

  /** Flash a golem sprite brass — the "command landed" tell (replaces the old
   *  eye-brighten now that golems are painted sprites). `persist` leaves the tint
   *  on (the boss stays commanded through phase 2); otherwise it clears shortly. */
  private flashGolemCommanded(
    sprite: Phaser.GameObjects.Image,
    persist = false,
  ): void {
    sprite.setTint(PALETTE_HEX.brass);
    if (!persist) this.time.delayedCall(220, () => sprite.clearTint());
  }

  /** Visual "command" effect when the player uses Shift on a golem — the camera
   *  flash and the golem flaring brass before the body falls. */
  private commandEffect(sprite: Phaser.GameObjects.Image): void {
    this.cameras.main.flash(180, 200, 140, 20);
    this.flashGolemCommanded(sprite);
  }

  /** Visual effect for tutorial golem head-turn. */
  private golemTurnHead(golem: StaticGolem): void {
    this.tweens.add({
      targets: golem.container,
      x: golem.container.x - 20,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /** Visual effect for full-command response. */
  private golemCommandFlash(golem: StaticGolem): void {
    this.cameras.main.flash(200, 200, 140, 20);
    this.flashGolemCommanded(golem.sprite);
    this.tweens.add({
      targets: golem.container,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  // ─── Wave-clear watcher ───────────────────────────────────────────────────────

  /**
   * Poll every 300 ms until all golems in `this.golems` are defeated,
   * then call `onClear`.
   */
  private watchForWaveClear(onClear: () => void): void {
    const check = (): void => {
      if (this.golems.length > 0 && this.golems.every((g) => g.isDefeated())) {
        this.waveActive = false;
        onClear();
      } else if (this.waveActive || this.golems.some((g) => !g.isDefeated())) {
        this.time.delayedCall(300, check);
      }
    };
    this.time.delayedCall(300, check);
  }

  // ─── Passage chain ────────────────────────────────────────────────────────────

  private forgePassageWordPosition(
    owner: ForgePassageOwner,
    word: string,
  ): { x: number; y: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    const fallback = { x: width / 2, y: height - 340 };
    const long = word.length > 16;
    let body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined;
    let sourceOffsetY = -56;
    let side = 1;
    let lift = long ? 116 : 102;

    if (owner === "forn") {
      body = this.fornSprite;
      sourceOffsetY = -128;
      side = 1;
      lift = 92;
    } else if (owner === "apprentices") {
      body = this.apprenticeCue;
      sourceOffsetY = -68;
      side = -1;
    } else if (owner === "peaceful-order") {
      body = this.standDownCue;
      sourceOffsetY = -54;
      side = 1;
    } else {
      return fallback;
    }

    if (!body?.scene) return fallback;

    const lateral = long ? 220 : 180;
    const xInset = long ? 420 : 300;
    return {
      x: Phaser.Math.Clamp(body.x + side * lateral, xInset, width - xInset),
      y: Phaser.Math.Clamp(body.y + sourceOffsetY - lift, 280, height - 430),
    };
  }

  private forgeChoiceWordPosition(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    sourceOffsetY: number,
    word: string,
    opts: { side?: "left" | "right"; long?: boolean; lift?: number } = {},
  ): { x: number; y: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    if (!body?.scene) return { x: width / 2, y: height - 340 };

    const long = opts.long ?? word.length > 16;
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1 : body.x < width / 2 ? 1 : -1;
    const lateral = long ? 220 : 180;
    const xInset = long ? 420 : 300;
    const lift = opts.lift ?? (long ? 116 : 102);

    return {
      x: Phaser.Math.Clamp(body.x + side * lateral, xInset, width - xInset),
      y: Phaser.Math.Clamp(body.y + sourceOffsetY - lift, 280, height - 430),
    };
  }

  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
    owner: ForgePassageOwner = "forn",
    trueNameSeal?: Phaser.GameObjects.Container,
  ): void {
    let step = 0;

    const advance = (): void => {
      if (step >= passages.length) {
        onDone();
        return;
      }
      const word = passages[step];
      // Skip empty narrator-only steps
      if (!word) {
        step++;
        advance();
        return;
      }
      let trueNameAnchor: WordBodyAnchorHandle | null = null;
      const releaseTrueNameAnchor = (): void => {
        trueNameAnchor?.destroy();
        trueNameAnchor = null;
      };
      const pos = trueNameSeal
        ? { x: trueNameSeal.x, y: trueNameSeal.y - 118 }
        : this.forgePassageWordPosition(owner, word);
      const opts: TextWordTargetOptions = {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        burstColor: trueNameSeal ? PALETTE_HEX.ember : undefined,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          if (!trueNameSeal?.scene) return;
          playClaimLine(
            this,
            this.wrenContainer.x,
            this.wrenContainer.y - 112,
            trueNameSeal.x,
            trueNameSeal.y - 8,
            { color: PALETTE_HEX.ember, depth: 58 },
          );
          playActorAttention(this, trueNameSeal, {
            tint: PALETTE_HEX.ember,
            scale: 1.024,
            durationMs: 180,
          });
        },
        onAdvance: () => {
          if (!trueNameSeal?.scene) return;
          playBodyTypePulse(this, trueNameSeal, {
            kind: "ember",
            color: PALETTE_HEX.ember,
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
              kind: "ember",
              color: PALETTE_HEX.ember,
              offsetY: -8,
              depth: 58,
              ringRadius: 54,
              count: 12,
            });
          } else if (owner === "forn") {
            playActorAttention(this, this.fornSprite, {
              tint: PALETTE_HEX.ember,
            });
          }
          playBodyImpact(this, this.wrenContainer, {
            kind: "ember",
            color: PALETTE_HEX.ember,
            offsetY: -104,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          const line = narratorLines[step] ?? "";
          step++;
          if (line) this.setNarrator(line);
          this.time.delayedCall(line ? 1400 : 400, advance);
        },
      };
      let target: TextWordTarget;
      if (trueNameSeal) {
        target = this.makeWord(opts);
      } else if (owner === "apprentices") {
        target = this.makeForgeChoiceWord(this.apprenticeCue, opts, {
          sourceOffsetY: -68,
        });
      } else if (owner === "peaceful-order") {
        target = this.makeForgeChoiceWord(this.standDownCue, opts, {
          color: PALETTE_HEX.brass,
          sourceOffsetY: -54,
        });
      } else if (owner === "none") {
        target = this.makeWord(opts);
      } else {
        target = this.makeFornWord(opts);
      }
      if (trueNameSeal?.scene) {
        trueNameAnchor = attachWordBodyAnchor(
          this,
          trueNameSeal,
          () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
          {
            color: PALETTE_HEX.ember,
            alpha: 0.2,
            depth: 43,
            sourceOffsetY: -12,
            targetOffsetY: 24,
          },
        );
        trueNameSeal.once(Phaser.GameObjects.Events.DESTROY, releaseTrueNameAnchor);
      }
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  private catwalkCueX(idx: number): number {
    return this.scale.width / 2 + (idx - 1) * 260;
  }

  private catwalkEntranceWrenX(): number {
    return this.catwalkCueX(0) - 178;
  }

  private catwalkWrenX(idx: number): number {
    const cueX = this.catwalkCueX(idx);
    if (idx === 0) return cueX + 112;
    if (idx === 2) return cueX - 112;
    return cueX;
  }

  private catwalkWordPosition(idx: number): { x: number; y: number } {
    const cueX = this.catwalkCueX(idx);
    if (idx === 0) return { x: cueX - 28, y: CATWALK_Y - 78 };
    if (idx === 1) return { x: cueX + 128, y: CATWALK_Y - 124 };
    return { x: cueX + 74, y: CATWALK_Y - 92 };
  }

  private walkWrenAlongCatwalk(x: number, onComplete?: () => void): void {
    if (!this.wrenContainer?.scene) {
      onComplete?.();
      return;
    }
    const distance = Math.abs(this.wrenContainer.x - x);
    if (distance < 4) {
      onComplete?.();
      return;
    }
    playActorAttention(this, this.wrenContainer, {
      scale: 1.012,
      durationMs: 220,
    });
    this.tweens.add({
      targets: this.wrenContainer,
      x,
      duration: Phaser.Math.Clamp(distance * 2.2, 280, 620),
      ease: "Sine.easeInOut",
      onComplete,
    });
  }

  private resetWrenToFront(): void {
    if (!this.wrenSprite?.scene) return;
    this.tweens.killTweensOf(this.wrenSprite);
    setWrenPose(this.wrenSprite, "front");
    this.wrenSprite.x = 0;
    this.wrenSprite.y = 0;
  }

  private showCatwalkCue(idx: number, x: number): void {
    if (this.catwalkCue?.scene && this.catwalkCueIndex === idx) return;
    this.dismissCatwalkCue(false);
    const cue =
      idx === 0
        ? this.drawLooseGrateCue(x)
        : idx === 1
          ? this.drawSteamPipeCue(x)
          : this.drawRailGripCue(x);
    this.catwalkCue = cue;
    this.catwalkCueIndex = idx;
    this.tweens.add({
      targets: cue,
      alpha: 0.86,
      y: cue.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
    });
  }

  private drawLooseGrateCue(x: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, CATWALK_Y + 10).setDepth(-2).setAlpha(0);
    const g = this.add.graphics();
    const fillPoly = (points: Array<{ x: number; y: number }>, color: number, alpha: number): void => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) g.lineTo(point.x, point.y);
      g.closePath();
      g.fillPath();
    };
    const strokePoly = (points: Array<{ x: number; y: number }>, color: number, alpha: number, width: number): void => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) g.lineTo(point.x, point.y);
      g.closePath();
      g.strokePath();
    };

    g.fillStyle(0x070504, 0.44);
    g.fillEllipse(2, 28, 216, 26);
    fillPoly(
      [
        { x: -103, y: -10 },
        { x: -70, y: -25 },
        { x: 75, y: -28 },
        { x: 105, y: -9 },
        { x: 86, y: 23 },
        { x: -88, y: 23 },
      ],
      0x090605,
      0.74,
    );
    g.fillStyle(PALETTE_HEX.ember, 0.12);
    g.fillEllipse(20, 14, 154, 18);

    const slats: Array<Array<{ x: number; y: number }>> = [
      [
        { x: -98, y: -13 },
        { x: -68, y: -24 },
        { x: -61, y: 20 },
        { x: -93, y: 20 },
      ],
      [
        { x: -59, y: -24 },
        { x: -24, y: -27 },
        { x: -22, y: 19 },
        { x: -53, y: 22 },
      ],
      [
        { x: -14, y: -26 },
        { x: 19, y: -25 },
        { x: 17, y: 18 },
        { x: -16, y: 21 },
      ],
      [
        { x: 29, y: -25 },
        { x: 59, y: -27 },
        { x: 56, y: 18 },
        { x: 25, y: 19 },
      ],
      [
        { x: 67, y: -26 },
        { x: 93, y: -15 },
        { x: 84, y: 19 },
        { x: 63, y: 18 },
      ],
    ];
    for (const slat of slats) {
      fillPoly(slat, 0x241a13, 0.98);
      strokePoly(slat, 0x6f5134, 0.46, 2);
    }

    g.lineStyle(3, 0x120d0a, 0.88);
    for (const gx of [-64, -23, 18, 59]) {
      g.lineBetween(gx, -22, gx + 4, 20);
    }
    g.lineStyle(2, 0xa97848, 0.36);
    g.lineBetween(-88, -9, 86, -17);
    g.lineBetween(-88, 15, 77, 11);
    g.lineStyle(2, PALETTE_HEX.ember, 0.36);
    g.lineBetween(-74, 21, 78, 19);

    const liftedCorner = [
      { x: 56, y: -26 },
      { x: 103, y: -43 },
      { x: 93, y: -24 },
      { x: 63, y: -15 },
    ];
    fillPoly(liftedCorner, 0x2e2218, 0.98);
    strokePoly(liftedCorner, 0x91683d, 0.58, 2);
    g.lineStyle(2, 0xf0c074, 0.26);
    g.lineBetween(62, -29, 98, -41);
    g.lineStyle(2, 0x0d0907, 0.58);
    g.lineBetween(63, -15, 92, -24);

    g.fillStyle(0xb98554, 0.58);
    for (const bolt of [
      { x: -82, y: -5, r: 3 },
      { x: -45, y: 11, r: 2.5 },
      { x: -4, y: -8, r: 2.4 },
      { x: 36, y: 8, r: 2.4 },
      { x: 72, y: -7, r: 2.8 },
    ]) {
      g.fillCircle(bolt.x, bolt.y, bolt.r);
      g.fillStyle(0x140d08, 0.45);
      g.fillCircle(bolt.x + 1, bolt.y + 1, bolt.r * 0.45);
      g.fillStyle(0xb98554, 0.58);
    }

    g.lineStyle(2, PALETTE_HEX.ember, 0.3);
    g.lineBetween(102, -38, 116, -44);
    g.lineBetween(100, -31, 117, -30);
    c.add(g);
    this.tweens.add({
      targets: c,
      rotation: { from: -0.01, to: 0.012 },
      duration: 540,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private drawSteamPipeCue(x: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, CATWALK_Y - 36).setDepth(-2).setAlpha(0);
    const pipe = this.add.graphics();
    pipe.lineStyle(18, 0x090706, 0.46);
    pipe.lineBetween(-142, -86, 124, -86);
    pipe.lineStyle(14, 0x1a1411, 0.96);
    pipe.lineBetween(-140, -84, 126, -84);
    pipe.lineStyle(5, 0x6f5338, 0.68);
    pipe.lineBetween(-132, -92, 118, -92);
    pipe.fillStyle(0x2a211b, 1);
    pipe.fillRoundedRect(54, -102, 62, 33, 7);
    pipe.fillStyle(0x0d0907, 0.94);
    pipe.fillRoundedRect(70, -78, 38, 19, 6);
    pipe.lineStyle(3, 0x8b6843, 0.55);
    pipe.strokeRoundedRect(54, -102, 62, 33, 7);
    pipe.fillStyle(PALETTE_HEX.ember, 0.18);
    pipe.fillEllipse(88, -62, 66, 13);
    pipe.lineStyle(2, 0xf0c074, 0.42);
    pipe.strokeEllipse(88, -68, 42, 18);
    c.add(pipe);
    const steam = this.add.graphics();
    steam.fillStyle(0xf3dfbd, 0.32);
    steam.fillEllipse(96, -20, 82, 126);
    steam.fillStyle(0xd7c3a1, 0.24);
    steam.fillEllipse(68, 8, 48, 82);
    steam.fillEllipse(124, 12, 54, 92);
    steam.fillStyle(0xffffff, 0.16);
    steam.fillEllipse(98, -44, 50, 78);
    steam.lineStyle(2, 0xf5d195, 0.28);
    steam.lineBetween(82, -70, 72, 38);
    steam.lineBetween(112, -66, 128, 42);
    c.add(steam);
    this.tweens.add({
      targets: steam,
      y: -12,
      scaleY: 1.16,
      alpha: 0.72,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private drawRailGripCue(x: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, CATWALK_Y - 6).setDepth(-2).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(0x070504, 0.38);
    g.fillEllipse(2, 42, 218, 24);
    g.lineStyle(16, 0x090706, 0.44);
    g.lineBetween(-116, -54, 124, -43);
    g.lineStyle(12, 0x1a120d, 0.98);
    g.lineBetween(-112, -52, 126, -42);
    g.lineStyle(5, 0x6b5036, 0.82);
    g.lineBetween(-106, -58, 118, -48);
    g.lineStyle(3, 0xf0c074, 0.2);
    g.lineBetween(-76, -62, 16, -58);

    g.lineStyle(11, 0x140f0b, 0.98);
    g.lineBetween(-94, -52, -94, 32);
    g.lineBetween(94, -44, 94, 32);
    g.lineStyle(4, 0x5e4631, 0.75);
    g.lineBetween(-100, -48, -100, 26);
    g.lineBetween(88, -41, 88, 28);

    g.lineStyle(6, 0x2e2118, 0.84);
    g.lineBetween(-86, -16, 88, -8);
    g.lineStyle(2, 0x7e5d3b, 0.36);
    g.lineBetween(-82, -20, 84, -12);

    g.fillStyle(0x241810, 0.96);
    g.fillRoundedRect(48, -63, 60, 28, 6);
    g.lineStyle(3, 0x8a6541, 0.58);
    g.strokeRoundedRect(48, -63, 60, 28, 6);
    g.fillStyle(PALETTE_HEX.ember, 0.26);
    g.fillCircle(62, -49, 3.5);
    g.fillCircle(94, -47, 3.5);

    g.lineStyle(2, PALETTE_HEX.ember, 0.34);
    g.lineBetween(134, -60, 150, -66);
    g.lineBetween(132, -45, 153, -43);
    g.lineBetween(132, -30, 148, -24);
    g.fillStyle(PALETTE_HEX.ember, 0.17);
    g.fillEllipse(74, -48, 84, 18);
    c.add(g);
    this.tweens.add({
      targets: c,
      x: x + 7,
      rotation: { from: -0.006, to: 0.008 },
      duration: 115,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return c;
  }

  private pulseCatwalkCue(completion: boolean): void {
    if (!this.catwalkCue?.scene) return;
    playActorAttention(this, this.catwalkCue, {
      scale: completion ? 1.035 : 1.018,
      durationMs: completion ? 250 : 170,
      tint: PALETTE_HEX.ember,
    });
    playBodyImpact(this, this.catwalkCue, {
      kind: "ember",
      color: PALETTE_HEX.ember,
      offsetY: completion ? -28 : -20,
      depth: 16,
      ringRadius: completion ? 42 : 26,
      count: completion ? 8 : 5,
      durationMs: completion ? 420 : 250,
    });
  }

  private dismissCatwalkCue(animate = true): void {
    this.releaseCatwalkCueWordAnchor();
    const cue = this.catwalkCue;
    if (!cue?.scene) {
      this.catwalkCue = null;
      this.catwalkCueIndex = null;
      return;
    }
    this.catwalkCue = null;
    this.catwalkCueIndex = null;
    this.tweens.killTweensOf(cue);
    for (const child of cue.list) this.tweens.killTweensOf(child);
    if (!animate) {
      cue.destroy();
      return;
    }
    this.tweens.add({
      targets: cue,
      alpha: 0,
      y: cue.y - 18,
      duration: 240,
      ease: "Sine.easeIn",
      onComplete: () => cue.destroy(),
    });
  }

  private attachCatwalkCueWordAnchor(idx: number, target: TextWordTarget): void {
    const cue = this.catwalkCue;
    if (!cue?.scene) return;
    this.releaseCatwalkCueWordAnchor();
    const sourceOffsetY = idx === 1 ? -54 : idx === 2 ? -50 : -8;
    this.catwalkCueWordAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.14,
        depth: 7,
        sourceOffsetY,
        targetOffsetY: 24,
      },
    );
  }

  private releaseCatwalkCueWordAnchor(): void {
    this.catwalkCueWordAnchor?.destroy();
    this.catwalkCueWordAnchor = null;
  }

  // ─── Input ────────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode from inside the realm.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }
    if (event.key === "Shift") {
      this.shiftHeld = true;
      return;
    }
    if (event.key === "Alt") {
      this.altHeld = true;
      // Browser default for Alt is to focus the menu bar — preventDefault
      // so Alt doesn't steal focus mid-spell.
      event.preventDefault();
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key, {
      // Shift stays free: capitalized command golems are caseSensitive, so
      // holding Shift is *required typing*, not a bonus — gating it on Soul
      // could soft-lock a required golem when the meter is empty.
      spell: this.shiftHeld,
      // Alt is the chain-spark (a 2-for-1 bonus), so it costs Soul. When the
      // meter is dry the Alt-claim falls through to a normal defeat — no chain,
      // never a block. spellCost folds in soul-thrift (bellows-hammer).
      alt: this.altHeld && this.typingInput.getStats().canCast(this.spellCost),
    });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = false;
    if (event.key === "Alt") this.altHeld = false;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);
    if (speakerName === "Forn") {
      playActorAttention(this, this.fornSprite, {
        tint: PALETTE_HEX.ember,
        scale: 1.025,
        durationMs: 220,
      });
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Forn") {
      this.band.setPortrait("forn", "Forn");
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private pulseForgeWave(
    opts: { y?: number; ringWidth?: number; ringHeight?: number; count?: number } = {},
  ): void {
    playSceneEventPulse(this, {
      kind: "ember",
      color: 0xd6754a,
      x: this.scale.width / 2,
      y: FLOOR_Y - 90,
      ringWidth: 1100,
      ringHeight: 130,
      count: 14,
      alpha: 0.15,
      ...opts,
    });
  }

  // ─── Tier 4 relic helpers ───────────────────────────────────────────────────

  /** Surface that the satchel is doing something here — once, briefly. The old
   *  version flashed every relic's line in sequence (a flood with a full satchel);
   *  the persistent loadout bar now shows WHAT you carry, so this is a single quiet
   *  beat. A lone relic still gets its own line. Empty loadout passes straight through. */
  private announceCombatLoadout(onDone: () => void): void {
    const lines = this.combat.announcements;
    if (lines.length === 0) {
      onDone();
      return;
    }
    this.band.showNotice(
      lines.length === 1
        ? lines[0]!
        : "Your satchel stirs — its relics answer here.",
      { label: "satchel" },
    );
    this.time.delayedCall(1900, onDone);
  }

  /** Per-combat-wave relic procs: re-arm forgive-wave-miss, pre-bank Soul
   *  (soul-banked / king-aurland — a spell head-start), and mark the easiest
   *  golem (auto-ease). Call at each golem-wave start. */
  private beginCombatWave(): void {
    this.waveForgivenessReady =
      this.combat.perWaveProcs.includes("forgive-wave-miss");
    this.typingInput.getStats().bankSoulFraction(this.combat.soulBankedFraction);
    this.applyAutoEase();
    this.applyCompanionTrip();
  }

  /** companion-trip (snow-fox-cub): a short while into each wave the fox darts in
   *  and trips the most-advanced golem (a stumble). No-op without the relic. */
  private applyCompanionTrip(): void {
    if (!this.combat.perWaveProcs.includes("companion-trip")) return;
    this.time.delayedCall(COMPANION_TRIP_DELAY_MS, () =>
      tripMostAdvancedFoe(this, this.golems, {
        textureKey: "forge-companion-snow-fox",
        startX: this.wrenContainer.x - 120,
        startY: this.wrenContainer.y - 18,
        height: 74,
        depth: 58,
        color: PALETTE_HEX.frost,
        kind: "snow",
      }),
    );
  }

  /** auto-ease (Etta's Ledger): glow the easiest (shortest-word) golem of the
   *  wave. Revisit-only in the Forge (Etta's Ledger is a later realm's relic).
   *  No-op without the relic or with no golems. */
  private applyAutoEase(): void {
    if (!this.combat.perWaveProcs.includes("auto-ease")) return;
    if (this.golems.length === 0) return;
    let easiest = this.golems[0]!;
    for (const g of this.golems) {
      if (g.word.length < easiest.word.length) easiest = g;
    }
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE_HEX.brass, 0.22);
    glow.fillEllipse(0, 0, 110, 150);
    easiest.container.addAt(glow, 0);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.22, to: 0.5 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** Gentle "forgiven" cue when forgive-wave-miss spares a slip — distinct from
   *  the harsh miss flinch. */
  private flashForgiven(): void {
    const x = this.wrenContainer?.scene ? this.wrenContainer.x : this.scale.width / 2;
    const y = this.wrenContainer?.scene
      ? Math.max(300, Math.min(this.scale.height - 330, this.wrenContainer.y - 128))
      : CATWALK_Y + 120;
    const plate = this.add.graphics().setPosition(x, y).setDepth(59).setAlpha(0.78);
    plate.fillStyle(0x20150f, 0.4);
    plate.fillRoundedRect(-94, -23, 188, 46, 12);
    plate.lineStyle(2, PALETTE_HEX.brass, 0.5);
    plate.strokeRoundedRect(-86, -17, 172, 34, 10);
    plate.lineStyle(3, PALETTE_HEX.ember, 0.62);
    plate.lineBetween(-58, 4, -26, -8);
    plate.lineBetween(-26, -8, 6, 6);
    plate.lineBetween(6, 6, 54, -10);
    playBodyImpact(this, this.wrenContainer, {
      kind: "ember",
      color: PALETTE_HEX.brass,
      offsetY: -104,
      depth: 58,
      ringRadius: 34,
      count: 8,
      durationMs: 360,
    });
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
      y: "-=34",
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => {
        plate.destroy();
        txt.destroy();
      },
    });
  }

  /** The live, eligible golems summarised for an offensive one-shot's "strongest
   *  foe" pick. Only golems with an attached word are threats (during the entrance
   *  and between knock-backs they're mute); the boss isn't in `this.golems`, so
   *  its true-name challenge is excluded by construction. Progress is the
   *  horizontal close on Wren (the Forge advance is straight). */
  private liveGolemThreats(): OneShotThreat<MovingWordEnemy>[] {
    const threats: OneShotThreat<MovingWordEnemy>[] = [];
    for (const g of this.golems) {
      if (g.isDefeated() || g.isFrozen() || !g.target) continue;
      threats.push({
        enemy: g,
        progress: g.advanceProgress(),
        wordLength: g.word.length,
      });
    }
    return threats;
  }

  /** Run an offensive one-shot's consequence. The invoker has already picked the
   *  target(s), spent the Soul, and consumed the once-per-realm charge; the realm
   *  owns the kill/seize/freeze + VFX. The Forge only fires toll-strike forward;
   *  jam-foe / bind-beat arrive with the Sky / Wood migrations. */
  private applyOneShot(
    effect: OffensiveOneShot,
    targets: readonly MovingWordEnemy[],
  ): void {
    if (effect === "toll-strike") this.tollStrike(targets[0]);
  }

  /** toll-strike (bells-tongue): the bell's tongue rings and fells the strongest
   *  golem outright — a deep toll + an ember bloom where it stood. A programmatic
   *  defeat (like the chain-spark), so no command flourish, just the kill. */
  private tollStrike(target: MovingWordEnemy | undefined): void {
    if (!target || target.isDefeated()) return;
    playBellToll();
    playWordCompleteBurst(this, target.container.x, target.restY - 80, {
      color: PALETTE_HEX.ember,
      count: 16,
      radius: 60,
    });
    this.cameras.main.shake(160, 0.004);
    target.defeat();
  }

  /** UI-cohesion: every Forge word target goes through here so it picks up the
   *  legibility outline by default (TTT-style). Choices pass frame: "banner". */
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

  private playWrenTypingPulse(): void {
    playBodyTypePulse(this, this.wrenContainer, {
      kind: "ember",
      color: PALETTE_HEX.ember,
      offsetY: -108,
      depth: 58,
      ringRadius: 22,
    });
  }

  private makeCommandGolemWord(opts: TextWordTargetOptions): TextWordTarget {
    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    const onSpellComplete = opts.onSpellComplete;
    const onAltSpellComplete = opts.onAltSpellComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.bossWordAnchors.indexOf(anchor);
      if (idx >= 0) this.bossWordAnchors.splice(idx, 1);
      anchor = null;
    };
    const playBossImpact = (): void => {
      playBodyImpact(this, this.bossContainer, {
        kind: "ember",
        color: PALETTE_HEX.ember,
        offsetY: -150,
        depth: 58,
        ringRadius: 58,
        count: 14,
      });
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.ember,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          this.bossContainer.x,
          this.bossContainer.y - 150,
          { color: PALETTE_HEX.ember, depth: 58 },
        );
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, this.bossContainer, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: -150,
          depth: 58,
          ringRadius: 32,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBossImpact();
        onComplete();
      },
      onSpellComplete: onSpellComplete
        ? () => {
            releaseAnchor();
            playBossImpact();
            onSpellComplete();
          }
        : undefined,
      onAltSpellComplete: onAltSpellComplete
        ? () => {
            releaseAnchor();
            playBossImpact();
            onAltSpellComplete();
          }
        : undefined,
    });

    anchor = attachWordBodyAnchor(
      this,
      this.bossContainer,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -150,
        targetOffsetY: 24,
      },
    );
    this.bossWordAnchors.push(anchor);
    return target;
  }

  private makeStaticGolemWord(
    golem: StaticGolem,
    opts: TextWordTargetOptions,
  ): TextWordTarget {
    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    const onSpellComplete = opts.onSpellComplete;
    const onAltSpellComplete = opts.onAltSpellComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.tutorialWordAnchors.indexOf(anchor);
      if (idx >= 0) this.tutorialWordAnchors.splice(idx, 1);
      anchor = null;
    };
    const playLessonImpact = (): void => {
      playBodyImpact(this, golem.container, {
        kind: "ember",
        color: PALETTE_HEX.ember,
        offsetY: -76,
        depth: 58,
        ringRadius: 42,
        count: 10,
      });
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.ember,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          golem.container.x,
          golem.container.y - 76,
          { color: PALETTE_HEX.ember, depth: 58 },
        );
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, golem.container, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: -76,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playLessonImpact();
        onComplete();
      },
      onSpellComplete: onSpellComplete
        ? () => {
            releaseAnchor();
            playLessonImpact();
            onSpellComplete();
          }
        : undefined,
      onAltSpellComplete: onAltSpellComplete
        ? () => {
            releaseAnchor();
            playLessonImpact();
            onAltSpellComplete();
          }
        : undefined,
    });

    anchor = attachWordBodyAnchor(
      this,
      golem.container,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -76,
        targetOffsetY: 24,
      },
    );
    this.tutorialWordAnchors.push(anchor);
    golem.container.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeFornWord(opts: TextWordTargetOptions): TextWordTarget {
    const forn = this.fornSprite;
    if (!forn) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.fornWordAnchors.indexOf(anchor);
      if (idx >= 0) this.fornWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? PALETTE_HEX.ember,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          forn.x,
          forn.y - 128,
          { color: PALETTE_HEX.ember, depth: 58 },
        );
        playActorAttention(this, forn, {
          tint: PALETTE_HEX.ember,
          scale: 1.02,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, forn, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: -128,
          depth: 58,
          ringRadius: 28,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, forn, {
          kind: "ember",
          color: PALETTE_HEX.ember,
          offsetY: -128,
          depth: 58,
          ringRadius: 52,
          count: 12,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      forn,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: PALETTE_HEX.ember,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -128,
        targetOffsetY: 24,
      },
    );
    this.fornWordAnchors.push(anchor);
    forn.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeForgeChoiceWord(
    body: Phaser.GameObjects.Container | null | undefined,
    opts: TextWordTargetOptions,
    cueOpts: { color?: number; sourceOffsetY?: number } = {},
  ): TextWordTarget {
    if (!body?.scene) return this.makeWord(opts);

    const color = cueOpts.color ?? PALETTE_HEX.ember;
    const sourceOffsetY = cueOpts.sourceOffsetY ?? -56;
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
      burstColor: opts.burstColor ?? color,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y + sourceOffsetY,
          { color, depth: 58 },
        );
        this.pulseForgeChoiceCue(body, color);
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "ember",
          color,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 25,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "ember",
          color,
          offsetY: sourceOffsetY,
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
        color,
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

  private makeSongbirdWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.songbirdCompanion;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.songbirdWordAnchors.indexOf(anchor);
      if (idx >= 0) this.songbirdWordAnchors.splice(idx, 1);
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
          body.y - 54,
          { color: PALETTE_HEX.brass, depth: 58 },
        );
        this.pulseSongbirdCompanion();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "ember",
          color: PALETTE_HEX.brass,
          offsetY: -54,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "ember",
          color: PALETTE_HEX.brass,
          offsetY: -54,
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
        color: PALETTE_HEX.brass,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -54,
        targetOffsetY: 24,
      },
    );
    this.songbirdWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private clearBossWordAnchors(): void {
    for (const anchor of this.bossWordAnchors) anchor.destroy();
    this.bossWordAnchors = [];
  }

  private clearTutorialWordAnchors(): void {
    for (const anchor of this.tutorialWordAnchors) anchor.destroy();
    this.tutorialWordAnchors = [];
  }

  private clearFornWordAnchors(): void {
    for (const anchor of this.fornWordAnchors) anchor.destroy();
    this.fornWordAnchors = [];
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private clearSongbirdWordAnchors(): void {
    for (const anchor of this.songbirdWordAnchors) anchor.destroy();
    this.songbirdWordAnchors = [];
  }

  private clearActiveTargets(): void {
    this.clearBossWordAnchors();
    this.clearTutorialWordAnchors();
    this.clearFornWordAnchors();
    this.clearForkChoiceWordAnchors();
    this.clearSongbirdWordAnchors();
    this.releaseCatwalkCueWordAnchor();
    this.dismissRevisitMemoryCue(false);
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  private idleBob(c: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 5 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────────

  private drawForgeGlow(): void {
    this.forgeGlowGraphics = this.add.graphics();
    // Orange glow pools on the floor at forge openings
    const glowColor = PALETTE_HEX.ember;
    for (const gx of [380, 960, 1540]) {
      this.forgeGlowGraphics.fillStyle(glowColor, 0.12);
      this.forgeGlowGraphics.fillEllipse(gx, FLOOR_Y + 30, 320, 80);
      this.forgeGlowGraphics.fillStyle(glowColor, 0.07);
      this.forgeGlowGraphics.fillEllipse(gx, FLOOR_Y + 20, 480, 110);
    }
  }

  private drawCatwalk(): void {
    // A suspended iron walkway for Wren to stand on. It needs real THICKNESS +
    // visible supports so Wren reads as standing on a structure, not floating —
    // but without the old bright brass railing + grating dashes that read as a UI
    // overlay across the painting.
    const g = this.add.graphics().setDepth(-4);
    const w = this.scale.width;
    const top = CATWALK_Y;
    // Support trusses descending toward the foundry floor (drawn first, so the
    // deck sits in front of them and they read as holding it up).
    g.fillStyle(0x191310, 1);
    for (const sx of [150, 470, 820, 1100, 1450, 1770]) {
      g.fillRect(sx, top + 34, 12, 150);
      g.fillRect(sx + 30, top + 34, 12, 150);
      // a cross-brace
      g.lineStyle(3, 0x191310, 1);
      g.beginPath();
      g.moveTo(sx + 6, top + 44);
      g.lineTo(sx + 36, top + 150);
      g.moveTo(sx + 36, top + 44);
      g.lineTo(sx + 6, top + 150);
      g.strokePath();
    }
    // Deck — a solid plate with thickness: top surface (where Wren stands), a
    // darker front face, a warm forge-lit top edge, and a dark underline.
    g.fillStyle(0x2a211b, 1); // front face / body
    g.fillRect(0, top, w, 34);
    g.fillStyle(0x3a2e24, 1); // top deck surface
    g.fillRect(0, top, w, 13);
    g.fillStyle(0x5a4632, 0.85); // warm top highlight edge
    g.fillRect(0, top, w, 3);
    g.fillStyle(0x120e0b, 1); // dark underline at the deck's bottom
    g.fillRect(0, top + 31, w, 3);
    // Local plates/rivets at the three obstacle beats keep the catwalk from
    // reading as a flat UI stripe and give Wren clear places to step through.
    const plateXs = [
      this.catwalkCueX(0),
      this.catwalkWrenX(0),
      this.catwalkCueX(1),
      this.catwalkCueX(2),
      this.catwalkWrenX(2),
      this.scale.width / 2,
    ];
    for (const px of plateXs) {
      g.fillStyle(0x120e0b, 0.22);
      g.fillEllipse(px, top + 22, 118, 12);
      g.fillStyle(0x6a5038, 0.24);
      g.fillRoundedRect(px - 76, top + 5, 152, 5, 3);
      g.lineStyle(1.5, 0x7d6043, 0.24);
      g.lineBetween(px - 84, top + 2, px - 84, top + 31);
      g.lineBetween(px + 84, top + 2, px + 84, top + 31);
      g.fillStyle(PALETTE_HEX.ember, 0.2);
      g.fillCircle(px - 54, top + 18, 2.3);
      g.fillCircle(px + 54, top + 18, 2.3);
    }
    // Soft cast shadow under the deck.
    g.fillStyle(0x000000, 0.3);
    g.fillRect(0, top + 34, w, 12);
  }

  private drawWren(x: number, y: number): void {
    const c = this.add.container(x, y);
    this.wrenContainer = c;
    c.add(addLocalGroundShadow(this, 92, 18, { y: 6, alpha: 0.32 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    stageContainerEntrance(this, c, {
      breathDy: -3,
      breathMs: 1900,
    });
    addContainerWake(this, c, {
      kind: "ember",
      intervalMs: 380,
      spreadX: 28,
      spreadY: 10,
      offsetY: -78,
      color: PALETTE_HEX.ember,
      alpha: 0.24,
      size: 2.9,
      depth: 0.35,
      driftX: 36,
      driftY: -34,
      durationMs: 840,
    });
  }

  /** Add the painted golem sprite into a container, scaled to the old procedural
   *  body height so the word anchor + hit feel still line up. Returns the sprite
   *  so the command-flash can tint it brass. */
  private drawGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 132, 24, { y: 10, alpha: 0.42 }));
    const sprite = this.add.image(0, 0, "forge-golem");
    sprite.setScale(GOLEM_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
    return sprite;
  }

  /** Add the painted Command-Golem boss sprite (scaled to the procedural boss
   *  height; the ×1.8 container scales it up on screen). Returns it so phase 2
   *  can flash it "commanded". */
  private drawCommandGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 164, 30, { y: 12, alpha: 0.46 }));
    const sprite = this.add.image(0, 0, "forge-command-golem");
    sprite.setScale(COMMAND_GOLEM_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
    return sprite;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
