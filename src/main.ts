import Phaser from "phaser";
import { TitleScene } from "./scenes/TitleScene";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b0a0f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  scene: [TitleScene],
});
