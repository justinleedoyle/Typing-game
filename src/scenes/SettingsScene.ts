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
import {
  addAmbientDrift,
  addContainerWake,
  addLivingLight,
  attachWordBodyAnchor,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
import { SERIF } from "../game/palette";
import { difficultyLabel, togglePuristMode } from "../game/purist";
import {
  emptySave,
  type AudioLevel,
  type Difficulty,
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
const DIFFICULTY_CYCLE: readonly Difficulty[] = ["forgiving", "standard", "purist"] as const;
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
  private menuAnchorReleases: Array<() => void> = [];
  private focusMarks: Phaser.GameObjects.GameObject[] = [];
  private uiTypingPulseTimes = new Map<string, number>();
  private closing = false;

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
  private narratorPlateCorners?: Phaser.GameObjects.Graphics;
  private narratorPlateW = 0;
  private narratorPlateH = 0;

  constructor() {
    super("SettingsScene");
  }

  init(data: SettingsSceneData): void {
    this.store = data.store;
    this.returnTo = data.returnTo ?? "PortalChamberScene";
    this.mode = "normal";
    this.rowTexts = [];
    this.menuTargets = [];
    this.menuAnchorReleases = [];
    this.focusMarks = [];
    this.uiTypingPulseTimes.clear();
    this.closing = false;
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
    addAmbientDrift(this, {
      kind: "mote",
      count: 9,
      depth: -0.35,
      area: {
        x: PANEL_X - PANEL_W / 2 + 80,
        y: PANEL_Y - PANEL_H / 2 + 120,
        width: PANEL_W - 160,
        height: PANEL_H - 200,
      },
      alpha: 0.12,
      minSize: 3,
      maxSize: 6,
      driftX: 34,
      driftY: -62,
      minDurationMs: 6500,
      maxDurationMs: 12000,
    });
    addLivingLight(this, {
      x: PANEL_X - PANEL_W / 2 + 150,
      y: PANEL_Y - PANEL_H / 2 + 105,
      width: 360,
      height: 190,
      color: UI_HEX.brass,
      alpha: 0.032,
      depth: -4,
      durationMs: 3000,
    });
    addLivingLight(this, {
      x: PANEL_X + PANEL_W / 2 - 155,
      y: PANEL_Y + PANEL_H / 2 - 125,
      width: 330,
      height: 180,
      color: UI_HEX.parchment,
      alpha: 0.025,
      depth: -4,
      durationMs: 3600,
      delayMs: 700,
      scale: 1.035,
    });
    this.startSettingsSourceWakes();

    this.drawSettingsShell();

    // Narrator — matches WinterMountainScene's setNarrator styling so the
    // game's voice stays consistent across scenes.
    this.narratorPlate = this.add.graphics();
    this.narratorPlateCorners = this.add.graphics();
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
    this.playSettingsEntryWake();
  }

  private startSettingsSourceWakes(): void {
    const titleEdge = this.add.container(this.scale.width / 2, 138);
    addContainerWake(this, titleEdge, {
      kind: "mote",
      intervalMs: 820,
      spreadX: 210,
      spreadY: 22,
      color: UI_HEX.brass,
      alpha: 0.13,
      size: 2.4,
      depth: 0.18,
      driftX: 16,
      driftY: -24,
      durationMs: 980,
    });

    const ledgerEdge = this.add.container(PANEL_X + PANEL_W / 2 - 78, PANEL_Y - 60);
    addContainerWake(this, ledgerEdge, {
      kind: "mote",
      intervalMs: 900,
      spreadX: 28,
      spreadY: PANEL_H * 0.36,
      color: UI_HEX.parchment,
      alpha: 0.1,
      size: 2.8,
      depth: 0.16,
      driftX: -18,
      driftY: -20,
      durationMs: 1080,
    });
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

    this.drawRow(0, "Difficulty");
    this.drawTokenTrack(
      0,
      DIFFICULTY_CYCLE,
      state.difficulty,
      (tier) => difficultyLabel(tier),
      { tokenW: 126, tokenH: 38, gap: 10 },
    );
    this.drawAction(0, "difficulty", () => this.handleDifficulty());

    this.drawRow(1, "Sound");
    this.drawTokenTrack(
      1,
      AUDIO_CYCLE,
      state.audioLevel,
      (level) => level,
      { tokenW: 92, tokenH: 38, gap: 9 },
    );
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
    for (const release of [...this.menuAnchorReleases]) {
      release();
    }
    this.menuAnchorReleases = [];
    for (const t of this.rowTexts) t.destroy();
    this.rowTexts = [];
    for (const t of this.menuTargets) {
      this.typingInput.unregister(t);
      t.destroy();
    }
    this.menuTargets = [];
  }

  private drawRow(index: number, label: string, value?: string): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    const rowRule = this.add.graphics();
    rowRule.lineStyle(1, UI_HEX.brass, 0.22);
    rowRule.beginPath();
    rowRule.moveTo(ROW_X + LABEL_OFFSET_X, y + 58);
    rowRule.lineTo(ROW_X + 420, y + 58);
    rowRule.strokePath();
    this.rowTexts.push(rowRule);
    this.stageLedgerObject(rowRule, 35 + index * 34, { offsetY: 5 });

    const labelText = this.add
      .text(ROW_X + LABEL_OFFSET_X, y, label, {
        fontFamily: SERIF,
        fontSize: "32px",
        color: UI_CSS.cream,
      })
      .setOrigin(0, 0.5);
    this.rowTexts.push(labelText);
    this.stageLedgerObject(labelText, 50 + index * 34);

    if (value) {
      const valueText = this.add
        .text(ROW_X + VALUE_OFFSET_X, y, value, {
          fontFamily: SERIF,
          fontSize: "32px",
          fontStyle: "italic",
          color: UI_CSS.brass,
        })
        .setOrigin(0, 0.5);
      this.rowTexts.push(valueText);
      this.stageLedgerObject(valueText, 65 + index * 34);
    }
  }

  private drawTokenTrack<T extends string>(
    index: number,
    options: readonly T[],
    active: T,
    labelFor: (value: T) => string,
    opts: { tokenW: number; tokenH: number; gap: number },
  ): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    const totalW = options.length * opts.tokenW + (options.length - 1) * opts.gap;
    const startX = ROW_X + VALUE_OFFSET_X;
    const trackX = startX + totalW / 2;

    const rail = this.add.graphics();
    rail.setPosition(trackX, y);
    rail.fillStyle(UI_HEX.panel, 0.36);
    rail.fillRoundedRect(
      -totalW / 2 - 14,
      -opts.tokenH / 2 - 9,
      totalW + 28,
      opts.tokenH + 18,
      9,
    );
    rail.lineStyle(1, UI_HEX.brass, 0.3);
    rail.strokeRoundedRect(
      -totalW / 2 - 14,
      -opts.tokenH / 2 - 9,
      totalW + 28,
      opts.tokenH + 18,
      9,
    );
    this.rowTexts.push(rail);
    this.stageLedgerObject(rail, 52 + index * 34, { offsetY: 5 });

    options.forEach((option, i) => {
      const x = startX + opts.tokenW / 2 + i * (opts.tokenW + opts.gap);
      const selected = option === active;
      const token = this.add.graphics();
      token.setPosition(x, y);
      token.fillStyle(selected ? UI_HEX.parchment : UI_HEX.panel, selected ? 0.96 : 0.46);
      token.fillRoundedRect(-opts.tokenW / 2, -opts.tokenH / 2, opts.tokenW, opts.tokenH, 7);
      token.lineStyle(
        selected ? 2 : 1,
        selected ? UI_HEX.brass : UI_HEX.frame,
        selected ? 0.9 : 0.45,
      );
      token.strokeRoundedRect(-opts.tokenW / 2, -opts.tokenH / 2, opts.tokenW, opts.tokenH, 7);
      if (selected) {
        token.fillStyle(UI_HEX.ember, 0.84);
        token.fillCircle(-opts.tokenW / 2 + 13, -opts.tokenH / 2 + 11, 4);
      }
      this.rowTexts.push(token);
      this.stageLedgerObject(token, 64 + index * 34 + i * 18, { offsetY: 5 });

      const tokenLabel = this.add
        .text(x + (selected ? 6 : 0), y + 1, labelFor(option), {
          fontFamily: SERIF,
          fontSize: selected ? "18px" : "17px",
          fontStyle: selected ? "normal" : "italic",
          color: selected ? UI_CSS.ink : UI_CSS.cream,
        })
        .setOrigin(0.5);
      this.rowTexts.push(tokenLabel);
      this.stageLedgerObject(tokenLabel, 74 + index * 34 + i * 18, { offsetY: 5 });
    });
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
      onAdvance: () => this.pulseMenuRowTyping(index),
      onComplete,
    });
    this.attachActionAnchor(target, index);
    this.typingInput.register(target);
    this.menuTargets.push(target);
    target.playEntryWake({
      delayMs: 70 + index * 35,
      durationMs: 230,
      offsetY: 10,
    });
  }

  private attachActionAnchor(target: TextWordTarget, index: number): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    this.attachTargetAnchor(target, ROW_X + VALUE_OFFSET_X - 20, y + 12, {
      alpha: 0.11,
      targetOffsetY: -14,
    });
  }

  private attachResetTargetAnchor(
    target: TextWordTarget,
    xOffset: number,
  ): void {
    this.attachTargetAnchor(target, this.scale.width / 2 + xOffset, 478, {
      alpha: 0.12,
      targetOffsetY: -16,
    });
  }

  private attachTargetAnchor(
    target: TextWordTarget,
    sourceX: number,
    sourceY: number,
    opts: { alpha: number; targetOffsetY: number },
  ): void {
    const source = this.add.zone(sourceX, sourceY, 1, 1);
    const handle: WordBodyAnchorHandle = attachWordBodyAnchor(
      this,
      source,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: UI_HEX.brass,
        alpha: opts.alpha,
        depth: 11,
        sourceOffsetY: 0,
        targetOffsetY: opts.targetOffsetY,
      },
    );

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      handle.destroy();
      source.destroy();
      const idx = this.menuAnchorReleases.indexOf(release);
      if (idx >= 0) this.menuAnchorReleases.splice(idx, 1);
    };
    this.menuAnchorReleases.push(release);
  }

  private pulseMenuRow(index: number): void {
    const y = ROW_START_Y + index * ROW_SPACING;
    this.pulseFocusBox(ROW_X + 30, y + 28, 940, 92);
  }

  private pulseMenuRowTyping(index: number): void {
    if (!this.shouldPlayTypingPulse(`row-${index}`)) return;
    const y = ROW_START_Y + index * ROW_SPACING;
    this.pulseTypingBox(ROW_X + 30, y + 28, 940, 92);
  }

  private shouldPlayTypingPulse(key: string): boolean {
    const now = this.time.now;
    const last = this.uiTypingPulseTimes.get(key) ?? -Infinity;
    if (now - last < 90) return false;
    this.uiTypingPulseTimes.set(key, now);
    return true;
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

  private pulseTypingBox(x: number, y: number, w: number, h: number): void {
    const mark = this.add.graphics().setPosition(x, y).setDepth(19).setAlpha(0.42);
    mark.fillStyle(UI_HEX.brass, 0.035);
    mark.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    mark.lineStyle(1, UI_HEX.brass, 0.34);
    mark.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.tweens.add({
      targets: mark,
      alpha: 0,
      scaleX: 1.018,
      scaleY: 1.045,
      duration: 190,
      ease: "Sine.easeOut",
      onComplete: () => mark.destroy(),
    });
  }

  private clearFocusMarks(): void {
    for (const mark of this.focusMarks) {
      this.tweens.killTweensOf(mark);
      mark.destroy();
    }
    this.focusMarks = [];
  }

  private playSettingsEntryWake(): void {
    this.time.delayedCall(140, () => {
      const frame = this.add.graphics().setDepth(18).setAlpha(0.48);
      frame.setPosition(PANEL_X, PANEL_Y);
      frame.lineStyle(2, UI_HEX.brass, 0.52);
      frame.strokeRoundedRect(
        -PANEL_W / 2 - 10,
        -PANEL_H / 2 - 10,
        PANEL_W + 20,
        PANEL_H + 20,
        16,
      );
      frame.fillStyle(UI_HEX.brass, 0.035);
      frame.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 12);

      this.tweens.add({
        targets: frame,
        alpha: 0,
        scaleX: 1.018,
        scaleY: 1.024,
        duration: 680,
        ease: "Sine.easeOut",
        onComplete: () => frame.destroy(),
      });

      for (let i = 0; i < 5; i += 1) {
        this.time.delayedCall(90 + i * 55, () => {
          this.pulseTypingBox(
            ROW_X + 30,
            ROW_START_Y + i * ROW_SPACING + 28,
            940,
            92,
          );
        });
      }
    });
  }

  private playSettingsExitWake(): void {
    const frame = this.add.graphics().setDepth(22).setAlpha(0.46);
    frame.setPosition(PANEL_X, PANEL_Y);
    frame.fillStyle(UI_HEX.panel, 0.12);
    frame.fillRoundedRect(-PANEL_W / 2 - 8, -PANEL_H / 2 - 8, PANEL_W + 16, PANEL_H + 16, 16);
    frame.lineStyle(2, UI_HEX.brass, 0.5);
    frame.strokeRoundedRect(-PANEL_W / 2 - 8, -PANEL_H / 2 - 8, PANEL_W + 16, PANEL_H + 16, 16);

    this.tweens.add({
      targets: frame,
      alpha: 0,
      scaleX: 0.965,
      scaleY: 1.018,
      duration: 420,
      ease: "Sine.easeInOut",
      onComplete: () => frame.destroy(),
    });

    for (let i = 0; i < 5; i += 1) {
      this.time.delayedCall(i * 28, () => {
        const y = ROW_START_Y + i * ROW_SPACING + 28;
        const lane = this.add.graphics().setDepth(23).setAlpha(0.4).setPosition(ROW_X + 30, y);
        lane.fillStyle(UI_HEX.brass, 0.035);
        lane.fillRoundedRect(-470, -38, 940, i === 0 ? 92 : 74, 10);
        lane.lineStyle(1, UI_HEX.brass, 0.28);
        lane.strokeRoundedRect(-470, -38, 940, i === 0 ? 92 : 74, 10);
        this.tweens.add({
          targets: lane,
          alpha: 0,
          scaleX: 0.78,
          scaleY: 1.04,
          duration: 260,
          ease: "Sine.easeIn",
          onComplete: () => lane.destroy(),
        });
      });
    }
  }

  private stageLedgerObject(
    object: Phaser.GameObjects.GameObject,
    delayMs: number,
    opts: { offsetY?: number } = {},
  ): void {
    const item = object as Phaser.GameObjects.GameObject & {
      alpha: number;
      y: number;
      setAlpha: (value: number) => typeof object;
      setY: (value: number) => typeof object;
    };
    if (typeof item.y !== "number" || !item.setAlpha || !item.setY) return;

    const baseY = item.y;
    const finalAlpha = item.alpha;
    item.setAlpha(0);
    item.setY(baseY + (opts.offsetY ?? 8));
    this.time.delayedCall(delayMs, () => {
      if (!object.scene) return;
      this.tweens.add({
        targets: item,
        alpha: finalAlpha,
        y: baseY,
        duration: 220,
        ease: "Sine.easeOut",
      });
    });
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
    this.stageLedgerObject(this.renamePanel, 35, { offsetY: 5 });
    this.stageLedgerObject(this.renamePanelCorners, 45, { offsetY: 5 });

    this.renamePrompt = this.add
      .text(this.scale.width / 2, 380, "Type a new name.", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: UI_CSS.cream,
        fontStyle: "italic",
      })
      .setOrigin(0.5);
    this.stageLedgerObject(this.renamePrompt, 65);

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
    this.stageLedgerObject(this.renameFieldPlate, 85, { offsetY: 6 });

    this.renameField = this.add
      .text(this.scale.width / 2, 460, this.renameBuffer || " ", {
        fontFamily: SERIF,
        fontSize: "48px",
        color: UI_CSS.ink,
      })
      .setOrigin(0.5);
    this.stageLedgerObject(this.renameField, 105);

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
    this.stageLedgerObject(this.renameHint, 130);
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
      onAdvance: () => this.pulseResetPanelTyping(),
      onComplete: () => this.performReset(),
    });
    this.attachResetTargetAnchor(confirmTarget, -160);
    this.typingInput.register(confirmTarget);
    this.menuTargets.push(confirmTarget);
    confirmTarget.playEntryWake({ delayMs: 80, durationMs: 240, offsetY: 12 });

    const cancelTarget = new TextWordTarget({
      scene: this,
      word: "back",
      x: this.scale.width / 2 + 160,
      y: 520,
      fontSize: 34,
      outline: true,
      frame: "banner",
      onClaim: () => this.pulseResetPanel(),
      onAdvance: () => this.pulseResetPanelTyping(),
      onComplete: () => {
        this.mode = "normal";
        this.setNarrator("Save kept. Nothing changed.");
        this.renderMenu();
      },
    });
    this.attachResetTargetAnchor(cancelTarget, 160);
    this.typingInput.register(cancelTarget);
    this.menuTargets.push(cancelTarget);
    cancelTarget.playEntryWake({ delayMs: 125, durationMs: 240, offsetY: 12 });
  }

  private pulseResetPanel(): void {
    this.pulseFocusBox(this.scale.width / 2, 520, 700, 230);
  }

  private pulseResetPanelTyping(): void {
    if (!this.shouldPlayTypingPulse("reset-panel")) return;
    this.pulseTypingBox(this.scale.width / 2, 520, 700, 230);
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
    this.stageLedgerObject(panel, 35, { offsetY: 5 });
    this.stageLedgerObject(corners, 45, { offsetY: 5 });
    this.stageLedgerObject(title, 65);
    this.stageLedgerObject(warning, 90);
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
    if (this.closing) return;
    this.closing = true;
    playChime();
    this.clearMenu();
    this.playSettingsExitWake();
    this.time.delayedCall(220, () => {
      this.cameras.main.fadeOut(430, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(this.returnTo, { store: this.store });
        },
      );
    });
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
    const changed = text !== this.narrator.text;
    this.narrator.setText(text);
    this.redrawNarratorPlate();
    if (changed) this.playNarratorCardWake();
    this.narrator.setAlpha(0);
    this.narratorPlate?.setAlpha(0.9);
    this.narratorPlateCorners?.setAlpha(0.9);
    this.tweens.add({
      targets: [
        this.narrator,
        this.narratorPlate,
        this.narratorPlateCorners,
      ].filter(
        (
          target,
        ): target is Phaser.GameObjects.Text | Phaser.GameObjects.Graphics =>
          !!target,
      ),
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
    const w = Math.max(120, bounds.width + padX * 2);
    const h = Math.max(56, bounds.height + padY * 2);
    this.narratorPlateW = w;
    this.narratorPlateH = h;
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

    this.narratorPlateCorners?.clear();
    if (!this.narratorPlateCorners) return;
    const inset = 7;
    const size = 8;
    const left = this.narrator.x - w / 2 + inset;
    const right = this.narrator.x + w / 2 - inset;
    const top = this.narrator.y - h / 2 + inset;
    const bottom = this.narrator.y + h / 2 - inset;
    this.narratorPlateCorners.lineStyle(2, UI_HEX.brass, 0.9);
    this.narratorPlateCorners.beginPath();
    this.narratorPlateCorners.moveTo(left, top + size);
    this.narratorPlateCorners.lineTo(left, top);
    this.narratorPlateCorners.lineTo(left + size, top);
    this.narratorPlateCorners.strokePath();
    this.narratorPlateCorners.beginPath();
    this.narratorPlateCorners.moveTo(right - size, top);
    this.narratorPlateCorners.lineTo(right, top);
    this.narratorPlateCorners.lineTo(right, top + size);
    this.narratorPlateCorners.strokePath();
    this.narratorPlateCorners.beginPath();
    this.narratorPlateCorners.moveTo(left, bottom - size);
    this.narratorPlateCorners.lineTo(left, bottom);
    this.narratorPlateCorners.lineTo(left + size, bottom);
    this.narratorPlateCorners.strokePath();
    this.narratorPlateCorners.beginPath();
    this.narratorPlateCorners.moveTo(right - size, bottom);
    this.narratorPlateCorners.lineTo(right, bottom);
    this.narratorPlateCorners.lineTo(right, bottom - size);
    this.narratorPlateCorners.strokePath();
  }

  private playNarratorCardWake(): void {
    if (this.narratorPlateW <= 0 || this.narratorPlateH <= 0) return;
    const edge = this.add
      .graphics()
      .setPosition(this.narrator.x, this.narrator.y)
      .setAlpha(0.62);
    edge.lineStyle(2, UI_HEX.brass, 0.46);
    edge.strokeRoundedRect(
      -this.narratorPlateW / 2 - 5,
      -this.narratorPlateH / 2 - 5,
      this.narratorPlateW + 10,
      this.narratorPlateH + 10,
      10,
    );
    edge.fillStyle(UI_HEX.brass, 0.14);
    edge.fillRect(
      -this.narratorPlateW / 2,
      -this.narratorPlateH / 2,
      this.narratorPlateW,
      3,
    );
    this.tweens.add({
      targets: edge,
      alpha: 0,
      scaleX: 1.025,
      scaleY: 1.12,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => edge.destroy(),
    });
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
