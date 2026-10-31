import Phaser from "phaser";
import { CloudSaveError, SaveConflictError, type AudioLevel, type Difficulty, type SaveStore } from "../saveState";
import { setAudioLevel } from "../../audio/context";
import { installPresentation, PRESENTATION_CHANGED, rememberLocalSaveNotice, localSaveNotice } from "../presentation";
import { SERIF } from "../palette";
import { UI_CSS, UI_HEX } from "./uiTheme";
import { SceneRunGuard } from "../sceneRunGuard";
import { difficultyLabel } from "../purist";
import { navigationAction, cyclePreference } from "./navigationPolicy";
import { installTweenPauseClock } from "../sceneInterruption";

interface ChapterMenuOptions {
  store: SaveStore;
  hasClaim: () => boolean;
  /** Idle Escape hint when the owner routes back instead of opening pause. */
  escapeHint?: () => string;
  onLeave: () => void;
  leaveLabel?: string;
  leaveHint?: string;
}
interface PauseData extends ChapterMenuOptions { owner: Phaser.Scene }
const KEY = "ChapterPauseMenu";
const AUDIO: AudioLevel[] = ["off", "quiet", "medium", "loud"];
const DIFFICULTY: Difficulty[] = ["forgiving", "standard", "purist"];
const ROW_COUNT = 7;

class ChapterPauseMenu extends Phaser.Scene {
  private readonly run = new SceneRunGuard();
  private config!: PauseData;
  private selected = 0;
  private busy = false;
  private canResolve = false;
  private rows: Phaser.GameObjects.Text[] = [];
  private message!: Phaser.GameObjects.Text;
  private openedAt = 0;

