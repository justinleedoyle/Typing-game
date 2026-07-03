import Phaser from "phaser";
import { type AmbientHandle, playAmbientBell } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { flashDamageVignette } from "../game/vfx";
import { BeatClock } from "../game/beatClock";
import { decideBeatGate } from "../game/beatGate";
import { BreathMeter } from "../game/breathMeter";
import { HeartSoulHud } from "../game/heartSoulHud";
import { NarrationManager } from "../game/narrationManager";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import {
  type CombatLoadout,
  COMPANION_TRIP_DELAY_MS,
  resolveCombatLoadout,
} from "../game/relicEffects";
import { tripMostAdvancedFoe } from "../game/companionTrip";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { MovingWordEnemy } from "../game/movingWordEnemy";
import {
  addAmbientDrift,
  addBackdropDrift,
  addContainerWake,
  dismissCompanionCameo,
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  attachWordBodyAnchor,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playActorAttention,
  playMeterPulse,
  playRealmClearResonance,
  playSceneEventPulse,
  stageContainerEntrance,
  stageAnchoredSprite,
  stageCompanionCameo,
  stageTrueNameSeal,
  dismissTrueNameSeal,
  dismissStagedCue,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import { pickAdaptiveWords, SUNKEN_BELL_WORD_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
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
import runaPortrait from "../../art/runa/runa-front.png";
import sunkenBellBackdrop from "../../art/references/sunken-bell-clean.png";
import bellGhostSprite from "../../art/bell/ghost.png";
import bellWardenSprite from "../../art/bell/bell-warden.png";
import olinSprite from "../../art/bell/olin.png";
import aurlandSprite from "../../art/bell/aurland.png";
import glassFishSprite from "../../art/companions/glass-fish.png";

// Danger ramps in over the LAST 60% of a ghost's advance — earlier portion
// stays cream so players can read the word, then it shifts red as the ghost
// closes. Mirrors Winter Mountain.
const DANGER_RAMP_START = 0.4;

// Sea-green burst on ghost defeats — matches the Bell-Warden's open-eye
// hue used elsewhere in the scene. Reads as "ghost dissolves in deep water"
// rather than the default brass.
const BELL_BURST_COLOR = 0x4ab8d6;

interface SunkenBellSceneData {
  store: SaveStore;
  revisit?: boolean;
}

interface DescentLantern {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  flame: Phaser.GameObjects.Graphics;
}

// Choir ghosts are now the shared MovingWordEnemy. The splitting ghost is the
// canonical use of the enemy's declarative `split` capability (ebb/drift children).

const GHOST_KNOCKBACK_PAUSE_MS = 2000;
const WREN_X = 960;
const WREN_Y = 820;

// Painted-sprite display heights (px), matching the old procedural body heights
// so the word anchor + hit feel line up. The ghost body spanned ~90px (oval +
// wispy tail); the Warden spanned ~320px (bell knob down through the rim). The
// Warden is drawn at absolute coords (not in a scaled container), so its height
// is used directly. Tune on live.
const GHOST_SPRITE_HEIGHT = 96;
const WARDEN_SPRITE_HEIGHT = 320;

// Painted NPC display heights (px). Olin is a small hunched figure — the old
// procedural body (head ~742px down to staff foot ~870px) spanned ~130px, so
// ~180px reads as a slightly-larger painted figure on the same pew. King
// Aurland is a tall, freed-king beat — drawn larger and standing. Tune on live.
const OLIN_SPRITE_HEIGHT = 180;
const AURLAND_SPRITE_HEIGHT = 360;

// The Warden's painted sprite sits at the same anchor the procedural bell used
// (trapezoid centred at bx, vertical mid-point ~by+110). Keep these in sync with
// the values the procedural drawWarden baked in.
const WARDEN_X = 1400;
const WARDEN_Y = 610;

export class SunkenBellScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private band!: ConsoleBand;
  private ghosts: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  private bossWordAnchors: WordBodyAnchorHandle[] = [];
  private olinWordAnchors: WordBodyAnchorHandle[] = [];
  private aurlandWordAnchors: WordBodyAnchorHandle[] = [];
  private glassFishWordAnchors: WordBodyAnchorHandle[] = [];
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private descentLanternWordAnchors: WordBodyAnchorHandle[] = [];
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  /** King Aurland's painted sprite — fades in when he's freed at fork 2 and is
   *  faded/destroyed when the realm moves past the fork (or on shutdown). */
  private aurlandImage?: Phaser.GameObjects.Image;
  /** Old Olin's painted sprite during the Act 1 teaching beat. */
  private olinImage?: Phaser.GameObjects.Image;
  private glassFishCompanion: Phaser.GameObjects.Container | null = null;
  private doorChantCue: Phaser.GameObjects.Container | null = null;
  private doorForceCue: Phaser.GameObjects.Container | null = null;
  private aurlandFateCue: Phaser.GameObjects.Container | null = null;
  private bellTongueCue: Phaser.GameObjects.Container | null = null;

  private beatClock!: BeatClock;
  private beatRing!: Phaser.GameObjects.Graphics;
  private offbeatRing!: Phaser.GameObjects.Graphics;

  // Rhythm-gate state (Tier 1 — make the Bell's rhythm demanding):
  //  - beatPhase "off" flips the accept window to the half-beat for the
  //    antiphon (call-and-response) wave.
  //  - beatLocked turns on mid-word de-sync (hyphen boundaries must land on
  //    the beat) for the Warden's Phase 2.
  private beatPhase: "on" | "off" = "on";
  private beatLocked = false;

  // "Air" stake — staying in rhythm lets Wren breathe; off-beat / de-sync
  // stumbles cost air; empty = a non-terminal gasp knockback. Active only in
  // the choir-wave combat.
  private breath = new BreathMeter();
  private breathActive = false;
  private breathBar!: Phaser.GameObjects.Graphics;
  private breathLabel!: Phaser.GameObjects.Text;
  /** Screen anchor where the air gauge docks inside the console band's satchel
   *  zone (set in create() from band.satchelAnchor) — like Winter's candles. */
  private breathAnchor = { x: 0, y: 0 };
  private drawnBreathFraction: number | null = null;

  // Tier 4 — relics earned in EARLIER realms shape this realm's combat. The
  // bounded loadout is resolved once in create() (neutral on a revisit); the
  // hooks below read it. `graceSaves` is the per-realm grace pool (defensive
  // relics); `waveForgivenessReady` is the per-wave forgive-a-slip proc.
  private combat: CombatLoadout = resolveCombatLoadout([], "sunken-bell");
  private graceSaves = 0;
  private waveForgivenessReady = false;

  /** Explicit per-wave continuation, set by each spawner. Replaces the old
   *  narrator-substring routing (which had soft-locked the first encounter,
   *  same class of bug as the Haunted Wood fix #89). */
  private onWaveCleared: (() => void) | null = null;

  private fork1Choice: "chant" | "force" | null = null;
  private fork2Choice: "free-aurland" | "claim-tongue" | null = null;
  /** True after the Quiet Lord's §5.5.10 intrusion has fired this playthrough. */
  private quietLordIntruded = false;

  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("SunkenBellScene");
  }

  init(data: SunkenBellSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.ghosts = [];
    this.activeTargets = [];
    this.bossWordAnchors = [];
    this.olinWordAnchors = [];
    this.aurlandWordAnchors = [];
    this.glassFishWordAnchors = [];
    this.forkChoiceWordAnchors = [];
    this.descentLanternWordAnchors = [];
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.beatPhase = "on";
    this.beatLocked = false;
    this.breath.reset();
    this.breathActive = false;
    this.onWaveCleared = null;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.glassFishCompanion = null;
    this.doorChantCue = null;
    this.doorForceCue = null;
    this.aurlandFateCue = null;
    this.bellTongueCue = null;
    this.quietLordIntruded =
      this.store.get().realms["sunken-bell"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("sunken-bell-backdrop", sunkenBellBackdrop);
    this.load.image("bell-ghost", bellGhostSprite);
    this.load.image("bell-warden", bellWardenSprite);
    this.load.image("olin", olinSprite);
    this.load.image("aurland", aurlandSprite);
    this.load.image("bell-companion-glass-fish", glassFishSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 8, 24, 32);
    const backdrop = this.add
      .image(0, 0, "sunken-bell-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 19000, driftX: -3, driftY: -5 });
    addAmbientDrift(this, {
      kind: "bubble",
      count: 42,
      depth: -2,
      area: { x: 80, y: 80, width: this.scale.width - 160, height: 740 },
      alpha: 0.28,
      minSize: 2,
      maxSize: 7,
      driftX: 34,
      driftY: -360,
      minDurationMs: 6500,
      maxDurationMs: 13000,
    });
    addLivingLight(this, {
      x: 410,
      y: 650,
      width: 360,
      height: 250,
      color: 0x4ab8d6,
      alpha: 0.045,
      depth: -5,
      durationMs: 3300,
    });
    addLivingLight(this, {
      x: 1000,
      y: 540,
      width: 560,
      height: 280,
      color: 0x77d6c9,
      alpha: 0.04,
      depth: -5,
      durationMs: 3900,
      delayMs: 700,
      scale: 1.04,
    });
    addLivingLight(this, {
      x: 1515,
      y: 740,
      width: 300,
      height: 210,
      color: 0x9fe4ff,
      alpha: 0.045,
      depth: -5,
      durationMs: 3000,
      delayMs: 1200,
    });
    addAmbientDrift(this, {
      kind: "bubble",
      count: 14,
      depth: -1.45,
      area: { x: 120, y: 300, width: this.scale.width - 240, height: 500 },
      alpha: 0.18,
      minSize: 6,
      maxSize: 14,
      driftX: 46,
      driftY: -280,
      minDurationMs: 5600,
      maxDurationMs: 11800,
    });
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);
    playSceneEventPulse(this, {
      kind: "bubble",
      color: BELL_BURST_COLOR,
      x: this.wrenContainer.x,
      y: this.wrenContainer.y - 86,
      depth: -0.25,
      durationMs: 760,
      ringWidth: 250,
      ringHeight: 92,
      count: 8,
      alpha: 0.1,
      spreadX: 112,
      spreadY: 36,
    });

    this.typingInput = new TypingInputController(this.store);

    // Tier 4 — resolve the in-realm relic loadout. A revisit is a free-passage
    // replay (no combat), so it gets the neutral (empty-satchel) loadout.
    // Resolved before the band so its passive relics can show as icon tiles.
    this.combat = resolveCombatLoadout(
      this.revisit ? [] : this.store.get().satchel,
      "sunken-bell",
    );
    this.graceSaves = this.combat.gracePool;

    // UI cohesion — the console band houses the meters + the Bell's "air" stake.
    // The breath meter is a bespoke bottom gauge, so it docks into the band's
    // satchel zone (satchelLabel:"" — like Winter's candles); the passive relics
    // earned in earlier realms still surface as icon tiles in that zone.
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
      satchelLabel: "",
    });
    const band = this.band;

    this.narration = new NarrationManager(this, {
      y: 120,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });
    // Bell is "quiet listening" — softer per-keystroke feedback than the
    // Winter Mountain default. 120ms / 0.002 shake instead of 80ms / 0.002.
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(120, 0.002);
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

    // Beat ring — bottom-center sonar pulse that emanates outward on each
    // bell toll. Bright + tight on the beat, fades + expands across the
    // claim window, then disappears until the next toll. Player sees this
    // and learns "type now" without anyone having to say it.
    // Lifted to clear the console band (bottom 220px): the toll-rings are the
    // realm's "type now" affordance, so they sit just above the band's top edge
    // instead of behind its opaque wood (was y=960, inside the band footprint).
    const ringY = this.scale.height - 290;
    this.beatRing = this.add.graphics().setDepth(10).setAlpha(0);
    this.beatRing.x = WREN_X;
    this.beatRing.y = ringY;
    // Off-beat ("antiphon") ring — ember, pulses at the half-beat during the
    // call-and-response wave so the off-beat answer window is visible.
    this.offbeatRing = this.add.graphics().setDepth(10).setAlpha(0);
    this.offbeatRing.x = WREN_X;
    this.offbeatRing.y = ringY;

    // Air gauge — docked into the console band's satchel zone (the bespoke
    // bottom meter, like Winter's candles), offset right of the passive relic
    // tiles. Hidden until choir-wave combat begins. Depth > the band surface.
    this.breathAnchor = { x: band.satchelAnchor.x + 330, y: band.satchelAnchor.y };
    this.breathBar = this.add.graphics().setDepth(1500).setAlpha(0);
    this.breathLabel = this.add
      .text(this.breathAnchor.x, this.breathAnchor.y - 38, "air", {
        fontFamily: SERIF,
        fontSize: "15px",
        fontStyle: "italic",
        color: "#a59b89",
      })
      .setOrigin(0.5)
      .setDepth(1500)
      .setAlpha(0);

    this.beatClock = new BeatClock(this, {
      tempoMs: 2000,
      onBeat: () => this.onBeatTick(),
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.beatClock.stop();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
      this.clearBellForkCues();
      this.clearAurlandWordAnchors();
      this.dismissRevisitMemoryCue(false);
      this.olinImage?.destroy();
      this.olinImage = undefined;
      this.aurlandImage?.destroy();
      this.aurlandImage = undefined;
    });

    this.ambientHandle = playAmbientBell();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.startArrival();
  }

  // ─── Revisit mode ────────────────────────────────────────────────────────

  private startRevisit(): void {
    // Revisit mode: don't start the BeatClock at all — isInWindow() returns
    // true when the clock isn't running, so input flows freely.

    const choices = this.store.get().realms["sunken-bell"]?.choices ?? {};
    let narratorLine: string;
    let words: string[];

    if (choices["fork2"] === "free-aurland") {
      narratorLine = "The water is clearer. King Aurland sent word.";
      words = ["the", "deep", "is", "listening"];
    } else if (choices["fork2"] === "claim-tongue") {
      narratorLine = "The bell is silent. The tide has gone out further than it used to.";
      words = ["silence", "holds", "its", "shape"];
    } else {
      narratorLine = "The tide is different now. You can hear it thinking.";
      words = ["the", "bell", "remembers", "still"];
    }

    this.setNarrator(narratorLine);
    this.band.setObjective("Type the bell memory to return to the Almanac.");
    this.time.delayedCall(2400, () => this.deliverRevisitPassage(words));
  }

  private deliverRevisitPassage(words: string[]): void {
    let idx = 0;
    const advance = (): void => {
      if (idx >= words.length) {
        this.time.delayedCall(800, () => {
          this.cameras.main.fadeOut(700, 8, 24, 32);
          this.cameras.main.once(
            Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
            () => this.scene.start("PortalChamberScene", {
              store: this.store,
              arrival: "sunken-bell",
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
    const cue = this.add.container(pos.x, pos.y).setDepth(-1).setAlpha(0);
    this.revisitMemoryCue = cue;

    cue.add(addLocalGroundShadow(this, 126, 18, { y: 11, alpha: 0.16 }));

    const echo = this.add.graphics();
    echo.fillStyle(BELL_BURST_COLOR, 0.1);
    echo.fillEllipse(0, 0, 120, 38);
    echo.lineStyle(2, BELL_BURST_COLOR, 0.32);
    echo.strokeEllipse(0, 0, 106, 30);
    echo.lineStyle(1.5, 0xd7fbff, 0.36);
    echo.beginPath();
    echo.arc(0, -7, 26, Math.PI * 0.1, Math.PI * 0.9);
    echo.strokePath();
    echo.lineStyle(1, 0xd7fbff, 0.32);
    echo.lineBetween(-26, -7, -20, 13);
    echo.lineBetween(26, -7, 20, 13);
    echo.lineBetween(-20, 13, 20, 13);
    echo.fillStyle(0xd7fbff, 0.42);
    echo.fillCircle(0, 16, 3.4);
    echo.fillCircle(-40, 1, 2.6);
    echo.fillCircle(40, 1, 2.6);
    cue.add(echo);

    this.tweens.add({
      targets: cue,
      alpha: 0.8,
      y: pos.y - 5,
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, cue, { dy: -2, durationMs: 2700 }),
    });
  }

  private revisitMemoryCuePosition(idx: number, total: number): { x: number; y: number } {
    const spacing = total <= 4 ? 190 : 165;
    const startX = this.scale.width / 2 - ((total - 1) * spacing) / 2;
    return {
      x: startX + idx * spacing,
      y: idx % 2 === 0 ? 800 : 760,
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
        color: BELL_BURST_COLOR,
        alpha: 0.12,
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
      kind: "mote",
      color: BELL_BURST_COLOR,
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

  // ─── Beat mechanic ────────────────────────────────────────────────────────

  /** Fired on every toll. Pulses the on-beat ring, and — during an antiphon
   *  (off-beat) wave — schedules the half-beat counter-pulse so the player can
   *  see the gap they must answer in. */
  private onBeatTick(): void {
    this.pulseBeatRing();
    if (this.beatPhase === "off") {
      this.time.delayedCall(this.beatClock.getTempo() / 2, () => {
        if (this.beatPhase === "off") this.pulseOffbeatRing();
      });
    }
  }

  /** Visible "type now" pulse — bright ring at the moment of the toll,
   *  expanding and fading across the claim window so the player sees
   *  exactly when their input is welcome. */
  private pulseBeatRing(): void {
    const ring = this.beatRing;
    ring.clear();
    ring.lineStyle(4, PALETTE_HEX.frost, 1);
    ring.strokeCircle(0, 0, 32);
    ring.setAlpha(1).setScale(1);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.8,
      duration: 600,
      ease: "Sine.easeOut",
    });
    // Tier 4 — warm-light (Firefly Lantern / Beacon Spark / Pelt) shortens the
    // per-toll echo-dim so words stay readable a little longer. Bounded to ≤33%,
    // so the dim never disappears (it stays a real read-ahead hazard).
    this.cameras.main.flash(300 * (1 - this.combat.warmLight), 0, 0, 0, false);
  }

  /** Half-beat "answer now" pulse for the antiphon wave — ember, so it reads
   *  as the response to the frost toll-ring rather than the toll itself. */
  private pulseOffbeatRing(): void {
    const ring = this.offbeatRing;
    ring.clear();
    ring.lineStyle(3, PALETTE_HEX.ember, 1);
    ring.strokeCircle(0, 0, 26);
    ring.setAlpha(0.9).setScale(1);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.6,
      duration: 480,
      ease: "Sine.easeOut",
    });
  }

  /** Turn the air stake on/off for an encounter. Resets to full when enabled;
   *  hides the gauge when disabled. */
  private setBreathActive(active: boolean): void {
    this.breathActive = active;
    if (active) this.breath.reset();
    this.drawBreathBar();
  }

  /** Redraw the air gauge in the console band's satchel zone from the current
   *  breath fraction. Frost when full, ember when low. Hidden entirely when the
   *  stake is inactive. Drawn around breathAnchor (docked like Winter's candles). */
  private drawBreathBar(): void {
    const bar = this.breathBar;
    bar.clear();
    if (!this.breathActive) {
      bar.setAlpha(0);
      this.breathLabel.setAlpha(0);
      this.drawnBreathFraction = null;
      return;
    }
    bar.setAlpha(1);
    this.breathLabel.setAlpha(0.8);
    const w = 160;
    const h = 14;
    const x = this.breathAnchor.x - w / 2;
    const y = this.breathAnchor.y - h / 2;
    const frac = this.breath.getFraction();
    const low = frac < 0.4;
    bar.lineStyle(2, PALETTE_HEX.frost, 0.7);
    bar.strokeRoundedRect(x, y, w, h, 4);
    bar.fillStyle(low ? PALETTE_HEX.ember : PALETTE_HEX.frost, low ? 0.95 : 0.8);
    bar.fillRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), h - 2, 3);
    if (
      this.drawnBreathFraction !== null &&
      Math.abs(this.drawnBreathFraction - frac) > 0.001
    ) {
      playMeterPulse(this, {
        x: this.breathAnchor.x,
        y: this.breathAnchor.y,
        width: w + 14,
        height: h + 12,
        color: low ? PALETTE_HEX.ember : PALETTE_HEX.frost,
      });
    }
    this.drawnBreathFraction = frac;
  }

  /** Out of air — a non-terminal shove (the Bell has no candle/game-over
   *  economy). Dark flash + thud, then a partial breath back. The lost tempo
   *  and the broken combo are the real cost. */
  private gaspKnockback(): void {
    // Tier 4 — a defensive relic (Lock-Bar / Golem Heart / Cairn-Token) catches
    // the gasp: air back to the floor with a soft cue, no thud/knockback. Drawn
    // from the per-realm grace pool (cap 2) — a finite cushion, not immunity.
    if (this.spendGraceSave()) {
      this.breath.gasp();
      this.drawBreathBar();
      this.flashGraceCue("held");
      return;
    }
    this.cameras.main.flash(280, 0, 0, 0, false);
    playWrenHurt(this.wrenSprite, { knockX: 0 });
    playDamageThud();
    flashDamageVignette(this);
    this.breath.gasp();
    this.drawBreathBar();
  }

  /** Spend one grace-pool save (a defensive relic). Returns true if one was
   *  available and consumed. */
  private spendGraceSave(): boolean {
    if (this.graceSaves <= 0) return false;
    this.graceSaves -= 1;
    return true;
  }

  /** Gentle frost shimmer + a one-word caption when a relic spares Wren — the
   *  legible "your relic just did something" beat, distinct from the harsh
   *  damage cue. */
  private flashGraceCue(label: "held" | "forgiven"): void {
    this.cameras.main.flash(160, 120, 170, 200, false);
    const txt = this.add
      .text(WREN_X, WREN_Y - 70, label, {
        fontFamily: SERIF,
        fontSize: "24px",
        fontStyle: "italic",
        color: PALETTE.frost,
      })
      .setOrigin(0.5)
      .setDepth(20)
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

  /** Reset the per-wave relic procs at the start of each combat wave. */
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

  /** auto-ease (Etta's Ledger): mark the easiest (shortest-word) ghost of the
   *  wave with a soft glow so the player knows where to start — a small edge,
   *  not a free kill. No-op without the relic or with no ghosts. */
  private applyAutoEase(): void {
    if (!this.combat.perWaveProcs.includes("auto-ease")) return;
    if (this.ghosts.length === 0) return;
    let easiest = this.ghosts[0]!;
    for (const g of this.ghosts) {
      if (g.word.length < easiest.word.length) easiest = g;
    }
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE_HEX.brass, 0.22);
    glow.fillEllipse(0, 0, 96, 116);
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

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode from inside the realm.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }

    const key = event.key;
    // Backspace / Escape always flow through — reverse or abort, never gated.
    if (key === "Backspace" || key === "Escape") {
      this.typingInput.handleChar(key);
      return;
    }
    // Ignore bare modifiers / navigation keys (Shift on its own, arrows, etc.)
    // so holding Shift for the caseSensitive OPEN isn't punished as off-beat.
    const printable = key.length === 1 || key === " ";
    if (!printable) return;

    playClack();

    // Resolve this encounter's accept window — on-beat normally, or the
    // half-beat during an antiphon (off-beat) wave.
    const inWindow =
      this.beatPhase === "off"
        ? this.beatClock.isInOffbeatWindow()
        : this.beatClock.isInWindow();

    const decision = decideBeatGate({
      hasClaim: this.typingInput.hasClaim(),
      inWindow,
      nextChar: this.typingInput.peekClaimedNext(),
      metered: this.beatLocked,
    });

    if (decision === "accept") {
      this.typingInput.handleChar(key);
      return;
    }

    // reject-newclaim (off-beat new claim) or desync (off-beat metered
    // boundary). Both teach timing; de-sync also wipes the metered word.
    this.registerStumble(decision === "desync");
  }

  /** Off-beat / de-sync penalty: Wren flinches, the camera shakes, the combo
   *  breaks (Heart drops), and — when the air stake is live — breath drains
   *  toward a gasp. A de-sync additionally wipes the claimed word's progress. */
  private registerStumble(isDesync: boolean): void {
    // Tier 4 — forgive-wave-miss (Shrine-Token): the first slip of each wave
    // costs no air and draws a gentle "forgiven" cue instead of a flinch. The
    // broken combo and the de-sync rhythm correction still stand — the relic
    // spares your breath, not the lesson.
    if (this.waveForgivenessReady) {
      this.waveForgivenessReady = false;
      this.typingInput.getStats().record(false);
      if (isDesync) this.typingInput.resetClaimedProgress();
      this.flashGraceCue("forgiven");
      return;
    }
    flashWrenMiss(this.wrenSprite);
    this.cameras.main.shake(80, 0.0025);
    this.typingInput.getStats().record(false);
    if (isDesync) this.typingInput.resetClaimedProgress();
    if (this.breathActive) {
      const emptied = this.breath.stumble();
      this.drawBreathBar();
      if (emptied) this.gaspKnockback();
    }
  }

  // ─── Act 1: Arrival ───────────────────────────────────────────────────────

  private startArrival(): void {
    // Act 1 pre-beat: input flows freely until Olin teaches the bell's rhythm.
    // BeatClock stays not-running here; gating engages only once start() is
    // called at the end of Olin's exchange.
    this.narration.say("sunken_intro_arrival");
    this.band.setObjective("Light the descent lanterns before the bell teaches its rhythm.");
    this.time.delayedCall(2500, () => this.startDescent());
  }

  // ─── Act 1: The Descent (lanterns) ────────────────────────────────────────

  private startDescent(): void {
    const lanternWords = ["swim", "glow", "breathe"];
    const lanternPositions = [
      { x: 400, y: 600 },
      { x: 960, y: 680 },
      { x: 1520, y: 600 },
    ];

    let lit = 0;

    lanternWords.forEach((word, i) => {
      const pos = lanternPositions[i];
      if (!pos) return;

      const lantern = this.drawDescentLantern(pos.x, pos.y, i);
      let lanternAnchor: WordBodyAnchorHandle | null = null;
      const releaseLanternAnchor = (): void => {
        if (!lanternAnchor) return;
        this.releaseDescentLanternWordAnchor(lanternAnchor);
        lanternAnchor = null;
      };

      const target = this.makeWord({
        scene: this,
        word,
        x: pos.x,
        y: pos.y - 60,
        fontSize: 36,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          this.pulseDescentLantern(lantern, false);
        },
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          releaseLanternAnchor();
          this.lightDescentLantern(lantern);
          lit += 1;
          if (lit >= lanternWords.length) {
            this.time.delayedCall(800, () => this.startOlinNPC());
          }
        },
      });
      lanternAnchor = this.attachDescentLanternWordAnchor(lantern, target);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  private drawDescentLantern(x: number, y: number, index: number): DescentLantern {
    const container = this.add.container(x, y).setDepth(-1).setAlpha(0);

    const tether = this.add.graphics();
    tether.lineStyle(1.5, 0x7daebc, 0.32);
    tether.lineBetween(0, -92, 0, -36);
    tether.lineStyle(1, 0xf3ead2, 0.22);
    tether.lineBetween(-18, -34, 18, -34);
    container.add(tether);

    const glow = this.add.graphics().setAlpha(0.58);
    glow.fillStyle(0x74d5df, 0.08);
    glow.fillEllipse(0, 4, 106, 118);
    glow.lineStyle(2, 0x74d5df, 0.13);
    glow.strokeEllipse(0, 4, 88, 102);
    container.add(glow);

    const body = this.add.graphics();
    body.fillStyle(0x203a46, 0.86);
    body.fillRoundedRect(-22, -30, 44, 64, 17);
    body.lineStyle(2, 0xf3ead2, 0.54);
    body.strokeRoundedRect(-22, -30, 44, 64, 17);
    body.lineStyle(1, 0x7daebc, 0.48);
    body.lineBetween(-12, -20, -12, 24);
    body.lineBetween(12, -20, 12, 24);
    container.add(body);

    const flame = this.add.graphics().setAlpha(0.72);
    flame.fillStyle(0xc9a14a, 0.45);
    flame.fillEllipse(0, 4, 24, 36);
    flame.fillStyle(0xf3ead2, 0.72);
    flame.fillEllipse(0, 2, 10, 20);
    container.add(flame);

    for (let bubbleIdx = 0; bubbleIdx < 3; bubbleIdx += 1) {
      const bubble = this.add
        .graphics()
        .setPosition(-22 + bubbleIdx * 22, 38 + bubbleIdx * 4)
        .setAlpha(0.38);
      bubble.lineStyle(1, 0xaed8df, 0.55);
      bubble.strokeCircle(0, 0, 4 + bubbleIdx);
      container.add(bubble);
      this.tweens.add({
        targets: bubble,
        y: bubble.y - 48,
        alpha: 0,
        duration: 1800 + bubbleIdx * 320,
        delay: index * 260 + bubbleIdx * 360,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.tweens.add({
      targets: container,
      alpha: 0.84,
      y: y - 8,
      duration: 420,
      delay: index * 120,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, container, {
        dy: -4,
        durationMs: 2600 + index * 220,
      }),
    });
    this.tweens.add({
      targets: [glow, flame],
      scaleX: 1.08,
      scaleY: 1.14,
      alpha: 0.9,
      duration: 900 + index * 120,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    return { container, glow, body, flame };
  }

  private lightDescentLantern(lantern: DescentLantern): void {
    this.tweens.killTweensOf([lantern.glow, lantern.flame]);
    lantern.body.clear();
    lantern.body.fillStyle(0x274a52, 0.95);
    lantern.body.fillRoundedRect(-22, -30, 44, 64, 17);
    lantern.body.lineStyle(2, 0xf3ead2, 0.86);
    lantern.body.strokeRoundedRect(-22, -30, 44, 64, 17);
    lantern.body.lineStyle(1, 0x9fdce7, 0.72);
    lantern.body.lineBetween(-12, -20, -12, 24);
    lantern.body.lineBetween(12, -20, 12, 24);
    lantern.glow.setAlpha(0.9).setScale(1.16);
    lantern.flame.setAlpha(1).setScale(1.18, 1.28);
    this.pulseDescentLantern(lantern, true);
  }

  private pulseDescentLantern(
    lantern: DescentLantern,
    completion: boolean,
  ): void {
    playActorAttention(this, lantern.container, {
      scale: completion ? 1.035 : 1.018,
      durationMs: completion ? 260 : 180,
    });
    playBodyImpact(this, lantern.container, {
      kind: "bubble",
      color: BELL_BURST_COLOR,
      offsetY: 2,
      depth: 12,
      ringRadius: completion ? 42 : 28,
      count: completion ? 9 : 5,
      durationMs: completion ? 460 : 260,
    });
  }

  private attachDescentLanternWordAnchor(
    lantern: DescentLantern,
    target: TextWordTarget,
  ): WordBodyAnchorHandle {
    const anchor = attachWordBodyAnchor(
      this,
      lantern.container,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: BELL_BURST_COLOR,
        alpha: 0.14,
        depth: 7,
        sourceOffsetY: -22,
        targetOffsetY: 24,
      },
    );
    this.descentLanternWordAnchors.push(anchor);
    return anchor;
  }

  private releaseDescentLanternWordAnchor(anchor: WordBodyAnchorHandle): void {
    anchor.destroy();
    const idx = this.descentLanternWordAnchors.indexOf(anchor);
    if (idx >= 0) this.descentLanternWordAnchors.splice(idx, 1);
  }

  private clearDescentLanternWordAnchors(): void {
    for (const anchor of this.descentLanternWordAnchors) anchor.destroy();
    this.descentLanternWordAnchors = [];
  }

  // ─── Act 1: Old Olin NPC ──────────────────────────────────────────────────

  private startOlinNPC(): void {
    this.clearActiveTargets();
    this.band.setObjective("Answer Old Olin to learn the bell's rhythm.");
    // Draw Olin — hunched silhouette on a pew
    this.drawOlin();

    this.setNarrator("tell me your name, child.", "Old Olin");
    this.time.delayedCall(600, () => {
      const namePos = this.olinPassageWordPosition();
      const nameTarget = this.makeOlinWord({
        scene: this,
        word: "wren",
        x: namePos.x,
        y: namePos.y,
        fontSize: 40,
        onComplete: () => {
          this.clearActiveTargets();
          this.setNarrator(
            "you are listening for the bell. on its toll, you may speak. between tolls, you cannot.",
            "Old Olin",
          );
          this.time.delayedCall(3000, () => {
            this.setNarrator(
              "i taught the bell its name. i can teach you if you let me.",
              "Old Olin",
            );
            this.time.delayedCall(800, () => {
              const teachPos = this.olinPassageWordPosition();
              const teachTarget = this.makeOlinWord({
                scene: this,
                word: "teach me",
                x: teachPos.x,
                y: teachPos.y,
                fontSize: 40,
                onComplete: () => {
                  this.clearActiveTargets();
                  this.onOlinTeachComplete();
                },
              });
              this.typingInput.register(teachTarget);
              this.activeTargets.push(teachTarget);
            });
          });
        },
      });
      this.typingInput.register(nameTarget);
      this.activeTargets.push(nameTarget);
    });
  }

  private onOlinTeachComplete(): void {
    playChime();
    playActorAttention(this, this.olinImage, {
      tint: BELL_BURST_COLOR,
    });
    // Almanac lore pages 1 + 5 — Drowned Choir + Olin's hidden confession,
    // both stamped at the end of his teaching beat per §5.5.7.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-drowned-choir")) {
        s.almanacLore.push("the-drowned-choir");
      }
      if (!s.almanacLore.includes("notes-from-a-half-deaf-priest")) {
        s.almanacLore.push("notes-from-a-half-deaf-priest");
      }
    });
    this.narration.say("sunken_olin_teach_activate");
    this.beatClock.setTempo(2000);
    this.beatClock.start();
    this.time.delayedCall(2000, () => this.startFirstGhostEncounter());
  }

  // ─── Act 1: First ghost encounter ────────────────────────────────────────

  private startFirstGhostEncounter(): void {
    // Tier 4 — surface the relic loadout once before the realm's first combat,
    // then begin. An empty loadout (incl. revisits) passes straight through.
    this.announceCombatLoadout(() => this.beginFirstGhostEncounter());
  }

  private beginFirstGhostEncounter(): void {
    // Encounter bookend — softer than Winter Mountain's 220/0.005 to match
    // the Bell's "quiet listening" tone. Skipped in the truly reverent
    // moments earlier in Act 1 (descent, Olin); fires here because this is
    // where the realm tips into combat.
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.ghosts = [];
    this.band.setObjective("Drive back the tide-ghosts before the air runs out.");
    // Combat begins — the air stake goes live for the choir waves.
    this.setBreathActive(true);
    this.onWaveCleared = () => this.onFirstEncounterCleared();
    const words = ["tide", "salt", "still"];
    const positions = [
      { x: -100, restX: 300, restY: 700, side: "left" as const },
      { x: this.scale.width + 100, restX: 960, restY: 750, side: "right" as const },
      { x: -100, restX: 600, restY: 680, side: "left" as const },
    ];

    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 400, 16000);
    });
    this.beginCombatWave();
  }

  private onFirstEncounterCleared(): void {
    this.time.delayedCall(1200, () => this.startAct2());
  }

  // ─── Act 2: Through the Cathedral ────────────────────────────────────────

  private startAct2(): void {
    this.ghosts = [];
    this.startWave1();
  }

  private startWave1(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.onWaveCleared = () => this.onWave1Cleared();
    this.narration.say("sunken_choir_wave1");
    this.band.setObjective("Type each word on the toll; watch the air meter.");
    const words = pickAdaptiveWords(
      SUNKEN_BELL_WORD_BANK,
      4,
      this.store.get().keyStats,
    );
    const positions = [
      { x: -100, restX: 280, restY: 700, side: "left" as const },
      { x: this.scale.width + 100, restX: 1600, restY: 720, side: "right" as const },
      { x: -100, restX: 520, restY: 750, side: "left" as const },
      { x: this.scale.width + 100, restX: 1340, restY: 700, side: "right" as const },
    ];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 350, 14000);
    });
    this.beginCombatWave();
  }

  private onWave1Cleared(): void {
    // §5.5.7 / Tier 1 — the choir answers off the beat before the splitter wave.
    this.time.delayedCall(1200, () => this.startAntiphon());
  }

  // ─── Act 2: The Antiphon (off-beat call-and-response) ────────────────────

  private startAntiphon(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.ghosts = [];
    // Flip the accept window to the half-beat — answer BETWEEN the tolls.
    this.beatPhase = "off";
    this.onWaveCleared = () => this.onAntiphonCleared();
    this.narration.say("sunken_antiphon_intro");
    this.band.setObjective("Answer between tolls when the ember ring opens.");
    // Short, non-hyphenated words — the demand is the syncopation, not mid-word
    // metering. The half-beat ember ring (onBeatTick) shows the answer window.
    const words = pickAdaptiveWords(
      SUNKEN_BELL_WORD_BANK,
      3,
      this.store.get().keyStats,
    );
    const positions = [
      { x: -100, restX: 360, restY: 700, side: "left" as const },
      { x: this.scale.width + 100, restX: 1560, restY: 720, side: "right" as const },
      { x: -100, restX: 720, restY: 760, side: "left" as const },
    ];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 450, 15000);
    });
    this.beginCombatWave();
  }

  private onAntiphonCleared(): void {
    // Back on the beat for the splitter wave.
    this.beatPhase = "on";
    this.time.delayedCall(1200, () => this.startWave2());
  }

  private startWave2(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.onWaveCleared = () => this.onWave2Cleared();
    this.narration.say("sunken_choir_wave2");
    this.band.setObjective("Break the splitting ghost before the air runs out.");

    // §5.5.10 — the bell tolls, and for one peal the cathedral fills with a
    // scratched whisper of the Lord's text. Fires once per playthrough on the
    // wave the player has already locked into the rhythm.
    if (!this.quietLordIntruded) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["sunken-bell"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(1600, () => {
        playQuietLordIntrusion(this, {
          x: this.scale.width / 2,
          y: 380,
          text: "the silence answers.",
        });
      });
    }
    // Pick 4 adaptive words for the regular ghosts; the 5th (splitting) ghost
    // always gets "sink" from the bank for thematic weight.
    const adaptiveWords = pickAdaptiveWords(
      SUNKEN_BELL_WORD_BANK,
      4,
      this.store.get().keyStats,
    );
    const words = [...adaptiveWords, "sink"];
    const positions = [
      { x: -100, restX: 240, restY: 700, side: "left" as const },
      { x: this.scale.width + 100, restX: 1680, restY: 720, side: "right" as const },
      { x: -100, restX: 480, restY: 750, side: "left" as const },
      { x: this.scale.width + 100, restX: 1440, restY: 710, side: "right" as const },
      // The splitting ghost
      { x: -100, restX: 720, restY: 740, side: "left" as const },
    ];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      const splits = i === words.length - 1;
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 350, 13000, splits);
    });
    this.beginCombatWave();
  }

  private onWave2Cleared(): void {
    this.time.delayedCall(1200, () => this.startBellKeepersChamber());
  }

  // ─── Act 2: Bell-Keeper's Chamber ────────────────────────────────────────

  private startBellKeepersChamber(): void {
    // Choir combat is over — retire the air gauge until the boss/fork section
    // (which has its own tempo + de-sync stakes, not the breath economy).
    this.setBreathActive(false);
    this.setNarrator("A room off the nave. Something on a stand.");
    const cue = this.add
      .container(this.scale.width / 2, this.scale.height - 390)
      .setDepth(42)
      .setAlpha(0);
    cue.add(addLocalGroundShadow(this, 130, 18, { y: 68, alpha: 0.18 }));
    const g = this.add.graphics();
    g.lineStyle(3, BELL_BURST_COLOR, 0.42);
    g.strokeRoundedRect(-58, -42, 116, 70, 10);
    g.lineStyle(2, PALETTE_HEX.brass, 0.38);
    g.lineBetween(-34, 28, -54, 72);
    g.lineBetween(34, 28, 54, 72);
    g.lineBetween(-46, 72, 46, 72);
    g.fillStyle(BELL_BURST_COLOR, 0.18);
    g.fillRoundedRect(-50, -34, 100, 54, 8);
    g.lineStyle(1.5, 0xf3ead2, 0.3);
    g.lineBetween(-32, -16, 32, -16);
    g.lineBetween(-26, 0, 28, 0);
    cue.add(g);
    addContainerWake(this, cue, {
      kind: "bubble",
      intervalMs: 360,
      spreadX: 52,
      spreadY: 30,
      color: BELL_BURST_COLOR,
      alpha: 0.26,
      size: 3,
      depth: 43,
      driftX: 10,
      driftY: -30,
      durationMs: 880,
    });
    this.tweens.add({
      targets: cue,
      alpha: 0.86,
      y: cue.y - 10,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (cue.scene) addIdleBreath(this, cue, { dy: -3, durationMs: 2600 });
      },
    });
    let cueAnchor: WordBodyAnchorHandle | null = null;
    const releaseCueAnchor = (): void => {
      cueAnchor?.destroy();
      cueAnchor = null;
    };
    const target = this.makeWord({
      scene: this,
      word: "read it",
      x: cue.x,
      y: cue.y - 92,
      fontSize: 36,
      burstColor: BELL_BURST_COLOR,
      onClaim: () => {
        playWrenFocus(this.wrenSprite);
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          cue.x,
          cue.y - 8,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        playActorAttention(this, cue, {
          scale: 1.024,
          durationMs: 180,
        });
      },
      onAdvance: () =>
        playBodyTypePulse(this, cue, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -8,
          depth: 58,
          ringRadius: 24,
        }),
      onComplete: () => {
        releaseCueAnchor();
        playBodyImpact(this, cue, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -8,
          depth: 58,
          ringRadius: 48,
          count: 10,
        });
        dismissStagedCue(this, cue);
        this.clearActiveTargets();
        this.store.update((s) => {
          if (!s.almanacLore.includes("old-olins-memory")) {
            s.almanacLore.push("old-olins-memory");
          }
        });
        playChime();
        this.time.delayedCall(800, () => this.startFork1());
      },
    });
    cueAnchor = attachWordBodyAnchor(
      this,
      cue,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: BELL_BURST_COLOR,
        alpha: 0.2,
        depth: 43,
        sourceOffsetY: -8,
        targetOffsetY: 24,
      },
    );
    cue.once(Phaser.GameObjects.Events.DESTROY, releaseCueAnchor);
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Act 2: Fork 1 — The Cathedral Doors ──────────────────────────────────

  private startFork1(): void {
    this.narration.say("sunken_fork1_intro");
    this.band.setObjective("Choose how to open the nave doors.");
    this.showDoorCues();

    const chantPos = this.bellPassageWordPosition(this.doorChantCue, -62, {
      side: "left",
      long: true,
    });
    const chantTarget = this.makeBellForkWord(this.doorChantCue, {
      scene: this,
      word: "open slowly",
      x: chantPos.x,
      y: chantPos.y,
      fontSize: 32,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "chant";
        this.startFork1Chant();
      },
    }, -62);
    const forcePos = this.bellPassageWordPosition(this.doorForceCue, -48, {
      side: "right",
      long: true,
    });
    const forceTarget = this.makeBellForkWord(this.doorForceCue, {
      scene: this,
      word: "force them open",
      x: forcePos.x,
      y: forcePos.y,
      fontSize: 32,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "force";
        this.startFork1Force();
      },
    }, -48);
    this.typingInput.register(chantTarget);
    this.typingInput.register(forceTarget);
    this.activeTargets.push(chantTarget, forceTarget);
  }

  private startFork1Chant(): void {
    this.fadeOutForkCue(this.doorForceCue);
    this.doorForceCue = null;
    this.band.setObjective("Open the doors slowly, on the bell's rhythm.");
    // Beat-locked passage chain
    const phrases = [
      { word: "slow.", narrator: "The doors remember weight." },
      { word: "the doors remember weight.", narrator: "We knew them once." },
      { word: "we knew them once.", narrator: "They part with grace." },
      { word: "they part with grace.", narrator: "(the doors open)" },
    ];
    this.runBeatLockedChain(phrases, () => {
      // §5.5.5 Fork 1A — side with Old Olin → award Quiet Chant relic
      this.store.update((s) => {
        if (!s.satchel.includes("quiet-chant")) s.satchel.push("quiet-chant");
      });
      this.startAct3Corridor();
    });
  }

  private startFork1Force(): void {
    this.fadeOutForkCue(this.doorChantCue);
    this.doorChantCue = null;
    // §5.5.5 Fork 1B — force the doors open → award Lock-Bar relic
    this.store.update((s) => {
      if (!s.satchel.includes("lock-bar")) s.satchel.push("lock-bar");
    });
    // §5.5.7 Fork 1B: a single `OPEN` that must be typed with FORCE — Shift
    // held AND on the beat. caseSensitive makes the all-caps word demand Shift
    // for every letter (lowercase 'o' won't even match); the clock is still
    // running, so its first letter is beat-gated like any new claim. (The old
    // build had regressed this to a plain lowercase setNarrator("OPEN").)
    this.setNarrator("Force the doors — OPEN, on the toll.");
    this.band.setObjective("Type OPEN on the toll.");
    this.time.delayedCall(700, () => {
      const pos = this.bellPassageWordPosition(this.doorForceCue, -48, {
        side: "left",
      });
      const openTarget = this.makeBellForkWord(this.doorForceCue, {
        scene: this,
        word: "OPEN",
        x: pos.x,
        y: pos.y,
        fontSize: 56,
        caseSensitive: true,
        burstColor: BELL_BURST_COLOR,
        onComplete: () => {
          this.clearActiveTargets();
          this.cameras.main.shake(240, 0.006);
          playDamageThud();
          this.startFork1ForceBreak();
        },
      }, -48);
      this.typingInput.register(openTarget);
      this.activeTargets.push(openTarget);
    });
  }

  /** The doors burst — four rapid free passages as they break (canon §5.5.7). */
  private startFork1ForceBreak(): void {
    this.setNarrator("OPEN");
    const forcePhrases = ["crash", "crack", "clear", "we pass"];
    let step = 0;
    const advance = (): void => {
      if (step >= forcePhrases.length) {
        this.startAct3Corridor();
        return;
      }
      const word = forcePhrases[step];
      if (word === undefined) return;
      const pos = this.bellPassageWordPosition(this.doorForceCue, -48, {
        side: "left",
      });
      const target = this.makeBellForkWord(this.doorForceCue, {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 40,
        onComplete: () => {
          step += 1;
          this.clearActiveTargets();
          advance();
        },
      }, -48);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    this.time.delayedCall(400, advance);
  }

  private startAct3Corridor(): void {
    this.clearActiveTargets();
    this.clearBellForkCues();
    this.setNarrator("The Warden has been waiting.");
    this.time.delayedCall(2000, () => this.startAct3());
  }

  // ─── Act 3: The Bell-Warden ───────────────────────────────────────────────

  /** Add the painted Bell-Warden boss sprite at the bell's old anchor, scaled to
   *  the procedural body height so the word anchors + feel line up. Returns the
   *  Image so the phase-2 "eyes open" beat can tint it (replacing the old
   *  redrawWardenPhase2 graphics). Drawn at absolute coords (no scaled container),
   *  same as the procedural bell. */
  private drawWarden(): Phaser.GameObjects.Image {
    const sprite = this.add.image(WARDEN_X, WARDEN_Y, "bell-warden");
    sprite.setScale(WARDEN_SPRITE_HEIGHT / sprite.height);
    addIdleBreath(this, sprite, { dy: -3, durationMs: 2800 });
    return sprite;
  }

  private playWardenStagePulse(
    wardenSprite: Phaser.GameObjects.Image,
    intense = false,
  ): void {
    playBodyImpact(this, wardenSprite, {
      kind: "bubble",
      color: intense ? 0x8de8ff : BELL_BURST_COLOR,
      offsetY: -62,
      depth: 58,
      ringRadius: intense ? 74 : 62,
      count: intense ? 18 : 14,
      durationMs: intense ? 560 : 480,
    });
  }

  private startAct3(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.pulseBellWave({ y: 640, ringWidth: 900, ringHeight: 180, count: 14 });
    this.ghosts = [];
    const wardenSprite = this.drawWarden();
    this.playWardenStagePulse(wardenSprite);
    // Phase 1
    this.narration.say("sunken_warden_rise");
    this.time.delayedCall(1200, () => {
      this.startWardenPhase1(wardenSprite);
    });
  }

  private startWardenPhase1(wardenSprite: Phaser.GameObjects.Image): void {
    const words = ["weight", "silence", "deep"];
    let remaining = words.length;

    words.forEach((word, i) => {
      const target = this.makeWardenWord(wardenSprite, {
        scene: this,
        word,
        x: this.scale.width / 2 - 200 + i * 200,
        y: 400,
        fontSize: 36,
        onComplete: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.clearActiveTargets();
            this.time.delayedCall(800, () => {
              this.setNarrator("Its eyes open.");
              this.flashWardenAwake(wardenSprite, false);
              this.time.delayedCall(1400, () =>
                this.startWardenPhase2(wardenSprite),
              );
            });
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  /** The Warden wakes — its eyes open. Replaces the old phase-2 graphics redraw
   *  (which repainted glowing eyes) now that the Warden is a painted sprite: tint
   *  it cyan to read as "awake". `intense` brightens the tint for the phase-2→3
   *  surge; the dim cyan is the first eyes-open beat. */
  private flashWardenAwake(
    sprite: Phaser.GameObjects.Image,
    intense: boolean,
  ): void {
    sprite.setTint(intense ? 0x8de8ff : 0x4ab8d6);
  }

  private startWardenPhase2(wardenSprite: Phaser.GameObjects.Image): void {
    // Double tempo — the tide rises and the world speeds up. The window
    // tightens with it (tempo-scaled: ~175ms now).
    this.beatClock.setTempo(1000);
    // De-sync ON: these hyphenated words must land EACH beat — the hyphen
    // boundary is beat-gated, and mistiming it wipes the word (canon §5.5.7
    // "two consecutive beats each").
    this.beatLocked = true;

    this.narration.say("sunken_warden_phase2");
    this.playWardenStagePulse(wardenSprite, true);

    const phrases = ["tide-and-toll", "deep-and-dark", "still-and-stir"];
    let remaining = phrases.length;

    this.time.delayedCall(800, () => {
      phrases.forEach((word, i) => {
        const target = this.makeWardenWord(wardenSprite, {
          scene: this,
          word,
          x: this.scale.width / 2 - 260 + i * 260,
          y: 380,
          fontSize: 34,
          onComplete: () => {
            remaining -= 1;
            if (remaining === 0) {
              this.clearActiveTargets();
              // Phase 3's passage flows freely mid-word again — de-sync off.
              this.beatLocked = false;
              // Brighten the warden's eyes
              this.flashWardenAwake(wardenSprite, true);
              // Scratched fragment ~~Ag~~ — second letter pair of the
              // accumulating word. Once per playthrough.
              const alreadyRevealedBell =
                this.store.get().realms["sunken-bell"]?.quietLordFragmentRevealed ?? false;
              if (!alreadyRevealedBell) {
                this.store.update((s) => {
                  const realm = s.realms["sunken-bell"];
                  if (realm) realm.quietLordFragmentRevealed = true;
                });
                flashQuietLordFragment(this, {
                  text: "Ag",
                  onDone: () => {
                    this.time.delayedCall(400, () => this.startWardenPhase3(wardenSprite));
                  },
                });
              } else {
                this.time.delayedCall(400, () => this.startWardenPhase3(wardenSprite));
              }
            }
          },
        });
        this.typingInput.register(target);
        this.activeTargets.push(target);
      });
    });
  }

  private startWardenPhase3(wardenSprite: Phaser.GameObjects.Image): void {
    this.setNarrator("The bell sings. Type each word on the toll.");
    this.playWardenStagePulse(wardenSprite, true);

    const passage = "i am the bell. i drink the sea.";
    const words = passage.split(" ");
    let wordIndex = 0;
    // §5.5.7 — stumble resets to the last completed sentence, not to index 0.
    // Sentence boundaries: "i am the bell." ends after index 3;
    // "i drink the sea." ends after index 7.
    // sentenceCheckpoint tracks the first word of the sentence currently in
    // progress; it advances whenever Wren completes the last word of a sentence.
    const SENTENCE_STARTS = [0, 4]; // word indices that begin each sentence
    let sentenceCheckpoint = 0;

    const advanceWord = (): void => {
      if (wordIndex >= words.length) {
        // All done — defeat
        this.onWardenDefeated();
        return;
      }
      const word = words[wordIndex];
      if (word === undefined) return;

      let completed = false;
      const target = this.makeWardenWord(wardenSprite, {
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 40,
        onComplete: () => {
          completed = true;
          playChime();
          wordIndex += 1;
          // Advance sentenceCheckpoint when a sentence boundary is passed.
          const nextSentence = SENTENCE_STARTS.find((s) => s > sentenceCheckpoint);
          if (nextSentence !== undefined && wordIndex >= nextSentence) {
            sentenceCheckpoint = nextSentence;
          }
          this.clearActiveTargets();
          // §5.5.7 Phase 3: each word claims on a toll.
          this.beatClock.onNextBeat(advanceWord);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);

      // On the next toll, if this word wasn't finished — stumble.
      // Reset to the checkpoint (start of current sentence).
      this.beatClock.onNextBeat(() => {
        if (completed) return; // already done, no stumble
        this.clearActiveTargets();
        wordIndex = sentenceCheckpoint;
        this.cameras.main.flash(200, 0, 0, 0, false);
        this.beatClock.onNextBeat(advanceWord);
      });
    };

    this.beatClock.onNextBeat(advanceWord);
  }

  private olinPassageWordPosition(): { x: number; y: number } {
    const olin = this.olinImage;
    if (!olin?.scene) return { x: this.scale.width / 2, y: this.scale.height - 340 };
    const bounds = olin.getBounds();
    return {
      x: Math.max(330, Math.min(this.scale.width - 330, bounds.right + 170)),
      y: Math.max(330, Math.min(this.scale.height - 360, bounds.top + 66)),
    };
  }

  private onWardenDefeated(): void {
    playChime();
    this.beatClock.stop();
    // Almanac lore page 4 — the Warden's true name, stamped at defeat.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-wardens-true-name")) {
        s.almanacLore.push("the-wardens-true-name");
      }
    });
    this.narration.say("sunken_warden_defeated");
    this.time.delayedCall(2000, () => this.startFork2());
  }

  // ─── Fork 2 — Beneath the Bell ────────────────────────────────────────────

  private startFork2(): void {
    this.setNarrator("The bell is silent. Two paths beneath it.");
    this.band.setObjective("Choose Aurland's fate beneath the bell.");
    this.showFateCues();

    const freePos = this.bellPassageWordPosition(this.aurlandFateCue, -52, {
      side: "left",
      long: true,
    });
    const freeTarget = this.makeBellForkWord(this.aurlandFateCue, {
      scene: this,
      word: "free king aurland",
      x: freePos.x,
      y: freePos.y,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "free-aurland";
        this.startFork2FreeAurland();
      },
    }, -52);
    const claimPos = this.bellPassageWordPosition(this.bellTongueCue, -48, {
      side: "right",
      long: true,
    });
    const claimTarget = this.makeBellForkWord(this.bellTongueCue, {
      scene: this,
      word: "claim the tongue",
      x: claimPos.x,
      y: claimPos.y,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "claim-tongue";
        this.startFork2ClaimTongue();
      },
    }, -48);
    this.typingInput.register(freeTarget);
    this.typingInput.register(claimTarget);
    this.activeTargets.push(freeTarget, claimTarget);
  }

  private startFork2FreeAurland(): void {
    this.fadeOutForkCue(this.bellTongueCue);
    this.bellTongueCue = null;
    // Triumphant beat: the freed king fades in, standing, while the passage is
    // typed. Placed left-of-centre so he's clear of Wren (x=960) and the lower
    // typing targets, and well below the narration band (y≈150).
    this.showAurland();
    const chain = [
      { word: "break the silence", narrator: "You are remembered." },
      { word: "you are remembered", narrator: "Swim free, king." },
      { word: "swim free king", narrator: "" },
    ];
    this.runFreePassageChain(chain, () => {
      this.store.update((s) => {
        if (!s.satchel.includes("king-aurland")) s.satchel.push("king-aurland");
        if (!s.satchel.includes("trident-token")) s.satchel.push("trident-token");
        if (!s.almanacLore.includes("king-auriands-promise")) {
          s.almanacLore.push("king-auriands-promise");
        }
      });
      playChime();
      // Realm moves past the fork — the king swims off as the glass-fish gate
      // begins.
      this.fadeOutForkCue(this.aurlandFateCue);
      this.aurlandFateCue = null;
      this.hideAurland();
      this.startGlassFishGate();
    });
  }

  /** Fade the painted King Aurland in, standing centre-left, as he's freed. */
  private showAurland(): void {
    if (this.aurlandImage) return;
    const sprite = this.add
      .image(660, 760, "aurland")
      .setOrigin(0.5, 1);
    sprite.setScale(AURLAND_SPRITE_HEIGHT / sprite.height);
    this.aurlandImage = sprite;
    stageAnchoredSprite(this, sprite, {
      shadowWidth: 132,
      shadowHeight: 24,
      shadowOffsetY: 8,
      shadowAlpha: 0.2,
      restAlpha: 0.94,
      entranceOffsetY: 18,
      entranceMs: 1100,
      breathDy: -3,
      breathMs: 2600,
    });
  }

  /** Fade King Aurland out and destroy him as the realm moves past the fork. */
  private hideAurland(): void {
    const sprite = this.aurlandImage;
    if (!sprite) return;
    this.clearAurlandWordAnchors();
    this.aurlandImage = undefined;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 1000,
      ease: "Sine.easeOut",
    });
  }

  private startFork2ClaimTongue(): void {
    this.fadeOutForkCue(this.aurlandFateCue);
    this.aurlandFateCue = null;
    const chain = [
      {
        word: "take it",
        narrator: "The clapper tears free. The bell will never toll again.",
      },
    ];
    this.runFreePassageChain(chain, () => {
      this.store.update((s) => {
        if (!s.satchel.includes("bells-tongue")) s.satchel.push("bells-tongue");
        if (!s.almanacLore.includes("the-bells-tongue-song")) {
          s.almanacLore.push("the-bells-tongue-song");
        }
      });
      playChime();
      this.fadeOutForkCue(this.bellTongueCue);
      this.bellTongueCue = null;
      this.startGlassFishGate();
    });
  }

  // ─── Glass-fish gate ─────────────────────────────────────────────────────

  private startGlassFishGate(): void {
    this.clearActiveTargets();
    if (this.fork2Choice === "free-aurland") {
      this.setNarrator("A small glass-fish leads the way up through the dark water.");
      this.showGlassFishCompanion();
      this.time.delayedCall(1000, () => {
        const takePos = this.bellPassageWordPosition(
          this.glassFishCompanion,
          -54,
          { side: "left", long: true },
        );
        const takeTarget = this.makeGlassFishWord({
          scene: this,
          word: "take her with you",
          x: takePos.x,
          y: takePos.y,
          fontSize: 30,
          frame: "banner",
          onComplete: () => {
            this.clearActiveTargets();
            this.store.update((s) => {
              if (!s.satchel.includes("glass-fish")) s.satchel.push("glass-fish");
            });
            this.startTrueNamePassage();
          },
        });
        const letGoPos = this.bellPassageWordPosition(
          this.glassFishCompanion,
          -54,
          { side: "right" },
        );
        const letGoTarget = this.makeGlassFishWord({
          scene: this,
          word: "let her go",
          x: letGoPos.x,
          y: letGoPos.y,
          fontSize: 30,
          frame: "banner",
          onComplete: () => {
            this.clearActiveTargets();
            this.dismissGlassFishCompanion(1320, 640);
            this.startTrueNamePassage();
          },
        });
        this.typingInput.register(takeTarget);
        this.typingInput.register(letGoTarget);
        this.activeTargets.push(takeTarget, letGoTarget);
      });
    } else {
      this.startTrueNamePassage();
    }
  }

  private showGlassFishCompanion(): void {
    if (this.glassFishCompanion?.scene) return;
    this.glassFishCompanion = stageCompanionCameo(this, {
      textureKey: "bell-companion-glass-fish",
      startX: 1340,
      startY: 760,
      x: 1190,
      y: 720,
      height: 96,
      depth: 43,
      flipX: true,
      shadowWidth: 76,
      shadowHeight: 12,
      shadowOffsetY: 22,
      shadowAlpha: 0.13,
      breathDy: -16,
      breathMs: 1500,
      wake: {
        kind: "bubble",
        intervalMs: 150,
        offsetY: -34,
        spreadX: 24,
        spreadY: 22,
        depth: 42,
        alpha: 0.3,
      },
    });
  }

  private pulseGlassFishCompanion(): void {
    playActorAttention(this, this.glassFishCompanion, {
      scale: 1.04,
      durationMs: 220,
    });
  }

  private dismissGlassFishCompanion(x: number, y: number): void {
    this.clearGlassFishWordAnchors();
    dismissCompanionCameo(this, this.glassFishCompanion, { x, y, durationMs: 720 });
    this.glassFishCompanion = null;
  }

  // ─── True-name passage ───────────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.narration.say("sunken_truename_intro");
    this.time.delayedCall(800, () => {
      const trueName = "the bell remembers. the deep listens. the kingdom holds.";
      const sealY = this.scale.height / 2 + 118;
      const seal = stageTrueNameSeal(this, {
        color: BELL_BURST_COLOR,
        kind: "bubble",
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
        word: trueName,
        x: this.scale.width / 2,
        y: sealY - 118,
        fontSize: 28,
        burstColor: BELL_BURST_COLOR,
        onClaim: () => {
          playWrenFocus(this.wrenSprite);
          playClaimLine(
            this,
            this.wrenContainer.x,
            this.wrenContainer.y - 112,
            seal.x,
            seal.y - 8,
            { color: BELL_BURST_COLOR, depth: 58 },
          );
          playActorAttention(this, seal, {
            tint: BELL_BURST_COLOR,
            scale: 1.024,
            durationMs: 180,
          });
        },
        onAdvance: () =>
          playBodyTypePulse(this, seal, {
            kind: "bubble",
            color: BELL_BURST_COLOR,
            offsetY: -8,
            depth: 58,
            ringRadius: 24,
          }),
        onComplete: () => {
          releaseSealAnchor();
          playBodyImpact(this, seal, {
            kind: "bubble",
            color: BELL_BURST_COLOR,
            offsetY: -8,
            depth: 58,
            ringRadius: 54,
            count: 12,
          });
          dismissTrueNameSeal(this, seal);
          this.clearActiveTargets();
          playChime();
          this.time.delayedCall(600, () => this.startEnding());
        },
      });
      sealAnchor = attachWordBodyAnchor(
        this,
        seal,
        () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
        {
          color: BELL_BURST_COLOR,
          alpha: 0.2,
          depth: 43,
          sourceOffsetY: -12,
          targetOffsetY: 24,
        },
      );
      seal.once(Phaser.GameObjects.Events.DESTROY, releaseSealAnchor);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  // ─── Ending ──────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.store.update((s) => {
      s.realms["sunken-bell"] = {
        cleared: true,
        choices: {
          fork1: this.fork1Choice ?? "chant",
          fork2: this.fork2Choice ?? "claim-tongue",
        },
      };
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 8, 24, 32);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", {
            store: this.store,
            arrival: "sunken-bell",
          });
        },
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    this.setNarrator("");
    playRealmClearResonance(this, {
      color: PALETTE_HEX.frost,
      y: this.scale.height / 2 - 30,
    });
    showAlmanacStampCard(this, "the sunken bell", onDone, { onReveal: playChime });
  }

  // ─── Ghost enemies ────────────────────────────────────────────────────────

  /** UI-cohesion: every Bell word target gets the legibility outline by default
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

  private playWrenTypingPulse(): void {
    playBodyTypePulse(this, this.wrenContainer, {
      kind: "bubble",
      color: BELL_BURST_COLOR,
      offsetY: -108,
      depth: 58,
      ringRadius: 22,
    });
  }

  private makeWardenWord(
    wardenSprite: Phaser.GameObjects.Image,
    opts: TextWordTargetOptions,
  ): TextWordTarget {
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
      burstColor: opts.burstColor ?? BELL_BURST_COLOR,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          wardenSprite.x,
          wardenSprite.y - 70,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, wardenSprite, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -58,
          depth: 58,
          ringRadius: 30,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, wardenSprite, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -58,
          depth: 58,
          ringRadius: 58,
          count: 14,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      wardenSprite,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: BELL_BURST_COLOR,
        alpha: 0.22,
        depth: 44,
        sourceOffsetY: -68,
        targetOffsetY: 24,
      },
    );
    this.bossWordAnchors.push(anchor);
    return target;
  }

  private makeOlinWord(opts: TextWordTargetOptions): TextWordTarget {
    const olin = this.olinImage;
    if (!olin) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.olinWordAnchors.indexOf(anchor);
      if (idx >= 0) this.olinWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? BELL_BURST_COLOR,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          olin.x,
          olin.y - 92,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        playActorAttention(this, olin, {
          tint: BELL_BURST_COLOR,
          scale: 1.02,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, olin, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -92,
          depth: 58,
          ringRadius: 22,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, olin, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -92,
          depth: 58,
          ringRadius: 42,
          count: 10,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      olin,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: BELL_BURST_COLOR,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -92,
        targetOffsetY: 24,
      },
    );
    this.olinWordAnchors.push(anchor);
    olin.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeAurlandWord(opts: TextWordTargetOptions): TextWordTarget {
    const aurland = this.aurlandImage;
    if (!aurland) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.aurlandWordAnchors.indexOf(anchor);
      if (idx >= 0) this.aurlandWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? BELL_BURST_COLOR,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          aurland.x,
          aurland.y - 142,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        playActorAttention(this, aurland, {
          tint: BELL_BURST_COLOR,
          scale: 1.02,
          durationMs: 180,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, aurland, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -142,
          depth: 58,
          ringRadius: 28,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, aurland, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -142,
          depth: 58,
          ringRadius: 54,
          count: 12,
        });
        onComplete();
      },
    });

    anchor = attachWordBodyAnchor(
      this,
      aurland,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: BELL_BURST_COLOR,
        alpha: 0.2,
        depth: 44,
        sourceOffsetY: -142,
        targetOffsetY: 24,
      },
    );
    this.aurlandWordAnchors.push(anchor);
    aurland.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeGlassFishWord(opts: TextWordTargetOptions): TextWordTarget {
    const body = this.glassFishCompanion;
    if (!body?.scene) return this.makeWord(opts);

    const onClaim = opts.onClaim;
    const onAdvance = opts.onAdvance;
    const onComplete = opts.onComplete;
    let anchor: WordBodyAnchorHandle | null = null;
    const releaseAnchor = (): void => {
      if (!anchor) return;
      anchor.destroy();
      const idx = this.glassFishWordAnchors.indexOf(anchor);
      if (idx >= 0) this.glassFishWordAnchors.splice(idx, 1);
      anchor = null;
    };

    const target = this.makeWord({
      ...opts,
      burstColor: opts.burstColor ?? BELL_BURST_COLOR,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y - 54,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        this.pulseGlassFishCompanion();
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -54,
          depth: 58,
          ringRadius: 24,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
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
        color: BELL_BURST_COLOR,
        alpha: 0.18,
        depth: 44,
        sourceOffsetY: -54,
        targetOffsetY: 24,
      },
    );
    this.glassFishWordAnchors.push(anchor);
    body.once(Phaser.GameObjects.Events.DESTROY, releaseAnchor);
    return target;
  }

  private makeBellForkWord(
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
      burstColor: opts.burstColor ?? BELL_BURST_COLOR,
      onClaim: (mods) => {
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          body.x,
          body.y + sourceOffsetY,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
        playBodyTypePulse(this, body, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 24,
        });
        onClaim?.(mods);
      },
      onAdvance: (cursor, wordLength) => {
        playBodyTypePulse(this, body, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 22,
        });
        onAdvance?.(cursor, wordLength);
      },
      onComplete: () => {
        releaseAnchor();
        playBodyImpact(this, body, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: sourceOffsetY,
          depth: 58,
          ringRadius: 44,
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
        color: BELL_BURST_COLOR,
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

  private bellPassageWordPosition(
    body: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null | undefined,
    sourceOffsetY: number,
    opts: { side?: "left" | "right"; long?: boolean; lift?: number } = {},
  ): { x: number; y: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    const sourceX = body?.scene ? body.x : width / 2;
    const sourceY = body?.scene ? body.y + sourceOffsetY : height - 460;
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1 : sourceX < width / 2 ? 1 : -1;
    const lateral = opts.long ? 180 : 150;
    const xInset = opts.long ? 380 : 300;
    const lift = opts.lift ?? (opts.long ? 116 : 102);

    return {
      x: Phaser.Math.Clamp(sourceX + side * lateral, xInset, width - xInset),
      y: Phaser.Math.Clamp(sourceY - lift, 280, height - 430),
    };
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private showDoorCues(): void {
    if (!this.doorChantCue?.scene) {
      this.doorChantCue = this.createDoorCue(700, 812, "chant");
    }
    if (!this.doorForceCue?.scene) {
      this.doorForceCue = this.createDoorCue(1220, 812, "force");
    }
  }

  private createDoorCue(
    x: number,
    y: number,
    mode: "chant" | "force",
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y + 18).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 132, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.fillStyle(0x102335, 0.78);
    g.fillRoundedRect(-48, -104, 96, 110, 8);
    g.lineStyle(2, BELL_BURST_COLOR, 0.42);
    g.strokeRoundedRect(-48, -104, 96, 110, 8);
    g.lineStyle(1, 0xd8f6ff, 0.18);
    g.lineBetween(0, -100, 0, 3);
    g.lineBetween(-36, -66, 36, -66);
    g.lineBetween(-34, -30, 34, -30);

    if (mode === "chant") {
      g.lineStyle(2, 0xd8f6ff, 0.28);
      g.strokeEllipse(0, -50, 116, 62);
      g.fillStyle(BELL_BURST_COLOR, 0.42);
      g.fillCircle(-32, -62, 4);
      g.fillCircle(0, -72, 3.5);
      g.fillCircle(32, -62, 4);
    } else {
      g.fillStyle(0x5d4931, 0.92);
      g.fillRoundedRect(-60, -56, 120, 18, 6);
      g.fillStyle(PALETTE_HEX.brass, 0.62);
      g.fillCircle(-40, -47, 5);
      g.fillCircle(40, -47, 5);
      g.lineStyle(3, PALETTE_HEX.brass, 0.46);
      g.lineBetween(-62, -37, 62, -71);
    }
    c.add(g);

    addContainerWake(this, c, {
      kind: "bubble",
      intervalMs: 560,
      spreadX: 36,
      spreadY: 18,
      offsetY: -54,
      alpha: 0.18,
      size: 4,
      depth: 41,
      driftY: -42,
      durationMs: 1300,
    });

    this.tweens.add({
      targets: c,
      y,
      alpha: 0.88,
      duration: 650,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -3, durationMs: 2600 });
      },
    });
    return c;
  }

  private showFateCues(): void {
    if (!this.aurlandFateCue?.scene) {
      this.aurlandFateCue = this.createAurlandFateCue();
    }
    if (!this.bellTongueCue?.scene) {
      this.bellTongueCue = this.createBellTongueCue();
    }
  }

  private createAurlandFateCue(): Phaser.GameObjects.Container {
    const c = this.add.container(690, 812).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 138, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.lineStyle(2, BELL_BURST_COLOR, 0.34);
    g.strokeEllipse(0, -52, 96, 110);
    g.fillStyle(0x0d2b38, 0.62);
    g.fillEllipse(0, -42, 78, 92);
    g.fillStyle(PALETTE_HEX.brass, 0.74);
    g.fillTriangle(-34, -66, -18, -96, -4, -66);
    g.fillTriangle(-8, -66, 0, -104, 10, -66);
    g.fillTriangle(6, -66, 24, -96, 36, -66);
    g.fillRoundedRect(-38, -66, 76, 12, 4);
    g.lineStyle(2, 0xd8f6ff, 0.26);
    g.strokeCircle(-42, -36, 10);
    g.strokeCircle(42, -36, 10);
    g.lineBetween(-32, -36, 32, -36);
    c.add(g);

    addContainerWake(this, c, {
      kind: "bubble",
      intervalMs: 520,
      spreadX: 30,
      spreadY: 18,
      offsetY: -48,
      alpha: 0.2,
      size: 4,
      depth: 41,
      driftY: -44,
      durationMs: 1300,
    });

    this.tweens.add({
      targets: c,
      y: 790,
      alpha: 0.86,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!c.scene) return;
        addIdleBreath(this, c, { dy: -4, durationMs: 2700 });
      },
    });
    return c;
  }

  private createBellTongueCue(): Phaser.GameObjects.Container {
    const c = this.add.container(1230, 812).setDepth(42).setAlpha(0);
    c.add(addLocalGroundShadow(this, 126, 18, { y: 12, alpha: 0.2 }));

    const g = this.add.graphics();
    g.lineStyle(2, PALETTE_HEX.brass, 0.5);
    g.strokeCircle(0, -98, 18);
    g.lineStyle(3, BELL_BURST_COLOR, 0.26);
    g.lineBetween(0, -82, 0, -26);
    g.fillStyle(0x6a4d29, 0.92);
    g.fillRoundedRect(-18, -58, 36, 74, 9);
    g.fillStyle(PALETTE_HEX.brass, 0.75);
    g.fillCircle(0, -42, 5);
    g.fillCircle(0, -4, 6);
    g.lineStyle(2, 0xd8f6ff, 0.22);
    g.strokeEllipse(0, -25, 72, 38);
    c.add(g);

    addContainerWake(this, c, {
      kind: "bubble",
      intervalMs: 540,
      spreadX: 28,
      spreadY: 18,
      offsetY: -42,
      alpha: 0.2,
      size: 4,
      depth: 41,
      driftY: -38,
      durationMs: 1250,
    });

    this.tweens.add({
      targets: c,
      y: 792,
      alpha: 0.9,
      duration: 700,
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
      duration: opts.durationMs ?? 520,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (cue.scene) cue.destroy();
      },
    });
  }

  private clearBellForkCues(): void {
    this.clearForkChoiceWordAnchors();
    for (const cue of [
      this.doorChantCue,
      this.doorForceCue,
      this.aurlandFateCue,
      this.bellTongueCue,
    ]) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      cue.destroy();
    }
    this.doorChantCue = null;
    this.doorForceCue = null;
    this.aurlandFateCue = null;
    this.bellTongueCue = null;
  }

  private clearBossWordAnchors(): void {
    for (const anchor of this.bossWordAnchors) anchor.destroy();
    this.bossWordAnchors = [];
  }

  private clearOlinWordAnchors(): void {
    for (const anchor of this.olinWordAnchors) anchor.destroy();
    this.olinWordAnchors = [];
  }

  private clearAurlandWordAnchors(): void {
    for (const anchor of this.aurlandWordAnchors) anchor.destroy();
    this.aurlandWordAnchors = [];
  }

  private clearGlassFishWordAnchors(): void {
    for (const anchor of this.glassFishWordAnchors) anchor.destroy();
    this.glassFishWordAnchors = [];
  }

  private spawnGhost(
    startX: number,
    restX: number,
    restY: number,
    word: string,
    delay: number,
    advanceMs: number,
    splits = false,
  ): void {
    const container = this.add.container(startX, restY);
    this.drawGhostInto(container);
    addContainerWake(this, container, {
      kind: "bubble",
      intervalMs: 330,
      spreadX: 22,
      spreadY: 10,
      offsetY: -8,
      alpha: 0.32,
      size: 4,
      depth: -1,
      driftX: 18,
      driftY: -38,
      durationMs: 1200,
    });
    container.setAlpha(0);

    const ghost = new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word,
      restX,
      restY,
      wrenX: this.wrenContainer.x,
      advanceMs,
      advanceMult: this.combat.advanceMult,
      entranceMs: 900,
      entranceDelayMs: delay,
      restAlpha: 0.7,
      knockbackMs: 700,
      knockbackPauseMs: GHOST_KNOCKBACK_PAUSE_MS,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -80,
      idleBobDy: 8,
      idleBobMs: 1100,
      defeatRiseY: -50,
      defeatMs: 500,
      fontSize: 32,
      // Sea-green burst — the ghost dissolves into deep water, not brass.
      burstColor: BELL_BURST_COLOR,
      defeatImpactKind: "bubble",
      defeatImpactColor: BELL_BURST_COLOR,
      claimLineFrom: () => ({
        x: this.wrenContainer.x,
        y: this.wrenContainer.y - 112,
      }),
      claimLineColor: BELL_BURST_COLOR,
      outline: true,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      // On completion: the quiet-them flicker, a breath in the choir wave, then the
      // wave check. The split children (if any) are spawned by the enemy's `split`
      // BEFORE this runs, so checkWaveCleared sees them and the wave stays open.
      onComplete: () => {
        this.showQuietFlicker();
        if (this.breathActive) {
          this.breath.inhale();
          this.drawBreathBar();
        }
        this.checkWaveCleared();
      },
      onReachWren: () => {
        this.cameras.main.flash(300, 0, 0, 0, false);
        playWrenHurt(this.wrenSprite, { knockX: 0 });
        playDamageThud();
        flashDamageVignette(this);
      },
      // The splitting ghost sheds "ebb"/"drift" where it dies (±60px, a quick
      // 5000ms close, non-recursive). Geometry via the shared splitChildPositions.
      split: splits
        ? {
            children: [
              { word: "ebb", dx: -60 },
              { word: "drift", dx: 60 },
            ],
            spawn: (p) =>
              this.spawnGhost(p.restX, p.restX, p.restY, p.word, 0, 5000),
          }
        : undefined,
    });

    this.ghosts.push(ghost);
  }

  /** Add the painted choir-ghost sprite into a container, scaled to the old
   *  procedural body height (~90px) so the word anchor + hit feel still line up.
   *  The container drives alpha (restAlpha 0.7) + the danger-ramp tint, so this
   *  just places the art. */
  private drawGhostInto(c: Phaser.GameObjects.Container): void {
    c.add(addLocalGroundShadow(this, 88, 18, { y: 8, alpha: 0.18 }));
    const sprite = this.add.image(0, 0, "bell-ghost");
    sprite.setScale(GHOST_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
  }

  private showQuietFlicker(): void {
    const txt = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 60, "~~quiet them~~", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: PALETTE.dim,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setAlpha(0.6);

    this.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => txt.destroy(),
    });
  }

  /** Fire the active wave's explicit continuation once every ghost is down.
   *  Replaces the old narrator-substring routing, which matched none of the
   *  live captions at the first encounter → the realm soft-locked there (same
   *  class of bug as the Haunted Wood fix #89). The length guard avoids the
   *  `[].every() === true` footgun when no wave is active (boss/forks). */
  private checkWaveCleared(): void {
    if (this.ghosts.length === 0) return;
    if (!this.ghosts.every((g) => g.isDefeated())) return;
    this.ghosts = [];
    const cb = this.onWaveCleared;
    this.onWaveCleared = null;
    cb?.();
  }

  // ─── Beat-locked passage chain (used in Fork 1 Chant) ────────────────────

  private runBeatLockedChain(
    steps: Array<{ word: string; narrator: string }>,
    onDone: () => void,
  ): void {
    let idx = 0;

    const advance = (): void => {
      if (idx >= steps.length) {
        onDone();
        return;
      }
      const step = steps[idx];
      if (!step) return;
      const pos = this.bellPassageWordPosition(this.doorChantCue, -62, {
        side: "right",
        long: step.word.length > 14,
      });
      const target = this.makeBellForkWord(this.doorChantCue, {
        scene: this,
        word: step.word,
        x: pos.x,
        y: pos.y,
        fontSize: 34,
        onClaim: () => playWrenFocus(this.wrenSprite),
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          playBodyImpact(this, this.wrenContainer, {
            kind: "bubble",
            color: BELL_BURST_COLOR,
            offsetY: -104,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1200, advance);
        },
      }, -62);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  /** Free (no beat) passage chain for fork 2 */
  private runFreePassageChain(
    steps: Array<{ word: string; narrator: string }>,
    onDone: () => void,
  ): void {
    // Free-passage chains run after the boss falls — the BeatClock has
    // already been stopped, so isInWindow() returns true and input flows.

    let idx = 0;
    const advance = (): void => {
      if (idx >= steps.length) {
        onDone();
        return;
      }
      const step = steps[idx];
      if (!step) return;
      const freeingAurland = this.fork2Choice === "free-aurland";
      const pos = this.bellPassageWordPosition(
        freeingAurland ? this.aurlandImage : this.bellTongueCue,
        freeingAurland ? -142 : -48,
        {
          side: freeingAurland ? "right" : "left",
          long: step.word.length > 12,
          lift: freeingAurland ? 92 : undefined,
        },
      );
      const targetOptions: TextWordTargetOptions = {
        scene: this,
        word: step.word,
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        onClaim: () => playWrenFocus(this.wrenSprite),
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          playActorAttention(this, this.aurlandImage, {
            tint: BELL_BURST_COLOR,
          });
          playBodyImpact(this, this.wrenContainer, {
            kind: "bubble",
            color: BELL_BURST_COLOR,
            offsetY: -104,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1000, advance);
        },
      };
      const target =
        freeingAurland
          ? this.makeAurlandWord(targetOptions)
          : this.makeBellForkWord(this.bellTongueCue, targetOptions, -48);
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    this.setBandSpeaker(speakerName);
    if (speakerName === "Old Olin") {
      playActorAttention(this, this.olinImage, {
        tint: BELL_BURST_COLOR,
        scale: 1.025,
        durationMs: 220,
      });
    } else if (speakerName === "King Aurland") {
      playActorAttention(this, this.aurlandImage, {
        tint: BELL_BURST_COLOR,
        scale: 1.025,
        durationMs: 220,
      });
    }
  }

  private setBandSpeaker(speakerName: string | null): void {
    if (!speakerName || speakerName === "Runa") {
      this.band.setPortrait("band-portrait-runa", "Runa");
    } else if (speakerName === "Old Olin") {
      this.band.setPortrait("olin", "Old Olin");
    } else if (speakerName === "King Aurland") {
      this.band.setPortrait("aurland", "Aurland");
    } else {
      this.band.setPortrait(undefined, speakerName);
    }
  }

  private pulseBellWave(
    opts: { y?: number; ringWidth?: number; ringHeight?: number; count?: number } = {},
  ): void {
    playSceneEventPulse(this, {
      kind: "bubble",
      color: 0x86d7cf,
      x: this.scale.width / 2,
      y: 720,
      ringWidth: 1100,
      ringHeight: 180,
      count: 12,
      alpha: 0.13,
      ...opts,
    });
  }

  private clearActiveTargets(): void {
    this.clearBossWordAnchors();
    this.clearOlinWordAnchors();
    this.clearAurlandWordAnchors();
    this.clearGlassFishWordAnchors();
    this.clearForkChoiceWordAnchors();
    this.clearDescentLanternWordAnchors();
    this.dismissRevisitMemoryCue(false);
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    // Retains the inner sprite reference on this.wrenSprite so the keystroke
    // hooks can bob / flash the actual image (not just the container).
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 92, 20, { y: 6, alpha: 0.26 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    stageContainerEntrance(this, c, {
      breathDy: -4,
      breathMs: 2300,
    });
    return c;
  }

  private drawOlin(): void {
    if (this.olinImage) return;
    // Wooden pew (kept procedural — the sprite is just Olin himself).
    const g = this.add.graphics();
    g.fillStyle(0x1a2030, 1);
    g.fillRect(200, 820, 300, 20);
    g.fillRect(200, 820, 10, 60);
    g.fillRect(490, 820, 10, 60);
    // Painted Old Olin — a small hunched figure, feet on the pew top. Replaces
    // the old procedural body/head/staff silhouette.
    const sprite = this.add.image(300, 822, "olin").setOrigin(0.5, 1);
    sprite.setScale(OLIN_SPRITE_HEIGHT / sprite.height);
    this.olinImage = sprite;
    addIdleBreath(this, sprite, { dy: -2, durationMs: 2600, delayMs: 300 });
  }
}
