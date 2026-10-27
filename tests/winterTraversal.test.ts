import { readFileSync } from "node:fs";
import ts from "typescript";
import { checkpointIndex, winterStep } from "../src/game/chapterFlow";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const path = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["init", "preload", "resumeWinter", "startAct1", "runRiverBeats", "showRiverCue", "ensureTrailStage", "riverCuePosition", "riverWordPosition", "trailWrenPosition", "stageWrenAtTrailEntrance", "walkWrenToTrailBeat", "completeRiverBeat", "resetWrenToWinterStage", "moveWrenTo", "attachRiverCueWordAnchor", "releaseRiverCueWordAnchor", "pulseRiverCue", "dismissRiverCue", "startHeldur", "onKeyDown"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const compiled = ts.transpileModule(`${constants}\nclass Winter { ${methods.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const pngSize = (file: string) => {
  const bytes = readFileSync(new URL(file, import.meta.url));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const textures: Record<string, { width: number; height: number }> = {
  "winter-trail-backdrop": pngSize("../art/winter/frozen-trail.png"),
  "winter-fallen-pine": pngSize("../art/winter/fallen-pine.png"),
};
const noop = () => {};

function fixture(reduced = false) {
  let now = 0;
  let gate: (() => void) | undefined;
  const scheduled: any[] = [];
  const tweens: any[] = [];
  const images: any[] = [];
  const targets: any[] = [];
  const breaths: any[] = [];
  const anchors: any[] = [];
  const checkpoints: any[] = [];
  const tasks: string[] = [];
  const entered: string[] = [];
  const typed: string[] = [];
  const loaded: string[] = [];
  const state = { satchel: [], realms: {}, checkpoint: null };
  const wren = { scene: true, active: true, x: 960, y: 842, alpha: 0, scaleX: 1, scaleY: 1,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; },
    setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; },
  };
  const sprite = { pose: "front", y: 0, height: 240, originY: 1, scaleX: 1, scaleY: 1 };
  const makeObject = (x: number, y: number) => ({ x, y, alpha: 1, depth: 0, angle: 0, scene: true, children: [] as any[],
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setAngle(angle: number) { this.angle = angle; return this; },
    setOrigin(x: number, y = x) { Object.assign(this, { originX: x, originY: y }); return this; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; },
    setDisplaySize(width: number, height: number) { Object.assign(this, { displayWidth: width, displayHeight: height }); return this; },
    setScale(scale: number) { Object.assign(this, { scaleX: scale, scaleY: scale }); return this; },
    add(child: any) { this.children.push(child); return this; },
    destroy() { this.scene = false; for (const child of this.children) child.destroy?.(); },
  });
  const bindings = {
    reducedMotion: () => reduced,
    addLocalGroundShadow: () => ({ shadow: true }),
    addIdleBreath: (_scene: unknown, body: any) => breaths.push(body),
    attachWordBodyAnchor: (_scene: unknown, owner: any, _position: any, options: any) => {
      const anchor = { owner, options, destroyed: false, destroy() { this.destroyed = true; } };
      anchors.push(anchor); return anchor;
    },
    playPortalArrivalWake: noop, playWrenFocus: noop, playBodyImpact: noop, playSceneEventPulse: noop, playChime: noop,
    setWrenPose: (body: typeof sprite, pose: string) => { body.pose = pose; body.scaleX = body.scaleY = 1; body.y = 0; },
    isPuristToggleKey: () => false, togglePuristMode: noop, playClack: noop, SPELL_COST: 50,
    checkpointIndex, winterStep, PALETTE_HEX: { frost: 0 },
    winterBackdrop: "vista", winterTrailBackdrop: "trail", fallenPineSprite: "pine", runaPortrait: "runa", snowFoxSprite: "fox",
    preloadWren: noop, preloadWolves: noop, preloadWinterNpcs: noop, preloadSatchelIcons: noop,
  };
  const Winter = new Function(...Object.keys(bindings), compiled + "; return Winter;")(...Object.values(bindings));
  const scene = new Winter();
  Object.assign(scene, {
    scale: { width: 1920, height: 1080 }, wrenContainer: wren, wrenSprite: sprite,
    riverLandmarks: {}, riverCue: null, riverCueWordAnchor: null, trailBackdrop: null, trailGeneration: 0,
    trailTransitionPending: false, huntressHornTransferPending: false, huntressHornTransferToken: 0,
    store: { get: () => state }, revisit: false, waveActive: false,
    load: { image(key: string) { loaded.push(key); } },
    add: {
      container: makeObject,
      image(x: number, y: number, key: string) {
        assert(textures[key], "trail presentation uses an existing painted asset");
        const image = Object.assign(makeObject(x, y), { key, ...textures[key] });
        images.push(image); return image;
      },
    },
    tweens: {
      add(options: any) {
        const event = { at: now + (options.delay ?? 0) + options.duration, cancelled: false, done: false, run() {
          for (const target of Array.isArray(options.targets) ? options.targets : [options.targets]) {
            for (const key of ["x", "y", "angle", "alpha"]) if (typeof options[key] === "number") target[key] = options[key];
          }
          options.onComplete?.();
        } };
        const tween = { ...options, event };
        tweens.push(tween); scheduled.push(event); return tween;
      },
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.event.cancelled = true; },
    },
    time: { delayedCall(delay: number, callback: () => void) {
      const event = { at: now + delay, cancelled: false, done: false, run: callback };
      scheduled.push(event); return { remove() { event.cancelled = true; } };
    } },
    band: { setObjective(text: string) { tasks.push(text); } },
    narration: { say(key: string) { entered.push(key); }, replay: noop },
    setNarrator: noop,
    checkpoint(step: string, data: any = {}) { checkpoints.push({ step, data }); },
    readThen(next: () => void) { assert(!gate, "a held story gate is not overwritten"); gate = next; },
    makeWord: (options: any) => options,
    registerActiveTarget(target: any) { targets.push(target); },
    clearActiveTargets: noop,
    fadeInHeldur() { entered.push("heldur"); },
    typingInput: { getStats: () => ({ canCast: () => false }), handleChar(key: string) { typed.push(key); } },
    setShiftHeld: noop, setAltHeld: noop,
  });
  return { scene, wren, sprite, targets, images, tweens, anchors, breaths, checkpoints, entered, tasks, typed, loaded,
    next() { assert(gate, "the real reading gate is available"); const next = gate!; gate = undefined; next(); },
    gate: () => gate,
    tick(ms: number) {
      const end = now + ms;
      while (true) {
        const next = scheduled.filter(event => !event.done && !event.cancelled && event.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at; next.done = true; next.run();
      }
      now = end;
    },
  };
}

await suite("Winter trail painting: ice and rooted branch stay in one static world with a single persistent painted log", () => {
  const f = fixture();
  f.scene.preload();
  assert(f.loaded.includes("winter-trail-backdrop") && f.loaded.includes("winter-fallen-pine"), "a fresh visit preloads both authored world assets");
  f.scene.startAct1();
  assertEqual([f.wren.x, f.wren.y, f.wren.alpha], [330, 810, 1], "arrival starts at the planted trail entrance, already visible");
  f.tick(1500);
  assertEqual([f.wren.x, f.wren.y], [330, 810], "there is no delayed arrival move or idle bob to override typing");
  const plate = f.scene.trailBackdrop;
  assertEqual([plate.x, plate.y, plate.displayWidth, plate.displayHeight], [0, -90, 1920, 1080], "the undistorted painting exposes its real crossing above the console");
  const ice = f.scene.riverLandmarks.step;
  assertClose(ice.x, 850 / plate.width * plate.displayWidth, 2, "the ice anchor corresponds to the authored crossing in the actual PNG");
  assertClose(ice.y, 785 / plate.height * plate.displayHeight + plate.y, 3, "the ice contact point stays within the visible world");
  const landmarks = [f.scene.riverLandmarks.lift, f.scene.riverLandmarks.step, f.scene.riverLandmarks.duck];
  f.scene.showRiverCue("step"); f.scene.showRiverCue("duck");
  assertEqual([f.scene.riverLandmarks.lift, f.scene.riverLandmarks.step, f.scene.riverLandmarks.duck], landmarks, "changing the active marker never replaces or destroys a physical landmark");
  assertEqual(f.images.length, 2, "the painting supplies real ice/branch rather than adding floating procedural copies");
  assert(!f.tweens.some(tween => tween.targets === plate || landmarks.includes(tween.targets)), "solid ground and landmarks have no decorative motion");
  assertEqual(f.breaths, [], "Wren's feet container stays still during the trail");
});

await suite("Winter trail actions: only completed native lift/step/duck changes the physical world within the original beat interval", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.startAct1(); f.next();
    const log = f.scene.riverLandmarks.lift;
    const plate = f.scene.trailBackdrop;
    for (const [index, word] of ["lift", "step", "duck"].entries()) {
      const target = f.targets.at(-1);
      assertEqual(target.word, word, "the original three native targets and order remain unchanged");
      const before = { x: f.wren.x, y: f.wren.y };
      target.onClaim();
      f.tick(620);
      const approach = f.scene.trailWrenPosition(word);
      assertEqual([f.wren.x, f.wren.y], [approach.x, approach.y], "claiming only approaches the current obstacle");
      if (word === "lift") assertEqual([log.x, log.y], [610, 810], "the uncompleted pine still blocks its original path");
      if (word === "step") assert(f.wren.x < f.scene.riverLandmarks.step.x, "the first letter does not cross the ice");
      if (word === "duck") assertEqual(f.sprite.scaleY, 1, "the first letter does not perform the completed duck");
      target.onAdvance(word.length, word.length);
      assert(f.scene.trailTransitionPending, "the final letter owns the existing target exit interval");
      f.tick(320);
      target.onComplete();
      if (word === "duck") {
        assertEqual(f.sprite.originY, 1, "ducking keeps the image anchored at the feet");
        assertEqual(f.sprite.scaleY, 0.62, "the completed duck lowers Wren's head below the attached branch");
        assert(810 - 240 * f.sprite.scaleY > f.scene.riverLandmarks.duck.y + 50, "the crouched hood clears the conservative bough underside");
      }
      f.tick(620);
      if (word === "lift") assertEqual([log.x, log.y, log.angle], [730, 750, -12], "the pine lifts and settles aside on the bank instead of vanishing");
      if (word === "step") assertEqual([f.wren.x, f.wren.y], [1240, 810], "the completed word crosses the real ice to its right edge");
      if (word === "duck") assertEqual([f.wren.x, f.wren.y, f.sprite.pose], [1540, 800, "front"], "Wren crosses under the bough and stands beyond it");
      assert(f.scene.trailBackdrop === plate && log.scene, "the same full world and moved log persist after each action");
      assertEqual(f.breaths, [], "settled trail movement never starts container breathing");
      assertEqual(f.checkpoints.at(-1), index < 2 ? { step: "trail", data: { index: index + 1 } } : { step: "heldur", data: { index: 0, intro: true } }, "the original stable checkpoint timing and payload are unchanged");
      f.tick(80);
      if (index < 2) assertEqual(f.targets.at(-1).word, ["step", "duck"][index], "the original700ms interval presents the next native word");
      assert(before.x <= f.wren.x || word === "lift", "traversal progresses through the connected landscape");
    }
    assertEqual(f.scene.trailBackdrop, null, "the trail plate is released before Heldur's original vista");
    assert(!log.scene, "landmarks leave only when the whole trail stage ends");
    assert(f.scene.trailTransitionPending && !f.gate(), "the original900ms vista transition remains protected from early typing");
    f.tick(900);
    assert(f.entered.includes("heldur") && f.gate(), "the original Heldur introduction follows its unchanged transition");
    assert(!f.scene.trailTransitionPending && f.sprite.pose === "front", "normal story ownership resumes at Heldur");
  }
});

await suite("Winter trail checkpoint restore: each stable index reconstructs the persistent physical state without replaying actions", () => {
  for (const index of [0, 1, 2]) {
    const f = fixture();
    f.scene.resumeCheckpoint = { step: "trail", data: { index } };
    f.scene.resumeWinter();
    assertEqual(f.targets.at(-1).word, ["lift", "step", "duck"][index], "resume asks for exactly the pending native word");
    const log = f.scene.riverLandmarks.lift;
    assertEqual([log.x, log.y], index === 0 ? [610, 810] : [730, 750], "only previously completed lift restores the log aside");
    assertEqual([f.wren.x, f.wren.y], [[330, 810], [430, 810], [1240, 810]][index], "Wren resumes after the previous completed landmark");
    assert(!f.tweens.some(tween => tween.targets === log || tween.targets === f.wren), "resume creates no repeated lift/crossing or delayed entrance");
    assertEqual(f.scene.trailTransitionPending, false, "restored live input is immediately available");
  }
  const heldur = fixture();
  heldur.scene.resumeCheckpoint = { step: "heldur", data: { index: 0, intro: true } };
  heldur.scene.resumeWinter();
  assertEqual(heldur.scene.trailBackdrop, null, "a saved Heldur stage never reopens the completed trail painting");
  assert(heldur.entered.includes("heldur"), "Heldur retains the original vista and narrative entry");
});

await suite("Winter trail input and cleanup: early keys cannot become misses, Escape can pause, and stale actions cannot replace a resumed world", () => {
  const f = fixture();
  f.scene.runRiverBeats(0);
  const target = f.targets.at(-1);
  let prevented = 0;
  let menus = 0;
  f.scene.chapterMenu = { handleKey(event: KeyboardEvent) { menus += 1; return event.key === "Escape"; } };
  f.scene.reading = { handleKey: () => false };
  const key = (key: string, ctrlKey = false, metaKey = false) => ({ key, ctrlKey, metaKey, shiftKey: false, altKey: false, preventDefault() { prevented += 1; } });
  target.onAdvance(4, 4);
  for (const value of [" ", "a", "Enter"]) f.scene.onKeyDown(key(value));
  assertEqual([f.typed, prevented], [[], 3], "the completion-fade interval consumes early input before the miss-counting controller");
  f.scene.onKeyDown(key("Escape"));
  assertEqual(menus, 4, "normal pause ownership remains ahead of the transition guard");
  f.scene.onKeyDown(key("l", true)); f.scene.onKeyDown(key("l", false, true));
  assertEqual(menus, 4, "Ctrl/Meta shortcuts retain browser ownership");
  target.onComplete();
  f.scene.onKeyDown(key("b"));
  assertEqual(f.typed, [], "the physical action interval remains protected");
  f.tick(700);
  f.scene.onKeyDown(key("s"));
  assertEqual(f.typed, ["s"], "the next visible target restores normal typing");
  const count = f.targets.length;
  const oldLog = f.scene.riverLandmarks.lift;
  f.scene.dismissRiverCue(false);
  f.tick(2000);
  assert(!oldLog.scene && f.scene.trailBackdrop === null, "leaving destroys persistent props and their static plate");
  assert(!f.scene.trailTransitionPending, "leaving releases all pending traversal input ownership");
  target.onComplete(); f.tick(2000);
  assertEqual(f.targets.length, count, "a stale completed word cannot recreate a dismissed trail");
  f.scene.runRiverBeats(2);
  assertEqual(f.targets.at(-1).word, "duck", "a later fresh entry reconstructs its actual saved stage");
  assertEqual(f.scene.riverLandmarks.lift.x, 730, "fresh entry keeps completed log state without an old tween overriding it");
});
