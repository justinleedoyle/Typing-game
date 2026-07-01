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
import { UI_CSS, UI_HEX } from "./ui/uiTheme";

const DEFAULT_Y = 150;
const DEFAULT_WORD_WRAP = 1400;
const FRAMED_WORD_WRAP = 920;
const FADE_DURATION_MS = 400;
const CARD_PAD_X = 30;
const CARD_PAD_Y = 18;
const DEFAULT_SPEAKER_NAME = "Runa";
const SPEAKER_TAB_MIN_W = 86;
const SPEAKER_TAB_PAD_X = 30;
const SPEAKER_TAB_SIDE_PAD = 56;

interface NarrationConfig {
  /** Vertical position of the caption. Defaults to 150; Winter Mountain
   *  uses 160, Sunken Bell uses 120, GreatBattle uses 90. */
  y?: number;
  /** Wrap width in design pixels. Defaults to 1400; GreatBattle uses 1500. */
  wordWrapWidth?: number;
  /** Optional depth. Most scenes don't need it; GreatBattle layers caption
   *  above some HUD elements with depth 5. */
  depth?: number;
  /** UI-cohesion pass: render the caption inside a parchment dialogue card
   *  (brass-framed, dark ink text) instead of bare cream italic text. Opt-in so
   *  only re-skinned scenes change; the card sizes itself to each line. */
  framed?: boolean;
  /** Framed-card speaker ribbon. Framed cards default to "Runa" because the
   *  Almanac script is canonically delivered through Runa's voice. Pass null to
   *  suppress the ribbon for a special-purpose caption. */
  speakerName?: string | null;
  /** Optional scene hook fired whenever a line is rendered. Scenes use this to
   *  give a visible speaker a small attention beat without coupling narration
   *  to actor ownership. */
  onSpeak?: (speakerName: string | null, text: string) => void;
}

interface NarrationOptions {
  /** Override the framed-card ribbon for this one line. `null` suppresses it. */
  speakerName?: string | null;
}

