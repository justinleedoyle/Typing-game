// Logic harness: the Tier 4 in-realm combat layer on src/game/relicEffects.ts —
// the `combat` block each relic may carry + resolveCombatLoadout(satchel,
// realmId), the bounded aggregator a realm scene reads. We import and exercise
// the REAL descriptor + resolver and lock them against:
//   • an independent spec of WHICH relics carry WHICH effect (a wrong/forgotten
//     combat block is caught as drift, the same way the alignment canon is).
//   • the descriptor's own invariants (valid kind/effect/realm, defensive only on
//     one-shots, every effect announces).
//   • the two BOUNDING rules — passives diminish to a cap, defensive one-shots
//     share a per-realm grace pool capped at GRACE_POOL_CAP — including an
//     explicit "a relic-rich Wood run stays bounded" assertion.

import { assert, assertEqual, assertClose, suite } from "./_assert";

import {
  RELIC_EFFECTS,
  RELIC_IDS,
  resolveCombatLoadout,
  GRACE_POOL_CAP,
  SOUL_BANKED_FRACTION,
  SOUL_THRIFT_MULT,
  type CombatEffectId,
  type CombatEffectKind,
} from "../src/game/relicEffects";

// Canon realm ids (fixed-order progression — PortalChamberScene REALM_SEQUENCE),
// transcribed independently as the spec for appliesIn validation.
const REALM_IDS = [
  "winter-mountain",
  "sunken-bell",
  "clockwork-forge",
  "sky-island",
  "haunted-wood",
];

// The intended combat assignments, transcribed from the approved design. The
// descriptor must reproduce this exactly: [relicId, kind, effect, defensive].
const CANON_COMBAT: Array<
  [string, CombatEffectKind, CombatEffectId, boolean]
> = [
  ["hunters-horn", "passive", "quiet-advance", false],
  ["quiet-chant", "passive", "quiet-advance", false],
  ["untethered-wind", "passive", "quiet-advance", false],
  ["firefly-lantern", "passive", "warm-light", false],
  ["beacon-spark", "passive", "warm-light", false],
  ["pelt-of-the-old-one", "passive", "warm-light", false],
  ["king-aurland", "passive", "soul-banked", false],
  ["bellows-hammer", "passive", "soul-thrift", false],
  ["lock-bar", "oncePerRealm", "ward-breach", true],
  ["golem-heart", "oncePerRealm", "ward-breach", true],
  ["cairn-token", "oncePerRealm", "forgive-economy-miss", true],
  ["master-key", "oncePerRealm", "unseal", true],
  ["bells-tongue", "oncePerRealm", "toll-strike", false],
  ["tether-cord", "oncePerRealm", "bind-beat", false],
  ["sabotage-wrench", "oncePerRealm", "jam-foe", false],
  ["ettas-ledger", "perWaveProc", "auto-ease", false],
  ["shrine-token", "perWaveProc", "forgive-wave-miss", false],
  ["wind-phrase", "perWaveProc", "mist-clear", false],
  // Companions (§5.5.9) that also help in-realm, each effect paralleling its
  // finale role: glass-fish + lantern-moth lit the dark → warm-light; brass-
  // songbird made foes "stop and listen" → quiet-advance. (snow-fox = companion-
  // trip, added with its scene wiring; wisp-cat stays finale-only — earned in the
  // last realm, it has no forward realm to act in.)
  ["glass-fish", "passive", "warm-light", false],
  ["lantern-moth", "passive", "warm-light", false],
  ["brass-songbird", "passive", "quiet-advance", false],
  ["snow-fox-cub", "perWaveProc", "companion-trip", false],
];

// Relics that stay finale-only (no in-realm combat), transcribed independently.
const CANON_FINALE_ONLY = [
  "trident-token",
  "ash-vial",
  "bone-flute",
  "ghost-kings-promise",
  // wisp-cat stays finale-only — earned in the last realm, no forward realm to act in.
  "wisp-cat",
];

const KNOWN_EFFECTS = new Set<CombatEffectId>([
  "quiet-advance",
  "warm-light",
  "soul-banked",
  "soul-thrift",
  "ward-breach",
  "forgive-economy-miss",
  "unseal",
  "toll-strike",
  "bind-beat",
  "jam-foe",
  "auto-ease",
  "forgive-wave-miss",
  "mist-clear",
  "companion-trip",
]);

// ─── Coverage: the descriptor matches the design spec exactly ─────────────────

