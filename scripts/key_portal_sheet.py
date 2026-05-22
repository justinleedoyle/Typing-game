"""Chroma-key the magenta-screened portal animation sheet AND realign the
8 frames into a uniform spritesheet under art/portal/.

The AI-generated source has 8 swirling-arch frames spread horizontally on a
magenta background, but each frame's arch sits at a slightly different x
within its 209-wide cell. Naive spritesheet playback then "slides" the
arch left-right as it cycles. Here we:

  1. Chroma-key magenta out to transparent.
  2. Slice each of the 8 frames.
  3. Find each frame's opaque bounding box and centre it in a new fixed-size
     cell so all 8 arches sit at the same relative x and y.
  4. Stack the re-centred cells horizontally into a new sheet.

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
N_FRAMES = 8


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


def bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    """Tight bounding box of opaque pixels — (x0, y0, x1, y1)."""
    alpha = np.asarray(frame)[..., 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        return 0, 0, frame.width, frame.height
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main() -> None:
    if not os.path.exists(SRC):
        print(f"missing: {SRC}")
        return
    os.makedirs(OUT_DIR, exist_ok=True)

    keyed = key_image(SRC)
    src_w, src_h = keyed.size
    cell_w = src_w // N_FRAMES

    # Step 1: extract each frame and its tight bbox.
    frames = []
    bboxes = []
    for i in range(N_FRAMES):
        x0 = i * cell_w
        frame = keyed.crop((x0, 0, x0 + cell_w, src_h))
        frames.append(frame)
        bboxes.append(bbox(frame))

    # Step 2: pick a uniform output cell big enough to hold every frame's bbox.
    out_w = max(x1 - x0 for x0, _, x1, _ in bboxes)
    out_h = max(y1 - y0 for _, y0, _, y1 in bboxes)

    # Step 3: re-centre each frame inside out_w × out_h.
    aligned = []
    for frame, (x0, y0, x1, y1) in zip(frames, bboxes):
        cropped = frame.crop((x0, y0, x1, y1))
        canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        offset = ((out_w - cropped.width) // 2, (out_h - cropped.height) // 2)
        canvas.paste(cropped, offset, cropped)
        aligned.append(canvas)

    # Step 4: stack horizontally into the new uniform sheet.
    sheet = Image.new("RGBA", (out_w * N_FRAMES, out_h), (0, 0, 0, 0))
    for i, frame in enumerate(aligned):
        sheet.paste(frame, (i * out_w, 0), frame)

    dst = os.path.join(OUT_DIR, OUT_NAME)
    sheet.save(dst)
    print(f"aligned portal sheet: {sheet.width}x{sheet.height} ({out_w}x{out_h} per frame) -> {dst}")


if __name__ == "__main__":
    main()
