import { assert, assertEqual, suite } from "./_assert";
import { homecomingLines } from "../src/game/homecoming";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
