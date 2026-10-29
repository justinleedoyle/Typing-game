import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { bellIndex } from "../src/game/bellCheckpoint";
import { isOffBeat, isOnBeat } from "../src/game/beatGate";

// Exercise the actual scene cue methods against the real acceptance policy.
// Only drawing, tweens and the scene clock are inert; no browser/save is used.
const path = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["createEchoDim", "onBeatTick", "pulseBeatRing", "pulseOffbeatRing",
  "spawnSplitGhost", "bellPassageWordPosition", "startFork1ForceBreak", "showFork1Reward", "takeStageData", "openForceDoorCue",
  "clearBellForkCues", "drawCathedralDoor", "showDoorCues", "createDoorCue", "openCathedralDoor",
  "clearDoorwayStage", "runBeatLockedChain", "startFork1Chant", "startFork1Force", "startFork1", "startAct3Corridor", "onKeyDown"].map(name =>
  sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source));
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => ["NAVE_DOOR", "WREN_X", "WREN_Y"].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Harness { static nave = NAVE_DOOR; ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const noop = () => {};
const Harness = new Function("bellIndex", "reducedFlashes", "reducedMotion", "PALETTE_HEX", "Phaser",
  "applySceneActorLighting", "playWrenFocus", "playWrenAction", "playBodyImpact", "playDamageThud", "BELL_BURST_COLOR",
  "setWrenPose", "isPuristToggleKey", "playClack",
  `${code}; return Harness;`)(
  bellIndex, (scene: { reducedFlashes: boolean }) => scene.reducedFlashes,
  (scene: { reducedMotion: boolean }) => scene.reducedMotion,
  { frost: 0xabcdef, ember: 0xfedcba },
  { Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(value, max)) } },
  (_scene: unknown, actor: { lit: boolean }) => { actor.lit = true; }, noop, noop, noop, noop, 0x4ab8d6,
  (actor: { pose: string }, pose: string) => { actor.pose = pose; }, () => false, noop,
);

function encounter(tempo: number, phase: "on" | "off" | "free", reducedFlashes = true) {
  const cue = () => ({
    alpha: 0, depth: 1500, rect: [] as number[],
    clear() {}, lineStyle() {}, strokeCircle() {}, fillStyle() {},
    fillRect(...rect: number[]) { this.rect = rect; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; }, setScale() { return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setScrollFactor() { return this; },
  });
  const blue = cue();
  const orange = cue();
  const dim = cue();
  let now = 0;
  const pulses: Array<{ ring: unknown; start: number; duration: number; ease: string }> = [];
  const callbacks: Array<{ at: number; run: () => void }> = [];
  const harness = new Harness();
  Object.assign(harness, {
    beatRing: blue, offbeatRing: orange, beatPhase: phase,
    rhythmLabel: cue(),
    reducedFlashes, combat: { warmLight: 0.2 },
    add: { graphics: () => dim }, scale: { width: 1920 }, band: { bandTopY: 860 },
    cameras: { main: { flash() { throw new Error("Rhythm cue must never use a full-camera black flash"); } } },
    beatClock: { getTempo: () => tempo, getWindowMs: () => tempo * 0.175 },
    time: { delayedCall: (delay: number, run: () => void) => callbacks.push({ at: now + delay, run }) },
    tweens: { killTweensOf() {}, add: (opts: { targets: unknown; duration: number; ease: string }) =>
      pulses.push({ ring: opts.targets, start: now, duration: opts.duration, ease: opts.ease }) },
  });
  harness.createEchoDim();
  return {
    harness, pulses, callbacks, blue, orange, dim,
    runNext() { const callback = callbacks.shift()!; now = callback.at; callback.run(); },
  };
}

await suite("Bell rhythm cue: visible openings match slow and fast acceptance windows", () => {
  for (const tempo of [2000, 1000]) {
    const window = tempo * 0.175;
    const e = encounter(tempo, "off");
    e.harness.onBeatTick();
    assertEqual(e.pulses[0]!.ring, e.blue, "the toll opens the blue ring");
    assertEqual(e.pulses[0]!.start, 0, "blue opening follows the actual toll");
    assertEqual(e.pulses[0]!.duration, window, "blue has no misleading tail after acceptance closes");
    assertEqual(e.callbacks[0]!.at, tempo / 2 - window / 2, "orange begins at the centered answer window's opening");
    e.runNext();
    const answer = e.pulses[1]!;
    assertEqual(answer.ring, e.orange, "the answer opens the orange ring");
    assertEqual(answer.duration, window, "orange remains inside exactly one answer window");
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      assert(isOnBeat(e.pulses[0]!.start + window * fraction, window), "every visible blue instant permits a word start");
      assert(isOffBeat(answer.start + window * fraction, tempo, window), "every visible orange instant permits an answer start");
    }
    assert(!isOnBeat(window + 1, window), "blue is gone when the toll window closes");
    assert(!isOffBeat(answer.start + answer.duration + 1, tempo, window), "orange is gone when the answer window closes");
  }
});

