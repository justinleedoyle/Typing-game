// What the Almanac says about each realm. Authored separately from the
// scene code so the prose can be revised without touching gameplay.
//
// Each realm has a title, an intro paragraph (always shown), and per-ending
// text that swaps based on the CYOA choices Aiden made. The Almanac page
// therefore looks different on every run.

import type { RealmProgress } from "./saveState";

export interface RealmLore {
  title: string;
  intro: string;
  endings: Record<string, string>;
}

export const REALM_LORE: Record<string, RealmLore> = {
  "winter-mountain": {
    title: "The Winter Mountain",
    intro:
      "Wren stepped through the first portal into a cold dawn. The pines were dark, the snow waist-deep, and the old one was already stirring.",
    endings: {
      huntress:
        "At the fork, Wren freed Sigrid from the drifts. The huntress gave Wren her spiral horn.",
      firefly:
        "Wren followed the fireflies to a lantern in a hollow tree and carried it back down.",
      bury:
        "Wren built a cairn over the old wolf. Stone by stone, the mountain grew quiet.",
      pelt:
        "Wren took the old wolf's pelt. It was heavy with winter on the way down.",
      fox:
        "When Wren whispered, the snow-fox came close and followed through the portal.",
    },
  },

  "sunken-bell": {
    title: "The Sunken Bell",
    intro:
      "The second portal opened underwater — or nearly so. The kingdom of Tide-Glass sat on the seafloor, its glass spires green with old light, and its bell had kept the same drowned rhythm for a hundred years.",
    endings: {
      chant:
        "Wren opened the cathedral doors slowly, with a quiet chant. The doors parted with grace, and Wren carried the Quiet Chant onward.",
      force:
        "Wren forced the cathedral doors open with OPEN. A lock-bar came away from the doors and went into the satchel.",
      "free-king":
        "King Aurland had been imprisoned inside the bell's voice since the silence began. Wren unspoke the binding word by word. The king surfaced, gasping, and pressed a trident token into Wren's palm.",
      "claim-tongue":
        "Wren reached beneath the bell and took its iron tongue. The bell went silent for good. The tide receded; whether that was a kindness remained uncertain.",
      glass:
        "A glass-fish had watched from the harbor. When Wren welcomed the creature, it darted forward and tucked itself against the satchel.",
    },
  },

  "clockwork-forge": {
    title: "The Clockwork Forge",
    intro:
      "The third portal opened in a wall of heat. The Forge had been running for three hundred years with no one at the bellows, and the golems had started giving themselves orders.",
    endings: {
      forn:
        "Wren helped Forn repair the iron bellows. The old smith pressed a warm hammer into Wren's hands as a deep breath moved through the foundry.",
      cabal:
        "Wren joined the apprentices and shut a furnace valve. The foundry slowed, and the cabal pressed a sabotage-wrench into Wren's palm.",
      peaceful:
        "Wren typed STAND DOWN. The last golems lowered their arms, the Forge grew quiet, and Wren carried away the Master-Key.",
      fought:
        "Wren fought the last two command-golems. When the final golem fell, Wren claimed the Golem-Heart.",
      songbird:
        "A brass songbird had watched from a high corner of the Forge. When Wren welcomed it, the bird landed on Wren's shoulder and sang three notes.",
    },
  },

  "sky-island": {
    title: "The Sky-Island of Lanterns",
    intro:
      "The fourth portal opened in golden air. The island had been tethered too low for years, and the lanterns the scholars hung from every surface were running out of moths.",
    endings: {
      "help-etta":
        "Wren helped Scholar Etta return a book to the shelves. The beacon brightened, and Etta's Ledger came home with Wren.",
      beacon:
        "Wren took a curl of flame from the beacon. The lanterns dipped as the beacon dimmed; Wren carried away the Beacon-Spark.",
      "answer-kindly":
        "Wren told the Scholar-Spirit, “you kept the light.” The summit lanterns brightened, and Wren carried away the Wind-Phrase.",
      "cut-tether":
        "Wren pulled the thread binding the spirit to the beacon. The island lurched, then steadied as a freed wind rushed past. Wren kept the Tether-Cord.",
      moth:
        "A lantern-moth had watched from the beacon. When Wren welcomed her, she flew down and settled on Wren's wrist.",
    },
  },

  "haunted-wood": {
    title: "The Haunted Wood",
    intro:
      "The fifth portal opened into fog. The wood had been haunted for two hundred years — not because anything bad lived there, but because no one had told the ghosts they could go.",
    endings: {
      offering:
        "At the crossroads shrine, Wren said, “i remember you.” The shrine glowed, and its keeper whispered Inga's name. Wren carried away the Shrine-Token.",
      "bone-flute":
        "Wren took the bone flute from the shrine. The ghosts grew restless, and their whispers followed Wren along the path. The lost ghost's name remained unfound.",
      bargain:
        "Wren answered the Ghost-King with remembrance: “you are not gone.” The king listened, bowed, and gave Wren the Ghost-King's Promise.",
      "light-grove":
        "Wren lit the grove and faced the Ghost-King. The Ash-Vial carried that choice home after the last ward held.",
      "wisp-cat":
        "A wisp-cat appeared beside the root-throne. When Wren welcomed her, she pressed her glowing side against Wren's ankle and followed home.",
    },
  },
};

