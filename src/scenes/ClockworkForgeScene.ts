import Phaser from "phaser";
import { type AmbientHandle, playAmbientForge } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { pickAdaptiveWords, FORGE_WORD_BANK } from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";

// ─── Scene data ───────────────────────────────────────────────────────────────

interface ForgeSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// ─── Golem entity ─────────────────────────────────────────────────────────────

interface Golem {
  container: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Graphics;
  target: TextWordTarget | null;
  spawnX: number;
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  advanceMs: number;
  isBoss: boolean;
  /** True if this golem slot requires Shift/spell to get the command visual. */
  isCapitalized: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATWALK_Y = 440;
const FLOOR_Y = 780;

const GOLEM_ADVANCE_MS = 15000;

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
  private narratorText!: Phaser.GameObjects.Text;
  private golems: Golem[] = [];
  private activeTargets: TextWordTarget[] = [];

  private shiftHeld = false;
  private waveActive = false;

  /** Forge glow pools drawn on the floor. */
  private forgeGlowGraphics!: Phaser.GameObjects.Graphics;

  /** fork1: "forn" | "cabal" */
  private fork1Choice: "forn" | "cabal" | null = null;
  /** fork2: "peaceful" | "fought" */
  private fork2Choice: "peaceful" | "fought" | null = null;
  private companionAwarded = false;
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
    this.shiftHeld = false;
    this.waveActive = false;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.companionAwarded = false;
  }

  create(): void {
    this.cameras.main.fadeIn(600, 26, 16, 8);
    this.drawBackground();
    this.drawForgeGlow();
    this.drawCatwalk();
    this.drawWren(this.scale.width / 2, CATWALK_Y + 20);

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
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
      this.ambientHandle?.stop();
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
        y: this.scale.height - 240,
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

  // ─── ACT 1 — Descent into the Forge ─────────────────────────────────────────

  private startAct1Arrival(): void {
    this.setNarrator(
      "Runa: \"Wren. The air here bites. Brass and iron. Something older underneath.\"",
    );
    this.time.delayedCall(2600, () => this.startCatwalkBeats(0));
  }

  private startCatwalkBeats(idx: number): void {
    if (idx >= CATWALK_WORDS.length) {
      this.time.delayedCall(1000, () => this.startGregorConversation());
      return;
    }
    const word = CATWALK_WORDS[idx];
    const narration = CATWALK_NARRATIONS[idx];
    const x = this.scale.width / 2 + (idx - 1) * 300;
    const target = new TextWordTarget({
      scene: this,
      word,
      x,
      y: CATWALK_Y - 70,
      fontSize: 34,
      onComplete: () => {
        this.setNarrator(narration);
        this.time.delayedCall(1400, () => this.startCatwalkBeats(idx + 1));
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Gregor tutorial ─────────────────────────────────────────────────────────

  private startGregorConversation(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Old Gregor at a workbench. \"You hold it wrong. Typewriters are not hammers.\"",
    );

    // First exchange: Wren types "i know."
    const reply1 = new TextWordTarget({
      scene: this,
      word: "i know.",
      x: this.scale.width / 2,
      y: this.scale.height - 240,
      fontSize: 36,
      onComplete: () => this.gregorStep2(),
    });
    this.typingInput.register(reply1);
    this.activeTargets.push(reply1);
  }

  private gregorStep2(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Gregor: \"Lowercase moves them. CAPITALS command them. Try both.\"",
    );
    this.time.delayedCall(2000, () => this.gregorTutorialMove());
  }

  private gregorTutorialMove(): void {
    this.setNarrator(
      "Gregor points to a small golem. \"Type 'turn' — watch it.\"",
    );
    // Spawn a tutorial golem that doesn't advance
    const tutorialGolem = this.spawnStaticGolem(860, FLOOR_Y, false);

    const target = new TextWordTarget({
      scene: this,
      word: "turn",
      x: this.scale.width / 2,
      y: this.scale.height - 240,
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

  private gregorTutorialCommand(tutorialGolem: Golem): void {
    this.clearActiveTargets();
    this.setNarrator(
      "\"Now hold Shift and type 'TURN' — give it a command.\"",
    );

    const target = new TextWordTarget({
      scene: this,
      word: "TURN",
      x: this.scale.width / 2,
      y: this.scale.height - 240,
      fontSize: 36,
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

  private startTutorialGolemFight(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Gregor nods. \"Now do it for real. That one won't wait.\"",
    );

    const golem = this.spawnAdvancingGolem(1060, FLOOR_Y, "walk", GOLEM_ADVANCE_MS * 1.4, false);

    // After the plain "walk" completes, also show a spell version
    const origComplete = golem.target;
    if (origComplete) {
      // Already attached — let the wave system handle it
    }

    this.waveActive = true;
    this.time.delayedCall(2000, () => {
      if (!this.waveActive) return;
      this.setNarrator("The golem advances. Type 'walk' to redirect it.");
    });

    // Set up a watch: when all golems cleared, move to act 2
    this.golems.push(golem);
    this.time.delayedCall(800, () => this.watchForWaveClear(() => {
      this.time.delayedCall(800, () => this.startAct2());
    }));
  }

  // ─── ACT 2 — Through the Foundry Floor ──────────────────────────────────────

  private startAct2(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.setNarrator(
      "You descend to the foundry floor. The heat is immense. Iron shapes move through the dark.",
    );
    this.time.delayedCall(2000, () => this.startWave1());
  }

  private startWave1(): void {
    this.waveActive = true;
    this.golems = [];
    this.setNarrator(
      "Three golems stir. Type their words to redirect them.",
    );

    const words = pickAdaptiveWords(
      FORGE_WORD_BANK,
      3,
      this.store.get().keyStats,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 3);
    slots.forEach((slot, i) => {
      const g = this.spawnAdvancingGolem(slot.x, slot.y, words[i], GOLEM_ADVANCE_MS, false);
      this.golems.push(g);
    });

    this.watchForWaveClear(() => this.startFornEncounter());
  }

  private startFornEncounter(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.setNarrator(
      "Runa: \"The bellows are broken. The forge fire dims. Someone needs to fix this — or let it fail.\"",
    );
    this.time.delayedCall(2400, () => this.startWave2());
  }

  private startWave2(): void {
    this.waveActive = true;
    this.golems = [];
    this.setNarrator(
      "The golems press forward — one with a word that demands a command.",
    );

    // Two normal golems + one CAPITALIZED golem
    const normalWords = pickAdaptiveWords(
      FORGE_WORD_BANK,
      2,
      this.store.get().keyStats,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 3);

    // First two: normal
    for (let i = 0; i < 2; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        normalWords[i],
        GOLEM_ADVANCE_MS * 0.85,
        false,
      );
      this.golems.push(g);
    }

    // Third: capitalized — "VALVE" — spell mode fires command visual
    const capGolem = this.spawnAdvancingGolem(
      slots[2].x,
      slots[2].y,
      "VALVE",
      GOLEM_ADVANCE_MS * 0.85,
      true,
    );
    this.golems.push(capGolem);

    this.watchForWaveClear(() => this.startFork1());
  }

  // ─── Fork 1 ──────────────────────────────────────────────────────────────────

  private startFork1(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.setNarrator(
      "The bellows hang broken. Two paths open before you. Type a choice.",
    );

    const helpForn = new TextWordTarget({
      scene: this,
      word: "help smith forn",
      x: this.scale.width / 2 - 420,
      y: this.scale.height - 200,
      fontSize: 32,
      onComplete: () => this.startFornBranch(),
    });
    const joinCabal = new TextWordTarget({
      scene: this,
      word: "join the apprentices",
      x: this.scale.width / 2 + 420,
      y: this.scale.height - 200,
      fontSize: 32,
      onComplete: () => this.startCabalBranch(),
    });
    this.typingInput.register(helpForn);
    this.typingInput.register(joinCabal);
    this.activeTargets.push(helpForn, joinCabal);
  }

  private startFornBranch(): void {
    this.fork1Choice = "forn";
    this.clearActiveTargets();
    this.setNarrator(
      "Old Forn looks up from the broken bellows. \"Aye. I could use steady hands.\"",
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
      );
    });
  }

  private startCabalBranch(): void {
    this.fork1Choice = "cabal";
    this.clearActiveTargets();
    this.setNarrator(
      "A young apprentice grins. \"About time someone helped us.\"",
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
      );
    });
  }

  private afterFork1(choice: "forn" | "cabal", relicId: string): void {
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
    });
    this.time.delayedCall(1200, () => this.startAct3());
  }

  // ─── ACT 3 — The Command-Golem ────────────────────────────────────────────────

  private startAct3(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.cameras.main.shake(300, 0.006);
    this.setNarrator(
      "The far end of the foundry shudders. Something massive rises from the steam.",
    );
    this.time.delayedCall(2800, () => this.startBossPhase1());
  }

  // Boss graphics — returned so phases can update the eye
  private bossContainer!: Phaser.GameObjects.Container;
  private bossEye!: Phaser.GameObjects.Graphics;

  private spawnBossVisual(): void {
    const cx = this.scale.width / 2 + 200;
    const cy = FLOOR_Y - 10;
    this.bossContainer = this.add.container(cx, cy);
    this.bossContainer.setScale(1.8);
    this.bossEye = this.drawCommandGolemInto(this.bossContainer, false);

    this.bossContainer.setAlpha(0);
    this.tweens.add({
      targets: this.bossContainer,
      alpha: 1,
      duration: 900,
      ease: "Sine.easeOut",
    });
    this.idleBob(this.bossContainer);
  }

  private startBossPhase1(): void {
    this.spawnBossVisual();
    this.setNarrator(
      "The Command-Golem — massive, iron-crowned, its eye burning orange. Phase one begins.",
    );

    let phaseIdx = 0;
    const nextWord = (): void => {
      if (phaseIdx >= BOSS_PHASE1_WORDS.length) {
        this.time.delayedCall(1000, () => this.startBossPhase2());
        return;
      }
      const word = BOSS_PHASE1_WORDS[phaseIdx];
      const target = new TextWordTarget({
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
    nextWord();
  }

  private startBossPhase2(): void {
    this.clearActiveTargets();
    // Eye turns brass-gold
    this.bossEye.clear();
    this.bossEye.fillStyle(PALETTE_HEX.brass, 1);
    this.bossEye.fillCircle(22, -18, 7);
    this.bossEye.lineStyle(2, 0xffd277, 1);
    this.bossEye.strokeCircle(22, -18, 10);

    this.setNarrator(
      "The golem's eye blazes brass-gold. Hold Shift and command it.",
    );

    let phaseIdx = 0;
    const nextWord = (): void => {
      if (phaseIdx >= BOSS_PHASE2_WORDS.length) {
        this.time.delayedCall(1000, () => this.startBossPhase3());
        return;
      }
      const word = BOSS_PHASE2_WORDS[phaseIdx];
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
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
    this.setNarrator(
      "The golem's true name. Two words. Type them in sequence.",
    );

    // Two-target sequence, repeated twice. On second completion, boss falls.
    let repeatCount = 0;
    const runSequence = (): void => {
      const targetStand = new TextWordTarget({
        scene: this,
        word: "stand",
        x: this.bossContainer.x - 120,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.time.delayedCall(400, () => {
            const targetDown = new TextWordTarget({
              scene: this,
              word: "DOWN",
              x: this.bossContainer.x + 120,
              y: this.bossContainer.y - 220,
              fontSize: 38,
              onComplete: () => {
                playChime();
                this.cameras.main.shake(180, 0.004);
                repeatCount++;
                if (repeatCount >= 2) {
                  this.time.delayedCall(600, () => this.bossDefeated());
                } else {
                  this.setNarrator(
                    "The golem staggers. Once more — finish it.",
                  );
                  this.time.delayedCall(1000, runSequence);
                }
              },
              onSpellComplete: () => {
                this.cameras.main.flash(300, 220, 160, 20);
                this.cameras.main.shake(250, 0.006);
                playChime();
                repeatCount++;
                if (repeatCount >= 2) {
                  this.time.delayedCall(600, () => this.bossDefeated());
                } else {
                  this.setNarrator(
                    "The golem staggers hard. Once more — finish it.",
                  );
                  this.time.delayedCall(900, runSequence);
                }
              },
            });
            this.typingInput.register(targetDown);
            this.activeTargets.push(targetDown);
          });
        },
        onSpellComplete: () => {
          playChime();
          this.cameras.main.flash(200, 200, 140, 20);
          this.clearActiveTargets();
          this.time.delayedCall(350, () => {
            const targetDown = new TextWordTarget({
              scene: this,
              word: "DOWN",
              x: this.bossContainer.x + 120,
              y: this.bossContainer.y - 220,
              fontSize: 38,
              onComplete: () => {
                playChime();
                this.cameras.main.shake(200, 0.005);
                repeatCount++;
                if (repeatCount >= 2) {
                  this.time.delayedCall(500, () => this.bossDefeated());
                } else {
                  this.setNarrator(
                    "The golem staggers. Once more — finish it.",
                  );
                  this.time.delayedCall(1000, runSequence);
                }
              },
              onSpellComplete: () => {
                this.cameras.main.flash(320, 220, 160, 20);
                this.cameras.main.shake(300, 0.007);
                playChime();
                repeatCount++;
                if (repeatCount >= 2) {
                  this.time.delayedCall(500, () => this.bossDefeated());
                } else {
                  this.setNarrator(
                    "The command rings through the forge. Once more.",
                  );
                  this.time.delayedCall(800, runSequence);
                }
              },
            });
            this.typingInput.register(targetDown);
            this.activeTargets.push(targetDown);
          });
        },
      });
      this.typingInput.register(targetStand);
      this.activeTargets.push(targetStand);
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

    // Flash the Quiet Lord fragment: ~~Aga~~
    this.flashQuietLordFragment();

    this.setNarrator(
      "the forge breathes. the brass remembers. its makers are remembered.",
    );
    this.time.delayedCall(3200, () => this.startFork2());
  }

  /** Flash the Quiet Lord fragment — ~~Aga~~ appears, shimmers, fades. */
  private flashQuietLordFragment(): void {
    const frag = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 60, "~~Aga~~", {
        fontFamily: SERIF,
        fontSize: "72px",
        color: PALETTE.ember,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: frag,
      alpha: 1,
      duration: 180,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: frag,
            alpha: 0,
            duration: 600,
            ease: "Sine.easeIn",
            onComplete: () => frag.destroy(),
          });
        });
      },
    });
  }

  // ─── Fork 2 ──────────────────────────────────────────────────────────────────

  private startFork2(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "The Command-Golem lies still. What now? Type a choice.",
    );

    const peaceful = new TextWordTarget({
      scene: this,
      word: "give the peaceful order",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 200,
      fontSize: 32,
      onComplete: () => {
        this.fork2Choice = "peaceful";
        this.startFork2PeacefulBranch();
      },
    });
    const fight = new TextWordTarget({
      scene: this,
      word: "fight to the end",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 200,
      fontSize: 32,
      onComplete: () => {
        this.fork2Choice = "fought";
        this.startFork2FightBranch();
      },
    });
    this.typingInput.register(peaceful);
    this.typingInput.register(fight);
    this.activeTargets.push(peaceful, fight);
  }

  private startFork2PeacefulBranch(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "You raise the typewriter keys and give the final command.",
    );

    // Type "STAND DOWN" (capitalized, spell mode preferred)
    const standDown = new TextWordTarget({
      scene: this,
      word: "STAND DOWN",
      x: this.scale.width / 2,
      y: this.scale.height - 240,
      fontSize: 40,
      onComplete: () => {
        this.setNarrator("The last golems lower their arms. The forge grows quiet.");
        this.time.delayedCall(1800, () => this.afterFork2("peaceful", "master-key"));
      },
      onSpellComplete: () => {
        this.cameras.main.flash(350, 200, 180, 40);
        this.setNarrator("The command rings out. Every golem in the forge stills at once.");
        this.time.delayedCall(2000, () => this.afterFork2("peaceful", "master-key"));
      },
    });
    this.typingInput.register(standDown);
    this.activeTargets.push(standDown);
  }

  private startFork2FightBranch(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Two more golems rise from the slag. You're not done yet.",
    );

    this.waveActive = true;
    const words = pickAdaptiveWords(
      FORGE_WORD_BANK,
      2,
      this.store.get().keyStats,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 2);
    this.golems = [];
    for (let i = 0; i < 2; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        words[i],
        GOLEM_ADVANCE_MS * 0.75,
        false,
      );
      this.golems.push(g);
    }

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
      const whistle = new TextWordTarget({
        scene: this,
        word: "whistle softly",
        x: this.scale.width / 2 - 340,
        y: this.scale.height - 200,
        fontSize: 32,
        onComplete: () => this.awardSongbird(),
      });
      const leave = new TextWordTarget({
        scene: this,
        word: "leave it be",
        x: this.scale.width / 2 + 340,
        y: this.scale.height - 200,
        fontSize: 32,
        onComplete: () => this.startTrueNamePassage(),
      });
      this.typingInput.register(whistle);
      this.typingInput.register(leave);
      this.activeTargets.push(whistle, leave);
    } else if (nearMiss) {
      this.setNarrator(
        "A flash of brass among the pipes — something small and bright — then it's gone.",
      );
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
    this.time.delayedCall(2200, () => this.startTrueNamePassage());
  }

  // ─── True-name passage + ending ──────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.setNarrator("One last passage. Type it to leave the forge behind.");

    const passages = [
      "the forge breathes.",
      "the brass remembers.",
      "its makers are remembered.",
    ];

    this.runPassageChain(passages, ["", "", ""], () => {
      this.time.delayedCall(1000, () => this.startEnding());
    });
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
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    const stamp = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "the clockwork forge", {
        fontFamily: SERIF,
        fontSize: "64px",
        color: PALETTE.cream,
        backgroundColor: "#1a1008",
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

  // ─── Golem spawning ───────────────────────────────────────────────────────────

  /** Spawn a static (non-advancing) tutorial golem. Returns the golem object. */
  private spawnStaticGolem(x: number, y: number, _isBoss: boolean): Golem {
    const container = this.add.container(x, y);
    const eye = this.drawGolemInto(container, false);
    const golem: Golem = {
      container,
      eye,
      target: null,
      spawnX: x,
      restY: y,
      word: "",
      defeated: false,
      advanceTween: null,
      advanceMs: 0,
      isBoss: false,
      isCapitalized: false,
    };
    this.idleBob(container);
    return golem;
  }

  /** Spawn a golem that advances toward Wren and can be defeated. */
  private spawnAdvancingGolem(
    x: number,
    y: number,
    word: string,
    advanceMs: number,
    isCapitalized: boolean,
  ): Golem {
    const startX = x < this.scale.width / 2 ? -120 : this.scale.width + 120;
    const container = this.add.container(startX, y);
    container.setAlpha(0);
    const eye = this.drawGolemInto(container, false);

    const golem: Golem = {
      container,
      eye,
      target: null,
      spawnX: x,
      restY: y,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
      isBoss: false,
      isCapitalized,
    };

    this.tweens.add({
      targets: container,
      x,
      alpha: 1,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (golem.defeated) return;
        this.attachGolemTarget(golem);
        this.idleBob(container);
        this.startGolemAdvance(golem);
      },
    });

    return golem;
  }

  private attachGolemTarget(golem: Golem): void {
    const target = new TextWordTarget({
      scene: this,
      word: golem.word,
      x: golem.container.x,
      y: golem.restY - 100,
      fontSize: 32,
      onComplete: () => this.defeatGolem(golem),
      onSpellComplete: () => {
        this.defeatGolem(golem);
        this.commandEffect(golem);
      },
    });
    golem.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startGolemAdvance(golem: Golem): void {
    const wrenX = this.scale.width / 2;
    const remaining = Math.abs(golem.container.x - wrenX);
    const totalRange = Math.abs(golem.spawnX - wrenX);
    const duration =
      golem.advanceMs * Math.max(0.3, remaining / (totalRange || 1));

    golem.advanceTween = this.tweens.add({
      targets: golem.container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: () => {
        if (golem.target) golem.target.setAnchorX(golem.container.x);
      },
      onComplete: () => {
        golem.advanceTween = null;
        if (!golem.defeated && this.waveActive) {
          this.golemReachesWren(golem);
        }
      },
    });
  }

  private defeatGolem(golem: Golem): void {
    if (golem.defeated) return;
    playChime();
    golem.defeated = true;
    if (golem.target) {
      this.typingInput.unregister(golem.target);
      const idx = this.activeTargets.indexOf(golem.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      golem.target = null;
    }
    golem.advanceTween?.stop();
    golem.advanceTween = null;
    this.tweens.killTweensOf(golem.container);
    this.tweens.add({
      targets: golem.container,
      alpha: 0,
      y: golem.container.y - 50,
      duration: 480,
      ease: "Sine.easeOut",
      onComplete: () => golem.container.destroy(),
    });
  }

  /** Visual "command" effect when the player uses Shift on a golem. */
  private commandEffect(golem: Golem): void {
    this.cameras.main.flash(180, 200, 140, 20);
    // Eye brightens briefly before golem falls
    golem.eye.clear();
    golem.eye.fillStyle(PALETTE_HEX.brass, 1);
    golem.eye.fillCircle(14, -12, 5);
  }

  private golemReachesWren(golem: Golem): void {
    // For simplicity: golem retreats and tries again (no candle system needed)
    this.cameras.main.shake(180, 0.004);

    if (golem.target) {
      this.typingInput.unregister(golem.target);
      const idx = this.activeTargets.indexOf(golem.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      golem.target.destroy();
      golem.target = null;
    }
    this.tweens.killTweensOf(golem.container);
    this.tweens.add({
      targets: golem.container,
      x: golem.spawnX,
      duration: 600,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (golem.defeated || !this.waveActive) return;
        this.time.delayedCall(1200, () => {
          if (golem.defeated || !this.waveActive) return;
          this.idleBob(golem.container);
          this.attachGolemTarget(golem);
          this.startGolemAdvance(golem);
        });
      },
    });
  }

  /** Visual effect for tutorial golem head-turn. */
  private golemTurnHead(golem: Golem): void {
    this.tweens.add({
      targets: golem.container,
      x: golem.container.x - 20,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /** Visual effect for full-command response. */
  private golemCommandFlash(golem: Golem): void {
    this.cameras.main.flash(200, 200, 140, 20);
    golem.eye.clear();
    golem.eye.fillStyle(PALETTE_HEX.brass, 1);
    golem.eye.fillCircle(14, -12, 5);
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
      if (this.golems.length > 0 && this.golems.every((g) => g.defeated)) {
        this.waveActive = false;
        onClear();
      } else if (this.waveActive || this.golems.some((g) => !g.defeated)) {
        this.time.delayedCall(300, check);
      }
    };
    this.time.delayedCall(300, check);
  }

  // ─── Passage chain ────────────────────────────────────────────────────────────

  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
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
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 240,
        fontSize: 36,
        onComplete: () => {
          const line = narratorLines[step] ?? "";
          step++;
          if (line) this.setNarrator(line);
          this.time.delayedCall(line ? 1400 : 400, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Input ────────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Shift") {
      this.shiftHeld = true;
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key, { spell: this.shiftHeld });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = false;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

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

  private drawBackground(): void {
    const g = this.add.graphics();
    // Deep charcoal-orange gradient (top band → mid band → floor)
    g.fillStyle(0x1a1008, 1);
    g.fillRect(0, 0, this.scale.width, 500);
    g.fillStyle(0x2a1a08, 1);
    g.fillRect(0, 500, this.scale.width, 300);
    // Floor
    g.fillStyle(0x1c1208, 1);
    g.fillRect(0, FLOOR_Y - 20, this.scale.width, this.scale.height - FLOOR_Y + 20);
    // Brass floor trim
    g.lineStyle(2, PALETTE_HEX.brass, 0.35);
    g.beginPath();
    g.moveTo(0, FLOOR_Y - 20);
    g.lineTo(this.scale.width, FLOOR_Y - 20);
    g.strokePath();

    // Dark metal wall plates
    g.fillStyle(0x221510, 1);
    for (let i = 0; i < 5; i++) {
      g.fillRect(i * 400, 0, 380, 420);
    }
    // Brass pipe horizontals
    g.fillStyle(PALETTE_HEX.brass, 0.45);
    g.fillRect(0, 180, this.scale.width, 6);
    g.fillRect(0, 310, this.scale.width, 4);
    // Vertical pipes
    g.fillStyle(0x8a6a2a, 0.55);
    for (const px of [220, 580, 940, 1300, 1660]) {
      g.fillRect(px, 0, 14, 440);
    }
  }

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
    const g = this.add.graphics();
    // Main catwalk bar
    g.fillStyle(0x2a2020, 1);
    g.fillRect(0, CATWALK_Y, this.scale.width, 22);
    // Brass railing
    g.lineStyle(3, PALETTE_HEX.brass, 0.7);
    g.beginPath();
    g.moveTo(0, CATWALK_Y - 2);
    g.lineTo(this.scale.width, CATWALK_Y - 2);
    g.strokePath();
    // Grating slots
    g.fillStyle(0x141010, 0.6);
    for (let i = 0; i < 60; i++) {
      g.fillRect(i * 32 + 4, CATWALK_Y + 4, 14, 14);
    }
    // Support struts
    g.fillStyle(0x382828, 1);
    for (const sx of [280, 680, 1080, 1480, 1780]) {
      g.fillRect(sx, CATWALK_Y + 22, 10, 140);
    }
  }

  private drawWren(x: number, y: number): void {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    // Cloak — darker, forge-appropriate
    g.fillStyle(0x5a4a38, 1);
    g.fillTriangle(-28, 0, 28, 0, 0, -75);
    // Hood
    g.fillStyle(0x3a2a1a, 1);
    g.fillCircle(0, -70, 17);
    // Face
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(0, -63, 10);
    // Satchel strap
    g.lineStyle(2, 0x3a2a1a, 1);
    g.beginPath();
    g.moveTo(-20, -38);
    g.lineTo(16, -10);
    g.strokePath();
    c.add(g);
  }

  /** Draw a standard golem into a container. Returns the eye graphics. */
  private drawGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    // Body — dark grey rectangles
    g.fillStyle(0x282828, 1);
    g.fillRect(-22, -30, 44, 60);
    // Head
    g.fillStyle(0x2e2e2e, 1);
    g.fillRect(-16, -54, 32, 26);
    // Shoulders
    g.fillStyle(0x303030, 1);
    g.fillRect(-30, -28, 14, 20);
    g.fillRect(16, -28, 14, 20);
    // Legs
    g.fillStyle(0x242424, 1);
    g.fillRect(-18, 30, 14, 30);
    g.fillRect(4, 30, 14, 30);
    // Brass trim lines on body
    g.lineStyle(1, PALETTE_HEX.brass, 0.55);
    g.strokeRect(-22, -30, 44, 60);
    g.strokeRect(-16, -54, 32, 26);
    c.add(g);

    // Eye — on its own graphics so it can change color
    const eye = this.add.graphics();
    eye.fillStyle(PALETTE_HEX.ember, 0.9);
    eye.fillCircle(14, -12, 4);
    c.add(eye);
    return eye;
  }

  /** Draw the Command-Golem boss. Returns eye graphics. */
  private drawCommandGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    // Heavier body
    g.fillStyle(0x242424, 1);
    g.fillRect(-28, -38, 56, 76);
    // Massive head
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(-22, -72, 44, 36);
    // Shoulders — broader
    g.fillStyle(0x303030, 1);
    g.fillRect(-44, -36, 18, 26);
    g.fillRect(26, -36, 18, 26);
    // Legs
    g.fillStyle(0x1e1e1e, 1);
    g.fillRect(-22, 38, 18, 38);
    g.fillRect(4, 38, 18, 38);
    // Brass crown/collar trim
    g.fillStyle(PALETTE_HEX.brass, 0.85);
    g.fillRect(-22, -72, 44, 6);  // crown top
    g.fillRect(-28, -38, 56, 5);  // collar band
    // Heavy brass trim on body
    g.lineStyle(2, PALETTE_HEX.brass, 0.7);
    g.strokeRect(-28, -38, 56, 76);
    g.strokeRect(-22, -72, 44, 36);
    c.add(g);

    // Eye
    const eye = this.add.graphics();
    eye.fillStyle(PALETTE_HEX.ember, 1);
    eye.fillCircle(22, -18, 7);
    eye.lineStyle(1, 0xff9944, 0.7);
    eye.strokeCircle(22, -18, 10);
    c.add(eye);
    return eye;
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
