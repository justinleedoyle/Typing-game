// Narrative invariants over every Winter branch, not snapshots of the prose.
// No Phaser, browser storage, Supabase or scene boot is involved.
import { assert, assertEqual, suite } from "./_assert";
import {
  REALM_LORE, winterRealmSummary, winterLorePageMatchesChoices,
  winterLorePageBody,
} from "../src/game/realmLore";
import { ALMANAC_LORE_PAGES } from "../src/game/almanacLorePages";

const allWinterItems = ["hunters-horn", "firefly-lantern", "cairn-token", "pelt-of-the-old-one", "snow-fox-cub"];

await suite("Winter Almanac: all fork and companion combinations tell the played path", () => {
  for (const fox of ["spared", "ignored"]) {
    for (const fork1 of ["huntress", "firefly"]) {
      for (const fork2 of ["bury", "pelt"]) {
        for (const companion of ["accepted", "declined"]) {
          const choices = { fox, fork1, fork2, companion };
          const progress = { cleared: true, choices };
          const before = JSON.stringify(progress);
          const summary = winterRealmSummary(progress, [...allWinterItems, "quiet-chant"]);
          assertEqual(summary.passages.length, 4, "meeting, trail, aftermath and companion each recorded");
          assert(summary.passages[0].includes(fox === "spared" ? "I mean no harm" : "without stopping"), "early fox choice truthful");
          assert(summary.passages[1].includes(fork1 === "huntress" ? "freed Sigrid" : "followed the fireflies"), "chosen trail action recorded");
          assert(!summary.passages[1].includes(fork1 === "huntress" ? "followed the fireflies" : "freed Sigrid"), "unchosen trail action never claimed");
          assert(summary.passages[2].includes(fork2 === "bury" ? "built a cairn" : "took the old wolf's pelt"), "chosen aftermath recorded");
          assert(!summary.passages[2].includes(fork2 === "bury" ? "took the old wolf's pelt" : "built a cairn"), "opposite aftermath never claimed");
          const eligible = fox === "spared" && fork1 === "huntress" && fork2 === "bury";
          const joined = eligible && companion === "accepted";
          assertEqual(summary.companion, joined ? "joined" : eligible ? "declined" : "not-earned", "all three kindness conditions plus acceptance required");
          assertEqual(summary.passages[3].includes("followed through the portal"), joined, "following-home passage only when fox actually joins");
          assertEqual(summary.carriedIds.includes("snow-fox-cub"), joined, "stale companion inventory cannot contradict decision");
          assertEqual(summary.carriedIds.includes("hunters-horn"), fork1 === "huntress", "only chosen horn shown");
          assertEqual(summary.carriedIds.includes("firefly-lantern"), fork1 === "firefly", "only chosen lantern shown");
          assertEqual(summary.carriedIds.includes("cairn-token"), fork2 === "bury", "only chosen cairn token shown");
          assertEqual(summary.carriedIds.includes("pelt-of-the-old-one"), fork2 === "pelt", "only chosen pelt shown");
          assert(!summary.carriedIds.includes("quiet-chant"), "another realm's keepsakes excluded");
          const prose = [summary.pathHeading, summary.carriedHeading, ...summary.passages].join(" ");
          assert(!/\b(he|him|his)\b/i.test(prose), "Wren's record works for girl, boy and unspecified identity");
          assertEqual(JSON.stringify(progress), before, "reader does not rewrite saved decisions");
        }
      }
    }
  }
});

await suite("Winter Almanac: near misses and declining the fox have distinct truthful farewells", () => {
  const summary = (fox: string, fork1: string, fork2: string, companion?: string) => winterRealmSummary({ cleared: true, choices: { fox, fork1, fork2, ...(companion ? { companion } : {}) } });
  assert(summary("ignored", "huntress", "bury").passages[3].includes("No snow-fox followed"), "missing first kindness acknowledged");
  assert(summary("spared", "firefly", "bury").passages[3].includes("searched for Sigrid"), "missing huntress acknowledged");
  assert(summary("spared", "huntress", "pelt").passages[3].includes("saw the old wolf's pelt"), "pelt near miss acknowledged");
  const declined = summary("spared", "huntress", "bury", "declined");
  assert(declined.passages[3].includes("Wren let her go"), "earned offer can be declined");
  assertEqual(declined.companion, "declined", "declining differs from failing to earn offer");
});

