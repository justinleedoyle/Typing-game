// The single source of truth for what each relic *means* — its §5.5.11 duel
// alignment and whether it's a tamed creature (§5.5.9). This is the "Phase-0
// bridge": both the finale (Tier 3) and relics-live-in-combat (Tier 4) read
// relic semantics from HERE, so the meaning of a relic is encoded exactly once.
//
// Design rules for this descriptor:
//   • It carries IDENTITY (alignment, companion-ness), not Phaser BEHAVIOR.
//     The finale's animations/timers and (later) the in-realm combat effects
//     are CONSUMERS — they switch on these stable facts, they don't redefine
//     them. That's what keeps the semantics in one place.
//   • It does NOT duplicate data that already lives in RELICS (relics.ts) —
//     `realmId`, name, flavor stay there; consumers join by id. The
//     completeness test asserts the two maps key-match exactly.
//   • It is FREEZE-EXTENSIBLE: later tiers add fields to RelicEffect (e.g. the
//     counter-loadout's `countersFacet`, or a Tier-4 `combat` block) IN THIS
//     FILE rather than re-deriving relic meaning at the call site.
//
// `getActiveRelicEffects(satchel)` is the aggregator: hand it the satchel and
// it resolves the counts/flags a scene needs in one shot, so consumers stop
// scattering `satchel.includes(...)` across phases.

import { RELICS } from "./relics";

/** §5.5.11 — a relic pushes the duel "louder" (force) or "quieter" (kindness).
 *  Companions and the two pure-utility allies (king-aurland, untethered-wind)
 *  are "neutral": they sit off the force/kindness axis. */
export type RelicAlignment = "force" | "kindness" | "neutral";

// ─── Tier 4: in-realm combat effects ─────────────────────────────────────────
//
// A relic may carry an in-realm combat effect so the CYOA collection doubles as
// a build choice (Tier 4). Effects are DECLARED here and CONSUMED by the realm
// scenes — the descriptor names the effect + where it applies; the scene
// switches on `effect` to apply Phaser behavior. All tuning numbers (per-relic
// step, caps, grace-pool size, soul amounts) live in the resolver below, so the
// math is in ONE place and the descriptor stays purely declarative.

export type CombatEffectId =
  | "quiet-advance"        // passive: enemies close slower (capped)
  | "warm-light"           // passive: a vision hazard (dim/blur/mist) softens
  | "soul-banked"          // passive: each wave starts with banked Soul
  | "soul-thrift"          // passive: modifier-spells cost less Soul
  | "ward-breach"          // 1-shot (defensive): survive one enemy reaching Wren
  | "forgive-economy-miss" // 1-shot (defensive): forgive one realm-economy loss
  | "unseal"               // 1-shot (defensive): forgive one Sky sealed-scroll reseal
  | "toll-strike"          // 1-shot (offensive): clear the hardest live enemy
  | "bind-beat"            // 1-shot (offensive): freeze all enemies briefly
  | "jam-foe"              // 1-shot (offensive): disable the hardest enemy
  | "auto-ease"            // per-wave: pre-mark the easiest enemy at wave start
  | "forgive-wave-miss"    // per-wave: forgive the first miss of each wave
  | "mist-clear"           // per-wave: the mist lifts briefly each wave (Wood)
  | "companion-trip";      // per-wave: the snow-fox trips the most-advanced foe

/** The three KINDS the whole vocabulary reduces to (the brief's
 *  passive / one-shot / per-wave proc). */
export type CombatEffectKind = "passive" | "oncePerRealm" | "perWaveProc";

export interface RelicCombatEffect {
  kind: CombatEffectKind;
  effect: CombatEffectId;
  /** Realm ids where this effect is meaningful AND wired. Omit ⇒ every realm
   *  (a universal effect). A realm-specific effect lists only realms wired this
   *  initiative, so the resolver never hands a scene an effect it can't honor
   *  (which would announce a relic doing nothing). */
  appliesIn?: readonly string[];
  /** oncePerRealm only: a "save" that feeds the shared per-realm grace pool
   *  (capped) instead of being its own button. Ignored for other kinds. */
  defensive?: boolean;
  /** One short, player-facing line surfaced on realm entry so a kid sees the
   *  relic working — the build choice has to be legible. */
  announce: string;
}

