"""Key the Quiet Lord sprite off its near-white background into a
transparent, tightly-cropped sprite under art/quiet-lord/.

Unlike the other characters, this render was produced on a white backdrop
rather than chroma-key magenta. We alpha-out bright pixels via a brightness
ramp, preserving the dark cloak and the violet paper-fragment dust at the
hem.

Run from the repo root: python3 scripts/key_quiet_lord.py
"""

import os

import numpy as np
from PIL import Image

SRC_DIR = "art/references"
OUT_DIR = "art/quiet-lord"
POSES = [
    "quiet-lord",
]

# Alpha ramp on brightness: pixels at or below LO stay opaque, at or above HI
# become fully transparent. The window between catches edge anti-alias pixels.
BRIGHT_LO = 210.0
BRIGHT_HI = 248.0
PAD = 8


def key_image(path: str) -> Image.Image:
    rgba = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    r, g, b, src_alpha = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]

    brightness = (r + g + b) / 3.0
    alpha = np.clip(
        (BRIGHT_HI - brightness) / (BRIGHT_HI - BRIGHT_LO), 0.0, 1.0
    ) * (src_alpha / 255.0)

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
