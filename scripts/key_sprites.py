"""Chroma-key the whole batch of generated sprites + relic icons.

Reads magenta-screened (#ff00ff) renders from art/references/ and writes
transparent, tightly-cropped PNGs to their final game locations. Same spill-key
as scripts/key_wolf.py, just driven by a (source -> destination) map so the
entire outstanding-art batch keys in one pass.

Run from the repo root: python3 scripts/key_sprites.py
"""

import os

import numpy as np
from PIL import Image

SRC_DIR = "art/references"

# source basename in art/references/  ->  destination path
SPRITES = {
    # enemies
    "forge-golem": "art/forge/golem.png",
    "bell-ghost": "art/bell/ghost.png",
    "sky-lantern-spirit": "art/sky/lantern-spirit.png",
    "wood-ghost": "art/wood/ghost.png",
    # bosses
    "command-golem": "art/forge/command-golem.png",
    "bell-warden": "art/bell/bell-warden.png",
    "bell-warden-awake": "art/bell/bell-warden-awake.png",  # optional variant
    "scholar-spirit": "art/sky/scholar-spirit.png",
    "ghost-king": "art/wood/ghost-king.png",
    "ghost-king-throne": "art/wood/ghost-king-throne.png",  # optional variant
    # NPCs
    "forn": "art/forge/forn.png",
    "olin": "art/bell/olin.png",
    "aurland": "art/bell/aurland.png",
    "etta": "art/sky/etta.png",
    # companions (also serve as their satchel icon)
    "snow-fox": "art/companions/snow-fox.png",
    "glass-fish": "art/companions/glass-fish.png",
    "brass-songbird": "art/companions/brass-songbird.png",
    "lantern-moth": "art/companions/lantern-moth.png",
    "wisp-cat": "art/companions/wisp-cat.png",
}

# relic icons: art/references/<id>.png -> art/relics/<id>.png
RELIC_ICONS = [
    "hunters-horn", "firefly-lantern", "cairn-token", "pelt-of-the-old-one",
    "quiet-chant", "lock-bar", "king-aurland", "trident-token", "bells-tongue",
    "bellows-hammer", "sabotage-wrench", "master-key", "golem-heart",
    "ettas-ledger", "beacon-spark", "wind-phrase", "tether-cord", "untethered-wind",
    "ash-vial", "shrine-token", "bone-flute", "ghost-kings-promise",
]
for _id in RELIC_ICONS:
    SPRITES[_id] = f"art/relics/{_id}.png"

# Spill-key tuning (matches key_wolf.py): magenta has high R+B, low G.
SPILL_LO = 30.0
SPILL_HI = 120.0
PAD = 8

# Downscale the KEYED game assets to sane sizes (the full-res magenta originals
# stay in art/references/ as the re-key source). The renders come out ~1000-1700px;
# in-game a sprite shows ~100-350px and an icon ~48-96px, so these caps keep the
# build lean with ample retina headroom. Longest edge, in px.
SPRITE_MAX_DIM = 640
ICON_MAX_DIM = 256


def key_image(path: str) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    spill = np.minimum(r, b) - g
    alpha = np.clip((SPILL_HI - spill) / (SPILL_HI - SPILL_LO), 0.0, 1.0)

    # Despill: pull the magenta-tinted edge pixels back toward neutral.
    magenta = spill > 0
    r = np.where(magenta, np.minimum(r, g), r)
    b = np.where(magenta, np.minimum(b, g), b)

    out = np.dstack([r, g, b, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def crop_to_subject(img: Image.Image) -> Image.Image:
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        return img
    x0, x1 = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, img.width)
    y0, y1 = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, img.height)
    return img.crop((x0, y0, x1, y1))


def downscale(img: Image.Image, max_dim: int) -> Image.Image:
    longest = max(img.width, img.height)
    if longest <= max_dim:
        return img
    scale = max_dim / longest
    size = (round(img.width * scale), round(img.height * scale))
    return img.resize(size, Image.LANCZOS)


def main() -> None:
    done = 0
    missing = []
    for basename, dst in SPRITES.items():
        src = os.path.join(SRC_DIR, f"{basename}.png")
        if not os.path.exists(src):
            missing.append(basename)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        max_dim = ICON_MAX_DIM if dst.startswith("art/relics/") else SPRITE_MAX_DIM
        keyed = downscale(crop_to_subject(key_image(src)), max_dim)
        keyed.save(dst)
        done += 1
        print(f"{basename}: {keyed.width}x{keyed.height} -> {dst}")
    print(f"\nkeyed {done} sprite(s).")
    if missing:
        print(f"skipped {len(missing)} missing (ok if optional): {', '.join(missing)}")


if __name__ == "__main__":
    main()
