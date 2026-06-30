import Phaser from "phaser";

export type AmbientKind = "ash" | "bubble" | "ember" | "mist" | "mote" | "snow";

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

export interface BackdropDriftOptions {
  scale?: number;
  driftX?: number;
  driftY?: number;
  durationMs?: number;
  delayMs?: number;
}

export interface StagedSpriteOptions {
  shadowWidth: number;
  shadowHeight: number;
  shadowOffsetY?: number;
  shadowAlpha?: number;
  shadowDepth?: number;
  restAlpha?: number;
  entranceOffsetY?: number;
  entranceMs?: number;
  delayMs?: number;
  breathDy?: number;
  breathMs?: number;
  breathDelayMs?: number;
}

export interface FadeOutStagedSpriteOptions {
  durationMs?: number;
  riseY?: number;
  ease?: string;
  onComplete?: () => void;
}

export interface StagedContainerEntranceOptions {
  restAlpha?: number;
  entranceOffsetY?: number;
  entranceMs?: number;
  delayMs?: number;
  breathDy?: number;
  breathMs?: number;
  breathDelayMs?: number;
}

type TweenableObject = Phaser.GameObjects.GameObject & {
  y: number;
};

type FadeableTweenableObject = TweenableObject & {
  scene: Phaser.Scene;
  setAlpha(value: number): FadeableTweenableObject;
};

type WakeTarget = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  active: boolean;
};

type BodyImpactTarget = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  active: boolean;
};

type ScalePulseTarget = Phaser.GameObjects.GameObject & {
  active: boolean;
  scaleX: number;
  scaleY: number;
  setScale(x: number, y?: number): ScalePulseTarget;
};

export interface ContainerWakeOptions {
  kind: AmbientKind;
  intervalMs?: number;
  spreadX?: number;
  spreadY?: number;
  offsetX?: number;
  offsetY?: number;
  color?: number;
  alpha?: number;
  size?: number;
  depth?: number;
  driftX?: number;
  driftY?: number;
  durationMs?: number;
}

export interface BodyImpactOptions {
  kind?: AmbientKind;
  color?: number;
  offsetX?: number;
  offsetY?: number;
  depth?: number;
  ringRadius?: number;
  count?: number;
  durationMs?: number;
}

export interface ClaimLineOptions {
  color?: number;
  depth?: number;
  durationMs?: number;
}

export interface UiObjectPulseOptions {
  scale?: number;
  durationMs?: number;
}

export interface MeterPulseOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  depth?: number;
  durationMs?: number;
}

export interface RealmClearResonanceOptions {
  color: number;
  x?: number;
  y?: number;
  depth?: number;
  durationMs?: number;
}

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

/** Subtle breathing motion for a full-screen painted backdrop. The target is
 *  the low-depth background image only, so UI, actors, and word anchors stay
 *  stable while the painting stops feeling like a static wallpaper layer. */
export function addBackdropDrift(
  scene: Phaser.Scene,
  backdrop: Phaser.GameObjects.Image,
  opts: BackdropDriftOptions = {},
): Phaser.Tweens.Tween {
  const baseX = backdrop.x;
  const baseY = backdrop.y;
  const baseScaleX = backdrop.scaleX;
  const baseScaleY = backdrop.scaleY;
  const scale = opts.scale ?? 1.012;
  const extraX = (backdrop.displayWidth * (scale - 1)) / 2;
  const extraY = (backdrop.displayHeight * (scale - 1)) / 2;
  return scene.tweens.add({
    targets: backdrop,
    x: baseX - extraX + (opts.driftX ?? -4),
    y: baseY - extraY + (opts.driftY ?? -3),
    scaleX: baseScaleX * scale,
    scaleY: baseScaleY * scale,
    duration: opts.durationMs ?? 14000,
    delay: opts.delayMs ?? 0,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
}

/** Stage a feet-anchored cutout as a character in the scene: planted shadow,
 *  small entrance drift, and subtle idle breath. Used for NPCs/side figures
 *  that were previously just faded onto the background. */
export function stageAnchoredSprite(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  opts: StagedSpriteOptions,
): Phaser.GameObjects.Graphics {
  const restY = sprite.y;
  const shadow = addGroundShadow(
    scene,
    sprite.x,
    restY + (opts.shadowOffsetY ?? 8),
    opts.shadowWidth,
    opts.shadowHeight,
    {
      alpha: opts.shadowAlpha ?? 0.3,
      depth: opts.shadowDepth ?? sprite.depth - 0.1,
    },
  ).setAlpha(0);
  sprite.setData("livingSceneShadow", shadow);
  sprite.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (shadow.scene) shadow.destroy();
  });

  sprite.setAlpha(0);
  sprite.y = restY + (opts.entranceOffsetY ?? 18);
  scene.tweens.add({
    targets: [sprite, shadow],
    alpha: opts.restAlpha ?? 1,
    duration: opts.entranceMs ?? 720,
    delay: opts.delayMs ?? 0,
    ease: "Sine.easeOut",
  });
  scene.tweens.add({
    targets: sprite,
    y: restY,
    duration: opts.entranceMs ?? 720,
    delay: opts.delayMs ?? 0,
    ease: "Sine.easeOut",
    onComplete: () => {
      if (!sprite.scene) return;
      addIdleBreath(scene, sprite, {
        dy: opts.breathDy ?? -3,
        durationMs: opts.breathMs ?? 2200,
        delayMs: opts.breathDelayMs ?? 0,
      });
    },
  });
  return shadow;
}

