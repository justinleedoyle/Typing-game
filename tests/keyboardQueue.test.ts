import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import ts from "typescript";
import { installKeyboardQueueDrain } from "../src/game/keyboardQueue";
import { TypingInputController } from "../src/game/typingInput";
import { assert, assertEqual, suite } from "./_assert";

// Run installed Phaser's unchanged native listeners, entire scene dispatcher
// and frame cleanup. Only renderer/DOM plumbing is replaced by a tiny target.
function method(path: string, name: string, globals: Record<string, unknown> = {}) {
  const url = new URL(path, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  let found: ts.PropertyAssignment | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === name && ts.isFunctionExpression(node.initializer)) found = node;
    if (!found) node.forEachChild(visit);
  };
  visit(source);
  if (!found) throw new Error(`Missing real Phaser method: ${name}`);
  const code = ts.transpileModule(`const fn = ${found.initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(globals), `${code}; return fn;`)(...Object.values(globals));
}
const startListeners = method("../node_modules/phaser/src/input/keyboard/KeyboardManager.js", "startListeners", { InputEvents: { MANAGER_PROCESS: "process" } });
const postUpdate = method("../node_modules/phaser/src/input/keyboard/KeyboardManager.js", "postUpdate");
const update = method("../node_modules/phaser/src/input/keyboard/KeyboardPlugin.js", "update", {
  KeyMap: { 16: "SHIFT", 18: "ALT", 27: "ESC", 32: "SPACE", 65: "A", 83: "S", 8: "BACKSPACE" },
  Events: { KEY_DOWN: "keydown-", ANY_KEY_DOWN: "keydown", KEY_UP: "keyup-", ANY_KEY_UP: "keyup" },
});
class Target {
  listeners: Array<{ name: string; fn: () => void; capture: boolean }> = [];
  addEventListener(name: string, fn: () => void, capture = false) { this.listeners.push({ name, fn, capture }); }
  removeEventListener(name: string, fn: () => void, capture = false) { this.listeners = this.listeners.filter(l => l.name !== name || l.fn !== fn || l.capture !== capture); }
  dispatch(event: any) {
    let stopped = false;
    event.stopNativePropagation = () => { stopped = true; };
    event.stopPropagation = event.stopImmediatePropagation = event.stopNativePropagation;
    for (const capture of [true, false]) for (const listener of [...this.listeners]) {
      if (listener.name === event.type && listener.capture === capture && !stopped) (listener.fn as any)(event);
    }
  }
}
function fixture(fix: boolean, count = 1) {
  const target = new Target(), process = new EventEmitter(), events = new EventEmitter();
  const manager = { queue: [] as any[], enabled: true, preventDefault: false, captures: [], target, manager: { events: process }, postUpdate };
  startListeners.call(manager);
  events.on("poststep", () => manager.postUpdate());
  const game = { input: { keyboard: manager }, events, isRunning: false };
  const traces: Array<Array<{ key: string; type: string; shift: boolean; alt: boolean }>> = [];
  const handlers: Array<((event: any) => void) | undefined> = [];
  const plugins = Array.from({ length: count }, (_, index) => {
    traces.push([]);
    const plugin = { manager, keys: [], isActive: () => true, emit(name: string, event: any) {
      if (name !== "keydown" && name !== "keyup") return;
      traces[index].push({ key: event.key, type: event.type, shift: event.shiftKey, alt: event.altKey });
      if (name === "keydown") handlers[index]?.(event);
    } };
    process.on("process", () => update.call(plugin));
    return plugin;
  });
  const cleanup = fix ? installKeyboardQueueDrain(game as any) : () => {};
  events.emit("ready"); game.isRunning = true;
  let stamp = 0;
  const dispatch = (key: string, type = "keydown", extra = {}) => {
    const event = { key, type, timeStamp: ++stamp, keyCode: key === "Shift" ? 16 : key === "Alt" ? 18 : key === "Escape" ? 27 : key === " " ? 32 : key.toUpperCase().charCodeAt(0),
      shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...extra };
    target.dispatch(event); return event;
  };
  return { game, target, manager, events, plugins, traces, handlers, dispatch, cleanup };
}

await suite("Keyboard queue: two real native key pairs before one frame no longer replay earlier letters", () => {
  const old = fixture(false);
  old.dispatch("s"); old.dispatch("s", "keyup"); old.dispatch("a"); old.dispatch("a", "keyup");
  assert(old.traces[0].filter(e => e.type === "keydown" && e.key === "s").length > 1, "unchanged Phaser actually reproduces replay before its frame cleanup");
  const f = fixture(true), stats: Record<string, { hits: number; misses: number }> = {};
  const input = new TypingInputController({ get: () => ({ difficulty: "standard" }), recordKeystroke(key: string, hit: boolean) {
    const stat = stats[key] ??= { hits: 0, misses: 0 }; if (hit) stat.hits++; else stat.misses++;
  } } as any);
  let position = 0;
  input.register({ remaining: () => "save".slice(position), isComplete: () => position === 4, advance() { position++; }, resetCursor() { position = 0; }, miss() {}, onClaim() {}, onRelease() {}, onComplete() {}, setDimmed() {} });
  f.handlers[0] = event => input.handleChar(event.key);
  f.dispatch("s"); f.dispatch("s", "keyup"); f.dispatch("a"); f.dispatch("a", "keyup");
  assertEqual(f.traces[0].map(e => `${e.type}:${e.key}`), ["keydown:s", "keyup:s", "keydown:a", "keyup:a"], "each exact native event reaches the scene once");
  assertEqual(stats, { s: { hits: 1, misses: 0 }, a: { hits: 1, misses: 0 } }, "the actual typing controller records exactly one hit per typed letter");
  assertEqual(position, 2, "fast input retains its intended prefix without bogus misses");
  assertEqual(f.manager.queue.length, 0, "the tail listener drains only after synchronous processing");
  f.events.emit("poststep"); assertEqual(f.manager.queue.length, 0, "normal frame cleanup remains installed and harmless");
});

await suite("Keyboard queue: all active scenes retain current-event order, modifiers, keyup and cancellation", () => {
  const f = fixture(true, 2);
  for (const [key, type, mods] of [["Shift", "keydown", { shiftKey: true }], ["A", "keydown", { shiftKey: true }], ["A", "keyup", { shiftKey: true }], ["Shift", "keyup", {}], ["Alt", "keydown", { altKey: true }], ["s", "keydown", { altKey: true }], ["Alt", "keyup", {}]] as const) f.dispatch(key, type, mods);
  assertEqual(f.traces[0], f.traces[1], "both active scenes receive each untouched native event before draining");
  assertEqual(f.traces[0].length, 7, "keyup and bare modifiers are neither replayed nor omitted");
  f.handlers[0] = event => { if (event.key === "Escape") event.stopPropagation(); };
  f.dispatch("Escape"); f.dispatch(" ");
  assertEqual(f.traces[1].at(-1)?.key, " ", "a cancelled Escape cannot swallow the following distinct event");
  assert(!f.traces[1].some(e => e.key === "Escape"), "Phaser's original cross-scene cancellation remains effective");
  f.handlers[0] = event => event.stopImmediatePropagation(); f.dispatch("x");
  assertEqual(f.traces[1].at(-1)?.key, "x", "scene-local cancellation still resets for the next scene");
});

await suite("Keyboard queue: stopped DOM propagation uses a post-dispatch fallback and destroy releases listeners", async () => {
  const f = fixture(false);
  f.target.addEventListener("keydown", ((event: any) => event.stopNativePropagation()) as any, false);
  const dispose = installKeyboardQueueDrain(f.game as any);
  assertEqual(installKeyboardQueueDrain(f.game as any), dispose, "repeated installation cannot add competing drain listeners");
  f.dispatch("s");
  assertEqual(f.traces[0].length, 1, "Phaser completed processing before the native stopper");
  assertEqual(f.manager.queue.length, 1, "the stopped tail has not cleared from inside scene dispatch");
  await Promise.resolve();
  assertEqual(f.manager.queue.length, 0, "microtask fallback drains after the entire dispatch stack");
  f.events.emit("destroy");
  assertEqual(f.target.listeners.length, 3, "only Phaser's two original listeners and the fixture stopper remain");
  f.dispatch("a"); f.events.emit("destroy"); await Promise.resolve();
  assert(f.manager.queue.length > 0, "disposed fallback cannot mutate the old manager later");
  const pending = fixture(false); pending.game.isRunning = false;
  installKeyboardQueueDrain(pending.game as any); pending.events.emit("destroy"); pending.events.emit("ready");
  assertEqual(pending.target.listeners.length, 2, "destroy before READY prevents late attachment");
});
