# Sky traversal lantern

Created: 2026-10-27.

Mode: built-in `image_gen.imagegen`, with `transparent_background: true`. No CLI, API key or paid-provider setup was used.

Style reference: `art/references/sky-island-clean.png` (1672 × 941), inspected before generation. Ordinary captures 407 (`sky-first-traversal-object`), 409 (`sky-next-traversal-action`) and 411 (`sky-third-traversal-object`) in `.claude/playthrough-audit/2026-10-27-grounded-full/screenshots/` were also inspected to bound the replacement. The reference supplies accepted sunset lighting, materials, viewpoint and painted edges; it is not a background edit.

Exact reference argument: `referenced_image_paths: ["/Users/justin/Projects/typing-game/art/references/sky-island-clean.png"]`.

The workspace PNG is a byte-for-byte copy of its selected generated original. Generated alpha was retained without cropping, cleanup, resampling or recoloring. Each asset was generated once and selected without iteration. This asset task makes no source, game mechanic, phrase, story, timing or character change.

## Selected original

`/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-40cb134b-6746-479d-93de-90fc50517fef.png` → `art/sky/traversal-lantern.png`.

## Exact prompt

```text
Use case: illustration-story.
Asset type: one transparent painted hanging paper-lantern prop for an existing side-view fantasy game.
Input image 1 is a STYLE AND SUBJECT REFERENCE: match the existing island's warm amber paper lanterns, dark weathered top and bottom rims, fine ribs, soft hand-painted texture and golden sunset. Do not reproduce its landscape, posts or cables.
Primary request: a single gently oval paper lantern, its main body about 1.25 times as tall as wide, with slightly irregular translucent amber parchment stretched over slender ribs. A small warm candle flame is visible softly within the paper. Keep the light concentrated within the paper body. Include a small centered hanging eye at the very top and a modest lower rim; no dangling tassel.
Composition: isolated complete lantern viewed near-front at the same slightly elevated angle as the reference. Compact readable silhouette, suitable at roughly 80–105 world pixels tall. Its centered top hanging eye must be clear for attaching to the game's existing rope.
Lighting: restrained sunset warmth, subtle darker right side, lit parchment readable against a warm scene without a luminous surrounding aura.
Background: genuinely transparent alpha, with modest padding. No rope, cord, chain, support, hand, character, setting, text, logo, background rectangle, external cast shadow, halo, fog or scattered sparkles. No heavy cage or ornate new decoration. Painterly illustration with soft irregular edges, not flat vector shapes or photorealism.
```

## Visual and alpha inspection

The actual generated original was viewed before selection: an amber paper lantern with fine ribs, weathered upper/lower rims, centered hanging eye and a small candle flame visible within the paper. Light stays within the material; no attachment rope, setting, hand or external shadow is painted into the prop.

PNG alpha was independently measured with the bundled Python/Pillow runtime:

- Raw size: 1122 × 1402, RGBA8; alpha range 0–255.
- Fully transparent pixels: 1,046,510; all four corner alpha values 0.
- Visible bounds at alpha > 25/255: x244, y139, width629, height1102; exclusive right873, bottom1241.
- Bounds at alpha > 5/255: x243, y139, exclusive right875, bottom1241. These hug the material rather than a broad aura; faint alpha <= 5 edge pixels are retained.
- TOP-center origin in raw canvas: x0.497771836, y0.099144080. This places the visible top of the hanging eye at the existing attachment endpoint. The eye hole center is approximately pixel 559,198 if the integrator chooses to run the existing cord through the eye instead.
- Bottom-center origin: x0.497771836, y0.885164051.
- The eye and rim add height above/below the paper body. Preserve uniform scale and use the existing cue/rope envelope, fitting by actual alpha bounds rather than the padded canvas. Do not draw a second painted rope.
- Native scene attachment, word clearance and lift action remain with the source integrator.

SHA-256: `f3c6142286399648ca9676c97737bdcbff85bd2052c45dc90a204c1b0a4b0b1b`.
