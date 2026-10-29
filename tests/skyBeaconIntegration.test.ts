import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

// Read the actual visible PNG silhouette independently of its placement code.
function painting(file: string) {
  const png = readFileSync(new URL(file, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert(png[24] === 8 && png[25] === 6, "painted beacon sources retain true 8-bit RGBA transparency");
  const chunks: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), name = png.toString("ascii", p + 4, p + 8);
    if (name === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  let previous = new Uint8Array(stride), at = 0, left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]!, row = new Uint8Array(stride);
    for (let b = 0; b < stride; b++) {
      const a = b >= 4 ? row[b - 4]! : 0, up = previous[b]!, c = b >= 4 ? previous[b - 4]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((a + up) / 2);
      else if (filter === 4) {
        const p = a + up - c, da = Math.abs(p - a), db = Math.abs(p - up), dc = Math.abs(p - c);
        predictor = da <= db && da <= dc ? a : db <= dc ? up : c;
      }
      row[b] = (raw[at++]! + predictor) & 255;
    }
    // Ignore the nearly transparent matte fringe when measuring real contact.
    for (let x = 0; x < width; x++) if (row[x * 4 + 3]! > 25) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    previous = row;
  }
  return { width, height, bounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
}
const paintings = {
  "sky-beacon-brazier": painting("../art/sky/beacon-brazier.png"),
  "sky-beacon-flame": painting("../art/sky/beacon-flame.png"),
  "scholar-spirit": painting("../art/sky/scholar-spirit.png"),
};
const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const methods = ["createBeaconFlameCue", "fitBeaconPainting", "dimBeaconFlameVisual", "takeBeaconSparkVisual", "showHeldBeaconSpark", "clearHeldBeaconSpark", "clearSkyForkCues", "startFork1StealFlame", "runPassageChain", "skyOwnedWordPosition", "makeSkyForkWord", "fadeOutForkCue",
  "showFork2Cues", "createKindAnswerCue", "createTetherThreadCue", "releaseFork2Spirit", "startFork2", "startFork2KindEnding", "startFork2CutTether", "startLanternMothGate", "onBossDefeated", "resumeSky"];
const constantNames = ["SCHOLAR_SPIRIT_HEIGHT", "SKY_WREN_STAGE_X", "SKY_WREN_STAGE_Y"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations
  .filter(declaration => constantNames.includes(declaration.name.getText(source))).map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Sky { ${methods.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};

function fixture(reduced = false) {
  const images: any[] = [], tweens: any[] = [], wakes: any[] = [], attentions: any[] = [], targets: any[] = [], anchors: any[] = [], captions: string[] = [], timers: any[] = [], checkpoints: any[] = [];
  const state = { satchel: [] as string[], almanacLore: [] as string[], realms: {} };
  let next: (() => void) | undefined, acts = 0, moths = 0;
  function prop(x: number, y: number, key = "") {
    const dimensions = paintings[key as keyof typeof paintings] ?? { width: 1, height: 1 };
    const data = new Map<string, unknown>(), destroyCallbacks: Array<() => void> = [];
    return { x, y, key, ...dimensions, alpha: 1, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5,
      depth: 0, angle: 0, active: true, scene: true, name: "", children: [] as any[],
      setDepth(v: number) { this.depth = v; return this; }, setAlpha(v: number) { this.alpha = v; return this; },
      setScale(v: number) { this.scaleX = this.scaleY = v; return this; }, setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; },
      setName(v: string) { this.name = v; return this; }, setActive(v: boolean) { this.active = v; return this; },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
      setData(k: string, v: unknown) { data.set(k, v); return this; }, getData(k: string) { return data.get(k); },
      add(child: any) { this.children.push(child); return this; }, getByName(name: string) { return this.children.find(child => child.name === name && child.scene) ?? null; },
      once(_event: string, callback: () => void) { destroyCallbacks.push(callback); return this; },
      lineStyle() { return this; }, points: [] as Array<{ x: number; y: number }>,
      strokePoints(points: Array<{ x: number; y: number }>) { this.points = points; return this; },
      destroy() { if (!this.scene) return; this.scene = false; for (const callback of destroyCallbacks) callback(); for (const child of this.children) child.destroy?.(); },
    };
  }
  const globals = {
    Phaser: { Math: { Clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)),
      Vector2: class { constructor(public x: number, public y: number) {} } },
      Curves: { CubicBezier: class {
        constructor(private a: any, private b: any, private c: any, private d: any) {}
        getPoints(count: number) { return Array.from({ length: count + 1 }, (_, i) => {
          const t = i / count, u = 1 - t;
          return { x: u ** 3 * this.a.x + 3 * u ** 2 * t * this.b.x + 3 * u * t ** 2 * this.c.x + t ** 3 * this.d.x,
            y: u ** 3 * this.a.y + 3 * u ** 2 * t * this.b.y + 3 * u * t ** 2 * this.c.y + t ** 3 * this.d.y };
        }); }
      } }, GameObjects: { Events: { DESTROY: "destroy" } } },
    PALETTE_HEX: { brass: 0 }, reducedMotion: () => reduced,
    addLocalGroundShadow: () => prop(0, 0), addLivingLight: () => prop(0, -190),
    addContainerWake: (_s: unknown, body: any, options: any) => wakes.push({ body, ...options }),
    attachWordBodyAnchor: (_scene: unknown, body: any, _point: any, options: any) => {
      const anchor = { body, options, destroyed: false, destroy() { this.destroyed = true; } };
      anchors.push(anchor); return anchor;
    },
    playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop, playBodyTypePulse: noop, playClaimLine: noop,
    playActorAttention: (_s: unknown, body: any) => attentions.push(body),
    addIdleBreath: noop, playChime: noop, flashQuietLordFragment: noop, resolveCompanionDecision: () => "declined",
  };
  const Sky = new Function(...Object.keys(globals), code + "; return Sky;")(...Object.values(globals));
  const s = new Sky();
  Object.assign(s, {
    checkpoint(step: string, data = {}) { checkpoints.push({ step, data }); },
    savedStageData(step: string) { return s.resumeCheckpoint?.step === step ? s.resumeCheckpoint.data : {}; },
    scale: { width: 1920, height: 1080 }, wrenContainer: prop(960, 826), wrenSprite: {},
    heldBeaconSpark: null, forkChoiceWordAnchors: [], kindAnswerCue: null, tetherThreadCue: null, fork2Scholar: null, fork2Tether: null,
    add: { container: prop, graphics: () => prop(0, 0), image(x: number, y: number, key: string) { const image = prop(x, y, key); images.push(image); return image; } },
    tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.killed = true; } },
    band: { setObjective: noop }, hideEtta: noop, commitFork: (_key: string, value: string) => value,
    setTempleBeamsActive: noop, setAmbientLanternFieldAlpha: noop, narration: { say: noop }, spawnBossLanternBurst: noop,
    quietLordFiredInPhase2: true, time: { delayedCall(delay: number, callback: () => void) { timers.push({ delay, callback }); } },
    readThen(callback: () => void) { assert(!next, "an unread result cannot be overwritten"); next = callback; },
    setNarrator(text: string) {
      if (text.includes("in your palm")) {
        assert(!s.beaconFlameCue.getByName("beacon-spark"), "the source flame is absent before the truthful in-palm response");
        assert(s.heldBeaconSpark?.scene, "a visible painted curl is held before the in-palm response");
      }
      captions.push(text);
    },
    makeWord(options: any) { return { ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }; },
    registerActiveTarget(...values: any[]) { targets.push(...values); }, clearActiveTargets: noop,
    clearForkChoiceWordAnchors() { for (const anchor of s.forkChoiceWordAnchors) anchor.destroy(); s.forkChoiceWordAnchors = []; },
    store: { get: () => state, update(edit: (save: typeof state) => void) { edit(state); } }, startAct3() { acts++; },
    startTrueNamePassage() { moths++; },
  });
  s.beaconFlameCue = s.createBeaconFlameCue();
  const settle = (tween: any) => {
    for (const key of ["x", "y", "alpha"]) if (typeof tween[key] === "number") tween.targets[key] = tween[key];
    tween.onComplete?.();
  };
  return { s, images, tweens, wakes, attentions, targets, anchors, captions, state, timers, checkpoints, acts: () => acts, moths: () => moths, settle, prop,
    next() { assert(next, "the original Continue is available"); const callback = next!; next = undefined; callback(); } };
}