await suite("Bell rhythm cue: echo darkening preserves the HUD ring throughout its opening", () => {
  const e = encounter(2000, "on", false);
  e.harness.onBeatTick();
  assertEqual(e.dim.rect, [0, 0, 1920, 860], "echo darkening ends at the world edge above the console");
  assert(e.dim.depth < e.blue.depth, "echo renders below the timing ring");
  assertEqual(e.blue.alpha, 1, "toll opens the ring at full visibility");
  assertEqual(e.dim.alpha, 1, "world retains its original opaque echo opening");
  const echo = e.pulses.find(pulse => pulse.ring === e.dim)!;
  assertEqual(echo.duration, 240, "warm-light still shortens the original300ms echo by20percent");
  assertEqual(echo.ease, "Linear", "world dim keeps the camera flash's linear decay");
  assertEqual(e.pulses.find(pulse => pulse.ring === e.blue)!.duration, 350, "rhythm acceptance window is unchanged");
  // At150ms the old camera black alpha=.375 and ring alpha≈.377. Its blue
  // channel would be roughly62 (below the observed95 sampling threshold),
  // while the same ring above a world-only dim remains roughly99.
  const ringAlpha = 1 - Math.sin((150 / 350) * Math.PI / 2);
  const ringBlue = 210 * ringAlpha + 32 * (1 - ringAlpha);
  assert(ringBlue > 95, "the ordinary visible ring clears the observed blue threshold");
  assert(ringBlue * (150 / 240) < 95, "full-camera darkening had hidden that same visible ring");
  e.harness.reducedFlashes = true;
  e.harness.onBeatTick();
  assertEqual(e.dim.alpha, 0, "reduced flashes clears a previous echo instead of leaving a black world");
});

await suite("Bell rhythm cue: ordinary waves and departed answer waves never show an orange invitation", () => {
  const ordinary = encounter(2000, "on");
  ordinary.harness.onBeatTick();
  assertEqual(ordinary.callbacks.length, 0, "ordinary tolls schedule no off-beat cue");
  const departed = encounter(2000, "off");
  departed.harness.onBeatTick();
  departed.harness.beatPhase = "on";
  departed.runNext();
  assertEqual(departed.pulses.length, 1, "a queued answer cue cannot survive the wave that required it");
  const story = encounter(2000, "free");
  story.harness.onBeatTick();
  assertEqual(story.pulses.length, 0, "free story actions show no misleading timing invitation");
  assertEqual(story.callbacks.length, 0, "story does not queue an answer pulse");
});

