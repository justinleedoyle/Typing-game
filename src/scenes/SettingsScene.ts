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
import { PALETTE, SERIF } from "../game/palette";
import { difficultyLabel, togglePuristMode } from "../game/purist";
import {
  emptySave,
  type AudioLevel,
  type SaveStore,
} from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
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

export class SettingsScene extends Phaser.Scene {
  private store!: SaveStore;
  private returnTo = "PortalChamberScene";
  private typingInput!: TypingInputController;
  private mode: Mode = "normal";

  // Rows of text we redraw whenever state changes — kept around so we can
  // tear them down before re-rendering instead of leaking through the scene.
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private menuTargets: TextWordTarget[] = [];

  // Rename mode owns its own UI separate from the static rows.
  private renameBuffer = "";
  private renamePrompt?: Phaser.GameObjects.Text;
  private renameField?: Phaser.GameObjects.Text;
  private renameHint?: Phaser.GameObjects.Text;

  private narrator!: Phaser.GameObjects.Text;

  constructor() {
    super("SettingsScene");
  }

  init(data: SettingsSceneData): void {
    this.store = data.store;
    this.returnTo = data.returnTo ?? "PortalChamberScene";
    this.mode = "normal";
    this.rowTexts = [];
    this.menuTargets = [];
    this.renameBuffer = "";
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 15);

    // Dim ink wash so the menu reads as its own quiet room, matching the
    // Almanac's "stepped out of the world for a moment" treatment.
    const g = this.add.graphics();
    g.fillStyle(0x0b0a0f, 0.94);
    g.fillRect(0, 0, this.scale.width, this.scale.height);

    this.add
      .text(this.scale.width / 2, 140, "Settings", {
        fontFamily: SERIF,
        fontSize: "72px",
        color: PALETTE.cream,
      })
      .setOrigin(0.5);

    // Narrator — matches WinterMountainScene's setNarrator styling so the
    // game's voice stays consistent across scenes.
    this.narrator = this.add
      .text(
        this.scale.width / 2,
        220,
        "Type a word to change it. Type `back` to return.",
        {
          fontFamily: SERIF,
          fontSize: "32px",
          color: PALETTE.cream,
          fontStyle: "italic",
          align: "center",
          wordWrap: { width: 1400 },
        },
      )
      .setOrigin(0.5);

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

  /** Tear down and redraw every row + every typing target. Called whenever
   *  the underlying state changes so the menu reflects it. */
  private renderMenu(): void {
    this.clearMenu();

    const state = this.store.get();

    this.drawRow(0, "Difficulty", difficultyLabel(state.difficulty));
    this.drawAction(0, "difficulty", () => this.handleDifficulty());

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
    const labelText = this.add
      .text(ROW_X + LABEL_OFFSET_X, y, label, {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
      })
      .setOrigin(0, 0.5);
    this.rowTexts.push(labelText);

    const valueText = this.add
      .text(ROW_X + VALUE_OFFSET_X, y, value, {
        fontFamily: SERIF,
        fontSize: "32px",
        fontStyle: "italic",
        color: PALETTE.brass,
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
      priority,
      onComplete,
    });
    this.typingInput.register(target);
    this.menuTargets.push(target);
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

    this.renamePrompt = this.add
      .text(this.scale.width / 2, 380, "Type a new name.", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.renameField = this.add
      .text(this.scale.width / 2, 460, this.renameBuffer || " ", {
        fontFamily: SERIF,
        fontSize: "48px",
        color: PALETTE.brass,
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
          color: PALETTE.dim,
          fontStyle: "italic",
        },
      )
      .setOrigin(0.5);
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
    this.renamePrompt?.destroy();
    this.renameField?.destroy();
    this.renameHint?.destroy();
    this.renamePrompt = undefined;
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

    const confirmTarget = new TextWordTarget({
      scene: this,
      word: "confirm",
      x: this.scale.width / 2 - 160,
      y: 520,
      fontSize: 34,
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
      onComplete: () => {
        this.mode = "normal";
        this.setNarrator("Save kept. Nothing changed.");
        this.renderMenu();
      },
    });
    this.typingInput.register(cancelTarget);
    this.menuTargets.push(cancelTarget);
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
      }
    }
  }

  // ─── Narrator helper ────────────────────────────────────────────────────────

  private setNarrator(text: string): void {
    this.narrator.setText(text);
    this.narrator.setAlpha(0);
    this.tweens.add({
      targets: this.narrator,
      alpha: 1,
      duration: 400,
      ease: "Sine.easeOut",
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
