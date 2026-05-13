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
 * Pick `count` distinct words from `bank`, preferring ones that contain any
 * of the player's struggle letters. Falls back to random selection when no
 * stats exist yet or no preferred words are available.
 */
export function pickAdaptiveWords(
  bank: readonly string[],
  count: number,
  stats: Readonly<Record<string, KeyStat>>,
): string[] {
  const struggleLetters = findStruggleLetters(stats);
  const shuffled = shuffle(bank);

  if (struggleLetters.size === 0) {
    return shuffled.slice(0, count);
  }

  const preferred: string[] = [];
  const fallback: string[] = [];
  for (const word of shuffled) {
    if (containsAny(word, struggleLetters)) preferred.push(word);
    else fallback.push(word);
    if (preferred.length >= count) break;
  }

  return [...preferred, ...fallback].slice(0, count);
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
