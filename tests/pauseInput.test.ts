import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import ts from "typescript";
import { navigationAction } from "../src/game/ui/navigationPolicy";
import { decideBeatGate } from "../src/game/beatGate";
import { assert, assertEqual, suite } from "./_assert";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  return ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
}
function find<T extends ts.Node>(node: ts.Node, predicate: (child: ts.Node) => child is T): T {
  if (predicate(node)) return node;
  let match: T | undefined;
  node.forEachChild(child => { if (!match) { try { match = find(child, predicate); } catch {} } });
  if (!match) throw new Error("Missing production input method");
  return match;
}
function compile(code: string, result: string, globals: Record<string, unknown> = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(globals), `${js}; return ${result};`)(...Object.values(globals));
}

const pauseSource = source("../src/game/ui/pauseMenu.ts");
const pauseClass = pauseSource.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "ChapterPauseMenu") as ts.ClassDeclaration;
const create = pauseClass.members.find(member => member.name?.getText(pauseSource) === "create")!;
const keyDeclaration = find(create, (node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) && node.name.getText(pauseSource) === "onKey");
const bindPauseKey = compile(`function bind() { return ${keyDeclaration.initializer!.getText(pauseSource)}; }`, "bind", { ROW_COUNT: 7 });
const resume = pauseClass.members.find(member => member.name?.getText(pauseSource) === "resume")!;
const Pause = compile(`class Pause { ${resume.getText(pauseSource)} }`, "Pause");
const install = pauseSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "installChapterMenu")!;
const installMenu = compile(install.getText(pauseSource).replace(/^export /, ""), "installChapterMenu", {
  installPresentation() {}, installTweenPauseClock: () => () => {}, navigationAction, localSaveNotice: () => null,
  KEY: "ChapterPauseMenu", ChapterPauseMenu: class {}, SERIF: "serif", UI_CSS: {},
  Phaser: { Core: { Events: { BLUR: "blur", HIDDEN: "hidden" } }, Scenes: { Events: { POST_UPDATE: "postupdate" } } },
});
const bellSource = source("../src/scenes/SunkenBellScene.ts");
const bellClass = bellSource.statements.find(ts.isClassDeclaration)!;
const bellKey = bellClass.members.find(member => member.name?.getText(bellSource) === "onKeyDown")!;
const Bell = compile(`class Bell { ${bellKey.getText(bellSource)} }`, "Bell", {
  isPuristToggleKey: () => false, decideBeatGate, playClack() {},
});

// Use Phaser's installed dispatcher unchanged: it replaces propagation methods
// on queued native events and processes each active scene in registration order.
const keyboardSource = source("../node_modules/phaser/src/input/keyboard/KeyboardPlugin.js");
const update = find(keyboardSource, (node): node is ts.PropertyAssignment =>
  ts.isPropertyAssignment(node) && node.name.getText(keyboardSource) === "update" && ts.isFunctionExpression(node.initializer));
const keyboardUpdate = compile(`const update = ${update.initializer.getText(keyboardSource)};`, "update", {
  KeyMap: { 27: "ESC", 13: "ENTER", 32: "SPACE" },
  Events: { KEY_DOWN: "keydown-", ANY_KEY_DOWN: "keydown", KEY_UP: "keyup-", ANY_KEY_UP: "keyup" },
});

function phaserMethod(path: string, name: string, globals: Record<string, unknown> = {}) {
  const owner = source(path);
  const method = find(owner, (node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) &&
    node.name.getText(owner) === name && ts.isFunctionExpression(node.initializer));
  return compile(`const method = ${method.initializer.getText(owner)};`, "method", globals);
}
const require = createRequire(import.meta.url);
const sceneConstants = require("phaser/src/scene/const.js");
const systemPause = phaserMethod("../node_modules/phaser/src/scene/Systems.js", "pause", {
  Events: { PAUSE: "pause" }, CONST: sceneConstants,
});
const pluginPause = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "pause");
const pluginLaunch = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "launch");
const queueOp = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "queueOp");

