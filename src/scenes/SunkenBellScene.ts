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
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, SUNKEN_BELL_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, preloadWren } from "../game/wren";
import sunkenBellBackdrop from "../../art/references/sunken-bell-clean.png";

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

interface Ghost {
  container: Phaser.GameObjects.Container;
  target: TextWordTarget | null;
  spawnX: number;
  spawnSide: "left" | "right";
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  advanceMs: number;
  /** Set true for the ghost that splits on defeat */
  splits?: boolean;
}

const GHOST_KNOCKBACK_PAUSE_MS = 2000;
const WREN_X = 960;
const WREN_Y = 820;

export class SunkenBellScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private ghosts: Ghost[] = [];
  private activeTargets: TextWordTarget[] = [];
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;

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
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 8, 24, 32);
    this.add
      .image(0, 0, "sunken-bell-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);

    this.narration = new NarrationManager(this, { y: 120 });

    this.typingInput = new TypingInputController(this.store);
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
    });

    // Beat ring — bottom-center sonar pulse that emanates outward on each
    // bell toll. Bright + tight on the beat, fades + expands across the
    // claim window, then disappears until the next toll. Player sees this
    // and learns "type now" without anyone having to say it.
    this.beatRing = this.add.graphics().setDepth(10).setAlpha(0);
    this.beatRing.x = WREN_X;
    this.beatRing.y = 960;
    // Off-beat ("antiphon") ring — ember, pulses at the half-beat during the
    // call-and-response wave so the off-beat answer window is visible.
    this.offbeatRing = this.add.graphics().setDepth(10).setAlpha(0);
    this.offbeatRing.x = WREN_X;
    this.offbeatRing.y = 960;

    // Air gauge — drawn above Wren, hidden until choir-wave combat begins.
    this.breathBar = this.add.graphics().setDepth(11).setAlpha(0);
    this.breathLabel = this.add
      .text(WREN_X, WREN_Y + 48, "air", {
        fontFamily: SERIF,
        fontSize: "20px",
        color: PALETTE.dim,
      })
      .setOrigin(0.5)
      .setDepth(11)
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
      const target = new TextWordTarget({
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
    this.cameras.main.flash(300, 0, 0, 0, false);
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

  /** Redraw the air gauge below Wren from the current breath fraction. Frost
   *  when full, ember when low. Hidden entirely when the stake is inactive. */
  private drawBreathBar(): void {
    const bar = this.breathBar;
    bar.clear();
    if (!this.breathActive) {
      bar.setAlpha(0);
      this.breathLabel.setAlpha(0);
      return;
    }
    bar.setAlpha(1);
    this.breathLabel.setAlpha(0.8);
    const w = 160;
    const h = 14;
    const x = WREN_X - w / 2;
    const y = WREN_Y + 64;
    const frac = this.breath.getFraction();
    const low = frac < 0.4;
    bar.lineStyle(2, PALETTE_HEX.frost, 0.7);
    bar.strokeRoundedRect(x, y, w, h, 4);
    bar.fillStyle(low ? PALETTE_HEX.ember : PALETTE_HEX.frost, low ? 0.95 : 0.8);
    bar.fillRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), h - 2, 3);
  }

  /** Out of air — a non-terminal shove (the Bell has no candle/game-over
   *  economy). Dark flash + thud, then a partial breath back. The lost tempo
   *  and the broken combo are the real cost. */
  private gaspKnockback(): void {
    this.cameras.main.flash(280, 0, 0, 0, false);
    playDamageThud();
    flashDamageVignette(this);
    this.breath.gasp();
    this.drawBreathBar();
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

      const target = new TextWordTarget({
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

    this.setNarrator("tell me your name, child.");
    this.time.delayedCall(600, () => {
      const nameTarget = new TextWordTarget({
        scene: this,
        word: "wren",
        x: this.scale.width / 2,
        y: this.scale.height - 200,
        fontSize: 40,
        onComplete: () => {
          this.clearActiveTargets();
          this.setNarrator(
            "you are listening for the bell. on its toll, you may speak. between tolls, you cannot.",
          );
          this.time.delayedCall(3000, () => {
            this.setNarrator(
              "i taught the bell its name. i can teach you if you let me.",
            );
            this.time.delayedCall(800, () => {
              const teachTarget = new TextWordTarget({
                scene: this,
                word: "teach me",
                x: this.scale.width / 2,
                y: this.scale.height - 200,
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
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 400, 16000, pos.side);
    });
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
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 350, 14000, pos.side);
    });
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
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 450, 15000, pos.side);
    });
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
      this.spawnGhost(pos.x, pos.restX, pos.restY, word, i * 350, 13000, pos.side, splits);
    });
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
    const target = new TextWordTarget({
      scene: this,
      word: "read it",
      x: this.scale.width / 2,
      y: this.scale.height - 180,
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

    const chantTarget = new TextWordTarget({
      scene: this,
      word: "open slowly",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 200,
      fontSize: 32,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "chant";
        this.startFork1Chant();
      },
    });
    const forceTarget = new TextWordTarget({
      scene: this,
      word: "force them open",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 200,
      fontSize: 32,
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
      const openTarget = new TextWordTarget({
        scene: this,
        word: "OPEN",
        x: this.scale.width / 2,
        y: this.scale.height - 200,
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
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 200,
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

  private drawWarden(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    // Large bell shape at centre-right (trapezoid)
    const bx = 1400;
    const by = 500;
    g.fillStyle(0x2a2832, 1);
    // Bell body — trapezoid: wider at bottom
    g.beginPath();
    g.moveTo(bx - 80, by);
    g.lineTo(bx + 80, by);
    g.lineTo(bx + 140, by + 260);
    g.lineTo(bx - 140, by + 260);
    g.closePath();
    g.fillPath();
    // Bell top knob
    g.fillRect(bx - 20, by - 40, 40, 44);
    // Curved rim at bottom
    g.fillStyle(0x1e1a28, 1);
    g.fillEllipse(bx, by + 260, 280, 40);
    // Merfolk head fused into bell mouth area
    g.fillStyle(0x3a3050, 1);
    g.fillEllipse(bx, by + 200, 90, 80); // head
    // Fin suggestions on either side
    g.fillEllipse(bx - 80, by + 190, 40, 20);
    g.fillEllipse(bx + 80, by + 190, 40, 20);
    // Closed eyes (phase 1)
    g.fillStyle(0x0d0c14, 1);
    g.fillRect(bx - 22, by + 192, 14, 4);
    g.fillRect(bx + 8, by + 192, 14, 4);
    return g;
  }

  private startAct3(): void {
    playWaveSting();
    this.cameras.main.shake(140, 0.003);
    this.ghosts = [];
    const wardenGraphics = this.drawWarden();
    // Phase 1
    this.narration.say("sunken_warden_rise");
    this.time.delayedCall(1200, () => {
      this.startWardenPhase1(wardenGraphics);
    });
  }

  private startWardenPhase1(wardenGraphics: Phaser.GameObjects.Graphics): void {
    const words = ["weight", "silence", "deep"];
    let remaining = words.length;

    words.forEach((word, i) => {
      const target = new TextWordTarget({
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
              wardenGraphics.clear();
              this.redrawWardenPhase2(wardenGraphics, false);
              this.time.delayedCall(1400, () =>
                this.startWardenPhase2(wardenGraphics),
              );
            });
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  private redrawWardenPhase2(
    g: Phaser.GameObjects.Graphics,
    bright: boolean,
  ): void {
    g.clear();
    const bx = 1400;
    const by = 500;
    g.fillStyle(0x2a2832, 1);
    g.beginPath();
    g.moveTo(bx - 80, by);
    g.lineTo(bx + 80, by);
    g.lineTo(bx + 140, by + 260);
    g.lineTo(bx - 140, by + 260);
    g.closePath();
    g.fillPath();
    g.fillRect(bx - 20, by - 40, 40, 44);
    g.fillStyle(0x1e1a28, 1);
    g.fillEllipse(bx, by + 260, 280, 40);
    g.fillStyle(0x3a3050, 1);
    g.fillEllipse(bx, by + 200, 90, 80);
    g.fillEllipse(bx - 80, by + 190, 40, 20);
    g.fillEllipse(bx + 80, by + 190, 40, 20);
    // Open glowing eyes
    const eyeColor = bright ? 0x8de8ff : 0x4ab8d6;
    g.fillStyle(eyeColor, 1);
    g.fillCircle(bx - 16, by + 196, 6);
    g.fillCircle(bx + 16, by + 196, 6);
  }

  private startWardenPhase2(wardenGraphics: Phaser.GameObjects.Graphics): void {
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
        const target = new TextWordTarget({
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
              this.redrawWardenPhase2(wardenGraphics, true);
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
      const target = new TextWordTarget({
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

    const freeTarget = new TextWordTarget({
      scene: this,
      word: "free king aurland",
      x: this.scale.width / 2 - 360,
      y: this.scale.height - 200,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "free-aurland";
        this.startFork2FreeAurland();
      },
    });
    const claimTarget = new TextWordTarget({
      scene: this,
      word: "claim the tongue",
      x: this.scale.width / 2 + 360,
      y: this.scale.height - 200,
      fontSize: 30,
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
      this.startGlassFishGate();
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
        const takeTarget = new TextWordTarget({
          scene: this,
          word: "take her with you",
          x: this.scale.width / 2 - 300,
          y: this.scale.height - 200,
          fontSize: 30,
          onComplete: () => {
            this.clearActiveTargets();
            this.store.update((s) => {
              if (!s.satchel.includes("glass-fish")) s.satchel.push("glass-fish");
            });
            this.startTrueNamePassage();
          },
        });
        const letGoTarget = new TextWordTarget({
          scene: this,
          word: "let her go",
          x: this.scale.width / 2 + 300,
          y: this.scale.height - 200,
          fontSize: 30,
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
      const target = new TextWordTarget({
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
    const stamp = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "the sunken bell", {
        fontFamily: SERIF,
        fontSize: "64px",
        color: PALETTE.cream,
        backgroundColor: "#081820",
        padding: { left: 40, right: 40, top: 20, bottom: 20 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.6);

    this.tweens.add({
      targets: stamp,
      alpha: 1,
      scale: 1,
      duration: 350,
      ease: "Back.easeOut",
      onComplete: () => {
        playChime();
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: stamp,
            alpha: 0,
            duration: 300,
            onComplete: onDone,
          });
        });
      },
    });
  }

  // ─── Ghost enemies ────────────────────────────────────────────────────────

  private spawnGhost(
    startX: number,
    restX: number,
    restY: number,
    word: string,
    delay: number,
    advanceMs: number,
    side: "left" | "right",
    splits = false,
  ): void {
    const container = this.add.container(startX, restY);
    this.drawGhostInto(container);
    container.setAlpha(0);

    const ghost: Ghost = {
      container,
      target: null,
      spawnX: restX,
      spawnSide: side,
      restY,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
      splits,
    };

    this.tweens.add({
      targets: container,
      x: restX,
      alpha: 0.7,
      duration: 900,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (ghost.defeated) return;
        this.attachGhostTarget(ghost);
        this.ghostIdleBob(container);
        this.startGhostAdvance(ghost);
      },
    });

    this.ghosts.push(ghost);
  }

  private drawGhostInto(c: Phaser.GameObjects.Container): void {
    const g = this.add.graphics();
    // Translucent white oval body
    g.fillStyle(0xddeeff, 0.7);
    g.fillEllipse(0, 0, 60, 80);
    // Wispy bottom
    g.fillStyle(0xaaccee, 0.4);
    g.fillEllipse(0, 35, 50, 30);
    // Eyes — use PALETTE_HEX.ink for depth
    g.fillStyle(PALETTE_HEX.ink, 0.9);
    g.fillCircle(-12, -8, 5);
    g.fillCircle(12, -8, 5);
    c.add(g);
  }

  private ghostIdleBob(c: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 8 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private attachGhostTarget(ghost: Ghost): void {
    const target = new TextWordTarget({
      scene: this,
      word: ghost.word,
      x: ghost.container.x,
      y: ghost.restY - 80,
      fontSize: 32,
      // Sea-green burst — ghost dissolves into deep water, not brass.
      burstColor: BELL_BURST_COLOR,
      onComplete: () => this.defeatGhost(ghost),
    });
    ghost.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startGhostAdvance(ghost: Ghost): void {
    const wrenX = this.wrenContainer.x;
    const remaining = Math.abs(ghost.container.x - wrenX);
    const totalRange = Math.abs(ghost.spawnX - wrenX);
    const duration =
      ghost.advanceMs * Math.max(0.3, remaining / Math.max(1, totalRange));

    ghost.advanceTween = this.tweens.add({
      targets: ghost.container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        if (!ghost.target) return;
        ghost.target.setAnchorX(ghost.container.x);
        // Danger pulse — ramps over the last 60% of the advance so the
        // word reads cream while readable, then shifts ember as the ghost
        // closes. Communicates urgency without UI chrome.
        const dangerLevel = Math.max(
          0,
          (tween.progress - DANGER_RAMP_START) / (1 - DANGER_RAMP_START),
        );
        ghost.target.setDanger(dangerLevel);
      },
      onComplete: () => {
        ghost.advanceTween = null;
        if (!ghost.defeated) {
          this.ghostReachesWren(ghost);
        }
      },
    });
  }

  private defeatGhost(ghost: Ghost): void {
    if (ghost.defeated) return;
    ghost.defeated = true;
    if (ghost.target) {
      this.typingInput.unregister(ghost.target);
      const idx = this.activeTargets.indexOf(ghost.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      ghost.target = null;
    }
    ghost.advanceTween?.stop();
    ghost.advanceTween = null;
    this.tweens.killTweensOf(ghost.container);

    // Show defeat flicker
    this.showQuietFlicker();

    // A clean defeat in a choir wave = a breath.
    if (this.breathActive) {
      this.breath.inhale();
      this.drawBreathBar();
    }

    // Handle split
    if (ghost.splits) {
      const splitWords = ["ebb", "drift"];
      const offsets = [-60, 60];
      splitWords.forEach((w, i) => {
        const sx = ghost.container.x + (offsets[i] ?? 0);
        const sy = ghost.restY;
        this.spawnGhost(sx, sx, sy, w, 0, 5000,
          sx < WREN_X ? "left" : "right");
      });
    }

    this.tweens.add({
      targets: ghost.container,
      alpha: 0,
      y: ghost.container.y - 50,
      duration: 500,
      ease: "Sine.easeOut",
      onComplete: () => ghost.container.destroy(),
    });

    this.checkWaveCleared();
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

  private ghostReachesWren(ghost: Ghost): void {
    // Dark flash, knockback, no wave reset
    this.cameras.main.flash(300, 0, 0, 0, false);
    playDamageThud();
    flashDamageVignette(this);

    if (ghost.target) {
      this.typingInput.unregister(ghost.target);
      const idx = this.activeTargets.indexOf(ghost.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      ghost.target.destroy();
      ghost.target = null;
    }
    this.tweens.killTweensOf(ghost.container);

    // Push back to spawn
    this.tweens.add({
      targets: ghost.container,
      x: ghost.spawnX,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (ghost.defeated) return;
        this.time.delayedCall(GHOST_KNOCKBACK_PAUSE_MS, () => {
          if (ghost.defeated) return;
          this.ghostIdleBob(ghost.container);
          this.attachGhostTarget(ghost);
          this.startGhostAdvance(ghost);
        });
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
    if (!this.ghosts.every((g) => g.defeated)) return;
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
      const target = new TextWordTarget({
        scene: this,
        word: step.word,
        x: this.scale.width / 2,
        y: this.scale.height - 200,
        fontSize: 34,
        onComplete: () => {
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
      const target = new TextWordTarget({
        scene: this,
        word: step.word,
        x: this.scale.width / 2,
        y: this.scale.height - 200,
        fontSize: 36,
        onComplete: () => {
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

  private setNarrator(text: string): void {
    this.narration.sayRaw(text);
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
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    return c;
  }

  private drawOlin(): void {
    // Hunched figure on a pew — simple silhouette
    const g = this.add.graphics();
    // Pew
    g.fillStyle(0x1a2030, 1);
    g.fillRect(200, 820, 300, 20);
    g.fillRect(200, 820, 10, 60);
    g.fillRect(490, 820, 10, 60);
    // Body (hunched)
    g.fillStyle(0x1e1a28, 0.85);
    g.fillEllipse(260, 800, 60, 80);
    // Head (bowed)
    g.fillCircle(255, 760, 18);
    // Suggested staff
    g.lineStyle(2, 0x2a2840, 0.8);
    g.beginPath();
    g.moveTo(290, 760);
    g.lineTo(310, 870);
    g.strokePath();
    void g; // used
  }
}

