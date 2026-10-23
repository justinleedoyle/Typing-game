import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { getRunaLine } from "../src/audio/runaLines";
import { WOOD_DIRECTION_PUNCTUATION, woodWardWord, type WoodDirection } from "../src/game/wordBank";
import { selectFinalPhrase, FORCE_RELICS, KINDNESS_RELICS } from "../src/game/relicAlignment";

function sceneSource(name: string) {
  const path = new URL(`../src/scenes/${name}.ts`, import.meta.url);
  return ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function constant(source: ts.SourceFile, name: string): string {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(value => value.name.getText(source) === name);
    if (declaration?.initializer && ts.isStringLiteral(declaration.initializer)) return declaration.initializer.text;
  }
  throw new Error(`Missing literal ${name}`);
}

function stringArray(source: ts.SourceFile, name: string): string[] {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(value => value.name.getText(source) === name);
    let value = declaration?.initializer;
    if (value && ts.isAsExpression(value)) value = value.expression;
    if (value && ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteral)) {
      return value.elements.map(element => (element as ts.StringLiteral).text);
    }
  }
  throw new Error(`Missing string array ${name}`);
}

function actualMethod(source: ts.SourceFile, method: string, globals: Record<string, unknown> = {}) {
  const sceneClass = source.statements.find(ts.isClassDeclaration)!;
  const member = sceneClass.members.find(value => value.name?.getText(source) === method)!;
  const code = ts.transpileModule(`class Harness { ${member.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));
}

const wood = sceneSource("HauntedWoodScene");
const sky = sceneSource("SkyIslandScene");
const forge = sceneSource("ClockworkForgeScene");
const finale = sceneSource("GreatBattleScene");

await suite("Finale instructions: mixed-case counters explain the keys and existing candle stake", () => {
  const Scene = actualMethod(finale, "runDepthWords", { UI_HEX: { ember: 0, brass: 0 } });
  for (const [word, kindness] of [["unMAKE", true], ["unMAKE", false], ["unBIND", false]] as const) {
    const s = new Scene();
    let objective = "";
    let caption = "";
    let speaker: string | undefined;
    let target: { word: string; caseSensitive: boolean; onMiss?: () => void } | undefined;
    let charged = 0;
    Object.assign(s, {
      runOver: false, isKindnessDuel: kindness,
      band: { setObjective: (text: string) => { objective = text; } },
      setNarrator: (text: string, who?: string) => { caption = text; speaker = who; },
      lordDuelWordPosition: () => ({ x: 0, y: 0 }),
      makeLordWord: (opts: typeof target) => { target = opts; return opts; },
      registerActiveTarget() {}, chargeKindnessMiss: () => { charged += 1; },
    });
    s.runDepthWords([word, word], word === "unBIND" ? 1 : 0);
    assertEqual(target!.word, word, "the original mixed-case counter is unchanged");
    assert(target!.caseSensitive, "the visible capitals still require matching case");
    assert(objective.includes('"un" in lowercase') && objective.includes(`Shift for "${word.slice(2)}"`), "the task teaches the actual lowercase prefix and capital tail");
    assertEqual(objective.includes("costs a candle"), kindness, "the existing kindness penalty is announced before input, only when active");
    assert(!caption.includes("his name"), "unBIND is not falsely introduced as the Lord's name");
    assertEqual(speaker, undefined, "typing instructions use the narrator rather than pretending to be the Lord's own speech");
    target!.onMiss?.();
    assertEqual(charged, kindness ? 1 : 0, "the described stake remains wired to the original miss callback");
  }
});

await suite("Finale instructions: the sentence preview and exact word tasks preserve punctuation", () => {
  const Preview = actualMethod(finale, "deliverFinalPhrase", { selectFinalPhrase });
  const Words = actualMethod(finale, "runFinalPhraseWords");
  for (const satchel of [
    ["bells-tongue", "hunters-horn"], ["master-key", "quiet-chant"],
    ["snow-fox-cub", "ghost-kings-promise"], [...KINDNESS_RELICS].slice(0, 3),
    [...FORCE_RELICS].slice(0, 3), [], ["king-aurland"],
  ]) {
    const s = new Preview();
    let caption = "";
    let words: string[] = [];
    Object.assign(s, {
      store: { get: () => ({ satchel }) }, band: { setObjective() {} },
      setNarrator: (text: string) => { caption = text; },
      runFinalPhraseWords: (value: string[]) => { words = value; },
    });
    s.deliverFinalPhrase();
    assert(caption.includes(words.join(" ")), "the full selected native sentence replaces the previous counter caption");
    assert(caption.includes("including punctuation"), "the sentence preview teaches its commas, semicolons and final period");
    const w = new Words();
    let objective = "";
    let accepted = "";
    Object.assign(w, {
      store: { get: () => ({ satchel: [] }) },
      band: { setObjective: (text: string) => { objective = text; } },
      finalPhraseWordPosition: () => ({ x: 0, y: 0 }),
      makeFinalPhraseWord: (opts: { word: string }) => { accepted = opts.word; return opts; },
      registerActiveTarget() {},
    });
    for (let i = 0; i < words.length; i++) {
      w.runFinalPhraseWords(words, i);
      assertEqual(accepted, words[i], "the original word and authored punctuation remain the accepted target");
      assert(objective.endsWith(`"${accepted}"`), "the task quotes the exact target without appending a misleading extra period");
    }
  }
});

await suite("Later realm arrivals: the held introduction always has a visible next task", () => {
  for (const [source, method] of [
    [forge, "startAct1Arrival"], [sky, "startAct1"], [wood, "startArrival"],
  ] as const) {
    const Scene = actualMethod(source, method, { playPortalArrivalWake() {}, PALETTE_HEX: { ember: 0 } });
    const s = new Scene();
    let objective = "";
    let held = 0;
    Object.assign(s, {
      band: { setObjective: (text: string) => { objective = text; } },
      narration: { say: () => { assert(objective.length > 0, `${method} sets a task before displaying its arrival`); } },
      readThen: () => { held += 1; }, time: { now: 0, delayedCall() {} },
      showCatwalkCue() {}, catwalkCueX: () => 0, showPathCue() {},
      setAmbientLanternFieldAlpha() {}, setAmbientMistFieldAlpha() {},
    });
    s[method]();
    assert(objective.includes("Enter or Space"), `${method} tells the player how to leave the reading gate`);
    assertEqual(held, 1, `${method} preserves its readable introduction`);
  }
});

await suite("Later realm traversal: instructions precede actions and success waits for completion", () => {
  const noop = () => {};
  const cases = [
    {
      source: forge, method: "startCatwalkBeats", words: ["step", "duck", "grip"],
      globals: {
        CATWALK_WORDS: stringArray(forge, "CATWALK_WORDS"),
        CATWALK_NARRATIONS: stringArray(forge, "CATWALK_NARRATIONS"),
        CATWALK_RESPONSES: stringArray(forge, "CATWALK_RESPONSES"),
      },
    },
    { source: sky, method: "runPathBeats", words: ["balance", "lantern", "stepping"], globals: { PATH_BEATS: stringArray(sky, "PATH_BEATS") } },
    { source: wood, method: "startPathExploration", words: ["step,", "hush.", "wait?"], globals: {} },
  ];
  for (const entry of cases) {
    const Scene = actualMethod(entry.source, entry.method, {
      ...entry.globals, playWrenAction: noop, playWrenFocus: noop, playChime: noop,
    });
    const s = new Scene();
    type Target = { word: string; onClaim: () => void; onComplete: () => void };
    const targets: Target[] = [];
    const gates: Array<() => void> = [];
    let caption = "";
    let objective = "";
    const point = () => ({ x: 0, y: 0 });
    const makeWord = (target: Target) => { targets.push(target); return target; };
    Object.assign(s, {
      wrenContainer: { x: 0 }, setNarrator: (text: string) => { caption = text; },
      band: { setObjective: (text: string) => { objective = text; } },
      readThen: (next: () => void) => gates.push(next), makeWord, makePathWord: makeWord,
      registerActiveTarget: noop, clearActiveTargets: noop,
      catwalkCueX: () => 0, catwalkWordPosition: point, catwalkWrenX: () => 0,
      showCatwalkCue: noop, walkWrenAlongCatwalk: noop, pulseCatwalkCue: noop,
      releaseCatwalkCueWordAnchor: noop, attachCatwalkCueWordAnchor: noop,
      showPathCue: noop, pathWordPosition: point, pathWrenPosition: point,
      walkWrenToPathBeat: noop, pulsePathCue: noop,
      releasePathCueWordAnchor: noop, attachPathCueWordAnchor: noop,
    });
    s[entry.method](0);
    for (let i = 0; i < entry.words.length; i++) {
      const target = targets[i];
      assertEqual(target.word, entry.words[i], `${entry.method} preserves traversal word ${i + 1}`);
      assert(caption.length > 0 && objective.includes(target.word), "a fresh action has a caption and its own current task");
      const prompt = caption;
      target.onClaim();
      assertEqual(caption, prompt, "starting the word does not announce a completed action");
      target.onComplete();
      assert(caption.length > 0 && caption !== prompt, "completion replaces the instruction with a distinct result");
      assert(objective.includes("Enter or Space"), "the completed action's task identifies Continue instead of asking for its old word");
      assertEqual(targets.length, i + 1, "the next action cannot overwrite the readable result before Continue");
      assertEqual(gates.length, i + 1, "each completed action keeps exactly one existing Continue gate");
      if (i + 1 < entry.words.length) gates[i]();
    }
  }
});

await suite("Later realm passages: the task follows each phrase and held response", () => {
  const noop = () => {};
  for (const source of [forge, sky, wood]) {
    const Scene = actualMethod(source, "runPassageChain", {
      playWrenAction: noop, playWrenFocus: noop, playChime: noop,
      playBodyImpact: noop, playActorAttention: noop, PALETTE_HEX: { ember: 0, brass: 0, moss: 0 },
    });
    const s = new Scene();
    const targets: Array<{ word: string; onComplete: () => void }> = [];
    const gates: Array<() => void> = [];
    let objective = "Choose a branch.";
    let caption = "The chosen branch begins.";
    let completed = 0;
    const make = (opts: unknown) => opts;
    Object.assign(s, {
      band: { setObjective: (text: string) => { objective = text; } },
      setNarrator: (text: string) => { caption = text; },
      readThen: (next: () => void) => gates.push(next),
      scale: { width: 1920, height: 1080 },
      forgePassageWordPosition: () => ({ x: 0, y: 0 }), skyOwnedWordPosition: () => ({ x: 0, y: 0 }),
      makeWord: make, makeFornWord: make, makeEttaWord: make,
      clearActiveTargets: noop, registerActiveTarget: (target: { word: string; onComplete: () => void }) => targets.push(target),
    });
    const words = ["the first phrase", "the second phrase"];
    const responses = ["The first action happened.", "The second action happened."];
    const onDone = () => { completed += 1; };
    if (source === wood) s.runPassageChain(words.map((word, i) => ({ word, narrator: responses[i] })), onDone);
    else s.runPassageChain(words, responses, onDone);
    for (let i = 0; i < 2; i++) {
      assertEqual(targets[i].word, words[i], "the original phrase is still the accepted target");
      assert(objective.includes(`${i + 1}/2`) && !objective.includes("Choose"), "the task names current phrase progress instead of the resolved choice");
      targets[i].onComplete();
      assertEqual(caption, responses[i], "the held response still matches the completed phrase");
      assert(objective.includes("Enter or Space"), "a held response explains Continue instead of requesting more typing");
      assertEqual(completed, 0, "rewards and the next scene wait while the last response is read");
      gates[i]();
    }
    assertEqual(completed, 1, "Continue from the last response completes the passage once");
  }
});

await suite("Forge rewards: the collected keepsake is readable before the next challenge", () => {
  for (const [method, choice, item, followup] of [
    ["afterFork1", "forn", "bellows-hammer", "startAct3"],
    ["afterFork1", "cabal", "sabotage-wrench", "startAct3"],
    ["afterFork2", "peaceful", "master-key", "startCompanionGate"],
    ["afterFork2", "fought", "golem-heart", "startCompanionGate"],
  ] as const) {
    const Scene = actualMethod(forge, method);
    const s = new Scene();
    const save = { satchel: [] as string[], almanacLore: [] as string[], realms: {} as Record<string, { choices: Record<string, string> }> };
    let objective = "Choose a branch.";
    let caption = "";
    let next: (() => void) | undefined;
    let challenges = 0;
    Object.assign(s, {
      store: { update: (fn: (state: typeof save) => void) => fn(save) },
      band: { setObjective: (text: string) => { objective = text; } },
      setNarrator: (text: string) => { caption = text; },
      readThen: (fn: () => void) => { next = fn; },
      hideFornSprite() {}, dismissForgeChoiceCue() {}, clearForgeChoiceCues() {},
      [followup]: () => { challenges += 1; },
    });
    s[method](choice, item);
    assertEqual(save.satchel.filter(value => value === item).length, 1, "the original branch reward is granted once");
    assertEqual(save.realms["clockwork-forge"].choices[method === "afterFork1" ? "fork1" : "fork2"], choice, "the original durable choice is preserved");
    assert(caption.length > 0 && objective.includes("collected"), "the held result acknowledges a collected keepsake instead of the old choice");
    assertEqual(challenges, 0, "the next challenge cannot overwrite the keepsake card before Continue");
    next!();
    assertEqual(challenges, 1, "Continue enters the original next scene once");
  }
});

await suite("Accepted companions: joining Wren precedes the held response", () => {
  for (const entry of [
    { source: forge, method: "perchSongbirdOnWren", field: "songbirdCompanion", offsetX: 52, offsetY: -148, scale: 1, grounded: false },
    { source: sky, method: "settleLanternMothOnWren", field: "lanternMothCompanion", offsetX: 49, offsetY: -58, scale: 36 / 104, grounded: false },
    { source: wood, method: "settleWispCatByWren", field: "wispCatCompanion", offsetX: 136, offsetY: 0, scale: 1, grounded: true },
  ]) for (const [x, y, reduced] of [[960, 826, false], [1110, 720, false], [960, 826, true]] as const) {
    const Scene = actualMethod(entry.source, entry.method, { reducedMotion: () => reduced });
    const s = new Scene();
    const shadow = { visible: true, setVisible(value: boolean) { this.visible = value; } };
    const bird = {
      scene: {}, x: 1280, y: 470, alpha: 0.8, scale: 1.04,
      setScale(value: number) { this.scale = value; return this; },
      setPosition(nextX: number, nextY: number) { this.x = nextX; this.y = nextY; return this; },
      setAlpha(value: number) { this.alpha = value; return this; }, getAt: () => shadow,
    };
    let stopped = 0;
    let landed = 0;
    let flight: { x: number; y: number; alpha: number; scaleX?: number; scaleY?: number; onComplete: () => void } | undefined;
    Object.assign(s, {
      [entry.field]: bird, wrenContainer: { x, y },
      tweens: {
        killTweensOf: (target: unknown) => { assertEqual(target, bird, "the old entrance and hover are stopped on the companion"); stopped += 1; },
        add: (opts: typeof flight) => { flight = opts; },
      },
    });
    s[entry.method](() => {
      assertEqual(bird.x, x + entry.offsetX, "the response waits for the companion's new horizontal position");
      assertEqual(bird.y, y + entry.offsetY, "the response waits for Wren's current body position");
      assertEqual(bird.scale, entry.scale, "the held landing uses the intended perched size");
      landed += 1;
    });
    assertEqual(stopped, 1, "a lingering hover tween cannot restore the old position");
    assertEqual(shadow.visible, entry.grounded,
      "only the companion standing on the floor retains a ground shadow");
    if (reduced) {
      assert(!flight, "reduced motion places the companion without a travel tween");
    } else {
      assertEqual(landed, 0, "the completed landing caption cannot appear during the flight");
      assertEqual(flight!.x, x + entry.offsetX, "flight follows the current Wren position instead of a fixed world coordinate");
      bird.setPosition(flight!.x, flight!.y).setAlpha(flight!.alpha);
      assertEqual(flight!.scaleX, flight!.scaleY, "landing keeps the companion's proportions");
      if (flight!.scaleX !== undefined) bird.setScale(flight!.scaleX);
      flight!.onComplete();
    }
    assertEqual(landed, 1, "the landing presents the held response once");
  }
});

await suite("Sky fork passages: words stay on the clear side of their cue", () => {
  const noop = () => {};
  const Position = actualMethod(sky, "skyOwnedWordPosition", {
    Phaser: { Math: { Clamp: (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value)) } },
  });
  const Kind = actualMethod(sky, "startFork2KindEnding", { playChime: noop });
  const s = new Kind();
  let next: (() => void) | undefined;
  let target: { word: string; x: number; y: number } | undefined;
  Object.assign(s, {
    scale: { width: 1920, height: 1080 }, kindAnswerCue: { scene: {}, x: 700, y: 778 },
    skyOwnedWordPosition: Position.prototype.skyOwnedWordPosition,
    commitFork: (_fork: string, choice: string) => choice,
    fadeOutForkCue: noop, band: { setObjective: noop }, setNarrator: noop,
    readThen: (fn: () => void) => { next = fn; },
    makeSkyForkWord: (_owner: unknown, opts: typeof target) => { target = opts; return opts; },
    registerActiveTarget: noop,
  });
  s.startFork2KindEnding();
  assert(!target, "the kind response retains its readable introductory gate");
  next!();
  assertEqual(target!.word, "you kept the light", "the original accepted phrase is unchanged");
  assert(target!.x < s.kindAnswerCue.x, "the kind phrase is on the empty left side instead of over Wren's central hood");

  for (const [method, field, x, y, offset] of [
    ["startFork1StealFlame", "beaconFlameCue", 1320, 770, -76],
    ["startFork2CutTether", "tetherThreadCue", 1220, 778, -58],
  ] as const) {
    const Branch = actualMethod(sky, method);
    const b = new Branch();
    let gate: (() => void) | undefined;
    let owner: { body: { scene: object; x: number; y: number }; sourceOffsetY: number; side: string } | undefined;
    Object.assign(b, {
      [field]: { scene: {}, x, y },
      commitFork: (_fork: string, choice: string) => choice,
      hideEtta: noop, fadeOutForkCue: noop, band: { setObjective: noop }, setNarrator: noop,
      readThen: (fn: () => void) => { gate = fn; },
      runPassageChain: (_words: string[], _responses: string[], _done: () => void, value: typeof owner) => { owner = value; },
    });
    b[method]();
    gate!();
    assertEqual(owner!.side, "right", `${method} explicitly uses the outer side of its right-hand prop`);
    assertEqual(owner!.sourceOffsetY, offset, "the existing prop attachment remains unchanged");
    const pos = s.skyOwnedWordPosition(owner!.body, offset, "the shown passage", { side: owner!.side });
    assert(pos.x > owner!.body.x, "the opposite route also keeps the phrase away from Wren's central body");
  }
});

await suite("Sky crossing beams: hazards leave story scenes and return for moving gates", () => {
  const noop = () => {};
  const Scene = actualMethod(sky, "setTempleBeamsActive");
  const s = new Scene();
  const graphics: Array<{ visible: boolean; setVisible(value: boolean): void }> = [];
  let draws = 0;
  let caption = "";
  const delayed: Array<() => void> = [];
  Object.assign(s, {
    templeLanterns: graphics, templeBeamsActive: false, activePhrases: [],
    combat: { warmLight: 0.2, gracePool: 0, advanceMult: 1 },
    band: { setObjective: noop }, setNarrator: (text: string) => { caption = text; },
    readThen: noop, showEtta: noop, pulseSkyWave: noop, maybePlayWarmLightCue: noop,
    time: { delayedCall: (_ms: number, next: () => void) => delayed.push(next) },
    drawTempleLanterns: () => {
      draws += 1;
      for (let i = 0; i < 3; i++) graphics.push({ visible: true, setVisible(value) { this.visible = value; } });
    },
  });
  class Phrase {
    blur = 0;
    constructor(opts: { scene: typeof s }) {
      assert(opts.scene.templeBeamsActive, "the crossing hazard is visible before its moving phrase begins");
    }
    getX() { return 960; }
    setBlur(value: number) { this.blur = value; }
  }
  const Gate = actualMethod(sky, "startTemple", {
    TEMPLE_PHRASE_CONFIGS: Array.from({ length: 5 }, () => ({ count: 1, durationMs: 18000, staggerMs: 0 })),
    SEALED_SCROLL_TEMPLE_IDX: 2, playWaveSting: noop, reducedMotion: () => true,
    shuffleArr: (values: string[]) => values, SKY_ISLAND_PHRASE_BANK: ["a moving phrase"],
    PHRASE_BANNER_Y_SLOTS: [320], ScrollingPhrase: Phrase,
  });
  s.startTemple = Gate.prototype.startTemple;
  s.startSealedScrollTemple = actualMethod(sky, "startSealedScrollTemple").prototype.startSealedScrollTemple;
  s.startEttaEncounter = actualMethod(sky, "startEttaEncounter").prototype.startEttaEncounter;
  s.onTempleCleared = actualMethod(sky, "onTempleCleared").prototype.onTempleCleared;
  s.update = actualMethod(sky, "update", {
    blurAmountAt: () => 0.75, LANTERN_BLUR_XS: [480, 960, 1440], LANTERN_BLUR_RADIUS: 130,
  }).prototype.update;

  s.startTemple(0);
  assertEqual(draws, 1, "the first moving gate creates the original three beam graphics once");
  assert(graphics.every(value => value.visible), "moving-gate lanterns are visible");
  const phrase = s.activePhrases[0] as Phrase;
  s.update();
  assertEqual(phrase.blur, 0.75 * 0.8, "moving gates retain the original blur and keepsake multiplier");
  s.templeIndex = 2;
  s.onTempleCleared();
  assert(graphics.every(value => !value.visible), "gate completion hides the columns and orbs before the next story scene");
  assertEqual(phrase.blur, 0, "the completed banner cannot retain its obscured state through the transition");
  assertEqual(s.activePhrases.length, 0, "resolved phrases leave the per-frame combat list");
  delayed.shift()!();
  assert(caption.includes("stands holding"), "Etta's arrival agrees with the accepted standing art");
  assert(!s.templeBeamsActive && graphics.every(value => !value.visible), "Etta's held conversation has no crossing hazards");

  s.startTemple(3);
  assert(graphics.every(value => value.visible), "the next moving-scroll gate restores its hazard");
  assertEqual(draws, 1, "resuming the gate reuses the existing beams instead of duplicating them");
  s.startSealedScrollTemple();
  assert(graphics.every(value => !value.visible), "the stationary precision scroll has no irrelevant crossing beams");
  const inactivePhrase = new Phrase({ scene: { templeBeamsActive: true } });
  s.activePhrases = [inactivePhrase];
  s.update();
  assertEqual(inactivePhrase.blur, 0, "an inactive crossing hazard cannot mask a phrase in a story or sealed-scroll scene");
});

await suite("Mechanic teaching: Wood and Sky explain hidden marks before timed encounters start", () => {
  const Wood = actualMethod(wood, "startCrossroads1", { WARD_INPUT_HINT: constant(wood, "WARD_INPUT_HINT") });
  const w = new Wood();
  let continueWood: (() => void) | undefined;
  let finishLoadout: (() => void) | undefined;
  let ghosts = 0;
  let lesson = "";
  Object.assign(w, {
    narration: { say: (id: string) => { lesson = getRunaLine(id)!.text; } },
    band: { setObjective() {} },
    readThen: (next: () => void) => { continueWood = next; },
    announceCombatLoadout: (next: () => void) => { finishLoadout = next; },
    beginCrossroads1: () => { ghosts += 1; },
  });
  w.startCrossroads1();
  assert(lesson.includes("·") && lesson.includes("punctuation"), "the first lesson identifies what the displayed dot hides");
  assertEqual(ghosts, 0, "ghost deadlines cannot begin while the ward lesson is being read");
  assert(!finishLoadout, "a relic notice cannot overwrite the lesson before Continue");
  continueWood!();
  assertEqual(ghosts, 0, "existing relic announcement still precedes the encounter");
  finishLoadout!();
  assertEqual(ghosts, 1, "Continue and the announcement lead to the unchanged encounter once");

  const Sky = actualMethod(sky, "startAct2");
  const s = new Sky();
  let continueSky: (() => void) | undefined;
  let gates = 0;
  let beamLesson = "";
  Object.assign(s, {
    setNarrator: (text: string) => { beamLesson = text; }, band: { setObjective() {} },
    readThen: (next: () => void) => { continueSky = next; },
    startTemple: (index: number) => { assertEqual(index, 0, "the lesson enters the original first gate"); gates += 1; },
  });
  s.startAct2();
  assert(beamLesson.includes("dots (·)") && beamLesson.includes("original letters and spaces"), "Sky distinguishes hidden letters from literal dot input");
  assertEqual(gates, 0, "the first moving scroll cannot leave while the new rule is being read");
  continueSky!();
  assertEqual(gates, 1, "Continue starts the first gate once");
});

await suite("Mechanic teaching: Wood's readable direction lesson agrees with actual ward keys", () => {
  const lesson = getRunaLine("wood_crossroads1_intro")!.text;
  const directions: Array<[WoodDirection, string, string]> = [
    ["north", "above, a period", "."], ["south", "below, an exclamation", "!"],
    ["west", "left, a comma", ","], ["east", "right, a question mark", "?"],
  ];
  for (const [direction, words, key] of directions) {
    assert(lesson.includes(words), `${direction} is taught before combat`);
    assertEqual(WOOD_DIRECTION_PUNCTUATION[direction], key, `${direction} teaches the accepted punctuation key`);
    assertEqual(woodWardWord("howl", direction), `ho${key}wl`, "the hidden middle mark matches the lesson");
  }
});

await suite("Sky final answer: fading follows Backspace and difficulty resets, then yields to defeat", () => {
  const answer = constant(sky, "BOSS_PHASE3_ANSWER");
  const Sky = actualMethod(sky, "startBossPhase3", {
    BOSS_PHASE3_ANSWER: answer, RIDDLE_3_DISPLAY: constant(sky, "RIDDLE_3_DISPLAY"),
    playWaveSting() {}, playChime() {}, reducedMotion: () => true,
  });
  const s = new Sky();
  const body = { alpha: 1 };
  let continueReading: (() => void) | undefined;
  let cursor = 0;
  let completion: (() => void) | undefined;
  let registered = 0;
  let defeated = 0;
  const tweens: Array<{ stopped: boolean }> = [];
  const target = {
    remaining: () => answer.slice(cursor), advance: () => { cursor += 1; },
    reverse: () => { if (!cursor) return false; cursor -= 1; return true; },
    resetCursor: () => { cursor = 0; },
    onRelease: () => { if (cursor < answer.length) cursor = 0; },
  };
  Object.assign(s, {
    bossContainer: body, pulseSkyWave() {}, playScholarStagePulse() {}, setNarrator() {},
    band: { setObjective() {} }, readThen: (next: () => void) => { continueReading = next; },
    scholarBossWordPosition: () => ({ x: 0, y: 0 }),
    makeScholarBossWord: (opts: { word: string; onComplete: () => void }) => {
      assertEqual(opts.word, answer, "the accepted final answer is unchanged"); completion = opts.onComplete; return target;
    },
    registerActiveTarget: () => { registered += 1; }, clearActiveTargets() {},
    onBossDefeated: () => { defeated += 1; },
    tweens: { add: (opts: { targets: { alpha: number }; alpha: number }) => {
      opts.targets.alpha = opts.alpha;
      const tween = { stopped: false, stop() { this.stopped = true; } };
      tweens.push(tween); return tween;
    } },
  });
  s.startBossPhase3();
  assertEqual(registered, 0, "the question retains its readable Continue gate");
  continueReading!();
  assertEqual(registered, 1, "the answer registers once after Continue");
  const quarter = Math.ceil(answer.length / 4);
  for (let i = 0; i < quarter; i++) target.advance();
  assertEqual(body.alpha, 0.78, "first quarter fades the spirit");
  target.reverse();
  assertEqual(body.alpha, 1, "Backspace below the milestone restores the corresponding visibility");
  while (cursor < Math.ceil(answer.length * 0.75)) target.advance();
  assert(body.alpha < 0.4, "three quarters visibly fade the spirit");
  target.resetCursor();
  assertEqual(cursor, 0, "the original reset still clears the answer");
  assertEqual(body.alpha, 1, "a restarted answer restores the full spirit");
  assert(tweens.slice(0, -1).every(value => value.stopped), "old alpha tweens cannot overwrite a reset's restored visibility");
  while (cursor < Math.ceil(answer.length * 0.5)) target.advance();
  target.onRelease();
  assertEqual(cursor, 0, "Escape release retains the original cursor cancellation");
  assertEqual(body.alpha, 1, "Escape release restores the spirit alongside its cancelled answer");
  while (cursor < answer.length) target.advance();
  completion!();
  assertEqual(defeated, 1, "answer completion reaches the original defeat flow");
  assert(tweens.at(-1)!.stopped, "the progress fade yields to the separate defeat animation");
});
