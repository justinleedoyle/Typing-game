// What the Almanac says about each realm. Authored separately from the
// scene code so the prose can be revised without touching gameplay.
//
// Each realm has a title, an intro paragraph (always shown), and per-ending
// text that swaps based on the CYOA choices Aiden made. The Almanac page
// therefore looks different on every run.

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
        "At the fork he turned aside to free a huntress buried in the drifts. She spoke a few words in the wolf-tongue and the howls behind him fell quiet. She gave him her spiral horn before he climbed on.",
      firefly:
        "At the fork he followed three patient fireflies up between the pines. They came to rest inside a paper lantern hidden in a hollow tree, and he carried it down the mountain with him.",
      bury:
        "He buried the old wolf under a cairn of flat stones. It took a long time. The mountain was very quiet when he finished.",
      pelt:
        "He carried the old wolf's pelt down the mountain. It was heavy with winter. He told himself it was only weight.",
      fox:
        "A snow-fox had been watching from the treeline since he arrived. When he finally paused and spoke to her, she followed him back through the portal without hesitation.",
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
