import { assert, assertEqual, suite } from "./_assert";
import { homecomingLines } from "../src/game/homecoming";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { OPENING_STEPS, openingStep, readingAction } from "../src/game/chapterFlow";
import { makeSiblingDrawing } from "../src/game/siblingDrawing";
import { CloudSaveError, SaveStore, emptySave, migrate, type SaveState } from "../src/game/saveState";
import { titleHomecoming } from "../src/game/titleResume";
import { decodeJourneyTransfer, encodeJourneyTransfer } from "../src/game/saveTransfer";

await suite("Homecoming resolves the sibling promise actually made in the opening", () => {
  const boy = homecomingLines("boy").map(line => line.text).join(" ");
  const girl = homecomingLines("girl").map(line => line.text).join(" ");
  assert(boy.includes("Saga") && boy.includes("drawing"), "boy Wren brings Saga's drawing home");
  assert(!boy.includes("Magnus"), "does not invent a second sibling");
  assert(girl.includes("Magnus") && girl.includes("promised"), "girl Wren returns to Magnus's promise");
  assert(!girl.includes("Saga") && !girl.includes("drawing"), "does not assign Saga's memento to the other opening");
  const legacy = homecomingLines(null).map(line => line.text).join(" ");
  assert(!legacy.includes("Saga") && !legacy.includes("Magnus"), "old saves without identity keep a neutral return");
  for (const gender of ["boy", "girl", null] as const) {
    const lines = homecomingLines(gender);
    assert(lines[0]?.text.includes("Holdfast"), "returns to the established home");
    assertEqual(lines.at(-1)?.speaker, "Runa", "Runa closes the journey");
  }
});