function text(value = "") {
  return { text: value, updates: 0, setOrigin() { return this; }, setDepth() { return this; }, setVisible() { return this; },
    setText(value: string) { this.text = value; this.updates++; return this; }, destroy() {} };
}
function fixture(escapeHint?: () => string) {
  const state = { ownerActive: false, pauseActive: true, launches: 0, ownerDispatches: 0, flushes: 0, claim: false, claimReads: 0 };
  const sceneEvents = new EventEmitter();
  const gameEvents = new EventEmitter();
  const texts: ReturnType<typeof text>[] = [];
  const typed: string[] = [];
  const store = { flush: () => { state.flushes += 1; return Promise.resolve(); }, getLastError: () => null };
  const owner = new Bell();
  let pause: any;
  Object.assign(owner, {
    scene: {
      get: () => ({}), isActive: (key?: string) => key === "ChapterPauseMenu" ? state.pauseActive : state.ownerActive,
      pause: () => { state.ownerActive = false; }, resume: () => { state.ownerActive = true; },
      launch: () => { state.pauseActive = true; state.launches += 1; pause.openedAt = pause.time.now; }, bringToTop() {},
      stop: () => { state.pauseActive = false; },
    },
    sys: { pause: () => { state.ownerActive = false; } },
    game: { events: gameEvents }, events: sceneEvents,
    add: { text: (_x: number, _y: number, value: string) => { const result = text(value); texts.push(result); return result; } }, time: { addEvent: () => ({ remove() {} }) },
    reading: { handleKey: () => false }, typingInput: { handleChar: (key: string) => typed.push(key) }, beatPhase: "free",
  });
  owner.chapterMenu = installMenu(owner, { store, escapeHint, hasClaim: () => { state.claimReads++; return state.claim; }, onLeave() {} });
  pause = new Pause();
  Object.assign(pause, {
    config: { store, owner }, time: { now: 1000 }, openedAt: 0, busy: false, canResolve: false, selected: 0,
    scene: { stop: () => { state.pauseActive = false; } },
    activate: () => pause.resume(),
  });
  const onPauseKey = bindPauseKey.call(pause);
  const makePlugin = (isActive: () => boolean, handler: (event: any) => void) => ({
    keys: [], manager: { queue: [] as any[] }, isActive,
    emit: (name: string, event: any) => { if (name === "keydown") handler(event); },
    update: keyboardUpdate,
  });
  const pausePlugin = makePlugin(() => state.pauseActive, onPauseKey);
  const ownerPlugin = makePlugin(() => state.ownerActive, event => {
    state.ownerDispatches += 1;
    owner.onKeyDown(event);
  });
  let stamp = 0;
  const dispatch = (key: string, order: "pause-first" | "owner-first", extra: Record<string, unknown> = {}) => {
    const event = { key, keyCode: key === "Escape" ? 27 : key === "Enter" ? 13 : 32,
      type: "keydown", timeStamp: ++stamp, repeat: false, ctrlKey: false, metaKey: false, altKey: false,
      prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    pausePlugin.manager.queue = ownerPlugin.manager.queue = [event];
    const plugins = order === "pause-first" ? [pausePlugin, ownerPlugin] : [ownerPlugin, pausePlugin];
    plugins.forEach(plugin => plugin.update());
    return event;
  };
  return { owner, state, typed, pause, dispatch, sceneEvents, gameEvents, texts, menu: owner.chapterMenu };
}

await suite("pause interruption: hidden-only and blur events preserve one explicit pause until deliberate resume", () => {
  for (const first of ["hidden", "blur"]) {
    const f = fixture();
    f.state.ownerActive = true; f.state.pauseActive = false;
    f.gameEvents.emit(first);
    assert(!f.state.ownerActive && f.state.pauseActive, `${first} stops the owner even without the other event`);
    assertEqual(f.state.launches, 1, "one interruption opens one overlay");
    f.gameEvents.emit(first === "hidden" ? "blur" : "hidden");
    assertEqual(f.state.launches, 1, "paired browser events cannot duplicate the menu");
    f.gameEvents.emit("visible"); f.gameEvents.emit("focus");
    assert(!f.state.ownerActive && f.state.pauseActive, "returning to the tab never resumes combat automatically");
    assertEqual(f.typed, [], "interruption cannot inject gameplay characters");
    f.pause.time.now += 200;
    f.dispatch("Escape", "pause-first");
    assert(f.state.ownerActive && !f.state.pauseActive, "a deliberate resume retains the ordinary menu input guard");
    f.sceneEvents.emit("shutdown");
    assertEqual([f.gameEvents.listenerCount("hidden"), f.gameEvents.listenerCount("blur")], [0, 0], "shutdown removes both interruption listeners");
    f.gameEvents.emit(first);
    assertEqual(f.state.launches, 1, "a stopped chapter cannot open a stale pause overlay");
  }
});

await suite("pause interruption: installed Phaser queuing cannot delay the freeze or duplicate a hidden-tab overlay", () => {
  const f = fixture();
  f.state.pauseActive = false;
  const settings = { key: "chapter", status: sceneConstants.RUNNING, active: true };
  const manager = { _queue: [] as Array<{ op: string; keyA: string }>, queueOp };
  Object.assign(f.owner.scene, { key: "chapter", manager, pause: pluginPause, launch: pluginLaunch,
    isActive: (key?: string) => key === "ChapterPauseMenu" ? false : settings.active,
  });
  f.owner.sys = { settings, events: f.sceneEvents, getStatus: () => settings.status, pause: systemPause };
  let pauses = 0;
  f.sceneEvents.on("pause", () => pauses++);
  // Use the actual ScenePlugin once to establish its queued semantics. The
  // hidden-tab fix must not rely on a frame arriving to process this queue.
  f.owner.scene.pause();
  assert(settings.active && manager._queue.length === 1, "the installed plugin really defers its pause");
  manager._queue.length = 0;
  f.gameEvents.emit("hidden");
  assert(!settings.active && settings.status === sceneConstants.PAUSED, "the installed Systems freezes immediately, before the next frame");
  assertEqual(pauses, 1, "the clock receives the pause timestamp during hiding");
  assertEqual(manager._queue.map(operation => operation.op), ["start"], "only the menu launch waits for the renderer");
  f.gameEvents.emit("blur"); f.gameEvents.emit("hidden");
  assertEqual([pauses, manager._queue.length], [1, 1], "paired events before any frame cannot queue a second overlay");
  f.menu.destroy();
});

await suite("pause hint: follows the actual next Escape action and releases its scene listener", () => {
  const f = fixture();
  const hint = f.texts[0]!;
  assertEqual(f.state.claimReads, 0, "installation does not read an uninitialized typing controller");
  assertEqual(hint.text, "Esc · pause", "idle hint matches the normal pause action");
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.updates, 0, "unchanged frames do not rerender the hint");
  f.state.claim = true;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · release word", "active typing explains the cancellation action");
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.updates, 1, "a stable claimed word does not rerender each frame");
  f.state.claim = false;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · pause", "release restores the normal pause hint");
  f.sceneEvents.emit("shutdown");
  assertEqual(f.sceneEvents.listenerCount("postupdate"), 0, "scene shutdown removes the hint listener");
  f.menu.destroy();
  f.state.claim = true;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.updates, 2, "destroyed hints cannot receive stale updates");
});

