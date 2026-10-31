import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import ts from "typescript";
import { navigationAction } from "../src/game/ui/navigationPolicy";
import { decideBeatGate } from "../src/game/beatGate";
import { acknowledgeGameInterruption, installGameInterruptionTracker, needsInterruptionPause } from "../src/game/sceneInterruption";
import { SceneRunGuard } from "../src/game/sceneRunGuard";
import { parseDevTarget } from "../src/game/devUnlock";
import { titleCheckpoint, titleHomecoming } from "../src/game/titleResume";
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
const leave = pauseClass.members.find(member => member.name?.getText(pauseSource) === "leave")!;
const chooseSave = pauseClass.members.find(member => member.name?.getText(pauseSource) === "chooseSave")!;
class TestCloudSaveError extends Error {}
class TestSaveConflictError extends Error {}
const Pause = compile(`class Pause { ${resume.getText(pauseSource)} ${leave.getText(pauseSource)} ${chooseSave.getText(pauseSource)} }`, "Pause", {
  acknowledgeGameInterruption, KEY: "ChapterPauseMenu", CloudSaveError: TestCloudSaveError, SaveConflictError: TestSaveConflictError, rememberLocalSaveNotice() {},
});
const install = pauseSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "installChapterMenu")!;
const installMenu = compile(install.getText(pauseSource).replace(/^export /, ""), "installChapterMenu", {
  installPresentation() {}, installTweenPauseClock: () => () => {}, needsInterruptionPause, navigationAction, localSaveNotice: () => null,
  KEY: "ChapterPauseMenu", ChapterPauseMenu: class {}, SERIF: "serif", UI_CSS: {},
  Phaser: { Core: { Events: { BLUR: "blur", HIDDEN: "hidden" } }, Scenes: { Events: { POST_UPDATE: "postupdate", CREATE: "create" } } },
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
const systemResume = phaserMethod("../node_modules/phaser/src/scene/Systems.js", "resume", {
  Events: { RESUME: "resume" }, CONST: sceneConstants,
});
const systemShutdown = phaserMethod("../node_modules/phaser/src/scene/Systems.js", "shutdown", {
  Events: { SHUTDOWN: "shutdown", TRANSITION_INIT: "transitioninit", TRANSITION_START: "transitionstart",
    TRANSITION_COMPLETE: "transitioncomplete", TRANSITION_OUT: "transitionout" }, CONST: sceneConstants,
});
const pluginPause = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "pause");
const pluginResume = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "resume");
const pluginStop = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "stop");
const pluginLaunch = phaserMethod("../node_modules/phaser/src/scene/ScenePlugin.js", "launch");
const queueOp = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "queueOp");
const managerCreate = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "create", {
  Events: { CREATE: "create", TRANSITION_START: "transitionstart" }, CONST: sceneConstants,
});
const managerLoadComplete = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "loadComplete");
const managerProcessQueue = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "processQueue");
const managerResume = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "resume");
const managerStop = phaserMethod("../node_modules/phaser/src/scene/SceneManager.js", "stop", {
  CONST: sceneConstants, LoaderEvents: { COMPLETE: "complete" },
});
const mainSource = source("../src/main.ts");
const preBoot = find(mainSource, (node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText(mainSource) === "preBoot");
const bootTracker = compile(`const boot = ${preBoot.initializer.getText(mainSource)};`, "boot", { installGameInterruptionTracker });
const titleSource = source("../src/scenes/TitleScene.ts");
const titleClass = titleSource.statements.find(ts.isClassDeclaration)!;
const titleTransition = titleClass.members.find(member => member.name?.getText(titleSource) === "beginTransition")!;
const Title = compile(`class Title { ${titleTransition.getText(titleSource)} }`, "Title", {
  parseDevTarget, titleCheckpoint, titleHomecoming, location: { search: "" },
  Phaser: { Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade" } } } },
});
const hubSource = source("../src/scenes/PortalChamberScene.ts");
const hubClass = hubSource.statements.find(ts.isClassDeclaration)!;
const hubCreate = hubClass.members.find(member => member.name?.getText(hubSource) === "create")!;
const FreshHub = compile(`class Hub { ${hubCreate.getText(hubSource)} }`, "Hub", {
  assetLoadBlocked: () => false,
  installChapterMenu() { throw new Error("A redirect cannot install an orphan chapter menu"); },
});

function loadingChapter(game: any) {
  const events = new EventEmitter();
  const settings = { key: "WinterMountainScene", status: sceneConstants.LOADING, active: true, isTransition: false };
  const launches: Array<{ key: string; data: any }> = [];
  let flushes = 0;
  const owner: any = {
    game, events, time: { addEvent: () => ({ remove() {} }) }, add: { text: (_x: number, _y: number, value: string) => text(value) },
    sys: { settings, events, getStatus: () => settings.status, pause: systemPause },
    scene: { get: () => ({}), isActive: (key?: string) => key === "ChapterPauseMenu" ? false : settings.active,
      launch(key: string, data: any) { launches.push({ key, data }); }, bringToTop() {}, stop() {},
    },
    create() {
      this.menu = installMenu(this, { hasClaim: () => false, onLeave() {},
        store: { getLastError: () => null, flush() { flushes++; return Promise.resolve(); } },
      });
    },
  };
  const manager = { create: managerCreate, loadComplete: managerLoadComplete };
  return { owner, settings, events, launches, get flushes() { return flushes; },
    finishLoading() { manager.loadComplete({ scene: owner }); },
  };
}

function withHidden(hidden: boolean, work: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden } });
  try { work(); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else delete (globalThis as unknown as { document?: Document }).document;
  }
}

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
      key: "chapter", manager: { resume: () => { state.ownerActive = true; } },
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
    scene: { stop: () => { state.pauseActive = false; }, manager: { stop: () => { state.pauseActive = false; } } },
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

