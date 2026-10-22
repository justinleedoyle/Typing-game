import Phaser from "phaser";
import { readingAction } from "../chapterFlow";
import { SERIF } from "../palette";
import { UI_CSS, UI_HEX } from "./uiTheme";
import { chapterPreferences, PRESENTATION_CHANGED } from "../presentation";

/** One deliberate reading stop. Continuing or replaying never injects a game
 * character, and holding a key cannot skip several paragraphs. */
export class ChapterReading {
  private next: (() => void) | null = null;
  private replay: (() => void) | null = null;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly plate: Phaser.GameObjects.Graphics;
  private openedAt = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly position: number | (() => number)) {
    this.plate = scene.add.graphics().setDepth(1900).setVisible(false);
    this.hint = scene.add.text(scene.scale.width / 2, typeof position === "number" ? position : position(),
      "Enter / Space: continue  ·  R: read again  ·  Esc: pause", {
        fontFamily: SERIF, fontSize: "22px", color: UI_CSS.cream,
        align: "center", padding: { x: 18, y: 10 },
      }).setOrigin(0.5).setDepth(1901).setVisible(false);
    scene.events.on(PRESENTATION_CHANGED, this.redraw, this);
  }

  private redraw(): void {
    this.hint.setY(typeof this.position === "number" ? this.position : this.position());
    this.hint.setFontSize(chapterPreferences(this.scene)?.textScale === "large" ? 28 : 22);
    this.plate.clear().fillStyle(UI_HEX.panel, 0.96);
    this.plate.fillRoundedRect(this.hint.x - this.hint.width / 2,
      this.hint.y - this.hint.height / 2, this.hint.width, this.hint.height, 7);
    this.plate.lineStyle(1, UI_HEX.brass, 0.6);
    this.plate.strokeRoundedRect(this.hint.x - this.hint.width / 2,
      this.hint.y - this.hint.height / 2, this.hint.width, this.hint.height, 7);
  }

  show(next: () => void, replay: (() => void) | null): void {
    this.next = next;
    this.replay = replay;
    this.openedAt = this.scene.time.now;
    this.hint.setText(replay
      ? "Enter / Space: continue  ·  R: read again  ·  Esc: pause"
      : "Enter / Space: continue  ·  Esc: pause");
    this.hint.setVisible(true);
    this.redraw();
    this.plate.setVisible(true);
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.next) return false;
    const action = readingAction(event.key, event.repeat);
    if (action === "pause") return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return true;
    event.preventDefault();
    if (this.scene.time.now - this.openedAt < 180) return true;
    if (action === "replay") this.replay?.();
    if (action === "continue") {
      const next = this.next;
      this.clear();
      next();
    }
    return true;
  }

  clear(): void {
    this.next = null;
    this.replay = null;
    this.hint.setVisible(false);
    this.plate.setVisible(false);
  }

  destroy(): void {
    this.scene.events.off(PRESENTATION_CHANGED, this.redraw, this);
    this.clear();
    this.hint.destroy();
    this.plate.destroy();
  }
}
