// What the Almanac says about each realm. Authored separately from the
// scene code so the prose can be revised without touching gameplay.
//
// Each realm has an intro line (always shown when the page is stamped) and a
// per-ending paragraph that swaps based on the CYOA branch Aiden took. The
// composition of his run is therefore visible on the page itself.

export interface RealmLore {
  title: string;
  intro: string;
  endings: Record<string, string>;
}

export const REALM_LORE: Record<string, RealmLore> = {
  "winter-mountain": {
    title: "The Winter Mountain",
    intro:
      "Wren stepped through the first portal into a cold dawn. The pines were dark, the snow waist-deep, and four wolves were already moving.",
    endings: {
      huntress:
        "At the fork he turned aside to free a huntress buried in the drifts. She spoke a few words in the wolf-tongue and the howls behind him fell quiet. She gave him her spiral horn before he climbed on.",
      firefly:
        "At the fork he followed three patient fireflies up between the pines. They came to rest inside a paper lantern hidden in a hollow tree, and he carried it down the mountain with him.",
    },
  },
};

export const REALM_ORDER = ["winter-mountain"];