  constructor() { super(KEY); }
  init(data: PauseData): void {
    this.run.begin();
    this.config = data;
    this.selected = 0;
    this.busy = false;
    this.canResolve = false;
    this.rows = [];
  }
  create(): void {
    this.openedAt = this.time.now;
    this.add.rectangle(960, 540, 1920, 1080, 0x080b12, 0.88);
    const panel = this.add.graphics();
    panel.fillStyle(UI_HEX.panel, 0.99).fillRoundedRect(450, 150, 1020, 790, 18);
    panel.lineStyle(2, UI_HEX.brass, 0.9).strokeRoundedRect(450, 150, 1020, 790, 18);
    this.add.text(960, 208, "A moment by the fire", {
      fontFamily: SERIF, fontSize: "42px", color: UI_CSS.parchment,
    }).setOrigin(0.5);
    this.add.text(960, 268, "Paused · your words can wait", {
      fontFamily: SERIF, fontSize: "24px", color: UI_CSS.cream,
    }).setOrigin(0.5);
    for (let i = 0; i < ROW_COUNT; i++) {
      const row = this.add.text(960, 326 + i * 62, "", {
        fontFamily: SERIF, fontSize: "30px", color: UI_CSS.cream,
        padding: { x: 30, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      row.on("pointerover", () => { this.selected = i; this.render(); });
      row.on("pointerdown", () => { if (!this.busy) { this.selected = i; this.activate(1); } });
      this.rows.push(row);
    }
    this.message = this.add.text(960, 810,
      "↑ / ↓ choose · Enter select · ← / → adjust · Esc resume", {
        fontFamily: SERIF, fontSize: "22px", color: UI_CSS.cream,
        align: "center", wordWrap: { width: 900 },
      }).setOrigin(0.5);
    this.add.text(960, 885, this.config.leaveHint ?? "Leaving saves the latest chapter checkpoint. An unfinished fight restarts safely.", {
      fontFamily: SERIF, fontSize: "20px", color: UI_CSS.brass,
      align: "center", wordWrap: { width: 900 },
    }).setOrigin(0.5);
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      // Resuming makes the owner active before Phaser finishes this queued
      // event. Consume it across scenes so Escape cannot immediately re-pause
      // (and Enter/Space cannot also advance or type in the resumed chapter).
      event.stopPropagation();
      if (event.repeat || this.time.now - this.openedAt < 180) return;
      if (event.key === "Escape") { this.resume(); return; }
      if (this.busy) return;
      if (this.canResolve && event.key.toLowerCase() === "t") { this.chooseSave(); return; }
      if (event.key === "ArrowUp") { this.selected = (this.selected + ROW_COUNT - 1) % ROW_COUNT; this.render(); }
      else if (event.key === "ArrowDown") { this.selected = (this.selected + 1) % ROW_COUNT; this.render(); }
      else if (event.key === "Enter" || event.key === " ") this.activate(1);
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (this.selected >= 2) this.activate(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    this.input.keyboard?.on("keydown", onKey);
    this.events.once("shutdown", () => {
      this.run.end();
      this.input.keyboard?.off("keydown", onKey);
    });
    this.message.on("pointerdown", () => { if (this.canResolve) this.chooseSave(); });
    this.render();
  }
  private chooseSave(): void {
    this.config.owner.scene.resume();
    this.scene.stop();
    this.config.owner.scene.start("TitleScene");
  }
  private render(): void {
    const s = this.config.store.get();
    const labels = ["Resume", this.config.leaveLabel ?? (this.config.owner.scene.key === "OpeningScene" ? "Save & return to title" : "Save & return to chamber"),
      `Difficulty: ${difficultyLabel(s.difficulty)}`, `Sound: ${s.audioLevel}`, `Dialogue text: ${s.textScale}`,
      `Reduced decorative motion: ${s.reducedMotion ? "on" : "off"}`,
      `Reduced flashes: ${s.reducedFlashes ? "on" : "off"}`];
    this.rows.forEach((row, i) => row.setText(`${i === this.selected ? "›  " : ""}${labels[i]}`)
      .setColor(i === this.selected ? UI_CSS.brass : UI_CSS.cream));
  }
  private activate(direction: number): void {
    const { store, owner } = this.config;
    if (this.selected === 0) { this.resume(); return; }
    if (this.selected === 1) { void this.leave(); return; }
    store.update(s => {
      if (this.selected === 2) s.difficulty = cyclePreference(DIFFICULTY, s.difficulty, direction);
      if (this.selected === 3) s.audioLevel = cyclePreference(AUDIO, s.audioLevel, direction);
      if (this.selected === 4) s.textScale = s.textScale === "large" ? "standard" : "large";
      if (this.selected === 5) s.reducedMotion = !s.reducedMotion;
      if (this.selected === 6) s.reducedFlashes = !s.reducedFlashes;
    });
    setAudioLevel(store.get().audioLevel);
    owner.events.emit(PRESENTATION_CHANGED);
    this.render();
  }
  private resume(): void {
    void this.config.store.flush().catch(() => { /* owner displays retry status */ });
    this.config.owner.scene.resume();
    this.scene.stop();
  }
  private async leave(): Promise<void> {
    const token = this.run.token();
    const { owner, onLeave, store } = this.config;
    this.busy = true;
    this.message.setText("Saving…");
    try {
      await store.flush();
      if (!this.run.isCurrent(token)) return;
      owner.scene.resume();
      this.scene.stop();
      onLeave();
    } catch (error) {
      if (!this.run.isCurrent(token)) return;
      if (error instanceof CloudSaveError) {
        // SyncedBackend writes locally before attempting remote flush. Only
        // this typed cloud error permits leaving with the durable local copy.
        rememberLocalSaveNotice(owner);
        owner.scene.resume();
        this.scene.stop();
        onLeave();
        return;
      }
      this.busy = false;
      this.canResolve = error instanceof SaveConflictError;
      this.message.setText(this.canResolve
        ? `${error instanceof Error ? error.message : "Saving needs attention."}\nPress T or click here to choose a save at the title.`
        : "Could not finish saving. Your session is still here.\nTry again, or press Esc to keep playing.");
      if (this.canResolve) this.message.setInteractive({ useHandCursor: true });
    }
  }
}

/** Installed before scene artwork so preferences also apply on the first frame. */
export function installChapterMenu(scene: Phaser.Scene, options: ChapterMenuOptions) {
  installPresentation(scene, options.store);
  const disposeTweenClock = installTweenPauseClock(scene);
  if (!scene.scene.get(KEY)) scene.scene.add(KEY, ChapterPauseMenu, false);
  const open = () => {
    if (!scene.scene.isActive() || scene.scene.isActive(KEY)) return;
    // The ScenePlugin queues pause until a future frame. Hide can stop frames
    // immediately, so pause the public Systems now: retain the real timestamp,
    // block intervening input and prevent paired blur/hide duplicate launches.
    scene.sys.pause();
    scene.scene.launch(KEY, { ...options, owner: scene });
    scene.scene.bringToTop(KEY);
  };
  const onInterruption = () => {
    open();
    void options.store.flush().catch(() => { /* status remains visible; data retained for retry */ });
  };
  scene.game.events.on(Phaser.Core.Events.BLUR, onInterruption);
  // Visibility changes are a separate Phaser event: hiding a tab does not
  // guarantee window blur. Return to an explicit pause, never live combat.
  scene.game.events.on(Phaser.Core.Events.HIDDEN, onInterruption);
  const hint = scene.add.text(1880, 28, "Esc · pause", {
    fontFamily: SERIF, fontSize: "21px", color: UI_CSS.cream,
    backgroundColor: "#111724", padding: { x: 12, y: 8 },
  }).setOrigin(1, 0).setDepth(1950);
  // Match the next Escape action: a claimed word is released before pausing.
  // Read after scene creation, when its typing controller is installed.
  const updateHint = () => {
    const label = options.hasClaim() ? "Esc · release word" : options.escapeHint?.() ?? "Esc · pause";
    if (hint.text !== label) hint.setText(label);
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, updateHint);
  const status = scene.add.text(1880, 80, "", {
    fontFamily: SERIF, fontSize: "19px", color: UI_CSS.brass,
    backgroundColor: "#111724", padding: { x: 10, y: 5 },
  }).setOrigin(1, 0).setDepth(1950).setVisible(false);
  const updateStatus = () => {
    const error = options.store.getLastError();
    const notice = localSaveNotice(scene);
    status.setVisible(error !== null || notice !== null);
    if (notice) status.setText(notice);
    else if (error) status.setText("Save needs attention · Esc to retry");
  };
  updateStatus();
  const statusTimer = scene.time.addEvent({ delay: 1200, loop: true, callback: updateStatus });
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.game.events.off(Phaser.Core.Events.BLUR, onInterruption);
    scene.game.events.off(Phaser.Core.Events.HIDDEN, onInterruption);
    disposeTweenClock();
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, updateHint);
    hint.destroy();
    status.destroy();
    statusTimer.remove();
    if (scene.scene.isActive(KEY)) scene.scene.stop(KEY);
  };
  scene.events.once("shutdown", destroy);
  return {
    handleKey(event: KeyboardEvent): boolean {
      const action = navigationAction(event, "play", options.hasClaim());
      if (action === null || action === "cancel-typing") return false;
      if (action === "ignore") return true;
      event.preventDefault();
      if (action === "pause") open();
      return true;
    },
    destroy,
  };
}
