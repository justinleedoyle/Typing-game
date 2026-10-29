import { assert, assertEqual, suite } from "./_assert";
import { homecomingLines } from "../src/game/homecoming";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { OPENING_STEPS, openingStep } from "../src/game/chapterFlow";

await suite("Homecoming resolves the sibling promise actually made in the opening", () => {
  const boy = homecomingLines("boy").map(line => line.text).join(" ");
  const girl = homecomingLines("girl").map(line => line.text).join(" ");
  assert(boy.includes("Saga") && boy.includes("drawing"), "boy Wren brings Saga's drawing home");
  assert(!boy.includes("Magnus"), "does not invent a second sibling");
  assert(girl.includes("Magnus") && girl.includes("promised"), "girl Wren returns to Magnus's promise");
  assert(!girl.includes("Saga") && !girl.includes("drawing"), "does not assign Saga's memento to the other opening");
  const legacy = homecomingLines(null).map(line => line.text).join(" ");
  assert(!legacy.includes("Saga") && !legacy.includes("Magnus"), "old saves without identity keep a neutral return");
  for (const gender of ["boy", "girl", null] as const) {
    const lines = homecomingLines(gender);
    assert(lines[0]?.text.includes("Holdfast"), "returns to the established home");
    assertEqual(lines.at(-1)?.speaker, "Runa", "Runa closes the journey");
  }
});

function reunionHarness(reduced: boolean, onLight: () => void, onBreath: () => void) {
  const path = new URL("../src/scenes/HomecomingScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const method = owner.members.find(member => member.name?.getText(source) === "showSiblingEmbrace")!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("reducedMotion", "addLocalGroundShadow", "applySceneActorLighting", "addIdleBreath",
    `${code}; return Harness;`)(() => reduced, () => ({ shadow: true }), onLight, onBreath);
}

