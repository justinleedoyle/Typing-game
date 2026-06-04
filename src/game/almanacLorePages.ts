// Per-page Almanac lore. Each entry is keyed by the same ID that scenes push
// into `saveState.almanacLore` at narrative beats. The Almanac displays the
// title + body when the page is stamped; an unstamped page does not render.
//
// §5.5.6 and §5.5.7 lock the Winter + Sunken page titles. §5.5.8 leaves the
// remaining realms as sketches — Forge, Sky, and Wood titles + bodies here
// are original Almanac-voice prose grounded in the sketch beats; revise
// freely without code changes.
//
// §5.5.8 PROSE PASS (done): the 13 unspecced Forge/Sky/Wood bodies (every page
// except the three realm true-name pages, whose text is locked by §5.5.8) were
// lifted to the ambitious register — anchored to the sketch beats + §5.5.9
// companion/fork canon, preserving the strongest existing lines. Bodies are
// sized to the Almanac reader's ~19-line page budget (26px / 620px wrap).

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
      "Gregor set two words on the bench — walk, and WALK — and made Wren say which was which. Lowercase, the golem shifted its weight. Capitalized, it stood and obeyed. “A small letter is a suggestion, lad,” he said, tapping the brass. “A big one is an order. Forge folk have known the difference for three centuries. Don't you go unlearning it.”",
  },

  "the-broken-bellows": {
    realmId: "clockwork-forge",
    title: "The Broken Bellows",
    body:
      "Three centuries the Forge had run with no hand at the bellows, and the fire had not gone out — only gone strange. It burned without smoke now, and without a heat you could name, and somewhere in those long unwatched years the golems had begun giving themselves orders. None of them remembered who had given the first one. None of them had thought to ask.",
  },

  "forn-bellows-song": {
    realmId: "clockwork-forge",
    title: "Forn's Bellows Song",
    body:
      "Forn had timed his work to a four-beat hammer song since he was a boy, and he taught it to Wren now. “You don't keep tempo,” he said, marking it out on the anvil-edge — one, two, three, rest. “You let the metal keep tempo, and you follow where it goes.” When the bellows drew their first full breath in three hundred years, he wrapped his spare hammer in cloth and pressed it into Wren's hands, still warm from the fire.",
  },

  "apprentices-manifesto": {
    realmId: "clockwork-forge",
    title: "The Apprentices' Manifesto",
    body:
      "The Apprentices' Cabal had pinned their manifesto inside the wrench cabinet, in a hand that pressed hard enough to score the brass: no more orders we did not write. no more fires we did not feed. Wren gave them the sabotage-wrench they asked for and did not stay to watch what they did with it. The Forge ran rougher after that — louder, with a limp in its rhythm. But it ran by its own choosing, and that was the thing they had wanted.",
  },

  "the-command-golems-name": {
    realmId: "clockwork-forge",
    title: "The Command-Golem's Name",
    body:
      "The Command-Golem's true name was half-whispered, half-shouted: stand DOWN. It was the order it had been giving itself, over and over, for three hundred years — the only voice left to give it. Wren typed it the way it had to be typed, the small letters soft and the great ones hard, and the golem lowered itself to the floor. It sat the way a thing sits when it has been very tired for a very long time, and has only just been given permission to stop.",
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
      "A child-spirit tended the great beacon, moving along the rails with a taper that never burned down. “I light them, and I count them,” she said. “That is the whole of my work. Miscount, and the island falls.” She had been counting for two hundred years and was not tired — counting, she explained, is not the sort of thing that tires you, if you love the things you count. She let Wren help with the row along the railing, and corrected him, kindly, twice.",
  },

  "scholar-ettas-last-volume": {
    realmId: "sky-island",
    title: "Scholar Etta's Last Volume",
    body:
      "Scholar Etta had been writing her sky-chart for forty years and was three measurements short of finished. She would not put down the pen — could not, her hand had forgotten how — until Wren typed those last three for her. Then she pressed the ledger into his arms, heavy as a paving-stone, and asked him to carry it down to the library at Holdfast. She did not seem to know, or did not wish to know, that the library had burned long ago. Wren took it anyway. Some promises are worth keeping to a place that is gone.",
  },

  "the-five-temple-riddles": {
    realmId: "sky-island",
    title: "The Five Temple Riddles",
    body:
      "At each lantern-temple a phrase had been cut into the rim of the great lamp, longer than the one before — a line, then a couplet, then a whole verse. The lanterns would not rise until the phrase was read entire, without a stumble. By the fifth temple Wren was reading full sentences at speed, the way you read a thing you have stopped being afraid of. Each lamp he lit drew the island a little higher into the gold air, until Holdfast itself was a far green smudge below.",
  },

  "the-scholar-spirits-riddles": {
    realmId: "sky-island",
    title: "The Scholar-Spirit's Riddles",
    body:
      "The Scholar-Spirit asked three riddles, each the length of a paragraph, each wanting a whole sentence back. The first asked what survives a fire. The second asked what light owes the dark. The third Wren answered correctly and could not, afterward, remember a word of — not the question, not his answer, only that it had been true. She listened to all three with her head tilted, the way scholars do, and when he had finished she opened her hands and let the wind take her notes — two hundred years of them, out over the railing and gone.",
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
      "At the first crossroads a ghost stood waiting between the four paths, patient as a signpost. “I don't remember which way I came,” she said. “Could you tell me which way you came?” Wren told her — pointed back the way he had walked, the fog already closing over it. She thanked him as though he had handed her something far larger than a direction. Then she chose a fifth way, one Wren had not seen until she stepped onto it, and walked off into the trees without looking back.",
  },

  "ingas-name": {
    realmId: "haunted-wood",
    title: "Inga's Name",
    body:
      "Her name was Inga. She had carried the shape of it for two hundred years without the word itself — a held breath, a door she could not find the latch of. When Wren found the clue and typed it out for her, she said it aloud, slowly, like a word she had borrowed a long time ago and was at last returning. The fog around her thinned to nothing. She had somewhere to be, finally, and now she remembered the way.",
  },

  "punctuation-warding": {
    realmId: "haunted-wood",
    title: "Punctuation Warding",
    body:
      "Each direction at the crossroads answered to a punctuation mark: a period north, a question mark east, an exclamation south, a comma west. “The marks are old wards,” Inga told him, “older than the wood. They hold open the path you face, and hold shut all the others. Mind your turning.” Wren learned to pivot mid-word — to set a comma and wheel west, to stop a charge from the north with one hard period — until the warding felt less like spelling and more like footwork.",
  },

  "ghost-kings-true-name": {
    realmId: "haunted-wood",
    title: "The Ghost-King's True Name",
    body:
      "The Ghost-King's true name was a single long sentence that held every mark of punctuation there is — each comma and semicolon a footstep, each colon a held breath, each period and exclamation a place to stop and be still. Wren typed it whole, without dropping a single mark, the way you carry a full cup across a dark room. Behind the throne the lesser ghosts bowed their heads. And the Ghost-King, who had been at war with his own name for longer than the wood had stood, smiled — for the first time, and the last.",
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
