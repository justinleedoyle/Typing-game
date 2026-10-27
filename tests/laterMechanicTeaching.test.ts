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
const winter = sceneSource("WinterMountainScene");

await suite("Wood force choice: the fire remains visible through the held response and king's challenge", () => {
  const firePng = readFileSync(new URL("../art/effects/grove-fire.png", import.meta.url));
  const [fireWidth, fireHeight] = [firePng.readUInt32BE(16), firePng.readUInt32BE(20)];
  const RestingPosition = actualMethod(wood, "spawnPositionFor", {
    WOOD_SIDE_GHOST_REST_Y: 704, WOOD_SIDE_GHOST_STEP_Y: 46,
  });
  const positions = new RestingPosition();
  positions.scale = { width: 1920, height: 1080 };
  const westRest = positions.spawnPositionFor("west", 0);
  for (const reduced of [false, true]) {
    const lights: Array<{ x: number; y: number }> = [];
    const wakes: Array<{ body: unknown; depth: number }> = [];
    const events: string[] = [];
    const Entry = actualMethod(wood, "startFork2Force");
    const Ignite = actualMethod(wood, "igniteGroveLightCue", {
      addLivingLight: (_scene: unknown, opts: typeof lights[number]) => { lights.push(opts); return warmth; },
      addContainerWake: (_scene: unknown, body: unknown, opts: { depth: number }) => wakes.push({ body, depth: opts.depth }),
      addLocalGroundShadow: () => ({ shadow: true }),
      reducedMotion: () => reduced,
      Phaser: { GameObjects: { Events: { DESTROY: "destroy" } } },
    });
    const s = new Entry();
    let next: (() => void) | undefined;
    let destroyCue: (() => void) | undefined;
    let ignited = false;
    let drawn = 0;
    let oldGeometryRemoved = 0;
    let paintedFire = 0;
    let boss = 0;
    const warmth = { scene: true, destroy() { events.push("release-warmth"); } };
    const cue = {
      scene: true, x: 1210, y: 770, alpha: 0, depth: 42,
      getData: () => ignited, setData(_key: string, value: boolean) { ignited = value; },
      setAlpha(value: number) { this.alpha = value; return this; }, setScale() { return this; },
      setDepth(value: number) { this.depth = value; return this; },
      removeAll(destroy: boolean) { assert(destroy, "unlit schematic is removed instead of layered over the painted fire"); oldGeometryRemoved += 1; },
      add() { drawn += 1; }, once(_event: string, callback: () => void) { destroyCue = callback; },
    };
    const state = { satchel: [] as string[] };
    Object.assign(s, {
      groveLightCue: cue,
      scale: { width: 1920, height: 1080 },
      commitFork: (_fork: string, choice: string) => choice,
      store: { update: (edit: (value: typeof state) => void) => edit(state) },
      attendGhostKing() {},
      showGatheredAshVial() {}, clearHeldWoodRelic() {},
      igniteGroveLightCue: Ignite.prototype.igniteGroveLightCue,
      tweens: { killTweensOf() {} },
      add: { image: (x: number, y: number, texture: string) => {
        paintedFire += 1;
        assertEqual([x, y, texture], [0, 4, "wood-grove-fire"], "painted fire uses the existing grounded cue owner");
        return { height: fireHeight, setOrigin(x: number, y: number) {
          assertEqual([x, y], [0.5, 1], "coal bed stays anchored at its feet"); return this;
        }, setScale(scale: number) { assertEqual(scale * this.height, 196, "fire remains smaller than Wren"); return this; } };
      } },
      setNarrator() { assert(ignited && cue.alpha === 1, "visible fire is staged before the held flare caption"); },
      band: { setObjective() {} },
      readThen(callback: () => void) { next = callback; },
      startBossFight() { assertEqual(s.groveLightCue, cue, "the chosen fire survives into the king's challenge"); boss += 1; },
    });
    s.startFork2Force();
    assertEqual(state.satchel, ["ash-vial"], "the existing force reward and timing are unchanged");
    assertEqual(boss, 0, "the readable consequence remains held before combat");
    s.igniteGroveLightCue();
    assertEqual(drawn, 2, "one painted fire and its contact shadow replace the schematic once");
    assertEqual([oldGeometryRemoved, paintedFire], [1, 1], "a restarted committed choice cannot duplicate or erase the flame");
    assertEqual(lights.length, 1, "one sustained warm light replaces the missing consequence");
    assertEqual([lights[0]!.x, lights[0]!.y], [cue.x, cue.y - 64], "the warm light follows the relocated fire");
    const halfWidth = 196 * fireWidth / fireHeight / 2;
    assert(cue.x - halfWidth >= 0 && cue.x + halfWidth < westRest.restX - 100,
      "the complete painted fire fits left of the first actual west spirit with room for its label");
    assertEqual(cue.y, 770, "relocating the fire preserves its existing floor");
    assert(cue.depth < 0, "the fire draws behind default-depth spirit bodies");
    assertEqual(wakes.length, reduced ? 0 : 1, "reduced motion keeps the visible flame without drifting embers");
    assert(wakes.every(wake => wake.depth < 0), "fire embers also stay behind the spirits");
    next!();
    assertEqual(boss, 1, "the original Continue still enters the boss once");
    destroyCue!();
    assertEqual(events, ["release-warmth"], "the warm light cannot survive its fire cue's final cleanup");
  }
});