export const REALM_ORDER = [
  "winter-mountain",
  "sunken-bell",
  "clockwork-forge",
  "sky-island",
  "haunted-wood",
];

export interface RealmPathSummary {
  primary: string;
  secondary?: string;
}

/** Read recorded decisions without guessing from relics or rewriting old saves.
 * Forge's historical combined ending and earlier lore-key aliases still work.
 * An absent/unknown choice stays unrecorded instead of inventing a kind path. */
export function realmPathSummary(
  realmId: string,
  choices: Readonly<Record<string, string>> = {},
): RealmPathSummary {
  const endings = REALM_LORE[realmId]?.endings;
  if (!endings) return { primary: "This realm's path is not recorded." };
  let first: string | undefined = choices.fork1;
  let second: string | undefined = choices.fork2;
  switch (realmId) {
    case "clockwork-forge": {
      const legacy = /^(forn|cabal)-(peaceful|fought)$/.exec(choices.ending ?? "");
      first ??= legacy?.[1];
      second ??= legacy?.[2];
      break;
    }
    case "sunken-bell":
      if (second === "free-aurland") second = "free-king";
      break;
    case "sky-island":
      if (first === "steal-flame") first = "beacon";
      break;
    case "haunted-wood":
      if (second === "force") second = "light-grove";
      break;
  }
  const validFirst: Record<string, readonly string[]> = {
    "winter-mountain": ["huntress", "firefly"],
    "sunken-bell": ["chant", "force"],
    "clockwork-forge": ["forn", "cabal"],
    "sky-island": ["help-etta", "beacon"],
    "haunted-wood": ["offering", "bone-flute"],
  };
  const validSecond: Record<string, readonly string[]> = {
    "winter-mountain": ["bury", "pelt"],
    "sunken-bell": ["free-king", "claim-tongue"],
    "clockwork-forge": ["peaceful", "fought"],
    "sky-island": ["answer-kindly", "cut-tether"],
    "haunted-wood": ["bargain", "light-grove"],
  };
  return {
    primary: first && validFirst[realmId]?.includes(first)
      ? endings[first]! : "The first path choice is not recorded.",
    secondary: second && validSecond[realmId]?.includes(second)
      ? endings[second]! : "The final path choice is not recorded.",
  };
}


export interface WinterRealmSummary {
  pathHeading: string;
  carriedHeading: string;
  /** First meeting, trail fork, wolf aftermath, then companion outcome. */
  passages: readonly string[];
  companion: "joined" | "declined" | "not-earned" | "unrecorded";
  carriedIds: readonly string[];
}

/** Winter's record follows saved decisions, never whichever relic happens to
 * be first in the satchel. Neutral wording also works for either Wren identity. */
