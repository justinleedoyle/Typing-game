// Narrative invariants over every Winter branch, not snapshots of the prose.
// No Phaser, browser storage, Supabase or scene boot is involved.
import { assert, assertEqual, suite } from "./_assert";
import {
  REALM_LORE, realmPathSummary, winterRealmSummary, winterLorePageMatchesChoices,
  winterLorePageBody,
} from "../src/game/realmLore";
import { ALMANAC_LORE_PAGES } from "../src/game/almanacLorePages";
import { getRunaLine } from "../src/audio/runaLines";
import { navigationAction } from "../src/game/ui/navigationPolicy";

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
          if (fork1 === "firefly") assert(!prose.includes("Sigrid"), "the firefly route never learns the huntress's name or the fox's reason for searching");
          assertEqual(JSON.stringify(progress), before, "reader does not rewrite saved decisions");
        }
      }
    }
  }
});

await suite("Winter Almanac: near misses and declining the fox have distinct truthful farewells", () => {
  const summary = (fox: string, fork1: string, fork2: string, companion?: string) => winterRealmSummary({ cleared: true, choices: { fox, fork1, fork2, ...(companion ? { companion } : {}) } });
  assert(summary("ignored", "huntress", "bury").passages[3].includes("No snow-fox followed"), "missing first kindness acknowledged");
  const searching = summary("spared", "firefly", "bury").passages[3];
  assert(searching.includes("looked past Wren") && searching.includes("back into the pines"), "the unexplained search records only what Wren witnessed");
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

await suite("Realm Almanac: every fork combination records the actual chosen actions", () => {
  const branches = [
    { realm: "winter-mountain", first: [["huntress", "freed Sigrid"], ["firefly", "followed the fireflies"]], second: [["bury", "built a cairn"], ["pelt", "took the old wolf's pelt"]] },
    { realm: "sunken-bell", first: [["chant", "opened the cathedral doors slowly"], ["force", "forced the cathedral doors open"]], second: [["free-aurland", "unspoke the binding"], ["claim-tongue", "took its iron tongue"]] },
    { realm: "clockwork-forge", first: [["forn", "repair the iron bellows"], ["cabal", "shut a furnace valve"]], second: [["peaceful", "typed STAND DOWN"], ["fought", "fought the last two command-golems"]] },
    { realm: "sky-island", first: [["help-etta", "books back to the shelves"], ["steal-flame", "beacon dimmed"]], second: [["answer-kindly", "you kept the light"], ["cut-tether", "binding the spirit to the beacon"]] },
    { realm: "haunted-wood", first: [["offering", "i remember you"], ["bone-flute", "took the bone flute"]], second: [["bargain", "you are not gone"], ["force", "lit the grove"]] },
  ];
  for (const { realm, first, second } of branches) {
    for (const [fork1, firstAction] of first) for (const [fork2, secondAction] of second) {
      const choices = { fork1: fork1!, fork2: fork2! };
      const before = JSON.stringify(choices);
      const summary = realmPathSummary(realm, choices);
      assert(summary.primary.includes(firstAction!), `${realm}/${fork1} records its first action`);
      assert(summary.secondary?.includes(secondAction!), `${realm}/${fork2} records its final action`);
      for (const [other, action] of first) if (other !== fork1) assert(!summary.primary.includes(action!), `${realm} does not invent opposite first branch`);
      for (const [other, action] of second) if (other !== fork2) assert(!summary.secondary?.includes(action!), `${realm} does not invent opposite final branch`);
      assert(!/\b(he|him|his|himself)\b/i.test(`${summary.primary} ${summary.secondary}`), `${realm} works for either Wren identity`);
      assertEqual(JSON.stringify(choices), before, "reading a record never rewrites saved choices");
    }
  }
  const stolen = realmPathSummary("sky-island", { fork1: "steal-flame", fork2: "cut-tether" });
  assert(!stolen.primary.includes("uncharged") && !stolen.primary.includes("brightened"), "stealing a flame is not rewritten as repairing the beacon");
  const etta = realmPathSummary("sky-island", { fork1: "help-etta" });
  assert(!etta.primary.includes("measurements") && !etta.primary.includes("sky-chart"), "Etta's played book action replaces the abandoned measurement story");
});

await suite("Realm Almanac: legacy aliases and incomplete saves stay truthful", () => {
  for (const fork1 of ["forn", "cabal"]) for (const fork2 of ["peaceful", "fought"]) {
    assertEqual(realmPathSummary("clockwork-forge", { ending: `${fork1}-${fork2}` }), realmPathSummary("clockwork-forge", { fork1, fork2 }), "old combined Forge ending resolves both branches");
  }
  const explicit = realmPathSummary("clockwork-forge", { fork1: "cabal", fork2: "fought", ending: "forn-peaceful" });
  assert(explicit.primary.includes("furnace valve") && explicit.secondary?.includes("last two"), "explicit branches take precedence over a stale combined ending");
  assertEqual(realmPathSummary("sunken-bell", { fork2: "free-king" }), realmPathSummary("sunken-bell", { fork2: "free-aurland" }), "historical Aurland lore-key alias remains readable");
  assertEqual(realmPathSummary("sky-island", { fork1: "beacon" }), realmPathSummary("sky-island", { fork1: "steal-flame" }), "historical beacon key records taking the flame");
  assertEqual(realmPathSummary("haunted-wood", { fork2: "light-grove" }), realmPathSummary("haunted-wood", { fork2: "force" }), "historical grove key remains readable");
  for (const realm of Object.keys(REALM_LORE)) {
    for (const choices of [{}, { fork1: "none", fork2: "unknown", ending: "not-a-real-ending" }]) {
      const summary = realmPathSummary(realm, choices);
      assert(summary.primary.includes("not recorded") && summary.secondary?.includes("not recorded"), `${realm}: missing/unknown choices never default to a route`);
    }
  }
  assert(realmPathSummary("future-realm").primary.includes("not recorded"), "unknown future realm is safe");
});

await suite("Story copy: one living Holdfast and identity-neutral Wren records", () => {
  assert(getRunaLine("hub_all_cleared")?.text.includes("Holdfast"), "last portal calls Wren home to Holdfast");
  assert(getRunaLine("finale_phase1_arrival")?.text.startsWith("Holdfast."), "final battle uses the established home name");
  const etta = ALMANAC_LORE_PAGES["scholar-ettas-last-volume"]!.body;
  assert(etta.includes("royal library still kept its lamps lit"), "Etta's record preserves the active library hub");
  assert(!etta.includes("library had burned") && !etta.includes("measurements"), "abandoned library/chart backstory is removed");
  assert(!ALMANAC_LORE_PAGES["the-hundred-quiet-years"]!.body.includes("seven realms"), "authored lore no longer contradicts the five-realm world");
  assert(REALM_LORE["sunken-bell"]!.intro.includes("same drowned rhythm"), "Bell history agrees with the century-long choir and final silence");
  assert(!REALM_LORE["sunken-bell"]!.intro.includes("had not rung"), "Bell does not claim both a century of silence and a first silence at defeat");
  const crossroads = ALMANAC_LORE_PAGES["the-crossroads-ghost"]!.body;
  assert(crossroads.includes("don't know my name") && crossroads.includes("i'll find it") && crossroads.includes("shrine"), "crossroads journal records the actual lost-name promise");
  assert(!crossroads.includes("which way I came") && !crossroads.includes("fifth way"), "journal does not invent a different meeting and departure");
  const code = ALMANAC_LORE_PAGES["golem-keepers-code"]!.body;
  assert(code.includes("typed turn") && code.includes("Shift through TURN"), "Gregor's record uses the actual paired tutorial targets");
  const gates = ALMANAC_LORE_PAGES["the-five-temple-riddles"]!;
  assert(gates.title.includes("Gates") && gates.body.includes("third gate") && gates.body.includes("sealed scroll"), "Sky records its actual middle precision gate");
  assert(!gates.body.includes("without a stumble"), "moving gates are not falsely recorded as five no-miss tests");
  const lighter = ALMANAC_LORE_PAGES["the-lantern-lighters-vigil"]!.body;
  assert(lighter.includes("i came to help."), "Lantern-Lighter memory records Wren's actual typed reply");
  assert(lighter.includes("long questions") && lighter.includes("light toward the tower path"), "Lantern-Lighter memory preserves the warning and light handoff");
  assert(!lighter.includes("let Wren help with the row") && !lighter.includes("corrected Wren"), "memory does not claim an unplayed counting task or invented mistakes");
  const riddles = ALMANAC_LORE_PAGES["the-scholar-spirits-riddles"]!.body;
  assert(riddles.indexOf("second answer") < riddles.indexOf("Agai") && riddles.indexOf("Agai") < riddles.indexOf("third answer"), "the scratched fragment appears between the second and third answers");
  const wards = ALMANAC_LORE_PAGES["punctuation-warding"]!.body;
  assert(wards.includes("A dot hid the ward") && !wards.includes("Inga"), "the early ward record preserves both the actual masking rule and the still-unknown ghost name");
  for (const realm of Object.values(REALM_LORE)) for (const text of Object.values(realm.endings)) {
    assert(!/\b(he|him|his|himself)\b/i.test(text), "all branch and companion summary copy works for either Wren identity");
  }
  const outdatedWrenPhrases = ["corrected him", "Each lamp he lit", "not his answer", "when he had finished", "Inga told him", "She thanked him", "He pried it free", "suggestion, lad"];
  for (const page of Object.values(ALMANAC_LORE_PAGES)) for (const outdated of outdatedWrenPhrases) {
    assert(!page.body.includes(outdated), `${page.title} does not assign Wren a male identity`);
  }
});

await suite("Almanac shortcuts: cancel before close and leave typing/browser shortcuts intact", () => {
  for (const typing of [false, true]) {
    assertEqual(navigationAction({ key: "Escape" }, "book", typing), typing ? "cancel-typing" : "close", "Escape closes only after a claimed word or prefix has been cancelled");
    for (const key of ["ArrowLeft", "PageUp"]) assertEqual(navigationAction({ key }, "book", typing), typing ? "ignore" : "previous-page", "backward shortcut never steals a typed command");
    for (const key of ["ArrowRight", "PageDown"]) assertEqual(navigationAction({ key }, "book", typing), typing ? "ignore" : "next-page", "forward shortcut never steals a typed command");
    for (const key of ["n", "p", "c", " ", "Backspace"]) assertEqual(navigationAction({ key }, "book", typing), null, "typed navigation, spaces and corrections retain their original route");
    for (const key of ["Escape", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]) {
      assertEqual(navigationAction({ key, repeat: true }, "book", typing), "ignore", "holding a key cannot skip pages or cancel then immediately close");
      for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) assertEqual(navigationAction({ key, [modifier]: true }, "book", typing), "ignore", "browser shortcuts are left alone");
    }
  }
});
