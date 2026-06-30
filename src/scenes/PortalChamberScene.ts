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

interface StationSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
const SHELF_GRID = {
  cols: 5,
  startX: 1648,
  startY: 448,
  colGap: 46,
  rowGap: 56,
  tileSize: 40,
  iconSize: 30,
} as const;
const ACCOUNT_PANEL = {
  x: 1812,
  y: 84,
  width: 220,
  height: 126,
  statusY: 38,
  authY: 82,
  settingsY: 128,
} as const;
const HUB_STATIONS = {
  desk: { x: 420, y: 956, width: 300, height: 52 },
  almanac: { x: 230, y: 1030, width: 230, height: 44 },
  portalFloor: { x: 960, y: 962, width: 330, height: 46 },
  shelf: { x: 1740, y: 978, width: 290, height: 52 },
  account: {
    x: ACCOUNT_PANEL.x,
    y: ACCOUNT_PANEL.y,
    width: ACCOUNT_PANEL.width,
    height: ACCOUNT_PANEL.height,
  },
} as const;

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
  private archGlows = new Map<string, Phaser.GameObjects.Graphics>();
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
    this.archGlows = new Map();
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
            this.pulseStation(HUB_STATIONS.portalFloor);
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
          onComplete: () => {
            this.pulseStation(HUB_STATIONS.portalFloor);
            this.startNewGame();
          },
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
    this.registerNavTarget("runa", 420, 908, () => this.enterZone("desk"), {
      stationPulse: HUB_STATIONS.desk,
    });
    this.registerNavTarget("shelf", 1740, 930, () => this.enterZone("shelf"), {
      stationPulse: HUB_STATIONS.shelf,
    });
    // Settings lives in the account plaque, separated from sign-in/out so the
    // top-right controls read as a deliberate station instead of overlapping UI.
    this.registerNavTarget(
      "settings",
      ACCOUNT_PANEL.x,
      ACCOUNT_PANEL.settingsY,
      () => this.enterSettings(),
      {
        fontSize: 19,
        stationPulse: HUB_STATIONS.account,
      },
    );
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

    this.registerNavTarget(
      "back",
      640,
      908,
      () => this.enterZone("portals"),
      { stationPulse: HUB_STATIONS.portalFloor },
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

    this.registerNavTarget(
      "back",
      1520,
      930,
      () => this.enterZone("portals"),
      { stationPulse: HUB_STATIONS.portalFloor },
    );
  }

  // ─── Navigation target helper ─────────────────────────────────────────────

  private drawFragment(): void {
    const full = this.buildFragment();
    if (!full) return;

    const isFinal = full === "Again.";
    const plate = this.add.graphics().setDepth(0).setAlpha(0);
    const plateWidth = isFinal ? 190 : 154;
    const plateHeight = 54;
    const t = this.add
      .text(this.scale.width / 2, 52, "", {
        fontFamily: SERIF,
        fontSize: isFinal ? "40px" : "34px",
        color: isFinal ? PALETTE.brass : "#7a5cba",
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(1);
    this.drawFragmentPlate(plate, t.x, t.y, plateWidth, plateHeight, isFinal);

    let revealed = 0;
    const revealNext = (): void => {
      revealed++;
      t.setText(full.slice(0, revealed));
      const isLast = revealed === full.length;

      if (isLast) {
        t.setAlpha(1);
        this.tweens.add({
          targets: [t, plate],
          alpha: isFinal ? 0.9 : 0.6,
          duration: 700,
          ease: "Sine.easeOut",
        });
        if (isFinal) {
          this.time.delayedCall(800, () => {
            this.tweens.add({
              targets: [t, plate],
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
        plate.setAlpha(0.36);
        this.time.delayedCall(120, revealNext);
      }
    };

    this.time.delayedCall(500, revealNext);
  }

  private drawFragmentPlate(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    isFinal: boolean,
  ): void {
    g.clear();
    const left = x - width / 2;
    const top = y - height / 2;
    const stroke = isFinal ? UI_HEX.brass : 0x7a5cba;
    g.fillStyle(UI_HEX.panel, isFinal ? 0.48 : 0.34);
    g.fillRoundedRect(left, top, width, height, 8);
    g.lineStyle(1, stroke, isFinal ? 0.62 : 0.42);
    g.strokeRoundedRect(left, top, width, height, 8);
    g.lineStyle(2, stroke, isFinal ? 0.72 : 0.48);
    const inset = 9;
    const tick = 13;
    g.lineBetween(left + inset, top + inset, left + inset + tick, top + inset);
    g.lineBetween(left + inset, top + inset, left + inset, top + inset + tick);
    g.lineBetween(left + width - inset, top + inset, left + width - inset - tick, top + inset);
    g.lineBetween(left + width - inset, top + inset, left + width - inset, top + inset + tick);
    g.lineBetween(left + inset, top + height - inset, left + inset + tick, top + height - inset);
    g.lineBetween(left + inset, top + height - inset, left + inset, top + height - inset - tick);
    g.lineBetween(left + width - inset, top + height - inset, left + width - inset - tick, top + height - inset);
    g.lineBetween(left + width - inset, top + height - inset, left + width - inset, top + height - inset - tick);
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
    opts: { fontSize?: number; priority?: number; stationPulse?: StationSpec } = {},
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
      onComplete: () => {
        if (opts.stationPulse) this.pulseStation(opts.stationPulse);
        onComplete();
      },
    });
    this.typingInput.register(t);
    this.zoneTargets.push(t);
  }

  // ─── Portal entry ─────────────────────────────────────────────────────────

  private onEnterPortal(sceneKey: string, revisit: boolean): void {
    playChime();
    this.setHint("");
    this.narration.clear();
    this.flashPortalForScene(sceneKey);
    this.time.delayedCall(140, () => {
      this.cameras.main.fadeOut(500, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(sceneKey, { store: this.store, revisit });
        },
      );
    });
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
      onComplete: () => {
        this.pulseStation(HUB_STATIONS.almanac);
        this.openAlmanac();
      },
    });
    this.typingInput.register(target);
  }

  private async addAuthTarget(): Promise<void> {
    const name = await currentUserDisplayName();
    if (name) {
      this.add
        .text(ACCOUNT_PANEL.x, ACCOUNT_PANEL.statusY, `signed in as ${name}`, {
          fontFamily: SERIF,
          fontSize: "15px",
          fontStyle: "italic",
          color: "#9d8f6d",
          align: "center",
          wordWrap: { width: ACCOUNT_PANEL.width - 30 },
        })
        .setOrigin(0.5)
        .setDepth(1);
      const target = new TextWordTarget({
        scene: this,
        word: "sign out",
        x: ACCOUNT_PANEL.x,
        y: ACCOUNT_PANEL.authY,
        fontSize: 20,
        priority: -1,
        outline: true,
        frame: "banner",
        onComplete: () => {
          this.pulseStation(HUB_STATIONS.account);
          void signOut();
        },
      });
      this.typingInput.register(target);
    } else {
      this.add
        .text(ACCOUNT_PANEL.x, ACCOUNT_PANEL.statusY, "local save only", {
          fontFamily: SERIF,
          fontSize: "15px",
          fontStyle: "italic",
          color: "#9d8f6d",
          align: "center",
          wordWrap: { width: ACCOUNT_PANEL.width - 30 },
        })
        .setOrigin(0.5)
        .setDepth(1);
      const target = new TextWordTarget({
        scene: this,
        word: "sign in",
        x: ACCOUNT_PANEL.x,
        y: ACCOUNT_PANEL.authY,
        fontSize: 20,
        priority: -1,
        outline: true,
        frame: "banner",
        onComplete: () => {
          this.pulseStation(HUB_STATIONS.account);
          void signInWithGoogle(window.location.href);
        },
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
    const g = this.add.graphics().setDepth(-4);
    this.archGraphics.set(spec.id, g);

    // A living glow inside the painted arch. The sprite carries the actual
    // portal sheet; this soft aperture makes the arch breathe even in still
    // screenshots and reads as world light rather than UI chrome.
    const glow = this.add
      .graphics()
      .setPosition(spec.x, spec.baseY - spec.height / 2 + 34)
      .setDepth(-6)
      .setVisible(false)
      .setAlpha(0.2);
    this.archGlows.set(spec.id, glow);
    const stagger = ARCHES.findIndex((a) => a.id === spec.id) * 130;
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.36 },
      scaleX: { from: 0.97, to: 1.04 },
      scaleY: { from: 0.98, to: 1.03 },
      duration: 1900 + stagger,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Painted portal sprite — 168x338 frames, arch fills the frame top to
    // bottom. Anchored bottom-center on the painted arch bottom (baseY).
    // The painted hub arches are wide-and-short (≈220×290) while the source
    // swirl is narrow-and-tall (168×338, aspect 1:2), so we scale non-
    // uniformly: x to match arch width, y to match arch height.
    const sprite = this.add
      .sprite(spec.x, spec.baseY, "portal-active", 0)
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(-5);
    sprite.setScale(spec.width / 168, spec.height / 338);
    this.archSprites.set(spec.id, sprite);
  }

  private renderArch(
    spec: ArchSpec,
    state: "next" | "cleared" | "dark" | "locked",
  ): void {
    const g = this.archGraphics.get(spec.id);
    const glow = this.archGlows.get(spec.id);
    const sprite = this.archSprites.get(spec.id);
    if (!g || !sprite) return;
    g.clear();

    if (state === "locked" || state === "dark") {
      glow?.setVisible(false);
      sprite.setVisible(false);
      if (sprite.anims.isPlaying) sprite.stop();
      return;
    }

    if (state === "cleared") {
      // Warm amber ring under the painted arch — revisitable cue.
      const archMidY = spec.baseY - spec.height + spec.width / 2;
      const radius = spec.width / 2;
      if (glow) {
        this.drawPortalGlow(glow, spec, PALETTE_HEX.brass, 0.42);
        glow.setVisible(true);
      }
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
    if (glow) {
      this.drawPortalGlow(glow, spec, 0x84d681, 0.48);
      glow.setVisible(true);
    }
    sprite.setVisible(true);
    sprite.clearTint();
    sprite.setAlpha(1);
    if (!sprite.anims.isPlaying) sprite.play("portal-spin");
  }

  private drawPortalGlow(
    g: Phaser.GameObjects.Graphics,
    spec: ArchSpec,
    color: number,
    alpha: number,
  ): void {
    g.clear();
    g.fillStyle(color, alpha);
    g.fillEllipse(0, 0, spec.width * 0.72, spec.height * 0.72);
    g.lineStyle(2, color, alpha * 0.9);
    g.strokeEllipse(0, 0, spec.width * 0.82, spec.height * 0.78);
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

      if (isNext) {
        this.drawArchStatusPlaque(arch, "open passage", "", "next");
      } else if (isCleared) {
        this.drawArchStatusPlaque(arch, "stamped", "", "cleared");
      } else if (isLocked) {
        this.drawArchStatusPlaque(arch, arch.label, "sealed", "locked");
      }
    });
  }

  private drawArchStatusPlaque(
    arch: ArchSpec,
    title: string,
    subtitle: string,
    tone: "next" | "cleared" | "locked",
  ): void {
    const width = tone === "locked" ? 212 : 164;
    const height = subtitle ? 58 : 42;
    const y = arch.baseY + (subtitle ? 48 : 34);
    const isLocked = tone === "locked";
    const alpha = isLocked ? 0.24 : tone === "next" ? 0.42 : 0.34;
    const textColor = isLocked
      ? "#4a4352"
      : tone === "next"
        ? "#d9c579"
        : "#c9a14a";

    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(UI_HEX.panel, alpha);
    g.fillRoundedRect(arch.x - width / 2, y - height / 2, width, height, 8);
    g.lineStyle(1, isLocked ? 0x4a4352 : UI_HEX.brass, alpha + 0.2);
    g.strokeRoundedRect(arch.x - width / 2, y - height / 2, width, height, 8);

    this.add
      .text(arch.x, y - (subtitle ? 9 : 1), title, {
        fontFamily: SERIF,
        fontSize: isLocked ? "17px" : "16px",
        fontStyle: "italic",
        color: textColor,
      })
      .setOrigin(0.5)
      .setDepth(0);

    if (!subtitle) return;
    this.add
      .text(arch.x, y + 13, subtitle, {
        fontFamily: SERIF,
        fontSize: "14px",
        color: "#4a4352",
      })
      .setOrigin(0.5)
      .setDepth(0);
  }

  private flashPortalForScene(sceneKey: string): void {
    const arch = ARCHES.find((a) => a.sceneKey === sceneKey);
    if (!arch) return;

    const cx = arch.x;
    const cy = arch.baseY - arch.height / 2 + 34;
    const pulse = this.add.graphics().setPosition(cx, cy).setDepth(8);
    pulse.fillStyle(PALETTE_HEX.brass, 0.22);
    pulse.fillEllipse(0, 0, arch.width * 0.82, arch.height * 0.74);
    pulse.lineStyle(3, PALETTE_HEX.brass, 0.75);
    pulse.strokeEllipse(0, 0, arch.width * 0.92, arch.height * 0.82);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.22,
      scaleY: 1.12,
      duration: 340,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });

    const sprite = this.archSprites.get(arch.id);
    if (!sprite) return;
    const scaleX = sprite.scaleX;
    const scaleY = sprite.scaleY;
    this.tweens.add({
      targets: sprite,
      scaleX: scaleX * 1.05,
      scaleY: scaleY * 1.04,
      alpha: 1,
      duration: 150,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => sprite.setScale(scaleX, scaleY),
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
    this.drawStationPlaque(
      HUB_STATIONS.desk.x,
      HUB_STATIONS.desk.y,
      HUB_STATIONS.desk.width,
      HUB_STATIONS.desk.height,
      "runa's desk",
    );
    this.drawStationPlaque(
      HUB_STATIONS.almanac.x,
      HUB_STATIONS.almanac.y,
      HUB_STATIONS.almanac.width,
      HUB_STATIONS.almanac.height,
      "almanac",
      { alpha: 0.28, labelAlpha: 0 },
    );
    this.drawStationPlaque(
      HUB_STATIONS.portalFloor.x,
      HUB_STATIONS.portalFloor.y,
      HUB_STATIONS.portalFloor.width,
      HUB_STATIONS.portalFloor.height,
      "portal floor",
      { alpha: 0.22 },
    );
    this.drawStationPlaque(
      HUB_STATIONS.shelf.x,
      HUB_STATIONS.shelf.y,
      HUB_STATIONS.shelf.width,
      HUB_STATIONS.shelf.height,
      "your shelf",
    );
    this.drawStationPlaque(
      HUB_STATIONS.account.x,
      HUB_STATIONS.account.y,
      HUB_STATIONS.account.width,
      HUB_STATIONS.account.height,
      "account",
      {
        alpha: 0.28,
        labelAlpha: 0.5,
      },
    );
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

  private pulseStation(station: StationSpec): void {
    const pulse = this.add
      .container(station.x, station.y)
      .setDepth(9)
      .setAlpha(0.86);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.08);
    g.fillRoundedRect(
      -station.width / 2,
      -station.height / 2,
      station.width,
      station.height,
      8,
    );
    g.lineStyle(2, UI_HEX.brass, 0.72);
    g.strokeRoundedRect(
      -station.width / 2,
      -station.height / 2,
      station.width,
      station.height,
      8,
    );
    pulse.add(g);
    pulse.add(
      cornerTicks(this, station.width, station.height, {
        inset: 5,
        size: 10,
        width: 2,
      }),
    );

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.18,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
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
      this.drawShelfEmptyPlate();
      return;
    }

    this.drawShelfGridBacker(items.length);

    items.forEach((id, i) => {
      const relic = RELICS[id];
      if (!relic) return;

      const ix = SHELF_GRID.startX + (i % SHELF_GRID.cols) * SHELF_GRID.colGap;
      const iy = SHELF_GRID.startY + Math.floor(i / SHELF_GRID.cols) * SHELF_GRID.rowGap;
      const tile = this.add.container(ix, iy).setDepth(1).setAlpha(0.9);
      const tileBg = this.add.graphics();
      const half = SHELF_GRID.tileSize / 2;
      tileBg.fillStyle(UI_HEX.panel, 0.42);
      tileBg.fillRoundedRect(-half, -half, SHELF_GRID.tileSize, SHELF_GRID.tileSize, 7);
      tileBg.lineStyle(1, UI_HEX.brass, 0.34);
      tileBg.strokeRoundedRect(-half, -half, SHELF_GRID.tileSize, SHELF_GRID.tileSize, 7);
      tile.add(tileBg);

      const icon = satchelIconFor(id);
      if (icon && this.textures.exists(icon.key)) {
        const img = this.add.image(0, 0, icon.key);
        img.setScale(Math.min(SHELF_GRID.iconSize / img.width, SHELF_GRID.iconSize / img.height));
        img.setAlpha(0.9);
        tile.add(img);
      } else {
        tile.add(
          this.add
            .text(0, 0, relic.name.slice(0, 1), {
              fontFamily: SERIF,
              fontSize: "22px",
              color: "#d6c087",
            })
            .setOrigin(0.5),
        );
      }

      addIdleBreath(this, tile, {
        dy: -2,
        durationMs: 1800 + (i % SHELF_GRID.cols) * 150,
        delayMs: i * 45,
      });
    });
  }

  private drawShelfEmptyPlate(): void {
    const width = 180;
    const height = 42;
    const x = 1740;
    const y = 535;
    const plate = this.add.graphics().setDepth(0);
    plate.fillStyle(UI_HEX.panel, 0.34);
    plate.fillRoundedRect(x - width / 2, y - height / 2, width, height, 8);
    plate.lineStyle(1, UI_HEX.brass, 0.34);
    plate.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 8);

    this.add
      .text(x, y, "nothing yet", {
        fontFamily: SERIF,
        fontSize: "17px",
        fontStyle: "italic",
        color: "#8f8161",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  private drawShelfGridBacker(itemCount: number): void {
    const rows = Math.ceil(itemCount / SHELF_GRID.cols);
    const width = SHELF_GRID.colGap * (SHELF_GRID.cols - 1) + SHELF_GRID.tileSize + 24;
    const height = SHELF_GRID.rowGap * Math.max(0, rows - 1) + SHELF_GRID.tileSize + 26;
    const x = SHELF_GRID.startX + ((SHELF_GRID.cols - 1) * SHELF_GRID.colGap) / 2;
    const y = SHELF_GRID.startY + ((rows - 1) * SHELF_GRID.rowGap) / 2;
    const backer = this.add.graphics().setDepth(-1);
    backer.fillStyle(UI_HEX.panel, 0.18);
    backer.fillRoundedRect(x - width / 2, y - height / 2, width, height, 10);
    backer.lineStyle(1, UI_HEX.brass, 0.22);
    backer.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 10);

    for (let row = 0; row < rows; row++) {
      const railY = SHELF_GRID.startY + row * SHELF_GRID.rowGap + SHELF_GRID.tileSize / 2 + 9;
      backer.lineStyle(1, UI_HEX.brass, 0.13);
      backer.lineBetween(x - width / 2 + 16, railY, x + width / 2 - 16, railY);
    }
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
