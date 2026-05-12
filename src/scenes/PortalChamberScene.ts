import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { playChime } from "../audio/chime";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";

interface ChamberSceneData {
  store: SaveStore;
}

const TYPEWRITER = { x: 1100, y: 700, w: 200, h: 70 };
const DESK = { x: 1100, y: 770, w: 520, h: 50 };

interface ArchSpec {
  id: string;
  x: number;
  width: number;
  height: number;
  baseY: number;
  label: string;
}

const ARCHES: ArchSpec[] = [
  {
    id: "winter-mountain",
    x: 360,
    width: 280,
    height: 460,
    baseY: 820,
    label: "winter mountain",
  },
  { id: "future-1", x: 760, width: 240, height: 400, baseY: 820, label: "" },
  { id: "future-2", x: 1620, width: 240, height: 400, baseY: 820, label: "" },
];

export class PortalChamberScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private typewriterGraphics!: Phaser.GameObjects.Graphics;
  private archGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  private hint!: Phaser.GameObjects.Text;
  private currentTarget?: TextWordTarget;

  constructor() {
    super("PortalChamberScene");
  }

  init(data: ChamberSceneData): void {
    this.store = data.store;
  }

  create(): void {
    this.drawRoom();
    this.drawDesk();
    this.drawTypewriter();
    for (const arch of ARCHES) {
      this.drawArch(arch);
    }

    this.hint = this.add
      .text(this.scale.width / 2, this.scale.height - 80, "", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: PALETTE.dim,
      })
      .setOrigin(0.5);

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    if (this.store.get().typewriterAwakened) {
      this.setTypewriterAwake(true);
      this.askForPortalName();
    } else {
      this.askToWakeTypewriter();
    }
  }

  private askToWakeTypewriter(): void {
    this.hint.setText(
      "type the word above the brass typewriter to wake it",
    );
    this.currentTarget = new TextWordTarget({
      scene: this,
      word: "wake",
      x: TYPEWRITER.x,
      y: TYPEWRITER.y - 90,
      onComplete: () => this.onTypewriterAwakened(),
    });
    this.typingInput.register(this.currentTarget);
  }

  private onTypewriterAwakened(): void {
    playChime();
    this.store.update((s) => {
      s.typewriterAwakened = true;
    });
    this.setTypewriterAwake(true);
    this.time.delayedCall(700, () => this.askForPortalName());
  }

  private askForPortalName(): void {
    const arch = ARCHES[0];
    this.lightArch(arch.id, true);
    this.hint.setText("an arch is glowing — type its name to step through");
    this.currentTarget = new TextWordTarget({
      scene: this,
      word: "the winter mountain",
      x: arch.x,
      y: arch.baseY - arch.height - 60,
      fontSize: 36,
      onComplete: () => this.onEnterPortal(),
    });
    this.typingInput.register(this.currentTarget);
  }

  private onEnterPortal(): void {
    playChime();
    this.hint.setText("");
    this.cameras.main.fadeOut(500, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start("WinterMountainScene", { store: this.store });
      },
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  private drawRoom(): void {
    const g = this.add.graphics();
    // Back wall: a band of warmer ink to suggest depth.
    g.fillStyle(0x14121a, 1);
    g.fillRect(0, 0, this.scale.width, 380);
    // A row of bookshelves along the back wall.
    g.fillStyle(0x2a2018, 1);
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 300;
      g.fillRect(x, 100, 220, 240);
    }
    // Faint vertical book spines, suggested with brass slivers.
    g.fillStyle(PALETTE_HEX.brass, 0.35);
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 300;
      for (let j = 0; j < 8; j++) {
        g.fillRect(x + 14 + j * 26, 116 + (j % 2) * 8, 6, 200);
      }
    }
    // Floor band: a slim brass line where wall meets floor.
    g.fillStyle(PALETTE_HEX.brass, 0.4);
    g.fillRect(0, 380, this.scale.width, 2);
  }

  private drawDesk(): void {
    const g = this.add.graphics();
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(DESK.x - DESK.w / 2, DESK.y, DESK.w, DESK.h);
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(DESK.x - DESK.w / 2 + 20, DESK.y + DESK.h, 30, 220);
    g.fillRect(DESK.x + DESK.w / 2 - 50, DESK.y + DESK.h, 30, 220);
  }

  private drawTypewriter(): void {
    this.typewriterGraphics = this.add.graphics();
    this.setTypewriterAwake(false);
  }

  private setTypewriterAwake(awake: boolean): void {
    const g = this.typewriterGraphics;
    g.clear();
    const baseColor = awake ? PALETTE_HEX.brass : 0x4a3a22;
    const accent = awake ? PALETTE_HEX.cream : 0x6a543a;
    // Body
    g.fillStyle(baseColor, 1);
    g.fillRect(
      TYPEWRITER.x - TYPEWRITER.w / 2,
      TYPEWRITER.y - TYPEWRITER.h,
      TYPEWRITER.w,
      TYPEWRITER.h,
    );
    // Roller bar across the top
    g.fillStyle(accent, 1);
    g.fillRect(
      TYPEWRITER.x - TYPEWRITER.w / 2 - 6,
      TYPEWRITER.y - TYPEWRITER.h - 8,
      TYPEWRITER.w + 12,
      8,
    );
    // Suggest keys: small dots in a 2-row grid.
    g.fillStyle(accent, 0.8);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 9; col++) {
        const x = TYPEWRITER.x - TYPEWRITER.w / 2 + 16 + col * 20;
        const y = TYPEWRITER.y - TYPEWRITER.h + 18 + row * 16;
        g.fillCircle(x, y, 4);
      }
    }
    if (awake) {
      // A soft glow halo: a few translucent expanding rings.
      g.lineStyle(2, PALETTE_HEX.brass, 0.25);
      g.strokeCircle(TYPEWRITER.x, TYPEWRITER.y - TYPEWRITER.h / 2, 110);
      g.strokeCircle(TYPEWRITER.x, TYPEWRITER.y - TYPEWRITER.h / 2, 130);
    }
  }

  private drawArch(spec: ArchSpec): void {
    const g = this.add.graphics();
    this.archGraphics.set(spec.id, g);
    this.renderArch(spec, false);
  }

  private lightArch(id: string, lit: boolean): void {
    const spec = ARCHES.find((a) => a.id === id);
    if (!spec) return;
    this.renderArch(spec, lit);
  }

  private renderArch(spec: ArchSpec, lit: boolean): void {
    const g = this.archGraphics.get(spec.id);
    if (!g) return;
    g.clear();

    const left = spec.x - spec.width / 2;
    const right = spec.x + spec.width / 2;
    const base = spec.baseY;
    const top = base - spec.height;
    const archMidY = top + spec.width / 2;
    const radius = spec.width / 2;

    // Stone arch outline (darker; always visible).
    const stoneColor = 0x1c1a26;
    g.fillStyle(stoneColor, 1);
    g.beginPath();
    g.moveTo(left - 14, base);
    g.lineTo(left - 14, archMidY);
    g.arc(spec.x, archMidY, radius + 14, Math.PI, 0, false);
    g.lineTo(right + 14, base);
    g.closePath();
    g.fillPath();

    // Inner portal surface.
    const innerColor = lit ? PALETTE_HEX.frost : 0x0e0c14;
    const innerAlpha = lit ? 0.85 : 1;
    g.fillStyle(innerColor, innerAlpha);
    g.beginPath();
    g.moveTo(left, base);
    g.lineTo(left, archMidY);
    g.arc(spec.x, archMidY, radius, Math.PI, 0, false);
    g.lineTo(right, base);
    g.closePath();
    g.fillPath();

    if (lit) {
      // Soft ripple suggesting the portal is open.
      g.lineStyle(2, PALETTE_HEX.cream, 0.4);
      g.beginPath();
      g.arc(spec.x, archMidY + 60, radius * 0.6, 0, Math.PI * 2);
      g.strokePath();
      g.lineStyle(2, PALETTE_HEX.cream, 0.2);
      g.beginPath();
      g.arc(spec.x, archMidY + 120, radius * 0.5, 0, Math.PI * 2);
      g.strokePath();
    }
  }
}
