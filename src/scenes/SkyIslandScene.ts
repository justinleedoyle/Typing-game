import Phaser from "phaser";
import { type AmbientHandle, playAmbientSkyIsland } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playWaveSting } from "../audio/waveSting";
import { HeartSoulHud } from "../game/heartSoulHud";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, SERIF } from "../game/palette";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { ScrollingPhrase } from "../game/scrollingPhrase";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
// Danger ramps in over the LAST 60% of a spirit's advance — earlier portion
// stays cream so players can read the word, then it shifts red as the spirit
// closes. Mirrors the Winter Mountain ramp so the typing feel is consistent.
const DANGER_RAMP_START = 0.4;
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import {
  pickAdaptiveWords,
  SKY_ISLAND_PHRASE_BANK,
  SKY_ISLAND_WORD_BANK,
} from "../game/wordBank";
import { TextWordTarget } from "../game/wordTarget";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, preloadWren } from "../game/wren";
import skyIslandBackdrop from "../../art/references/sky-island-clean.png";

interface SkyIslandSceneData {
  store: SaveStore;
  revisit?: boolean;
}

interface LanternSpirit {
  container: Phaser.GameObjects.Container;
  lanternGfx: Phaser.GameObjects.Graphics;
  glowGfx: Phaser.GameObjects.Graphics;
  pulseTween: Phaser.Tweens.Tween | null;
  target: TextWordTarget | null;
  spawnX: number;
  restY: number;
  word: string;
  defeated: boolean;
  advanceTween: Phaser.Tweens.Tween | null;
  advanceMs: number;
}

// ─── Act 1 constants ───────────────────────────────────────────────────────────

/** Path exploration words: traversal moments */
const PATH_BEATS = ["balance", "lantern", "stepping"] as const;

/** Lantern-Lighter typed conversation */
const LIGHTER_LINE_1 =
  "you came through a portal. i have not seen one open in a long time.";
const WREN_RESPONSE = "i came to help.";
const LIGHTER_LINE_2 =
  "the scholar-spirit guards the summit. it will ask you things. long things. answer carefully.";
const LIGHTER_LINE_3 = "i will light the way if you choose well.";

// ─── Act 2 constants ───────────────────────────────────────────────────────────

/** Temple encounter configs: [spiritCount, minLen, maxLen] */
/** Per-temple scrolling-phrase config: count = banners in this temple,
 *  durationMs = how long each banner takes to cross the screen (lower =
 *  harder), staggerMs = delay between sibling banner spawns. */
const TEMPLE_PHRASE_CONFIGS = [
  { count: 1, durationMs: 14000, staggerMs: 0 },
  { count: 2, durationMs: 12500, staggerMs: 2400 },
  { count: 2, durationMs: 11000, staggerMs: 2000 },
  { count: 3, durationMs: 9500, staggerMs: 1600 },
  { count: 3, durationMs: 8000, staggerMs: 1300 },
] as const;

/** Y positions for stacked banners — keeps multiple in a temple from
 *  overlapping while leaving the narration row (y=150) untouched. */
const PHRASE_BANNER_Y_SLOTS = [320, 430, 540] as const;

/** Lantern light columns active during temple play. Each x is a vertical
 *  beam that obscures any phrase scrolling through it — the §5.5.4 sensory
 *  mechanic. Phrases between beams are clear; the player picks their window. */
const LANTERN_BLUR_XS = [480, 960, 1440] as const;
const LANTERN_BLUR_RADIUS = 130;

/** Scholar Etta interaction */
const ETTA_LINE = "my last unburned book. help me place it.";
const ETTA_HELP_TRIGGER = "help her";
const ETTA_CHAIN_1 = "lift the book";
const ETTA_CHAIN_2 = "place it gently";

// ─── Act 3 constants ───────────────────────────────────────────────────────────

/** Boss phase riddles */
const RIDDLE_1_DISPLAY = "What opens without a door?";
const RIDDLE_2_DISPLAY = "What travels without moving?";
const RIDDLE_3_DISPLAY = "Name this island, as it truly is.";

/** Boss sequential word answers */
const BOSS_PHASE1_WORDS = ["a", "portal"] as const;
const BOSS_PHASE2_WORDS = ["a", "written", "word"] as const;
const BOSS_PHASE3_WORDS = ["the", "sky", "that", "held", "the", "light"] as const;

/** True-name passage */
const TRUE_NAME_PASSAGE =
  "the sky remembers every page that ever lit. nothing burned is truly gone.";

// ─── Spawn positions ───────────────────────────────────────────────────────────


