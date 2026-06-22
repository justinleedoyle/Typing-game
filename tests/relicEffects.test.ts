// Logic harness: the Phase-0 relic-effects bridge (src/game/relicEffects.ts) —
// the single source of truth for relic alignment + companion-ness, shared by
// the finale (Tier 3) and relics-live-in-combat (Tier 4). We import and
// exercise the REAL descriptor + aggregator, and lock them against:
//   • RELICS (relics.ts) — completeness, both directions.
//   • the canonical §5.5.11 alignment lists — hardcoded HERE as an independent
//     spec, so a wrong edit to RELIC_EFFECTS is caught as drift from canon.
//   • selectFinalPhrase (relicAlignment.ts) — proves the derive-from-descriptor
//     refactor is behavior-preserving for the live finale consumer.

import { assert, assertEqual, suite } from "./_assert";

import {
  RELIC_EFFECTS,
  RELIC_IDS,
  FORCE_RELICS,
  KINDNESS_RELICS,
  COMPANION_IDS,
  DUEL_ALIGNMENT_THRESHOLD,
  getActiveRelicEffects,
} from "../src/game/relicEffects";
import { selectFinalPhrase } from "../src/game/relicAlignment";
import { RELICS } from "../src/game/relics";

// The canon §5.5.11 / §5.5.9 lists, transcribed independently from the design
// doc. These are the SPEC: the descriptor must reproduce them exactly.
const CANON_FORCE = [
  "bells-tongue",
  "lock-bar",
  "sabotage-wrench",
  "pelt-of-the-old-one",
  "ash-vial",
  "beacon-spark",
  "golem-heart",
  "bone-flute",
  "tether-cord",
];
const CANON_KINDNESS = [
  "hunters-horn",
  "firefly-lantern",
  "cairn-token",
  "quiet-chant",
  "trident-token",
  "bellows-hammer",
  "master-key",
  "ettas-ledger",
  "wind-phrase",
  "shrine-token",
  "ghost-kings-promise",
];
const CANON_COMPANIONS = [
  "snow-fox-cub",
  "glass-fish",
  "brass-songbird",
  "lantern-moth",
  "wisp-cat",
];
const CANON_NEUTRAL_ALLIES = ["king-aurland", "untethered-wind"];

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

// ─── Completeness vs RELICS ───────────────────────────────────────────────────

await suite("relicEffects: descriptor key-matches RELICS exactly", () => {
  assertEqual(
    sorted(RELIC_IDS),
    sorted(Object.keys(RELICS)),
    "RELIC_IDS should equal Object.keys(RELICS)",
  );
  for (const id of Object.keys(RELICS)) {
    assert(
      RELIC_EFFECTS[id] !== undefined,
      `RELICS id "${id}" has no RELIC_EFFECTS entry`,
    );
  }
  for (const id of Object.keys(RELIC_EFFECTS)) {
    assert(
      RELICS[id] !== undefined,
      `RELIC_EFFECTS has orphan id "${id}" not in RELICS`,
    );
  }
  assertEqual(Object.keys(RELIC_EFFECTS).length, 27, "27 relics total");
});

// ─── Canon-match: derived sets equal the §5.5.11 lists ────────────────────────

await suite("relicEffects: derived sets equal the canon §5.5.11 lists", () => {
  assertEqual(sorted(FORCE_RELICS), sorted(CANON_FORCE), "FORCE_RELICS == canon");
  assertEqual(
    sorted(KINDNESS_RELICS),
    sorted(CANON_KINDNESS),
    "KINDNESS_RELICS == canon",
  );
  assertEqual(
    sorted(COMPANION_IDS),
    sorted(CANON_COMPANIONS),
    "COMPANION_IDS == canon",
  );
  assertEqual(FORCE_RELICS.size, 9, "9 force relics");
  assertEqual(KINDNESS_RELICS.size, 11, "11 kindness relics");
  assertEqual(COMPANION_IDS.length, 5, "5 companions");
});

await suite("relicEffects: alignment buckets partition cleanly", () => {
  // Every relic is exactly one of force / kindness / neutral; companions are
  // always neutral (the two axes don't overlap); the 2 pure-utility allies are
  // the only NON-companion neutrals.
  let force = 0;
  let kindness = 0;
  let neutral = 0;
  const neutralNonCompanions: string[] = [];
  for (const [id, e] of Object.entries(RELIC_EFFECTS)) {
    if (e.alignment === "force") {
      force += 1;
      assert(!e.isCompanion, `${id}: force relic must not be a companion`);
    } else if (e.alignment === "kindness") {
      kindness += 1;
      assert(!e.isCompanion, `${id}: kindness relic must not be a companion`);
    } else {
      neutral += 1;
      if (!e.isCompanion) neutralNonCompanions.push(id);
    }
  }
  assertEqual(force, 9, "9 force");
  assertEqual(kindness, 11, "11 kindness");
  assertEqual(neutral, 7, "7 neutral (5 companions + 2 allies)");
  assertEqual(
    sorted(neutralNonCompanions),
    sorted(CANON_NEUTRAL_ALLIES),
    "the only neutral non-companions are king-aurland + untethered-wind",
  );
  for (const id of CANON_COMPANIONS) {
    assertEqual(
      RELIC_EFFECTS[id]!.alignment,
      "neutral",
      `${id}: companion must be neutral-aligned`,
    );
    assert(RELIC_EFFECTS[id]!.isCompanion, `${id}: must be a companion`);
  }
});

// ─── Aggregator ───────────────────────────────────────────────────────────────

