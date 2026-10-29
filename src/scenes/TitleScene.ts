import Phaser from "phaser";
import { playClack } from "../audio/clack";
import { setAudioLevel } from "../audio/context";
import { applyDevUnlock, parseDevTarget } from "../game/devUnlock";
import { SceneRunGuard } from "../game/sceneRunGuard";
import { beginAssetLoad, assetLoadBlocked } from "../game/assetLoadRecovery";
import { downloadSaveRecovery, saveRecoveryPresentation } from "../game/saveRecovery";
import { showRecoveryDialog, type RecoveryDialog } from "../game/ui/recoveryDialog";
import { defaultSaveBackend } from "../game/desktopBackend";
import { titleCheckpoint } from "../game/titleResume";
import { saveChoiceFocus, saveChoicePresentation, saveJourneySummary } from "../game/saveChoice";
import { SERIF } from "../game/palette";
import {
  addAmbientDrift,
  addBackdropDrift,
  addContainerWake,
  addLivingLight,
} from "../game/livingScene";
import { cornerTicks, UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import {
  emptySave,
  SaveStore,
  InvalidSaveError,
  UnsupportedSaveVersionError,
  CloudSaveError,
  type SaveBackend,
  type SaveConflict,
  type SaveSource,
  type SaveState,
  type SaveRecoverySnapshot,
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
  private backend?: SaveBackend;
  private saveChoicePanel?: Phaser.GameObjects.Container;
  private saveChoiceRows: Array<{ source: SaveSource; box: Phaser.GameObjects.Rectangle }> = [];
  private saveChoiceMessage?: Phaser.GameObjects.Text;
  private selectedSave: SaveSource | null = null;
  private resolvingSave = false;
  private recoveryDialog?: RecoveryDialog;
  private recoveringSave = false;
  private readonly run = new SceneRunGuard();

  constructor() {
    super("TitleScene");
  }

  init(): void {
    this.resetTitleRun();
  }

  private resetTitleRun(): void {
    this.recoveryDialog?.destroy();
    this.recoveryDialog = undefined;
    this.recoveringSave = false;
    this.run.begin();
    this.store = undefined;
    this.storePromise = undefined;
    this.backend = undefined;
    this.saveChoicePanel = undefined;
    this.saveChoiceRows = [];
    this.saveChoiceMessage = undefined;
    this.selectedSave = null;
    this.resolvingSave = false;
    this.promptTween = undefined;
    this.promptPlate = undefined;
    this.promptPlateCorners = undefined;
    this.promptPlateW = 0;
    this.promptPlateH = 0;
  }

  preload(): void {
    beginAssetLoad(this);
    this.load.image("title-backdrop", openingBackdrop);
  }

  create(): void {
    if (assetLoadBlocked(this)) return;
    this.resetTitleRun();
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
    this.startTitleSourceWakes();

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
        color: UI_CSS.ink,
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
    this.loadStore();

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.run.end();
      this.recoveryDialog?.destroy();
      this.recoveryDialog = undefined;
      this.recoveringSave = false;
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
      this.store = undefined;
      this.storePromise = undefined;
    });
  }

  private loadStore(): Promise<SaveStore> {
    const dev = parseDevTarget(typeof location !== "undefined" ? location.search : "");
    if (dev.unlock) {
      // Every review shortcut is a fresh, temporary journey. Never even open
      // the player's durable backend for a URL that can unlock progression.
      const satchel = dev.loadout === "bare" ? [] : dev.satchelOverride;
      const store = this.createTemporaryDevStore(undefined, satchel);
      this.storePromise = Promise.resolve(store);
      return this.storePromise;
    }
    const backend = this.backend ??
      (this.registry.get("saveBackend") as SaveBackend | undefined) ??
      defaultSaveBackend();
    this.backend = backend;
    const token = this.run.token();
    const pending = SaveStore.load(backend);
    this.storePromise = pending;
    // Loading can reject without destroying the original save. beginTransition
    // presents a retry; this separate audio listener must also handle rejection.
    void pending.then((store) => {
      if (this.run.isCurrent(token)) setAudioLevel(store.get().audioLevel);
    }, () => {});
    return pending;
  }

  private startTitleSourceWakes(): void {
    const typewriter = this.add.container(TITLE_TYPEWRITER.x, TITLE_TYPEWRITER.y - 16);
    addContainerWake(this, typewriter, {
      kind: "ember",
      intervalMs: 540,
      spreadX: 42,
      spreadY: 16,
      color: UI_HEX.ember,
      alpha: 0.22,
      size: 2.6,
      depth: -0.65,
      driftX: 18,
      driftY: -34,
      durationMs: 980,
    });

    const portal = this.add.container(TITLE_PORTAL.x, TITLE_PORTAL.y);
    addContainerWake(this, portal, {
      kind: "mote",
      intervalMs: 620,
      spreadX: 64,
      spreadY: 110,
      color: TITLE_PORTAL_BLUE,
      alpha: 0.16,
      size: 3,
      depth: -0.7,
      driftX: 26,
      driftY: -40,
      durationMs: 1180,
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
      this.run.has("typed") ||
      this.run.has("transition") ||
      this.promptTween ||
      !this.prompt.scene
    ) {
      return;
    }
    this.promptTween = this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.78 },
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
      if (opts.skipIfTyped && this.run.has("typed")) return;
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.saveChoicePanel) {
      this.handleSaveChoiceKey(event);
      return;
    }
    if (event.key.length !== 1 && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    playClack();
    if (this.run.once("typed")) {
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
    if (!this.run.once("transition")) return;
    const token = this.run.token();
    const dev = parseDevTarget(
      typeof location !== "undefined" ? location.search : "",
    );
    // loadStore isolates every ?dev variant, including bare/unknown values.
    // Normal play continues through the actual durable save and conflict UI.
    try {
      const loaded = await (this.storePromise ?? this.loadStore());
      if (!this.run.isCurrent(token)) return;
      this.store = loaded;
    } catch (error) {
      if (!this.run.isCurrent(token)) return;
      this.storePromise = undefined;
      this.run.release("transition");
      await this.presentSaveLoadFailure(error, token);
      return;
    }
    this.playTitleDepartureWake();
    this.time.delayedCall(240, () => {
      if (!this.run.isCurrent(token)) return;
      this.cameras.main.fadeOut(640, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          if (!this.run.isCurrent(token)) return;
          if (dev.realmSceneKey) {
            this.scene.start(dev.realmSceneKey, {
              store: this.store,
              revisit: false,
              devWaveRealmId: dev.finaleWaveRealmId,
              devFinalePhase: dev.finalePhase,
            });
            return;
          }
          const state = this.store?.get();
          const checkpoint = state ? titleCheckpoint(state) : null;
          if (checkpoint) {
            this.scene.start(checkpoint.scene, { store: this.store, checkpoint });
            return;
          }
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  private async presentSaveLoadFailure(error: unknown, token: number, message?: string): Promise<void> {
    let snapshot: SaveRecoverySnapshot | null | undefined;
    let storageUnavailable = false;
    let recoveryFailed = false;
    try { snapshot = await this.backend?.getRecovery?.(); }
    catch (recoveryError) {
      recoveryFailed = true;
      storageUnavailable = !(recoveryError instanceof CloudSaveError);
    }
    if (!this.run.isCurrent(token)) return;
    // Damaged current bytes can coexist with a valid pending device choice.
    // That choice cannot safely resolve until the unreadable bytes are handled.
    if (!snapshot && !recoveryFailed && !(error instanceof InvalidSaveError) && !(error instanceof UnsupportedSaveVersionError)) {
      const conflict = this.backend?.getConflict?.();
      if (conflict && this.backend?.resolveConflict) { this.showSaveChoice(conflict); return; }
    }
    this.showSaveRecovery(error, snapshot, storageUnavailable, message);
  }

  private showSaveRecovery(error: unknown, snapshot?: SaveRecoverySnapshot | null, storageUnavailable = false, message?: string): void {
    this.recoveryDialog?.destroy();
    this.recoveringSave = false;
    this.promptTween?.stop();
    const token = this.run.token();
    const copy = saveRecoveryPresentation(error, snapshot, storageUnavailable);
    const actions = [{ label: "Try loading again · R", shortcut: "r", onSelect: () => {
      if (!this.run.isCurrent(token)) return;
      this.recoveryDialog?.destroy(); this.recoveryDialog = undefined;
      this.storePromise = undefined;
      this.run.release("transition");
      this.prompt.setText("Loading your saved journey…");
      this.redrawPromptPlate();
      void this.beginTransition();
    } }];
    if (snapshot) actions.push({ label: "Download a recovery copy · D", shortcut: "d", onSelect: () => {
      if (this.run.isCurrent(token)) void this.downloadRecovery(snapshot);
    } });
    if (snapshot?.canStartFresh && this.backend?.startFreshAfterRecovery) actions.push({ label: "Start a new journey… · N", shortcut: "n", onSelect: () => {
      if (this.run.isCurrent(token)) this.confirmRecoveryJourney(snapshot);
    } });
    this.recoveryDialog = showRecoveryDialog({ title: copy.title, message: message ?? copy.message, detail: copy.detail, actions });
  }

  private confirmRecoveryJourney(snapshot: SaveRecoverySnapshot): void {
    const token = this.run.token();
    this.recoveryDialog?.destroy();
    this.recoveryDialog = showRecoveryDialog({
      title: "Start a new journey?",
      message: "You will begin again at the opening. The unreadable saved data will first be kept in a separate recovery copy on this device.",
      detail: "This does not repair the old journey. Keep a downloaded recovery copy if you want one outside this device.",
      actions: [
        { label: "Go back · Esc", shortcut: "Escape", onSelect: () => {
          if (this.run.isCurrent(token)) this.showSaveRecovery(new InvalidSaveError(), snapshot);
        } },
        { label: "Keep the old data and start a new journey", onSelect: () => {
          if (this.run.isCurrent(token)) void this.startRecoveryJourney(snapshot);
        } },
      ],
    });
  }

  private async downloadRecovery(snapshot: SaveRecoverySnapshot): Promise<void> {
    if (this.recoveringSave || !this.backend?.getRecovery) return;
    const token = this.run.token();
    this.recoveringSave = true; this.recoveryDialog?.setBusy(true);
    try {
      // Recheck identity/current bytes before exposing an account-scoped file.
      const current = await this.backend.getRecovery();
      if (!this.run.isCurrent(token)) return;
      if (!current || current.token !== snapshot.token) {
        this.showSaveRecovery(new InvalidSaveError(), current, false, "The saved data changed. Review the current recovery choices before downloading a copy.");
        return;
      }
      downloadSaveRecovery(current);
      this.recoveryDialog?.setMessage("Your browser will save a recovery file. Keep it somewhere safe. The saved journey on this device has not changed.");
    } catch {
      if (this.run.isCurrent(token)) this.recoveryDialog?.setMessage("The recovery copy could not be downloaded. Your saved data has been kept. Try loading again to review its current recovery options.");
    } finally {
      if (this.run.isCurrent(token)) { this.recoveringSave = false; this.recoveryDialog?.setBusy(false); }
    }
  }

  private async startRecoveryJourney(snapshot: SaveRecoverySnapshot): Promise<void> {
    if (this.recoveringSave || !this.backend?.startFreshAfterRecovery) return;
    const token = this.run.token();
    if (!this.run.isCurrent(token)) return;
    this.recoveringSave = true; this.recoveryDialog?.setBusy(true);
    this.recoveryDialog?.setMessage("Keeping the old data before opening a new journey…");
    try {
      const state = await this.backend.startFreshAfterRecovery(snapshot);
      if (!this.run.isCurrent(token)) return;
      this.store = new SaveStore(this.backend, state);
      this.storePromise = Promise.resolve(this.store);
      setAudioLevel(state.audioLevel);
      this.recoveryDialog?.destroy(); this.recoveryDialog = undefined;
      this.recoveringSave = false;
      this.run.release("transition");
      void this.beginTransition();
    } catch (error) {
      if (!this.run.isCurrent(token)) return;
      this.recoveringSave = false;
      await this.presentSaveLoadFailure(error, token, "A new journey could not open safely. Your saved data has been kept. Review the current choices, or try loading again.");
    }
  }

  private showSaveChoice(conflict: SaveConflict, message?: string): void {
    const copy = saveChoicePresentation(conflict);
    this.saveChoicePanel?.destroy();
    this.selectedSave = null;
    this.resolvingSave = false;
    this.saveChoiceRows = [];
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setDepth(2100);
    this.saveChoicePanel = panel;
    const shade = this.add.rectangle(0, 0, width, height, 0x080b12, 0.92);
    const plate = this.add.rectangle(0, 0, 1360, 690, UI_HEX.panel, 1)
      .setStrokeStyle(2, UI_HEX.brass, 0.9);
    const title = this.add.text(0, -286, "Which journey would you like to continue?", {
      fontFamily: SERIF, fontSize: "40px", color: UI_CSS.parchment, align: "center",
    }).setOrigin(0.5);
    const explanation = this.add.text(0, -222,
      copy.explanation, {
        fontFamily: SERIF, fontSize: "24px", color: UI_CSS.cream, align: "center",
      }).setOrigin(0.5);
    panel.add([shade, plate, title, explanation]);
    for (const [index, source] of (["local", "cloud"] as const).entries()) {
      const x = index === 0 ? -330 : 330;
      const state = conflict[source];
      const box = this.add.rectangle(x, -4, 600, 328, UI_HEX.panel, 1)
        .setStrokeStyle(2, UI_HEX.brass, 0.35)
        .setInteractive({ useHandCursor: true });
      box.on("pointerover", () => {
        if (!this.resolvingSave) this.focusSaveChoice(source);
      });
      box.on("pointerdown", () => {
        if (this.resolvingSave) return;
        this.focusSaveChoice(source);
        void this.resolveSaveChoice(source);
      });
      const label = this.add.text(x, -126, copy.labels[source], {
        fontFamily: SERIF, fontSize: "31px", color: UI_CSS.brass, align: "center",
      }).setOrigin(0.5);
      const summary = this.add.text(x, -38, saveJourneySummary(state), {
        fontFamily: SERIF, fontSize: "25px", color: UI_CSS.cream, align: "center",
        lineSpacing: 10, wordWrap: { width: 550 },
      }).setOrigin(0.5);
      const date = new Date(state.updatedAt).toLocaleString(undefined, {
        dateStyle: "medium", timeStyle: "short",
      });
      const saved = this.add.text(x, 62, `${conflict.kind === "device" && source === "local" ? "Updated" : "Saved"} ${date}`, {
        fontFamily: SERIF, fontSize: "21px", color: UI_CSS.cream, align: "center",
      }).setOrigin(0.5);
      const action = this.add.text(x, 122, copy.actions[source], {
        fontFamily: SERIF, fontSize: "27px", color: UI_CSS.brass, align: "center",
      }).setOrigin(0.5);
      panel.add([box, label, summary, saved, action]);
      this.saveChoiceRows.push({ source, box });
    }
    this.saveChoiceMessage = this.add.text(0, 234,
      message ?? "L / C or arrow keys to choose · Enter to continue\nYou can also click a save above.", {
        fontFamily: SERIF, fontSize: "24px", color: UI_CSS.cream, align: "center",
        lineSpacing: 8, wordWrap: { width: 1190 },
      }).setOrigin(0.5);
    panel.add(this.saveChoiceMessage);
  }

  private focusSaveChoice(source: SaveSource): void {
    this.selectedSave = source;
    for (const row of this.saveChoiceRows) {
      row.box.setStrokeStyle(row.source === source ? 4 : 2, UI_HEX.brass,
        row.source === source ? 1 : 0.35);
    }
  }

  private handleSaveChoiceKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (event.repeat || this.resolvingSave) return;
    const source = saveChoiceFocus(event.key, this.selectedSave);
    if (source) this.focusSaveChoice(source);
    if (event.key === "Enter" && this.selectedSave) {
      void this.resolveSaveChoice(this.selectedSave);
    }
  }

  private async resolveSaveChoice(source: SaveSource): Promise<void> {
    if (this.resolvingSave || !this.backend?.resolveConflict) return;
    this.resolvingSave = true;
    const token = this.run.token();
    this.saveChoiceMessage?.setText("Keeping both versions and opening your chosen journey…");
    try {
      const state = await this.backend.resolveConflict(source);
      if (!this.run.isCurrent(token)) return;
      this.store = new SaveStore(this.backend, state);
      this.storePromise = Promise.resolve(this.store);
      setAudioLevel(state.audioLevel);
      this.saveChoicePanel?.destroy();
      this.saveChoicePanel = undefined;
      this.saveChoiceRows = [];
      this.saveChoiceMessage = undefined;
      this.resolvingSave = false;
      this.run.release("transition");
      void this.beginTransition();
    } catch {
      if (!this.run.isCurrent(token)) return;
      const refreshed = this.backend.getConflict?.();
      if (refreshed) {
        this.showSaveChoice(refreshed, saveChoicePresentation(refreshed).retry);
      } else {
        this.resolvingSave = false;
        this.saveChoiceMessage?.setText("The choice could not finish saving. Your versions are preserved.\nSelect a save to retry.");
      }
    }
  }

  private createTemporaryDevStore(
    source: SaveStore | undefined,
    satchel?: readonly string[],
  ): SaveStore {
    const state = source
      ? (JSON.parse(JSON.stringify(source.get())) as SaveState)
      : emptySave();
    applyDevUnlock(state, satchel === undefined ? {} : { satchel });
    const backend: SaveBackend = {
      load: async () => state,
      save: async () => {
        // Review actions, rewards and resets never reach the player's save.
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