/** Fade a staged cutout and its planted shadow together. */
export function fadeOutStagedSprite(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  opts: FadeOutStagedSpriteOptions = {},
): void {
  const shadow = sprite.getData("livingSceneShadow") as
    | Phaser.GameObjects.Graphics
    | undefined;
  scene.tweens.killTweensOf(sprite);
  if (shadow) scene.tweens.killTweensOf(shadow);
  scene.tweens.add({
    targets: shadow ? [sprite, shadow] : sprite,
    alpha: 0,
    duration: opts.durationMs ?? 600,
    ease: opts.ease ?? "Sine.easeIn",
    onComplete: () => {
      if (shadow?.scene) shadow.destroy();
      if (sprite.scene) sprite.destroy();
      opts.onComplete?.();
    },
  });
  if (opts.riseY) {
    scene.tweens.add({
      targets: sprite,
      y: sprite.y + opts.riseY,
      duration: opts.durationMs ?? 600,
      ease: opts.ease ?? "Sine.easeIn",
    });
  }
}

/** Stage an already-built feet-origin container. This is for actors like Wren
 *  whose shadow/glow/sprite are grouped locally and must move as one body. */
export function stageContainerEntrance(
  scene: Phaser.Scene,
  target: FadeableTweenableObject,
  opts: StagedContainerEntranceOptions = {},
): void {
  const restY = target.y;
  target.setAlpha(0);
  target.y = restY + (opts.entranceOffsetY ?? 22);

  scene.tweens.add({
    targets: target,
    y: restY,
    alpha: opts.restAlpha ?? 1,
    duration: opts.entranceMs ?? 680,
    delay: opts.delayMs ?? 80,
    ease: "Sine.easeOut",
    onComplete: () => {
      if (!target.scene) return;
      addIdleBreath(scene, target, {
        dy: opts.breathDy ?? -4,
        durationMs: opts.breathMs ?? 2200,
        delayMs: opts.breathDelayMs ?? 0,
      });
    },
  });
}

/** A short scene-wide resonance for realm-clear payoffs, drawn behind the
 *  Almanac stamp card so the painted world visibly answers the final typed name. */