export class SkyIslandScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;
  private spirits: LanternSpirit[] = [];
  private activeTargets: TextWordTarget[] = [];
  /** Temple scrolling-phrase banners currently in flight. */
  private activePhrases: ScrollingPhrase[] = [];
  private templePhrasesRemaining = 0;
  /** Lantern light-beam graphics. Drawn on the first temple, destroyed in
   *  scene shutdown — they persist across all five temples. */
  private templeLanterns: Phaser.GameObjects.Graphics[] = [];

  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;

  // Fork / companion flags
  private fork1Choice: "help-etta" | "steal-flame" | null = null;
  private fork2Choice: "answer-kindly" | "cut-tether" | null = null;
  private ettaDone = false;      // Etta side encounter completed
  private companionChoice: "take" | "let-go" | null = null;

  // Boss state
  private bossContainer: Phaser.GameObjects.Container | null = null;
  private bossRingTween: Phaser.Tweens.Tween | null = null;
  private quietLordFiredInPhase2 = false;
  /** True after the realm-level §5.5.10 intrusion has fired this playthrough.
   *  Separate from `quietLordFiredInPhase2`, which gates a boss-phase moment. */
  private quietLordIntruded = false;

  // Temple state — which temple are we on
  private templeIndex = 0;

  private ambientHandle?: AmbientHandle;
  private revisit = false;

  constructor() {
    super("SkyIslandScene");
  }

  init(data: SkyIslandSceneData): void {
    this.revisit = data.revisit === true;
    this.store = data.store;
    this.spirits = [];
    this.activeTargets = [];
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.ettaDone = false;
    this.companionChoice = null;
    this.bossContainer = null;
    this.bossRingTween = null;
    this.quietLordFiredInPhase2 = false;
    this.quietLordIntruded = false;
    this.templeIndex = 0;
  }

  preload(): void {
    this.load.image("sky-island-backdrop", skyIslandBackdrop);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 26, 16, 8);
    this.add
      .image(0, 0, "sky-island-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    this.drawTempleStones();
    this.drawAmbientLanterns();
    this.wrenContainer = this.drawWren(this.scale.width / 2, 900);

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
      this.bossRingTween?.stop();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
      this.templeLanterns.forEach((g) => g.destroy());
      this.templeLanterns = [];
    });

    this.ambientHandle = playAmbientSkyIsland();

    if (this.revisit) {
      this.startRevisit();
      return;
    }
    this.startAct1();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVISIT MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private startRevisit(): void {
    const choices = this.store.get().realms["sky-island"]?.choices ?? {};
    let narratorLine: string;
    let words: string[];

    if (choices["fork2"] === "cut-tether") {
      narratorLine = "The island is higher now. You can barely see the lanterns from here.";
      words = ["the", "sky", "is", "wide", "and", "open"];
    } else if (choices["fork2"] === "answer-kindly") {
      narratorLine = "The wind still circles where the island was. It hasn't found a new question.";
      words = ["the", "lanterns", "hold", "the", "dark"];
    } else {
      narratorLine = "The lanterns are still burning. Someone is keeping them.";
      words = ["golden", "and", "still", "and", "far"];
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 1 — Arrival on the Island
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct1(): void {
    this.setNarrator(
      "Wren — careful. The island floats. The lanterns never go out here. Something tends them.",
    );
    this.time.delayedCall(2800, () => this.runPathBeats(0));
  }

  /** Three exploration beats: balance / lantern / stepping */
  private runPathBeats(idx: number): void {
    if (idx >= PATH_BEATS.length) {
      this.time.delayedCall(700, () => this.startLanternLighter());
      return;
    }
    const beat = PATH_BEATS[idx];
    const narrations: readonly string[] = [
      "A narrow stone bridge arches between two floating rocks. Keep your balance.",
      "A paper lantern hangs right across the path, still lit. Lift it aside gently.",
      "Stepping stones. The gaps are wide, the island hums below your feet.",
    ];
    this.setNarrator(narrations[idx] ?? "");
    const target = new TextWordTarget({
      scene: this,
      word: beat,
      x: this.scale.width / 2,
      y: this.scale.height / 2,
      fontSize: 44,
      onComplete: () => {
        playChime();
        this.time.delayedCall(600, () => this.runPathBeats(idx + 1));
      },
    });
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  // ─── Lantern-Lighter NPC ──────────────────────────────────────────────────

  private startLanternLighter(): void {
    this.setNarrator(
      "At the base of the great beacon tower, a child-spirit tends a cluster of lanterns.",
    );
    this.time.delayedCall(2000, () => {
      this.setNarrator(LIGHTER_LINE_1);
      this.time.delayedCall(600, () => {
        const t = new TextWordTarget({
          scene: this,
          word: WREN_RESPONSE,
          x: this.scale.width / 2,
          y: this.scale.height / 2,
          fontSize: 36,
          onComplete: () => {
            playChime();
            this.clearActiveTargets();
            this.setNarrator(LIGHTER_LINE_2);
            this.time.delayedCall(3200, () => {
              this.setNarrator(LIGHTER_LINE_3);
              this.time.delayedCall(2800, () => this.onLighterConvoComplete());
            });
          },
        });
        this.typingInput.register(t);
        this.activeTargets.push(t);
      });
    });
  }

  private onLighterConvoComplete(): void {
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-lantern-lighters-vigil")) {
        s.almanacLore.push("the-lantern-lighters-vigil");
      }
    });
    this.setNarrator("The Lantern-Lighter's Vigil — a page appears in the Almanac.");
    this.time.delayedCall(2000, () => this.startFirstSpiritEncounterFixed());
  }

  // ─── First lantern-spirit encounter ──────────────────────────────────────

  private startFirstSpiritEncounter(): void {
    // Wave-start bookend — same audio + shake pattern as the temple waves so
    // the first spirit encounter lands with the same weight.
    playWaveSting();
    this.cameras.main.shake(220, 0.005);

    this.setNarrator("Two lantern-spirits drift from the tower path, pale and unhurried.");
    const words = pickAdaptiveWords(
      filterWordsByLength(SKY_ISLAND_WORD_BANK, 6, 8),
      2,
      this.store.get().keyStats,
    );
    const positions = [
      { x: 620, y: 780 },
      { x: 1300, y: 780 },
    ];
    this.spirits = [];
    positions.forEach((pos, i) => {
      this.spawnSpirit(
        pos.x < this.scale.width / 2 ? -120 : this.scale.width + 120,
        pos.x,
        pos.y,
        words[i] ?? "lantern",
        i * 300,
        20000,
      );
    });
  }

  private onFirstEncounterCleared(): void {
    this.setNarrator("Each lantern blooms as the spirit fades — the glow blooms wide and then rests.");
    this.time.delayedCall(2000, () => this.startAct2());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 2 — Through the Temple
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct2(): void {
    this.templeIndex = 0;
    this.startTemple(0);
  }

  private startTemple(idx: number): void {
    this.templeIndex = idx;
    const cfg = TEMPLE_PHRASE_CONFIGS[idx];
    if (!cfg) return;

    // Wave-start bookend — audio sting + screen shake so each temple feels
    // like an event, not just "more text appears."
    playWaveSting();
    this.cameras.main.shake(220, 0.005);

    if (this.templeLanterns.length === 0) {
      this.drawTempleLanterns();
    }

    // §5.5.10 — a lantern's inscription flickers between two readings, one
    // beautiful, one his. Fires on the second temple so the player has just
    // settled into the scrolling-phrase rhythm before the disruption.
    if (!this.quietLordIntruded && idx === 1) {
      this.quietLordIntruded = true;
      this.time.delayedCall(1800, () => {
        playQuietLordIntrusion(this, {
          x: this.scale.width / 2,
          y: 380,
          text: "every page goes blank.",
        });
      });
    }

    const templeNames = [
      "The first temple gate. A scroll unrolls in the wind — read it aloud.",
      "The second gate. The wind is faster here.",
      "The third chamber. Two scrolls at once now.",
      "The fourth chamber. They pass quicker. Three this time.",
      "The fifth and final chamber. They fly. Type before they leave you.",
    ];
    this.setNarrator(templeNames[idx] ?? "");

    // Pick `cfg.count` distinct phrases from the long-phrase bank.
    const phrases = shuffleArr(
      SKY_ISLAND_PHRASE_BANK as readonly string[],
    ).slice(0, cfg.count);

    this.activePhrases = [];
    this.templePhrasesRemaining = phrases.length;

    phrases.forEach((phrase, i) => {
      const phraseObj = new ScrollingPhrase({
        scene: this,
        typingInput: this.typingInput,
        phrase,
        fromSide: i % 2 === 0 ? "left" : "right",
        y: PHRASE_BANNER_Y_SLOTS[i] ?? PHRASE_BANNER_Y_SLOTS[0],
        durationMs: cfg.durationMs,
        delayMs: i * cfg.staggerMs,
        onComplete: () => this.onPhraseResolved(true),
        onMiss: () => this.onPhraseResolved(false),
      });
      this.activePhrases.push(phraseObj);
    });
  }

  /** Called when a scrolling phrase finishes — either typed (`success=true`)
   *  or scrolled off the far side (`success=false`). Either way it counts
   *  against the temple's remaining-phrases count; a miss also costs Heart
   *  and shakes Wren. */
  private onPhraseResolved(success: boolean): void {
    if (!success) {
      flashWrenMiss(this.wrenSprite);
      this.cameras.main.shake(180, 0.004);
      this.typingInput.getStats().record(false);
    }
    this.templePhrasesRemaining -= 1;
    if (this.templePhrasesRemaining <= 0) {
      this.onTempleCleared();
    }
  }

  private onTempleCleared(): void {
    const nextIdx = this.templeIndex + 1;

    // Between Temple 3 and 4: Scholar Etta side encounter
    if (this.templeIndex === 2) {
      this.time.delayedCall(1200, () => this.startEttaEncounter(nextIdx));
      return;
    }

    if (nextIdx < TEMPLE_PHRASE_CONFIGS.length) {
      this.time.delayedCall(1400, () => this.startTemple(nextIdx));
    } else {
      // All 5 temples cleared → Fork 1
      this.time.delayedCall(1400, () => this.startFork1());
    }
  }

  // ─── Scholar Etta side encounter ─────────────────────────────────────────

  private startEttaEncounter(nextTempleIdx: number): void {
    this.setNarrator(
      "A side chamber off the temple path. A spirit scholar crouches over a single unburned book.",
    );
    this.time.delayedCall(2000, () => {
      this.setNarrator(ETTA_LINE);
      this.time.delayedCall(600, () => {
        const helpTarget = new TextWordTarget({
          scene: this,
          word: ETTA_HELP_TRIGGER,
          x: this.scale.width / 2 - 300,
          y: this.scale.height - 260,
          fontSize: 36,
          onComplete: () => {
            this.clearActiveTargets();
            this.startEttaHelp(nextTempleIdx);
          },
        });
        // Any other typed word (typing something that doesn't start with 'h')
        // will just fail to claim — but we also offer a "skip" word
        const skipTarget = new TextWordTarget({
          scene: this,
          word: "keep moving",
          x: this.scale.width / 2 + 300,
          y: this.scale.height - 260,
          fontSize: 36,
          onComplete: () => {
            this.clearActiveTargets();
            this.setNarrator("The scholar watches you go in silence.");
            this.time.delayedCall(1600, () => this.startTemple(nextTempleIdx));
          },
        });
        this.typingInput.register(helpTarget);
        this.typingInput.register(skipTarget);
        this.activeTargets.push(helpTarget, skipTarget);
      });
    });
  }

  private startEttaHelp(nextTempleIdx: number): void {
    this.setNarrator("You approach the book. Scholar Etta holds her breath.");
    this.time.delayedCall(1200, () => {
      const liftTarget = new TextWordTarget({
        scene: this,
        word: ETTA_CHAIN_1,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 38,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.setNarrator("The book is heavier than it looks. Old paper, dense with writing.");
          this.time.delayedCall(1400, () => {
            const placeTarget = new TextWordTarget({
              scene: this,
              word: ETTA_CHAIN_2,
              x: this.scale.width / 2,
              y: this.scale.height / 2,
              fontSize: 38,
              onComplete: () => {
                playChime();
                this.clearActiveTargets();
                this.ettaDone = true;
                this.store.update((s) => {
                  if (!s.almanacLore.includes("scholar-ettas-last-volume")) {
                    s.almanacLore.push("scholar-ettas-last-volume");
                  }
                });
                this.setNarrator(
                  "Scholar Etta's Last Volume — a page appears in the Almanac.",
                );
                this.time.delayedCall(2200, () => this.startTemple(nextTempleIdx));
              },
            });
            this.typingInput.register(placeTarget);
            this.activeTargets.push(placeTarget);
          });
        },
      });
      this.typingInput.register(liftTarget);
      this.activeTargets.push(liftTarget);
    });
  }

  // ─── Fork 1 — Library Tower ──────────────────────────────────────────────

  private startFork1(): void {
    this.setNarrator(
      "The Library Tower. Two paths lead inside.",
    );

    const helpTarget = new TextWordTarget({
      scene: this,
      word: "help scholar etta",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 240,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "help-etta";
        this.startFork1HelpEtta();
      },
    });
    const stealTarget = new TextWordTarget({
      scene: this,
      word: "steal the flame",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 240,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork1Choice = "steal-flame";
        this.startFork1StealFlame();
      },
    });
    this.typingInput.register(helpTarget);
    this.typingInput.register(stealTarget);
    this.activeTargets.push(helpTarget, stealTarget);
  }

  private startFork1HelpEtta(): void {
    if (!this.ettaDone) {
      // Formal commit to the etta path if side encounter was skipped
      this.store.update((s) => {
        if (!s.almanacLore.includes("scholar-ettas-last-volume")) {
          s.almanacLore.push("scholar-ettas-last-volume");
        }
      });
    }
    this.setNarrator("You carry her books to the shelves. The beacon brightens.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        ["carry her books", "the shelves hold them", "etta thanks you quietly", "the beacon brightens"],
        [
          "One by one the shelves fill up.",
          "Scholar Etta traces a title with one finger.",
          "She says nothing, but the lanterns flicker warmly.",
          "The great beacon above brightens. It was watching.",
        ],
        () => this.startAct3(),
      );
    });
  }

  private startFork1StealFlame(): void {
    this.setNarrator("You reach into the beacon and close your hand around the flame.");
    this.time.delayedCall(1800, () => {
      this.runPassageChain(
        ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"],
        [
          "The flame does not burn you. It simply waits.",
          "A tremor passes through the island. The lanterns dip.",
          "You hold a curl of golden fire in your palm.",
          "Something shifts in the air. The summit calls louder.",
        ],
        () => this.startAct3(),
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT 3 — The Scholar-Spirit Boss
  // ═══════════════════════════════════════════════════════════════════════════

  private startAct3(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "The summit. Scrolls orbit a shape that is almost human. The Scholar-Spirit waits.",
    );
    this.bossContainer = this.drawScholarSpirit();
    this.time.delayedCall(2400, () => this.startBossPhase1());
  }

  private startBossPhase1(): void {
    // Boss-phase bookend — audio sting + shake so each riddle phase lands
    // with the same event-weight as a wave.
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.setNarrator(`The spirit speaks: "${RIDDLE_1_DISPLAY}"`);
    this.time.delayedCall(1200, () => {
      // Two sequential word targets: "a" then "portal"
      this.runSequentialWords(
        [...BOSS_PHASE1_WORDS],
        () => {
          playChime();
          this.tweenBossBow();
          this.setNarrator("The spirit bows slightly. It is satisfied — for now.");
          this.time.delayedCall(2000, () => this.startBossPhase2());
        },
      );
    });
  }

  private startBossPhase2(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.setNarrator(`The spirit asks again: "${RIDDLE_2_DISPLAY}"`);
    this.time.delayedCall(1200, () => {
      this.runSequentialWords(
        [...BOSS_PHASE2_WORDS],
        () => {
          playChime();
          this.setNarrator("The spirit's eyes shift colour. Something else stirs within it.");
          this.time.delayedCall(1800, () => {
            if (!this.quietLordFiredInPhase2) {
              this.quietLordFiredInPhase2 = true;
              flashQuietLordFragment(this, { text: "Agai" });
            }
            this.time.delayedCall(1600, () => this.startBossPhase3());
          });
        },
        // Fire the ~~Agai~~ flash after the second word completes
        (wordIndex) => {
          if (wordIndex === 1 && !this.quietLordFiredInPhase2) {
            this.quietLordFiredInPhase2 = true;
            flashQuietLordFragment(this, { text: "Agai" });
          }
        },
      );
    });
  }

  private startBossPhase3(): void {
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.setNarrator(`The spirit speaks its last riddle: "${RIDDLE_3_DISPLAY}"`);
    this.time.delayedCall(1400, () => {
      this.runSequentialWords(
        [...BOSS_PHASE3_WORDS],
        () => {
          playChime();
          this.onBossDefeated();
        },
        (wordIndex) => {
          // Each word dims the spirit a little
          if (this.bossContainer) {
            const targetAlpha = Math.max(0.1, 1 - (wordIndex + 1) * 0.15);
            this.tweens.add({
              targets: this.bossContainer,
              alpha: targetAlpha,
              duration: 400,
              ease: "Sine.easeOut",
            });
          }
        },
      );
    });
  }

  private onBossDefeated(): void {
    // Dissolve the boss into floating lanterns
    if (this.bossContainer) {
      this.bossRingTween?.stop();
      this.tweens.add({
        targets: this.bossContainer,
        alpha: 0,
        y: (this.bossContainer.y ?? 400) - 100,
        duration: 1200,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.bossContainer?.destroy();
          this.bossContainer = null;
        },
      });
      // Spawn floating lantern particles effect
      this.spawnBossLanternBurst();
    }

    // Fire ~~Agai~~ if not already fired in Phase 2
    if (!this.quietLordFiredInPhase2) {
      flashQuietLordFragment(this, { text: "Agai" });
    }

    this.time.delayedCall(800, () => {
      this.setNarrator(
        "the sky remembers every page that ever lit. nothing burned is truly gone.",
      );
      this.time.delayedCall(3000, () => this.startFork2());
    });
  }

  // ─── Boss: sequential word runner ────────────────────────────────────────

  /**
   * Present words one at a time in sequence. Each word must be typed before
   * the next appears. No narrator delay between words — chains directly.
   * `onWordComplete` fires after each word with its 0-based index.
   */
  private runSequentialWords(
    words: string[],
    onAllDone: () => void,
    onWordComplete?: (wordIndex: number) => void,
  ): void {
    let wordIndex = 0;

    const advance = (): void => {
      if (wordIndex >= words.length) {
        onAllDone();
        return;
      }
      const word = words[wordIndex];
      if (word === undefined) {
        onAllDone();
        return;
      }
      const capturedIndex = wordIndex;
      const target = new TextWordTarget({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height / 2 - 40,
        fontSize: 44,
        onComplete: () => {
          playChime();
          wordIndex += 1;
          onWordComplete?.(capturedIndex);
          this.clearActiveTargets();
          this.time.delayedCall(150, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  // ─── Fork 2 — After the Boss ─────────────────────────────────────────────

  private startFork2(): void {
    this.setNarrator("The summit is quiet. Two choices remain.");

    const kindTarget = new TextWordTarget({
      scene: this,
      word: "answer kindly",
      x: this.scale.width / 2 - 380,
      y: this.scale.height - 240,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "answer-kindly";
        this.startFork2KindEnding();
      },
    });
    const tetherTarget = new TextWordTarget({
      scene: this,
      word: "cut the tether",
      x: this.scale.width / 2 + 380,
      y: this.scale.height - 240,
      fontSize: 30,
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "cut-tether";
        this.startFork2CutTether();
      },
    });
    this.typingInput.register(kindTarget);
    this.typingInput.register(tetherTarget);
    this.activeTargets.push(kindTarget, tetherTarget);
  }

  private startFork2KindEnding(): void {
    this.setNarrator("You speak to what remains of the spirit.");
    this.time.delayedCall(1400, () => {
      const t = new TextWordTarget({
        scene: this,
        word: "you kept the light",
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 36,
        onComplete: () => {
          playChime();
          this.clearActiveTargets();
          this.setNarrator("The lanterns around the summit brighten. The island breathes.");
          this.time.delayedCall(2200, () => this.startLanternMothGate());
        },
      });
      this.typingInput.register(t);
      this.activeTargets.push(t);
    });
  }

  private startFork2CutTether(): void {
    this.setNarrator("You find the thread that binds the spirit to the beacon.");
    this.time.delayedCall(1400, () => {
      this.runPassageChain(
        ["pull the thread", "the tether falls"],
        [
          "The thread is thin as spider-silk, strong as iron.",
          "The island lurches once, then steadies. A wind rushes past — freed.",
        ],
        () => this.startLanternMothGate(),
      );
    });
  }

  // ─── Lantern-moth companion gate ─────────────────────────────────────────

  private startLanternMothGate(): void {
    // Single condition: fork1 was help-etta
    if (this.fork1Choice === "help-etta") {
      this.setNarrator(
        "A lantern-moth drifts down from the beacon's height, wings lit like paper.",
      );
      this.time.delayedCall(1200, () => {
        const takeTarget = new TextWordTarget({
          scene: this,
          word: "take her with you",
          x: this.scale.width / 2 - 300,
          y: this.scale.height - 240,
          fontSize: 32,
          onComplete: () => {
            this.clearActiveTargets();
            this.companionChoice = "take";
            this.store.update((s) => {
              if (!s.satchel.includes("lantern-moth")) {
                s.satchel.push("lantern-moth");
              }
            });
            this.setNarrator(
              "The moth lands on your wrist, wings folding. She is coming with you.",
            );
            this.time.delayedCall(2400, () => this.startTrueNamePassage());
          },
        });
        const letGoTarget = new TextWordTarget({
          scene: this,
          word: "let her go",
          x: this.scale.width / 2 + 300,
          y: this.scale.height - 240,
          fontSize: 32,
          onComplete: () => {
            this.clearActiveTargets();
            this.companionChoice = "let-go";
            this.setNarrator(
              "She rises again into the golden air, wings a bright smear against the dusk.",
            );
            this.time.delayedCall(2000, () => this.startTrueNamePassage());
          },
        });
        this.typingInput.register(takeTarget);
        this.typingInput.register(letGoTarget);
        this.activeTargets.push(takeTarget, letGoTarget);
      });
    } else {
      // Gate not met — no near-miss (single condition, as specified)
      this.startTrueNamePassage();
    }
  }

  // ─── True-name passage ────────────────────────────────────────────────────

  private startTrueNamePassage(): void {
    this.clearActiveTargets();
    this.setNarrator("The island speaks. Type back its name.");
    this.time.delayedCall(1800, () => {
      const target = new TextWordTarget({
        scene: this,
        word: TRUE_NAME_PASSAGE,
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 28,
        onComplete: () => {
          playChime();
          this.time.delayedCall(800, () => this.startEnding());
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    });
  }

  // ─── Ending ───────────────────────────────────────────────────────────────

  private startEnding(): void {
    this.clearActiveTargets();
    this.setNarrator("You return to the portal. The Almanac stamps a new page.");

    this.store.update((s) => {
      s.realms["sky-island"] = {
        cleared: true,
        choices: {
          fork1: this.fork1Choice ?? "none",
          fork2: this.fork2Choice ?? "none",
          companion: this.companionChoice ?? "none",
        },
      };

      const fork1Relic =
        this.fork1Choice === "help-etta" ? "ettas-ledger" : "beacon-spark";
      const fork2Relic =
        this.fork2Choice === "answer-kindly" ? "wind-phrase" : "tether-cord";

      if (!s.satchel.includes(fork1Relic)) s.satchel.push(fork1Relic);
      if (!s.satchel.includes(fork2Relic)) s.satchel.push(fork2Relic);

      if (
        this.fork2Choice === "cut-tether" &&
        !s.satchel.includes("untethered-wind")
      ) {
        s.satchel.push("untethered-wind");
      }
    });

    this.showAlmanacStamp(() => {
      this.cameras.main.fadeOut(700, 26, 16, 8);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => this.scene.start("PortalChamberScene", { store: this.store }),
      );
    });
  }

  private showAlmanacStamp(onDone: () => void): void {
    const stamp = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "the sky island of lanterns", {
        fontFamily: SERIF,
        fontSize: "60px",
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

  // ─── Lantern-spirit enemies ───────────────────────────────────────────────

  private spawnSpirit(
    startX: number,
    targetX: number,
    targetY: number,
    word: string,
    delay: number,
    advanceMs: number,
  ): void {
    const container = this.add.container(startX, targetY);

    // Glow halo (outer)
    const glowGfx = this.add.graphics();
    glowGfx.fillStyle(0xf5c842, 0.18);
    glowGfx.fillEllipse(0, 0, 90, 90);
    container.add(glowGfx);

    // Lantern body — translucent amber ellipse
    const lanternGfx = this.add.graphics();
    lanternGfx.fillStyle(0xe8a020, 0.6);
    lanternGfx.fillEllipse(0, 0, 46, 60);
    // Bright core
    lanternGfx.fillStyle(0xfdedb0, 0.85);
    lanternGfx.fillEllipse(0, 0, 18, 20);
    container.add(lanternGfx);
    container.setAlpha(0);

    const spirit: LanternSpirit = {
      container,
      lanternGfx,
      glowGfx,
      pulseTween: null,
      target: null,
      spawnX: targetX,
      restY: targetY,
      word,
      defeated: false,
      advanceTween: null,
      advanceMs,
    };

    this.tweens.add({
      targets: container,
      x: targetX,
      alpha: 1,
      duration: 800,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (spirit.defeated) return;
        // Idle pulse
        spirit.pulseTween = this.tweens.add({
          targets: lanternGfx,
          alpha: { from: 0.6, to: 0.9 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.idleBob(container);
        this.attachSpiritTarget(spirit);
        this.startSpiritAdvance(spirit);
      },
    });

    this.spirits.push(spirit);
  }

  private attachSpiritTarget(spirit: LanternSpirit): void {
    const target = new TextWordTarget({
      scene: this,
      word: spirit.word,
      x: spirit.container.x,
      y: spirit.restY - 80,
      fontSize: 32,
      // Lantern-amber burst on completion — spirits "bloom out" in their own
      // light, matching the theme rather than the default brass.
      burstColor: 0xf5c842,
      onComplete: () => this.defeatSpirit(spirit),
    });
    spirit.target = target;
    this.typingInput.register(target);
    this.activeTargets.push(target);
  }

  private startSpiritAdvance(spirit: LanternSpirit): void {
    const wrenX = this.wrenContainer.x;
    const remaining = Math.abs(spirit.container.x - wrenX);
    const totalRange = Math.abs(spirit.spawnX - wrenX);
    const duration =
      spirit.advanceMs * Math.max(0.3, remaining / Math.max(1, totalRange));

    spirit.advanceTween = this.tweens.add({
      targets: spirit.container,
      x: wrenX,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        if (!spirit.target) return;
        spirit.target.setAnchorX(spirit.container.x);
        // Danger pulse — as the spirit crosses DANGER_RAMP_START of its
        // advance, the floating word shifts cream → ember. Communicates
        // urgency without needing additional UI chrome.
        const dangerLevel = Math.max(
          0,
          (tween.progress - DANGER_RAMP_START) / (1 - DANGER_RAMP_START),
        );
        spirit.target.setDanger(dangerLevel);
      },
      onComplete: () => {
        spirit.advanceTween = null;
        if (!spirit.defeated) {
          this.spiritReachesWren(spirit);
        }
      },
    });
  }

  private defeatSpirit(spirit: LanternSpirit): void {
    if (spirit.defeated) return;
    playChime();
    spirit.defeated = true;

    // Stop pulse, fully light the lantern (bloom effect)
    spirit.pulseTween?.stop();
    spirit.pulseTween = null;

    if (spirit.target) {
      this.typingInput.unregister(spirit.target);
      const idx = this.activeTargets.indexOf(spirit.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      spirit.target = null;
    }
    spirit.advanceTween?.stop();
    spirit.advanceTween = null;
    this.tweens.killTweensOf(spirit.container);

    // Bloom: expand glow radius briefly
    this.tweens.add({
      targets: spirit.glowGfx,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 700,
      ease: "Sine.easeOut",
    });
    // Fully light lantern core
    spirit.lanternGfx.clear();
    spirit.lanternGfx.fillStyle(0xfff4b0, 1);
    spirit.lanternGfx.fillEllipse(0, 0, 52, 68);
    spirit.lanternGfx.fillStyle(0xffffff, 0.9);
    spirit.lanternGfx.fillEllipse(0, 0, 22, 26);

    this.tweens.add({
      targets: spirit.container,
      alpha: 0,
      y: spirit.container.y - 80,
      duration: 900,
      delay: 400,
      ease: "Sine.easeOut",
      onComplete: () => spirit.container.destroy(),
    });

    if (this.spirits.every((s) => s.defeated)) {
      this.spirits = [];
      if (this.templeIndex === -1) {
        // First encounter
        this.time.delayedCall(1600, () => this.onFirstEncounterCleared());
      } else {
        this.time.delayedCall(1600, () => this.onTempleCleared());
      }
    }
  }

  private spiritReachesWren(spirit: LanternSpirit): void {
    // Gentle flash — no wave reset
    this.cameras.main.flash(300, 26, 16, 8, false);

    if (spirit.target) {
      this.typingInput.unregister(spirit.target);
      const idx = this.activeTargets.indexOf(spirit.target);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
      spirit.target.destroy();
      spirit.target = null;
    }
    this.tweens.killTweensOf(spirit.container);

    this.tweens.add({
      targets: spirit.container,
      x: spirit.spawnX,
      duration: 800,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (spirit.defeated) return;
        this.time.delayedCall(2000, () => {
          if (spirit.defeated) return;
          this.idleBob(spirit.container);
          this.attachSpiritTarget(spirit);
          this.startSpiritAdvance(spirit);
        });
      },
    });
  }

  // Patch: first encounter sets templeIndex to -1 to distinguish from temple 0
  private startFirstSpiritEncounterFixed(): void {
    this.templeIndex = -1;
    this.startFirstSpiritEncounter();
  }

  // ─── Shared utilities ─────────────────────────────────────────────────────

  private runPassageChain(
    passages: string[],
    narratorLines: string[],
    onDone: () => void,
  ): void {
    let step = 0;

    const advance = (): void => {
      if (step >= passages.length) {
        this.time.delayedCall(1400, onDone);
        return;
      }
      const target = new TextWordTarget({
        scene: this,
        word: passages[step] ?? "",
        x: this.scale.width / 2,
        y: this.scale.height / 2,
        fontSize: 36,
        onComplete: () => {
          step += 1;
          this.setNarrator(narratorLines[step - 1] ?? "");
          this.time.delayedCall(1400, advance);
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
    };

    advance();
  }

  private idleBob(c: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: c,
      y: { from: c.y, to: c.y - 8 },
      duration: 1100,
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
    if (event.key.length === 1 || event.key === " ") playClack();
    this.typingInput.handleChar(event.key);
  }

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

  private drawTempleStones(): void {
    const g = this.add.graphics();
    g.fillStyle(0x5e5040, 1);
    // Left columns
    for (const x of [160, 360, 560]) {
      g.fillRect(x - 18, 680, 36, 180);
      g.fillRect(x - 26, 674, 52, 18);
    }
    // Right columns
    for (const x of [1360, 1560, 1760]) {
      g.fillRect(x - 18, 680, 36, 180);
      g.fillRect(x - 26, 674, 52, 18);
    }
    // Faint lintel suggestions
    g.fillStyle(0x4a3c2c, 0.7);
    g.fillRect(130, 658, 480, 20);
    g.fillRect(1330, 658, 480, 20);
  }

  /** Phaser update tick. Drives per-frame lantern blur on active phrases —
   *  alpha drops as a banner enters a lantern's beam, restores between. */
  update(): void {
    if (this.activePhrases.length === 0) return;
    for (const phrase of this.activePhrases) {
      const x = phrase.getX();
      let minDist = Infinity;
      for (const lanternX of LANTERN_BLUR_XS) {
        const d = Math.abs(x - lanternX);
        if (d < minDist) minDist = d;
      }
      const amount =
        minDist < LANTERN_BLUR_RADIUS ? 1 - minDist / LANTERN_BLUR_RADIUS : 0;
      phrase.setBlur(amount);
    }
  }

  /** Three vertical light beams that obscure phrases passing through them.
   *  Drawn once for the entire 5-temple sequence; the SHUTDOWN hook cleans up.
   *  Beam alpha is intentionally readable but soft — the player should see the
   *  zone, but the beams shouldn't compete with the phrase banners they obscure. */
  private drawTempleLanterns(): void {
    for (const x of LANTERN_BLUR_XS) {
      const g = this.add.graphics().setDepth(15);
      const beamTop = 220;
      const beamBottom = 660;
      const halfWidth = LANTERN_BLUR_RADIUS;
      // Outer halo — soft amber wash across the full blur radius
      g.fillStyle(0xf5c842, 0.12);
      g.fillRect(x - halfWidth, beamTop, halfWidth * 2, beamBottom - beamTop);
      // Inner brighter core — narrower column for the "you're in the zone" cue
      g.fillStyle(0xfdedb0, 0.18);
      g.fillRect(x - 36, beamTop, 72, beamBottom - beamTop);
      // Lantern body at the top of the beam
      g.fillStyle(0xd49020, 0.85);
      g.fillEllipse(x, beamTop + 20, 40, 54);
      g.fillStyle(0xfdedb0, 0.95);
      g.fillEllipse(x, beamTop + 20, 18, 24);
      // Hanging string
      g.lineStyle(1.5, 0x8a7060, 0.85);
      g.beginPath();
      g.moveTo(x, beamTop - 30);
      g.lineTo(x, beamTop);
      g.strokePath();
      // Gentle pulse — the beam breathes so it doesn't feel like dead UI
      this.tweens.add({
        targets: g,
        alpha: { from: 0.85, to: 1 },
        duration: 2200 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.templeLanterns.push(g);
    }
  }

  private drawAmbientLanterns(): void {
    // Decorative background lanterns hanging at various heights
    const lanternPositions = [
      { x: 240, y: 420 },
      { x: 480, y: 360 },
      { x: 720, y: 440 },
      { x: 960, y: 320 },
      { x: 1200, y: 400 },
      { x: 1440, y: 360 },
      { x: 1680, y: 440 },
      { x: 380, y: 540 },
      { x: 840, y: 500 },
      { x: 1100, y: 520 },
      { x: 1540, y: 480 },
    ];

    lanternPositions.forEach(({ x, y }) => {
      const g = this.add.graphics();
      // Hanging string
      g.lineStyle(1, 0x8a7060, 0.6);
      g.beginPath();
      g.moveTo(x, y - 24);
      g.lineTo(x, y - 6);
      g.strokePath();
      // Glow halo
      g.fillStyle(0xf5c842, 0.08);
      g.fillEllipse(x, y, 70, 70);
      // Lantern body
      g.fillStyle(0xd49020, 0.55);
      g.fillEllipse(x, y, 28, 38);
      g.fillStyle(0xfdedb0, 0.65);
      g.fillEllipse(x, y, 12, 16);

      // Gentle idle drift
      this.tweens.add({
        targets: g,
        y: { from: 0, to: -6 },
        duration: 1400 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 1000,
      });
    });
  }

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    return c;
  }

  /** Draw the Scholar-Spirit boss: rotating rings of amber dots */
  private drawScholarSpirit(): Phaser.GameObjects.Container {
    const bx = this.scale.width / 2;
    const by = 400;
    const c = this.add.container(bx, by);

    // Body silhouette — loose humanoid shape from concentric ellipses
    const bodyGfx = this.add.graphics();
    // Torso
    bodyGfx.fillStyle(0xd49020, 0.25);
    bodyGfx.fillEllipse(0, 40, 80, 120);
    // Head
    bodyGfx.fillStyle(0xe8b040, 0.3);
    bodyGfx.fillEllipse(0, -30, 60, 60);
    c.add(bodyGfx);

    // Three rings of orbiting amber dots
    const ringConfigs = [
      { radius: 80, dotCount: 8, speed: 0.015, dotSize: 5 },
      { radius: 120, dotCount: 12, speed: -0.010, dotSize: 4 },
      { radius: 55, dotCount: 6, speed: 0.022, dotSize: 3 },
    ];

    ringConfigs.forEach(({ radius, dotCount, dotSize }) => {
      const ringGfx = this.add.graphics();
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius * 0.55; // flatten to ellipse
        ringGfx.fillStyle(0xf5c842, 0.75);
        ringGfx.fillCircle(dx, dy, dotSize);
      }
      c.add(ringGfx);
    });

    // "Eyes" — two amber dots
    const eyeGfx = this.add.graphics();
    eyeGfx.fillStyle(0xfff4b0, 0.95);
    eyeGfx.fillCircle(-12, -28, 5);
    eyeGfx.fillCircle(12, -28, 5);
    c.add(eyeGfx);

    // Animate the container with a slow rotation shimmer using scale oscillation
    this.bossRingTween = this.tweens.add({
      targets: c,
      scaleX: { from: 1, to: 1.04 },
      scaleY: { from: 1, to: 0.97 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    return c;
  }

  private tweenBossBow(): void {
    if (!this.bossContainer) return;
    this.tweens.add({
      targets: this.bossContainer,
      y: (this.bossContainer.y ?? 400) + 30,
      duration: 300,
      ease: "Sine.easeOut",
      yoyo: true,
    });
  }

  private spawnBossLanternBurst(): void {
    const cx = this.scale.width / 2;
    const cy = 400;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const g = this.add.graphics();
      g.fillStyle(0xf5c842, 0.7);
      g.fillEllipse(cx, cy, 18, 26);
      g.fillStyle(0xfdedb0, 0.9);
      g.fillEllipse(cx, cy, 8, 10);
      const targetX = cx + Math.cos(angle) * (120 + Math.random() * 80);
      const targetY = cy + Math.sin(angle) * 70 - 100 - Math.random() * 80;
      this.tweens.add({
        targets: g,
        x: targetX - cx,
        y: targetY - cy,
        alpha: 0,
        duration: 1200 + Math.random() * 600,
        ease: "Sine.easeOut",
        onComplete: () => g.destroy(),
      });
    }
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function filterWordsByLength(
  bank: readonly string[],
  minLen: number,
  maxLen: number,
): readonly string[] {
  const filtered = bank.filter((w) => w.length >= minLen && w.length <= maxLen);
  return filtered.length >= 3 ? filtered : bank;
}

function shuffleArr<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