export function winterRealmSummary(
  progress: RealmProgress | undefined,
  satchel: readonly string[] = [],
): WinterRealmSummary {
  const choices = progress?.choices ?? {};
  const endings = REALM_LORE["winter-mountain"].endings;
  const fox = choices.fox === "spared"
    ? 'Wren paused for the wounded fox and said, “I mean no harm.” She watched from the pines.'
    : choices.fox === "ignored"
      ? "Wren passed the wounded fox without stopping. She vanished into the trees."
      : "The first meeting with the snow-fox is not recorded.";
  const trail = choices.fork1 === "huntress" || choices.fork1 === "firefly"
    ? endings[choices.fork1]
    : "The trail fork is not recorded on this page.";
  const aftermath = choices.fork2 === "bury" || choices.fork2 === "pelt"
    ? endings[choices.fork2]
    : "The old wolf's resting place is not recorded.";
  const eligible = choices.fox === "spared" && choices.fork1 === "huntress" && choices.fork2 === "bury";
  const completeChoices = (choices.fox === "spared" || choices.fox === "ignored") &&
    (choices.fork1 === "huntress" || choices.fork1 === "firefly") &&
    (choices.fork2 === "bury" || choices.fork2 === "pelt");
  // Original saves did not record accepted/declined. A matching carried fox is
  // evidence of acceptance only when all three canonical kindness gates hold.
  const joined = eligible && (choices.companion === "accepted" ||
    (choices.companion === undefined && satchel.includes("snow-fox-cub")));
  let companion: WinterRealmSummary["companion"] = "unrecorded";
  let farewell = "The fox's farewell is not recorded.";
  if (joined) { companion = "joined"; farewell = endings.fox; }
  else if (eligible && choices.companion === "declined") {
    companion = "declined";
    farewell = "The fox returned to the cairn. Wren let her go, and she stayed on the mountain.";
  } else if (completeChoices && !eligible) {
    companion = "not-earned";
    if (choices.fox === "ignored") farewell = "No snow-fox followed Wren through the portal.";
    else if (choices.fork1 === "firefly" && choices.fork2 === "bury") farewell = "The fox returned and looked past Wren, searching. After a long moment, she turned back into the pines.";
    else if (choices.fork1 === "huntress" && choices.fork2 === "pelt") farewell = "The fox saw the old wolf's pelt and stepped back into the snow.";
    else farewell = "The fox stayed in the mountain's pines.";
  }
  const allowed = new Set<string>();
  if (choices.fork1 !== "firefly") allowed.add("hunters-horn");
  if (choices.fork1 !== "huntress") allowed.add("firefly-lantern");
  if (choices.fork2 !== "pelt") allowed.add("cairn-token");
  if (choices.fork2 !== "bury") allowed.add("pelt-of-the-old-one");
  if (joined) allowed.add("snow-fox-cub");
  return {
    pathHeading: "Wren's path:", carriedHeading: "Carried away:",
    passages: [fox, trail, aftermath, farewell], companion,
    carriedIds: [...new Set(satchel.filter((id) => allowed.has(id)))],
  };
}

/** Old saves could stamp both branches after restarting an unfinished realm.
 * Keep those saved IDs intact, but the current chapter shows the chosen path. */
export function winterLorePageMatchesChoices(loreId: string, choices: Readonly<Record<string, string>> = {}): boolean {
  if (loreId === "the-wounded-foxs-name" && choices.fox === "ignored") return false;
  if (loreId === "the-huntress-song" && choices.fork1 === "firefly") return false;
  if (loreId === "the-firefly-trail" && choices.fork1 === "huntress") return false;
  return true;
}

const WINTER_LORE_BODIES: Readonly<Record<string, string>> = {
  "the-hundred-quiet-years": "Heldur thawed long enough to give a name and a fragment of the past: a hundred years at the pass, and the word Holdfast. Then the knight's voice fell quiet again. The wayshrine stayed warm a little longer than the wind would explain.",
  "the-wounded-foxs-name": "The fox sat in the snow, hurt and breathing shallowly. When Wren said “I mean no harm” she did not run. She watched Wren from the pines for the rest of the climb. Her name, Runa later guessed, was something close to kindness in a small shape.",
  "the-huntress-song": "Sigrid spoke a few words in the wolf-tongue as Wren freed her hands. The howls behind them fell quiet. She pressed a spiral horn into Wren's hand and gestured uphill. An old song lingered in the snow after she had gone.",
  "the-firefly-trail": "Three fireflies hovered, patient, between the pines. They drifted up only when Wren followed, never when Wren stopped. They led the way to a hollow tree where a small paper lantern had been waiting longer than anyone living. Wren carried it down the mountain.",
  "the-pack-leader-true-name": "The old wolf fell, and a scratched A flashed across the Almanac. When the climb was over, Wren spoke the mountain's true-name passage: the winter mountain settles. its old breath warms. the snow rests. The snow grew still.",
};

/** Other realms and unknown entries remain byte-for-byte authored as before. */
export function winterLorePageBody(loreId: string, authoredBody: string): string {
  return WINTER_LORE_BODIES[loreId] ?? authoredBody;
}