await suite("relicCombat: combat blocks match the canon assignment exactly", () => {
  // Every relic with a combat block is partitioned by the two spec lists, and
  // together they cover all 27 relics — so a new relic can't silently miss a
  // (deliberate) decision about its in-realm effect.
  const withCombat = RELIC_IDS.filter((id) => RELIC_EFFECTS[id]!.combat);
  assertEqual(withCombat.length, CANON_COMBAT.length, "22 relics carry a combat block");
  assertEqual(
    CANON_COMBAT.length + CANON_FINALE_ONLY.length,
    RELIC_IDS.length,
    "combat + finale-only partitions all relics",
  );

  for (const [id, kind, effect, defensive] of CANON_COMBAT) {
    const c = RELIC_EFFECTS[id]?.combat;
    assert(c !== undefined, `${id} should carry a combat block`);
    assertEqual(c!.kind, kind, `${id}.kind`);
    assertEqual(c!.effect, effect, `${id}.effect`);
    assertEqual(c!.defensive === true, defensive, `${id}.defensive`);
  }
  for (const id of CANON_FINALE_ONLY) {
    assert(
      RELIC_EFFECTS[id] !== undefined && RELIC_EFFECTS[id]!.combat === undefined,
      `${id} should stay finale-only (no combat block)`,
    );
  }
});

// ─── Descriptor invariants ────────────────────────────────────────────────────

await suite("relicCombat: every combat block is internally valid", () => {
  for (const id of RELIC_IDS) {
    const c = RELIC_EFFECTS[id]!.combat;
    if (!c) continue;
    assert(KNOWN_EFFECTS.has(c.effect), `${id}: unknown effect "${c.effect}"`);
    assert(
      c.announce.trim().length > 0,
      `${id}: combat effect must announce itself (legibility)`,
    );
    // defensive is a oncePerRealm-only flag.
    if (c.defensive) {
      assertEqual(c.kind, "oncePerRealm", `${id}: defensive only valid on oncePerRealm`);
    }
    // appliesIn (when set) must name real realms and be non-empty.
    if (c.appliesIn) {
      assert(c.appliesIn.length > 0, `${id}: appliesIn must be non-empty when set`);
      for (const realm of c.appliesIn) {
        assert(REALM_IDS.includes(realm), `${id}: appliesIn has unknown realm "${realm}"`);
      }
    }
  }
});

// ─── Resolver: the empty / neutral case ───────────────────────────────────────

await suite("resolveCombatLoadout: empty satchel → a neutral loadout", () => {
  const l = resolveCombatLoadout([], "sunken-bell");
  assertEqual(l.advanceMult, 1, "no slowdown");
  assertEqual(l.warmLight, 0, "no softening");
  assertEqual(l.soulBankedFraction, 0, "no banked soul");
  assertEqual(l.soulThriftMult, 1, "full spell price");
  assertEqual(l.gracePool, 0, "no saves");
  assertEqual(l.oneShots.length, 0, "no one-shots");
  assertEqual(l.perWaveProcs.length, 0, "no procs");
  assertEqual(l.announcements.length, 0, "nothing to announce");
});

// ─── Bounding rule 1: passives diminish to a cap ──────────────────────────────

await suite("resolveCombatLoadout: quiet-advance diminishes, monotonic, capped", () => {
  const one = resolveCombatLoadout(["hunters-horn"], "sunken-bell");
  const two = resolveCombatLoadout(["hunters-horn", "quiet-chant"], "sunken-bell");
  const three = resolveCombatLoadout(
    ["hunters-horn", "quiet-chant", "untethered-wind"],
    "sunken-bell",
  );
  assertClose(one.advanceMult, 1.075, 1e-6, "1 relic → +7.5%");
  assertClose(two.advanceMult, 1.1125, 1e-6, "2 relics → +11.25%");
  assertClose(three.advanceMult, 1.131, 1e-3, "3 relics → +13.1%");
  assert(one.advanceMult < two.advanceMult, "monotonic 1<2");
  assert(two.advanceMult < three.advanceMult, "monotonic 2<3 (no dead pickup)");
  assert(three.advanceMult <= 1.15 + 1e-9, "never breaches the +15% ceiling");
  // Order-independent (equal step per relic).
  const rev = resolveCombatLoadout(
    ["untethered-wind", "quiet-chant", "hunters-horn"],
    "sunken-bell",
  );
  assertClose(rev.advanceMult, three.advanceMult, 1e-9, "order-independent");
});