await suite("Winter Almanac: legacy saves use inventory only as bounded evidence", () => {
  const kind = { cleared: true, choices: { fox: "spared", fork1: "huntress", fork2: "bury" } };
  assertEqual(winterRealmSummary(kind, ["snow-fox-cub"]).companion, "joined", "legacy carried fox plus full kindness gate is evidence of acceptance");
  assertEqual(winterRealmSummary(kind, []).companion, "unrecorded", "absence never invents a declined choice");
  assertEqual(winterRealmSummary({ ...kind, choices: { ...kind.choices, companion: "declined" } }, ["snow-fox-cub"]).companion, "declined", "explicit decline overrides stale inventory");
  assertEqual(winterRealmSummary({ cleared: true, choices: {} }, allWinterItems).companion, "unrecorded", "missing choices cannot manufacture kindness gate");
  assertEqual(winterRealmSummary(undefined).carriedIds, [], "missing record safe and empty");
  const unrecorded = winterRealmSummary({ cleared: true, choices: { fox: "unknown", fork1: "none", fork2: "none" } });
  assert(unrecorded.passages[1].includes("not recorded"), "unknown fork1 not defaulted to huntress");
  assert(unrecorded.passages[2].includes("not recorded"), "unknown fork2 not defaulted to burial");
  assertEqual(winterRealmSummary(kind, ["hunters-horn", "hunters-horn"]).carriedIds, ["hunters-horn"], "duplicate inventory never repeats a keepsake row");
});

await suite("Winter Almanac: stamped branch pages agree with current decisions", () => {
  assert(!winterLorePageMatchesChoices("the-wounded-foxs-name", { fox: "ignored" }), "ignored fox does not get a fabricated kindness page");
  assert(winterLorePageMatchesChoices("the-wounded-foxs-name", { fox: "spared" }), "actual fox kindness page remains");
  assert(!winterLorePageMatchesChoices("the-huntress-song", { fork1: "firefly" }), "legacy opposite huntress stamp hidden");
  assert(!winterLorePageMatchesChoices("the-firefly-trail", { fork1: "huntress" }), "legacy opposite firefly stamp hidden");
  assert(winterLorePageMatchesChoices("the-huntress-song", { fork1: "huntress" }), "chosen huntress page remains");
  assert(winterLorePageMatchesChoices("the-firefly-trail", { fork1: "firefly" }), "chosen firefly page remains");
  assert(winterLorePageMatchesChoices("wayshrine-runes", { fork1: "firefly", fox: "ignored" }), "unrelated Winter lore remains");
  assert(winterLorePageMatchesChoices("the-huntress-song"), "unrecorded legacy choice does not delete stamped evidence");
});

await suite("Winter Almanac: first-realm lore uses the actual lines and neutral Wren wording", () => {
  for (const [id, page] of Object.entries(ALMANAC_LORE_PAGES)) {
    const resolved = winterLorePageBody(id, page.body);
    if (page.realmId === "winter-mountain") {
      assert(!/\b(he|him|his)\b/i.test(resolved), `${id} does not assign Wren a male identity`);
    } else {
      assertEqual(resolved, page.body, `${id} retains other-realm prose exactly`);
    }
  }
  const heldur = winterLorePageBody("the-hundred-quiet-years", "");
  assert(!heldur.includes("seven realms"), "does not invent an unseen seven-realm speech");
  assert(heldur.includes("a hundred years at the pass"), "records Heldur's actual answer");
  const trueName = winterLorePageBody("the-pack-leader-true-name", "");
  assert(trueName.includes("the winter mountain settles. its old breath warms. the snow rests."), "mountain passage matches the playable true name");
  assertEqual(winterLorePageBody("unknown-page", "Keep this exact text."), "Keep this exact text.", "unknown future pages pass through");
  assertEqual(REALM_LORE["sunken-bell"].title, "The Sunken Bell", "shared later-realm catalog preserved");
});
