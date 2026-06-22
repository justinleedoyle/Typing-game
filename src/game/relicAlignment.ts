// §5.5.11 categorization. The Quiet Lord's final-phase phrase is selected
// by which relics are in the satchel — "force" relics push the duel louder,
// "kindness" relics push it quieter, and a few specific pairings unlock
// their own phrases.
//
// The alignment/companion lists themselves now live in relicEffects.ts (the
// single source of truth shared with Tier 4). They're re-exported here so the
// finale's existing imports keep working and selectFinalPhrase reads them. The
// canon-match test asserts the derived sets still equal the §5.5.11 lists.

export {
  FORCE_RELICS,
  KINDNESS_RELICS,
  COMPANION_IDS,
} from "./relicEffects";

import { FORCE_RELICS, KINDNESS_RELICS, COMPANION_IDS } from "./relicEffects";

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
  if (has("master-key") && has("quiet-chant")) {
    return "by chant and key, you are kept.";
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