export class NarrationManager {
  private readonly text: Phaser.GameObjects.Text;
  private readonly framed: boolean;
  private readonly defaultSpeakerName: string | null;
  /** Framed mode only: a container holding the card plate + corners + text, so
   *  the whole caption fades/positions as one and the plate resizes per line. */
  private container?: Phaser.GameObjects.Container;
  private cardBg?: Phaser.GameObjects.Graphics;
  private cardCorners?: Phaser.GameObjects.Graphics;
  private speakerBg?: Phaser.GameObjects.Graphics;
  private speakerText?: Phaser.GameObjects.Text;
  private readonly onSpeak?: (speakerName: string | null, text: string) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    config: NarrationConfig = {},
  ) {
    this.framed = config.framed === true;
    this.defaultSpeakerName = config.speakerName === undefined
      ? DEFAULT_SPEAKER_NAME
      : config.speakerName;
    this.onSpeak = config.onSpeak;
    const cx = scene.scale.width / 2;
    const cy = config.y ?? DEFAULT_Y;

    if (this.framed) {
      // Card: dark ink text on a parchment plate, sized to each line in sayRaw.
      this.container = scene.add.container(cx, cy).setAlpha(0);
      this.cardBg = scene.add.graphics();
      this.cardCorners = scene.add.graphics();
      this.speakerBg = scene.add.graphics().setVisible(false);
      this.speakerText = scene.add
        .text(0, 0, "", {
          fontFamily: SERIF,
          fontSize: "17px",
          color: UI_CSS.parchment,
          fontStyle: "italic",
          align: "center",
        })
        .setOrigin(0.5)
        .setVisible(false);
      this.text = scene.add
        .text(0, 0, "", {
          fontFamily: SERIF,
          fontSize: "30px",
          color: UI_CSS.ink,
          fontStyle: "italic",
          align: "center",
          wordWrap: { width: config.wordWrapWidth ?? FRAMED_WORD_WRAP },
        })
        .setOrigin(0.5);
      this.container.add([
        this.cardBg,
        this.cardCorners,
        this.speakerBg,
        this.speakerText,
        this.text,
      ]);
      if (config.depth !== undefined) this.container.setDepth(config.depth);
    } else {
      this.text = scene.add
        .text(cx, cy, "", {
          fontFamily: SERIF,
          fontSize: "32px",
          color: PALETTE.cream,
          fontStyle: "italic",
          align: "center",
          wordWrap: { width: config.wordWrapWidth ?? DEFAULT_WORD_WRAP },
        })
        .setOrigin(0.5);
      if (config.depth !== undefined) this.text.setDepth(config.depth);
    }

    const root = this.container ?? this.text;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => root.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => root.destroy());
  }

  /** Resize the parchment plate + corner brackets to wrap the current text,
   *  drawing straight into the persistent graphics (framed mode). */
  private redrawCard(): void {
    if (!this.cardBg || !this.cardCorners) return;
    const speakerTabW = this.speakerText?.visible
      ? Math.max(SPEAKER_TAB_MIN_W, this.speakerText.width + SPEAKER_TAB_PAD_X)
      : 0;
    const w = Math.max(
      120,
      this.text.width + CARD_PAD_X * 2,
      speakerTabW + SPEAKER_TAB_SIDE_PAD,
    );
    const h = Math.max(56, this.text.height + CARD_PAD_Y * 2);
    this.cardBg.clear();
    this.cardBg.fillStyle(UI_HEX.parchment, 0.96);
    this.cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.cardBg.lineStyle(2, UI_HEX.frame, 0.9);
    this.cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

    this.cardCorners.clear();
    const inset = 7, size = 8;
    const x = w / 2 - inset, y = h / 2 - inset;
    this.cardCorners.lineStyle(2, UI_HEX.brass, 0.9);
    this.cardCorners.beginPath(); this.cardCorners.moveTo(-x, -y + size); this.cardCorners.lineTo(-x, -y); this.cardCorners.lineTo(-x + size, -y); this.cardCorners.strokePath();
    this.cardCorners.beginPath(); this.cardCorners.moveTo(x - size, -y); this.cardCorners.lineTo(x, -y); this.cardCorners.lineTo(x, -y + size); this.cardCorners.strokePath();
    this.cardCorners.beginPath(); this.cardCorners.moveTo(-x, y - size); this.cardCorners.lineTo(-x, y); this.cardCorners.lineTo(-x + size, y); this.cardCorners.strokePath();
    this.cardCorners.beginPath(); this.cardCorners.moveTo(x - size, y); this.cardCorners.lineTo(x, y); this.cardCorners.lineTo(x, y - size); this.cardCorners.strokePath();

    if (this.speakerBg && this.speakerText && this.speakerText.visible) {
      const tabW = Math.max(SPEAKER_TAB_MIN_W, this.speakerText.width + SPEAKER_TAB_PAD_X);
      const tabH = Math.max(28, this.speakerText.height + 10);
      const tabX = -w / 2 + 28;
      const tabY = -h / 2 - tabH / 2 + 5;
      this.speakerBg.clear();
      this.speakerBg.fillStyle(UI_HEX.frame, 0.98);
      this.speakerBg.fillRoundedRect(tabX, tabY, tabW, tabH, 6);
      this.speakerBg.lineStyle(2, UI_HEX.brass, 0.92);
      this.speakerBg.strokeRoundedRect(tabX, tabY, tabW, tabH, 6);
      this.speakerText.setPosition(tabX + tabW / 2, tabY + tabH / 2 - 1);
    }
  }

  private setSpeaker(name: string | null): void {
    if (!this.speakerBg || !this.speakerText) return;
    if (!name) {
      this.speakerBg.clear();
      this.speakerBg.setVisible(false);
      this.speakerText.setText("").setVisible(false);
      return;
    }
    const label = this.formatSpeakerName(name);
    this.speakerText
      .setFontSize(label.includes("\n") ? 14 : 17)
      .setText(label)
      .setVisible(true);
    this.speakerBg.setVisible(true);
  }

  private formatSpeakerName(name: string): string {
    if (name.length <= 12) return name;
    if (name.includes("-")) return name.replace("-", "-\n");
    const words = name.split(/\s+/);
    if (words.length > 1) return `${words[0]}\n${words.slice(1).join(" ")}`;
    return name;
  }

  /** Render a canonical Runa line by ID. Falls back to sayRaw() if the ID is
   *  unknown (so a typo or stale ID degrades gracefully rather than blanking
   *  the caption). When audio files land, this is the hook that plays them. */
  say(lineId: string, opts: NarrationOptions = {}): void {
    const line = getRunaLine(lineId);
    const speakerName = opts.speakerName === undefined
      ? this.defaultSpeakerName
      : opts.speakerName;
    if (!line) {
      // Unknown ID — render the ID itself as a hint during development.
      this.sayRaw(`[missing line: ${lineId}]`, { speakerName });
      return;
    }
    this.sayRaw(line.text, { speakerName });
    // Audio playback hook for when voice work resumes:
    //   playLine(lineId);
  }

  /** Render an inline caption. Use for transitional/inline copy that isn't
   *  in runaLines.ts yet. Migrate to say(lineId) over time. */
  sayRaw(text: string, opts: NarrationOptions = {}): void {
    if (text.trim().length === 0) {
      this.clear();
      return;
    }
    const speakerName = opts.speakerName === undefined
      ? this.defaultSpeakerName
      : opts.speakerName;
    this.text.setText(text);
    if (this.framed) this.setSpeaker(speakerName);
    if (this.framed) this.redrawCard();
    if (text) this.onSpeak?.(speakerName, text);
    const root = this.container ?? this.text;
    root.setAlpha(0);
    this.scene.tweens.add({
      targets: root,
      alpha: 1,
      duration: FADE_DURATION_MS,
      ease: "Sine.easeOut",
    });
  }

  /** Clear the caption immediately (no fade). */
  clear(): void {
    const root = this.container ?? this.text;
    this.scene.tweens.killTweensOf(root);
    this.text.setText("");
    if (this.framed) {
      this.setSpeaker(null);
      this.cardBg?.clear();
      this.cardCorners?.clear();
    }
    this.onSpeak?.(null, "");
    root.setAlpha(0);
  }

  /** Current visible caption — used by scenes that gate logic on "is the
   *  narrator already saying this?" */
  currentText(): string {
    return this.text.text;
  }
}
