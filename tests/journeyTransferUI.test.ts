import { showJourneyTransfer } from "../src/game/journeyTransferUI";
import { emptySave, SaveConflictError, type SaveBackend, type SaveImportPreview } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

function fixture(options: { native?: boolean; current?: boolean } = {}) {
  let model: any, imported = 0, closed = 0, writes = 0, reads = 0, exports = 0;
  const current = options.current ? emptySave("Current desktop") : null;
  const incoming = emptySave("Browser journey"); incoming.checkpoint = { scene: "OpeningScene", step: "arrival", data: {} };
  const preview: SaveImportPreview = { token: "issued-preview", current, incoming };
  let release: (() => void) | undefined;
  let failCommit = false;
  const backend: SaveBackend = { async load() { return current; }, async save() { throw new Error("Ordinary save must not be used to import"); },
    async snapshotForTransfer() { exports++; return current; },
    async prepareImport(state) { reads++; assertEqual(state, incoming, "only the validated selected file is reviewed"); return structuredClone(preview); },
    async commitImport(token) { writes++; assertEqual(token, "issued-preview", "commit uses only the backend-issued token");
      await new Promise<void>(done => { release = done; }); if (failCommit) throw new SaveConflictError(); return incoming;
    },
  };
  const native = options.native ? { async chooseImport() { return incoming; }, async exportJourney() { exports++; return true; } } : undefined;
  const ui = showJourneyTransfer({ backend, native, onClose() { closed++; }, onImported() { imported++; },
    download() { exports++; }, showDialog(next) { model = next; return { destroy() {}, setMessage() {}, setBusy() {} }; } });
  const action = (shortcut: string) => model.actions.find((item: any) => item.shortcut === shortcut).onSelect();
  const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  return { backend, incoming, preview, ui, action, settle, model: () => model, counts: () => ({ imported, closed, writes, reads, exports }),
    release: () => release?.(), fail: () => { failCommit = true; } };
}

await suite("Journey transfer UI: choosing and cancelling never replace a current journey", async () => {
  const f = fixture({ native: true, current: true });
  f.action("i"); await f.settle();
  assertEqual([f.counts().reads, f.counts().writes], [1, 0], "file selection prepares a read-only review without ordinary saving");
  assert(f.model().message.includes("separate recovery copy"), "existing desktop progress has an explicit preservation explanation before consent");
  assertEqual(f.model().actions[0].shortcut, "Escape", "the initially focused review action safely keeps the computer unchanged");
  f.action("Escape");
  assertEqual(f.counts().writes, 0, "leaving the comparison never invokes commit");
  f.action("Escape"); assertEqual(f.counts().closed, 1, "back returns control to the title");
});

await suite("Journey transfer UI: explicit import waits for acknowledgement, suppresses repeats and refreshes Title", async () => {
  const f = fixture({ native: true });
  f.action("i"); await f.settle();
  const confirm = f.model().actions.find((item: any) => item.shortcut === "i");
  confirm.onSelect(); confirm.onSelect(); await f.settle();
  assertEqual([f.counts().writes, f.counts().imported], [1, 0], "repeated keys cannot duplicate a pending commit or acknowledge it early");
  f.release(); await f.settle();
  assert(f.model().title.includes("ready"), "success appears only after durable commit acknowledgement");
  f.action("Escape"); assertEqual([f.counts().imported, f.counts().closed], [1, 0], "Title is reloaded with the imported store, not the previous store");
});

await suite("Journey transfer UI: failed or stale commit never claims success or retries an unreviewed token", async () => {
  const f = fixture({ native: true, current: true });
  f.action("i"); await f.settle(); f.fail(); f.action("i"); await f.settle(); f.release(); await f.settle();
  assertEqual(f.counts().imported, 0, "a rejected save cannot silently become the active store");
  assert(f.model().title.includes("fresh review"), "changed saves require reloading and review");
  assert(!f.model().actions.some((item: any) => item.shortcut === "i"), "the failed confirmation cannot be blindly resubmitted");
  f.action("Escape"); assertEqual(f.counts().closed, 1, "the player can reopen current Title recovery");
});

await suite("Journey transfer UI: browser export is read-only and shutdown blocks late download/review", async () => {
  const f = fixture({ current: true });
  assert(!f.model().actions.some((item: any) => item.shortcut === "i"), "browser transfer does not expose desktop import");
  f.action("e"); await f.settle();
  assertEqual([f.counts().writes, f.counts().exports], [0, 2], "browser export reads its durable snapshot and requests a download without import writes");
  assert(f.model().message.includes("asked to download"), "requesting a browser download does not claim physical file delivery");
  let resolve: ((state: any) => void) | undefined, downloaded = false, models = 0;
  const ui = showJourneyTransfer({ backend: { async load() { return null; }, async save() {}, snapshotForTransfer() { return new Promise(done => { resolve = done; }); } },
    onClose() {}, onImported() {}, download() { downloaded = true; }, showDialog(model) { models++; (globalThis as any).__journeyModel = model; return { destroy() {}, setMessage() {}, setBusy() {} }; } });
  const model = (globalThis as any).__journeyModel; delete (globalThis as any).__journeyModel;
  model.actions.find((item: any) => item.shortcut === "e").onSelect(); ui.destroy(); resolve?.(emptySave());
  await f.settle(); assertEqual([downloaded, models], [false, 1], "a destroyed Title cannot download or reopen a transfer screen after a late read");
});
