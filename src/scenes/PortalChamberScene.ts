import Phaser from "phaser";
import { type AmbientHandle, playAmbientHub } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { RELICS } from "../game/relics";
import type { SaveStore } from "../game/saveState";
import {
  currentUserDisplayName,
  signInWithGoogle,
  signOut,
  supabase,
} from "../game/supabaseClient";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import { isPuristToggleKey, togglePuristMode } from "../game/purist";
import {
  addAmbientDrift,
  addGroundShadow,
  addIdleBreath,
  addLocalGroundShadow,
} from "../game/livingScene";
import { preloadSatchelIcons, satchelIconFor } from "../game/ui/satchelIcons";
import { cornerTicks, UI_HEX } from "../game/ui/uiTheme";
import { bobWrenSprite, flashWrenMiss, makeWrenSprite, preloadWren, setWrenPose } from "../game/wren";
import hubBackdrop from "../../art/references/hub-portal-chamber-clean.png";
import portalActiveSheet from "../../art/portal/portal-active-sheet.png";
import runaSprite from "../../art/runa/runa-front.png";

interface ChamberSceneData {
  store: SaveStore;
}

type Zone = "portals" | "desk" | "shelf";

interface ArchSpec {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly baseY: number;
  readonly label: string;
  readonly sceneKey: string;
}

// Geometry maps each arch onto a painted opening in the hub backdrop art.
// width/height/baseY describe the portal-surface fill drawn inside the
// painted stone frame (no programmatic surround).
// Painted arch positions in the hub-portal-chamber-clean backdrop, measured
// from the source 1672×941 image scaled to the 1920×1080 game canvas.
// width × height ≈ painted arch silhouette so the portal sprite fills the
// painted stone frame instead of floating inside it.
const ARCHES: readonly ArchSpec[] = [
  { id: "winter-mountain", x: 655,  width: 280, height: 360, baseY: 680, label: "Winter Mountain", sceneKey: "WinterMountainScene"  },
  { id: "sunken-bell",     x: 913,  width: 280, height: 360, baseY: 680, label: "Sunken Bell",     sceneKey: "SunkenBellScene"      },
  { id: "clockwork-forge", x: 1147, width: 280, height: 360, baseY: 680, label: "Clockwork Forge", sceneKey: "ClockworkForgeScene"   },
  { id: "sky-island",      x: 1381, width: 280, height: 360, baseY: 680, label: "Sky Island",      sceneKey: "SkyIslandScene"        },
  { id: "haunted-wood",    x: 1638, width: 280, height: 360, baseY: 680, label: "Haunted Wood",    sceneKey: "HauntedWoodScene"      },
] as const;

const REALM_SEQUENCE = ARCHES.map((a) => a.id);

// Wren's X position when standing in each zone — aligned to the painted
// desk (left), portal floor (centre) and display cabinet (right).
const ZONE_X: Record<Zone, number> = {
  desk:    330,
  portals: 990,
  shelf:   1660,
};
const WREN_Y = 900;

// Maps the last-cleared realm to its Runa desk-line ID in runaLines.ts. The
// line text now lives there (single source of truth); the hub renders it via
// narration.say(id) as the top caption, voice-ready like every other scene.
const DESK_LINE_IDS: Record<string, string> = {
  none:              "hub_desk_none",
  "winter-mountain": "hub_desk_winter",
  "sunken-bell":     "hub_desk_sunken",
  "clockwork-forge": "hub_desk_forge",
  "sky-island":      "hub_desk_sky",
  "haunted-wood":    "hub_desk_wood",
};

