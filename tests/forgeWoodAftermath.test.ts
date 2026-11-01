import { readFileSync } from "node:fs";
import ts from "typescript";
import { resolveRealmFork } from "../src/game/realmChoices";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const noop = () => {};
function actualClass(file: string, name: string, methods: string[], constantNames: string[] = []) {
  const url = new URL(`../src/scenes/${file}.ts`, import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const constants = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => constantNames.includes(declaration.name.getText(source)))
      .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
  const code = ts.transpileModule(`${constants}\nclass ${name} { ${methods.map(method =>
    owner.members.find(member => member.name?.getText(source) === method)!.getText(source)).join("\n")} } return ${name};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("resolveRealmFork", "playPortalArrivalWake", "addIdleBreath", "PALETTE_HEX", code)(
    resolveRealmFork, noop, noop, { ember: 0, moss: 0 });
}
const Forge = actualClass("ClockworkForgeScene", "Forge", ["startRevisit", "restoreForgeRevisitAftermath", "restoreForgeStage", "revisitMemoryCuePosition", "revisitMemoryWordPosition"],
  ["FLOOR_Y", "GOLEM_SPRITE_HEIGHT", "FOUNDRY_GROUND_Y", "FORGE_BELLOWS", "CATWALK_Y", "CATWALK_SURFACE_Y"]);
const Wood = actualClass("HauntedWoodScene", "Wood", ["startRevisit", "restoreWoodRevisitAftermath"]);

function fixture(kind: "forge" | "wood", choices: Record<string, string>, satchel: string[] = []) {
  const realm = kind === "forge" ? "clockwork-forge" : "haunted-wood";
  const save = Object.freeze({ realms: Object.freeze({ [realm]: Object.freeze({ cleared: true,
    choices: Object.freeze({ ...choices }) }) }), satchel: Object.freeze([...satchel]) });
  const before = JSON.stringify(save), bodies: any[] = [], drawings: any[] = [], props: any[] = [];
  const body = (x: number, y: number) => ({ x, y, scene: true, children: [] as any[], data: {} as any,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setDepth(depth: number) { this.depth = depth; return this; },
    setAlpha(alpha: number) { this.alpha = alpha; return this; },
    setScale(scale: number) { this.scale = scale; return this; },
    setFlipX(flip: boolean) { this.flip = flip; return this; },
    setTint(tint: number) { this.tint = tint; return this; },
    setData(key: string, value: unknown) { this.data[key] = value; return this; },
    add(child: any) { this.children.push(child); return this; },
  } as any);
  const scene = kind === "forge" ? new Forge() : new Wood();
  let gates = 0, caption = "";
  Object.assign(scene, {
    store: { get: () => save }, scale: { width: 1920, height: 1080 }, wrenContainer: body(520, 460),
    peacefulGuards: [], fork1Choice: null, companionAwarded: false,
    tweens: { killTweensOf: noop }, resetWrenToFront: noop, swapWrenFootingToFoundry: noop,
    showFornSprite() { this.fornSprite ??= body(400, 866); }, showFornEmptyHands() { this.fornSprite.empty = true; },
    showApprenticeSprite() { this.apprenticeSprite ??= body(1600, 866); },
    drawForgeWorkstation(x: number, y: number, texture: string, width: number) {
      const prop = Object.assign(body(x, y), { texture, width }); props.push(prop); return prop;
    },
    drawApprenticeCue(x: number, y: number) { return this.drawForgeWorkstation(x, y, "forge-valve-workstation", 250); },
    drawGolemInto(owner: any) { const sprite = body(0, 0); owner.add(sprite); return sprite; },
    createRootedWoodProp(x: number, texture: string, width: number) {
      const prop = Object.assign(body(x, 812), { texture, width }); props.push(prop); return prop;
    },
    add: {
      container(x: number, y: number) { const value = body(x, y); bodies.push(value); return value; },
      graphics() {
        const strokes: any[] = [];
        const drawing = new Proxy({ strokes }, { get(target, key) {
          if (key in target) return target[key as keyof typeof target];
          return (...args: any[]) => { strokes.push([key, ...args]); return drawing; };
        } }); drawings.push(drawing); return drawing;
      },
    },
    band: { setObjective: noop }, setNarrator(text: string) { caption = text; },
    readThen() { gates++; }, deliverRevisitPassage() { throw new Error("memory skipped its reading gate"); },
  });
  scene.startRevisit();
  assertEqual(JSON.stringify(save), before, "aftermath staging never changes choices, completion, rewards or inventory");
  assertEqual(gates, 1, "the original deliberate reading gate still owns the memory");
  return { scene, bodies, drawings, props, save, before, caption };
}

await suite("Forge aftermath: both worker routes and both final golem outcomes return to supported floor without replaying rewards", () => {
  for (const fork1 of ["forn", "cabal"]) for (const fork2 of ["peaceful", "fought"]) {
    const f = fixture("forge", { fork1, fork2 });
    assertEqual([f.scene.wrenContainer.x, f.scene.wrenContainer.y], [fork1 === "forn" ? 1060 : 860, 866], "revisit keeps Wren beside the chosen work on the painted lower foundry floor");
    assertEqual(f.props.map(p => p.texture), [fork1 === "forn" ? "forge-bellows-workstation" : "forge-valve-workstation"], "only the chosen work remains in the foundry");
    assertEqual(f.props[0].y, 866, "the selected machine shares the actual lower ground line");
    assertEqual(Boolean(f.scene.fornSprite?.empty), fork1 === "forn", "Forn never regains the gifted Hammer on a return");
    assertEqual(f.scene.revisitGolem.data["forge-aftermath"], fork2, "the noncombat remnant records the correct aftermath");
    assertEqual(Boolean(f.scene.revisitGolem.children[0].tint), fork2 === "fought", "only the heart-taken shell loses its warm metal highlights");
    assertEqual(f.scene.peacefulGuards, [], "aftermath figures never enter combat or guard targeting");
    for (let index = 0; index < 4; index++) {
      const word = f.scene.revisitMemoryWordPosition(index, 4);
      if (Math.abs(word.x - f.scene.wrenContainer.x) < 165) {
        assert(word.y <= f.scene.wrenContainer.y - 280, "the lower-floor memory words stay above Wren's hood");
      }
    }
    f.scene.restoreForgeRevisitAftermath(fork1, fork2);
    assertEqual([f.props.length, f.bodies.length], [1, 1], "repeated visual setup reuses its machine and shell");
  }
  const old = fixture("forge", { ending: "cabal-fought" });
  assertEqual(old.props[0].texture, "forge-valve-workstation", "legacy combined ending leaves the correct physical work");
  const explicit = fixture("forge", { fork1: "forn", fork2: "peaceful", ending: "cabal-fought" }, ["sabotage-wrench", "golem-heart"]);
  assertEqual([explicit.props[0].texture, explicit.scene.revisitGolem.data["forge-aftermath"]], ["forge-bellows-workstation", "peaceful"], "explicit route outranks stale combined ending and keepsakes in both prose and picture");
  const unknown = fixture("forge", {}, ["bellows-hammer", "sabotage-wrench", "master-key", "golem-heart"]);
  assertEqual([unknown.props, unknown.bodies], [[], []], "ambiguous legacy inventory does not invent a worker or golem outcome");
});

await suite("Wood aftermath: offering, empty flute hollow and spent-fire mark persist independently without manufacturing names", () => {
  for (const fork1 of ["offering", "bone-flute"]) for (const fork2 of ["bargain", "force"]) {
    const f = fixture("wood", { fork1, fork2 });
    assertEqual(f.props.map(p => p.texture), [fork1 === "offering" ? "wood-offering-shrine" : "wood-flute-hollow"], "the original chosen support survives the return");
    assertEqual(f.props[0].y, 812, "the physical remnant retains the original rooted floor");
    assertEqual(f.drawings.some(d => d.strokes.some((s: any[]) => s[0] === "fillRoundedRect")), fork1 === "offering", "only the offering shrine gains the remembered candle");
    const ash = f.drawings.find(d => d.strokes.some((s: any[]) => s[0] === "fillEllipse" && s[2] === 770));
    assertEqual(Boolean(ash), fork2 === "force", "only the grove-fire route leaves a spent mark");
    if (ash) {
      const ellipse = ash.strokes.find((s: any[]) => s[0] === "fillEllipse");
      assertClose(ellipse[1], 115.2, 0.001, "the ash retains the original fire's painted horizontal position");
      assertEqual(ellipse[2], 770, "the ash retains the original fire's ground depth");
    }
    if (fork1 === "bone-flute") assertEqual(f.scene.boneFluteProp, null, "the acquired flute does not reappear inside its empty hollow");
    const counts = [f.props.length, f.drawings.length, f.bodies.length];
    f.scene.restoreWoodRevisitAftermath(fork1, fork2);
    assertEqual([f.props.length, f.drawings.length, f.bodies.length], counts, "repeated setup cannot duplicate a candle, hollow or ground mark");
    assertEqual(JSON.stringify(f.save), f.before, "no visual aftermath can grant the unresolved ghost's name");
  }
  const alias = fixture("wood", { fork1: "bone-flute", fork2: "light-grove" });
  assert(alias.drawings.some(d => d.strokes.some((s: any[]) => s[0] === "lineBetween")), "historical light-grove alias still leaves ash");
  const explicit = fixture("wood", { fork1: "offering", fork2: "bargain" }, ["bone-flute", "ash-vial"]);
  assertEqual(explicit.props[0].texture, "wood-offering-shrine", "recorded offering outranks an opposite old relic");
  assert(!explicit.drawings.some(d => d.strokes.some((s: any[]) => s[0] === "lineBetween")), "a recorded bargain does not inherit fire from a stale vial");
  const unknown = fixture("wood", {}, ["shrine-token", "bone-flute", "ghost-kings-promise", "ash-vial"]);
  assertEqual([unknown.props, unknown.drawings], [[], []], "ambiguous old inventory leaves the scenery neutral");
});
