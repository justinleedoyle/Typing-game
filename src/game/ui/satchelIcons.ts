// Shared satchel-icon loader. A relic/companion id maps to its painted icon at
// art/relics/<id>.png (companions reuse art/companions/<id>.png). Bulk-imported
// via Vite glob so a new art file is picked up without editing a list. The
// Almanac collection and the in-combat console band show the SAME painted icons,
// keyed identically, so a preload in either place is reused.

import type Phaser from "phaser";

const RELIC_ICON_URLS = import.meta.glob("../../../art/relics/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const COMPANION_ICON_URLS = import.meta.glob("../../../art/companions/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function urlFor(id: string): string | null {
  const relic = RELIC_ICON_URLS[`../../../art/relics/${id}.png`];
  if (relic) return relic;
  return COMPANION_ICON_URLS[`../../../art/companions/${id}.png`] ?? null;
}

/** Phaser texture key + source URL for a satchel id's icon, or null if no art.
 *  The key matches the Almanac's (`almanac-icon-<id>`) so loads are shared. */
export function satchelIconFor(
  id: string,
): { key: string; url: string } | null {
  const url = urlFor(id);
  return url ? { key: `almanac-icon-${id}`, url } : null;
}

/** Preload icons for the given satchel ids (skips ids without art or already
 *  loaded). Call from a scene's preload(). */
export function preloadSatchelIcons(
  scene: Phaser.Scene,
  ids: readonly string[],
): void {
  for (const id of ids) {
    const icon = satchelIconFor(id);
    if (icon && !scene.textures.exists(icon.key)) {
      scene.load.image(icon.key, icon.url);
    }
  }
}
