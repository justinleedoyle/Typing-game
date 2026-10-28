import { readFileSync } from "node:fs";
import ts from "typescript";
import { candleAfterHit, CANDLE_RESET_FLOOR } from "../src/game/winterMechanics";
import { assert, assertEqual, suite } from "./_assert";

const file = new URL("../src/scenes/WinterMountainScene.ts", import.meta.url);
const source = ts.createSourceFile(file.pathname, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const sceneClass = source.statements.find(ts.isClassDeclaration)!;
const waves = source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => declaration.name.getText(source) === "WAVES")
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n");
const methods = ["startWave", "snuffCandle", "resetWave"];
const compiled = ts.transpileModule(`${waves}
class Winter {
  ${methods.map(name => sceneClass.members.find(member => member.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(index: number, reduced = false) {
  let now = 0;
  let gate: (() => void) | undefined;
  let gateCount = 0;
  let cleared = 0;
  let spawned = 0;
  let flashes = 0;
  const tasks: string[] = [], captions: string[] = [], spoken: string[] = [], checkpoints: any[] = [], scheduled: any[] = [];
  const wolves = Array.from({ length: index === 0 ? 1 : index === 1 ? 2 : 4 }, () => ({ dismissed: 0, dismiss() { this.dismissed++; } }));
  const Winter = new Function("candleAfterHit", "CANDLE_RESET_FLOOR", "reducedFlashes", compiled + "; return Winter;")(
    candleAfterHit, CANDLE_RESET_FLOOR, () => reduced,
  );
  const scene = new Winter();
  Object.assign(scene, {
    waveIndex: index, waveActive: true, candles: 3, wolves, activeTargets: [{}],
    boss: index === 2 ? {} : null, bossBodySprite: index === 2 ? {} : null,
    narration: { say(key: string) { spoken.push(key); } },
    setNarrator(text: string) { captions.push(text); },
    band: { setObjective(text: string) { tasks.push(text); } },
    clearActiveTargets() { cleared++; this.activeTargets = []; },
    checkpoint(step: string, data: any) { checkpoints.push({ step, data, candles: this.candles }); },
    redrawCandles() {}, flashHurt() {},
    cameras: { main: { flash() { flashes++; } } },
    time: { delayedCall(delay: number, callback: () => void) { scheduled.push({ at: now + delay, callback }); } },
    readThen(callback: () => void) {
      assert(!gate, "one held card cannot overwrite an unread retry");
      gate = callback; gateCount++;
    },
    spawnWave(idx: number) {
      assertEqual(idx, index, "Continue resumes the same encounter, not the next phase");
      this.waveActive = true; spawned++;
    },
  });
  return { scene, wolves, tasks, captions, spoken, checkpoints, scheduled, spawned: () => spawned,
    gates: () => gateCount, gate: () => gate, cleared: () => cleared, flashes: () => flashes,
    next() { assert(gate, "the existing Continue is available"); const callback = gate!; gate = undefined; callback(); },
    tick(ms: number) {
      now += ms;
      while (scheduled.some(event => event.at <= now)) {
        const index = scheduled.findIndex(event => event.at <= now);
        scheduled.splice(index, 1)[0].callback();
      }
    },
  };
}

await suite("Winter retry clarity: first-entry wave cards retain their existing teaching and single Continue", () => {
  const expectedCaptions = [
    "One wolf waits ahead. Type its word before it reaches Wren. Candles are your health; Heart shows accuracy. Clean typing fills Soul. When thunder is ready, hold Shift on the first letter to push the pack back. An empty Soul meter still lets you type normally.",
    "two more — together, this time. they come as a pair.",
    "the pack closes. something larger watches from behind them.",
  ];
  const expectedTasks = [
    "Act II · Type the wolf word. Candles keep Wren safe; Soul buys thunder.",
    "Act II · Two wolves. Type the nearer threat first; Esc releases your word.",
    "Act III · Clear the pack, then name the leader. Keep a candle lit.",
  ];
  for (const index of [0, 1, 2]) {
    const f = fixture(index);
    f.scene.startWave(index);
    assertEqual([f.captions, f.tasks], [[expectedCaptions[index]], [expectedTasks[index]]], "new retry wording never changes the first-entry card");
    assertEqual([f.gates(), f.spawned(), f.scene.waveActive], [1, 0, false], "the original held card waits before any live encounter starts");
    assertEqual(f.scene.candles, 3, "ordinary entry does not change resources");
    f.next();
    assertEqual([f.gates(), f.spawned()], [1, 1], "one native Continue still starts the encounter exactly once");
  }
});

await suite("Winter retry clarity: actual all-candles-out reset explains loss at its existing gate and keeps resources and timing", () => {
  for (const reduced of [false, true]) for (const index of [0, 1, 2]) {
    const f = fixture(index, reduced);
    for (let hit = 0; hit < 3; hit++) f.scene.snuffCandle(true);
    assertEqual([f.scene.candles, f.scene.waveActive], [0, false], "the original candle loss ends the live encounter");
    assert(f.wolves.every(wolf => wolf.dismissed === 1), "all actual encounter actors are dismissed once before the retry card");
    assertEqual(f.spoken, ["winter_wave_reset"], "the existing immediate loss cue is retained");
    assertEqual([f.scheduled.length, f.scheduled[0].at], [1, 1600], "the reset retains its original1600ms interval");
    f.scene.resetWave();
    assertEqual(f.scheduled.length, 1, "another stale hit cannot schedule a second retry");
    f.tick(1599);
    assertEqual([f.gates(), f.spawned(), f.scene.candles], [0, 0, 0], "no extra gate, actor or early refill appears during the original delay");
    f.tick(1);
    const caption = f.captions.at(-1)!;
    assert(caption.includes("candles went out") && caption.includes("same encounter") && caption.includes("one candle"), "the held card identifies loss, restart and the true remaining resource");
    assert(f.tasks.at(-1)!.startsWith("Retry") && /Enter or Space.*again/.test(f.tasks.at(-1)!), "the existing Continue clearly asks the player to try again");
    assertEqual([f.scene.candles, f.gates(), f.spawned(), f.scene.waveActive], [1, 1, 0, false], "one candle and the one existing held card precede all new actors");
    assertEqual([f.scene.wolves, f.scene.boss, f.scene.bossBodySprite, f.scene.activeTargets], [[], null, null, []], "no previous actor or target survives into the retry card");
    assertEqual(f.checkpoints, [{ step: "wave", data: { index }, candles: 1 }], "the existing stable checkpoint schema and encounter index are unchanged");
    assertEqual(f.flashes(), reduced ? 0 : 1, "the original flash preference remains respected");
    f.next();
    assertEqual([f.spawned(), f.gates()], [1, 1], "the same one Continue starts the same wave with no added acknowledgment");
  }
});

await suite("Winter retry clarity: a later ordinary entry cannot inherit transient retry wording", () => {
  const f = fixture(2);
  f.scene.startWave(2, { retry: true });
  f.next();
  f.scene.startWave(2);
  assertEqual(f.captions.at(-1), "the pack closes. something larger watches from behind them.", "per-call retry presentation cannot leak into a later normal visit");
  assert(f.tasks.at(-1)!.startsWith("Act III"), "ordinary phase instructions return without clearing any scene-level retry flag");
  assertEqual([f.gates(), f.spawned()], [2, 1], "the subsequent normal entry retains its own original single gate");
});
