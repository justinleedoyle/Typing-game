import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { PALETTE, SERIF } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";

interface WinterSceneData {
  store: SaveStore;
}

// Phase 1 slice 1 stub. The real Winter Mountain — wolves, the trapped
// huntress, the firefly-trail branch, the realm-end Almanac stamp — lands
// in slice 2. For now this scene exists so the game loop is end-to-end:
// Title → Chamber → enter portal → Winter Mountain → return to Chamber.

export class WinterMountainScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;

  constructor() {
    super("WinterMountainScene");
  }

  init(data: WinterSceneData): void {
    this.store = data.store;
  }

  create(): void {
    this.cameras.main.fadeIn(500, 11, 10, 15);
    this.drawSky();
    this.drawMountains();
    this.drawSnowfield();

    this.add
      .text(this.scale.width / 2, 240, "the winter mountain", {
        fontFamily: SERIF,
        fontSize: "84px",
        color: PALETTE.cream,
      })
      .setOrigin(0.5);

    this.add
      .text(
        this.scale.width / 2,
        340,
        "(this realm is still being written. wolves and a huntress arrive in the next slice.)",
        {
          fontFamily: SERIF,
          fontSize: "28px",
          fontStyle: "italic",
          color: PALETTE.dim,
          align: "center",
          wordWrap: { width: 1100 },
        },
      )
      .setOrigin(0.5);

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    const returnTarget = new TextWordTarget({
      scene: this,
      word: "return",
      x: this.scale.width / 2,
      y: this.scale.height - 200,
      onComplete: () => this.returnToChamber(),
    });
    this.typingInput.register(returnTarget);

    this.add
      .text(
        this.scale.width / 2,
        this.scale.height - 100,
        "type the word above to step back through the portal",
        {
          fontFamily: SERIF,
          fontSize: "24px",
          color: PALETTE.dim,
        },
      )
      .setOrigin(0.5);
  }

  private returnToChamber(): void {
    this.cameras.main.fadeOut(500, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start("PortalChamberScene", { store: this.store });
      },
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  private drawSky(): void {
    const g = this.add.graphics();
    // Cold dawn: faint blue band at top fading to ink.
    g.fillStyle(0x1a2230, 1);
    g.fillRect(0, 0, this.scale.width, 700);
    g.fillStyle(0x0e1018, 1);
    g.fillRect(0, 0, this.scale.width, 200);
  }

  private drawMountains(): void {
    const g = this.add.graphics();
    // Distant range: pale, layered triangles.
    g.fillStyle(0x2a3548, 1);
    this.drawJaggedRange(g, 540, 720, [180, 320, 240, 380, 220, 300, 260]);
    g.fillStyle(0x222b3c, 1);
    this.drawJaggedRange(g, 620, 720, [260, 220, 360, 280, 320, 240]);
  }

  private drawJaggedRange(
    g: Phaser.GameObjects.Graphics,
    baseY: number,
    bottomY: number,
    peakHeights: number[],
  ): void {
    const segmentWidth = this.scale.width / (peakHeights.length - 1);
    g.beginPath();
    g.moveTo(0, bottomY);
    g.lineTo(0, baseY);
    for (let i = 0; i < peakHeights.length; i++) {
      const x = i * segmentWidth;
      const y = baseY - peakHeights[i];
      g.lineTo(x, y);
    }
    g.lineTo(this.scale.width, baseY);
    g.lineTo(this.scale.width, bottomY);
    g.closePath();
    g.fillPath();
  }

  private drawSnowfield(): void {
    const g = this.add.graphics();
    g.fillStyle(0xc8d4e0, 1);
    g.fillRect(0, 720, this.scale.width, this.scale.height - 720);
    // A few sparse pine silhouettes in the mid-ground.
    g.fillStyle(0x14181f, 1);
    for (const x of [220, 540, 1380, 1700]) {
      this.drawPine(g, x, 720);
    }
  }

  private drawPine(
    g: Phaser.GameObjects.Graphics,
    x: number,
    baseY: number,
  ): void {
    const trunkW = 12;
    const trunkH = 30;
    g.fillStyle(0x2a1f12, 1);
    g.fillRect(x - trunkW / 2, baseY - trunkH, trunkW, trunkH);
    g.fillStyle(0x14181f, 1);
    for (let i = 0; i < 3; i++) {
      const w = 90 - i * 22;
      const h = 60;
      const y = baseY - trunkH - i * 38;
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x + w / 2, y);
      g.lineTo(x, y - h);
      g.closePath();
      g.fillPath();
    }
  }
}
