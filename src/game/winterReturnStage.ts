import type Phaser from "phaser";
import { applySceneActorLighting } from "./actorLighting";
import { addLocalGroundShadow } from "./livingScene";
import { reducedMotion } from "./presentation";
import { setWrenPose } from "./wren";
import type { WinterReturnPhase, WinterReturnRoute, WinterRouteAction } from "./winterReturnRoute";

/** The same planted stream, pine and bank before the climb and on the return.
 * Own every temporary prop/tween, and return the normal actor to its owner. */
export class WinterReturnStage {
  private readonly plate: Phaser.GameObjects.Image;
  private readonly pine: Phaser.GameObjects.Container;
  private readonly braces: Phaser.GameObjects.Container;
  private readonly bank: Phaser.GameObjects.Container;
  private readonly footprints: Phaser.GameObjects.Graphics;
  private readonly start: { x: number; y: number; visible: boolean; depth: number };
  private generation = 0;
  private ended = false;
  private readonly shutdown = (): void => this.destroy();

  constructor(private readonly scene: Phaser.Scene, private readonly actors: {
    wren: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image;
  }) {
    this.start = { x: actors.wren.x, y: actors.wren.y, visible: actors.wren.visible, depth: actors.wren.depth };
    // The bank runs in front of the loose pine. Keep Wren's whole body on
    // that side of the prop rather than hiding his torso behind its trunk.
    actors.wren.setDepth(46);
    this.plate = scene.add.image(0, -90, "winter-trail-backdrop")
      .setOrigin(0).setDisplaySize(scene.scale.width, scene.scale.height).setDepth(-98);
    this.pine = scene.add.container(1260, 810).setDepth(43);
    this.pine.add(addLocalGroundShadow(scene, 660, 20, { y: 3, alpha: 0.2 }));
    const log = scene.add.image(0, 0, "winter-fallen-pine").setOrigin(0.5, 0.83);
    log.setScale(760 / log.width);
    applySceneActorLighting(scene, log);
    this.pine.add(log);
    this.braces = scene.add.container(0, 0).setDepth(44).setVisible(false);
    for (const point of [{ x: 664, y: 794 }, { x: 1290, y: 760 }]) {
      const stone = scene.add.image(point.x, point.y, "winter-aftermath-cairn");
      // The accepted cairn's painted footprint, reduced to two bank wedges.
      stone.setOrigin((79 + 1383 / 2) / stone.width, 856 / stone.height).setScale(68 / 1383);
      applySceneActorLighting(scene, stone);
      this.braces.add(stone);
    }
    this.bank = scene.add.container(1530, 810).setDepth(42);
    this.footprints = scene.add.graphics().setDepth(45);
    scene.events.once("shutdown", this.shutdown);
  }

  present(route: WinterReturnRoute | null, phase: WinterReturnPhase, completed: number): void {
    this.generation += 1;
    this.stop();
    this.pine.setPosition(route === "crossing" && (phase === "return" || completed >= 1) ? 980 : 1260, 810);
    this.braces.setVisible(route === "crossing" && (phase === "return" || completed >= 2));
    const position = phase === "prepare"
      ? { x: route === "crossing" && completed > 0 ? 1370 : 1630, y: 810 }
      : route === "crossing" ? { x: completed ? 610 : 1350, y: 810 }
        : { x: completed >= 2 ? 1700 : completed === 1 ? 1510 : 1330, y: 810 };
    this.actors.wren.setPosition(position.x, position.y).setVisible(true).setAlpha(1).setScale(1);
    setWrenPose(this.actors.sprite, "front");
    this.footprints.clear();
    if (phase === "return" && route === "bank" && completed > 0) {
      this.drawSteps(1340, completed >= 2 ? 1700 : 1510, 810);
    } else if (phase === "return" && route === "crossing" && completed > 0) {
      this.drawSteps(750, 1230, 682, 667);
    }
  }

  subject(action: WinterRouteAction | "choice-crossing" | "choice-bank"): Phaser.GameObjects.Container {
    return action === "step" || action === "duck" || action === "choice-bank" ? this.bank : this.pine;
  }

  approach(action: WinterRouteAction): void {
    if (this.ended) return;
    if (action === "seat") this.move([{ x: 1510, y: 810 }], () => {});
  }

  perform(action: WinterRouteAction, done: () => void): void {
    if (this.ended) return;
    const token = ++this.generation;
    const finish = (): void => {
      if (this.ended || token !== this.generation) return;
      setWrenPose(this.actors.sprite, "front");
      done();
    };
    this.stop();
    if (action === "seat") {
      setWrenPose(this.actors.sprite, "walk", true);
      if (reducedMotion(this.scene)) {
        this.pine.setPosition(980, 810); this.actors.wren.setPosition(1370, 810); finish(); return;
      }
      this.scene.tweens.add({ targets: this.pine, x: 980, duration: 650, ease: "Sine.easeInOut" });
      this.scene.tweens.add({ targets: this.actors.wren, x: 1370, duration: 650, ease: "Sine.easeInOut", onComplete: finish });
    } else if (action === "brace") {
      this.braces.setVisible(true);
      finish();
    } else if (action === "cross") {
      this.drawSteps(750, 1230, 682, 667);
      this.move([{ x: 1230, y: 667 }, { x: 750, y: 682 }, { x: 610, y: 810 }], finish);
    } else {
      if (action === "duck") {
        setWrenPose(this.actors.sprite, "walk");
        this.actors.sprite.scaleY *= 0.62;
      }
      const x = action === "step" ? 1510 : 1700;
      this.drawSteps(this.actors.wren.x, x, 810);
      this.move([{ x, y: 810 }], finish, action === "duck");
    }
  }

  private move(points: Array<{ x: number; y: number }>, done: () => void, duck = false): void {
    const token = this.generation;
    const advance = (index: number): void => {
      if (this.ended || token !== this.generation) return;
      const point = points[index];
      if (!point) { done(); return; }
      if (!duck) setWrenPose(this.actors.sprite, "walk", point.x < this.actors.wren.x);
      if (reducedMotion(this.scene)) {
        this.actors.wren.setPosition(point.x, point.y); advance(index + 1); return;
      }
      this.scene.tweens.add({ targets: this.actors.wren, ...point, duration: 420,
        ease: "Sine.easeInOut", onComplete: () => advance(index + 1) });
    };
    advance(0);
  }

  private drawSteps(from: number, to: number, y: number, endY = y): void {
    for (let x = Math.min(from, to); x <= Math.max(from, to); x += 46) {
      const groundY = y + (endY - y) * ((x - from) / (to - from || 1));
      this.footprints.fillStyle(0x859fb4, 0.24).fillEllipse(x, groundY + (Math.round(x / 46) % 2 ? 3 : -3), 12, 4);
    }
  }

  private stop(): void {
    for (const target of [this.actors.wren, this.pine, this.braces]) this.scene.tweens.killTweensOf(target);
  }

  destroy(): void {
    if (this.ended) return;
    this.ended = true; this.generation += 1; this.stop();
    this.scene.events.off("shutdown", this.shutdown);
    for (const body of [this.plate, this.pine, this.braces, this.bank, this.footprints]) body.destroy();
    if (this.actors.wren.scene) {
      this.actors.wren.setPosition(this.start.x, this.start.y).setVisible(this.start.visible).setDepth(this.start.depth);
      setWrenPose(this.actors.sprite, "front");
    }
  }
}
