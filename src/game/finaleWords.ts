/** Complete, realm-appropriate words the Wrench can leave in an echo's place.
 * Shortening saves exactly one keystroke; it never produces fragments such as
 * "sno" or "forg". A short word without a safe replacement stays intact. */
export const FINALE_SHORT_WORDS: Readonly<Record<string, readonly string[]>> = {
  "winter-mountain": [
    "ash", "den", "fur", "ice", "icy", "owl", "paw", "sky", "sun",
    "snow", "cold", "wind", "moon", "claw", "fang", "pine", "peak", "mist", "pelt", "dusk", "calm",
    "frost", "drift", "trail", "cliff", "north", "brisk", "swift", "chill", "growl", "ridge",
    "winter", "frozen", "icicle", "powder", "bitter", "breath", "shiver",
    "glacier", "crystal", "blizzard",
  ],
  "sunken-bell": [
    "sea", "ebb", "oar", "wet", "dim",
    "tide", "salt", "hush", "bell", "deep", "toll", "sink", "reef", "wave", "calm", "dark", "peal", "ring",
    "swell", "creep", "choir", "knell", "drown", "brine", "shore", "chime", "chant", "drift",
    "anchor", "chapel", "sunken", "lagoon", "harbor", "fathom", "sorrow",
    "current", "clapper", "drowned", "silence", "undertow", "cathedral",
  ],
  "clockwork-forge": [
    "ash", "ore", "nut", "bar", "rod", "tin",
    "iron", "bolt", "gear", "coil", "mold", "flux", "weld", "soot", "fire", "heat", "wire", "nail", "pipe", "grit",
    "forge", "brass", "crank", "smelt", "rivet", "valve", "press", "shaft", "drill", "brace", "anvil", "lathe", "wedge", "pivot", "grind", "stamp",
    "piston", "hammer", "copper", "bronze", "washer", "spring", "bellows", "ratchet", "furnace", "clockwork",
  ],
  "sky-island": [
    "ink", "sky", "air", "dew", "ray",
    "book", "page", "lamp", "glow", "wind", "star", "beam", "loft", "mist", "warm",
    "flame", "light", "spark", "shine", "gleam", "paper", "ember", "cloud", "tower", "stone",
    "scroll", "beacon", "reader", "temple", "ascent", "bright", "kindle", "letter",
    "lantern", "scholar", "shimmer", "glimmer", "whisper", "radiant", "written",
    "kindling", "devotion", "floating", "twilight", "drifting", "parchment",
  ],
  "haunted-wood": [
    "howl", "drift", "pale", "wail", "cold", "linger", "grey", "hollow", "whisper", "fading",
    "ancient", "still", "hush", "mist", "dusk", "shade", "creep", "gloom", "haunt", "wisp",
    "eerie", "moan", "dread", "silent", "shroud", "wander", "vanish", "echo", "lament",
  ],
};

function sharedLetters(word: string, candidate: string): number {
  return [...new Set(candidate)].filter((letter) => word.includes(letter)).length;
}

function matchCase(word: string, candidate: string): string {
  if (word === word.toUpperCase()) return candidate.toUpperCase();
  if (/^[A-Z][a-z]*[.,?!;:]?$/.test(word)) return candidate[0]!.toUpperCase() + candidate.slice(1);
  return candidate;
}

/** Keep distinct enemies distinct, including originals another echo may retain.
 * Prefer an existing complete prefix (especially Wood's removable end mark),
 * then shared initial/letters to retain as much adaptive practice as possible.
 * Unknown realms and mixed-case command words safely retain their originals. */
export function shortenFinaleWords(words: readonly string[], realmId = ""): string[] {
  const pool = Object.hasOwn(FINALE_SHORT_WORDS, realmId) ? FINALE_SHORT_WORDS[realmId]! : [];
  const originals = new Set(words.map((word) => word.toLowerCase()));
  const used = new Set<string>();
  return words.map((word) => {
    const lower = word.toLowerCase();
    const mixedCase = word !== lower && word !== word.toUpperCase() && !/^[A-Z][a-z]*[.,?!;:]?$/.test(word);
    const candidates = mixedCase ? [] : pool
      .filter((candidate) => candidate.length >= 2 && candidate.length === word.length - 1)
      .map((candidate, index) => ({ candidate, index, score:
        (lower.slice(0, -1) === candidate ? 100 : 0) +
        (lower[0] === candidate[0] ? 8 : 0) + sharedLetters(lower, candidate),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const replacement = candidates.find(({ candidate }) =>
      !used.has(candidate) && !originals.has(candidate))?.candidate;
    const result = replacement ? matchCase(word, replacement) : word;
    used.add(result.toLowerCase());
    return result;
  });
}
