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
  // Struggle letters are tracked lowercase, so compare case-insensitively —
  // otherwise the capitalized half of a mixed-case command word (e.g. the
  // "FORGE" in "reFORGE") would never match a struggle letter.
  for (const ch of word) {
    if (letters.has(ch.toLowerCase())) return true;
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
  // Sea + water
  "foam", "spray", "surge", "current", "ripple", "lagoon", "harbor",
  "shoal", "coral", "anchor", "shell", "pearl", "tidal", "marsh",
  "shore", "depths", "fathom", "abyss", "trench", "saline", "froth",
  "wash", "lap", "spume", "billow", "undertow", "eddy", "flood",
  // Bells + sound
  "ring", "peal", "chime", "clang", "echo", "song", "chant", "dirge",
  "tower", "rope", "clapper", "vespers", "matins", "carillon", "tone",
  "muffle", "silence", "tolling", "ringing", "pealing", "hollow",
  // Drowned cathedral
  "cathedral", "altar", "nave", "crypt", "vault", "arch", "stone",
  "pillar", "chapel", "candle", "shrine", "relic", "sunken", "ruined",
  "drowned", "flooded", "ancient", "sacred", "buried", "lost", "quiet",
  "weeping", "mourning", "grief", "sorrow", "fading", "gloom", "pale",
  "cold", "wet", "damp", "mossy", "barnacle", "rust", "decay", "weed",
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
  "the sky holds a lantern for every lost reader",
  "every lantern began as one small spark",
  "a single candle can light a thousand pages",
  "the brightest beacon was once a quiet flame",
  "wisdom drifts upward like warm lantern smoke",
  "the open book floats higher than the closed one",
  "a gentle reader keeps the whole tower aglow",
  "light spills from the pages of a patient mind",
  "the highest island holds the oldest stories",
  "a borrowed lantern still lights the long stair",
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
  // Lanterns + light
  "candle",
  "flame",
  "glow",
  "spark",
  "shine",
  "gleam",
  "bright",
  "aglow",
  "halo",
  "dawn",
  "sunrise",
  "daylight",
  "sunbeam",
  "glowing",
  "flicker",
  "blazing",
  "kindled",
  "warmth",
  "golden",
  "amber",
  // Books + reading
  "book",
  "page",
  "story",
  "verse",
  "letter",
  "library",
  "chapter",
  "reader",
  "writing",
  "wisdom",
  "lesson",
  "study",
  "learned",
  "ink",
  "quill",
  "binding",
  "margin",
  "knowledge",
  "memory",
  "telling",
  // Sky + sky-islands
  "sky",
  "cloud",
  "wind",
  "soaring",
  "above",
  "heights",
  "skyward",
  "island",
  "floated",
  "rising",
  "upward",
  "lofty",
  "airy",
  "drift",
  "gentle",
  "quiet",
  "serene",
  "tower",
  "spire",
  "stair",
  "bridge",
  "feather",
  "starlight",
  "moonlit",
  "evening",
  "horizon",
  "dawning",
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
  // Brass + metal
  "copper",
  "bronze",
  "steel",
  "metal",
  "alloy",
  "ingot",
  "plate",
  "sheet",
  "wire",
  "chain",
  "nail",
  "screw",
  "nut",
  "washer",
  "spring",
  "lever",
  "clamp",
  "vise",
  "file",
  "burnish",
  // Fire + heat
  "fire",
  "flame",
  "heat",
  "spark",
  "coal",
  "cinder",
  "ash",
  "blaze",
  "molten",
  "glowing",
  "searing",
  "scorch",
  "furnace",
  "kiln",
  "hearth",
  "fuel",
  "smoke",
  "steam",
  "boiler",
  "vent",
  // Gears + clockwork
  "cog",
  "wheel",
  "spoke",
  "axle",
  "gauge",
  "dial",
  "spindle",
  "turbine",
  "engine",
  "motor",
  "winch",
  "pulley",
  "cable",
  "rotor",
  "clockwork",
  "machine",
  "mechanism",
  "ticking",
  "winding",
  "spinning",
  // Smithing
  "hammer",
  "tongs",
  "mallet",
  "chisel",
  "punch",
  "quench",
  "temper",
  "harden",
  "shaping",
  "casting",
  "molding",
  "welding",
  "riveting",
  "forging",
  "smithy",
  "craft",
  "labor",
  "strike",
  "shape",
  "build",
] as const;