function paintedBounds(image: any, parent: any = { x: 0, y: 0 }) {
  const p = paintings[image.key as keyof typeof paintings], b = p.bounds;
  return {
    left: parent.x + image.x + (b.x - p.width * image.originX) * image.scaleX,
    right: parent.x + image.x + (b.x + b.width - p.width * image.originX) * image.scaleX,
    top: parent.y + image.y + (b.y - p.height * image.originY) * image.scaleY,
    bottom: parent.y + image.y + (b.y + b.height - p.height * image.originY) * image.scaleY,
  };
}

await suite("Sky painted beacon: true-alpha silhouettes meet the fixed terrace contact and keep labels clear of the source flame", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced), cue = f.s.beaconFlameCue;
    const brazier = cue.getByName("beacon-brazier"), flame = cue.getByName("beacon-spark");
    const base = paintedBounds(brazier, cue), fire = paintedBounds(flame, cue);
    assertEqual([cue.x, cue.y], [1320, 792], "the fixture starts at its final terrace contact with no hover offset");
    assertClose(base.bottom, 792, 0.1, "actual painted stone touches the floor despite transparent canvas padding");
    assertClose(base.bottom - base.top, 180, 0.1, "the physical fixture uses its silhouette height");
    assertClose(fire.bottom - fire.top, 70, 0.1, "the flame fits its own silhouette rather than the padded canvas");
    const entrance = f.tweens.find(tween => tween.targets === cue);
    assertEqual(Object.keys(entrance).filter(key => ["x", "y", "scaleX", "scaleY", "repeat"].includes(key)), [], "the stone has only an alpha entrance, never travel or idle growth");
    f.settle(entrance);
    f.s.startFork1StealFlame(); f.next();
    const target = f.targets.at(-1);
    assert(target.y + 34 < fire.top, "the complete live phrase stays above the painted source");
    assert(target.x > cue.x && target.y > 320, "the source retains its right-side phrase lane below the reading card");
    assertEqual(f.anchors.at(-1).options.sourceOffsetY, cue.getData("sky-source-offset-y"), "the real tether connects to the same authored flame source");
    target.onClaim({}); target.onAdvance(1, target.word.length);
    assertEqual(f.attentions.at(-1), f.s.wrenContainer, "claim feedback does not scale or tint the physical masonry");
    assertEqual([cue.x, cue.y, cue.scaleX, cue.scaleY, cue.angle], [1320, 792, 1, 1, 0], "claim and typing preserve the fixture's floor geometry");
  }
});

