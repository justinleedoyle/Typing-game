import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupSmokePhase, validateSmokeReport, validateSmokeSequence } from "../scripts/desktop-smoke.mjs";
import { parseDesktopSmokeArgs, prepareDesktopSmoke, sendDesktopSmokeKey, sendDesktopSmokePrefixBurst } from "../desktop/smoke";
import { emptySave, LocalStorageBackend, type SaveState } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

function rejects(work: () => unknown): boolean { try { work(); return false; } catch { return true; } }
function report(phase: string, state?: SaveState): any {
  const save = state ?? emptySave("Synthetic Windows review");
  if (!state) save.checkpoint = { scene: "WinterMountainScene", step: phase === "seed" || phase === "verify" ? "fork1" : "firefly", data: { candles: 2, statsSoul: 62.5, statsCombo: 8 } };
  if (!state) save.keyStats = { s: { hits: 1, misses: 0 }, a: { hits: 1, misses: 0 } };
  return { version: 1, phase, ok: true, profileIsolated: true, offline: true, unexpectedRequests: [],
    renderer: { canvas: true, fontsReady: true, activeScene: "WinterMountainScene" }, keyboard: { pauseAndResume: true,
      ...(phase === "seed" ? { uppercaseAndRelease: true, backspaceDispatched: true, sameFramePrefixBurst: true } : {}) }, durable: true, save,
    ...(phase === "seed" ? { transfer: { syntheticPicker: true, explicitReview: true, cancelPreserved: true, sourceUnchanged: true, exportedOriginal: true, archivePreserved: true, runIdentity: true } } : {}),
    ...(phase === "crash" ? { forcedTermination: true } : { normalExit: true, exitCode: 0 }) };
}

await suite("Desktop smoke input: printable events populate Electron's raw character path", async () => {
  const events: unknown[] = [];
  const window = { webContents: { sendInputEvent(event: unknown) { events.push(event); } } } as any;
  const settle = async () => {};
  await sendDesktopSmokeKey(window, "S", ["shift"], settle);
  await sendDesktopSmokeKey(window, "a", [], settle);
  await sendDesktopSmokeKey(window, "Backspace", [], settle);
  assertEqual(events, [
    { type: "rawKeyDown", keyCode: "S", modifiers: ["shift"] }, { type: "keyUp", keyCode: "S", modifiers: ["shift"] },
    { type: "rawKeyDown", keyCode: "a", modifiers: [] }, { type: "keyUp", keyCode: "a", modifiers: [] },
    { type: "keyDown", keyCode: "Backspace", modifiers: [] }, { type: "keyUp", keyCode: "Backspace", modifiers: [] },
  ], "printable rawKeyDown reaches Electron45's text conversion before dispatch while nonprintable behavior is retained");
});

await suite("Desktop smoke regression: S, A and Backspace are deliberately sent as one unpaced native burst", () => {
  const events: unknown[] = [];
  const window = { webContents: { sendInputEvent(event: unknown) { events.push(event); }, executeJavaScript() { throw new Error("Burst must not wait for a renderer frame"); } } } as any;
  sendDesktopSmokePrefixBurst(window);
  assertEqual(events, [
    { type: "rawKeyDown", keyCode: "S", modifiers: ["shift"] }, { type: "keyUp", keyCode: "S", modifiers: ["shift"] },
    { type: "rawKeyDown", keyCode: "a", modifiers: [] }, { type: "keyUp", keyCode: "a", modifiers: [] },
    { type: "keyDown", keyCode: "Backspace", modifiers: [] }, { type: "keyUp", keyCode: "Backspace", modifiers: [] },
  ], "all six events are dispatched synchronously with no renderer/frame wait, retaining the replay regression");
});

