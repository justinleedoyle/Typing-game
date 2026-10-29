import { DesktopSaveBackend, createDesktopCloseHandler } from "../src/game/desktopBackend";
import type { DesktopBridge, DesktopSaveReply } from "../src/game/desktopBridge";
import { emptySave, LocalSaveConflictError, SaveStore, UnsupportedSaveVersionError } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

await suite("Desktop renderer bridge: real stores wait for durable writes and each adapter opens a distinct session", async () => {
  let serial = 0, release: (() => void) | undefined;
  const requests: Array<{ token: string; operation: string }> = [];
  const persisted = new Map<string, string>();
  const bridge: DesktopBridge = {
    version: 1, platform: "win32", async openSaveSession() { return `session-${++serial}`; },
    async requestSave(token, operation, payload): Promise<DesktopSaveReply> {
      requests.push({ token, operation });
      if (operation === "save") { await new Promise<void>(done => { release = done; }); persisted.set(token, JSON.stringify(payload)); }
      return { ok: true, value: operation === "load" ? null : undefined, conflict: null };
    }, onCloseRequest() { return () => {}; }, finishClose() {},
  };
  const first = new DesktopSaveBackend(bridge), second = new DesktopSaveBackend(bridge);
  const a = await SaveStore.load(first), b = await SaveStore.load(second);
  assertEqual(requests, [{ token: "session-1", operation: "load" }, { token: "session-2", operation: "load" }], "old and new Title stores never share a device-writer baseline");
  a.update(s => { s.profileName = "Durable desktop journey"; });
  let closed = false;
  const flush = a.flush().then(() => { closed = true; });
  while (!release) await Promise.resolve();
  assert(!closed && persisted.size === 0, "flush cannot acknowledge before the main process commits the write");
  release(); await flush;
  assertEqual(JSON.parse(persisted.get("session-1")!).profileName, "Durable desktop journey", "actual SaveStore progress reaches the main-process channel");
  assert(b.get().runId !== a.get().runId, "new blank stores retain distinct run identity");
});

await suite("Desktop renderer bridge: structured errors retain device-choice and newer-version recovery semantics", async () => {
  const local = emptySave("Blocked window"), cloud = emptySave("Saved device");
  let reply: DesktopSaveReply = { ok: false, conflict: { kind: "device", local, cloud }, error: { name: "LocalSaveConflictError", message: "Both journeys kept" } };
  const bridge: DesktopBridge = { version: 1, platform: "win32", async openSaveSession() { return "one"; }, async requestSave() { return reply; }, onCloseRequest() { return () => {}; }, finishClose() {} };
  const backend = new DesktopSaveBackend(bridge);
  let conflict: unknown; try { await backend.load(); } catch (e) { conflict = e; }
  assert(conflict instanceof LocalSaveConflictError, "IPC error retains its actual conflict class for Title handling");
  assertEqual(backend.getConflict()?.kind, "device", "the synchronous conflict probe reads the most recent reply");
  const copy = backend.getConflict()!; copy.local.profileName = "Changed UI copy";
  assertEqual(backend.getConflict()!.local.profileName, "Blocked window", "UI cannot mutate cached recovery alternatives");
  reply = { ok: false, conflict: null, error: { name: "UnsupportedSaveVersionError", message: "Newer", version: 99 } };
  let future: unknown; try { await backend.load(); } catch (e) { future = e; }
  assert(future instanceof UnsupportedSaveVersionError && future.version === 99, "future save version crosses the bridge without becoming generic corruption");
  assertEqual(backend.getConflict(), null, "old choices do not leak into a later failure");
});

await suite("Desktop close: freeze precedes debounced flush, and acknowledgement waits for the real durable store", async () => {
  let frozen = false, resumed = false, release: (() => void) | undefined;
  const replies: unknown[] = [], disk: string[] = [];
  const store = new SaveStore({ async load() { return null; }, async save(state) {
    assert(frozen, "input and scene progression freeze before the snapshot is written");
    await new Promise<void>(done => { release = done; }); disk.push(state.profileName);
  } }, emptySave(), { saveDelayMs: 60_000 });
  store.update(state => { state.profileName = "Last unflushed change"; });
  const close = createDesktopCloseHandler({
    bridge: { finishClose(id, saved) { replies.push([id, saved]); } }, store: () => store,
    freeze() { frozen = true; return () => { resumed = true; }; }, waitForWrites: async () => {},
    showDialog() { return { destroy() {}, setMessage() {}, setBusy() {} }; },
  });
  close(7); close(7);
  while (!release) await Promise.resolve();
  assertEqual(replies, [], "duplicate OS close events cannot acknowledge an in-flight save early");
  assertEqual(disk, [], "a debounced write is awaited rather than discarded at exit");
  release();
  while (!replies.length) await Promise.resolve();
  assertEqual([disk, replies, resumed], [["Last unflushed change"], [[7, true]], false], "latest progress commits once before close, while gameplay stays frozen");
});

await suite("Desktop close: failed saving stays frozen with retry, and only Keep playing resumes gameplay", async () => {
  let fail = true, frozen = 0, resumed = 0, model: any;
  const replies: unknown[] = [];
  const store = new SaveStore({ async load() { return null; }, async save() { if (fail) throw new Error("Device full"); } }, emptySave(), { saveDelayMs: 60_000 });
  store.update(state => { state.profileName = "Unsaved desktop journey"; });
  const close = createDesktopCloseHandler({ bridge: { finishClose(id, saved) { replies.push([id, saved]); } },
    store: () => store, waitForWrites: async () => {}, freeze() { frozen++; return () => { resumed++; }; },
    showDialog(options) { model = options; return { destroy() {}, setMessage() {}, setBusy() {} }; },
  });
  close(1);
  while (model.actions.length !== 2) await Promise.resolve();
  assertEqual([replies, frozen, resumed], [[], 1, 0], "failed close does not discard data or resume the world behind its dialog");
  model.actions[0].onSelect();
  assertEqual([replies, resumed], [[[1, false]], 1], "Keep playing cancels host close and restores the prior active scenes");
  close(2);
  while (model.actions.length !== 2) await Promise.resolve();
  fail = false; model.actions[1].onSelect();
  while (replies.length < 2) await Promise.resolve();
  assertEqual([replies, frozen, resumed], [[[1, false], [2, true]], 2, 1], "retry drains the same retained progress and never briefly resumes gameplay");
});
