import Phaser from "phaser";
import { type AmbientHandle, playAmbientForge } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { pickLowHeartLine } from "../audio/runaLines";
import { playDamageThud } from "../audio/damageThud";
import { playSparkZap } from "../audio/sparkZap";
import { playWaveSting } from "../audio/waveSting";
import { playBellToll } from "../audio/bellToll";
import {
  flashDamageVignette,
  playChainSpark,
  playWordCompleteBurst,
} from "../game/vfx";
import { HeartSoulHud } from "../game/heartSoulHud";
import { NarrationManager } from "../game/narrationManager";
import { flashQuietLordFragment, playQuietLordIntrusion } from "../game/quietLordIntrusion";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import {
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
import { SPELL_COST } from "../game/sessionStats";
import { type ClaimMods, TypingInputController } from "../game/typingInput";
import { WaveDirector } from "../game/waveDirector";
import { MovingWordEnemy } from "../game/movingWordEnemy";
import {
  addAmbientDrift,
  addIdleBreath,
  addLocalGroundShadow,
} from "../game/livingScene";
import { pickAdaptiveWords, FORGE_COMMAND_BANK } from "../game/wordBank";
import { TextWordTarget, type TextWordTargetOptions } from "../game/wordTarget";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, preloadWren } from "../game/wren";
import { showAlmanacStampCard } from "../game/ui/almanacStamp";
import { ConsoleBand } from "../game/ui/consoleBand";
import { preloadSatchelIcons } from "../game/ui/satchelIcons";
import forgeBackdrop from "../../art/references/clockwork-forge-clean.png";
import forgeGolemSprite from "../../art/forge/golem.png";
import forgeCommandGolemSprite from "../../art/forge/command-golem.png";
import fornSprite from "../../art/forge/forn.png";
import runaPortrait from "../../art/runa/runa-front.png";

// Danger ramps in over the LAST 60% of a golem's advance — earlier portion
// stays cream so players can read the word, then it shifts ember as the
// golem closes. Mirrors Winter Mountain.
const DANGER_RAMP_START = 0.4;

// ─── Scene data ───────────────────────────────────────────────────────────────

interface ForgeSceneData {
  store: SaveStore;
  revisit?: boolean;
}

// ─── Golem entity ─────────────────────────────────────────────────────────────

// Advancing golems are now the shared MovingWordEnemy (this.golems). Only the
// stationary tutorial golem needs a bespoke record — it never advances or carries
// a word; Gregor's lesson drives it through golemTurnHead / golemCommandFlash.
interface StaticGolem {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATWALK_Y = 440;
const FLOOR_Y = 780;

const GOLEM_ADVANCE_MS = 15000;

// Painted-sprite display heights (px), matching the old procedural body heights so
// the word anchor + hit feel line up. The boss is drawn inside a ×1.8 container,
// so its on-screen height is COMMAND_GOLEM_SPRITE_HEIGHT × 1.8. Tune on live.
const GOLEM_SPRITE_HEIGHT = 132;
const COMMAND_GOLEM_SPRITE_HEIGHT = 150;

// Smith Forn's standing portrait — a believable character height (px). He's a
// narration NPC, so this only affects his on-screen figure, not any hit/word
// anchor. Tune on live. Placed left-third, feet near FLOOR_Y.
const FORN_SPRITE_HEIGHT = 360;

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
  private director!: WaveDirector;
  private narration!: NarrationManager;
  private golems: MovingWordEnemy[] = [];
  private activeTargets: TextWordTarget[] = [];
  private wrenSprite!: Phaser.GameObjects.Image;
  /** Smith Forn's standing portrait — only on screen during the Fork 1 beat. */
  private fornSprite?: Phaser.GameObjects.Image;

  private shiftHeld = false;
  private altHeld = false;
  private waveActive = false;

  // Tier 4 — relics from earlier realms shape this realm's combat. The Forge is
  // the only forward realm with a Soul-cast economy, so it's the home of
  // soul-banked (king-aurland) and soul-thrift (bellows-hammer). Resolved once
  // in create(); the hooks read it. `spellCost` folds in soul-thrift so every
  // cast site charges one shared, discounted price. Grace is gated OUT of the
  // Forge in the descriptor (no losable economy here).
  private combat: CombatLoadout = resolveCombatLoadout([], "clockwork-forge");
  private spellCost = SPELL_COST;
  private waveForgivenessReady = false;
  // Tier 4 — the Soul-charged, typed invocation for offensive one-shots. In the
  // Forge that's toll-strike (bells-tongue, earned in the Bell on a force fork):
  // a charged "toll" word strikes the strongest live golem. Null until create().
  private oneShotInvoker: OneShotInvoker<MovingWordEnemy> | null = null;

  /** Forge glow pools drawn on the floor. */
  private forgeGlowGraphics!: Phaser.GameObjects.Graphics;

