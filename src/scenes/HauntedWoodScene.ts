import Phaser from "phaser";
import { type AmbientHandle, playAmbientWood } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playWaveSting } from "../audio/waveSting";
import { HeartSoulHud } from "../game/heartSoulHud";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, SERIF } from "../game/palette";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import {
  pickAdaptiveWords,
  type WoodDirection,
  WOOD_DIRECTION_PUNCTUATION,
  woodWordsForDirection,
} from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, preloadWren } from "../game/wren";
import hauntedWoodBackdrop from "../../art/references/haunted-wood-clean.png";

interface HauntedWoodSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// ─── Ghost enemy ──────────────────────────────────────────────────────────────

interface HauntedGhost {
  container: Phaser.GameObjects.Container;
  target: TextWordTarget | null;
  restX: number;
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  advanceMs: number;
  /** Compass direction the ghost approached from. Determines the punctuation
   *  on its word and the side of Wren it advances toward. */
  direction: WoodDirection;
}

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
  private wrenSprite!: Phaser.GameObjects.Image;
  private ghosts: HauntedGhost[] = [];
  private activeTargets: TextWordTarget[] = [];

  // Fork choices tracked for save state
  private fork1Choice: "offering" | "bone-flute" | null = null;
  private fork2Choice: "bargain" | "force" | null = null;
  private companionChoice: "call" | "leave" | null = null;

  private mistTimer: Phaser.Time.TimerEvent | null = null;
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
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.companionChoice = null;
    this.mistTimer = null;
  }

  preload(): void {
    this.load.image("haunted-wood-backdrop", hauntedWoodBackdrop);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 14, 18, 14);
    this.add
      .image(0, 0, "haunted-wood-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    this.drawShrine();
    this.drawWren(WREN_X, WREN_Y);

    this.narration = new NarrationManager(this, { y: 150 });

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      onSustainedLowHeart: () => this.setNarrator(pickLowHeartLine().text),
    });
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.mistTimer?.remove();
      this.compassGlyphs.forEach((g) => g.destroy());
      this.compassGlyphs = [];
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

  // ─── Act 1 — Into the Wood ────────────────────────────────────────────────

  private startArrival(): void {
    this.setNarrator(
      "Wren. This place remembers everything. Move carefully. Speak only when spoken to.",
    );
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
        this.time.delayedCall(800, () => this.startIngaNPC());
        return;
      }
      const beat = beats[i];
      if (!beat) return;
      const target = new TextWordTarget({
        scene: this,
        word: beat.word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 40,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.setNarrator(beat.narrator);
          i += 1;
          this.time.delayedCall(1600, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
  }

  // ─── Act 1 — Inga NPC ────────────────────────────────────────────────────

  private startIngaNPC(): void {
    this.drawInga(560, 760);

    this.store.update((s) => {
      if (!s.almanacLore.includes("the-crossroads-ghost")) {
        s.almanacLore.push("the-crossroads-ghost");
      }
    });

    // Inga speaks
    this.setNarrator("i don't know my name.");
    this.time.delayedCall(1800, () => {
      // Wren types a reply
      const reply = new TextWordTarget({
        scene: this,
        word: "i'll find it.",
        x: this.scale.width / 2,
        y: this.scale.height - 200,
        fontSize: 36,
        onComplete: () => {
          this.clearActiveTargets();
          this.setNarrator("the shrine knows. the shrine keeper might tell you.");
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
    playWaveSting();
    this.cameras.main.shake(220, 0.005);

    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.spawnGhostsByDirection(directions, 300);
    this.time.delayedCall(200, () =>
      this.setNarrator(
        "Ghosts drift from the tree-line. Each carries a mark — match it to ward them.",
      ),
    );
  }

  private onCrossroads1Cleared(): void {
    this.time.delayedCall(1400, () => this.startCrossroads2());
  }

  // Encounter 2: 4 ghosts from all four compass directions. First time
  // the player sees south, completing the punctuation set.
  private startCrossroads2(): void {
    this.setNarrator("The cold deepens. The shrine pulses faintly.");
    playWaveSting();
    this.cameras.main.shake(220, 0.005);

    const directions: WoodDirection[] = ["north", "south", "east", "west"];
    this.ghosts = [];
    this.spawnGhostsByDirection(directions, 280);
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

    const directions: WoodDirection[] = ["north", "north", "east", "west"];
    this.ghosts = [];
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
    directions.forEach((dir, i) => {
      const slot = slotCounts[dir];
      slotCounts[dir] += 1;
      const bank = woodWordsForDirection(dir);
      const word =
        pickAdaptiveWords(bank, 1, this.store.get().keyStats)[0] ?? bank[0];
      if (!word) return;
      this.spawnGhost(dir, word, i * delayStepMs, slot);
    });
  }

  private onCrossroads3Cleared(): void {
    this.mistTimer?.remove();
    this.mistTimer = null;
    this.time.delayedCall(1600, () => this.startFork1());
  }

  // ─── Fork 1 — The Crossroads Shrine ──────────────────────────────────────

  private startFork1(): void {
    this.setNarrator(
      "The shrine glows at the crossroads. Two ways forward. The offering bowl is empty. A flute-bone catches your eye.",
    );

    const offeringTarget = new TextWordTarget({
      scene: this,
      word: "leave an offering",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 200,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "offering";
        this.startFork1Offering();
      },
    });
    const fluteTarget = new TextWordTarget({
      scene: this,
      word: "take the bone-flute",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 200,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "bone-flute";
        this.startFork1BoneFlute();
      },
    });
    this.typingInput.register(offeringTarget);
    this.typingInput.register(fluteTarget);
    this.activeTargets.push(offeringTarget, fluteTarget);
  }

  // ─── Fork 1A — Offering ───────────────────────────────────────────────────

  private startFork1Offering(): void {
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
          this.store.update((s) => {
            if (!s.satchel.includes("shrine-token")) {
              s.satchel.push("shrine-token");
            }
          });
          playChime();
          this.cameras.main.flash(400, 200, 220, 180, false);
          this.setNarrator("Inga stirs. The shrine keeper whispers a name.");
          this.time.delayedCall(2000, () => this.startIngaNameReveal());
        },
      );
    });
  }

  private startIngaNameReveal(): void {
    this.setNarrator("Her name. Type it back to her.");
    const target = new TextWordTarget({
      scene: this,
      word: "inga",
      x: this.scale.width / 2,
      y: this.scale.height - 200,
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
        this.time.delayedCall(2400, () => this.startAct3());
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Fork 1B — Bone-Flute ─────────────────────────────────────────────────

  private startFork1BoneFlute(): void {
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
          this.time.delayedCall(1600, () => this.startAct3());
        },
      );
    });
  }

  // ─── Act 3 — The Ghost-King's Hall ────────────────────────────────────────

  private startAct3(): void {
    this.setNarrator("The trees part. A wider clearing. A throne of tangled roots.");
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

    const bargainTarget = new TextWordTarget({
      scene: this,
      word: "speak your true name",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 200,
      fontSize: 28,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "bargain";
        this.startFork2Bargain();
      },
    });
    const forceTarget = new TextWordTarget({
      scene: this,
      word: "light the grove",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 200,
      fontSize: 28,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "force";
        this.startBossFight();
      },
    });
    this.typingInput.register(bargainTarget);
    this.typingInput.register(forceTarget);
    this.activeTargets.push(bargainTarget, forceTarget);
  }

  // ─── Fork 2A — Bargain ────────────────────────────────────────────────────

  private startFork2Bargain(): void {
    this.setNarrator("The Ghost-King pauses. He turns to face you fully.");
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
          this.time.delayedCall(1400, () => this.startBossFight());
        },
      );
    });
  }

  // ─── Boss Fight — two waves ────────────────────────────────────────────────

  private startBossFight(): void {
    this.setNarrator("\"Then prove it.\" Ghost-wave rises from the hall.");
    this.ghosts = [];
    this.time.delayedCall(800, () => this.spawnBossWaveA());
  }

  private spawnBossWaveA(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    // Wave A: three directions, slower spawn pace. The player should still
    // recognize the learned punctuation-direction mapping from Act 2.
    const directions: WoodDirection[] = ["west", "east", "north"];
    this.ghosts = [];
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveACleared(): void {
    this.setNarrator("The first wave fades. More rise.");
    this.time.delayedCall(1200, () => this.spawnBossWaveB());
  }

  private spawnBossWaveB(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    // Wave B: south-heavy attack — two from below + one from above. Reads
    // as the Ghost-King's hall rising up against Wren.
    const directions: WoodDirection[] = ["south", "south", "north"];
    this.ghosts = [];
    this.spawnGhostsByDirection(directions, 350);
  }

  private onBossWaveBCleared(): void {
    this.setNarrator("The hall goes still. The Ghost-King rises fully.");
    this.time.delayedCall(2200, () => this.startBossCapstone());
  }

  // ─── Boss Phase 2 — Every-Punctuation Capstone ────────────────────────────
  //
  // The Ghost-King's last words. One passage that touches every punctuation
  // mark in the game: the four cardinal marks the realm has been teaching
  // (. , ? !) plus the two reserved (; :) that the player sees here for the
  // first time. Per §5.5.8 this is the boss's phase 2.

  private startBossCapstone(): void {
    const dimOverlay = this.add.graphics().setDepth(40).fillStyle(0x000000, 0.4);
    dimOverlay.fillRect(0, 0, this.scale.width, this.scale.height);
    dimOverlay.setAlpha(0);
    this.tweens.add({ targets: dimOverlay, alpha: 1, duration: 700 });

    this.setNarrator("The Ghost-King speaks his last words.");
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
    this.setNarrator("Type the realm's true name — word by word.");
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
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 48,
        onComplete: () => {
          playChime();
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
    this.setNarrator("The Ghost-King dissolves into the mist.");

    // Flash ~~Again~~ — fifth realm, full word, no period
    this.time.delayedCall(1200, () => {
      this.showQuietLordFragment("~~Again~~", () => {
        this.time.delayedCall(600, () => this.startWispCatGate());
      });
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
    this.time.delayedCall(1600, () => {
      const callTarget = new TextWordTarget({
        scene: this,
        word: "call to her",
        x: this.scale.width / 2 - 320,
        y: this.scale.height - 200,
        fontSize: 30,
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
          this.time.delayedCall(1800, () => this.startEnding());
        },
      });
      const leaveTarget = new TextWordTarget({
        scene: this,
        word: "leave her",
        x: this.scale.width / 2 + 320,
        y: this.scale.height - 200,
        fontSize: 30,
        onComplete: () => {
          this.clearActiveTargets();
          this.companionChoice = "leave";
          this.setNarrator("She watches you go. Her light stays in the clearing.");
          this.time.delayedCall(1800, () => this.startEnding());
        },
      });
      this.typingInput.register(callTarget);
      this.typingInput.register(leaveTarget);
      this.activeTargets.push(callTarget, leaveTarget);
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.setNarrator("You return to the portal. The Almanac stamps a new page.");

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
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    const stamp = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "the haunted wood", {
        fontFamily: SERIF,
        fontSize: "64px",
        color: PALETTE.cream,
        backgroundColor: "#0e120e",
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
    container.setAlpha(0);

    const advanceMs = isPunctWord ? GHOST_ADVANCE_FAST : GHOST_ADVANCE_SLOW;

    const ghost: HauntedGhost = {
      container,
      target: null,
      restX: pos.restX,
      restY: pos.restY,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
      direction,
    };

    this.tweens.add({
      targets: container,
      x: pos.restX,
      y: pos.restY,
      alpha: 0.6,
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
        .setAlpha(0.32)
        .setDepth(2);
      this.compassGlyphs.push(glyph);
    }
  }

  private drawGhostInto(
    c: Phaser.GameObjects.Container,
    punctuated: boolean,
  ): void {
    const g = this.add.graphics();
    // Translucent white-grey body
    const bodyColor = punctuated ? 0xdde8dd : 0xe8eee8;
    g.fillStyle(bodyColor, 0.55);
    g.fillEllipse(0, 0, 56, 76);
    // Inner glow — smaller, lighter ellipse
    g.fillStyle(0xf4faf4, 0.25);
    g.fillEllipse(0, -6, 32, 44);
    // Wispy bottom fade
    g.fillStyle(0xc8d8c8, 0.25);
    g.fillEllipse(0, 32, 46, 26);
    // Eyes — two small dim circles
    g.fillStyle(0x1a261a, 0.7);
    g.fillCircle(-10, -6, 4);
    g.fillCircle(10, -6, 4);
    c.add(g);
  }

  private ghostIdleBob(c: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 7 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private attachGhostTarget(ghost: HauntedGhost): void {
    const target = new TextWordTarget({
      scene: this,
      word: ghost.word,
      x: ghost.container.x,
      y: ghost.restY - 80,
      fontSize: 32,
      // Wisp-themed pale gray-green burst on defeat — reads as a ghost going
      // down in mist, not the default brass.
      burstColor: GHOST_BURST_COLOR,
      onComplete: () => this.defeatGhost(ghost),
    });
    ghost.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startGhostAdvance(ghost: HauntedGhost): void {
    // Advance toward Wren in both axes — ghosts from N/S close vertically,
    // E/W close horizontally. Euclidean distance scales duration so
    // farther starts get more time.
    const dx = WREN_X - ghost.container.x;
    const dy = WREN_Y - ghost.container.y;
    const remaining = Math.hypot(dx, dy);
    const totalRange = Math.hypot(WREN_X - ghost.restX, WREN_Y - ghost.restY);
    const duration =
      ghost.advanceMs * Math.max(0.3, remaining / Math.max(1, totalRange));

    ghost.advanceTween = this.tweens.add({
      targets: ghost.container,
      x: WREN_X,
      y: WREN_Y,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        if (!ghost.target) return;
        ghost.target.setAnchorX(ghost.container.x);
        ghost.target.setAnchorY(ghost.container.y - 80);
        // Danger pulse — as the ghost crosses DANGER_RAMP_START of its
        // advance, the floating word shifts cream → ember.
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

  private defeatGhost(ghost: HauntedGhost): void {
    if (ghost.defeated) return;
    ghost.defeated = true;
    playChime();

    if (ghost.target) {
      this.typingInput.unregister(ghost.target);
      const idx = this.activeTargets.indexOf(ghost.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      ghost.target = null;
    }
    ghost.advanceTween?.stop();
    ghost.advanceTween = null;
    this.tweens.killTweensOf(ghost.container);

    this.tweens.add({
      targets: ghost.container,
      alpha: 0,
      y: ghost.container.y - 50,
      duration: 500,
      ease: "Sine.easeOut",
      onComplete: () => ghost.container.destroy(),
    });

    this.checkGhostWaveComplete();
  }

  private ghostReachesWren(ghost: HauntedGhost): void {
    this.cameras.main.shake(180, 0.004);

    if (ghost.target) {
      this.typingInput.unregister(ghost.target);
      const idx = this.activeTargets.indexOf(ghost.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      ghost.target.destroy();
      ghost.target = null;
    }
    this.tweens.killTweensOf(ghost.container);

    this.tweens.add({
      targets: ghost.container,
      x: ghost.restX,
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

  private checkGhostWaveComplete(): void {
    if (!this.ghosts.every((g) => g.defeated)) return;

    // Determine which wave just completed by checking bossDefeated flag and
    // the narrator text.
    const narr = this.narration.currentText();
    if (narr.includes("Ward them")) {
      this.ghosts = [];
      this.time.delayedCall(1000, () => this.onCrossroads1Cleared());
    } else if (narr.includes("cold deepens")) {
      this.ghosts = [];
      this.time.delayedCall(1000, () => this.onCrossroads2Cleared());
    } else if (narr.includes("Older")) {
      this.ghosts = [];
      this.time.delayedCall(1000, () => this.onCrossroads3Cleared());
    } else if (narr.includes("first wave")) {
      this.ghosts = [];
      this.time.delayedCall(1000, () => this.onBossWaveBCleared());
    } else if (narr.includes("Ghost-wave")) {
      this.ghosts = [];
      this.time.delayedCall(1000, () => this.onBossWaveACleared());
    }
  }

  // ─── Mist roll mechanic ───────────────────────────────────────────────────

  private triggerMistRoll(): void {
    const mist = this.add.graphics();
    mist.fillStyle(0xe8eee8, 0);
    mist.fillRect(0, 0, this.scale.width, this.scale.height);
    mist.setDepth(100);

    this.tweens.add({
      targets: mist,
      alpha: 0.45,
      duration: 600,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Mist peak: obscure ghost words for the hold duration. Player must
        // clear words before the roll, or hold their nerve and type blind.
        this.setActiveGhostWordsHidden(true);
        this.time.delayedCall(800, () => {
          this.setActiveGhostWordsHidden(false);
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
      if (ghost.defeated || !ghost.target) continue;
      ghost.target.setHidden(hidden);
    }
  }

  // ─── Quiet Lord fragment ───────────────────────────────────────────────────

  private showQuietLordFragment(text: string, onDone: () => void): void {
    const frag = this.add
      .text(this.scale.width / 2, this.scale.height / 2, text, {
        fontFamily: SERIF,
        fontSize: "56px",
        color: PALETTE.dim,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: frag,
      alpha: 0.9,
      duration: 700,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.time.delayedCall(800, () => {
          this.tweens.add({
            targets: frag,
            alpha: 0,
            duration: 700,
            ease: "Sine.easeOut",
            onComplete: () => {
              frag.destroy();
              onDone();
            },
          });
        });
      },
    });
  }

  // ─── Passage-chain helper ─────────────────────────────────────────────────

  private runPassageChain(
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
        fontSize: 36,
        onComplete: () => {
          playChime();
          idx += 1;
          this.clearActiveTargets();
          if (step.narrator) this.setNarrator(step.narrator);
          this.time.delayedCall(1400, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };
    advance();
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

  private drawShrine(): void {
    // Stone rectangle with a candle glow on top
    const sx = 960;
    const sy = 810;
    const g = this.add.graphics();

    // Stone base
    g.fillStyle(0x303830, 1);
    g.fillRect(sx - 40, sy - 60, 80, 60);
    // Stone top slab
    g.fillStyle(0x3c443c, 1);
    g.fillRect(sx - 50, sy - 66, 100, 10);
    // Candle glow — amber circle
    g.fillStyle(0xd4a040, 0.85);
    g.fillCircle(sx, sy - 74, 8);
    // Soft outer glow
    g.fillStyle(0xeec870, 0.2);
    g.fillCircle(sx, sy - 74, 18);
    // Faint step at base
    g.fillStyle(0x252c25, 1);
    g.fillRect(sx - 56, sy, 112, 10);
  }

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    return c;
  }

  private drawInga(x: number, y: number): void {
    // Inga: smaller translucent ellipse, slightly warmer tone
    const g = this.add.graphics();
    // Translucent body — warmer than the grey ghosts
    g.fillStyle(0xf0e8d8, 0.38);
    g.fillEllipse(x, y, 42, 58);
    // Inner glow
    g.fillStyle(0xfaf4e8, 0.18);
    g.fillEllipse(x, y - 4, 24, 34);
    // Eyes
    g.fillStyle(0x2a1a0a, 0.6);
    g.fillCircle(x - 7, y - 4, 3);
    g.fillCircle(x + 7, y - 4, 3);
    // Lantern post
    g.lineStyle(2, 0x3a3630, 0.85);
    g.beginPath();
    g.moveTo(x + 30, y - 60);
    g.lineTo(x + 30, y + 40);
    g.strokePath();
    // Lantern box
    g.lineStyle(1, 0xc9a14a, 0.7);
    g.strokeRect(x + 22, y - 76, 16, 18);
    g.fillStyle(0xc9a14a, 0.3);
    g.fillRect(x + 22, y - 76, 16, 18);
  }

  private drawGhostKing(): void {
    const gkx = 1400;
    const gky = 560;
    const g = this.add.graphics();
    g.setAlpha(0);

    // Root throne — dark brown rectangles at the base
    g.fillStyle(0x1e1208, 1);
    for (const rx of [-80, -50, -20, 20, 50, 80]) {
      const rh = 60 + Math.abs(rx) * 0.4;
      g.fillRect(gkx + rx - 6, gky + 180, 12, rh);
    }
    // Throne seat slab
    g.fillStyle(0x282018, 1);
    g.fillRect(gkx - 100, gky + 170, 200, 20);

    // Ghost-King body — tall translucent figure
    g.fillStyle(0xd8e4d8, 0.45);
    g.fillEllipse(gkx, gky + 60, 90, 200);
    // Inner glow
    g.fillStyle(0xecf4ec, 0.18);
    g.fillEllipse(gkx, gky + 40, 50, 120);
    // Head
    g.fillStyle(0xd8e4d8, 0.5);
    g.fillEllipse(gkx, gky - 30, 70, 80);
    // Crown — small grey arcs
    g.lineStyle(2, 0xb8c8b8, 0.7);
    for (let i = -2; i <= 2; i++) {
      const cx = gkx + i * 14;
      g.beginPath();
      g.arc(cx, gky - 72, 10, Math.PI, 0, false);
      g.strokePath();
    }
    // Eyes
    g.fillStyle(0x0a180a, 0.7);
    g.fillCircle(gkx - 14, gky - 32, 5);
    g.fillCircle(gkx + 14, gky - 32, 5);

    // Fade in
    this.tweens.add({
      targets: g,
      alpha: 1,
      duration: 1200,
      ease: "Sine.easeIn",
    });
  }
}
