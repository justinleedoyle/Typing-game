import { readFileSync } from "node:fs";
import ts from "typescript";
import EventEmitter from "eventemitter3";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { SaveStore, emptySave, type SaveState } from "../src/game/saveState";
import { resetSave } from "../src/game/resetSave";
import { navigationAction } from "../src/game/ui/navigationPolicy";
import { assert, assertEqual, suite } from "./_assert";

// Run the actual hub flow with its actual input and save store. Only display,
// provider replies and clocks are inert; no confirmation policy is re-created.
const url = new URL("../src/scenes/PortalChamberScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "enterZone", "clearZoneTargets", "registerPortalZoneTargets", "registerRealmPortalTarget",
  "registerNavTarget", "registerPortalReturnTarget", "registerDeskAlmanacTarget", "registerAccountZoneTargets",
  "renderAccountStatus", "addAccountAuthTarget", "clearAccountDisplay", "accountPanelGeometry",
  "openAlmanac", "resumeAfterAlmanac", "requestNewGame", "startNewGame", "onKeyDown"];
const constants = source.statements.filter(ts.isVariableStatement).map(node => node.getText(source));
const targetY = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "archTargetY")!;
const fields = owner.members.filter(ts.isPropertyDeclaration).filter(node => ["confirmingNewGame", "newGameRequest",
  "newGamePrepared", "newGameLifetime", "restartingNewGame", "openingUtilityScene", "almanacOverlayOpen", "almanacReturnZone"]
  .includes(node.name.getText(source))).map(node => node.getText(source));
const create = owner.members.find(node => node.name?.getText(source) === "create") as ts.MethodDeclaration;
const shutdown = create.body!.statements.find(statement => statement.getText(source)
  .startsWith("this.events.once(Phaser.Scenes.Events.SHUTDOWN,") && statement.getText(source).includes("this.settleHubArrival()"))!;
