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
  addIdleBreath,
  addLocalGroundShadow,
  playActorAttention,
  playBodyImpact,
  playRealmClearResonance,
  stageContainerEntrance,
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
  private ingaFigure: Phaser.GameObjects.Container | null = null;
  private ghostKingBody: Phaser.GameObjects.Image | null = null;
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
    this.ingaFigure = null;
    this.ghostKingBody = null;
    this.quietLordIntruded =
      this.store.get().realms["haunted-wood"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("haunted-wood-backdrop", hauntedWoodBackdrop);
    this.load.image("wood-ghost", woodGhostSprite);
    this.load.image("ghost-king", ghostKingSprite);
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
    this.drawShrine();
    this.wrenContainer = this.drawWren(WREN_X, WREN_Y);

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

    this.narration = new NarrationManager(this, { y: 150, framed: true });

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
      onSustainedLowHeart: () => this.setNarrator(pickLowHeartLine().text),
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
      announce: (text) => this.setNarrator(text),
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
      this.ingaFigure = null;
      this.ghostKingBody = null;
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

  // ─── Act 1 — Into the Wood ────────────────────────────────────────────────

  private startArrival(): void {
    this.narration.say("wood_intro_arrival");
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
      const target = this.makeWord({
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
    this.setNarrator("i don't know my name.", "Inga");
    this.attendInga();
    this.time.delayedCall(1800, () => {
      // Wren types a reply
      const reply = this.makeWord({
        scene: this,
        word: "i'll find it.",
        x: this.scale.width / 2,
        y: this.scale.height - 340,
        fontSize: 36,
        onClaim: () => this.attendInga(),
        onComplete: () => {
          this.clearActiveTargets();
          this.setNarrator(
            "the shrine knows. the shrine keeper might tell you.",
            "Inga",
          );
          this.attendInga();
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

    const offeringTarget = this.makeWord({
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
    });
    const fluteTarget = this.makeWord({
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
          this.attendInga();
          this.time.delayedCall(2000, () => this.startIngaNameReveal());
        },
      );
    });
  }

  private startIngaNameReveal(): void {
    this.setNarrator("Her name. Type it back to her.");
    const target = this.makeWord({
      scene: this,
      word: "inga",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
      fontSize: 44,
      onClaim: () => this.attendInga(),
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

    const bargainTarget = this.makeWord({
      scene: this,
      word: "speak your true name",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 340,
      fontSize: 28,
      frame: "banner",
      onClaim: () => this.attendGhostKing(),
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "bargain";
        this.attendGhostKing();
        this.startFork2Bargain();
      },
    });
    const forceTarget = this.makeWord({
      scene: this,
      word: "light the grove",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 340,
      fontSize: 28,
      frame: "banner",
      onClaim: () => this.attendGhostKing(),
      onComplete: () => {
        this.clearActiveTargets();
        this.fork2Choice = "force";
        // §5.5.5 Fork 2B — burn the grove → award Ash-Vial relic
        this.store.update((s) => {
          if (!s.satchel.includes("ash-vial")) s.satchel.push("ash-vial");
        });
        this.attendGhostKing();
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
      );
    });
  }

  // ─── Boss Fight — two waves ────────────────────────────────────────────────

  private startBossFight(): void {
    this.setNarrator("Then prove it.", "Ghost-King");
    this.attendGhostKing();
    this.band.setObjective("Survive the Ghost-King's warded waves.");
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
      const target = this.makeWord({
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
    this.time.delayedCall(1600, () => {
      const callTarget = this.makeWord({
        scene: this,
        word: "call to her",
        x: this.scale.width / 2 - 320,
        y: this.scale.height - 340,
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
          this.time.delayedCall(1800, () => this.startEnding());
        },
      });
      const leaveTarget = this.makeWord({
        scene: this,
        word: "leave her",
        x: this.scale.width / 2 + 320,
        y: this.scale.height - 340,
        fontSize: 30,
        frame: "banner",
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
          this.scene.start("PortalChamberScene", { store: this.store });
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

  /** UI-cohesion: every Wood word target gets the legibility outline by default
   *  (TTT-style). Fork choices pass frame: "banner". */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    const onClaim = opts.onClaim;
    const onComplete = opts.onComplete;
    return new TextWordTarget({
      outline: true,
      ...opts,
      onClaim: (mods) => {
        if (opts.frame === "banner") playWrenFocus(this.wrenSprite);
        onClaim?.(mods);
      },
      onComplete: () => {
        if (opts.frame === "banner") playWrenAction(this.wrenSprite);
        onComplete();
      },
    });
  }

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
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
    this.setNarrator(
      lines.length === 1
        ? lines[0]!
        : "Your satchel stirs; its relics answer here.",
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
    if (this.ingaFigure?.scene) this.ingaFigure.destroy();
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 54, 14, { y: 32, alpha: 0.18 }));

    // Inga: smaller translucent ellipse, slightly warmer tone
    const g = this.add.graphics();
    // Translucent body — warmer than the grey ghosts
    g.fillStyle(0xf0e8d8, 0.38);
    g.fillEllipse(0, 0, 42, 58);
    // Inner glow
    g.fillStyle(0xfaf4e8, 0.18);
    g.fillEllipse(0, -4, 24, 34);
    // Eyes
    g.fillStyle(0x2a1a0a, 0.6);
    g.fillCircle(-7, -4, 3);
    g.fillCircle(7, -4, 3);
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
      onComplete: () => addIdleBreath(this, sprite, { dy: -4, durationMs: 2600 }),
    });
  }
}
