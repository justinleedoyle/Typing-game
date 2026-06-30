// Player-facing settings menu — purist toggle, audio level, profile rename,
// and a guarded save reset. Entered from the Hub (or any other scene that
// passes a `returnTo` key in scene data) by typing a word.
//
// The scene is typed-word driven like the rest of the game: each option has
// a labelled word the player types to act on it. Rename and reset both have
// a second-step mode — rename swallows raw keystrokes into a name buffer,
// reset demands a `confirm` word before wiping the save.
//
// The audio level field persists, but actual volume scaling lives in the
// audio modules and is wired in a separate change. Storing the preference
// here lets the menu work today; the audio side can read it whenever it
// lands.

import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { setAudioLevel } from "../audio/context";
import { addAmbientDrift } from "../game/livingScene";
import { SERIF } from "../game/palette";
import { difficultyLabel, togglePuristMode } from "../game/purist";
import {
  emptySave,
  type AudioLevel,
  type SaveStore,
} from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { cornerTicks, UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import { TextWordTarget } from "../game/wordTarget";

interface SettingsSceneData {
  store: SaveStore;
  /** Scene key to return to when the player types `back`. Defaults to the
   *  Portal Chamber so the Hub can omit it. */
  returnTo?: string;
}

type Mode = "normal" | "renaming" | "confirming-reset";

const AUDIO_CYCLE: readonly AudioLevel[] = ["loud", "medium", "quiet", "off"] as const;
const MAX_NAME_LENGTH = 16;

const ROW_X = 960;
const ROW_START_Y = 320;
const ROW_SPACING = 110;
const LABEL_OFFSET_X = -360;
const VALUE_OFFSET_X = 80;
const ACTION_OFFSET_Y = 44;
const PANEL_W = 1180;
const PANEL_H = 720;
const PANEL_X = 960;
const PANEL_Y = 560;

export class SettingsScene extends Phaser.Scene {
  private store!: SaveStore;
  private returnTo = "PortalChamberScene";
  private typingInput!: TypingInputController;
  private mode: Mode = "normal";

  // Rows of text we redraw whenever state changes — kept around so we can
  // tear them down before re-rendering instead of leaking through the scene.
  private rowTexts: Phaser.GameObjects.GameObject[] = [];
  private menuTargets: TextWordTarget[] = [];
  private focusMarks: Phaser.GameObjects.GameObject[] = [];

  // Rename mode owns its own UI separate from the static rows.
  private renameBuffer = "";
  private renamePanel?: Phaser.GameObjects.Graphics;
  private renamePanelCorners?: Phaser.GameObjects.Graphics;
  private renamePrompt?: Phaser.GameObjects.Text;
  private renameField?: Phaser.GameObjects.Text;
  private renameHint?: Phaser.GameObjects.Text;
  private renameFieldPlate?: Phaser.GameObjects.Graphics;

  private narrator!: Phaser.GameObjects.Text;
  private narratorPlate?: Phaser.GameObjects.Graphics;

  constructor() {
    super("SettingsScene");
  }

  init(data: SettingsSceneData): void {
    this.store = data.store;
    this.returnTo = data.returnTo ?? "PortalChamberScene";
    this.mode = "normal";
    this.rowTexts = [];
    this.menuTargets = [];
    this.focusMarks = [];
    this.renameBuffer = "";
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 15);

    // Dim ink wash so the menu reads as its own quiet room, matching the
    // Almanac's "stepped out of the world for a moment" treatment.
    const g = this.add.graphics();
    g.fillStyle(0x0b0a0f, 0.95);
    g.fillRect(0, 0, this.scale.width, this.scale.height);
    g.setDepth(-20);

    addAmbientDrift(this, {
      kind: "mote",
      count: 22,
      depth: -1,
      area: {
        x: 220,
        y: 120,
        width: this.scale.width - 440,
        height: this.scale.height - 220,
      },
      alpha: 0.2,
      minSize: 1.5,
      maxSize: 3.5,
      driftX: 70,
      driftY: -130,
      minDurationMs: 7000,
      maxDurationMs: 14000,
    });

    this.drawSettingsShell();

    // Narrator — matches WinterMountainScene's setNarrator styling so the
    // game's voice stays consistent across scenes.
    this.narratorPlate = this.add.graphics();
    this.narrator = this.add
      .text(
        this.scale.width / 2,
        220,
        "Type a word to change it. Type `back` to return.",
        {
          fontFamily: SERIF,
          fontSize: "32px",
          color: UI_CSS.ink,
          fontStyle: "italic",
          align: "center",
          wordWrap: { width: 980 },
        },
      )
      .setOrigin(0.5);
    this.redrawNarratorPlate();

    this.typingInput = new TypingInputController(this.store);
    this.typingInput.setKeystrokeHooks({
      onClaim: () => playClaim(),
    });

    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    this.renderMenu();
  }

  // ─── Menu rendering ─────────────────────────────────────────────────────────

  private drawSettingsShell(): void {
    const bg = this.add.graphics();
    bg.fillStyle(UI_HEX.panel, 0.82);
    bg.fillRoundedRect(
      PANEL_X - PANEL_W / 2,
      PANEL_Y - PANEL_H / 2,
      PANEL_W,
      PANEL_H,
      10,
    );
    bg.lineStyle(3, UI_HEX.brass, 0.82);
    bg.strokeRoundedRect(
      PANEL_X - PANEL_W / 2,
      PANEL_Y - PANEL_H / 2,
      PANEL_W,
      PANEL_H,
      10,
    );

    cornerTicks(this, PANEL_W, PANEL_H, { inset: 10, size: 18, width: 3 })
      .setPosition(PANEL_X, PANEL_Y);

    const titleW = 520;
    const titleH = 102;
    const titleX = this.scale.width / 2;
    const titleY = 138;
    const titlePlate = this.add.graphics();
    titlePlate.fillStyle(UI_HEX.parchment, 0.96);
    titlePlate.fillRoundedRect(
      titleX - titleW / 2,
      titleY - titleH / 2,
      titleW,
      titleH,
      10,
    );
    titlePlate.lineStyle(3, UI_HEX.frame, 0.92);
    titlePlate.strokeRoundedRect(
      titleX - titleW / 2,
      titleY - titleH / 2,
      titleW,
      titleH,
      10,
    );
    cornerTicks(this, titleW, titleH, { inset: 10, size: 18, width: 3 })
      .setPosition(titleX, titleY);

    this.add
      .text(titleX, titleY - 4, "Settings", {
        fontFamily: SERIF,
        fontSize: "62px",
        color: UI_CSS.ink,
      })
      .setOrigin(0.5);
  }

  /** Tear down and redraw every row + every typing target. Called whenever
   *  the underlying state changes so the menu reflects it. */
  private renderMenu(): void {
    this.clearMenu();

    const state = this.store.get();

    this.drawRow(0, "Difficulty", difficultyLabel(state.difficulty));
    this.drawAction(0, "difficulty", () => this.handleDifficulty());
    this.drawDifficultyHint(0);

    this.drawRow(1, "Sound", state.audioLevel);
    this.drawAction(1, "sound", () => this.handleSound());

    this.drawRow(2, "Profile name", state.profileName);
    this.drawAction(2, "rename", () => this.handleRename());

    this.drawRow(3, "Reset save", "wipe everything");
    this.drawAction(3, "reset", () => this.handleReset());

    this.drawRow(4, "Return", `to ${returnLabel(this.returnTo)}`);
    this.drawAction(4, "back", () => this.handleBack(), -2);
  }

  private clearMenu(): void {
    this.clearFocusMarks();
    for (const t of this.rowTexts) t.destroy();
    this.rowTexts = [];
    for (const t of this.menuTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.menuTargets = [];
  }

  private drawRow(index: number, label: string, value: string): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    const rowRule = this.add.graphics();
    rowRule.lineStyle(1, UI_HEX.brass, 0.22);
    rowRule.beginPath();
    rowRule.moveTo(ROW_X + LABEL_OFFSET_X, y + 58);
    rowRule.lineTo(ROW_X + 420, y + 58);
    rowRule.strokePath();
    this.rowTexts.push(rowRule);

    const labelText = this.add
      .text(ROW_X + LABEL_OFFSET_X, y, label, {
        fontFamily: SERIF,
        fontSize: "32px",
        color: UI_CSS.cream,
      })
      .setOrigin(0, 0.5);
    this.rowTexts.push(labelText);

    const valueText = this.add
      .text(ROW_X + VALUE_OFFSET_X, y, value, {
        fontFamily: SERIF,
        fontSize: "32px",
        fontStyle: "italic",
        color: UI_CSS.brass,
      })
      .setOrigin(0, 0.5);
    this.rowTexts.push(valueText);
  }

  private drawAction(
    index: number,
    word: string,
    onComplete: () => void,
    priority = 0,
  ): void {
    const y = ROW_START_Y + index * ROW_SPACING + ACTION_OFFSET_Y;
    const target = new TextWordTarget({
      scene: this,
      word,
      x: ROW_X,
      y,
      fontSize: 22,
      outline: true,
      frame: "banner",
      priority,
      onClaim: () => this.pulseMenuRow(index),
      onComplete,
    });
    this.typingInput.register(target);
    this.menuTargets.push(target);
  }

  private pulseMenuRow(index: number): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    const h = index === 0 ? 112 : 92;
    this.pulseFocusBox(ROW_X + 30, y + 28, 940, h);
  }

  private pulseFocusBox(x: number, y: number, w: number, h: number): void {
    this.clearFocusMarks();
    const mark = this.add.graphics();
    mark.setPosition(x, y).setDepth(20);
    mark.fillStyle(UI_HEX.brass, 0.07);
    mark.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    mark.lineStyle(2, UI_HEX.brass, 0.72);
    mark.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.focusMarks.push(mark);
    this.tweens.add({
      targets: mark,
      alpha: 0,
      scaleX: 1.035,
      scaleY: 1.08,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        mark.destroy();
        this.focusMarks = this.focusMarks.filter((m) => m !== mark);
      },
    });
  }

  private clearFocusMarks(): void {
    for (const mark of this.focusMarks) {
      this.tweens.killTweensOf(mark);
      mark.destroy();
    }
    this.focusMarks = [];
  }

  /** Dim sub-hint under the Difficulty row that surfaces the otherwise-hidden
   *  in-game shortcut. Cycling here works too, but players had no way to learn
   *  about Ctrl+Shift+P, which works from any playing scene. Tracked in
   *  `rowTexts` so it's torn down and redrawn with the rest of the menu. */
  private drawDifficultyHint(index: number): void {
    const y = ROW_START_Y + index * ROW_SPACING + ACTION_OFFSET_Y + 30;
    const hint = this.add
      .text(
        ROW_X,
        y,
        "Forgiving → Standard → Purist. Also Ctrl+Shift+P while playing.",
        {
          fontFamily: SERIF,
          fontSize: "20px",
          color: UI_CSS.cream,
          fontStyle: "italic",
        },
      )
      .setOrigin(0.5, 0.5)
      .setAlpha(0.58);
    this.rowTexts.push(hint);
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  private handleDifficulty(): void {
    togglePuristMode(this, this.store);
    this.renderMenu();
  }

  private handleSound(): void {
    const current = this.store.get().audioLevel;
    const i = AUDIO_CYCLE.indexOf(current);
    const next = AUDIO_CYCLE[(i + 1) % AUDIO_CYCLE.length];
    this.store.update((s) => {
      s.audioLevel = next;
    });
    setAudioLevel(next);
    this.setNarrator(`Sound: ${next}.`);
    this.renderMenu();
  }

  private handleRename(): void {
    this.mode = "renaming";
    this.renameBuffer = this.store.get().profileName;
    this.clearMenu();

    const panelW = 640;
    const panelH = 244;
    const panelX = this.scale.width / 2;
    const panelY = 460;
    this.renamePanel = this.add.graphics();
    this.renamePanel.fillStyle(UI_HEX.panel, 0.58);
    this.renamePanel.fillRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      10,
    );
    this.renamePanel.lineStyle(2, UI_HEX.brass, 0.54);
    this.renamePanel.strokeRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      10,
    );
    this.renamePanelCorners = cornerTicks(this, panelW, panelH, {
      inset: 9,
      size: 14,
      width: 2,
    }).setPosition(panelX, panelY).setAlpha(0.56);

    this.renamePrompt = this.add
      .text(this.scale.width / 2, 380, "Type a new name.", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: UI_CSS.cream,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.renameFieldPlate = this.add.graphics();
    this.renameFieldPlate.fillStyle(UI_HEX.parchment, 0.94);
    this.renameFieldPlate.fillRoundedRect(
      this.scale.width / 2 - 250,
      421,
      500,
      78,
      8,
    );
    this.renameFieldPlate.lineStyle(2, UI_HEX.frame, 0.88);
    this.renameFieldPlate.strokeRoundedRect(
      this.scale.width / 2 - 250,
      421,
      500,
      78,
      8,
    );

    this.renameField = this.add
      .text(this.scale.width / 2, 460, this.renameBuffer || " ", {
        fontFamily: SERIF,
        fontSize: "48px",
        color: UI_CSS.ink,
      })
      .setOrigin(0.5);

    this.renameHint = this.add
      .text(
        this.scale.width / 2,
        540,
        "Enter to save  ·  Escape to cancel",
        {
          fontFamily: SERIF,
          fontSize: "22px",
          color: UI_CSS.cream,
          fontStyle: "italic",
        },
      )
      .setOrigin(0.5);
    this.pulseFocusBox(panelX, panelY, panelW + 54, panelH + 42);
  }

  private commitRename(): void {
    const trimmed = this.renameBuffer.trim();
    if (trimmed.length > 0) {
      this.store.update((s) => {
        s.profileName = trimmed;
      });
      this.setNarrator(`Your name is ${trimmed}.`);
    } else {
      this.setNarrator("Name unchanged.");
    }
    this.exitRenameMode();
  }

  private cancelRename(): void {
    this.setNarrator("Name unchanged.");
    this.exitRenameMode();
  }

  private exitRenameMode(): void {
    this.renamePanel?.destroy();
    this.renamePanelCorners?.destroy();
    this.renamePrompt?.destroy();
    this.renameFieldPlate?.destroy();
    this.renameField?.destroy();
    this.renameHint?.destroy();
    this.renamePanel = undefined;
    this.renamePanelCorners = undefined;
    this.renamePrompt = undefined;
    this.renameFieldPlate = undefined;
    this.renameField = undefined;
    this.renameHint = undefined;
    this.renameBuffer = "";
    this.mode = "normal";
    this.renderMenu();
  }

  private handleReset(): void {
    this.mode = "confirming-reset";
    this.clearMenu();

    this.setNarrator(
      "This will wipe your save. Type `confirm` to do it, or `back` to keep your progress.",
    );
    this.drawResetConfirmPanel();

    const confirmTarget = new TextWordTarget({
      scene: this,
      word: "confirm",
      x: this.scale.width / 2 - 160,
      y: 520,
      fontSize: 34,
      outline: true,
      frame: "banner",
      onClaim: () => this.pulseResetPanel(),
      onComplete: () => this.performReset(),
    });
    this.typingInput.register(confirmTarget);
    this.menuTargets.push(confirmTarget);

    const cancelTarget = new TextWordTarget({
      scene: this,
      word: "back",
      x: this.scale.width / 2 + 160,
      y: 520,
      fontSize: 34,
      outline: true,
      frame: "banner",
      onClaim: () => this.pulseResetPanel(),
      onComplete: () => {
        this.mode = "normal";
        this.setNarrator("Save kept. Nothing changed.");
        this.renderMenu();
      },
    });
    this.typingInput.register(cancelTarget);
    this.menuTargets.push(cancelTarget);
  }

  private pulseResetPanel(): void {
    this.pulseFocusBox(this.scale.width / 2, 520, 700, 230);
  }

  private drawResetConfirmPanel(): void {
    const panelW = 620;
    const panelH = 194;
    const panelX = this.scale.width / 2;
    const panelY = 520;
    const panel = this.add.graphics();
    panel.fillStyle(UI_HEX.panel, 0.58);
    panel.fillRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      10,
    );
    panel.lineStyle(2, UI_HEX.brass, 0.54);
    panel.strokeRoundedRect(
      panelX - panelW / 2,
      panelY - panelH / 2,
      panelW,
      panelH,
      10,
    );
    const corners = cornerTicks(this, panelW, panelH, {
      inset: 9,
      size: 14,
      width: 2,
    }).setPosition(panelX, panelY).setAlpha(0.56);

    const title = this.add
      .text(panelX, panelY - 60, "Reset save?", {
        fontFamily: SERIF,
        fontSize: "34px",
        color: UI_CSS.cream,
      })
      .setOrigin(0.5);
    const warning = this.add
      .text(panelX, panelY - 26, "Everything in this run will be erased.", {
        fontFamily: SERIF,
        fontSize: "21px",
        fontStyle: "italic",
        color: UI_CSS.brass,
      })
      .setOrigin(0.5);

    this.rowTexts.push(panel, corners, title, warning);
  }

  private performReset(): void {
    // Replace state entirely with a fresh default save — same shape the game
    // sees on a brand-new install. Use the SaveStore mutator so the autosave
    // debouncer schedules a flush like any other update.
    const fresh = emptySave();
    this.store.update((s) => {
      s.profileName = fresh.profileName;
      s.typewriterAwakened = fresh.typewriterAwakened;
      s.realms = fresh.realms;
      s.satchel = fresh.satchel;
      s.keyStats = fresh.keyStats;
      s.almanacLore = fresh.almanacLore;
      s.difficulty = fresh.difficulty;
      s.audioLevel = fresh.audioLevel;
    });
    playChime();
    // Land in the Title scene so the player sees the world re-introduce
    // itself rather than dropping back into a now-empty Hub. TitleScene
    // re-loads the SaveStore from the backend, which now reflects the wipe.
    this.cameras.main.fadeOut(600, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => this.scene.start("TitleScene"),
    );
  }

  private handleBack(): void {
    playChime();
    this.cameras.main.fadeOut(350, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start(this.returnTo, { store: this.store });
      },
    );
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (this.mode === "renaming") {
      this.handleRenameKey(event);
      return;
    }
    if (event.key.length === 1 || event.key === " ") playClack();
    this.typingInput.handleChar(event.key);
  }

  private handleRenameKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      this.commitRename();
      return;
    }
    if (event.key === "Escape") {
      this.cancelRename();
      return;
    }
    if (event.key === "Backspace") {
      if (this.renameBuffer.length > 0) {
        this.renameBuffer = this.renameBuffer.slice(0, -1);
        playClack();
        this.renameField?.setText(this.renameBuffer || " ");
        this.pulseRenameField();
      }
      return;
    }
    // Accept printable characters and spaces up to the length cap.
    if (event.key.length === 1 && this.renameBuffer.length < MAX_NAME_LENGTH) {
      const code = event.key.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) {
        this.renameBuffer += event.key;
        playClack();
        this.renameField?.setText(this.renameBuffer);
        this.pulseRenameField();
      }
    }
  }

  private pulseRenameField(): void {
    if (!this.renameFieldPlate) return;
    this.tweens.killTweensOf(this.renameFieldPlate);
    this.renameFieldPlate.setAlpha(1);
    this.tweens.add({
      targets: this.renameFieldPlate,
      alpha: 0.76,
      duration: 80,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  // ─── Narrator helper ────────────────────────────────────────────────────────

  private setNarrator(text: string): void {
    this.narrator.setText(text);
    this.redrawNarratorPlate();
    this.narrator.setAlpha(0);
    this.tweens.add({
      targets: this.narrator,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  private redrawNarratorPlate(): void {
    if (!this.narratorPlate) return;
    const bounds = this.narrator.getBounds();
    const padX = 32;
    const padY = 16;
    const w = bounds.width + padX * 2;
    const h = bounds.height + padY * 2;
    this.narratorPlate.clear();
    this.narratorPlate.fillStyle(UI_HEX.parchment, 0.96);
    this.narratorPlate.fillRoundedRect(
      this.narrator.x - w / 2,
      this.narrator.y - h / 2,
      w,
      h,
      8,
    );
    this.narratorPlate.lineStyle(2, UI_HEX.frame, 0.9);
    this.narratorPlate.strokeRoundedRect(
      this.narrator.x - w / 2,
      this.narrator.y - h / 2,
      w,
      h,
      8,
    );
  }
}

/** Friendly label for the return-to scene key shown in the menu. */
function returnLabel(sceneKey: string): string {
  switch (sceneKey) {
    case "PortalChamberScene":
      return "the hub";
    case "TitleScene":
      return "the title";
    case "AlmanacScene":
      return "the almanac";
    default:
      return "where you came from";
  }
}
