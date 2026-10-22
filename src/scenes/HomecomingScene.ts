import Phaser from "phaser";
import type { SaveStore } from "../game/saveState";
import { homecomingLines } from "../game/homecoming";
import { NarrationManager } from "../game/narrationManager";
import { ChapterReading } from "../game/ui/chapterReading";
import { installChapterMenu } from "../game/ui/pauseMenu";
import { addIdleBreath, addLocalGroundShadow } from "../game/livingScene";
import { reducedMotion } from "../game/presentation";
import { makeWrenSprite, preloadWren } from "../game/wren";
import { SERIF } from "../game/palette";
import { cornerTicks, UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import study from "../../art/references/opening-typewriter-study-clean.png";
import runa from "../../art/runa/runa-front.png";
import saga from "../../art/sibling/sibling-front.png";
import magnus from "../../art/sibling/magnus-front.png";

/** A quiet return to the opening's people before the credits. No new choice,
 * reward, or automatic caption deadline is introduced after victory. */
export class HomecomingScene extends Phaser.Scene {
  private store!: SaveStore;
  private reading!: ChapterReading;
  private narration!: NarrationManager;
  private menu?: ReturnType<typeof installChapterMenu>;
  private leaving = false;

  constructor() { super("HomecomingScene"); }
  init(data: { store: SaveStore }): void { this.store = data.store; this.leaving = false; }
  preload(): void {
    this.load.image("homecoming-study", study);
    this.load.image("homecoming-runa", runa);
    this.load.image("homecoming-saga", saga);
    this.load.image("homecoming-magnus", magnus);
    preloadWren(this);
  }
  create(): void {
    this.menu = installChapterMenu(this, {
      store: this.store, hasClaim: () => false,
      onLeave: () => this.returnToLibrary(),
      leaveLabel: "Return to library",
      leaveHint: "Your victory is saved. You can return to the library whenever you are ready.",
    });
    const bg = this.add.image(960, 540, "homecoming-study");
    bg.setScale(Math.max(1920 / bg.width, 1080 / bg.height)).setDepth(-10);
    this.add.rectangle(960, 540, 1920, 1080, 0x0b0a0f, 0.18).setDepth(-9);
    const title = this.add.text(960, 95, "Home, at last", {
      fontFamily: SERIF, fontSize: "46px", color: UI_CSS.parchment,
      stroke: "#18130e", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(10);
    this.actor("homecoming-runa", 425, 950, 365);
    const wren = this.add.container(1000, 950).setDepth(2);
    wren.add(addLocalGroundShadow(this, 150, 24, { alpha: .3, y: 6 }));
    const sprite = makeWrenSprite(this);
    sprite.setScale(320 / sprite.height);
    wren.add(sprite);
    addIdleBreath(this, wren, { dy: -2, durationMs: 2600 });
    const gender = this.store.get().wrenGender;
    if (gender) this.actor(gender === "boy" ? "homecoming-saga" : "homecoming-magnus", 1430, 950, gender === "boy" ? 270 : 350);
    this.narration = new NarrationManager(this, { store: this.store, framed: true, y: 260, depth: 20 });
    this.reading = new ChapterReading(this, 1005);
    const lines = homecomingLines(gender);
    const show = (index: number): void => {
      if (index === lines.length) { title.setText("The Portalwright's Almanac"); this.showCredits(); return; }
      const line = lines[index];
      this.narration.sayRaw(line.text, { speakerName: line.speaker });
      this.reading.show(() => show(index + 1), () => this.narration.replay());
    };
    show(0);
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (this.menu?.handleKey(event)) return;
      this.reading.handleKey(event);
    };
    this.input.keyboard?.on("keydown", onKey);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", onKey);
      this.reading.destroy();
      this.menu?.destroy();
    });
    this.cameras.main.fadeIn(reducedMotion(this) ? 0 : 700, 11, 10, 15);
  }
  private actor(texture: string, x: number, y: number, height: number): void {
    const actor = this.add.container(x, y).setDepth(1);
    actor.add(addLocalGroundShadow(this, 180, 26, { y: 7, alpha: .3 }));
    const image = this.add.image(0, 0, texture).setOrigin(.5, 1);
    image.setScale(height / image.height);
    actor.add(image);
    addIdleBreath(this, actor, { dy: -2, durationMs: 2400 });
  }
  private showCredits(): void {
    this.narration.clear();
    const panel = this.add.container(960, 365).setDepth(25);
    const bg = this.add.graphics();
    bg.fillStyle(UI_HEX.panel, .97).fillRoundedRect(-500, -180, 1000, 360, 14);
    bg.lineStyle(2, UI_HEX.brass, .8).strokeRoundedRect(-500, -180, 1000, 360, 14);
    panel.add([bg, cornerTicks(this, 1000, 360, { inset: 12, size: 18, width: 2 })]);
    [
      ["A story about words and the people who keep them.", -108, 28],
      ["Co-designed by Aiden.", -20, 34],
      ["Written and built by Justin.", 42, 28],
      ["Continue to return to the library.", 116, 24],
    ].forEach(([text, y, size]) => panel.add(this.add.text(0, y as number, text as string, {
      fontFamily: SERIF, fontSize: `${size}px`, color: UI_CSS.cream,
    }).setOrigin(.5)));
    this.reading.show(() => this.returnToLibrary(), null);
  }
  private returnToLibrary(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start("PortalChamberScene", { store: this.store, arrival: "great-battle" });
  }
}
