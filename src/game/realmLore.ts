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
      "The second portal opened underwater — or nearly so. The kingdom of Tide-Glass sat on the seafloor, its glass spires green with old light, and its bell had not rung in a hundred years.",
    endings: {
      chant:
        "He learned the quiet chant of the bell-keepers and rang the bell gently, on the beat, until the drowned things retreated into the dark.",
      "free-king":
        "King Aurland had been imprisoned inside the bell's voice since the silence began. Wren unspoke the binding word by word. The king surfaced, gasping, and pressed his trident token into Wren's palm.",
      "claim-tongue":
        "He climbed inside the bell and took its iron tongue for himself. The bell went silent for good. The tide receded. He was not sure whether that was a kindness.",
      glass:
        "A glass-fish had been following him since the harbor. When he freed King Aurland, the fish darted forward and pressed itself against his satchel.",
    },
  },

  "clockwork-forge": {
    title: "The Clockwork Forge",
    intro:
      "The third portal opened in a wall of heat. The Forge had been running for three hundred years with no one at the bellows, and the golems had started giving themselves orders.",
    endings: {
      forn:
        "The smith Forn had been locked in a gear-room for a week. Wren typed the lock open and Forn walked out, still covered in soot, and handed him his spare hammer.",
      cabal:
        "A cabal of older golems had been sabotaging the furnace to slow production. Wren gave them the sabotage wrench they asked for.",
      peaceful:
        "He gave the peaceful order. The golems stood down in unison. The Forge went quiet for the first time in three centuries.",
      fought:
        "He fought his way to the core furnace and pulled the golem-heart from the socket. The golems froze mid-step.",
      songbird:
        "A brass songbird had been sitting in a high corner of the Forge since anyone could remember. When the golems fell silent, it flew down and landed on his shoulder and sang one note.",
    },
  },

  "sky-island": {
    title: "The Sky-Island of Lanterns",
    intro:
      "The fourth portal opened in golden air. The island had been tethered too low for years, and the lanterns the scholars hung from every surface were running out of moths.",
    endings: {
      "help-etta":
        "Scholar Etta had been trying to finish her sky-chart for forty years and was very nearly done. Wren typed the last measurements for her. She pressed her ledger into his hands.",
      beacon:
        "He struck the beacon with a beacon-spark that had been sitting uncharged in a cabinet for decades. The light reached the mountain scholars on the next island.",
      "answer-kindly":
        "The wind asked him a question in old sky-speech. He answered it kindly. It gave him the wind-phrase scroll and left.",
      "cut-tether":
        "He cut the mooring cord that had kept the island too low. It rose slowly at first, then faster, until the scholars were cheering from the railings.",
      moth:
        "A lantern-moth had been watching him from the beacon since he arrived. When the island rose, she flew down and folded her wings against his satchel.",
    },
  },

  "haunted-wood": {
    title: "The Haunted Wood",
    intro:
      "The fifth portal opened into fog. The wood had been haunted for two hundred years — not because anything bad lived there, but because no one had told the ghosts they could go.",
    endings: {
      offering:
        "At the crossroads shrine he left an offering he could not spare. Something warm answered from inside the stone. Inga the ghost-keeper told him her true name.",
      "bone-flute":
        "He took the bone flute from the shrine instead of leaving anything. The ghosts recognized it immediately and gave him room.",
      bargain:
        "The Ghost-King offered him a bargain: speak your true name, and I will speak mine. Wren did. The ghosts had somewhere to go at last.",
      "light-grove":
        "He lit the grove. The light was enough — the ghosts dispersed into it like breath in cold air.",
      "wisp-cat":
        "The wisp-cat had been circling him since the crossroads. When the bargain was sealed, she pressed her glowing side against his ankle and followed him home.",
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
    else if (choices.fork1 === "firefly" && choices.fork2 === "bury") farewell = "The fox returned, searched for Sigrid, then turned back into the pines.";
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
  "the-wounded-foxs-name": "The fox lay curled in the snow, breath shallow. When Wren said “I mean no harm” she did not run. She watched Wren from the pines for the rest of the climb. Her name, Runa later guessed, was something close to kindness in a small shape.",
  "the-huntress-song": "Sigrid spoke a few words in the wolf-tongue as Wren freed her hands. The howls behind them fell quiet. She pressed a spiral horn into Wren's hand and gestured uphill. An old song lingered in the snow after she had gone.",
  "the-firefly-trail": "Three fireflies hovered, patient, between the pines. They drifted up only when Wren followed, never when Wren stopped. They led the way to a hollow tree where a small paper lantern had been waiting longer than anyone living. Wren carried it down the mountain.",
  "the-pack-leader-true-name": "The old wolf fell, and a scratched A flashed across the Almanac. When the climb was over, Wren spoke the mountain's true-name passage: the winter mountain settles. its old breath warms. the snow rests. The snow grew still.",
};

/** Other realms and unknown entries remain byte-for-byte authored as before. */
export function winterLorePageBody(loreId: string, authoredBody: string): string {
  return WINTER_LORE_BODIES[loreId] ?? authoredBody;
}
