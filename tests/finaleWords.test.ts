import { shortenFinaleWords } from "../src/game/finaleWords";
import { WINTER_WORD_BANK, SUNKEN_BELL_WORD_BANK, FORGE_WORD_BANK,
  SKY_ISLAND_WORD_BANK, HAUNTED_WOOD_WORD_BANK } from "../src/game/wordBank";
import { assert, assertEqual, suite } from "./_assert";

await suite("finale sabotage: ice and icy never collapse to the same live label", () => {
  assertEqual(shortenFinaleWords(["ice", "icy", "snow"]), ["ic", "icy", "sno"],
    "first shortened label wins; collision keeps its original word");
  assertEqual(shortenFinaleWords(["ice", "icy", "ic"]), ["ice", "icy", "ic"],
    "existing original labels are reserved before shortening");
  assertEqual(shortenFinaleWords(["at", "cold", "thaw"]), ["at", "col", "tha"],
    "ordinary shortening and minimum length preserved");
});

await suite("finale sabotage: every pair of distinct bank words remains distinct", () => {
  for (const bank of [WINTER_WORD_BANK, SUNKEN_BELL_WORD_BANK, FORGE_WORD_BANK,
    SKY_ISLAND_WORD_BANK, HAUNTED_WOOD_WORD_BANK]) {
    for (const first of bank) for (const second of bank) {
      if (first.toLowerCase() === second.toLowerCase()) continue;
      const labels = shortenFinaleWords([first, second]);
      assert(labels[0].toLowerCase() !== labels[1].toLowerCase(), `${first}/${second} stay distinct`);
      assert(labels.every((label, i) => label.length >= 2 &&
        [first, second][i].startsWith(label)), "keeps a readable prefix without adding characters");
    }
  }
});
