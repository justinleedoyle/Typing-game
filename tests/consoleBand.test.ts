import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { ChapterReading } from "../src/game/ui/chapterReading";

// Exercise the actual readout methods with measured inert text and a fake
// clock. No canvas, game save or browser state is needed for these contracts.
const path = new URL("../src/game/ui/consoleBand.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["setObjective", "showNotice", "renderObjective", "fitObjectiveText",
  "objectiveTextFits", "redrawObjectivePlate", "updateReadoutVisibility"];
const code = ts.transpileModule(`class Harness { ${names.map((name) =>
  owner.members.find((member) => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const globals = {
  OBJECTIVE_FONT_SIZE: 17, OBJECTIVE_MIN_FONT_SIZE: 13, OBJECTIVE_MAX_TEXT_H: 24,
  OBJECTIVE_TEXT_X: 124, OBJECTIVE_H: 38, UI_HEX: { frame: 0 },
  noticeColorsFor: () => ({ labelColor: "", textColor: "" }),
};
const Band = new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));

class Text {
  text = ""; fontSize = 17; width = 0; height = 20;
  setText(text: string) { this.text = text; this.measure(); return this; }
  setFontSize(size: number) { this.fontSize = size; this.measure(); return this; }
  setColor() { return this; }
  measure() { this.width = this.text.length * this.fontSize * 0.5; this.height = this.fontSize * 1.2; }
}
function createBand() {
  const timers: Array<{ run: () => void; removed: boolean; remove: () => void }> = [];
  const plateWidths: number[] = [];
  const band = new Band();
  const plate = { clear() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
    fillRoundedRect(_x: number, _y: number, width: number) { plateWidths.push(width); return this; },
    strokeRoundedRect() { return this; } };
  Object.assign(band, {
    objectiveValue: "", renderedReadoutKey: "", noticeActive: false, noticeGeneration: 0, noticeTimer: null,
    objectiveWidth: 1354, objectiveTextMaxWidth: 1212, objectiveBg: plate,
    objectiveText: new Text(), objectiveLabel: new Text(),
    objectiveContainer: { visible: false, setVisible(value: boolean) { this.visible = value; return this; }, setAlpha() { return this; } },
    playReadoutWake() {}, playNoticeSatchelWake() {}, clearAnsweringKeepsake() {},
    scene: { tweens: { killTweensOf() {}, add() {} }, time: {
      delayedCall(_ms: number, run: () => void) {
        const timer = { run, removed: false, remove() { this.removed = true; } };
        timers.push(timer); return timer;
      },
    } },
  });
  return { band, timers, plateWidths };
}

await suite("console readout: short plates fit content and long directions keep their established width", () => {
  const { band, plateWidths } = createBand();
  band.setObjective("Type TURN.");
  const shortWidth = band.objectiveWidth;
  assert(shortWidth < 400, "a short command no longer frames the empty full-width band");
  assert(shortWidth >= 124 + band.objectiveText.width + 18, "label, task and end padding fit inside the plate");
  band.setObjective("At · use the approach mark: above . / below ! / left , / right ?: type the other letters.");
  assert(band.objectiveWidth > shortWidth && band.objectiveWidth <= 1354, "long directions grow only within the original strip bounds");
  assertEqual(band.objectiveText.text, "At · use the approach mark: above . / below ! / left , / right ?: type the other letters.",
    "normal full directions remain intact");
  band.setObjective("A deliberately exceptional instruction ".repeat(30));
  assert(band.objectiveWidth <= 1354, "exceptional text never expands into other HUD anchors");
  assert(band.objectiveText.width <= band.objectiveTextMaxWidth, "existing font-fit/truncation still bounds exceptional lines");
  assertEqual(plateWidths.at(-1), band.objectiveWidth, "the drawn frame matches the actual fitted readout");
  band.setObjective("");
  assert(!band.objectiveContainer.visible, "an empty task leaves no empty task frame");
});

await suite("console readout: newer tasks preempt notices and stale timers cannot erase their successors", () => {
  const { band, timers } = createBand();
  band.setObjective("Read the arrival.");
  band.showNotice("The Hammer is ready.", { label: "relic" });
  assertEqual(band.objectiveText.text, "The Hammer is ready.", "a notice can still explain a keepsake in the current beat");
  band.setObjective("Read the arrival.");
  assert(band.noticeActive, "repeating the same task does not prematurely dismiss a current notice");
  band.setObjective("Type bound while the tether holds him.");
  assert(!band.noticeActive && timers[0]!.removed, "a new playable beat ends its predecessor's notice");
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "the new task appears immediately");
  timers[0]!.run();
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "a removed callback cannot resurrect old content");
  band.showNotice("A new keepsake answers.", { label: "relic" });
  timers[0]!.run();
  assert(band.noticeActive, "the older callback cannot clear a newer active notice");
  assertEqual(band.objectiveText.text, "A new keepsake answers.", "the newer notice retains ownership");
  timers[1]!.run();
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "normal notice expiry restores the latest task");
  band.showNotice("One more notice.");
  band.setObjective("");
  timers[2]!.run();
  assert(!band.objectiveContainer.visible, "emptying a finished beat cannot be undone by its old notice timer");
});

// Run the real constructor and event wiring. The display doubles record
// visibility, ownership and geometry, without copying the mode decisions.
class Display {
  x = 0; y = 0; width = 64; height = 96; visible = true; active = true;
  alpha = 1; text = ""; fontSize = 17; children: Display[] = [];
  rectangles: number[][] = [];
  setVisible(value: boolean) { this.visible = value; return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setX(value: number) { this.x = value; return this; }
  setY(value: number) { this.y = value; return this; }
  setDepth() { return this; } setScrollFactor() { return this; }
  setOrigin() { return this; } setScale() { return this; }
  setFixedSize(width: number, height: number) { this.width = width; this.height = height; return this; }
  setText(text: string) { this.text = text; this.measure(); return this; }
  setFontSize(value: number) { this.fontSize = value; this.measure(); return this; }
  setColor() { return this; }
  measure() { this.width = this.text.length * this.fontSize * 0.52; this.height = this.fontSize * 1.2; }
  clear() { this.rectangles = []; return this; }
  fillStyle() { return this; } lineStyle() { return this; }
  fillRect(...values: number[]) { this.rectangles.push(values); return this; }
  fillRoundedRect() { return this; } strokeRoundedRect() { return this; }
  beginPath() { return this; } moveTo() { return this; }
  lineTo() { return this; } strokePath() { return this; } lineBetween() { return this; }
  add(child: Display) { this.children.push(child); return this; }
  bringToTop() { return this; }
  destroy() { this.active = false; this.visible = false; this.children.forEach(child => child.destroy()); }
}

class SceneEvents {
  listeners: Array<{ event: string; callback: (...args: unknown[]) => void; context?: unknown; once: boolean }> = [];
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown) {
    this.listeners.push({ event, callback, context, once: false }); return this;
  }
  once(event: string, callback: (...args: unknown[]) => void, context?: unknown) {
    this.listeners.push({ event, callback, context, once: true }); return this;
  }
  off(event: string, callback: (...args: unknown[]) => void, context?: unknown) {
    this.listeners = this.listeners.filter(value => value.event !== event || value.callback !== callback || value.context !== context);
    return this;
  }
  emit(event: string) {
    for (const value of [...this.listeners]) if (value.event === event) {
      if (value.once) this.off(event, value.callback, value.context);
      value.callback.call(value.context);
    }
  }
}

const moduleCode = ts.transpileModule(source.text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports: { ConsoleBand?: any } = {};
new Function("require", "exports", moduleCode)((id: string) => {
  if (id === "phaser") return { default: { Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy", PRE_UPDATE: "preupdate" } } } };
  if (id === "./chapterReading") return { ChapterReading };
  if (id === "../palette") return { SERIF: "serif" };
  if (id === "../relics") return { RELICS: {} };
  if (id === "./satchelIcons") return { satchelIconFor: (id: string) => ({ key: id }) };
  if (id === "./uiTheme") return { UI_HEX: {} };
  throw new Error(`Unexpected ConsoleBand dependency ${id}`);
}, moduleExports);

function liveBand(textScale: "standard" | "large", customShelf = false, explicitActivity = true, initiallyReading = false) {
  const events = new SceneEvents();
  const all: Display[] = [];
  const make = (x = 0, y = 0) => { const value = new Display().setPosition(x, y); all.push(value); return value; };
  let activity: "combat" | "story" = "story";
  const timers: Array<() => void> = [];
  const scene = {
    events, scale: { width: 1920, height: 1080 }, time: { now: 0, delayedCall: (_ms: number, callback: () => void) => {
      timers.push(callback); return { remove() {} };
    } },
    add: { container: make, graphics: make, image: (x: number, y: number) => make(x, y),
      text: (x: number, y: number, text: string, style: { fontSize: string }) =>
        make(x, y).setFontSize(Number.parseInt(style.fontSize)).setText(text) },
    textures: { exists: () => true }, tweens: { add() {}, killTweensOf() {} },
    data: { get: () => ({ get: () => ({ textScale }) }) },
  };
  const reader = new ChapterReading(scene as any, 316);
  if (initiallyReading) reader.show(() => {}, null);
  const band = new moduleExports.ConsoleBand!(scene, {
    ...(explicitActivity ? { activity: () => activity } : {}), portraitKey: "runa", portraitName: "Runa",
    passiveIconIds: Array.from({ length: 10 }, (_, i) => `item-${i}`),
    satchelLabel: customShelf ? "cold" : "satchel",
  });
  return { band, reader, events, timers, all, scene, setActivity(value: typeof activity) { activity = value; events.emit("preupdate"); } };
}

await suite("console story mode: actual held cards quiet chrome, retain resources and restore playable hints", () => {
  for (const scale of ["standard", "large"] as const) {
    const { band, reader, events, timers, setActivity } = liveBand(scale);
    const anchors = JSON.stringify([band.bandTopY, band.metersAnchor, band.satchelAnchor, band.oneShotSlots]);
    assertEqual(band.metersAnchor.y, 960, "Heart/Soul retain the combat baseline");
    assertEqual(band.satchelAnchor.y, 976, "realm meters retain their exact row");
    assertEqual(band.oneShotSlots[0].y, 970, "charge cards retain their exact baseline");
    assert(!band.fullChrome.visible && band.storySurface.visible, "actual story activity selects the compact body");
    assertEqual(band.storySurface.rectangles[0][1] + band.bandTopY, 928, "compact chrome returns68px of painting");
    assert([...band.satchelIconTiles.values()].every((tile: Display) => tile.visible), "all keepsake icons remain available");
    assert(band.satchelFrames.every((frame: Display) => !frame.visible), "story mode removes tile furniture only");
    band.setObjective("Type each word, including punctuation. No spaces between prompts.");
    assert(band.objectiveContainer.visible, "punctuation and spacing guidance remains visible on a playable story beat");
    reader.show(() => {}, () => {});
    assert(!band.objectiveContainer.visible, "the held card owns the single Continue cue");
    assertEqual((reader as any).hint.fontSize, scale === "large" ? 28 : 22, "the actual reading control honors text scale");
    band.showNotice("A keepsake answers.");
    assert(band.objectiveContainer.visible, "held cards do not hide new resource notices");
    timers.at(-1)!();
    assert(!band.objectiveContainer.visible, "notice expiry cannot revive a duplicate Continue task");
    reader.clear();
    assert(band.objectiveContainer.visible && band.objectiveText.text.includes("punctuation"), "the complete stored guidance returns when reading ends");
    setActivity("combat");
    assert(band.fullChrome.visible && !band.storySurface.visible, "actual combat restores the original surface and portrait");
    assert(band.satchelFrames.every((frame: Display) => frame.visible), "combat restores the original icon furniture");
    assertEqual(JSON.stringify([band.bandTopY, band.metersAnchor, band.satchelAnchor, band.oneShotSlots]), anchors,
      "mode changes never move resources, charge cards or gameplay boundary");
    events.emit("shutdown");
    assert(!band.container.active && !ChapterReading.activeIn((reader as any).scene), "scene shutdown cannot retain a reading mode or live console");
    assert(!events.listeners.some(value => value.event === "preupdate" || value.event === ChapterReading.STATE_CHANGED), "shutdown removes mode listeners");
    reader.destroy();
  }
});

await suite("console story mode: custom resource heading remains above its unchanged meter", () => {
  const { band, reader, events, setActivity } = liveBand("large", true);
  assert(band.satchelHeading.visible && band.satchelHeading.y === 78, "Winter's resource heading stays on the compact surface");
  setActivity("combat");
  assert(band.satchelHeading.visible && band.satchelHeading.y === 34, "combat restores the original resource label placement");
  events.emit("shutdown"); reader.destroy();
});

await suite("console held cards: default full chrome detects a reader created before the band", () => {
  const { band, reader, events } = liveBand("standard", false, false, true);
  assert(band.storySurface.visible && !band.fullChrome.visible, "an already-held card is detected without waiting for a new event");
  band.setObjective("Press Enter or Space to continue.");
  assert(!band.objectiveContainer.visible, "late-created bands still avoid a duplicate Continue strip");
  reader.clear();
  assert(band.fullChrome.visible && !band.storySurface.visible, "unconfigured scenes keep their original full console between held cards");
  assert(band.objectiveContainer.visible, "the persistent task returns immediately after the gate clears");
  events.emit("shutdown"); reader.destroy();
});

function sceneActivity(sceneName: string, state: object): () => "combat" | "story" {
  const scenePath = new URL(`../src/scenes/${sceneName}.ts`, import.meta.url);
  const sceneSource = ts.createSourceFile(scenePath.pathname, readFileSync(scenePath, "utf8"), ts.ScriptTarget.Latest, true);
  let activity: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node) && node.expression.getText(sceneSource) === "ConsoleBand") {
      const options = node.arguments?.[1];
      if (options && ts.isObjectLiteralExpression(options)) {
        const property = options.properties.find(value => value.name?.getText(sceneSource) === "activity");
        if (property && ts.isPropertyAssignment(property)) activity = property.initializer;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sceneSource);
  if (!activity) throw new Error(`${sceneName} must declare its actual console activity`);
  const expression = ts.transpileModule(`const probe = ${activity.getText(sceneSource)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(`${expression}; return probe;`).call(state);
}

await suite("console realm activity: actual create options preserve all live combat and quiet completed choices", () => {
  const live = { isComplete: () => false }, complete = { isComplete: () => true };
  const defeated = { isDefeated: () => true }, threat = { isDefeated: () => false };
  const winter = { waveActive: false, coldDecayTimer: null as object | null, combatCandlesActive: true };
  const winterProbe = sceneActivity("WinterMountainScene", winter);
  assertEqual(winterProbe(), "story", "Winter's post-wave economy flag cannot keep a firefly or cairn response in combat chrome");
  winter.waveActive = true;
  assertEqual(winterProbe(), "combat", "Winter waves and the Old One retain the full resource console");
  winter.waveActive = false; winter.coldDecayTimer = {};
  assertEqual(winterProbe(), "combat", "the active cold primer keeps its live resource stake visible");

  const bell = { rhythmPracticeActive: false, breathActive: false, beatPhase: "free" };
  const bellProbe = sceneActivity("SunkenBellScene", bell);
  assertEqual(bellProbe(), "story", "Bell door and fate choices use story chrome");
  bell.rhythmPracticeActive = true; assertEqual(bellProbe(), "combat", "rhythm teaching retains full chrome");
  bell.rhythmPracticeActive = false; bell.breathActive = true; assertEqual(bellProbe(), "combat", "choir breath stays in combat");
  bell.breathActive = false; bell.beatPhase = "off"; assertEqual(bellProbe(), "combat", "Warden rhythm phases retain full chrome without a moving ghost");

  const forge = { waveActive: false, bossContainer: null as { scene: boolean } | null, activeTargets: [live] };
  const forgeProbe = sceneActivity("ClockworkForgeScene", forge);
  assertEqual(forgeProbe(), "story", "Forn's active repair passage remains a story beat");
  forge.waveActive = true; assertEqual(forgeProbe(), "combat", "moving golem waves retain full chrome");
  forge.waveActive = false; forge.bossContainer = { scene: true };
  assertEqual(forgeProbe(), "combat", "the stationary Command-Golem does not rely on waveActive");
  forge.activeTargets = [complete]; assertEqual(forgeProbe(), "story", "a completed boss target no longer forces combat chrome");

  const sky = { templeBeamsActive: false, spirits: [] as Array<{ defeated: boolean }>,
    activePhrases: [] as Array<{ isResolved: () => boolean }>, bossContainer: null as { scene: boolean } | null, activeTargets: [live] };
  const skyProbe = sceneActivity("SkyIslandScene", sky);
  assertEqual(skyProbe(), "story", "Etta's book and tether choices remain story beats");
  sky.templeBeamsActive = true; assertEqual(skyProbe(), "combat", "the moving-scroll entry keeps full chrome before the first spawn");
  sky.templeBeamsActive = false; sky.spirits = [{ defeated: false }]; assertEqual(skyProbe(), "combat", "live lantern spirits retain full chrome");
  sky.spirits = [{ defeated: true }]; sky.activePhrases = [{ isResolved: () => false }];
  assertEqual(skyProbe(), "combat", "unresolved scrolling phrases retain full chrome");
  sky.activePhrases = []; sky.bossContainer = { scene: true };
  assertEqual(skyProbe(), "combat", "stationary Scholar riddles retain full chrome");
  sky.activeTargets = [complete]; assertEqual(skyProbe(), "story", "held riddle consequences quiet after their answer");

  const wood = { wardPracticeActive: false, ghosts: [defeated], checkpointStep: "offering", activeTargets: [live] };
  const woodProbe = sceneActivity("HauntedWoodScene", wood);
  assertEqual(woodProbe(), "story", "the offering passage remains a story beat despite an active target");
  wood.wardPracticeActive = true; assertEqual(woodProbe(), "combat", "directional ward practice retains full chrome");
  wood.wardPracticeActive = false; wood.ghosts = [threat]; assertEqual(woodProbe(), "combat", "approaching ghosts retain full chrome");
  wood.ghosts = [defeated];
  for (const step of ["capstone", "final1", "final2"]) {
    wood.checkpointStep = step; assertEqual(woodProbe(), "combat", `${step} preserves the full console for stationary punctuation combat`);
  }
  wood.activeTargets = [complete]; assertEqual(woodProbe(), "story", "completed final words no longer force combat chrome");
});
