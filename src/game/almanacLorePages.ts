// Per-page Almanac lore. Each entry is keyed by the same ID that scenes push
// into `saveState.almanacLore` at narrative beats. The Almanac displays the
// title + body when the page is stamped; an unstamped page does not render.
//
// §5.5.6 and §5.5.7 lock the Winter + Sunken page titles. §5.5.8 leaves the
// remaining realms as sketches — Forge, Sky, and Wood titles + bodies here
// are original Almanac-voice prose grounded in the sketch beats; revise
// freely without code changes.

export interface AlmanacLorePage {
  realmId: string;
  title: string;
  body: string;
}

export const ALMANAC_LORE_PAGES: Record<string, AlmanacLorePage> = {
  // ─── Winter Mountain ───────────────────────────────────────────────────────

  "the-hundred-quiet-years": {
    realmId: "winter-mountain",
    title: "The Hundred Quiet Years",
    body:
      "Heldur thawed long enough to tell Wren about the kingdom: that for a hundred quiet years no Portalwright had answered the call, and the realms had drifted, untraveled. He named the seven realms in order and refroze. The wayshrine stayed warm a little longer than the wind would explain.",
  },

  "the-wounded-foxs-name": {
    realmId: "winter-mountain",
    title: "The Wounded Fox's Name",
    body:
      "The fox lay curled in the snow, breath shallow. When Wren said “I mean no harm” she did not run. She watched him from the pines for the rest of the climb. Her name, Runa later guessed, was something close to kindness in a small shape.",
  },

  "the-huntress-song": {
    realmId: "winter-mountain",
    title: "The Huntress's Song",
    body:
      "The huntress sang four short lines as she walked beside him: nothing in any tongue Wren recognized, but the wolves stopped following. She said it was an old song — her mother had sung it to her, and so had her mother before. She gave Wren her horn at the pass and turned back into the snow.",
  },

  "the-firefly-trail": {
    realmId: "winter-mountain",
    title: "The Firefly Trail",
    body:
      "Three fireflies hovered, patient, between the pines. They drifted up only when Wren followed, never when he stopped. He chased them into a hollow tree at the summit where a small paper lantern had been waiting longer than anyone living. He carried it down with him.",
  },

  "the-pack-leader-true-name": {
    realmId: "winter-mountain",
    title: "The Pack Leader's True Name",
    body:
      "The old wolf's true name was the long winter, the still hand, the patient grief. Wren spoke it whole, and the wolf lay down. He understood then that the pack had not been hunting him so much as running from the same thing he was.",
  },

  "wayshrine-runes": {
    realmId: "winter-mountain",
    title: "Wayshrine Runes",
    body:
      "Etched on the wayshrine in characters Wren could half-read: I am called Heldur. I held this pass once. Tell me of Holdfast. The carvings continued down the side of the shrine, fainter, in older hands. Other watchmen had been here, and named themselves, and waited.",
  },

  // ─── Sunken Bell ───────────────────────────────────────────────────────────

  "the-drowned-choir": {
    realmId: "sunken-bell",
    title: "The Drowned Choir",
    body:
      "They had been singing for a hundred years, the drowned choir, but no one had been listening. When the bell tolled, their mouths opened together; between tolls they were perfectly still. Old Olin called them the patient ones.",
  },

  "old-olins-memory": {
    realmId: "sunken-bell",
    title: "Old Olin's Memory",
    body:
      "The bell's name was not Olin's to teach, he wrote, only to remember. He had taught it once when he was younger and learned that some teachings outlive their teachers. His ears had gone half-quiet the day the kingdom drowned, which was why he was still alive to write this down.",
  },

  // NOTE: ID has a historical typo ("auriand" instead of "aurland"); kept as-is
  // so existing saves continue to resolve. Title + body use the proper spelling.
  "king-auriands-promise": {
    realmId: "sunken-bell",
    title: "King Aurland's Promise",
    body:
      "Aurland had been bound inside the bell's voice for a century and could not stop hearing himself silenced. When Wren unmade the binding word by word, the king surfaced gasping and pressed his trident token into Wren's palm. “Find me again,” he said, “if you are ever pulled down.”",
  },

  "the-bells-tongue-song": {
    realmId: "sunken-bell",
    title: "The Bell's Tongue, a Song",
    body:
      "The clapper was warm to the touch, which Wren had not expected. He pried it free and the bell went silent for the last time. The tide turned, and the kingdom of Tide-Glass began the long process of remembering how to breathe its own air.",
  },

  "the-wardens-true-name": {
    realmId: "sunken-bell",
    title: "The Warden's True Name",
    body:
      "The Warden spoke his true name on the last toll: I am the bell. I drink the sea. Wren typed it back to him whole, and the bronze unwound around his shoulders. The Warden had been guarding a silence he had not chosen; he was relieved to set it down.",
  },

  "notes-from-a-half-deaf-priest": {
    realmId: "sunken-bell",
    title: "Notes from a Half-Deaf Priest",
    body:
      "Olin had survived because he could not hear the Lord's command. He wrote this small confession on the back of a hymn sheet, in case anyone living read it: I do not know if I am brave or only deaf. The bell does not say.",
  },

  // ─── Clockwork Forge ───────────────────────────────────────────────────────

  "golem-keepers-code": {
    realmId: "clockwork-forge",
    title: "The Golem-Keeper's Code",
    body:
      "Gregor showed Wren the difference between walk and WALK. Lowercase, the golem moved. Capitalized, it obeyed. “A small letter is a suggestion, lad,” he said. “A big one is an order. Forge folk have known the difference for three centuries. Don't unlearn it.”",
  },

  "the-broken-bellows": {
    realmId: "clockwork-forge",
    title: "The Broken Bellows",
    body:
      "The Forge had been running for three centuries without anyone at the bellows. The fire had not grown smaller, only stranger: it burned without smoke, and the golems had begun giving themselves orders. None of them remembered who had given the first one.",
  },

  "forn-bellows-song": {
    realmId: "clockwork-forge",
    title: "Forn's Bellows Song",
    body:
      "Forn the smith taught Wren the four-beat hammer song he used to time his work. “You don't keep tempo,” he said. “You let the metal keep tempo, and you follow it.” He gave Wren his spare hammer in a cloth, still warm, when the bellows started again.",
  },

  "apprentices-manifesto": {
    realmId: "clockwork-forge",
    title: "The Apprentices' Manifesto",
    body:
      "The Apprentices' Cabal had pinned their manifesto inside the wrench cabinet: no more orders we did not write. no more fires we did not feed. Wren handed them the sabotage wrench they asked for. The Forge ran rougher after, but it ran by its own choosing.",
  },

  "the-command-golems-name": {
    realmId: "clockwork-forge",
    title: "The Command-Golem's Name",
    body:
      "The Command-Golem's true name was half-lowercase, half-shouted: stand DOWN. It was the order it had been giving itself for three centuries. Wren typed it the way it had to be typed and the golem sat, finally, like something that had been very tired for a long time.",
  },

  "the-forge-true-name": {
    realmId: "clockwork-forge",
    title: "The Forge's True Name",
    body:
      "The Forge spoke its own ending: the forge breathes. the brass remembers. its makers are remembered. Wren typed it whole. The fire dimmed once and held a steadier color, the brass began to cool, and the great old place sighed for the first time in three hundred years.",
  },

  // ─── Sky-Island of Lanterns ────────────────────────────────────────────────

  "the-lantern-lighters-vigil": {
    realmId: "sky-island",
    title: "The Lantern-Lighter's Vigil",
    body:
      "A child-spirit tended the great beacon. “I light them and I count them,” she said. “That is my work. If I miscount, the island will fall.” She had been counting for two hundred years and was not tired. She let Wren help her count the row at the railing.",
  },

  "scholar-ettas-last-volume": {
    realmId: "sky-island",
    title: "Scholar Etta's Last Volume",
    body:
      "Scholar Etta had been writing her sky-chart for forty years and was very nearly done. She would not put down the pen until Wren typed the last three measurements for her. She pressed her ledger into his hands and asked him to carry it down to a library that no longer existed.",
  },

  "the-five-temple-riddles": {
    realmId: "sky-island",
    title: "The Five Temple Riddles",
    body:
      "At each lantern-temple a phrase had been inscribed on the rim, longer than the last. By the fifth temple, Wren was reading whole sentences without slowing. The lanterns rose when he finished each, and the island lifted a fraction with them.",
  },

  "the-scholar-spirits-riddles": {
    realmId: "sky-island",
    title: "The Scholar-Spirit's Riddles",
    body:
      "The Scholar-Spirit asked three riddles in long form. The first was about what survives a fire; the second about what light owes the dark; the third Wren could not remember afterward. He answered all three. The Spirit, satisfied, opened her hands and let the wind take her notes.",
  },

  "the-sky-true-name": {
    realmId: "sky-island",
    title: "The Sky-Island's True Name",
    body:
      "The Sky-Island spoke its own ending: the sky remembers every page that ever lit. nothing burned is truly gone. Wren typed it whole. The beacon flared once, the lanterns brightened in sequence along the railings, and the island rose to its proper height for the first time in years.",
  },

  // ─── Haunted Wood ──────────────────────────────────────────────────────────

  "the-crossroads-ghost": {
    realmId: "haunted-wood",
    title: "The Crossroads Ghost",
    body:
      "At the first crossroads a ghost stood patient between four paths. “I do not remember which way I came,” she said. “Could you tell me which way you came?” Wren told her. She thanked him, and chose a fifth direction, and walked into the trees.",
  },

  "ingas-name": {
    realmId: "haunted-wood",
    title: "Inga's Name",
    body:
      "Her name was Inga. She had forgotten it for two hundred years, and when Wren typed it for her she said it out loud, slowly, like a word she had borrowed and was returning. The fog around her thinned. She had somewhere to be, finally.",
  },

  "punctuation-warding": {
    realmId: "haunted-wood",
    title: "Punctuation Warding",
    body:
      "At the four-way crossroads each direction was guarded by a punctuation mark: north a period, east a question mark, south an exclamation, west a comma. “The marks are old wards,” Inga had said. “They hold the path you face open and the others closed.” Wren learned to pivot mid-word.",
  },

  "ghost-kings-true-name": {
    realmId: "haunted-wood",
    title: "The Ghost-King's True Name",
    body:
      "The Ghost-King's true name was a long sentence with every punctuation mark in it: each comma and semicolon and colon a footstep, each period and exclamation a stop. Wren typed it whole, and the ghosts behind the king bowed their heads, and the Ghost-King smiled for the first and last time.",
  },

  "the-wood-true-name": {
    realmId: "haunted-wood",
    title: "The Wood's True Name",
    body:
      "The Wood spoke its own ending: we are remembered. we are quiet. but we are not silent. Wren typed it whole. The fog lifted off the path, the crossroads markers fell, and the ghosts walked at last in the directions they had always meant to.",
  },
};

/** Total page count per realm. Spec §5.5.6/§5.5.7 calls for 5 per realm;
 *  Winter and Sunken have a 6th fork-alternative each (huntress/firefly,
 *  Aurland/Bell's Tongue) where any given playthrough awards only one. */
export const LORE_PAGES_PER_REALM = 5;

/** Returns the IDs that belong to a given realm, in narrative order. Used by
 *  the Almanac to walk a realm's stamped lore pages in spec sequence. */
export function lorePageIdsForRealm(realmId: string): string[] {
  return Object.entries(ALMANAC_LORE_PAGES)
    .filter(([, p]) => p.realmId === realmId)
    .map(([id]) => id);
}