export function playRealmClearResonance(
  scene: Phaser.Scene,
  opts: RealmClearResonanceOptions,
): void {
  const { width, height } = scene.scale;
  const x = opts.x ?? width / 2;
  const y = opts.y ?? height / 2;
  const duration = opts.durationMs ?? 760;
  const depth = opts.depth ?? 1090;

  const wash = scene.add.graphics().setDepth(depth).setAlpha(0.34);
  wash.fillStyle(opts.color, 0.18);
  wash.fillRect(0, 0, width, height);
  scene.tweens.add({
    targets: wash,
    alpha: 0,
    duration,
    ease: "Sine.easeOut",
    onComplete: () => wash.destroy(),
  });

  const ring = scene.add
    .graphics()
    .setPosition(x, y)
    .setDepth(depth + 1)
    .setAlpha(0.72);
  ring.lineStyle(4, opts.color, 0.74);
  ring.strokeCircle(0, 0, 72);
  ring.lineStyle(1, opts.color, 0.46);
  ring.strokeCircle(0, 0, 108);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scaleX: 3.2,
    scaleY: 3.2,
    duration,
    ease: "Sine.easeOut",
    onComplete: () => ring.destroy(),
  });

  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
    const distance = Phaser.Math.Between(170, 420);
    const fleck = scene.add
      .graphics()
      .setPosition(x, y)
      .setDepth(depth + 2)
      .setAlpha(0.76);
    const size = Phaser.Math.FloatBetween(2.5, 5);
    fleck.fillStyle(opts.color, 0.78);
    fleck.fillCircle(0, 0, size);
    scene.tweens.add({
      targets: fleck,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance * 0.56,
      alpha: 0,
      duration: duration + Phaser.Math.Between(-80, 180),
      ease: "Sine.easeOut",
      onComplete: () => fleck.destroy(),
    });
  }
}

/** Typed combat impact at the enemy/body location, not just at the word. This
 *  is the "the thing in the world reacted" layer that keeps combat from feeling
 *  like floating text over static art. */
export function playBodyImpact(
  scene: Phaser.Scene,
  target: BodyImpactTarget,
  opts: BodyImpactOptions = {},
): void {
  if (!target.active) return;
  const kind = opts.kind ?? "mote";
  const color = opts.color ?? colorFor(kind);
  const x = target.x + (opts.offsetX ?? 0);
  const y = target.y + (opts.offsetY ?? -54);
  const depth = opts.depth ?? 48;
  const duration = opts.durationMs ?? 460;
  const radius = opts.ringRadius ?? 46;

  const ring = scene.add
    .graphics()
    .setPosition(x, y)
    .setDepth(depth)
    .setAlpha(0.7);
  ring.lineStyle(3, color, 0.68);
  ring.strokeEllipse(0, 0, radius * 1.55, radius * 0.74);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scaleX: 1.75,
    scaleY: 1.55,
    duration,
    ease: "Sine.easeOut",
    onComplete: () => ring.destroy(),
  });

  const count = opts.count ?? 12;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
    const distance = Phaser.Math.Between(
      Math.round(radius * 0.55),
      Math.round(radius * 1.35),
    );
    const fleck = scene.add
      .graphics()
      .setPosition(x, y)
      .setDepth(depth + 1)
      .setAlpha(0.82);
    drawParticle(
      fleck,
      kind,
      color,
      Phaser.Math.FloatBetween(2.4, 5.4),
      Math.max(0.24, alphaFor(kind)),
    );
    scene.tweens.add({
      targets: fleck,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance * 0.55 + Phaser.Math.Between(-10, 8),
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: duration + Phaser.Math.Between(-80, 130),
      ease: "Sine.easeOut",
      onComplete: () => fleck.destroy(),
    });
  }
}

/** Brief line of force from Wren / the defended position to a claimed threat.
 *  It fires on target claim so the word reads as attached to scene action, not
 *  as loose UI text floating over the painting. */
export function playClaimLine(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  opts: ClaimLineOptions = {},
): void {
  const color = opts.color ?? 0xc9a14a;
  const duration = opts.durationMs ?? 340;
  const depth = opts.depth ?? 47;
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2 - 28;

  const line = scene.add.graphics().setDepth(depth).setAlpha(0.74);
  line.lineStyle(2, color, 0.62);
  line.lineBetween(fromX, fromY, midX, midY);
  line.lineBetween(midX, midY, toX, toY);
  line.fillStyle(color, 0.72);
  line.fillCircle(toX, toY, 4);
  scene.tweens.add({
    targets: line,
    alpha: 0,
    duration,
    ease: "Sine.easeOut",
    onComplete: () => line.destroy(),
  });

  const endpoint = scene.add
    .graphics()
    .setPosition(toX, toY)
    .setDepth(depth + 1)
    .setAlpha(0.7);
  endpoint.lineStyle(2, color, 0.64);
  endpoint.strokeCircle(0, 0, 12);
  scene.tweens.add({
    targets: endpoint,
    alpha: 0,
    scaleX: 1.8,
    scaleY: 1.8,
    duration,
    ease: "Sine.easeOut",
    onComplete: () => endpoint.destroy(),
  });
}

