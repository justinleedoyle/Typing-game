import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  return ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
}
function compile(code: string, globals: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(globals), `${js}; return ${result};`)(...Object.values(globals));
}
const battle = source("../src/scenes/GreatBattleScene.ts");
const owner = battle.statements.find(ts.isClassDeclaration)!;
const methods = ["showFinaleCompanionAction", "applyGlassFishHitWindow", "registerActiveTarget", "drawQuietLord",
  "quietLordBodyTarget", "quietLordClaimOrigin", "updateStrikeLinePosition", "playBellsTongueStrikeCue"]
  .map(name => owner.members.find(member => member.name?.getText(battle) === name)!.getText(battle)).join("\n");
const constants = battle.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => declaration.name.getText(battle).startsWith("QUIET_LORD_"))
    .map(declaration => `const ${declaration.getText(battle)};`)).join("\n");
const living = source("../src/game/livingScene.ts");
const stage = living.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "stageCompanionCameo")!;
const noop = () => {};
const Stage = compile(stage.getText(living).replace(/^export\s+/, ""), {
  addLocalGroundShadow: () => ({}), applySceneActorLighting: noop, addContainerWake: noop,
  playBodyImpact: noop, addIdleBreath: noop,
}, "stageCompanionCameo");

function node(x = 0, y = 0): any {
  return { x, y, alpha: 1, scaleX: 1, scaleY: 1, originX: 0, originY: 0, scene: true, children: [] as any[], ellipses: [] as number[][], lines: [] as number[][], pen: [0, 0],
    setDepth() { return this; }, setAlpha(alpha: number) { this.alpha = alpha; return this; },
    setPosition(px: number, py: number) { this.x = px; this.y = py; return this; },
    setOrigin(px: number, py = px) { this.originX = px; this.originY = py; return this; },
    setScale(scale: number) { this.scaleX = this.scaleY = scale; return this; },
    setFlipX() { return this; }, setTint() { return this; },
    fillStyle() { return this; }, lineStyle() { return this; }, strokeEllipse() { return this; },
    clear() { this.lines = []; return this; }, beginPath() { return this; }, strokePath() { return this; },
    moveTo(px: number, py: number) { this.pen = [px, py]; return this; },
    lineTo(px: number, py: number) { this.lines.push([...this.pen, px, py]); this.pen = [px, py]; return this; },
    fillEllipse(...args: number[]) { this.ellipses.push(args); return this; },
    add(child: any) { for (const item of Array.isArray(child) ? child : [child]) { item.parentContainer = this; this.children.push(item); } return this; },
  };
}

function fixture(flashesReduced = false) {
  const specs: any[] = [];
  const images: any[] = [];
  const graphics: any[] = [];
  const timers: any[] = [];
  const tweens: any[] = [];
  const targets: any[] = [];
  const dismissals: any[] = [];
  const breaths: any[] = [];
  const impacts: any[] = [];
  const Finale = compile(`${constants}\nclass Finale { ${methods} }`, {
    stageCompanionCameo(scene: any, options: any) { specs.push(options); return Stage(scene, options); },
    reducedFlashes: () => flashesReduced, playChime: noop, playActorAttention: noop,
    makeQuietLordSprite(scene: any) {
      return scene.add.image(0, 0, "quiet-lord").setOrigin(0.5, 1).setScale(480 / 930);
    },
    addLocalGroundShadow: () => ({}), addContainerWake: noop,
    playBodyImpact(_scene: any, body: any, options: any) { impacts.push({ body, options }); },
    addIdleBreath(_scene: any, body: any, options: any) { breaths.push({ body, options }); }, SERIF: "serif",
  }, "Finale");
  const s = new Finale();
  let flashes = 0;
  Object.assign(s, {
    scale: { width: 1920, height: 1080 }, activeTargets: [],
    add: {
      container: (x: number, y: number) => node(x, y),
      graphics() { const g = node(); graphics.push(g); return g; },
      image(x: number, y: number, key: string) { const image = { ...node(x, y), key, height: key === "quiet-lord" ? 930 : 1024 }; images.push(image); return image; },
      text: (x: number, y: number, text: string) => ({ ...node(x, y), text, width: text.length * 24 }),
    },
    showRelicNotice: noop, band: { setObjective: noop }, playGlassFishCorridorCue: noop,
    time: { delayedCall(ms: number, next: () => void) { timers.push({ ms, next }); } },
    tweens: { add(options: any) { tweens.push(options); return options; } },
    typingInput: { register: noop }, quietLordContainer: node(),
    makeWindowStrikeWord(options: any, fx: any) {
      const target = { ...options, fx, playEntryWake: noop, playIdleFloat(value: any) { this.float = value; } };
      targets.push(target); return target;
    },
    clearActiveTargets() { s.activeTargets = []; },
    dismissFinaleCompanionAction(...args: any[]) { dismissals.push(args); },
    cameras: { main: { flash() { flashes += 1; } } },
    drawQuietLordGroundSeal: () => ({}),
  });
  return { s, specs, images, graphics, timers, tweens, targets, dismissals, breaths, impacts, flashes: () => flashes };
}

