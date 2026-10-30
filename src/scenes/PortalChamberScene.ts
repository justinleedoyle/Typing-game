import { beginAssetLoad, assetLoadBlocked } from "../game/assetLoadRecovery";
import { installChapterMenu } from "../game/ui/pauseMenu";
import { navigationAction } from "../game/ui/navigationPolicy";
import { decorativeTween, PRESENTATION_CHANGED, reducedMotion } from "../game/presentation";
import Phaser from "phaser";
import { applySceneActorLighting } from "../game/actorLighting";
import { resetSave } from "../game/resetSave";
import { type AmbientHandle, playAmbientHub } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { desktopBridge } from "../game/desktopBridge";
import { RELICS } from "../game/relics";
import type { Difficulty, SaveStore } from "../game/saveState";
import {
  currentUserDisplayName,
  signInWithGoogle,
  signOut,
  supabase,
} from "../game/supabaseClient";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import { difficultyLabel, isPuristToggleKey, togglePuristMode } from "../game/purist";
import {
  addAmbientDrift,
  addContainerWake,
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
  readonly glyph: "mountain" | "bell" | "cog" | "lantern" | "branch";
}

// Geometry maps each arch onto a painted opening in the hub backdrop art.
// width/height/baseY describe the portal-surface fill drawn inside the
// painted stone frame (no programmatic surround).
// Painted arch positions in the hub-portal-chamber-clean backdrop, measured
// from the source 1672×941 image scaled to the 1920×1080 game canvas.
// These are the inner apertures, excluding the stone surrounds. Their
// centers are 401/618/836/1053/1271 px in the 1672 px source painting.
const ARCHES: readonly ArchSpec[] = [
  { id: "winter-mountain", x: 461,  width: 142, height: 318, baseY: 696, label: "Winter Mountain", sceneKey: "WinterMountainScene", glyph: "mountain" },
  { id: "sunken-bell",     x: 709,  width: 142, height: 318, baseY: 696, label: "Sunken Bell",     sceneKey: "SunkenBellScene", glyph: "bell" },
  { id: "clockwork-forge", x: 960,  width: 142, height: 318, baseY: 696, label: "Clockwork Forge", sceneKey: "ClockworkForgeScene", glyph: "cog" },
  { id: "sky-island",      x: 1209, width: 142, height: 318, baseY: 696, label: "Sky Island",      sceneKey: "SkyIslandScene", glyph: "lantern" },
  { id: "haunted-wood",    x: 1459, width: 142, height: 318, baseY: 696, label: "Haunted Wood",    sceneKey: "HauntedWoodScene", glyph: "branch" },
] as const;

const REALM_SEQUENCE = ARCHES.map((a) => a.id);
const COMPLETED_PORTAL_ALPHA = 0.22;
const COMPLETED_PORTAL_FOCUS_ALPHA = 0.52;

