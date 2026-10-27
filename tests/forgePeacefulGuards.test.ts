import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["showPeacefulGuards", "clearPeacefulGuards", "drawGolemInto", "startFork2PeacefulBranch", "afterFork2", "staticGolemWordPosition", "gregorTutorialMove", "gregorTutorialCommand", "catwalkCueX", "catwalkWrenX", "dismissBellowsWorkstation"];
const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration =>
    ["CATWALK_Y", "FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "FOUNDRY_GROUND_Y", "CATWALK_SURFACE_Y", "TUTORIAL_GOLEM_GROUND_Y", "TUTORIAL_GOLEM_Y"].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const create = sceneClass.members.find(member => member.name?.getText(source) === "create")!;
let shutdown: ts.ArrowFunction | undefined;
function findShutdown(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "this.events.once" &&
      node.arguments[0]?.getText(source).endsWith(".SHUTDOWN") && ts.isArrowFunction(node.arguments[1])) {
    shutdown = node.arguments[1];
  }
  ts.forEachChild(node, findShutdown);
}
findShutdown(create);
assert(shutdown, "the actual scene has a shutdown cleanup");
const compiled = ts.transpileModule(`${constants}
class Forge {
  static ground = FOUNDRY_GROUND_Y;
  ${methods.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
  shutdownFixture() ${shutdown!.body.getText(source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(reduced = false) {
  const bodies: any[] = [];
  const events: string[] = [];
  let target: any;
  let next: (() => void) | undefined;
  let flashes = 0;
  let companions = 0;
  const save = { satchel: [] as string[], realms: {} as Record<string, { cleared: boolean; choices: Record<string, string> }> };
  const Forge = new Function("addLocalGroundShadow", "applySceneActorLighting", "reducedFlashes", "reducedMotion", "PALETTE_HEX", "Phaser", compiled + "; return Forge;")(
    () => ({}), (_scene: unknown, image: any) => { image.lit = true; }, () => reduced, () => reduced, { brass: 0xbc9f5b },
    { Math: { Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) } },
  );
  const scene = new Forge();
  Object.assign(scene, {
    peacefulGuards: [],
    add: {
      container(x: number, y: number) {
        const body = { x, y, depth: 0, children: [] as any[], alive: true,
          setDepth(depth: number) { this.depth = depth; return this; },
          add(child: any) { this.children.push(child); return this; },
          destroy() { this.alive = false; events.push("guard-destroyed"); },
        };
        bodies.push(body);
        return body;
      },
      image(_x: number, _y: number, key: string) {
        return { key, height: 1024, scale: 1, lit: false,
          setScale(scale: number) { this.scale = scale; return this; },
        };
      },
    },
    tweens: { killTweensOf(body: any) { assert(body.alive, "guard cleanup cancels its tweens before destroying it"); } },
    makeGolemFoundryBase: () => ({}),
    commitFork: () => "peaceful",
    clearActiveTargets() {}, dismissForgeChoiceCue() {}, pulseForgeChoiceCue() {}, clearForgeChoiceCues() {},
    forgeChoiceWordPosition: () => ({ x: 850, y: 620 }),
    makeForgeChoiceWord: (_cue: unknown, options: any) => { target = options; return options; },
    registerActiveTarget() {},
    band: { setObjective() {} }, setNarrator() {},
    readThen: (fn: () => void) => { next = fn; },
    cameras: { main: { flash() { flashes += 1; } } },
    showForgeKeepsake() {
      assert(bodies.every(body => !body.alive), "guards leave before the held keepsake handoff");
      events.push("keepsake");
    },
    store: { update(fn: (state: typeof save) => void) { fn(save); } },
    startCompanionGate() { companions += 1; },
  });
  return { scene, Forge, bodies, events, save, target: () => target, continue: () => next!(),
    flashes: () => flashes, companions: () => companions };
}

await suite("Forge peaceful guards: existing painted actors share the foundry floor without entering combat", () => {
  const f = fixture();
  f.scene.showPeacefulGuards();
  assertEqual(f.bodies.length, 2, "the peaceful order has exactly two visible subjects");
  for (const body of f.bodies) {
    const image = body.children.find((child: any) => child.key === "forge-golem");
    assert(image?.lit, "each guard uses the existing golem asset and scene lighting");
    assertEqual(body.y + image.height * image.scale / 2, f.Forge.ground, "painted boots share the established Wren/foundry ground");
    assert(body.depth < 39, "guard bodies stay behind the existing choice props and target words");
    assert(Math.abs(body.x - 960) > 350, "outer floor lanes leave Wren and the central command clear");
  }
  f.scene.showPeacefulGuards();
  assertEqual(f.bodies.length, 2, "re-entering presentation does not duplicate actors");
  f.scene.clearPeacefulGuards();
  f.scene.clearPeacefulGuards();
  assertEqual(f.events.length, 2, "repeated cleanup destroys each body once");
});

await suite("Forge peaceful order: guards remain through the actual held response and leave before its original reward", () => {
  for (const reduced of [false, true]) {
    for (const completion of ["onComplete", "onSpellComplete"]) {
      const f = fixture(reduced);
      f.scene.startFork2PeacefulBranch();
      assertEqual([f.target().word, f.target().caseSensitive], ["STAND DOWN", true], "the original exact command is unchanged");
      assert(f.bodies.every(body => body.alive), "both guards are visible before typing");
      f.target()[completion]();
      assert(f.bodies.every(body => body.alive), "the held stilling acknowledgment keeps its subjects visible");
      assertEqual(f.save.satchel, [], "the original Continue gate still precedes the reward");
      assertEqual(f.flashes(), completion === "onSpellComplete" && !reduced ? 1 : 0, "flash preference and original command effect remain intact");
      f.continue();
      assertEqual(f.save.satchel, ["master-key"], "Continue earns exactly the original Master Key");
      assertEqual(f.save.realms["clockwork-forge"].choices.fork2, "peaceful", "the durable branch choice is preserved");
      assertEqual(f.events, ["guard-destroyed", "guard-destroyed", "keepsake"], "cleanup occurs before the reward card");
      assertEqual(f.companions(), 0, "reward reading still holds before companion eligibility");
      f.continue();
      assertEqual(f.companions(), 1, "the original next stage follows its reward Continue");
    }
  }
});

await suite("Forge peaceful guards: actual scene shutdown clears actors before a realm is restarted", () => {
  const f = fixture();
  f.scene.showPeacefulGuards();
  Object.assign(f.scene, {
    reading: { destroy() {} }, typingInput: { reset() {} }, input: {},
    releaseCatwalkCueWordAnchor() {}, dismissRevisitMemoryCue() {}, clearFornWordAnchors() {}, clearForkChoiceWordAnchors() {},
  });
  f.scene.shutdownFixture();
  assert(f.bodies.every(body => !body.alive), "leaving the real scene releases both guards");
  assertEqual(f.scene.peacefulGuards, [], "no stale actor records survive a restart");
});

await suite("Forge Gregor lesson: both native static commands stay outside Wren's hood", () => {
  const f = fixture();
  const targets: any[] = [];
  const golem = { container: { x: 1340, y: 368 } };
  Object.assign(f.scene, {
    scale: { width: 1920, height: 1080 },
    spawnStaticGolem(x: number, y: number, _boss: boolean, ground: number) {
      assertEqual([x, y + ground], [1340, 460], "the tutorial actor keeps its original catwalk ground");
      return golem;
    },
    makeStaticGolemWord(owner: any, options: any) {
      assertEqual(owner, golem, "both commands retain their actual golem tether owner");
      targets.push(options); return options;
    },
  });
  f.scene.gregorTutorialMove();
  f.scene.gregorTutorialCommand(golem);
  assertEqual(targets.map(target => target.word), ["turn", "TURN"], "both original native commands remain unchanged");
  assertEqual(targets.map(target => target.caseSensitive ?? false), [false, true], "the capital lesson still requires Shift");
  const wrenX = f.scene.catwalkWrenX(2);
  for (const target of targets) {
    assertEqual([target.x, target.y], [1530, 300], "both static words use the existing outer lane at their original height");
    const conservativeHalfWidth = target.word.length * target.fontSize * 0.45;
    assert(target.x - conservativeHalfWidth > wrenX + 100, "the complete target clears Wren's hood envelope");
    assert(target.x - conservativeHalfWidth > golem.container.x + 92, "the target also clears the golem's body envelope");
    assert(target.x + conservativeHalfWidth < 1920 - 120, "the word remains comfortably within the viewport");
  }
});

const workstationMethods = ["forgeWorkstationTexture", "drawForgeWorkstation", "drawApprenticeCue", "drawStandDownCue", "drawFightCue", "showFork1ChoiceCues", "showFork2ChoiceCues", "getForgeChoiceCue", "setForgeChoiceCue", "dismissForgeChoiceCue", "dismissBellowsWorkstation", "pulseForgeChoiceCue", "startFornBranch", "startCabalBranch", "afterFork1"];
const workstationConstants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration =>
    ["FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "FOUNDRY_GROUND_Y", "FORN_PASSAGES", "CABAL_PASSAGES"].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const workstationCode = ts.transpileModule(`${workstationConstants}
class Workshop {
  ${workstationMethods.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function workshopFixture(reduced = false) {
  const bodies: any[] = [];
  const tweens: any[] = [];
  const impacts: any[] = [];
  const textures = new Map<string, any>();
  const copies: any[][] = [];
  let scans = 0;
  let held: (() => void) | undefined;
  let passage: any;
  let bossEntries = 0;
  let rewardCalls = 0;
  const save = { satchel: [] as string[], almanacLore: [] as string[], realms: {} as Record<string, any> };
  const pixels = new Uint8ClampedArray(10 * 12 * 4);
  // Uneven export padding must not become visible width or a floating foot.
  for (let y = 2; y <= 9; y++) for (let x = 3; x <= 7; x++) pixels[(y * 10 + x) * 4 + 3] = 255;
  pixels[(11 * 10) * 4 + 3] = 8; // negligible export haze is not the metal base
  const sourceImage = { naturalWidth: 10, naturalHeight: 12 };
  const Workshop = new Function("document", "reducedMotion", "playBodyImpact", "PALETTE_HEX", workstationCode + "; return Workshop;")(
    { createElement() { scans++; return { getContext() { return { drawImage() {}, getImageData() { return { data: pixels }; } }; } }; } },
    () => reduced, (_scene: unknown, body: any, options: any) => impacts.push({ body, options }), { ember: 0xcd7445 },
  );
  const scene = new Workshop();
  Object.assign(scene, {
    textures: {
      exists: (key: string) => textures.has(key),
      get: () => ({ getSourceImage: () => sourceImage }),
      createCanvas(key: string, width: number, height: number) {
        const texture = { width, height, context: { drawImage(...args: any[]) { copies.push(args); } }, refresh() {} };
        textures.set(key, texture);
        return texture;
      },
    },
    add: {
      container(x: number, y: number) {
        const body: any = { x, y, scene, list: [], alpha: 1, scaleX: 1, scaleY: 1, destroyed: 0,
          setDepth(depth: number) { this.depth = depth; return this; },
          setAlpha(alpha: number) { this.alpha = alpha; return this; },
          add(child: any) { this.list.push(child); return this; },
          destroy() { this.destroyed++; this.scene = null; },
        };
        bodies.push(body); return body;
      },
      image(x: number, y: number, key: string) {
        const texture = textures.get(key)!;
        return { x, y, key, width: texture.width, height: texture.height, scale: 1,
          setOrigin(x: number, y: number) { this.origin = { x, y }; return this; },
          setScale(scale: number) { this.scale = scale; return this; },
        } as any;
      },
    },
    tweens: {
      killTweensOf(body: any) { for (const tween of tweens) if (tween.targets === body) tween.cancelled = true; },
      add(options: any) { tweens.push(options); return options; },
    },
    showApprenticeSprite() {}, hideApprenticeSprite() {}, hideFornSprite() {}, clearActiveTargets() {},
    commitFork: (_fork: string, choice: string) => choice,
    approachForgeWork() {},
    band: { setObjective() {} }, setNarrator() {},
    readThen(fn: () => void) { held = fn; },
    runPassageChain(words: string[], lines: string[], done: () => void, owner: string) { passage = { words, lines, done, owner }; },
    showForgeKeepsake() { rewardCalls++; },
    store: { update(fn: (state: typeof save) => void) { fn(save); } },
    startAct3() { bossEntries++; },
  });
  return { scene, bodies, tweens, impacts, textures, copies, save, scans: () => scans,
    continue: () => held!(), passage: () => passage, bossEntries: () => bossEntries, rewardCalls: () => rewardCalls };
}

await suite("Forge painted machinery: alpha padding never moves the metal base off the shared floor", () => {
  for (const reduced of [false, true]) {
    const f = workshopFixture(reduced);
    f.scene.showFork1ChoiceCues();
    f.scene.showFork2ChoiceCues();
    const painted = f.bodies.filter(body => body.list.length);
    assertEqual(painted.length, 3, "each real workstation has one painted subject");
    assertEqual(f.bodies.filter(body => !body.list.length).length, 1, "the fight word retains an owner without an invented weapon emblem");
    for (const body of painted) {
      const prop = body.list[0];
      assertEqual(body.y + prop.y, 866, "the trimmed metal base shares Wren's exact ground");
      assertEqual(prop.origin, { x: 0.5, y: 1 }, "painted props are grounded at their bottom center");
      assert(body.depth < 6, "Wren stays naturally in front of the machines");
    }
    assertEqual(painted.map(body => body.list[0].width * body.list[0].scale), [300, 250, 210], "visible alpha width determines the authored scale");
    assertEqual(f.textures.get("forge-valve-workstation-floor-trimmed").height, 8, "transparent padding and negligible haze are cropped from the floor footprint");
    assertEqual(f.copies[0].slice(1), [3, 2, 5, 8, 0, 0, 5, 8], "the actual renderer copies only the visible footprint, preserving aspect ratio");
    f.scene.showFork1ChoiceCues(); f.scene.showFork2ChoiceCues();
    assertEqual(f.bodies.length, 4, "re-entering the current choice does not duplicate machinery");
    assertEqual(f.scans(), 3, "trimmed texture scans are cached once per asset");
    for (const tween of f.tweens) {
      assert(!("x" in tween) && !("y" in tween) && !("scale" in tween) && !("scaleX" in tween), "entrances fade without moving or breathing the fixed base");
    }
    assertEqual(f.tweens.length, reduced ? 0 : 3, "reduced motion presents the settled machine immediately");
    const valve = f.scene.apprenticeCue;
    f.scene.pulseForgeChoiceCue(valve);
    assertEqual([valve.x, valve.y, valve.scaleX, valve.scaleY], [1280, 784, 1, 1], "typing feedback leaves the old source anchor and floor fixed");
    assertEqual(f.impacts.length, 1, "the familiar typing feedback remains available");
  }
});

await suite("Forge workstations: each native branch retains its subject and its original reward gate", () => {
  for (const reduced of [false, true]) {
    for (const choice of ["forn", "cabal"]) {
      const f = workshopFixture(reduced);
      f.scene.showFork1ChoiceCues();
      const bellows = f.scene.bellowsWorkstation;
      const valve = f.scene.apprenticeCue;
      if (choice === "forn") f.scene.startFornBranch(); else f.scene.startCabalBranch();
      assertEqual(choice === "forn" ? f.scene.bellowsWorkstation : f.scene.apprenticeCue, choice === "forn" ? bellows : valve, "the selected physical workstation remains through its held introduction");
      assertEqual(choice === "forn" ? f.scene.apprenticeCue : f.scene.bellowsWorkstation, null, "the unselected station is released before the passage begins");
      assertEqual(f.passage(), undefined, "the introduction still waits for native Continue");
      f.continue();
      assertEqual(f.passage().words, choice === "forn"
        ? ["work the bellows", "seal the seam", "forn gives you his hammer", "the forge breathes again"]
        : ["block the valve", "the apprentices cheer", "they hand you a wrench", "the forge chokes and slows"], "all four original phrases remain exact");
      assertEqual(f.save.satchel, [], "workstation presentation cannot award a keepsake early");
      f.passage().done();
      assertEqual(f.rewardCalls(), 1, "the original final passage callback performs its one handoff");
      assertEqual(f.save.satchel, [choice === "forn" ? "bellows-hammer" : "sabotage-wrench"], "the original branch still determines the reward");
      assertEqual([f.scene.bellowsWorkstation, f.scene.apprenticeCue], [null, null], "no workstation survives into the boss stage");
      assertEqual(f.bossEntries(), 0, "the original reward acknowledgment still holds");
      f.continue();
      assertEqual(f.bossEntries(), 1, "Continue enters the original boss once");
      for (const tween of f.tweens) assert(!("y" in tween) && !("scale" in tween), "dismissal leaves the metal base fixed too");
    }
  }
});

await suite("Forge workstations: interrupted fades are cancelled and repeat cleanup is safe", () => {
  const f = workshopFixture();
  f.scene.showFork1ChoiceCues();
  const bellows = f.scene.bellowsWorkstation;
  const valve = f.scene.apprenticeCue;
  f.scene.dismissBellowsWorkstation(false);
  f.scene.dismissForgeChoiceCue("apprentice", false);
  f.scene.dismissBellowsWorkstation(false);
  f.scene.dismissForgeChoiceCue("apprentice", false);
  assertEqual([bellows.destroyed, valve.destroyed], [1, 1], "each physical object is destroyed once");
  assertEqual(f.tweens.every(tween => tween.cancelled), true, "shutdown cancels unfinished entrances before destruction");
});
