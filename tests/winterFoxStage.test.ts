import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Run the actual stage class. Display objects and tween scheduling are inert
// boundaries; callbacks, generation checks, actor ownership and cleanup are real.
const url = new URL("../src/game/winterFoxEncounter.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(statement => ts.isClassDeclaration(statement)
  && statement.name?.text === "WinterFoxCareStage")!;
const code = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const png = readFileSync(new URL("../art/wren/wren-kneel-right-v1.png", import.meta.url));
const artSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
const sceneUrl = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const sceneSource = ts.createSourceFile(sceneUrl.pathname, readFileSync(sceneUrl, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = sceneSource.statements.find(ts.isClassDeclaration)!;
const feedbackMethods = ["makeWord", "makeFoxWord", "playWrenTypingPulse", "clearFoxCare"];
const feedbackCode = ts.transpileModule(`class Feedback {
  ${feedbackMethods.map(name => sceneClass.members.find(member => member.name?.getText(sceneSource) === name)!.getText(sceneSource)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function display(kind: string, x = 0, y = 0): any {
  const value: any = { kind, x, y, alpha: 1, visible: true, scaleX: 1, scaleY: 1,
    active: true, scene: true, children: [], shapes: [], mutations: 0, destroys: 0,
    setPosition(x: number, y: number) { this.x = x; this.y = y; this.mutations++; return this; },
    setVisible(visible: boolean) { this.visible = visible; this.mutations++; return this; },
    setAlpha(alpha: number) { this.alpha = alpha; this.mutations++; return this; },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; this.mutations++; return this; },
    setDepth(depth: number) { this.depth = depth; this.mutations++; return this; },
    setOrigin(x: number, y = x) { this.originX = x; this.originY = y; this.mutations++; return this; },
    setTint(...colors: number[]) { this.colors = colors; this.mutations++; return this; },
    add(child: any) { this.children.push(child); this.mutations++; return this; },
    once(_event: string, callback: () => void) { (this.destroyCallbacks ??= []).push(callback); return this; },
    clear() { this.shapes = []; this.mutations++; return this; },
    fillStyle(color: number, alpha: number) { this.fill = { color, alpha }; return this; },
    fillCircle(x: number, y: number, radius: number) { this.shapes.push({ shape: "circle", x, y, radius, ...this.fill }); this.mutations++; return this; },
    fillEllipse(x: number, y: number, width: number, height: number) { this.shapes.push({ shape: "ellipse", x, y, width, height, ...this.fill }); this.mutations++; return this; },
    destroy() { this.destroys++; this.scene = false; this.active = false; this.mutations++;
      for (const callback of this.destroyCallbacks ?? []) callback();
      for (const child of this.children) child.destroy(); },
  };
  return value;
}

function fixture(reduced = false, visible = true) {
  let now = 0;
  const bodies: any[] = [], tweens: any[] = [], kills: any[] = [], poses: string[] = [];
  const wren = display("wren", 960, 842), sprite = display("standing-painting"), fox = display("fox", 1250, 842);
  wren.visible = visible;
  sprite.pose = "front";
  const events = new EventEmitter();
  const scene = {
    reduced, events,
    add: {
      container(x: number, y: number) { const value = display("container", x, y); bodies.push(value); return value; },
      image(x: number, y: number, key: string) {
        assertEqual(key, "wren-kneel-right", "the stage uses the authored kneeling painting");
        const value = Object.assign(display("image", x, y), artSize, { key }); bodies.push(value); return value;
      },
      graphics() { const value = display("graphics"); bodies.push(value); return value; },
    },
    tweens: {
      add(options: any) {
        const tween = { ...options, at: now + options.duration, cancelled: false, done: false };
        tweens.push(tween); return tween;
      },
      killTweensOf(body: any) {
        kills.push(body);
        for (const tween of tweens) {
          if ((Array.isArray(tween.targets) ? tween.targets : [tween.targets]).includes(body)) tween.cancelled = true;
        }
      },
    },
  };
  const bindings = {
    applySceneActorLighting: (_scene: unknown, body: any) => { body.lit = true; },
    addLocalGroundShadow: (_scene: unknown, width: number, height: number, options: any) => {
      const value = Object.assign(display("shadow"), { width, height, options }); bodies.push(value); return value;
    },
    addSoftLocalLight: (_scene: unknown, width: number, height: number, color: number, alpha: number) => {
      const value = Object.assign(display("local-light"), { width, height, color, sourceAlpha: alpha }); bodies.push(value); return value;
    },
    reducedMotion: (context: typeof scene) => context.reduced,
    setWrenPose: (body: any, pose: string, faceLeft = false) => {
      body.pose = pose; body.faceLeft = faceLeft; body.mutations++; poses.push(pose);
    },
  };
  const Stage = new Function(...Object.keys(bindings), `${code}; return WinterFoxCareStage;`)(...Object.values(bindings));
  const stage = new Stage(scene, { wren, sprite, fox });
  return { scene, stage, wren, sprite, fox, bodies, tweens, kills, poses, events,
    tick(ms: number) {
      const end = now + ms;
      while (true) {
        const next = tweens.filter(tween => !tween.done && !tween.cancelled && tween.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at; next.done = true;
        for (const body of Array.isArray(next.targets) ? next.targets : [next.targets]) {
          for (const key of ["x", "y", "alpha"]) if (typeof next[key] === "number") body[key] = next[key];
        }
        next.onComplete?.();
      }
      now = end;
    },
    snapshot() {
      return [...bodies, wren, sprite, fox].map(body => [body.kind, body.x, body.y, body.alpha, body.visible,
        body.scene, body.mutations, body.destroys, body.pose]);
    },
  };
}

await suite("Winter fox stage: normal approach waits for Wren's movement and the fox's own approach", () => {
  for (const approach of ["light", "space"] as const) {
    const f = fixture(); let settled = 0;
    f.stage.present(approach, false, () => { settled++; });
    assertEqual([f.wren.visible, f.stage.owner.visible, f.stage.warmth.visible, settled], [true, false, false, 0], "the standing actor owns the initial movement, before any kneeling or reassurance");
    assertEqual([f.sprite.pose, f.sprite.faceLeft], ["walk", approach === "space"], "the original Wren walks in the chosen direction");
    assertEqual(f.tweens.map(tween => [tween.targets.kind, tween.duration]), [["wren", 440]], "only the original actor moves before kneeling");
    f.tick(439);
    assertEqual([f.wren.visible, settled], [true, 0], "early reading cannot arrive during the approach");
    f.tick(1);
    assertEqual([f.wren.visible, f.stage.owner.visible, f.stage.owner.alpha, f.stage.warmth.visible, settled], [false, true, 0, approach === "light", 0], "the standing actor yields to the kneeling pose before the fox moves herself");
    assertEqual(f.tweens.at(-1)!.targets, f.fox, "the second movement belongs to the fox, not a hand pulling her");
    f.tick(240);
    assertEqual([f.stage.owner.alpha, f.stage.warmth.alpha, settled], [1, 1, 0], "the pose and local illumination settle before reassurance");
    f.tick(399);
    assertEqual(settled, 0, "the full intended fox approach must finish before the callback");
    f.tick(1);
    assertEqual([settled, f.fox.x, f.fox.y, f.wren.visible], [1, approach === "light" ? 1190 : 1080, 842, false], "the final state exposes one settled performance with the fox on the same snowfield");
    f.stage.destroy();
    assertEqual([f.wren.x, f.wren.y, f.wren.visible, f.sprite.pose], [960, 842, true, "front"], "the ordinary actor is restored to its exact entry position on exit");
  }
});

await suite("Winter fox stage: restored and reduced presentations are immediate and preserve original visibility on cleanup", () => {
  for (const reduced of [false, true]) for (const restored of [false, true]) {
    if (!reduced && !restored) continue;
    for (const approach of ["light", "space"] as const) for (const originallyVisible of [false, true]) {
      const f = fixture(reduced, originallyVisible); let settled = 0;
      f.stage.present(approach, restored, () => { settled++; });
      assertEqual([settled, f.tweens, f.wren.visible, f.stage.owner.visible, f.stage.owner.alpha], [1, [], false, true, 1], "quiet entry reconstructs the finished pose without hidden choreography or a new wait");
      assertEqual([f.fox.x, f.fox.y, f.stage.warmth.visible, f.stage.warmth.alpha], [approach === "light" ? 1190 : 1080, 842, approach === "light", 1], "the chosen light/space scene is already physically settled");
      assertEqual(f.poses, [], "quiet restoration never puts the hidden original actor into a walking animation");
      f.stage.destroy();
      assertEqual([f.wren.x, f.wren.y, f.wren.visible, f.sprite.pose], [960, 842, originallyVisible, "front"], "cleanup respects an initially hidden original actor rather than forcing a duplicate visible");
    }
  }
});

await suite("Winter fox stage: palm glow and reflected warmth remain attached to the authored kneeling pose", () => {
  for (const approach of ["light", "space"] as const) {
    const f = fixture(); f.stage.present(approach, true, () => {});
    const { owner, kneeling, warmth, footprints } = f.stage;
    assertEqual([kneeling.key, kneeling.originX, kneeling.originY, kneeling.lit], ["wren-kneel-right", 0.5, 1, true], "the actual feet-anchored painting participates in scene lighting");
    assertClose(kneeling.height * kneeling.scaleY, 190, 0.0001, "the pose has its authored scene height");
    assertClose(warmth.x - owner.x, 93.5, 0.0001, "the warm point stays on the measured open-palm x anchor");
    assertClose(warmth.y - owner.y, -54.7, 0.0001, "the warm point stays on the measured open-palm y anchor");
    const [palm, spark, snow] = warmth.children;
    assertEqual([palm.kind, palm.width, palm.height, spark.shapes[0].radius], ["local-light", 46, 42, 3], "a small local light and compact physical spark occupy the palm");
    assertEqual([snow.kind, snow.width, snow.height, snow.x, snow.y], ["local-light", 170, 24, 12, 52], "the reflected light spreads across snow below the hand");
    assertClose(warmth.y + snow.y - owner.y, -2.7, 0.0001, "the reflection is at the same ground plane as the actor's feet");
    assertEqual(warmth.visible, approach === "light", "giving space never displays an invented light");
    assertEqual(footprints.shapes.length, 3, "the approach leaves one finite trail of footprints");
    assert(owner.children.includes(kneeling), "the kneeling art belongs to its one staged body container");
    f.stage.destroy();
    assert([owner, warmth, footprints, kneeling, palm, spark, snow].every(body => body.destroys === 1), "all transient art and illumination are released together");
  }
});

await suite("Winter fox stage: stale movement callbacks cannot settle after destruction or replace a new approach", () => {
  for (const destroyAt of [0, 440]) {
    const f = fixture(); let settled = 0;
    f.stage.present("light", false, () => { settled++; });
    f.tick(destroyAt);
    const callbacks = f.tweens.flatMap(tween => tween.onComplete ? [tween.onComplete] : []);
    f.stage.destroy();
    const snapshot = f.snapshot(); const tweenCount = f.tweens.length;
    callbacks.forEach(callback => callback()); f.tick(5000);
    assertEqual([f.snapshot(), f.tweens.length, settled], [snapshot, tweenCount, 0], "late actor/fox callbacks cannot mutate destroyed staging, start another movement or release reassurance");
  }
  const f = fixture(); let oldSettled = 0, newSettled = 0;
  f.stage.present("light", false, () => { oldSettled++; }); f.tick(440);
  const oldCallbacks = f.tweens.flatMap(tween => tween.onComplete ? [tween.onComplete] : []);
  f.stage.present("space", true, () => { newSettled++; });
  const snapshot = f.snapshot();
  oldCallbacks.forEach(callback => callback()); f.tick(5000);
  assertEqual([f.snapshot(), oldSettled, newSettled], [snapshot, 0, 1], "callbacks from the replaced light approach cannot mutate the restored space choice");
  assertEqual([f.fox.x, f.stage.warmth.visible], [1080, false], "the latest physical method remains authoritative");
  f.stage.destroy();
});

await suite("Winter fox stage: shutdown cleanup is idempotent and releases its lifecycle listener", () => {
  const f = fixture(); let settled = 0;
  assertEqual(f.events.listenerCount("shutdown"), 1, "one stage owns one shutdown listener");
  f.stage.present("light", false, () => { settled++; });
  const late = f.tweens[0].onComplete;
  f.events.emit("shutdown");
  assertEqual(f.events.listenerCount("shutdown"), 0, "shutdown removes the stage's listener");
  const snapshot = f.snapshot(); const kills = f.kills.length;
  f.stage.destroy(); f.events.emit("shutdown"); late(); f.tick(5000);
  assertEqual([f.snapshot(), f.kills.length, settled], [snapshot, kills, 0], "repeated cleanup and late callbacks do not destroy or restore anything twice");
  assertEqual([f.wren.x, f.wren.y, f.wren.visible, f.sprite.pose], [960, 842, true, "front"], "shutdown returns ownership to the original standing actor");
  assert([f.stage.owner, f.stage.warmth, f.stage.footprints].every(body => body.destroys === 1), "each transient root is released exactly once");
});

await suite("Winter fox stage: re-presenting a partial light approach restores a visible palm light immediately", () => {
  const f = fixture(); let oldSettled = 0, newSettled = 0;
  f.stage.present("light", false, () => { oldSettled++; }); f.tick(440);
  assertEqual(f.stage.warmth.alpha, 0, "the regression starts during the original light fade");
  const oldCallbacks = f.tweens.flatMap(tween => tween.onComplete ? [tween.onComplete] : []);
  f.stage.present("light", true, () => { newSettled++; });
  assertEqual([f.stage.owner.alpha, f.stage.warmth.visible, f.stage.warmth.alpha, oldSettled, newSettled], [1, true, 1, 0, 1], "a restored light approach cannot inherit a canceled fade's invisible alpha");
  oldCallbacks.forEach(callback => callback()); f.tick(5000);
  assertEqual([oldSettled, newSettled, f.stage.warmth.alpha], [0, 1, 1], "replaced callbacks preserve the latest fully visible light and its one readiness callback");
  f.stage.destroy();
});

await suite("Winter fox feedback: real claim lines and typing pulses follow the visible hand, then return to standing Wren", () => {
  for (const approach of ["light", "space"] as const) for (const restored of [false, true]) {
    const f = fixture(); f.stage.present(approach, restored, () => {});
    if (!restored) f.tick(1080);
    const claims: any[] = [], pulses: any[] = [];
    const bindings = {
      PALETTE_HEX: { frost: 1 },
      Phaser: { GameObjects: { Events: { DESTROY: "destroy" } } },
      TextWordTarget: class {
        constructor(options: any) { Object.assign(this, options); }
        getAnchorX() { return (this as any).x; }
        getAnchorY() { return (this as any).y; }
      },
      playClaimLine: (_scene: unknown, sourceX: number, sourceY: number, targetX: number, targetY: number) => {
        claims.push({ sourceX, sourceY, targetX, targetY });
      },
      playBodyTypePulse: (_scene: unknown, body: any, options: any) => { pulses.push({ body, ...options }); },
      attachWordBodyAnchor: () => ({ destroy() {} }),
      playActorAttention() {}, playBodyImpact() {}, playWrenFocus() {}, playWrenAction() {},
    };
    const Feedback = new Function(...Object.keys(bindings), `${feedbackCode}; return Feedback;`)(...Object.values(bindings));
    const feedback = Object.assign(new Feedback(), {
      foxCareStage: f.stage, foxCareGeneration: 1, foxCareTransitionPending: false,
      foxCompanion: f.fox, foxWordAnchors: [], wrenContainer: f.wren, wrenSprite: f.sprite,
      pulseFoxCompanion() {},
    });
    const visibleBody = f.stage.typingBody(), hand = f.stage.handPosition();
    assertEqual([visibleBody, visibleBody.visible, f.wren.visible], [f.stage.owner, true, false], "the feedback API exposes the actual visible kneeling actor rather than the hidden standing container");
    assertEqual(hand, { x: visibleBody.x + 93.5, y: visibleBody.y - 54.7 }, "the hand feedback position is derived from the current visible body");
    assertEqual([hand.x, hand.y], [f.stage.warmth.x, f.stage.warmth.y], "the typing origin and palm illumination agree for both physical approaches");
    const target = feedback.makeFoxWord({ scene: feedback, word: "i mean no harm", x: f.fox.x, y: 590,
      frame: "banner", onComplete() {} }, true);
    target.onClaim({}); target.onAdvance(1, target.word.length);
    assertEqual(claims, [{ sourceX: hand.x, sourceY: hand.y, targetX: f.fox.x, targetY: f.fox.y - 60 }], "the real fox word's claim connects the open hand to the visible fox");
    assertEqual(pulses.map(pulse => [pulse.body, pulse.offsetX ?? 0, pulse.offsetY]), [
      [visibleBody, 93.5, -54.7], [f.fox, 0, -60],
    ], "the actual word wrapper pulses the visible palm and then the fox at their own local coordinates");
    assert(!pulses.some(pulse => pulse.body === f.wren), "no typing snow is emitted from the hidden standing Wren");
    const palmPulse = pulses[0];
    assertEqual([palmPulse.body.x + palmPulse.offsetX, palmPulse.body.y + palmPulse.offsetY], [hand.x, hand.y], "the pulse and claim source resolve to the same physical hand in world coordinates");
    target.onComplete();
    feedback.clearFoxCare();
    assertEqual([feedback.foxCareStage, f.wren.visible, visibleBody.scene], [null, true, false], "actual scene cleanup retires the kneeling feedback owner and restores ordinary Wren");
    claims.length = 0; pulses.length = 0;
    const ordinary = feedback.makeFoxWord({ scene: feedback, word: "ordinary", x: f.fox.x, y: 590,
      frame: "banner", onComplete() {} }, true);
    ordinary.onClaim({}); ordinary.onAdvance(1, ordinary.word.length);
    assertEqual([claims[0].sourceX, claims[0].sourceY], [f.wren.x, f.wren.y - 112], "after cleanup, ordinary claim feedback resumes its original standing source");
    assertEqual([pulses[0].body, pulses[0].offsetX, pulses[0].offsetY], [f.wren, 0, -108], "other Winter words retain the original standing typing pulse instead of a stale kneeling hand");
    ordinary.onComplete();
    assertEqual(feedback.foxWordAnchors, [], "both completed word anchors retire without retaining either feedback owner");
  }
});