await suite("Sky stolen spark: original four phrases dim, take and hold painted fire synchronously before their existing responses", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced), cue = f.s.beaconFlameCue;
    const source = cue.getByName("beacon-spark"), light = cue.getByName("beacon-light");
    f.s.startFork1StealFlame(); f.next();
    for (const [index, word] of ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"].entries()) {
      const target = f.targets.at(-1);
      assertEqual(target.word, word, "the exact authored phrase and sequence are unchanged");
      target.onComplete();
      if (index === 0) assert(source.scene && source.alpha === 1, "reaching alone leaves the waiting flame unchanged");
      if (index === 1) assert(source.scene && source.alpha < 1 && light.alpha < 0.12, "the dimming response visibly reduces the source and its light");
      if (index === 2) {
        assert(!source.scene && !light.scene && !cue.active, "taking removes the source and stops its stand wake before the held result");
        const held = f.s.heldBeaconSpark, bounds = paintedBounds(held);
        assertClose(bounds.bottom - bounds.top, 56, 0.1, "Wren holds a readable curl of the same painted fire");
        assertEqual([held.x, held.y], [1024, 730], "the curl sits beside the hand area below the hood");
        const reviewScale = 1250 / f.s.scale.width;
        assert((bounds.bottom - bounds.top) * reviewScale >= 34 && (bounds.right - bounds.left) * reviewScale >= 15,
          "the actual painted silhouette remains distinguishable at the native review width");
        assert(bounds.left > f.s.wrenContainer.x + 50 && bounds.top > f.s.wrenContainer.y - 160,
          "the visible curl clears the cloak edge and stays below the hood");
        assert(held.depth > 0 && held.alpha === 1, "the received flame draws above Wren at full opacity, independently of the dimmed source");
        f.s.takeBeaconSparkVisual();
        assertEqual(f.s.heldBeaconSpark, held, "repeating the presentation cannot duplicate the received spark");
      }
      assertEqual(f.state.satchel, [], "the source interaction does not award the later realm-clear relic early");
      assertEqual(f.acts(), 0, "each original held response still waits for Continue");
      f.next();
    }
    assertEqual(f.targets.length, 4, "no new typing action or timing gate was introduced");
    assertEqual([f.s.beaconFlameCue, f.s.heldBeaconSpark, f.acts()], [null, null, 1], "the original last Continue stows fire and reaches the same next act");
    const exit = f.tweens.findLast(tween => tween.targets === cue);
    assertEqual([exit.y, exit.duration], [792, 540], "the physical stand fades in place over the original departure duration");
    f.settle(exit);
    assert(!cue.scene, "the empty fixture leaves with its original cleanup");
  }
});

