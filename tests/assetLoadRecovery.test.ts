import { EventEmitter } from "node:events";
import fs from "node:fs";
import { assert, assertEqual, suite } from "./_assert";
import { ASSET_LOAD_TIMEOUT_MS, assetLoadBlocked, beginAssetLoad } from "../src/game/assetLoadRecovery";

function fixture(key = "WinterMountainScene") {
  const load = new EventEmitter(), events = new EventEmitter();
  const textures = new Set<string>();
  const data = { store: { earned: "firefly", writes: 0 }, revisit: false, checkpoint: "lantern" };
  const deadlines: Array<{ work: () => void; delay: number; cancelled: boolean }> = [];
  const dialogs: Array<{ options: any; destroyed: boolean; busy: boolean; message: string }> = [];
  const restarts: unknown[] = [];
  let pauses = 0, gameplayStarts = 0;
  const scene: any = {
    load, events, textures: { exists: (name: string) => textures.has(name) },
    sys: { settings: { key, data }, pause() { pauses++; } },
    scene: { restart(value: unknown) { restarts.push(value); } },
  };
  const environment = {
    schedule(work: () => void, delay: number) {
      const timer = { work, delay, cancelled: false }; deadlines.push(timer);
      return () => { timer.cancelled = true; };
    },
    showDialog(options: any) {
      const dialog = { options, destroyed: false, busy: false, message: options.message }; dialogs.push(dialog);
      return { destroy() { dialog.destroyed = true; }, setBusy(value: boolean) { dialog.busy = value; }, setMessage(value: string) { dialog.message = value; } };
    },
  };
  const preload = () => beginAssetLoad(scene, environment);
  const create = () => {
    if (!assetLoadBlocked(scene)) { gameplayStarts++; data.store.writes++; }
    events.emit("create");
  };
  return { scene, load, events, textures, data, deadlines, dialogs, restarts, preload, create,
    get pauses() { return pauses; }, get gameplayStarts() { return gameplayStarts; } };
}

await suite("Asset recovery: healthy and fully cached artwork permits normal scene creation without a dialog", () => {
  for (const cached of [false, true]) {
    const f = fixture(); f.preload();
    if (!cached) { f.load.emit("addfile", "backdrop", "image"); f.load.emit("addfile", "portal", "spritesheet"); }
    f.load.emit("start"); f.textures.add("backdrop"); f.textures.add("portal"); f.load.emit("complete"); f.create();
    assertEqual([f.gameplayStarts, f.pauses, f.dialogs.length, f.data.store.writes], [1, 0, 0, 1], "successful/cached scenes retain their ordinary create path");
    assertEqual(f.deadlines[0]?.delay, ASSET_LOAD_TIMEOUT_MS, "loading is bounded independently of XHR/image decoding");
    assert(f.deadlines.every(t => t.cancelled), "successful completion cancels the deadline");
    f.events.emit("shutdown");
    assertEqual([f.load.listenerCount("loaderror"), f.load.listenerCount("addfile")], [0, 0], "scene shutdown releases loader listeners");
  }
});

await suite("Asset recovery: network failure blocks gameplay and writes, then deliberate retry preserves exact scene data", () => {
  const f = fixture(); f.preload(); f.load.emit("addfile", "winter-backdrop", "image"); f.load.emit("start");
  f.load.emit("loaderror", { type: "image", key: "winter-backdrop" });
  f.load.emit("complete"); f.create();
  assertEqual([f.gameplayStarts, f.data.store.writes, f.pauses, f.dialogs.length], [0, 0, 1, 1], "missing art never starts a partial world, timer or checkpoint write");
  assertEqual(f.restarts.length, 0, "retry is never automatic");
  const oldRetry = f.dialogs[0]!.options.actions[0].onSelect;
  oldRetry(); oldRetry();
  assertEqual(f.restarts, [f.data], "repeated activation queues exactly one restart with the same store/checkpoint object");
  assert(f.restarts[0] === f.data, "data identity and in-memory progress survive");
  assert(f.dialogs[0]!.busy, "retry disables its action while shutdown/restart is queued");
  f.events.emit("shutdown");
  assert(f.dialogs[0]!.destroyed, "restart removes the old overlay");
  oldRetry(); assertEqual(f.restarts.length, 1, "a stale click cannot restart a later scene");
  f.preload(); f.load.emit("addfile", "winter-backdrop", "image"); f.load.emit("start"); f.textures.add("winter-backdrop"); f.load.emit("complete"); f.create();
  assertEqual([f.gameplayStarts, f.data.store.earned], [1, "firefly"], "successful retry opens the same earned journey");
});

await suite("Asset recovery: missing decoded texture and spritesheet failures are caught even without loaderror", () => {
  for (const type of ["image", "spritesheet"]) {
    const f = fixture(); f.preload(); f.load.emit("addfile", "broken", type); f.load.emit("start"); f.load.emit("complete"); f.create();
    assertEqual([f.gameplayStarts, f.pauses, f.dialogs.length], [0, 1, 1], "decode/missing-cache failure cannot expose a placeholder scene");
    assert(f.deadlines.every(t => t.cancelled), "completed failure cannot retain a timer");
  }
});