export interface RelicEffect {
  /** Which way this relic tips the Phase-2 duel (§5.5.11). Companions are
   *  "neutral" — they pay off on their own §5.5.9 axis, not the duel-shape one. */
  alignment: RelicAlignment;
  /** True for a tamed creature (§5.5.9), not a relic-proper. Companions drive
   *  the per-phase companion payoffs and the "any creature" phrase branches;
   *  they are mutually exclusive with force/kindness alignment. */
  isCompanion: boolean;
  /** Tier 4 — the relic's in-realm combat effect, if any. Relics without one
   *  are finale-only flavor (trident-token, ash-vial, bone-flute,
   *  ghost-kings-promise, and the five companions). */
  combat?: RelicCombatEffect;
}

// ─── The descriptor ──────────────────────────────────────────────────────────
//
// One entry per id in RELICS. Alignment values are the canon §5.5.11 lists
// (force: 9, kindness: 11) + the 5 §5.5.9 companions + 2 neutral allies
// (king-aurland = +spell-charge, untethered-wind = slow-advance). The
// completeness + canon-match tests in tests/relicEffects.test.ts lock these
// against RELICS and against the §5.5.11 alignment lists.

// Realms whose signature hazard is a VISION one (Bell's echo-dim, Sky's
// lantern-blur, Wood's mist-roll) that `warm-light` softens. Winter's snow-drift
// qualifies thematically too, but Winter is realm 1 (no relics yet) and isn't
// wired this initiative, so it's left off (appliesIn ⟺ wired).
const VISION_HAZARD_REALMS = [
  "sunken-bell",
  "sky-island",
  "haunted-wood",
] as const;

// Realms with a real Soul-spell CASTING economy (spendSoul/canCast), the only
// place `soul-banked` / `soul-thrift` mean anything — elsewhere Soul just fills a
// cosmetic meter, so announcing a soul effect there would be a lie. Winter has
// the richest cast economy too, but it's realm 1 (no relics yet) and isn't wired
// this initiative (appliesIn ⟺ wired). Bell / Sky / Wood have NO casts.
const SPELL_ECONOMY_REALMS = ["clockwork-forge"] as const;

// Realms with a LOSABLE combat economy a defensive "save" can absorb: Bell's
// air-gasp and Sky's sealed-scroll reseal. The Forge AND the Wood are excluded
// — an enemy reaching Wren there just knocks back and re-engages (no resource to
// lose), so a grace save would protect nothing and announcing one would be a
// lie. Winter (candles) qualifies but is realm 1 / not wired this initiative.
const GRACE_REALMS = ["sunken-bell", "sky-island"] as const;