await suite("Sky stolen spark: the flame leaves its stand before the held in-hand response", () => {
  const noop = () => {};
  const Entry = actualMethod(sky, "startFork1StealFlame");
  const Chain = actualMethod(sky, "runPassageChain", {
    playWrenAction: noop, playWrenFocus: noop, playActorAttention: noop,
    playBodyImpact: noop, PALETTE_HEX: { brass: 0 },
  });
  const Take = actualMethod(sky, "takeBeaconSparkVisual");
  const s = new Entry();
  const events: string[] = [];
  let sparkPresent = true;
  const spark = { destroy() { sparkPresent = false; events.push("take-spark"); } };
  const cue = {
    scene: true, active: true,
    getByName(name: string) { assertEqual(name, "beacon-spark", "only the removable flame is addressed"); return spark; },
    setActive(value: boolean) { this.active = value; return this; },
  };
  let next: (() => void) | undefined;
  let target: { word: string; onComplete(): void } | undefined;
  let nextAct = 0;
  const words: string[] = [];
  Object.assign(s, {
    beaconFlameCue: cue,
    commitFork: (_fork: string, choice: string) => choice,
    hideEtta: noop, band: { setObjective: noop },
    readThen(callback: () => void) { assert(!next, "unread story responses are never overwritten"); next = callback; },
    setNarrator(text: string) {
      if (text.includes("in your palm")) {
        assert(!sparkPresent, "the old stand cannot still display the claimed spark");
        assertEqual(events.slice(-2), ["release-word", "take-spark"], "the completed word releases before removal and the held response");
        assert(!cue.active, "the claimed flame no longer emits a stand wake");
      }
    },
    runPassageChain: Chain.prototype.runPassageChain,
    takeBeaconSparkVisual: Take.prototype.takeBeaconSparkVisual,
    dimBeaconFlameVisual: noop, showHeldBeaconSpark: noop, clearHeldBeaconSpark: noop,
    skyOwnedWordPosition: () => ({ x: 1500, y: 650 }),
    makeSkyForkWord(body: unknown, opts: typeof target) {
      assertEqual(body, cue, "even the final phrase retains its stable stand anchor"); return opts;
    },
    registerActiveTarget(value: typeof target) { target = value; words.push(value!.word); },
    clearActiveTargets() { events.push("release-word"); },
    fadeOutForkCue(body: unknown) { assertEqual(body, cue, "the original end-of-chain stand cleanup is preserved"); events.push("depart-stand"); },
    startAct3() { nextAct += 1; },
  });
  const advance = () => { const callback = next; next = undefined; assert(callback, "the response waits for Continue"); callback!(); };
  s.startFork1StealFlame();
  assert(sparkPresent && !target, "the spark waits on its stand throughout the introduction");
  advance();
  for (const [i, expected] of ["reach for the flame", "the beacon dims slightly", "the spark is yours", "the island notices"].entries()) {
    assertEqual(target!.word, expected, "every exact authored phrase remains unchanged");
    assertEqual(sparkPresent, i < 3, "only completing the third phrase takes the spark");
    target!.onComplete();
    if (i < 2) assert(sparkPresent, "earlier responses still keep the waiting flame visible");
    assertEqual(nextAct, 0, "the next act waits for the existing final Continue");
    advance();
  }
  assertEqual(words.length, 4, "no additional typing requirement is introduced");
  assertEqual(events.filter(value => value === "take-spark").length, 1, "the flame is taken exactly once");
  assertEqual(nextAct, 1, "final Continue reaches the original boss entry");
  assertEqual(s.beaconFlameCue, null, "the stand is released by the original end-of-chain cleanup");
});