await suite("Asset recovery: a stalled loader requires deliberate retry even if an old response arrives later", () => {
  const f = fixture(); f.preload(); f.load.emit("addfile", "waiting", "image"); f.load.emit("start");
  f.deadlines[0]!.work();
  assertEqual([assetLoadBlocked(f.scene), f.dialogs.length, f.restarts.length], [true, 1, 0], "hung preload exposes recovery without inventing completed gameplay");
  f.textures.add("waiting"); f.load.emit("complete"); f.create();
  assertEqual([f.gameplayStarts, f.pauses, f.dialogs.length], [0, 1, 1], "late load completion cannot silently dismiss recovery or start action behind it");
  f.events.emit("shutdown");
  f.deadlines[0]!.work(); f.load.emit("loaderror", { type: "image" });
  assertEqual(f.dialogs.length, 1, "late callbacks after shutdown have no UI effect");
});

await suite("Asset recovery: repeated failures replace their own gate and only current callbacks can act", () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    f.preload(); f.load.emit("addfile", "broken", "image"); f.load.emit("start"); f.load.emit("loaderror", { type: "image" }); f.load.emit("complete"); f.create();
    assertEqual(f.dialogs.length, i + 1, "each explicit attempt receives one recovery panel");
    f.dialogs[i]!.options.actions[0].onSelect(); f.events.emit("shutdown");
  }
  assertEqual([f.gameplayStarts, f.data.store.writes, f.restarts.length], [0, 0, 3], "repeated failure does not mutate the journey or auto-loop");
  assert(f.dialogs.every(d => d.destroyed), "no old overlays survive restarts");
  assert(f.deadlines.every(t => t.cancelled), "all failed attempts cancel their deadlines");
  assertEqual([f.events.listenerCount("create"), f.events.listenerCount("shutdown"), f.load.listenerCount("loaderror")], [0, 0, 0], "all gate listeners release after scene shutdown");
});

await suite("Asset recovery: restart detaches and aborts old network/decode work before the same loader is reused", () => {
  const f = fixture();
  let aborts = 0, removedSources = 0, lateCallbacks = 0;
  const stale = () => { lateCallbacks++; };
  const request: any = {
    readyState: 2, onload: stale, onerror: stale, onprogress: stale, ontimeout: stale, onabort: stale,
    abort() {
      aborts++;
      assertEqual([this.onload, this.onerror, this.onprogress, this.ontimeout, this.onabort], [null, null, null, null, null], "XHR callbacks are detached before abort itself can dispatch");
      this.onabort?.();
    },
  };
  const image: any = { src: "", onload: stale, onerror: stale, removeAttribute(name: string) {
    assertEqual([name, this.onload, this.onerror], ["src", null, null], "image decode callbacks are detached before its source is released");
    removedSources++; this.onerror?.();
  } };
  const file = { xhrLoader: request, data: image };
  f.preload(); f.load.emit("addfile", "pending", "image", f.load, file); f.load.emit("start");
  f.deadlines[0]!.work(); f.dialogs[0]!.options.actions[0].onSelect(); f.events.emit("shutdown");
  assertEqual([aborts, removedSources, lateCallbacks], [1, 1, 0], "old request/decode cancellation cannot feed a reused loader");
  f.preload(); f.load.emit("start"); f.load.emit("complete"); f.create();
  assertEqual([f.gameplayStarts, f.dialogs.length], [1, 1], "a new healthy attempt cannot inherit the old failure");
});

await suite("Asset recovery: partial success hands its image to the texture cache before another file stalls", () => {
  for (const emitsFileComplete of [true, false]) {
    const f = fixture();
    let cachedAborts = 0, sourceRemovals = 0, pendingAborts = 0;
    const image = { src: "painted-lanterns.png", onload: null, onerror: null, removeAttribute() { sourceRemovals++; } };
    const successful = { key: "painted", type: "image", state: 20,
      xhrLoader: { readyState: 4, abort() { cachedAborts++; } }, data: image };
    const waiting = { key: "waiting", type: "image", state: 11,
      xhrLoader: { readyState: 2, abort() { pendingAborts++; } }, data: null };
    f.preload();
    f.load.emit("addfile", "painted", "image", f.load, successful);
    f.load.emit("addfile", "waiting", "image", f.load, waiting);
    f.load.emit("start"); f.textures.add("painted");
    if (emitsFileComplete) f.load.emit("filecomplete", "painted", "image", image);
    f.deadlines[0]!.work(); f.dialogs[0]!.options.actions[0].onSelect(); f.events.emit("shutdown");
    assertEqual([cachedAborts, sourceRemovals, pendingAborts, image.src], [0, 0, 1, "painted-lanterns.png"], "cached art keeps its real image source while only the pending transport is cancelled");
    assertEqual(f.load.listenerCount("filecomplete"), 0, "ownership listener is released at shutdown");
  }
});

await suite("Asset recovery: every production scene gates its artwork before gameplay initialization", () => {
  const paths = fs.readdirSync("src/scenes").filter(name => name.endsWith("Scene.ts"));
  for (const name of paths) {
    const code = fs.readFileSync(`src/scenes/${name}`, "utf8");
    const preload = code.match(/preload\(\): void \{\s*([^\n]+)/)?.[1].trim();
    const create = code.match(/create\(\): void \{\s*([^\n]+)/)?.[1].trim();
    assertEqual(preload, "beginAssetLoad(this);", `${name} captures shared and direct loaders before artwork queues`);
    assertEqual(create, "if (assetLoadBlocked(this)) return;", `${name} blocks scene setup, input, timers and writes before missing artwork is used`);
  }
});