await suite("Desktop smoke input: keyup and completion wait for separate renderer-frame boundaries", async () => {
  const events: any[] = [], frames: Array<() => void> = [];
  const window = { webContents: { sendInputEvent(event: unknown) { events.push(event); } } } as any;
  let complete = false;
  const work = sendDesktopSmokeKey(window, "S", ["shift"], () => new Promise<void>(resolve => { frames.push(resolve); })).then(() => { complete = true; });
  assertEqual(events.map(event => event.type), ["rawKeyDown"], "keyup cannot be sent while the down-frame barrier is pending");
  assertEqual(complete, false, "the caller cannot advance to its next key before frames settle");
  frames.shift()!(); await Promise.resolve();
  assertEqual(events.map(event => event.type), ["rawKeyDown", "keyUp"], "keyup is sent only after the down event's frame barrier");
  assertEqual(complete, false, "the key remains pending until its separate up-frame barrier");
  frames.shift()!(); await work;
  assertEqual(complete, true, "the next key is permitted only after both frame boundaries");
});

await suite("Desktop smoke cleanup: failed process cleanup cannot hide the original app evidence", async () => {
  const primary = new Error("real keyboard failure"), cleanup = new Error("taskkill exited255");
  let logged: unknown;
  await cleanupSmokePhase({ primaryError: primary, stop: async () => { throw cleanup; }, writeLogs: async (error: unknown) => { logged = error; } });
  assertEqual(logged, cleanup, "stderr/stdout logging still runs with secondary cleanup information");
  let rejected: unknown;
  try { await cleanupSmokePhase({ stop: async () => { throw cleanup; }, writeLogs: async () => {} }); } catch (error) { rejected = error; }
  assertEqual(rejected, cleanup, "cleanup failure remains visible when there was no earlier test failure");
});

await suite("Desktop smoke paths: only explicit disposable profiles and phase reports are accepted", () => {
  const profile = mkdtempSync(join(tmpdir(), "portalwrights-desktop-smoke-"));
  const evidence = mkdtempSync(join(tmpdir(), "portalwrights-desktop-evidence-"));
  try {
    assertEqual(parseDesktopSmokeArgs(["game.exe"]), null, "ordinary launches never enter synthetic QA");
    const args = ["--desktop-smoke=seed", `--desktop-profile=${profile}`, `--desktop-report=${join(evidence, "seed.json")}`];
    assertEqual(parseDesktopSmokeArgs(args)?.phase, "seed", "an explicit isolated smoke launch is accepted");
    assert(rejects(() => parseDesktopSmokeArgs(args.slice(1))), "a profile override cannot be used without smoke mode");
    assert(rejects(() => parseDesktopSmokeArgs([...args, "--desktop-smoke=crash"])), "ambiguous phase arguments are refused");
    assert(rejects(() => parseDesktopSmokeArgs(args.map(arg => arg.startsWith("--desktop-report") ? `--desktop-report=${join(evidence, "other.json")}` : arg))), "report names cannot select arbitrary files");
    assert(rejects(() => parseDesktopSmokeArgs(args.map(arg => arg.startsWith("--desktop-profile") ? `--desktop-profile=${tmpdir()}` : arg))), "the temp root itself cannot become a profile");
    const linked = join(evidence, "portalwrights-desktop-smoke-linked");
    // Windows directory junctions do not require developer-mode symlink rights.
    symlinkSync(profile, linked, process.platform === "win32" ? "junction" : "dir");
    assert(rejects(() => parseDesktopSmokeArgs(args.map(arg => arg.startsWith("--desktop-profile") ? `--desktop-profile=${linked}` : arg))), "a profile symlink is not an isolation bypass");
    const normal = join(evidence, "ordinary-data"); mkdirSync(normal);
    assert(rejects(() => parseDesktopSmokeArgs(args.map(arg => arg.startsWith("--desktop-profile") ? `--desktop-profile=${normal}` : arg))), "normal data directories cannot opt into seeded QA");
    assert(rejects(() => parseDesktopSmokeArgs(args.map(arg => arg.startsWith("--desktop-report") ? `--desktop-report=${join(normal, "seed.json")}` : arg))), "reports cannot overwrite other temporary app directories");
  } finally { rmSync(profile, { recursive: true, force: true }); rmSync(evidence, { recursive: true, force: true }); }
});

