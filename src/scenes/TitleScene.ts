import Phaser from "phaser";
import { playClack } from "../audio/clack";

const CREAM = "#f3ead2";
const DIM = "#8a8275";

export class TitleScene extends Phaser.Scene {
  private prompt!: Phaser.GameObjects.Text;
  private promptTween?: Phaser.Tweens.Tween;
  private hasTyped = false;

  constructor() {
    super("TitleScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 120, "The Portalwright's Almanac", {
        fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
        fontSize: "112px",
        color: CREAM,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 20, "a typing adventure", {
        fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
        fontSize: "40px",
        fontStyle: "italic",
        color: DIM,
      })
      .setOrigin(0.5);

    this.prompt = this.add
      .text(width / 2, height - 180, "press any key", {
        fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
        fontSize: "32px",
        color: DIM,
      })
      .setOrigin(0.5);

    this.promptTween = this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Ignore modifier-only presses (Shift, Ctrl, Alt, Meta) so the clack
    // tracks intent to type, not "I'm setting up to type."
    if (event.key.length !== 1 && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    playClack();

    if (!this.hasTyped) {
      this.hasTyped = true;
      this.promptTween?.stop();
      this.tweens.add({
        targets: this.prompt,
        alpha: 1,
        duration: 200,
        onComplete: () => {
          this.prompt.setText("the cartographer is waking up...");
        },
      });
    }
  }
}