/** Clockwork Forge COMMAND bank — mixed-case mid-word commands for the golem
 *  encounters (canon §5.5.8: "three escalating golem encounters that demand
 *  Shift-switching mid-word"). Each word is a lowercase head + a CAPITALIZED
 *  imperative tail: the golem only obeys when the capitals are typed with Shift,
 *  so completing one *requires* a clean mid-word Shift-switch. Used with
 *  `caseSensitive: true` targets (required typing → free, never Soul-gated).
 *  Themed: commands that reshape or subdue the brass. */
export const FORGE_COMMAND_BANK = [
  "reFORGE",
  "igNITE",
  "disARM",
  "unBIND",
  "temPER",
  "harDEN",
  "anNEAL",
  "solDER",
  "quenCH",
  "reCAST",
  "unSEAL",
  "grIND",
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

/** Ghost base words — no punctuation. A ghost's typeable word is built by
 *  inserting the approach direction's ward mark into the MIDDLE of one of these
 *  (woodWardWord), and the mark is masked in the display — so the player must
 *  know direction → mark (from the compass) to ward the ghost. All ≥4 chars so
 *  the mid-string insert always leaves a letter on each side. */
export const HAUNTED_WOOD_BASE_BANK = [
  "howl", "drift", "pale", "wail", "cold", "linger", "grey", "hollow",
  "whisper", "fading", "ancient", "still", "hush", "mist", "dusk", "shade",
  "creep", "gloom", "haunt", "wisp", "eerie", "moan", "dread", "silent",
  "shroud", "wander", "vanish", "echo", "lament",
  // Mist + murk (all >=4 chars, no punctuation — preserves the bank invariant)
  "haze", "murk", "vapor", "damp", "chill", "frost", "dewy",
  "veil", "smoke", "cloud", "blur", "dark", "dusky", "shadow",
  // Ghosts + spirits
  "ghost", "spirit", "spectre", "phantom", "wraith", "soul",
  "specter", "haunting", "ghostly", "spooky", "fright", "scare", "chilly",
  "moaning", "wailing", "drifting", "vanishing", "lingering",
  "restless", "weeping", "mourning", "sorrow", "grief", "lost", "buried",
  "tomb", "grave", "crypt", "bone", "skull", "death", "doom", "curse",
  // Forest + trees
  "tree", "trees", "forest", "woods", "thicket", "bramble", "thorn",
  "root", "roots", "branch", "bough", "leaf", "leaves", "bark", "moss",
  "fern", "vine", "trunk", "grove", "glade", "trail", "path",
  "twig", "stump", "crow", "raven", "moth", "wolf",
  "pine", "willow", "birch", "tangle", "gnarled", "twisted",
] as const;

/** Insert a direction's ward mark into the MIDDLE of a base ghost word. The
 *  ward "cuts" the ghost's name mid-string (not a trailing decoration), and
 *  because the mark is masked in the display, the player must supply the mark
 *  bound to the ghost's approach direction — the compass binding made real. */
export function woodWardWord(base: string, dir: WoodDirection): string {
  const mark = WOOD_DIRECTION_PUNCTUATION[dir];
  const pos = Math.max(1, Math.floor(base.length / 2));
  return base.slice(0, pos) + mark + base.slice(pos);
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
  // Cold + snow
  "chill",
  "freeze",
  "frozen",
  "icy",
  "sleet",
  "hail",
  "flurry",
  "blizzard",
  "snowy",
  "frosty",
  "glacier",
  "icicle",
  "powder",
  "slush",
  "crystal",
  "shiver",
  "numb",
  "biting",
  "bitter",
  "arctic",
  "winter",
  "cold",
  "white",
  "pale",
  "snowfall",
  // Mountain
  "slope",
  "summit",
  "crag",
  "boulder",
  "rock",
  "stone",
  "cave",
  "valley",
  "gorge",
  "ledge",
  "ascent",
  "rugged",
  "steep",
  "high",
  "alpine",
  "tundra",
  "pass",
  "cliffs",
  "snowcap",
  "ravine",
  // Wolves + tracks
  "wolf",
  "wolves",
  "pack",
  "pup",
  "hunt",
  "prey",
  "stalk",
  "snarl",
  "bite",
  "tooth",
  "muzzle",
  "tracks",
  "prowl",
  "lurk",
  "howling",
  "growling",
  "hungry",
  "fierce",
  "wild",
  "lone",
  "scent",
  "trace",
  "chase",
  "leap",
  "swiftly",
  // Atmosphere
  "silent",
  "frostbite",
  "gust",
  "gale",
  "storm",
  "cloud",
  "grey",
  "dim",
  "dawn",
  "midnight",
  "starlit",
  "shadow",
  "lonely",
  "vast",
  "still",
  "quiet",
] as const;
