// §5.5.11 categorization. The Quiet Lord's final-phase phrase is selected
// by which relics are in the satchel — "force" relics push the duel louder,
// "kindness" relics push it quieter, and a few specific pairings unlock
// their own phrases.
//
// Three relics from the spec haven't landed in v1: Lock-Bar (force),
// Quiet Chant (kindness), Ash-Vial (force). The "Master-Key + Quiet Chant"
// branch is therefore unreachable today — Default catches that satchel
// shape instead.

export const FORCE_RELICS: ReadonlySet<string> = new Set([
  "bells-tongue",
  "sabotage-wrench",
  "pelt-of-the-old-one",
  "beacon-spark",
  "golem-heart",
  "bone-flute",
  "tether-cord",
]);

export const KINDNESS_RELICS: ReadonlySet<string> = new Set([
  "hunters-horn",
  "firefly-lantern",
  "cairn-token",
  "trident-token",
  "bellows-hammer",
  "master-key",
  "ettas-ledger",
  "wind-phrase",
  "shrine-token",
  "ghost-kings-promise",
]);

export const COMPANION_IDS: readonly string[] = [
  "snow-fox-cub",
  "glass-fish",
  "brass-songbird",
  "lantern-moth",
  "wisp-cat",
];

/**
 * Pick the final phrase Wren types in Phase 3 of the Great Battle. Implements
 * the §5.5.11 composition matrix. Priority order matters — specific pairings
 * win over generic alignment counts; alignment counts win over the
 * Walked-Alone floor; Default catches everything else.
 */
export function selectFinalPhrase(satchel: readonly string[]): string {
  const has = (id: string): boolean => satchel.includes(id);
  const hasAnyCompanion = COMPANION_IDS.some(has);
  const forceCount = satchel.filter((id) => FORCE_RELICS.has(id)).length;
  const kindnessCount = satchel.filter((id) => KINDNESS_RELICS.has(id)).length;

  if (has("bells-tongue") && has("hunters-horn")) {
    return "by horn and toll, the old silence breaks.";
  }
  if (hasAnyCompanion && has("ghost-kings-promise")) {
    return "by friend and ghost, you are sealed.";
  }
  if (kindnessCount >= 3) {
    return "by mercy alone, you are answered.";
  }
  if (forceCount >= 3) {
    return "by force you came; by force you go.";
  }
  if (satchel.length === 0) {
    return "i came alone. i speak alone. you end.";
  }
  return "by word and breath, you are bound.";
}