export const RELIC_EFFECTS: Record<string, RelicEffect> = {
  // ─── Winter Mountain ───────────────────────────────────────────────────────
  "hunters-horn": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "quiet-advance",
      announce: "the huntress's horn sounds — they come slower.",
    },
  },
  "firefly-lantern": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "warm-light",
      appliesIn: VISION_HAZARD_REALMS,
      announce: "the firefly lantern steadies your sight.",
    },
  },
  "cairn-token": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "forgive-economy-miss",
      appliesIn: GRACE_REALMS,
      defensive: true,
      announce: "the cairn token forgives one slip.",
    },
  },
  "pelt-of-the-old-one": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "warm-light",
      appliesIn: VISION_HAZARD_REALMS,
      announce: "the old one's pelt keeps the cold dark back.",
    },
  },
  // snow-fox darted in and tripped a charging minion in the duel; in-realm it
  // does the same once a wave — knocks the most-advanced foe back. Only the
  // MovingWordEnemy realms it can reach forward (the Sky's banners have no
  // knock-back); Winter is where it's earned, so it never acts there forward.
  "snow-fox-cub": {
    alignment: "neutral",
    isCompanion: true,
    combat: {
      kind: "perWaveProc",
      effect: "companion-trip",
      appliesIn: ["sunken-bell", "clockwork-forge", "haunted-wood"],
      announce: "the snow-fox runs with you — it trips the nearest foe each wave.",
    },
  },

  // ─── Sunken Bell ───────────────────────────────────────────────────────────
  "quiet-chant": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "quiet-advance",
      announce: "old olin's chant settles the air — they come slower.",
    },
  },
  "lock-bar": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "ward-breach",
      appliesIn: GRACE_REALMS,
      defensive: true,
      announce: "the lock-bar holds once when they break through.",
    },
  },
  // king-aurland: full merfolk army / +1 spell charge per wave — pure utility,
  // off the force/kindness axis. In-realm: a wave starts with banked Soul.
  "king-aurland": {
    alignment: "neutral",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "soul-banked",
      appliesIn: SPELL_ECONOMY_REALMS,
      announce: "king aurland's tide gives you an early spell.",
    },
  },
  "trident-token": { alignment: "kindness", isCompanion: false },
  "bells-tongue": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "toll-strike",
      announce: "the bell's tongue can strike the strongest foe, once.",
    },
  },
  // The tamed creatures (§5.5.9) earn their keep in the finale, but four of the
  // five also help IN-REALM, each effect paralleling its finale role — a relic-
  // grade companion that does something a kid can see. glass-fish lit the dark
  // corridor in the duel; in-realm it feeds the (capped) warm-light pool.
  "glass-fish": {
    alignment: "neutral",
    isCompanion: true,
    combat: {
      kind: "passive",
      effect: "warm-light",
      appliesIn: VISION_HAZARD_REALMS,
      announce: "the glass-fish lights the dark water — your sight steadies.",
    },
  },

  // ─── Clockwork Forge ───────────────────────────────────────────────────────
  "bellows-hammer": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "soul-thrift",
      appliesIn: SPELL_ECONOMY_REALMS,
      announce: "forn's hammer makes your spells cost less.",
    },
  },
  "sabotage-wrench": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "jam-foe",
      announce: "the sabotage wrench can jam the strongest foe, once.",
    },
  },
  "master-key": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "unseal",
      appliesIn: ["sky-island"],
      defensive: true,
      announce: "the master key reopens what reseals on you, once.",
    },
  },
  // brass-songbird "sings one note and the golems stop and listen" (its flavor +
  // finale stall-hint). In-realm that reads as a (capped) quiet-advance — foes
  // slow to listen. quiet-advance is universal, so no appliesIn; it's naturally
  // forward-limited to the Sky + Wood by when the songbird is earned (the Forge).
  "brass-songbird": {
    alignment: "neutral",
    isCompanion: true,
    combat: {
      kind: "passive",
      effect: "quiet-advance",
      announce: "the brass songbird sings — they slow to listen.",
    },
  },
  "golem-heart": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "ward-breach",
      appliesIn: GRACE_REALMS,
      defensive: true,
      announce: "the golem heart takes one blow meant for you.",
    },
  },

  // ─── Sky-Island of Lanterns ────────────────────────────────────────────────
  "ettas-ledger": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "perWaveProc",
      effect: "auto-ease",
      announce: "etta's ledger marks the easiest foe each wave.",
    },
  },
  "beacon-spark": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "warm-light",
      appliesIn: VISION_HAZARD_REALMS,
      announce: "the beacon spark burns through the gloom.",
    },
  },
  "wind-phrase": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "perWaveProc",
      effect: "mist-clear",
      appliesIn: ["haunted-wood"],
      announce: "the wind-phrase lifts the mist each wave.",
    },
  },
  "tether-cord": {
    alignment: "force",
    isCompanion: false,
    combat: {
      kind: "oncePerRealm",
      effect: "bind-beat",
      announce: "the tether cord can bind them all for a breath.",
    },
  },
  // untethered-wind: enemy banners fall / slower advance — pure utility, off
  // the force/kindness axis. In-realm: the same slow-advance, capped.
  "untethered-wind": {
    alignment: "neutral",
    isCompanion: false,
    combat: {
      kind: "passive",
      effect: "quiet-advance",
      announce: "the untethered wind drags at them — they come slower.",
    },
  },
  // lantern-moth lit the throne room in the duel; in-realm it joins the (capped)
  // warm-light pool. Earned in the Sky, so it pays off forward in the Wood.
  "lantern-moth": {
    alignment: "neutral",
    isCompanion: true,
    combat: {
      kind: "passive",
      effect: "warm-light",
      appliesIn: VISION_HAZARD_REALMS,
      announce: "the lantern-moth's wings glow — the dark pulls back.",
    },
  },

  // ─── Haunted Wood ──────────────────────────────────────────────────────────
  // ash-vial, bone-flute, ghost-kings-promise stay finale-only flavor (no
  // in-realm effect) — Wood is the last realm, so their in-realm payoff would
  // only ever land on a revisit; keeping the set bounded is deliberate.
  "ash-vial": { alignment: "force", isCompanion: false },
  "shrine-token": {
    alignment: "kindness",
    isCompanion: false,
    combat: {
      kind: "perWaveProc",
      effect: "forgive-wave-miss",
      announce: "the shrine forgives your first slip each wave.",
    },
  },
  "bone-flute": { alignment: "force", isCompanion: false },
  "ghost-kings-promise": { alignment: "kindness", isCompanion: false },
  "wisp-cat": { alignment: "neutral", isCompanion: true },
};

