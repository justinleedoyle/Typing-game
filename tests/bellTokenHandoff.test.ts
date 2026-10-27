import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Run the production branch, passage callbacks, handoff and shutdown cleanup.
// Only Phaser's drawing/clock are inert; reward and reading flow are not copied.
const url = new URL("../src/scenes/SunkenBellScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "preload", "startFork2FreeAurland", "runFreePassageChain", "readThen",
  "showAurlandToken", "clearAurlandToken", "hideAurland", "onKeyDown", "clearActiveTargets"];
let shutdown: ts.ArrowFunction | undefined;
const create = owner.members.find(member => member.name?.getText(source) === "create")!;
function findShutdown(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "this.events.once" &&
      node.arguments[0]?.getText(source).endsWith(".SHUTDOWN") && ts.isArrowFunction(node.arguments[1])) {
    shutdown = node.arguments[1];
  }
  ts.forEachChild(node, findShutdown);
}
findShutdown(create);
assert(shutdown, "the actual Bell create method installs shutdown cleanup");
const code = ts.transpileModule(`class Bell {
  ${names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
  shutdownFixture() ${shutdown!.body.getText(source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const livingUrl = new URL("../src/game/livingScene.ts", import.meta.url);
const living = ts.createSourceFile(livingUrl.pathname, readFileSync(livingUrl, "utf8"), ts.ScriptTarget.Latest, true);
const fade = living.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "fadeOutStagedSprite")!;
const fadeCode = ts.transpileModule(fade.getText(living).replace(/^export\s+/, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const fadeOutStagedSprite = new Function(`${fadeCode}; return fadeOutStagedSprite;`)();
const noop = () => {};

function fixture(reduced = false) {
  const events: string[] = [], images: any[] = [], tweens: any[] = [], targets: any[] = [];
  const typed: string[] = [];
  const captions: string[] = [], loaded: Array<[string, string]> = [];
  let next: (() => void) | null = null, fish = 0;
  function node(x: number, y: number, key: string): any {
    return { x, y, key, width: 124, height: 256, scene: true, scaleX: 1, scaleY: 1,
      setDepth(depth: number) { this.depth = depth; return this; },
      setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; },
      setPosition(px: number, py: number) { this.x = px; this.y = py; return this; },
      getData() { return undefined; },
      destroy() { this.scene = undefined; events.push("destroy:" + key); },
    };
  }
  const globals: Record<string, unknown> = {
    reducedMotion: () => reduced, resolveRealmFork: () => null,
    isPuristToggleKey: () => false, togglePuristMode: noop,
    playClack: () => events.push("clack"),
    playChime: noop, playWrenFocus: noop, playWrenAction: noop,
    playActorAttention: noop, playBodyImpact: noop, BELL_BURST_COLOR: 0x4ab8d6,
    applySceneActorLighting: (_scene: unknown, image: any) => { image.lit = true; },
    fadeOutStagedSprite, preloadSatchelIcons: noop, preloadWren: noop,
  };
  for (const name of ["sunkenBellBackdrop", "naveDoorway", "naveDoorLeaves", "bellGhostSprite", "bellWardenSprite", "olinSprite",
    "aurlandSprite", "glassFishSprite", "snowFoxSprite", "runaPortrait"]) globals[name] = name;
  globals.tridentTokenSprite = "art/relics/trident-token.png";
  const Bell = new Function(...Object.keys(globals), `${code}; return Bell;`)(...Object.values(globals));
  const scene = new Bell();
  const state = { satchel: [] as string[], almanacLore: [] as string[],
    realms: { "sunken-bell": { cleared: false, choices: {} } } };
  const wren = { x: 960, y: 820, scene: true, children: [] as any[],
    add(child: any) {
      if (!this.children.includes(child)) this.children.push(child);
      child.parentContainer = this; events.push("at-hand");
    },
  };
  Object.assign(scene, {
    store: { get: () => state, update: (edit: (save: typeof state) => void) => edit(state) },
    commitFork: (_fork: string, requested: string) => requested,
    load: { image: (key: string, value: string) => loaded.push([key, value]) },
    breath: { reset: noop }, beatPhase: "free", activeTargets: [], descentLanterns: [],
    reading: {
      show(callback: () => void) {
        assert(!next, "the actual story never overwrites an unread card");
        if (scene.aurlandBindingPending) events.push("reading-installed-before-unlock");
        next = callback;
      },
      handleKey(event: KeyboardEvent) {
        if (!next || event.key === "Escape") return false;
        event.preventDefault();
        if (event.key === " " || event.key === "Enter") continueReading();
        return true;
      },
      destroy() { next = null; },
    },
    narration: { replay: noop }, band: { setObjective: noop },
    setNarrator: (text: string) => captions.push(text), setStoryObjective: noop,
    showAurland() { scene.aurlandImage = node(660, 760, "aurland"); },
    fadeOutForkCue: noop, clearAurlandWordAnchors: noop, clearBellForkCues: noop,
    clearBossWordAnchors: noop, clearOlinWordAnchors: noop, clearGlassFishWordAnchors: noop,
    clearForkChoiceWordAnchors: noop, clearDescentLanternWordAnchors: noop,
    clearRhythmPractice: noop, dismissRevisitMemoryCue: noop,
    typingInput: { reset: noop, unregister: noop, handleChar: (key: string) => typed.push(key) }, beatClock: { stop: noop },
    input: { keyboard: { off: noop } },
    bellPassageWordPosition: () => ({ x: 1100, y: 520 }),
    makeAurlandWord(options: any) { options.destroy = noop; targets.push(options); return options; },
    registerActiveTarget(target: any) { scene.activeTargets.push(target); },
    add: { image(x: number, y: number, key: string) { const image = node(x, y, key); images.push(image); return image; } },
    tweens: {
      add(options: any) { tweens.push(options); return options; },
      killTweensOf(body: any) { events.push("kill:" + body.key); },
    },
    wrenContainer: wren,
    startGlassFishGate() {
      assert(!scene.aurlandToken, "the hand token leaves before the fish gate"); fish += 1;
    },
  });
  function continueReading() {
    const callback = next; next = null; assert(callback, "Continue needs a real reading gate"); callback!();
  }
  function reachFinalBinding() {
    scene.startFork2FreeAurland();
    assertEqual(state.satchel, [], "opening the fork does not grant its rewards early");
    continueReading();
    for (const word of ["break the silence", "you are remembered", "swim free king"]) {
      const target = targets.at(-1)!;
      assertEqual(target.word, word, "the original three binding targets remain in order");
      if (word === "swim free king") return target;
      target.onAdvance(word.length, word.length);
      target.onComplete();
      continueReading();
    }
  }
  function completeBinding() {
    const target = reachFinalBinding();
    target.onAdvance(target.word.length, target.word.length);
    target.onComplete();
  }
  function finish(tween: any) {
    for (const key of ["x", "y", "alpha"]) if (typeof tween[key] === "number") tween.targets[key] = tween[key];
    tween.onComplete?.();
  }
  return { scene, state, wren, images, tweens, events, targets, typed, loaded, captions,
    completeBinding, reachFinalBinding, continueReading, finish, hasGate: () => next !== null, fish: () => fish };
}

await suite("Bell token: final-letter fade consumes early input until the original reading gate exists", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    const target = f.reachFinalBinding();
    const length = target.word.length;
    assert(!f.scene.aurlandBindingPending, "earlier binding targets retain their normal input flow");
    target.onAdvance(length - 1, length);
    f.scene.onKeyDown({ key: "g" });
    assertEqual(f.typed, ["g"], "the incomplete final phrase still accepts ordinary typing");
    f.typed.length = 0;
    target.onAdvance(length, length);
    assert(f.scene.aurlandBindingPending && !f.hasGate(), "the matched final letter protects the pre-callback completion fade");
    assertEqual(f.state.satchel, [], "the input guard does not move the original reward timing");
    const clacks = f.events.filter(event => event === "clack").length;
    for (const key of [" ", "x", "Backspace", "Enter"]) {
      let prevented = false;
      f.scene.onKeyDown({ key, preventDefault() { prevented = true; } });
      assert(prevented, "early " + JSON.stringify(key) + " is consumed during completion");
    }
    assertEqual(f.typed, [], "no early key reaches the typing controller and counts a miss");
    assertEqual(f.events.filter(event => event === "clack").length, clacks, "pending input adds no misleading typing sound");
    let paused = false;
    f.scene.chapterMenu = { handleKey(event: KeyboardEvent) { paused = event.key === "Escape"; return paused; } };
    f.scene.onKeyDown({ key: "Escape" });
    assert(paused, "pause routing remains available ahead of the pending guard");
    target.onComplete();
    assert(f.hasGate() && !f.scene.aurlandBindingPending, "the original reward reading owns input as soon as it is installed");
    assert(f.events.includes("reading-installed-before-unlock"), "the completion guard lasts until reading.show installs its callback");
    assertEqual(f.state.satchel, ["king-aurland", "trident-token"], "the original completion still grants exactly its rewards");
    f.scene.onKeyDown({ key: " ", preventDefault: noop });
    assertEqual(f.fish(), 1, "deliberate Continue does not wait for the decorative token transfer");
    assertEqual(f.typed, [], "Continue is handled by reading rather than the typing controller");
  }
});

await suite("Bell token: cancelling targets, shutdown and scene reuse clear the completion guard", () => {
  const f = fixture();
  let target = f.reachFinalBinding();
  target.onAdvance(target.word.length, target.word.length);
  f.scene.clearActiveTargets();
  assert(!f.scene.aurlandBindingPending, "cancelling active targets cannot leave Bell input blocked");
  target = f.reachFinalBinding();
  target.onAdvance(target.word.length, target.word.length);
  f.scene.shutdownFixture();
  assert(!f.scene.aurlandBindingPending, "actual shutdown clears the pre-callback guard");
  f.scene.aurlandBindingPending = true;
  f.scene.init({ store: f.scene.store });
  assert(!f.scene.aurlandBindingPending, "scene initialization cannot inherit a former binding's pending state");
});

await suite("Bell token: actual binding rewards, visible giver-to-hand action and original Continue flow", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.scene.preload();
    assert(f.loaded.some(([key, source]) => key === "bell-trident-token" && source === "art/relics/trident-token.png"),
      "a fresh Bell journey preloads the accepted painted token before it is earned");
    f.completeBinding();
    assertEqual(f.state.satchel, ["king-aurland", "trident-token"], "both rewards arrive at their original final binding completion");
    assertEqual(f.state.almanacLore, ["king-auriands-promise"], "the existing saved lore ID remains unchanged");
    assert(f.hasGate() && f.fish() === 0, "the original reward acknowledgment is held immediately, with no extra gate");
    assert(f.captions.at(-1)!.includes("presses a trident token into your hand"), "the accepted handoff caption remains intact");
    const token = f.scene.aurlandToken;
    assertEqual(token.key, "bell-trident-token", "the world handoff uses the painted token");
    assertEqual(Math.max(token.width, token.height) * token.scaleY, 64, "the keepsake has a consistent handheld size");
    assert(token.lit, "the painted gift shares the Bell's scene lighting");
    if (!reduced) {
      assertEqual([token.x, token.y], [704, 610], "the gift begins at Aurland's near hand");
      assert(f.scene.aurlandImage?.scene, "the king remains until the token reaches Wren");
      const transfer = f.tweens.find(tween => tween.targets === token)!;
      assertEqual([transfer.x, transfer.y, transfer.duration], [998, 702, 650], "one decorative transfer reaches the existing Wren hand lane");
      f.finish(transfer);
    } else assert(!f.tweens.some(tween => tween.targets === token), "reduced motion has no token travel or delayed handoff");
    assertEqual([token.parentContainer, token.x, token.y], [f.wren, 38, -118], "the settled gift belongs to Wren and follows the body's idle movement");
    const departure = f.tweens.find(tween => tween.targets.key === "aurland")!;
    assert(departure, "the original freedom departure begins only after receiving the gift");
    assertEqual(departure.duration, reduced ? 0 : 1000, "reduced motion removes the departure wait; normal freedom keeps its original fade");
    assert(f.hasGate(), "finishing the animation cannot advance or overwrite the reward card");
    f.continueReading();
    assertEqual(f.fish(), 1, "one original Continue enters the actual companion gate");
    assert(!token.scene && !f.scene.aurlandToken, "the token clears when the response is dismissed");
    assert(f.events.indexOf("kill:bell-trident-token") < f.events.indexOf("destroy:bell-trident-token"), "cleanup cancels animation before destroying its prop");
  }
});

await suite("Bell token: early Continue, replacement, actual shutdown and restart reject stale transfer callbacks", () => {
  const f = fixture();
  f.completeBinding();
  const oldToken = f.scene.aurlandToken;
  const oldTransfer = f.tweens.find(tween => tween.targets === oldToken)!;
  f.continueReading();
  assertEqual(f.fish(), 1, "Continue during travel still progresses immediately through the existing gate");
  assert(!oldToken.scene && !f.scene.aurlandImage, "early Continue removes the in-flight gift and begins the king's departure");
  f.scene.showAurland();
  const nextKing = f.scene.aurlandImage;
  oldTransfer.onComplete();
  assertEqual(f.scene.aurlandImage, nextKing, "an interrupted old transfer cannot dismiss a later king");
  f.scene.showAurlandToken();
  const replaced = f.scene.aurlandToken;
  const replacementTransfer = f.tweens.find(tween => tween.targets === replaced)!;
  f.scene.showAurlandToken();
  assert(!replaced.scene, "a repeated presentation replaces its old gift without duplicating it");
  const latest = f.scene.aurlandToken;
  replacementTransfer.onComplete();
  assertEqual(f.scene.aurlandToken, latest, "the replaced callback cannot alter the latest gift");
  assertEqual(f.scene.aurlandImage, nextKing, "the replaced callback cannot depart the current giver");
  const latestTransfer = f.tweens.find(tween => tween.targets === latest)!;
  f.scene.shutdownFixture();
  assert(!latest.scene && !f.scene.aurlandToken, "actual scene shutdown cancels and destroys the in-flight gift");
  assert(!nextKing.scene && !f.scene.aurlandImage, "actual scene shutdown destroys the still-present giver");
  f.scene.init({ store: f.scene.store });
  f.scene.showAurland();
  const restartedKing = f.scene.aurlandImage;
  latestTransfer.onComplete();
  assertEqual(f.scene.aurlandImage, restartedKing, "old completion after scene reuse cannot depart the new king");
  assert(!f.scene.aurlandToken, "restart does not reconstruct a prior journey's gift");
});