await suite("Sky beacon cleanup: leaving removes source light and received fire without retaining callbacks or duplicate props", () => {
  const f = fixture(), cue = f.s.beaconFlameCue;
  f.s.takeBeaconSparkVisual();
  const held = f.s.heldBeaconSpark;
  f.s.clearSkyForkCues();
  assert(!cue.scene && !held.scene, "the actual realm cleanup destroys both the physical fixture and held spark");
  assertEqual([f.s.beaconFlameCue, f.s.heldBeaconSpark], [null, null], "no stale prop references survive chapter reuse");
  f.s.clearSkyForkCues();
  f.s.beaconFlameCue = f.s.createBeaconFlameCue();
  assert(f.s.beaconFlameCue.getByName("beacon-spark")?.scene && f.s.beaconFlameCue.active, "a fresh entry reconstructs the original lit fixture");
});

function fork2Fixture(reduced = false, fork1 = "help-etta") {
  const f = fixture(reduced);
  f.s.clearSkyForkCues(); f.s.fork1Choice = fork1;
  return f;
}

function reloadFork2(f: ReturnType<typeof fixture>, reduced: boolean) {
  const restored = fork2Fixture(reduced, f.s.fork1Choice);
  restored.s.fork2Choice = f.s.fork2Choice;
  restored.s.resumeCheckpoint = JSON.parse(JSON.stringify(f.checkpoints.at(-1)));
  restored.s.resumeSky();
  return restored;
}

await suite("Sky final choice: painted subjects and connected tether clear unchanged words and Wren", () => {
  for (const reduced of [false, true]) for (const fork1 of ["help-etta", "steal-flame"]) {
    const f = fork2Fixture(reduced, fork1); f.s.startFork2();
    const spirit = f.s.fork2Scholar, beacon = f.s.beaconFlameCue, tether = f.s.fork2Tether;
    assert(spirit?.scene && beacon?.scene && tether?.scene, "the choice names an actual visible spirit, beacon and joining thread");
    assertEqual(f.targets.map(t => [t.word, t.x, t.y]), [["answer kindly", 776, 530], ["cut the tether", 1140, 530]], "original choice words sit directly above the actual subjects");
    assertEqual(f.anchors.map(a => a.options.sourceOffsetY), [-42, -95], "claim lines reach the visible spirit and actual tether endpoint");
    const body = paintedBounds(spirit.getByName("fading-scholar"), spirit);
    const base = paintedBounds(beacon.getByName("beacon-brazier"), beacon);
    assertClose(base.bottom, 792, 0.1, "the real alpha silhouette rests on the paving");
    assert(f.targets.every(target => target.y + 38 < Math.min(body.top, base.top, 581)), "complete command plates clear both painted subjects and Wren's highest hood");
    assertEqual(f.anchors.map(anchor => anchor.body), [spirit, beacon], "feedback belongs to the real visible subjects rather than empty choice markers");
    assert(body.right < 960 - 90 - 8 && base.left > 960 + 90 + 8, "both painted subjects clear Wren's full cloak lane");
    const points = tether.children[0].points;
    assert(points.length > 2 && points[0].x > body.left && points[0].x < body.right && points[0].y > body.top && points[0].y < body.bottom,
      "the continuous strand begins inside the actual painted spirit");
    assert(points.at(-1).x > base.left && points.at(-1).x < base.right && points.at(-1).y > base.top && points.at(-1).y < base.bottom,
      "the strand terminates on the actual painted masonry");
    assert(points.filter((p: any) => p.x >= 870 && p.x <= 1050).every((p: any) => p.y < 581 - 8), "the connected strand passes above Wren's breathing hood");
    for (const tween of [...f.tweens].filter(t => !t.killed)) f.settle(tween);
    assert(spirit.alpha > 0.5 && spirit.alpha < 1 && tether.alpha > 0.5, "the held choice has a readable translucent subject and thin strand");
    assertEqual([beacon.x, beacon.y, beacon.scaleX, beacon.scaleY], [1140, 792, 1, 1], "entrance and idle presentation never float or scale the physical beacon");
    assertEqual(Boolean(beacon.getByName("beacon-spark")), fork1 === "help-etta", "the earlier stolen spark is not recreated");
    const restored = reloadFork2(f, reduced);
    assert(restored.s.fork2Scholar?.scene && restored.s.fork2Tether?.scene, "actual fork2 reload reconstructs the same subject");
    assertEqual(restored.targets.map(t => [t.word, t.x, t.y]), f.targets.map(t => [t.word, t.x, t.y]), "reload retains both original choice targets");
    f.s.clearSkyForkCues(); restored.s.clearSkyForkCues();
    assert(!spirit.scene && !beacon.scene && !tether.scene && f.anchors.every(a => a.destroyed), "chapter cleanup removes all paintings, strand and word anchors");
  }
});

