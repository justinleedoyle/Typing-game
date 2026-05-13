import Phaser from "phaser";
import { type AmbientHandle, playAmbientWood } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, HAUNTED_WOOD_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the word contains any of . , ? ! ; : */
function hasPunctuation(word: string): boolean {
  return /[.,?!;:]/.test(word);
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class HauntedWoodScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;
  private ghosts: HauntedGhost[] = [];
  private activeTargets: TextWordTarget[] = [];

  // Fork choices tracked for save state
  private fork1Choice: "offering" | "bone-flute" | null = null;
  private fork2Choice: "bargain" | "force" | null = null;
  private companionChoice: "call" | "leave" | null = null;

  private mistTimer: Phaser.Time.TimerEvent | null = null;
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

  create(): void {
    this.cameras.main.fadeIn(600, 14, 18, 14);
    this.drawBackground();
    this.drawTrees();
    this.drawShrine();
    this.drawWren(WREN_X, WREN_Y);

    this.narratorText = this.add
      .text(this.scale.width / 2, 150, "", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 1400 },
      })
      .setOrigin(0.5);

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.mistTimer?.remove();
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
        y: this.scale.height - 220,
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
        y: this.scale.height - 220,
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

  // Encounter 1: 3 ghosts — left, right, top-centre
  private startCrossroads1(): void {
    const words = pickAdaptiveWords(
      HAUNTED_WOOD_WORD_BANK,
      3,
      this.store.get().keyStats,
    );
    // Fixed: override to ensure spec words if bank picks something else; we
    // just use adaptive picks since all bank words have punctuation.
    const positions: Array<{ startX: number; restX: number; restY: number }> = [
      { startX: -120, restX: 300, restY: 750 },
      { startX: this.scale.width + 120, restX: 1620, restY: 760 },
      { startX: 960, restX: 960, restY: -80 },
    ];
    this.ghosts = [];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      const fromAbove = pos.startX === pos.restX && pos.restY < 0;
      const startY = fromAbove ? -120 : pos.restY;
      this.spawnGhost(pos.startX, pos.restX, startY, pos.restY, word, i * 300);
    });
    this.time.delayedCall(200, () =>
      this.setNarrator("Ghosts drift from the tree-line. Ward them with their names."),
    );
  }

  private onCrossroads1Cleared(): void {
    this.time.delayedCall(1400, () => this.startCrossroads2());
  }

  // Encounter 2: 4 ghosts
  private startCrossroads2(): void {
    this.setNarrator("The cold deepens.");
    const words = pickAdaptiveWords(
      HAUNTED_WOOD_WORD_BANK,
      4,
      this.store.get().keyStats,
    );
    const positions: Array<{ startX: number; restX: number; restY: number }> = [
      { startX: -120, restX: 240, restY: 730 },
      { startX: this.scale.width + 120, restX: 1680, restY: 750 },
      { startX: -120, restX: 480, restY: 700 },
      { startX: this.scale.width + 120, restX: 1440, restY: 720 },
    ];
    this.ghosts = [];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.startX, pos.restX, pos.restY, pos.restY, word, i * 280);
    });
  }

  private onCrossroads2Cleared(): void {
    this.time.delayedCall(1400, () => this.startCrossroads3());
  }

  // Encounter 3: 4 ghosts with longer punctuated words
  private startCrossroads3(): void {
    this.setNarrator("Older things stir. The shrine pulses faintly.");
    const words = pickAdaptiveWords(
      HAUNTED_WOOD_WORD_BANK,
      4,
      this.store.get().keyStats,
    );
    const positions: Array<{ startX: number; restX: number; restY: number }> = [
      { startX: -120, restX: 300, restY: 720 },
      { startX: this.scale.width + 120, restX: 1620, restY: 740 },
      { startX: -120, restX: 540, restY: 760 },
      { startX: this.scale.width + 120, restX: 1380, restY: 710 },
    ];
    this.ghosts = [];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.startX, pos.restX, pos.restY, pos.restY, word, i * 300);
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
    // Wave A: lost; cold, forgotten.
    const words = ["lost;", "cold,", "forgotten."];
    const positions: Array<{ startX: number; restX: number; restY: number }> = [
      { startX: -120, restX: 280, restY: 730 },
      { startX: this.scale.width + 120, restX: 1640, restY: 750 },
      { startX: 960, restX: 960, restY: -80 },
    ];
    this.ghosts = [];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      const fromAbove = pos.startX === pos.restX && pos.restY < 0;
      const startY = fromAbove ? -120 : pos.restY;
      this.spawnGhost(pos.startX, pos.restX, startY, pos.restY, word, i * 350);
    });
  }

  private onBossWaveACleared(): void {
    this.setNarrator("The first wave fades. More rise.");
    this.time.delayedCall(1200, () => this.spawnBossWaveB());
  }

  private spawnBossWaveB(): void {
    // Wave B: hollow! ancient: silence?
    const words = ["hollow!", "ancient:", "silence?"];
    const positions: Array<{ startX: number; restX: number; restY: number }> = [
      { startX: -120, restX: 300, restY: 740 },
      { startX: this.scale.width + 120, restX: 1620, restY: 720 },
      { startX: -120, restX: 560, restY: 760 },
    ];
    this.ghosts = [];
    words.forEach((word, i) => {
      const pos = positions[i];
      if (!pos) return;
      this.spawnGhost(pos.startX, pos.restX, pos.restY, pos.restY, word, i * 350);
    });
  }

  private onBossWaveBCleared(): void {
    this.setNarrator("The hall goes still. The Ghost-King rises fully.");
    this.time.delayedCall(2200, () => this.startFinalPassage());
  }

  // ─── Phase 3 — Final Passage ──────────────────────────────────────────────

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
        y: this.scale.height / 2 + 80,
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

  private spawnGhost(
    startX: number,
    restX: number,
    startY: number,
    restY: number,
    word: string,
    delay: number,
  ): void {
    const container = this.add.container(startX, startY);
    const isPunctWord = hasPunctuation(word);
    this.drawGhostInto(container, isPunctWord);
    container.setAlpha(0);

    const advanceMs = isPunctWord ? GHOST_ADVANCE_FAST : GHOST_ADVANCE_SLOW;

    const ghost: HauntedGhost = {
      container,
      target: null,
      restX,
      restY,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
    };

    this.tweens.add({
      targets: container,
      x: restX,
      y: restY,
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
      onComplete: () => this.defeatGhost(ghost),
    });
    ghost.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startGhostAdvance(ghost: HauntedGhost): void {
    const remaining = Math.abs(ghost.container.x - WREN_X);
    const totalRange = Math.abs(ghost.restX - WREN_X);
    const duration =
      ghost.advanceMs * Math.max(0.3, remaining / Math.max(1, totalRange));

    ghost.advanceTween = this.tweens.add({
      targets: ghost.container,
      x: WREN_X,
      duration,
      ease: "Linear",
      onUpdate: () => {
        if (ghost.target) ghost.target.setAnchorX(ghost.container.x);
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
    const narr = this.narratorText.text;
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
        this.time.delayedCall(800, () => {
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
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private setNarrator(text: string): void {
    this.narratorText.setText(text);
    this.narratorText.setAlpha(0);
    this.tweens.add({
      targets: this.narratorText,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  private clearActiveTargets(): void {
    for (const t of this.activeTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.activeTargets = [];
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.add.graphics();
    // Sky gradient — deep grey-green
    g.fillStyle(0x0e120e, 1);
    g.fillRect(0, 0, this.scale.width, 500);
    g.fillStyle(0x141a10, 1);
    g.fillRect(0, 500, this.scale.width, 280);
    // Ground
    g.fillStyle(0x1a2016, 1);
    g.fillRect(0, 780, this.scale.width, this.scale.height - 780);
    // Horizon mist band
    g.fillStyle(0xe8eee8, 0.06);
    g.fillRect(0, 680, this.scale.width, 120);
  }

  private drawTrees(): void {
    const g = this.add.graphics();
    // Draw a set of dark tree silhouettes using tall thin rectangles + triangle tops
    const treePositions = [
      { x: 80, h: 520, w: 28 },
      { x: 200, h: 460, w: 22 },
      { x: 340, h: 580, w: 32 },
      { x: 420, h: 400, w: 18 },
      { x: 560, h: 500, w: 24 },
      { x: 680, h: 440, w: 20 },
      { x: 1240, h: 440, w: 20 },
      { x: 1360, h: 500, w: 24 },
      { x: 1500, h: 400, w: 18 },
      { x: 1580, h: 580, w: 32 },
      { x: 1720, h: 460, w: 22 },
      { x: 1840, h: 520, w: 28 },
    ];

    g.fillStyle(0x0a0e0a, 1);
    for (const tree of treePositions) {
      const baseY = 780;
      // Trunk
      g.fillRect(tree.x - tree.w / 2, baseY - tree.h, tree.w, tree.h);
      // Irregular top: two overlapping triangles to suggest a leafy silhouette
      const tw = tree.w * 3.5;
      const th = tree.h * 0.35;
      const ty = baseY - tree.h;
      g.fillTriangle(
        tree.x - tw / 2, ty,
        tree.x + tw / 2, ty,
        tree.x, ty - th,
      );
      g.fillTriangle(
        tree.x - tw * 0.4, ty + th * 0.3,
        tree.x + tw * 0.4, ty + th * 0.3,
        tree.x + tw * 0.08, ty - th * 0.4,
      );
    }
  }

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
    const g = this.add.graphics();
    // Cloak
    g.fillStyle(PALETTE_HEX.moss, 1);
    g.fillTriangle(-30, 0, 30, 0, 0, -80);
    // Hood
    g.fillStyle(0x4f6440, 1);
    g.fillCircle(0, -75, 18);
    // Face
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(0, -68, 10);
    // Satchel strap
    g.lineStyle(2, 0x3a2a1a, 1);
    g.beginPath();
    g.moveTo(-22, -40);
    g.lineTo(18, -10);
    g.strokePath();
    c.add(g);
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
