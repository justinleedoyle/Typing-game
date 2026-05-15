import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";

interface OpeningSceneData {
  store: SaveStore;
}

// The leftmost arch position — matches PortalChamberScene's winter-mountain arch.
const ARCH = { x: 360, width: 280, height: 460, baseY: 820 };

// Brass typewriter + desk layout, centred on the writing desk.
const TYPEWRITER = { x: 960, y: 680, w: 200, h: 70 };
const DESK = { x: 960, y: 750, w: 520, h: 50 };

export class OpeningScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;

  // Graphics objects that need to be addressed after initial draw.
  private almanacGraphics!: Phaser.GameObjects.Graphics;
  private archGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super("OpeningScene");
  }

  init(data: OpeningSceneData): void {
    this.store = data.store;
  }

  create(): void {
    const { width } = this.scale;

    // ── Room ────────────────────────────────────────────────────────────────
    this.drawRoom();
    this.drawArch(false);
    this.drawDesk();
    this.drawTypewriter();
    this.drawAlmanac();

    // ── Narrator text ────────────────────────────────────────────────────────
    this.narratorText = this.add
      .text(width / 2, 120, "", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 1400 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // ── Input ────────────────────────────────────────────────────────────────
    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    // ── Beat sequence ────────────────────────────────────────────────────────
    this.beat1();
  }

  // ── Beats ──────────────────────────────────────────────────────────────────

  /** Beat 1 — Narrator intro, 3 s delay, no input. */
  private beat1(): void {
    this.setNarrator(
      "In the kingdom of Holdfast — the last quiet place in the world — a child has been waiting all evening to be called downstairs.",
    );
    this.time.delayedCall(3000, () => this.beat2());
  }

  /** Beat 2 — Runa descends the staircase (2 s). */
  private beat2(): void {
    this.setNarrator(
      "Runa — the royal cartographer — comes down the staircase. Ink-stained. Half-blind in one eye. She has been waiting, too.",
    );
    this.drawRuna();
    this.time.delayedCall(2000, () => this.beat3());
  }

  /** Beat 3 — Sibling appears in doorway (2 s). */
  private beat3(): void {
    this.setNarrator(
      "At the doorway, a small figure in nightclothes holds a drawing against her chest.",
    );
    this.drawSibling();
    this.time.delayedCall(2000, () => this.beat4());
  }

  /** Beat 4 — Type your name. */
  private beat4(): void {
    this.setNarrator('Runa: "Wren. Hands on the keys. Type your name."');

    const target = new TextWordTarget({
      scene: this,
      word: "wren",
      x: this.scale.width / 2,
      y: 820,
      fontSize: 48,
      onComplete: () => this.onBeat4Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat4Complete(): void {
    playChime();
    // Almanac alpha pulse: flash to 1 then back.
    this.tweens.add({
      targets: this.almanacGraphics,
      alpha: { from: 0.4, to: 1 },
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.almanacGraphics.setAlpha(1);
        this.beat5();
      },
    });
  }

  /** Beat 5 — Type the typewriter's name. */
  private beat5(): void {
    this.setNarrator(
      'Runa: "Good. The typewriter has a name. It is a brass one, so the name is Bjarn. Type it."',
    );

    const target = new TextWordTarget({
      scene: this,
      word: "bjarn",
      x: this.scale.width / 2,
      y: 820,
      fontSize: 48,
      onComplete: () => this.onBeat5Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat5Complete(): void {
    playChime();
    // Warm gold camera flash.
    this.cameras.main.flash(320, 201, 161, 74); // PALETTE_HEX.brass split to r/g/b
    this.time.delayedCall(400, () => this.beat6());
  }

  /** Beat 6 — The Almanac speech (3 s, no input). */
  private beat6(): void {
    this.setNarrator(
      'Runa: "The Quiet Lord has been waking up. Across the Realms Beyond he is gathering an army that hates language and loves silence. This is the Almanac. It records everywhere you go, everyone you save, everything you bring home. It is yours now."',
    );
    this.time.delayedCall(3000, () => this.beat7());
  }

  /** Beat 7 — First arch wakes (2 s, no input). */
  private beat7(): void {
    this.setNarrator(
      "Narrator: The nearest arch flickers. Pale cold light from beyond. A distant sound — wolves on a mountain.",
    );
    this.drawArch(true);
    this.time.delayedCall(2000, () => this.beat8());
  }

  /** Beat 8 — Type the portal name. */
  private beat8(): void {
    this.setNarrator(
      'Runa: "The Winter Mountain has woken. Type its name when you are ready."',
    );

    // The target floats at the lit arch position.
    const archTopY = ARCH.baseY - ARCH.height;
    const target = new TextWordTarget({
      scene: this,
      word: "winter mountain",
      x: ARCH.x,
      y: archTopY - 60,
      fontSize: 36,
      onComplete: () => this.onBeat8Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat8Complete(): void {
    playChime();
    this.beat9();
  }

  /** Beat 9 — Sibling farewell then transition. */
  private beat9(): void {
    this.setNarrator(
      "Narrator: At the doorway, she presses the drawing a little tighter. ‘Wren. I made you something.’",
    );
    this.time.delayedCall(2000, () => {
      this.store.update((s) => {
        s.typewriterAwakened = true;
      });
      this.cameras.main.fadeOut(700, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  // ── Narrator helper ────────────────────────────────────────────────────────

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

  // ── Drawing ────────────────────────────────────────────────────────────────

  /** Dark ink library with bookshelves and five portal arches. */
  private drawRoom(): void {
    const { width } = this.scale;
    const g = this.add.graphics();

    // Background — deep ink.
    g.fillStyle(0x0e0c14, 1);
    g.fillRect(0, 0, width, this.scale.height);

    // Back wall band.
    g.fillStyle(0x14121a, 1);
    g.fillRect(0, 0, width, 400);

    // Bookshelves along the back wall (same style as PortalChamberScene).
    g.fillStyle(0x2a2018, 1);
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 300;
      g.fillRect(x, 100, 220, 260);
    }

    // Brass book spine slivers.
    g.fillStyle(PALETTE_HEX.brass, 0.35);
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 300;
      for (let j = 0; j < 8; j++) {
        g.fillRect(x + 14 + j * 26, 116 + (j % 2) * 8, 6, 210);
      }
    }

    // Brass skirting line where wall meets floor.
    g.fillStyle(PALETTE_HEX.brass, 0.4);
    g.fillRect(0, 400, width, 2);

    // Floor.
    g.fillStyle(0x0d0b11, 1);
    g.fillRect(0, 402, width, this.scale.height - 402);

    // Five dark arches set into the back wall.
    // (The leftmost is redrawn by drawArch() to handle lit state.)
    const archPositions = [760, 1160, 1560, 1860];
    for (const ax of archPositions) {
      this.drawStaticArch(g, ax, 110, 220, 360);
    }
  }

  /** Draw a static (always-dark) arch directly into a graphics object. */
  private drawStaticArch(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    top: number,
    halfW: number,
    fullH: number,
  ): void {
    const radius = halfW;
    const archMidY = top + radius;
    const base = top + fullH;
    const left = cx - halfW;
    const right = cx + halfW;

    // Stone outline.
    g.fillStyle(0x1c1a26, 1);
    g.beginPath();
    g.moveTo(left - 14, base);
    g.lineTo(left - 14, archMidY);
    g.arc(cx, archMidY, radius + 14, Math.PI, 0, false);
    g.lineTo(right + 14, base);
    g.closePath();
    g.fillPath();

    // Dark inner surface.
    g.fillStyle(0x0e0c14, 1);
    g.beginPath();
    g.moveTo(left, base);
    g.lineTo(left, archMidY);
    g.arc(cx, archMidY, radius, Math.PI, 0, false);
    g.lineTo(right, base);
    g.closePath();
    g.fillPath();
  }

  /**
   * Draw (or redraw) the leftmost arch, which can be lit or dark.
   * Replaces itself on the display list each call using a stored reference.
   */
  private drawArch(lit: boolean): void {
    if (this.archGraphics) {
      this.archGraphics.destroy();
    }

    const g = this.add.graphics();
    this.archGraphics = g;

    const cx = ARCH.x;
    const halfW = ARCH.width / 2;
    const radius = halfW;
    const base = ARCH.baseY;
    const archMidY = base - ARCH.height + radius;
    const left = cx - halfW;
    const right = cx + halfW;

    // Stone outline.
    g.fillStyle(0x1c1a26, 1);
    g.beginPath();
    g.moveTo(left - 14, base);
    g.lineTo(left - 14, archMidY);
    g.arc(cx, archMidY, radius + 14, Math.PI, 0, false);
    g.lineTo(right + 14, base);
    g.closePath();
    g.fillPath();

    // Inner surface.
    const innerColor = lit ? PALETTE_HEX.frost : 0x0e0c14;
    const innerAlpha = lit ? 0.85 : 1;
    g.fillStyle(innerColor, innerAlpha);
    g.beginPath();
    g.moveTo(left, base);
    g.lineTo(left, archMidY);
    g.arc(cx, archMidY, radius, Math.PI, 0, false);
    g.lineTo(right, base);
    g.closePath();
    g.fillPath();

    if (lit) {
      // Soft ripple suggesting the portal is open.
      g.lineStyle(2, PALETTE_HEX.cream, 0.4);
      g.beginPath();
      g.arc(cx, archMidY + 60, radius * 0.6, 0, Math.PI * 2);
      g.strokePath();
      g.lineStyle(2, PALETTE_HEX.cream, 0.2);
      g.beginPath();
      g.arc(cx, archMidY + 120, radius * 0.5, 0, Math.PI * 2);
      g.strokePath();
    }
  }

  private drawDesk(): void {
    const g = this.add.graphics();

    // Tabletop.
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(DESK.x - DESK.w / 2, DESK.y, DESK.w, DESK.h);

    // Legs.
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(DESK.x - DESK.w / 2 + 20, DESK.y + DESK.h, 30, 200);
    g.fillRect(DESK.x + DESK.w / 2 - 50, DESK.y + DESK.h, 30, 200);
  }

  private drawTypewriter(): void {
    const g = this.add.graphics();
    const tw = TYPEWRITER;

    // Body — brass.
    g.fillStyle(PALETTE_HEX.brass, 1);
    g.fillRect(tw.x - tw.w / 2, tw.y - tw.h, tw.w, tw.h);

    // Roller bar.
    g.fillStyle(PALETTE_HEX.cream, 1);
    g.fillRect(tw.x - tw.w / 2 - 6, tw.y - tw.h - 8, tw.w + 12, 8);

    // Key dots (2 rows × 9).
    g.fillStyle(PALETTE_HEX.cream, 0.8);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 9; col++) {
        const kx = tw.x - tw.w / 2 + 16 + col * 20;
        const ky = tw.y - tw.h + 18 + row * 16;
        g.fillCircle(kx, ky, 4);
      }
    }

    // A glow ring — the typewriter is already awake in this scene.
    g.lineStyle(2, PALETTE_HEX.brass, 0.25);
    g.strokeCircle(tw.x, tw.y - tw.h / 2, 110);
    g.strokeCircle(tw.x, tw.y - tw.h / 2, 130);
  }

  /**
   * Thick book on the desk beside the typewriter.
   * Stored so the alpha-pulse in Beat 4 can target it.
   */
  private drawAlmanac(): void {
    const g = this.add.graphics();
    this.almanacGraphics = g;

    const bx = DESK.x - 160;
    const by = DESK.y - 30;

    // Cover.
    g.fillStyle(0x1c1620, 1);
    g.fillRect(bx, by, 80, 100);

    // Spine edge.
    g.fillStyle(PALETTE_HEX.brass, 0.7);
    g.fillRect(bx, by, 8, 100);

    // Title scratch marks (three horizontal slivers).
    g.fillStyle(PALETTE_HEX.brass, 0.5);
    g.fillRect(bx + 14, by + 18, 50, 4);
    g.fillRect(bx + 14, by + 28, 40, 3);
    g.fillRect(bx + 14, by + 37, 30, 3);

    // Page edges at bottom of book.
    g.fillStyle(PALETTE_HEX.cream, 0.3);
    g.fillRect(bx + 8, by + 96, 72, 6);
  }

  /** Runa silhouette descending stairs on the right side. */
  private drawRuna(): void {
    const g = this.add.graphics();
    g.setAlpha(0);

    // Staircase suggestion: three descending steps on the right.
    g.fillStyle(0x1c1a26, 1);
    for (let i = 0; i < 3; i++) {
      g.fillRect(1580 + i * 60, 500 + i * 60, 80, 12);
    }

    // Deep blue coat body — simple trapezoid.
    g.fillStyle(0x1e2a4a, 1);
    g.fillTriangle(1700, 920, 1760, 920, 1740, 680);

    // Head circle.
    g.fillStyle(0xb89870, 1);
    g.fillCircle(1730, 660, 22);

    // One eye suggestion (half-blind): a small cross mark.
    g.fillStyle(0x0e0c14, 0.8);
    g.fillRect(1722, 656, 10, 2);
    g.fillRect(1726, 652, 2, 10);

    // Astrolabe suggestion (a circle with a cross bar at the hip).
    g.lineStyle(2, PALETTE_HEX.brass, 0.7);
    g.strokeCircle(1760, 800, 20);
    g.fillStyle(PALETTE_HEX.brass, 0.5);
    g.fillRect(1748, 799, 24, 2);
    g.fillRect(1759, 788, 2, 24);

    // Ink-stained hand outstretched.
    g.fillStyle(0xb89870, 1);
    g.fillEllipse(1700, 760, 18, 10);

    this.tweens.add({
      targets: g,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  /** Small sibling silhouette in the doorway on the left side. */
  private drawSibling(): void {
    const g = this.add.graphics();
    g.setAlpha(0);

    // Doorway frame.
    g.fillStyle(0x1c1a26, 1);
    g.fillRect(80, 400, 20, 460);
    g.fillRect(260, 400, 20, 460);
    g.fillRect(80, 390, 200, 20);

    // Small figure in nightclothes — pale triangle body.
    g.fillStyle(0xe8dcc0, 0.85);
    g.fillTriangle(170, 880, 210, 880, 190, 700);

    // Head.
    g.fillStyle(0xd6b88a, 1);
    g.fillCircle(190, 685, 16);

    // Drawing pressed against chest — small dark rectangle.
    g.fillStyle(0xf3ead2, 0.8);
    g.fillRect(178, 760, 30, 38);
    g.fillStyle(PALETTE_HEX.brass, 0.6);
    g.fillRect(182, 764, 22, 2);
    g.fillRect(182, 770, 18, 2);
    g.fillRect(182, 776, 20, 2);

    this.tweens.add({
      targets: g,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }
}
