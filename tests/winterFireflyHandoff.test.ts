import { readFileSync } from "node:fs";
import ts from "typescript";
import { checkpointIndex, committedWinterChoices } from "../src/game/chapterFlow";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { SessionStats } from "../src/game/sessionStats";
import { assert, assertEqual, suite } from "./_assert";

// Run the production branch, phrase reactions and prop movement. Rendering
// objects are inert; the earned checkpoints roundtrip through real SaveStore.
const url = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["checkpoint", "savedStageData", "hasSavedPassage", "startFireflyBranch", "showFireflyCue",
  "showFireflyHollow", "receiveFireflyLanternVisual", "clearFireflyLantern", "dismissFireflyCue", "clearWinterForkCues",
  "presentWinterPassageReaction", "runPassageChain", "winterPassageOwnerBinding", "winterPassageWordPosition", "winterForkChoiceWordPosition", "makeWinterForkWord", "clearForkChoiceWordAnchors"];
const constants = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const code = ts.transpileModule(`${constants}\nclass Winter {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const globals = {
  checkpointIndex, committedWinterChoices,
  PALETTE_HEX: { frost: 1, brass: 2 },
  Phaser: { Math: { Clamp: (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value)) }, GameObjects: { Events: { DESTROY: "destroy" } } },
  reducedMotion: (scene: any) => scene.store.get().reducedMotion, satchelIconFor: (id: string) => ({ key: `almanac-icon-${id}` }),
  addLocalGroundShadow: () => display(), addContainerWake: noop, addIdleBreath: noop,
  decorativeTween: noop, applySceneActorLighting: (_scene: unknown, item: any) => { item.lit = true; },
  playWrenAction: noop, playWrenFocus: noop, playBodyImpact: noop,
  playClaimLine: (scene: any, ...points: any[]) => scene.claimLines.push(points),
  playBodyTypePulse: (scene: any, body: any, options: any) => scene.pulses.push({ body, ...options }),
  attachWordBodyAnchor: (scene: any, body: any, _position: unknown, options: any) => {
    const anchor = { body, ...options, destroyed: false, destroy() { this.destroyed = true; } };
    scene.anchors.push(anchor); return anchor;
  },
};
const Winter = new Function(...Object.keys(globals), `${code}; return Winter;`)(...Object.values(globals));
const dimensions = Object.fromEntries([
  ["winter-fallen-pine", "../art/winter/fallen-pine.png"],
  ["almanac-icon-firefly-lantern", "../art/relics/firefly-lantern.png"],
].map(([key, path]) => {
  const png = readFileSync(new URL(path, import.meta.url));
  return [key, { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }];
}));
function display(x = 0, y = 0, key = ""): any {
  const destroyHooks: Array<() => void> = [];
  const item: any = { x, y, key, scene: true, name: "", parentContainer: null, children: [], ...dimensions?.[key],
    setName(value: string) { this.name = value; return this; }, setDepth(value: number) { this.depth = value; return this; },
    setOrigin(...value: number[]) { this.origin = value; return this; }, setScale(value: number) { this.scale = value; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }, setAlpha(value: number) { this.alpha = value; return this; },
    add(child: any) { this.children.push(child); child.parentContainer = this; return this; },
    remove(child: any) { this.children.splice(this.children.indexOf(child), 1); child.parentContainer = null; },
    getByName(name: string) { return this.children.find((child: any) => child.name === name); },
    once(_event: string, next: () => void) { destroyHooks.push(next); return this; },
    fillStyle() { return this; }, fillEllipse() { return this; }, fillCircle() { return this; },
    lineStyle() { return this; }, strokeEllipse() { return this; },
    destroy() { this.scene = false; for (const next of destroyHooks.splice(0)) next(); for (const child of this.children) child.destroy(); this.children = []; },
  };
  return item;
}
const stores: SaveStore[] = [];
function fixture(initial: SaveState = emptySave()) {
  initial.typewriterAwakened = true;
  let persisted: SaveState | null = null;
  const store = new SaveStore({ load: async () => initial, save: async state => { persisted = structuredClone(state); } }, initial, { saveDelayMs: 60_000 });
  stores.push(store);
  const scene = new Winter(), images: any[] = [], tweens: any[] = [], timers: any[] = [], captions: string[] = [], objectives: string[] = [], waves: number[] = [];
  const stats = new SessionStats();
  let gate: (() => void) | null = null, target: any = null;
  Object.assign(scene, {
    store, typingInput: { getStats: () => stats }, resumeCheckpoint: initial.checkpoint,
    candles: 3, foxDecided: true, foxSpared: true, fork1Choice: null, fork2Choice: null,
    fireflyCue: null, fireflyLanternSprite: null, scale: { width: 1920, height: 1080 },
    forkChoiceWordAnchors: [], anchors: [], pulses: [], claimLines: [],
    wrenContainer: display(960, 842), wrenSprite: display(), textures: { exists: () => true },
    add: { container: display, graphics: () => display(),
      image(x: number, y: number, key: string) { const image = display(x, y, key); images.push(image); return image; },
      existing(image: any) { assertEqual(image.parentContainer, null, "the lantern leaves the tree before entering the scene"); },
    },
    tweens: { add(options: any) { tweens.push(options); return options; },
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; } },
    time: { delayedCall(ms: number, next: () => void) { timers.push({ ms, next }); } },
    band: { setObjective: (text: string) => objectives.push(text) }, narration: { say: (text: string) => captions.push(text), bottom: () => store.get().textScale === "large" ? 430 : 300 }, setNarrator: (text: string) => captions.push(text),
    readThen(next: () => void) { assert(!gate, "the original response retains one held Continue"); gate = next; },
    clearActiveTargets() { target = null; }, registerActiveTarget(value: any) { target = value; },
    makeWord: (options: any) => ({ ...options, getAnchorX: () => options.x, getAnchorY: () => options.y }),
    fadeOutHuntress: noop, clearHuntressHorn: noop, clearHeldPelt: noop,
    startWave: (index: number) => waves.push(index),
  });
  return { scene, store, captions, objectives, images, tweens, timers, waves, target: () => target, gate: () => gate,
    continue() { assert(gate, "the native Continue is held"); const next = gate!; gate = null; next(); },
    async reload() { await store.flush(); return fixture(persisted!); },
  };
}

await suite("Winter fireflies: the first earned response reveals a grounded hollow and its real lantern", async () => {
  const f = fixture(); f.scene.startFireflyBranch(2);
  assertEqual(f.images.length, 0, "the first story card keeps only its trail of lights");
  f.continue();
  assertEqual(f.target().word, "follow the lights", "the original first phrase stays exact");
  assertEqual([f.target().x, f.target().y], [1330, 650], "the original follow phrase stays over the actual loose fireflies, clear of Wren");
  const looseLights = f.scene.fireflyCue;
  f.target().onComplete();
  assert(!looseLights.scene, "loose floating fireflies retire when they enter the paper lantern");
  const tree = f.scene.fireflyCue.getByName("winter-firefly-tree"), lantern = f.scene.fireflyLanternSprite;
  assert(tree.lit && lantern.lit, "both existing paintings share the chapter lighting");
  assertEqual([tree.key, lantern.key], ["winter-fallen-pine", "almanac-icon-firefly-lantern"], "the hollow reuses accepted winter wood and paper-lantern art");
  assertEqual([f.scene.fireflyCue.x, f.scene.fireflyCue.y, lantern.parentContainer], [1330, 790, f.scene.fireflyCue], "the lantern waits inside a stationary tree at the original choice anchor");
  assert(!f.tweens.some(tween => tween.targets === f.scene.fireflyCue), "the hollow cannot inherit the fireflies' floating entrance or idle bob");
  assert(f.gate() && f.captions.at(-1)!.includes("hollow tree"), "the unchanged hollow-tree response is held with its physical subject visible");
  assertEqual(f.store.get().satchel, [], "the new visual cannot award the relic early");
  const restored = await f.reload(); restored.scene.startFireflyBranch(2);
  assert(restored.gate() && restored.scene.fireflyLanternSprite.parentContainer === restored.scene.fireflyCue, "the actual earned first response restores the waiting lantern");
  restored.continue();
  assertEqual(restored.target().word, "take the lantern", "one original Continue reaches the second phrase");
  assertEqual([restored.target().x, restored.target().y], [1250, 650], "the restored take phrase follows the actual hollow80px left of the tree owner");
  const anchor = restored.scene.anchors.at(-1);
  assertEqual([anchor.body, anchor.sourceOffsetX, anchor.sourceOffsetY], [restored.scene.fireflyCue, -80, -4], "the actual word tether meets the lantern in its hollow");
  restored.target().onClaim({ spell: false, alt: false }); restored.target().onAdvance(1, 16);
  assertEqual(restored.scene.claimLines.at(-1).slice(2, 4), [1250, 786], "the native claim connection terminates at the real hollow instead of empty tree center");
  assertEqual([restored.scene.pulses.at(-1).offsetX, restored.scene.pulses.at(-1).offsetY], [-80, -4], "typing feedback shares the same physical hollow anchor");
});

await suite("Winter firefly passages: large dialogue preserves subject alignment and its narration clearance", () => {
  const save = emptySave(); save.textScale = "large";
  const f = fixture(save); f.scene.startFireflyBranch(2); f.continue();
  assertEqual([f.target().x, f.target().y], [f.scene.fireflyCue.x, 650], "large-dialogue follow input uses its actual firefly owner");
  f.target().onComplete(); f.continue();
  assertEqual([f.target().x, f.target().y], [f.scene.fireflyCue.x - 80, 650], "large-dialogue taking input stays above the real hollow");
  for (const target of [f.target()]) {
    assert(target.y - 36 > f.scene.narration.bottom() + 24, "the complete phrase clears the larger narration card");
    const halfWidth = target.word.length * target.fontSize * 0.6 / 2 + 24;
    assert(target.x - halfWidth > f.scene.wrenContainer.x + 90, "the entire take phrase clears Wren's hood");
  }
});

await suite("Winter fireflies: taking and reloading carry the same lantern and leave the hollow empty", async () => {
  const f = fixture(); f.scene.startFireflyBranch(2); f.continue(); f.target().onComplete(); f.continue();
  const lantern = f.scene.fireflyLanternSprite, hollow = f.scene.fireflyCue;
  f.target().onComplete();
  assertEqual([f.scene.fireflyLanternSprite, lantern.parentContainer, lantern.x, lantern.y, lantern.depth], [lantern, null, 1014, 722, 61], "the same lantern is removed from the hollow and placed in Wren's hand");
  assert(!hollow.children.includes(lantern), "the taken lantern cannot remain duplicated in the hollow");
  assertEqual(f.images.filter(image => image.key === "almanac-icon-firefly-lantern").length, 1, "taking reuses one physical painting");
  assert(f.gate() && f.captions.at(-1)!.includes("in your hands"), "the original carried-lantern acknowledgment has no added wait");
  const restored = await f.reload(); restored.scene.startFireflyBranch(2);
  assertEqual([restored.scene.fireflyLanternSprite.parentContainer, restored.scene.fireflyLanternSprite.x, restored.scene.fireflyLanternSprite.y], [null, 1014, 722], "the actual held second response restores empty tree and carried lantern");
  restored.continue();
  assertEqual(restored.timers.map(timer => timer.ms), [900], "Continue retains the original post-passage delay");
  restored.timers.shift().next();
  assertEqual(restored.waves, [2], "the original callback continues to the final pack");
  assertEqual(restored.scene.fireflyLanternSprite, null, "the held lantern stows when the branch ends");
  assertEqual(restored.store.get().satchel, [], "the original realm ending still owns the reward");
  f.scene.clearWinterForkCues();
  assert(!lantern.scene && !hollow.scene, "scene cleanup releases both held art and the planted tree");
});

await suite("Winter firefly task: each live phrase names the current action after normal or saved Continue", async () => {
  for (const reducedMotion of [false, true]) {
    const initial = emptySave(); initial.reducedMotion = reducedMotion;
    const f = fixture(initial); f.scene.startFireflyBranch(2); f.continue();
    assertEqual(f.objectives.at(-1), `Type ${f.target().word}.`, "the first live task names the visible follow phrase");
    f.target().onComplete();
    const restored = await f.reload(); restored.scene.startFireflyBranch(2);
    assert(restored.gate() && !restored.target(), "restoring the earned response preserves its original reading gate");
    for (const active of [f, restored]) {
      active.continue();
      assertEqual(active.target().word, "take the lantern", "the native next phrase is unchanged");
      assertEqual(active.objectives.at(-1), `Type ${active.target().word}.`, "taking the lantern never retains the earlier following task");
      assertEqual(active.store.get().satchel, [], "task updates cannot award the branch's keepsake");
    }
    const live = await restored.reload(); live.scene.startFireflyBranch(2);
    assertEqual([live.target().word, live.objectives.at(-1)], ["take the lantern", "Type take the lantern."], "restoring the live second phrase restores its matching task without an extra Continue");
  }
});

await Promise.all(stores.map(store => store.flush()));
