// Shared caption + narration component. Owns the top-centered Runa caption
// that every scene used to roll on its own — same font, same color, same
// wordWrap, same fade-in tween. Each scene just configures `y` (vertical
// position) and calls say(lineId) or sayRaw(text).
//
// say(lineId) looks up the canonical Runa line in runaLines.ts. When the
// voice work resumes and `runa_${id}.mp3` files land, playLine() is the
// single hook that activates audio playback alongside the caption — no
// scene changes needed at that point.

import Phaser from "phaser";
import { getRunaLine } from "../audio/runaLines";
import { PALETTE, SERIF } from "./palette";

const DEFAULT_Y = 150;
const DEFAULT_WORD_WRAP = 1400;
const FADE_DURATION_MS = 400;

interface NarrationConfig {
  /** Vertical position of the caption. Defaults to 150; Winter Mountain
   *  uses 160, Sunken Bell uses 120, GreatBattle uses 90. */
  y?: number;
  /** Wrap width in design pixels. Defaults to 1400; GreatBattle uses 1500. */
  wordWrapWidth?: number;
  /** Optional depth. Most scenes don't need it; GreatBattle layers caption
   *  above some HUD elements with depth 5. */
  depth?: number;
}

export class NarrationManager {
  private readonly text: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    config: NarrationConfig = {},
  ) {
    this.text = scene.add
      .text(scene.scale.width / 2, config.y ?? DEFAULT_Y, "", {
        fontFamily: SERIF,
        fontSize: "32px",
        color: PALETTE.cream,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: config.wordWrapWidth ?? DEFAULT_WORD_WRAP },
      })
      .setOrigin(0.5);
    if (config.depth !== undefined) this.text.setDepth(config.depth);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.text.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.text.destroy());
  }

  /** Render a canonical Runa line by ID. Falls back to sayRaw() if the ID is
   *  unknown (so a typo or stale ID degrades gracefully rather than blanking
   *  the caption). When audio files land, this is the hook that plays them. */
  say(lineId: string): void {
    const line = getRunaLine(lineId);
    if (!line) {
      // Unknown ID — render the ID itself as a hint during development.
      this.sayRaw(`[missing line: ${lineId}]`);
      return;
    }
    this.sayRaw(line.text);
    // Audio playback hook for when voice work resumes:
    //   playLine(lineId);
  }

  /** Render an inline caption. Use for transitional/inline copy that isn't
   *  in runaLines.ts yet. Migrate to say(lineId) over time. */
  sayRaw(text: string): void {
    this.text.setText(text);
    this.text.setAlpha(0);
    this.scene.tweens.add({
      targets: this.text,
      alpha: 1,
      duration: FADE_DURATION_MS,
      ease: "Sine.easeOut",
    });
  }

  /** Clear the caption immediately (no fade). */
  clear(): void {
    this.text.setText("");
    this.text.setAlpha(0);
  }

  /** Current visible caption — used by scenes that gate logic on "is the
   *  narrator already saying this?" */
  currentText(): string {
    return this.text.text;
  }
}
