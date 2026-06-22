// Logic harness: the Phase-2 counter-loadout facet resolver
// (src/game/finaleFacets.ts). We exercise the REAL resolveFacets + data, and
// cross-check every counter relic against the real RELICS catalogue so a
// renamed/removed relic can't silently leave a facet un-counterable.

import { assert, assertEqual, suite } from "./_assert";

import {
  FACET_ORDER,
  REALM_FACETS,
  resolveFacets,
} from "../src/game/finaleFacets";
import { RELICS } from "../src/game/relics";

const ALL_REALMS = [
  "winter-mountain",
  "sunken-bell",
  "clockwork-forge",
  "sky-island",
  "haunted-wood",
];

// ─── Data integrity ───────────────────────────────────────────────────────────

await suite("finaleFacets: one facet per realm, ids + words unique", () => {
  assertEqual(FACET_ORDER.length, 5, "5 facets in canon order");
  assertEqual(
    [...FACET_ORDER].sort(),
    [...ALL_REALMS].sort(),
    "FACET_ORDER covers exactly the five realms",
  );
  for (const realmId of ALL_REALMS) {
    assert(REALM_FACETS[realmId] !== undefined, `${realmId} has a facet`);
    assertEqual(
      REALM_FACETS[realmId]!.realmId,
      realmId,
      `${realmId} facet.realmId matches its key`,
    );
  }
  const ids = ALL_REALMS.map((r) => REALM_FACETS[r]!.id);
  assertEqual(new Set(ids).size, 5, "facet ids are unique");
  const words = ALL_REALMS.map((r) => REALM_FACETS[r]!.defenseWord);
  assertEqual(new Set(words).size, 5, "defense words are unique");
  for (const w of words) {
    assert(/^[a-z]+$/.test(w), `defense word "${w}" is plain lowercase (typeable)`);
  }
});

await suite("finaleFacets: every counter relic is a real relic", () => {
  for (const realmId of ALL_REALMS) {
    const facet = REALM_FACETS[realmId]!;
    assert(facet.counteredBy.length >= 1, `${facet.id} has at least one counter`);
    for (const relicId of facet.counteredBy) {
      assert(
        RELICS[relicId] !== undefined,
        `${facet.id} counter "${relicId}" is not in RELICS`,
      );
    }
  }
});

// ─── Resolution ───────────────────────────────────────────────────────────────

await suite("resolveFacets: no cleared realms → no facets", () => {
  assertEqual(resolveFacets([], []).length, 0, "nothing cleared → empty");
  assertEqual(
    resolveFacets([], ["pelt-of-the-old-one"]).length,
    0,
    "relics without cleared realms still → empty",
  );
});

await suite("resolveFacets: Walked Alone faces every facet, none countered", () => {
  // The critical case: all realms cleared, EMPTY satchel. All five facets
  // appear and ALL are uncountered (→ survivable challenges, not auto-loss).
  const res = resolveFacets(ALL_REALMS, []);
  assertEqual(res.length, 5, "all five facets present");
  for (const r of res) {
    assertEqual(r.counteredBy, null, `${r.facet.id} is uncountered for Walked Alone`);
  }
});

await suite("resolveFacets: a full counter satchel neutralizes everything", () => {
  const fullCounters = [
    "pelt-of-the-old-one",
    "bells-tongue",
    "sabotage-wrench",
    "lantern-moth",
    "ghost-kings-promise",
  ];
  const res = resolveFacets(ALL_REALMS, fullCounters);
  assertEqual(res.length, 5, "all five facets present");
  for (const r of res) {
    assert(r.counteredBy !== null, `${r.facet.id} is countered`);
  }
  assertEqual(
    res.find((r) => r.facet.id === "cold")!.counteredBy,
    "pelt-of-the-old-one",
    "Cold countered by the Pelt",
  );
  assertEqual(
    res.find((r) => r.facet.id === "light")!.counteredBy,
    "lantern-moth",
    "Light countered by the lantern-moth (a companion can counter)",
  );
});

await suite("resolveFacets: result follows FACET_ORDER, not input order", () => {
  // Pass cleared realms shuffled; the resolution must still be canon order.
  const shuffled = ["haunted-wood", "winter-mountain", "sky-island"];
  const res = resolveFacets(shuffled, []);
  assertEqual(
    res.map((r) => r.facet.realmId),
    ["winter-mountain", "sky-island", "haunted-wood"],
    "facets emitted in FACET_ORDER regardless of input order",
  );
});

await suite("resolveFacets: either counter relic works (second alternative)", () => {
  // Toll is countered by bells-tongue OR lock-bar. With only lock-bar, the
  // facet is still countered (by lock-bar).
  const res = resolveFacets(["sunken-bell"], ["lock-bar"]);
  assertEqual(res.length, 1, "one facet");
  assertEqual(res[0]!.counteredBy, "lock-bar", "Toll countered by lock-bar");
});

await suite("resolveFacets: partial loadout — some countered, some not", () => {
  // Cleared winter + bell + forge; satchel only counters the Cold.
  const res = resolveFacets(
    ["winter-mountain", "sunken-bell", "clockwork-forge"],
    ["pelt-of-the-old-one"],
  );
  assertEqual(res.length, 3, "three facets");
  assertEqual(res.find((r) => r.facet.id === "cold")!.counteredBy, "pelt-of-the-old-one", "Cold countered");
  assertEqual(res.find((r) => r.facet.id === "toll")!.counteredBy, null, "Toll uncountered");
  assertEqual(res.find((r) => r.facet.id === "armor")!.counteredBy, null, "Armor uncountered");
});
