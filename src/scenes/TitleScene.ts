import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { PALETTE, SERIF } from "../game/palette";
import {
  SaveStore,
  SyncedBackend,
  type SaveBackend,
} from "../game/saveState";

export class TitleScene extends Phaser.Scene {
  private prompt!: Phaser.GameObjects.Text;
  private promptTween?: Phaser.Tweens.Tween;
  private store?: SaveStore;
  private storePromise?: Promise<SaveStore>;
  private hasTyped = false;
  private transitioning = false;

  constructor() {
    super("TitleScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 120, "The Portalwright's Almanac", {
        fontFamily: SERIF,
        fontSize: "112px",
        color: PALETTE.cream,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 20, "a typing adventure", {
        fontFamily: SERIF,
        fontSize: "40px",
        fontStyle: "italic",
        color: PALETTE.dim,
      })
      .setOrigin(0.5);

    this.prompt = this.add
      .text(width / 2, height - 180, "press any key", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.dim,
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

    // Kick off save loading immediately so the chamber transition doesn't
    // wait on disk I/O. registry stores the backend so tests / future
    // SupabaseBackend swap can override it from outside.
    const backend =
      (this.registry.get("saveBackend") as SaveBackend | undefined) ??
      new SyncedBackend();
    this.storePromise = SaveStore.load(backend);

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length !== 1 && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    playClack();
    if (!this.hasTyped) {
      this.hasTyped = true;
      this.promptTween?.stop();
      this.prompt.setAlpha(1);
      this.prompt.setText("the cartographer is waking up...");
    }
    void this.beginTransition();
  }

  private async beginTransition(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.store = await this.storePromise;
    this.cameras.main.fadeOut(600, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start("PortalChamberScene", { store: this.store });
      },
    );
  }
}