export class PortalChamberScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private archGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private archSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private hintPlate!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private narration!: NarrationManager;
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  private zoneTargets: TextWordTarget[] = [];
  private ambientHandle?: AmbientHandle;

  constructor() {
    super("PortalChamberScene");
  }

  init(data: ChamberSceneData): void {
    this.store = data.store;
    this.archGraphics = new Map();
    this.archSprites = new Map();
    this.zoneTargets = [];
  }

  preload(): void {
    this.load.image("hub-backdrop", hubBackdrop);
    this.load.image("runa-sprite", runaSprite);
    preloadSatchelIcons(this, this.store.get().satchel ?? []);
    // 8-frame portal swirl, re-aligned by scripts/key_portal_sheet.py so each
    // frame's arch sits at the exact same x/y within its cell — no slide
    // when cycling.
    this.load.spritesheet("portal-active", portalActiveSheet, {
      frameWidth: 168,
      frameHeight: 338,
    });
    preloadWren(this);
  }

  create(): void {
    // Redirect first-time players to the opening cinematic.
    if (!this.store.get().typewriterAwakened) {
      this.scene.start("OpeningScene", { store: this.store });
      return;
    }

    if (!this.anims.exists("portal-spin")) {
      this.anims.create({
        key: "portal-spin",
        frames: this.anims.generateFrameNumbers("portal-active", { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.drawRoom();
    this.drawRuna();
    this.drawDisplayShelf();
    for (const arch of ARCHES) {
      this.drawArch(arch);
    }
    this.updateAllArchAppearances();
    this.drawArchLabels();

    this.wrenContainer = this.drawWren(ZONE_X.portals, WREN_Y);

    this.hintPlate = this.add.graphics().setDepth(24);
    this.hint = this.add
      .text(this.scale.width / 2, this.scale.height - 42, "", {
        fontFamily: SERIF,
        fontSize: "20px",
        color: "#c9b98e",
        align: "center",
        wordWrap: { width: 1200 },
      })
      .setOrigin(0.5)
      .setDepth(25);

    // Runa's narration — the shared top caption every other scene uses. The
    // hub's Runa-narrator beats (arrival, desk reflections, the endgame calls)
    // route through say(id); say() is the voice hook when audio lands. The
    // bottom `hint` above keeps only the functional prompts (arch name, shelf).
    this.narration = new NarrationManager(this, { y: 150, framed: true });

    // Fragment display — shows the accumulating Quiet Lord word in the upper-
    // centre of the room, growing one letter per realm cleared.
    this.drawFragment();

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.ambientHandle?.stop();
    });

    this.ambientHandle = playAmbientHub();

    // Persistent (non-zone) targets.
    this.addAlmanacTarget();
    void this.addAuthTarget();

    // Enter the portals zone initially.
    this.enterZone("portals", false);

    // Auth mid-session changes restart the scene so all state re-renders cleanly.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        this.scene.start("TitleScene");
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      subscription.subscription.unsubscribe(),
    );
  }

  // ─── Zone system ──────────────────────────────────────────────────────────

  private enterZone(zone: Zone, animate = true): void {
    this.clearZoneTargets();
    this.walkWrenTo(ZONE_X[zone], animate);

    if (zone === "portals") this.registerPortalZoneTargets();
    if (zone === "desk")    this.registerDeskZoneTargets();
    if (zone === "shelf")   this.registerShelfZoneTargets();
  }

  private clearZoneTargets(): void {
    for (const t of this.zoneTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.zoneTargets = [];
  }

  private walkWrenTo(targetX: number, animate: boolean): void {
    this.tweens.killTweensOf(this.wrenContainer);
    if (!animate || targetX === this.wrenContainer.x) {
      this.wrenContainer.x = targetX;
      setWrenPose(this.wrenSprite, "front");
      addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2100 });
      return;
    }
    setWrenPose(this.wrenSprite, "walk", targetX < this.wrenContainer.x);
    this.tweens.add({
      targets: this.wrenContainer,
      x: targetX,
      duration: 600,
      ease: "Sine.easeInOut",
      onComplete: () => {
        setWrenPose(this.wrenSprite, "front");
        addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2100 });
      },
    });
  }

  // ─── Portal zone ──────────────────────────────────────────────────────────

  private registerPortalZoneTargets(): void {
    const state = this.store.get();
    const firstUnclearedIdx = REALM_SEQUENCE.findIndex(
      (id) => !state.realms[id]?.cleared,
    );
    // Index of the first realm that is both unlocked (previous cleared) and
    // not yet cleared itself.
    const nextAvailableIdx = firstUnclearedIdx === -1
      ? REALM_SEQUENCE.length       // all cleared
      : firstUnclearedIdx;

    if (nextAvailableIdx < REALM_SEQUENCE.length) {
      // Primary portal target — next uncompleted realm.
      const arch = ARCHES[nextAvailableIdx];
      const primary = new TextWordTarget({
        scene: this,
        word: arch.label,
        x: arch.x,
        y: archTargetY(nextAvailableIdx),
        fontSize: 30,
        outline: true,
        onComplete: () => this.onEnterPortal(arch.sceneKey, false),
      });
      this.typingInput.register(primary);
      this.zoneTargets.push(primary);
      this.setHint("type the glowing arch's name to step through  ·  backspace to cancel");
      // First-arrival narration — only while nothing is cleared yet (the
      // "you're new here" state). On returns the desk reflections carry Runa.
      if (!REALM_SEQUENCE.some((id) => state.realms[id]?.cleared)) {
        this.narration.say("hub_first_arrival");
      } else {
        this.narration.clear();
      }
    } else {
      const battleCleared = !!state.realms["great-battle"]?.cleared;

      if (!battleCleared) {
        // All five realms cleared — show the final battle target.
        const battleTarget = new TextWordTarget({
          scene: this,
          word: "defend hearthward",
          x: this.scale.width / 2,
          y: 460,
          fontSize: 42,
          outline: true,
          frame: "banner",
          onComplete: () => {
            this.cameras.main.fadeOut(600, 10, 8, 15);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
              this.scene.start("GreatBattleScene", { store: this.store });
            });
          },
        });
        this.typingInput.register(battleTarget);
        this.zoneTargets.push(battleTarget);
        this.narration.say("hub_all_cleared");
        this.setHint("");
      } else {
        // Battle cleared — show begin again target (New Game+).
        const ngPlusTarget = new TextWordTarget({
          scene: this,
          word: "begin again",
          x: this.scale.width / 2,
          y: 460,
          fontSize: 38,
          outline: true,
          frame: "banner",
          onComplete: () => this.startNewGame(),
        });
        this.typingInput.register(ngPlusTarget);
        this.zoneTargets.push(ngPlusTarget);
        this.narration.say("hub_post_battle");
        this.setHint("");
      }
    }

    // Secondary targets — all cleared realms are revisitable at lower priority.
    for (let i = 0; i < nextAvailableIdx; i++) {
      const arch = ARCHES[i];
      const revisit = new TextWordTarget({
        scene: this,
        word: arch.label,
        x: arch.x,
        y: archTargetY(i),
        fontSize: 22,
        priority: -1,
        outline: true,
        onComplete: () => this.onEnterPortal(arch.sceneKey, true),
      });
      this.typingInput.register(revisit);
      this.zoneTargets.push(revisit);
    }

    // Zone navigation (away from portals).
    this.registerNavTarget("runa", 420, 908, () => this.enterZone("desk"));
    this.registerNavTarget("shelf", 1740, 930, () => this.enterZone("shelf"));
    // Settings entry — small chrome-y target in the upper-right corner so it
    // stays out of the main portal sight-lines but is discoverable.
    this.registerNavTarget("settings", 1812, 72, () => this.enterSettings(), { fontSize: 22 });
  }

  private enterSettings(): void {
    this.cameras.main.fadeOut(400, 10, 8, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start("SettingsScene", { store: this.store });
      },
    );
  }

  // ─── Desk zone ────────────────────────────────────────────────────────────

  private registerDeskZoneTargets(): void {
    const state = this.store.get();
    const lastCleared = [...REALM_SEQUENCE]
      .reverse()
      .find((id) => state.realms[id]?.cleared) ?? "none";
    this.narration.say(DESK_LINE_IDS[lastCleared] ?? DESK_LINE_IDS["none"]);
    this.setHint("");

    this.registerNavTarget("back", 640, 908, () =>
      this.enterZone("portals"),
    );
  }

  // ─── Shelf zone ───────────────────────────────────────────────────────────

  private registerShelfZoneTargets(): void {
    const state = this.store.get();
    const items = state.satchel;
    // Shelf is a functional zone — clear Runa's top caption.
    this.narration.clear();

    if (items.length === 0) {
      this.setHint("your shelf is empty. bring something back from a realm.");
    } else {
      const names = items
        .map((id) => RELICS[id]?.name ?? id)
        .join(" · ");
      this.setHint(`on your shelf: ${names}`);
    }

    this.registerNavTarget("back", 1520, 930, () =>
      this.enterZone("portals"),
    );
  }

  // ─── Navigation target helper ─────────────────────────────────────────────

  private drawFragment(): void {
    const full = this.buildFragment();
    if (!full) return;

    const isFinal = full === "Again.";
    const t = this.add
      .text(this.scale.width / 2, 52, "", {
        fontFamily: SERIF,
        fontSize: isFinal ? "40px" : "34px",
        color: isFinal ? PALETTE.brass : "#7a5cba",
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    let revealed = 0;
    const revealNext = (): void => {
      revealed++;
      t.setText(full.slice(0, revealed));
      const isLast = revealed === full.length;

      if (isLast) {
        t.setAlpha(1);
        this.tweens.add({
          targets: t,
          alpha: isFinal ? 0.9 : 0.6,
          duration: 700,
          ease: "Sine.easeOut",
        });
        if (isFinal) {
          this.time.delayedCall(800, () => {
            this.tweens.add({
              targets: t,
              alpha: { from: 0.9, to: 0.4 },
              duration: 2400,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          });
        }
      } else {
        t.setAlpha(0.5);
        this.time.delayedCall(120, revealNext);
      }
    };

    this.time.delayedCall(500, revealNext);
  }

  /** Returns the current state of the accumulating Quiet Lord fragment.
   *  Each cleared realm reveals one more letter: A→Ag→Aga→Agai→Again→Again. */
  private buildFragment(): string {
    const REALMS = ["winter-mountain", "sunken-bell", "clockwork-forge", "sky-island", "haunted-wood"] as const;
    const LETTERS = ["A", "Ag", "Aga", "Agai", "Again", "Again."];
    const state = this.store.get();
    const cleared = REALMS.filter((id) => state.realms[id]?.cleared).length;
    if (cleared === 0) return "";
    if (cleared >= 5 && state.realms["great-battle"]?.cleared) return "Again.";
    return LETTERS[Math.min(cleared, LETTERS.length - 1)];
  }

  private registerNavTarget(
    word: string,
    x: number,
    y: number,
    onComplete: () => void,
    opts: { fontSize?: number; priority?: number } = {},
  ): void {
    const t = new TextWordTarget({
      scene: this,
      word,
      x,
      y,
      fontSize: opts.fontSize ?? 26,
      priority: opts.priority ?? -2,
      outline: true,
      frame: "banner",
      onComplete,
    });
    this.typingInput.register(t);
    this.zoneTargets.push(t);
  }

  // ─── Portal entry ─────────────────────────────────────────────────────────

  private onEnterPortal(sceneKey: string, revisit: boolean): void {
    playChime();
    this.setHint("");
    this.narration.clear();
    this.cameras.main.fadeOut(500, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start(sceneKey, { store: this.store, revisit });
      },
    );
  }

  // ─── Persistent targets ───────────────────────────────────────────────────

  private addAlmanacTarget(): void {
    const target = new TextWordTarget({
      scene: this,
      word: "almanac",
      x: 230,
      y: 1030,
      fontSize: 24,
      priority: -1,
      outline: true,
      frame: "banner",
      onComplete: () => this.openAlmanac(),
    });
    this.typingInput.register(target);
  }

  private async addAuthTarget(): Promise<void> {
    const name = await currentUserDisplayName();
    if (name) {
      this.add
        .text(1812, 44, `signed in as ${name}`, {
          fontFamily: SERIF,
          fontSize: "15px",
          fontStyle: "italic",
          color: "#9d8f6d",
          align: "center",
          wordWrap: { width: 188 },
        })
        .setOrigin(0.5);
      const target = new TextWordTarget({
        scene: this,
        word: "sign out",
        x: 1812,
        y: 86,
        fontSize: 20,
        priority: -1,
        outline: true,
        frame: "banner",
        onComplete: () => void signOut(),
      });
      this.typingInput.register(target);
    } else {
      this.add
        .text(1812, 44, "local save only", {
          fontFamily: SERIF,
          fontSize: "15px",
          fontStyle: "italic",
          color: "#9d8f6d",
          align: "center",
          wordWrap: { width: 188 },
        })
        .setOrigin(0.5);
      const target = new TextWordTarget({
        scene: this,
        word: "sign in",
        x: 1812,
        y: 86,
        fontSize: 20,
        priority: -1,
        outline: true,
        frame: "banner",
        onComplete: () => void signInWithGoogle(window.location.href),
      });
      this.typingInput.register(target);
    }
  }

  private openAlmanac(): void {
    playChime();
    this.cameras.main.fadeOut(350, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => this.scene.start("AlmanacScene", { store: this.store }),
    );
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode from the hub too.
    if (isPuristToggleKey(event)) {
      togglePuristMode(this, this.store);
      return;
    }
    if (event.key.length === 1 || event.key === " ") playClack();
    this.typingInput.handleChar(event.key);
  }

  // ─── Arch appearance ──────────────────────────────────────────────────────

  private updateAllArchAppearances(): void {
    const state = this.store.get();
    const firstUnclearedIdx = REALM_SEQUENCE.findIndex(
      (id) => !state.realms[id]?.cleared,
    );
    const nextIdx = firstUnclearedIdx === -1 ? REALM_SEQUENCE.length : firstUnclearedIdx;

    ARCHES.forEach((arch, i) => {
      const isNext    = i === nextIdx;
      const isCleared = state.realms[arch.id]?.cleared === true;
      const isLocked  = i > nextIdx;
      this.renderArch(arch, isNext ? "next" : isCleared ? "cleared" : isLocked ? "locked" : "dark");
    });
  }

  private drawArch(spec: ArchSpec): void {
    // Graphics for the warm-amber cleared-realm ring (static).
    const g = this.add.graphics();
    this.archGraphics.set(spec.id, g);

    // Painted portal sprite — 168x338 frames, arch fills the frame top to
    // bottom. Anchored bottom-center on the painted arch bottom (baseY).
    // The painted hub arches are wide-and-short (≈220×290) while the source
    // swirl is narrow-and-tall (168×338, aspect 1:2), so we scale non-
    // uniformly: x to match arch width, y to match arch height.
    const sprite = this.add
      .sprite(spec.x, spec.baseY, "portal-active", 0)
      .setOrigin(0.5, 1)
      .setVisible(false);
    sprite.setScale(spec.width / 168, spec.height / 338);
    this.archSprites.set(spec.id, sprite);
  }

  private renderArch(
    spec: ArchSpec,
    state: "next" | "cleared" | "dark" | "locked",
  ): void {
    const g = this.archGraphics.get(spec.id);
    const sprite = this.archSprites.get(spec.id);
    if (!g || !sprite) return;
    g.clear();

    if (state === "locked" || state === "dark") {
      sprite.setVisible(false);
      if (sprite.anims.isPlaying) sprite.stop();
      return;
    }

    if (state === "cleared") {
      // Warm amber ring under the painted arch — revisitable cue.
      const archMidY = spec.baseY - spec.height + spec.width / 2;
      const radius = spec.width / 2;
      g.lineStyle(2, PALETTE_HEX.brass, 0.35);
      g.beginPath();
      g.arc(spec.x, archMidY + 60, radius * 0.55, 0, Math.PI * 2);
      g.strokePath();
      sprite.setVisible(true);
      sprite.setTint(PALETTE_HEX.brass);
      sprite.setAlpha(0.55);
      if (!sprite.anims.isPlaying) sprite.play("portal-spin");
      return;
    }

    // state === "next": full-strength painted swirl, animated.
    sprite.setVisible(true);
    sprite.clearTint();
    sprite.setAlpha(1);
    if (!sprite.anims.isPlaying) sprite.play("portal-spin");
  }

  private drawArchLabels(): void {
    const state = this.store.get();
    const firstUnclearedIdx = REALM_SEQUENCE.findIndex(
      (id) => !state.realms[id]?.cleared,
    );
    const nextIdx = firstUnclearedIdx === -1 ? REALM_SEQUENCE.length : firstUnclearedIdx;

    ARCHES.forEach((arch, i) => {
      if (!arch.label) return;
      const isNext    = i === nextIdx;
      const isCleared = state.realms[arch.id]?.cleared === true;
      const isLocked  = i > nextIdx;

      // For active and cleared arches the typing target above already shows
      // the realm name — skip the under-arch label so it doesn't appear twice.
      // Locked arches have no typing target, so they keep their name.
      if (!isNext && !isCleared) {
        this.add
          .text(arch.x, arch.baseY + 30, arch.label, {
            fontFamily: SERIF,
            fontSize: "22px",
            fontStyle: "italic",
            color: isLocked ? "#3a3550" : PALETTE.dim,
          })
          .setOrigin(0.5);
      }

      // Status row sits 30px below where the name would be — or 30px below
      // the arch baseY when the name is suppressed.
      const statusY = !isNext && !isCleared ? arch.baseY + 58 : arch.baseY + 32;
      if (isCleared) {
        this.add
          .text(arch.x, statusY, "✓ stamped", {
            fontFamily: SERIF,
            fontSize: "17px",
            color: PALETTE.brass,
          })
          .setOrigin(0.5);
      } else if (isLocked) {
        this.add
          .text(arch.x, statusY, "sealed", {
            fontFamily: SERIF,
            fontSize: "17px",
            color: "#3a3550",
          })
          .setOrigin(0.5);
      }
    });
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawRoom(): void {
    this.add
      .image(0, 0, "hub-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addAmbientDrift(this, {
      kind: "mote",
      count: 34,
      depth: -3,
      area: { x: 80, y: 90, width: this.scale.width - 160, height: 780 },
      alpha: 0.2,
      minSize: 1.5,
      maxSize: 4,
      driftX: 54,
      driftY: -95,
      minDurationMs: 8000,
      maxDurationMs: 15000,
    });

    this.drawHubStations();
  }

  private drawHubStations(): void {
    this.drawStationPlaque(420, 956, 300, 52, "runa's desk");
    this.drawStationPlaque(230, 1030, 230, 44, "almanac", { alpha: 0.28, labelAlpha: 0 });
    this.drawStationPlaque(this.scale.width / 2, 962, 330, 46, "portal floor", { alpha: 0.22 });
    this.drawStationPlaque(1740, 978, 290, 52, "your shelf");
    this.drawStationPlaque(1812, 72, 218, 82, "account", { alpha: 0.24, labelAlpha: 0 });
  }

  private drawStationPlaque(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    opts: { alpha?: number; labelAlpha?: number } = {},
  ): void {
    const alpha = opts.alpha ?? 0.34;
    const g = this.add.graphics().setDepth(-2);
    g.fillStyle(UI_HEX.panel, alpha);
    g.fillRoundedRect(x - width / 2, y - height / 2, width, height, 8);
    g.lineStyle(1, UI_HEX.brass, alpha + 0.14);
    g.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 8);

    cornerTicks(this, width, height, { inset: 5, size: 8, width: 1 })
      .setPosition(x, y)
      .setAlpha(Math.min(0.6, alpha + 0.12))
      .setDepth(-1.9);

    if ((opts.labelAlpha ?? 0.72) <= 0) return;
    this.add
      .text(x, y - height / 2 + 9, label, {
        fontFamily: SERIF,
        fontSize: "15px",
        fontStyle: "italic",
        color: "#8f8161",
      })
      .setOrigin(0.5)
      .setAlpha(opts.labelAlpha ?? 0.72)
      .setDepth(-1.8);
  }

  private setHint(text: string): void {
    this.hint.setText(text);
    this.hintPlate.clear();
    if (!text) return;

    const width = Math.min(1260, Math.max(420, this.hint.width + 70));
    const height = Math.max(42, this.hint.height + 18);
    const x = this.hint.x - width / 2;
    const y = this.hint.y - height / 2;
    this.hintPlate.fillStyle(UI_HEX.panel, 0.72);
    this.hintPlate.fillRoundedRect(x, y, width, height, 8);
    this.hintPlate.lineStyle(1, UI_HEX.brass, 0.64);
    this.hintPlate.strokeRoundedRect(x, y, width, height, 8);
  }

  /** Painted Runa stands at her desk on the far left of the hub. */
  private drawRuna(): void {
    addGroundShadow(this, 420, 982, 170, 26, { depth: -1, alpha: 0.34 });
    const img = this.add
      .image(420, 975, "runa-sprite")
      .setOrigin(0.5, 1);
    img.setScale(360 / img.height);
    addIdleBreath(this, img, { dy: -4, durationMs: 2200, delayMs: 300 });
  }

  /** Relic icons displayed on the painted cabinet shelves (far right). */
  private drawDisplayShelf(): void {
    const items = this.store.get().satchel;

    if (items.length === 0) {
      this.add
        .text(1740, 535, "nothing yet", {
          fontFamily: SERIF,
          fontSize: "17px",
          fontStyle: "italic",
          color: "#3a3550",
        })
        .setOrigin(0.5);
      return;
    }

    items.forEach((id, i) => {
      const ix = 1702 + (i % 3) * 40;
      const iy = 470 + Math.floor(i / 3) * 90;
      const icon = satchelIconFor(id);
      if (icon && this.textures.exists(icon.key)) {
        const img = this.add.image(ix, iy, icon.key);
        img.setScale(Math.min(34 / img.width, 34 / img.height));
        img.setAlpha(0.86);
        addIdleBreath(this, img, {
          dy: -2,
          durationMs: 1800 + (i % 3) * 180,
          delayMs: i * 70,
        });
        return;
      }
      if (!RELICS[id]) return;
      const fallback = this.add.graphics();
      fallback.fillStyle(PALETTE_HEX.brass, 0.8);
      fallback.fillEllipse(ix, iy, 18, 26);
    });
  }

  // ─── Wren character ───────────────────────────────────────────────────────

  // ─── New Game+ ────────────────────────────────────────────────────────────

  private startNewGame(): void {
    // Preserve keystroke calibration so adaptive word selection carries over.
    const oldStats = this.store.get().keyStats;
    const oldName = this.store.get().profileName;
    this.store.update((s) => {
      // Reset everything...
      s.typewriterAwakened = false;
      s.realms = {};
      s.satchel = [];
      s.almanacLore = [];
      // ...but keep the player's identity and typing stats
      s.profileName = oldName;
      s.keyStats = oldStats;
    });
    this.cameras.main.fadeOut(700, 10, 8, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("OpeningScene", { store: this.store });
    });
  }

  // ─── Wren character ───────────────────────────────────────────────────────

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 94, 22, { y: 6, alpha: 0.32 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    addIdleBreath(this, c, { dy: -4, durationMs: 2100 });
    return c;
  }
}

// Stagger arch typing-target Y positions so adjacent labels don't overlap.
// Odd-indexed arches sit slightly higher than even-indexed ones.
function archTargetY(archIndex: number): number {
  const BASE_Y = 705; // arch.baseY
  const HEIGHT = 265; // arch.height
  const base = BASE_Y - HEIGHT - 50;
  return archIndex % 2 === 0 ? base : base - 36;
}
