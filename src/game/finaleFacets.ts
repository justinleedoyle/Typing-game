// §5.5.11 Phase 2 — "the Lord channels facets of the minions Wren overcame."
//
// Each CLEARED realm contributes ONE facet to the duel. A facet is telegraphed;
// if the satchel holds a countering relic the facet is NEUTRALIZED (skipped),
// otherwise Wren must survive a timed defense — failing it snuffs a candle (the
// counter-loadout stake, per the user's "risk a candle" decision). Because an
// uncountered facet is a *survivable* challenge and not an auto-loss, a
// zero-relic "Walked Alone" run that has cleared every realm still faces all
// five facets but can pass each by clean typing → the run stays winnable.
//
// Pure/Phaser-free so the resolution is unit-testable. The facet→counter
// mapping lives HERE (co-located with the facet data) rather than as a
// `countersFacet` field on RELIC_EFFECTS: it's finale-specific, and keeping it
// off the shared relicEffects descriptor both avoids a circular import and keeps
// the mapping defined exactly once.

export type FacetId = "cold" | "toll" | "armor" | "light" | "grief";

export interface Facet {
  id: FacetId;
  /** The cleared realm that contributes this facet. */
  realmId: string;
  /** Spoken name — "the Cold". */
  name: string;
  /** Word Wren types to survive the facet when it ISN'T countered. */
  defenseWord: string;
  /** Relics that neutralize this facet (any one suffices). May include a
   *  companion — the lantern-moth answers the Blinding Light (§5.5.9). */
  counteredBy: readonly string[];
}

/** Canon realm order (matches the Phase-1 wave order) so facets telegraph in a
 *  stable, learnable sequence run-to-run. */
export const FACET_ORDER: readonly string[] = [
  "winter-mountain",
  "sunken-bell",
  "clockwork-forge",
  "sky-island",
  "haunted-wood",
];

export const REALM_FACETS: Record<string, Facet> = {
  "winter-mountain": {
    id: "cold",
    realmId: "winter-mountain",
    name: "the Cold",
    defenseWord: "endure",
    counteredBy: ["pelt-of-the-old-one"], // canon-exact (§5.5.11)
  },
  "sunken-bell": {
    id: "toll",
    realmId: "sunken-bell",
    name: "the Toll",
    defenseWord: "steady",
    counteredBy: ["bells-tongue", "lock-bar"],
  },
  "clockwork-forge": {
    id: "armor",
    realmId: "clockwork-forge",
    name: "the Armor",
    defenseWord: "pierce",
    counteredBy: ["sabotage-wrench", "master-key"],
  },
  "sky-island": {
    id: "light",
    realmId: "sky-island",
    name: "the Blinding Light",
    defenseWord: "shield",
    counteredBy: ["lantern-moth", "beacon-spark"],
  },
  "haunted-wood": {
    id: "grief",
    realmId: "haunted-wood",
    name: "the Grief",
    defenseWord: "answer",
    counteredBy: ["ghost-kings-promise", "bone-flute"],
  },
};

export interface FacetResolution {
  facet: Facet;
  /** The satchel relic that neutralizes this facet, or null if none — null
   *  means Wren must survive the timed defense (a candle at risk). */
  counteredBy: string | null;
}

/** Resolve the Phase-2 facet line-up: one facet per cleared realm (in canon
 *  order), each marked countered (by which relic) or not. Pure. */
export function resolveFacets(
  clearedRealmIds: readonly string[],
  satchel: readonly string[],
): FacetResolution[] {
  const cleared = new Set(clearedRealmIds);
  const owned = new Set(satchel);
  const out: FacetResolution[] = [];
  for (const realmId of FACET_ORDER) {
    if (!cleared.has(realmId)) continue;
    const facet = REALM_FACETS[realmId];
    if (!facet) continue;
    const counter = facet.counteredBy.find((id) => owned.has(id)) ?? null;
    out.push({ facet, counteredBy: counter });
  }
  return out;
}
