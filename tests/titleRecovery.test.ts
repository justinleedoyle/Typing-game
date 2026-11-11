import { readFileSync } from "node:fs";
import ts from "typescript";
import { emptySave, CloudSaveError, InvalidSaveError, LocalStorageBackend, SaveStore, UnsupportedSaveVersionError, type SaveRecoverySnapshot, type StoragePort } from "../src/game/saveState";
import { downloadSaveRecovery, saveRecoveryPresentation } from "../src/game/saveRecovery";
import { SceneRunGuard } from "../src/game/sceneRunGuard";
import { assert, assertEqual, suite } from "./_assert";

// Execute production Title recovery handlers with real backend behavior. Only
// DOM rendering/download are injected; native checks cover their actual UI.
const path = new URL("../src/scenes/TitleScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["presentSaveLoadFailure", "showSaveRecovery", "confirmRecoveryJourney", "downloadRecovery", "startRecoveryJourney"];
const code = ts.transpileModule(`class Title { ${names.map(name => owner.members.find(m => m.name?.getText(source) === name)!.getText(source)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const key = "portalwrights-almanac.save.v1";
function fixture(options: { future?: boolean; account?: boolean; denied?: boolean; full?: boolean } = {}) {
  const values = new Map<string, string>();
  const raw = options.future ? JSON.stringify({ ...emptySave(), schemaVersion: 99 }) : "{damaged-primary";
  const slot = options.account ? `${key}.user.account-a` : key;
  values.set(slot, raw); values.set(`${slot}.lkg`, "{damaged-backup");
  const storage: StoragePort = {
    getItem(k) { if (options.denied) throw new Error("storage denied"); return values.get(k) ?? null; },
    setItem(k, v) { if (options.full && k.includes(".damaged-recovery.")) throw new Error("storage full"); values.set(k, v); },
  };
  const backend = new LocalStorageBackend(storage, options.account ? "account-a" : null);
  let current: any, transitions = 0, choices = 0;
  const downloads: SaveRecoverySnapshot[] = [], dialogs: any[] = [];
  const Title = new Function("InvalidSaveError", "UnsupportedSaveVersionError", "CloudSaveError", "SaveStore", "saveRecoveryPresentation", "showRecoveryDialog", "downloadSaveRecovery", "setAudioLevel", `${code}; return Title;`)(
    InvalidSaveError, UnsupportedSaveVersionError, CloudSaveError, SaveStore, saveRecoveryPresentation,
    (model: any) => {
      const handle = { model, destroyed: false, busy: false, message: model.message,
        destroy() { this.destroyed = true; }, setMessage(text: string) { this.message = text; }, setBusy(busy: boolean) { this.busy = busy; } };
      current = handle; dialogs.push(handle); return handle;
    }, (snapshot: SaveRecoverySnapshot) => downloads.push(snapshot), () => {},
  );
  const run = new SceneRunGuard(); run.begin(); run.once("typed");
  const scene = new Title();
  Object.assign(scene, { run, backend, prompt: { setText() {} }, redrawPromptPlate() {}, beginTransition: async () => { transitions++; }, showSaveChoice() { choices++; } });
  return { scene, run, backend, values, downloads, dialogs, raw, slot,
    current: () => current, transitions: () => transitions, choices: () => choices,
    async open() { let error: unknown; try { await backend.load(); } catch (e) { error = e; } await scene.presentSaveLoadFailure(error, run.token()); },
  };
}

await suite("Title recovery: damaged bytes expose read-only copy and separate new-journey confirmation", async () => {
  const f = fixture(); await f.open();
  assertEqual(f.current().model.actions.length, 3, "retry, copy and deliberate new journey are reachable");
  assertEqual(f.values.get(f.slot), f.raw, "merely opening recovery never changes saved bytes");
  const snapshot = await f.backend.getRecovery(); assert(snapshot, "actual backend issues recovery snapshot");
  await f.scene.downloadRecovery(snapshot!);
  assertEqual(f.downloads[0]?.copies.primary, f.raw, "file receives exact original primary");
  assertEqual(f.values.size, 2, "download cannot create a fresh save or mutate slots");
  f.current().model.actions[2].onSelect();
  assertEqual(f.current().model.title, "Start a new journey?", "new journey first opens an explicit confirmation");
  assertEqual(f.current().model.actions[0].label, "Go back · Esc", "safe back action receives initial DOM focus");
  assertEqual(f.values.get(f.slot), f.raw, "confirmation screen still leaves original bytes in place");
  f.current().model.actions[0].onSelect();
  assertEqual(f.current().model.actions.length, 3, "cancel returns to recovery without writing");
  f.current().model.actions[2].onSelect();
  await f.scene.startRecoveryJourney(snapshot!);
  assertEqual(f.transitions(), 1, "only explicit confirmation opens a new journey");
  assertEqual(f.scene.store.get().typewriterAwakened, false, "new store begins at the original opening");
  assert([...f.values.keys()].some(k => k.includes(".damaged-recovery.")), "old bytes have a durable recovery archive before continuation");
  assert(f.current().destroyed, "successful continuation removes modal controls");
});

await suite("Title recovery: future saves, account copies and denied reads never expose destructive choices", async () => {
  for (const options of [{ future: true }, { account: true }, { denied: true }]) {
    const f = fixture(options); await f.open();
    assertEqual(f.current().model.actions.length, options.denied ? 1 : 2, "only truthful retry/export options are reachable");
    assert(!f.current().model.actions.some((a: any) => a.label.includes("Start")), "there is no new-journey bypass");
    assertEqual(f.values.get(f.slot), f.raw, "opening the failure screen keeps exact data");
  }
  assert(saveRecoveryPresentation(new UnsupportedSaveVersionError(99)).title.includes("newer"), "remote-only newer-version errors still ask for an update");
  assert(!saveRecoveryPresentation(new UnsupportedSaveVersionError(99)).detail.includes("recovery copy"), "a remote-only error cannot promise an unavailable device download");
  const account = fixture();
  account.backend.getRecovery = async () => { throw new CloudSaveError("Account changed"); };
  await account.scene.presentSaveLoadFailure(new CloudSaveError(), account.run.token());
  assertEqual(account.current().model.title, "Saved progress could not load", "account verification failure is not mislabeled as denied local storage");
  assertEqual(account.current().model.actions.length, 1, "unverified identity offers retry only");
});

await suite("Title recovery: stale export, full archive and shutdown cannot silently open or replace a journey", async () => {
  const f = fixture(); await f.open(); const snapshot = await f.backend.getRecovery();
  f.values.set(f.slot, "{changed-in-another-window");
  await f.scene.downloadRecovery(snapshot!);
  assertEqual(f.downloads.length, 0, "changed data is reviewed before an export");
  assert(f.current().message.includes("changed"), "changed-data outcome is explained");
  const full = fixture({ full: true }); await full.open();
  await full.scene.startRecoveryJourney((await full.backend.getRecovery())!);
  assertEqual(full.transitions(), 0, "archive failure blocks new journey");
  assertEqual(full.values.get(full.slot), full.raw, "archive failure preserves primary");
  assert(full.current().message.includes("could not open safely"), "failure has reachable recovery choices");
  assert(!full.current().busy, "failure does not strand disabled controls");
  const stale = fixture(); await stale.open(); const old = stale.current();
  const prior = await stale.backend.getRecovery(); stale.run.end();
  old.model.actions[0].onSelect(); await stale.scene.startRecoveryJourney(prior!);
  assertEqual(stale.transitions(), 0, "old buttons cannot revive shutdown Title");
  assertEqual(stale.values.get(stale.slot), stale.raw, "shutdown prevents a stale confirmation write");
  const reused = fixture(); await reused.open(); const captured = await reused.backend.getRecovery();
  reused.scene.confirmRecoveryJourney(captured); const oldConfirm = reused.current();
  reused.run.end(); reused.run.begin(); oldConfirm.model.actions[1].onSelect();
  assertEqual(reused.values.get(reused.slot), reused.raw, "a confirmation captured on the prior activation cannot adopt a fresh scene token");
});

await suite("Recovery export: a local JSON download preserves the exact snapshot without server or clipboard access", async () => {
  const f = fixture(); await f.open(); const snapshot = (await f.backend.getRecovery())!;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, schedule = globalThis.setTimeout;
  let blob: Blob | undefined, clicks = 0, removed = 0, timer: (() => void) | undefined, revoked = "";
  const anchor = { href: "", download: "", click() { clicks++; }, remove() { removed++; } };
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor, body: { append() {} } } });
    URL.createObjectURL = value => { blob = value as Blob; return "blob:isolated-recovery"; };
    URL.revokeObjectURL = url => { revoked = url; };
    globalThis.setTimeout = ((work: () => void) => { timer = work; return 1; }) as any;
    downloadSaveRecovery(snapshot);
    assertEqual(JSON.parse(await blob!.text()), snapshot, "the actual downloadable file contains all exact raw copies and scope");
    assertEqual([clicks, removed, anchor.href], [1, 1, "blob:isolated-recovery"], "one local blob link is activated and cleaned up");
    assert(anchor.download.startsWith("portalwrights-recovery-") && anchor.download.endsWith(".json"), "filename identifies a dated recovery file without account identifiers");
    assertEqual(revoked, "", "object URL remains available while the browser starts downloading");
    timer!(); assertEqual(revoked, anchor.href, "object URL is released afterwards");
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete (globalThis as any).document;
    URL.createObjectURL = create; URL.revokeObjectURL = revoke; globalThis.setTimeout = schedule;
  }
});
