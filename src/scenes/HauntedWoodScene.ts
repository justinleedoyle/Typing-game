import Phaser from "phaser";
import { type AmbientHandle, playAmbientWood } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { playBellToll } from "../audio/bellToll";
import { playSparkZap } from "../audio/sparkZap";
import { flashDamageVignette, playWordCompleteBurst } from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
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
import type { SaveStore } from "../game/saveState";
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
  addBackdropDrift,
  addContainerWake,
  attachWordBodyAnchor,
  dismissCompanionCameo,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  playActorAttention,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playRealmClearResonance,
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
import runaPortrait from "../../art/runa/runa-front.png";
import wispCatSprite from "../../art/companions/wisp-cat.png";

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
const WREN_Y = 860;
const GHOST_KNOCKBACK_PAUSE_MS = 1800;

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

// Painted-sprite display heights (px), matching the old procedural body heights
// so the word anchor + hit feel line up. The ghost body was a 76px-tall ellipse;
// the king figure (crown down through the body ellipse, throne excluded) spanned
// ~232px. Both drawn at native 1:1 (no scaled container). Tune on live.
const WOOD_GHOST_SPRITE_HEIGHT = 84;
const GHOST_KING_SPRITE_HEIGHT = 232;
const INGA_GHOST_SPRITE_HEIGHT = 92;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the word contains any of . , ? ! ; : */
function hasPunctuation(word: string): boolean {
  return /[.,?!;:]/.test(word);
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class HauntedWoodScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
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
  // Tier 4 — Soul-charged typed invocation for offensive one-shots. Wood is the
  // last realm and richest satchel, so it can hold all three: toll-strike
  // (bells-tongue), jam-foe (sabotage-wrench), and bind-beat (tether-cord). Null
  // until create().
  private oneShotInvoker: OneShotInvoker<MovingWordEnemy> | null = null;

  private mistTimer: Phaser.Time.TimerEvent | null = null;
  private shrineFigure: Phaser.GameObjects.Container | null = null;
  private offeringCue: Phaser.GameObjects.Container | null = null;
  private boneFluteCue: Phaser.GameObjects.Container | null = null;
  private groveLightCue: Phaser.GameObjects.Container | null = null;
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private pathCue: Phaser.GameObjects.Container | null = null;
  private pathCueWordAnchor: WordBodyAnchorHandle | null = null;
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
    this.ghosts = [];
    this.activeTargets = [];
    this.oneShotInvoker = null;
    this.onWaveCleared = null;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.companionChoice = null;
    this.mistTimer = null;
    this.shrineFigure = null;
    this.offeringCue = null;
    this.boneFluteCue = null;
    this.groveLightCue = null;
    this.forkChoiceWordAnchors = [];
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.pathCue = null;
    this.pathCueWordAnchor = null;
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
    this.load.image("haunted-wood-backdrop", hauntedWoodBackdrop);
    this.load.image("wood-ghost", woodGhostSprite);
    this.load.image("ghost-king", ghostKingSprite);
    this.load.image("wood-companion-wisp-cat", wispCatSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 14, 18, 14);
    const backdrop = this.add
      .image(0, 0, "haunted-wood-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 20000, driftX: -4, driftY: -3 });
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
    });
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
    });
    this.drawShrine();
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
      this.revisit ? [] : this.store.get().satchel,
      "haunted-wood",
    );

    // UI cohesion — the console band houses the meters + satchel. Wood's mist is
    // a vision overlay (not a bottom meter), so the satchel zone shows the passive
    // relic icon tiles; the offensive one-shots drop into the band's charge cards.
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
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
        // forgive-wave-miss (Shrine-Token): spare the first miss of a wave its
        // flinch. Dormant on a forward run (Shrine-Token is earned here, at the
        // end), wired for consistency + revisit-combat forward-compat.
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
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      onSustainedLowHeart: () =>
        this.band.showNotice(pickLowHeartLine().text, {
          label: "heart",
          durationMs: 2400,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Tier 4 — Wood is the richest satchel; it can hold all three offensive
    // one-shots. The widget sits just above Wren. Threats are the live, non-frozen
    // ghosts (the boss's every-punctuation capstone is a stationary passage, NOT
    // in `this.ghosts`, so a one-shot can't trivialise it).
    const offensiveOneShots = this.combat.oneShots.filter(isOffensiveOneShot);
    this.oneShotInvoker = new OneShotInvoker<MovingWordEnemy>({
      scene: this,
      typingInput: this.typingInput,
      available: offensiveOneShots,
      cost: ONESHOT_SOUL_COST,
      getSoul: () => this.typingInput.getStats().getSoul(),
      spendSoul: (cost) => this.typingInput.getStats().spendSoul(cost),
      getThreats: () => this.liveGhostThreats(),
      applyEffect: (effect, targets) => this.applyOneShot(effect, targets),
      isActive: () =>
        this.ghosts.length > 0 && this.ghosts.some((g) => !g.isDefeated()),
      announce: (text) => this.band.showNotice(text, { label: "relic" }),
      slots: band.oneShotSlots,
      compact: true,
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.oneShotInvoker?.destroy();
      this.oneShotInvoker = null;
      this.mistTimer?.remove();
      this.compassGlyphs.forEach((g) => g.destroy());
      this.compassGlyphs = [];
      this.clearWoodForkCues();
      this.shrineFigure = null;
      this.releasePathCueWordAnchor();
      this.pathCue = null;
      this.dismissRevisitMemoryCue(false);
      this.clearIngaWordAnchors();
      this.ingaFigure = null;
      this.ghostKingBody = null;
      this.wispCatCompanion = null;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
    });

    this.ambientHandle = playAmbientWood();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.startArrival();
  }

  // ─── Revisit mode ────────────────────────────────────────────────────────

  private startRevisit(): void {
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
    this.time.delayedCall(2400, () => this.deliverRevisitPassage(words));
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
    this.narration.say("wood_intro_arrival");
    this.band.setObjective("Type the path words to reach the lantern in the trees.");
    this.time.delayedCall(2800, () => this.startPathExploration());
  }

  private startPathExploration(): void {
    // Three sequential single-word beats: step, → hush. → wait?
    const beats = [
      { word: "step,", narrator: "The path is narrow. Old roots clutch the ground." },
      { word: "hush.", narrator: "Something listens from the canopy." },
      { word: "wait?", narrator: "A lantern post. Someone is standing beside it." },
    ];
    let i = 0;
    const advance = (): void => {
      if (i >= beats.length) {
        this.dismissPathCue();
        this.time.delayedCall(800, () => this.startIngaNPC());
        return;
      }
      const beat = beats[i];
      if (!beat) return;
      this.showPathCue(i);
      const target = this.makeWord({
        scene: this,
        word: beat.word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 40,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          this.pulsePathCue(false);
        },
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          this.releasePathCueWordAnchor();
          this.pulsePathCue(true);
          playChime();
          this.clearActiveTargets();
          this.setNarrator(beat.narrator);
          i += 1;
          this.time.delayedCall(1600, advance);
        },
      });
      this.attachPathCueWordAnchor(i, target);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
  }

  private showPathCue(idx: number): void {
    this.dismissPathCue(false);
    const cue =
      idx === 0
        ? this.drawRootPathCue()
        : idx === 1
          ? this.drawCanopyPathCue()
          : this.drawLanternPostCue();
    this.pathCue = cue;
    this.tweens.add({
      targets: cue,
      alpha: 0.82,
      y: cue.y - 7,
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -3, durationMs: 3100 }),
    });
  }

  private drawRootPathCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 - 72, 820).setDepth(-1).setAlpha(0);
    c.add(addLocalGroundShadow(this, 230, 20, { y: 14, alpha: 0.14 }));
    const roots = this.add.graphics();
    roots.lineStyle(9, 0x1f241b, 0.86);
    roots.beginPath();
    roots.moveTo(-120, 12);
    roots.lineTo(-88, -2);
    roots.lineTo(-52, -16);
    roots.lineTo(-12, 2);
    roots.lineTo(34, 24);
    roots.lineTo(78, 22);
    roots.lineTo(128, 2);
    roots.strokePath();
    roots.lineStyle(5, 0x344030, 0.74);
    roots.beginPath();
    roots.moveTo(-86, 6);
    roots.lineTo(-38, 16);
    roots.lineTo(6, 0);
    roots.lineTo(22, -18);
    roots.strokePath();
    roots.beginPath();
    roots.moveTo(12, 8);
    roots.lineTo(48, -8);
    roots.lineTo(92, 18);
    roots.strokePath();
    roots.fillStyle(0xd7ded8, 0.16);
    roots.fillEllipse(-28, -6, 66, 13);
    roots.fillEllipse(64, 8, 70, 14);
    c.add(roots);
    return c;
  }

  private drawCanopyPathCue(): Phaser.GameObjects.Container {
    const c = this.add.container(this.scale.width / 2 + 36, 690).setDepth(-1).setAlpha(0);
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
    const c = this.add.container(this.scale.width / 2 + 96, 806).setDepth(-1).setAlpha(0);
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
      return;
    }
    this.pathCue = null;
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
    const sourceOffsetY = idx === 1 ? -34 : idx === 2 ? -76 : -18;
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

  // ─── Act 1 — Inga NPC ────────────────────────────────────────────────────

  private startIngaNPC(): void {
    this.band.setObjective("Answer Inga and follow her toward the shrine.");
    this.drawInga(560, 760);

    this.store.update((s) => {
      if (!s.almanacLore.includes("the-crossroads-ghost")) {
        s.almanacLore.push("the-crossroads-ghost");
      }
    });

    // Inga speaks
    this.setNarrator("i don't know my name.", "Inga");
    this.time.delayedCall(1800, () => {
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
          this.setNarrator(
            "the shrine knows. the shrine keeper might tell you.",
            "Inga",
          );
          this.pulseShrine();
          this.time.delayedCall(2400, () => this.startAct2());
        },
      });
      this.typingInput.register(reply);
      this.activeTargets.push(reply);
    });
  }

  // ─── Act 2 — Through the Wood ─────────────────────────────────────────────

  private startAct2(): void {
    this.setNarrator("The crossroads. Shapes drift between the trees.");
    // Schedule first mist roll during Act 2
    this.mistTimer = this.time.addEvent({
      delay: MIST_INTERVAL_MS,
      callback: this.triggerMistRoll,
      callbackScope: this,
      loop: true,
    });
    this.time.delayedCall(1200, () => this.startCrossroads1());
  }

  // Encounter 1: 3 ghosts — west, east, north. Introduces 3 of 4 directions
  // gently so the player can learn each punctuation glyph in turn.
  private startCrossroads1(): void {
    // Tier 4 — announce the relic loadout once before the realm's first combat,
    // then begin. Empty loadout (incl. revisits) passes straight through.
    this.announceCombatLoadout(() => this.beginCrossroads1());
  }

  private beginCrossroads1(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective("Use the compass marks to clear each warded word.");

    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onCrossroads1Cleared();
    this.spawnGhostsByDirection(directions, 300);
    this.time.delayedCall(200, () =>
      this.narration.say("wood_crossroads1_intro"),
    );
  }

  private onCrossroads1Cleared(): void {
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
    this.narration.say("wood_crossroads2_intro");
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective("Watch all four compass marks through the mist.");

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
        playQuietLordIntrusion(this, {
          x: this.scale.width / 2,
          y: 420,
          text: "we are all going quiet.",
        });
      });
    }
  }

  private onCrossroads2Cleared(): void {
    this.time.delayedCall(1400, () => this.startCrossroads3());
  }

  // Encounter 3: 4 ghosts with two coming from the same direction —
  // tests that the player can handle multiple of the same punctuation in
  // a row without panicking.
  private startCrossroads3(): void {
    this.setNarrator("Older things stir. They come in pairs now.");
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave();
    this.band.setObjective("Handle paired directions before the mist closes.");

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
    this.narration.say("wood_fork1_intro");
    this.band.setObjective("Choose an offering or the bone-flute.");
    this.showFork1Cues();

    const offeringTarget = this.makeWoodForkWord(this.offeringCue, {
      scene: this,
      word: "leave an offering",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 340,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "offering";
        this.startFork1Offering();
      },
    }, -42);
    const fluteTarget = this.makeWoodForkWord(this.boneFluteCue, {
      scene: this,
      word: "take the bone-flute",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 340,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "bone-flute";
        this.startFork1BoneFlute();
      },
    }, -62);
    this.typingInput.register(offeringTarget);
    this.typingInput.register(fluteTarget);
    this.activeTargets.push(offeringTarget, fluteTarget);
  }

  // ─── Fork 1A — Offering ───────────────────────────────────────────────────

  private startFork1Offering(): void {
    this.fadeOutForkCue(this.boneFluteCue);
    this.boneFluteCue = null;
    this.setNarrator("Wren steps to the bowl and speaks.");
    this.time.delayedCall(1200, () => {
      this.runPassageChain(
        [
          {
            word: "i remember you.",
            narrator: "The shrine glows. Something settles.",
          },
        ],
        () => {
          // Shrine glows — award ally + relic
          this.pulseShrine();
          this.store.update((s) => {
            if (!s.satchel.includes("shrine-token")) {
              s.satchel.push("shrine-token");
            }
          });
          playChime();
          this.cameras.main.flash(400, 200, 220, 180, false);
          this.setNarrator("Inga stirs. The shrine keeper whispers a name.");
          this.attendInga();
          this.fadeOutForkCue(this.offeringCue);
          this.offeringCue = null;
          this.time.delayedCall(2000, () => this.startIngaNameReveal());
        },
        { body: this.offeringCue, sourceOffsetY: -42 },
      );
    });
  }

  private startIngaNameReveal(): void {
    this.setNarrator("Her name. Type it back to her.");
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
        this.store.update((s) => {
          if (!s.almanacLore.includes("ingas-name")) {
            s.almanacLore.push("ingas-name");
          }
        });
        this.setNarrator("She looks at her hands. 'Oh,' she says. 'Oh.'");
        this.attendInga();
        this.time.delayedCall(2400, () => this.startAct3());
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Fork 1B — Bone-Flute ─────────────────────────────────────────────────

  private startFork1BoneFlute(): void {
    this.fadeOutForkCue(this.offeringCue);
    this.offeringCue = null;
    this.setNarrator("The bone-flute is cold inside the stone hollow.");
    this.time.delayedCall(1200, () => {
      this.runPassageChain(
        [
          { word: "reach in", narrator: "Your fingers close around it." },
          { word: "take it", narrator: "The flute is cold. It makes no sound. The ghosts grow restless." },
        ],
        () => {
          this.store.update((s) => {
            if (!s.satchel.includes("bone-flute")) {
              s.satchel.push("bone-flute");
            }
          });
          playChime();
          this.fadeOutForkCue(this.boneFluteCue);
          this.boneFluteCue = null;
          this.time.delayedCall(1600, () => this.startAct3());
        },
        { body: this.boneFluteCue, sourceOffsetY: -62 },
      );
    });
  }

  // ─── Act 3 — The Ghost-King's Hall ────────────────────────────────────────

  private startAct3(): void {
    this.narration.say("wood_ghost_king_rise");
    this.time.delayedCall(2200, () => {
      this.drawGhostKing();
      this.time.delayedCall(1200, () => this.startFork2());
    });
  }

  // ─── Fork 2 — Dialogue/Bargain ────────────────────────────────────────────

  private startFork2(): void {
    this.setNarrator(
      "The Ghost-King speaks in silence. You may bargain — or simply light the grove.",
    );
    this.attendGhostKing();
    this.band.setObjective("Choose a bargain or light the grove.");
    this.showFork2Cues();

    const bargainTarget = this.makeGhostKingWord({
      scene: this,
      word: "speak your true name",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 340,
      fontSize: 28,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "bargain";
        this.attendGhostKing();
        this.startFork2Bargain();
      },
    });
    const forceTarget = this.makeWoodForkWord(this.groveLightCue, {
      scene: this,
      word: "light the grove",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 340,
      fontSize: 28,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "force";
        // §5.5.5 Fork 2B — burn the grove → award Ash-Vial relic
        this.store.update((s) => {
          if (!s.satchel.includes("ash-vial")) s.satchel.push("ash-vial");
        });
        this.attendGhostKing();
        this.fadeOutForkCue(this.groveLightCue);
        this.groveLightCue = null;
        this.startBossFight();
      },
    }, -58);
    this.typingInput.register(bargainTarget);
    this.typingInput.register(forceTarget);
    this.activeTargets.push(bargainTarget, forceTarget);
  }

  // ─── Fork 2A — Bargain ────────────────────────────────────────────────────

  private startFork2Bargain(): void {
    this.fadeOutForkCue(this.groveLightCue);
    this.groveLightCue = null;
    this.setNarrator("The Ghost-King pauses. He turns to face you fully.");
    this.attendGhostKing();
    this.time.delayedCall(1600, () => {
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
          // Award bargain ally + relic
          this.store.update((s) => {
            if (!s.satchel.includes("ghost-kings-promise")) {
              s.satchel.push("ghost-kings-promise");
            }
          });
          playChime();
          this.attendGhostKing();
          this.time.delayedCall(1400, () => this.startBossFight());
        },
        { ghostKing: true },
      );
    });
  }

  // ─── Boss Fight — two waves ────────────────────────────────────────────────

  private startBossFight(): void {
    this.setNarrator("Then prove it.", "Ghost-King");
    this.playGhostKingStagePulse();
    this.band.setObjective("Survive the Ghost-King's warded waves.");
    this.ghosts = [];
    this.time.delayedCall(800, () => this.spawnBossWaveA());
  }

  private spawnBossWaveA(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave({ y: 650, ringWidth: 900, ringHeight: 210, count: 14 });
    // Wave A: three directions, slower spawn pace. The player should still
    // recognize the learned punctuation-direction mapping from Act 2.
    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onBossWaveACleared();
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveACleared(): void {
    this.setNarrator("The first wave fades. More rise.");
    this.attendGhostKing();
    this.time.delayedCall(1200, () => this.spawnBossWaveB());
  }

  private spawnBossWaveB(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.pulseWoodWave({ y: 650, ringWidth: 900, ringHeight: 210, count: 14 });
    this.band.setObjective("South-heavy wards rise from below.");
    // Wave B: south-heavy attack — two from below + one from above. Reads
    // as the Ghost-King's hall rising up against Wren.
    const directions: WoodDirection[] = ["south", "south", "north"];
    this.ghosts = [];
    this.onWaveCleared = () => this.onBossWaveBCleared();
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveBCleared(): void {
    this.setNarrator("The hall goes still. The Ghost-King rises fully.");
    this.attendGhostKing();
    this.time.delayedCall(2200, () => this.startBossCapstone());
  }

  // ─── Boss Phase 2 — Every-Punctuation Capstone ────────────────────────────
  //
  // The Ghost-King's last words. One passage that touches every punctuation
  // mark in the game: the four cardinal marks the realm has been teaching
  // (. , ? !) plus the two reserved (; :) that the player sees here for the
  // first time. Per §5.5.8 this is the boss's phase 2.

  private startBossCapstone(): void {
    this.band.setObjective("Type every punctuation mark in his final words.");
    this.playGhostKingStagePulse(true);
    const dimOverlay = this.add.graphics().setDepth(40).fillStyle(0x000000, 0.4);
    dimOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    dimOverlay.setAlpha(0);
    this.tweens.add({ targets: dimOverlay, alpha: 1, duration: 700 });

    this.narration.say("wood_ghost_king_phase2");
    this.attendGhostKing();
    this.time.delayedCall(1800, () => {
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
        this.setNarrator("His voice fades. The mist closes around the throne.");
        // Almanac lore page 4 — the Ghost-King's true name, stamped after
        // his every-punctuation capstone resolves.
        this.store.update((s) => {
          if (!s.almanacLore.includes("ghost-kings-true-name")) {
            s.almanacLore.push("ghost-kings-true-name");
          }
        });
        this.tweens.add({
          targets: dimOverlay,
          alpha: 0,
          duration: 700,
          onComplete: () => dimOverlay.destroy(),
        });
        this.time.delayedCall(1600, () => this.startFinalPassage());
      });
    });
  }

  // ─── Realm Seal — True-Name Passage ───────────────────────────────────────

  private startFinalPassage(): void {
    this.narration.say("wood_truename_intro");
    this.attendGhostKing();
    const passage1 = ["we", "are", "remembered.", "we", "are", "quiet."];
    const passage2 = ["but", "we", "are", "not", "silent."];

    this.runWordByWordPassage(passage1, () => {
      this.time.delayedCall(800, () => {
        this.runWordByWordPassage(passage2, () => {
          this.onFinalPassageComplete();
        });
      });
    });
  }

  /** Present words in sequence: one TextWordTarget at a time. */
  private runWordByWordPassage(words: string[], onDone: () => void): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= words.length) {
        onDone();
        return;
      }
      const word = words[idx];
      if (word === undefined) return;
      const target = this.makeGhostKingWord({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
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
          this.clearActiveTargets();
          this.time.delayedCall(160, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
  }

  private onFinalPassageComplete(): void {
    this.clearActiveTargets();
    // Ghost-King dissolves
    this.cameras.main.flash(500, 220, 230, 210, false);
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
          onDone: () => {
            this.time.delayedCall(600, () => this.startWispCatGate());
          },
        });
      } else {
        this.time.delayedCall(600, () => this.startWispCatGate());
      }
    });
  }

  // ─── Wisp-cat companion gate ──────────────────────────────────────────────

  private startWispCatGate(): void {
    if (this.fork2Choice !== "bargain") {
      // Gate not met — skip straight to ending
      this.time.delayedCall(400, () => this.startEnding());
      return;
    }

    this.setNarrator(
      "A small cat made of pale light watches from the root-throne. She flicks one ear.",
    );
    this.showWispCatCompanion();
    this.time.delayedCall(1600, () => {
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
          this.companionChoice = "call";
          this.store.update((s) => {
            if (!s.satchel.includes("wisp-cat")) {
              s.satchel.push("wisp-cat");
            }
          });
          playChime();
          this.setNarrator("She trots to you and curls against your satchel, glowing.");
          this.pulseWispCatCompanion();
          this.time.delayedCall(1800, () => this.startEnding());
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
          this.setNarrator("She watches you go. Her light stays in the clearing.");
          this.dismissWispCatCompanion(1450, 740);
          this.time.delayedCall(1800, () => this.startEnding());
        },
      });
      this.typingInput.register(callTarget);
      this.typingInput.register(leaveTarget);
      this.activeTargets.push(callTarget, leaveTarget);
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

    this.store.update((s) => {
      s.realms["haunted-wood"] = {
        cleared: true,
        choices: {
          fork1: this.fork1Choice ?? "offering",
          fork2: this.fork2Choice ?? "bargain",
          companion: this.companionChoice ?? "none",
        },
      };
    });

    this.showAlmanacStamp(() => {
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
      anchorOffsetY: -80,
      idleBobDy: 7,
      idleBobMs: 1000,
      defeatRiseY: -50,
      defeatMs: 500,
      fontSize: 32,
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
      onReachWren: () => {
        this.cameras.main.shake(180, 0.004);
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
        return { startX: restX, startY: -120, restX, restY: 340 };
      }
      case "south": {
        const restX = 800 + slot * 180;
        return {
          startX: restX,
          startY: screenH + 120,
          restX,
          restY: screenH - 100,
        };
      }
      case "east": {
        const restY = 720 + slot * 50;
        return {
          startX: screenW + 120,
          startY: restY,
          restX: 1580,
          restY,
        };
      }
      case "west": {
        const restY = 720 + slot * 50;
        return { startX: -120, startY: restY, restX: 340, restY };
      }
    }
  }

  /** Draw the four punctuation glyphs at compass points around Wren on
   *  the first ghost spawn. Idempotent — repeat calls do nothing. */
  private ensureCompassDrawn(): void {
    if (this.compassGlyphs.length > 0) return;
    const RADIUS = 140;
    const positions: Array<{ dir: WoodDirection; x: number; y: number }> = [
      { dir: "north", x: WREN_X, y: WREN_Y - RADIUS },
      { dir: "south", x: WREN_X, y: WREN_Y + RADIUS - 30 },
      { dir: "east", x: WREN_X + RADIUS, y: WREN_Y - 20 },
      { dir: "west", x: WREN_X - RADIUS, y: WREN_Y - 20 },
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
    _punctuated: boolean,
  ): void {
    // Painted wraith sprite replaces the old translucent-ellipse graphics. Scaled
    // to the procedural body height so the word anchor + hit feel line up. The
    // enemy applies restAlpha (0.6) to the whole container, keeping the ghostly
    // translucence the flat shape used to bake in.
    c.add(addLocalGroundShadow(this, 96, 20, { y: 8, alpha: 0.18 }));
    const sprite = this.add.image(0, 0, "wood-ghost");
    sprite.setScale(WOOD_GHOST_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
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
    if (onCleared) this.time.delayedCall(1000, onCleared);
  }

  // ─── Mist roll mechanic ───────────────────────────────────────────────────

  private triggerMistRoll(): void {
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
        if (!mistClears) this.setActiveGhostWordsHidden(true);
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

  private setActiveGhostWordsHidden(hidden: boolean): void {
    for (const ghost of this.ghosts) {
      if (ghost.isDefeated() || !ghost.target) continue;
      ghost.target.setHidden(hidden);
    }
  }

  // ─── Passage-chain helper ─────────────────────────────────────────────────

  private runPassageChain(
    steps: Array<{ word: string; narrator: string }>,
    onDone: () => void,
    owner?: {
      body?: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined;
      sourceOffsetY?: number;
      ghostKing?: boolean;
    },
  ): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= steps.length) {
        onDone();
        return;
      }
      const step = steps[idx];
      if (!step) return;
      const ownerWordPos =
        owner?.body?.scene && !owner.ghostKing
          ? this.ownerPassageWordPosition(owner.body, owner.sourceOffsetY)
          : null;
      const opts: TextWordTargetOptions = {
        scene: this,
        word: step.word,
        x: ownerWordPos?.x ?? this.scale.width / 2,
        y: ownerWordPos?.y ?? this.scale.height - 340,
        fontSize: 36,
        onClaim: () => playWrenFocus(this.wrenSprite),
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
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1400, advance);
        },
      };
      const target = owner?.ghostKing
        ? this.makeGhostKingWord(opts)
        : owner?.body?.scene
          ? this.makeWoodForkWord(owner.body, opts, owner.sourceOffsetY)
          : this.makeWord(opts);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
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
    const y = Math.max(330, Math.min(this.scale.height - 360, body.y + sourceOffsetY - 92));
    return { x, y };
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
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
        playActorAttention(this, body, {
          tint: PALETTE_HEX.moss,
          scale: 1.024,
          durationMs: 180,
        });
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

  private createOfferingCue(): Phaser.GameObjects.Container {
    const c = this.add.container(690, 812).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 122, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.fillStyle(0x181510, 0.88);
    g.fillEllipse(0, -24, 72, 24);
    g.fillStyle(0x4c3e2c, 0.88);
    g.fillEllipse(0, -30, 60, 18);
    g.fillStyle(0xd7ded8, 0.34);
    g.fillEllipse(0, -34, 38, 10);
    g.fillStyle(PALETTE_HEX.moss, 0.6);
    g.fillCircle(-20, -52, 6);
    g.fillCircle(0, -60, 5);
    g.fillCircle(22, -50, 6);
    g.lineStyle(2, 0xd7ded8, 0.28);
    g.strokeEllipse(0, -42, 104, 56);
    c.add(g);

    addContainerWake(this, c, {
      kind: "mist",
      intervalMs: 540,
      spreadX: 34,
      spreadY: 16,
      offsetY: -38,
      alpha: 0.2,
      size: 4,
      depth: 41,
      driftX: 30,
      driftY: -30,
      durationMs: 1400,
    });

    this.tweens.add({
      targets: c,
      y: 792,
      alpha: 0.9,
      duration: 640,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -3, durationMs: 2700 });
      },
    });
    return c;
  }

  private createBoneFluteCue(): Phaser.GameObjects.Container {
    const c = this.add.container(1230, 812).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 128, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.fillStyle(0x1c2019, 0.88);
    g.fillRoundedRect(-58, -38, 116, 34, 12);
    g.lineStyle(2, 0xd7ded8, 0.22);
    g.strokeRoundedRect(-58, -38, 116, 34, 12);
    g.lineStyle(7, 0xd7ded8, 0.8);
    g.lineBetween(-46, -60, 48, -88);
    g.lineStyle(3, 0x6f725c, 0.58);
    g.lineBetween(-46, -60, 48, -88);
    g.fillStyle(0x1f241d, 0.9);
    for (const p of [-24, 4, 30]) {
      g.fillCircle(p, -67 - (p + 24) * 0.3, 4);
    }
    g.lineStyle(2, PALETTE_HEX.moss, 0.28);
    g.strokeEllipse(0, -74, 132, 58);
    c.add(g);

    addContainerWake(this, c, {
      kind: "mist",
      intervalMs: 560,
      spreadX: 36,
      spreadY: 18,
      offsetY: -54,
      alpha: 0.18,
      size: 4,
      depth: 41,
      driftX: 32,
      driftY: -28,
      durationMs: 1350,
    });

    this.tweens.add({
      targets: c,
      y: 790,
      alpha: 0.9,
      duration: 660,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -4, durationMs: 2500 });
      },
    });
    return c;
  }

  private createGroveLightCue(): Phaser.GameObjects.Container {
    const c = this.add.container(1210, 790).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 136, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.lineStyle(4, 0x342b1e, 0.78);
    g.lineBetween(-28, -10, -28, -92);
    g.lineBetween(30, -10, 30, -88);
    g.fillStyle(0x1d160f, 0.8);
    g.fillRoundedRect(-48, -88, 96, 42, 12);
    g.lineStyle(2, PALETTE_HEX.moss, 0.34);
    g.strokeRoundedRect(-48, -88, 96, 42, 12);
    g.fillStyle(0xc9a14a, 0.5);
    g.fillEllipse(0, -66, 46, 24);
    g.fillStyle(0xf0d78a, 0.72);
    g.fillEllipse(0, -70, 18, 30);
    g.lineStyle(2, 0xf0d78a, 0.28);
    g.strokeEllipse(0, -68, 128, 72);
    c.add(g);

    addContainerWake(this, c, {
      kind: "mist",
      intervalMs: 520,
      spreadX: 34,
      spreadY: 18,
      offsetY: -58,
      alpha: 0.2,
      size: 4,
      depth: 41,
      driftX: 28,
      driftY: -36,
      durationMs: 1300,
    });

    this.tweens.add({
      targets: c,
      y: 770,
      alpha: 0.88,
      duration: 680,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -3, durationMs: 2500 });
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
      y: cue.y + (opts.riseY ?? 18),
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
    for (const cue of [this.offeringCue, this.boneFluteCue, this.groveLightCue]) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
    this.offeringCue = null;
    this.boneFluteCue = null;
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
    if (speakerName === "Inga") {
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
    } else if (speakerName === "Inga") {
      this.band.setPortrait("wood-ghost", "Inga");
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
    playActorAttention(this, this.shrineFigure, {
      scale: 1.018,
      durationMs: 280,
    });
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
    if (effect === "toll-strike") {
      const t = targets[0];
      if (!t || t.isDefeated()) return;
      playBellToll();
      playWordCompleteBurst(this, t.container.x, t.restY - 80, {
        color: PALETTE_HEX.ember,
        count: 16,
        radius: 60,
      });
      this.cameras.main.shake(160, 0.004);
      t.defeat();
    } else if (effect === "jam-foe") {
      const t = targets[0];
      if (!t || t.isDefeated()) return;
      playSparkZap();
      t.freeze();
    } else if (effect === "bind-beat") {
      playWaveSting();
      this.cameras.main.shake(220, 0.004);
      for (const g of targets) {
        if (!g.isDefeated()) g.freeze(BIND_BEAT_FREEZE_MS);
      }
    }
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
    this.time.delayedCall(COMPANION_TRIP_DELAY_MS, () =>
      tripMostAdvancedFoe(this, this.ghosts),
    );
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
  }

  /** Gentle "forgiven" cue when forgive-wave-miss spares a slip — distinct from
   *  the harsh miss flinch. */
  private flashForgiven(): void {
    const txt = this.add
      .text(WREN_X, WREN_Y - 120, "forgiven", {
        fontFamily: SERIF,
        fontSize: "24px",
        fontStyle: "italic",
        color: PALETTE.brass,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0.9);
    this.tweens.add({
      targets: txt,
      alpha: 0,
      y: txt.y - 36,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => txt.destroy(),
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
    const c = this.add.container(sx, sy).setDepth(-1);
    this.shrineFigure = c;

    c.add(addLocalGroundShadow(this, 150, 18, { y: 14, alpha: 0.18 }));

    const glow = this.add.graphics().setPosition(0, -78);
    glow.fillStyle(0xe8e5c6, 0.14);
    glow.fillEllipse(0, 0, 92, 56);
    glow.fillStyle(0xa7d8a2, 0.09);
    glow.fillEllipse(0, 14, 138, 44);
    c.add(glow);

    const stone = this.add.graphics();
    stone.fillStyle(0x171f18, 0.36);
    stone.fillRoundedRect(-72, -4, 144, 18, 6);
    stone.fillStyle(0x263028, 1);
    stone.fillRoundedRect(-44, -58, 88, 58, 6);
    stone.fillStyle(0x303a31, 1);
    stone.fillRoundedRect(-56, -68, 112, 14, 5);
    stone.fillStyle(0x202820, 1);
    stone.fillRoundedRect(-60, 0, 120, 12, 5);
    stone.fillStyle(0x495248, 0.8);
    stone.fillRoundedRect(-38, -54, 32, 12, 4);
    stone.fillRoundedRect(8, -50, 28, 14, 4);
    stone.fillStyle(0x394238, 0.86);
    stone.fillRoundedRect(-30, -34, 60, 20, 5);
    stone.lineStyle(2, 0x6f725c, 0.22);
    stone.lineBetween(-26, -54, -38, -8);
    stone.lineBetween(18, -50, 34, -12);
    stone.lineBetween(-56, -68, 56, -68);
    c.add(stone);

    const bowl = this.add.graphics().setPosition(0, -70);
    bowl.fillStyle(0x181510, 0.9);
    bowl.fillEllipse(0, 9, 56, 18);
    bowl.fillStyle(0x4c3e2c, 0.9);
    bowl.fillEllipse(0, 4, 46, 14);
    bowl.fillStyle(0xeec870, 0.26);
    bowl.fillEllipse(0, 2, 30, 8);
    c.add(bowl);

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
    addIdleBreath(this, c, { dy: -2, durationMs: 4200 });
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
    // Lantern post
    g.lineStyle(2, 0x3a3630, 0.85);
    g.beginPath();
    g.moveTo(30, -60);
    g.lineTo(30, 40);
    g.strokePath();
    // Lantern box
    g.lineStyle(1, 0xc9a14a, 0.7);
    g.strokeRect(22, -76, 16, 18);
    g.fillStyle(0xc9a14a, 0.3);
    g.fillRect(22, -76, 16, 18);
    c.add(g);
    this.ingaFigure = c;
    stageContainerEntrance(this, c, {
      entranceMs: 680,
      breathDy: -3,
      breathMs: 2600,
    });
  }

  private drawGhostKing(): void {
    const gkx = 1400;
    const gky = 560;

    // Root throne — kept as graphics (the painted sprite is just the king).
    const throne = this.add.graphics();
    throne.setAlpha(0);
    throne.fillStyle(0x1e1208, 1);
    for (const rx of [-80, -50, -20, 20, 50, 80]) {
      const rh = 60 + Math.abs(rx) * 0.4;
      throne.fillRect(gkx + rx - 6, gky + 180, 12, rh);
    }
    // Throne seat slab
    throne.fillStyle(0x282018, 1);
    throne.fillRect(gkx - 100, gky + 170, 200, 20);

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
      targets: [throne, sprite],
      alpha: 1,
      duration: 1200,
      ease: "Sine.easeIn",
      onComplete: () => {
        addIdleBreath(this, sprite, { dy: -4, durationMs: 2600 });
        this.playGhostKingStagePulse();
      },
    });
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