const code = ts.transpileModule(`${constants.join("\n")}\n${targetY.getText(source)}\nclass Hub {
  ${fields.join("\n")}
  static arches = ARCHES;
  bindShutdown() { ${shutdown.getText(source)} }
  ${names.map(name => owner.members.find(node => node.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const key = (value: string) => ({ key: value, repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: noop });
const microtasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const progress = (state: Readonly<SaveState>) => {
  const { keyStats: _typedPractice, updatedAt: _autosaveTime, ...journey } = state;
  return structuredClone(journey);
};

function fixture() {
  let now = 0, active = true, paused = false, resetCalls = 0, startCalls = 0, failSave = false, holdSave = false;
  const pending: { at: number; next: () => void }[] = [];
  const saveHolds: { resolve: () => void; reject: () => void }[] = [];
  const targets: Target[] = [], objects: any[] = [], auth: { resolve: (name: string | null) => void }[] = [];
  const starts: any[] = [], launches: any[] = [], fades: number[] = [], writes: SaveState[] = [], inFlight: Promise<void>[] = [];
  const later = (ms: number, next: () => void) => pending.push({ at: now + ms, next });
  const tick = (ms: number) => {
    if (!active) return; // Phaser's paused/stopped scene clock does not update.
    const until = now + ms;
    pending.sort((a, b) => a.at - b.at);
    while (pending[0] && pending[0].at <= until) {
      const next = pending.shift()!; now = next.at; next.next();
      pending.sort((a, b) => a.at - b.at);
    }
    now = until;
  };
  class Target implements WordTarget {
    cursor = 0; destroyed = false; priority: number;
    constructor(readonly opts: any) { this.priority = opts.priority ?? 0; targets.push(this); }
    remaining() { return this.opts.word.toLowerCase().slice(this.cursor); }
    isComplete() { return this.cursor === this.opts.word.length; }
    advance() { this.cursor++; this.opts.onAdvance?.(this.cursor); }
    reverse() { if (!this.cursor) return false; this.cursor--; return true; }
    resetCursor() { this.cursor = 0; }
    miss() {} setDimmed() {} setCandidate() {}
    onClaim() { this.opts.onClaim?.(); }
    onRelease() { if (!this.isComplete()) this.cursor = 0; this.opts.onRelease?.(); }
    // Deliberately retain queued completion after destroy: the actual scene
    // epoch must reject a callback that was already handed to the engine.
    onComplete() { later(320, () => this.opts.onComplete()); }
    destroy() { this.destroyed = true; }
  }
  const initial = emptySave("Test returning player");
  initial.typewriterAwakened = true; initial.wrenGender = "girl";
  for (const id of ["winter-mountain", "sunken-bell", "clockwork-forge", "sky-island", "haunted-wood", "great-battle"]) {
    initial.realms[id] = { cleared: true, choices: { fork1: "test-earned-choice" } };
  }
  initial.satchel = ["hunters-horn", "snow-fox-cub"];
  initial.almanacLore = ["wayshrine-runes"];
  initial.keyStats = { a: { hits: 5, misses: 1 } };
  initial.textScale = "large"; initial.audioLevel = "quiet"; initial.reducedMotion = true;
  const store = new SaveStore({ load: async () => initial, save: async state => {
    if (holdSave) await new Promise<void>((resolve, reject) => saveHolds.push({ resolve, reject: () => reject(new Error("fixture delayed disk failure")) }));
    if (failSave) throw new Error("fixture disk failure");
    writes.push(structuredClone(state));
  } }, initial, { saveDelayMs: 60_000 });
  const globals = {
    TextWordTarget: Target, navigationAction, resetSave: (value: SaveStore, again: boolean) => { resetCalls++; resetSave(value, again); },
    currentUserDisplayName: () => new Promise<string | null>(resolve => auth.push({ resolve })), desktopBridge: () => null,
    signInWithGoogle: noop, signOut: noop, isPuristToggleKey: () => false, playClack: noop, playChime: noop,
    UI_HEX: { brass: 0xc8a85f }, SERIF: "test serif",
    PRESENTATION_CHANGED: "presentation-changed",
    Phaser: { Scenes: { Events: { SHUTDOWN: "shutdown", RESUME: "resume" } }, Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade-out-complete" } } } },
  };
  const Hub = new Function(...Object.keys(globals), code + "; return Hub;")(...Object.values(globals));
  const hub = new Hub(), keyboard = new Set([hub.onKeyDown]), camera = new EventEmitter();
  Object.assign(hub, {
    store, scale: { width: 1920, height: 1080 }, activeZone: "portals", zoneTargets: [],
    portalInstructionObjects: [], portalWordAnchors: [], stationWordAnchorReleases: [], accountDisplayObjects: [],
    narration: { clear: noop, say: noop, sayRaw: noop, clearAfter: noop },
    typingInput: new TypingInputController(store),
    clearDeskDisplay: noop, clearShelfDisplay: noop, drawDisplayShelf: noop, walkWrenTo: noop, settleHubArrival: noop,
    clearPortalFloorCallWake: noop, showPortalFloorCallGlow: noop, showPortalFloorCallWake: noop,
    focusStation: noop, pulseStationTyping: noop, pulseStation: noop, playHubActorAction: noop,
    playPortalClaimLine: noop, focusPortalForScene: noop, setCompletedPortalFocus: noop, pulsePortalTyping: noop,
    attachPortalWordAnchor: () => noop, attachStationWordAnchor: () => noop,
    stageHubTarget: noop, drawAccountStationPanel: noop, playAccountPanelWake: noop, stageAccountObject: noop,
    playUtilityStationExitWake: noop, playBeginAgainWake: noop, enterSettings: noop, chapterMenu: { handleKey: () => false, destroy: noop },
    events: new EventEmitter(), clearPersistentStationWordAnchors: noop,
    input: { keyboard: { on(_name: string, fn: any) { keyboard.add(fn); }, off(_name: string, fn: any) { keyboard.delete(fn); } } },
    scene: { isActive: () => active, isPaused: () => paused, start: (...args: any[]) => starts.push(args),
      launch: (...args: any[]) => launches.push(args), pause() { active = false; paused = true; } },
    time: { delayedCall: later }, cameras: { main: Object.assign(camera, { fadeOut: (ms: number) => fades.push(ms) }) },
    tweens: { killTweensOf: noop },
    add: { text(x: number, y: number, text: string) {
      const object = { x, y, text, scene: true, setOrigin() { return this; }, setDepth() { return this; }, destroy() { this.scene = false; } };
      objects.push(object); return object;
    } },
  });
  const startNewGame = hub.startNewGame.bind(hub);
  hub.startNewGame = () => { startCalls++; const promise = startNewGame(); inFlight.push(promise); return promise; };
  hub.bindShutdown();
  hub.enterZone("portals", false);
  const type = (word: string) => { if (active && keyboard.has(hub.onKeyDown)) for (const char of word) hub.onKeyDown(key(char)); };
  const live = (word: string) => hub.zoneTargets.find((target: Target) => !target.destroyed && target.opts.word === word) as Target | undefined;
  return { hub, store, targets, objects, auth, starts, launches, fades, writes, camera, keyboard, tick, type, live, pending, saveHolds,
    resetCalls: () => resetCalls, startCalls: () => startCalls, failSave: (value: boolean) => { failSave = value; },
    settle: async () => { await Promise.all(inFlight); await microtasks(); },
    holdSaves: (value: boolean) => { holdSave = value; },
    pause: () => { active = false; paused = true; }, resume: () => { active = true; paused = false; hub.events.emit("resume"); },
    shutdown: () => { active = false; paused = false; hub.events.emit("shutdown"); },
    resumeBook: () => { active = true; paused = false; hub.resumeAfterAlmanac(); }, setActive: (value: boolean) => { active = value; paused = false; },
  };
}

await suite("Completed chamber: five earned portals and the painted Almanac stay primary without exposing reset", async () => {
  const f = fixture(), original = progress(f.store.get());
  assert(f.live("almanac") && f.live("profile") && !f.live("begin again"), "the main completed room exposes book/revisits while reset stays behind Profile");
  f.hub.requestNewGame();
  assert(!f.hub.confirmingNewGame && f.resetCalls() === 0, "requesting replay from outside Profile cannot open or mutate a new journey");
  for (const word of ["Winter Mountain", "Sunken Bell", "Clockwork Forge", "Sky Island", "Haunted Wood"]) {
    assertEqual(f.live(word)?.opts.fontSize, 24, "every earned passage retains its readable completed-room name");
  }
  f.type("almanac"); f.tick(530);
  assertEqual([f.launches.length, f.hub.almanacReturnZone, f.keyboard.size], [1, "portals", 0], "the direct book overlay takes exclusive input and remembers the completed room");
  f.resumeBook();
  assertEqual([f.hub.activeZone, f.keyboard.size], ["portals", 1], "closing the book restores the same room and one keyboard listener");
  f.type("profile"); f.tick(320);
  assertEqual(f.hub.activeZone, "account", "the first command immediately after closing reaches Profile");
  assertEqual(progress(f.store.get()), original, "book and room navigation preserve every journey field beyond legitimate typing statistics");
  assertEqual(f.resetCalls(), 0, "reading cannot call resetSave");
  await f.store.flush();
});

await suite("New journey: Profile opens confirmation without resetting and Keep or Escape preserves the journey", async () => {
  for (const cancel of ["keep this journey", "Escape"] as const) {
    const f = fixture(), original = progress(f.store.get());
    f.type("profile"); f.tick(320);
    assert(f.live("begin again"), "Profile owns the secondary replay action");
    f.type("begin again"); f.tick(320);
    assert(f.hub.confirmingNewGame && f.live("keep this journey") && f.live("confirm new journey"), "begin again opens a separate explicit choice");
    assertEqual([f.resetCalls(), f.startCalls()], [0, 0], "opening the confirmation invokes neither reset nor restart");
    if (cancel === "Escape") {
      f.type("con"); f.hub.onKeyDown(key("Escape"));
      assert(f.hub.confirmingNewGame && !f.hub.typingInput.hasPendingInput(), "the first Escape cancels only an unfinished phrase");
      f.hub.onKeyDown({ ...key("Escape"), repeat: true });
      assert(f.hub.confirmingNewGame, "holding Escape cannot also cancel the confirmation after clearing its phrase");
      f.hub.onKeyDown(key("Escape"));
    } else { f.type(cancel); f.tick(320); }
    assertEqual([f.hub.activeZone, f.hub.confirmingNewGame, f.startCalls(), f.resetCalls()], ["account", false, 0, 0], "cancellation returns to Profile without starting a replacement");
    assertEqual(progress(f.store.get()), original, "cancel leaves run identity, choices, lore, keepsakes, checkpoint and preferences intact");
    assertEqual(f.starts, [], "cancel never navigates to another scene");
    await f.store.flush();
  }
});

await suite("New journey confirmation: old completed phrases cannot cancel or confirm a reopened request", async () => {
  const f = fixture(), original = progress(f.store.get());
  f.hub.enterZone("account", false); f.hub.requestNewGame();
  const oldConfirm = f.live("confirm new journey")!, oldKeep = f.live("keep this journey")!;
  f.type("confirm new journey"); // Its native completion is still in the 320ms exit.
  f.hub.onKeyDown(key("Escape"));
  f.hub.requestNewGame();
  const current = f.live("confirm new journey");
  f.tick(320); oldConfirm.opts.onComplete(); oldKeep.opts.onComplete();
  assert(f.hub.confirmingNewGame && f.live("confirm new journey") === current, "queued or duplicated old completions cannot steal the reopened confirmation");
  assertEqual([f.startCalls(), f.resetCalls()], [0, 0], "stale confirmation callbacks never invoke replacement");
  assertEqual(progress(f.store.get()), original, "old callbacks leave the real SaveStore's earned journey intact");
  f.hub.onKeyDown(key("Escape")); await f.store.flush();
});

await suite("New journey: only the confirmed phrase resets once, preserves identity/settings and enters Opening", async () => {
  const f = fixture(), original = structuredClone(f.store.get());
  f.hub.enterZone("account", false); f.hub.requestNewGame();
  const confirm = f.live("confirm new journey")!;
  f.type("confirm new journey"); f.tick(320); confirm.opts.onComplete();
  await f.settle();
  assertEqual([f.startCalls(), f.resetCalls()], [1, 1], "the real confirmed phrase starts exactly one schema reset");
  const fresh = f.store.get();
  assert(fresh.runId !== original.runId && !fresh.typewriterAwakened, "explicit confirmation creates a new opening identity");
  assertEqual([fresh.realms, fresh.satchel, fresh.almanacLore, fresh.checkpoint], [{}, [], [], null], "a confirmed replacement clears all story progress");
  for (const field of ["profileName", "wrenGender", "difficulty", "audioLevel", "textScale", "reducedMotion", "reducedFlashes"] as const) {
    assertEqual(fresh[field], original[field], "the new journey preserves the returning player's identity and comfort preference");
  }
  assertEqual(f.writes.at(-1)?.runId, fresh.runId, "the replacement is durable before its exit animation");
  f.tick(320); assertEqual(f.fades, [720], "the existing exit fade keeps its duration");
  f.camera.emit("fade-out-complete"); f.camera.emit("fade-out-complete");
  assertEqual(f.starts.map(args => args[0]), ["OpeningScene"], "the actual fade completion starts Opening once");
});

await suite("New journey save failure: explicit Retry persists the same prepared run without resetting again", async () => {
  const f = fixture(); f.failSave(true);
  f.hub.enterZone("account", false); f.hub.requestNewGame();
  f.type("confirm new journey"); f.tick(320); await f.settle();
  const preparedRun = f.store.get().runId;
  assert(f.hub.newGamePrepared && !f.hub.restartingNewGame && f.live("retry"), "failed storage retains one explicit retry rather than pretending to finish");
  assertEqual([f.resetCalls(), f.writes.length, f.starts.length], [1, 0, 0], "failure neither duplicates the reset nor enters Opening");
  f.hub.onKeyDown(key("Escape")); f.type("profile");
  assert(f.live("retry") && f.hub.newGamePrepared, "a prepared run cannot leave its save-retry surface through room navigation");
  f.failSave(false); f.type("retry"); f.tick(320); await f.settle();
  assertEqual([f.resetCalls(), f.store.get().runId, f.writes.at(-1)?.runId], [1, preparedRun, preparedRun], "retry writes the same new run without another destructive reset");
  assertEqual(f.starts, [], "the original fade still owns entry after successful retry");
});

async function confirmWithPendingSave(f: ReturnType<typeof fixture>) {
  f.holdSaves(true);
  f.hub.enterZone("account", false); f.hub.requestNewGame();
  f.type("confirm new journey"); f.tick(320); await microtasks();
  assertEqual(f.saveHolds.length, 1, "the actual confirmed reset is awaiting its real SaveStore backend");
  return f.saveHolds[0];
}

await suite("New journey blur: save success while paused retains the exit until the owner resumes", async () => {
  const f = fixture(), write = await confirmWithPendingSave(f);
  f.pause(); write.resolve(); await f.settle();
  assert(f.hub.restartingNewGame && f.hub.newGamePrepared, "the paused live owner still owns its confirmed prepared run");
  assertEqual(f.writes.at(-1)?.runId, f.store.get().runId, "the prepared run becomes durable while the scene is paused");
  f.tick(10_000);
  assertEqual([f.fades, f.starts], [[], []], "a paused scene clock cannot run the exit or camera transition");
  f.resume(); f.tick(319);
  assertEqual(f.fades, [], "resuming preserves the original remaining delay rather than skipping straight to Opening");
  f.tick(1); assertEqual(f.fades, [720], "the existing exit starts after its scene clock resumes");
  f.camera.emit("fade-out-complete");
  assertEqual(f.starts.map(args => args[0]), ["OpeningScene"], "a paused save completion cannot leave the returning player input-locked forever");
  assertEqual(f.resetCalls(), 1, "resumption never prepares another reset");
});

await suite("New journey blur: failed save installs a usable Retry for the resumed owner", async () => {
  const f = fixture(), write = await confirmWithPendingSave(f), runId = f.store.get().runId;
  f.pause(); write.reject(); await f.settle();
  assert(!f.hub.restartingNewGame && f.hub.newGamePrepared && f.live("retry"), "paused failure installs the actual retry instead of leaving the reset input guard locked");
  f.tick(10_000);
  assertEqual([f.fades, f.starts], [[], []], "failed storage cannot navigate under the pause overlay");
  f.holdSaves(false); f.resume(); f.type("retry"); f.tick(320); await f.settle();
  assertEqual([f.resetCalls(), f.store.get().runId, f.writes.at(-1)?.runId], [1, runId, runId], "the resumed retry saves the same prepared journey");
  f.tick(320); f.camera.emit("fade-out-complete");
  assertEqual(f.starts.map(args => args[0]), ["OpeningScene"], "the real retry path can reach Opening after deliberate resume");
});

await suite("New journey lifetime: stopped or reused scenes reject both outcomes of an old pending save", async () => {
  for (const outcome of ["success", "failure"] as const) for (const reuse of [false, true]) {
    const f = fixture(), write = await confirmWithPendingSave(f);
    f.shutdown();
    const replacement = new SaveStore({ load: async () => null, save: async () => {} }, emptySave("Next scene owner"));
    const originalReplacement = progress(replacement.get());
    if (reuse) { f.hub.init({ store: replacement }); f.resume(); }
    const controls = f.hub.zoneTargets.length;
    if (outcome === "success") write.resolve(); else write.reject();
    await f.settle();
    assertEqual([f.starts.length, f.fades.length, f.pending.length, f.hub.zoneTargets.length], [0, 0, 0, controls], "an old save cannot install a retry or queue an exit on its stopped or replacement scene");
    assertEqual(progress(replacement.get()), originalReplacement, "a stale confirmed reset cannot mutate the replacement SaveStore");
    if (reuse) assertEqual([f.hub.restartingNewGame, f.hub.newGamePrepared], [false, false], "old outcomes cannot restore reset guards on a new activation");
  }
});

await suite("New journey lifetime: already-queued exit and fade callbacks cannot enter Opening after scene reuse", async () => {
  for (const phase of ["exit delay", "camera fade"] as const) {
    const f = fixture();
    f.hub.enterZone("account", false); f.hub.requestNewGame();
    f.type("confirm new journey"); f.tick(320); await f.settle();
    const exit = f.pending.at(-1)!;
    if (phase === "camera fade") f.tick(320);
    f.shutdown();
    const replacement = new SaveStore({ load: async () => null, save: async () => {} }, emptySave("Replacement"));
    f.hub.init({ store: replacement }); f.resume();
    const before = f.fades.length;
    if (phase === "exit delay") exit.next();
    else f.camera.emit("fade-out-complete");
    assertEqual([f.fades.length, f.starts.length], [before, 0], "a late engine callback cannot transition a new activation using its old reset");
    assertEqual(f.hub.store, replacement, "the new activation keeps its own SaveStore");
  }
});

await suite("New journey lifetime: an old completed Retry cannot reset a later chamber activation", async () => {
  const f = fixture(); f.failSave(true);
  f.hub.enterZone("account", false); f.hub.requestNewGame();
  f.type("confirm new journey"); f.tick(320); await f.settle();
  const retry = f.live("retry")!;
  f.type("retry"); // Its completion is still queued when this activation ends.
  f.shutdown();
  const replacement = new SaveStore({ load: async () => null, save: async () => {} }, emptySave("Protected replacement"));
  const original = progress(replacement.get());
  f.hub.init({ store: replacement }); f.resume();
  retry.opts.onComplete(); await microtasks();
  assertEqual([f.startCalls(), f.resetCalls()], [1, 1], "the old retry cannot invoke another activation's restart method");
  assertEqual(progress(replacement.get()), original, "the replacement journey never inherits the old failed reset");
  f.failSave(false); await f.store.flush(); // Drain the old fixture's typing-stat autosave timer.
});

await suite("Profile replies: old account status and auth cannot reappear during or after confirmation reuse", async () => {
  const f = fixture(); f.hub.enterZone("account", false);
  const old = [...f.auth];
  f.hub.requestNewGame(); f.hub.onKeyDown(key("Escape"));
  const middle = f.auth.slice(old.length);
  for (const reply of old) reply.resolve("Stale account");
  await microtasks();
  assert(!f.hub.confirmingNewGame && f.hub.activeZone === "account", "Profile is active again when the old provider replies settle");
  assert(!f.hub.zoneTargets.some((target: any) => ["sign in", "sign out"].includes(target.opts.word)), "the request epoch rejects old auth controls even outside confirmation mode");
  assert(!f.objects.some(object => object.scene && object.text.includes("Stale account")), "the request epoch rejects old status text even outside confirmation mode");
  f.hub.requestNewGame();
  f.hub.onKeyDown(key("Escape"));
  const current = f.auth.slice(old.length + middle.length);
  for (const reply of middle) reply.resolve("Older reopened account");
  await microtasks();
  assert(!f.objects.some(object => object.scene && object.text.includes("Older reopened account")), "a second cancel and reopen also invalidates the intervening requests");
  for (const reply of current) reply.resolve("Current account");
  await microtasks();
  assertEqual(f.hub.zoneTargets.filter((target: any) => target.opts.word === "sign out").length, 1, "only the current account request registers one auth target");
  assertEqual(f.objects.filter(object => object.scene).map(object => object.text), ["signed in as Current account"], "only the current account request renders one status");
  const staleAfterExit = [f.hub.renderAccountStatus(), f.hub.addAccountAuthTarget()];
  const final = f.auth.slice(-2); f.setActive(false);
  for (const reply of final) reply.resolve("Stopped scene");
  await Promise.all(staleAfterExit);
  assert(!f.objects.some(object => object.text.includes("Stopped scene")), "a stopped scene cannot render a late provider response");
  assertEqual(f.hub.zoneTargets.filter((target: any) => target.opts.word === "sign out").length, 1, "a stopped scene cannot register another late auth target");
  await f.store.flush();
});

await suite("Profile blur: current account replies survive pause and resume exactly once", async () => {
  const f = fixture(); f.hub.enterZone("account", false);
  const current = [...f.auth];
  f.pause();
  for (const reply of current) reply.resolve("Paused returning player");
  await microtasks();
  assertEqual(f.objects.filter(object => object.scene).map(object => object.text), ["signed in as Paused returning player"],
    "the same paused Profile retains its awaited account status for resume");
  assertEqual(f.hub.zoneTargets.filter((target: any) => target.opts.word === "sign out").length, 1,
    "the same paused Profile registers its awaited auth action once");
  f.resume(); f.resume();
  assertEqual(f.objects.filter(object => object.scene).length, 1, "repeated ordinary resumes do not duplicate status text");
  assertEqual(f.hub.zoneTargets.filter((target: any) => target.opts.word === "sign out").length, 1, "repeated ordinary resumes do not duplicate auth commands");
  assertEqual(f.auth.length, current.length, "resuming does not launch a replacement provider request");
  await f.store.flush();
});