await suite("Finale fish opening: actual cameo and word envelopes stay separate without changing its native action or continuation", () => {
  for (const flashesReduced of [false, true]) {
    const f = fixture(flashesReduced);
    let done = 0;
    f.s.applyGlassFishHitWindow(() => { done += 1; });
    assertEqual(f.targets.length, 0, "the target keeps its original delayed appearance");
    assertEqual(f.timers[0].ms, 500, "the corridor delay remains exactly500ms");
    f.timers[0].next();
    const word = f.targets[0]!;
    const spec = f.specs[0]!;
    const fish = f.images.find(image => image.key === "finale-companion-glass-fish")!;
    assertEqual([fish.originX, fish.originY], [0.5, 1], "the actual shared cameo is feet-anchored, so its full height is included");
    const fishTop = Math.min(spec.startY, spec.y, spec.y + spec.breathDy) - spec.height;
    const wordBottom = word.y + word.fontSize / 2 + Math.abs(word.float.dy) + 6;
    assert(wordBottom + 10 < fishTop, "glyphs, stroke and word float clear the fish's full entrance and idle envelope");
    assert(word.y - word.fontSize / 2 > 360, "the lifted word stays below the narration lane");
    assertEqual([word.word, word.x, spec.x, spec.y, spec.height], ["light", 1920 * 0.64, 1920 * 0.62, 650, 94], "native action and all companion staging stay unchanged");
    assertEqual(word.fx.sourceY, word.y + 46, "the original corridor tether follows its word");
    assertEqual(f.s.activeTargets.length, 1, "the actual target is registered for normal keyboard input");
    assertEqual(f.flashes(), flashesReduced ? 0 : 1, "the existing reduced-flash preference is preserved");
    word.onComplete();
    assertEqual(f.s.activeTargets.length, 0, "completion clears the native word");
    assertEqual(done, 0, "the next duel round still waits for the original hit animation");
    const hit = f.tweens.at(-1)!;
    assertEqual(hit.duration, 300, "the original Lord hit duration is preserved");
    hit.onComplete();
    assertEqual([f.dismissals.length, done], [1, 1], "the original companion departure and next round occur once");
  }
});

await suite("Finale grounding: both kindness sizes keep the painted feet, word stroke and floor at one courtyard anchor", () => {
  const f = fixture();
  f.s.drawQuietLord(false, true);
  const lord = f.s.quietLordContainer;
  const sprite = f.images.find(image => image.key === "quiet-lord")!;
  const text = f.s.againText;
  const stroke = f.s.strikeLineGraphic;
  assert(stroke.parentContainer === text.parentContainer && stroke.parentContainer === lord,
    "name and strike share the actual transform rather than independently guessing world coordinates");
  assertEqual(stroke.lines, [[text.x - text.width / 2, text.y, text.x + text.width / 2, text.y]],
    "the stroke crosses the rendered word in their shared local coordinates");
  for (const scale of [1, 0.82, 0.6]) {
    lord.setScale(scale);
    const feet = { x: lord.x + sprite.x * scale, y: lord.y + sprite.y * scale };
    assertEqual(feet, { x: 960, y: 660 }, "initial, kindness and later shrink retain the same world floor contact");
    assertEqual(f.s.quietLordBodyTarget(), feet, "arrival and facet feedback use that visible floor contact");
  }
});

await suite("Finale grounding: claim and impact endpoints follow the scaled painted body", () => {
  const f = fixture();
  f.s.drawQuietLord(false, true);
  const lord = f.s.quietLordContainer;
  for (const scale of [1, 0.82, 0.6]) {
    lord.setScale(scale);
    assertEqual(f.s.quietLordClaimOrigin(40, 608), { x: 960 + 40 * scale, y: 660 - 52 * scale },
      "the claim ends52 painted pixels above the visible feet, including both kindness shrink sizes");
    f.s.playBellsTongueStrikeCue();
    const impact = f.impacts.at(-1)!;
    assertEqual(impact.body.y + impact.options.offsetY, 660 - 52 * scale,
      "the actual relic impact shares the scaled claim endpoint instead of appearing below the sprite");
  }
});

await suite("Finale Lord eyes: both actual overlay lights stay inside the accepted asymmetric painted hood", () => {
  for (const force of [false, true]) for (const kind of [false, true]) {
    const f = fixture();
    f.s.drawQuietLord(force, kind);
    const eyes = f.graphics.find(g => g.ellipses.length === 2)!;
    assert(eyes, "the actual drawing retains both existing eye lights");
    // Accepted510×930 painting: at eye-height, its black hood opening lies
    // left of the image midpoint. Bounds include the full ellipse, not just its center.
    for (const [x, y, width, height] of eyes.ellipses) {
      assert(x - width / 2 >= -66 && x + width / 2 <= -14, "the entire eye stays within the measured painted face opening");
      assert(y - height / 2 >= 260 - 660 && y + height / 2 <= 310 - 660, "the entire eye stays vertically inside the hood, relative to the feet");
    }
    const sprite = f.images.find(image => image.key === "quiet-lord")!;
    const figure = f.breaths[0]!.body;
    assert(figure.children.includes(sprite) && figure.children.includes(eyes), "eyes share the painted figure's breath and cannot drift separately");
    assertEqual([sprite.originX, sprite.originY, sprite.y, f.s.quietLordContainer.y], [0.5, 1, 0, 660], "the painted feet remain at the accepted courtyard anchor while the parent scales around them");
    assertEqual(f.s.quietLordContainer.scaleX, kind ? 0.82 : 1, "the original kindness shrink still moves figure and eyes together");
  }
});