function queuedFixture() {
  const f = fixture();
  const EngineEmitter = require("eventemitter3");
  const overlayEvents = new EngineEmitter();
  const ownerSettings = { key: "chapter", status: sceneConstants.PAUSED, active: false, visible: true };
  const overlaySettings = { key: "ChapterPauseMenu", status: sceneConstants.RUNNING, active: true, visible: true };
  const lifecycle: string[] = [];
  const overlay = { sys: { settings: overlaySettings, events: overlayEvents, shutdown: systemShutdown, isTransitioning: () => false } };
  const manager = { _pending: [], _queue: [] as Array<{ op: string; keyA: string }>, queueOp,
    processQueue: managerProcessQueue, resume: managerResume, stop: managerStop,
    getScene(key: string) { return key === "ChapterPauseMenu" ? overlay : f.owner; },
    // Starting renderer-owned overlay content is inert; queue processing and
    // owner/menu stop/resume lifecycles remain the installed Phaser methods.
    start(key: string, data: any) {
      assertEqual(key, "ChapterPauseMenu", "a fresh interruption requests the ordinary pause scene");
      overlaySettings.status = sceneConstants.RUNNING; overlaySettings.active = true;
      f.state.launches++;
      f.pause.config = data; f.pause.openedAt = f.pause.time.now;
    },
  };
  Object.defineProperties(f.state, {
    ownerActive: { get: () => ownerSettings.active, set: value => { ownerSettings.active = value; } },
    pauseActive: { get: () => overlaySettings.active, set: value => { overlaySettings.active = value; } },
  });
  f.owner.sys = { settings: ownerSettings, events: f.sceneEvents, getStatus: () => ownerSettings.status,
    pause: systemPause, resume: systemResume };
  Object.assign(f.owner.scene, { manager, resume: pluginResume, launch: pluginLaunch });
  Object.assign(f.pause.scene, { key: "ChapterPauseMenu", manager, stop: pluginStop });
  overlayEvents.on("shutdown", () => lifecycle.push("stop-menu"));
  f.sceneEvents.on("resume", () => lifecycle.push("resume-owner"));
  bootTracker(f.owner.game);
  return { ...f, manager, lifecycle, ownerSettings, overlaySettings };
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

await suite("pause interruption: native Resume closes synchronously so a subsequent blur cannot race its queued activation", () => {
  const control = queuedFixture();
  // Reproduce the former sequence using the unmodified installed plugin and
  // queue methods. The second blur arrives before either queued action runs.
  control.owner.scene.resume(); control.pause.scene.stop();
  control.gameEvents.emit("blur"); control.manager.processQueue();
  assert(control.state.ownerActive && !control.state.pauseActive && needsInterruptionPause(control.owner.game),
    "the unchanged engine reproduces an unacknowledged interruption racing a queued resume");
  control.menu.destroy(); control.gameEvents.emit("destroy");

  for (const order of ["pause-first", "owner-first"] as const) for (const key of ["Escape", "Enter", " "]) {
    const f = queuedFixture();
    f.gameEvents.emit("hidden");
    f.dispatch(key, order);
    assertEqual(f.lifecycle, ["stop-menu", "resume-owner"], "the actual manager completes stop then resume in the native key action");
    assert(f.state.ownerActive && !f.state.pauseActive, "the key leaves no deferred owner activation behind");
    assertEqual(f.manager._queue, [], "Resume queues neither an old resume nor an old overlay stop");
    assertEqual([f.state.ownerDispatches, f.typed], [0, []], "the installed KeyboardPlugin cannot replay the Resume key into the newly active owner");
    assert(!needsInterruptionPause(f.owner.game), "the deliberate key acknowledges the original interruption");
    f.gameEvents.emit("blur"); f.gameEvents.emit("hidden");
    assert(!f.state.ownerActive && !f.state.pauseActive, "a new blur immediately freezes the active owner before any frame");
    assertEqual(f.manager._queue.map(operation => operation.op), ["start"], "paired interruption events queue one fresh overlay, with no stale stop");
    f.manager.processQueue();
    assert(!f.state.ownerActive && f.state.pauseActive, "the installed queue opens the replacement overlay while the owner stays paused");
    assertEqual([f.state.launches, f.pause.config.owner], [1, f.owner], "the replacement belongs to the same current owner exactly once");
    f.gameEvents.emit("visible"); f.gameEvents.emit("focus");
    assert(needsInterruptionPause(f.owner.game), "returning cannot acknowledge that later interruption");
    f.pause.time.now += 200;
    f.dispatch("Escape", order);
    assert(f.state.ownerActive && !f.state.pauseActive && !needsInterruptionPause(f.owner.game), "a second deliberate native key resumes the replacement normally");
    assertEqual(f.state.ownerDispatches, 0, "replacement Resume also cannot leak into gameplay");
    f.menu.destroy(); f.gameEvents.emit("destroy");
  }
});

await suite("pause interruption: artwork finishing after an earlier hide pauses at the installed engine CREATE boundary", () => {
  for (const hiddenAtCompletion of [true, false]) withHidden(hiddenAtCompletion, () => {
    const game: any = { events: new EventEmitter(), loop: { inFocus: true }, hasFocus: false };
    bootTracker(game);
    game.events.emit("hidden"); game.events.emit("blur");
    // Focus may already have returned by the time a slow loader completes.
    game.events.emit("visible"); game.events.emit("focus");
    const f = loadingChapter(game);
    f.finishLoading();
    assertEqual([f.settings.status, f.settings.active], [sceneConstants.PAUSED, false], "CREATE runs after Phaser's final RUNNING assignment, so the pause persists");
    assertEqual(f.launches.map(launch => launch.key), ["ChapterPauseMenu"], "the scene missed no earlier interruption and opens exactly one pause");
    assertEqual(f.flushes, 1, "late creation preserves the ordinary interruption save flush");
    assertEqual(f.events.listenerCount("create"), 0, "the one-shot creation check releases itself");
    f.owner.menu.destroy(); game.events.emit("destroy");
  });
  withHidden(false, () => {
    const game: any = { events: new EventEmitter(), loop: { inFocus: true }, hasFocus: false };
    bootTracker(game);
    const f = loadingChapter(game);
    f.finishLoading();
    assertEqual([f.settings.status, f.settings.active, f.launches.length], [sceneConstants.RUNNING, true, 0], "Game.hasFocus's false startup default cannot pause an uninterrupted focused journey");
    f.owner.menu.destroy(); game.events.emit("destroy");
  });
  for (const cause of ["already-hidden", "already-blurred"]) withHidden(cause === "already-hidden", () => {
    const game: any = { events: new EventEmitter(), loop: { inFocus: cause !== "already-blurred" } };
    const f = loadingChapter(game);
    f.finishLoading();
    assertEqual([f.settings.active, f.launches.length], [false, 1], "current visibility and loop focus also protect a scene without a prior event");
    f.owner.menu.destroy();
  });
});

await suite("pause interruption: a real Title save await cannot lose its earlier interruption when the next scene loads visibly", async () => {
  const game: any = { events: new EventEmitter(), loop: { inFocus: true } };
  bootTracker(game);
  const chapter = loadingChapter(game);
  const run = new SceneRunGuard(); run.begin();
  const timers: Array<() => void> = [], entered: string[] = [];
  let resolve!: (value: unknown) => void;
  const title = new Title();
  Object.assign(title, { run, storePromise: new Promise(done => { resolve = done; }),
    playTitleDepartureWake() {},
    time: { delayedCall(_ms: number, next: () => void) { timers.push(next); } },
    cameras: { main: { fadeOut() {}, once(_event: string, next: () => void) { timers.push(next); } } },
    scene: { start(key: string) { entered.push(key); chapter.finishLoading(); } },
  });
  const transition = title.beginTransition();
  game.events.emit("blur"); game.events.emit("hidden");
  game.events.emit("visible"); game.events.emit("focus");
  resolve({ get: () => ({ typewriterAwakened: true, realms: {}, checkpoint: { scene: "WinterMountainScene", step: "wave", data: {} } }) });
  await transition;
  while (timers.length) timers.shift()!();
  assertEqual(entered, ["WinterMountainScene"], "the actual Title method still chooses the same saved encounter");
  assertEqual([chapter.settings.active, chapter.launches.length], [false, 1], "returning before the promise settled cannot expose live combat");
  chapter.owner.menu.destroy(); game.events.emit("destroy");
});

await suite("pause interruption: the actual fresh hub redirect cannot leave a pause overlay owned by its stopped scene", () => {
  const game: any = { events: new EventEmitter(), loop: { inFocus: true } };
  bootTracker(game); game.events.emit("hidden"); game.events.emit("focus");
  const events = new EventEmitter();
  const queued: Array<{ key: string; data: any }> = [];
  const hub = new FreshHub();
  Object.assign(hub, { game, events, store: { get: () => ({ typewriterAwakened: false }) },
    sys: { settings: { status: sceneConstants.LOADING, active: true, isTransition: false }, events },
    scene: { start(key: string, data: any) { queued.push({ key, data }); } },
  });
  const manager = { create: managerCreate, loadComplete: managerLoadComplete };
  manager.loadComplete({ scene: hub });
  assertEqual(queued.map(operation => operation.key), ["OpeningScene"], "a fresh hub creates only its original Opening redirect");
  assertEqual(events.listenerCount("create"), 0, "the transient hub owns no deferred pause guard");
  const opening = loadingChapter(game);
  opening.settings.key = "OpeningScene";
  opening.finishLoading();
  assertEqual([opening.settings.active, opening.launches.length], [false, 1], "the actual destination inherits exactly one pending pause");
  assertEqual(opening.launches[0].data.owner, opening.owner, "the pause belongs to the live Opening, never the redirected hub");
  opening.owner.menu.destroy(); game.events.emit("destroy");
});

await suite("pause interruption: deliberate actions acknowledge before saving so a later blur survives the awaited leave", async () => {
  const game: any = { events: new EventEmitter(), loop: { inFocus: true } };
  bootTracker(game); game.events.emit("hidden");
  const f = fixture();
  f.owner.game = game;
  f.pause.resume();
  assert(!needsInterruptionPause(game), "ordinary Resume acknowledges the pending interruption");
  game.events.emit("blur");
  const run = new SceneRunGuard(); run.begin();
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  let entered = 0;
  Object.assign(f.pause, { run, message: { setText() {} }, config: { owner: f.owner,
    store: { flush: () => pending }, onLeave() { entered++; },
  } });
  const leaving = f.pause.leave();
  assert(!needsInterruptionPause(game), "Leave acknowledges at the deliberate action before awaiting its write");
  game.events.emit("hidden"); game.events.emit("visible"); game.events.emit("focus");
  resolve(); await leaving;
  assertEqual(entered, 1, "the existing durable leave completes once");
  assert(needsInterruptionPause(game), "a new interruption during the save cannot be acknowledged by the later completion");
  const next = loadingChapter(game); next.finishLoading();
  assertEqual([next.settings.active, next.launches.length], [false, 1], "the next scene respects the interruption that happened during saving");
  next.owner.menu.destroy();
  const interrupted = fixture();
  interrupted.owner.game = game;
  let titleStarts = 0;
  interrupted.owner.scene.start = () => titleStarts++;
  interrupted.pause.chooseSave();
  assertEqual(titleStarts, 1, "the explicit choose-save action still opens Title");
  assert(!needsInterruptionPause(game), "choosing a save also acknowledges the action deliberately");
  f.menu.destroy(); interrupted.menu.destroy(); game.events.emit("destroy");
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
  assertEqual(f.sceneEvents.listenerCount("create"), 0, "shutdown also removes an unconsumed creation-time interruption guard");
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