// ─── Derived alignment sets ──────────────────────────────────────────────────
//
// Built FROM the descriptor so there is one source of truth. relicAlignment.ts
// re-exports these (and selectFinalPhrase reads them), so the canon §5.5.11
// lists are no longer hand-maintained in two files.

function idsWhere(pred: (e: RelicEffect) => boolean): ReadonlySet<string> {
  return new Set(
    Object.entries(RELIC_EFFECTS)
      .filter(([, e]) => pred(e))
      .map(([id]) => id),
  );
}

export const FORCE_RELICS: ReadonlySet<string> = idsWhere(
  (e) => e.alignment === "force",
);
export const KINDNESS_RELICS: ReadonlySet<string> = idsWhere(
  (e) => e.alignment === "kindness",
);
export const COMPANION_IDS: readonly string[] = Object.entries(RELIC_EFFECTS)
  .filter(([, e]) => e.isCompanion)
  .map(([id]) => id);

// ─── Aggregator ──────────────────────────────────────────────────────────────

/** §5.5.11 threshold: ≥3 same-alignment relics tips the duel's whole shape
 *  (louder & cracking, or quieter & shrinking). */
export const DUEL_ALIGNMENT_THRESHOLD = 3;

export interface ActiveRelicEffects {
  /** The satchel as a set, deduped, with unknown ids dropped. */
  readonly ids: ReadonlySet<string>;
  /** Convenience membership test (unknown ids → false). */
  has(id: string): boolean;
  readonly forceCount: number;
  readonly kindnessCount: number;
  readonly companionCount: number;
  readonly hasCompanion: boolean;
  /** ≥ DUEL_ALIGNMENT_THRESHOLD force relics — the duel goes louder (§5.5.11). */
  readonly isForceDuel: boolean;
  /** ≥ DUEL_ALIGNMENT_THRESHOLD kindness relics — the duel goes quieter
   *  (§5.5.11). Both can be true at once (a big mixed satchel); consumers that
   *  must pick ONE resolve kindness-first to match selectFinalPhrase. */
  readonly isKindnessDuel: boolean;
  /** The degenerate case (§5.5.11 / §5.5.9): no relics AND no creature. This
   *  MUST stay a first-class, WINNABLE outcome with the "Walked Alone" tone —
   *  it is the case most likely to break when the satchel reading is reworked. */
  readonly isWalkedAlone: boolean;
}

/** Resolve a satchel into the aggregate counts/flags a scene reads in one shot.
 *  Unknown ids (defensive — a stale save, a renamed relic) are ignored for the
 *  alignment/companion counts but still tracked in `ids`, so `has()` stays
 *  truthful. Pure: no Phaser, fully unit-testable. */
export function getActiveRelicEffects(
  satchel: readonly string[],
): ActiveRelicEffects {
  const ids = new Set(satchel);
  let forceCount = 0;
  let kindnessCount = 0;
  let companionCount = 0;
  for (const id of ids) {
    const effect = RELIC_EFFECTS[id];
    if (!effect) continue;
    if (effect.alignment === "force") forceCount += 1;
    else if (effect.alignment === "kindness") kindnessCount += 1;
    if (effect.isCompanion) companionCount += 1;
  }
  return {
    ids,
    has: (id: string) => ids.has(id),
    forceCount,
    kindnessCount,
    companionCount,
    hasCompanion: companionCount > 0,
    isForceDuel: forceCount >= DUEL_ALIGNMENT_THRESHOLD,
    isKindnessDuel: kindnessCount >= DUEL_ALIGNMENT_THRESHOLD,
    // Walked Alone is keyed on an EMPTY satchel, not on alignment counts:
    // "no allies, no creature" (§5.5.11). Length, not membership, so a satchel
    // holding only unknown/legacy ids is NOT mistaken for Walked Alone.
    isWalkedAlone: satchel.length === 0,
  };
}

