import { readFileSync } from "node:fs";
import ts from "typescript";
import EventEmitter from "eventemitter3";
import { assert, assertEqual, suite } from "./_assert";

// Execute the actual arrival, navigation and lifetime code. Only display,
// clock and tween surfaces are inert; the cancellation/settling policy is not
// copied into this fixture.
const path = new URL("../src/scenes/PortalChamberScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["init", "walkWrenTo", "settleHubArrival", "playHubArrivalMaterialize"];
const methods = names.map(name => owner.members.find(member => member.name?.getText(source) === name)!.getText(source));
const fields = owner.members.filter(member => ts.isPropertyDeclaration(member)
  && ["hubArrivalEpoch", "hubArrivalInFlight"].includes(member.name.getText(source))).map(member => member.getText(source));
const create = owner.members.find(member => member.name?.getText(source) === "create") as ts.MethodDeclaration;
const shutdown = create.body!.statements.find(statement => statement.getText(source)
  .startsWith("this.events.once(Phaser.Scenes.Events.SHUTDOWN,") && statement.getText(source).includes("this.settleHubArrival()"));
assert(shutdown, "the actual scene shutdown owns arrival cleanup");
const constants = source.statements.filter(ts.isVariableStatement).filter(statement => statement.declarationList.declarations
  .some(declaration => declaration.name.getText(source) === "WREN_Y")).map(statement => statement.getText(source));
const code = ts.transpileModule(`${constants.join("\n")}\nclass Hub {
  ${fields.join("\n")}
  ${methods.join("\n")}
  bindShutdown() { ${shutdown!.getText(source)} }
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
const Hub = new Function("Phaser", "PRESENTATION_CHANGED", "setWrenPose", "playWrenFocus", "addIdleBreath", "playSceneEventPulse", code + "; return Hub;")(
  { Scenes: { Events: { SHUTDOWN: "shutdown", RESUME: "resume" } } }, "presentation-changed",
  (sprite: any, pose: string, left = false) => { sprite.pose = pose; sprite.left = left; },
  (sprite: any) => sprite.onFocus(), (scene: any) => scene.breaths++, (scene: any) => scene.pulses++,
);

interface Body {
  active: boolean; x: number; y: number; alpha: number; scaleX: number; scaleY: number;
  setPosition(x: number, y: number): Body;
  setAlpha(alpha: number): Body;
  setScale(scale: number): Body;
}
const body = (): Body => ({
  active: true, x: 990, y: 1000, alpha: 1, scaleX: 1, scaleY: 1,
  setPosition(x, y) { this.x = x; this.y = y; return this; },
  setAlpha(alpha) { this.alpha = alpha; return this; },
  setScale(scale) { this.scaleX = this.scaleY = scale; return this; },
});
const fit = (actor: Body) => [actor.x, actor.y, actor.alpha, actor.scaleX, actor.scaleY];
function fixture(reducedMotion = false) {
  let now = 0;
  const timers: any[] = [], tweens: any[] = [];
  const hub = new Hub();
  const store = { get: () => ({ reducedMotion }) };
  Object.assign(hub, {
    store, wrenContainer: body(), wrenSprite: { active: true, onFocus: () => hub.focuses++ }, pulses: 0, focuses: 0, breaths: 0,
    events: new EventEmitter(), input: { keyboard: { off: noop } }, typingInput: { reset: noop },
    clearPersistentStationWordAnchors: noop,
    time: { delayedCall(ms: number, callback: () => void) {
      const timer = { ms, at: now + ms, callback, removed: false, fired: false,
        remove() { this.removed = true; } };
      timers.push(timer); return timer;
    } },
    tweens: {
      killTweensOf(target: Body) { for (const tween of tweens) if (tween.targets === target) tween.removed = true; },
      add(config: any) {
        const start = Object.fromEntries(["x", "y", "alpha", "scaleX", "scaleY"].filter(key => key in config)
          .map(key => [key, config.targets[key]]));
        const tween = { ...config, at: now, start, removed: false, finished: false, remove() { this.removed = true; } };
        tweens.push(tween); return tween;
      },
    },
  });
  const advance = (to: number): void => {
    // Advance a generic numeric tween surface; no arrival-specific behavior.
    while (timers.some(timer => !timer.removed && !timer.fired && timer.at <= to)) {
      const next = timers.filter(timer => !timer.removed && !timer.fired && timer.at <= to).sort((a, b) => a.at - b.at)[0];
      now = next.at; next.fired = true; next.callback();
    }
    now = to;
    for (const tween of [...tweens]) {
      if (tween.removed || tween.finished) continue;
      const t = Math.min(1, (now - tween.at) / tween.duration);
      for (const [key, start] of Object.entries(tween.start)) tween.targets[key] = (start as number) + (tween[key] - (start as number)) * t;
      if (t === 1) { tween.finished = true; tween.onComplete?.(); }
    }
  };
  return { hub, store, timers, tweens, advance };
}

await suite("Hub arrival: early zone navigation settles the actual half-materialized body before walking", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced);
    f.hub.playHubArrivalMaterialize(461, 0xc8a85f);
    assertEqual(f.timers[0].ms, 150, "the original arrival delay remains unchanged");
    f.advance(300);
    const arrival = f.tweens[0];
    assertEqual(arrival.duration, 460, "the original materialization duration remains unchanged");
    assert(f.hub.wrenContainer.alpha > 0 && f.hub.wrenContainer.alpha < 1, "the real arrival is partway through its fade");
    f.hub.walkWrenTo(420, true);
    assertEqual(fit(f.hub.wrenContainer), [990, 1000, 1, 1, 1], "navigation immediately restores floor contact, opacity and scale");
    assert(arrival.removed, "navigation removes the owned materialization tween");
    assertEqual(f.tweens.at(-1).duration, 600, "walking keeps its existing duration and starts without a new gate");
    arrival.onComplete();
    assertEqual([f.hub.focuses, f.hub.breaths], [0, 0], "a late arrival completion cannot replace the navigation pose or start another idle");
    f.advance(900);
    assertEqual(fit(f.hub.wrenContainer), [420, 1000, 1, 1, 1], "the real walk finishes fully visible on the station floor");
    assertEqual(f.hub.wrenSprite.pose, "front", "the station keeps its original resting pose");
  }
});

await suite("Hub arrival: navigation before the delayed wake invalidates even an already-queued old callback", () => {
  const f = fixture();
  f.hub.playHubArrivalMaterialize(1459, 0xc8a85f);
  const pending = f.timers[0];
  f.advance(80);
  f.hub.walkWrenTo(1510, true);
  assert(pending.removed, "the pending arrival timer is removed before its wake");
  pending.callback();
  assertEqual([f.hub.pulses, f.tweens.length], [0, 1], "a stale delayed callback creates neither pulse nor competing tween");
  f.advance(680);
  assertEqual(fit(f.hub.wrenContainer), [1510, 1000, 1, 1, 1], "shelf navigation never inherits an invisible or shrunken arrival");
});

await suite("Hub arrival: settled departure ownership cannot be overwritten by late arrival or repeated settling", () => {
  const f = fixture();
  f.hub.playHubArrivalMaterialize(461, 0xc8a85f);
  f.advance(300);
  const arrival = f.tweens[0];
  f.hub.settleHubArrival();
  assertEqual(fit(f.hub.wrenContainer), [990, 1000, 1, 1, 1], "the departure entry point can synchronously finish arrival");
  f.hub.wrenContainer.setPosition(461, 696).setAlpha(.18).setScale(.9);
  const departing = fit(f.hub.wrenContainer);
  f.hub.settleHubArrival(); arrival.onComplete();
  assertEqual(fit(f.hub.wrenContainer), departing, "idempotent cleanup never snaps a later portal or utility departure back to the hub floor");
  assertEqual([f.hub.focuses, f.hub.breaths], [0, 0], "late completion cannot revive a departing actor's idle");
});

await suite("Hub arrival lifetime: actual init and shutdown invalidate callbacks across the same scene's reuse", () => {
  for (const end of ["init", "shutdown"] as const) {
    const f = fixture();
    f.hub.bindShutdown();
    f.hub.playHubArrivalMaterialize(461, 0xc8a85f);
    f.advance(300);
    const oldTimer = f.timers[0], oldTween = f.tweens[0];
    if (end === "init") f.hub.init({ store: f.store, arrival: "sky-island" });
    else f.hub.events.emit("shutdown");
    assert(oldTween.removed && !f.hub.hubArrivalInFlight, `${end} clears its owned arrival tween and state`);
    f.hub.wrenContainer = body(); f.hub.wrenSprite = { active: true, onFocus: () => f.hub.focuses++ };
    f.hub.playHubArrivalMaterialize(1209, 0xc8a85f);
    const fresh = fit(f.hub.wrenContainer), before = [f.hub.pulses, f.hub.focuses, f.hub.breaths, f.tweens.length];
    oldTimer.callback(); oldTween.onComplete();
    assertEqual(fit(f.hub.wrenContainer), fresh, `${end}'s old callbacks cannot alter the new actor`);
    assertEqual([f.hub.pulses, f.hub.focuses, f.hub.breaths, f.tweens.length], before, `${end}'s old callbacks cannot steal the new arrival`);
    f.advance(910);
    assertEqual(fit(f.hub.wrenContainer), [990, 1000, 1, 1, 1], "the new arrival still completes normally");
    assertEqual([f.hub.focuses, f.hub.breaths], [1, 1], "only the current arrival starts its attention and idle");
  }
});