await suite("Sky final choice lifecycle: a late boss fade cannot remove the independent aftermath", () => {
  const f = fork2Fixture(), boss = f.prop(960, 400);
  f.s.bossContainer = boss; f.s.bossSprite = f.prop(0, 0);
  f.s.onBossDefeated();
  const dissolve = f.tweens.find(t => t.targets === boss && t.duration === 1200);
  f.timers.find(t => t.delay === 800).callback(); f.next();
  const spirit = f.s.fork2Scholar, beacon = f.s.beaconFlameCue, thread = f.s.fork2Tether;
  f.settle(dissolve);
  assert(!boss.scene && f.s.bossContainer === null && spirit.scene && beacon.scene && thread.scene, "fast original Continue survives the pending old-boss destruction callback");
  f.s.showFork2Cues();
  assertEqual([f.s.fork2Scholar, f.s.beaconFlameCue, f.s.fork2Tether], [spirit, beacon, thread], "showing an existing choice does not duplicate its subjects");
  f.s.clearSkyForkCues();
});

await suite("Sky final choice consequences: both earned branches and restored held results release only at the existing completion", () => {
  for (const reduced of [false, true]) for (const choice of ["answer kindly", "cut the tether"]) {
    const f = fork2Fixture(reduced); f.s.startFork2();
    f.targets.find(t => t.word === choice).onComplete();
    assert(f.s.fork2Scholar?.scene && f.s.fork2Tether?.scene, "choosing either route preserves the subject through its existing intro");
    f.next();
    const pending = reloadFork2(f, reduced);
    assert(pending.s.fork2Scholar?.scene && pending.s.fork2Tether?.scene && pending.targets.length === 1, "an acknowledged branch reload restores its live answer and physical subject");
    pending.s.clearSkyForkCues();
    const words = choice === "answer kindly" ? ["you kept the light"] : ["pull the thread", "the tether falls"];
    for (const [index, word] of words.entries()) {
      assertEqual(f.targets.at(-1).word, word, "the original exact phrase sequence remains unchanged");
      f.targets.at(-1).onComplete();
      const final = index === words.length - 1, restored = reloadFork2(f, reduced);
      assertEqual(Boolean(f.s.fork2Scholar || f.s.fork2Tether), !final, "only the completed answer or final cut releases the subject");
      assertEqual(Boolean(restored.s.fork2Scholar || restored.s.fork2Tether), !final, "restored final cut reading invokes the actual physical consequence immediately");
      assertEqual(restored.targets.length, 0, "a completed phrase restores its held response without repeating a word");
      assertEqual(f.moths(), 0, "the existing response still waits for Continue");
      restored.s.clearSkyForkCues(); f.next();
    }
    assertEqual([f.moths(), f.s.beaconFlameCue, f.state.satchel], [1, null, []], "the original last Continue clears the beacon and advances once without an early reward");
    const late = f.tweens.filter(t => t.duration === 540 && !t.killed);
    late.forEach(f.settle);
    f.s.clearSkyForkCues();
    assert(f.images.every(i => !i.scene), "settled branch departure and cleanup leave no painted subjects behind");
  }
});