/** Every relic in RELICS must have a descriptor entry (and vice versa). Exposed
 *  so the test can assert completeness against the canonical relic catalogue. */
export const RELIC_IDS: readonly string[] = Object.keys(RELICS);

// ─── Tier 4 aggregator: the in-realm combat loadout ──────────────────────────
//
// resolveCombatLoadout(satchel, realmId) is a realm scene's single entry point
// for "what do my relics do in THIS realm" — the in-combat sibling of
// getActiveRelicEffects. It OWNS the bounding (the finale's lesson: additive-only
// trivializes; a relic-rich run must be HELPED, not made invincible). All the
// tuning lives here so the descriptor stays declarative and the caps sit in one
// auditable place.

/** Passive ceilings + per-relic diminishing step. `step` is the fraction of the
 *  REMAINING gap to `cap` that each owned relic closes — equal for every relic
 *  of an effect, so the total is order-independent and a 3rd relic still does
 *  something (no dead pickups) while the cap is never breached. */
const PASSIVE_TUNING: Record<string, { step: number; cap: number }> = {
  // 1 relic → +7.5%, 2 → +11.25%, 3 → +13.1% advance duration; ceiling +15%.
  "quiet-advance": { step: 0.5, cap: 0.15 },
  // 1 → 16.5%, 2 → 24.75%, 3 → 28.9% softening; ceiling 33% — the hazard always
  // still bites (protects the Tier 1 work that made it demanding).
  "warm-light": { step: 0.5, cap: 0.33 },
};

/** soul-banked: fraction of SOUL_MAX pre-poured at each wave start (king-aurland). */
export const SOUL_BANKED_FRACTION = 0.25;
/** soul-thrift: spell-cost multiplier — casts cost this × the base SPELL_COST
 *  (bellows-hammer). */
export const SOUL_THRIFT_MULT = 0.8;
/** The shared per-realm grace-pool ceiling for DEFENSIVE one-shots. The single
 *  lever that stops a protection-stacked satchel from going invulnerable: own
 *  four "save me" relics, still get only this many saves per realm. */
export const GRACE_POOL_CAP = 2;
/** Soul a player must bank before an OFFENSIVE one-shot (toll-strike / bind-beat
 *  / jam-foe) lights, and the amount firing it spends — the keyboard-native
 *  invocation is gated on the same clean-typing economy that fuels spells, so an
 *  offensive relic is *charged*, not free. Kept SEPARATE from SPELL_COST (and
 *  unaffected by soul-thrift): it's a relic invocation, not a modifier-spell, and
 *  it must mean the same thing in Bell/Sky/Wood, which have no spell casts. Below
 *  SOUL_MAX (100) so a full charge is reachable in one clean run. Tune on live. */
export const ONESHOT_SOUL_COST = 60;
/** bind-beat (tether-cord) — how long every live foe is frozen by one cast. A
 *  breather to catch up, not a kill: long enough to clear a word or two, short
 *  enough that the wave resumes its pressure. Tune on the live build. */
export const BIND_BEAT_FREEZE_MS = 3000;
/** companion-trip (snow-fox) — how long after a wave starts the fox darts in to
 *  trip the most-advanced foe. A short delay so a foe has begun its approach
 *  (and attached its word) before the trip lands. Tune on the live build. */
export const COMPANION_TRIP_DELAY_MS = 3500;

