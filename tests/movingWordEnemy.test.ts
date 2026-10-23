// Logic harness: the pure math behind the shared MovingWordEnemy.
//
// The class itself is Phaser-coupled (like TextWordTarget / ScrollingPhrase) and
// not unit-testable, but the two formulas every advancing-enemy realm ran inline
// — the advance duration and the danger ramp — are extracted as pure functions.
// Locking them here is what makes the Tier-2 migration provably feel-identical:
// these are the exact numbers Winter/Bell/Forge/Wood produced before the refactor.

import { assert, assertClose, assertEqual, suite } from "./_assert";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { applySceneActorLighting } from "../src/game/actorLighting";

import {
  advanceDurationMs,
  dangerRamp,
  splitChildPositions,
} from "../src/game/movingWordMath";

const EPS = 1e-9;

await suite("advanceDurationMs: full range = base × mult", () => {
  // Enemy at its rest point (remaining === totalRange) → factor 1 → full deadline.
  assertClose(advanceDurationMs(15000, 620, 620, 1), 15000, EPS, "full range");
  assertClose(advanceDurationMs(15000, 620, 620, 1.2), 18000, EPS, "quiet-advance ×1.2");
});

await suite("advanceDurationMs: scales with remaining distance", () => {
  // A knocked-back enemy re-advancing from half-distance gets a half-length close.
  assertClose(advanceDurationMs(15000, 310, 620, 1), 7500, EPS, "half range → half time");
  assertClose(advanceDurationMs(13000, 6500, 13000, 1), 6500, EPS, "half of 13000");
});

await suite("advanceDurationMs: floors at 0.3 of the base", () => {
  // Near Wren (tiny remaining) the close can't snap in instantly — floored at 0.3.
  assertClose(advanceDurationMs(15000, 0, 620, 1), 4500, EPS, "remaining 0 → 0.3×");
  assertClose(advanceDurationMs(15000, 60, 620, 1), 4500, EPS, "60/620≈0.097 < 0.3 → 0.3×");
  assertClose(advanceDurationMs(15000, 60, 620, 1.2), 5400, EPS, "floor then ×mult");
});

await suite("advanceDurationMs: totalRange 0 falls back to /1", () => {
  // Degenerate rest-at-Wren: the `|| 1` guard every realm used avoids /0.
  assertClose(advanceDurationMs(15000, 5, 0, 1), 75000, EPS, "remaining/1 = 5 → 75000");
});

await suite("dangerRamp: 0 until rampStart, 1 at full advance", () => {
  assertClose(dangerRamp(0.4, 0.4), 0, EPS, "at rampStart → 0");
  assertClose(dangerRamp(0.2, 0.4), 0, EPS, "before rampStart clamps to 0");
  assertClose(dangerRamp(0, 0.4), 0, EPS, "progress 0 → 0");
  assertClose(dangerRamp(1, 0.4), 1, EPS, "progress 1 → 1");
});

await suite("dangerRamp: linear between rampStart and 1", () => {
  // Winter/Bell/Forge rampStart 0.4: halfway through the ramp window is danger 0.5.
  assertClose(dangerRamp(0.7, 0.4), 0.5, EPS, "0.4 ramp midpoint");
  // Wood rampStart 0.5: its ramp window is the back half.
  assertClose(dangerRamp(0.75, 0.5), 0.5, EPS, "0.5 ramp midpoint");
  assertClose(dangerRamp(1, 0.5), 1, EPS, "0.5 ramp end");
});

await suite("splitChildPositions: ebb/drift place left/right of Wren", () => {
  // Bell's splitter resting on Wren's line: ebb (−60) lands left, drift (+60) right.
  const placed = splitChildPositions(
    960,
    740,
    [
      { word: "ebb", dx: -60 },
      { word: "drift", dx: 60 },
    ],
    960,
  );
  assertEqual(
    placed,
    [
      { word: "ebb", restX: 900, restY: 740, side: "left" },
      { word: "drift", restX: 1020, restY: 740, side: "right" },
    ],
    "two children placed at ±60, sided by Wren",
  );
});

await suite("splitChildPositions: side follows which half of Wren a child rests on", () => {
  // A splitter resting well left of Wren: both children still left of Wren → both enter left.
  const placed = splitChildPositions(720, 700, [
    { word: "ebb", dx: -60 },
    { word: "drift", dx: 60 },
  ], 960);
  assert(placed.every((p) => p.side === "left"), "both children left of Wren");
  assertEqual(placed[0]?.restX, 660, "ebb rest x");
  assertEqual(placed[1]?.restX, 780, "drift rest x");
});

