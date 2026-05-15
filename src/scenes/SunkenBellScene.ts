import Phaser from "phaser";
import { type AmbientHandle, playAmbientBell } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, SUNKEN_BELL_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";
import sunkenBellBackdrop from "../../art/references/sunken-bell-clean.png";

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
  private narratorText!: Phaser.GameObjects.Text;
  private ghosts: Ghost[] = [];
  private activeTargets: TextWordTarget[] = [];
  private wrenContainer!: Phaser.GameObjects.Container;

  private beatMs = 2000;
  private claimWindowOpen = false;
  private beatTimer: Phaser.Time.TimerEvent | null = null;

  private fork1Choice: "chant" | "force" | null = null;
  private fork2Choice: "free-aurland" | "claim-tongue" | null = null;

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
    this.beatMs = 2000;
    this.claimWindowOpen = false;
    this.beatTimer = null;
    this.fork1Choice = null;
    this.fork2Choice = null;
  }

  preload(): void {
    this.load.image("sunken-bell-backdrop", sunkenBellBackdrop);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 8, 24, 32);
    this.add.image(0, 0, "sunken-bell-backdrop").setOrigin(0).setDepth(-100);
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);

    this.narratorText = this.add
      .text(this.scale.width / 2, 120, "", {
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
      this.stopBeat();
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
    // Open claim window permanently so input flows without beat gating
    this.claimWindowOpen = true;

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
        y: this.scale.height / 2 + 100,
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

  private startBeat(): void {
    this.beatTimer = this.time.addEvent({
      delay: this.beatMs,
      callback: this.onToll,
      callbackScope: this,
      loop: true,
    });
  }

  private stopBeat(): void {
    this.beatTimer?.remove();
    this.beatTimer = null;
    this.claimWindowOpen = false;
  }

  private onToll(): void {
    // Brief dark flash: dims slightly for ~600ms
    this.cameras.main.flash(600, 0, 0, 0, false);
    // Open claim window for 400ms
    this.claimWindowOpen = true;
    this.time.delayedCall(400, () => {
      this.claimWindowOpen = false;
    });
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") playClack();
    if (this.typingInput.hasClaim() || this.claimWindowOpen) {
      this.typingInput.handleChar(event.key);
    }
  }

  // ─── Act 1: Arrival ───────────────────────────────────────────────────────

  private startArrival(): void {
    // Act 1 pre-beat: input flows freely until Olin teaches the bell's rhythm
    // and startBeat() hands claim-window gating over to onToll.
    this.claimWindowOpen = true;
    this.setNarrator(
      "Wren, this place has been listening for a hundred years. Move slowly. The bell sets the pace.",
    );
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
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-drowned-choir")) {
        s.almanacLore.push("the-drowned-choir");
      }
    });
    this.setNarrator("The bell tolls once. And the world changes tempo.");
    this.beatMs = 2000;
    this.startBeat();
    this.time.delayedCall(2000, () => this.startFirstGhostEncounter());
  }

  // ─── Act 1: First ghost encounter ────────────────────────────────────────

  private startFirstGhostEncounter(): void {
    this.ghosts = [];
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
    this.setNarrator("The nave stretches ahead. Shapes drift between the columns.");
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
    this.time.delayedCall(1200, () => this.startWave2());
  }

  private startWave2(): void {
    this.setNarrator("More come. One of them is different — restless, doubled.");
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
    this.setNarrator(
      "The cathedral doors. Two ways through. Choose.",
    );

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
    this.runBeatLockedChain(phrases, () => this.startAct3Corridor());
  }

  private startFork1Force(): void {
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
    this.time.delayedCall(600, advance);
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
    this.ghosts = [];
    const wardenGraphics = this.drawWarden();
    // Phase 1
    this.setNarrator("The Bell-Warden. Still. Waiting.");
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
    // Double tempo
    this.stopBeat();
    this.beatMs = 1000;
    this.startBeat();

    this.setNarrator("The tide rises. The tempo doubles.");

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
              // Brighten the warden's eyes
              this.redrawWardenPhase2(wardenGraphics, true);
              // Show scratched fragment ~~Ag~~
              this.showScratchedFragment("~~Ag~~", () => {
                this.time.delayedCall(400, () => this.startWardenPhase3());
              });
            }
          },
        });
        this.typingInput.register(target);
        this.activeTargets.push(target);
      });
    });
  }

  private showScratchedFragment(text: string, onDone: () => void): void {
    const frag = this.add
      .text(this.scale.width / 2, this.scale.height / 2, text, {
        fontFamily: SERIF,
        fontSize: "52px",
        color: PALETTE.dim,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: frag,
      alpha: 0.85,
      duration: 600,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.time.delayedCall(600, () => {
          this.tweens.add({
            targets: frag,
            alpha: 0,
            duration: 600,
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

  private startWardenPhase3(): void {
    this.setNarrator("The bell sings. Type each word on the toll.");

    const passage = "i am the bell. i drink the sea.";
    const words = passage.split(" ");
    let wordIndex = 0;

    const advanceWord = (): void => {
      if (wordIndex >= words.length) {
        // All done — defeat
        this.onWardenDefeated();
        return;
      }
      const word = words[wordIndex];
      if (word === undefined) return;
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 40,
        onComplete: () => {
          playChime();
          wordIndex += 1;
          this.clearActiveTargets();
          this.time.delayedCall(200, advanceWord);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    this.time.delayedCall(600, advanceWord);
  }

  private onWardenDefeated(): void {
    playChime();
    this.stopBeat();
    this.setNarrator(
      "A long silence. The bell, for the first time in a hundred years, falls quiet.",
    );
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
    this.setNarrator("The realm speaks. Type back its name.");
    this.time.delayedCall(800, () => {
      const trueName = "the bell remembers. the deep listens. the kingdom holds.";
      const target = new TextWordTarget({
        scene: this,
        word: trueName,
        x: this.scale.width / 2,
        y: this.scale.height / 2 + 100,
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

    this.checkWaveComplete();
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

  private checkWaveComplete(): void {
    if (this.ghosts.every((g) => g.defeated)) {
      this.ghosts = [];
      const currentNarrator = this.narratorText.text;
      // Determine which wave just ended by context
      if (currentNarrator.includes("listening")) {
        // First encounter
        this.time.delayedCall(1200, () => this.onFirstEncounterCleared());
      } else if (currentNarrator.includes("nave")) {
        // Wave 1
        this.time.delayedCall(1200, () => this.onWave1Cleared());
      } else if (currentNarrator.includes("doubled") || currentNarrator.includes("More")) {
        // Wave 2
        this.time.delayedCall(1200, () => this.onWave2Cleared());
      }
    }
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
    // Temporarily allow all input (beat is stopped at this point)
    const savedOpen = this.claimWindowOpen;
    this.claimWindowOpen = true;

    let idx = 0;
    const advance = (): void => {
      if (idx >= steps.length) {
        this.claimWindowOpen = savedOpen;
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

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    // Cloak
    g.fillStyle(0x6f8a5e, 1);
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

