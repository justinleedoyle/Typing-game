// Shared satchel-icon loader. A relic id maps to art/relics/<id>.png; a companion
// id maps to its creature sprite in art/companions/ (a couple of ids don't match
// the filename — e.g. snow-fox-cub → snow-fox). Bulk-imported via Vite glob so a
// new art file is picked up without editing a list. The Almanac collection and
// the in-combat console band show the SAME painted icons, keyed identically
// (`almanac-icon-<id>`), so a preload in either place is reused.

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

// Companion relic-id → its creature art basename. Mirrors AlmanacScene so both
// surfaces resolve the same icons (notably snow-fox-cub → snow-fox).
const COMPANION_ICON_FILE: Record<string, string> = {
  "snow-fox-cub": "snow-fox",
  "glass-fish": "glass-fish",
  "brass-songbird": "brass-songbird",
  "lantern-moth": "lantern-moth",
  "wisp-cat": "wisp-cat",
};

/** Resolve `<dir>/<name>.png` to its bundled URL from a glob map. */
function globUrl(
  urls: Record<string, string>,
  name: string,
): string | undefined {
  for (const [path, url] of Object.entries(urls)) {
    if (path.endsWith(`/${name}.png`)) return url;
  }
  return undefined;
}

/** Phaser texture key + source URL for a satchel id's icon, or null if no art.
 *  The key matches the Almanac's (`almanac-icon-<id>`) so loads are shared. */
export function satchelIconFor(
  id: string,
): { key: string; url: string } | null {
  const file = COMPANION_ICON_FILE[id];
  const url = file
    ? globUrl(COMPANION_ICON_URLS, file)
    : globUrl(RELIC_ICON_URLS, id);
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