// Wren's X position when standing in each zone — aligned to the painted
// desk (left), portal floor (centre), and utility stations. Shelf uses the
// cabinet's approach lane so the expanded keepsakes stay on the shelves.
const ZONE_X: Record<Zone, number> = {
  desk:    420,
  portals: 990,
  shelf:   1510,
  account: 1660,
};
// Stand in the foreground of the portal thresholds.
const WREN_Y = 1000;
const SHELF_GRID = {
  cols: 4,
  startX: 1750,
  colGap: 28,
  // Centers above the four painted shelf surfaces, not a floating UI grid.
  rowY: [444, 530, 620, 693],
  iconSize: 24,
} as const;
const SHELF_STATION = {
  x: 1788,
  y: 580,
  width: 150,
  height: 310,
  summaryY: 780,
  targetY: 852,
} as const;
const RUNA_DESK_STATION = {
  x: 250,
  y: 1010,
  width: 170,
  height: 48,
  targetX: 250,
  targetY: 1046,
} as const;
const DESK_REFLECTION_CARD = {
  x: 258,
  y: 628,
  width: 218,
  height: 82,
} as const;
const ACCOUNT_PANEL = {
  x: 1788,
  y: 234,
  width: 216,
  height: 148,
  statusY: 184,
  authY: 232,
  settingsY: 280,
} as const;
const ACCOUNT_STATION = {
  x: ACCOUNT_PANEL.x,
  y: ACCOUNT_PANEL.authY,
  width: 172,
  height: 58,
} as const;
const HUB_STATIONS = {
  desk: {
    x: RUNA_DESK_STATION.x,
    y: RUNA_DESK_STATION.y,
    width: RUNA_DESK_STATION.width,
    height: RUNA_DESK_STATION.height,
  },
  almanac: { x: 230, y: 690, width: 185, height: 42 },
  portalFloor: { x: 960, y: 962, width: 330, height: 46 },
  shelf: {
    x: SHELF_STATION.x,
    y: SHELF_STATION.y,
    width: SHELF_STATION.width,
    height: SHELF_STATION.height,
  },
  account: {
    x: ACCOUNT_STATION.x,
    y: ACCOUNT_STATION.y,
    width: ACCOUNT_STATION.width,
    height: ACCOUNT_STATION.height,
  },
} as const;
const PORTAL_CALL_WORD_Y = HUB_STATIONS.portalFloor.y - 360;
const PORTAL_CALL_SOURCE_Y = HUB_STATIONS.portalFloor.y - 100;
const HUB_FIRST_ARRIVAL_CAPTION_MS = 6_400;
const HUB_SHORT_CAPTION_MS = 2_600;

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
  private chapterMenu?: ReturnType<typeof installChapterMenu>;
  private archGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private archGlows = new Map<string, Phaser.GameObjects.Graphics>();
  private archSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private portalInstructionObjects: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  private narration!: NarrationManager;
  private wrenContainer!: Phaser.GameObjects.Container;
  private wrenSprite!: Phaser.GameObjects.Image;
  private runaSprite?: Phaser.GameObjects.Image;
  private zoneTargets: TextWordTarget[] = [];
  private portalWordAnchors: WordBodyAnchorHandle[] = [];
  private stationWordAnchorReleases: Array<() => void> = [];
  private persistentStationWordAnchorReleases: Array<() => void> = [];
  private deskDisplayObjects: Phaser.GameObjects.GameObject[] = [];
  private shelfDisplayObjects: Phaser.GameObjects.GameObject[] = [];
  private accountDisplayObjects: Phaser.GameObjects.GameObject[] = [];
  private difficultyNotice?: Phaser.GameObjects.Container;
  private portalFloorCallGlow?: Phaser.GameObjects.Container;
  private portalFloorCallWakeTimer?: Phaser.Time.TimerEvent;
  private portalFloorCallWakeObjects: Phaser.GameObjects.GameObject[] = [];
  private stationTypingPulseTimes = new WeakMap<StationSpec, number>();
  private portalTypingPulseTimes = new Map<string, number>();
  private ambientHandle?: AmbientHandle;
  private focusedCompletedPortal: string | null = null;
  private hubArrival: HubArrivalSource | null = null;
  private activeZone: Zone = "portals";
  private openingUtilityScene = false;
  private almanacOverlayOpen = false;
  private almanacReturnZone: "desk" | "shelf" = "desk";
  private enteringGreatBattle = false;
  private restartingNewGame = false;

  constructor() {
    super("PortalChamberScene");
  }

  init(data: ChamberSceneData): void {
    this.store = data.store;
    this.hubArrival = data.arrival ?? null;
    this.archGraphics = new Map();
    this.archGlows = new Map();
    this.archSprites = new Map();
    this.portalInstructionObjects = [];
    this.zoneTargets = [];
    this.portalWordAnchors = [];
    this.stationWordAnchorReleases = [];
    this.persistentStationWordAnchorReleases = [];
    this.deskDisplayObjects = [];
    this.shelfDisplayObjects = [];
    this.accountDisplayObjects = [];
    this.difficultyNotice = undefined;
    this.portalFloorCallGlow = undefined;
    this.portalFloorCallWakeTimer = undefined;
    this.portalFloorCallWakeObjects = [];
    this.stationTypingPulseTimes = new WeakMap();
    this.portalTypingPulseTimes = new Map();
    this.focusedCompletedPortal = null;
    this.activeZone = "portals";
    this.openingUtilityScene = false;
    this.almanacOverlayOpen = false;
    this.almanacReturnZone = "desk";
    this.enteringGreatBattle = false;
    this.restartingNewGame = false;
  }

  preload(): void {
    beginAssetLoad(this);
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
    if (assetLoadBlocked(this)) return;
    this.chapterMenu = installChapterMenu(this, {
      store: this.store,
      hasClaim: () => !!this.typingInput && (this.typingInput.hasClaim() || this.typingInput.getTypingBuffer().length > 0),
      escapeHint: () => this.activeZone === "portals" ? "Esc · pause" : "Esc · portals",
      onLeave: () => this.scene.start("TitleScene"),
      leaveLabel: "Save & return to title",
      leaveHint: "Your journey is saved. Continue from the title to resume your latest saved place.",
    });
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
    for (const arch of ARCHES) {
      this.drawArch(arch);
    }
    this.updateAllArchAppearances();
    this.drawArchLabels();
    this.events.on(PRESENTATION_CHANGED, this.updateAllArchAppearances, this);

    this.wrenContainer = this.drawWren(ZONE_X.portals, WREN_Y);

    // Runa's narration — the shared top caption every other scene uses. The
    // hub's Runa-narrator beats (arrival, desk reflections, the endgame calls)
    // route through say(id); say() is the voice hook when audio lands. Functional
    // hub prompts live on their stations instead of in a detached bottom banner.
    this.narration = new NarrationManager(this, {
      y: 150,
      framed: true,
      onSpeak: (speakerName) => {
        if (speakerName === "Runa") this.playRunaAttention();
      },
    });

    // Fragment display — shows the accumulating Quiet Lord word as a faint
    // portal-seal inscription, growing one letter per realm cleared.
    this.drawFragment();

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onCorrect: () => bobWrenSprite(this.wrenSprite),
      onMiss: () => {
        flashWrenMiss(this.wrenSprite);
        if (!reducedMotion(this)) this.cameras.main.shake(80, 0.002);
      },
      onClaim: () => playClaim(),
    });
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.resumeAfterAlmanac, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.chapterMenu?.destroy();
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.resumeAfterAlmanac, this);
      this.events.off(PRESENTATION_CHANGED, this.updateAllArchAppearances, this);
      this.ambientHandle?.stop();
      this.clearPersistentStationWordAnchors();
      this.difficultyNotice?.destroy();
      this.difficultyNotice = undefined;
    });

    this.ambientHandle = playAmbientHub();

    // Enter the portals zone initially.
    this.enterZone("portals", false);
    this.playHubArrival();
    this.playHubInitialRoomWake();

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
    for (const object of this.portalInstructionObjects) object.setVisible(zone === "portals");
    if (zone === "shelf") this.drawDisplayShelf();
    else this.clearShelfDisplay();
    this.walkWrenTo(ZONE_X[zone], animate);

    if (zone === "portals") this.registerPortalZoneTargets();
    if (zone === "desk")    this.registerDeskZoneTargets();
    if (zone === "shelf")   this.registerShelfZoneTargets();
    if (zone === "account") this.registerAccountZoneTargets();
  }

  private clearZoneTargets(): void {
    // A zone replacement also ends any ambiguous prefix. Unregistering every
    // old target alone leaves that buffer invisible against the new targets.
    this.typingInput.handleChar("Escape");
    const focusedArch = ARCHES.find((arch) => arch.id === this.focusedCompletedPortal);
    if (focusedArch) this.setCompletedPortalFocus(focusedArch, false);
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
    this.clearPortalFloorCallWake();
    this.clearDeskDisplay();
    this.clearAccountDisplay();
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
        fontSize: 24,
        entryDelayMs: 40,
      });
      // First-arrival narration — only while nothing is cleared yet (the
      // "you're new here" state). On returns the desk reflections carry Runa.
      if (!REALM_SEQUENCE.some((id) => state.realms[id]?.cleared)) {
        this.narration.say("hub_first_arrival");
        this.narration.clearAfter(HUB_FIRST_ARRIVAL_CAPTION_MS);
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
          word: "defend holdfast",
          x: this.scale.width / 2,
          y: PORTAL_CALL_WORD_Y,
          fontSize: 36,
          outline: true,
          idleAlpha: 0.92,
          onClaim: () => this.focusStation(HUB_STATIONS.portalFloor),
          onAdvance: () => this.pulseStationTyping(HUB_STATIONS.portalFloor),
          onComplete: () => {
            releaseAnchor();
            this.enterGreatBattle();
          },
        });
        releaseAnchor = this.attachPortalFloorCallAnchor(battleTarget, 0x8b6ad8);
        this.showPortalFloorCallGlow(0x8b6ad8);
        this.showPortalFloorCallWake(0x8b6ad8);
        this.typingInput.register(battleTarget);
        this.zoneTargets.push(battleTarget);
        this.stageHubTarget(battleTarget, 80);
        this.narration.say("hub_all_cleared");
        this.narration.clearAfter(HUB_SHORT_CAPTION_MS);
      } else {
        // Battle cleared — show begin again target (New Game+).
        let releaseAnchor = (): void => {};
        const ngPlusTarget = new TextWordTarget({
          scene: this,
          word: "begin again",
          x: this.scale.width / 2,
          y: PORTAL_CALL_WORD_Y,
          fontSize: 34,
          outline: true,
          idleAlpha: 0.9,
          onClaim: () => this.focusStation(HUB_STATIONS.portalFloor),
          onAdvance: () => this.pulseStationTyping(HUB_STATIONS.portalFloor),
          onComplete: () => {
            releaseAnchor();
            this.portalFloorCallGlow?.destroy();
            this.portalFloorCallGlow = undefined;
            this.clearPortalFloorCallWake();
            this.playHubActorAction(HUB_STATIONS.portalFloor.x);
            this.pulseStation(HUB_STATIONS.portalFloor);
            void this.startNewGame();
          },
        });
        releaseAnchor = this.attachPortalFloorCallAnchor(ngPlusTarget, UI_HEX.brass);
        this.showPortalFloorCallGlow(UI_HEX.brass);
        this.showPortalFloorCallWake(UI_HEX.brass);
        this.typingInput.register(ngPlusTarget);
        this.zoneTargets.push(ngPlusTarget);
        this.stageHubTarget(ngPlusTarget, 80);
        this.narration.say("hub_post_battle");
        this.narration.clearAfter(HUB_SHORT_CAPTION_MS);
      }
    }

    // Secondary targets — all cleared realms are revisitable at lower priority.
    for (let i = 0; i < nextAvailableIdx; i++) {
      this.registerRealmPortalTarget(ARCHES[i], i, true, {
        fontSize: 20,
        priority: -1,
        entryDelayMs: 80 + i * 28,
      });
    }

    // Zone navigation (away from portals).
    this.registerNavTarget(
      "runa",
      RUNA_DESK_STATION.targetX,
      RUNA_DESK_STATION.targetY,
      () => this.enterZone("desk"),
      {
        fontSize: 19,
        stationPulse: HUB_STATIONS.desk,
        frame: "inscription",
        entryDelayMs: 110,
        idleAlpha: 0.84,
      },
    );
    this.registerNavTarget(
      "shelf",
      SHELF_STATION.x,
      SHELF_STATION.targetY,
      () => this.enterZone("shelf"),
      {
        fontSize: 19,
        stationPulse: HUB_STATIONS.shelf,
        frame: "inscription",
        entryDelayMs: 150,
        idleAlpha: 0.84,
      },
    );
    // Keep the first portal view quiet: one profile station target reveals
    // settings/sign-in controls after the player intentionally focuses it.
    this.registerNavTarget(
      "profile",
      this.scale.width - 104,
      104,
      () => this.enterZone("account"),
      {
        fontSize: 17,
        // Account controls are utilities alongside Pause, not a floating
        // pretend object on the painted bookcase.
        frame: "banner",
        entryDelayMs: 190,
        idleAlpha: 0.84,
      },
    );
  }

  private registerRealmPortalTarget(
    arch: ArchSpec,
    archIndex: number,
    revisit: boolean,
    opts: { fontSize: number; priority?: number; entryDelayMs?: number },
  ): void {
    let releaseAnchor = (): void => {};
    const target = new TextWordTarget({
      scene: this,
      word: arch.label,
      x: arch.x,
      y: archTargetY(arch, archIndex),
      fontSize: opts.fontSize,
      priority: opts.priority,
      outline: true,
      frame: "inscription",
      idleAlpha: revisit ? 0.82 : 1,
      onClaim: () => {
        if (revisit) this.setCompletedPortalFocus(arch, true);
        this.playPortalClaimLine(arch);
        this.focusPortalForScene(arch.sceneKey);
      },
      onRelease: () => {
        if (revisit) this.setCompletedPortalFocus(arch, false);
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
    this.stageHubTarget(target, opts.entryDelayMs ?? (revisit ? 90 : 50));
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
      PORTAL_CALL_SOURCE_Y,
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
      .container(HUB_STATIONS.portalFloor.x, PORTAL_CALL_SOURCE_Y)
      .setDepth(-4.5)
      .setAlpha(0.54);
    const g = this.add.graphics();
    g.fillStyle(color, 0.07);
    g.fillEllipse(0, 0, 360, 92);
    g.fillStyle(UI_HEX.brass, 0.035);
    g.fillEllipse(0, 0, 236, 54);
    glow.add(g);

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.38, to: 0.62 },
      scaleX: { from: 0.98, to: 1.035 },
      scaleY: { from: 0.98, to: 1.04 },
      duration: 1850,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.portalFloorCallGlow = glow;
  }

  private showPortalFloorCallWake(color: number): void {
    this.clearPortalFloorCallWake();

    const clearedArches = ARCHES.filter(
      (arch) => this.store.get().realms[arch.id]?.cleared === true,
    );
    if (clearedArches.length === 0) return;

    let archIdx = 0;
    this.playPortalFloorCallWakeThread(clearedArches[archIdx], color);
    this.portalFloorCallWakeTimer = this.time.addEvent({
      delay: 760,
      loop: true,
      callback: () => {
        if (this.activeZone !== "portals" || this.enteringGreatBattle || this.restartingNewGame) {
          return;
        }
        archIdx = (archIdx + 1) % clearedArches.length;
        this.playPortalFloorCallWakeThread(clearedArches[archIdx], color);
      },
    });
  }

  private clearPortalFloorCallWake(): void {
    this.portalFloorCallWakeTimer?.remove(false);
    this.portalFloorCallWakeTimer = undefined;
    for (const obj of [...this.portalFloorCallWakeObjects]) {
      obj.destroy();
    }
    this.portalFloorCallWakeObjects = [];
  }

  private trackPortalFloorCallWakeObject<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.portalFloorCallWakeObjects.push(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => {
      const idx = this.portalFloorCallWakeObjects.indexOf(obj);
      if (idx >= 0) this.portalFloorCallWakeObjects.splice(idx, 1);
    });
    return obj;
  }

  private playPortalFloorCallWakeThread(arch: ArchSpec, color: number): void {
    const fromX = arch.x;
    const fromY = arch.baseY - arch.height / 2 + 34;
    const toX = HUB_STATIONS.portalFloor.x;
    const toY = PORTAL_CALL_SOURCE_Y;
    const bendX = (fromX + toX) / 2;
    const bendY = Math.min(fromY, toY) - 44;

    const thread = this.trackPortalFloorCallWakeObject(
      this.add.graphics().setDepth(5.35).setAlpha(0.58),
    );
    thread.lineStyle(1.5, color, 0.18);
    thread.lineBetween(fromX, fromY, bendX, bendY);
    thread.lineBetween(bendX, bendY, toX, toY);
    thread.fillStyle(color, 0.22);
    thread.fillCircle(toX, toY, 3.5);
    this.tweens.add({
      targets: thread,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => thread.destroy(),
    });

    const glow = this.archGlows.get(arch.id);
    if (glow?.visible) {
      const baseAlpha = glow.alpha;
      this.tweens.add({
        targets: glow,
        alpha: Math.min(0.38, baseAlpha + 0.16),
        duration: 190,
        yoyo: true,
        ease: "Sine.easeOut",
        onComplete: () => glow.setAlpha(baseAlpha),
      });
    }

    for (let i = 0; i < 4; i += 1) {
      const startX = fromX + Phaser.Math.Between(-28, 28);
      const startY = fromY + Phaser.Math.Between(-32, 26);
      const targetX = toX + Phaser.Math.Between(-54, 54);
      const targetY = toY + Phaser.Math.Between(-20, 24);
      const mote = this.trackPortalFloorCallWakeObject(
        this.add.graphics().setPosition(startX, startY).setDepth(5.55).setAlpha(0.52),
      );
      mote.fillStyle(i % 2 === 0 ? UI_HEX.brass : color, 0.72);
      mote.fillCircle(0, 0, Phaser.Math.FloatBetween(2.1, 3.7));
      this.tweens.add({
        targets: mote,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.34,
        scaleY: 0.34,
        duration: 560 + i * 34,
        delay: i * 42,
        ease: "Sine.easeIn",
        onComplete: () => mote.destroy(),
      });
    }
  }

  private enterSettings(): void {
    this.openUtilityScene("SettingsScene", HUB_STATIONS.account, {
      kind: "ledger",
      pulseStation: false,
    });
  }

  // ─── Desk zone ────────────────────────────────────────────────────────────

  private registerDeskZoneTargets(): void {
    const state = this.store.get();
    const lastCleared = [...REALM_SEQUENCE]
      .reverse()
      .find((id) => state.realms[id]?.cleared) ?? "none";
    this.narration.say(DESK_LINE_IDS[lastCleared] ?? DESK_LINE_IDS["none"]);
    this.drawDeskReflectionCard(lastCleared);
    this.playDeskReflectionWake();
    this.playRunaAttention();

    this.registerDeskAlmanacTarget();
    this.registerPortalReturnTarget(70);
  }

  private drawDeskReflectionCard(lastCleared: string): void {
    this.clearDeskDisplay();

    const clearedCount = REALM_SEQUENCE.filter((id) => this.store.get().realms[id]?.cleared).length;
    const { x, y, width, height } = DESK_REFLECTION_CARD;
    const card = this.add.container(x, y).setDepth(-0.18).setAlpha(0.9).setRotation(-0.035);
    this.deskDisplayObjects.push(card);
    this.stageDeskObject(card, 45);

    const paper = this.add.graphics();
    paper.fillStyle(UI_HEX.parchment, 0.66);
    paper.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    paper.lineStyle(1, UI_HEX.brass, 0.3);
    paper.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    paper.lineStyle(1, UI_HEX.frame, 0.18);
    paper.lineBetween(-width / 2 + 26, -16, width / 2 - 30, -18);
    paper.lineBetween(-width / 2 + 30, 2, width / 2 - 46, -1);
    paper.lineBetween(-width / 2 + 36, 19, width / 2 - 60, 17);
    card.add(paper);

    const corners = cornerTicks(this, width - 12, height - 10, {
      inset: 5,
      size: 8,
      width: 1,
    }).setAlpha(0.32);
    card.add(corners);

    const quill = this.add.graphics();
    quill.lineStyle(2, UI_HEX.ink, 0.32);
    quill.lineBetween(width / 2 - 48, -26, width / 2 - 14, 24);
    quill.lineStyle(1, UI_HEX.brass, 0.34);
    quill.strokeEllipse(width / 2 - 54, -29, 28, 11);
    quill.strokeEllipse(width / 2 - 44, -19, 22, 9);
    card.add(quill);

    const stamps = this.add.graphics();
    const startX = -width / 2 + 34;
    const stampY = height / 2 - 18;
    for (let i = 0; i < REALM_SEQUENCE.length; i += 1) {
      const sx = startX + i * 22;
      const filled = i < clearedCount;
      stamps.lineStyle(1, filled ? UI_HEX.brass : UI_HEX.frame, filled ? 0.42 : 0.22);
      stamps.strokeCircle(sx, stampY, 6);
      if (filled) {
        stamps.fillStyle(UI_HEX.brass, lastCleared === REALM_SEQUENCE[i] ? 0.34 : 0.22);
        stamps.fillCircle(sx, stampY, 3.2);
      }
    }
    card.add(stamps);

    addIdleBreath(this, card, {
      dy: -1.5,
      durationMs: 2400,
      delayMs: 250,
    });
  }

  private clearDeskDisplay(): void {
    for (const obj of this.deskDisplayObjects) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.deskDisplayObjects = [];
  }

  private stageDeskObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      y: number;
      setAlpha: (value: number) => Phaser.GameObjects.GameObject;
      setY: (value: number) => Phaser.GameObjects.GameObject;
    };
    if (typeof item.y !== "number" || !item.setAlpha || !item.setY) return;

    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + 8);
    this.time.delayedCall(delayMs, () => {
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 220,
        ease: "Sine.easeOut",
      });
    });
  }

  private playDeskReflectionWake(): void {
    const { x, y, width, height } = DESK_REFLECTION_CARD;
    const frame = this.add
      .container(x, y)
      .setDepth(8)
      .setAlpha(0.46)
      .setRotation(-0.035);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.035);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
    g.lineStyle(1.5, UI_HEX.brass, 0.48);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    frame.add(g);
    frame.add(
      cornerTicks(this, width, height, {
        inset: 5,
        size: 11,
        width: 2,
      }),
    );
    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 1.05,
      scaleY: 1.08,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => frame.destroy(),
    });
  }

  // ─── Shelf zone ───────────────────────────────────────────────────────────

  private registerShelfZoneTargets(): void {
    // Shelf is a functional zone — clear Runa's top caption.
    this.narration.clear();
    this.playShelfDisplayWake();

    this.registerNavTarget("almanac", SHELF_STATION.x, SHELF_STATION.targetY,
      () => this.openAlmanac(), {
        fontSize: 20, stationPulse: HUB_STATIONS.shelf, frame: "inscription", entryDelayMs: 70,
      });
    this.registerNavTarget("portals", SHELF_STATION.x, SHELF_STATION.targetY + 58,
      () => this.enterZone("portals"), {
        fontSize: 19, stationPulse: HUB_STATIONS.shelf, frame: "inscription", entryDelayMs: 100,
      });
  }

  private registerPortalReturnTarget(entryDelayMs: number): void {
    this.registerNavTarget(
      "portals",
      HUB_STATIONS.portalFloor.x,
      HUB_STATIONS.portalFloor.y - 22,
      () => this.enterZone("portals"),
      {
        fontSize: 20,
        stationPulse: HUB_STATIONS.portalFloor,
        frame: "inscription",
        entryDelayMs,
        idleAlpha: 0.84,
      },
    );
  }

  // ─── Navigation target helper ─────────────────────────────────────────────

  private drawFragment(): void {
    const full = this.buildFragment();
    if (!full) return;

    const isFinal = full === "Again.";
    const scar = this.add.graphics().setDepth(-0.55).setAlpha(0);
    const x = HUB_STATIONS.portalFloor.x - 138;
    const y = HUB_STATIONS.portalFloor.y - 56;
    const scarWidth = isFinal ? 168 : 136;
    const t = this.add
      .text(x, y - 2, "", {
        fontFamily: SERIF,
        fontSize: isFinal ? "20px" : "18px",
        fontStyle: "italic",
        color: isFinal ? PALETTE.brass : "#9c83d8",
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setRotation(-0.02)
      .setDepth(-0.45);
    this.drawFragmentScar(scar, x, y, scarWidth, isFinal);

    let revealed = 0;
    const revealNext = (): void => {
      revealed++;
      t.setText(full.slice(0, revealed));
      const isLast = revealed === full.length;

      if (isLast) {
        t.setAlpha(1);
        this.tweens.add({
          targets: t,
          alpha: isFinal ? 0.34 : 0.3,
          duration: 700,
          ease: "Sine.easeOut",
        });
        this.tweens.add({
          targets: scar,
          alpha: isFinal ? 0.34 : 0.26,
          duration: 700,
          ease: "Sine.easeOut",
        });
        if (isFinal) {
          this.time.delayedCall(800, () => {
            this.tweens.add({
              targets: t,
              alpha: { from: 0.34, to: 0.18 },
              duration: 2400,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
            this.tweens.add({
              targets: scar,
              alpha: { from: 0.34, to: 0.16 },
              duration: 2400,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          });
        }
      } else {
        t.setAlpha(0.3);
        scar.setAlpha(0.2);
        this.time.delayedCall(120, revealNext);
      }
    };

    this.time.delayedCall(500, revealNext);
  }

  private drawFragmentScar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    isFinal: boolean,
  ): void {
    g.clear();
    const stroke = isFinal ? UI_HEX.brass : 0x9c83d8;
    const half = width / 2;
    g.lineStyle(1, stroke, isFinal ? 0.3 : 0.22);
    g.beginPath();
    g.moveTo(x - half, y + 12);
    g.lineTo(x - half * 0.58, y + 8);
    g.lineTo(x - half * 0.16, y + 11);
    g.lineTo(x + half * 0.24, y + 7);
    g.lineTo(x + half * 0.64, y + 10);
    g.lineTo(x + half, y + 6);
    g.strokePath();
    g.lineStyle(1, stroke, isFinal ? 0.18 : 0.12);
    g.beginPath();
    g.moveTo(x - half * 0.72, y - 11);
    g.lineTo(x - half * 0.32, y - 8);
    g.lineTo(x + half * 0.05, y - 11);
    g.lineTo(x + half * 0.5, y - 7);
    g.lineTo(x + half * 0.78, y - 10);
    g.strokePath();
    g.lineStyle(1, stroke, isFinal ? 0.22 : 0.14);
    g.strokeEllipse(x, y + 7, width * 0.9, 20);
    g.fillStyle(stroke, isFinal ? 0.1 : 0.06);
    g.fillCircle(x - half * 0.96, y + 10, 2);
    g.fillCircle(x + half * 0.96, y + 5, 2);
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
    if (cleared >= 5) return "";
    return LETTERS[Math.min(cleared, LETTERS.length - 1)];
  }

  private registerNavTarget(
    word: string,
    x: number,
    y: number,
    onComplete: () => void,
    opts: {
      fontSize?: number;
      priority?: number;
      frame?: "banner" | "inscription";
      stationPulse?: StationSpec;
      entryDelayMs?: number;
      idleAlpha?: number;
    } = {},
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
      frame: opts.frame,
      idleAlpha: opts.idleAlpha,
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
      releaseAnchor = this.attachStationWordAnchor(t, opts.stationPulse, {
        alpha: opts.idleAlpha !== undefined ? 0.07 : undefined,
      });
    }
    this.typingInput.register(t);
    this.zoneTargets.push(t);
    this.stageHubTarget(t, opts.entryDelayMs ?? 70);
  }

  private stageHubTarget(target: TextWordTarget, delayMs: number): void {
    const durationMs = 230;
    target.playEntryWake({
      delayMs,
      durationMs,
      offsetY: 10,
    });
    // Commands are attached to fixed objects; do not let their labels drift.
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
    this.narration.clear();
    // The selected target is complete, so leave the room input-quiet while Wren
    // crosses the visible space into the painted threshold.
    this.typingInput.reset();
    this.flashPortalForScene(sceneKey);
    this.playPortalTravel(sceneKey);
    this.time.delayedCall(560, () => {
      this.cameras.main.fadeOut(500, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(sceneKey, { store: this.store, revisit });
        },
      );
    });
  }

  private enterGreatBattle(): void {
    if (this.enteringGreatBattle) return;
    this.enteringGreatBattle = true;
    playChime();
    this.narration.clear();
    this.portalFloorCallGlow?.destroy();
    this.portalFloorCallGlow = undefined;
    this.clearPortalFloorCallWake();
    this.playHubActorAction(HUB_STATIONS.portalFloor.x);
    this.pulseStation(HUB_STATIONS.portalFloor);
    this.playGreatBattleEntryWake();
    this.time.delayedCall(300, () => {
      this.cameras.main.fadeOut(620, 10, 8, 15);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("GreatBattleScene", { store: this.store });
      });
    });
  }

  private playGreatBattleEntryWake(): void {
    const cx = HUB_STATIONS.portalFloor.x;
    const cy = HUB_STATIONS.portalFloor.y - 268;
    const violet = 0x8b6ad8;

    const wash = this.add.graphics().setDepth(6).setAlpha(0);
    wash.fillStyle(0x0b0a0f, 0.26);
    wash.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: wash,
      alpha: 0.22,
      duration: 120,
      hold: 150,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => wash.destroy(),
    });

    const seal = this.add.container(cx, cy).setDepth(12).setAlpha(0.78);
    const sealMark = this.add.graphics();
    sealMark.fillStyle(violet, 0.075);
    sealMark.fillEllipse(0, 0, 420, 128);
    sealMark.lineStyle(2, violet, 0.58);
    sealMark.strokeEllipse(0, 0, 430, 132);
    sealMark.lineStyle(1, UI_HEX.brass, 0.44);
    sealMark.strokeEllipse(0, 0, 270, 76);
    sealMark.lineBetween(-142, 0, 142, 0);
    sealMark.lineBetween(0, -38, 0, 38);
    seal.add(sealMark);
    seal.add(
      cornerTicks(this, 360, 104, {
        inset: 4,
        size: 12,
        width: 2,
      }),
    );

    this.tweens.add({
      targets: seal,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.16,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => seal.destroy(),
    });

    for (let i = 0; i < 3; i += 1) {
      const ring = this.add.graphics().setPosition(cx, cy).setDepth(11 + i * 0.1).setAlpha(0.68);
      ring.lineStyle(2, i === 1 ? UI_HEX.brass : violet, 0.62 - i * 0.08);
      ring.strokeEllipse(0, 0, 270 + i * 88, 78 + i * 30);
      ring.setScale(0.72 + i * 0.08);
      this.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 1.26 + i * 0.08,
        scaleY: 1.2 + i * 0.06,
        duration: 440,
        delay: i * 48,
        ease: "Sine.easeOut",
        onComplete: () => ring.destroy(),
      });
    }

    this.playGreatBattleEntryFlecks(cx, cy, violet);

    if (this.wrenContainer?.active) {
      const startX = this.wrenContainer.x;
      const startY = this.wrenContainer.y;
      this.tweens.killTweensOf(this.wrenContainer);
      this.tweens.add({
        targets: this.wrenContainer,
        x: startX + (cx - startX) * 0.05,
        y: startY - 10,
        alpha: 0.88,
        duration: 340,
        ease: "Sine.easeInOut",
      });
    }
  }

  private playGreatBattleEntryFlecks(cx: number, cy: number, violet: number): void {
    if (!this.wrenContainer?.active) return;
    const fromX = this.wrenContainer.x;
    const fromY = this.wrenContainer.y - 116;
    const colors = [UI_HEX.brass, violet, UI_HEX.parchment];

    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      const startX = fromX + Math.cos(angle) * (22 + (i % 3) * 8);
      const startY = fromY + Math.sin(angle) * (12 + (i % 2) * 6);
      const targetX = cx + Math.cos(angle + 0.7) * (54 + (i % 4) * 8);
      const targetY = cy + Math.sin(angle + 0.7) * (22 + (i % 3) * 5);
      const fleck = this.add.graphics().setPosition(startX, startY).setDepth(13).setAlpha(0.76);
      fleck.fillStyle(colors[i % colors.length], 0.78);
      fleck.fillCircle(0, 0, 2.4 + (i % 3) * 0.7);
      this.tweens.add({
        targets: fleck,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.32,
        scaleY: 0.32,
        duration: 330 + i * 16,
        delay: i * 12,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }
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
    const thresholdX = arch.x;
    const thresholdY = arch.baseY;
    this.tweens.killTweensOf(this.wrenContainer);
    if (this.wrenSprite?.active) {
      setWrenPose(this.wrenSprite, "walk", thresholdX < startX);
    }
    this.tweens.add({
      targets: this.wrenContainer,
      x: thresholdX,
      y: thresholdY,
      alpha: 0.18,
      duration: 520,
      ease: "Sine.easeIn",
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

  // ─── Desk-owned actions ───────────────────────────────────────────────────

  private registerDeskAlmanacTarget(): void {
    let releaseAnchor = (): void => {};
    const target = new TextWordTarget({
      scene: this,
      word: "almanac",
      x: HUB_STATIONS.almanac.x,
      y: HUB_STATIONS.almanac.y + 3,
      fontSize: 20,
      priority: -1,
      outline: true,
      frame: "inscription",
      idleAlpha: 0.76,
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
      alpha: 0.07,
    });
    this.typingInput.register(target);
    this.zoneTargets.push(target);
    this.stageHubTarget(target, 110);
  }

  private async renderAccountStatus(): Promise<void> {
    const zoneAtRequest = this.activeZone;
    const name = await currentUserDisplayName();
    if (zoneAtRequest !== "account" || this.activeZone !== "account") return;

    const status = this.add
      .text(ACCOUNT_PANEL.x, ACCOUNT_PANEL.statusY, desktopBridge() ? "saved on this computer · offline edition" : name ? `signed in as ${name}` : "local save", {
        fontFamily: SERIF,
        fontSize: "15px",
        fontStyle: "italic",
        color: "#9d8f6d",
        align: "center",
        wordWrap: { width: ACCOUNT_PANEL.width - 30 },
      })
      .setOrigin(0.5)
      .setDepth(1);
    this.accountDisplayObjects.push(status);
    this.stageAccountObject(status, 105, { offsetY: 6 });
  }

  private clearAccountDisplay(): void {
    for (const obj of this.accountDisplayObjects) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.accountDisplayObjects = [];
  }

  private registerAccountZoneTargets(): void {
    this.narration.clear();
    this.drawAccountStationPanel();
    this.playAccountPanelWake();
    void this.renderAccountStatus();
    this.registerNavTarget(
      "settings",
      ACCOUNT_PANEL.x,
      ACCOUNT_PANEL.settingsY,
      () => this.enterSettings(),
      {
        fontSize: 18,
        stationPulse: HUB_STATIONS.account,
        frame: "banner",
        entryDelayMs: 70,
        idleAlpha: 0.88,
      },
    );
    this.registerPortalReturnTarget(130);
    void this.addAccountAuthTarget();
  }

  private async addAccountAuthTarget(): Promise<void> {
    if (desktopBridge()) return;
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
      frame: "banner",
      idleAlpha: 0.88,
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
    this.stageHubTarget(target, 110);
  }

  private drawAccountStationPanel(): void {
    const panel = this.add.graphics().setDepth(0);
    panel.fillStyle(UI_HEX.panel, 0.44);
    panel.fillRoundedRect(
      ACCOUNT_PANEL.x - ACCOUNT_PANEL.width / 2,
      ACCOUNT_PANEL.y - ACCOUNT_PANEL.height / 2,
      ACCOUNT_PANEL.width,
      ACCOUNT_PANEL.height,
      9,
    );
    panel.lineStyle(1.5, UI_HEX.brass, 0.58);
    panel.strokeRoundedRect(
      ACCOUNT_PANEL.x - ACCOUNT_PANEL.width / 2,
      ACCOUNT_PANEL.y - ACCOUNT_PANEL.height / 2,
      ACCOUNT_PANEL.width,
      ACCOUNT_PANEL.height,
      9,
    );
    panel.lineStyle(1, UI_HEX.brass, 0.3);
    panel.lineBetween(
      ACCOUNT_PANEL.x - ACCOUNT_PANEL.width / 2 + 22,
      ACCOUNT_PANEL.statusY + 19,
      ACCOUNT_PANEL.x + ACCOUNT_PANEL.width / 2 - 22,
      ACCOUNT_PANEL.statusY + 19,
    );
    this.accountDisplayObjects.push(panel);
    this.stageAccountObject(panel, 35, { offsetY: 8 });

    const corners = cornerTicks(this, ACCOUNT_PANEL.width, ACCOUNT_PANEL.height, {
      inset: 6,
      size: 9,
      width: 1,
    })
      .setPosition(ACCOUNT_PANEL.x, ACCOUNT_PANEL.y)
      .setAlpha(0.58)
      .setDepth(0.1);
    this.accountDisplayObjects.push(corners);
    this.stageAccountObject(corners, 55, { offsetY: 8 });
  }

  private stageAccountObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
    opts: { offsetY?: number } = {},
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      y: number;
      setAlpha: (value: number) => Phaser.GameObjects.GameObject;
      setY: (value: number) => Phaser.GameObjects.GameObject;
    };
    if (typeof item.y !== "number" || !item.setAlpha || !item.setY) return;

    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + (opts.offsetY ?? 8));
    this.time.delayedCall(delayMs, () => {
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 220,
        ease: "Sine.easeOut",
      });
    });
  }

  private playAccountPanelWake(): void {
    const frame = this.add
      .container(ACCOUNT_PANEL.x, ACCOUNT_PANEL.y)
      .setDepth(8)
      .setAlpha(0.52);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.04);
    g.fillRoundedRect(
      -ACCOUNT_PANEL.width / 2,
      -ACCOUNT_PANEL.height / 2,
      ACCOUNT_PANEL.width,
      ACCOUNT_PANEL.height,
      10,
    );
    g.lineStyle(1.5, UI_HEX.brass, 0.52);
    g.strokeRoundedRect(
      -ACCOUNT_PANEL.width / 2,
      -ACCOUNT_PANEL.height / 2,
      ACCOUNT_PANEL.width,
      ACCOUNT_PANEL.height,
      10,
    );
    frame.add(g);
    frame.add(
      cornerTicks(this, ACCOUNT_PANEL.width, ACCOUNT_PANEL.height, {
        inset: 5,
        size: 11,
        width: 2,
      }),
    );
    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 1.04,
      scaleY: 1.08,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => frame.destroy(),
    });
  }

  private openAlmanac(): void {
    if (this.openingUtilityScene) return;
    this.openingUtilityScene = true;
    this.almanacReturnZone = this.activeZone === "shelf" ? "shelf" : "desk";
    const station = this.almanacReturnZone === "shelf" ? HUB_STATIONS.shelf : HUB_STATIONS.almanac;
    playChime();
    this.playHubActorAction(station.x, true);
    this.pulseStation(station);
    this.playUtilityStationExitWake(station, "book");
    this.time.delayedCall(210, () => {
      // Keep the chamber and the initiating station beneath the book overlay,
      // with exclusive typing until it closes.
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.almanacOverlayOpen = true;
      this.scene.launch("AlmanacScene", { store: this.store, overlay: true });
      this.scene.pause();
    });
  }

  private resumeAfterAlmanac(): void {
    // Blur/pause may resume the chamber during the book's short opening beat.
    // Only an overlay that actually launched owns this return transition.
    if (!this.almanacOverlayOpen) return;
    this.almanacOverlayOpen = false;
    this.openingUtilityScene = false;
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    // Rebuild the initiating station after its completed word is gone.
    this.enterZone(this.almanacReturnZone ?? "desk", false);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    // Ctrl+Shift+P: toggle purist mode from the hub too.
    if (isPuristToggleKey(event)) {
      event.preventDefault();
      const next = togglePuristMode(this, this.store, { announce: false });
      this.showHubDifficultyNotice(next);
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    const activeTyping = this.typingInput.hasClaim() || this.typingInput.getTypingBuffer().length > 0;
    const navigation = navigationAction(event, this.activeZone === "portals" ? "hub" : "hub-zone", activeTyping);
    if (navigation === "ignore") return;
    if (navigation === "back") {
      event.preventDefault();
      if (!this.openingUtilityScene) this.enterZone("portals");
      return;
    }
    if (this.chapterMenu?.handleKey(event)) return;
    if (event.key.length === 1 || event.key === " ") playClack();
    this.typingInput.handleChar(event.key);
  }

  private showHubDifficultyNotice(tier: Difficulty): void {
    this.difficultyNotice?.destroy();

    const station = HUB_STATIONS.account;
    const width = 236;
    const height = 46;
    const y =
      ACCOUNT_PANEL.y +
      ACCOUNT_PANEL.height / 2 +
      (this.activeZone === "account" ? 48 : 38);
    const container = this.add
      .container(station.x, y)
      .setDepth(12)
      .setAlpha(0)
      .setScale(0.96);

    const bg = this.add.graphics();
    bg.fillStyle(UI_HEX.panel, 0.78);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    bg.lineStyle(1.5, UI_HEX.brass, 0.66);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);

    const corners = cornerTicks(this, width - 12, height - 10, {
      inset: 4,
      size: 8,
      width: 1,
    }).setAlpha(0.62);
    const text = this.add
      .text(0, 0, `difficulty: ${difficultyLabel(tier)}`, {
        fontFamily: SERIF,
        fontSize: "17px",
        fontStyle: "italic",
        color: tier === "forgiving" ? PALETTE.brass : PALETTE.ember,
      })
      .setOrigin(0.5);
    container.add([bg, corners, text]);
    this.difficultyNotice = container;

    this.focusStation(station);
    this.pulseStation(station);

    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: y - 6,
      duration: 180,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(1250, () => {
      if (this.difficultyNotice !== container || !container.active) return;
      this.tweens.add({
        targets: container,
        alpha: 0,
        y: y - 12,
        duration: 220,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (this.difficultyNotice === container) this.difficultyNotice = undefined;
          container.destroy();
        },
      });
    });
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
      this.renderArch(
        arch,
        isNext ? "next" : isCleared ? "cleared" : isLocked ? "locked" : "dark",
      );
    });
  }

  private drawArch(spec: ArchSpec): void {
    // Keep the painted opening as the portal's sole frame.
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
    decorativeTween(this, this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.36 },
      scaleX: { from: 0.97, to: 1.04 },
      scaleY: { from: 0.98, to: 1.03 },
      duration: 1900 + stagger,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    }));

    // Painted portal sprite — 168x338 frames, arch fills the frame top to
    // bottom. Anchored bottom-center on the painted arch bottom (baseY).
    // Fit the swirl to the measured inner aperture, leaving the painted
    // stone surround visible. A mask prevents light spilling onto the frame.
    const sprite = this.add
      .sprite(spec.x, spec.baseY, "portal-active", 0)
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(-5);
    sprite.setScale(spec.width / 168, spec.height / 338);
    const aperture = this.make.graphics({ x: 0, y: 0 }, false);
    aperture.fillStyle(0xffffff);
    aperture.fillRoundedRect(spec.x - spec.width / 2, spec.baseY - spec.height,
      spec.width, spec.height, { tl: spec.width / 2, tr: spec.width / 2, bl: 7, br: 7 });
    const mask = aperture.createGeometryMask();
    sprite.setMask(mask);
    glow.setMask(mask);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sprite.clearMask();
      glow.clearMask();
      mask.destroy();
      aperture.destroy();
    });
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
    this.tweens.killTweensOf(sprite);
    g.clear();

    if (state === "locked" || state === "dark") {
      glow?.setVisible(false);
      sprite.setVisible(false);
      if (sprite.anims.isPlaying) sprite.stop();
      return;
    }

    if (state === "cleared") {
      // A dim version of the same painted swirl means this passage is still
      // usable. The keystone carries completion; blue remains the next call.
      if (glow) {
        this.drawPortalGlow(glow, spec, PALETTE_HEX.brass, 0.1);
        glow.setVisible(true);
      }
      sprite.setVisible(true).setTint(0xe9b56b);
      sprite.setScale(spec.width / 168, spec.height / 338);
      sprite.setAlpha(this.focusedCompletedPortal === spec.id
        ? COMPLETED_PORTAL_FOCUS_ALPHA : COMPLETED_PORTAL_ALPHA);
      this.setPortalSpin(sprite, 0.25);
      return;
    }

    // state === "next": full-strength painted swirl, animated.
    if (glow) {
      this.drawPortalGlow(glow, spec, 0x84d681, 0.48);
      glow.setVisible(true);
    }
    sprite.setVisible(true);
    sprite.setScale(spec.width / 168, spec.height / 338);
    sprite.clearTint();
    sprite.setAlpha(1);
    this.setPortalSpin(sprite, 1);
  }

  private setPortalSpin(sprite: Phaser.GameObjects.Sprite, speed: number): void {
    if (reducedMotion(this)) {
      sprite.stop().setFrame(0);
      return;
    }
    if (!sprite.anims.isPlaying) sprite.play("portal-spin");
    sprite.anims.timeScale = speed;
  }

  private setCompletedPortalFocus(arch: ArchSpec, focused: boolean): void {
    if (!this.store.get().realms[arch.id]?.cleared) return;
    if (focused && this.focusedCompletedPortal === arch.id) return;
    if (!focused && this.focusedCompletedPortal !== arch.id) return;
    this.focusedCompletedPortal = focused ? arch.id : null;
    const sprite = this.archSprites.get(arch.id);
    if (!sprite?.active) return;
    this.tweens.killTweensOf(sprite);
    const alpha = focused ? COMPLETED_PORTAL_FOCUS_ALPHA : COMPLETED_PORTAL_ALPHA;
    if (reducedMotion(this)) sprite.setAlpha(alpha);
    else this.tweens.add({ targets: sprite, alpha, duration: 160, ease: "Sine.easeOut" });
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
      const isCleared = state.realms[arch.id]?.cleared === true;
      const isNext = !isCleared && i === nextIdx;

      this.drawArchKeystone(arch, isCleared ? "cleared" : isNext ? "next" : "locked");

      if (isNext) {
        this.drawArchStatusPlaque(arch, "type to enter", "", "next");
      }
    });
  }

  private drawArchKeystone(
    arch: ArchSpec,
    tone: "next" | "cleared" | "locked",
  ): void {
    const x = arch.x;
    // The existing trapezoidal stone is centered at source y311 (game y357).
    // Engrave its face directly; do not add a badge or another stone surround.
    const y = arch.baseY - arch.height - 21;
    const cleared = tone === "cleared";
    const color = cleared ? 0xe0bf70 : tone === "next" ? 0x9bdaed : 0x8b877d;
    const alpha = tone === "locked" ? 0.64 : 0.96;
    const g = this.add.graphics().setDepth(-1);

    if (tone !== "locked") {
      g.fillStyle(color, 0.08);
      g.fillEllipse(x, y - 2, 26, 30);
    }
    // A recessed edge keeps even the unlit glyph legible against painted stone.
    this.drawKeystoneGlyph(g, arch.glyph, x + 0.8, y - 1.2, 0x080a0c, 0.8);
    this.drawKeystoneGlyph(g, arch.glyph, x, y - 2, color, alpha);

    if (cleared) {
      // Shape as well as color distinguishes a finished realm from an open one.
      g.lineStyle(1.7, color, 1);
      g.beginPath();
      g.moveTo(x - 4, y + 11);
      g.lineTo(x - 1, y + 14);
      g.lineTo(x + 5, y + 9);
      g.strokePath();
    }
  }

  private drawKeystoneGlyph(
    g: Phaser.GameObjects.Graphics,
    glyph: ArchSpec["glyph"],
    x: number,
    y: number,
    color: number,
    alpha: number,
  ): void {
    g.lineStyle(1.8, color, alpha);
    const path = (points: readonly (readonly [number, number])[]) => {
      g.beginPath();
      points.forEach(([dx, dy], i) => i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy));
      g.strokePath();
    };
    switch (glyph) {
      case "mountain":
        path([[-10, 8], [-1, -9], [9, 8], [-10, 8]]);
        path([[-5, -1], [-1, 1], [3, -1]]);
        break;
      case "bell":
        path([[-9, 6], [-6, 2], [-6, -3], [-3, -7], [3, -7], [6, -3], [6, 2], [9, 6], [-9, 6]]);
        g.lineBetween(x, y - 10, x, y - 7);
        g.lineBetween(x - 2, y + 9, x + 2, y + 9);
        break;
      case "cog":
        g.strokeCircle(x, y, 6);
        g.strokeCircle(x, y, 2);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          g.lineBetween(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7,
            x + Math.cos(angle) * 10, y + Math.sin(angle) * 10);
        }
        break;
      case "lantern":
        // Peaked roof and tapered cage distinguish this from a padlock.
        path([[-9, -4], [0, -10], [9, -4], [-9, -4]]);
        path([[-7, -3], [-5, 8], [5, 8], [7, -3]]);
        path([[0, -1], [2, 3], [0, 6], [-2, 3], [0, -1]]);
        break;
      case "branch":
        path([[0, 9], [0, -9]]);
        path([[0, -3], [-8, -8], [-7, -2], [0, 2]]);
        path([[0, 2], [8, -4], [7, 2], [0, 6]]);
        break;
    }
  }

  private drawArchStatusPlaque(
    arch: ArchSpec,
    title: string,
    subtitle: string,
    tone: "next" | "cleared" | "locked",
  ): void {
    const width = arch.width - 18;
    const height = subtitle ? 50 : 30;
    // The entry hint stays inside the opening; the typed name sits above it.
    const y = arch.baseY - 64;
    const isLocked = tone === "locked";
    const alpha = isLocked ? 0.24 : tone === "next" ? 0.78 : 0.34;
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

    const titleText = this.add
      .text(arch.x, y - (subtitle ? 9 : 1), title, {
        fontFamily: SERIF,
        fontSize: "14px",
        fontStyle: "italic",
        color: textColor,
      })
      .setOrigin(0.5)
      .setDepth(0);
    if (tone === "next") this.portalInstructionObjects.push(g, titleText);

    if (!subtitle) return;
    const subtitleText = this.add
      .text(arch.x, y + 13, subtitle, {
        fontFamily: SERIF,
        fontSize: "14px",
        color: tone === "next" ? PALETTE.cream : "#4a4352",
      })
      .setOrigin(0.5)
      .setDepth(0);
    if (tone === "next") this.portalInstructionObjects.push(subtitleText);
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

    if (this.store.get().realms[arch.id]?.cleared) {
      // Arrival also calls this helper; sustained emphasis belongs only to an
      // actual claimed word, set explicitly by that word's onClaim callback.
      return;
    }

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
    this.add
      .image(0, 0, "hub-backdrop")
      .setOrigin(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-100);
    // Architecture and its masks/labels share one stationary painted frame.
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
    this.startHubForegroundLife();

    this.drawHubStations();
  }

  private startHubForegroundLife(): void {
    const deskLight = this.add.container(178, 694);
    addContainerWake(this, deskLight, {
      kind: "ember",
      intervalMs: 560,
      spreadX: 36,
      spreadY: 18,
      color: 0xf2be68,
      alpha: 0.24,
      size: 2.7,
      depth: -1.2,
      driftX: 18,
      driftY: -34,
      durationMs: 1150,
    });

    const portalFloor = this.add.container(HUB_STATIONS.portalFloor.x, HUB_STATIONS.portalFloor.y - 292);
    addContainerWake(this, portalFloor, {
      kind: "mote",
      intervalMs: 470,
      spreadX: 230,
      spreadY: 38,
      color: 0x78c980,
      alpha: 0.16,
      size: 3.1,
      depth: -1.15,
      driftX: 28,
      driftY: -46,
      durationMs: 1300,
    });

    const shelfGlints = this.add.container(SHELF_STATION.x, SHELF_STATION.summaryY - 18);
    addContainerWake(this, shelfGlints, {
      kind: "mote",
      intervalMs: 720,
      spreadX: 92,
      spreadY: 42,
      color: UI_HEX.brass,
      alpha: 0.18,
      size: 2.4,
      depth: -1.05,
      driftX: 20,
      driftY: -28,
      durationMs: 1050,
    });
  }

  private drawHubStations(): void {
    this.drawStationPlaque(
      HUB_STATIONS.desk.x,
      HUB_STATIONS.desk.y,
      HUB_STATIONS.desk.width,
      HUB_STATIONS.desk.height,
      "runa's desk",
      { alpha: 0.035, labelAlpha: 0 },
    );
    this.drawStationPlaque(
      HUB_STATIONS.almanac.x,
      HUB_STATIONS.almanac.y,
      HUB_STATIONS.almanac.width,
      HUB_STATIONS.almanac.height,
      "almanac",
      { alpha: 0.04, labelAlpha: 0 },
    );
    this.drawStationPlaque(
      HUB_STATIONS.shelf.x,
      HUB_STATIONS.shelf.y,
      HUB_STATIONS.shelf.width,
      HUB_STATIONS.shelf.height,
      "your shelf",
      { alpha: 0.055, labelAlpha: 0 },
    );
    this.drawStationPlaque(
      HUB_STATIONS.account.x,
      HUB_STATIONS.account.y,
      HUB_STATIONS.account.width,
      HUB_STATIONS.account.height,
      "profile",
      {
        alpha: 0.07,
        labelAlpha: 0,
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
    g.lineStyle(1, UI_HEX.brass, Math.min(0.32, alpha + 0.06));
    g.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 8);

    cornerTicks(this, width, height, { inset: 5, size: 8, width: 1 })
      .setPosition(x, y)
      .setAlpha(Math.min(0.48, alpha + 0.05))
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
    if (this.store.get().realms[arch.id]?.cleared) return;
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
    this.playHubArrivalMaterialize(sourceX, color);
  }

  /** A realm return resolves at the portal floor before the hub settles. This
   * keeps the existing source-to-Wren flecks from reading as a detached overlay. */
  private playHubArrivalMaterialize(sourceX: number, color: number): void {
    if (!this.wrenContainer?.active || !this.wrenSprite?.active) return;

    const landingX = this.wrenContainer.x;
    const landingY = WREN_Y;
    const faceLeft = sourceX < landingX;
    this.tweens.killTweensOf(this.wrenContainer);
    setWrenPose(this.wrenSprite, "front", faceLeft);
    this.wrenContainer
      .setPosition(landingX, landingY + 16)
      .setScale(0.92)
      .setAlpha(0);

    this.time.delayedCall(150, () => {
      if (!this.wrenContainer?.active || !this.wrenSprite?.active) return;
      playSceneEventPulse(this, {
        kind: "mote",
        color,
        x: landingX,
        y: landingY - 8,
        depth: 8,
        durationMs: 460,
        ringWidth: 116,
        ringHeight: 34,
        count: 5,
        alpha: 0.075,
        spreadX: 38,
        spreadY: 12,
      });
      this.tweens.add({
        targets: this.wrenContainer,
        y: landingY,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 460,
        ease: "Sine.easeOut",
        onComplete: () => {
          if (!this.wrenContainer?.active || !this.wrenSprite?.active) return;
          setWrenPose(this.wrenSprite, "front", faceLeft);
          playWrenFocus(this.wrenSprite, { faceLeft, durationMs: 150 });
          addIdleBreath(this, this.wrenContainer, { dy: -4, durationMs: 2100 });
        },
      });
    });
  }

  private playHubInitialRoomWake(): void {
    if (this.hubArrival || this.activeZone !== "portals") return;

    const state = this.store.get();
    const firstUnclearedIdx = REALM_SEQUENCE.findIndex(
      (id) => !state.realms[id]?.cleared,
    );
    const nextAvailableIdx = firstUnclearedIdx === -1
      ? REALM_SEQUENCE.length
      : firstUnclearedIdx;

    this.time.delayedCall(280, () => {
      if (this.activeZone !== "portals" || !this.wrenContainer.scene) return;

      if (nextAvailableIdx < REALM_SEQUENCE.length) {
        const arch = ARCHES[nextAvailableIdx]!;
        const sourceX = arch.x;
        const sourceY = arch.baseY - arch.height / 2 + 34;

        this.focusPortalForScene(arch.sceneKey);
        this.pulseStation(HUB_STATIONS.portalFloor);
        playSceneEventPulse(this, {
          kind: "mote",
          color: UI_HEX.brass,
          x: sourceX,
          y: sourceY,
          depth: 6,
          durationMs: 620,
          ringWidth: arch.width * 0.58,
          ringHeight: arch.height * 0.36,
          count: 7,
          alpha: 0.085,
          spreadX: arch.width * 0.22,
          spreadY: arch.height * 0.1,
        });
        this.playHubArrivalFlecks(
          sourceX,
          sourceY,
          this.wrenContainer.x,
          this.wrenContainer.y - 112,
          UI_HEX.brass,
        );
        return;
      }

      const battleCleared = !!state.realms["great-battle"]?.cleared;
      const color = battleCleared ? UI_HEX.brass : 0x8b6ad8;
      const sourceX = HUB_STATIONS.portalFloor.x;
      const sourceY = HUB_STATIONS.portalFloor.y - 268;

      this.focusStation(HUB_STATIONS.portalFloor);
      playSceneEventPulse(this, {
        kind: "mote",
        color,
        x: sourceX,
        y: sourceY,
        depth: 6,
        durationMs: 660,
        ringWidth: 330,
        ringHeight: 110,
        count: 8,
        alpha: 0.09,
        spreadX: 130,
        spreadY: 44,
      });
      this.playHubArrivalFlecks(
        sourceX,
        sourceY,
        this.wrenContainer.x,
        this.wrenContainer.y - 112,
        color,
      );
    });
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

  private openUtilityScene(
    sceneKey: "AlmanacScene" | "SettingsScene",
    station: StationSpec,
    opts: {
      kind: "book" | "ledger";
      includeRuna?: boolean;
      playChime?: boolean;
      pulseStation?: boolean;
    },
  ): void {
    if (this.openingUtilityScene) return;
    this.openingUtilityScene = true;
    if (opts.playChime) playChime();
    this.playHubActorAction(station.x, opts.includeRuna === true);
    if (opts.pulseStation !== false) this.pulseStation(station);
    this.playUtilityStationExitWake(station, opts.kind);
    this.time.delayedCall(210, () => {
      this.cameras.main.fadeOut(430, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => this.scene.start(sceneKey, { store: this.store }),
      );
    });
  }

  private playUtilityStationExitWake(station: StationSpec, kind: "book" | "ledger"): void {
    const width = station.width + (kind === "book" ? 36 : 24);
    const height = station.height + (kind === "book" ? 26 : 20);
    const frame = this.add.container(station.x, station.y).setDepth(12).setAlpha(0.64);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.panel, 0.12);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 9);
    g.lineStyle(2, UI_HEX.brass, 0.62);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 9);
    g.lineStyle(1, UI_HEX.parchment, 0.26);
    if (kind === "book") {
      g.lineBetween(0, -height / 2 + 9, 0, height / 2 - 9);
      g.lineBetween(-width / 2 + 18, -height / 2 + 14, -width / 2 + 18, height / 2 - 14);
      g.lineBetween(width / 2 - 18, -height / 2 + 14, width / 2 - 18, height / 2 - 14);
    } else {
      for (const y of [-height * 0.22, 0, height * 0.22]) {
        g.lineBetween(-width / 2 + 20, y, width / 2 - 20, y);
      }
    }
    frame.add(g);
    frame.add(
      cornerTicks(this, width, height, {
        inset: 5,
        size: 10,
        width: 2,
      }),
    );

    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 0.92,
      scaleY: 1.08,
      duration: 390,
      ease: "Sine.easeInOut",
      onComplete: () => frame.destroy(),
    });

    for (let i = 0; i < 9; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const fromX = station.x + side * (station.width * 0.18 + (i % 3) * 8);
      const fromY = station.y - station.height * 0.12 + (i % 3) * 7;
      const fleck = this.add.graphics().setPosition(fromX, fromY).setDepth(13).setAlpha(0.72);
      fleck.fillStyle(i % 3 === 0 ? UI_HEX.parchment : UI_HEX.brass, 0.74);
      fleck.fillCircle(0, 0, 2.2 + (i % 3) * 0.6);
      this.tweens.add({
        targets: fleck,
        x: station.x + side * (18 + i * 2),
        y: station.y - station.height * 1.18 - i * 3,
        alpha: 0,
        scaleX: 0.35,
        scaleY: 0.35,
        duration: 290 + i * 16,
        delay: i * 12,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }
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

  /** Painted Runa stands at her desk on the far left of the hub. */
  private drawRuna(): void {
    addGroundShadow(this, 250, 1016, 140, 22, { depth: -1, alpha: 0.34 });
    const img = this.add
      .image(250, 1010, "runa-sprite")
      .setOrigin(0.5, 1);
    this.runaSprite = img;
    // Foreground desk space leaves the first arch and its nameplate readable.
    img.setScale(280 / img.height);
    applySceneActorLighting(this, img);
    addIdleBreath(this, img, { dy: -4, durationMs: 2200, delayMs: 300 });
    addContainerWake(this, img, {
      kind: "mote",
      intervalMs: 860,
      spreadX: 28,
      spreadY: 18,
      offsetY: -176,
      color: UI_HEX.brass,
      alpha: 0.18,
      size: 2.6,
      depth: 0.2,
      driftX: 12,
      driftY: -26,
      durationMs: 900,
    });
  }

  /** Collected keepsakes sit on the cabinet's painted shelf surfaces. */
  private drawDisplayShelf(): void {
    const items = this.store.get().satchel.filter(id => !!RELICS[id]);
    this.clearShelfDisplay();

    const label = this.add.text(SHELF_STATION.x, SHELF_STATION.summaryY,
      items.length ? `${items.length} keepsake${items.length === 1 ? "" : "s"} collected` : "Your shelf is empty", {
        fontFamily: SERIF, fontSize: "18px", color: PALETTE.cream, align: "center",
        stroke: "#0b0a0f", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(1);
    const hint = this.add.text(SHELF_STATION.x, SHELF_STATION.summaryY + 28,
      items.length ? "Read their stories in the" : "Find keepsakes beyond the portals.", {
        fontFamily: SERIF, fontSize: "15px", fontStyle: "italic", color: PALETTE.cream,
        align: "center", stroke: "#0b0a0f", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(1);
    this.shelfDisplayObjects.push(label, hint);
    this.stageShelfObject(label, 35);
    this.stageShelfObject(hint, 35);

    items.forEach((id, i) => {
      const relic = RELICS[id];
      const row = Math.floor(i / SHELF_GRID.cols);
      const iy = SHELF_GRID.rowY[row];
      if (iy === undefined) return;
      const ix = SHELF_GRID.startX + (i % SHELF_GRID.cols) * SHELF_GRID.colGap;
      const tile = this.add.container(ix, iy).setDepth(1).setAlpha(0.95);
      this.shelfDisplayObjects.push(tile);
      this.stageShelfObject(tile, 80 + i * 28);
      const shadow = this.add.graphics();
      shadow.fillStyle(0x080807, 0.45);
      shadow.fillEllipse(0, 13, 23, 4);
      tile.add(shadow);
      const icon = satchelIconFor(id);
      if (icon && this.textures.exists(icon.key)) {
        const img = this.add.image(0, 0, icon.key);
        img.setScale(Math.min(SHELF_GRID.iconSize / img.width, SHELF_GRID.iconSize / img.height));
        tile.add(img);
      } else {
        tile.add(this.add.text(0, 0, relic.name.slice(0, 1), {
          fontFamily: SERIF, fontSize: "20px", color: PALETTE.brass,
        }).setOrigin(0.5));
      }
      // Keepsakes rest on wood; no floating tiles or independent idle bob.
    });
  }

  private clearShelfDisplay(): void {
    for (const obj of this.shelfDisplayObjects) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.shelfDisplayObjects = [];
  }

  private stageShelfObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      setAlpha: (value: number) => Phaser.GameObjects.GameObject;
    };
    if (!item.setAlpha) return;

    const finalAlpha = item.alpha;
    item.setAlpha(0);
    this.time.delayedCall(delayMs, () => {
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        duration: 210,
        ease: "Sine.easeOut",
      });
    });
  }

  private playShelfDisplayWake(): void {
    const frame = this.add
      .container(SHELF_STATION.x, SHELF_STATION.y)
      .setDepth(8)
      .setAlpha(0.5);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.035);
    g.fillRoundedRect(
      -SHELF_STATION.width / 2,
      -SHELF_STATION.height / 2,
      SHELF_STATION.width,
      SHELF_STATION.height,
      10,
    );
    g.lineStyle(1.5, UI_HEX.brass, 0.48);
    g.strokeRoundedRect(
      -SHELF_STATION.width / 2,
      -SHELF_STATION.height / 2,
      SHELF_STATION.width,
      SHELF_STATION.height,
      10,
    );
    frame.add(g);
    frame.add(
      cornerTicks(this, SHELF_STATION.width, SHELF_STATION.height, {
        inset: 5,
        size: 11,
        width: 2,
      }),
    );
    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 1.04,
      scaleY: 1.08,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => frame.destroy(),
    });
  }

  // ─── Wren character ───────────────────────────────────────────────────────

  // ─── New Game+ ────────────────────────────────────────────────────────────

  private async startNewGame(): Promise<void> {
    if (this.restartingNewGame) return;
    this.restartingNewGame = true;
    playChime();
    this.narration.clear();
    // Preserve identity/calibration and comfort settings, never chapter state.
    resetSave(this.store, true);
    try {
      await this.store.flush();
    } catch {
      if (!this.scene.isActive()) return;
      this.restartingNewGame = false;
      this.clearZoneTargets();
      this.narration.sayRaw("Could not finish saving the fresh start. Type retry to try again. Your current session is still here.");
      const retry = new TextWordTarget({
        scene: this, word: "retry", x: this.scale.width / 2, y: PORTAL_CALL_WORD_Y,
        fontSize: 34, outline: true, frame: "banner",
        onComplete: () => { void this.startNewGame(); },
      });
      this.typingInput.register(retry);
      this.zoneTargets.push(retry);
      return;
    }
    if (!this.scene.isActive()) return;
    this.playBeginAgainWake();
    this.time.delayedCall(320, () => {
      this.cameras.main.fadeOut(720, 10, 8, 15);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("OpeningScene", { store: this.store });
      });
    });
  }

  private playBeginAgainWake(): void {
    const cx = HUB_STATIONS.portalFloor.x;
    const cy = HUB_STATIONS.portalFloor.y - 268;
    const wash = this.add.graphics().setDepth(6).setAlpha(0);
    wash.fillStyle(0x0b0a0f, 0.22);
    wash.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: wash,
      alpha: 0.18,
      duration: 120,
      hold: 180,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => wash.destroy(),
    });

    const seal = this.add.container(cx, cy).setDepth(12).setAlpha(0.76);
    const g = this.add.graphics();
    g.fillStyle(UI_HEX.brass, 0.075);
    g.fillEllipse(0, 0, 420, 132);
    g.lineStyle(2, UI_HEX.brass, 0.6);
    g.strokeEllipse(0, 0, 430, 132);
    g.lineStyle(1, UI_HEX.parchment, 0.42);
    g.strokeEllipse(0, 0, 250, 74);
    g.lineBetween(-120, 0, 120, 0);
    g.lineBetween(0, -34, 0, 34);
    seal.add(g);
    seal.add(
      cornerTicks(this, 330, 98, {
        inset: 4,
        size: 12,
        width: 2,
      }),
    );

    this.tweens.add({
      targets: seal,
      alpha: 0,
      scaleX: 0.72,
      scaleY: 1.08,
      duration: 520,
      ease: "Sine.easeInOut",
      onComplete: () => seal.destroy(),
    });

    for (let i = 0; i < 10; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const startX = cx + side * (48 + (i % 4) * 18);
      const startY = cy + Math.sin(i) * 22;
      const fleck = this.add.graphics().setPosition(startX, startY).setDepth(13).setAlpha(0.72);
      fleck.fillStyle(i % 3 === 0 ? UI_HEX.parchment : UI_HEX.brass, 0.78);
      fleck.fillCircle(0, 0, 2.3 + (i % 3) * 0.7);
      this.tweens.add({
        targets: fleck,
        x: cx + side * (12 + i),
        y: cy - 34 - i * 3,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 300 + i * 18,
        delay: i * 12,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }

    if (this.wrenContainer?.active) {
      const startX = this.wrenContainer.x;
      const startY = this.wrenContainer.y;
      this.tweens.killTweensOf(this.wrenContainer);
      this.tweens.add({
        targets: this.wrenContainer,
        x: startX + (cx - startX) * 0.04,
        y: startY - 8,
        alpha: 0.9,
        duration: 320,
        ease: "Sine.easeInOut",
      });
    }
  }

  // ─── Wren character ───────────────────────────────────────────────────────

  private drawWren(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    c.add(addLocalGroundShadow(this, 94, 22, { y: 6, alpha: 0.32 }));
    this.wrenSprite = makeWrenSprite(this);
    c.add(this.wrenSprite);
    addIdleBreath(this, c, { dy: -4, durationMs: 2100 });
    addContainerWake(this, c, {
      kind: "mote",
      intervalMs: 760,
      spreadX: 24,
      spreadY: 10,
      offsetY: -104,
      color: UI_HEX.brass,
      alpha: 0.16,
      size: 2.7,
      depth: 0.35,
      driftX: 12,
      driftY: -24,
      durationMs: 860,
    });
    return c;
  }
}

// Center the typed name above its arch, below the caption lane and clear of
// both the carved keystone and foreground furniture.
function archTargetY(arch: ArchSpec, _archIndex: number): number {
  return arch.baseY - arch.height - 80;
}
