import { readFileSync } from "node:fs";
import ts from "typescript";
import { SessionStats } from "../src/game/sessionStats";
import { SaveStore, emptySave, migrate, validateCheckpoint, CURRENT_SCHEMA_VERSION, CHECKPOINT_REALMS, type SaveState, type SaveCheckpoint } from "../src/game/saveState";
import { titleCheckpoint } from "../src/game/titleResume";
import { INVOCATIONS, isSingleTargetOneShot, pickHardestEnemy, type OffensiveOneShot } from "../src/game/oneShotInvocation";
import { assert, assertEqual, suite } from "./_assert";

await suite("checkpoint resources: real Heart, fractional Soul and streaks roundtrip without retaining speed", () => {
  const stats = new SessionStats();
  for (let index = 0; index < 90; index++) stats.record(true);
  assert(stats.spendSoul(37.5), "a real spell spend can leave fractional Soul");
  stats.record(false);
  for (let index = 0; index < 4; index++) stats.record(true);
  const checkpoint = stats.captureCheckpoint();
  assertEqual(checkpoint.statsSoul, 74.5, "checkpoint retains exact fuel rather than rounded HUD text");
  assertEqual([checkpoint.statsHits.length, stats.getHeart(), checkpoint.statsCombo, checkpoint.statsBestCombo], [50, 98, 4, 90], "bounded rolling accuracy and clean-streak economy match the actual session");
  assert(stats.getCPM() > 0, "the live session has genuine speed samples");
  const restored = new SessionStats(); restored.restoreCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  assertEqual(restored.captureCheckpoint(), checkpoint, "all resource fields survive flat-data serialization exactly");
  assertEqual([restored.getHeart(), restored.getSoul(), restored.getCombo(), restored.getBestCombo(), restored.getCPM()], [98, 75, 4, 90, 0], "restored meters keep stakes while speed starts from a new clock");
  stats.record(true); restored.record(true);
  assertEqual(restored.captureCheckpoint(), stats.captureCheckpoint(), "the next keystroke continues the same combo multiplier and accuracy window");
  assertEqual(checkpoint.statsCombo, 4, "capturing a checkpoint produces an independent value");
});

await suite("checkpoint resources: malformed and legacy data remain finite, bounded and backwards compatible", () => {
  const stats = new SessionStats(); stats.restoreCheckpoint({});
  assertEqual([stats.getHeart(), stats.getSoul(), stats.getCombo(), stats.getBestCombo()], [100, 0, 0, 0], "legacy checkpoints without telemetry retain a fresh session");
  stats.restoreCheckpoint({ statsHits: "0".repeat(100), statsSoul: -9, statsCombo: 4.9, statsBestCombo: 2.7 });
  assertEqual(stats.captureCheckpoint(), { statsHits: "0".repeat(50), statsSoul: 0, statsCombo: 4, statsBestCombo: 4 }, "negative values clamp, streaks use integers and recent accuracy has a fixed bound");
  stats.restoreCheckpoint({ statsHits: "1002", statsSoul: Infinity, statsCombo: "99", statsBestCombo: NaN });
  assertEqual(stats.captureCheckpoint(), { statsHits: "0".repeat(50), statsSoul: 0, statsCombo: 4, statsBestCombo: 4 }, "malformed values cannot inject NaN, Infinity, a string balance or invalid accuracy samples");
  stats.restoreCheckpoint({ statsSoul: 1e12, statsCombo: 1e99, statsBestCombo: -2 });
  assertEqual([stats.getSoul(), stats.getCombo(), stats.getBestCombo()], [100, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], "untrusted finite balances stay inside their supported ranges");
  stats.record(true); stats.record(true); assert(stats.getCPM() > 0, "new keys produce a fresh speed sample");
  stats.restoreCheckpoint({ statsHits: [], statsSoul: null });
  assertEqual(stats.getCPM(), 0, "even partial restoration discards the previous wall-clock speed history");
});

