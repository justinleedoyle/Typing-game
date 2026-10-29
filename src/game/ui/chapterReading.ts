import Phaser from "phaser";
import { readingAction } from "../chapterFlow";
import { SERIF } from "../palette";
import { UI_CSS, UI_HEX } from "./uiTheme";
import { chapterPreferences, PRESENTATION_CHANGED } from "../presentation";

/** One deliberate reading stop. Continuing or replaying never injects a game
 * character, and holding a key cannot skip several paragraphs. */
export class ChapterReading {
  /** Scene-scoped UI state; a reading card never changes gameplay activity. */
  static readonly STATE_CHANGED = "chapter-reading-state-changed";
  private static readonly readers = new WeakMap<Phaser.Scene, Set<ChapterReading>>();

  static activeIn(scene: Phaser.Scene): boolean {
    return (ChapterReading.readers.get(scene)?.size ?? 0) > 0;
  }

  private next: (() => void) | null = null;
  private replay: (() => void) | null = null;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly replayHint: Phaser.GameObjects.Text;
  private readonly plate: Phaser.GameObjects.Graphics;
  private openedAt = 0;
  private readonly onShutdown = () => this.clear();

  constructor(private readonly scene: Phaser.Scene, private readonly position: number | (() => number)) {
    this.plate = scene.add.graphics().setDepth(1900).setVisible(false);
    this.hint = scene.add.text(scene.scale.width / 2, typeof position === "number" ? position : position(),
      "Enter / Space · Continue", {
        fontFamily: SERIF, fontSize: "22px", color: UI_CSS.cream,
        align: "center", padding: { x: 14, y: 8 },
      }).setOrigin(0.5).setDepth(1901).setVisible(false);
    this.replayHint = scene.add.text(scene.scale.width / 2,
      typeof position === "number" ? position : position(), "", {
        fontFamily: SERIF, fontSize: "17px", color: "#c8b88f",
        stroke: "#0b0a0f", strokeThickness: 3,
      }).setOrigin(0, 0.5).setDepth(1901).setVisible(false);
    scene.events.on(PRESENTATION_CHANGED, this.redraw, this);
    scene.events.once("shutdown", this.onShutdown);
  }

  private redraw(): void {
    const y = typeof this.position === "number" ? this.position : this.position();
    const large = chapterPreferences(this.scene)?.textScale === "large";
    this.hint.setY(y).setFontSize(large ? 28 : 22);
    this.replayHint.setY(y).setFontSize(large ? 22 : 17);
    const gap = this.replay ? 18 : 0;
    const secondaryW = this.replay ? this.replayHint.width : 0;
    const left = (this.scene.scale.width - this.hint.width - gap - secondaryW) / 2;
    this.hint.setX(left + this.hint.width / 2);
    this.replayHint.setX(left + this.hint.width + gap);
    this.plate.clear().fillStyle(UI_HEX.panel, 0.84);
    this.plate.fillRoundedRect(this.hint.x - this.hint.width / 2,
      this.hint.y - this.hint.height / 2, this.hint.width, this.hint.height, 7);
    this.plate.lineStyle(1, UI_HEX.brass, 0.4);
    this.plate.strokeRoundedRect(this.hint.x - this.hint.width / 2,
      this.hint.y - this.hint.height / 2, this.hint.width, this.hint.height, 7);
  }

  show(next: () => void, replay: (() => void) | null): void {
    this.next = next;
    this.replay = replay;
    this.openedAt = this.scene.time.now;
    this.replayHint.setText(replay ? "R · Read again" : "").setVisible(replay !== null);
    this.hint.setVisible(true);
    this.redraw();
    this.plate.setVisible(true);
    this.publishReading(true);
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
    this.replayHint.setVisible(false);
    this.plate.setVisible(false);
    this.publishReading(false);
  }

  private publishReading(active: boolean): void {
    const wasActive = ChapterReading.activeIn(this.scene);
    let readers = ChapterReading.readers.get(this.scene);
    if (active) {
      if (!readers) {
        readers = new Set();
        ChapterReading.readers.set(this.scene, readers);
      }
      readers.add(this);
    } else {
      readers?.delete(this);
      if (readers?.size === 0) ChapterReading.readers.delete(this.scene);
    }
    const isActive = ChapterReading.activeIn(this.scene);
    if (wasActive !== isActive) this.scene.events.emit(ChapterReading.STATE_CHANGED);
  }

  destroy(): void {
    this.scene.events.off(PRESENTATION_CHANGED, this.redraw, this);
    this.scene.events.off("shutdown", this.onShutdown);
    this.clear();
    this.hint.destroy();
    this.replayHint.destroy();
    this.plate.destroy();
  }
}
