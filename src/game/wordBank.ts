// Adaptive word selection.
//
// The Save store records hits/misses per typed letter. This module reads that
// data back and biases word selection toward the player's three weakest
// letters, so the wolves end up demanding the practice the player most needs.
//
// Early on (no data, or only a handful of keystrokes), behavior is uniform
// random — the bias only kicks in once a letter has enough samples to be
// statistically meaningful.

import type { KeyStat } from "./saveState";

/** Letters with fewer attempts than this don't get ranked yet. */
const MIN_SAMPLES = 5;
/** How many bottom-accuracy letters to treat as "struggle letters". */
const STRUGGLE_LETTER_COUNT = 3;

/**
 * Pick `count` distinct words from `bank`, preferring ones that contain any of
 * the player's struggle letters and (for a fast typist) ones that meet a target
 * minimum length. Falls back to random selection when no stats exist yet and no
 * length pressure is requested.
 *
 * `minLength` is the WaveDirector's speed-axis length bias: 0 (default) means no
 * length pressure. It is a soft preference, not a filter — if the bank can't
 * satisfy it the longest available words are simply favored, so small banks and
 * short words degrade gracefully. Struggle-letter practice is weighted above
 * length so the accuracy curriculum still dominates.
 */
export function pickAdaptiveWords(
  bank: readonly string[],
  count: number,
  stats: Readonly<Record<string, KeyStat>>,
  minLength = 0,
): string[] {
  const struggleLetters = findStruggleLetters(stats);
  const shuffled = shuffle(bank);

  // Fast path: no adaptivity requested at all.
  if (struggleLetters.size === 0 && minLength <= 0) {
    return shuffled.slice(0, count);
  }

  // Score each word, then take the top `count`. A struggle letter is worth more
  // than meeting the length target, so the curriculum bias ranks above the
  // speed-axis nudge; a word doing both ranks highest. V8's sort is stable, so
  // equal-scored words keep their shuffled order and selection stays varied.
  const scored = shuffled.map((word) => {
    let score = 0;
    if (struggleLetters.size > 0 && containsAny(word, struggleLetters)) score += 2;
    if (minLength > 0 && word.length >= minLength) score += 1;
    return { word, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((entry) => entry.word);
}

function findStruggleLetters(
  stats: Readonly<Record<string, KeyStat>>,
): Set<string> {
  const ranked = Object.entries(stats)
    .filter(([letter, s]) => /^[a-z]$/.test(letter) && s.hits + s.misses >= MIN_SAMPLES)
    .map(([letter, s]) => ({ letter, accuracy: s.hits / (s.hits + s.misses) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, STRUGGLE_LETTER_COUNT)
    // Only treat as "struggle" if accuracy is actually imperfect — a player
    // with 100% on every letter shouldn't have arbitrary letters pinned as
    // struggle just because they appear first in the sort.
    .filter((entry) => entry.accuracy < 0.95)
    .map((entry) => entry.letter);
  return new Set(ranked);
}

function containsAny(word: string, letters: ReadonlySet<string>): boolean {
  for (const ch of word) {
    if (letters.has(ch)) return true;
  }
  return false;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sunken Bell word bank — rhythm-friendly, alternation-heavy, bigram-rich.
 *  Shorter words for waves 1-2; all usable in beat-locked claiming. */
export const SUNKEN_BELL_WORD_BANK = [
  "tide", "salt", "still", "hush", "swell", "creep", "linger",
  "deep", "bell", "toll", "hymn", "choir", "knell", "drown",
  "sink", "slow", "drift", "murk", "brine", "ebb",
  "kelp", "reef", "pool", "wave", "calm", "rest", "dark",
  "hold", "keep", "heed", "fill",
] as const;

/** Sky-Island word bank — longer words (5-10 chars), sky/lantern/scholar theme.
 *  Used for the floating lantern-spirits and temple encounters. */
/** Sky-Island scrolling-phrase bank — full sentences (4–8 words) that
 *  ride on parchment banners drifting across the screen. Themed around
 *  the realm's signatures: lantern, sky, paper, scholar, beacon. Used by
 *  the 5 Temple encounters. The first encounter (Act 1) still uses
 *  short SKY_ISLAND_WORD_BANK words as a gentle ramp into phrase typing. */
export const SKY_ISLAND_PHRASE_BANK = [
  "the lantern remembers every page that ever lit",
  "soft light travels farther than loud thunder",
  "every book is a window to the sky",
  "the scholar's lamp burns long after dawn",
  "paper holds what stone forgets",
  "a quiet word can warm a cold tower",
  "the beacon waits for those still reading",
  "ink dries but the meaning stays",
  "old scrolls remember every reader's hand",
  "the wind carries names of those who listened",
  "kindness lights more lanterns than fire",
  "a page turned slowly outlasts a page burned fast",
] as const;

export const SKY_ISLAND_WORD_BANK = [
  "lantern",
  "gilded",
  "scroll",
  "shimmer",
  "beacon",
  "scholar",
  "breeze",
  "parchment",
  "kindling",
  "devotion",
  "ancient",
  "floating",
  "written",
  "passage",
  "glimmer",
  "ember",
  "tender",
  "whisper",
  "pillar",
  "ascend",
  "lofted",
  "reading",
  "canopy",
  "radiant",
  "twilight",
  "lanterns",
  "luminous",
  "peaceful",
  "drifting",
  "temple",
] as const;

/** Clockwork Forge word bank — short mechanical words, uppercase-friendly,
 *  good for shift/capital modifier curriculum. */
export const FORGE_WORD_BANK = [
  "forge",
  "brass",
  "iron",
  "bolt",
  "gear",
  "crank",
  "smelt",
  "rivet",
  "valve",
  "press",
  "shaft",
  "coil",
  "hinge",
  "drill",
  "brace",
  "anvil",
  "tong",
  "lathe",
  "wedge",
  "mold",
  "flux",
  "pivot",
  "grind",
  "stamp",
  "ratchet",
  "piston",
  "bellows",
  "weld",
  "ember",
  "soot",
] as const;

/** Haunted Wood word bank — words with punctuation marks, atmospheric and eerie.
 *  Used for ghost encounters; punctuation trains precision under pressure. */
export const HAUNTED_WOOD_WORD_BANK = [
  "howl,",
  "drift.",
  "pale?",
  "wail!",
  "cold;",
  "linger.",
  "grey,",
  "hollow.",
  "whisper,",
  "fading?",
  "ancient!",
  "still:",
  "hush,",
  "mist.",
  "dusk?",
  "shade!",
  "creep;",
  "gloom,",
  "haunt.",
  "wisp?",
  "eerie!",
  "moan,",
  "hollow;",
  "dread.",
  "silent?",
  "shroud,",
  "wander.",
  "vanish!",
  "echo;",
  "lament:",
] as const;

/** Haunted Wood compass: each direction is bound to one punctuation mark.
 *  Ghosts approaching from a given direction always wield that direction's
 *  punctuation — the player learns "the period comes from above" rather
 *  than memorizing a rule. Semicolon + colon are reserved for the
 *  Ghost-King's final passage (every-punctuation capstone). */
export type WoodDirection = "north" | "south" | "east" | "west";

export const WOOD_DIRECTION_PUNCTUATION: Record<WoodDirection, string> = {
  north: ".",
  south: "!",
  east: "?",
  west: ",",
};

export function woodWordsForDirection(dir: WoodDirection): readonly string[] {
  const punct = WOOD_DIRECTION_PUNCTUATION[dir];
  return HAUNTED_WOOD_WORD_BANK.filter((w) => w.endsWith(punct));
}

/** Winter-themed word bank for the wolf encounter. Short, lowercase,
 *  curriculum-friendly: spans the alphabet enough that adaptive selection
 *  has room to bias toward the player's struggle letters. */
export const WINTER_WORD_BANK = [
  "snow",
  "claw",
  "howl",
  "fang",
  "frost",
  "den",
  "pine",
  "cliff",
  "wind",
  "ice",
  "peak",
  "trail",
  "mist",
  "drift",
  "pelt",
  "brisk",
  "moon",
  "owl",
  "north",
  "calm",
  "dusk",
  "growl",
  "paw",
  "ash",
  "climb",
  "ridge",
  "breath",
  "hush",
  "fur",
  "swift",
] as const;