await suite("Forge apprentice: distinct actor and portrait share one asset and leave with the first fork", () => {
  const staged: unknown[] = [];
  const departed: unknown[] = [];
  const Scene = actualMethod(forge, "showApprenticeSprite", {
    FOUNDRY_GROUND_Y: 866, APPRENTICE_SPRITE_HEIGHT: 310,
    stageAnchoredSprite: (_scene: unknown, body: unknown) => staged.push(body),
  });
  const Hide = actualMethod(forge, "hideApprenticeSprite", {
    fadeOutStagedSprite: (_scene: unknown, body: unknown) => departed.push(body),
  });
  const Portrait = actualMethod(forge, "ensureApprenticePortrait");
  const Speaker = actualMethod(forge, "setBandSpeaker");
  const s = new Scene();
  let created = 0;
  const actor = {
    scene: true, x: 0, y: 0, height: 1536, scale: 0, flip: false,
    setOrigin() {}, setScale(value: number) { this.scale = value; },
    setFlipX(value: boolean) { this.flip = value; }, setDepth() {},
  };
  const source = {};
  const draws: unknown[][] = [];
  const portraits: string[] = [];
  let refreshed = 0;
  let portraitExists = false;
  Object.assign(s, {
    add: { image(x: number, y: number, key: string) {
      assertEqual(key, "forge-apprentice", "the actor uses the distinct apprentice asset");
      created += 1; actor.x = x; actor.y = y; return actor;
    } },
    hideApprenticeSprite: Hide.prototype.hideApprenticeSprite,
    ensureApprenticePortrait: Portrait.prototype.ensureApprenticePortrait,
    textures: {
      exists: () => portraitExists,
      get(key: string) { assertEqual(key, "forge-apprentice", "the portrait reuses the same identity"); return { getSourceImage: () => source }; },
      createCanvas(key: string, width: number, height: number) {
        assertEqual([key, width, height], ["forge-apprentice-portrait", 240, 288], "the HUD gets a portrait-shaped frame");
        portraitExists = true;
        return { context: { drawImage: (...args: unknown[]) => draws.push(args) }, refresh() { refreshed += 1; } };
      },
    },
    band: { setPortrait: (key: string) => portraits.push(key) },
  });
  s.showApprenticeSprite(); s.showApprenticeSprite();
  assertEqual(created, 1, "re-entering the committed branch cannot duplicate the actor");
  assertEqual(staged, [actor], "the normal actor staging helper owns motion and preferences");
  assertEqual([actor.x, actor.y, actor.scale * actor.height, actor.flip], [1600, 866, 310, true],
    "the worker faces Wren from the empty right lane and shares the actual foundry boot line");
  Speaker.prototype.setBandSpeaker.call(s, "Apprentice");
  Speaker.prototype.setBandSpeaker.call(s, "Apprentice");
  assertEqual(portraits, ["forge-apprentice-portrait", "forge-apprentice-portrait"], "speech never falls back to a monogram");
  assertEqual(draws, [[source, 260, 0, 400, 480, 0, 0, 240, 288]], "the one-time runtime crop includes the painted head and shoulders");
  assertEqual(refreshed, 1, "the shared texture is refreshed once");
  s.hideApprenticeSprite(); s.hideApprenticeSprite();
  assertEqual(departed, [actor], "leaving the branch stages one departure and releases ownership");
  assertEqual(s.apprenticeSprite, undefined, "a later scene cannot retain a stale speaker");
});