// The real invoker constructor, transitions, poll and fire execute against a
// minimal drawing shell. This checks card ownership and target registration,
// rather than merely checking source strings or a parallel state machine.
const invokerUrl = new URL("../src/game/oneShotInvoker.ts", import.meta.url);
const invokerSource = ts.createSourceFile(invokerUrl.pathname, readFileSync(invokerUrl, "utf8"), ts.ScriptTarget.Latest, true);
const invokerOwner = invokerSource.statements.find(ts.isClassDeclaration)!;
const invokerNames = ["getSpent", "markSpent", "poll", "becomeReady", "becomeCharging", "fire", "setWidgetVisible", "drawBar", "updateChargeWake", "destroy"];
const declarations = invokerSource.statements.filter(ts.isVariableStatement).map(statement => statement.getText(invokerSource)).join("\n");
const invokerCode = ts.transpileModule(`${declarations}\nclass Invoker { ${invokerOwner.members
  .filter(member => ts.isPropertyDeclaration(member) || ts.isConstructorDeclaration(member) || (member.name && invokerNames.includes(member.name.getText(invokerSource))))
  .map(member => member.getText(invokerSource)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function graphic(): any {
  return { alpha: 1, text: "", destroyed: false,
    setAlpha(value: number) { this.alpha = value; return this; }, setScale() { return this; },
    setText(value: string) { this.text = value; return this; }, setColor() { return this; },
    clear() { return this; }, fillStyle() { return this; }, fillRoundedRect() { return this; },
    destroy() { this.destroyed = true; } };
}
function invokerFixture(options: { available?: OffensiveOneShot[]; initialSpent?: OffensiveOneShot[]; soul?: number; active?: boolean } = {}) {
  const registered: any[] = [], unregistered: any[] = [], created: any[] = [], announcements: string[] = [], pulses: string[] = [];
  const effects: OffensiveOneShot[] = [], timers: any[] = [], draws: any[] = [];
  let soul = options.soul ?? 100, active = options.active ?? true;
  const globals = { INVOCATIONS, isSingleTargetOneShot, pickHardestEnemy, PALETTE: { dim: "#888", brass: "#bbb" }, PALETTE_HEX: { ember: 1, brass: 2 },
    TextWordTarget: class { options: any; destroyed = false; constructor(options: any) { this.options = options; created.push(this); } playEntryWake() {} destroy() { this.destroyed = true; } },
  };
  const Invoker = new Function(...Object.keys(globals), `${invokerCode}; return Invoker;`)(...Object.values(globals));
  Invoker.prototype.buildWidget = function(effect: OffensiveOneShot, x: number, y: number) {
    const widget = { effect, container: graphic(), titleText: graphic(), placeholder: graphic(), barBg: graphic(), barFill: graphic(), readyRail: graphic(),
      wordX: x, wordY: y, state: "charging", target: null, announcedReady: false, pulse: null, lastCardPulseAt: -Infinity, lastChargeTier: -1, wasVisible: false };
    draws.push(widget); return widget;
  };
  Invoker.prototype.pulseCard = (_widget: unknown, kind: string) => pulses.push(kind);
  const invoker = new Invoker({
    scene: { scale: { width: 1920, height: 1080 }, time: { addEvent(options: any) { const timer = { ...options, removed: false, remove() { this.removed = true; } }; timers.push(timer); return timer; } },
      tweens: { killTweensOf() {}, add() { return { stop() {} }; } } },
    typingInput: { register: (target: any) => registered.push(target), unregister: (target: any) => unregistered.push(target), hasClaim: () => false },
    available: options.available ?? ["toll-strike", "jam-foe"], initialSpent: options.initialSpent,
    cost: 50, getSoul: () => soul, spendSoul(cost: number) { if (soul < cost) return false; soul -= cost; return true; },
    getThreats: () => [{ enemy: "scroll", progress: .5, wordLength: 8 }],
    applyEffect: (effect: OffensiveOneShot) => effects.push(effect), isActive: () => active,
    announce: (text: string) => announcements.push(text), compact: true,
  });
  return { invoker, registered, unregistered, created, announcements, pulses, effects, timers, draws, soul: () => soul,
    setActive(value: boolean) { active = value; }, setSoul(value: number) { soul = value; } };
}

await suite("checkpoint one-shots: restored spent cards remain silent, visible and unavailable at full fuel", () => {
  const f = invokerFixture({ initialSpent: ["toll-strike", "jam-foe"] });
  assertEqual(f.invoker.getSpent(), ["toll-strike", "jam-foe"], "constructor restores both existing spent effects");
  assertEqual(f.created, [], "full fuel cannot register an invocation target for a spent card");
  assertEqual(f.announcements, [], "restoring spent cards does not repeat spend or ready announcements");
  assertEqual(f.pulses, [], "restoring cards does not replay their entry or spend bursts");
  assert(f.draws.every(widget => widget.placeholder.text === "— spent —" && widget.wasVisible), "restored cards visibly retain spent status during an encounter");
  const copy = f.invoker.getSpent(); copy.length = 0;
  assertEqual(f.invoker.getSpent().length, 2, "callers cannot mutate the invoker's state via the exported list");
  f.invoker.poll(); f.invoker.fire(f.draws[0]);
  assertEqual([f.effects.length, f.soul(), f.registered.length], [0, 100, 0], "even a stale completion cannot fire a restored charge");
  f.setActive(false); f.invoker.poll(); assert(f.draws.every(widget => !widget.wasVisible), "spent cards still obey the ordinary between-encounter visibility gate");
  f.invoker.destroy(); assert(f.timers[0].removed && f.draws.every(widget => widget.container.destroyed), "shutdown releases restored card widgets and polling");
});

await suite("checkpoint one-shots: unspent cards retain ordinary charge, native invocation and once-only spend", () => {
  const f = invokerFixture({ initialSpent: ["toll-strike"] });
  assertEqual(f.registered.length, 1, "the unspent card alone registers a native invocation");
  assertEqual(f.created[0].options.word, "jam", "fresh card keeps its canonical invocation word");
  assertEqual(f.announcements, [INVOCATIONS["jam-foe"].readyCue], "fresh card announces readiness normally");
  f.created[0].options.onComplete();
  assertEqual([f.effects, f.soul(), f.invoker.getSpent()], [["jam-foe"], 50, ["toll-strike", "jam-foe"]], "native completion spends Soul and commits the pending effect once");
  assertEqual(f.announcements.at(-1), INVOCATIONS["jam-foe"].spentCue, "new spending still emits its normal cue");
  f.created[0].options.onComplete(); f.invoker.poll();
  assertEqual([f.effects.length, f.soul(), f.registered.length], [1, 50, 1], "duplicate completion or polling cannot recharge a spent effect");
  f.invoker.destroy();
  const empty = invokerFixture({ available: [], initialSpent: ["toll-strike"] });
  assertEqual([empty.invoker.getSpent(), empty.timers, empty.created], [[], [], []], "empty loadouts stay inert despite unrelated saved effect names");
  empty.invoker.destroy();
});

await suite("checkpoint one-shots: fresh cards still require charge and a newly spent live target is removed", () => {
  const f = invokerFixture({ available: ["toll-strike"], soul: 0 });
  assertEqual(f.created.length, 0, "an uncharged card has no native word target");
  f.setSoul(100); f.invoker.poll(); assertEqual(f.created.length, 1, "fuel crossing the existing threshold arms the original card");
  f.invoker.markSpent(f.draws[0]);
  assertEqual([f.unregistered.length, f.created[0].destroyed, f.draws[0].target], [1, true, null], "markSpent releases the registered target and destroys its live word");
  f.invoker.destroy();
});

await suite("checkpoint schema v3: all five realms survive the actual backend and route to their exact scene", async () => {
  assertEqual(CURRENT_SCHEMA_VERSION, 3, "new checkpoints use schema version 3");
  for (const [scene, realm] of Object.entries(CHECKPOINT_REALMS) as Array<[Exclude<SaveCheckpoint["scene"], "OpeningScene">, string]>) {
    let stored: string | null = null;
    const backend = { async load() { return stored === null ? null : migrate(JSON.parse(stored)); }, async save(state: SaveState) { stored = JSON.stringify(state); } };
    const state = { ...emptySave(), typewriterAwakened: true };
    const store = new SaveStore(backend, state, { saveDelayMs: 60000 });
    const checkpoint = { scene, step: "a-safe-boundary", data: { statsHits: "1011", statsSoul: 12.5, statsCombo: 2, statsBestCombo: 9, usedOneShots: "toll-strike", index: 2, reading: true, optional: null } };
    store.update(save => { save.realms[realm] = { cleared: false, choices: { fork1: "committed-route" } }; });
    store.setCheckpoint(checkpoint); await store.flush();
    const reopened = await SaveStore.load(backend, { saveDelayMs: 60000 });
    assertEqual(reopened.get().checkpoint, checkpoint, `${realm} retains its exact flat payload after write/load/migration`);
    assertEqual(titleCheckpoint(reopened.get()), checkpoint, `${realm} returns its own scene for Title Continue`);
    assertEqual(reopened.get().realms[realm].choices.fork1, "committed-route", "checkpoint persistence does not invent or erase committed branch data");
    reopened.update(save => { save.realms[realm].cleared = true; }); await reopened.flush();
    const cleared = await SaveStore.load(backend);
    assertEqual(cleared.get().checkpoint, null, `${realm} completion invalidates its stale checkpoint`);
    assertEqual(titleCheckpoint(cleared.get()), null, "a cleared realm never steals the ordinary hub route");
  }
});

await suite("checkpoint migration: v2 journeys and older Winter markers retain identity, inventory and choices", () => {
  const old = { ...emptySave("Aiden"), schemaVersion: 2, typewriterAwakened: true, runId: "existing-family-run", wrenGender: "boy",
    realms: { "winter-mountain": { cleared: true, choices: { fork1: "huntress", fork2: "bury" } }, "sunken-bell": { cleared: false, choices: { fork1: "chant" } } },
    satchel: ["hunters-horn", "quiet-chant"], almanacLore: ["the-huntress"], keyStats: { a: { hits: 10, misses: 2 } },
    difficulty: "forgiving", textScale: "large", reducedMotion: true };
  const migrated = migrate(JSON.parse(JSON.stringify(old)));
  assertEqual(migrated.schemaVersion, 3, "v2 data upgrades without a fresh run");
  for (const key of ["runId", "profileName", "wrenGender", "realms", "satchel", "almanacLore", "keyStats", "difficulty", "textScale", "reducedMotion"] as const) {
    assertEqual(migrated[key], old[key], `migration preserves existing ${key}`);
  }
  assertEqual([migrated.checkpoint, titleCheckpoint(migrated)], [null, null], "old later realms without markers keep their existing hub start");
  const winter = migrate({ ...old, realms: {}, checkpoint: { scene: "WinterMountainScene", step: "trail", data: { index: 2, soul: 37, candles: 3 } } });
  assertEqual(winter.checkpoint?.data, { index: 2, soul: 37, candles: 3 }, "existing Winter checkpoint fields survive byte-for-byte");
  assertEqual(titleCheckpoint(winter)?.scene, "WinterMountainScene", "old Winter checkpoint still routes normally");
  assertEqual(migrate({ ...old, typewriterAwakened: false, checkpoint: { scene: "SkyIslandScene", step: "boss", data: {} } }).checkpoint, null, "reset opening state cannot reopen a later realm");
  let rejected = false;
  try { validateCheckpoint({ scene: "SkyIslandScene", step: "boss", data: { nested: { resource: 1 } } }); } catch { rejected = true; }
  assert(rejected, "schema v3 continues to reject nested checkpoint data instead of silently dropping it");
});
