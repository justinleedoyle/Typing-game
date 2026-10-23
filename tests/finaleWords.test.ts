import { readFileSync } from "node:fs";
import ts from "typescript";
import { FINALE_SHORT_WORDS, shortenFinaleWords } from "../src/game/finaleWords";
import { WINTER_WORD_BANK, SUNKEN_BELL_WORD_BANK, FORGE_WORD_BANK,
  SKY_ISLAND_WORD_BANK, HAUNTED_WOOD_WORD_BANK } from "../src/game/wordBank";
import { assert, assertEqual, suite } from "./_assert";

const banks = [
  ["winter-mountain", WINTER_WORD_BANK], ["sunken-bell", SUNKEN_BELL_WORD_BANK],
  ["clockwork-forge", FORGE_WORD_BANK], ["sky-island", SKY_ISLAND_WORD_BANK],
  ["haunted-wood", HAUNTED_WOOD_WORD_BANK],
] as const;

await suite("finale sabotage: simplified words remain complete and realm-appropriate", () => {
  assertEqual(shortenFinaleWords(["snow", "ice", "icy"], "winter-mountain"), ["sun", "ice", "icy"],
    "snow becomes a real word; shortest words safely keep their full spelling");
  assertEqual(shortenFinaleWords(["forge", "rivet", "iron"], "clockwork-forge"), ["fire", "wire", "ore"],
    "mechanical echoes retain complete forge vocabulary rather than clipped fragments");
  assertEqual(shortenFinaleWords(["hollow.", "hollow;", "howl,"], "haunted-wood"), ["hollow", "shroud", "howl"],
    "punctuation can still be the saved keystroke, without duplicate live words");
  for (const realm of Object.keys(FINALE_SHORT_WORDS)) {
    const pool = FINALE_SHORT_WORDS[realm]!;
    assert(pool.every((word) => /^[a-z]{2,}$/.test(word)), `${realm}: authored pool contains full alphabetic labels`);
    assertEqual(new Set(pool).size, pool.length, `${realm}: replacement pool has no duplicate labels`);
  }
  assertEqual(shortenFinaleWords(["at", "ice", "reFORGE"], "clockwork-forge"), ["at", "ice", "reFORGE"],
    "minimum words and mixed-case commands retain their original exercise");
  assertEqual(shortenFinaleWords(["Snow", "FROST"], "winter-mountain"), ["Sun", "FANG"],
    "ordinary initial capitals and all-capitals remain intact");
  for (const unknown of ["unknown-realm", "toString", ""]) {
    assertEqual(shortenFinaleWords(["snow", "frost"], unknown), ["snow", "frost"],
      `${unknown}: an unavailable complete-word pool safely retains original words`);
  }
});

await suite("finale sabotage: every pair of distinct bank words remains distinct", () => {
  for (const [realm, bank] of banks) {
    for (const first of bank) for (const second of bank) {
      if (first.toLowerCase() === second.toLowerCase()) continue;
      const labels = shortenFinaleWords([first, second], realm);
      assert(labels[0].toLowerCase() !== labels[1].toLowerCase(), `${first}/${second} stay distinct`);
      assert(labels.every((label, i) => label.length >= 2 &&
        (label === [first, second][i] || (label.length === [first, second][i].length - 1 &&
          FINALE_SHORT_WORDS[realm]!.includes(label)))), "only a curated complete word saves exactly one keystroke");
    }
  }
});

await suite("finale sabotage: three concurrent same-length echoes cannot steal each other's fallbacks", () => {
  for (const [realm, bank] of banks) {
    const lengths = new Set(bank.map((word) => word.length));
    for (const length of lengths) {
      const group = [...new Set<string>(bank.filter((word) => word.length === length))];
      for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
        for (let c = b + 1; c < group.length; c++) {
          const input = [group[a]!, group[b]!, group[c]!];
          const labels = shortenFinaleWords(input, realm);
          assertEqual(new Set(labels.map((word) => word.toLowerCase())).size, 3,
            `${realm}: ${input.join("/")} leaves three separately typeable labels`);
        }
      }
    }
  }
  for (const originals of [["fire", "forge", "fired"], ["forge", "fire", "fired"], ["fired", "forge", "fire"]]) {
    const labels = shortenFinaleWords(originals, "clockwork-forge");
    assertEqual(new Set(labels).size, 3, "future original labels are reserved in every tested order");
    labels.forEach((label, index) => assert(!originals.includes(label) || label === originals[index],
      "a replacement cannot take another echo's original fallback"));
  }
});

await suite("finale sabotage: a fallback wave reserves its notice for the first real shortening", () => {
  const url = new URL("../src/scenes/GreatBattleScene.ts", import.meta.url);
  const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
  const owner = source.statements.find(ts.isClassDeclaration)!;
  const method = owner.members.find((member) => member.name?.getText(source) === "runNextWave")!.getText(source);
  const code = ts.transpileModule(`class Battle { ${method} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Battle = new Function("pickAdaptiveWords", "shortenFinaleWords", "playSceneEventPulse", "WALL_WARD",
    `${code}; return Battle;`)((bank: string[], count: number) => bank.slice(0, count), shortenFinaleWords,
    () => {}, { x: 960, y: 500, width: 400 });
  const battle = new Battle();
  const words: string[] = [];
  const timers: Array<{ ms: number; next: () => void }> = [];
  const notices: string[][] = [];
  let cues = 0;
  Object.assign(battle, {
    runOver: false, currentWaveIdx: 0, sabotageWrenchWaveNoticed: false,
    waveQueue: [
      { realmId: "winter-mountain", label: "snow", bank: ["ice", "den", "icy"] },
      { realmId: "clockwork-forge", label: "forge", bank: ["FORGE", "RIVET", "IRON"] },
      { realmId: "sky-island", label: "sky", bank: ["lantern", "shimmer", "beacon"] },
    ],
    store: { get: () => ({ satchel: ["sabotage-wrench"], keyStats: {} }) },
    band: { setObjective() {} }, setNarrator() {}, playWallWardPulse() {}, watchForWaveClear() {},
    waveSpawnXs: () => [400, 900, 1400],
    spawnEnemy: (_wave: unknown, _x: number, word: string) => words.push(word),
    time: { delayedCall: (ms: number, next: () => void) => timers.push({ ms, next }) },
    playSabotageWrenchWaveCue: () => { cues += 1; },
    showRelicNotice: (...args: string[]) => notices.push(args),
  });
  battle.runNextWave();
  assertEqual(words, ["ice", "den", "icy"], "a wave without complete shorter words keeps its original labels");
  assert(!battle.sabotageWrenchWaveNoticed, "fallback originals do not consume the one-time helpful-word cue");
  assertEqual(timers.length, 0, "a fully unchanged wave cannot claim it shortened the echoes");
  battle.runNextWave();
  assertEqual(words.slice(3), ["FIRE", "WIRE", "ORE"], "the actual wave passes its realm and preserves exact uppercase");
  assertEqual(timers.map((timer) => timer.ms), [360], "the first effective wave keeps the existing notice delay");
  timers[0]!.next();
  assertEqual([cues, notices], [1, [["finale_relic_sabotage_wrench_wave", "wrench"]]], "the effective shortening gets one visible cue and notice");
  battle.runNextWave();
  assertEqual(timers.length, 1, "later effective waves do not duplicate the one-time notice");
});
