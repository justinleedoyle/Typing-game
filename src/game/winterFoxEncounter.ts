import type Phaser from "phaser";
import type { SaveCheckpoint } from "./saveState";
import { applySceneActorLighting } from "./actorLighting";
import { addLocalGroundShadow, addSoftLocalLight } from "./livingScene";
import { reducedMotion } from "./presentation";
import { setWrenPose } from "./wren";

export type WinterFoxApproach = "light" | "space";

/** Only our versioned, unfinished fox checkpoint can reconstruct an approach.
 * Committed memories also support a settled answer after a later reload. */
export function resolveWinterFoxApproach(
  checkpoint: SaveCheckpoint | null,
  choices: Readonly<Record<string, string>>,
): WinterFoxApproach | null {
  const known = (value: unknown): value is WinterFoxApproach => value === "light" || value === "space";
  if ((choices.fox === "spared" || choices.fox === "ignored") && known(choices.foxApproach)) return choices.foxApproach;
  if (checkpoint?.scene !== "WinterMountainScene" || !["fox", "fox-answer"].includes(checkpoint.step)
    || checkpoint.data.foxCareVersion !== 1 || !known(checkpoint.data.foxApproach)) return null;
  return checkpoint.data.foxApproach;
}

export function winterFoxCareData(approach: WinterFoxApproach | null): SaveCheckpoint["data"] {
  return approach === null ? {} : { foxCareVersion: 1, foxApproach: approach };
}

/** A bounded performance owned by the quiet fox encounter, never by combat.
 * The standing actor and all contact effects are restored together on exit. */
export class WinterFoxCareStage {
  private readonly owner: Phaser.GameObjects.Container;
  private readonly kneeling: Phaser.GameObjects.Image;
  private readonly footprints: Phaser.GameObjects.Graphics;
  private readonly warmth: Phaser.GameObjects.Container;
  private readonly wrenStart: { x: number; y: number; visible: boolean };
  private generation = 0;
  private ended = false;
  private readonly onShutdown = (): void => this.destroy();

  constructor(private readonly scene: Phaser.Scene, private readonly actors: {
    wren: Phaser.GameObjects.Container;
    sprite: Phaser.GameObjects.Image;
    fox: Phaser.GameObjects.Container;
  }) {
    const { wren } = actors;
    this.wrenStart = { x: wren.x, y: wren.y, visible: wren.visible };
    this.owner = scene.add.container(wren.x, wren.y).setDepth(61).setVisible(false);
    this.owner.add(addLocalGroundShadow(scene, 164, 22, { x: -14, y: 3, alpha: 0.24 }));
    this.kneeling = scene.add.image(0, 0, "wren-kneel-right").setOrigin(0.5, 1);
    this.kneeling.setScale(190 / this.kneeling.height);
    applySceneActorLighting(scene, this.kneeling);
    this.owner.add(this.kneeling);
    this.footprints = scene.add.graphics().setDepth(42);
    this.warmth = scene.add.container(0, 0).setDepth(60).setVisible(false);
    // The warm point belongs to the open palm; its illumination reaches the
    // snow below rather than floating as a disconnected interface effect.
    this.warmth.add(addSoftLocalLight(scene, 46, 42, 0xffd58a, 0.42));
    this.warmth.add(scene.add.graphics().fillStyle(0xffe6b0, 0.95).fillCircle(0, 0, 3));
    this.warmth.add(addSoftLocalLight(scene, 170, 24, 0xf4c779, 0.15).setPosition(12, 52));
    scene.events.once("shutdown", this.onShutdown);
  }

  /** Typing feedback stays at the open hand of the visible kneeling actor. */
  typingBody(): Phaser.GameObjects.Container { return this.owner; }

  handPosition(): { x: number; y: number } {
    return { x: this.owner.x + 93.5, y: this.owner.y - 54.7 };
  }

  present(approach: WinterFoxApproach, restored: boolean, onSettled: () => void): void {
    const token = ++this.generation;
    const { scene, actors } = this;
    const quiet = restored || reducedMotion(scene);
    const x = approach === "light" ? 1000 : 835;
    const foxX = approach === "light" ? 1190 : 1080;
    for (const body of [actors.wren, actors.fox, this.owner, this.warmth]) scene.tweens.killTweensOf(body);
    actors.fox.setAlpha(1).setVisible(true).setScale(1);
    this.owner.setPosition(x, this.wrenStart.y).setScale(1);
    this.warmth.setPosition(x + 93.5, this.wrenStart.y - 54.7).setVisible(approach === "light");
    this.kneeling.setTint(approach === "light" ? 0xe9e0c3 : 0xd7e5ee,
      0xc8dae8, 0xc9d7df, 0xbdcddc);
    this.footprints.clear();
    for (let index = 0; index < 3; index++) {
      const along = this.wrenStart.x + (x - this.wrenStart.x) * ((index + 1) / 4);
      this.footprints.fillStyle(0x7e99ac, 0.21).fillEllipse(along, this.wrenStart.y + (index % 2 ? 5 : -3), 14, 5);
    }
    const finish = (): void => {
      if (this.ended || token !== this.generation) return;
      this.owner.setVisible(true).setAlpha(1);
      this.warmth.setVisible(approach === "light").setAlpha(1);
      actors.wren.setVisible(false);
      actors.fox.setPosition(foxX, this.wrenStart.y).setAlpha(1);
      onSettled();
    };
    if (quiet) { finish(); return; }
    this.owner.setVisible(false);
    this.warmth.setVisible(false);
    setWrenPose(actors.sprite, "walk", approach === "space");
    scene.tweens.add({ targets: actors.wren, x, duration: 440, ease: "Sine.easeInOut", onComplete: () => {
      if (this.ended || token !== this.generation) return;
      actors.wren.setVisible(false);
      this.owner.setVisible(true).setAlpha(0);
      this.warmth.setVisible(approach === "light").setAlpha(0);
      scene.tweens.add({ targets: [this.owner, this.warmth], alpha: 1, duration: 240 });
      // The fox closes the remaining distance herself; Wren does not pull or
      // touch an injured animal. Both approaches leave her room to withdraw.
      scene.tweens.add({ targets: actors.fox, x: foxX, y: this.wrenStart.y,
        duration: 640, ease: "Sine.easeInOut", onComplete: finish });
    } });
  }

  destroy(): void {
    if (this.ended) return;
    this.ended = true;
    this.generation += 1;
    this.scene.events.off("shutdown", this.onShutdown);
    for (const body of [this.actors.wren, this.actors.fox, this.owner, this.warmth]) this.scene.tweens.killTweensOf(body);
    this.owner.destroy();
    this.warmth.destroy();
    this.footprints.destroy();
    if (this.actors.wren.scene) {
      this.actors.wren.setPosition(this.wrenStart.x, this.wrenStart.y).setVisible(this.wrenStart.visible);
      setWrenPose(this.actors.sprite, "front");
    }
  }
}