await suite("Bell split cue: children keep separate lanes when their parent dies beside Wren", () => {
  for (const parentX of [650, 780, 850, 900, 959.9, 960, 1000, 1100, 1300]) {
    const bell = new Harness();
    const spawned: Array<{ startX: number; restX: number; restY: number; word: string; delay: number; advanceMs: number }> = [];
    Object.assign(bell, {
      wrenContainer: { x: 960 },
      spawnGhost(startX: number, restX: number, restY: number, word: string, delay: number, advanceMs: number) {
        spawned.push({ startX, restX, restY, word, delay, advanceMs });
      },
    });
    bell.spawnSplitGhost({ restX: parentX - 60, restY: 740, word: "ebb" }, parentX);
    bell.spawnSplitGhost({ restX: parentX + 60, restY: 740, word: "drift" }, parentX);
    assertEqual(spawned[1].restX - spawned[0].restX, 120, "both labels retain the authored sibling spacing");
    assert(spawned.every((child) => Math.abs(child.restX - 960) >= 180), "neither child begins over Wren");
    assertEqual(spawned.map((child) => [child.word, child.restY, child.delay, child.advanceMs]),
      [["ebb", 740, 0, 5000], ["drift", 740, 0, 5000]], "words, height and full deadlines remain unchanged");
    assert(spawned.every((child) => child.startX === child.restX), "children still appear locally instead of crossing the screen");
    if (Math.abs(parentX - 960) >= 240) {
      assertEqual(spawned.map((child) => child.restX), [parentX - 60, parentX + 60], "an already clear pair keeps its original positions");
    }
  }
});