await suite("Forge true-name passage: every authored phrase clears Wren's hood", () => {
  const noop = () => {};
  const Scene = actualMethod(forge, "runPassageChain", {
    PALETTE_HEX: { ember: 0 },
  });
  for (const height of [1080, 1000]) {
    const s = new Scene();
    const words = ["the forge breathes.", "the brass remembers.", "its makers are remembered."];
    const targets: Array<{ word: string; y: number; fontSize: number; onComplete(): void }> = [];
    Object.assign(s, {
      wrenContainer: { y: 866 }, band: { setObjective: noop },
      makeWord: (opts: unknown) => opts,
      registerActiveTarget: (target: typeof targets[number]) => targets.push(target),
    });
    // Exercise each authored target through the actual placement branch. An
    // inert seal avoids effects/anchors while keeping the real target logic.
    for (const word of words) {
      s.runPassageChain([word], [""], noop, "none", { x: 960, y: height - 318, scene: false });
      const target = targets.at(-1)!;
      assertEqual(target.word, word, "the exact authored name text is unchanged");
      assert(target.y + target.fontSize <= s.wrenContainer.y - 240 - 24,
        "the full target height leaves a visible gap above the hood rather than crossing the face");
      assert(target.y > 400, "lifting the target still leaves the upper story card clear");
    }
  }
});

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
      WOOD_BRANCH_WORD_Y: 500,
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
      hideFornSprite() {}, hideApprenticeSprite() {}, dismissForgeChoiceCue() {}, dismissBellowsWorkstation() {}, clearForgeChoiceCues() {}, clearPeacefulGuards() {}, showForgeKeepsake() {},
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
    { source: winter, method: "settleFoxByWren", field: "foxCompanion", offsetX: -124, offsetY: 0, scale: 1, grounded: true },
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

await suite("Snow-fox answer: landing precedes acceptance reading and refusal stays unchanged", () => {
  for (const accepted of [true, false]) {
    const Scene = actualMethod(winter, "showCompanionAnswer");
    const s = new Scene();
    const save = { realms: { "winter-mountain": { choices: {} as Record<string, string> } }, satchel: [] as string[] };
    let checkpoint: { accepted: boolean } | undefined;
    let landed: (() => void) | undefined;
    let reading: (() => void) | undefined;
    let caption = "";
    let cue = "";
    let shown = 0;
    let dismissed = 0;
    let naming = 0;
    Object.assign(s, {
      store: { update: (fn: (state: typeof save) => void) => fn(save) },
      checkpoint: (_step: string, data: typeof checkpoint) => { checkpoint = data; },
      narration: { say: (key: string) => { cue = key; } },
      band: { setObjective() {} }, setNarrator: (text: string) => { caption = text; },
      showFoxCompanion: () => { shown += 1; },
      settleFoxByWren: (next: () => void) => { landed = next; },
      dismissFoxCompanion: (x: number, y: number) => { assertEqual(x, 620, "refusal keeps its original departure x"); assertEqual(y, 820, "refusal keeps its original departure y"); dismissed += 1; },
      readThen: (next: () => void) => { reading = next; },
      startTrueNamePassage: () => { naming += 1; },
    });
    s.showCompanionAnswer(accepted);
    assertEqual(save.realms["winter-mountain"].choices.companion, accepted ? "accepted" : "declined", "the actual answer persists the original decision");
    assertEqual(save.satchel.includes("snow-fox-cub"), accepted, "only acceptance grants the cub");
    assertEqual(checkpoint!.accepted, accepted, "reload preserves the chosen answer");
    if (accepted) {
      assertEqual(shown, 1, "acceptance restores the real companion before moving it");
      assert(!reading, "Continue cannot skip the companion's approach");
      assert(caption.includes("comes closer"), "the approach caption does not claim the fox has landed");
      landed!();
      assert(caption.includes("beside your boots"), "the held response agrees with the seated art and floor position");
      assertEqual(dismissed, 0, "acceptance never dismisses the fox");
    } else {
      assertEqual(cue, "winter_fox_companion_no", "refusal retains its existing narrated response");
      assertEqual(dismissed, 1, "refusal still sends the fox away");
      assert(!landed && shown === 0, "refusal never stages an accepted companion");
    }
    assertEqual(naming, 0, "the name passage waits for Continue");
    reading!();
    assertEqual(naming, 1, "Continue enters the original name passage once");
  }
});

