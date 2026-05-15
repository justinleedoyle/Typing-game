import Phaser from "phaser";
import { type AmbientHandle, playAmbientHub } from "../audio/ambient";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
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

// Five arches, centre-left cluster — leaves room for desk (far left) and
// shelf (far right) in the same room without crowding.
const ARCHES: readonly ArchSpec[] = [
  { id: "winter-mountain", x: 390,  width: 220, height: 380, baseY: 820, label: "winter mountain", sceneKey: "WinterMountainScene"  },
  { id: "sunken-bell",     x: 625,  width: 200, height: 360, baseY: 820, label: "sunken bell",     sceneKey: "SunkenBellScene"      },
  { id: "clockwork-forge", x: 850,  width: 200, height: 360, baseY: 820, label: "clockwork forge", sceneKey: "ClockworkForgeScene"   },
  { id: "sky-island",      x: 1075, width: 200, height: 360, baseY: 820, label: "sky island",      sceneKey: "SkyIslandScene"        },
  { id: "haunted-wood",    x: 1300, width: 200, height: 360, baseY: 820, label: "haunted wood",    sceneKey: "HauntedWoodScene"      },
] as const;

const REALM_SEQUENCE = ARCHES.map((a) => a.id);

// Wren's X position when standing in each zone.
const ZONE_X: Record<Zone, number> = {
  desk:    160,
  portals: 790,
  shelf:   1750,
};
const WREN_Y = 870;

// Runa's desk contextual lines — one per last-cleared realm.
const RUNA_LINES: Record<string, string> = {
  none:              "The Winter Mountain is the closest. Its arch is lit. Go when you're ready.",
  "winter-mountain": "You carried something home from the mountain. I can still see the snow in it.",
  "sunken-bell":     "The bell is quiet now. I hear its absence from here — the silence it left behind.",
  "clockwork-forge": "The forge is breathing again. Whether that's Forn's work or yours, hard to tell.",
  "sky-island":      "Every page that ever lit — nothing burned is truly gone. She was right, you know.",
  "haunted-wood":    "The wood remembers everything. I found the Ghost-King's name once, in the margin of an old atlas.",
};