// Minimal display/texture objects execute the actual architectural methods.
// Captured Canvas paths prove the generated exterior aura is clipped, rather
// than treating a transparent1024×1536 canvas as the visible door dimensions.
class DoorPart {
  name = ""; scene: object | null = {}; children: DoorPart[] = [];
  data: Record<string, unknown> = {}; x = 0; y = 0; depth = 0;
  scaleX = 1; scaleY = 1; visible = true; alpha = 1; rotation = 0;
  width = 100; height = 100; originX = 0.5; originY = 0.5; lit = false; key = "";
  pose = "front";
  get list() { return this.children; }
  get displayWidth() { return this.width * Math.abs(this.scaleX); }
  get displayHeight() { return this.height * Math.abs(this.scaleY); }
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  setName(name: string) { this.name = name; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setDisplaySize(x: number, y: number) { this.scaleX = x / this.width; this.scaleY = y / this.height; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  setData(key: string, value: unknown) { this.data[key] = value; return this; }
  getData(key: string) { return this.data[key]; }
  getByName(name: string) { return this.children.find(child => child.name === name) ?? null; }
  add(child: DoorPart) { this.children.push(child); return this; }
  destroy() { this.children.forEach(child => child.destroy()); this.scene = null; }
  fillStyle() { return this; } fillRoundedRect() { return this; } fillRect() { return this; }
  fillPoints() { return this; }
  lineStyle() { return this; } lineBetween() { return this; } fillCircle() { return this; }
}
function doorFixture(reducedMotion = false) {
  const bell = new Harness();
  const images: DoorPart[] = [], animations: any[] = [], stopped: unknown[] = [], fades: DoorPart[] = [];
  const targets: any[] = [], timers: any[] = [], captions: string[] = [], gates: Array<() => void> = [];
  const state = { satchel: [] as string[] };
  const canvases = new Map<string, { width: number; height: number; path: number[][]; clipped: boolean;
    draws: unknown[][]; refreshed: number; context: any; refresh(): void }>();
  const artBytes = readFileSync(new URL("../art/bell/nave-door-leaves.png", import.meta.url));
  const original = { width: artBytes.readUInt32BE(16), height: artBytes.readUInt32BE(20) };
  let corridors = 0, frontResets = 0;
  const wren = new DoorPart(960, 820);
  const wrenSprite = new DoorPart();
  Object.assign(bell, {
    checkpoint() {},
    reducedMotion, scale: { width: 1920, height: 1080 }, wrenContainer: wren, wrenSprite, fork1Choice: null,
    doorChantCue: null, doorForceCue: null, doorwayStage: null, doorwayPassagePending: false, doorwayPassageToken: 0,
    add: {
      container: (x: number, y: number) => new DoorPart(x, y), graphics: () => new DoorPart(),
      image(x: number, y: number, key: string) {
        const image = new DoorPart(x, y); image.key = key;
        const dimensions = canvases.get(key) ?? { width: 1672, height: 941 };
        image.width = dimensions.width; image.height = dimensions.height;
        images.push(image); return image;
      },
    },
    textures: {
      get(key: string) { assertEqual(key, "bell-nave-door-leaves", "leaf construction reads the accepted original painting"); return { getSourceImage: () => original }; },
      exists: (key: string) => canvases.has(key),
      createCanvas(key: string, width: number, height: number) {
        const texture = { width, height, path: [] as number[][], clipped: false, draws: [] as unknown[][], refreshed: 0,
          context: {} as any, refresh() { this.refreshed += 1; } };
        texture.context = { save: noop, restore: noop, beginPath: noop, closePath: noop,
          moveTo(x: number, y: number) { texture.path.push([x, y]); },
          lineTo(x: number, y: number) { texture.path.push([x, y]); },
          clip() { texture.clipped = true; },
          drawImage(...args: unknown[]) { assert(texture.clipped, "the painted pixels are drawn only after solid-outline clipping"); texture.draws.push(args); },
        };
        canvases.set(key, texture); return texture;
      },
    },
    tweens: { add: (options: any) => animations.push(options), killTweensOf: (target: unknown) => stopped.push(target) },
    time: { delayedCall: (delay: number, next: () => void) => timers.push({ delay, next }) },
    cameras: { main: { shake: noop } },
    resetWrenToFront: () => { frontResets += 1; wrenSprite.pose = "front"; },
    setStoryObjective: noop, narration: { say: noop },
    commitFork: (_fork: string, requested: string) => requested,
    store: { update: (change: (value: typeof state) => void) => change(state) },
    setNarrator: (text: string) => { captions.push(text); if (text === "The Warden has been waiting.") corridors += 1; },
    readThen: (next: () => void) => gates.push(next),
    fadeOutForkCue(cue: DoorPart | null) { if (cue) { fades.push(cue); cue.destroy(); } },
    makeBellForkWord: (_body: unknown, options: any) => options,
    registerActiveTarget: (...next: any[]) => targets.push(...next), clearActiveTargets: noop,
    clearForkChoiceWordAnchors: noop,
    startAct3: noop,
  });
  return { bell, images, animations, stopped, fades, targets, timers, captions, gates, canvases, original, wren, wrenSprite, state,
    corridors: () => corridors, frontResets: () => frontResets,
    continue() { const next = gates.shift(); assert(next, "the original held response has one Continue gate"); next!(); },
    finishPassage() {
      const tween = animations.findLast(animation => animation.targets === wren && animation.duration === 650);
      assert(tween, "the actual doorway approach is scheduled");
      Object.assign(wren, { x: tween.x, y: tween.y, scaleX: tween.scaleX, scaleY: tween.scaleY, alpha: tween.alpha });
      tween.onComplete(); return tween;
    },
  };
}

await suite("Bell doorway: one static painted room and one clipped leaf pair serve both choices", () => {
  const f = doorFixture(); f.bell.startFork1();
  const stage = f.bell.doorwayStage as DoorPart;
  const assembly = stage.getByName("cathedral-door")!;
  assertEqual([stage.name, stage.depth], ["bell-nave-stage", -1], "the architectural plate sits behind the actual foreground actor");
  assertEqual(f.images.filter(image => image.key === "bell-nave-doorway").length, 1, "there is one room painting, not two freestanding arches");
  assertEqual([f.bell.doorChantCue.children.length, f.bell.doorForceCue.children.length], [0, 0], "choice owners are empty jamb anchors only");
  assertEqual(f.targets.map(target => target.word), ["open slowly", "force them open"], "both existing native choices remain exact");
  assertEqual(f.targets.map(target => [target.x, target.y]), [[520, 500], [1510, 500]], "distinct choice lanes stay outside the single opening");
  assertEqual([assembly.x, assembly.y], [1118, 802], "the actual painted recess owns the leaf center and threshold");
  assertEqual([f.wren.x, f.wren.y], [600, 842], "Wren stands on the painting's left foreground approach");
  assertEqual(f.animations.length, 0, "physical masonry, leaves and floor have no entrance rise or idle bob");
  assert(!f.images.find(image => image.key === "bell-nave-doorway")!.lit, "actor lighting never tints the architectural background");
  for (const side of [-1, 1]) {
    const hinge = assembly.getByName(side < 0 ? "door-left" : "door-right")!;
    const image = hinge.children[0];
    assertEqual([hinge.x, image.originX, image.originY], [side * 187.5, side < 0 ? 0 : 1, 1], "each leaf hinges at its own exterior jamb and is feet-anchored");
    assertEqual([image.displayWidth, image.displayHeight], [187.5, 595], "only solid painted bounds are fitted to the opening, not the square transparent canvas");
    assert(image.lit, "metal leaves keep the scene's actor/material lighting");
  }
  f.bell.showDoorCues();
  assertEqual(f.bell.doorwayStage, stage, "repeated choice setup reuses the same architectural owner");
  assertEqual(f.images.length, 3, "repeated setup cannot duplicate background or leaves");
  assertEqual(f.canvases.size, 2, "clipped leaf textures are prepared once");
  const other = { scene: true, x: 690, y: 812 };
  assertEqual(f.bell.bellPassageWordPosition(other, -48), { x: 840, y: 650 }, "other Bell prop/word positions remain unchanged");
});

await suite("Bell doorway ownership: an interrupted real Wren entrance cannot leave the actor invisible", () => {
  const url = new URL("../src/game/livingScene.ts", import.meta.url);
  const file = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const entrance = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "stageContainerEntrance")!;
  const js = ts.transpileModule(entrance.getText(file).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const stageEntrance = new Function("addIdleBreath", `${js}; return stageContainerEntrance;`)(noop);
  const f = doorFixture();
  stageEntrance(f.bell, f.wren);
  assertEqual(f.wren.alpha, 0, "the actual production entrance starts transparent before its tween settles");
  f.wrenSprite.setAlpha(0).setVisible(false);
  f.bell.showDoorCues();
  assert(f.stopped.includes(f.wren), "the architectural room takes ownership from the old arrival movement");
  assertEqual([f.wren.alpha, f.wren.visible, f.wrenSprite.alpha, f.wrenSprite.visible], [1, true, 1, true],
    "container and painted actor are explicitly visible even when the arrival was interrupted immediately");
  assertEqual([f.wren.x, f.wren.y], [600, 842], "visibility repair keeps the approved painted approach contact");
  f.bell.clearBellForkCues();
  assertEqual([f.wren.alpha, f.wren.visible, f.wren.x, f.wren.y], [1, true, 960, 820],
    "the visible actor returns to the existing corridor position on cleanup");
});

await suite("Bell doorway: clipping removes the actual generated aura outside the metal silhouette", () => {
  const f = doorFixture(); f.bell.showDoorCues();
  assertEqual(f.original, { width: 1024, height: 1536 }, "the maintained outline matches the accepted asset dimensions");
  for (const [key, texture] of f.canvases) {
    assertEqual([texture.width, texture.height, texture.refreshed], [396, 1405, 1], "textures use only the measured metal bounding slice");
    assertEqual(texture.path.length, 6, "the mask follows the pointed curved-arch outline, rather than an alpha-glow rectangle");
    const [apex, shoulder] = [texture.path[0], texture.path[3]];
    assertEqual([apex[1], shoulder[1]], [0, 395], "the door crown and shoulder are measured independently of exterior aura");
    assertEqual(apex[0], key.includes("left") ? 396 : 0, "the two clipped pointed silhouettes meet at the actual center seam");
    assertEqual(texture.draws[0].slice(1), [key.includes("left") ? -116 : -512, -55], "the original painting is offset into its clip without recoloring or including exterior margins");
    const polygonArea = Math.abs(texture.path.reduce((sum, [x, y], i, points) => {
      const next = points[(i + 1) % points.length]; return sum + x * next[1] - next[0] * y;
    }, 0)) / 2;
    assert(polygonArea < texture.width * texture.height * 0.9, "a substantial upper exterior region containing the glow cannot be rendered");
  }
});

await suite("Bell quiet door: final native phrase opens the shared leaves before its existing open-door card", () => {
  for (const reduced of [false, true]) {
    const f = doorFixture(reduced); f.bell.showDoorCues();
    const stage = f.bell.doorwayStage as DoorPart;
    const assembly = stage.getByName("cathedral-door")!;
    const left = assembly.getByName("door-left")!, right = assembly.getByName("door-right")!, bar = assembly.getByName("door-crossbar")!;
    f.bell.startFork1Chant();
    assertEqual(f.state.satchel, [], "choosing the chant does not award it before its original completion");
    assertEqual(f.bell.doorwayStage, stage, "dismissing the unchosen owner never removes the shared door");
    const words = ["slow.", "the doors remember weight.", "we knew them once.", "they part with grace."];
    for (let index = 0; index < words.length; index += 1) {
      const target = f.targets[index];
      assertEqual(target.word, words[index], "the exact quiet phrase and punctuation are preserved");
      target.onAdvance(target.word.length - 1, target.word.length);
      assert(!stage.getData("door-open"), "unfinished and earlier words keep the shared doors closed");
      target.onAdvance(target.word.length, target.word.length);
      if (index === words.length - 1) {
        assertEqual(stage.getData("door-open"), true, "the final matched character begins opening before the320ms target exit");
        assertEqual(f.animations.length, reduced ? 0 : 2, "reduced motion settles immediately; normal motion opens leaves and retracts bar");
        assert(f.animations.every(animation => animation.duration < 320), "all opening motion fits the existing word exit without a new delay");
        f.bell.openCathedralDoor("chant");
        assertEqual(f.animations.length, reduced ? 0 : 2, "repeated matched-edge callbacks cannot queue another opening");
      }
      target.onComplete();
      if (index === words.length - 1) {
        assertEqual([left.scaleX, right.scaleX, bar.visible], [0.08, 0.08, false], "the leaves are visibly settled before the open-door narration appears");
        assertEqual(f.captions.at(-1), "(the doors open)", "the existing canon response is retained");
        assertEqual(f.state.satchel, [], "the last response still precedes the original reward Continue");
      }
      f.continue();
    }
    assertEqual(f.state.satchel, ["quiet-chant"], "the reward is awarded at its original point, once");
    assert(f.captions.at(-1)!.startsWith("The doors part."), "the earned acknowledgment still names the original reward");
    assert(stage.scene && assembly.scene, "the same open doorway persists behind the held reward");
    assertEqual(f.corridors(), 0, "the corridor cannot skip the unread reward");
    f.continue();
    if (!reduced) {
      assertEqual(f.corridors(), 0, "the room does not cut away before Wren crosses its threshold");
      assertEqual(f.bell.doorwayPassagePending, true, "the same Continue owns the short physical passage");
      f.finishPassage();
    }
    assertEqual(f.corridors(), 1, "the existing final Continue enters the corridor once");
    assertEqual([stage.scene, left.scene, right.scene, bar.scene], [null, null, null, null], "corridor cleanup releases the full architecture");
    assertEqual([f.wren.x, f.wren.y], [960, 820], "the old chapter backdrop and Wren position return together");
    assert(f.stopped.includes(assembly.list), "cleanup also cancels pending nested opening tweens");
    const before = f.animations.length; f.bell.openCathedralDoor("chant");
    assertEqual(f.animations.length, before, "late callbacks cannot recreate a removed doorway");
  }
});

await suite("Bell force door: original OPEN and four breaking words open that same doorway with unchanged rewards", () => {
  for (const reduced of [false, true]) {
    const f = doorFixture(reduced); f.bell.showDoorCues();
    const stage = f.bell.doorwayStage as DoorPart;
    const assembly = stage.getByName("cathedral-door")!;
    const left = assembly.getByName("door-left")!, right = assembly.getByName("door-right")!, bar = assembly.getByName("door-crossbar")!;
    f.bell.startFork1Force();
    assertEqual(f.state.satchel, ["lock-bar"], "the force choice keeps its existing immediate relic award");
    assertEqual(f.bell.doorwayStage, stage, "the unchosen chant anchor cannot remove the physical doorway");
    f.continue();
    assertEqual([f.targets[0].word, f.targets[0].caseSensitive], ["OPEN", true], "the original capitalized order is unchanged");
    f.targets[0].onComplete();
    assertEqual(f.timers[0].delay, 400, "the original breaking-word start delay remains exactly400ms");
    f.timers[0].next();
    for (const [index, word] of ["crash", "crack", "clear", "we pass"].entries()) {
      const target = f.targets[index + 1]; assertEqual(target.word, word, "the breaking word remains exact");
      target.onAdvance(word.length - 1, word.length);
      assert(!stage.getData("door-open"), "the unfinished chain keeps its bar and leaves closed");
      target.onAdvance(word.length, word.length);
      if (word === "we pass") {
        assertEqual(stage.getData("door-open"), true, "the force opening begins at its original final-character boundary");
        assertEqual(f.animations.length, reduced ? 0 : 2, "only leaves and crossbar animate");
        if (!reduced) {
          assertEqual(f.animations[0].targets, [left, right], "the stationary wall and floor never join the swing tween");
          assertEqual(f.animations[1].targets, bar, "the released crossbar is its own physical layer");
          assert(f.animations.every(animation => animation.duration < 320), "the opening still fits inside the existing word exit");
        }
      }
      target.onComplete();
    }
    assertEqual([left.scaleX, right.scaleX, bar.visible], [0.08, 0.08, false], "the force acknowledgment sees settled open leaves and released bar");
    assert(f.captions.at(-1)!.startsWith("The doors burst wide."), "the existing force acknowledgment is retained");
    assertEqual(f.state.satchel, ["lock-bar"], "visual completion never duplicates the existing reward");
    assertEqual(f.corridors(), 0, "the actual result stays held until Continue");
    f.continue();
    if (!reduced) f.finishPassage();
    assertEqual(f.corridors(), 1, "Continue still enters the original corridor");
    assertEqual([stage.scene, f.bell.doorwayStage], [null, null], "the shared stage releases on force completion too");
  }
});

await suite("Bell doorway cleanup: interrupted openings cannot survive shutdown or contaminate re-entry", () => {
  const f = doorFixture(); f.bell.showDoorCues();
  const prior = f.bell.doorwayStage as DoorPart;
  f.bell.openForceDoorCue();
  f.bell.clearBellForkCues();
  assertEqual([prior.scene, f.bell.doorChantCue, f.bell.doorForceCue, f.bell.doorwayStage], [null, null, null, null], "the actual shutdown cleanup owns every architectural reference");
  const before = f.animations.length; f.bell.openForceDoorCue();
  assertEqual(f.animations.length, before, "a late force callback cannot start motion after cleanup");
  f.bell.showDoorCues();
  assert(f.bell.doorwayStage !== prior, "re-entry constructs a fresh physical doorway");
  assert(!f.bell.doorwayStage.getData("door-open"), "a fresh visit is closed even if the previous visit was interrupted open");
  assertEqual(f.canvases.size, 2, "clipped texture preparation is safely reused across re-entry");
});

await suite("Bell doorway passage: the same reward Continue walks through the threshold and harmlessly owns early input", () => {
  for (const reduced of [false, true]) {
    const f = doorFixture(reduced); f.bell.showDoorCues(); f.bell.openCathedralDoor("chant", true);
    const stage = f.bell.doorwayStage as DoorPart;
    f.bell.startAct3Corridor();
    if (!reduced) {
      assertEqual([f.bell.doorwayPassagePending, f.corridors(), f.gates.length], [true, 0, 0],
        "one Continue begins movement, with no new word or reading gate before it settles");
      const crossing = f.animations.at(-1);
      assertEqual([crossing.targets, crossing.x, crossing.y, crossing.scaleX, crossing.scaleY, crossing.alpha, crossing.duration],
        [f.wren, 1118, 778, 0.84, 0.84, 0.65, 650], "the bounded approach reaches just inside the actual painted threshold");
      assert(stage.scene, "the painted open doorway remains while Wren crosses it");
      assertEqual(f.wrenSprite.pose, "walk", "the existing walking pose faces the passage");
      let prevented = 0, menuCalls = 0;
      f.bell.chapterMenu = { handleKey(event: KeyboardEvent) { menuCalls += 1; return event.key === "Escape"; } };
      f.bell.reading = { handleKey: () => false };
      f.bell.typingInput = { handleChar() { throw new Error("An early key cannot reach miss-recording input during passage"); } };
      const key = (value: string, ctrl = false, meta = false) => ({ key: value, ctrlKey: ctrl, metaKey: meta, preventDefault: () => { prevented += 1; } });
      for (const value of [" ", "Enter", "x"]) f.bell.onKeyDown(key(value));
      assertEqual(prevented, 3, "early Continue and typing are harmlessly consumed during the physical passage");
      f.bell.onKeyDown(key("Escape"));
      assertEqual([menuCalls, prevented, f.bell.doorwayPassagePending], [4, 3, true], "Escape retains menu ownership without canceling the paused passage");
      f.bell.onKeyDown(key("l", true)); f.bell.onKeyDown(key("l", false, true));
      assertEqual(menuCalls, 4, "Ctrl/Meta browser shortcuts keep their existing early return");
      const count = f.animations.length; f.bell.startAct3Corridor();
      assertEqual(f.animations.length, count, "a duplicate continuation cannot start another crossing");
      f.finishPassage(); crossing.onComplete();
    } else {
      assertEqual(f.animations.length, 0, "reduced motion adds no crossing animation or wait");
    }
    assertEqual([f.bell.doorwayPassagePending, f.corridors(), f.gates.length], [false, 1, 1],
      "settling opens exactly the pre-existing corridor card and releases the temporary input guard");
    assertEqual([f.wren.x, f.wren.y, f.wren.scaleX, f.wren.scaleY, f.wren.alpha, f.wren.visible, f.wrenSprite.pose],
      [960, 820, 1, 1, 1, true, "front"], "position, scale, opacity and pose are restored for the later Bell chapter");
    assertEqual(stage.scene, null, "the original chapter painting returns with the existing corridor card");
  }
});

await suite("Bell doorway passage: shutdown/re-entry invalidates an interrupted crossing and its callback", () => {
  const f = doorFixture(); f.bell.showDoorCues(); f.bell.openCathedralDoor("force", true);
  f.bell.startAct3Corridor();
  const crossing = f.animations.at(-1);
  f.wren.setPosition(850, 808).setScale(0.92).setAlpha(0.8);
  f.bell.clearBellForkCues();
  assert(f.stopped.includes(f.wren), "the actual scene cleanup cancels the owned movement tween");
  assertEqual([f.bell.doorwayPassagePending, f.wren.x, f.wren.y, f.wren.scaleX, f.wren.alpha],
    [false, 960, 820, 1, 1], "cleanup leaves no invisible wait or transformed actor");
  crossing.onComplete();
  assertEqual([f.corridors(), f.gates.length], [0, 0], "a canceled crossing cannot open a late story card");
  f.bell.showDoorCues(); crossing.onComplete();
  assertEqual([f.corridors(), f.gates.length, f.bell.doorwayPassagePending], [0, 0, false], "an old callback cannot hijack a later room entry");
  assert(!f.bell.doorwayStage.getData("door-open"), "newly entered leaves retain their own closed state");
});