  /** fork1: "forn" | "cabal" */
  private fork1Choice: "forn" | "cabal" | null = null;
  /** fork2: "peaceful" | "fought" */
  private fork2Choice: "peaceful" | "fought" | null = null;
  private companionAwarded = false;
  /** True after the Quiet Lord's §5.5.10 intrusion has fired this playthrough. */
  private quietLordIntruded = false;
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
    this.oneShotInvoker = null;
    this.shiftHeld = false;
    this.waveActive = false;
    this.fork1Choice = null;
    this.fork2Choice = null;
    this.companionAwarded = false;
    this.quietLordIntruded =
      this.store.get().realms["clockwork-forge"]?.quietLordIntruded ?? false;
  }

  preload(): void {
    this.load.image("forge-backdrop", forgeBackdrop);
    this.load.image("forge-golem", forgeGolemSprite);
    this.load.image("forge-command-golem", forgeCommandGolemSprite);
    this.load.image("forn", fornSprite);
    this.load.image("band-portrait-runa", runaPortrait);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    preloadWren(this);
  }

  create(): void {
    this.cameras.main.fadeIn(600, 26, 16, 8);
    this.add
      .image(0, 0, "forge-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addAmbientDrift(this, {
      kind: "ember",
      count: 44,
      depth: -1,
      area: { x: 0, y: 360, width: this.scale.width, height: 480 },
      alpha: 0.55,
      minSize: 1.5,
      maxSize: 4.5,
      driftX: 70,
      driftY: -300,
      minDurationMs: 3600,
      maxDurationMs: 8200,
    });
    this.drawForgeGlow();
    this.drawCatwalk();
    this.drawWren(this.scale.width / 2, CATWALK_Y + 20);

    this.narration = new NarrationManager(this, { y: 150, framed: true });

    this.typingInput = new TypingInputController(this.store);
    this.director = new WaveDirector(this.typingInput.getStats());

    // Tier 4 — a revisit is a free-passage replay (no combat) → neutral loadout.
    // soul-thrift folds into one shared spellCost used at every cast site.
    this.combat = resolveCombatLoadout(
      this.revisit ? [] : this.store.get().satchel,
      "clockwork-forge",
    );
    this.spellCost = Math.ceil(SPELL_COST * this.combat.soulThriftMult);

    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        // forgive-wave-miss (Shrine-Token): the first miss of a wave is spared
        // the flinch. Revisit-only (Shrine-Token is a later realm's relic).
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
    // UI cohesion — the console band: the crafted bottom zone (TTT two-zone
    // composition) that houses the meters + satchel. Passive relics show as icon
    // tiles ("always on"); the offensive one-shots drop in as charge cards. This
    // replaces the floating top-right HUD and the centered one-shot stack.
    const band = new ConsoleBand(this, {
      portraitKey: "band-portrait-runa",
      portraitName: "Runa",
      passiveIconIds: this.combat.passiveRelicIds,
    });

    new HeartSoulHud(this, {
      getHeart: () => this.typingInput.getStats().getHeart(),
      getSoul: () => this.typingInput.getStats().getSoul(),
      getCombo: () => this.typingInput.getStats().getCombo(),
      getCastReady: () => this.typingInput.getStats().canCast(this.spellCost),
      onSustainedLowHeart: () => this.setNarrator(pickLowHeartLine().text),
      anchor: band.metersAnchor,
      plate: false,
    });

    // Tier 4 — offensive one-shots fired by a Soul-charged, typed invocation
    // word. In the Forge the only forward-usable one is toll-strike (bells-tongue
    // from the Bell's force fork); a charged "toll" strikes the strongest golem.
    // The boss is NOT in `this.golems`, so its true-name challenge is never
    // skipped by a one-shot. Inert when no offensive relic is owned (empty list).
    const offensiveOneShots = this.combat.oneShots.filter(isOffensiveOneShot);
    this.oneShotInvoker = new OneShotInvoker<MovingWordEnemy>({
      scene: this,
      typingInput: this.typingInput,
      available: offensiveOneShots,
      cost: ONESHOT_SOUL_COST,
      getSoul: () => this.typingInput.getStats().getSoul(),
      spendSoul: (cost) => this.typingInput.getStats().spendSoul(cost),
      getThreats: () => this.liveGolemThreats(),
      applyEffect: (effect, targets) => this.applyOneShot(effect, targets),
      isActive: () => this.waveActive,
      announce: (text) => this.setNarrator(text),
      slots: band.oneShotSlots,
      compact: true,
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.input.keyboard?.on("keyup", this.onKeyUp, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.oneShotInvoker?.destroy();
      this.oneShotInvoker = null;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.input.keyboard?.off("keyup", this.onKeyUp, this);
      this.ambientHandle?.stop();
      this.fornSprite?.destroy();
      this.fornSprite = undefined;
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
      const target = this.makeWord({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 340,
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
    this.narration.say("forge_intro_arrival");
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
    const target = this.makeWord({
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
    const reply1 = this.makeWord({
      scene: this,
      word: "i know.",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
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

    const target = this.makeWord({
      scene: this,
      word: "turn",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
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

  private gregorTutorialCommand(tutorialGolem: StaticGolem): void {
    this.clearActiveTargets();
    this.setNarrator(
      "\"Now hold Shift and type 'TURN' — give it a command.\"",
    );

    const target = this.makeWord({
      scene: this,
      word: "TURN",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
      fontSize: 36,
      // Capital tutorial: must actually be typed with Shift now.
      caseSensitive: true,
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
    // Tier 4 — announce the relic loadout once before the realm's first combat,
    // then begin. Empty loadout (incl. revisits) passes straight through.
    this.announceCombatLoadout(() => this.beginTutorialGolemFight());
  }

  private beginTutorialGolemFight(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "Gregor nods. \"Now do it for real. That one won't wait.\"",
    );

    const golem = this.spawnAdvancingGolem(1060, FLOOR_Y, "walk", GOLEM_ADVANCE_MS * 1.4, false);

    this.waveActive = true;
    this.time.delayedCall(2000, () => {
      if (!this.waveActive) return;
      this.setNarrator("The golem advances. Type 'walk' to redirect it.");
    });

    // Set up a watch: when all golems cleared, move to act 2
    this.golems.push(golem);
    this.beginCombatWave();
    this.time.delayedCall(800, () => this.watchForWaveClear(() => {
      this.time.delayedCall(800, () => this.startAct2());
    }));
  }

  // ─── ACT 2 — Through the Foundry Floor ──────────────────────────────────────

  private startAct2(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    // Almanac lore pages 1 + 2 — Gregor's lesson is conclusively done, and
    // the foundry's three-century setup is now visible. Both stamp here.
    this.store.update((s) => {
      if (!s.almanacLore.includes("golem-keepers-code")) {
        s.almanacLore.push("golem-keepers-code");
      }
      if (!s.almanacLore.includes("the-broken-bellows")) {
        s.almanacLore.push("the-broken-bellows");
      }
    });
    this.setNarrator(
      "You descend to the foundry floor. The heat is immense. Iron shapes move through the dark.",
    );
    this.time.delayedCall(2000, () => this.startWave1());
  }

  private startWave1(): void {
    this.waveActive = true;
    this.golems = [];
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.narration.say("forge_wave1_intro");

    // Tier 1 signature: every golem is a mixed-case command (lowercase head,
    // CAPITALIZED tail) — the brass only obeys when the capitals are typed with
    // Shift, so each kill demands a clean mid-word Shift-switch (canon §5.5.8).
    // Speed-axis director still scales word length + advance; count stays at the
    // narrated three ("Three golems stir."), concurrency is applied on wave 2.
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      3,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 3);
    slots.forEach((slot, i) => {
      const g = this.spawnAdvancingGolem(slot.x, slot.y, words[i], advanceMs, true);
      this.golems.push(g);
    });

    this.beginCombatWave();
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
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
    this.narration.say("forge_wave2_intro");

    // §5.5.10 — a golem's CAPITALIZED command comes out as scratched-out caps.
    // Fires on Wave 2 (the wave that introduces the capitalized golem) so it
    // lands as part of the realm's signature mechanic.
    if (!this.quietLordIntruded) {
      this.quietLordIntruded = true;
      this.store.update((s) => {
        const realm = s.realms["clockwork-forge"];
        if (realm) realm.quietLordIntruded = true;
      });
      this.time.delayedCall(1800, () => {
        playQuietLordIntrusion(this, {
          x: this.scale.width / 2,
          y: 360,
          text: "THE BRASS REMEMBERS A DIFFERENT NAME.",
        });
      });
    }

    // Every golem is a mixed-case command now — the lone all-caps "VALVE" is
    // retired; Tier 1 makes the whole wave demand the Shift-switch. Speed-axis
    // director scales length, advance, AND concurrency here (the intro line
    // states no fixed count), clamped to the floor slots.
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS * 0.85);
    const count = Math.min(this.director.enemyCount(3), FLOOR_SLOTS.length);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      count,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, count);
    for (let i = 0; i < count; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        words[i],
        advanceMs,
        true,
      );
      this.golems.push(g);
    }

    this.beginCombatWave();
    this.watchForWaveClear(() => this.startFork1());
  }

  // ─── Fork 1 ──────────────────────────────────────────────────────────────────

  /** Fade Smith Forn's standing portrait in on the foundry floor, left-third,
   *  feet near FLOOR_Y. Narration NPC only — no word/hit anchor. Idempotent. */
  private showFornSprite(): void {
    if (this.fornSprite) return;
    const sprite = this.add.image(400, FLOOR_Y, "forn");
    sprite.setOrigin(0.5, 1); // feet on the floor line
    sprite.setScale(FORN_SPRITE_HEIGHT / sprite.height);
    sprite.setDepth(40); // above backdrop (-100), below narration band (y≈150)
    sprite.setAlpha(0);
    this.tweens.add({
      targets: sprite,
      alpha: 1,
      duration: 700,
      ease: "Sine.easeOut",
    });
    this.fornSprite = sprite;
  }

  /** Fade Forn out and destroy him as the realm moves on past the fork. */
  private hideFornSprite(): void {
    const sprite = this.fornSprite;
    if (!sprite) return;
    this.fornSprite = undefined;
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: 600,
      ease: "Sine.easeIn",
      onComplete: () => sprite.destroy(),
    });
  }

  private startFork1(): void {
    this.clearActiveTargets();
    this.golems = [];
    this.waveActive = false;
    this.narration.say("forge_fork1_intro");
    this.showFornSprite();

    const helpForn = this.makeWord({
      scene: this,
      word: "help smith forn",
      x: this.scale.width / 2 - 420,
      y: this.scale.height - 320,
      fontSize: 32,
      frame: "banner",
      onComplete: () => this.startFornBranch(),
    });
    const joinCabal = this.makeWord({
      scene: this,
      word: "join the apprentices",
      x: this.scale.width / 2 + 420,
      y: this.scale.height - 320,
      fontSize: 32,
      frame: "banner",
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
    // The fork is resolved — the realm moves on to the boss; Forn leaves.
    this.hideFornSprite();
    // Almanac lore page 3 — Forn's hammer song OR the Apprentices' manifesto.
    // Mutually exclusive per fork branch.
    const lorePageId =
      choice === "forn" ? "forn-bellows-song" : "apprentices-manifesto";
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
      if (!s.almanacLore.includes(lorePageId)) {
        s.almanacLore.push(lorePageId);
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
    this.narration.say("forge_command_golem_rise");
    this.time.delayedCall(2800, () => this.startBossPhase1());
  }

  // Boss sprite — kept so phase 2 can flash it "commanded" (brass).
  private bossContainer!: Phaser.GameObjects.Container;
  private bossSprite!: Phaser.GameObjects.Image;

  private spawnBossVisual(): void {
    const cx = this.scale.width / 2 + 200;
    const cy = FLOOR_Y - 10;
    this.bossContainer = this.add.container(cx, cy);
    this.bossContainer.setScale(1.8);
    this.bossSprite = this.drawCommandGolemInto(this.bossContainer, false);

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
    playWaveSting();
    this.cameras.main.shake(220, 0.005);
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
      const target = this.makeWord({
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
    // The Command-Golem is now under command — it glows brass for the rest of
    // the fight (persisted tint, no clear).
    this.flashGolemCommanded(this.bossSprite, true);

    this.narration.say("forge_command_golem_phase2");

    let phaseIdx = 0;
    const nextWord = (): void => {
      if (phaseIdx >= BOSS_PHASE2_WORDS.length) {
        this.time.delayedCall(1000, () => this.startBossPhase3());
        return;
      }
      const word = BOSS_PHASE2_WORDS[phaseIdx];
      const target = this.makeWord({
        scene: this,
        word,
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        // BOSS_PHASE2_WORDS are all-caps — enforce case so the player
        // actually has to hold Shift.
        caseSensitive: true,
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
      "Its true name is a command turned on itself — half-spoken, half-SHOUTED. Type it as it reads.",
    );

    // The Command-Golem's true name is ONE mixed-case phrase (canon §5.5.8):
    // "stand" lowercase into "DOWN" capitalized — a single mid-phrase Shift-
    // switch the player must land, not two separate tokens. Repeated twice;
    // the second completion fells the boss. caseSensitive starts lowercase, so
    // the claim never captures Shift → completion routes through onComplete.
    let repeatCount = 0;
    const runSequence = (): void => {
      const target = this.makeWord({
        scene: this,
        word: "stand DOWN",
        x: this.bossContainer.x,
        y: this.bossContainer.y - 220,
        fontSize: 38,
        caseSensitive: true,
        burstColor: PALETTE_HEX.ember,
        onComplete: () => {
          playChime();
          this.cameras.main.flash(300, 220, 160, 20);
          this.cameras.main.shake(260, 0.006);
          repeatCount++;
          if (repeatCount >= 2) {
            this.time.delayedCall(600, () => this.bossDefeated());
          } else {
            this.setNarrator(
              "The command rings through the forge. Once more — finish it.",
            );
            this.time.delayedCall(1000, runSequence);
          }
        },
      });
      this.typingInput.register(target);
      this.activeTargets.push(target);
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

    // Quiet Lord fragment ~~Aga~~ — third realm of the accumulating word.
    // Once per playthrough.
    const alreadyRevealedForge =
      this.store.get().realms["clockwork-forge"]?.quietLordFragmentRevealed ?? false;
    if (!alreadyRevealedForge) {
      this.store.update((s) => {
        const realm = s.realms["clockwork-forge"];
        if (realm) realm.quietLordFragmentRevealed = true;
      });
      flashQuietLordFragment(this, { text: "Aga" });
    }
    // Almanac lore page 4 — the Command-Golem's name, stamped at defeat.
    this.store.update((s) => {
      if (!s.almanacLore.includes("the-command-golems-name")) {
        s.almanacLore.push("the-command-golems-name");
      }
    });

    this.narration.say("forge_command_golem_defeated");
    this.time.delayedCall(3200, () => this.startFork2());
  }

  // ─── Fork 2 ──────────────────────────────────────────────────────────────────

  private startFork2(): void {
    this.clearActiveTargets();
    this.setNarrator(
      "The Command-Golem lies still. What now? Type a choice.",
    );

    const peaceful = this.makeWord({
      scene: this,
      word: "give the peaceful order",
      x: this.scale.width / 2 - 400,
      y: this.scale.height - 320,
      fontSize: 32,
      frame: "banner",
      onComplete: () => {
        this.fork2Choice = "peaceful";
        this.startFork2PeacefulBranch();
      },
    });
    const fight = this.makeWord({
      scene: this,
      word: "fight to the end",
      x: this.scale.width / 2 + 400,
      y: this.scale.height - 320,
      fontSize: 32,
      frame: "banner",
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
    const standDown = this.makeWord({
      scene: this,
      word: "STAND DOWN",
      x: this.scale.width / 2,
      y: this.scale.height - 340,
      fontSize: 40,
      // The peaceful-branch finale demands the full capitalized order.
      caseSensitive: true,
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
    // Mixed-case command golems. Speed-axis director scales length + advance;
    // count stays at the narrated two ("Two more golems rise…").
    const minLength = this.director.wordLengthBias();
    const advanceMs = this.director.advanceMs(GOLEM_ADVANCE_MS * 0.75);
    const words = pickAdaptiveWords(
      FORGE_COMMAND_BANK,
      2,
      this.store.get().keyStats,
      minLength,
    );
    const slots = shuffle(FLOOR_SLOTS).slice(0, 2);
    this.golems = [];
    for (let i = 0; i < 2; i++) {
      const g = this.spawnAdvancingGolem(
        slots[i].x,
        slots[i].y,
        words[i],
        advanceMs,
        true,
      );
      this.golems.push(g);
    }

    this.beginCombatWave();
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
      const whistle = this.makeWord({
        scene: this,
        word: "whistle softly",
        x: this.scale.width / 2 - 340,
        y: this.scale.height - 320,
        fontSize: 32,
        frame: "banner",
        onComplete: () => this.awardSongbird(),
      });
      const leave = this.makeWord({
        scene: this,
        word: "leave it be",
        x: this.scale.width / 2 + 340,
        y: this.scale.height - 320,
        fontSize: 32,
        frame: "banner",
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
    this.narration.say("forge_truename_intro");

    const passages = [
      "the forge breathes.",
      "the brass remembers.",
      "its makers are remembered.",
    ];

    this.runPassageChain(passages, ["", "", ""], () => {
      // Almanac lore page 5 — the Forge's true name, stamped at the end of
      // the realm's true-name passage.
      this.store.update((s) => {
        if (!s.almanacLore.includes("the-forge-true-name")) {
          s.almanacLore.push("the-forge-true-name");
        }
      });
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
    showAlmanacStampCard(this, "the clockwork forge", onDone, { onReveal: playChime });
  }

  // ─── Golem spawning ───────────────────────────────────────────────────────────

  /** Spawn a static (non-advancing) tutorial golem. Returns the golem object. */
  private spawnStaticGolem(x: number, y: number, _isBoss: boolean): StaticGolem {
    const container = this.add.container(x, y);
    const sprite = this.drawGolemInto(container, false);
    this.idleBob(container);
    return { container, sprite };
  }

  /** Spawn a golem that advances toward Wren and can be defeated — now the shared
   *  MovingWordEnemy. The Forge keeps the body art (the eye it brightens on a
   *  command) and the consequence (onGolemComplete); the enemy owns the
   *  entrance / advance / knock-back / defeat lifecycle and the word target. */
  private spawnAdvancingGolem(
    x: number,
    y: number,
    word: string,
    advanceMs: number,
    isCapitalized: boolean,
  ): MovingWordEnemy {
    const startX = x < this.scale.width / 2 ? -120 : this.scale.width + 120;
    const container = this.add.container(startX, y);
    container.setAlpha(0);
    const sprite = this.drawGolemInto(container, false);

    return new MovingWordEnemy({
      scene: this,
      typingInput: this.typingInput,
      container,
      word,
      restX: x,
      restY: y,
      wrenX: this.scale.width / 2,
      advanceMs,
      advanceMult: this.combat.advanceMult,
      entranceMs: 700,
      knockbackMs: 600,
      knockbackPauseMs: 1200,
      dangerRampStart: DANGER_RAMP_START,
      anchorOffsetY: -100,
      fontSize: 32,
      // Forge-fire burst on completion — an "ember bloom" rather than brass.
      burstColor: PALETTE_HEX.ember,
      // Mixed-case command golems enforce case — the CAPITALIZED tail misses
      // unless typed with Shift, so Gregor's lesson ("Lowercase moves them.
      // CAPITALS command them.") is a real mid-word demand, not a VFX gate.
      caseSensitive: isCapitalized,
      outline: true,
      isWaveActive: () => this.waveActive,
      onTargetAttached: (t) => this.activeTargets.push(t),
      onTargetDetached: (t) => {
        const idx = this.activeTargets.indexOf(t);
        if (idx >= 0) this.activeTargets.splice(idx, 1);
      },
      onDefeated: () => playChime(),
      onReachWren: () => {
        // Golem retreats and tries again (no candle system in the Forge).
        this.cameras.main.shake(180, 0.004);
        playDamageThud();
        flashDamageVignette(this);
      },
      onComplete: (mods, self) =>
        this.onGolemComplete(self, sprite, isCapitalized, mods),
    });
  }

  /** Apply the Forge consequence after a player completes a golem's word. The
   *  shared MovingWordEnemy has already felled this golem and chimed; here we add
   *  the realm flourish, keyed on how the word was claimed:
   *   - Alt → chain-spark to the nearest live golem.
   *   - Shift, OR a mixed-case command finished with its required mid-word Shift
   *     (`isCapitalized` — the claim captured no Shift but finishing it demanded
   *     one) → the "command lands" flash (Gregor's lesson: CAPITALS command).
   *   - a plain lowercase nudge → the defeat alone. */
  private onGolemComplete(
    self: MovingWordEnemy,
    sprite: Phaser.GameObjects.Image,
    isCapitalized: boolean,
    mods: ClaimMods,
  ): void {
    if (mods.alt) {
      this.chainSpark(self);
    } else if (mods.spell || isCapitalized) {
      this.commandEffect(sprite);
    }
  }

  /** Alt-spell variant: chain spark. The Alt-claimed golem is already defeated by
   *  the shared enemy; the spark arcs to the nearest live golem and fells it too.
   *  If no other golems are alive, the spell is still a defeat — just no arc. */
  private chainSpark(self: MovingWordEnemy): void {
    // Spend the Soul this chain was armed against (canCast was checked when the
    // Alt-claim landed). The guard in spendSoul makes a stale arm a no-op.
    // spellCost folds in soul-thrift (bellows-hammer) so arm + spend agree.
    this.typingInput.getStats().spendSoul(this.spellCost);
    playSparkZap();
    const nearest = this.findNearestLiveGolem(self);
    if (!nearest) return;
    playChainSpark(
      this,
      self.container.x,
      self.restY - 80,
      nearest.container.x,
      nearest.restY - 80,
      PALETTE_HEX.brass,
    );
    // Brief delay before the chain target falls — gives the arc time to
    // visually land before the second defeat fires its own burst.
    this.time.delayedCall(140, () => {
      if (!nearest.isDefeated()) nearest.defeat();
    });
  }

  private findNearestLiveGolem(
    from: MovingWordEnemy,
  ): MovingWordEnemy | null {
    let best: MovingWordEnemy | null = null;
    let bestDist = Infinity;
    for (const g of this.golems) {
      if (g === from || g.isDefeated()) continue;
      const dx = g.container.x - from.container.x;
      const dy = g.container.y - from.container.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best;
  }

  /** Flash a golem sprite brass — the "command landed" tell (replaces the old
   *  eye-brighten now that golems are painted sprites). `persist` leaves the tint
   *  on (the boss stays commanded through phase 2); otherwise it clears shortly. */
  private flashGolemCommanded(
    sprite: Phaser.GameObjects.Image,
    persist = false,
  ): void {
    sprite.setTint(PALETTE_HEX.brass);
    if (!persist) this.time.delayedCall(220, () => sprite.clearTint());
  }

  /** Visual "command" effect when the player uses Shift on a golem — the camera
   *  flash and the golem flaring brass before the body falls. */
  private commandEffect(sprite: Phaser.GameObjects.Image): void {
    this.cameras.main.flash(180, 200, 140, 20);
    this.flashGolemCommanded(sprite);
  }

  /** Visual effect for tutorial golem head-turn. */
  private golemTurnHead(golem: StaticGolem): void {
    this.tweens.add({
      targets: golem.container,
      x: golem.container.x - 20,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /** Visual effect for full-command response. */
  private golemCommandFlash(golem: StaticGolem): void {
    this.cameras.main.flash(200, 200, 140, 20);
    this.flashGolemCommanded(golem.sprite);
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
      if (this.golems.length > 0 && this.golems.every((g) => g.isDefeated())) {
        this.waveActive = false;
        onClear();
      } else if (this.waveActive || this.golems.some((g) => !g.isDefeated())) {
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
      const target = this.makeWord({
        scene: this,
        word,
        x: this.scale.width / 2,
        y: this.scale.height - 340,
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
    // Ctrl+Shift+P: toggle purist mode from inside the realm.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }
    if (event.key === "Shift") {
      this.shiftHeld = true;
      return;
    }
    if (event.key === "Alt") {
      this.altHeld = true;
      // Browser default for Alt is to focus the menu bar — preventDefault
      // so Alt doesn't steal focus mid-spell.
      event.preventDefault();
      return;
    }
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key, {
      // Shift stays free: capitalized command golems are caseSensitive, so
      // holding Shift is *required typing*, not a bonus — gating it on Soul
      // could soft-lock a required golem when the meter is empty.
      spell: this.shiftHeld,
      // Alt is the chain-spark (a 2-for-1 bonus), so it costs Soul. When the
      // meter is dry the Alt-claim falls through to a normal defeat — no chain,
      // never a block. spellCost folds in soul-thrift (bellows-hammer).
      alt: this.altHeld && this.typingInput.getStats().canCast(this.spellCost),
    });
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = false;
    if (event.key === "Alt") this.altHeld = false;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private setNarrator(text: string): void {
    this.narration.sayRaw(text, { speakerName: null });
  }

  // ─── Tier 4 relic helpers ───────────────────────────────────────────────────

  /** Surface that the satchel is doing something here — once, briefly. The old
   *  version flashed every relic's line in sequence (a flood with a full satchel);
   *  the persistent loadout bar now shows WHAT you carry, so this is a single quiet
   *  beat. A lone relic still gets its own line. Empty loadout passes straight through. */
  private announceCombatLoadout(onDone: () => void): void {
    const lines = this.combat.announcements;
    if (lines.length === 0) {
      onDone();
      return;
    }
    this.setNarrator(
      lines.length === 1
        ? lines[0]!
        : "Your satchel stirs — its relics answer here.",
    );
    this.time.delayedCall(1900, onDone);
  }

  /** Per-combat-wave relic procs: re-arm forgive-wave-miss, pre-bank Soul
   *  (soul-banked / king-aurland — a spell head-start), and mark the easiest
   *  golem (auto-ease). Call at each golem-wave start. */
  private beginCombatWave(): void {
    this.waveForgivenessReady =
      this.combat.perWaveProcs.includes("forgive-wave-miss");
    this.typingInput.getStats().bankSoulFraction(this.combat.soulBankedFraction);
    this.applyAutoEase();
    this.applyCompanionTrip();
  }

  /** companion-trip (snow-fox-cub): a short while into each wave the fox darts in
   *  and trips the most-advanced golem (a stumble). No-op without the relic. */
  private applyCompanionTrip(): void {
    if (!this.combat.perWaveProcs.includes("companion-trip")) return;
    this.time.delayedCall(COMPANION_TRIP_DELAY_MS, () =>
      tripMostAdvancedFoe(this, this.golems),
    );
  }

  /** auto-ease (Etta's Ledger): glow the easiest (shortest-word) golem of the
   *  wave. Revisit-only in the Forge (Etta's Ledger is a later realm's relic).
   *  No-op without the relic or with no golems. */
  private applyAutoEase(): void {
    if (!this.combat.perWaveProcs.includes("auto-ease")) return;
    if (this.golems.length === 0) return;
    let easiest = this.golems[0]!;
    for (const g of this.golems) {
      if (g.word.length < easiest.word.length) easiest = g;
    }
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE_HEX.brass, 0.22);
    glow.fillEllipse(0, 0, 110, 150);
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
      .text(this.scale.width / 2, CATWALK_Y + 120, "forgiven", {
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

  /** The live, eligible golems summarised for an offensive one-shot's "strongest
   *  foe" pick. Only golems with an attached word are threats (during the entrance
   *  and between knock-backs they're mute); the boss isn't in `this.golems`, so
   *  its true-name challenge is excluded by construction. Progress is the
   *  horizontal close on Wren (the Forge advance is straight). */
  private liveGolemThreats(): OneShotThreat<MovingWordEnemy>[] {
    const threats: OneShotThreat<MovingWordEnemy>[] = [];
    for (const g of this.golems) {
      if (g.isDefeated() || g.isFrozen() || !g.target) continue;
      threats.push({
        enemy: g,
        progress: g.advanceProgress(),
        wordLength: g.word.length,
      });
    }
    return threats;
  }

  /** Run an offensive one-shot's consequence. The invoker has already picked the
   *  target(s), spent the Soul, and consumed the once-per-realm charge; the realm
   *  owns the kill/seize/freeze + VFX. The Forge only fires toll-strike forward;
   *  jam-foe / bind-beat arrive with the Sky / Wood migrations. */
  private applyOneShot(
    effect: OffensiveOneShot,
    targets: readonly MovingWordEnemy[],
  ): void {
    if (effect === "toll-strike") this.tollStrike(targets[0]);
  }

  /** toll-strike (bells-tongue): the bell's tongue rings and fells the strongest
   *  golem outright — a deep toll + an ember bloom where it stood. A programmatic
   *  defeat (like the chain-spark), so no command flourish, just the kill. */
  private tollStrike(target: MovingWordEnemy | undefined): void {
    if (!target || target.isDefeated()) return;
    playBellToll();
    playWordCompleteBurst(this, target.container.x, target.restY - 80, {
      color: PALETTE_HEX.ember,
      count: 16,
      radius: 60,
    });
    this.cameras.main.shake(160, 0.004);
    target.defeat();
  }

  /** UI-cohesion: every Forge word target goes through here so it picks up the
   *  legibility outline by default (TTT-style). Choices pass frame: "banner". */
  private makeWord(opts: TextWordTargetOptions): TextWordTarget {
    return new TextWordTarget({ outline: true, ...opts });
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
    // A suspended iron walkway for Wren to stand on. It needs real THICKNESS +
    // visible supports so Wren reads as standing on a structure, not floating —
    // but without the old bright brass railing + grating dashes that read as a UI
    // overlay across the painting.
    const g = this.add.graphics();
    const w = this.scale.width;
    const top = CATWALK_Y;
    // Support trusses descending toward the foundry floor (drawn first, so the
    // deck sits in front of them and they read as holding it up).
    g.fillStyle(0x191310, 1);
    for (const sx of [150, 470, 820, 1100, 1450, 1770]) {
      g.fillRect(sx, top + 34, 12, 150);
      g.fillRect(sx + 30, top + 34, 12, 150);
      // a cross-brace
      g.lineStyle(3, 0x191310, 1);
      g.beginPath();
      g.moveTo(sx + 6, top + 44);
      g.lineTo(sx + 36, top + 150);
      g.moveTo(sx + 36, top + 44);
      g.lineTo(sx + 6, top + 150);
      g.strokePath();
    }
    // Deck — a solid plate with thickness: top surface (where Wren stands), a
    // darker front face, a warm forge-lit top edge, and a dark underline.
    g.fillStyle(0x2a211b, 1); // front face / body
    g.fillRect(0, top, w, 34);
    g.fillStyle(0x3a2e24, 1); // top deck surface
    g.fillRect(0, top, w, 13);
    g.fillStyle(0x5a4632, 0.85); // warm top highlight edge
    g.fillRect(0, top, w, 3);
    g.fillStyle(0x120e0b, 1); // dark underline at the deck's bottom
    g.fillRect(0, top + 31, w, 3);
    // Soft cast shadow under the deck.
    g.fillStyle(0x000000, 0.3);
    g.fillRect(0, top + 34, w, 12);
  }

  private drawWren(x: number, y: number): void {
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 92, 18, { y: 6, alpha: 0.32 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    addIdleBreath(this, c, { dy: -3, durationMs: 1900 });
  }

  /** Add the painted golem sprite into a container, scaled to the old procedural
   *  body height so the word anchor + hit feel still line up. Returns the sprite
   *  so the command-flash can tint it brass. */
  private drawGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 132, 24, { y: 10, alpha: 0.42 }));
    const sprite = this.add.image(0, 0, "forge-golem");
    sprite.setScale(GOLEM_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
    return sprite;
  }

  /** Add the painted Command-Golem boss sprite (scaled to the procedural boss
   *  height; the ×1.8 container scales it up on screen). Returns it so phase 2
   *  can flash it "commanded". */
  private drawCommandGolemInto(
    c: Phaser.GameObjects.Container,
    _isBoss: boolean,
  ): Phaser.GameObjects.Image {
    c.add(addLocalGroundShadow(this, 164, 30, { y: 12, alpha: 0.46 }));
    const sprite = this.add.image(0, 0, "forge-command-golem");
    sprite.setScale(COMMAND_GOLEM_SPRITE_HEIGHT / sprite.height);
    c.add(sprite);
    return sprite;
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
