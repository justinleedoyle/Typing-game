import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { setAudioLevel } from "../audio/context";
import { applyDevUnlock, parseDevTarget } from "../game/devUnlock";
import { SERIF } from "../game/palette";
import { addAmbientDrift, addBackdropDrift, addLivingLight } from "../game/livingScene";
import { cornerTicks, UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import {
  SaveStore,
  SyncedBackend,
  type SaveBackend,
} from "../game/saveState";
import openingBackdrop from "../../art/references/opening-typewriter-study-clean.png";

const TITLE_TYPEWRITER = { x: 790, y: 740 } as const;
const TITLE_PORTAL = { x: 1510, y: 610 } as const;
const TITLE_PORTAL_BLUE = 0x9fd7ff;

export class TitleScene extends Phaser.Scene {
  private prompt!: Phaser.GameObjects.Text;
  private promptPlate?: Phaser.GameObjects.Graphics;
  private promptTween?: Phaser.Tweens.Tween;
  private store?: SaveStore;
  private storePromise?: Promise<SaveStore>;
  private hasTyped = false;
  private transitioning = false;

  constructor() {
    super("TitleScene");
  }

  preload(): void {
    this.load.image("title-backdrop", openingBackdrop);
  }

  create(): void {
    const { width, height } = this.scale;

    const backdrop = this.add
      .image(0, 0, "title-backdrop")
      .setOrigin(0)
      .setDisplaySize(width, height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 16500, driftX: -5, driftY: -4 });

    const shade = this.add.graphics().setDepth(-10);
    shade.fillStyle(0x0b0a0f, 0.48);
    shade.fillRect(0, 0, width, height);

    addAmbientDrift(this, {
      kind: "mote",
      count: 30,
      depth: -2,
      area: { x: 90, y: 80, width: width - 180, height: height - 180 },
      alpha: 0.2,
      minSize: 1.5,
      maxSize: 3.5,
      driftX: 42,
      driftY: -80,
      minDurationMs: 8500,
      maxDurationMs: 15000,
    });
    addLivingLight(this, {
      x: 790,
      y: 740,
      width: 240,
      height: 150,
      color: 0xf0ad58,
      alpha: 0.08,
      durationMs: 2200,
    });
    addLivingLight(this, {
      x: 1510,
      y: 610,
      width: 260,
      height: 360,
      color: 0x9fd7ff,
      alpha: 0.06,
      durationMs: 3200,
      delayMs: 600,
      scale: 1.045,
    });
    addAmbientDrift(this, {
      kind: "mote",
      count: 10,
      depth: -1.4,
      area: { x: 140, y: height * 0.38, width: width - 280, height: height * 0.46 },
      alpha: 0.14,
      minSize: 3,
      maxSize: 7,
      driftX: 26,
      driftY: -58,
      minDurationMs: 6800,
      maxDurationMs: 11800,
    });

    this.drawTitlePlate(width / 2, height / 2 - 54);

    this.prompt = this.add
      .text(width / 2, height - 168, "press any key", {
        fontFamily: SERIF,
        fontSize: "28px",
        color: UI_CSS.parchment,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.promptPlate = this.drawPromptPlate(this.prompt);

    this.promptTween = this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.35 },
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
    // Apply the saved audio level the moment the store resolves, so even the
    // first title-screen clack respects "off" / "quiet".
    void this.storePromise.then((s) => setAudioLevel(s.get().audioLevel));

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });
  }

  private drawTitlePlate(x: number, y: number): void {
    const w = 1160;
    const h = 220;
    const plate = this.add.graphics().setDepth(2);
    plate.fillStyle(UI_HEX.parchment, 0.93);
    plate.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    plate.lineStyle(3, UI_HEX.frame, 0.92);
    plate.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    cornerTicks(this, w, h, { inset: 10, size: 18, width: 3 })
      .setPosition(x, y)
      .setDepth(3);

    this.add
      .text(x, y - 32, "The Portalwright's Almanac", {
        fontFamily: SERIF,
        fontSize: "78px",
        color: UI_CSS.ink,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(4);

    this.add
      .text(x, y + 50, "a typing adventure", {
        fontFamily: SERIF,
        fontSize: "30px",
        fontStyle: "italic",
        color: UI_CSS.inkSoft,
      })
      .setOrigin(0.5)
      .setDepth(4);
  }

  private drawPromptPlate(prompt: Phaser.GameObjects.Text): Phaser.GameObjects.Graphics {
    const w = this.promptPlateWidth(prompt);
    const h = Math.max(48, prompt.height + 20);
    const plate = this.add.graphics().setDepth(3);
    plate.fillStyle(UI_HEX.panel, 0.72);
    plate.fillRoundedRect(prompt.x - w / 2, prompt.y - h / 2, w, h, 8);
    plate.lineStyle(2, UI_HEX.brass, 0.74);
    plate.strokeRoundedRect(prompt.x - w / 2, prompt.y - h / 2, w, h, 8);
    return plate;
  }

  private promptPlateWidth(prompt: Phaser.GameObjects.Text): number {
    return Math.min(900, Math.max(540, prompt.width + 86));
  }

  private redrawPromptPlate(): void {
    this.promptPlate?.destroy();
    this.promptPlate = this.drawPromptPlate(this.prompt);
  }

  private playTitleStartPulse(): void {
    const { width, height } = this.scale;
    const titleX = width / 2;
    const titleY = height / 2 - 54;

    const titlePulse = this.add
      .graphics()
      .setPosition(titleX, titleY)
      .setDepth(5)
      .setAlpha(0.72);
    titlePulse.lineStyle(4, UI_HEX.brass, 0.7);
    titlePulse.strokeRoundedRect(-610, -118, 1220, 236, 16);

    this.tweens.add({
      targets: titlePulse,
      alpha: 0,
      scaleX: 1.045,
      scaleY: 1.16,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => titlePulse.destroy(),
    });

    const promptW = this.promptPlateWidth(this.prompt);
    const promptH = Math.max(48, this.prompt.height + 20);
    const promptPulse = this.add
      .graphics()
      .setPosition(this.prompt.x, this.prompt.y)
      .setDepth(5)
      .setAlpha(0.82);
    promptPulse.lineStyle(3, UI_HEX.ember, 0.65);
    promptPulse.strokeRoundedRect(-promptW / 2, -promptH / 2, promptW, promptH, 10);

    this.tweens.add({
      targets: promptPulse,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.28,
      duration: 430,
      ease: "Sine.easeOut",
      onComplete: () => promptPulse.destroy(),
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
      this.redrawPromptPlate();
      this.playTitleStartPulse();
    }
    void this.beginTransition();
  }

  private async beginTransition(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.store = await this.storePromise;
    // Dev unlock (opt-in via ?dev) — unlock every realm + fill the satchel, and
    // with ?dev=<realmId> jump straight into that realm. For art + feel-tuning;
    // a no-op in normal play. The unlock persists to the cloud save (the login).
    const dev = parseDevTarget(
      typeof location !== "undefined" ? location.search : "",
    );
    if (dev.unlock && this.store) this.store.update(applyDevUnlock);
    this.playTitleDepartureWake();
    this.time.delayedCall(240, () => {
      this.cameras.main.fadeOut(640, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          if (dev.realmSceneKey) {
            this.scene.start(dev.realmSceneKey, {
              store: this.store,
              revisit: false,
            });
            return;
          }
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private playTitleDepartureWake(): void {
    const wash = this.add.graphics().setDepth(5).setAlpha(0);
    wash.fillStyle(0x0b0a0f, 0.2);
    wash.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: wash,
      alpha: 0.16,
      duration: 110,
      hold: 160,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => wash.destroy(),
    });

    const portalX = TITLE_PORTAL.x;
    const portalY = TITLE_PORTAL.y;
    for (let i = 0; i < 3; i += 1) {
      const ring = this.add
        .graphics()
        .setPosition(portalX, portalY)
        .setDepth(6 + i * 0.1)
        .setAlpha(0.66 - i * 0.1);
      ring.lineStyle(2, i === 1 ? UI_HEX.brass : TITLE_PORTAL_BLUE, 0.62 - i * 0.08);
      ring.strokeEllipse(0, 0, 150 + i * 54, 230 + i * 72);
      ring.fillStyle(TITLE_PORTAL_BLUE, 0.026);
      ring.fillEllipse(0, 0, 170 + i * 50, 250 + i * 72);
      ring.setScale(0.74 + i * 0.08);

      this.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 1.22 + i * 0.08,
        scaleY: 1.14 + i * 0.06,
        duration: 520,
        delay: i * 56,
        ease: "Sine.easeOut",
        onComplete: () => ring.destroy(),
      });
    }

    this.playTitleDepartureFlecks(TITLE_TYPEWRITER.x, TITLE_TYPEWRITER.y, portalX, portalY, 7, 0);
    this.playTitleDepartureFlecks(this.prompt.x, this.prompt.y - 18, portalX, portalY, 6, 70);
  }

  private playTitleDepartureFlecks(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    count: number,
    delayMs: number,
  ): void {
    const colors = [UI_HEX.brass, TITLE_PORTAL_BLUE, UI_HEX.parchment];
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const startX = fromX + Math.cos(angle) * Phaser.Math.Between(10, 34);
      const startY = fromY + Math.sin(angle) * Phaser.Math.Between(8, 24);
      const targetX = toX + Math.cos(angle + 0.7) * Phaser.Math.Between(28, 70);
      const targetY = toY + Math.sin(angle + 0.7) * Phaser.Math.Between(36, 92);
      const fleck = this.add.graphics().setPosition(startX, startY).setDepth(7).setAlpha(0.7);
      fleck.fillStyle(colors[i % colors.length], 0.76);
      fleck.fillCircle(0, 0, 2.2 + (i % 3) * 0.8);

      this.tweens.add({
        targets: fleck,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.32,
        scaleY: 0.32,
        duration: 320 + i * 18,
        delay: delayMs + i * 14,
        ease: "Sine.easeIn",
        onComplete: () => fleck.destroy(),
      });
    }
  }
}
