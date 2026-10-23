import { readFileSync } from "node:fs";
import ts from "typescript";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { navigationAction } from "../src/game/ui/navigationPolicy";
import { assert, assertEqual, suite } from "./_assert";

function sceneMethods(path: string, names: string[], globals: Record<string, unknown>) {
  const url = new URL(path, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = names.map((name) => {
    const method = owner.members.find((member) => member.name?.getText(source) === name);
    if (!method) throw new Error(`Missing actual method ${name}`);
    return method.getText(source);
  });
  const code = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));
}

function clock() {
  let now = 0;
  const pending: Array<{ at: number; next: () => void }> = [];
  return {
    later(ms: number, next: () => void) { pending.push({ at: now + ms, next }); },
    to(time: number) {
      pending.sort((a, b) => a.at - b.at);
      while (pending[0] && pending[0].at <= time) {
        const callback = pending.shift()!;
        now = callback.at; callback.next();
        pending.sort((a, b) => a.at - b.at);
      }
      now = time;
    },
  };
}

class Target implements WordTarget {
  cursor = 0;
  constructor(private readonly word: string, private readonly complete: () => void) {}
  remaining() { return this.word.slice(this.cursor); }
  isComplete() { return this.cursor === this.word.length; }
  advance() { this.cursor += 1; }
  miss() {}
  onClaim() {}
  onRelease() { this.cursor = 0; }
  onComplete() { this.complete(); }
  setDimmed() {}
  setCandidate() {}
  destroy() {}
}

const Chamber = sceneMethods("../src/scenes/PortalChamberScene.ts", [
  "clearZoneTargets", "enterZone", "openAlmanac", "resumeAfterAlmanac", "onKeyDown",
], {
  navigationAction, isPuristToggleKey: () => false, playClack() {}, playChime() {},
  HUB_STATIONS: { almanac: { x: 490 } },
  ZONE_X: { portals: 990, desk: 490, shelf: 1400, account: 1700 },
});
const Almanac = sceneMethods("../src/scenes/AlmanacScene.ts", ["closeBook", "onKeyDown"], {
  navigationAction, playChime() {}, playClack() {},
});

function key(value: string) {
  return { key: value, repeat: false, ctrlKey: false, metaKey: false, altKey: false,
    stopped: false, preventDefault() {}, stopPropagation() { this.stopped = true; } };
}

function chamber(time = clock()) {
  const hub = new Chamber();
  const input = new TypingInputController();
  let pauses = 0;
  const register = (word: string, complete: () => void = () => {}) => {
    const target = new Target(word, () => time.later(320, complete));
    input.register(target); hub.zoneTargets.push(target);
  };
  Object.assign(hub, {
    typingInput: input, activeZone: "portals", openingUtilityScene: false, almanacOverlayOpen: false,
    portalWordAnchors: [], stationWordAnchorReleases: [], portalInstructionObjects: [], zoneTargets: [],
    clearPortalFloorCallWake() {}, clearDeskDisplay() {}, clearAccountDisplay() {}, clearShelfDisplay() {},
    walkWrenTo() {}, input: { keyboard: { on() {} } },
    chapterMenu: { handleKey(event: KeyboardEvent) {
      const action = navigationAction(event, "play", input.hasClaim() || input.getTypingBuffer().length > 0);
      if (action === "pause") { pauses += 1; return true; }
      return action === "ignore";
    } },
    registerDeskZoneTargets() { register("almanac"); register("portals", () => hub.enterZone("portals")); },
    registerPortalZoneTargets() { register("the sunken bell"); register("the winter mountain"); },
  });
  hub.enterZone("portals", false);
  return { hub, input, time, pauses: () => pauses };
}

