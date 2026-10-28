import { installChapterMenu } from "../game/ui/pauseMenu";
import { rememberRealmFork, resolveRealmFork, resolveCompanionDecision, rememberCompanionDecision, type RealmFork } from "../game/realmChoices";
import { ChapterReading } from "../game/ui/chapterReading";
import { reducedFlashes, reducedMotion } from "../game/presentation";
import Phaser from "phaser";
import { applySceneActorLighting } from "../game/actorLighting";
import { type AmbientHandle, playAmbientBell } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { playDamageThud } from "../audio/damageThud";
import { playWaveSting } from "../audio/waveSting";
import { flashDamageVignette } from "../game/vfx";
import { BeatClock } from "../game/beatClock";
import { decideBeatGate } from "../game/beatGate";
import { BreathMeter } from "../game/breathMeter";
import { HeartSoulHud } from "../game/heartSoulHud";
import { showLowHeartFeedback } from "../game/lowHeartFeedback";
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
  addContainerWake,
  dismissCompanionCameo,
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  attachWordBodyAnchor,
  playBodyContactCue,
  playBodyImpact,
  playBodyTypePulse,
  playClaimLine,
  playActorAttention,
  playMeterPulse,
  playPortalArrivalWake,
  playRealmClearResonance,
  playRealmReturnDeparture,
  playSceneEventPulse,
  stageContainerEntrance,
  stageAnchoredSprite,
  stageCompanionCameo,
  stageTrueNameSeal,
  dismissTrueNameSeal,
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
  setWrenPose,
} from "../game/wren";
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons } from "../game/ui/satchelIcons";
import runaPortrait from "../../art/runa/runa-front.png";
import sunkenBellBackdrop from "../../art/references/sunken-bell-clean.png";
import bellGhostSprite from "../../art/bell/ghost.png";
import bellWardenSprite from "../../art/bell/bell-warden.png";
import olinSprite from "../../art/bell/olin.png";
import aurlandSprite from "../../art/bell/aurland.png";
import tridentTokenSprite from "../../art/relics/trident-token.png";
import glassFishSprite from "../../art/companions/glass-fish.png";
import naveDoorway from "../../art/bell/nave-doorway.png";
import naveDoorLeaves from "../../art/bell/nave-door-leaves.png";
import readingLecternSprite from "../../art/bell/reading-lectern.png";
import snowFoxSprite from "../../art/companions/snow-fox.png";

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
  center: boolean;
}

// Choir ghosts are now the shared MovingWordEnemy. The splitting ghost is the
// canonical use of the enemy's declarative `split` capability (ebb/drift children).

const GHOST_KNOCKBACK_PAUSE_MS = 2000;
const WREN_X = 960;
const WREN_Y = 820;
// The nave plate owns one architectural opening, in the painting's coordinates.
// The leaf outline excludes the generated exterior aura; only solid metal is
// drawn into the recess. Coordinates belong to the accepted1024×1536 asset.
const NAVE_DOOR = {
  centerX: 1118, thresholdY: 802, width: 375, height: 595,
  wrenX: 600, wrenY: 842, wordY: 500, chantWordX: 520, forceWordX: 1510,
  leafClip: { left: 116, seam: 512, right: 908, top: 55, bottom: 1460,
    curve: [[512, 55], [340, 180], [220, 300], [116, 450]] },
} as const;

// Painted-sprite display heights (px). The choir ghosts started at the old
// procedural blob height, but the living-scene pass needs the painted body to
// carry the threat against the dark cathedral, not just the floating word.
// The Warden is drawn at absolute coords (not in a scaled container), so its
// height is used directly. Tune on live.
const GHOST_SPRITE_HEIGHT = 136;
const WARDEN_SPRITE_HEIGHT = 320;

// Painted NPC display heights (px). Olin is a small hunched figure — the old
// procedural body (head ~742px down to staff foot ~870px) spanned ~130px; the
// living-scene pass stages him higher so the teaching beat belongs to the world,
// not the bottom console band. King Aurland is a tall, freed-king beat — drawn
// larger and standing. Tune on live.
const OLIN_SPRITE_HEIGHT = 205;
const AURLAND_SPRITE_HEIGHT = 360;
const OLIN_X = 430;
const OLIN_PEW_Y = 780;

// The Warden's painted sprite sits at the same anchor the procedural bell used
// (trapezoid centred at bx, vertical mid-point ~by+110). Keep these in sync with
// the values the procedural drawWarden baked in.
const WARDEN_X = 1400;
const WARDEN_Y = 610;
const DESCENT_LANTERN_WORDS = ["swim", "glow", "breathe"] as const;
const DESCENT_LANTERN_POSITIONS = [
  { x: 400, y: 600 },
  { x: 1120, y: 650 },
  { x: 1520, y: 600 },
] as const;

