// Per §5.5.10, each realm has one brief moment where the Quiet Lord's
// language intrudes on the realm's diegesis — music drops to silence,
// the screen darkens slightly, and a line of his scratched-out text
// surfaces over whatever was there before. This is the only place in the
// game scratched-out text appears; when the player sees it, they know
// who it's from.

import Phaser from "phaser";
import { SERIF } from "./palette";

export interface QuietLordIntrusionOptions {
  /** Center x of the scratched line. */
  x: number;
  /** Center y of the scratched line. */
  y: number;
  /** The Lord's text. Will be rendered cream-on-ink with a dark quill stroke
   *  drawn through it. Keep it short — one line, ≤8 words. */
  text: string;
  /** Defaults to 32. */
  fontSize?: number;
  /** Total visible duration in ms (fade-in + hold + fade-out). Defaults to
   *  2400 — long enough to read, short enough to feel like an intrusion. */
  durationMs?: number;
  /** Fired after cleanup. Caller can use this to resume narration etc. */
  onDone?: () => void;
}

/** Fire a Quiet Lord intrusion at the given position. Renders the
 *  scratched-out text, animates a quill stroke through it, holds, and
 *  cleans up — also briefly dims the screen behind. The realm scene is
 *  responsible for picking the diegetic moment to call this. */
export function playQuietLordIntrusion(
  scene: Phaser.Scene,
  opts: QuietLordIntrusionOptions,
): void {
  const fontSize = opts.fontSize ?? 32;
  const durationMs = opts.durationMs ?? 2400;
  const fadeInMs = 420;
  const fadeOutMs = 480;
  const holdMs = Math.max(0, durationMs - fadeInMs - fadeOutMs);

  // 1) Brief screen dim so the intrusion lands as its own beat. Sits below
  //    the text so the cream stays bright against the darkened backdrop.
  const dim = scene.add
    .graphics()
    .setDepth(50)
    .fillStyle(0x05050a, 1)
    .fillRect(0, 0, scene.scale.width, scene.scale.height)
    .setAlpha(0);
  scene.tweens.add({
    targets: dim,
    alpha: 0.35,
    duration: fadeInMs,
    ease: "Sine.easeIn",
  });

  // 2) The scratched-out line. Cream on ink, same serif as the rest of the
  //    game's typography — looks like the game itself, until the stroke
  //    cuts through it.
  const text = scene.add
    .text(opts.x, opts.y, opts.text, {
      fontFamily: SERIF,
      fontSize: `${fontSize}px`,
      color: "#f3ead2",
    })
    .setOrigin(0.5)
    .setDepth(52)
    .setAlpha(0);
  scene.tweens.add({
    targets: text,
    alpha: 1,
    duration: fadeInMs,
    ease: "Sine.easeOut",
  });

  // 3) Quill cross-out stroke. Draws horizontally through the text's x-height
  //    middle (not the bbox center — Phaser text origin=0.5 puts that lower
  //    than the visual midline of lowercase letters). Animates in left to
  //    right after the text has had a moment to register on its own.
  const strokeWidth = text.width + 24;
  const strokeStartX = opts.x - text.width / 2 - 12;
  const strokeY = opts.y - text.displayHeight * 0.14;
  const stroke = scene.add
    .graphics()
    .setDepth(53)
    .lineStyle(6, 0x0b0a0f, 1);
  stroke.beginPath();
  stroke.moveTo(0, 0);
  stroke.lineTo(strokeWidth, 0);
  stroke.strokePath();
  stroke.x = strokeStartX;
  stroke.y = strokeY;
  // Reveal the stroke via a horizontal scale grow — the graphic's local
  // origin is at strokeStartX (its 0 point), so scaling x from 0 → 1
  // grows the stroke left-to-right like a quill draw.
  stroke.scaleX = 0;
  stroke.alpha = 0;
  scene.tweens.add({
    targets: stroke,
    alpha: 1,
    duration: 120,
    delay: 280,
    ease: "Sine.easeIn",
  });
  scene.tweens.add({
    targets: stroke,
    scaleX: 1,
    duration: 380,
    delay: 280,
    ease: "Sine.easeOut",
  });

  // 4) Hold, then fade everything out together and clean up.
  scene.time.delayedCall(fadeInMs + holdMs, () => {
    scene.tweens.add({
      targets: [text, stroke, dim],
      alpha: 0,
      duration: fadeOutMs,
      ease: "Sine.easeIn",
      onComplete: () => {
        text.destroy();
        stroke.destroy();
        dim.destroy();
        opts.onDone?.();
      },
    });
  });
}