await suite("advancing word rendering: answers remain above world actors at contact", () => {
  // Exercise the production attachment method with inert renderer objects.
  // Before the fix these options omitted depth, placing the answer at0 behind
  // Forge Wren at6 (and Winter Wren at4) when the enemy reached the hero.
  const source = ts.createSourceFile("movingWordEnemy.ts", readFileSync(
    new URL("../src/game/movingWordEnemy.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const method = owner.members.find((member) => member.name?.getText(source) === "attachTarget")!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Targets: Array<{ opts: Record<string, any>; depth: number }> = [];
  class TextTarget {
    depth: number;
    constructor(readonly opts: Record<string, any>) { this.depth = opts.depth ?? 0; Targets.push(this); }
    playEntryWake() {}
    setDepth(depth: number) { this.depth = depth; }
    getAnchorX() { return this.opts.x; }
    getAnchorY() { return this.opts.y; }
  }
  const Enemy = new Function("TextWordTarget", "PALETTE_HEX", "attachWordBodyAnchor",
    `${code}; return Harness;`)(TextTarget, { brass: 1 }, () => ({ destroy() {} }));
  for (const override of [null, 1301]) {
    const registered: unknown[] = [];
    const enemy = new Enemy();
    Object.assign(enemy, {
      cfg: { scene: {}, word: "walk", container: { x: 960, y: 368, depth: 0 }, restY: 368,
        typingInput: { register: (target: unknown) => registered.push(target) },
        onTargetAttached: (target: TextTarget) => { if (override !== null) target.setDepth(override); } },
      anchorOffsetY: -118,
    });
    enemy.attachTarget();
    const target = Targets.at(-1)!;
    assert(target.opts.depth > 6 && target.opts.depth > 44, "answer clears Wren, body actors, and their tethers");
    assert(target.depth < 1400, "console and pause overlays remain above the answer");
    assertEqual(target.depth, override ?? 70, "realm-specific timing UI can still choose a higher layer");
    assertEqual([target.opts.x, target.opts.y, target.opts.word], [960, 250, "walk"], "contact position and answer stay unchanged");
    assertEqual(registered, [target], "the visible answer remains the sole registered gameplay target");
  }
});

function renderMethod(path: string, name: string, globals: Record<string, unknown>) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const method = owner.members.find((member) => member.name?.getText(source) === name)!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));
}

await suite("realm word rendering: NPC answers and choices clear actors without lifting overlays", () => {
  class Target { constructor(readonly opts: Record<string, any>) {} }
  for (const realm of ["WinterMountain", "SunkenBell", "ClockworkForge", "SkyIsland", "HauntedWood", "GreatBattle"]) {
    const Scene = renderMethod(`../src/scenes/${realm}Scene.ts`, "makeWord", {
      TextWordTarget: Target, playWrenFocus() {}, playWrenAction() {},
    });
    const s = new Scene();
    s.playWrenTypingPulse = () => {};
    let completed = 0;
    const opts = { word: "answer", x: 620, y: 560, onComplete: () => { completed += 1; } };
    const target = s.makeWord(opts);
    // Etta is the highest ordinary realm actor (50); the finale deliberately
    // uses its own smaller layer stack with the Lord at4 and answers at6.
    assert(target.opts.depth > (realm === "GreatBattle" ? 4 : 50), `${realm}: answers clear the world actor stack`);
    assert(target.opts.depth < 100 && target.opts.depth < 1400, `${realm}: mist hazards and console retain their existing layers`);
    assertEqual([target.opts.word, target.opts.x, target.opts.y], ["answer", 620, 560], `${realm}: answer and authored anchor stay unchanged`);
    target.opts.onComplete();
    assertEqual(completed, 1, `${realm}: rendering does not replace the gameplay completion callback`);
    assertEqual(s.makeWord({ ...opts, depth: 40 }).opts.depth, 40, `${realm}: explicit local depth remains authoritative`);
  }
});