await suite("resolveCombatLoadout: warm-light only in vision-hazard realms", () => {
  const inBell = resolveCombatLoadout(["firefly-lantern"], "sunken-bell");
  assert(inBell.warmLight > 0, "firefly lantern softens Bell's dim");
  assert(inBell.warmLight <= 0.33 + 1e-9, "within the 33% ceiling");
  // Forge is NOT a vision-hazard realm — the same relic does nothing there.
  const inForge = resolveCombatLoadout(["firefly-lantern"], "clockwork-forge");
  assertEqual(inForge.warmLight, 0, "no softening in Forge (appliesIn excludes it)");
  assertEqual(inForge.announcements.length, 0, "and it doesn't announce there");
  // Three warm-light relics stack with diminishing returns, still capped.
  const all3 = resolveCombatLoadout(
    ["firefly-lantern", "beacon-spark", "pelt-of-the-old-one"],
    "sky-island",
  );
  assertClose(all3.warmLight, 0.33 * (1 - 0.5 ** 3), 1e-6, "3 → 28.9%");
  assert(all3.warmLight < 0.33, "still strictly under cap (never cancels the hazard)");
});

// ─── Passive soul effects ─────────────────────────────────────────────────────

await suite("resolveCombatLoadout: soul effects are binary and Forge-gated", () => {
  const banked = resolveCombatLoadout(["king-aurland"], "clockwork-forge");
  assertEqual(banked.soulBankedFraction, SOUL_BANKED_FRACTION, "king-aurland banks soul");
  assertEqual(banked.soulThriftMult, 1, "but no thrift");
  const thrift = resolveCombatLoadout(["bellows-hammer"], "clockwork-forge");
  assertEqual(thrift.soulThriftMult, SOUL_THRIFT_MULT, "bellows-hammer cheapens casts");
  assertEqual(thrift.soulBankedFraction, 0, "but no banking");
  const both = resolveCombatLoadout(["king-aurland", "bellows-hammer"], "clockwork-forge");
  assertEqual(both.soulBankedFraction, SOUL_BANKED_FRACTION, "both: banked");
  assertEqual(both.soulThriftMult, SOUL_THRIFT_MULT, "both: thrift");
  // Soul effects mean nothing in a realm with no casting economy (Bell/Sky/Wood)
  // — they must be INERT and SILENT there, never announcing a no-op to the kid.
  const inBell = resolveCombatLoadout(["king-aurland", "bellows-hammer"], "sunken-bell");
  assertEqual(inBell.soulBankedFraction, 0, "soul-banked inert outside the spell realm");
  assertEqual(inBell.soulThriftMult, 1, "soul-thrift inert outside the spell realm");
  assertEqual(inBell.announcements.length, 0, "and silent there");
});

// ─── Bounding rule 2: the shared grace pool ───────────────────────────────────

await suite("resolveCombatLoadout: defensive one-shots share a capped grace pool", () => {
  const one = resolveCombatLoadout(["lock-bar"], "sunken-bell");
  assertEqual(one.gracePool, 1, "one defensive relic → 1 save");
  assertEqual(one.oneShots.length, 0, "defensive relics don't appear as offensive one-shots");
  const two = resolveCombatLoadout(["lock-bar", "cairn-token"], "sunken-bell");
  assertEqual(two.gracePool, 2, "two → 2 saves");
  // THREE defensive relics (lock-bar + golem-heart + cairn-token), all universal
  // → still capped at GRACE_POOL_CAP, and only the first CAP announce.
  const three = resolveCombatLoadout(
    ["lock-bar", "golem-heart", "cairn-token"],
    "sunken-bell",
  );
  assertEqual(three.gracePool, GRACE_POOL_CAP, "three defensive → capped at the pool size");
  assertEqual(GRACE_POOL_CAP, 2, "pool cap is 2 (the approved 'moderate' setting)");
  assertEqual(
    three.announcements.length,
    GRACE_POOL_CAP,
    "a capped-out (inert) save does not announce",
  );
  // The Forge has no losable economy — grace saves protect nothing there, so
  // the same defensive satchel must resolve to an empty, silent pool.
  const inForge = resolveCombatLoadout(
    ["lock-bar", "golem-heart", "cairn-token"],
    "clockwork-forge",
  );
  assertEqual(inForge.gracePool, 0, "grace pool inert in the Forge (no economy)");
  assertEqual(inForge.announcements.length, 0, "and silent there");
});

