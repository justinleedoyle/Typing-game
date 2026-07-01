import Phaser from "phaser";
import { SERIF } from "../palette";
import { cornerTicks, UI_CSS, UI_HEX } from "./uiTheme";

interface AlmanacStampOptions {
  fontSize?: number;
  holdMs?: number;
  onReveal?: () => void;
}

export function showAlmanacStampCard(
  scene: Phaser.Scene,
  realmName: string,
  onDone: () => void,
  opts: AlmanacStampOptions = {},
): Phaser.GameObjects.Container {
  const fontSize = opts.fontSize ?? 54;
  const holdMs = opts.holdMs ?? 1500;
  const container = scene.add
    .container(scene.scale.width / 2, scene.scale.height / 2)
    .setAlpha(0)
    .setScale(0.6)
    .setDepth(1200);

  const eyebrow = scene.add
    .text(0, -34, "almanac stamp", {
      fontFamily: SERIF,
      fontSize: "18px",
      fontStyle: "italic",
      color: UI_CSS.inkSoft,
      align: "center",
    })
    .setOrigin(0.5);

  const title = scene.add
    .text(0, 14, realmName, {
      fontFamily: SERIF,
      fontSize: `${fontSize}px`,
      color: UI_CSS.ink,
      align: "center",
      wordWrap: { width: 900 },
    })
    .setOrigin(0.5);

  const width = Math.min(1040, Math.max(480, title.width + 104));
  const height = Math.max(132, title.height + 82);
  const bg = scene.add.graphics();
  bg.fillStyle(UI_HEX.parchment, 0.97);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
  bg.lineStyle(3, UI_HEX.frame, 0.9);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);

  const rule = scene.add.graphics();
  rule.lineStyle(1, UI_HEX.brass, 0.55);
  rule.lineBetween(-width / 2 + 48, -8, width / 2 - 48, -8);

  const corners = cornerTicks(scene, width, height, { inset: 9, size: 13, width: 2 });
  const seal = scene.add
    .graphics()
    .setPosition(width / 2 - 82, height / 2 - 38)
    .setAlpha(0)
    .setScale(1.45);
  drawSeal(seal);
  container.add([bg, corners, rule, eyebrow, title, seal]);

  scene.tweens.add({
    targets: container,
    alpha: 1,
    scale: 1,
    duration: 350,
    ease: "Back.easeOut",
    onComplete: () => {
      opts.onReveal?.();
      scene.tweens.add({
        targets: seal,
        alpha: 0.86,
        scale: 1,
        duration: 180,
        ease: "Back.easeOut",
      });
      scene.time.delayedCall(holdMs, () => {
        scene.tweens.add({
          targets: container,
          alpha: 0,
          scale: 1.04,
          duration: 300,
          ease: "Sine.easeIn",
          onComplete: () => {
            container.destroy();
            onDone();
          },
        });
      });
    },
  });

  return container;
}

function drawSeal(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.lineStyle(5, UI_HEX.ember, 0.72);
  g.strokeCircle(0, 0, 34);
  g.lineStyle(2, UI_HEX.ember, 0.58);
  g.strokeCircle(0, 0, 24);
  g.lineStyle(4, UI_HEX.ember, 0.68);
  g.lineBetween(-18, -2, -4, 14);
  g.lineBetween(-4, 14, 22, -17);
  g.lineStyle(1, UI_HEX.ember, 0.42);
  g.lineBetween(-28, -26, 28, 26);
  g.lineBetween(-26, 28, 26, -28);
}