await suite("chamber navigation: closing the overlay accepts the next60ms command without losing letters", () => {
  const { hub, input, time, pauses } = chamber();
  hub.enterZone("desk", false);
  hub.openingUtilityScene = true;
  hub.almanacOverlayOpen = true;
  let stopped = 0;
  const book = new Almanac();
  Object.assign(book, {
    closing: false, overlay: true, typingInput: new TypingInputController(),
    clearNavigationTargets() {},
    scene: { stop: () => { stopped += 1; }, resume: () => hub.resumeAfterAlmanac() },
    time: { delayedCall: (ms: number, callback: () => void) => time.later(ms, callback) },
  });
  const escape = key("Escape");
  book.onKeyDown(escape);
  assertEqual(stopped, 1, "book closes before waiting for an animation");
  assert(escape.stopped, "closing Esc cannot also navigate or pause the resumed chamber");
  assertEqual(hub.activeZone, "desk", "close returns to the existing desk");
  for (const [index, char] of [..."portals"].entries()) {
    time.to((index + 1) * 60);
    hub.onKeyDown(key(char));
  }
  time.to(900);
  assertEqual(hub.activeZone, "portals", "all letters of the immediate next command reach the chamber");
  assertEqual(input.getTypingBuffer(), "", "completed navigation has no hidden prefix");
  assert(!input.hasClaim(), "completed navigation has no hidden claim");
  hub.onKeyDown(key("Escape"));
  assertEqual(pauses(), 1, "the first fresh Escape at the portals opens pause");
});

await suite("chamber navigation: replacing zone targets clears an otherwise invisible ambiguous prefix", () => {
  const { hub, input } = chamber();
  for (const char of "the ") input.handleChar(char);
  assertEqual(input.getTypingBuffer(), "the ", "shared portal prefix is still unclaimed");
  assert(!input.hasClaim(), "prefix does not highlight a unique claimed target");
  hub.enterZone("desk", false);
  assertEqual(input.getTypingBuffer(), "", "zone replacement clears the old prefix rather than leaving it invisible");
  hub.onKeyDown(key("Escape"));
  assertEqual(hub.activeZone, "portals", "first Escape backs out of the new zone without an extra cancel");
});

await suite("chamber navigation: overlay rebuild cancels typing that belongs to the old desk targets", () => {
  const { hub, input } = chamber();
  hub.enterZone("desk", false);
  input.handleChar("p");
  assert(input.hasClaim(), "old desk portal command is claimed");
  hub.openingUtilityScene = true;
  hub.almanacOverlayOpen = true;
  hub.resumeAfterAlmanac();
  assert(!input.hasClaim(), "rebuilt desk does not retain the removed target's claim");
  assertEqual(input.getTypingBuffer(), "", "rebuilt desk starts ready for a fresh command");
});

await suite("chamber navigation: pause resume during book opening cannot consume the eventual overlay return", () => {
  const { hub, input, time } = chamber();
  hub.enterZone("desk", false);
  let attached = 1;
  let launched = 0;
  let paused = 0;
  Object.assign(hub, {
    playHubActorAction() {}, pulseStation() {}, playUtilityStationExitWake() {},
    time: { delayedCall: (ms: number, next: () => void) => time.later(ms, next) },
    input: { keyboard: { on() { attached += 1; }, off() { attached -= 1; } } },
    scene: { launch() { launched += 1; }, pause() { paused += 1; } },
  });
  hub.openAlmanac();
  hub.resumeAfterAlmanac(); // Blur paused the chamber before the210ms opening completed.
  assert(hub.openingUtilityScene, "ordinary pause resume retains the in-progress book opening");
  assertEqual(attached, 1, "ordinary resume cannot duplicate the chamber keyboard listener");
  time.to(210);
  assertEqual([launched, paused, attached], [1, 1, 0], "actual overlay owns input only after launch");
  hub.resumeAfterAlmanac();
  assertEqual(attached, 1, "real book return restores exactly one chamber keyboard listener");
  assert(!hub.openingUtilityScene && !hub.almanacOverlayOpen, "real return releases both transition guards");
  for (const char of "portals") hub.onKeyDown(key(char));
  time.to(530);
  assertEqual(hub.activeZone, "portals", "keyboard navigation still works after the blur/book sequence");
  hub.resumeAfterAlmanac();
  assertEqual(attached, 1, "later ordinary resumes do not reattach another listener");
  assert(!input.hasClaim(), "completed navigation releases the old desk claim");
});
