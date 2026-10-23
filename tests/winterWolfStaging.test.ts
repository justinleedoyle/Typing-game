import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertClose, assertEqual, suite } from "./_assert";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  return ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
}
function constants(file: ts.SourceFile, names: readonly string[]): string {
  return file.statements.filter(ts.isVariableStatement).flatMap(statement =>
    statement.declarationList.declarations.filter(declaration => names.includes(declaration.name.getText(file)))
      .map(declaration => `const ${declaration.getText(file)};`)).join("\n");
}
const winterSource = source("../src/scenes/WinterMountainScene.ts");
const winterClass = winterSource.statements.find(ts.isClassDeclaration)!;
const winterMethods = ["spawnBoss", "drawBossInto", "makeWolfSnowFooting"].map(name =>
  winterClass.members.find(member => member.name?.getText(winterSource) === name)!.getText(winterSource));
const wolfSource = source("../src/game/wolf.ts");
const wolfFunction = wolfSource.statements.find(statement => ts.isFunctionDeclaration(statement) &&
  statement.name?.text === "makeWolfSprite")!;
const wolfCode = ts.transpileModule(`${constants(wolfSource, ["PACK_DISPLAY_HEIGHT", "LEADER_DISPLAY_HEIGHT"])}
  ${wolfFunction.getText(wolfSource).replace(/^export\s+/, "")}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const makeWolfSprite = new Function("applySceneActorLighting", `${wolfCode}; return makeWolfSprite;`)(() => {});
const winterCode = ts.transpileModule(`${constants(winterSource, [
  "BOSS_PHRASE", "BOSS_ADVANCE_MS", "BOSS_SPAWN_X", "BOSS_SPAWN_Y",
  "WOLF_KNOCKBACK_PAUSE_MS", "DANGER_RAMP_START",
])}
  class Winter { ${winterMethods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
class Enemy {
  constructor(readonly config: Record<string, any>) {}
}
const Winter = new Function("MovingWordEnemy", "makeWolfSprite", "addLocalGroundShadow", "addContainerWake", "PALETTE_HEX",
  `${winterCode}; return Winter;`)(Enemy, makeWolfSprite, () => ({}), () => {}, { frost: 0xabcdef });

class MarkGraphics {
  ellipses = 0;
  strokes: Array<readonly number[]> = [];
  grains: Array<readonly number[]> = [];
  lineStyle() { return this; }
  fillStyle() { return this; }
  fillEllipse() { this.ellipses += 1; return this; }
  lineBetween(...points: number[]) { this.strokes.push(points); return this; }
  fillCircle(...points: number[]) { this.grains.push(points); return this; }
}

await suite("Winter Old One: a right-side threat enters and faces toward Wren without changing its deadlines", () => {
  const winter = new Winter();
  const pngHeight = readFileSync(new URL("../art/wolf/wolf-leader.png", import.meta.url)).readUInt32BE(20);
  const sprite = {
    height: pngHeight, scaleX: 1, scaleY: 1, originX: 0, originY: 0,
    setOrigin(x: number, y: number) { this.originX = x; this.originY = y; return this; },
    setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; },
  };
  let body: { x: number; y: number; alpha: number; depth: number; children: unknown[] };
  Object.assign(winter, {
    scale: { width: 1920 }, wolves: [], activeTargets: [], typingInput: {}, waveActive: true,
    wrenContainer: { x: 960, y: 842 },
    director: { advanceMs: (base: number) => base },
    makeWolfFrostRim: () => ({}),
    add: {
      container(x: number, y: number) {
        body = { x, y, alpha: 1, depth: 0, children: [],
          setDepth(depth: number) { this.depth = depth; return this; },
          setAlpha(alpha: number) { this.alpha = alpha; return this; },
          add(child: unknown) { this.children.push(child); return this; },
        } as typeof body;
        return body;
      },
      image(_x: number, _y: number, key: string) {
        assertEqual(key, "wolf-leader", "the accepted leader artwork is preserved");
        return sprite;
      },
      graphics: () => new MarkGraphics(),
    },
  });
  winter.spawnBoss(725);
  const enemy = winter.boss as Enemy;
  assert(body!.x > 1920, "the right-side threat enters from the right edge");
  assertEqual([enemy.config.restX, enemy.config.restY, enemy.config.wrenX], [1450, 800, 960],
    "its rest slot and advance destination remain unchanged");
  assert(sprite.scaleX < 0, "the real feet-anchored sprite helper mirrors its face left toward Wren");
  assertClose(sprite.scaleY * pngHeight, 330, 0.00001, "the Old One keeps its authored display height");
  assertEqual([sprite.originX, sprite.originY], [0.5, 1], "the painted paws stay feet-anchored");
  assertEqual([enemy.config.advanceMs, enemy.config.entranceMs, enemy.config.entranceDelayMs], [17000, 1100, 725],
    "the director base, entrance time and caller's delay are exact");
  assertEqual([enemy.config.word, enemy.config.manualAttach, enemy.config.caseSensitive, enemy.config.anchorOffsetY],
    ["the Old One, STIRRING.", true, true, -286], "the ward, exact title and answer placement are preserved");
  assertEqual(winter.wolves, [enemy], "the same single boss enters the live pack");
});

await suite("Winter wolf contact: broken snow grains replace the hard floating shelf", () => {
  const winter = new Winter();
  Object.assign(winter, { add: { graphics: () => new MarkGraphics() } });
  for (const isBoss of [false, true]) {
    const marks = winter.makeWolfSnowFooting(isBoss) as MarkGraphics;
    assertEqual(marks.ellipses, 0, "the contact drawing contains no continuous snow platform");
    assert(marks.strokes.length >= 3 && marks.grains.length >= 2, "small broken snow marks retain visible contact");
    assert(marks.strokes.every(([x1, y1, x2, y2]) => Math.abs(x2 - x1) <= 13.00001 && Math.abs(y1) <= 3 && Math.abs(y2) <= 4),
      "separate short strokes stay at the paw line rather than forming a raised shelf");
    assert(marks.grains.every(([, y, radius]) => Math.abs(y) <= 3 && radius <= 1.8),
      "snow grains remain small and close to the same foot line");
  }
});