function reunionHarness(reduced: boolean, onLight: () => void, onBreath: () => void) {
  const path = new URL("../src/scenes/HomecomingScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const method = owner.members.find(member => member.name?.getText(source) === "showSiblingEmbrace")!;
  const code = ts.transpileModule(`class Harness { ${method.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("reducedMotion", "addLocalGroundShadow", "applySceneActorLighting", "addIdleBreath",
    `${code}; return Harness;`)(() => reduced, () => ({ shadow: true }), onLight, onBreath);
}

function actor(x: number, y = 950) {
  return { scene: true, x, y, visible: true, children: [] as unknown[],
    setDepth() { return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    add(child: unknown) { this.children.push(child); return this; },
  };
}

await suite("Homecoming reunion: both siblings meet Wren before their held embrace response", () => {
  for (const gender of ["boy", "girl"] as const) for (const reduced of [false, true]) {
    let lights = 0;
    let breaths = 0;
    let ready = 0;
    let pairs = 0;
    let texture = "";
    let height = 0;
    const moves: Array<{ targets: ReturnType<typeof actor>; x: number; onComplete?: () => void }> = [];
    const Scene = reunionHarness(reduced, () => { lights += 1; }, () => { breaths += 1; });
    const s = new Scene();
    const wren = actor(1000);
    const sibling = actor(1430);
    Object.assign(s, {
      leaving: false, wrenActor: wren, siblingActor: sibling, reunionActor: null,
      store: { get: () => ({ wrenGender: gender }) },
      add: {
        container(x: number, y: number) { pairs += 1; return actor(x, y); },
        image(_x: number, _y: number, key: string) {
          texture = key;
          return { height: 1600,
            setOrigin(x: number, y: number) {
              assertEqual([x, y], [0.5, 1], "both full bodies use a shared grounded baseline"); return this;
            },
            setScale(scale: number) { height = scale * this.height; return this; },
          };
        },
      },
      tweens: { killTweensOf() {}, add(opts: typeof moves[number]) { moves.push(opts); } },
    });
    const onReady = () => {
      assert(s.reunionActor.visible && !wren.visible && !sibling.visible,
        "the actual embrace is visible before the sibling story can be read");
      ready += 1;
    };
    s.showSiblingEmbrace(onReady);
    assertEqual(ready, reduced ? 1 : 0, "reduced motion swaps immediately; normal movement settles first");
    assertEqual(moves.length, reduced ? 0 : 2, "reduced motion never slides the cast across the room");
    for (const move of moves) { move.targets.x = move.x; move.onComplete?.(); }
    assertEqual(ready, 1, "the original held story resumes exactly once");
    assertEqual(texture, gender === "boy" ? "homecoming-saga-embrace" : "homecoming-magnus-embrace",
      "only the sibling actually chosen in the opening appears");
    assertEqual(height, gender === "boy" ? 340 : 365, "paired art preserves the child's/older sibling's scene scale");
    assertEqual(s.reunionActor.y, wren.y, "the new pose stays planted on the same floor");
    assertEqual([lights, breaths], [1, 1], "one scene-lit pose gets one decorative breath");
    s.showSiblingEmbrace(onReady);
    assertEqual([pairs, ready], [1, 2], "showing an existing beat does not duplicate the paired art");
  }
});

await suite("Homecoming reunion: legacy saves and leaving during movement remain safe", () => {
  const Scene = reunionHarness(false, () => {}, () => {});
  const legacy = new Scene();
  let legacyReady = 0;
  Object.assign(legacy, { store: { get: () => ({ wrenGender: null }) },
    add: { container() { throw new Error("Legacy return must not invent a sibling pose"); } } });
  legacy.showSiblingEmbrace(() => { legacyReady += 1; });
  assertEqual(legacyReady, 1, "legacy neutral narration keeps its existing immediate gate");

  const moving = new Scene();
  let finish: (() => void) | undefined;
  let ready = 0;
  Object.assign(moving, {
    leaving: false, wrenActor: actor(1000), siblingActor: actor(1430), reunionActor: null,
    store: { get: () => ({ wrenGender: "girl" }) },
    add: { container: actor, image: () => ({ height: 1600,
      setOrigin() { return this; }, setScale() { return this; } }) },
    tweens: { killTweensOf() {}, add(opts: { onComplete?: () => void }) { if (opts.onComplete) finish = opts.onComplete; } },
  });
  moving.showSiblingEmbrace(() => { ready += 1; });
  moving.leaving = true;
  finish!();
  assertEqual(ready, 0, "a completed movement cannot reopen narration after returning to the library");
});

const openingPath = new URL("../src/scenes/OpeningScene.ts", import.meta.url);
const openingSource = ts.createSourceFile(openingPath.pathname, readFileSync(openingPath, "utf8"), ts.ScriptTarget.Latest, true);
const openingOwner = openingSource.statements.find(ts.isClassDeclaration)!;
const openingMethods = ["init", "resumeOpening", "beat10", "showOpeningWren", "stageOpeningWrenDeparture", "receiveSiblingKeepsake", "clearCarriedKeepsake", "playSiblingFarewell"];
const openingCode = ts.transpileModule(`class Opening { ${openingMethods.map(name =>
  openingOwner.members.find(member => member.name?.getText(openingSource) === name)!.getText(openingSource)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const emptyHandsPng = readFileSync(new URL("../art/sibling/sibling-empty-hands.png", import.meta.url));
const emptyHandsHeight = emptyHandsPng.readUInt32BE(20);

function homecomingFixture(gender: "boy" | "girl" | null = "boy", reduced = false, overrideStore?: SaveStore) {
  const path = new URL("../src/scenes/HomecomingScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const assets = Object.fromEntries(source.statements.filter(ts.isImportDeclaration)
    .filter(statement => (statement.moduleSpecifier as ts.StringLiteral).text.endsWith(".png"))
    .map(statement => [statement.importClause!.name!.text, (statement.moduleSpecifier as ts.StringLiteral).text]));
  const code = ts.transpileModule(`class Arrival { ${owner.members.filter(member => !ts.isConstructorDeclaration(member))
    .map(member => member.getText(source)).join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const readingPath = new URL("../src/game/ui/chapterReading.ts", import.meta.url);
  const readingSource = ts.createSourceFile(readingPath.pathname, readFileSync(readingPath, "utf8"), ts.ScriptTarget.Latest, true);
  const readingCode = ts.transpileModule(readingSource.statements.find(ts.isClassDeclaration)!.getText(readingSource).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Reading = new Function("readingAction", "SERIF", "UI_CSS", "UI_HEX", "chapterPreferences", "PRESENTATION_CHANGED",
    `${readingCode}; return ChapterReading;`)(readingAction, "serif", {}, {}, () => ({}), "presentation");
  const loaded = new Map<string, string>(), images: any[] = [], containers: any[] = [], graphics: any[] = [];
  const tweens: any[] = [], captions: string[] = [], starts: any[] = [], shutdown: Array<() => void> = [];
  let onKey: ((event: any) => void) | undefined;
  const noop = () => {};
  const node = (x = 0, y = 0): any => ({ scene: true, x, y, width: 100, height: 30, scaleX: 1, scaleY: 1,
    visible: true, children: [], parentContainer: null, commands: [],
    setDepth(value: number) { this.depth = value; return this; },
    setOrigin(x: number, y = x) { this.origin = [x, y]; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setScale(x: number, y = x) { this.scale = this.scaleX = x; this.scaleY = y; return this; },
    setAngle(value: number) { this.angle = value; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setText(value: string) { this.text = value; return this; },
    setX(value: number) { this.x = value; return this; }, setY(value: number) { this.y = value; return this; },
    setFontSize() { return this; },
    add(child: any) {
      if (Array.isArray(child)) { child.forEach(item => this.add(item)); return this; }
      child.parentContainer?.remove(child); child.parentContainer = this; this.children.push(child); return this;
    },
    remove(child: any) { this.children = this.children.filter((item: any) => item !== child); child.parentContainer = null; return this; },
    destroy() { this.scene = false; this.parentContainer?.remove(this); },
    getWorldTransformMatrix() {
      const parent = this.parentContainer?.getWorldTransformMatrix();
      const at = parent ? parent.transformPoint(this.x, this.y) : { x: this.x, y: this.y };
      return { transformPoint: (x: number, y: number) => ({ x: at.x + x * this.scaleX, y: at.y + y * this.scaleY }) };
    },
    clear() { this.commands = []; return this; },
    ...Object.fromEntries(["fillStyle", "fillRoundedRect", "lineStyle", "strokeRoundedRect", "lineBetween", "strokeCircle"].map(name =>
      [name, function(this: any, ...args: any[]) { this.commands.push([name, ...args]); return this; }])),
  });
  const Arrival = new Function("beginAssetLoad", "assetLoadBlocked", ...Object.keys(assets), "preloadWren", "installChapterMenu", "addLocalGroundShadow",
    "applySceneActorLighting", "addIdleBreath", "makeWrenSprite", "makeSiblingDrawing", "NarrationManager", "ChapterReading",
    "homecomingLines", "reducedMotion", "rememberLocalSaveNotice", "CloudSaveError", "SERIF", "UI_CSS", "UI_HEX", "cornerTicks", `${code}; return Arrival;`)(
    // Artwork failure lifecycle is covered separately; this fixture isolates the homecoming.
    noop, () => false,
    ...Object.values(assets), noop, () => ({ handleKey: () => false, destroy: noop }), () => node(), noop, noop,
    () => ({ ...node(), height: 1000 }), makeSiblingDrawing,
    class { sayRaw(text: string) { captions.push(text); } clear() {} replay() {} }, Reading, homecomingLines,
    () => reduced, (scene: any) => { scene.localSaveNotice = true; }, CloudSaveError, "serif", {}, {}, () => node(),
  );
  const scene = new Arrival();
  const state = emptySave(); state.wrenGender = gender; state.typewriterAwakened = true;
  state.realms["great-battle"] = { cleared: true, choices: { homecomingStarted: "yes" } };
  const store = overrideStore ?? { get: () => state, update(mutator: (state: SaveState) => void) { mutator(state); }, async flush() {} };
  Object.assign(scene, {
    scale: { width: 1920 }, time: { now: 0 },
    load: { image: (key: string, path: string) => loaded.set(key, path) },
    add: {
      image(x: number, y: number, key: string) {
        const png = readFileSync(new URL(loaded.get(key)!, path));
        const image = { ...node(x, y), key, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
        images.push(image); return image;
      },
      container(x: number, y: number) { const container = node(x, y); containers.push(container); return container; },
      graphics() { const graphic = node(); graphics.push(graphic); return graphic; },
      rectangle: node, text: node,
    },
    tweens: { add(tween: any) { tweens.push(tween); }, killTweensOf(target: any) { tweens.filter(t => t.targets === target).forEach(t => { t.cancelled = true; }); } },
    input: { keyboard: { on(_name: string, callback: typeof onKey) { onKey = callback; }, off() { onKey = undefined; } } },
    events: { on: noop, off: noop, emit: noop, once(_name: string, callback: () => void) { shutdown.push(callback); } },
    cameras: { main: { fadeIn: noop } }, scene: { start: (...args: any[]) => starts.push(args) },
  });
  scene.init({ store }); scene.preload(); scene.create();
  return { scene, loaded, containers, graphics, tweens, captions, starts, images, store,
    async settle() { await Promise.resolve(); },
    key(key = "Enter", repeat = false) { scene.time.now += 200; onKey?.({ key, repeat, preventDefault: noop }); },
    finish(tween: any) {
      for (const field of ["x", "y", "scaleX", "scaleY", "angle"]) if (field in tween) tween.targets[field] = tween[field];
      tween.onComplete?.();
    },
    shutdown() { shutdown.forEach(callback => callback()); },
  };
}

await suite("Homecoming arrival: Saga waits without reclaiming the drawing already given to Wren", () => {
  for (const gender of ["boy", "girl", null] as const) {
    const f = homecomingFixture(gender);
    assertEqual(f.loaded.get("homecoming-saga"), "../../art/sibling/sibling-empty-hands.png", "arrival loads the approved post-gift painting");
    const sibling = f.containers.find(container => container.x === 1430);
    if (gender) {
      const portrait = sibling.children.find((child: any) => child.key);
      assertEqual([sibling.x, sibling.y, portrait.x, portrait.y, portrait.origin, portrait.height * portrait.scale],
        [1430, 950, 0, 0, [.5, 1], gender === "boy" ? 270 : 350], "the original waiting footprint and floor remain unchanged");
      assertEqual(portrait.key, gender === "boy" ? "homecoming-saga" : "homecoming-magnus", "Magnus retains his own original waiting pose");
    } else assert(!sibling, "legacy identity does not invent a sibling");
    assert(f.scene.reading.next, "the original first caption still waits on one Continue");
    assert(!f.images.some(image => image.key.includes("embrace")), "the waiting pose does not prematurely begin the unchanged embrace");
  }
});

await suite("Homecoming drawing: one carried opening sketch unfolds, rests beside the Almanac, then permits the original embrace", async () => {
  for (const reduced of [false, true]) {
    const f = homecomingFixture("boy", reduced), s = f.scene;
    const paper = s.returnedDrawing, wren = s.wrenActor, sibling = s.siblingActor;
    assert(paper && paper.parentContainer === wren && !s.drawingOnDesk, "the boy arrives with the one drawing still in Wren's hands");
    assertEqual(paper.commands.filter((c: any[]) => c[0] === "lineBetween"), [
      ["lineBetween", -14, -5, -3, -14], ["lineBetween", -3, -14, 10, 3], ["lineBetween", -10, 6, 14, 6],
    ], "the visible keepsake retains the exact three-stroke Opening drawing");
    assertEqual(paper.getWorldTransformMatrix().transformPoint(0, 0), { x: 1020, y: 838 }, "the paper starts at Opening's accepted local hand anchor");
    f.key();
    assertEqual(f.captions.length, 2, "the unchanged Saga caption is readable during the return, without a new card");
    assertEqual(f.captions[1], homecomingLines("boy")[1].text, "the authored emotional line is retained exactly");
    if (!reduced) {
      assert(!s.reading.next, "the consumed first card cannot skip the visible return");
      f.key(); f.key(" ");
      assertEqual([f.captions.length, f.tweens.length], [2, 1], "early Continue keys cannot duplicate or bypass the unfold");
      assertEqual([wren.x, wren.y, sibling.x, sibling.y], [1000, 950, 1430, 950], "unfolding cannot move the accepted world foot anchors");
      f.finish(f.tweens[0]);
      assertEqual(paper.getWorldTransformMatrix().transformPoint(0, 0), { x: 1020, y: 838 }, "release from the hand has no world-position jump");
      assertEqual(paper.parentContainer, null, "the same paper leaves the hand rather than spawning a second drawing");
      f.finish(f.tweens[1]);
      assert(!s.reading.next && !s.reunionActor.visible, "the paper reaches the desk before the existing embrace starts");
      f.finish(f.tweens[2]); f.finish(f.tweens[3]);
    } else assertEqual(f.tweens.length, 0, "reduced motion settles both return and embrace without travel tweens");
    assertEqual(s.returnedDrawing, paper, "the same single keepsake persists through the hand-to-desk transition");
    assertEqual([paper.x, paper.y, paper.scaleX, paper.scaleY, paper.angle], [786, 664, 1.3, .7, -7], "the returned paper lies flat on the painted desktop");
    assert(s.drawingOnDesk && !paper.parentContainer && s.reunionActor.visible && s.reading.next, "only the settled embrace unlocks the original sibling Continue");
    assertEqual([s.deskAlmanac.x, s.deskAlmanac.y], [708, 655], "the returned drawing rests beside the visible desk Almanac");
    f.key("Enter", true);
    assertEqual(f.captions.length, 2, "a held Continue key cannot skip the sibling response");
    f.key();
    assertEqual(f.captions, homecomingLines("boy").map(line => line.text), "there are still exactly the original three story cards");
    assert(s.deskAlmanac.commands.some((c: any[]) => c[0] === "strokeCircle"), "Runa's original final card closes the visible Almanac");
    f.key();
    assert(s.reading.next && paper.scene, "the original credits gate retains the returned drawing on the desk");
    f.key(); f.key();
    await f.settle();
    assertEqual(f.starts.map(args => args[0]), ["PortalChamberScene"], "the fourth original Continue returns to the library exactly once");
    assert(!paper.scene && !s.returnedDrawing && !s.deskAlmanac, "leaving clears both owned desk props");
  }
});

await suite("Homecoming drawing: leaving, shutdown and scene reuse cannot revive a late return or reading gate", async () => {
  for (const phase of ["unfold", "place", "embrace"] as const) for (const exit of ["leave", "shutdown", "reuse"] as const) {
    const f = homecomingFixture(), s = f.scene;
    f.key();
    if (phase !== "unfold") f.finish(f.tweens[0]);
    if (phase === "embrace") f.finish(f.tweens[1]);
    const paper = s.returnedDrawing, book = s.deskAlmanac, before = f.captions.length;
    if (exit === "leave") await s.returnToLibrary();
    else if (exit === "shutdown") f.shutdown();
    else s.init({ store: f.store });
    for (const tween of [...f.tweens]) tween.onComplete?.();
    assert(!paper.scene && !book.scene && !s.returnedDrawing && !s.deskAlmanac, `${phase}/${exit}: no carried or desk keepsake survives cleanup`);
    assertEqual(f.captions.length, before, `${phase}/${exit}: late callbacks cannot replay a story card`);
    assert(!s.reading.next, `${phase}/${exit}: late callbacks cannot reopen the consumed Continue`);
  }
  const held = homecomingFixture();
  await held.scene.returnToLibrary(); held.key(); held.key(" ");
  assertEqual([held.captions.length, held.tweens.length, held.starts.length], [1, 0, 1], "queued keys after leaving a held card cannot start the drawing or another scene transition");
});

await suite("Homecoming drawing: Magnus and legacy returns retain their original cards without Saga's props", async () => {
  for (const gender of ["girl", null] as const) for (const reduced of [false, true]) {
    const f = homecomingFixture(gender, reduced), s = f.scene;
    assert(!s.returnedDrawing && !s.deskAlmanac, "the other identity and old saves cannot inherit Saga's drawing/book staging");
    f.key();
    if (gender && !reduced) f.tweens.forEach(f.finish);
    assert(s.reading.next, "the original sibling/neutral card retains its one Continue");
    assertEqual(f.captions, homecomingLines(gender).slice(0, 2).map(line => line.text), "the original narrative sequence remains unchanged");
    f.key(); f.key(); f.key();
    await f.settle();
    assertEqual(f.starts.map(args => args[0]), ["PortalChamberScene"], "the original three cards and credits still return to the library");
  }
});

await suite("Homecoming recovery: the final phrase saves victory before its animation and an interrupted reunion survives transfer and restart", async () => {
  const initial = emptySave("Earned Wren"); initial.typewriterAwakened = true; initial.wrenGender = "boy";
  initial.satchel = ["brass-songbird", "wisp-cat"]; initial.almanacLore = ["the-word-again"];
  for (const realm of ["winter-mountain", "sunken-bell", "clockwork-forge", "sky-island", "haunted-wood"]) {
    initial.realms[realm] = { cleared: true, choices: { fork1: "remembered" } };
  }
  let durable = JSON.stringify(initial);
  const backend = { async load() { return migrate(JSON.parse(durable)); }, async save(state: SaveState) { durable = JSON.stringify(state); } };
  const store = await SaveStore.load(backend, { saveDelayMs: 60000 });
  const path = new URL("../src/scenes/GreatBattleScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = ["onFinalPhraseComplete", "commitFinalVictory"].map(name =>
    owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n");
  const code = ts.transpileModule(`class Victory { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Victory = new Function(`${code}; return Victory;`)();
  const victory = new Victory(); let flashes = 0; let presentFinalMark: (() => void) | undefined;
  Object.assign(victory, { store, clearActiveTargets() {}, band: { setObjective() {} },
    runPeriodSeal(next: () => void) { presentFinalMark = next; }, runWinFlash() { flashes++; } });
  victory.onFinalPhraseComplete();
  assert(titleHomecoming(store.get()), "the completed final phrase owns the win before any final-mark timer fires");
  assertEqual(flashes, 0, "the unchanged final period/flash remains a separate presentation beat");
  await store.flush();
  const reopened = await SaveStore.load(backend, { saveDelayMs: 60000 });
  assert(titleHomecoming(reopened.get()), "a close during the period animation returns to the reunion instead of replaying the battle");
  const imported = decodeJourneyTransfer(encodeJourneyTransfer(reopened.get() as SaveState));
  assert(titleHomecoming(imported), "portable journeys retain the pending reunion without a schema or format change");
  assertEqual([imported.runId, imported.satchel, imported.almanacLore], [initial.runId, initial.satchel, initial.almanacLore], "victory/recovery retain identity and all earned possessions");
  presentFinalMark!(); assertEqual(flashes, 1, "the original period callback still reaches its flash once");
  const f = homecomingFixture("boy", true, reopened);
  for (let card = 0; card < 3; card++) {
    f.key(); await reopened.flush();
    assert(titleHomecoming((await SaveStore.load(backend)).get()), `card ${card + 1}: interruption cannot skip the remaining reunion or credits`);
  }
  assert(f.scene.reading.next, "credits still wait for a deliberate exit");
  await f.scene.returnToLibrary();
  const completed = await SaveStore.load(backend);
  assert(!titleHomecoming(completed.get()), "only the deliberate, durably saved library return closes the pending reunion");
  assertEqual(completed.get().realms["great-battle"].choices, { homecomingStarted: "yes", homecomingCompleted: "yes" }, "both progress flags remain monotonic for cloud compatibility");
  assertEqual(completed.get().runId, initial.runId, "completion never starts a new run");
});

await suite("Homecoming recovery: local write failure keeps the reunion visible and retry waits for durability", async () => {
  const f = homecomingFixture("boy", true), s = f.scene;
  let fail = true; let writes = 0;
  f.store.flush = async () => { writes++; if (fail) throw new Error("Disk full"); };
  f.key(); f.key(); f.key();
  await s.returnToLibrary();
  assertEqual([f.starts.length, s.leaving, writes], [0, false, 1], "a failed local save cannot depart or strand input behind a busy flag");
  assert(s.returnedDrawing?.scene && s.deskAlmanac?.scene && s.reading.next, "failure retains the visible reunion/desk and a working retry Continue");
  assert(s.returnStatus.visible && s.returnStatus.text.includes("Saving could not finish") && s.returnStatus.depth > 25,
    "failure explains retry above the credits panel without hiding its message behind the ending artwork");
  fail = false; await s.returnToLibrary();
  assertEqual([f.starts.length, writes, s.returnedDrawing], [1, 2, null], "retry reaches the library once after the write succeeds");

  const pending = homecomingFixture("girl", true);
  let finishSave!: () => void;
  pending.store.flush = () => new Promise<void>(resolve => { finishSave = resolve; });
  const leave = pending.scene.returnToLibrary();
  assertEqual(pending.starts.length, 0, "library transition waits while the final save is in flight");
  pending.shutdown(); finishSave(); await leave;
  assertEqual(pending.starts.length, 0, "a save completing after scene shutdown cannot revive the library transition");

  const cloud = homecomingFixture(null, true);
  cloud.store.flush = async () => { throw new CloudSaveError(); };
  await cloud.scene.returnToLibrary();
  assertEqual([cloud.starts.length, cloud.scene.localSaveNotice], [1, true], "a typed cloud-only failure permits the durable local return with the existing notice");
});

await suite("Finale recovery: the actual pause exit keeps unfinished fights at the chamber and sealed victories on their way home", async () => {
  const path = new URL("../src/scenes/GreatBattleScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const create = owner.members.find(member => member.name?.getText(source) === "create") as ts.MethodDeclaration;
  // Run the real menu installation before the first artwork operation. Its
  // callback and the real leave method dispatch both actual before/after states.
  const methods = ["onFinalPhraseComplete", "commitFinalVictory", "leaveBattle"].map(name =>
    owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n");
  const code = ts.transpileModule(`class Finale { create() { ${create.body!.statements.slice(0, 2)
    .map(statement => statement.getText(source)).join("\n")} } ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const sealed of [false, true]) {
    const initial = emptySave(); initial.typewriterAwakened = true;
    let durable = JSON.stringify(initial);
    const store = new SaveStore({ async load() { return migrate(JSON.parse(durable)); }, async save(state) { durable = JSON.stringify(state); } }, initial, { saveDelayMs: 60000 });
    let menu: any; const starts: any[] = [];
    const Finale = new Function("assetLoadBlocked", "installChapterMenu", "titleHomecoming", `${code}; return Finale;`)(
      () => false, (_scene: unknown, options: unknown) => { menu = options; return {}; }, titleHomecoming);
    const scene = new Finale(); Object.assign(scene, { store, clearActiveTargets() {}, runPeriodSeal() {},
      band: { setObjective() {} }, scene: { start: (...args: any[]) => starts.push(args) } });
    scene.create();
    assertEqual(menu.leaveLabel, "Save & leave battle", "the installed menu label remains truthful on either side of victory");
    assert(menu.leaveHint.includes("unfinished battle") && menu.leaveHint.includes("sealed victory continues home"), "the menu explains both possible recovery destinations");
    if (sealed) scene.onFinalPhraseComplete();
    // The real pause menu flushes before invoking its leave callback.
    await store.flush(); menu.onLeave();
    assertEqual(starts.map(args => args[0]), [sealed ? "HomecomingScene" : "PortalChamberScene"], "same-session pause leave cannot hide an unseen earned reunion behind the completed library");
    assertEqual(starts[0][1].store, store, "the destination uses the same durably saved journey");
    assertEqual(titleHomecoming(migrate(JSON.parse(durable))), sealed, "a simultaneous restart reaches the same pending-homecoming decision");
  }
});

await suite("Finale recovery: the last target settles victory durably before its exit and queued presentation timers", async () => {
  const path = new URL("../src/scenes/GreatBattleScene.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const methods = ["runFinalPhraseWords", "makeFinalPhraseWord", "commitFinalVictory", "onFinalPhraseComplete"].map(name =>
    owner.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n");
  const code = ts.transpileModule(`class Finale { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const noop = () => {};
  const Finale = new Function("playChime", "playClaimLine", "playBodyImpact", "attachWordBodyAnchor", `${code}; return Finale;`)(noop, noop, noop, () => ({}));
  for (const index of [0, 1]) {
    const initial = emptySave(); initial.typewriterAwakened = true;
    let durable = JSON.stringify(initial), writes = 0;
    const backend = { async load() { return migrate(JSON.parse(durable)); }, async save(state: SaveState) { writes++; durable = JSON.stringify(state); } };
    const store = await SaveStore.load(backend, { saveDelayMs: 60000 });
    const timers: Array<{ delay: number; next: () => void }> = [];
    let targetOptions: any;
    const scene = new Finale(); Object.assign(scene, {
      store, scale: { width: 1920, height: 1080 }, band: { setObjective: noop },
      finalPhraseWordPosition: () => ({ x: 960, y: 500 }),
      createFinalPhraseWordTrace: () => ({ prop: { x: 960, y: 500 }, claim: noop, advance: noop, dissolve: noop }),
      makeWord(options: unknown) { targetOptions = options; return {}; },
      trackTargetAnchor: noop, clearTargetAnchor: noop, registerActiveTarget: noop,
      pulseWrenDefender: noop, clearActiveTargets: noop, runPeriodSeal: noop,
      againText: { x: 960, y: 430, alpha: .8 }, brightnessAlpha: 0,
      screenBrightnessOverlay: { clear: noop, fillStyle: noop, fillRect: noop, setAlpha: noop },
      tweens: { add: noop }, time: { delayedCall(delay: number, next: () => void) { timers.push({ delay, next }); } },
    });
    scene.runFinalPhraseWords(["come", "home."], index);
    assertEqual(timers.length, 0, "target creation alone does not queue completion or victory");
    store.recordKeystroke(index === 1 ? "." : "e", true);
    targetOptions.onSettled();
    await store.flush();
    const restored = await SaveStore.load(backend);
    assertEqual(titleHomecoming(restored.get()), index === 1, "only settling the last authored target records a won battle before the fade");
    assertEqual(restored.get().keyStats[index === 1 ? "." : "e"].hits, 1, "the settled snapshot includes the final character's existing statistics");
    assertEqual(timers.length, 0, "durability precedes all scene completion delays");
    const atSettle = store.get().updatedAt;
    targetOptions.onComplete();
    assertEqual(timers.map(timer => timer.delay), [200], "the original visual callback retains its existing delay");
    assertEqual(titleHomecoming(store.get()), index === 1, "the last visual callback is also safe if invoked as a completion fallback");
    if (index === 1) {
      const delayed = timers.shift()!; delayed.next();
      assertEqual(timers.map(timer => timer.delay), [600], "the original period-preparation delay is retained");
      timers.shift()!.next(); await store.flush();
      assertEqual([store.get().updatedAt, writes], [atSettle, 1], "settled, visual and final-mark callbacks share one idempotent victory commit");
    }
  }
});

function openingBody(kind: string, x = 0, y = 0): any {
  return { kind, x, y, scene: true, active: true, scaleX: 1, scaleY: 1, alpha: 1,
    parentContainer: null, children: [] as any[], height: kind === "sibling-portrait" ? 727 : 240,
    setDepth(value: number) { this.depth = value; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setScale(value: number) { this.scaleX = this.scaleY = value; return this; },
    setTexture(key: string) { this.texture = key; this.height = emptyHandsHeight; return this; },
    add(child: any) { child.parentContainer?.remove(child); child.parentContainer = this; this.children.push(child); return this; },
    remove(child: any) { this.children = this.children.filter((item: any) => item !== child); child.parentContainer = null; return this; },
    destroy() { this.scene = false; this.parentContainer?.remove(this); },
    getWorldTransformMatrix() {
      const parent = this.parentContainer?.getWorldTransformMatrix();
      const at = parent ? parent.transformPoint(this.x, this.y) : { x: this.x, y: this.y };
      const scaleX = (parent?.scaleX ?? 1) * this.scaleX, scaleY = (parent?.scaleY ?? 1) * this.scaleY;
      return { scaleX, scaleY,
        transformPoint: (x: number, y: number) => ({ x: at.x + x * scaleX, y: at.y + y * scaleY }),
        applyInverse: (x: number, y: number) => ({ x: (x - at.x) / scaleX, y: (y - at.y) / scaleY }),
      };
    },
  };
}

function openingFixture(gender: "boy" | "girl" = "boy", reduced = false, missingArt = false) {
  const Opening = new Function("makeWrenSprite", "addLocalGroundShadow", "setWrenPose", "reducedMotion", "playActorAttention", "PORTAL_TARGET", "OPENING_STEPS", "openingStep", "Phaser",
    `${openingCode}; return Opening;`)(() => openingBody("wren-sprite"), () => openingBody("shadow"), (sprite: any, pose: string) => { sprite.pose = pose; },
    (scene: any) => scene.motionReduced, () => {}, { x: 1510, y: 610 }, OPENING_STEPS, openingStep,
    { Cameras: { Scene2D: { Events: { FADE_OUT_COMPLETE: "fade-out-complete" } } } });
  const scene = new Opening();
  const sibling = openingBody("sibling", 1180, 950), portrait = openingBody("sibling-portrait"), prop = openingBody("drawing", 24, -116);
  sibling.add(portrait); if (gender === "boy") sibling.add(prop);
  const tweens: any[] = [], gates: Array<() => void> = [], checkpoints: string[] = [], lines: string[] = [], timers: any[] = [], fades: number[] = [], transitions: string[] = [];
  const state: any = { wrenGender: gender, typewriterAwakened: false, checkpoint: null };
  Object.assign(scene, {
    wrenGender: gender, motionReduced: reduced, siblingActor: sibling, siblingPortrait: portrait,
    siblingKeepsake: gender === "boy" ? prop : null, carriedKeepsake: null, openingWren: null, openingDepartureStarted: false,
    add: { container: (x: number, y: number) => openingBody("wren", x, y) },
    textures: { exists: () => !missingArt },
    tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(target: any) { for (const tween of tweens) if (tween.targets === target) tween.cancelled = true; } },
    store: { get: () => state, update: (change: (value: any) => void) => change(state), clearCheckpoint() { state.checkpoint = null; } },
    checkpoint(step: string) { checkpoints.push(step); state.checkpoint = { scene: "OpeningScene", step, data: {} }; },
    narration: { say: (key: string) => lines.push(key) }, readThen: (next: () => void) => gates.push(next),
    playOpeningPortalTravel() { this.stageOpeningWrenDeparture(); },
    time: { delayedCall: (ms: number, callback: () => void) => timers.push({ ms, callback }) },
    cameras: { main: { fadeOut: (ms: number) => fades.push(ms), once: (_event: string, callback: () => void) => callback() } },
    scene: { start: (key: string) => transitions.push(key) },
    drawRuna() {}, drawSibling() { this.siblingActor = sibling; this.siblingPortrait = portrait; this.siblingKeepsake = gender === "boy" ? prop : null; },
  });
  return { scene, sibling, portrait, prop, tweens, gates, checkpoints, lines, state, timers, fades, transitions,
    transfer: () => tweens.find(tween => tween.targets === prop && tween.duration === 420),
  };
}

await suite("Opening keepsake: Saga gives the one drawing to grounded Wren without leaving a painted duplicate", () => {
  for (const reduced of [false, true]) {
    const f = openingFixture("boy", reduced);
    const before = f.prop.getWorldTransformMatrix().transformPoint(0, 0);
    f.scene.playSiblingFarewell();
    const wren = f.scene.openingWren;
    assertEqual([wren.x, wren.y], [982, 936], "receiving uses the original departure footprint");
    assert(!f.sibling.children.includes(f.prop) && wren.children.includes(f.prop), "ownership of the same drawing moves from Saga to Wren");
    assertEqual([f.scene.siblingKeepsake, f.scene.carriedKeepsake], [null, f.prop], "there is one carried subject and no second source overlay");
    assertEqual([f.portrait.texture, f.portrait.height * f.portrait.scaleY], ["sibling-empty-hands", 260], "Saga's baked-in drawing is replaced by the matching empty-hands pose at the same display height");
    if (reduced) assertEqual([f.prop.x, f.prop.y, f.transfer()], [20, -112, undefined], "reduced motion is already received, with no transfer tween");
    else {
      assertEqual(f.prop.getWorldTransformMatrix().transformPoint(0, 0), before, "reparenting keeps the drawing at its original world position before movement");
      assertEqual(f.transfer().duration, 420, "normal presentation gives the handoff one finite movement");
    }
    assertEqual([f.gates.length, f.checkpoints.length, f.lines.length], [0, 0, 0], "the handoff creates no reading gate, save boundary or dialogue");
  }
  const sourcePng = readFileSync(new URL("../art/sibling/sibling-front.png", import.meta.url));
  assertEqual(emptyHandsPng[25], 6, "the derived pose keeps a genuine RGBA alpha channel");
  assert(Math.abs(emptyHandsPng.readUInt32BE(16) / emptyHandsHeight - sourcePng.readUInt32BE(16) / sourcePng.readUInt32BE(20)) < .002, "full-body framing retains the source aspect ratio at the existing display height");
});

await suite("Opening keepsake: early Continue settles receipt before the original bridge and portal timing", () => {
  const f = openingFixture(); f.scene.playSiblingFarewell();
  f.scene.beat10();
  assert(f.transfer().cancelled, "early Continue cancels the moving paper before the bridge is shown");
  assertEqual([f.prop.x, f.prop.y, f.gates.length, f.checkpoints], [20, -112, 1, ["departure"]], "the bridge has its original one gate with the drawing already held");
  assertEqual(f.lines, ["opening_beat10_bridge_to_hub"], "the original bridge wording is preserved");
  f.gates.shift()!();
  const crossing = f.tweens.find(tween => tween.targets === f.scene.openingWren && tween.duration === 520);
  assertEqual([crossing.x, crossing.y, crossing.alpha, crossing.scaleX, crossing.scaleY], [1490, 740, .14, .9, .9], "the original travel route, fade and scale are unchanged");
  assertEqual([f.timers[0].ms, f.state.typewriterAwakened, f.state.checkpoint], [560, true, null], "the original departure timer and completed-opening save boundary remain intact");
  const count = f.tweens.length; f.scene.stageOpeningWrenDeparture();
  assertEqual(f.tweens.length, count, "repeated staging cannot start a second portal crossing");
  f.timers[0].callback();
  assertEqual([f.fades, f.transitions], [[700], ["PortalChamberScene"]], "the existing fade and hub destination remain unchanged");
});

await suite("Opening keepsake: restored departure receives immediately while Magnus keeps his original promise", () => {
  for (const reduced of [false, true]) {
    const f = openingFixture("boy", reduced);
    f.state.checkpoint = { scene: "OpeningScene", step: "departure", data: {} };
    f.scene.resumeOpening();
    assertEqual([f.prop.x, f.prop.y, f.transfer(), f.gates.length], [20, -112, undefined, 1], "restoring the bridge settles the received prop without replaying an action or adding a gate");
  }
  const magnus = openingFixture("girl"); magnus.scene.playSiblingFarewell(); magnus.scene.beat10();
  assertEqual([magnus.scene.openingWren, magnus.scene.carriedKeepsake, magnus.portrait.texture], [null, null, undefined], "Magnus is not given Saga's drawing or an earlier Wren entrance");
  assertEqual(magnus.gates.length, 1, "Magnus retains the same bridge Continue");
  const missing = openingFixture("boy", false, true); missing.scene.playSiblingFarewell(); missing.scene.beat10();
  assertEqual([missing.scene.openingWren, missing.scene.carriedKeepsake, missing.gates.length], [null, null, 1], "missing optional pose art safely retains the original farewell and never traps progression");
});

await suite("Opening keepsake: cleanup and actual init cannot retain a drawing or transfer across reuse", () => {
  const f = openingFixture(); f.scene.playSiblingFarewell();
  f.scene.init({ store: f.scene.store });
  assert(f.transfer().cancelled && !f.prop.scene, "reusing the scene removes the moving prop and its tween");
  assertEqual([f.scene.carriedKeepsake, f.scene.openingWren, f.scene.siblingPortrait, f.scene.openingDepartureStarted], [null, null, null, false], "actual init resets all new ownership and departure state");
  f.scene.clearCarriedKeepsake();
  assertEqual(f.scene.carriedKeepsake, null, "repeated cleanup is safe");
});