await suite("Desktop smoke preparation: synthetic checkpoints use the actual validated save backend", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const backend = new LocalStorageBackend(storage);
  await prepareDesktopSmoke(backend, "seed");
  const seeded = (await backend.load())!;
  assertEqual([seeded.checkpoint?.step, seeded.checkpoint?.data.statsSoul, seeded.checkpoint?.data.candles], ["fork1", 62.5, 2], "synthetic source has exact checkpoint resources");
  const before = JSON.stringify([...values]);
  await prepareDesktopSmoke(backend, "verify");
  assertEqual(JSON.stringify([...values]), before, "normal verification only reads durable data");
  let refused = false; try { await prepareDesktopSmoke(backend, "seed"); } catch { refused = true; }
  assert(refused, "seed cannot overwrite a journey even inside the QA profile");
  await prepareDesktopSmoke(backend, "crash");
  const crash = (await backend.load())!;
  assertEqual([crash.runId, crash.checkpoint?.step, crash.realms["winter-mountain"].choices.fork1], [seeded.runId, "firefly", "firefly"], "crash phase commits a different checkpoint in the same journey");
  assertEqual(crash.checkpoint?.data.statsSoul, 62.5, "crash checkpoint preserves fractional resources");
});

await suite("Desktop packaged evidence: failures and lost restart progress cannot pass the launcher", () => {
  const seed = report("seed"), verify = report("verify", structuredClone(seed.save));
  const crash = report("crash", structuredClone(seed.save)); crash.save.checkpoint.step = "firefly";
  const recover = report("recover", structuredClone(crash.save));
  const reports = { seed, verify, crash, recover };
  validateSmokeSequence(reports);
  verify.save.updatedAt += 2000; recover.save.updatedAt += 3000;
  validateSmokeSequence(reports);
  assert(true, "actual scene timestamp refresh is allowed while all progress remains equal");
  for (const patch of [{ offline: false }, { unexpectedRequests: ["https://example.test"] }, { durable: false }, { renderer: { canvas: false, fontsReady: true } }, { keyboard: { pauseAndResume: false } }]) {
    assert(rejects(() => validateSmokeReport({ ...seed, ...patch }, "seed")), "incomplete packaged execution cannot be relabeled successful");
  }
  const lost = structuredClone(reports); lost.recover.save.checkpoint.data.statsSoul = 63;
  assert(rejects(() => validateSmokeSequence(lost)), "fractional resource loss fails evidence validation");
  const changedChoice = structuredClone(reports); changedChoice.recover.save.realms.winter = { cleared: false, choices: { fork1: "other" } };
  assert(rejects(() => validateSmokeSequence(changedChoice)), "other story progress changes fail full-state comparison");
  const fakeCrash = structuredClone(reports); fakeCrash.crash.save.checkpoint.step = "fork1";
  assert(rejects(() => validateSmokeSequence(fakeCrash)), "a no-op crash phase cannot claim new acknowledged progress");
  const failedClose = structuredClone(reports); failedClose.verify.normalExit = false;
  assert(rejects(() => validateSmokeSequence(failedClose)), "a report written before normal process exit cannot claim a completed close handshake");
  const notKilled = structuredClone(reports); notKilled.crash.forcedTermination = false;
  assert(rejects(() => validateSmokeSequence(notKilled)), "a self-exiting app cannot masquerade as the externally forced crash phase");
  const noUppercase = structuredClone(seed); delete noUppercase.keyboard.uppercaseAndRelease;
  assert(rejects(() => validateSmokeReport(noUppercase, "seed")), "a pause-only seed cannot claim uppercase/release evidence");
  const pacedOnly = structuredClone(seed); delete pacedOnly.keyboard.sameFramePrefixBurst;
  assert(rejects(() => validateSmokeReport(pacedOnly, "seed")), "paced typing alone cannot claim the actual same-frame regression was exercised");
  const noTransfer = structuredClone(seed); delete noTransfer.transfer;
  assert(rejects(() => validateSmokeReport(noTransfer, "seed")), "startup-only evidence cannot claim the actual reviewed transfer and preserved originals");
  const lostHit = structuredClone(reports); lostHit.recover.save.keyStats.s.hits = 0;
  assert(rejects(() => validateSmokeSequence(lostHit)), "crash recovery must retain the actual normalized uppercase hit");
  const repeatedTyping = structuredClone(reports); repeatedTyping.verify.save.keyStats.a.hits = 2;
  assert(rejects(() => validateSmokeSequence(repeatedTyping)), "later phases cannot repeat printable smoke input and alter progress");
});