await suite("Wounded fox answer: an ignored fox is gone before the held departure caption", () => {
  for (const spared of [true, false]) {
    const Scene = actualMethod(winter, "showFoxAnswer", { WINTER_WREN_STAGE_Y: 842 });
    const s = new Scene();
    const fox = { visible: true, setVisible(value: boolean) { this.visible = value; return this; } };
    let reading: (() => void) | undefined;
    let shown = 0;
    let dismissed = 0;
    let waves = 0;
    Object.assign(s, {
      foxSpared: spared, foxDecided: false, foxCompanion: fox,
      checkpoint() {}, band: { setObjective() {} },
      showFoxCompanion: () => { shown += 1; },
      narration: { say: (key: string) => {
        assertEqual(key, spared ? "winter_fox_spared_ear" : "winter_fox_dismissed", "the original answer cue is preserved");
        assertEqual(fox.visible, spared, "the fox visibility already agrees when the held caption appears");
      } },
      readThen: (next: () => void) => { reading = next; },
      dismissFoxCompanion: (x: number, y: number) => {
        assert(!fox.visible, "Continue hides the fox before starting its original departure");
        assertEqual(x, spared ? 1640 : 460, "the original departure direction is preserved");
        assertEqual(y, 842, "the original departure floor is preserved");
        dismissed += 1;
      },
      startWave: (index: number) => { assertEqual(index, 1, "Continue preserves the next wave"); waves += 1; },
    });
    s.showFoxAnswer(1);
    assertEqual(shown, spared ? 1 : 0, "only the spared fox is restored for its response");
    assert(s.foxDecided && reading, "the answer remains decided and waits for Continue");
    assertEqual(waves, 0, "the next wave cannot overwrite the held answer");
    reading!();
    assertEqual(dismissed, 1, "the original departure still runs once");
    assertEqual(waves, 1, "the original next wave still starts once");
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
  let practices = 0;
  let lesson = "";
  Object.assign(w, {
    narration: { say: (id: string) => { lesson = getRunaLine(id)!.text; } },
    band: { setObjective() {} },
    readThen: (next: () => void) => { continueWood = next; },
    announceCombatLoadout: (next: () => void) => { finishLoadout = next; },
    beginCrossroads1: () => { ghosts += 1; },
    startWardPractice: () => { practices += 1; },
  });
  w.startCrossroads1();
  assert(lesson.includes("·") && lesson.includes("punctuation"), "the first lesson identifies what the displayed dot hides");
  assertEqual(ghosts, 0, "ghost deadlines cannot begin while the ward lesson is being read");
  assert(!finishLoadout, "a relic notice cannot overwrite the lesson before Continue");
  continueWood!();
  assertEqual(practices, 1, "Continue enters the safe four-direction rehearsal");
  assertEqual(ghosts, 0, "combined threats cannot start before the four guided examples");
  assert(!finishLoadout, "the existing relic announcement waits until rehearsal is complete");

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