/** Small console-band/UI pulse for resource meters. Keeps meter changes from
 *  reading as silent redraws while avoiding a full-screen combat effect. */
export function pulseUiObject(
  scene: Phaser.Scene,
  target: ScalePulseTarget,
  opts: UiObjectPulseOptions = {},
): void {
  if (!target.active) return;
  const scale = opts.scale ?? 1.12;
  scene.tweens.killTweensOf(target);
  target.setScale(scale, scale);
  scene.tweens.add({
    targets: target,
    scaleX: 1,
    scaleY: 1,
    duration: opts.durationMs ?? 260,
    ease: "Back.easeOut",
  });
}

/** Meter pulse for absolute-drawn gauges (e.g. Bell's breath bar) where scaling
 *  the Graphics object would distort from the scene origin. */
export function playMeterPulse(
  scene: Phaser.Scene,
  opts: MeterPulseOptions,
): void {
  const g = scene.add
    .graphics()
    .setPosition(opts.x, opts.y)
    .setDepth(opts.depth ?? 1501)
    .setAlpha(0.82);
  g.lineStyle(2, opts.color, 0.78);
  g.strokeRoundedRect(-opts.width / 2, -opts.height / 2, opts.width, opts.height, 7);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.18,
    scaleY: 1.6,
    duration: opts.durationMs ?? 320,
    ease: "Sine.easeOut",
    onComplete: () => g.destroy(),
  });
}

/** A small environmental wake tied to a moving actor/enemy. This is cheaper than
 *  a particle emitter: one hand-drawn fleck at a throttled interval, fading out
 *  behind the body so movement feels connected to the painted world. */
export function addContainerWake(
  scene: Phaser.Scene,
  target: WakeTarget,
  opts: ContainerWakeOptions,
): void {
  const interval = opts.intervalMs ?? 280;
  let elapsed = Phaser.Math.Between(0, interval);
  let alive = true;

  const cleanup = (): void => {
    if (!alive) return;
    alive = false;
    scene.events.off(Phaser.Scenes.Events.UPDATE, emitWake);
  };

  const emitWake = (_time: number, delta: number): void => {
    if (!alive || !target.active || !target.scene) {
      cleanup();
      return;
    }
    elapsed += delta;
    if (elapsed < interval) return;
    elapsed = 0;

    const baseSize = opts.size ?? 6;
    const particle = scene.add.graphics();
    drawParticle(
      particle,
      opts.kind,
      opts.color ?? colorFor(opts.kind),
      Phaser.Math.FloatBetween(Math.max(1, baseSize * 0.72), baseSize * 1.2),
      opts.alpha ?? alphaFor(opts.kind),
    );
    particle
      .setPosition(
        target.x +
          (opts.offsetX ?? 0) +
          Phaser.Math.FloatBetween(-(opts.spreadX ?? 18), opts.spreadX ?? 18),
        target.y +
          (opts.offsetY ?? 0) +
          Phaser.Math.FloatBetween(-(opts.spreadY ?? 8), opts.spreadY ?? 8),
      )
      .setScale(Phaser.Math.FloatBetween(0.75, 1.12));
    if (opts.depth !== undefined) particle.setDepth(opts.depth);

    scene.tweens.add({
      targets: particle,
      x: particle.x + Phaser.Math.FloatBetween(-(opts.driftX ?? 14), opts.driftX ?? 14),
      y: particle.y + (opts.driftY ?? wakeDriftYFor(opts.kind)),
      alpha: 0,
      scaleX: particle.scaleX * 1.55,
      scaleY: particle.scaleY * 1.55,
      duration: opts.durationMs ?? wakeDurationFor(opts.kind),
      ease: "Sine.easeOut",
      onComplete: () => particle.destroy(),
    });
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, emitWake);
  target.once(Phaser.GameObjects.Events.DESTROY, cleanup);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
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

function wakeDriftYFor(kind: AmbientKind): number {
  if (kind === "bubble" || kind === "ember" || kind === "mote") return -34;
  if (kind === "mist") return -18;
  if (kind === "snow") return -12;
  return -24;
}

function wakeDurationFor(kind: AmbientKind): number {
  if (kind === "bubble") return 1200;
  if (kind === "mist") return 1050;
  if (kind === "snow") return 850;
  return 760;
}
