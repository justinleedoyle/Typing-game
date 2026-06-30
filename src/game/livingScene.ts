import Phaser from "phaser";

type AmbientKind = "ash" | "bubble" | "ember" | "mist" | "mote" | "snow";

interface AmbientArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AmbientDriftOptions {
  kind: AmbientKind;
  count: number;
  depth?: number;
  area?: AmbientArea;
  color?: number;
  alpha?: number;
  minSize?: number;
  maxSize?: number;
  driftX?: number;
  driftY?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
}

export interface ShadowOptions {
  x?: number;
  y?: number;
  alpha?: number;
  color?: number;
  depth?: number;
}

export interface IdleBreathOptions {
  dy?: number;
  durationMs?: number;
  delayMs?: number;
}

type TweenableObject = Phaser.GameObjects.GameObject & {
  y: number;
};

/** Local ellipse shadow for feet-anchored sprites inside a container. */
export function addLocalGroundShadow(
  scene: Phaser.Scene,
  width: number,
  height: number,
  opts: ShadowOptions = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(opts.color ?? 0x000000, opts.alpha ?? 0.28);
  g.fillEllipse(opts.x ?? 0, opts.y ?? 4, width, height);
  if (opts.depth !== undefined) g.setDepth(opts.depth);
  return g;
}

/** Absolute ground shadow for standalone figures that are not container-backed. */
export function addGroundShadow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: ShadowOptions = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(opts.color ?? 0x000000, opts.alpha ?? 0.28);
  g.fillEllipse(x, y, width, height);
  if (opts.depth !== undefined) g.setDepth(opts.depth);
  return g;
}

/** A subtle idle lift/drop for figures so static cutouts breathe in the scene. */
export function addIdleBreath(
  scene: Phaser.Scene,
  target: TweenableObject,
  opts: IdleBreathOptions = {},
): Phaser.Tweens.Tween {
  const baseY = target.y;
  return scene.tweens.add({
    targets: target,
    y: baseY + (opts.dy ?? -5),
    duration: opts.durationMs ?? 1800,
    delay: opts.delayMs ?? 0,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
}

/** Lightweight foreground/background particles that make a painted scene move. */
export function addAmbientDrift(
  scene: Phaser.Scene,
  opts: AmbientDriftOptions,
): Phaser.GameObjects.Container {
  const area = opts.area ?? {
    x: 0,
    y: 0,
    width: scene.scale.width,
    height: scene.scale.height,
  };
  const container = scene.add.container(0, 0).setDepth(opts.depth ?? -10);
  let alive = true;

  const defaultColor = colorFor(opts.kind);
  for (let i = 0; i < opts.count; i++) {
    const particle = scene.add.graphics();
    drawParticle(
      particle,
      opts.kind,
      opts.color ?? defaultColor,
      Phaser.Math.FloatBetween(opts.minSize ?? 2, opts.maxSize ?? 7),
      opts.alpha ?? alphaFor(opts.kind),
    );
    container.add(particle);
    launchParticle(scene, particle, opts, area, true, () => alive);
  }

  const stop = (): void => {
    if (!alive) return;
    alive = false;
    container.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  scene.events.once(Phaser.Scenes.Events.DESTROY, stop);
  return container;
}

function launchParticle(
  scene: Phaser.Scene,
  particle: Phaser.GameObjects.Graphics,
  opts: AmbientDriftOptions,
  area: AmbientArea,
  initial: boolean,
  isAlive: () => boolean,
): void {
  const startX = Phaser.Math.FloatBetween(area.x, area.x + area.width);
  const startY = Phaser.Math.FloatBetween(area.y, area.y + area.height);
  const driftX = opts.driftX ?? driftXFor(opts.kind);
  const driftY = opts.driftY ?? driftYFor(opts.kind);
  const duration = Phaser.Math.Between(
    opts.minDurationMs ?? 5000,
    opts.maxDurationMs ?? 11000,
  );

  particle.setPosition(startX, startY);
  particle.setAlpha(Phaser.Math.FloatBetween(0.35, 1));

  scene.tweens.add({
    targets: particle,
    x: startX + Phaser.Math.FloatBetween(driftX * 0.55, driftX * 1.25),
    y: startY + Phaser.Math.FloatBetween(driftY * 0.65, driftY * 1.35),
    alpha: { from: particle.alpha, to: 0 },
    duration,
    delay: initial ? Phaser.Math.Between(0, duration) : 0,
    ease: "Sine.easeInOut",
    onComplete: () => {
      if (!isAlive()) return;
      launchParticle(scene, particle, opts, area, false, isAlive);
    },
  });
}

function drawParticle(
  g: Phaser.GameObjects.Graphics,
  kind: AmbientKind,
  color: number,
  size: number,
  alpha: number,
): void {
  g.clear();
  if (kind === "snow") {
    g.lineStyle(Math.max(1, size * 0.5), color, alpha);
    g.beginPath();
    g.moveTo(-size * 1.8, -size * 0.5);
    g.lineTo(size * 1.8, size * 0.5);
    g.strokePath();
    return;
  }
  if (kind === "bubble") {
    g.lineStyle(1, color, alpha);
    g.strokeCircle(0, 0, size);
    return;
  }
  if (kind === "mist") {
    g.fillStyle(color, alpha);
    g.fillEllipse(0, 0, size * 8, size * 2.2);
    return;
  }
  g.fillStyle(color, alpha);
  g.fillCircle(0, 0, size);
}

function colorFor(kind: AmbientKind): number {
  if (kind === "ash") return 0xb7a38a;
  if (kind === "bubble") return 0xaed8df;
  if (kind === "ember") return 0xd6754a;
  if (kind === "mist") return 0xd7ded8;
  if (kind === "mote") return 0xc9a14a;
  return 0xe8f0f8;
}

function alphaFor(kind: AmbientKind): number {
  if (kind === "ember") return 0.62;
  if (kind === "mist") return 0.12;
  if (kind === "mote") return 0.28;
  return 0.45;
}

function driftXFor(kind: AmbientKind): number {
  if (kind === "ember") return 80;
  if (kind === "mist") return 220;
  if (kind === "snow") return -220;
  if (kind === "bubble") return 40;
  return 60;
}

function driftYFor(kind: AmbientKind): number {
  if (kind === "bubble" || kind === "ember") return -260;
  if (kind === "mist") return -40;
  if (kind === "snow") return 560;
  return -120;
}
