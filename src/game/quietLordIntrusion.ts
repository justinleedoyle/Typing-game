// Per §5.5.10, the Quiet Lord's scratched-out text is the only such text in
// the game — when the player sees it, they know who it's from. Visual rules:
// the same serif font as the rest of the game, cream-on-ink, with a bold
// dark cross-out stroke drawn over it (animated in like a quill stroke).
//
// Two entry points use the same visual:
//
//   playQuietLordIntrusion — the mid-realm beat per §5.5.10. Dims the screen,
//     surfaces a sentence of his text, then clears. Once per realm.
//
//   flashQuietLordFragment — the boss-defeat reveal per §5.5.10. The
//     accumulating word fragment (A → Ag → Aga → Agai → Again) flashes
//     centre-screen as the boss falls. No dim — the boss-down moment already
//     has its own camera flash.

import Phaser from "phaser";
import {
  playQuietLordFragmentSting,
  playQuietLordIntrusionSting,
} from "../audio/quietLordSting";
import { SERIF } from "./palette";

/** How much to shift the cross-out stroke up from the text's bbox centre,
 *  expressed as a fraction of fontSize. Phaser text origin (0.5, 0.5) puts
 *  the position at the bbox centre, but the visual glyph midline sits
 *  somewhat above that (the bbox includes descender space). 0.10 works
 *  well across both pure-uppercase (`A`) and mixed-case (`Again`) at
 *  fontSizes 32–64. */
const STROKE_OFFSET_RATIO = 0.1;

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

  // 0) Audio sting — low rumble + whisper, slow attack so it swells under
  //    the dim and peaks with the quill stroke draw. Scheduled at call time
  //    against AudioContext.currentTime; runs independently of the scene
  //    clock so a paused scene can't desync it.
  playQuietLordIntrusionSting();

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

  // 3) Quill cross-out stroke. Draws horizontally through the text's visual
  //    midline. Phaser's text origin=0.5 sits below the glyph centre because
  //    the bbox includes descender space; pure-uppercase strings hug the top
  //    of that bbox while mixed-case spreads further down. Offset by a
  //    fraction of fontSize, scaled by how many lowercase letters are in
  //    the text, so the stroke cuts through cleanly in both cases.
  const strokeWidth = text.width + 24;
  const strokeStartX = opts.x - text.width / 2 - 12;
  const strokeY = opts.y - fontSize * STROKE_OFFSET_RATIO;
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

export interface QuietLordFragmentOptions {
  /** The accumulating word fragment — pass just the letters (`A`, `Ag`,
   *  `Aga`, `Agai`, `Again`). The cross-out stroke is drawn for you;
   *  don't wrap the text in `~~` markers. */
  text: string;
  /** Defaults to 64 — larger than the mid-realm intrusion since this is a
   *  reveal beat. */
  fontSize?: number;
  /** Total visible duration. Defaults to 1800ms — a flash, not a beat. */
  durationMs?: number;
  /** Fired after cleanup. Caller uses this to continue the post-boss flow. */
  onDone?: () => void;
}

/** Flash the Quiet Lord's accumulating-word fragment after a boss falls.
 *  Same scratched-out visual as the mid-realm intrusion (cream serif with
 *  a dark quill stroke) but with no screen dim — the boss-defeat moment has
 *  its own camera flash, and two dims stacking reads as "the game broke". */
export function flashQuietLordFragment(
  scene: Phaser.Scene,
  opts: QuietLordFragmentOptions,
): void {
  const fontSize = opts.fontSize ?? 64;
  const durationMs = opts.durationMs ?? 1800;
  const fadeInMs = 360;
  const fadeOutMs = 480;
  const holdMs = Math.max(0, durationMs - fadeInMs - fadeOutMs);

  const x = scene.scale.width / 2;
  const y = scene.scale.height / 2 - 40;

  // Audio sting — sharper attack than the mid-realm intrusion so it lands
  // with the boss-defeat camera flash that's already in flight.
  playQuietLordFragmentSting();

  const text = scene.add
    .text(x, y, opts.text, {
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

  const strokeWidth = text.width + 24;
  const strokeStartX = x - text.width / 2 - 12;
  const strokeY = y - fontSize * STROKE_OFFSET_RATIO;
  const stroke = scene.add
    .graphics()
    .setDepth(53)
    .lineStyle(8, 0x0b0a0f, 1);
  stroke.beginPath();
  stroke.moveTo(0, 0);
  stroke.lineTo(strokeWidth, 0);
  stroke.strokePath();
  stroke.x = strokeStartX;
  stroke.y = strokeY;
  stroke.scaleX = 0;
  stroke.alpha = 0;
  scene.tweens.add({
    targets: stroke,
    alpha: 1,
    duration: 100,
    delay: 220,
    ease: "Sine.easeIn",
  });
  scene.tweens.add({
    targets: stroke,
    scaleX: 1,
    duration: 320,
    delay: 220,
    ease: "Sine.easeOut",
  });

  scene.time.delayedCall(fadeInMs + holdMs, () => {
    scene.tweens.add({
      targets: [text, stroke],
      alpha: 0,
      duration: fadeOutMs,
      ease: "Sine.easeIn",
      onComplete: () => {
        text.destroy();
        stroke.destroy();
        opts.onDone?.();
      },
    });
  });
}

export interface StaticQuietLordFragmentOptions {
  /** Left-edge x of the text block (origin 0, 0 — aligns with page column). */
  x: number;
  /** Top-edge y of the text block. */
  y: number;
  /** The fragment text — pass just the letters (`A`, `Ag`, etc.). No tilde
   *  markers; the cross-out stroke is drawn for you. */
  text: string;
  /** Font size in px. Defaults to 44. */
  fontSize?: number;
  /** Depth for both the text and stroke objects. Defaults to 10. */
  depth?: number;
}

/** Render the Quiet Lord's scratched-out fragment as permanent page elements —
 *  same cream-serif + dark quill cross-out stroke as the animated flash, but
 *  drawn once and left on screen. Returns the text and stroke objects so the
 *  caller can push them into a managed list for cleanup on page turn. */
export function drawStaticQuietLordFragment(
  scene: Phaser.Scene,
  opts: StaticQuietLordFragmentOptions,
): { text: Phaser.GameObjects.Text; stroke: Phaser.GameObjects.Graphics } {
  const fontSize = opts.fontSize ?? 44;
  const depth = opts.depth ?? 10;

  const text = scene.add
    .text(opts.x, opts.y, opts.text, {
      fontFamily: SERIF,
      fontSize: `${fontSize}px`,
      color: "#f3ead2",
    })
    .setOrigin(0, 0)
    .setDepth(depth);

  // Stroke runs horizontally through the visual glyph midline. The text
  // origin is (0, 0), so the stroke aligns to the left edge, extending 12px
  // past each side to match the animated version's overhang.
  const strokeWidth = text.width + 24;
  const strokeStartX = opts.x - 12;
  // Shift up from the bbox centre by STROKE_OFFSET_RATIO of fontSize — same
  // constant used by the animated flash. With origin (0, 0) the bbox centre
  // sits at y + displayHeight / 2.
  const strokeY =
    opts.y + text.displayHeight / 2 - fontSize * STROKE_OFFSET_RATIO;

  const stroke = scene.add
    .graphics()
    .setDepth(depth + 1)
    .lineStyle(6, 0x0b0a0f, 1);
  stroke.beginPath();
  stroke.moveTo(0, 0);
  stroke.lineTo(strokeWidth, 0);
  stroke.strokePath();
  stroke.x = strokeStartX;
  stroke.y = strokeY;

  return { text, stroke };
}