await suite("resolveCombatLoadout: unseal is Sky-only and feeds the pool there", () => {
  const inBell = resolveCombatLoadout(["master-key"], "sunken-bell");
  assertEqual(inBell.gracePool, 0, "master-key is inert outside Sky");
  assertEqual(inBell.announcements.length, 0, "and silent there");
  const inSky = resolveCombatLoadout(["master-key"], "sky-island");
  assertEqual(inSky.gracePool, 1, "master-key grants a save in Sky");
  assertEqual(inSky.announcements.length, 1, "and announces it");
});

// ─── Offensive one-shots + per-wave procs ─────────────────────────────────────

await suite("resolveCombatLoadout: offensive one-shots are listed, not pooled", () => {
  const l = resolveCombatLoadout(
    ["bells-tongue", "tether-cord", "sabotage-wrench"],
    "haunted-wood",
  );
  assertEqual([...l.oneShots].sort(), ["bind-beat", "jam-foe", "toll-strike"], "all 3 one-shots");
  assertEqual(l.gracePool, 0, "offensive one-shots don't touch the grace pool");
});

await suite("resolveCombatLoadout: per-wave procs, with mist-clear Wood-gated", () => {
  // ettas-ledger + shrine-token are universal; wind-phrase only fires in Wood.
  const inBell = resolveCombatLoadout(
    ["ettas-ledger", "shrine-token", "wind-phrase"],
    "sunken-bell",
  );
  assertEqual(
    [...inBell.perWaveProcs].sort(),
    ["auto-ease", "forgive-wave-miss"],
    "wind-phrase absent outside Wood",
  );
  const inWood = resolveCombatLoadout(
    ["ettas-ledger", "shrine-token", "wind-phrase"],
    "haunted-wood",
  );
  assertEqual(
    [...inWood.perWaveProcs].sort(),
    ["auto-ease", "forgive-wave-miss", "mist-clear"],
    "wind-phrase fires in Wood",
  );
});

// ─── Unknown / finale-only ids contribute nothing ─────────────────────────────

await suite("resolveCombatLoadout: finale-only + unknown ids are inert", () => {
  const l = resolveCombatLoadout(
    ["trident-token", "ash-vial", "ghost-kings-promise", "not-a-real-relic"],
    "haunted-wood",
  );
  assertEqual(l.advanceMult, 1, "no passive");
  assertEqual(l.gracePool, 0, "no saves");
  assertEqual(l.oneShots.length, 0, "no one-shots");
  assertEqual(l.perWaveProcs.length, 0, "no procs");
  assertEqual(l.announcements.length, 0, "nothing announced");
});

// ─── The headline guarantee: a relic-rich run stays BOUNDED ───────────────────

await suite("resolveCombatLoadout: a maxed Wood satchel is helped, not invincible", () => {
  // Everything an in-Wood run could plausibly carry (Winter+Bell+Forge+Sky
  // relics + Wood's own shrine-token), incl. duplicates of each passive family
  // and a pile of defensive relics.
  const maxed = [
    // quiet-advance ×3
    "hunters-horn", "quiet-chant", "untethered-wind",
    // warm-light ×2 (applies in Wood)
    "firefly-lantern", "beacon-spark",
    // soul passives
    "king-aurland", "bellows-hammer",
    // defensive ×3 (only 2 should count)
    "lock-bar", "golem-heart", "cairn-token",
    // offensive + procs
    "bells-tongue", "tether-cord", "sabotage-wrench",
    "ettas-ledger", "shrine-token", "wind-phrase",
  ];
  const l = resolveCombatLoadout(maxed, "haunted-wood");
  assert(l.advanceMult > 1 && l.advanceMult <= 1.15 + 1e-9, "advance helped but ≤ +15%");
  assert(l.warmLight > 0 && l.warmLight < 0.33, "vision helped but hazard still bites");
  // Wood (like the Forge) has no losable economy, so grace is gated out — the
  // defensive relics helped in Bell/Sky earlier, not here.
  assertEqual(l.gracePool, 0, "grace inert in Wood (no economy to save)");
  // Wood has no casting economy → the soul relics are inert here (appliesIn gating).
  assertEqual(l.soulBankedFraction, 0, "soul-banked inert in Wood");
  assertEqual(l.soulThriftMult, 1, "soul-thrift inert in Wood");
  // Duplicating the whole satchel must not change a single bounded value.
  const doubled = resolveCombatLoadout([...maxed, ...maxed], "haunted-wood");
  assertEqual(doubled.advanceMult, l.advanceMult, "dup-proof: advance");
  assertEqual(doubled.warmLight, l.warmLight, "dup-proof: warm-light");
  assertEqual(doubled.gracePool, l.gracePool, "dup-proof: grace pool");
});