await suite("scroll rendering: the moving answer clears its opaque parchment and registers once", () => {
  const targets: Array<{ opts: Record<string, any> }> = [];
  class Target {
    constructor(readonly opts: Record<string, any>) { targets.push(this); }
    playEntryWake() {}
  }
  const Scroll = renderMethod("../src/game/scrollingPhrase.ts", "attachTarget", {
    TextWordTarget: Target, BANNER_FONT_SIZE: 32, PALETTE_HEX: { brass: 1 },
  });
  const scroll = new Scroll();
  const registered: unknown[] = [];
  const destinations: number[] = [];
  Object.assign(scroll, {
    resolved: false, target: null, container: { x: 320, y: 500, depth: 20 },
    opts: { scene: {}, phrase: "a moving answer", typingInput: { register: (target: unknown) => registered.push(target) } },
    startScroll: (endX: number) => destinations.push(endX),
  });
  scroll.attachTarget(2000);
  scroll.attachTarget(2000);
  assertEqual(targets.length, 1, "duplicate attachment cannot create a second visible answer");
  assert(targets[0].opts.depth > scroll.container.depth && targets[0].opts.depth > 50,
    "independent answer clears parchment at20 and the realm's highest actor at50");
  assert(targets[0].opts.depth < 1400, "scroll text stays under the console and pause UI");
  assertEqual([targets[0].opts.x, targets[0].opts.y, targets[0].opts.word], [320, 500, "a moving answer"],
    "the answer remains centered on the same moving banner");
  assertEqual(registered, [targets[0]], "one visible target is registered for gameplay");
  assertEqual(destinations, [2000], "scroll destination and start count are unchanged");
});