export class SunkenBellScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private reading!: ChapterReading;
  private chapterMenu?: ReturnType<typeof installChapterMenu>;
  private band!: ConsoleBand;
  private ghosts: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  private bossWordAnchors: WordBodyAnchorHandle[] = [];
  private olinWordAnchors: WordBodyAnchorHandle[] = [];
  private aurlandWordAnchors: WordBodyAnchorHandle[] = [];
  private glassFishWordAnchors: WordBodyAnchorHandle[] = [];
  private forkChoiceWordAnchors: WordBodyAnchorHandle[] = [];
  private descentLanterns: DescentLantern[] = [];
  private descentLanternWordAnchors: WordBodyAnchorHandle[] = [];
  private revisitMemoryCue: Phaser.GameObjects.Container | null = null;
  private revisitMemoryWordAnchor: WordBodyAnchorHandle | null = null;
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  /** King Aurland's painted sprite — fades in when he's freed at fork 2 and is
   *  faded/destroyed when the realm moves past the fork (or on shutdown). */
  private aurlandImage?: Phaser.GameObjects.Image;
  private aurlandToken?: Phaser.GameObjects.Image;
  private aurlandBindingPending = false;
  /** Old Olin's painted sprite during the Act 1 teaching beat. */
  private olinImage?: Phaser.GameObjects.Image;
  /** Olin's low stone pew, dismissed with him when the ghost wave begins. */
  private olinPew?: Phaser.GameObjects.Graphics;
  private glassFishCompanion: Phaser.GameObjects.Container | null = null;
  private doorChantCue: Phaser.GameObjects.Container | null = null;
  private doorForceCue: Phaser.GameObjects.Container | null = null;
  private doorwayStage: Phaser.GameObjects.Container | null = null;
  private doorwayPassagePending = false;
  private doorwayPassageToken = 0;
  private aurlandFateCue: Phaser.GameObjects.Container | null = null;
  private bellTongueCue: Phaser.GameObjects.Container | null = null;
  private bellKeeperLectern: Phaser.GameObjects.Container | null = null;

  private beatClock!: BeatClock;
  private beatRing!: Phaser.GameObjects.Graphics;
  private offbeatRing!: Phaser.GameObjects.Graphics;
  private echoDim!: Phaser.GameObjects.Graphics;

  // Rhythm-gate state (Tier 1 — make the Bell's rhythm demanding):
  //  - free keeps exploration, door passages and rewards ordinary typing.
  //  - beatPhase "off" flips the accept window to the half-beat for the
  //    antiphon (call-and-response) wave.
  //  - beatLocked turns on mid-word de-sync (hyphen boundaries must land on
  //    the beat) for the Warden's Phase 2.
  private beatPhase: "on" | "off" | "free" = "free";
  private beatLocked = false;
  private rhythmPracticeActive = false;
  private rhythmPracticeTarget: TextWordTarget | null = null;
  private rhythmPracticeCoach: Phaser.GameObjects.Text | null = null;
  private rhythmLabel!: Phaser.GameObjects.Text;

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
  private breathMeterWakeToken = 0;

  // Tier 4 — relics earned in EARLIER realms shape this realm's combat. The
  // bounded loadout is resolved once in create() (neutral on a revisit); the
  // hooks below read it. `graceSaves` is the per-realm grace pool (defensive
  // relics); `waveForgivenessReady` is the per-wave forgive-a-slip proc.
  private combat: CombatLoadout = resolveCombatLoadout([], "sunken-bell");
  private graceSaves = 0;
  private waveForgivenessReady = false;
  private snowFoxTripNoticed = false;
  private shrineForgivenessNoticed = false;
  private graceSaveNoticed = false;

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
    this.clearBellKeeperLectern();
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.ghosts = [];
    this.activeTargets = [];
    this.bossWordAnchors = [];
    this.olinWordAnchors = [];
    this.aurlandWordAnchors = [];
    this.glassFishWordAnchors = [];
    this.forkChoiceWordAnchors = [];
    this.descentLanterns = [];
    this.descentLanternWordAnchors = [];
    this.revisitMemoryCue = null;
    this.revisitMemoryWordAnchor = null;
    this.beatPhase = "free";
    this.beatLocked = false;
    this.rhythmPracticeActive = false;
    this.rhythmPracticeTarget = null;
    this.rhythmPracticeCoach = null;
    this.breath.reset();
    this.breathActive = false;
    this.snowFoxTripNoticed = false;
    this.shrineForgivenessNoticed = false;
    this.graceSaveNoticed = false;
    this.onWaveCleared = null;
    this.fork1Choice = resolveRealmFork("sunken-bell", "fork1", this.store.get().realms["sunken-bell"], this.store.get().satchel) as typeof this.fork1Choice;
    this.fork2Choice = resolveRealmFork("sunken-bell", "fork2", this.store.get().realms["sunken-bell"], this.store.get().satchel) as typeof this.fork2Choice;
    this.glassFishCompanion = null;
    this.doorChantCue = null;
    this.doorForceCue = null;
    this.doorwayStage = null;
    this.doorwayPassagePending = false;
    this.doorwayPassageToken += 1;
    this.aurlandFateCue = null;
    this.aurlandImage = undefined;
    this.aurlandToken = undefined;
    this.aurlandBindingPending = false;
    this.bellTongueCue = null;
    this.quietLordIntruded =
      this.store.get().realms["sunken-bell"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("sunken-bell-backdrop", sunkenBellBackdrop);
    this.load.image("bell-nave-doorway", naveDoorway);
    this.load.image("bell-nave-door-leaves", naveDoorLeaves);
    this.load.image("bell-reading-lectern", readingLecternSprite);
    this.load.image("bell-ghost", bellGhostSprite);
    this.load.image("bell-warden", bellWardenSprite);
    this.load.image("olin", olinSprite);
    this.load.image("aurland", aurlandSprite);
    this.load.image("bell-trident-token", tridentTokenSprite);
    this.load.image("bell-companion-glass-fish", glassFishSprite);
    this.load.image("bell-companion-snow-fox", snowFoxSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.chapterMenu = installChapterMenu(this, {
      store: this.store,
      hasClaim: () => !!this.typingInput && (this.typingInput.hasClaim() || this.typingInput.getTypingBuffer().length > 0),
      onLeave: () => this.scene.start("PortalChamberScene", { store: this.store }),
      leaveHint: "Returning to the chamber starts this realm again. Your completed journeys and collected keepsakes stay saved.",
    });
    this.cameras.main.fadeIn(600, 8, 24, 32);
    this.add
      .image(0, 0, "sunken-bell-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
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
    addAmbientDrift(this, {
      kind: "bubble",
      count: 12,
      depth: -0.35,
      area: { x: WREN_X - 260, y: WREN_Y - 190, width: 520, height: 180 },
      alpha: 0.2,
      minSize: 4,
      maxSize: 10,
      driftX: 34,
      driftY: -210,
      minDurationMs: 4300,
      maxDurationMs: 9200,
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
    // Passive relics own the satchel lane; the breath meter uses the otherwise
    // empty right-side slot so late-game icon overflows never collide with it.
    this.band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
      maxOneShots: 1,
    });
    const band = this.band;
    this.createEchoDim();

    this.narration = new NarrationManager(this, {
      y: 120,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });
    this.reading = new ChapterReading(this, () => Math.max(316, this.narration.bottom() + 40));
    // Bell is "quiet listening" — softer per-keystroke feedback than the
    // Winter Mountain default. 120ms / 0.002 shake instead of 80ms / 0.002.
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => {
        bobWrenSprite(this.wrenSprite);
        if (this.rhythmPracticeActive) this.rhythmPracticeCoach?.setText("Good. Finish the remaining letters freely.");
      },
      onMiss: () => {
        if (this.rhythmPracticeActive) return;
        flashWrenMiss(this.wrenSprite);
        if (!reducedMotion(this)) this.cameras.main.shake(120, 0.002);
      },
      onClaim: () => playClaim(),
    });
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      showSoul: false,
      onSustainedLowHeart: () =>
        showLowHeartFeedback({
          scene: this,
          band: this.band,
          body: this.wrenContainer,
          kind: "bubble",
          color: BELL_BURST_COLOR,
        }),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Air gauge — docked into the Bell's empty one-shot slot. Hidden until
    // choir-wave combat begins. Depth > the band surface.
    this.breathAnchor = band.oneShotSlots[0] ?? {
      x: band.satchelAnchor.x + 520,
      y: band.satchelAnchor.y,
    };
    // Keep the existing toll/answer pulses in the HUD, away from Wren and
    // advancing ghosts. The ring's opening remains the timing cue in muted play.
    const ringX = this.breathAnchor.x + 260;
    const ringY = this.breathAnchor.y - 20;
    this.beatRing = this.add.graphics().setDepth(1500).setAlpha(0);
    this.beatRing.x = ringX;
    this.beatRing.y = ringY;
    this.offbeatRing = this.add.graphics().setDepth(1500).setAlpha(0);
    this.offbeatRing.x = ringX;
    this.offbeatRing.y = ringY;
    this.rhythmLabel = this.add
      .text(ringX + 76, ringY, "rhythm", {
        fontFamily: SERIF,
        fontSize: "18px",
        fontStyle: "italic",
        color: "#d3dce0",
      })
      .setOrigin(0, 0.5)
      .setDepth(1500)
      .setAlpha(0);
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.aurlandBindingPending = false;
      this.clearRhythmPractice();
      this.clearBellKeeperLectern();
      this.reading.destroy();
      this.chapterMenu?.destroy();
      this.typingInput.reset();
      this.beatClock.stop();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
      this.clearBellForkCues();
      this.clearAurlandWordAnchors();
      this.clearAurlandToken();
      this.descentLanterns.forEach((lantern) => lantern.container.destroy());
      this.descentLanterns = [];
      this.dismissRevisitMemoryCue(false);
      this.olinImage?.destroy();
      this.olinImage = undefined;
      this.olinPew?.destroy();
      this.olinPew = undefined;
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
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "bubble",
      color: BELL_BURST_COLOR,
    });
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
    this.readThen(() => this.deliverRevisitPassage(words));
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
      this.registerActiveTarget(target);
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

  private createEchoDim(): void {
    // The echo hides the world briefly, never the HUD's timing invitation.
    // A camera flash would composite black over the rhythm ring as it fades.
    this.echoDim = this.add.graphics().setScrollFactor(0).setDepth(1300).setAlpha(0);
    this.echoDim.fillStyle(0x000000, 1);
    this.echoDim.fillRect(0, 0, this.scale.width, this.band.bandTopY);
  }

  /** Fired on every toll. Pulses the on-beat ring, and — during an antiphon
   *  (off-beat) wave — opens the counter-pulse at the start of the centered
   *  half-beat window so its entire visible span accepts a new word. */
  private onBeatTick(): void {
    if (this.beatPhase === "free") return;
    this.rhythmLabel.setAlpha(0.9);
    this.pulseBeatRing();
    if (this.beatPhase === "off") {
      const answerOpensAt = this.beatClock.getTempo() / 2 - this.beatClock.getWindowMs() / 2;
      this.time.delayedCall(answerOpensAt, () => {
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
      duration: this.beatClock.getWindowMs(),
      ease: "Sine.easeOut",
    });
    // Tier 4 — warm-light (Firefly Lantern / Beacon Spark / Pelt) shortens the
    // per-toll echo-dim so words stay readable a little longer. Bounded to ≤33%,
    // so the dim never disappears (it stays a real read-ahead hazard).
    this.tweens.killTweensOf(this.echoDim);
    this.echoDim.setAlpha(0);
    if (!this.rhythmPracticeActive && !reducedFlashes(this)) {
      this.echoDim.setAlpha(1);
      this.tweens.add({
        targets: this.echoDim,
        alpha: 0,
        duration: 300 * (1 - this.combat.warmLight),
        ease: "Linear",
      });
    }
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
      duration: this.beatClock.getWindowMs(),
      ease: "Sine.easeOut",
    });
  }

  /** Turn the air stake on/off for an encounter. Resets to full when enabled;
   *  hides the gauge when disabled. */
  private setBreathActive(active: boolean): void {
    const wasActive = this.breathActive;
    if (!active) {
      this.breathMeterWakeToken += 1;
      this.tweens.killTweensOf(this.breathBar);
      this.tweens.killTweensOf(this.breathLabel);
    }
    this.breathActive = active;
    if (active) this.breath.reset();
    this.drawBreathBar();
    if (active && !wasActive) this.stageBreathMeterEntry();
  }

  /** Redraw the air gauge in the console band's satchel zone from the current
   *  breath fraction. Frost when full, ember when low. Hidden entirely when the
   *  stake is inactive. Drawn around breathAnchor (docked like Winter's candles). */
  private drawBreathBar(): void {
    const bar = this.breathBar;
    bar.clear();
    if (!this.breathActive) {
      this.tweens.killTweensOf(bar);
      this.tweens.killTweensOf(this.breathLabel);
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

  private stageBreathMeterEntry(): void {
    const wakeToken = ++this.breathMeterWakeToken;
    this.stageBreathMeterObject(this.breathLabel, wakeToken, 70, { offsetY: 5 });
    this.stageBreathMeterObject(this.breathBar, wakeToken, 95, { offsetY: 8 });
  }

  private stageBreathMeterObject(
    object: Phaser.GameObjects.GameObject,
    wakeToken: number,
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

    this.tweens.killTweensOf(item);
    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + (opts.offsetY ?? 8));
    this.time.delayedCall(delayMs, () => {
      if (!this.breathActive || this.breathMeterWakeToken !== wakeToken || !object.scene) {
        return;
      }
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 230,
        ease: "Sine.easeOut",
      });
    });
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
      this.noticeGraceSave("A warding relic holds your breath.");
      return;
    }
    this.playBreathGaspCue();
    if (!reducedFlashes(this)) this.cameras.main.flash(280, 0, 0, 0, false);
    playWrenHurt(this.wrenSprite, { knockX: 0 });
    playDamageThud();
    flashDamageVignette(this);
    this.breath.gasp();
    this.drawBreathBar();
  }

  /** Air-empty damage belongs to the docked air gauge before Wren gasps. */
  private playBreathGaspCue(): void {
    const wrenX = this.wrenContainer?.scene ? this.wrenContainer.x : WREN_X;
    const wrenY = this.wrenContainer?.scene ? this.wrenContainer.y - 106 : WREN_Y - 106;

    playMeterPulse(this, {
      x: this.breathAnchor.x,
      y: this.breathAnchor.y,
      width: 178,
      height: 28,
      color: PALETTE_HEX.ember,
      depth: 1502,
      durationMs: 420,
    });
    playClaimLine(
      this,
      this.breathAnchor.x,
      this.breathAnchor.y,
      wrenX,
      wrenY,
      { color: PALETTE_HEX.ember, depth: 58, durationMs: 380 },
    );
    if (this.wrenContainer?.scene) {
      playBodyImpact(this, this.wrenContainer, {
        kind: "bubble",
        color: PALETTE_HEX.ember,
        offsetY: -104,
        depth: 58,
        ringRadius: 34,
        count: 8,
        durationMs: 360,
      });
    }
  }

  /** Spend one grace-pool save (a defensive relic). Returns true if one was
   *  available and consumed. */
  private spendGraceSave(): boolean {
    if (this.graceSaves <= 0) return false;
    this.graceSaves -= 1;
    return true;
  }

  /** Gentle Bell shimmer + a one-word caption when a relic spares Wren — the
   *  legible "your relic just did something" beat, distinct from the harsh
   *  damage cue. */
  private flashGraceCue(label: "held" | "forgiven"): void {
    if (!reducedFlashes(this)) this.cameras.main.flash(160, 120, 170, 200, false);
    const anchorX = this.wrenContainer?.scene ? this.wrenContainer.x : WREN_X;
    const anchorY = this.wrenContainer?.scene
      ? Math.max(300, Math.min(this.scale.height - 330, this.wrenContainer.y - 116))
      : WREN_Y - 70;

    const plate = this.add
      .graphics()
      .setPosition(anchorX, anchorY)
      .setDepth(59)
      .setAlpha(0.76);
    plate.fillStyle(0x10242a, 0.38);
    plate.fillRoundedRect(-86, -22, 172, 44, 12);
    plate.lineStyle(2, BELL_BURST_COLOR, 0.5);
    plate.strokeRoundedRect(-78, -16, 156, 32, 10);
    plate.lineStyle(3, BELL_BURST_COLOR, 0.55);
    plate.strokeEllipse(-38, 0, 22, 12);
    plate.strokeEllipse(0, 0, 26, 14);
    plate.strokeEllipse(40, 0, 22, 12);

    if (this.wrenContainer?.scene) {
      playBodyImpact(this, this.wrenContainer, {
        kind: "bubble",
        color: BELL_BURST_COLOR,
        offsetY: -104,
        depth: 58,
        ringRadius: 32,
        count: 8,
        durationMs: 360,
      });
    }

    const txt = this.add
      .text(anchorX, anchorY, label, {
        fontFamily: SERIF,
        fontSize: "24px",
        fontStyle: "italic",
        color: PALETTE.frost,
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
    this.time.delayedCall(COMPANION_TRIP_DELAY_MS, () => {
      const tripped = tripMostAdvancedFoe(this, this.ghosts, {
        textureKey: "bell-companion-snow-fox",
        startX: this.wrenContainer.x - 120,
        startY: this.wrenContainer.y - 18,
        height: 74,
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

  private noticeShrineForgiveness(): void {
    if (this.shrineForgivenessNoticed) return;
    this.shrineForgivenessNoticed = true;
    this.band.showNotice("Shrine-Token forgives the slip.", {
      label: "relic",
      itemId: "shrine-token",
      durationMs: 1600,
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
    this.time.delayedCall(980, () => {
      if (easiest.isDefeated() || !easiest.container.scene) return;
      playClaimLine(
        this,
        this.band.satchelAnchor.x + 58,
        this.band.bandTopY - 10,
        easiest.container.x,
        easiest.container.y - 70,
        { color: PALETTE_HEX.brass, depth: 58, durationMs: 340 },
      );
      playBodyImpact(this, easiest.container, {
        kind: "mote",
        color: PALETTE_HEX.brass,
        offsetY: -70,
        depth: 58,
        ringRadius: 30,
        count: 7,
        durationMs: 360,
      });
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
    if (this.aurlandBindingPending || this.doorwayPassagePending) {
      event.preventDefault();
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

    // This one-target rehearsal has no accuracy/Heart cost. Correct keys still
    // pass through the real rhythm gate and controller; a slip simply waits.
    if (this.rhythmPracticeActive &&
      key.toLowerCase() !== this.rhythmPracticeTarget?.remaining()[0]) {
      this.rhythmPracticeCoach?.setText("Try the next shown letter. There is no hurry.");
      return;
    }

    // Exploration, door choices and post-boss passages use ordinary typing.
    // Only the explicitly taught choir/Warden encounters demand rhythm starts.
    if (this.beatPhase === "free") {
      this.typingInput.handleChar(key);
      return;
    }

    // Resolve this encounter's accept window — on-beat normally, or the
    // half-beat during an antiphon (off-beat) wave.
    const inWindow =
      this.beatPhase === "off"
        ? this.beatClock.isInOffbeatWindow()
        : this.beatClock.isInWindow();

    const decision = decideBeatGate({
      hasClaim: this.typingInput.hasPendingInput(),
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
    if (this.rhythmPracticeActive) {
      this.rhythmPracticeCoach?.setText("Wait for the blue ring, then start with t.");
      return;
    }
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
      this.noticeShrineForgiveness();
      return;
    }
    this.playRhythmStumbleCue(isDesync);
    flashWrenMiss(this.wrenSprite);
    if (!reducedMotion(this)) this.cameras.main.shake(80, 0.0025);
    this.typingInput.getStats().record(false);
    if (isDesync) this.typingInput.resetClaimedProgress();
    if (this.breathActive) {
      const emptied = this.breath.stumble();
      this.drawBreathBar();
      if (emptied) this.gaspKnockback();
    }
  }

  /** Rhythm mistakes belong to the missed toll/answer ring before Wren flinches. */
  private playRhythmStumbleCue(isDesync: boolean): void {
    const source = this.beatPhase === "off" ? this.offbeatRing : this.beatRing;
    const color = isDesync ? PALETTE_HEX.ember : BELL_BURST_COLOR;
    const ring = this.add
      .graphics()
      .setPosition(source.x, source.y)
      .setDepth(58)
      .setAlpha(isDesync ? 0.82 : 0.68);
    ring.lineStyle(isDesync ? 4 : 3, color, isDesync ? 0.76 : 0.58);
    ring.strokeCircle(0, 0, isDesync ? 42 : 34);
    ring.lineBetween(-28, -18, 30, 20);
    ring.lineBetween(-22, 18, 22, -18);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: isDesync ? 1.5 : 1.34,
      duration: isDesync ? 430 : 340,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });

    if (this.breathActive) {
      playClaimLine(
        this,
        source.x,
        source.y,
        this.breathAnchor.x,
        this.breathAnchor.y,
        { color, depth: 58, durationMs: 320 },
      );
      playMeterPulse(this, {
        x: this.breathAnchor.x,
        y: this.breathAnchor.y,
        width: 174,
        height: 26,
        color,
        depth: 1502,
        durationMs: 300,
      });
      return;
    }

    if (this.wrenContainer?.scene) {
      playClaimLine(
        this,
        source.x,
        source.y,
        this.wrenContainer.x,
        this.wrenContainer.y - 106,
        { color, depth: 58, durationMs: 320 },
      );
    }
  }

  // ─── Act 1: Arrival ───────────────────────────────────────────────────────

  private startArrival(): void {
    // Act 1 pre-beat: input flows freely until Olin teaches the bell's rhythm.
    // BeatClock stays not-running here; gating engages only once start() is
    // called at the end of Olin's exchange.
    this.narration.say("sunken_intro_arrival");
    this.setStoryObjective("Read Runa's warning, then continue into the drowned cathedral.");
    playPortalArrivalWake(this, this.wrenContainer, {
      kind: "bubble",
      color: BELL_BURST_COLOR,
    });
    this.showDescentLanterns();
    this.readThen(() => this.startDescent());
  }

  // ─── Act 1: The Descent (lanterns) ────────────────────────────────────────

  private startDescent(): void {
    this.setStoryObjective("Light the descent lanterns. Type the words shown freely.");
    let index = 0;

    const advance = (): void => {
      if (index >= DESCENT_LANTERN_WORDS.length) {
        this.time.delayedCall(320, () => {
          this.swimWrenToX(WREN_X, () => {
            this.resetWrenToFront();
            this.time.delayedCall(360, () => this.startOlinNPC());
          });
        });
        return;
      }

      const lanternIndex = index;
      const word = DESCENT_LANTERN_WORDS[lanternIndex];
      const pos = DESCENT_LANTERN_POSITIONS[lanternIndex];
      const lantern = this.showDescentLantern(lanternIndex);
      if (!word || !pos || !lantern) return;
      this.activateDescentLantern(lantern);
      let lanternAnchor: WordBodyAnchorHandle | null = null;
      const releaseLanternAnchor = (): void => {
        if (!lanternAnchor) return;
        this.releaseDescentLanternWordAnchor(lanternAnchor);
        lanternAnchor = null;
      };

      const wordPos = this.descentLanternWordPosition(lanternIndex);
      const target = this.makeWord({
        scene: this,
        word,
        x: wordPos.x,
        y: wordPos.y,
        fontSize: 36,
        onClaim: () => {
          this.swimWrenTowardDescentLantern(lanternIndex);
          playWrenFocus(this.wrenSprite, {
            faceLeft: wordPos.x < this.wrenContainer.x,
          });
          this.pulseDescentLantern(lantern, false);
        },
        onComplete: () => {
          playWrenAction(this.wrenSprite, {
            faceLeft: wordPos.x < this.wrenContainer.x,
          });
          releaseLanternAnchor();
          this.lightDescentLantern(lantern);
          this.clearActiveTargets();
          index += 1;
          this.time.delayedCall(520, advance);
        },
      });
      lanternAnchor = this.attachDescentLanternWordAnchor(lantern, target);
      this.registerActiveTarget(target);
    };

    advance();
  }

  private descentLanternWordPosition(index: number): { x: number; y: number } {
    const pos = DESCENT_LANTERN_POSITIONS[index];
    if (!pos) return { x: WREN_X, y: WREN_Y - 180 };
    if (index === 1) return { x: pos.x, y: pos.y - 86 };
    return { x: pos.x, y: pos.y - 60 };
  }

  private descentLanternWrenX(index: number): number {
    const pos = DESCENT_LANTERN_POSITIONS[index];
    if (!pos) return WREN_X;
    if (index === 0) return pos.x + 128;
    if (index === 2) return pos.x - 128;
    return pos.x - 122;
  }

  private swimWrenTowardDescentLantern(
    index: number,
    onComplete?: () => void,
  ): void {
    this.swimWrenToX(this.descentLanternWrenX(index), onComplete);
  }

  private swimWrenToX(x: number, onComplete?: () => void): void {
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
      durationMs: 240,
    });
    this.tweens.add({
      targets: this.wrenContainer,
      x,
      duration: Phaser.Math.Clamp(distance * 1.9, 320, 780),
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

  private showDescentLanterns(): void {
    DESCENT_LANTERN_POSITIONS.forEach((_, i) => this.showDescentLantern(i));
  }

  private showDescentLantern(index: number): DescentLantern | null {
    const existing = this.descentLanterns[index];
    if (existing?.container.scene) return existing;
    const pos = DESCENT_LANTERN_POSITIONS[index];
    if (!pos) return null;
    const lantern = this.drawDescentLantern(pos.x, pos.y, index);
    this.descentLanterns[index] = lantern;
    return lantern;
  }

  private drawDescentLantern(x: number, y: number, index: number): DescentLantern {
    const centerLantern = index === 1;
    const container = this.add
      .container(x, y)
      .setDepth(centerLantern ? 1 : -1)
      .setAlpha(0);

    const tether = this.add.graphics();
    const tetherDrop = centerLantern ? 176 : 148;
    tether.lineStyle(3, 0x071a20, centerLantern ? 0.42 : 0.3);
    tether.lineBetween(0, -tetherDrop, 0, -38);
    tether.lineStyle(1.5, 0x3f6973, centerLantern ? 0.42 : 0.28);
    tether.lineBetween(0, -tetherDrop, 0, -38);
    tether.lineStyle(1, 0x6d9aa4, centerLantern ? 0.24 : 0.14);
    for (let linkY = -tetherDrop + 18; linkY < -52; linkY += 24) {
      tether.strokeEllipse(0, linkY, 8, 16);
    }
    tether.lineStyle(3, 0x071a20, centerLantern ? 0.36 : 0.24);
    tether.lineBetween(-28, -tetherDrop - 8, 28, -tetherDrop - 8);
    tether.lineStyle(2, 0x5a7f7d, centerLantern ? 0.34 : 0.22);
    tether.lineBetween(-28, -tetherDrop - 8, 28, -tetherDrop - 8);
    tether.strokeCircle(0, -tetherDrop - 2, 7);
    tether.lineStyle(1.3, 0xa9c3bd, centerLantern ? 0.24 : 0.16);
    tether.lineBetween(-22, -38, 22, -38);
    container.add(tether);

    const glow = this.add.graphics().setAlpha(centerLantern ? 0.24 : 0.2);
    glow.fillStyle(0x3d8d95, centerLantern ? 0.1 : 0.06);
    glow.fillEllipse(0, 8, centerLantern ? 112 : 92, centerLantern ? 122 : 100);
    glow.fillStyle(0xc9a14a, centerLantern ? 0.08 : 0.05);
    glow.fillEllipse(0, 6, centerLantern ? 54 : 44, centerLantern ? 76 : 64);
    glow.lineStyle(1.2, 0x70a8ad, centerLantern ? 0.14 : 0.08);
    glow.strokeEllipse(0, 7, centerLantern ? 92 : 74, centerLantern ? 104 : 86);
    container.add(glow);

    const body = this.add.graphics();
    this.drawDescentLanternCage(body, false, centerLantern);
    container.add(body);

    const flame = this.add.graphics().setAlpha(0.12);
    flame.fillStyle(0xc9a14a, centerLantern ? 0.48 : 0.36);
    flame.fillEllipse(0, 4, centerLantern ? 28 : 22, centerLantern ? 40 : 34);
    flame.fillStyle(0xf3ead2, centerLantern ? 0.84 : 0.72);
    flame.fillEllipse(0, 2, centerLantern ? 12 : 10, centerLantern ? 24 : 20);
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
    return { container, glow, body, flame, center: centerLantern };
  }

  private activateDescentLantern(lantern: DescentLantern): void {
    this.tweens.killTweensOf([lantern.glow, lantern.flame]);
    lantern.glow.setAlpha(0.56).setScale(1);
    lantern.flame.setAlpha(0.42).setScale(1);
    this.tweens.add({
      targets: [lantern.glow, lantern.flame],
      scaleX: 1.06,
      scaleY: 1.1,
      alpha: 0.7,
      duration: 820,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    playActorAttention(this, lantern.container, {
      tint: BELL_BURST_COLOR,
      scale: 1.018,
      durationMs: 220,
    });
  }

  private drawDescentLanternCage(
    g: Phaser.GameObjects.Graphics,
    lit: boolean,
    centerLantern: boolean,
  ): void {
    g.clear();
    const bodyAlpha = lit ? 0.96 : centerLantern ? 0.86 : 0.74;
    const rimAlpha = lit ? 0.82 : centerLantern ? 0.48 : 0.34;
    const cageWidth = centerLantern ? 48 : 42;
    const shoulderWidth = cageWidth + 10;
    const bottomY = centerLantern ? 44 : 40;
    const cageColor = lit ? 0x274a52 : 0x173039;

    g.fillStyle(0x06171d, bodyAlpha * 0.42);
    g.fillEllipse(0, 31, shoulderWidth + 12, 11);

    g.fillStyle(0x102832, bodyAlpha * 0.94);
    g.fillEllipse(0, -31, shoulderWidth, 18);
    g.lineStyle(3, 0x06171d, bodyAlpha * 0.74);
    g.strokeEllipse(0, -31, shoulderWidth, 18);
    g.lineStyle(1.5, 0x699ca2, rimAlpha * 0.56);
    g.strokeEllipse(0, -31, shoulderWidth, 18);

    g.fillStyle(cageColor, bodyAlpha);
    g.fillRoundedRect(-cageWidth / 2, -30, cageWidth, 58, 11);
    g.fillTriangle(-cageWidth / 2 + 6, 22, cageWidth / 2 - 6, 22, 0, bottomY);

    g.fillStyle(0xc9a14a, lit ? 0.22 : centerLantern ? 0.14 : 0.1);
    g.fillRoundedRect(-cageWidth / 2 + 8, -19, cageWidth - 16, 36, 8);

    g.lineStyle(3, 0x06171d, bodyAlpha * 0.72);
    g.strokeRoundedRect(-cageWidth / 2, -30, cageWidth, 58, 11);
    g.beginPath();
    g.moveTo(-cageWidth / 2 + 6, 22);
    g.lineTo(cageWidth / 2 - 6, 22);
    g.lineTo(0, bottomY);
    g.closePath();
    g.strokePath();

    g.lineStyle(1.6, 0x8db7ae, rimAlpha);
    g.strokeRoundedRect(-cageWidth / 2, -30, cageWidth, 58, 11);
    g.beginPath();
    g.moveTo(-cageWidth / 2 + 6, 22);
    g.lineTo(cageWidth / 2 - 6, 22);
    g.lineTo(0, bottomY);
    g.closePath();
    g.strokePath();

    g.lineStyle(1.4, 0x06171d, 0.45);
    g.lineBetween(-12, -20, -12, 25);
    g.lineBetween(0, -22, 0, bottomY - 5);
    g.lineBetween(12, -20, 12, 25);
    g.lineStyle(1, 0x75adb6, lit ? 0.58 : centerLantern ? 0.36 : 0.26);
    g.lineBetween(-12, -20, -12, 25);
    g.lineBetween(0, -22, 0, bottomY - 5);
    g.lineBetween(12, -20, 12, 25);

    g.lineStyle(1.2, 0x90b4ad, lit ? 0.38 : 0.2);
    g.lineBetween(-cageWidth / 2 + 5, -5, cageWidth / 2 - 5, -5);
    g.lineBetween(-cageWidth / 2 + 7, 15, cageWidth / 2 - 7, 15);

    g.fillStyle(0xd7fbff, lit ? 0.56 : 0.24);
    g.fillCircle(0, bottomY + 2, centerLantern ? 3.8 : 3.2);
  }

  private lightDescentLantern(lantern: DescentLantern): void {
    this.tweens.killTweensOf([lantern.glow, lantern.flame]);
    this.drawDescentLanternCage(lantern.body, true, lantern.center);
    lantern.glow.setAlpha(0.9).setScale(1.16);
    lantern.flame.setAlpha(1).setScale(1.18, 1.28);
    this.tweens.add({
      targets: [lantern.glow, lantern.flame],
      alpha: { from: 0.78, to: 1 },
      scaleX: "+=0.04",
      scaleY: "+=0.06",
      duration: 1050,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.pulseDescentLantern(lantern, true);
  }

  private dismissDescentLanterns(): void {
    this.clearDescentLanternWordAnchors();
    for (const lantern of this.descentLanterns) {
      if (!lantern?.container.scene) continue;
      this.tweens.killTweensOf([lantern.container, lantern.glow, lantern.flame]);
      this.tweens.add({
        targets: lantern.container,
        alpha: 0,
        y: lantern.container.y - 18,
        duration: 420,
        ease: "Sine.easeIn",
        onComplete: () => lantern.container.destroy(),
      });
    }
    this.descentLanterns = [];
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
    this.dismissDescentLanterns();
    this.setStoryObjective("Answer Old Olin. Type the words shown freely.");
    // Draw Olin — hunched silhouette on a pew
    this.drawOlin();

    this.setNarrator("tell me your name, child.", "Old Olin");
    this.readThen(() => {
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
            "when the blue ring opens, begin a word. its first letter follows the toll; the rest flows freely.",
            "Old Olin",
          );
          this.readThen(() => {
            this.setNarrator(
              "i taught the bell its name. i can teach you if you let me.",
              "Old Olin",
            );
            this.readThen(() => {
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
              this.registerActiveTarget(teachTarget);
            });
          });
        },
      });
      this.registerActiveTarget(nameTarget);
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
    this.setStoryObjective("Read the rhythm lesson, then try one word safely with Olin.");
    this.readThen(() => this.startRhythmPractice());
  }

  /** One real first-letter rhythm gate, with no advancing foe or air stake. */
  private startRhythmPractice(): void {
    this.clearRhythmPractice();
    this.clearActiveTargets();
    this.rhythmPracticeActive = true;
    this.beatPhase = "on";
    this.beatLocked = false;
    this.setBreathActive(false);
    this.setNarrator("Try tide with me. Begin its t when the blue ring opens; finish i d e at your own pace.", "Old Olin");
    this.band.setObjective("Practice: first letter on blue, then finish freely. No air or Heart is lost.");
    const position = this.olinPassageWordPosition();
    this.rhythmPracticeCoach = this.add.text(position.x, position.y + 66,
      "Blue ring → start t; then finish i d e freely.", {
        fontFamily: SERIF, fontSize: "23px", color: PALETTE.frost,
        align: "center", wordWrap: { width: 560 }, stroke: "#0b0a0f", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(71);
    const target = this.makeOlinWord({
      scene: this, word: "tide", x: position.x, y: position.y, fontSize: 48,
      onComplete: () => {
        if (!this.rhythmPracticeActive || this.rhythmPracticeTarget !== target) return;
        this.clearRhythmPractice();
        this.clearActiveTargets();
        this.beatClock.stop();
        this.setStoryObjective("Practice complete. Press Enter or Space to meet the tide-ghosts.");
        this.setNarrator("There. Your first letter followed the toll, and the rest found its own way. Now listen for it among the ghosts.", "Old Olin");
        this.readThen(() => this.beginRhythmEncounters());
      },
    });
    this.rhythmPracticeTarget = target;
    this.registerActiveTarget(target);
    this.rhythmLabel.setAlpha(0.9);
    this.beatClock.setTempo(2000);
    this.beatClock.start();
  }

  private clearRhythmPractice(): void {
    this.rhythmPracticeActive = false;
    this.rhythmPracticeCoach?.destroy();
    this.rhythmPracticeCoach = null;
    if (this.rhythmPracticeTarget) {
      const target = this.rhythmPracticeTarget;
      this.typingInput.unregister(target);
      target.destroy();
      this.activeTargets = this.activeTargets.filter((value) => value !== target);
    }
    this.rhythmPracticeTarget = null;
  }

  /** Original combat clock and encounter delay begin only after rehearsal. */
  private beginRhythmEncounters(): void {
    this.beatPhase = "on";
    this.rhythmLabel.setAlpha(0.9);
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
    this.beatPhase = "on";
    // Encounter bookend — softer than Winter Mountain's 220/0.005 to match
    // the Bell's "quiet listening" tone. Skipped in the truly reverent
    // moments earlier in Act 1 (descent, Olin); fires here because this is
    // where the realm tips into combat.
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.dismissOlin();
    this.setBandSpeaker("Runa");
    this.ghosts = [];
    this.setNarrator("The tide-ghosts draw close. Start each word as the blue rhythm ring opens, then finish its letters freely.");
    this.band.setObjective("First letter on the blue pulse, then finish freely. Drive back ghosts; watch air.");
    // Combat begins — the air stake goes live for the choir waves.
    this.setBreathActive(true);
    this.onWaveCleared = () => this.onFirstEncounterCleared();
    const words = ["tide", "salt", "still"];
    const positions = [
      { x: -100, restX: 300, restY: 700, side: "left" as const },
      { x: this.scale.width + 100, restX: 1360, restY: 750, side: "right" as const },
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
    this.setStoryObjective("The tide-ghosts recede. The nave opens ahead.");
    this.time.delayedCall(1200, () => this.startAct2());
  }

  // ─── Act 2: Through the Cathedral ────────────────────────────────────────

  private startAct2(): void {
    this.ghosts = [];
    this.startWave1();
  }

  private startWave1(): void {
    this.beatPhase = "on";
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.onWaveCleared = () => this.onWave1Cleared();
    this.narration.say("sunken_choir_wave1");
    this.band.setObjective("First letter on the blue pulse, then finish freely. Watch the air meter.");
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
    this.setStoryObjective("The choir falls quiet. Another answer gathers between the tolls.");
    // §5.5.7 / Tier 1 — the choir answers off the beat before the splitter wave.
    this.time.delayedCall(1200, () => this.startAntiphon());
  }

  // ─── Act 2: The Antiphon (off-beat call-and-response) ────────────────────

  private startAntiphon(): void {
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.ghosts = [];
    // Flip the accept window to the half-beat — answer BETWEEN the tolls.
    this.beatPhase = "off";
    this.onWaveCleared = () => this.onAntiphonCleared();
    this.narration.say("sunken_antiphon_intro");
    this.band.setObjective("First letter on the orange pulse between tolls, then finish freely. Watch air.");
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
    this.setStoryObjective("The choir's answer fades. More shapes gather in the nave.");
    this.time.delayedCall(1200, () => this.startWave2());
  }

  private startWave2(): void {
    this.beatPhase = "on";
    playWaveSting();
    if (!reducedMotion(this)) this.cameras.main.shake(140, 0.003);
    this.pulseBellWave();
    this.onWaveCleared = () => this.onWave2Cleared();
    this.narration.say("sunken_choir_wave2");
    this.band.setObjective("Blue pulse: first letter, then finish freely. Splitting ghosts become two; watch air.");

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
        const anchor = this.quietLordIntrusionAnchor();
        playQuietLordIntrusion(this, {
          x: anchor.x,
          y: anchor.y,
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

  private quietLordIntrusionAnchor(): { x: number; y: number } {
    let threat: MovingWordEnemy | null = null;
    for (const ghost of this.ghosts) {
      if (ghost.isDefeated() || !ghost.container.scene) continue;
      if (!threat || ghost.advanceProgress() > threat.advanceProgress()) {
        threat = ghost;
      }
    }

    if (!threat) return { x: this.scale.width / 2, y: 380 };
    return {
      x: Phaser.Math.Clamp(threat.container.x, 260, this.scale.width - 260),
      y: Phaser.Math.Clamp(threat.container.y - 150, 280, this.scale.height - 360),
    };
  }

  private onWave2Cleared(): void {
    this.setStoryObjective("The choir recedes. A room opens off the nave.");
    this.time.delayedCall(1200, () => this.startBellKeepersChamber());
  }

  // ─── Act 2: Bell-Keeper's Chamber ────────────────────────────────────────

  private startBellKeepersChamber(): void {
    this.clearBellKeeperLectern();
    // Choir combat is over — retire the air gauge until the boss/fork section
    // (which has its own tempo + de-sync stakes, not the breath economy).
    this.setBreathActive(false);
    this.setNarrator("A room off the nave. Something on a stand.");
    this.setStoryObjective("Type read it to examine the writing on the stand. No rhythm needed.");
    const cue = this.add
      .container(this.scale.width / 2 - 260, this.scale.height - 330)
      .setDepth(42)
      .setAlpha(0);
    this.bellKeeperLectern = cue;
    cue.add(addLocalGroundShadow(this, 130, 18, { y: 68, alpha: 0.18 }));
    cue.add(this.drawBellKeeperLectern());
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
    if (reducedMotion(this)) cue.setAlpha(1);
    else this.tweens.add({ targets: cue, alpha: 1, duration: 360, ease: "Sine.easeOut" });
    let cueAnchor: WordBodyAnchorHandle | null = null;
    const releaseCueAnchor = (): void => {
      cueAnchor?.destroy();
      cueAnchor = null;
    };
    let read = false;
    const target = this.makeWord({
      scene: this,
      word: "read it",
      x: cue.x,
      y: cue.y - 166,
      fontSize: 36,
      burstColor: BELL_BURST_COLOR,
      onClaim: () => {
        playWrenFocus(this.wrenSprite);
        playClaimLine(
          this,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          cue.x,
          cue.y - 76,
          { color: BELL_BURST_COLOR, depth: 58 },
        );
      },
      onAdvance: () =>
        playBodyTypePulse(this, cue, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -76,
          depth: 58,
          ringRadius: 24,
        }),
      onComplete: () => {
        if (read || this.bellKeeperLectern !== cue || !cue.scene) return;
        read = true;
        releaseCueAnchor();
        playBodyImpact(this, cue, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          offsetY: -76,
          depth: 58,
          ringRadius: 48,
          count: 10,
        });
        this.clearActiveTargets();
        this.store.update((s) => {
          if (!s.almanacLore.includes("old-olins-memory")) {
            s.almanacLore.push("old-olins-memory");
          }
        });
        playChime();
        this.setNarrator("“The bell's name is not mine to teach. Only to remember.” Olin's words settle onto a new Almanac page.");
        this.setStoryObjective("Old Olin's Memory is recorded. Continue when you are ready for the nave doors.");
        this.readThen(() => {
          if (this.bellKeeperLectern !== cue) return;
          this.clearBellKeeperLectern();
          this.startFork1();
        });
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
        sourceOffsetY: -76,
        targetOffsetY: 24,
      },
    );
    cue.once(Phaser.GameObjects.Events.DESTROY, releaseCueAnchor);
    this.registerActiveTarget(target);
  }

  // ─── Act 2: Fork 1 — The Cathedral Doors ──────────────────────────────────

  private startFork1(): void {
    this.setStoryObjective("Choose how to open the nave doors. Type either choice freely.");
    this.showDoorCues();
    if (this.fork1Choice === "chant") {
      this.setNarrator("The quiet chant is the way Wren chose through these doors.");
      this.startFork1Chant(); return;
    }
    if (this.fork1Choice === "force") { this.startFork1Force(); return; }
    this.narration.say("sunken_fork1_intro");

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
    this.registerActiveTarget(chantTarget, forceTarget);
  }

  private startFork1Chant(): void {
    this.fork1Choice = this.commitFork("fork1", "chant") as typeof this.fork1Choice;
    if (this.fork1Choice !== "chant") { this.startFork1Force(); return; }
    this.fadeOutForkCue(this.doorForceCue);
    this.doorForceCue = null;
    this.setStoryObjective("Type each quiet chant as shown, including punctuation. No rhythm needed.");
    // Beat-locked passage chain
    const phrases = [
      { word: "slow.", narrator: "The doors remember weight." },
      { word: "the doors remember weight.", narrator: "We knew them once." },
      { word: "we knew them once.", narrator: "They part with grace." },
      { word: "they part with grace.", narrator: "(the doors open)",
        onFinalCharacter: () => this.openCathedralDoor("chant"),
        beforeResponse: () => this.openCathedralDoor("chant", true) },
    ];
    this.runBeatLockedChain(phrases, () => {
      // §5.5.5 Fork 1A — side with Old Olin → award Quiet Chant relic
      this.store.update((s) => {
        if (!s.satchel.includes("quiet-chant")) s.satchel.push("quiet-chant");
      });
      this.setNarrator("The doors part. The quiet chant stays with you, a rhythm you can carry beyond this place.");
      this.setStoryObjective("Quiet Chant is yours. Continue through the open doors.");
      this.readThen(() => this.startAct3Corridor());
    });
  }

  private startFork1Force(): void {
    this.fork1Choice = this.commitFork("fork1", "force") as typeof this.fork1Choice;
    if (this.fork1Choice !== "force") { this.startFork1Chant(); return; }
    this.fadeOutForkCue(this.doorChantCue);
    this.doorChantCue = null;
    // §5.5.5 Fork 1B — force the doors open → award Lock-Bar relic
    this.store.update((s) => {
      if (!s.satchel.includes("lock-bar")) s.satchel.push("lock-bar");
    });
    // The story choice preserves the full capitalized order. Rhythm belongs
    // to combat; caseSensitive still makes lowercase 'o' miss this target.
    this.setNarrator("Force the doors — hold Shift and type OPEN.");
    this.setStoryObjective("Hold Shift through uppercase OPEN. Type at your own pace.");
    this.readThen(() => {
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
          if (!reducedMotion(this)) this.cameras.main.shake(240, 0.006);
          playDamageThud();
          this.startFork1ForceBreak();
        },
      }, -48);
      this.registerActiveTarget(openTarget);
    });
  }

  /** The doors burst — four rapid free passages as they break (canon §5.5.7). */
  private startFork1ForceBreak(): void {
    this.setNarrator("The crossbar strains. Type the breaking words to split it.");
    this.setStoryObjective("Type the breaking words as shown. No rhythm needed.");
    const forcePhrases = ["crash", "crack", "clear", "we pass"];
    let step = 0;
    const advance = (): void => {
      if (step >= forcePhrases.length) {
        // The matched final character already began the opening during the
        // word's 320ms exit. Settle it before the held acknowledgment, retaining
        // the open masonry until the existing Continue/corridor cleanup.
        this.openForceDoorCue(true);
        this.setNarrator("The doors burst wide. Their lock-bar rests in your hands.");
        this.setStoryObjective("Lock-Bar is yours. Continue through the open doors.");
        this.readThen(() => this.startAct3Corridor());
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
        onAdvance: (cursor, length) => {
          if (step === forcePhrases.length - 1 && cursor === length) this.openForceDoorCue();
        },
        onComplete: () => {
          step += 1;
          this.clearActiveTargets();
          advance();
        },
      }, -48);
      this.registerActiveTarget(target);
    };
    this.time.delayedCall(400, advance);
  }

  private startAct3Corridor(): void {
    if (this.doorwayPassagePending) return;
    this.clearActiveTargets();
    const enterCorridor = () => {
      this.clearBellForkCues();
      this.setNarrator("The Warden has been waiting.");
      this.setStoryObjective("The doors are open. Continue toward the Bell-Warden.");
      this.readThen(() => this.startAct3());
    };
    const stage = this.doorwayStage;
    if (!stage?.scene || !this.wrenContainer?.scene || reducedMotion(this)) { enterCorridor(); return; }
    this.doorwayPassagePending = true;
    const token = ++this.doorwayPassageToken;
    this.setStoryObjective("Wren passes through the open doors…");
    this.tweens.killTweensOf(this.wrenContainer);
    setWrenPose(this.wrenSprite, "walk", false);
    this.tweens.add({
      targets: this.wrenContainer, x: NAVE_DOOR.centerX, y: NAVE_DOOR.thresholdY - 24,
      scaleX: 0.84, scaleY: 0.84, alpha: 0.65, duration: 650, ease: "Sine.easeInOut",
      onComplete: () => {
        if (token !== this.doorwayPassageToken || !stage.scene || !this.wrenContainer?.scene) return;
        enterCorridor();
      },
    });
  }

  // ─── Act 3: The Bell-Warden ───────────────────────────────────────────────

  /** Add the painted Bell-Warden boss sprite at the bell's old anchor, scaled to
   *  the procedural body height so the word anchors + feel line up. Returns the
   *  Image so the phase-2 "eyes open" beat can tint it (replacing the old
   *  redrawWardenPhase2 graphics). Drawn at absolute coords (no scaled container),
   *  same as the procedural bell. */
  private drawWarden(): Phaser.GameObjects.Image {
    this.drawWardenStageBase();
    const sprite = this.add.image(WARDEN_X, WARDEN_Y, "bell-warden").setDepth(8);
    sprite.setScale(WARDEN_SPRITE_HEIGHT / sprite.height);
    applySceneActorLighting(this, sprite);
    addIdleBreath(this, sprite, { dy: -3, durationMs: 2800 });
    return sprite;
  }

  private drawWardenStageBase(): void {
    const base = this.add.container(WARDEN_X, WARDEN_Y + 150).setDepth(7);
    base.add(addLocalGroundShadow(this, 210, 34, {
      y: 8,
      alpha: 0.24,
      color: 0x02070c,
    }));

    const water = this.add.graphics();
    water.fillStyle(0x102c3a, 0.18);
    water.fillEllipse(0, 0, 260, 42);
    water.fillStyle(0xa7d2dd, 0.08);
    water.fillEllipse(-18, -5, 178, 24);
    water.lineStyle(2, BELL_BURST_COLOR, 0.24);
    water.strokeEllipse(-26, -4, 172, 19);
    water.strokeEllipse(42, 6, 128, 15);
    water.lineStyle(1, 0xa7d2dd, 0.18);
    water.lineBetween(-104, -2, -58, -8);
    water.lineBetween(-34, 7, 24, 0);
    water.lineBetween(48, -2, 114, 5);
    water.fillStyle(0xa7d2dd, 0.18);
    water.fillCircle(-72, -10, 2.6);
    water.fillCircle(84, -2, 2.2);
    water.fillCircle(18, -8, 2);
    base.add(water);

    addContainerWake(this, base, {
      kind: "bubble",
      intervalMs: 720,
      spreadX: 100,
      spreadY: 14,
      color: BELL_BURST_COLOR,
      alpha: 0.16,
      size: 3.4,
      depth: 7.2,
      driftX: 16,
      driftY: -44,
      durationMs: 1200,
    });

    this.tweens.add({
      targets: base,
      scaleX: { from: 0.992, to: 1.018 },
      scaleY: { from: 1.018, to: 0.992 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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
    if (!reducedMotion(this)) this.cameras.main.shake(140, 0.003);
    this.pulseBellWave({ y: 640, ringWidth: 900, ringHeight: 180, count: 14 });
    this.ghosts = [];
    const wardenSprite = this.drawWarden();
    this.playWardenStagePulse(wardenSprite);
    // Phase 1
    this.narration.say("sunken_warden_rise");
    this.setStoryObjective("Read the Warden's arrival, then continue to face its words.");
    this.readThen(() => {
      this.startWardenPhase1(wardenSprite);
    });
  }

  private startWardenPhase1(wardenSprite: Phaser.GameObjects.Image): void {
    this.beatPhase = "on";
    this.band.setObjective("First letter on the blue pulse, then finish freely. Speak the Warden's words.");
    const words = ["weight", "silence", "deep"];
    let remaining = words.length;

    words.forEach((word, i) => {
      const pos = this.wardenWordPosition(wardenSprite, word, i, words.length);
      const target = this.makeWardenWord(wardenSprite, {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 36,
        onComplete: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.clearActiveTargets();
            this.time.delayedCall(800, () => {
              this.setNarrator("Its eyes open.");
              this.flashWardenAwake(wardenSprite, false);
              this.readThen(() =>
                this.startWardenPhase2(wardenSprite),
              );
            });
          }
        },
      });
      this.registerActiveTarget(target);
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
    this.beatPhase = "on";
    // Double tempo — the tide rises and the world speeds up. The window
    // tightens with it (tempo-scaled: ~175ms now).
    this.beatClock.setTempo(1000);
    // De-sync ON: these hyphenated words must land EACH beat — the hyphen
    // boundary is beat-gated, and mistiming it wipes the word (canon §5.5.7
    // "two consecutive beats each").
    this.beatLocked = true;

    this.narration.say("sunken_warden_phase2");
    this.band.setObjective("First letter and every hyphen on blue pulses; other letters flow freely.");
    this.playWardenStagePulse(wardenSprite, true);

    const phrases = ["tide-and-toll", "deep-and-dark", "still-and-stir"];
    let remaining = phrases.length;

    this.readThen(() => {
      phrases.forEach((word, i) => {
        const pos = this.wardenWordPosition(wardenSprite, word, i, phrases.length);
        const target = this.makeWardenWord(wardenSprite, {
          scene: this,
          word,
          x: pos.x,
          y: pos.y,
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
                  x: wardenSprite.x,
                  y: Phaser.Math.Clamp(wardenSprite.y - 128, 260, this.scale.height - 360),
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
        this.registerActiveTarget(target);
      });
    });
  }

  private startWardenPhase3(wardenSprite: Phaser.GameObjects.Image): void {
    const passage = "i am the bell. i drink the sea.";
    const words = passage.split(" ");
    this.setNarrator(`The Warden's verse: ${passage}\n\nEight words, one per toll. Start each on the blue pulse and finish before the next toll. Include punctuation; do not type spaces between prompts. A missed word restarts its sentence after one rest toll.`);
    this.setStoryObjective("Read the full verse, then continue. Eight words; include punctuation, with no spaces between prompts.");
    this.playWardenStagePulse(wardenSprite, true);
    let wordIndex = 0;
    // §5.5.7 — stumble resets to the last completed sentence, not to index 0.
    // Sentence boundaries: "i am the bell." ends after index 3;
    // "i drink the sea." ends after index 7.
    // sentenceCheckpoint tracks the first word of the sentence currently in
    // progress; it advances whenever Wren completes the last word of a sentence.
    const SENTENCE_STARTS = [0, 4]; // word indices that begin each sentence
    let sentenceCheckpoint = 0;
    let attemptGeneration = 0;

    const advanceWord = (): void => {
      const attempt = ++attemptGeneration;
      if (wordIndex >= words.length) {
        // All done — defeat
        this.onWardenDefeated(wardenSprite);
        return;
      }
      const word = words[wordIndex];
      if (word === undefined) return;

      let settled = false;
      const settleWord = (): boolean => {
        if (settled || attempt !== attemptGeneration) return false;
        settled = true;
        playChime();
        wordIndex += 1;
        const nextSentence = SENTENCE_STARTS.find((s) => s > sentenceCheckpoint);
        if (nextSentence !== undefined && wordIndex >= nextSentence) {
          sentenceCheckpoint = nextSentence;
        }
        this.clearActiveTargets();
        this.band.setObjective(wordIndex < words.length
          ? `Next blue pulse: “${words[wordIndex]}” (${wordIndex + 1}/${words.length}). Wait for its prompt; no spaces between prompts.`
          : "The verse is complete. The Warden's voice grows quiet.");
        return true;
      };
      const pos = this.wardenWordPosition(wardenSprite, word);
      const target = this.makeWardenWord(wardenSprite, {
        scene: this,
        word,
        x: pos.x,
        y: pos.y,
        fontSize: 40,
        onComplete: () => {
          if (settleWord()) this.beatClock.onNextBeat(advanceWord);
        },
      });
      // A175ms start window cannot spend180ms fading the word in.
      // The current word is fully readable on the very toll that starts it.
      this.registerBeatTarget(target);
      const followingWord = words[wordIndex + 1];
      this.band.setObjective(`Word ${wordIndex + 1}/${words.length}: “${word}” · Start on blue; finish before the next toll.${followingWord ? ` Next: “${followingWord}”` : " Last word."}`);

      // On the next toll, if this word wasn't finished — stumble.
      // Reset to the checkpoint (start of current sentence).
      this.beatClock.onNextBeat(() => {
        if (settled || attempt !== attemptGeneration) return;
        // Matching the final character is the deadline, not finishing its
        // 320ms exit animation. A late-in-the-beat success continues on THIS
        // toll; its eventual animation callback cannot queue a second word.
        if (target.isComplete()) {
          if (settleWord()) advanceWord();
          return;
        }
        settled = true;
        attemptGeneration += 1;
        this.clearActiveTargets();
        wordIndex = sentenceCheckpoint;
        // This toll is deliberately a rest, not an invisible new attempt.
        // Keep the HUD clear so the retry word and next-pulse cue can be read.
        this.band.setObjective(`Sentence restarted. Rest this toll. Next blue pulse: “${words[wordIndex]}” (${wordIndex + 1}/${words.length}).`);
        this.beatClock.onNextBeat(advanceWord);
      });
    };

    this.readThen(() => {
      this.beatPhase = "on";
      this.setNarrator(`${passage}\n\nOne word per blue pulse. Type punctuation; no spaces between prompts.`);
      this.band.setObjective(`Next blue pulse: “${words[0]}” (1/${words.length}). Then “${words[1]}”. No spaces between prompts.`);
      this.beatClock.onNextBeat(advanceWord);
    });
  }

  private wardenWordPosition(
    wardenSprite: Phaser.GameObjects.Image,
    word: string,
    index = 0,
    total = 1,
  ): { x: number; y: number } {
    const long = word.length > 12;
    const spacing = long ? 400 : 240;
    const spread = (total - 1) * spacing;
    const xInset = long ? 220 : 180;
    // Clamp the whole row, not each word independently: clamping the final
    // two compound targets against the right edge collapsed their spacing.
    const centerX = Phaser.Math.Clamp(
      wardenSprite.x,
      xInset + spread / 2,
      this.scale.width - xInset - spread / 2,
    );
    return {
      x: centerX - spread / 2 + index * spacing,
      y: Phaser.Math.Clamp(wardenSprite.y - (long ? 250 : 232), 280, this.scale.height - 430),
    };
  }

  private olinPassageWordPosition(): { x: number; y: number } {
    const olin = this.olinImage;
    if (!olin?.scene) return { x: this.scale.width / 2, y: this.scale.height - 340 };
    const bounds = olin.getBounds();
    const wrenX = this.wrenContainer?.scene ? this.wrenContainer.x : WREN_X;
    return {
      x: Math.max(
        330,
        Math.min(this.scale.width - 330, Phaser.Math.Linear(bounds.right, wrenX, 0.38)),
      ),
      y: Math.max(330, Math.min(this.scale.height - 430, bounds.top + bounds.height * 0.42)),
    };
  }

  private onWardenDefeated(wardenSprite: Phaser.GameObjects.Image): void {
    playChime();
    this.beatClock.stop();
    this.rhythmLabel.setAlpha(0);
    this.clearBossWordAnchors();
    fadeOutStagedSprite(this, wardenSprite, { durationMs: 600, riseY: -18 });
    // Almanac lore page 4 — the Warden's true name, stamped at defeat.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-wardens-true-name")) {
        s.almanacLore.push("the-wardens-true-name");
      }
    });
    this.narration.say("sunken_warden_defeated");
    this.setStoryObjective("The bell is quiet. Continue to the two paths beneath it.");
    this.readThen(() => {
      // A quick Continue must still remove the defeated actor before it can
      // cover the right-hand choice while its departure tween is finishing.
      if (wardenSprite.scene) {
        this.tweens.killTweensOf(wardenSprite);
        wardenSprite.destroy();
      }
      this.startFork2();
    });
  }

  // ─── Fork 2 — Beneath the Bell ────────────────────────────────────────────

  private startFork2(): void {
    this.setStoryObjective("Read the two paths beneath the silent bell, then continue to choose.");
    this.showFateCues();
    if (this.fork2Choice === "free-aurland") { this.startFork2FreeAurland(); return; }
    if (this.fork2Choice === "claim-tongue") { this.startFork2ClaimTongue(); return; }
    this.setNarrator("King Aurland of Tide-Glass is still trapped inside the bell's voice. Free him and gain his aid, or take the iron clapper, the bell's tongue, as a relic. Taking it will leave the bell silent for good.");
    this.readThen(() => {
      this.setStoryObjective("Free Aurland for his aid, or claim Bell's Tongue as a relic. Type either choice freely.");

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
      this.registerActiveTarget(freeTarget, claimTarget);
    });
  }

  private startFork2FreeAurland(): void {
    this.fork2Choice = this.commitFork("fork2", "free-aurland") as typeof this.fork2Choice;
    if (this.fork2Choice !== "free-aurland") { this.startFork2ClaimTongue(); return; }
    this.aurlandBindingPending = false;
    this.clearAurlandToken();
    this.setStoryObjective("Unbind King Aurland. Type the words shown freely; the bell is quiet.");
    this.fadeOutForkCue(this.bellTongueCue);
    this.bellTongueCue = null;
    // Triumphant beat: the freed king fades in, standing, while the passage is
    // typed. Placed left-of-centre so he's clear of Wren (x=960) and the lower
    // typing targets, and well below the narration band (y≈150).
    this.showAurland();
    this.setNarrator("The king's outline emerges inside the bell's old silence. Unmake the words that hold him.");
    const chain = [
      { word: "break the silence", narrator: "You are remembered." },
      { word: "you are remembered", narrator: "Swim free, king." },
      { word: "swim free king", narrator: "" },
    ];
    this.readThen(() => this.runFreePassageChain(chain, () => {
      this.store.update((s) => {
        if (!s.satchel.includes("king-aurland")) s.satchel.push("king-aurland");
        if (!s.satchel.includes("trident-token")) s.satchel.push("trident-token");
        if (!s.almanacLore.includes("king-auriands-promise")) {
          s.almanacLore.push("king-auriands-promise");
        }
      });
      playChime();
      this.fadeOutForkCue(this.aurlandFateCue);
      this.aurlandFateCue = null;
      this.showAurlandToken();
      this.setNarrator("Aurland swims free. He presses a trident token into your hand before he goes.");
      this.setStoryObjective("Aurland's trident token is yours. Continue toward the surface.");
      this.readThen(() => {
        this.clearAurlandToken();
        this.hideAurland();
        this.startGlassFishGate();
      });
    }));
  }

  /** The reward caption owns one visible handoff; Continue never waits on it. */
  private showAurlandToken(): void {
    this.clearAurlandToken();
    const giver = this.aurlandImage;
    const hand = { x: 38, y: -118 };
    const destination = {
      x: this.wrenContainer.x + hand.x,
      y: this.wrenContainer.y + hand.y,
    };
    const immediate = reducedMotion(this) || !giver?.scene;
    const token = this.add.image(
      immediate ? destination.x : giver.x + 44,
      immediate ? destination.y : giver.y - 150,
      "bell-trident-token",
    ).setDepth(61);
    token.setScale(64 / Math.max(token.width, token.height));
    applySceneActorLighting(this, token);
    this.aurlandToken = token;
    const settle = (): void => {
      if (this.aurlandToken !== token || !token.scene || !this.wrenContainer.scene) return;
      // Reparent only at arrival so the held keepsake follows Wren's quiet breath.
      this.wrenContainer.add(token);
      token.setPosition(hand.x, hand.y);
      if (this.aurlandImage === giver) this.hideAurland();
    };
    if (immediate) settle();
    else this.tweens.add({
      targets: token,
      ...destination,
      duration: 650,
      ease: "Sine.easeInOut",
      onComplete: settle,
    });
  }

  private clearAurlandToken(): void {
    const token = this.aurlandToken;
    this.aurlandToken = undefined;
    if (!token) return;
    this.tweens.killTweensOf(token);
    if (token.scene) token.destroy();
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
      durationMs: reducedMotion(this) ? 0 : 1000,
      ease: "Sine.easeOut",
    });
  }

  /** Olin leaves the pew as the quiet teaching beat gives way to combat. */
  private dismissOlin(): void {
    const sprite = this.olinImage;
    const pew = this.olinPew;
    if (!sprite && !pew) return;

    this.clearOlinWordAnchors();
    this.olinImage = undefined;
    this.olinPew = undefined;

    if (sprite) {
      fadeOutStagedSprite(this, sprite, {
        durationMs: 620,
        ease: "Sine.easeIn",
      });
    }
    if (pew) {
      this.tweens.add({
        targets: pew,
        alpha: 0,
        duration: 500,
        ease: "Sine.easeIn",
        onComplete: () => {
          if (pew.scene) pew.destroy();
        },
      });
    }
  }

  private startFork2ClaimTongue(): void {
    this.fork2Choice = this.commitFork("fork2", "claim-tongue") as typeof this.fork2Choice;
    if (this.fork2Choice !== "claim-tongue") { this.startFork2FreeAurland(); return; }
    this.setStoryObjective("Take the bell's iron tongue. Type the words shown freely.");
    this.fadeOutForkCue(this.aurlandFateCue);
    this.aurlandFateCue = null;
    this.setNarrator("An iron clapper hangs beneath the silent bell. You reach for its warm metal.");
    const chain = [
      {
        word: "take it",
        narrator: "The clapper tears free. The bell will never toll again.",
        onComplete: () => {
          this.fadeOutForkCue(this.bellTongueCue);
          this.bellTongueCue = null;
        },
      },
    ];
    this.readThen(() => this.runFreePassageChain(chain, () => {
      this.store.update((s) => {
        if (!s.satchel.includes("bells-tongue")) s.satchel.push("bells-tongue");
        if (!s.almanacLore.includes("the-bells-tongue-song")) {
          s.almanacLore.push("the-bells-tongue-song");
        }
      });
      playChime();
      this.setNarrator("The Bell's Tongue settles in your satchel, still warm from the deep.");
      this.setStoryObjective("Bell's Tongue is yours. Continue toward the surface.");
      this.readThen(() => this.startGlassFishGate());
    }));
  }

  // ─── Glass-fish gate ─────────────────────────────────────────────────────

  private startGlassFishGate(): void {
    this.clearActiveTargets();
    if (resolveCompanionDecision("sunken-bell", this.store.get().realms["sunken-bell"], this.store.get().satchel)) {
      this.startTrueNamePassage(); return;
    }
    if (this.fork2Choice === "free-aurland") {
      this.setStoryObjective("Choose whether the glass-fish travels with Wren. Type either choice freely.");
      this.setNarrator("A small glass-fish leads the way up through the dark water.");
      this.showGlassFishCompanion();
      this.readThen(() => {
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
            let accepted = false;
            this.store.update((s) => {
              accepted = rememberCompanionDecision(s, "sunken-bell", "accepted") === "accepted";
              if (accepted && !s.satchel.includes("glass-fish")) s.satchel.push("glass-fish");
            });
            if (!accepted) { this.startTrueNamePassage(); return; }
            this.setNarrator("The glass-fish follows Wren toward the portal. Her light will travel with you.");
            this.setStoryObjective("The Glass-Fish joins Wren. Continue when you are ready to name the realm.");
            this.readThen(() => this.startTrueNamePassage());
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
            this.store.update(s => { rememberCompanionDecision(s, "sunken-bell", "declined"); });
            this.dismissGlassFishCompanion(1320, 640);
            this.setNarrator("You let the glass-fish go. Her light drifts back into the water.");
            this.setStoryObjective("The glass-fish stays in the deep. Continue when you are ready to name the realm.");
            this.readThen(() => this.startTrueNamePassage());
          },
        });
        this.registerActiveTarget(takeTarget, letGoTarget);
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
    this.setStoryObjective("Type the bell's true name, including spaces and punctuation. No rhythm needed.");
    this.readThen(() => {
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
      this.registerActiveTarget(target);
    });
  }

  // ─── Ending ──────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.setStoryObjective("The Sunken Bell is restored. The Almanac records the journey.");
    this.store.update((s) => {
      if (this.fork1Choice) rememberRealmFork(s, "sunken-bell", "fork1", this.fork1Choice);
      if (this.fork2Choice) rememberRealmFork(s, "sunken-bell", "fork2", this.fork2Choice);
      const realm = s.realms["sunken-bell"] ?? { cleared: false, choices: {} };
      realm.cleared = true;
      s.realms["sunken-bell"] = realm;
    });

    this.showAlmanacStamp(() => {
      this.setNarrator("The Sunken Bell rests in the Almanac. The way back to Holdfast is open.");
      this.setStoryObjective("The Sunken Bell is restored. Continue to return to the chamber.");
      this.readThen(() => {
        playRealmReturnDeparture(this, this.wrenContainer, {
          kind: "bubble",
          color: PALETTE_HEX.frost,
        });
        this.time.delayedCall(360, () => {
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
      });
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

  /** Per-toll prompts are readable immediately; their deadline is already live. */
  private registerBeatTarget(target: TextWordTarget): void {
    this.typingInput.register(target);
    this.activeTargets.push(target);
    // The world echo may outlast the175ms fast start window. Beat prompts
    // are timing UI and must remain readable above that world-only layer.
    target.setDepth(1301);
    target.setVisualAlpha(1);
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
    if (body?.scene && (body === this.doorChantCue || body === this.doorForceCue)) {
      return {
        x: body === this.doorChantCue ? NAVE_DOOR.chantWordX : NAVE_DOOR.forceWordX,
        y: NAVE_DOOR.wordY,
      };
    }
    const sourceX = body?.scene ? body.x : width / 2;
    const sourceY = body?.scene ? body.y + sourceOffsetY : height - 460;
    const side =
      opts.side === "left" ? -1 : opts.side === "right" ? 1 : sourceX < width / 2 ? 1 : -1;
    const lateral = opts.long ? 180 : 150;
    const xInset = opts.long ? 380 : 300;
    const lift = opts.lift ?? (opts.long ? 116 : 102);

    const y = Phaser.Math.Clamp(sourceY - lift, 280, height - 430);
    return {
      x: Phaser.Math.Clamp(sourceX + side * lateral, xInset, width - xInset),
      y,
    };
  }

  private clearForkChoiceWordAnchors(): void {
    for (const anchor of this.forkChoiceWordAnchors) anchor.destroy();
    this.forkChoiceWordAnchors = [];
  }

  private showDoorCues(): void {
    if (!this.doorwayStage?.scene) {
      const stage = this.add.container(0, 0).setName("bell-nave-stage").setDepth(-1);
      stage.add(this.add.image(0, 0, "bell-nave-doorway").setOrigin(0)
        .setDisplaySize(this.scale.width, this.scale.height));
      stage.add(this.drawCathedralDoor().setPosition(NAVE_DOOR.centerX, NAVE_DOOR.thresholdY));
      this.doorwayStage = stage;
      // The room cut places Wren on the painted approach, with a stationary
      // foot/shadow contact. The normal Bell position returns with the corridor.
      this.tweens.killTweensOf(this.wrenContainer);
      this.resetWrenToFront();
      this.wrenContainer.setPosition(NAVE_DOOR.wrenX, NAVE_DOOR.wrenY).setScale(1).setAlpha(1).setVisible(true);
      if (this.wrenSprite?.scene) this.wrenSprite.setAlpha(1).setVisible(true);
    }
    if (!this.doorChantCue?.scene) {
      this.doorChantCue = this.createDoorCue(NAVE_DOOR.centerX - NAVE_DOOR.width / 2, 658, "chant");
    }
    if (!this.doorForceCue?.scene) {
      this.doorForceCue = this.createDoorCue(NAVE_DOOR.centerX + NAVE_DOOR.width / 2, 658, "force");
    }
  }

  private drawBellKeeperLectern(): Phaser.GameObjects.Image {
    const image = this.add.image(0, 72, "bell-reading-lectern");
    // Fit the accepted painting's visible stone, excluding transparent padding.
    // Its bottom pixel shares the original stand's floor contact at local y72.
    const footprint = { left: 274, right: 1096, bottom: 1065 };
    image.setOrigin((footprint.left + footprint.right) / 2 / image.width,
      footprint.bottom / image.height);
    image.setScale(170 / (footprint.right - footprint.left));
    applySceneActorLighting(this, image);
    return image;
  }

  private clearBellKeeperLectern(): void {
    const cue = this.bellKeeperLectern;
    this.bellKeeperLectern = null;
    if (!cue?.scene) return;
    this.tweens.killTweensOf(cue);
    cue.destroy();
  }

  private createDoorCue(
    x: number,
    y: number,
    mode: "chant" | "force",
  ): Phaser.GameObjects.Container {
    // Both choices address the same physical doors. These empty jamb anchors
    // carry word tethers and feedback only, never another arch or moving floor.
    return this.add.container(x, y).setName(`nave-${mode}-anchor`).setDepth(42);
  }

  private drawCathedralDoor(): Phaser.GameObjects.Container {
    const door = this.add.container(0, 0).setName("cathedral-door");
    const source = this.textures.get("bell-nave-door-leaves").getSourceImage() as HTMLImageElement;
    const clip = NAVE_DOOR.leafClip;
    const pairWidth = NAVE_DOOR.width;
    for (const side of [-1, 1] as const) {
      const key = side < 0 ? "bell-nave-left-leaf" : "bell-nave-right-leaf";
      const cropX = side < 0 ? clip.left : clip.seam;
      const cropWidth = side < 0 ? clip.seam - clip.left : clip.right - clip.seam;
      if (!this.textures.exists(key)) {
        const canvas = this.textures.createCanvas(key, cropWidth, clip.bottom - clip.top);
        if (!canvas) throw new Error("Unable to prepare the nave door leaf texture");
        const context = canvas.context;
        const outline = [...clip.curve, [clip.left, clip.bottom], [clip.seam, clip.bottom]];
        context.save();
        context.beginPath();
        outline.forEach(([x, y], index) => {
          const px = (side < 0 ? x : clip.seam * 2 - x) - cropX;
          const py = y - clip.top;
          if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
        });
        context.closePath();
        context.clip();
        context.drawImage(source, -cropX, -clip.top);
        context.restore();
        canvas.refresh();
      }
      const hinge = this.add.container(side * pairWidth / 2, 0)
        .setName(side < 0 ? "door-left" : "door-right");
      const leaf = this.add.image(0, 0, key).setOrigin(side < 0 ? 0 : 1, 1)
        .setDisplaySize(pairWidth / 2, NAVE_DOOR.height);
      applySceneActorLighting(this, leaf);
      hinge.add(leaf);
      door.add(hinge);
    }
    const bar = this.add.graphics().setName("door-crossbar");
    const edge = pairWidth * 0.46;
    bar.fillStyle(0x596047, 1);
    bar.fillPoints([
      { x: -edge - 2, y: -244 }, { x: -edge + 5, y: -249 },
      { x: edge - 4, y: -247 }, { x: edge + 2, y: -241 },
      { x: edge - 1, y: -226 }, { x: -edge + 3, y: -224 },
      { x: -edge - 3, y: -230 },
    ], true);
    bar.lineStyle(2, 0x9b895b, 0.65);
    bar.lineBetween(-edge + 7, -246, edge - 6, -245);
    bar.lineStyle(2, 0x1b3838, 0.8);
    bar.lineBetween(-edge + 3, -226, edge - 3, -228);
    for (const [x, y, length] of [[-0.3, -238, 19], [0.08, -232, 27], [0.3, -242, 14]]) {
      bar.lineStyle(3, 0x3c6b60, 0.58);
      bar.lineBetween(pairWidth * x, y, pairWidth * x + length, y - 1);
      bar.lineStyle(1, 0xa19264, 0.34);
      bar.lineBetween(pairWidth * x + 5, y + 2, pairWidth * x + length - 2, y + 1);
    }
    for (const x of [-pairWidth * 0.36, pairWidth * 0.36]) {
      bar.fillStyle(0x182d32, 1);
      bar.fillRoundedRect(x - 7, -256, 14, 40, 2);
      bar.fillStyle(0x9c956a, 0.85);
      bar.fillCircle(x, -250, 2);
      bar.fillCircle(x, -222, 2);
    }
    door.add(bar);
    return door;
  }

  private openCathedralDoor(mode: "chant" | "force", immediate = false): void {
    const stage = this.doorwayStage;
    if (!stage?.scene) return;
    const assembly = stage.getByName("cathedral-door") as Phaser.GameObjects.Container | null;
    const left = assembly?.getByName("door-left") as Phaser.GameObjects.Container | null;
    const right = assembly?.getByName("door-right") as Phaser.GameObjects.Container | null;
    const bar = assembly?.getByName("door-crossbar") as Phaser.GameObjects.Graphics | null;
    if (!assembly || !left || !right || !bar) return;
    if (stage.getData("door-open") && !immediate) return;
    stage.setData("door-open", true);
    if (immediate || reducedMotion(this)) {
      this.tweens.killTweensOf([left, right, bar]);
      left.setScale(0.08, 1);
      right.setScale(0.08, 1);
      bar.setVisible(false);
      return;
    }
    // Both routes settle inside the existing320ms word exit, before the held
    // open-door response. The stone surround and threshold never move.
    this.tweens.add({ targets: [left, right], scaleX: 0.08, duration: 280,
      ease: mode === "chant" ? "Sine.easeInOut" : "Cubic.easeOut" });
    this.tweens.add(mode === "chant"
      ? { targets: bar, scaleX: 0.03, alpha: 0, duration: 240, ease: "Sine.easeInOut" }
      : { targets: bar, y: 24, rotation: 0.22, alpha: 0, duration: 250, ease: "Cubic.easeIn" });
  }

  private openForceDoorCue(immediate = false): void {
    this.openCathedralDoor("force", immediate);
  }

  private clearDoorwayStage(): void {
    const stage = this.doorwayStage;
    const wasCrossing = this.doorwayPassagePending;
    this.doorwayPassagePending = false;
    this.doorwayPassageToken += 1;
    this.doorwayStage = null;
    if (stage?.scene) {
      const assembly = stage.getByName("cathedral-door") as Phaser.GameObjects.Container | null;
      if (assembly) this.tweens.killTweensOf(assembly.list);
      this.tweens.killTweensOf(stage);
      stage.destroy();
    }
    if ((stage || wasCrossing) && this.wrenContainer?.scene) {
      this.tweens.killTweensOf(this.wrenContainer);
      this.wrenContainer.setPosition(WREN_X, WREN_Y).setScale(1).setAlpha(1).setVisible(true);
      this.resetWrenToFront();
      if (this.wrenSprite?.scene) this.wrenSprite.setAlpha(1).setVisible(true);
    }
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
    this.clearDoorwayStage();
    for (const cue of [
      this.doorChantCue,
      this.doorForceCue,
      this.aurlandFateCue,
      this.bellTongueCue,
    ]) {
      if (!cue?.scene) continue;
      this.tweens.killTweensOf(cue);
      const doorway = cue.getByName("cathedral-door") as Phaser.GameObjects.Container | null;
      if (doorway) this.tweens.killTweensOf(doorway.list);
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
      anchorOffsetY: -96,
      // Choir bodies can crowd Wren, but their answers keep their distinct
      // approach lanes. The existing tether follows each moving ghost.
      wordAnchorX: restX,
      idleBobDy: 8,
      idleBobMs: 1100,
      defeatRiseY: -50,
      defeatMs: 500,
      fontSize: 34,
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
      onComplete: (_mods, self) => {
        this.showQuietFlicker(container);
        if (this.breathActive) {
          this.breath.inhale();
          this.playBreathRecoveryCue(self);
          this.drawBreathBar();
        }
        this.checkWaveCleared();
      },
      onReachWren: (self) => {
        playBodyContactCue(this, self.container, this.wrenContainer, {
          kind: "bubble",
          color: BELL_BURST_COLOR,
          sourceOffsetY: -62,
          targetOffsetY: -106,
          sourceRadius: 32,
          targetRadius: 36,
        });
        if (!reducedFlashes(this)) this.cameras.main.flash(300, 0, 0, 0, false);
        playWrenHurt(this.wrenSprite, { knockX: 0 });
        playDamageThud();
        flashDamageVignette(this);
      },
      // The splitting ghost sheds "ebb"/"drift" near where it dies (±60px,
      // clamped clear of Wren's hood), with a 5000ms non-recursive close.
      split: splits
        ? {
            children: [
              { word: "ebb", dx: -60 },
              { word: "drift", dx: 60 },
            ],
            spawn: (p) => this.spawnSplitGhost(p, container.x),
          }
        : undefined,
    });

    this.ghosts.push(ghost);
  }

  private spawnSplitGhost(
    child: { restX: number; restY: number; word: string },
    parentX: number,
  ): void {
    const wrenX = this.wrenContainer.x;
    const clearance = 180;
    // Shift the authored ±60px pair together. Clamping each child separately
    // collapses both onto one point when they split just beside Wren.
    const pairCenter = parentX < wrenX
      ? Math.min(parentX, wrenX - clearance - 60)
      : Math.max(parentX, wrenX + clearance + 60);
    const restX = pairCenter + (child.restX - parentX);
    this.spawnGhost(restX, restX, child.restY, child.word, 0, 5000);
  }

  private playBreathRecoveryCue(source: MovingWordEnemy): void {
    if (!this.breathActive) return;
    playClaimLine(
      this,
      source.container.x,
      source.container.y - 82,
      this.breathAnchor.x,
      this.breathAnchor.y,
      {
        color: BELL_BURST_COLOR,
        depth: 1452,
        durationMs: 430,
      },
    );
  }

  /** Add the painted choir-ghost sprite into a container. The container drives
   *  alpha (restAlpha 0.7) + the danger-ramp tint; the local water halo keeps
   *  the body readable as a physical presence in the drowned nave. */
  private drawGhostInto(c: Phaser.GameObjects.Container): void {
    c.add(addLocalGroundShadow(this, 142, 24, { y: 28, alpha: 0.2 }));
    c.add(this.makeBellGhostWaterHalo());
    const sprite = this.add.image(0, 0, "bell-ghost");
    sprite.setScale(GHOST_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
  }

  private makeBellGhostWaterHalo(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(0x4ab8d6, 0.12);
    g.fillEllipse(0, 10, 168, 92);
    g.fillStyle(0xd8f4ff, 0.12);
    g.fillEllipse(0, -4, 122, 148);
    g.lineStyle(2, 0xa8e7f2, 0.24);
    g.strokeEllipse(0, 6, 150, 82);
    g.lineStyle(1, 0xf1fbff, 0.18);
    g.strokeEllipse(0, -14, 94, 128);
    g.fillStyle(0xbfefff, 0.28);
    g.fillCircle(-58, -34, 5);
    g.fillCircle(52, -18, 4);
    g.fillCircle(-36, 42, 3.5);
    g.fillCircle(66, 34, 3.5);
    return g;
  }

  private showQuietFlicker(source?: Phaser.GameObjects.Container): void {
    const x = source?.scene ? source.x : this.scale.width / 2;
    const y = source?.scene
      ? Math.max(260, Math.min(this.scale.height - 380, source.y - 132))
      : this.scale.height / 2 - 60;
    const scar = this.add.graphics().setPosition(x, y).setDepth(47).setAlpha(0.46);
    scar.fillStyle(0x05050a, 0.28);
    scar.fillRoundedRect(-124, -30, 248, 60, 14);
    scar.fillStyle(0x182834, 0.24);
    scar.fillEllipse(0, 0, 216, 42);
    scar.lineStyle(2, 0x6f8f98, 0.24);
    scar.strokeRoundedRect(-116, -24, 232, 48, 12);
    scar.lineStyle(3, 0x05050a, 0.72);
    scar.lineBetween(-78, -2, 84, -6);
    const txt = this.add
      .text(x, y, "~~quiet them~~", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: PALETTE.dim,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setDepth(48)
      .setAlpha(0.68);

    this.tweens.add({
      targets: [scar, txt],
      alpha: 0,
      y: "-=22",
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => {
        scar.destroy();
        txt.destroy();
      },
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
    steps: Array<{ word: string; narrator: string; onFinalCharacter?: () => void; beforeResponse?: () => void }>,
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
        onAdvance: (cursor, length) => { if (cursor === length) step.onFinalCharacter?.(); },
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
          step.beforeResponse?.();
          if (step.narrator) {
            this.setNarrator(step.narrator);
            this.readThen(advance);
          } else {
            advance();
          }
        },
      }, -62);
      this.registerActiveTarget(target);
    };

    advance();
  }

  /** Free (no beat) passage chain for fork 2 */
  private runFreePassageChain(
    steps: Array<{ word: string; narrator: string; onComplete?: () => void }>,
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
      const ownerBody = freeingAurland ? this.aurlandImage : this.bellTongueCue;
      const pos = this.bellPassageWordPosition(
        ownerBody,
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
        onAdvance: (cursor, length) => {
          // TextWordTarget fades for 320ms before onComplete installs the
          // reward card. A quick Continue in that gap is not another attempt.
          if (freeingAurland && idx === steps.length - 1 && cursor >= length) {
            this.aurlandBindingPending = true;
          }
        },
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          if (freeingAurland) {
            playActorAttention(this, this.aurlandImage, {
              tint: BELL_BURST_COLOR,
            });
          }
          playBodyImpact(this, this.wrenContainer, {
            kind: "bubble",
            color: BELL_BURST_COLOR,
            offsetY: -104,
            ringRadius: 30,
            count: 7,
            depth: 58,
          });
          idx += 1;
          this.clearActiveTargets(this.aurlandBindingPending);
          step.onComplete?.();
          if (step.narrator) {
            this.setNarrator(step.narrator);
            this.readThen(advance);
          } else {
            advance();
          }
        },
      };
      const target =
        freeingAurland
          ? this.makeAurlandWord(targetOptions)
          : this.makeBellForkWord(this.bellTongueCue, targetOptions, -48);
      this.registerActiveTarget(target);
    };

    advance();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private readThen(next: () => void): void {
    this.reading.show(next, () => this.narration.replay());
    this.aurlandBindingPending = false;
  }

  /** Story actions keep ordinary typing and never inherit combat penalties. */
  private setStoryObjective(text: string): void {
    this.beatPhase = "free";
    this.beatLocked = false;
    this.band.setObjective(text);
    this.tweens.killTweensOf(this.beatRing);
    this.tweens.killTweensOf(this.offbeatRing);
    this.beatRing.setAlpha(0);
    this.offbeatRing.setAlpha(0);
    this.rhythmLabel.setAlpha(0);
  }

  private commitFork(fork: RealmFork, requested: string): string {
    let chosen = requested;
    this.store.update(s => { chosen = rememberRealmFork(s, "sunken-bell", fork, requested); });
    return chosen;
  }

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

  private clearActiveTargets(preserveAurlandBindingPending = false): void {
    if (!preserveAurlandBindingPending) this.aurlandBindingPending = false;
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
    addContainerWake(this, c, {
      kind: "bubble",
      intervalMs: 520,
      spreadX: 30,
      spreadY: 12,
      offsetY: -86,
      color: BELL_BURST_COLOR,
      alpha: 0.23,
      size: 3.3,
      depth: 0.25,
      driftX: 18,
      driftY: -42,
      durationMs: 980,
    });
    return c;
  }

  private drawOlin(): void {
    if (this.olinImage) return;
    // Quiet stone shelf for Olin's teaching beat. Keep it low-contrast so it
    // reads as part of the submerged ruin instead of a UI/debug platform.
    const g = this.add.graphics().setDepth(0.85);
    this.olinPew = g;
    g.fillStyle(0x061018, 0.34);
    g.fillEllipse(OLIN_X, OLIN_PEW_Y + 21, 326, 42);
    g.fillStyle(0x26363a, 0.48);
    g.fillRoundedRect(OLIN_X - 146, OLIN_PEW_Y + 2, 292, 18, 9);
    g.fillStyle(0x4a6268, 0.2);
    g.fillRoundedRect(OLIN_X - 132, OLIN_PEW_Y + 5, 72, 4, 2);
    g.fillRoundedRect(OLIN_X - 34, OLIN_PEW_Y + 4, 112, 5, 2);
    g.fillStyle(0x0b1822, 0.3);
    g.fillRoundedRect(OLIN_X - 106, OLIN_PEW_Y + 18, 28, 20, 4);
    g.fillRoundedRect(OLIN_X + 84, OLIN_PEW_Y + 17, 26, 18, 4);
    g.lineStyle(1.25, 0x7fc6d1, 0.13);
    g.lineBetween(OLIN_X - 130, OLIN_PEW_Y + 2, OLIN_X - 18, OLIN_PEW_Y + 2);
    g.lineBetween(OLIN_X + 20, OLIN_PEW_Y + 2, OLIN_X + 132, OLIN_PEW_Y + 2);
    // Painted Old Olin — a small hunched figure, feet on the pew top. Replaces
    // the old procedural body/head/staff silhouette.
    const sprite = this.add
      .image(OLIN_X, OLIN_PEW_Y + 2, "olin")
      .setOrigin(0.5, 1)
      .setDepth(2);
    sprite.setScale(OLIN_SPRITE_HEIGHT / sprite.height);
    this.olinImage = sprite;
    stageAnchoredSprite(this, sprite, {
      shadowWidth: 116,
      shadowHeight: 20,
      shadowOffsetY: 6,
      shadowAlpha: 0.18,
      restAlpha: 0.96,
      entranceOffsetY: 12,
      entranceMs: 620,
      breathDy: -2,
      breathMs: 2600,
      breathDelayMs: 300,
    });
  }
}
