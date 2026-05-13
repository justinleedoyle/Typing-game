// Relics are the souvenirs Wren brings home from each realm. They aren't
// power-ups in the RPG sense — they're flavor that pays off in the final
// battle, where the composition of the satchel shapes which allies and
// special phrases are available.

export interface Relic {
  id: string;
  name: string;
  realmId: string;
  flavor: string;
}

export const RELICS: Record<string, Relic> = {
  // ─── Winter Mountain ────────────────────────────────────────────────────
  "hunters-horn": {
    id: "hunters-horn",
    name: "The Huntress's Horn",
    realmId: "winter-mountain",
    flavor: "A spiral horn that quiets wolves and warms cold air.",
  },
  "firefly-lantern": {
    id: "firefly-lantern",
    name: "The Firefly's Lantern",
    realmId: "winter-mountain",
    flavor: "A paper lantern that holds three tireless fireflies.",
  },
  "cairn-token": {
    id: "cairn-token",
    name: "Cairn Token",
    realmId: "winter-mountain",
    flavor: "A flat stone from the cairn you built over the old wolf.",
  },
  "pelt-of-the-old-one": {
    id: "pelt-of-the-old-one",
    name: "Pelt of the Old One",
    realmId: "winter-mountain",
    flavor: "Heavy with winter. It remembers the mountain's cold.",
  },
  "snow-fox-cub": {
    id: "snow-fox-cub",
    name: "Snow-Fox Cub",
    realmId: "winter-mountain",
    flavor: "She followed you home. Her paws are silent on stone.",
  },

  // ─── Sunken Bell ────────────────────────────────────────────────────────
  "king-aurland": {
    id: "king-aurland",
    name: "King Aurland's Gratitude",
    realmId: "sunken-bell",
    flavor: "A sealed letter in tide-worn wax from the freed merfolk king.",
  },
  "trident-token": {
    id: "trident-token",
    name: "Trident Token",
    realmId: "sunken-bell",
    flavor: "A three-pronged bronze charm. The sea answers it.",
  },
  "bells-tongue": {
    id: "bells-tongue",
    name: "Bell's Tongue",
    realmId: "sunken-bell",
    flavor: "The iron clapper of the great sunken bell. It hums.",
  },
  "glass-fish": {
    id: "glass-fish",
    name: "Glass-Fish",
    realmId: "sunken-bell",
    flavor: "Translucent, coin-sized, entirely still until it isn't.",
  },

  // ─── Clockwork Forge ────────────────────────────────────────────────────
  "bellows-hammer": {
    id: "bellows-hammer",
    name: "Bellows Hammer",
    realmId: "clockwork-forge",
    flavor: "Forn's own hammer. Still warm from the last strike.",
  },
  "sabotage-wrench": {
    id: "sabotage-wrench",
    name: "Sabotage Wrench",
    realmId: "clockwork-forge",
    flavor: "A bent wrench that fits every lock it shouldn't.",
  },
  "master-key": {
    id: "master-key",
    name: "Master Key",
    realmId: "clockwork-forge",
    flavor: "Brass and old. It opens the forge's oldest vault.",
  },
  "golem-heart": {
    id: "golem-heart",
    name: "Golem Heart",
    realmId: "clockwork-forge",
    flavor: "A pulsing brass core. It remembers how to be commanded.",
  },
  "brass-songbird": {
    id: "brass-songbird",
    name: "Brass Songbird",
    realmId: "clockwork-forge",
    flavor: "Wound tight. When it sings, the golems stop and listen.",
  },

  // ─── Sky-Island of Lanterns ─────────────────────────────────────────────
  "ettas-ledger": {
    id: "ettas-ledger",
    name: "Etta's Ledger",
    realmId: "sky-island",
    flavor: "A scholar's notebook, dense with sky-island cartography.",
  },
  "beacon-spark": {
    id: "beacon-spark",
    name: "Beacon Spark",
    realmId: "sky-island",
    flavor: "A shard of the island's highest beacon. Still lit.",
  },
  "wind-phrase": {
    id: "wind-phrase",
    name: "Wind Phrase",
    realmId: "sky-island",
    flavor: "A scroll of old sky-speech that moves the air when read.",
  },
  "tether-cord": {
    id: "tether-cord",
    name: "Tether Cord",
    realmId: "sky-island",
    flavor: "Cuts the mooring line that kept the island too low.",
  },
  "untethered-wind": {
    id: "untethered-wind",
    name: "Untethered Wind",
    realmId: "sky-island",
    flavor: "The island rose. This is the wind it left behind.",
  },
  "lantern-moth": {
    id: "lantern-moth",
    name: "Lantern-Moth",
    realmId: "sky-island",
    flavor: "Wings lit from within. She finds light in any dark.",
  },

  // ─── Haunted Wood ───────────────────────────────────────────────────────
  "shrine-token": {
    id: "shrine-token",
    name: "Shrine Token",
    realmId: "haunted-wood",
    flavor: "Left at the crossroads shrine. Something warm answered.",
  },
  "bone-flute": {
    id: "bone-flute",
    name: "Bone Flute",
    realmId: "haunted-wood",
    flavor: "Older than the wood. The ghosts know its key.",
  },
  "ghost-kings-promise": {
    id: "ghost-kings-promise",
    name: "Ghost-King's Promise",
    realmId: "haunted-wood",
    flavor: "A whispered bargain. The king's name holds it closed.",
  },
  "wisp-cat": {
    id: "wisp-cat",
    name: "Wisp-Cat",
    realmId: "haunted-wood",
    flavor: "She glows just enough. She always finds the path out.",
  },
};