export interface CombatLoadout {
  /** Multiply an enemy's advance DURATION by this (≥1 ⇒ slower). 1 = no change. */
  readonly advanceMult: number;
  /** Vision-hazard softening fraction, 0..warm-light cap. 0 = no change. */
  readonly warmLight: number;
  /** Fraction of SOUL_MAX to pre-bank at each wave start. 0 = none. */
  readonly soulBankedFraction: number;
  /** Spell-cost multiplier (<1 ⇒ cheaper). 1 = full price. */
  readonly soulThriftMult: number;
  /** Defensive "saves" available this realm (the grace pool), 0..GRACE_POOL_CAP.
   *  What a save protects against is the REALM's call (a candle / a breath / a
   *  reseal), not the relic's — the relic only grants the save. */
  readonly gracePool: number;
  /** Offensive single-use effects available this realm (each fired once). */
  readonly oneShots: readonly CombatEffectId[];
  /** Per-wave procs active this realm. */
  readonly perWaveProcs: readonly CombatEffectId[];
  /** One line per ACTIVE effect (a capped-out save doesn't announce) — scenes
   *  surface these on entry so the build choice is visible. */
  readonly announcements: readonly string[];
  /** Relic ids whose effect is active here but is NOT an offensive one-shot —
   *  the "always on" satchel contents the console band shows as icons. One-shots
   *  are excluded (they get their own charge cards). */
  readonly passiveRelicIds: readonly string[];
}

function effectAppliesIn(combat: RelicCombatEffect, realmId: string): boolean {
  return combat.appliesIn === undefined || combat.appliesIn.includes(realmId);
}

/** Diminishing-returns total: `count` relics each closing `step` of the gap to
 *  `cap`. Monotonic, bounded by `cap`, order-independent. */
function diminishingTotal(count: number, step: number, cap: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += (cap - total) * step;
  return total;
}

/** Resolve the satchel into the BOUNDED set of in-combat effects active in
 *  `realmId`. Pure (no Phaser) so it's unit-testable. Unknown ids and effects
 *  whose `appliesIn` excludes this realm contribute nothing; duplicates collapse
 *  (a Set), so a stale double-entry can't inflate the pool. */
export function resolveCombatLoadout(
  satchel: readonly string[],
  realmId: string,
): CombatLoadout {
  const ids = new Set(satchel);
  const passiveCounts: Record<string, number> = {};
  let soulBanked = false;
  let soulThrift = false;
  let defensiveSaves = 0;
  const oneShots: CombatEffectId[] = [];
  const perWaveProcs: CombatEffectId[] = [];
  const announcements: string[] = [];
  const passiveRelicIds: string[] = [];

  for (const id of ids) {
    const combat = RELIC_EFFECTS[id]?.combat;
    if (!combat) continue;
    if (!effectAppliesIn(combat, realmId)) continue;

    let active = true;
    let isOneShot = false;
    switch (combat.kind) {
      case "passive":
        if (combat.effect === "soul-banked") soulBanked = true;
        else if (combat.effect === "soul-thrift") soulThrift = true;
        else passiveCounts[combat.effect] = (passiveCounts[combat.effect] ?? 0) + 1;
        break;
      case "oncePerRealm":
        if (combat.defensive) {
          defensiveSaves += 1;
          // Past the cap an extra protective relic is inert HERE (it still helps
          // the finale) — so it neither adds a save nor announces.
          active = defensiveSaves <= GRACE_POOL_CAP;
        } else {
          oneShots.push(combat.effect);
          isOneShot = true;
        }
        break;
      case "perWaveProc":
        perWaveProcs.push(combat.effect);
        break;
    }
    if (active) {
      announcements.push(combat.announce);
      if (!isOneShot) passiveRelicIds.push(id);
    }
  }

  return {
    advanceMult:
      1 +
      diminishingTotal(
        passiveCounts["quiet-advance"] ?? 0,
        PASSIVE_TUNING["quiet-advance"].step,
        PASSIVE_TUNING["quiet-advance"].cap,
      ),
    warmLight: diminishingTotal(
      passiveCounts["warm-light"] ?? 0,
      PASSIVE_TUNING["warm-light"].step,
      PASSIVE_TUNING["warm-light"].cap,
    ),
    soulBankedFraction: soulBanked ? SOUL_BANKED_FRACTION : 0,
    soulThriftMult: soulThrift ? SOUL_THRIFT_MULT : 1,
    gracePool: Math.min(GRACE_POOL_CAP, defensiveSaves),
    oneShots,
    perWaveProcs,
    announcements,
    passiveRelicIds,
  };
}