await suite("Forge grounding: descent and standing smith use the golems' boot line", () => {
  const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const constants = ["CATWALK_Y", "FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "FOUNDRY_GROUND_Y", "FORN_SPRITE_HEIGHT"];
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => constants.includes(declaration.name.getText(source)))
      .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = ["descendWrenToFoundry", "drawFoundryDescentRoute", "showFornSprite"].map(name =>
    owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n");
  const code = ts.transpileModule(`${declarations}\nclass Forge { ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const poses: string[] = [];
  const idleFeet: number[] = [];
  const Forge = new Function("setWrenPose", "playClack", "playBodyImpact", "addIdleBreath", "stageAnchoredSprite", "PALETTE_HEX",
    `${code}; return { Forge, CATWALK_Y, FLOOR_Y, GOLEM_SPRITE_HEIGHT };`)(
    (_sprite: unknown, pose: string) => poses.push(pose), () => {}, () => {},
    (_scene: unknown, body: { y: number }) => idleFeet.push(body.y), () => {}, { ember: 1 });
  const s = new Forge.Forge();
  const body = { x: 960, y: Forge.CATWALK_Y + 20, scene: true };
  const motion: Array<{ targets: typeof body; x: number; y: number; duration: number; onComplete: () => void }> = [];
  const plates: number[] = [];
  const graphics = {
    lineStyle() { return this; }, lineBetween() { return this; }, fillStyle() { return this; }, fillCircle() { return this; },
    fillRoundedRect(_x: number, y: number) { plates.push(y + 8); return this; },
  };
  const route = { setDepth() { return this; }, setAlpha() { return this; }, add() {}, destroy() {} };
  const sprite = { x: 0, y: 0, height: 640, setOrigin() {}, setScale() {}, setDepth() {} };
  let footing = 0;
  let continued = 0;
  Object.assign(s, {
    wrenContainer: body, wrenSprite: {}, scale: { width: 1920 },
    tweens: { add(opts: any) { if (opts.targets === body) motion.push(opts); }, killTweensOf() {} },
    add: { container: () => route, graphics: () => graphics,
      image(x: number, y: number) { sprite.x = x; sprite.y = y; return sprite; } },
    swapWrenFootingToFoundry: () => { footing += 1; },
  });
  assertEqual(body.y, 460, "the catwalk starts at its existing foot line");
  s.descendWrenToFoundry(() => { continued += 1; });
  assertEqual(continued, 0, "foundry combat waits for the actual descent");
  for (let index = 0; index < 3; index++) {
    const step = motion[index];
    assert(!!step, "the next physical step exists");
    body.x = step.x; body.y = step.y; step.onComplete();
  }
  const golemBootY = Forge.FLOOR_Y + Forge.GOLEM_SPRITE_HEIGHT / 2;
  assertEqual(body.y, golemBootY, "feet-origin Wren lands at the centered golems' painted boot line");
  assertEqual(plates.at(-1), body.y + 2, "the final temporary stair remains directly below Wren's boots");
  assertEqual(idleFeet, [golemBootY], "idle breath starts around the corrected floor rather than the old center lane");
  assertEqual(motion.map(step => step.duration), [360, 360, 500], "descent timing is preserved");
  assertEqual([continued, footing, poses.at(-1)], [1, 1, "front"], "descent hands off once with grounded front pose");
  s.showFornSprite();
  assertEqual(sprite.y, golemBootY, "feet-origin Forn stands on the same floor as Wren and the golems");
});

await suite("Forge boss grounding: the scaled Command-Golem keeps its boots above the console", () => {
  const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const constants = ["FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "COMMAND_GOLEM_SPRITE_HEIGHT", "COMMAND_GOLEM_SCALE", "FOUNDRY_GROUND_Y"];
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => constants.includes(declaration.name.getText(source)))
      .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = ["spawnBossVisual", "drawCommandGolemInto"].map(name =>
    owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n");
  const code = ts.transpileModule(`${declarations}\nclass Forge { ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const contactShadows: Array<{ y: number }> = [];
  const Forge = new Function("addLocalGroundShadow", "applySceneActorLighting",
    `${code}; return { Forge, FOUNDRY_GROUND_Y };`)(
    (_scene: unknown, _width: number, _height: number, opts: { y: number }) => {
      contactShadows.push(opts); return {};
    }, applySceneActorLighting);
  const s = new Forge.Forge();
  const body = { x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1,
    setScale(scale: number) { this.scaleX = this.scaleY = scale; },
    setAlpha(alpha: number) { this.alpha = alpha; }, add() {} };
  // Read the actual PNG height, so this regression follows a replaced asset.
  const height = readFileSync(new URL("../art/forge/command-golem.png", import.meta.url)).readUInt32BE(20);
  const sprite = { y: 0, height, scaleY: 1, setScale(scale: number) { this.scaleY = scale; } };
  let entrance: { duration: number; onComplete: () => void } | undefined;
  let pulses = 0;
  let restingCenter = 0;
  Object.assign(s, {
    scale: { width: 1920 }, add: {
      container(x: number, y: number) { body.x = x; body.y = y; return body; }, image: () => sprite,
    },
    makeGolemFoundryBase: () => ({}),
    tweens: { add: (opts: { duration: number; onComplete: () => void }) => { entrance = opts; } },
    playCommandGolemStagePulse: () => { pulses += 1; }, idleBob: () => { restingCenter = body.y; },
  });
  s.spawnBossVisual();
  const bootsY = body.y + (sprite.y + sprite.height * sprite.scaleY / 2) * body.scaleY;
  assertEqual(bootsY, Forge.FOUNDRY_GROUND_Y, "scaled center-origin boss lands on the same boot line as regular golems");
  const shadowY = body.y + contactShadows[0]!.y * body.scaleY;
  assert(shadowY >= bootsY && shadowY - bootsY < 8,
    "the scaled contact shadow stays below its boots rather than across its lower body");
  assert(sprite.height * sprite.scaleY * body.scaleY > 330,
    "the massive Command-Golem visibly towers over 240px Wren");
  assertEqual(body.x, 1160, "boss keeps its authored horizontal stage slot");
  assertEqual(restingCenter, body.y, "idle motion starts from the corrected center");
  assertEqual(entrance!.duration, 900, "entrance timing is unchanged");
  entrance!.onComplete();
  assertEqual(pulses, 1, "existing entrance completion still triggers its body pulse once");
});

await suite("Forge reading hint: catwalk figures keep a clear silhouette before the descent", () => {
  const Forge = renderMethod("../src/scenes/ClockworkForgeScene.ts", "readingHintY", { CATWALK_SURFACE_Y: 460 });
  const s = new Forge();
  for (const feet of [460, 456, 866]) {
    for (const captionBottom of [178, 215, 600]) {
      Object.assign(s, { wrenContainer: { y: feet }, narration: { bottom: () => captionBottom } });
      const center = s.readingHintY();
      assert(center >= captionBottom + 40, "hint remains below the current standard or large caption");
      if (feet < 500) {
        assert(center - 32 >= feet + 16, "large hint plate clears the catwalk actors' feet, including idle breath");
      } else {
        assertEqual(center, Math.max(316, captionBottom + 40), "foundry reading retains its existing caption-following lane");
      }
    }
  }
});