function actor(x: number, y = 950) {
  return { scene: true, x, y, visible: true, children: [] as unknown[],
    setDepth() { return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    add(child: unknown) { this.children.push(child); return this; },
  };
}

await suite("Homecoming reunion: both siblings meet Wren before their held embrace response", () => {
  for (const gender of ["boy", "girl"] as const) for (const reduced of [false, true]) {
    let lights = 0;
    let breaths = 0;
    let ready = 0;
    let pairs = 0;
    let texture = "";
    let height = 0;
    const moves: Array<{ targets: ReturnType<typeof actor>; x: number; onComplete?: () => void }> = [];
    const Scene = reunionHarness(reduced, () => { lights += 1; }, () => { breaths += 1; });
    const s = new Scene();
    const wren = actor(1000);
    const sibling = actor(1430);
    Object.assign(s, {
      leaving: false, wrenActor: wren, siblingActor: sibling, reunionActor: null,
      store: { get: () => ({ wrenGender: gender }) },
      add: {
        container(x: number, y: number) { pairs += 1; return actor(x, y); },
        image(_x: number, _y: number, key: string) {
          texture = key;
          return { height: 1600,
            setOrigin(x: number, y: number) {
              assertEqual([x, y], [0.5, 1], "both full bodies use a shared grounded baseline"); return this;
            },
            setScale(scale: number) { height = scale * this.height; return this; },
          };
        },
      },
      tweens: { killTweensOf() {}, add(opts: typeof moves[number]) { moves.push(opts); } },
    });
    const onReady = () => {
      assert(s.reunionActor.visible && !wren.visible && !sibling.visible,
        "the actual embrace is visible before the sibling story can be read");
      ready += 1;
    };
    s.showSiblingEmbrace(onReady);
    assertEqual(ready, reduced ? 1 : 0, "reduced motion swaps immediately; normal movement settles first");
    assertEqual(moves.length, reduced ? 0 : 2, "reduced motion never slides the cast across the room");
    for (const move of moves) { move.targets.x = move.x; move.onComplete?.(); }
    assertEqual(ready, 1, "the original held story resumes exactly once");
    assertEqual(texture, gender === "boy" ? "homecoming-saga-embrace" : "homecoming-magnus-embrace",
      "only the sibling actually chosen in the opening appears");
    assertEqual(height, gender === "boy" ? 340 : 365, "paired art preserves the child's/older sibling's scene scale");
    assertEqual(s.reunionActor.y, wren.y, "the new pose stays planted on the same floor");
    assertEqual([lights, breaths], [1, 1], "one scene-lit pose gets one decorative breath");
    s.showSiblingEmbrace(onReady);
    assertEqual([pairs, ready], [1, 2], "showing an existing beat does not duplicate the paired art");
  }
});

await suite("Homecoming reunion: legacy saves and leaving during movement remain safe", () => {
  const Scene = reunionHarness(false, () => {}, () => {});
  const legacy = new Scene();
  let legacyReady = 0;
  Object.assign(legacy, { store: { get: () => ({ wrenGender: null }) },
    add: { container() { throw new Error("Legacy return must not invent a sibling pose"); } } });
  legacy.showSiblingEmbrace(() => { legacyReady += 1; });
  assertEqual(legacyReady, 1, "legacy neutral narration keeps its existing immediate gate");

  const moving = new Scene();
  let finish: (() => void) | undefined;
  let ready = 0;
  Object.assign(moving, {
    leaving: false, wrenActor: actor(1000), siblingActor: actor(1430), reunionActor: null,
    store: { get: () => ({ wrenGender: "girl" }) },
    add: { container: actor, image: () => ({ height: 1600,
      setOrigin() { return this; }, setScale() { return this; } }) },
    tweens: { killTweensOf() {}, add(opts: { onComplete?: () => void }) { if (opts.onComplete) finish = opts.onComplete; } },
  });
  moving.showSiblingEmbrace(() => { ready += 1; });
  moving.leaving = true;
  finish!();
  assertEqual(ready, 0, "a completed movement cannot reopen narration after returning to the library");
});

const openingPath = new URL("../src/scenes/OpeningScene.ts", import.meta.url);
const openingSource = ts.createSourceFile(openingPath.pathname, readFileSync(openingPath, "utf8"), ts.ScriptTarget.Latest, true);
const openingOwner = openingSource.statements.find(ts.isClassDeclaration)!;
const openingMethods = ["init", "resumeOpening", "beat10", "showOpeningWren", "stageOpeningWrenDeparture", "receiveSiblingKeepsake", "clearCarriedKeepsake", "playSiblingFarewell"];
const openingCode = ts.transpileModule(`class Opening { ${openingMethods.map(name =>
  openingOwner.members.find(member => member.name?.getText(openingSource) === name)!.getText(openingSource)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const emptyHandsPng = readFileSync(new URL("../art/sibling/sibling-empty-hands.png", import.meta.url));
const emptyHandsHeight = emptyHandsPng.readUInt32BE(20);

function openingBody(kind: string, x = 0, y = 0): any {
  return { kind, x, y, scene: true, active: true, scaleX: 1, scaleY: 1, alpha: 1,
    parentContainer: null, children: [] as any[], height: kind === "sibling-portrait" ? 727 : 240,
    setDepth(value: number) { this.depth = value; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setScale(value: number) { this.scaleX = this.scaleY = value; return this; },
    setTexture(key: string) { this.texture = key; this.height = emptyHandsHeight; return this; },
    add(child: any) { child.parentContainer?.remove(child); child.parentContainer = this; this.children.push(child); return this; },
    remove(child: any) { this.children = this.children.filter((item: any) => item !== child); child.parentContainer = null; return this; },
    destroy() { this.scene = false; this.parentContainer?.remove(this); },
    getWorldTransformMatrix() {
      const parent = this.parentContainer?.getWorldTransformMatrix();
      const at = parent ? parent.transformPoint(this.x, this.y) : { x: this.x, y: this.y };
      const scaleX = (parent?.scaleX ?? 1) * this.scaleX, scaleY = (parent?.scaleY ?? 1) * this.scaleY;
      return { scaleX, scaleY,
        transformPoint: (x: number, y: number) => ({ x: at.x + x * scaleX, y: at.y + y * scaleY }),
        applyInverse: (x: number, y: number) => ({ x: (x - at.x) / scaleX, y: (y - at.y) / scaleY }),
      };
    },
  };
}

function openingFixture(gender: "boy" | "girl" = "boy", reduced = false, missingArt = false) {
  const Opening = new Function("makeWrenSprite", "addLocalGroundShadow", "setWrenPose", "reducedMotion", "playActorAttention", "PORTAL_TARGET", "OPENING_STEPS", "openingStep", "Phaser",
    `${openingCode}; return Opening;`)(() => openingBody("wren-sprite"), () => openingBody("shadow"), (sprite: any, pose: string) => { sprite.pose = pose; },
    (scene: any) => scene.motionReduced, () => {}, { x: 1510, y: 610 }, OPENING_STEPS, openingStep,
    { Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade-out-complete" } } } });
  const scene = new Opening();
  const sibling = openingBody("sibling", 1180, 950), portrait = openingBody("sibling-portrait"), prop = openingBody("drawing", 24, -116);
  sibling.add(portrait); if (gender === "boy") sibling.add(prop);
  const tweens: any[] = [], gates: Array<() => void> = [], checkpoints: string[] = [], lines: string[] = [], timers: any[] = [], fades: number[] = [], transitions: string[] = [];
  const state: any = { wrenGender: gender, typewriterAwakened: false, checkpoint: null };
  Object.assign(scene, {
    wrenGender: gender, motionReduced: reduced, siblingActor: sibling, siblingPortrait: portrait,
    siblingKeepsake: gender === "boy" ? prop : null, carriedKeepsake: null, openingWren: null, openingDepartureStarted: false,
    add: { container: (x: number, y: number) => openingBody("wren", x, y) },
    textures: { exists: () => !missingArt },
    tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(target: any) { for (const tween of tweens) if (tween.targets === target) tween.cancelled = true; } },
    store: { get: () => state, update: (change: (value: any) => void) => change(state), clearCheckpoint() { state.checkpoint = null; } },
    checkpoint(step: string) { checkpoints.push(step); state.checkpoint = { scene: "OpeningScene", step, data: {} }; },
    narration: { say: (key: string) => lines.push(key) }, readThen: (next: () => void) => gates.push(next),
    playOpeningPortalTravel() { this.stageOpeningWrenDeparture(); },
    time: { delayedCall: (ms: number, callback: () => void) => timers.push({ ms, callback }) },
    cameras: { main: { fadeOut: (ms: number) => fades.push(ms), once: (_event: string, callback: () => void) => callback() } },
    scene: { start: (key: string) => transitions.push(key) },
    drawRuna() {}, drawSibling() { this.siblingActor = sibling; this.siblingPortrait = portrait; this.siblingKeepsake = gender === "boy" ? prop : null; },
  });
  return { scene, sibling, portrait, prop, tweens, gates, checkpoints, lines, state, timers, fades, transitions,
    transfer: () => tweens.find(tween => tween.targets === prop && tween.duration === 420),
  };
}

await suite("Opening keepsake: Saga gives the one drawing to grounded Wren without leaving a painted duplicate", () => {
  for (const reduced of [false, true]) {
    const f = openingFixture("boy", reduced);
    const before = f.prop.getWorldTransformMatrix().transformPoint(0, 0);
    f.scene.playSiblingFarewell();
    const wren = f.scene.openingWren;
    assertEqual([wren.x, wren.y], [982, 936], "receiving uses the original departure footprint");
    assert(!f.sibling.children.includes(f.prop) && wren.children.includes(f.prop), "ownership of the same drawing moves from Saga to Wren");
    assertEqual([f.scene.siblingKeepsake, f.scene.carriedKeepsake], [null, f.prop], "there is one carried subject and no second source overlay");
    assertEqual([f.portrait.texture, f.portrait.height * f.portrait.scaleY], ["sibling-empty-hands", 260], "Saga's baked-in drawing is replaced by the matching empty-hands pose at the same display height");
    if (reduced) assertEqual([f.prop.x, f.prop.y, f.transfer()], [20, -112, undefined], "reduced motion is already received, with no transfer tween");
    else {
      assertEqual(f.prop.getWorldTransformMatrix().transformPoint(0, 0), before, "reparenting keeps the drawing at its original world position before movement");
      assertEqual(f.transfer().duration, 420, "normal presentation gives the handoff one finite movement");
    }
    assertEqual([f.gates.length, f.checkpoints.length, f.lines.length], [0, 0, 0], "the handoff creates no reading gate, save boundary or dialogue");
  }
  const sourcePng = readFileSync(new URL("../art/sibling/sibling-front.png", import.meta.url));
  assertEqual(emptyHandsPng[25], 6, "the derived pose keeps a genuine RGBA alpha channel");
  assert(Math.abs(emptyHandsPng.readUInt32BE(16) / emptyHandsHeight - sourcePng.readUInt32BE(16) / sourcePng.readUInt32BE(20)) < .002, "full-body framing retains the source aspect ratio at the existing display height");
});

await suite("Opening keepsake: early Continue settles receipt before the original bridge and portal timing", () => {
  const f = openingFixture(); f.scene.playSiblingFarewell();
  f.scene.beat10();
  assert(f.transfer().cancelled, "early Continue cancels the moving paper before the bridge is shown");
  assertEqual([f.prop.x, f.prop.y, f.gates.length, f.checkpoints], [20, -112, 1, ["departure"]], "the bridge has its original one gate with the drawing already held");
  assertEqual(f.lines, ["opening_beat10_bridge_to_hub"], "the original bridge wording is preserved");
  f.gates.shift()!();
  const crossing = f.tweens.find(tween => tween.targets === f.scene.openingWren && tween.duration === 520);
  assertEqual([crossing.x, crossing.y, crossing.alpha, crossing.scaleX, crossing.scaleY], [1490, 740, .14, .9, .9], "the original travel route, fade and scale are unchanged");
  assertEqual([f.timers[0].ms, f.state.typewriterAwakened, f.state.checkpoint], [560, true, null], "the original departure timer and completed-opening save boundary remain intact");
  const count = f.tweens.length; f.scene.stageOpeningWrenDeparture();
  assertEqual(f.tweens.length, count, "repeated staging cannot start a second portal crossing");
  f.timers[0].callback();
  assertEqual([f.fades, f.transitions], [[700], ["PortalChamberScene"]], "the existing fade and hub destination remain unchanged");
});

await suite("Opening keepsake: restored departure receives immediately while Magnus keeps his original promise", () => {
  for (const reduced of [false, true]) {
    const f = openingFixture("boy", reduced);
    f.state.checkpoint = { scene: "OpeningScene", step: "departure", data: {} };
    f.scene.resumeOpening();
    assertEqual([f.prop.x, f.prop.y, f.transfer(), f.gates.length], [20, -112, undefined, 1], "restoring the bridge settles the received prop without replaying an action or adding a gate");
  }
  const magnus = openingFixture("girl"); magnus.scene.playSiblingFarewell(); magnus.scene.beat10();
  assertEqual([magnus.scene.openingWren, magnus.scene.carriedKeepsake, magnus.portrait.texture], [null, null, undefined], "Magnus is not given Saga's drawing or an earlier Wren entrance");
  assertEqual(magnus.gates.length, 1, "Magnus retains the same bridge Continue");
  const missing = openingFixture("boy", false, true); missing.scene.playSiblingFarewell(); missing.scene.beat10();
  assertEqual([missing.scene.openingWren, missing.scene.carriedKeepsake, missing.gates.length], [null, null, 1], "missing optional pose art safely retains the original farewell and never traps progression");
});

await suite("Opening keepsake: cleanup and actual init cannot retain a drawing or transfer across reuse", () => {
  const f = openingFixture(); f.scene.playSiblingFarewell();
  f.scene.init({ store: f.scene.store });
  assert(f.transfer().cancelled && !f.prop.scene, "reusing the scene removes the moving prop and its tween");
  assertEqual([f.scene.carriedKeepsake, f.scene.openingWren, f.scene.siblingPortrait, f.scene.openingDepartureStarted], [null, null, null, false], "actual init resets all new ownership and departure state");
  f.scene.clearCarriedKeepsake();
  assertEqual(f.scene.carriedKeepsake, null, "repeated cleanup is safe");
});