await suite("pause hint: room navigation stays truthful and typing cancellation takes priority", () => {
  let zone = "shelf";
  const f = fixture(() => zone === "portals" ? "Esc · pause" : "Esc · portals");
  const hint = f.texts[0]!;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · portals", "a room station names its actual back destination");
  f.state.claim = true;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · release word", "a partial command releases before leaving its station");
  f.state.claim = false;
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · portals", "cancelled typing restores the station's back hint");
  zone = "portals";
  f.sceneEvents.emit("postupdate");
  assertEqual(hint.text, "Esc · pause", "the portal area retains normal pause guidance");
  f.menu.destroy();
});

await suite("pause input: Escape, Enter and Space resume once in either Phaser scene dispatch order", () => {
  for (const order of ["pause-first", "owner-first"] as const) for (const key of ["Escape", "Enter", " "]) {
    const f = fixture();
    const event = f.dispatch(key, order);
    assert(f.state.ownerActive && !f.state.pauseActive, `${order}/${key}: gameplay resumes without reopening the pause`);
    assertEqual(f.state.launches, 0, "the closing event cannot launch the pause menu again");
    assertEqual(f.state.ownerDispatches, 0, "a resume key cannot also advance narration or count as gameplay input");
    assertEqual(f.typed, [], "resuming cannot introduce a stray typed space or Escape");
    assertEqual(f.state.flushes, 1, "the existing nonblocking save flush still runs once");
    assert(event.prevented, "menu keyboard actions still prevent browser defaults");
  }
});

await suite("pause input: opening guards, repeats, modifiers and typing cancellation retain their meaning", () => {
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    const f = fixture();
    f.dispatch("Escape", "pause-first", extra);
    assert(!f.state.ownerActive && f.state.pauseActive, "repeat or browser-modified Escape cannot resume");
    assertEqual(f.state.flushes, 0, "ignored input cannot initiate a save/resume");
  }
  const guarded = fixture();
  guarded.pause.openedAt = guarded.pause.time.now;
  guarded.dispatch("Escape", "pause-first");
  assert(!guarded.state.ownerActive && guarded.state.pauseActive, "the opening Escape still respects the existing180ms guard");

  const typing = fixture();
  typing.state.ownerActive = true; typing.state.pauseActive = false; typing.state.claim = true;
  typing.dispatch("Escape", "owner-first");
  assertEqual(typing.typed, ["Escape"], "Escape first releases the active word through the actual scene handler");
  assertEqual(typing.state.launches, 0, "cancelling a claim cannot pause in that same key");
  typing.state.claim = false;
  typing.dispatch("Escape", "owner-first");
  assertEqual(typing.state.launches, 1, "a fresh Escape with idle typing still opens pause normally");
  assert(!typing.state.ownerActive && typing.state.pauseActive, "the opening Escape cannot immediately close its new menu");
  typing.pause.time.now += 200;
  typing.dispatch("Escape", "pause-first");
  assert(typing.state.ownerActive && !typing.state.pauseActive, "the next deliberate Escape cleanly resumes that menu");
  assertEqual(typing.state.launches, 1, "the resume event never reopens the newly paused chapter");
});
