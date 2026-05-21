"""Chroma-key the magenta-screened Wren reference art into transparent,
tightly-cropped sprites under art/wren/.

Run from the repo root: python3 scripts/key_wren.py
"""

import os

import numpy as np
from PIL import Image

SRC_DIR = "art/references"
OUT_DIR = "art/wren"
POSES = [
    "wren-front",
    "wren-back",
    "wren-idle-right",
    "wren-walk-right",
    "wren-cast",
    "wren-hurt",
]

# Alpha ramp on the magenta-spill metric: <=LO fully opaque, >=HI fully cut.
SPILL_LO = 30.0
SPILL_HI = 120.0
# Crop padding around the keyed subject, in px.
PAD = 8


def key_image(path: str) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # Magenta = high R + high B, low G. spill is large on the screen colour.
    spill = np.minimum(r, b) - g
    alpha = np.clip((SPILL_HI - spill) / (SPILL_HI - SPILL_LO), 0.0, 1.0)

    # Despill: pull the magenta cast out of edge pixels by capping R/B at G.
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
    for pose in POSES:
        src = os.path.join(SRC_DIR, f"{pose}.png")
        if not os.path.exists(src):
            print(f"skip (missing): {src}")
            continue
        keyed = crop_to_subject(key_image(src))
        dst = os.path.join(OUT_DIR, f"{pose}.png")
        keyed.save(dst)
        print(f"{pose}: {keyed.width}x{keyed.height} -> {dst}")


if __name__ == "__main__":
    main()
