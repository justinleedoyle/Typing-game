import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import openingBackdrop from "../../art/references/opening-typewriter-study-clean.png";

interface OpeningSceneData {
  store: SaveStore;
}

// The arched window — it blazes with cold portal light at Beat 7.
const PORTAL = { x: 215, y: 180 };

// Where the typed words float — just above the painted typewriter.
const TYPE_TARGET = { x: 560, y: 350 };

export class OpeningScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narratorText!: Phaser.GameObjects.Text;

  // Soft glow over the painted Almanac — pulsed in Beat 4.
  private almanacGlow!: Phaser.GameObjects.Graphics;

  constructor() {
    super("OpeningScene");
  }

  init(data: OpeningSceneData): void {
    this.store = data.store;
  }

  preload(): void {
    this.load.image("opening-backdrop", openingBackdrop);
  }

  create(): void {
    const { width } = this.scale;

    // ── Painted study backdrop ───────────────────────────────────────────────
    this.add
      .image(0, 0, "opening-backdrop")
      .setOrigin(0)
      .setDisplaySize(width, this.scale.height)
      .setDepth(-100);

    // Soft glow over the Almanac on the desk — pulsed in Beat 4.
    this.almanacGlow = this.add.graphics();
    this.almanacGlow.fillStyle(PALETTE_HEX.brass, 1);
    this.almanacGlow.fillCircle(475, 470, 70);
    this.almanacGlow.setAlpha(0);

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
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 48,
      onComplete: () => this.onBeat4Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat4Complete(): void {
    playChime();
    // Almanac shimmer: a soft glow swells and fades.
    this.tweens.add({
      targets: this.almanacGlow,
      alpha: { from: 0, to: 0.7 },
      duration: 200,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.almanacGlow.setAlpha(0);
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
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
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

  /** Beat 7 — First portal wakes (2 s, no input). */
  private beat7(): void {
    this.setNarrator(
      "Narrator: The nearest arch flickers. Pale cold light from beyond. A distant sound — wolves on a mountain.",
    );
    this.wakePortal();
    this.time.delayedCall(2000, () => this.beat8());
  }

  /** Beat 8 — Type the portal name. */
  private beat8(): void {
    this.setNarrator(
      'Runa: "The Winter Mountain has woken. Type its name when you are ready."',
    );

    const target = new TextWordTarget({
      scene: this,
      word: "winter mountain",
      x: 410,
      y: 250,
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

  /** The arched window blazes with cold light from beyond. */
  private wakePortal(): void {
    const g = this.add.graphics();
    g.setAlpha(0);
    const { x, y } = PORTAL;

    // Cold light spilling into the room.
    g.fillStyle(PALETTE_HEX.frost, 0.16);
    g.fillEllipse(x, y, 560, 580);
    // The window blaze.
    g.fillStyle(PALETTE_HEX.frost, 0.5);
    g.fillEllipse(x, y, 250, 320);
    // Bright core.
    g.fillStyle(PALETTE_HEX.cream, 0.4);
    g.fillEllipse(x, y, 130, 220);

    this.tweens.add({
      targets: g,
      alpha: 1,
      duration: 1100,
      ease: "Sine.easeOut",
    });
  }

  /**
   * Runa — a dim navy silhouette that fades in beside the desk.
   * Placeholder until a painted character sprite exists.
   */
  private drawRuna(): void {
    const g = this.add.graphics();
    g.setAlpha(0);
    const cx = 980;
    const footY = 905;

    // Deep blue coat — kept dark so it reads as a figure in the gloom.
    g.fillStyle(0x232f4e, 1);
    g.fillTriangle(cx - 44, footY, cx + 44, footY, cx, footY - 235);
    // Head.
    g.fillStyle(0x6a5a44, 1);
    g.fillCircle(cx, footY - 256, 23);
    // Astrolabe glint at the belt.
    g.fillStyle(PALETTE_HEX.brass, 0.6);
    g.fillCircle(cx + 28, footY - 110, 7);

    this.tweens.add({
      targets: g,
      alpha: 0.9,
      duration: 500,
      ease: "Sine.easeOut",
    });
  }

  /**
   * The sibling — a small dim figure that fades in at the left.
   * Placeholder until a painted character sprite exists.
   */
  private drawSibling(): void {
    const g = this.add.graphics();
    g.setAlpha(0);
    const cx = 250;
    const footY = 930;

    // Nightclothes body — muted so it sits in shadow.
    g.fillStyle(0x6b6456, 1);
    g.fillTriangle(cx - 30, footY, cx + 30, footY, cx, footY - 150);
    // Head.
    g.fillStyle(0x5c5040, 1);
    g.fillCircle(cx, footY - 166, 16);
    // Drawing held against the chest.
    g.fillStyle(PALETTE_HEX.cream, 0.45);
    g.fillRect(cx - 14, footY - 88, 28, 34);

    this.tweens.add({
      targets: g,
      alpha: 0.85,
      duration: 500,
      ease: "Sine.easeOut",
    });
  }
}
