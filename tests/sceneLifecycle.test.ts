import { SceneRunGuard } from "../src/game/sceneRunGuard";
import { titleCheckpoint } from "../src/game/titleResume";
import type { SaveCheckpoint } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

await suite("scene lifecycle: title reset permits a fresh start and transition", () => {
  const run = new SceneRunGuard();
  const oldToken = run.begin();
  assert(run.once("typed"), "first key accepted");
  assert(run.once("transition"), "transition starts");
  assert(!run.once("transition"), "repeated key cannot start a second transition");
  run.end();
  assert(!run.isCurrent(oldToken), "shutdown invalidates pending load");
  run.begin();
  assert(!run.has("typed"), "new title prompt is not hidden by prior input");
  assert(run.once("typed") && run.once("transition"), "reset title starts normally");
  assert(!run.isCurrent(oldToken), "new visit rejects old completion");
});

await suite("scene lifecycle: an old async save completion cannot update a new title", async () => {
  const run = new SceneRunGuard();
  let resolveOld!: (value: string) => void;
  const pending = new Promise<string>((resolve) => { resolveOld = resolve; });
  const token = run.begin();
  let visibleStore = "new save";
  const completion = pending.then((value) => {
    if (run.isCurrent(token)) visibleStore = value;
  });
  run.end();
  run.begin();
  resolveOld("old save");
  await completion;
  assertEqual(visibleStore, "new save", "stale load is ignored after reset");
});

await suite("scene lifecycle: credits attach once per finale, including a second playthrough", () => {
  const run = new SceneRunGuard();
  for (let playthrough = 0; playthrough < 2; playthrough += 1) {
    run.begin();
    assert(run.once("credits-key"), "completed finale gets a return listener");
    assert(!run.once("credits-key"), "same credits cannot attach it twice");
    run.end();
    assert(!run.once("credits-key"), "stopped scene cannot attach a listener");
  }
});

await suite("scene lifecycle: a failed load can retry without reopening another transition", () => {
  const run = new SceneRunGuard();
  run.begin();
  assert(run.once("transition"), "first load attempted");
  run.release("transition");
  assert(run.once("transition"), "explicit retry allowed");
  assert(!run.once("transition"), "only one retry in flight");
});

await suite("scene lifecycle: a dismissed pause ignores both outcomes of its old save when reopened", async () => {
  for (const outcome of ["saved", "failed"] as const) {
    const run = new SceneRunGuard();
    const oldPause = run.begin();
    let resolve!: () => void;
    let reject!: () => void;
    const flush = new Promise<void>((done, fail) => { resolve = done; reject = () => fail(new Error("test write failure")); });
    // The same guard used by the menu gates either settlement, not just errors
    // or success. Closing and reopening keeps the new pause independent.
    const completion = flush.then(
      () => run.isCurrent(oldPause),
      () => run.isCurrent(oldPause),
    );
    run.end();
    const reopenedPause = run.begin();
    if (outcome === "saved") resolve(); else reject();
    assertEqual(await completion, false, `${outcome} old save cannot close or redraw the reopened pause`);
    assert(run.isCurrent(reopenedPause), "reopened menu still owns its own session");
  }
});

await suite("title resume: checkpoint honors completion and reset state", () => {
  const opening: SaveCheckpoint = { scene: "OpeningScene", step: "name", data: {} };
  const winter: SaveCheckpoint = { scene: "WinterMountainScene", step: "trail", data: { index: 2 } };
  assertEqual(titleCheckpoint({ checkpoint: null, typewriterAwakened: false, realms: {} }), null,
    "fresh save retains the ordinary hub-to-opening route");
  assertEqual(titleCheckpoint({ checkpoint: opening, typewriterAwakened: false, realms: {} }), opening,
    "incomplete opening resumes");
  assertEqual(titleCheckpoint({ checkpoint: opening, typewriterAwakened: true, realms: {} }), null,
    "completed opening cannot reopen from a stale marker");
  assertEqual(titleCheckpoint({ checkpoint: winter, typewriterAwakened: true, realms: {} }), winter,
    "unfinished Winter resumes");
  assertEqual(titleCheckpoint({ checkpoint: winter, typewriterAwakened: false, realms: {} }), null,
    "new-run state cannot reopen Winter");
  assertEqual(titleCheckpoint({ checkpoint: winter, typewriterAwakened: true,
    realms: { "winter-mountain": { cleared: true, choices: {} } } }), null,
  "completed realm takes precedence over its marker");
});
