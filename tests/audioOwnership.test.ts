import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { SoundscapePlayer } from "../src/audio/soundscapePlayer";
import { acknowledgeGameInterruption, installGameInterruptionTracker, needsInterruptionPause } from "../src/game/sceneInterruption";
import { assert, assertEqual, suite } from "./_assert";

class BrowserEvents extends EventEmitter {
  hidden = false;
  addEventListener(event: string, callback: (...args: any[]) => void) { this.on(event, callback); }
  removeEventListener(event: string, callback: (...args: any[]) => void) { this.off(event, callback); }
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function compile(file: string, bindings: Record<string, unknown>) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/audio/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const body = source.statements.filter(statement => !ts.isImportDeclaration(statement))
    .map(statement => statement.getText(source).replace(/^export\s+/, "")).join("\n");
  const code = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return { ${file === "soundscapes.ts" ? "installSoundscape, soundscapeStatus" : "getAudioContext, getMasterGain, setAudioLevel, unlockAudio"} };`)(...Object.values(bindings));
}
function parameter() {
  return { value: 1, events: [] as any[], cancelScheduledValues(time: number) { this.events.push(["cancel", time]); },
    setValueAtTime(value: number, time: number) { this.value = value; this.events.push(["set", value, time]); },
    linearRampToValueAtTime(value: number, time: number) { this.events.push(["ramp", value, time]); } };
}
async function withWorld(work: (world: any) => Promise<void>) {
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = new BrowserEvents(), window = new BrowserEvents(), sources: any[] = [], requests: any[] = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  const master = { gain: parameter(), name: "shared-master" };
  let defer = false, fail = false;
  const context = { currentTime: 0, decodeCalls: 0,
    decodeAudioData: async (_bytes: ArrayBuffer) => { context.decodeCalls++; return { duration: 20 }; },
    createGain() { return { gain: parameter(), connections: [] as any[], connect(target: any) { this.connections.push(target); }, disconnect() {} }; },
    createBufferSource() {
      const source: any = { started: false, stopped: false, connections: [], onended: null,
        connect(target: any) { this.connections.push(target); }, disconnect() {},
        start(_when?: number, offset = 0) { this.started = true; this.offset = offset; },
        stop() { if (this.stopped) return; this.stopped = true; this.onended?.(); },
      }; sources.push(source); return source;
    },
  };
  const fetch = (url: string) => new Promise((resolve, reject) => {
    const request = { url, resolve, reject, settled: false }; requests.push(request);
    if (!defer) { request.settled = true; resolve({ ok: !fail, arrayBuffer: async () => new ArrayBuffer(1) }); }
  });
  const facade = compile("soundscapes.ts", {
    SoundscapePlayer, getAudioContext: () => context, getMasterGain: () => master, needsInterruptionPause,
    document, window, fetch, home: "/home.mp3", winter: "/winter.mp3", hearth: "/hearth.mp3",
    wind: "/wind.mp3", stream: "/stream.mp3", snow: "/snow.mp3", wood: "/wood.mp3",
    stone: "/stone.mp3", bough: "/bough.mp3", flame: "/flame.mp3",
    bellTheme: "/bell-theme.mp3", bellClearTheme: "/bell-clear-theme.mp3",
    bellWater: "/bell-water.mp3", bellMasonry: "/bell-masonry.mp3",
    bellLantern: "/bell-lantern.mp3", bellLatch: "/bell-latch.mp3",
    bellRubble: "/bell-rubble.mp3", bellRelease: "/bell-release.mp3",
    forgeTheme: "/forge-theme.mp3", forgeClearTheme: "/forge-clear-theme.mp3",
    forgeFurnace: "/forge-furnace.mp3", forgeMechanism: "/forge-mechanism.mp3",
    forgeWheel: "/forge-wheel.mp3", forgeLock: "/forge-lock.mp3",
    forgeGear: "/forge-gear.mp3", forgeFlame: "/forge-flame.mp3",
    skyTheme: "/sky-theme.mp3", skyClearTheme: "/sky-clear-theme.mp3",
    skyWind: "/sky-wind.mp3", skyPaper: "/sky-paper.mp3",
    skyStone: "/sky-stone.mp3", skyLantern: "/sky-lantern.mp3",
    skyBook: "/sky-book.mp3", skyTether: "/sky-tether.mp3",
    woodTheme: "/wood-theme.mp3", woodClearTheme: "/wood-clear-theme.mp3",
    woodAir: "/wood-air.mp3", woodLeaves: "/wood-leaves.mp3",
    woodRoot: "/wood-root.mp3", woodStone: "/wood-stone.mp3",
    woodLantern: "/wood-lantern.mp3", woodSeal: "/wood-seal.mp3",
    finaleTheme: "/finale-theme.mp3", finaleAir: "/finale-air.mp3", homecomingTheme: "/homecoming-theme.mp3",
  });
  const game: any = { events: new EventEmitter(), loop: { inFocus: true } };
  const disposeTracker = installGameInterruptionTracker(game);
  const scenes: any[] = [];
  const world = { ...facade, document, window, context, master, game, sources, requests,
    active: () => sources.filter(source => source.started && !source.stopped),
    defer(value: boolean) { defer = value; }, fail(value: boolean) { fail = value; },
    scene(key: string) { let paused = false;
      const scene = { game, events: new EventEmitter(), scene: { key }, sys: { isPaused: () => paused },
        pause() { paused = true; this.events.emit("pause"); },
        resume() { paused = false; this.events.emit("resume"); } };
      scenes.push(scene); return scene;
    },
    async resolveAll() {
      for (const request of requests) if (!request.settled) {
        request.settled = true; request.resolve({ ok: !fail, arrayBuffer: async () => new ArrayBuffer(1) });
      }
      await settle();
    },
  };
  try { await work(world); }
  finally {
    for (const scene of scenes) scene.events.emit("shutdown");
    disposeTracker();
    if (documentBefore) Object.defineProperty(globalThis, "document", documentBefore);
    else delete (globalThis as any).document;
  }
}

await suite("Audio ownership: scene pause preserves silent preferences and resume owns one current mood", async () => withWorld(async w => {
  const scene = w.scene("OpeningScene"), handle = w.installSoundscape(scene, "home"); await settle();
  assertEqual([w.active().length, handle.status().mood], [2, "home"], "Opening owns its two authored music/environment layers");
  assert(w.active().every((source: any) => source.connections[0].connections[0] === w.master), "every scene source remains behind the common sound preference gain");
  scene.pause(); assertEqual([handle.status().paused, w.active()], [true, []], "pausing the real owner stops its sources");
  const count = w.sources.length, requested = w.requests.length;
  for (const level of [0, .25, .6, 1]) {
    w.master.gain.setValueAtTime(level, w.context.currentTime);
    handle.setMood("winter-trail"); handle.cue("snow");
  }
  await settle();
  assertEqual([w.sources.length, w.requests.length], [count, requested], "mix/preference changes and cues while paused cannot start a source or decode");
  scene.resume(); await settle();
  assertEqual([w.active().length, handle.status().mood], [3, "winter-trail"], "resume starts only the latest requested mood");
  scene.events.emit("resume"); scene.events.emit("wake"); await settle();
  assertEqual(w.active().length, 3, "repeated resume/wake cannot overlap a second soundscape");
}));

await suite("Bell audio ownership: rhythm and clapper aftermath remove the score without replacing the water playhead", async () => withWorld(async w => {
  const scene = w.scene("SunkenBellScene"), handle = w.installSoundscape(scene, "bell-depths"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["bell-theme", "bell-water", "bell-masonry"], "exploration owns its score and underwater layers");
  assert(w.requests.every((request: any) => request.url.startsWith("/bell-")), "Bell prefetch does not fetch unrelated Winter material sounds");
  w.context.currentTime = 13;
  handle.setMood("bell-rhythm"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["bell-water"], "rhythm has no competing score or masonry layer");
  assertEqual(handle.status().layers[0].offset, 13, "the continuing water playhead does not restart on a rhythm transition");
  handle.setMood("bell-rest"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["bell-water", "bell-clear-theme"], "aftermath gains its warmer score");
  handle.setMood("bell-silence"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["bell-water"], "taking the clapper removes every musical layer");
  scene.pause(); const count = w.sources.length;
  handle.cue("bell-rubble"); await settle();
  assertEqual([w.sources.length, w.active().length], [count, 0], "a paused Bell owner cannot play or queue an action cue");
  scene.resume(); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["bell-water"], "resume cannot restore the discarded score");
}));

await suite("Forge audio ownership: branch levels retain playheads and an obeyed order removes mechanism sources", async () => withWorld(async w => {
  const scene = w.scene("ClockworkForgeScene"), handle = w.installSoundscape(scene, "forge-workshop"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["forge-theme", "forge-furnace", "forge-mechanism"], "working foundry owns its score and two physical environment layers");
  assert(w.requests.every((request: any) => request.url.startsWith("/forge-")), "Forge prefetch does not request another realm's material sounds");
  assertEqual(w.requests.filter((request: any) => ["/forge-wheel.mp3", "/forge-lock.mp3", "/forge-gear.mp3", "/forge-flame.mp3"].includes(request.url)).length, 4, "the owner prefetches its four short physical cues exactly once");
  w.context.currentTime = 11;
  const before = w.sources.length; handle.setMood("forge-workshop-slow"); await settle();
  assertEqual(w.sources.length, before, "lowering a closed valve changes existing gains without restarting a score or furnace");
  assert(handle.status().layers.every((layer: any) => layer.offset === 11), "the quieter branch preserves every existing buffer position");
  handle.setMood("forge-rest-slow"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["forge-furnace", "forge-mechanism", "forge-clear-theme"], "aftermath replaces only the musical theme while continuing its environment");
  const furnace = handle.status().layers.find((layer: any) => layer.id === "forge-furnace");
  handle.setMood("forge-still-slow"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["forge-furnace", "forge-clear-theme"], "an obeyed command removes the mechanism instead of merely making moving machinery quieter");
  assertEqual(handle.status().layers.find((layer: any) => layer.id === "forge-furnace").offset, furnace.offset, "stopping machinery does not restart the continuing low furnace");
  scene.pause(); const count = w.sources.length; handle.cue("forge-lock"); await settle();
  assertEqual([w.sources.length, w.active().length], [count, 0], "a paused Forge owner cannot play or queue a metal-settling cue");
  scene.resume(); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["forge-furnace", "forge-clear-theme"], "resume cannot reintroduce the stopped mechanism");
}));

await suite("Sky audio ownership: quiet action mixes retain wind playheads and freed wind omits paper without defeating pause", async () => withWorld(async w => {
  const scene = w.scene("SkyIslandScene"), handle = w.installSoundscape(scene, "sky-terrace"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["sky-theme", "sky-wind", "sky-paper"], "the arrival owns its open-air theme and two soft environmental layers");
  assert(w.requests.every((request: any) => request.url.startsWith("/sky-")), "Sky prefetch remains in its own realm rather than loading unrelated materials");
  assertEqual(w.requests.filter((request: any) => ["/sky-stone.mp3", "/sky-lantern.mp3", "/sky-book.mp3", "/sky-tether.mp3"].includes(request.url)).length, 4, "the owner prefetches its four live action cues exactly once");
  w.context.currentTime = 11;
  const before = w.sources.length; handle.setMood("sky-library"); await settle();
  assertEqual(w.sources.length, before, "a quieter conversation changes gains without restarting score, wind or paper");
  assert(handle.status().layers.every((layer: any) => layer.offset === 11), "the quieter scene retains every continuing playhead");
  handle.setMood("sky-threat"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["sky-theme", "sky-wind"], "a timed spirit/scroll encounter drops paper movement around the existing feedback");
  handle.setMood("sky-rest-dim"); await settle();
  const wind = handle.status().layers.find((layer: any) => layer.id === "sky-wind");
  handle.setMood("sky-freed-dim"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["sky-wind", "sky-clear-theme"], "a completed tether release leaves clear score and open wind without paper movement");
  assertEqual(handle.status().layers.find((layer: any) => layer.id === "sky-wind").offset, wind.offset, "freed wind changes an existing layer gain without resetting its position");
  scene.pause(); const count = w.sources.length; handle.cue("sky-tether"); await settle();
  assertEqual([w.sources.length, w.active().length], [count, 0], "a paused Sky owner cannot start or queue a live tether cue");
  scene.resume(); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["sky-wind", "sky-clear-theme"], "resume retains the actual freed outcome instead of returning to arrival paper");
}));

await suite("Audio ownership: hidden creation and focus return never autoplay before deliberate acknowledgment", async () => withWorld(async w => {
  w.document.hidden = true;
  w.game.events.emit("hidden");
  const scene = w.scene("WinterMountainScene"), handle = w.installSoundscape(scene, "winter-trail"); await settle();
  assertEqual([handle.status().paused, w.sources.length, w.requests.filter((request: any) => ["/winter.mp3", "/wind.mp3", "/stream.mp3"].includes(request.url))], [true, 0, []], "a scene finishing load in a hidden tab starts no sources or music requests; optional small material prefetches remain silent");
  const prefetched = w.requests.length;
  w.document.hidden = false; w.document.emit("visibilitychange"); w.game.events.emit("visible"); w.game.events.emit("focus");
  scene.resume(); await settle();
  assertEqual([w.requests.length, w.active()], [prefetched, []], "a resume event while interruption remains pending cannot bypass its explicit pause");
  acknowledgeGameInterruption(w.game); scene.resume(); await settle();
  assertEqual(w.active().length, 3, "deliberate acknowledgment permits the original current mood exactly once");
  w.game.events.emit("blur"); w.game.events.emit("hidden");
  assertEqual(w.active(), [], "paired hidden/blur immediately silence the current owner");
  w.game.events.emit("focus"); w.game.events.emit("visible"); scene.events.emit("wake"); await settle();
  assertEqual(w.active(), [], "returning focus or waking cannot clear a later interruption");
}));

await suite("Audio ownership: latest scene wins pending loads and stale scene shutdown cannot stop its successor", async () => withWorld(async w => {
  w.defer(true);
  const opening = w.scene("OpeningScene"), old = w.installSoundscape(opening, "home");
  const winter = w.scene("WinterMountainScene"), current = w.installSoundscape(winter, "winter-trail");
  assertEqual([old.status().stopped, old.status().layers], [true, []], "installing the next scene retires the prior owner before its decodes finish");
  await w.resolveAll();
  assertEqual(w.active().length, 3, "late Opening loads cannot play alongside the new Winter scene");
  assertEqual(w.soundscapeStatus().scene, "WinterMountainScene", "read-only status follows only the latest owner");
  const requests = w.requests.length;
  old.setMood("home"); old.cue("wood"); opening.events.emit("shutdown"); opening.events.emit("destroy"); await settle();
  assertEqual([w.requests.length, w.active().length, w.soundscapeStatus().scene], [requests, 3, "WinterMountainScene"], "stale controls and repeated old cleanup cannot affect the successor");
  current.stop(); current.stop();
  assertEqual([w.active(), w.soundscapeStatus()], [[], null], "the current stop is idempotent and releases public ownership");
}));

await suite("Audio ownership: shutdown and destroy release listeners, pending cues and future callbacks", async () => withWorld(async w => {
  w.defer(true);
  const scene = w.scene("OpeningScene"), handle = w.installSoundscape(scene, "home");
  handle.cue("wood");
  assertEqual([scene.events.listenerCount("pause"), scene.events.listenerCount("resume"), w.window.listenerCount("pagehide"), w.document.listenerCount("visibilitychange")], [1, 1, 1, 1], "one active owner installs one set of lifecycle hooks");
  scene.events.emit("shutdown"); scene.events.emit("destroy"); handle.stop(); await w.resolveAll();
  assertEqual([w.sources.length, w.soundscapeStatus(), scene.events.eventNames()], [0, null, []], "decoded loops/cues cannot resurrect a shutdown owner and every scene listener is removed");
  assertEqual([w.window.listenerCount("pagehide"), w.document.listenerCount("visibilitychange")], [0, 0], "cleanup removes both browser hooks");
  assertEqual([w.game.events.listenerCount("blur"), w.game.events.listenerCount("hidden")], [1, 1], "only the pre-existing game interruption tracker remains");
  scene.events.emit("resume"); w.window.emit("pagehide"); await settle();
  assertEqual(w.sources, [], "late lifecycle events have no stopped owner to restart");
  w.defer(false);
  const restart = w.scene("OpeningScene"); w.installSoundscape(restart, "home"); await settle();
  assertEqual(w.active().length, 2, "a fresh visit may reuse decoded buffers without retaining the stopped visit");
  w.window.emit("pagehide"); assertEqual(w.active(), [], "pagehide pauses the fresh soundscape even before another engine event");
  w.window.emit("pageshow"); w.game.events.emit("focus"); assertEqual(w.active(), [], "browser restoration alone does not restart scene audio");
}));

await suite("Audio ownership: failed optional assets are evicted so a later scene can retry", async () => withWorld(async w => {
  w.fail(true);
  const opening = w.scene("OpeningScene"), old = w.installSoundscape(opening, "home"); await settle();
  assertEqual([w.active(), old.status().layers.map((value: any) => value.failed)], [[], [true, true]], "failed requests remain optional and cannot create incomplete sources");
  const requests = w.requests.length; w.fail(false);
  w.installSoundscape(w.scene("OpeningScene"), "home"); await settle();
  assertEqual([w.requests.length - requests, w.active().length], [2, 2], "re-entry retries both failed URLs instead of caching their rejected promises forever");
}));

await suite("Audio context: saved levels do not unlock autoplay and denied gestures can retry safely", async () => {
  const window = new BrowserEvents(), document = new BrowserEvents(), navigator = { userActivation: { isActive: false } };
  let created = 0, resumeCalls = 0, deny = true;
  class Context {
    state = "suspended"; currentTime = 2; destination = {}; gains: any[] = [];
    constructor() { created++; }
    createGain() { const gain = { gain: parameter(), destination: null as any, connect(destination: any) { this.destination = destination; } }; this.gains.push(gain); return gain; }
    resume() { resumeCalls++; if (deny) return Promise.reject(new Error("fixture autoplay denied")); this.state = "running"; return Promise.resolve(); }
  }
  (window as any).AudioContext = Context;
  const audio = compile("context.ts", { window, document, navigator });
  audio.setAudioLevel("off"); audio.setAudioLevel("quiet"); const context = audio.getAudioContext();
  assertEqual([created, resumeCalls], [1, 0], "asynchronous preference setup creates one shared context without requesting autoplay");
  assertEqual(audio.getMasterGain().gain.events.at(-1), ["ramp", .25, 2.05], "quiet applies the authored preference through the existing master gain");
  assertEqual([window.listenerCount("keydown"), window.listenerCount("pointerdown")], [1, 1], "repeated context access installs only one set of gesture listeners");
  window.emit("keydown"); assertEqual(resumeCalls, 0, "synthetic or inactive gesture events cannot unlock audio");
  navigator.userActivation.isActive = true; document.hidden = true;
  window.emit("pointerdown"); assertEqual(resumeCalls, 0, "a hidden page cannot request audio unlock even while activation is reported");
  document.hidden = false; window.emit("keydown"); await settle();
  assertEqual([resumeCalls, context.state], [1, "suspended"], "a rejected browser permission is handled and keeps the context retryable");
  deny = false; window.emit("pointerdown"); await settle();
  assertEqual([resumeCalls, context.state], [2, "running"], "a later deliberate gesture can recover from the earlier denial");
  window.emit("keydown"); audio.getAudioContext();
  assertEqual([created, resumeCalls], [1, 2], "already-running audio neither creates nor resumes another context");
  audio.setAudioLevel("off");
  assertEqual(audio.getMasterGain().gain.events.at(-1), ["ramp", 0, 2.05], "off mutes the same master output for all current and future sounds");
});

await suite("Audio context: browsers without userActivation unlock only from trusted key or pointer gestures", async () => {
  for (const eventName of ["keydown", "pointerdown"]) {
    const window = new BrowserEvents(), document = new BrowserEvents(); let resumed = 0;
    class Context {
      state = "suspended"; currentTime = 0; destination = {};
      createGain() { return { gain: parameter(), connect() {} }; }
      resume() { resumed++; this.state = "running"; return Promise.resolve(); }
    }
    (window as any).AudioContext = Context;
    const audio = compile("context.ts", { window, document, navigator: {} });
    audio.setAudioLevel("off"); const context = audio.getAudioContext();
    assertEqual(resumed, 0, "loading preferences and buffers does not use the missing activation API as permission");
    window.emit(eventName, { type: eventName, isTrusted: false });
    assertEqual(resumed, 0, "an untrusted synthetic key/pointer event cannot substitute for activation");
    document.hidden = true; window.emit(eventName, { type: eventName, isTrusted: true });
    assertEqual(resumed, 0, "a trusted event still cannot start hidden-tab audio");
    document.hidden = false; window.emit(eventName, { type: eventName, isTrusted: true }); await settle();
    assertEqual([resumed, context.state], [1, "running"], "a native key or pointer gesture unlocks a visible suspended context without userActivation support");
    window.emit(eventName, { type: eventName, isTrusted: true });
    assertEqual(resumed, 1, "later native gestures cannot resume an already-running context again");
  }
});

await suite("Wood audio ownership: quiet, threat and aftermath keep their air playhead and prefetch only physical forest cues", async () => withWorld(async w => {
  const scene = w.scene("HauntedWoodScene"), handle = w.installSoundscape(scene, "wood-path"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["wood-theme", "wood-air", "wood-leaves"], "forest owns the score, sheltered air and irregular leaves");
  assert(w.requests.every((request: any) => request.url.startsWith("/wood-")), "forest entry cannot request unrelated realm materials");
  assertEqual(w.requests.filter((request: any) => ["/wood-root.mp3", "/wood-stone.mp3", "/wood-lantern.mp3", "/wood-seal.mp3"].includes(request.url)).length, 4, "only the four new forest contacts prefetch once");
  w.context.currentTime = 9; const count = w.sources.length;
  for (const mood of ["wood-hush", "wood-restless", "wood-ash"]) handle.setMood(mood);
  await settle(); assertEqual(w.sources.length, count, "gain changes retain the same source playheads");
  handle.setMood("wood-threat"); await settle();
  assertEqual(handle.status().layers.map((layer: any) => layer.id), ["wood-theme", "wood-air"], "live directional combat removes extra leaf texture");
  const air = handle.status().layers.find((layer: any) => layer.id === "wood-air").offset;
  handle.setMood("wood-rest-ash"); await settle();
  assertEqual(handle.status().layers.find((layer: any) => layer.id === "wood-air").offset, air, "sealed ash aftermath changes atmosphere without resetting the place");
  scene.pause(); const pausedCount = w.sources.length; handle.cue("wood-seal"); await settle();
  assertEqual([w.sources.length, w.active().length], [pausedCount, 0], "a paused forest cannot emit or queue an ending seal");
}));

await suite("Finale and home audio ownership: intentional silence survives resume and credits retain one homecoming playhead", async () => withWorld(async w => {
  const battle = w.scene("GreatBattleScene"), finale = w.installSoundscape(battle, "finale-wall"); await settle();
  assert(w.requests.every((request: any) => request.url.startsWith("/finale-")), "finale entry prefetches no realm material cues");
  w.context.currentTime = 7; const before = w.sources.length;
  finale.setMood("finale-duel-kind"); await settle();
  assertEqual(w.sources.length, before, "the quieter kind duel keeps the same score and ruins playheads");
  finale.setMood("finale-silence"); await settle();
  assertEqual(finale.status().layers, [], "the lone phrase/final period retain true surrounding silence");
  battle.pause(); battle.resume(); await settle();
  assertEqual(w.active(), [], "resume cannot revive music removed for the original silent ending");
  const home = w.scene("HomecomingScene"), arrival = w.installSoundscape(home, "homecoming"); await settle();
  assertEqual([finale.status().stopped, arrival.status().layers.map((layer: any) => layer.id)], [true, ["homecoming-theme", "hearth"]], "homecoming takes ownership and permanently releases the battle");
  const count = w.sources.length; w.context.currentTime = 19; arrival.setMood("credits"); await settle();
  assertEqual(w.sources.length, count, "credits lower the existing homecoming layers without restarting the ending");
  assert(w.requests.every((request: any) => !["/snow.mp3", "/wood.mp3", "/stone.mp3"].includes(request.url)), "finale/home/credits never accidentally prefetch Winter materials");
  home.events.emit("shutdown"); assertEqual(w.active(), [], "leaving credits stops every active soundscape source");
}));
