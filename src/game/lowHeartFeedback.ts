import Phaser from "phaser";
import { pickLowHeartLine } from "../audio/runaLines";
import {
  playActorAttention,
  playBodyImpact,
  type AmbientKind,
} from "./livingScene";
import type { ConsoleBand } from "./ui/consoleBand";

type LowHeartBody = Phaser.GameObjects.GameObject & {
  active: boolean;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  setScale(x: number, y?: number): LowHeartBody;
  setTintFill?: (color: number) => LowHeartBody;
  clearTint?: () => LowHeartBody;
};

interface LowHeartFeedbackOptions {
  scene: Phaser.Scene;
  band: ConsoleBand;
  body: LowHeartBody | null | undefined;
  kind: AmbientKind;
  color: number;
  noticeMs?: number;
  bodyOffsetY?: number;
}

/**
 * Shared low-Heart feedback: the console still carries Runa's readout, but the
 * visible Wren body also reacts in the local realm material so Heart is not only
 * an abstract meter in the band.
 */
export function showLowHeartFeedback({
  scene,
  band,
  body,
  kind,
  color,
  noticeMs = 2400,
  bodyOffsetY = -104,
}: LowHeartFeedbackOptions): void {
  band.showNotice(pickLowHeartLine().text, {
    label: "heart",
    durationMs: noticeMs,
  });

  if (!body?.active) return;
  playActorAttention(scene, body, {
    tint: color,
    scale: 1.018,
    durationMs: 180,
  });
  playBodyImpact(scene, body, {
    kind,
    color,
    offsetY: bodyOffsetY,
    ringRadius: 28,
    count: 7,
    depth: 58,
    durationMs: 360,
  });
}