export class PortalChamberScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private archGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private hint!: Phaser.GameObjects.Text;
  private wrenContainer!: Phaser.GameObjects.Container;
  private zoneTargets: TextWordTarget[] = [];
  private ambientHandle?: AmbientHandle;

  constructor() {
    super("PortalChamberScene");
  }

  init(data: ChamberSceneData): void {
    this.store = data.store;
    this.archGraphics = new Map();
    this.zoneTargets = [];
  }

  create(): void {
    // Redirect first-time players to the opening cinematic.
    if (!this.store.get().typewriterAwakened) {
      this.scene.start("OpeningScene", { store: this.store });
      return;
    }

    this.drawRoom();
    this.drawRunaDesk();
    this.drawDisplayShelf();
    for (const arch of ARCHES) {
      this.drawArch(arch);
    }
    this.updateAllArchAppearances();
    this.drawArchLabels();

    this.wrenContainer = this.drawWren(ZONE_X.portals, WREN_Y);

    this.hint = this.add
      .text(this.scale.width / 2, this.scale.height - 68, "", {
        fontFamily: SERIF,
        fontSize: "24px",
        color: PALETTE.dim,
        align: "center",
        wordWrap: { width: 1200 },
      })
      .setOrigin(0.5);

    // Fragment display — shows the accumulating Quiet Lord word in the upper-
    // centre of the room, growing one letter per realm cleared.
    this.drawFragment();

    this.typingInput = new TypingInputController(this.store);
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
    if (!animate) {
      this.wrenContainer.x = targetX;
      return;
    }
    this.tweens.add({
      targets: this.wrenContainer,
      x: targetX,
      duration: 600,
      ease: "Sine.easeInOut",
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
        onComplete: () => this.onEnterPortal(arch.sceneKey, false),
      });
      this.typingInput.register(primary);
      this.zoneTargets.push(primary);
      this.hint.setText("type the glowing arch's name to step through  ·  backspace to cancel");
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
          onComplete: () => {
            this.cameras.main.fadeOut(600, 10, 8, 15);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
              this.scene.start("GreatBattleScene", { store: this.store });
            });
          },
        });
        this.typingInput.register(battleTarget);
        this.zoneTargets.push(battleTarget);
        this.hint.setText("all realms cleared — hearthward needs you");
      } else {
        // Battle cleared — show begin again target (New Game+).
        const ngPlusTarget = new TextWordTarget({
          scene: this,
          word: "begin again",
          x: this.scale.width / 2,
          y: 460,
          fontSize: 38,
          onComplete: () => this.startNewGame(),
        });
        this.typingInput.register(ngPlusTarget);
        this.zoneTargets.push(ngPlusTarget);
        this.hint.setText("the almanac is complete. type to begin a new run.");
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
        onComplete: () => this.onEnterPortal(arch.sceneKey, true),
      });
      this.typingInput.register(revisit);
      this.zoneTargets.push(revisit);
    }

    // Zone navigation (away from portals).
    this.registerNavTarget("runa", 950, 920, () => this.enterZone("desk"));
    this.registerNavTarget("shelf", 1530, 920, () => this.enterZone("shelf"));
  }

  // ─── Desk zone ────────────────────────────────────────────────────────────

  private registerDeskZoneTargets(): void {
    const state = this.store.get();
    const lastCleared = [...REALM_SEQUENCE]
      .reverse()
      .find((id) => state.realms[id]?.cleared) ?? "none";
    const line = RUNA_LINES[lastCleared] ?? RUNA_LINES["none"];

    this.hint.setText(`Runa: "${line}"`);

    this.registerNavTarget("back", ZONE_X.desk + 200, 920, () =>
      this.enterZone("portals"),
    );
  }

  // ─── Shelf zone ───────────────────────────────────────────────────────────

  private registerShelfZoneTargets(): void {
    const state = this.store.get();
    const items = state.satchel;

    if (items.length === 0) {
      this.hint.setText("your shelf is empty. bring something back from a realm.");
    } else {
      const names = items
        .map((id) => RELICS[id]?.name ?? id)
        .join(" · ");
      this.hint.setText(`on your shelf: ${names}`);
    }

    this.registerNavTarget("back", ZONE_X.shelf - 200, 920, () =>
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
  ): void {
    const t = new TextWordTarget({
      scene: this,
      word,
      x,
      y,
      fontSize: 26,
      priority: -2,
      onComplete,
    });
    this.typingInput.register(t);
    this.zoneTargets.push(t);
  }

  // ─── Portal entry ─────────────────────────────────────────────────────────

  private onEnterPortal(sceneKey: string, revisit: boolean): void {
    playChime();
    this.hint.setText("");
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
      x: 220,
      y: this.scale.height - 36,
      fontSize: 24,
      priority: -1,
      onComplete: () => this.openAlmanac(),
    });
    this.typingInput.register(target);
  }

  private async addAuthTarget(): Promise<void> {
    const name = await currentUserDisplayName();
    if (name) {
      this.add
        .text(this.scale.width - 40, 40, `signed in as ${name}`, {
          fontFamily: SERIF,
          fontSize: "20px",
          fontStyle: "italic",
          color: PALETTE.dim,
        })
        .setOrigin(1, 0);
      const target = new TextWordTarget({
        scene: this,
        word: "sign out",
        x: this.scale.width - 130,
        y: 90,
        fontSize: 22,
        priority: -1,
        onComplete: () => void signOut(),
      });
      this.typingInput.register(target);
    } else {
      this.add
        .text(this.scale.width - 40, 40, "saves stay on this device until you sign in", {
          fontFamily: SERIF,
          fontSize: "20px",
          fontStyle: "italic",
          color: PALETTE.dim,
        })
        .setOrigin(1, 0);
      const target = new TextWordTarget({
        scene: this,
        word: "sign in",
        x: this.scale.width - 110,
        y: 90,
        fontSize: 22,
        priority: -1,
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
    const g = this.add.graphics();
    this.archGraphics.set(spec.id, g);
  }

  private renderArch(
    spec: ArchSpec,
    state: "next" | "cleared" | "dark" | "locked",
  ): void {
    const g = this.archGraphics.get(spec.id);
    if (!g) return;
    g.clear();

    const left     = spec.x - spec.width / 2;
    const right    = spec.x + spec.width / 2;
    const base     = spec.baseY;
    const archMidY = (base - spec.height) + spec.width / 2;
    const radius   = spec.width / 2;

    // Stone surround — always drawn.
    g.fillStyle(0x1c1a26, 1);
    g.beginPath();
    g.moveTo(left - 14, base);
    g.lineTo(left - 14, archMidY);
    g.arc(spec.x, archMidY, radius + 14, Math.PI, 0, false);
    g.lineTo(right + 14, base);
    g.closePath();
    g.fillPath();

    // Inner portal surface.
    let innerColor: number;
    let innerAlpha: number;
    if (state === "next")    { innerColor = PALETTE_HEX.frost;  innerAlpha = 0.85; }
    else if (state === "cleared") { innerColor = PALETTE_HEX.brass;  innerAlpha = 0.55; }
    else if (state === "locked")  { innerColor = 0x100e18;           innerAlpha = 1;    }
    else                          { innerColor = 0x0e0c14;           innerAlpha = 1;    }

    g.fillStyle(innerColor, innerAlpha);
    g.beginPath();
    g.moveTo(left, base);
    g.lineTo(left, archMidY);
    g.arc(spec.x, archMidY, radius, Math.PI, 0, false);
    g.lineTo(right, base);
    g.closePath();
    g.fillPath();

    // Ripple rings for lit arches.
    if (state === "next") {
      g.lineStyle(2, PALETTE_HEX.cream, 0.4);
      g.beginPath(); g.arc(spec.x, archMidY + 60, radius * 0.6, 0, Math.PI * 2); g.strokePath();
      g.lineStyle(2, PALETTE_HEX.cream, 0.2);
      g.beginPath(); g.arc(spec.x, archMidY + 120, radius * 0.5, 0, Math.PI * 2); g.strokePath();
    } else if (state === "cleared") {
      // Warm amber ripple for revisitable realms.
      g.lineStyle(2, PALETTE_HEX.brass, 0.35);
      g.beginPath(); g.arc(spec.x, archMidY + 60, radius * 0.55, 0, Math.PI * 2); g.strokePath();
    }
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

      const labelColor = isNext ? PALETTE.cream : isCleared ? PALETTE.brass : isLocked ? "#3a3550" : PALETTE.dim;

      this.add
        .text(arch.x, arch.baseY + 30, arch.label, {
          fontFamily: SERIF,
          fontSize: "22px",
          fontStyle: "italic",
          color: labelColor,
        })
        .setOrigin(0.5);

      if (isCleared) {
        this.add
          .text(arch.x, arch.baseY + 58, "✓ stamped", {
            fontFamily: SERIF,
            fontSize: "17px",
            color: PALETTE.brass,
          })
          .setOrigin(0.5);
      } else if (isLocked) {
        this.add
          .text(arch.x, arch.baseY + 58, "sealed", {
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
    const g = this.add.graphics();

    // Back wall — deep ink with slight warmth.
    g.fillStyle(0x14121a, 1);
    g.fillRect(0, 0, this.scale.width, 380);

    // Bookshelves across the back (6 units).
    g.fillStyle(0x2a2018, 1);
    for (let i = 0; i < 6; i++) {
      g.fillRect(120 + i * 300, 100, 220, 240);
    }
    // Book spines suggested with brass slivers.
    g.fillStyle(PALETTE_HEX.brass, 0.35);
    for (let i = 0; i < 6; i++) {
      const sx = 120 + i * 300;
      for (let j = 0; j < 8; j++) {
        g.fillRect(sx + 14 + j * 26, 116 + (j % 2) * 8, 6, 200);
      }
    }

    // Floor — dark warm stone with a faint brass line at the wall seam.
    g.fillStyle(0x1a1714, 1);
    g.fillRect(0, 380, this.scale.width, this.scale.height - 380);
    g.fillStyle(PALETTE_HEX.brass, 0.4);
    g.fillRect(0, 380, this.scale.width, 2);

    // Ambient candlelight pools on the floor (three subtle ellipses).
    for (const cx of [390, 850, 1300]) {
      g.fillStyle(PALETTE_HEX.brass, 0.04);
      g.fillEllipse(cx, 820, 340, 60);
    }

    // Zone indicator labels — small, dim, permanent.
    const labelStyle = { fontFamily: SERIF, fontSize: "18px", color: "#3a3550", fontStyle: "italic" };
    this.add.text(155, 790, "runa's desk", labelStyle).setOrigin(0.5);
    this.add.text(1750, 790, "your shelf", labelStyle).setOrigin(0.5);
  }

  private drawRunaDesk(): void {
    const g = this.add.graphics();
    const cx = 155;

    // Desk surface.
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(cx - 120, 720, 240, 50);
    // Legs.
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(cx - 110, 770, 24, 200);
    g.fillRect(cx + 86, 770, 24, 200);

    // A quill in a pot.
    g.fillStyle(0x2a1f12, 1);
    g.fillCircle(cx - 60, 718, 10);
    g.lineStyle(1, PALETTE_HEX.cream, 0.6);
    g.beginPath();
    g.moveTo(cx - 60, 708);
    g.lineTo(cx - 52, 670);
    g.strokePath();

    // Runa silhouette — seated figure with blue coat.
    g.fillStyle(0x1e2d5a, 1);     // coat
    g.fillTriangle(cx + 30, 720, cx + 80, 720, cx + 55, 620);
    g.fillStyle(0x1a2548, 1);
    g.fillCircle(cx + 55, 615, 16); // head/hood
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(cx + 55, 610, 9);  // face
    // Astrolabe glint at belt.
    g.fillStyle(PALETTE_HEX.brass, 0.8);
    g.fillCircle(cx + 48, 700, 5);

    // A small open book on the desk.
    g.fillStyle(0xe8dcb5, 1);
    g.fillRect(cx - 10, 710, 50, 6);  // left page
    g.fillRect(cx + 62, 710, 50, 6);  // right page
    g.lineStyle(1, 0x3a2a1a, 0.5);
    g.moveTo(cx + 60, 708); g.lineTo(cx + 60, 716); g.strokePath();
  }

  private drawDisplayShelf(): void {
    const g = this.add.graphics();
    const cx = 1750;
    const state = this.store.get();

    // Cabinet frame.
    g.fillStyle(0x2a2018, 1);
    g.fillRect(cx - 130, 480, 260, 340);
    // Glass front (suggested with a slightly lighter rect).
    g.fillStyle(0x1e1c28, 0.7);
    g.fillRect(cx - 118, 492, 236, 316);
    // Shelves.
    g.fillStyle(0x3a2a18, 1);
    g.fillRect(cx - 118, 590, 236, 6);
    g.fillRect(cx - 118, 700, 236, 6);
    // Cabinet top and leg feet.
    g.fillStyle(PALETTE_HEX.brass, 0.5);
    g.fillRect(cx - 134, 476, 268, 4);
    g.fillRect(cx - 110, 820, 18, 30);
    g.fillRect(cx + 92, 820, 18, 30);

    // Items on shelves — drawn as small shaped icons in brass/cream.
    const items = state.satchel;
    items.forEach((id, i) => {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const ix = cx - 100 + col * 56;
      const iy = 510 + row * 108;
      // Small abstract icon (different shape per relic type).
      const relic = RELICS[id];
      if (!relic) return;
      g.fillStyle(PALETTE_HEX.brass, 0.75);
      if (id.includes("horn") || id.includes("flute")) {
        // Crescent arc
        g.fillEllipse(ix, iy, 28, 18);
      } else if (id.includes("token") || id.includes("key") || id.includes("pelt")) {
        // Round coin
        g.fillCircle(ix, iy, 12);
      } else if (id.includes("hammer") || id.includes("wrench") || id.includes("tongue")) {
        // Rectangle tool
        g.fillRect(ix - 6, iy - 14, 12, 28);
      } else if (id.includes("cub") || id.includes("fish") || id.includes("bird") || id.includes("moth") || id.includes("cat")) {
        // Star-ish companion dot with small petal marks
        g.fillCircle(ix, iy, 10);
        g.fillStyle(PALETTE_HEX.cream, 0.5);
        g.fillCircle(ix, iy, 5);
      } else {
        // Generic scroll/lore shape
        g.fillEllipse(ix, iy, 22, 30);
      }
    });

    if (items.length === 0) {
      this.add
        .text(cx, 650, "nothing yet", {
          fontFamily: SERIF,
          fontSize: "20px",
          fontStyle: "italic",
          color: "#3a3550",
        })
        .setOrigin(0.5);
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
    const g = this.add.graphics();
    // Cloak.
    g.fillStyle(0x6f8a5e, 1);
    g.fillTriangle(-28, 0, 28, 0, 0, -78);
    // Hood.
    g.fillStyle(0x4f6440, 1);
    g.fillCircle(0, -73, 17);
    // Face.
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(0, -66, 10);
    // Satchel strap.
    g.lineStyle(2, 0x3a2a1a, 1);
    g.beginPath();
    g.moveTo(-20, -38);
    g.lineTo(16, -10);
    g.strokePath();
    // Feet.
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(-12, 0, 10, 14);
    g.fillRect(2, 0, 10, 14);
    c.add(g);
    return c;
  }
}

// Stagger arch typing-target Y positions so adjacent labels don't overlap.
// Odd-indexed arches sit slightly higher than even-indexed ones.
function archTargetY(archIndex: number): number {
  const BASE_Y = 820; // arch.baseY
  const HEIGHT = 360; // arch.height (typical)
  const base = BASE_Y - HEIGHT - 50;
  return archIndex % 2 === 0 ? base : base - 36;
}