await suite("getActiveRelicEffects: empty satchel is Walked Alone", () => {
  const e = getActiveRelicEffects([]);
  assert(e.isWalkedAlone, "empty satchel → Walked Alone");
  assertEqual(e.forceCount, 0, "no force");
  assertEqual(e.kindnessCount, 0, "no kindness");
  assertEqual(e.companionCount, 0, "no companions");
  assert(!e.hasCompanion, "no companion");
  assert(!e.isForceDuel, "not a force duel");
  assert(!e.isKindnessDuel, "not a kindness duel");
  assertEqual(e.ids.size, 0, "no ids");
});

await suite("getActiveRelicEffects: counts force/kindness/companions", () => {
  const satchel = [
    "bells-tongue", // force
    "lock-bar", // force
    "ash-vial", // force
    "hunters-horn", // kindness
    "snow-fox-cub", // companion
    "king-aurland", // neutral ally
  ];
  const e = getActiveRelicEffects(satchel);
  assertEqual(e.forceCount, 3, "3 force");
  assertEqual(e.kindnessCount, 1, "1 kindness");
  assertEqual(e.companionCount, 1, "1 companion");
  assert(e.hasCompanion, "has a companion");
  assert(e.isForceDuel, "≥3 force → force duel");
  assert(!e.isKindnessDuel, "<3 kindness → not kindness duel");
  assert(!e.isWalkedAlone, "non-empty satchel → not Walked Alone");
  assert(e.has("king-aurland"), "has() finds a present id");
  assert(!e.has("master-key"), "has() rejects an absent id");
});

await suite("getActiveRelicEffects: both duels can be true at once", () => {
  const satchel = [
    ...CANON_FORCE.slice(0, 3),
    ...CANON_KINDNESS.slice(0, 3),
  ];
  const e = getActiveRelicEffects(satchel);
  assert(e.isForceDuel, "3 force → force duel");
  assert(e.isKindnessDuel, "3 kindness → kindness duel");
});

await suite("getActiveRelicEffects: threshold is exactly 3", () => {
  assertEqual(DUEL_ALIGNMENT_THRESHOLD, 3, "threshold constant is 3");
  const two = getActiveRelicEffects(CANON_FORCE.slice(0, 2));
  assert(!two.isForceDuel, "2 force → NOT a force duel");
  const three = getActiveRelicEffects(CANON_FORCE.slice(0, 3));
  assert(three.isForceDuel, "3 force → force duel");
});

await suite("getActiveRelicEffects: dedups + ignores unknown ids", () => {
  // Duplicate force id counts once (ids is a Set).
  const dup = getActiveRelicEffects(["bells-tongue", "bells-tongue", "lock-bar"]);
  assertEqual(dup.forceCount, 2, "duplicate counts once");
  assertEqual(dup.ids.size, 2, "ids deduped");
  // An unknown/legacy id: ignored for counts, but tracked in ids + NOT Walked
  // Alone (length > 0). Guards a stale-save relic from masquerading as empty.
  const unknown = getActiveRelicEffects(["not-a-real-relic"]);
  assertEqual(unknown.forceCount, 0, "unknown not counted as force");
  assertEqual(unknown.kindnessCount, 0, "unknown not counted as kindness");
  assertEqual(unknown.companionCount, 0, "unknown not counted as companion");
  assert(!unknown.isWalkedAlone, "non-empty (even if unknown) → not Walked Alone");
  assert(unknown.has("not-a-real-relic"), "has() still truthful for unknown id");
});

// ─── selectFinalPhrase: refactor is behavior-preserving ───────────────────────

await suite("selectFinalPhrase: matrix unchanged after deriving sets", () => {
  // A representative row per §5.5.11 branch (priority order matters).
  assertEqual(
    selectFinalPhrase(["bells-tongue", "hunters-horn"]),
    "by horn and toll, the old silence breaks.",
    "Bell's Tongue + Hunter's Horn pairing",
  );
  assertEqual(
    selectFinalPhrase(["master-key", "quiet-chant"]),
    "by chant and key, you are kept.",
    "Master-Key + Quiet Chant pairing",
  );
  assertEqual(
    selectFinalPhrase(["snow-fox-cub", "ghost-kings-promise"]),
    "by friend and ghost, you are sealed.",
    "any companion + Ghost-King's Promise",
  );
  assertEqual(
    selectFinalPhrase(CANON_KINDNESS.slice(0, 3)),
    "by mercy alone, you are answered.",
    "≥3 kindness",
  );
  assertEqual(
    selectFinalPhrase(CANON_FORCE.slice(0, 3)),
    "by force you came; by force you go.",
    "≥3 force",
  );
  assertEqual(
    selectFinalPhrase([]),
    "i came alone. i speak alone. you end.",
    "Walked Alone (empty satchel)",
  );
  assertEqual(
    selectFinalPhrase(["king-aurland"]),
    "by word and breath, you are bound.",
    "default (a neutral ally, no pairing/threshold)",
  );
  // kindness wins the tie over force (priority order in selectFinalPhrase).
  // Pick 3+3 that trigger NO specific pairing (no bells-tongue+hunters-horn,
  // no master-key+quiet-chant, no companion+ghost-king) so the tie-break is
  // what's actually under test — the pairing rules sit ABOVE the thresholds.
  assertEqual(
    selectFinalPhrase([
      "lock-bar",
      "sabotage-wrench",
      "pelt-of-the-old-one", // 3 force, no bells-tongue
      "firefly-lantern",
      "cairn-token",
      "trident-token", // 3 kindness, no pairing trigger
    ]),
    "by mercy alone, you are answered.",
    "≥3 of both, no pairing → kindness wins (priority order)",
  );
});
