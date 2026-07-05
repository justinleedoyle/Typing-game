import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { setAudioLevel } from "../audio/context";
import { applyDevUnlock, parseDevTarget } from "../game/devUnlock";
import { SERIF } from "../game/palette";
import { addAmbientDrift, addBackdropDrift, addLivingLight } from "../game/livingScene";
import { cornerTicks, UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import {
  emptySave,
  SaveStore,
  SyncedBackend,
  type SaveBackend,
  type SaveState,
} from "../game/saveState";
import openingBackdrop from "../../art/references/opening-typewriter-study-clean.png";

const TITLE_TYPEWRITER = { x: 790, y: 740 } as const;
const TITLE_PROMPT = { x: 760, y: 744 } as const;
const TITLE_PLATE = { x: 760, y: 528, width: 790, height: 214 } as const;
const TITLE_PORTAL = { x: 1510, y: 610 } as const;
const TITLE_PORTAL_BLUE = 0x9fd7ff;

export class TitleScene extends Phaser.Scene {
  private prompt!: Phaser.GameObjects.Text;
  private promptPlate?: Phaser.GameObjects.Graphics;
  private promptPlateCorners?: Phaser.GameObjects.Graphics;
  private promptPlateW = 0;
  private promptPlateH = 0;
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

    const titleObjects = this.drawTitlePlate(TITLE_PLATE.x, TITLE_PLATE.y);
    titleObjects.forEach((object, index) => {
      this.stageTitleObject(object, 90 + index * 45, {
        offsetY: index === 0 ? 8 : 12,
      });
    });

    this.prompt = this.add
      .text(TITLE_PROMPT.x, TITLE_PROMPT.y, "press any key", {
        fontFamily: SERIF,
        fontSize: "22px",
        color: UI_CSS.inkSoft,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.promptPlate = this.drawPromptPlate(this.prompt);
    this.promptPlateCorners = this.drawPromptPlateCorners(this.prompt);
    this.stageTitleObject(this.promptPlate, 300, { offsetY: 6 });
    this.stageTitleObject(this.promptPlateCorners, 315, { offsetY: 6 });
    this.stageTitleObject(this.prompt, 335, { offsetY: 10, skipIfTyped: true });

    this.time.delayedCall(650, () => {
      this.startPromptIdleTween();
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

  private drawTitlePlate(x: number, y: number): Phaser.GameObjects.GameObject[] {
    const w = TITLE_PLATE.width;
    const h = TITLE_PLATE.height;
    const shadow = this.add.graphics().setDepth(1);
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillEllipse(x, y + h * 0.47, w * 0.86, h * 0.26);

    const plate = this.add.graphics().setDepth(2);
    plate.fillStyle(UI_HEX.parchment, 0.93);
    plate.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    plate.lineStyle(3, UI_HEX.frame, 0.92);
    plate.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    plate.lineStyle(1, UI_HEX.brass, 0.3);
    plate.lineBetween(x - w / 2 + 34, y + 48, x + w / 2 - 34, y + 48);
    plate.lineStyle(1, UI_HEX.frame, 0.12);
    plate.lineBetween(x - w / 2 + 44, y - 66, x + w / 2 - 44, y - 66);
    const corners = cornerTicks(this, w, h, { inset: 10, size: 18, width: 3 })
      .setPosition(x, y)
      .setDepth(3);

    const titleTop = this.add
      .text(x, y - 50, "The Portalwright's", {
        fontFamily: SERIF,
        fontSize: "56px",
        color: UI_CSS.ink,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(4);

    const titleBottom = this.add
      .text(x, y + 16, "Almanac", {
        fontFamily: SERIF,
        fontSize: "68px",
        color: UI_CSS.ink,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(4);

    const subtitle = this.add
      .text(x, y + 78, "a typing adventure", {
        fontFamily: SERIF,
        fontSize: "30px",
        fontStyle: "italic",
        color: UI_CSS.inkSoft,
      })
      .setOrigin(0.5)
      .setDepth(4);

    return [shadow, plate, corners, titleTop, titleBottom, subtitle];
  }

  private drawPromptPlate(prompt: Phaser.GameObjects.Text): Phaser.GameObjects.Graphics {
    const w = this.promptPlateWidth(prompt);
    const h = Math.max(42, prompt.height + 18);
    this.promptPlateW = w;
    this.promptPlateH = h;
    const plate = this.add.graphics().setDepth(3);
    plate.fillStyle(0x0d0b08, 0.26);
    plate.fillEllipse(prompt.x, prompt.y + h * 0.34, w * 0.88, h * 0.44);
    plate.fillStyle(UI_HEX.parchment, 0.88);
    plate.fillRoundedRect(prompt.x - w / 2, prompt.y - h / 2, w, h, 6);
    plate.lineStyle(2, UI_HEX.brass, 0.66);
    plate.strokeRoundedRect(prompt.x - w / 2, prompt.y - h / 2, w, h, 6);
    plate.lineStyle(1, UI_HEX.frame, 0.18);
    plate.lineBetween(prompt.x - w / 2 + 18, prompt.y + h * 0.18, prompt.x + w / 2 - 18, prompt.y + h * 0.18);
    return plate;
  }

  private drawPromptPlateCorners(
    prompt: Phaser.GameObjects.Text,
  ): Phaser.GameObjects.Graphics {
    return cornerTicks(this, this.promptPlateW, this.promptPlateH, {
      inset: 6,
      size: 7,
      width: 2,
    })
      .setPosition(prompt.x, prompt.y)
      .setDepth(4);
  }

  private promptPlateWidth(prompt: Phaser.GameObjects.Text): number {
    return Math.min(500, Math.max(300, prompt.width + 72));
  }

  private redrawPromptPlate(): void {
    this.promptPlate?.destroy();
    this.promptPlateCorners?.destroy();
    this.promptPlate = this.drawPromptPlate(this.prompt);
    this.promptPlateCorners = this.drawPromptPlateCorners(this.prompt);
    this.playPromptCardWake();
  }

  private playPromptCardWake(): void {
    if (this.promptPlateW <= 0 || this.promptPlateH <= 0) return;
    const pulse = this.add
      .graphics()
      .setPosition(this.prompt.x, this.prompt.y)
      .setDepth(5)
      .setAlpha(0.72);
    pulse.lineStyle(2, UI_HEX.brass, 0.5);
    pulse.strokeRoundedRect(
      -this.promptPlateW / 2 - 5,
      -this.promptPlateH / 2 - 5,
      this.promptPlateW + 10,
      this.promptPlateH + 10,
      9,
    );
    pulse.fillStyle(UI_HEX.brass, 0.12);
    pulse.fillRect(-this.promptPlateW / 2, -this.promptPlateH / 2, this.promptPlateW, 3);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.06,
      scaleY: 1.22,
      duration: 430,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private startPromptIdleTween(): void {
    if (
      this.hasTyped ||
      this.transitioning ||
      this.promptTween ||
      !this.prompt.scene
    ) {
      return;
    }
    this.promptTween = this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.35 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private stageTitleObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
    opts: { offsetY?: number; skipIfTyped?: boolean } = {},
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      y: number;
      setAlpha: (value: number) => unknown;
      setY: (value: number) => unknown;
    };
    if (typeof item.y !== "number" || !item.setAlpha || !item.setY) return;

    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + (opts.offsetY ?? 10));
    this.time.delayedCall(delayMs, () => {
      if (opts.skipIfTyped && this.hasTyped) return;
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 260,
        ease: "Sine.easeOut",
      });
    });
  }

  private playTitleStartPulse(): void {
    const titleX = TITLE_PLATE.x;
    const titleY = TITLE_PLATE.y;

    const titlePulse = this.add
      .graphics()
      .setPosition(titleX, titleY)
      .setDepth(5)
      .setAlpha(0.72);
    titlePulse.lineStyle(4, UI_HEX.brass, 0.7);
    titlePulse.strokeRoundedRect(
      -TITLE_PLATE.width / 2 - 14,
      -TITLE_PLATE.height / 2 - 12,
      TITLE_PLATE.width + 28,
      TITLE_PLATE.height + 24,
      16,
    );

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
    const promptH = Math.max(42, this.prompt.height + 18);
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
      this.tweens.killTweensOf(this.prompt);
      this.prompt.setAlpha(1);
      this.prompt.setPosition(TITLE_PROMPT.x, TITLE_PROMPT.y);
      this.prompt.setText("the cartographer is waking up...");
      this.redrawPromptPlate();
      this.playTitleStartPulse();
    }
    void this.beginTransition();
  }

  private async beginTransition(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    const dev = parseDevTarget(
      typeof location !== "undefined" ? location.search : "",
    );
    // Dev unlock (opt-in via ?dev) — unlock every realm + fill the satchel, and
    // with ?dev=<target> jump straight into a realm or the finale. For art +
    // feel-tuning; a no-op in normal play. The standard unlock persists to the
    // cloud save; loadout=bare uses a temporary in-memory store so it cannot wipe
    // the player's real satchel.
    const immediateBareDevJump =
      dev.unlock && dev.loadout === "bare" && !!dev.realmSceneKey;
    if (immediateBareDevJump) {
      this.store = this.createBareDevStore();
    } else {
      this.store = await this.storePromise;
    }
    if (dev.unlock && this.store && !immediateBareDevJump) {
      if (dev.loadout === "bare") {
        this.store = this.createBareDevStore(this.store);
      } else {
        this.store.update(applyDevUnlock);
      }
    }
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
              devWaveRealmId: dev.finaleWaveRealmId,
            });
            return;
          }
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private createBareDevStore(source?: SaveStore): SaveStore {
    const state = source
      ? (JSON.parse(JSON.stringify(source.get())) as SaveState)
      : emptySave();
    applyDevUnlock(state, { satchel: "empty" });
    const backend: SaveBackend = {
      load: async () => state,
      save: async () => {
        // Intentionally transient: this route is for visual/feel-tuning passes
        // where the full satchel would auto-clear finale waves before inspection.
      },
    };
    return new SaveStore(backend, state);
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
