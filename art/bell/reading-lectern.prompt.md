# Bell reading lectern

Created: 2026-10-27.

## Request and reference

A finite replacement for the schematic open-book stand observed in ordinary campaign capture 170, `.claude/playthrough-audit/2026-10-27-grounded-full/screenshots/170-bell-split-children-result.jpg`. The actual scene says “A room off the nave. Something on a stand.” and offers the native action “read it”. This asset task changes no source, mechanic, character or narrative.

Reference: `art/references/sunken-bell-clean.png` (1672 × 941), personally inspected before generation. It supplies the sunken cathedral's worn stone, teal moonlight, restrained old bronze and painterly texture only.

## Generation provenance

Mode: built-in `image_gen.imagegen`; no CLI, API key or paid-provider setup.

Arguments: `transparent_background: true`; `referenced_image_paths: ["/Users/justin/Projects/typing-game/art/references/sunken-bell-clean.png"]`.

Selected generated original:
`/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-b5c2c77c-66a9-45de-a5f4-42d9c814e9a3.png`.

Workspace copy: `art/bell/reading-lectern.png`. The copy preserves the exact generated PNG bytes, including alpha. No cropping, alpha cleanup, resampling or recoloring was performed. One output was generated and selected; no revisions were requested.

## Exact prompt

```text
Use case: illustration-story.
Asset type: one transparent painted floor prop for an existing side-view fantasy game.
Input image 1 is a STYLE, MATERIAL AND LIGHTING REFERENCE ONLY: the sunken cathedral's cool dark teal moonlight, worn stone, muted old bronze accents and irregular hand-painted brushwork. Do not reproduce its background or bell.
Primary request: an old stone reading stand with a single open weathered book resting securely on its sloped top. A modest thick uneven stone pedestal and broad low stone foot support the book. The aged ivory-gray pages are clearly open, slightly curled and water-worn, with a dark worn cover beneath. Pages have folds and texture but no legible letters or symbols.
Composition: one compact complete stand and book, near-frontal with a slightly elevated view matching the reference floor. Suitable at about 150–200 world pixels in a game scene; broad enough to recognize the open book and sturdy enough to touch the floor. Show the whole silhouette, especially a real flat bottom contact, with modest transparent padding.
Lighting/mood: restrained cool teal moonlight from the upper left, dark painted crevices. Retain only a very subtle old-book warmth on the page surfaces themselves, not a surrounding aura.
Materials: rough worn blue-gray stone, softened chipped edges, irregular painted parchment and cover. Painterly illustration with tactile surfaces, not photorealistic, clean vector or schematic geometry.
Background: genuinely transparent alpha. No environment, floor patch, external cast shadow, background rectangle, halo, fog, luminous rim, text, frame, characters, extra books or objects. Keep all illumination within the stand and book silhouette.
```

## Inspection and fit

The generated original was visually inspected: a complete rough stone pedestal with a broad grounded foot and a single weathered open book, empty textured pages and subdued warmth contained in the page surfaces. No scene, character, legible text or rectangular background is painted into the prop.

The actual RGBA PNG was independently decoded using standard-library Python `struct` and `zlib`:

- Raw dimensions: 1394 × 1128, RGBA8.
- Alpha range: 0–255; 1,014,750 fully transparent pixels; all four corner alpha values are 0.
- Visible bounds at alpha > 25/255: x 274, y 143, width 822, height 922; exclusive right 1096 and bottom 1065.
- Bounds at alpha > 5/255: x 273, y 143, right 1098, bottom 1067. These closely surround the material silhouette rather than a broad halo. Very faint alpha <= 5 edge pixels remain outside these bounds and are preserved.
- Bottom-center origin relative to the raw canvas: x 0.491392, y 0.944149.
- At 180 world pixels of visible width, visible height is 201.90. Fit by the painted bounds, not the padded raw canvas. A 150–180 world-pixel width gives an approximately 168–202 pixel-high prop; the integrator should choose the existing floor and label envelope, retaining a fixed grounded base.
- Native game-sized compositing and target clearance remain the integrating owner's next verification.

SHA-256: `fd71249041a032895d4452bd076ba143b61d17151de7f2cfd54410a18ecdc330`.
