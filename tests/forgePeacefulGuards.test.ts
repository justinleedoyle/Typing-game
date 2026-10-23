import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/ClockworkForgeScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const methods = ["showPeacefulGuards", "clearPeacefulGuards", "drawGolemInto", "startFork2PeacefulBranch", "afterFork2", "staticGolemWordPosition", "gregorTutorialMove", "gregorTutorialCommand", "catwalkCueX", "catwalkWrenX"];
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
  const Forge = new Function("addLocalGroundShadow", "applySceneActorLighting", "reducedFlashes", "PALETTE_HEX", "Phaser", compiled + "; return Forge;")(
    () => ({}), (_scene: unknown, image: any) => { image.lit = true; }, () => reduced, { brass: 0xbc9f5b },
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
