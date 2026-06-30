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
  fadeOutStagedSprite,
  addIdleBreath,
  addLocalGroundShadow,
  playMeterPulse,
  playRealmClearResonance,
  stageContainerEntrance,
  stageAnchoredSprite,
} from "../game/livingScene";
import { pickAdaptiveWords, SUNKEN_BELL_WORD_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import {
  bobWrenSprite,
  flashWrenMiss,
  makeWrenSprite,
  playWrenAction,
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
  private ghosts: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  /** King Aurland's painted sprite — fades in when he's freed at fork 2 and is
   *  faded/destroyed when the realm moves past the fork (or on shutdown). */
  private aurlandImage?: Phaser.GameObjects.Image;

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
    this.beatPhase = "on";
    this.beatLocked = false;
    this.breath.reset();
    this.breathActive = false;
    this.onWaveCleared = null;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.quietLordIntruded =
      this.store.get().realms["sunken-bell"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("sunken-bell-backdrop", sunkenBellBackdrop);
    this.load.image("bell-ghost", bellGhostSprite);
    this.load.image("bell-warden", bellWardenSprite);
    this.load.image("olin", olinSprite);
    this.load.image("aurland", aurlandSprite);
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
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);

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
    const band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
      satchelLabel: "",
    });

    this.narration = new NarrationManager(this, { y: 120, framed: true });
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
      onSustainedLowHeart: () => this.setNarrator(pickLowHeartLine().text),
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
    this.setNarrator(
      lines.length === 1
        ? lines[0]!
        : "Your satchel stirs; its relics answer here.",
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
    const lanternContainers: Phaser.GameObjects.Container[] = [];
    const lanternPulseTweens: Phaser.Tweens.Tween[] = [];

    lanternWords.forEach((word, i) => {
      const pos = lanternPositions[i];
      if (!pos) return;

      // Draw lantern shape
      const lanternG = this.add.graphics();
      lanternG.fillStyle(0xc9a14a, 0.6);
      lanternG.fillEllipse(0, 0, 40, 60);
      lanternG.lineStyle(2, 0xf3ead2, 0.8);
      lanternG.strokeEllipse(0, 0, 40, 60);

      const lc = this.add.container(pos.x, pos.y, [lanternG]);
      lanternContainers.push(lc);

      // Pulse tween
      const pulseTween = this.tweens.add({
        targets: lanternG,
        alpha: { from: 0.6, to: 1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      lanternPulseTweens.push(pulseTween);

      const target = this.makeWord({
        scene: this,
        word,
        x: pos.x,
        y: pos.y - 60,
        fontSize: 36,
        onComplete: () => {
          // Still the lantern and brighten it
          pulseTween.stop();
          lanternG.setAlpha(1);
          lanternG.clear();
          lanternG.fillStyle(0xf3c855, 1);
          lanternG.fillEllipse(0, 0, 40, 60);
          lanternG.lineStyle(2, 0xf3ead2, 1);
          lanternG.strokeEllipse(0, 0, 40, 60);

          lit += 1;
          if (lit >= lanternWords.length) {
            this.time.delayedCall(800, () => this.startOlinNPC());
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  // ─── Act 1: Old Olin NPC ──────────────────────────────────────────────────

  private startOlinNPC(): void {
    this.clearActiveTargets();
    // Draw Olin — hunched silhouette on a pew
    this.drawOlin();

    this.setNarrator("tell me your name, child.", "Old Olin");
    this.time.delayedCall(600, () => {
      const nameTarget = this.makeWord({
        scene: this,
        word: "wren",
        x: this.scale.width / 2,
        y: this.scale.height - 340,
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
              const teachTarget = this.makeWord({
                scene: this,
                word: "teach me",
                x: this.scale.width / 2,
                y: this.scale.height - 340,
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
    this.ghosts = [];
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
    this.onWaveCleared = () => this.onWave1Cleared();
    this.narration.say("sunken_choir_wave1");
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
    this.ghosts = [];
    // Flip the accept window to the half-beat — answer BETWEEN the tolls.
    this.beatPhase = "off";
    this.onWaveCleared = () => this.onAntiphonCleared();
    this.narration.say("sunken_antiphon_intro");
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
    this.onWaveCleared = () => this.onWave2Cleared();
    this.narration.say("sunken_choir_wave2");

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
    const target = this.makeWord({
      scene: this,
      word: "read it",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
      fontSize: 36,
      onComplete: () => {
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
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Act 2: Fork 1 — The Cathedral Doors ──────────────────────────────────

  private startFork1(): void {
    this.narration.say("sunken_fork1_intro");

    const chantTarget = this.makeWord({
      scene: this,
      word: "open slowly",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 340,
      fontSize: 32,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "chant";
        this.startFork1Chant();
      },
    });
    const forceTarget = this.makeWord({
      scene: this,
      word: "force them open",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 340,
      fontSize: 32,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "force";
        this.startFork1Force();
      },
    });
    this.typingInput.register(chantTarget);
    this.typingInput.register(forceTarget);
    this.activeTargets.push(chantTarget, forceTarget);
  }

  private startFork1Chant(): void {
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
    this.time.delayedCall(700, () => {
      const openTarget = this.makeWord({
        scene: this,
        word: "OPEN",
        x: this.scale.width / 2,
        y: this.scale.height - 340,
        fontSize: 56,
        caseSensitive: true,
        burstColor: BELL_BURST_COLOR,
        onComplete: () => {
          this.clearActiveTargets();
          this.cameras.main.shake(240, 0.006);
          playDamageThud();
          this.startFork1ForceBreak();
        },
      });
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
      const target = this.makeWord({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 340,
        fontSize: 40,
        onComplete: () => {
          step += 1;
          this.clearActiveTargets();
          advance();
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    this.time.delayedCall(400, advance);
  }

  private startAct3Corridor(): void {
    this.clearActiveTargets();
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
    return sprite;
  }

  private startAct3(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.ghosts = [];
    const wardenSprite = this.drawWarden();
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
      const target = this.makeWord({
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

    const phrases = ["tide-and-toll", "deep-and-dark", "still-and-stir"];
    let remaining = phrases.length;

    this.time.delayedCall(800, () => {
      phrases.forEach((word, i) => {
        const target = this.makeWord({
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
                    this.time.delayedCall(400, () => this.startWardenPhase3());
                  },
                });
              } else {
                this.time.delayedCall(400, () => this.startWardenPhase3());
              }
            }
          },
        });
        this.typingInput.register(target);
        this.activeTargets.push(target);
      });
    });
  }

  private startWardenPhase3(): void {
    this.setNarrator("The bell sings. Type each word on the toll.");

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
      const target = this.makeWord({
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

    const freeTarget = this.makeWord({
      scene: this,
      word: "free king aurland",
      x: this.scale.width / 2 - 360,
      y: this.scale.height - 340,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "free-aurland";
        this.startFork2FreeAurland();
      },
    });
    const claimTarget = this.makeWord({
      scene: this,
      word: "claim the tongue",
      x: this.scale.width / 2 + 360,
      y: this.scale.height - 340,
      fontSize: 30,
      frame: "banner",
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "claim-tongue";
        this.startFork2ClaimTongue();
      },
    });
    this.typingInput.register(freeTarget);
    this.typingInput.register(claimTarget);
    this.activeTargets.push(freeTarget, claimTarget);
  }

  private startFork2FreeAurland(): void {
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
    this.aurlandImage = undefined;
    fadeOutStagedSprite(this, sprite, {
      durationMs: 1000,
      ease: "Sine.easeOut",
    });
  }

  private startFork2ClaimTongue(): void {
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
      this.startGlassFishGate();
    });
  }

  // ─── Glass-fish gate ─────────────────────────────────────────────────────

  private startGlassFishGate(): void {
    this.clearActiveTargets();
    if (this.fork2Choice === "free-aurland") {
      this.setNarrator("A small glass-fish leads the way up through the dark water.");
      this.time.delayedCall(1000, () => {
        const takeTarget = this.makeWord({
          scene: this,
          word: "take her with you",
          x: this.scale.width / 2 - 300,
          y: this.scale.height - 340,
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
        const letGoTarget = this.makeWord({
          scene: this,
          word: "let her go",
          x: this.scale.width / 2 + 300,
          y: this.scale.height - 340,
          fontSize: 30,
          frame: "banner",
          onComplete: () => {
            this.clearActiveTargets();
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

  // ─── True-name passage ───────────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.narration.say("sunken_truename_intro");
    this.time.delayedCall(800, () => {
      const trueName = "the bell remembers. the deep listens. the kingdom holds.";
      const target = this.makeWord({
        scene: this,
        word: trueName,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 28,
        onComplete: () => {
          this.clearActiveTargets();
          playChime();
          this.time.delayedCall(600, () => this.startEnding());
        },
      });
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
          this.scene.start("PortalChamberScene", { store: this.store });
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
      const target = this.makeWord({
        scene: this,
        word: step.word,
        x: this.scale.width / 2,
        y: this.scale.height - 340,
        fontSize: 34,
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1200, advance);
        },
      });
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
      const target = this.makeWord({
        scene: this,
        word: step.word,
        x: this.scale.width / 2,
        y: this.scale.height - 340,
        fontSize: 36,
        onComplete: () => {
          playWrenAction(this.wrenSprite);
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1000, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private clearActiveTargets(): void {
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
    addIdleBreath(this, sprite, { dy: -2, durationMs: 2600, delayMs: 300 });
  }
}
