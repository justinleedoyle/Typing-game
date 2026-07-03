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
  addBackdropDrift,
  addGroundShadow,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  attachWordBodyAnchor,
  playClaimLine,
  playSceneEventPulse,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import { preloadSatchelIcons, satchelIconFor } from "../game/ui/satchelIcons";
import { cornerTicks, UI_HEX } from "../game/ui/uiTheme";
import {
  bobWrenSprite,
  flashWrenMiss,
  makeWrenSprite,
  playWrenAction,
  playWrenFocus,
  preloadWren,
  setWrenPose,
} from "../game/wren";
import hubBackdrop from "../../art/references/hub-portal-chamber-clean.png";
import portalActiveSheet from "../../art/portal/portal-active-sheet.png";
import runaSprite from "../../art/runa/runa-front.png";

type HubArrivalSource =
  | "opening"
  | "winter-mountain"
  | "sunken-bell"
  | "clockwork-forge"
  | "sky-island"
  | "haunted-wood"
  | "great-battle";

interface ChamberSceneData {
  store: SaveStore;
  arrival?: HubArrivalSource;
}

type Zone = "portals" | "desk" | "shelf" | "account";

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
  account: 1660,
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
  private runaSprite?: Phaser.GameObjects.Image;
  private zoneTargets: TextWordTarget[] = [];
  private portalWordAnchors: WordBodyAnchorHandle[] = [];
  private stationWordAnchorReleases: Array<() => void> = [];
  private persistentStationWordAnchorReleases: Array<() => void> = [];
  private portalFloorCallGlow?: Phaser.GameObjects.Container;
  private stationTypingPulseTimes = new WeakMap<StationSpec, number>();
  private portalTypingPulseTimes = new Map<string, number>();
  private ambientHandle?: AmbientHandle;
  private showPortalRevisits = false;
  private hubArrival: HubArrivalSource | null = null;
  private activeZone: Zone = "portals";

  constructor() {
    super("PortalChamberScene");
  }

  init(data: ChamberSceneData): void {
    this.store = data.store;
    this.hubArrival = data.arrival ?? null;
    this.archGraphics = new Map();
    this.archGlows = new Map();
    this.archSprites = new Map();
    this.zoneTargets = [];
    this.portalWordAnchors = [];
    this.stationWordAnchorReleases = [];
    this.persistentStationWordAnchorReleases = [];
    this.portalFloorCallGlow = undefined;
    this.stationTypingPulseTimes = new WeakMap();
    this.portalTypingPulseTimes = new Map();
    this.showPortalRevisits = false;
    this.activeZone = "portals";
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
    this.narration = new NarrationManager(this, {
      y: 150,
      framed: true,
      onSpeak: (speakerName) => {
        if (speakerName === "Runa") this.playRunaAttention();
      },
    });

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
      this.clearPersistentStationWordAnchors();
    });

    this.ambientHandle = playAmbientHub();

    // Persistent (non-zone) targets.
    this.addAlmanacTarget();
    void this.renderAccountStatus();

    // Enter the portals zone initially.
    this.enterZone("portals", false);
    this.playHubArrival();

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
    this.activeZone = zone;
    this.clearZoneTargets();
    this.walkWrenTo(ZONE_X[zone], animate);

    if (zone === "portals") this.registerPortalZoneTargets();
    if (zone === "desk")    this.registerDeskZoneTargets();
    if (zone === "shelf")   this.registerShelfZoneTargets();
    if (zone === "account") this.registerAccountZoneTargets();
  }

  private clearZoneTargets(): void {
    for (const anchor of this.portalWordAnchors) {
      anchor.destroy();
    }
    this.portalWordAnchors = [];
    for (const release of [...this.stationWordAnchorReleases]) {
      release();
    }
    this.stationWordAnchorReleases = [];
    this.portalFloorCallGlow?.destroy();
    this.portalFloorCallGlow = undefined;
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
      this.registerRealmPortalTarget(arch, nextAvailableIdx, false, {
        fontSize: 30,
      });
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
        let releaseAnchor = (): void => {};
        const battleTarget = new TextWordTarget({
          scene: this,
          word: "defend hearthward",
          x: this.scale.width / 2,
          y: 460,
          fontSize: 42,
          outline: true,
          frame: "banner",
          onClaim: () => this.focusStation(HUB_STATIONS.portalFloor),
          onAdvance: () => this.pulseStationTyping(HUB_STATIONS.portalFloor),
          onComplete: () => {
            releaseAnchor();
            this.portalFloorCallGlow?.destroy();
            this.portalFloorCallGlow = undefined;
            this.playHubActorAction(HUB_STATIONS.portalFloor.x);
            this.pulseStation(HUB_STATIONS.portalFloor);
            this.cameras.main.fadeOut(600, 10, 8, 15);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
              this.scene.start("GreatBattleScene", { store: this.store });
            });
          },
        });
        releaseAnchor = this.attachPortalFloorCallAnchor(battleTarget, 0x8b6ad8);
        this.showPortalFloorCallGlow(0x8b6ad8);
        this.typingInput.register(battleTarget);
        this.zoneTargets.push(battleTarget);
        this.narration.say("hub_all_cleared");
        this.setHint("");
      } else {
        // Battle cleared — show begin again target (New Game+).
        let releaseAnchor = (): void => {};
        const ngPlusTarget = new TextWordTarget({
          scene: this,
          word: "begin again",
          x: this.scale.width / 2,
          y: 460,
          fontSize: 38,
          outline: true,
          frame: "banner",
          onClaim: () => this.focusStation(HUB_STATIONS.portalFloor),
          onAdvance: () => this.pulseStationTyping(HUB_STATIONS.portalFloor),
          onComplete: () => {
            releaseAnchor();
            this.portalFloorCallGlow?.destroy();
            this.portalFloorCallGlow = undefined;
            this.playHubActorAction(HUB_STATIONS.portalFloor.x);
            this.pulseStation(HUB_STATIONS.portalFloor);
            this.startNewGame();
          },
        });
        releaseAnchor = this.attachPortalFloorCallAnchor(ngPlusTarget, UI_HEX.brass);
        this.showPortalFloorCallGlow(UI_HEX.brass);
        this.typingInput.register(ngPlusTarget);
        this.zoneTargets.push(ngPlusTarget);
        this.narration.say("hub_post_battle");
        this.setHint("");
      }
    }

    // Secondary targets — all cleared realms are revisitable at lower priority.
    const allRealmsCleared = nextAvailableIdx >= REALM_SEQUENCE.length;
    if (!allRealmsCleared || this.showPortalRevisits) {
      for (let i = 0; i < nextAvailableIdx; i++) {
        this.registerRealmPortalTarget(ARCHES[i], i, true, {
          fontSize: 22,
          priority: -1,
        });
      }
    } else {
      this.registerNavTarget(
        "old paths",
        this.scale.width / 2,
        552,
        () => {
          this.showPortalRevisits = true;
          this.enterZone("portals", false);
        },
        {
          fontSize: 20,
          priority: -1,
          stationPulse: HUB_STATIONS.portalFloor,
        },
      );
    }

    // Zone navigation (away from portals).
    this.registerNavTarget("runa", 420, 908, () => this.enterZone("desk"), {
      fontSize: 23,
      stationPulse: HUB_STATIONS.desk,
    });
    this.registerNavTarget("shelf", 1740, 930, () => this.enterZone("shelf"), {
      fontSize: 23,
      stationPulse: HUB_STATIONS.shelf,
    });
    // Keep the first portal view quiet: one account station target reveals
    // settings/sign-in controls after the player intentionally focuses it.
    this.registerNavTarget(
      "account",
      ACCOUNT_PANEL.x,
      ACCOUNT_PANEL.authY,
      () => this.enterZone("account"),
      {
        fontSize: 18,
        stationPulse: HUB_STATIONS.account,
      },
    );
  }

  private registerRealmPortalTarget(
    arch: ArchSpec,
    archIndex: number,
    revisit: boolean,
    opts: { fontSize: number; priority?: number },
  ): void {
    let releaseAnchor = (): void => {};
    const target = new TextWordTarget({
      scene: this,
      word: arch.label,
      x: arch.x,
      y: archTargetY(archIndex),
      fontSize: opts.fontSize,
      priority: opts.priority,
      outline: true,
      onClaim: () => {
        this.playPortalClaimLine(arch);
        this.focusPortalForScene(arch.sceneKey);
      },
      onAdvance: () => this.pulsePortalTyping(arch.sceneKey),
      onComplete: () => {
        releaseAnchor();
        this.onEnterPortal(arch.sceneKey, revisit);
      },
    });
    releaseAnchor = this.attachPortalWordAnchor(target, arch);
    this.typingInput.register(target);
    this.zoneTargets.push(target);
  }

  private attachPortalWordAnchor(
    target: TextWordTarget,
    arch: ArchSpec,
  ): () => void {
    const sprite = this.archSprites.get(arch.id);
    if (!sprite) return () => {};

    const handle = attachWordBodyAnchor(
      this,
      sprite,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: UI_HEX.brass,
        alpha: 0.16,
        depth: -0.4,
        sourceOffsetY: -(arch.height / 2 - 34),
        targetOffsetY: 24,
      },
    );
    this.portalWordAnchors.push(handle);

    return () => {
      handle.destroy();
      const idx = this.portalWordAnchors.indexOf(handle);
      if (idx >= 0) this.portalWordAnchors.splice(idx, 1);
    };
  }

  private playPortalClaimLine(arch: ArchSpec): void {
    playClaimLine(
      this,
      this.wrenContainer.x,
      this.wrenContainer.y - 108,
      arch.x,
      arch.baseY - arch.height / 2 + 34,
      {
        color: UI_HEX.brass,
        depth: 8,
        durationMs: 300,
      },
    );
  }

  private attachPortalFloorCallAnchor(
    target: TextWordTarget,
    color: number,
  ): () => void {
    const source = this.add.zone(
      HUB_STATIONS.portalFloor.x,
      HUB_STATIONS.portalFloor.y - 268,
      1,
      1,
    );
    const handle = attachWordBodyAnchor(
      this,
      source,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color,
        alpha: 0.13,
        depth: -0.45,
        targetOffsetY: 30,
      },
    );

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      handle.destroy();
      source.destroy();
      const idx = this.stationWordAnchorReleases.indexOf(release);
      if (idx >= 0) this.stationWordAnchorReleases.splice(idx, 1);
    };
    this.stationWordAnchorReleases.push(release);
    return release;
  }

  private showPortalFloorCallGlow(color: number): void {
    this.portalFloorCallGlow?.destroy();
    const glow = this.add
      .container(HUB_STATIONS.portalFloor.x, HUB_STATIONS.portalFloor.y - 268)
      .setDepth(-4.5)
      .setAlpha(0.62);
    const g = this.add.graphics();
    g.fillStyle(color, 0.08);
    g.fillEllipse(0, 0, 320, 108);
    g.lineStyle(2, color, 0.28);
    g.strokeEllipse(0, 0, 360, 132);
    g.lineStyle(1, UI_HEX.brass, 0.24);
    g.strokeEllipse(0, 0, 230, 72);
    glow.add(g);

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.42, to: 0.72 },
      scaleX: { from: 0.98, to: 1.04 },
      scaleY: { from: 0.98, to: 1.06 },
      duration: 1850,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.portalFloorCallGlow = glow;
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
      { fontSize: 22, stationPulse: HUB_STATIONS.portalFloor },
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
      { fontSize: 22, stationPulse: HUB_STATIONS.portalFloor },
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
    let releaseAnchor = (): void => {};
    const t = new TextWordTarget({
      scene: this,
      word,
      x,
      y,
      fontSize: opts.fontSize ?? 26,
      priority: opts.priority ?? -2,
      outline: true,
      onClaim: () => {
        if (opts.stationPulse) this.focusStation(opts.stationPulse);
      },
      onAdvance: () => {
        if (opts.stationPulse) this.pulseStationTyping(opts.stationPulse);
      },
      onComplete: () => {
        releaseAnchor();
        if (opts.stationPulse) this.pulseStation(opts.stationPulse);
        onComplete();
      },
    });
    if (opts.stationPulse) {
      releaseAnchor = this.attachStationWordAnchor(t, opts.stationPulse);
    }
    this.typingInput.register(t);
    this.zoneTargets.push(t);
  }

  private attachStationWordAnchor(
    target: TextWordTarget,
    station: StationSpec,
    opts: { persistent?: boolean; alpha?: number } = {},
  ): () => void {
    const source = this.add.zone(
      station.x,
      station.y - Math.min(20, station.height * 0.38),
      1,
      1,
    );
    const handle = attachWordBodyAnchor(
      this,
      source,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: UI_HEX.brass,
        alpha: opts.alpha ?? 0.12,
        depth: -0.45,
        sourceOffsetY: 0,
        targetOffsetY: 20,
      },
    );

    let released = false;
    const bucket = opts.persistent
      ? this.persistentStationWordAnchorReleases
      : this.stationWordAnchorReleases;
    const release = (): void => {
      if (released) return;
      released = true;
      handle.destroy();
      source.destroy();
      const idx = bucket.indexOf(release);
      if (idx >= 0) bucket.splice(idx, 1);
    };
    bucket.push(release);
    return release;
  }

  private clearPersistentStationWordAnchors(): void {
    for (const release of [...this.persistentStationWordAnchorReleases]) {
      release();
    }
    this.persistentStationWordAnchorReleases = [];
  }

  // ─── Portal entry ─────────────────────────────────────────────────────────

  private onEnterPortal(sceneKey: string, revisit: boolean): void {
    playChime();
    this.setHint("");
    this.narration.clear();
    this.flashPortalForScene(sceneKey);
    this.playPortalTravel(sceneKey);
    this.time.delayedCall(240, () => {
      this.cameras.main.fadeOut(500, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(sceneKey, { store: this.store, revisit });
        },
      );
    });
  }

  private playPortalTravel(sceneKey: string): void {
    const arch = ARCHES.find((a) => a.sceneKey === sceneKey);
    if (!arch) return;

    const cx = arch.x;
    const cy = arch.baseY - arch.height / 2 + 34;
    const wash = this.add.graphics().setDepth(6).setAlpha(0);
    wash.fillStyle(0x0b0a0f, 0.2);
    wash.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: wash,
      alpha: 0.18,
      duration: 90,
      hold: 130,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => wash.destroy(),
    });

    const glow = this.archGlows.get(arch.id);
    if (glow?.visible) {
      this.tweens.add({
        targets: glow,
        alpha: { from: Math.max(glow.alpha, 0.42), to: glow.alpha },
        scaleX: { from: glow.scaleX * 1.08, to: glow.scaleX },
        scaleY: { from: glow.scaleY * 1.06, to: glow.scaleY },
        duration: 360,
        ease: "Sine.easeOut",
      });
    }

    for (let i = 0; i < 3; i++) {
      const ring = this.add
        .graphics()
        .setPosition(cx, cy)
        .setDepth(9 + i * 0.1)
        .setAlpha(0.74 - i * 0.12);
      ring.lineStyle(2, i === 1 ? 0x75bf84 : UI_HEX.brass, 0.7 - i * 0.08);
      ring.strokeEllipse(0, 0, arch.width * (0.44 + i * 0.12), arch.height * (0.42 + i * 0.1));
      ring.fillStyle(i === 1 ? 0x75bf84 : UI_HEX.brass, 0.035);
      ring.fillEllipse(0, 0, arch.width * (0.5 + i * 0.12), arch.height * (0.48 + i * 0.1));
      ring.setScale(0.68 + i * 0.08);

      this.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 1.22 + i * 0.08,
        scaleY: 1.12 + i * 0.06,
        duration: 420,
        delay: i * 46,
        ease: "Sine.easeOut",
        onComplete: () => ring.destroy(),
      });
    }

    this.playPortalTravelFlecks(arch, cx, cy);

    if (!this.wrenContainer?.active) return;
    const startX = this.wrenContainer.x;
    const startY = this.wrenContainer.y;
    this.tweens.killTweensOf(this.wrenContainer);
    this.tweens.add({
      targets: this.wrenContainer,
      x: startX + (cx - startX) * 0.08,
      y: startY - 8,
      alpha: 0.86,
      duration: 320,
      ease: "Sine.easeInOut",
    });
  }

  private playPortalTravelFlecks(arch: ArchSpec, cx: number, cy: number): void {
    if (!this.wrenContainer?.active) return;
    const fromX = this.wrenContainer.x;
    const fromY = this.wrenContainer.y - 118;
    const colors = [UI_HEX.brass, 0x75bf84, 0xf0d98e];

    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const startX = fromX + Math.cos(angle) * (20 + (i % 3) * 7);
      const startY = fromY + Math.sin(angle) * (10 + (i % 2) * 6);
      const targetX = cx + Math.cos(angle + 0.8) * arch.width * 0.16;
      const targetY = cy + Math.sin(angle + 0.8) * arch.height * 0.16;
      const fleck = this.add
        .graphics()
        .setPosition(startX, startY)
        .setDepth(10)
        .setAlpha(0.72);
      fleck.fillStyle(colors[i % colors.length], 0.82);
      fleck.fillCircle(0, 0, 2.5 + (i % 3) * 0.8);

      this.tweens.add({
        targets: fleck,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.32,
        scaleY: 0.32,
        duration: 300 + i * 18,
        delay: i * 14,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }
  }

  // ─── Persistent targets ───────────────────────────────────────────────────

  private addAlmanacTarget(): void {
    let releaseAnchor = (): void => {};
    const target = new TextWordTarget({
      scene: this,
      word: "almanac",
      x: 230,
      y: 1030,
      fontSize: 22,
      priority: -1,
      outline: true,
      onClaim: () => this.focusStation(HUB_STATIONS.almanac),
      onAdvance: () => this.pulseStationTyping(HUB_STATIONS.almanac),
      onComplete: () => {
        releaseAnchor();
        this.playHubActorAction(HUB_STATIONS.almanac.x, true);
        this.pulseStation(HUB_STATIONS.almanac);
        this.openAlmanac();
      },
    });
    releaseAnchor = this.attachStationWordAnchor(target, HUB_STATIONS.almanac, {
      persistent: true,
    });
    this.typingInput.register(target);
  }

  private async renderAccountStatus(): Promise<void> {
    const name = await currentUserDisplayName();
    this.add
      .text(ACCOUNT_PANEL.x, ACCOUNT_PANEL.statusY, name ? `signed in as ${name}` : "local save", {
        fontFamily: SERIF,
        fontSize: "15px",
        fontStyle: "italic",
        color: "#9d8f6d",
        align: "center",
        wordWrap: { width: ACCOUNT_PANEL.width - 30 },
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  private registerAccountZoneTargets(): void {
    this.narration.clear();
    this.setHint("account station  ·  type settings, sign in/out, or portals");
    this.registerNavTarget(
      "settings",
      ACCOUNT_PANEL.x,
      ACCOUNT_PANEL.settingsY,
      () => this.enterSettings(),
      {
        fontSize: 18,
        stationPulse: HUB_STATIONS.account,
      },
    );
    this.registerNavTarget(
      "portals",
      ACCOUNT_PANEL.x,
      ACCOUNT_PANEL.y + ACCOUNT_PANEL.height / 2 + 26,
      () => this.enterZone("portals"),
      {
        fontSize: 18,
        priority: -2,
        stationPulse: HUB_STATIONS.account,
      },
    );
    void this.addAccountAuthTarget();
  }

  private async addAccountAuthTarget(): Promise<void> {
    const zoneAtRequest = this.activeZone;
    const name = await currentUserDisplayName();
    if (zoneAtRequest !== "account" || this.activeZone !== "account") return;

    let releaseAnchor = (): void => {};
    const target = new TextWordTarget({
      scene: this,
      word: name ? "sign out" : "sign in",
      x: ACCOUNT_PANEL.x,
      y: ACCOUNT_PANEL.authY,
      fontSize: 18,
      priority: -1,
      outline: true,
      onClaim: () => this.focusStation(HUB_STATIONS.account),
      onAdvance: () => this.pulseStationTyping(HUB_STATIONS.account),
      onComplete: () => {
        releaseAnchor();
        this.playHubActorAction(HUB_STATIONS.account.x);
        this.pulseStation(HUB_STATIONS.account);
        if (name) {
          void signOut();
        } else {
          void signInWithGoogle(window.location.href);
        }
      },
    });
    releaseAnchor = this.attachStationWordAnchor(target, HUB_STATIONS.account, {
      alpha: 0.1,
    });
    this.typingInput.register(target);
    this.zoneTargets.push(target);
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
    this.playHubActorAction(arch.x);

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

  private focusPortalForScene(sceneKey: string): void {
    const arch = ARCHES.find((a) => a.sceneKey === sceneKey);
    if (!arch) return;
    this.playHubActorFocus(arch.x);

    const sprite = this.archSprites.get(arch.id);
    const glow = this.archGlows.get(arch.id);
    const cx = arch.x;
    const cy = arch.baseY - arch.height / 2 + 34;
    const ring = this.add.graphics().setPosition(cx, cy).setDepth(7).setAlpha(0.72);
    ring.lineStyle(2, PALETTE_HEX.brass, 0.62);
    ring.strokeEllipse(0, 0, arch.width * 0.78, arch.height * 0.72);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 1.1,
      scaleY: 1.06,
      duration: 280,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });

    if (glow?.visible) {
      this.tweens.add({
        targets: glow,
        alpha: { from: Math.max(glow.alpha, 0.34), to: glow.alpha },
        duration: 260,
        ease: "Sine.easeOut",
      });
    }

    if (!sprite?.visible) return;
    const scaleX = sprite.scaleX;
    const scaleY = sprite.scaleY;
    this.tweens.add({
      targets: sprite,
      scaleX: scaleX * 1.025,
      scaleY: scaleY * 1.02,
      duration: 130,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => sprite.setScale(scaleX, scaleY),
    });
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private drawRoom(): void {
    const backdrop = this.add
      .image(0, 0, "hub-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 18000, driftX: -3, driftY: -2 });
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
    addLivingLight(this, {
      x: 150,
      y: 720,
      width: 150,
      height: 220,
      color: 0xf5ad55,
      alpha: 0.11,
      durationMs: 1900,
    });
    addLivingLight(this, {
      x: 915,
      y: 255,
      width: 190,
      height: 100,
      color: 0xf2be68,
      alpha: 0.07,
      durationMs: 2600,
      delayMs: 420,
    });
    addLivingLight(this, {
      x: 1508,
      y: 255,
      width: 190,
      height: 100,
      color: 0xf2be68,
      alpha: 0.07,
      durationMs: 2800,
      delayMs: 900,
    });
    addLivingLight(this, {
      x: 1148,
      y: 650,
      width: 980,
      height: 340,
      color: 0x78c980,
      alpha: 0.045,
      durationMs: 3400,
      scale: 1.035,
    });
    addAmbientDrift(this, {
      kind: "mote",
      count: 12,
      depth: -2.3,
      area: { x: 120, y: 360, width: this.scale.width - 240, height: 520 },
      alpha: 0.13,
      minSize: 3,
      maxSize: 6.5,
      driftX: 36,
      driftY: -70,
      minDurationMs: 7200,
      maxDurationMs: 13000,
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

  private pulseStationTyping(station: StationSpec): void {
    const now = this.time.now;
    const last = this.stationTypingPulseTimes.get(station) ?? -Infinity;
    if (now - last < 90) return;
    this.stationTypingPulseTimes.set(station, now);

    const pulse = this.add
      .container(station.x, station.y)
      .setDepth(8)
      .setAlpha(0.46);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.035);
    g.fillRoundedRect(
      -station.width / 2,
      -station.height / 2,
      station.width,
      station.height,
      8,
    );
    g.lineStyle(1, UI_HEX.brass, 0.34);
    g.strokeRoundedRect(
      -station.width / 2,
      -station.height / 2,
      station.width,
      station.height,
      8,
    );
    pulse.add(g);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.04,
      scaleY: 1.1,
      duration: 210,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private pulsePortalTyping(sceneKey: string): void {
    const now = this.time.now;
    const last = this.portalTypingPulseTimes.get(sceneKey) ?? -Infinity;
    if (now - last < 90) return;
    this.portalTypingPulseTimes.set(sceneKey, now);

    const arch = ARCHES.find((a) => a.sceneKey === sceneKey);
    if (!arch) return;
    const pulse = this.add
      .graphics()
      .setPosition(arch.x, arch.baseY - arch.height / 2 + 34)
      .setDepth(7)
      .setAlpha(0.48);
    pulse.fillStyle(UI_HEX.brass, 0.04);
    pulse.fillEllipse(0, 0, arch.width * 0.54, arch.height * 0.46);
    pulse.lineStyle(1, UI_HEX.brass, 0.36);
    pulse.strokeEllipse(0, 0, arch.width * 0.66, arch.height * 0.54);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.12,
      duration: 230,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private playHubArrival(): void {
    const arrival = this.hubArrival;
    if (!arrival) return;

    const arch = ARCHES.find((a) => a.id === arrival);
    const sourceX = arch?.x ?? HUB_STATIONS.portalFloor.x;
    const sourceY = arch
      ? arch.baseY - arch.height / 2 + 34
      : HUB_STATIONS.portalFloor.y - 250;
    const color = arrival === "great-battle"
      ? 0x8b6ad8
      : arrival === "opening"
        ? 0x9fd7ff
        : UI_HEX.brass;

    playSceneEventPulse(this, {
      kind: "mote",
      color,
      x: sourceX,
      y: sourceY,
      depth: 6,
      durationMs: 620,
      ringWidth: arch ? arch.width * 0.64 : 330,
      ringHeight: arch ? arch.height * 0.42 : 110,
      count: 8,
      alpha: 0.1,
      spreadX: arch ? arch.width * 0.28 : 130,
      spreadY: arch ? arch.height * 0.12 : 44,
    });

    if (arch) {
      this.focusPortalForScene(arch.sceneKey);
    } else {
      this.focusStation(HUB_STATIONS.portalFloor);
    }

    this.playHubArrivalFlecks(
      sourceX,
      sourceY,
      this.wrenContainer.x,
      this.wrenContainer.y - 112,
      color,
    );
  }

  private playHubArrivalFlecks(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
  ): void {
    playClaimLine(this, fromX, fromY, toX, toY, {
      color,
      depth: 8,
      durationMs: 360,
    });

    for (let i = 0; i < 9; i++) {
      const angle = (Math.PI * 2 * i) / 9;
      const startX = fromX + Math.cos(angle) * Phaser.Math.Between(18, 42);
      const startY = fromY + Math.sin(angle) * Phaser.Math.Between(18, 54);
      const targetX = toX + Math.cos(angle + 0.5) * Phaser.Math.Between(12, 38);
      const targetY = toY + Math.sin(angle + 0.5) * Phaser.Math.Between(8, 26);
      const fleck = this.add
        .graphics()
        .setPosition(startX, startY)
        .setDepth(9)
        .setAlpha(0.68);
      fleck.fillStyle(i % 3 === 0 ? UI_HEX.brass : color, 0.76);
      fleck.fillCircle(0, 0, Phaser.Math.FloatBetween(2.2, 4.4));

      this.tweens.add({
        targets: fleck,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.34,
        scaleY: 0.34,
        duration: 320 + i * 18,
        delay: i * 12,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }
  }

  private focusStation(station: StationSpec): void {
    this.playHubActorFocus(
      station.x,
      station === HUB_STATIONS.desk || station === HUB_STATIONS.almanac,
    );
    this.playStationClaimLine(station);
    const focus = this.add
      .container(station.x, station.y)
      .setDepth(8)
      .setAlpha(0.68);
    const g = this.add.graphics();
    g.lineStyle(2, UI_HEX.brass, 0.52);
    g.strokeRoundedRect(
      -station.width / 2,
      -station.height / 2,
      station.width,
      station.height,
      8,
    );
    focus.add(g);

    this.tweens.add({
      targets: focus,
      alpha: 0,
      scaleX: 1.04,
      scaleY: 1.08,
      duration: 300,
      ease: "Sine.easeOut",
      onComplete: () => focus.destroy(),
    });
  }

  private playStationClaimLine(station: StationSpec): void {
    if (!this.wrenContainer?.active || station === HUB_STATIONS.account) return;

    playClaimLine(
      this,
      this.wrenContainer.x,
      this.wrenContainer.y - 112,
      station.x,
      station.y - Math.min(18, station.height * 0.34),
      {
        color: UI_HEX.brass,
        depth: 7,
        durationMs: 250,
      },
    );
  }

  private playHubActorFocus(targetX: number, includeRuna = false): void {
    if (this.wrenSprite?.active && this.wrenContainer?.active) {
      playWrenFocus(this.wrenSprite, {
        faceLeft: targetX < this.wrenContainer.x - 12,
        durationMs: 135,
      });
    }
    if (includeRuna) this.playRunaAttention();
  }

  private playHubActorAction(targetX: number, includeRuna = false): void {
    if (this.wrenSprite?.active && this.wrenContainer?.active) {
      playWrenAction(this.wrenSprite, {
        faceLeft: targetX < this.wrenContainer.x - 12,
        durationMs: 190,
      });
    }
    if (includeRuna) this.playRunaAttention();
  }

  private playRunaAttention(): void {
    const img = this.runaSprite;
    if (!img?.active) return;

    const originalX = img.x;
    const originalY = img.y;
    const originalScaleX = img.scaleX;
    const originalScaleY = img.scaleY;
    this.tweens.killTweensOf(img);
    this.tweens.add({
      targets: img,
      x: originalX + 6,
      y: originalY - 5,
      scaleX: originalScaleX * 1.012,
      scaleY: originalScaleY * 1.012,
      duration: 135,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!img.scene) return;
        img.x = originalX;
        img.y = originalY;
        img.scaleX = originalScaleX;
        img.scaleY = originalScaleY;
        addIdleBreath(this, img, { dy: -4, durationMs: 2200, delayMs: 160 });
      },
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
    this.runaSprite = img;
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
