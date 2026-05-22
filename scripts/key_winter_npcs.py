"""Chroma-key the magenta-screened Winter Mountain NPC sprites into
transparent, tightly-cropped sprites under art/winter/.

Run from the repo root: python3 scripts/key_winter_npcs.py
"""

import os

import numpy as np
from PIL import Image

SRC_DIR = "art/references"
OUT_DIR = "art/winter"
POSES = [
    "heldur",
    "huntress",
]

SPILL_LO = 30.0
SPILL_HI = 120.0
PAD = 8


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


def crop_to_subject(img: Image.Image) -> Image.Image:
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        return img
    x0, x1 = max(xs.min() - PAD, 0), min(xs.max() + PAD + 1, img.width)
    y0, y1 = max(ys.min() - PAD, 0), min(ys.max() + PAD + 1, img.height)
    return img.crop((x0, y0, x1, y1))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for basename in POSES:
        src = os.path.join(SRC_DIR, f"{basename}.png")
        if not os.path.exists(src):
            print(f"skip (missing): {src}")
            continue
        keyed = crop_to_subject(key_image(src))
        dst = os.path.join(OUT_DIR, f"{basename}.png")
        keyed.save(dst)
        print(f"{basename}: {keyed.width}x{keyed.height} -> {dst}")


if __name__ == "__main__":
    main()
