"""Chroma-key the magenta-screened portal animation sheet into a transparent
spritesheet under art/portal/.

The source is a single PNG with 8 frames spread horizontally across a magenta
background. After keying, the arch shapes remain on a transparent canvas.
Each frame keeps the same 209-wide cell so Phaser can read it as a uniform
spritesheet.

Run from the repo root: python3 scripts/key_portal_sheet.py
"""

import os

import numpy as np
from PIL import Image

SRC = "art/references/portal-active.png"
OUT_DIR = "art/portal"
OUT_NAME = "portal-active-sheet.png"

SPILL_LO = 30.0
SPILL_HI = 120.0


def key_image(path: str) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    spill = np.minimum(r, b) - g
    alpha = np.clip((SPILL_HI - spill) / (SPILL_HI - SPILL_LO), 0.0, 1.0)

    magenta = spill > 0
    r = np.where(magenta, np.minimum(r, g), r)
    b = np.where(magenta, np.minimum(b, g), b)

    out = np.dstack([r, g, b, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    if not os.path.exists(SRC):
        print(f"missing: {SRC}")
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    keyed = key_image(SRC)
    dst = os.path.join(OUT_DIR, OUT_NAME)
    keyed.save(dst)
    print(f"portal sheet: {keyed.width}x{keyed.height} -> {dst}")


if __name__ == "__main__":
    main()
