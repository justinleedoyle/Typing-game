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

export interface RelicEffect {
  /** Which way this relic tips the Phase-2 duel (§5.5.11). Companions are
   *  "neutral" — they pay off on their own §5.5.9 axis, not the duel-shape one. */
  alignment: RelicAlignment;
  /** True for a tamed creature (§5.5.9), not a relic-proper. Companions drive
   *  the per-phase companion payoffs and the "any creature" phrase branches;
   *  they are mutually exclusive with force/kindness alignment. */
  isCompanion: boolean;
}

// ─── The descriptor ──────────────────────────────────────────────────────────
//
// One entry per id in RELICS. Alignment values are the canon §5.5.11 lists
// (force: 9, kindness: 11) + the 5 §5.5.9 companions + 2 neutral allies
// (king-aurland = +spell-charge, untethered-wind = slow-advance). The
// completeness + canon-match tests in tests/relicEffects.test.ts lock these
// against RELICS and against the §5.5.11 alignment lists.

export const RELIC_EFFECTS: Record<string, RelicEffect> = {
  // ─── Winter Mountain ───────────────────────────────────────────────────────
  "hunters-horn": { alignment: "kindness", isCompanion: false },
  "firefly-lantern": { alignment: "kindness", isCompanion: false },
  "cairn-token": { alignment: "kindness", isCompanion: false },
  "pelt-of-the-old-one": { alignment: "force", isCompanion: false },
  "snow-fox-cub": { alignment: "neutral", isCompanion: true },

  // ─── Sunken Bell ───────────────────────────────────────────────────────────
  "quiet-chant": { alignment: "kindness", isCompanion: false },
  "lock-bar": { alignment: "force", isCompanion: false },
  // king-aurland: full merfolk army / +1 spell charge per wave — pure utility,
  // off the force/kindness axis.
  "king-aurland": { alignment: "neutral", isCompanion: false },
  "trident-token": { alignment: "kindness", isCompanion: false },
  "bells-tongue": { alignment: "force", isCompanion: false },
  "glass-fish": { alignment: "neutral", isCompanion: true },

  // ─── Clockwork Forge ───────────────────────────────────────────────────────
  "bellows-hammer": { alignment: "kindness", isCompanion: false },
  "sabotage-wrench": { alignment: "force", isCompanion: false },
  "master-key": { alignment: "kindness", isCompanion: false },
  "golem-heart": { alignment: "force", isCompanion: false },
  "brass-songbird": { alignment: "neutral", isCompanion: true },

  // ─── Sky-Island of Lanterns ────────────────────────────────────────────────
  "ettas-ledger": { alignment: "kindness", isCompanion: false },
  "beacon-spark": { alignment: "force", isCompanion: false },
  "wind-phrase": { alignment: "kindness", isCompanion: false },
  "tether-cord": { alignment: "force", isCompanion: false },
  // untethered-wind: enemy banners fall / slower advance — pure utility, off
  // the force/kindness axis.
  "untethered-wind": { alignment: "neutral", isCompanion: false },
  "lantern-moth": { alignment: "neutral", isCompanion: true },

  // ─── Haunted Wood ──────────────────────────────────────────────────────────
  "ash-vial": { alignment: "force", isCompanion: false },
  "shrine-token": { alignment: "kindness", isCompanion: false },
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
