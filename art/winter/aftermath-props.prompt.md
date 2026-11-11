# Winter aftermath props

Created: 2026-10-27.

## Request and reference

Replace the flat cairn and pelt cues observed in ordinary campaign capture 069, `.claude/playthrough-audit/2026-10-27-grounded-full/screenshots/069-winter-after-old-one-reading.jpg`, with two painted scene props. Preserve accepted Winter art and game canon. No source code is changed by this asset task.

Style reference: `art/references/winter-mountain-clean.png` (1672 × 941), personally inspected before generation. The reference supplies brushwork, palette, viewpoint and moonlight only.

## Tool and source provenance

Built-in `image_gen.imagegen` mode; no CLI, API key or paid-provider setup. Every call used `transparent_background: true`. The final workspace PNGs are byte-for-byte copies of the selected generated originals; no alpha cleanup, recoloring, cropping or resampling was applied after generation.

- Initial cairn: `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-3d0da562-2cbc-41e1-9d25-921c752ba78f.png`. Not selected; a targeted alpha-edge edit was requested after its preview showed a soft halo.
- **Selected cairn:** `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-9282a6d3-1f57-4819-b4c6-9548f3e90130.png` → `art/winter/aftermath-cairn.png`.
- **Selected pelt:** `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-6bdbcc17-c622-46be-9f6a-b33e151ce2c8.png` → `art/winter/aftermath-pelt.png`.

## Exact initial cairn prompt

Input: `referenced_image_paths: ["/Users/justin/Projects/typing-game/art/references/winter-mountain-clean.png"]`.

```text
Use case: illustration-story.
Asset type: one transparent painted scene prop for an existing side-view fantasy typing game.
Input image 1 is a STYLE AND LIGHTING REFERENCE ONLY: match its cool blue-gray slate, soft moonlight, restrained painterly texture and irregular hand-painted edges. Do not reproduce the landscape.
Composition: a single broad, compact object, seen from the same slightly elevated near-frontal game viewpoint, suitable for display at about 160–190 world pixels wide. Keep the entire silhouette and flat grounded bottom edge visible with modest transparent padding.
Lighting: cool winter moonlight from upper left, muted dark blue-gray shadows belonging to the object itself.
Background: genuinely transparent alpha, with no environment, ground patch, background color, external cast shadow, glow, halo, text, frame or characters.
Avoid photorealism, smooth vector geometry, bright highlights and decorative additions.
Primary request: a low, rough natural cairn of about seven irregular slate stones. Broad rough stones sit securely across the bottom, with progressively fewer smaller stones above. Make the pile wider than it is tall, naturally uneven rather than a precise pyramid or Zen pebble sculpture. Thin patches of old snow dust the upper stone planes and a few crevices. The lowest stones share a believable flat contact plane. No symbols, carvings, flowers, cross, body or grave opening.
```

## Exact cairn alpha-edge edit prompt

Input: `referenced_image_paths: ["/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-3d0da562-2cbc-41e1-9d25-921c752ba78f.png"]`.

```text
Use case: precise-object-edit.
Asset type: transparent painted game prop.
Input image 1 is the edit target: the snow-dusted slate cairn. Change ONLY the unwanted foggy glow / gray-blue halo around the outside of the stones into full transparency.
Preserve the existing stone shapes, arrangement, size, perspective, snow patches, texture, brushwork, cool moonlight and flat bottom contact exactly.
Every pixel outside the actual rocks and their snow must be genuinely transparent. Keep natural antialiasing confined to the immediate irregular stone silhouette. No aura, haze, glow, bloom, vignette, gradient, ground patch or cast shadow. No new objects, background or text.
The result should be the same rough low cairn, cleanly isolated with true alpha, suitable for compositing onto an already-painted snowbank.
```

## Exact pelt prompt

Input: `referenced_image_paths: ["/Users/justin/Projects/typing-game/art/references/winter-mountain-clean.png"]`.

```text
Use case: illustration-story.
Asset type: one transparent painted scene prop for an existing side-view fantasy typing game.
Input image 1 is a STYLE AND LIGHTING REFERENCE ONLY: match its cool blue-gray slate, soft moonlight, restrained painterly texture and irregular hand-painted edges. Do not reproduce the landscape.
Composition: a single broad, compact object, seen from the same slightly elevated near-frontal game viewpoint, suitable for display at about 160–190 world pixels wide. Keep the entire silhouette and flat grounded bottom edge visible with modest transparent padding.
Lighting: cool winter moonlight from upper left, muted dark blue-gray shadows belonging to the object itself.
Background: genuinely transparent alpha, with no environment, ground patch, background color, external cast shadow, glow, halo, text, frame or characters.
Avoid photorealism, smooth vector geometry, bright highlights and decorative additions.
Primary request: a non-graphic folded/slumped winter wolf pelt lying in a low broad compact heap. Thick gray-silver fur with darker slate guard hairs and an irregular soft edge; overlapping folded fur surfaces give it weight. A short fold of bushy tail may rest along the side. The material looks like fur, not brown leather or a living animal. No head, face, eyes, standing body, blood, gore, wounds, exposed flesh, bones or stretched trophy shape. Its lowest folded fur edge rests on one flat grounded contact plane.
```

## Inspection and integration measurements

Both selected originals were visually inspected and their PNG alpha channels independently decoded with Python's standard-library `struct` and `zlib`. Bounds below use alpha > 25/255 (about 10%) and exclusive right/bottom edges, avoiding nearly transparent matte-edge pixels when fitting the visible object. Preserve the generated alpha; fit the visible silhouette rather than raw padded canvas.

| Asset | Raw size | Visible bounds x/y/width/height | Visible bottom-center origin in raw canvas | Visible height at 180 world px wide |
| --- | --- | --- | --- | --- |
| Cairn | 1536 × 1024 RGBA8 | 79 / 190 / 1383 / 666 | 0.501628 / 0.835938 | 86.68 |
| Pelt | 1672 × 941 RGBA8 | 14 / 176 / 1639 / 617 | 0.498505 / 0.842721 | 67.76 |

- Cairn alpha range: 0–254; 1,021,602 fully transparent pixels; all four corners alpha 0. Bounds at alpha > 5 are x79/y190/right1463/bottom856, closely matching the stones rather than an external glow. Very faint alpha <= 5 pixels extend beyond this bound.
- Pelt alpha range: 0–255; 838,745 fully transparent pixels; corner alpha values top-left/top-right/bottom-left/bottom-right are 0/0/1/0. Bounds at alpha > 5 are x13/y175/right1653/bottom793; the one alpha-1 corner pixel is retained rather than destructively processing generated transparency.
- The selected cairn is a broad irregular pile of snow-dusted slate; the pelt is a folded gray fur heap without a head, gore or a living-body pose. Both have a low grounded base suitable for the existing aftermath choice positions. Game-sized native scene confirmation remains the integrator's next check.

SHA-256:
- `aftermath-cairn.png`: `335630ba6aa551c5c4fb1e48b7be69796765b504062d9e6b40b35b59d68b73ec`
- `aftermath-pelt.png`: `b8defb22f003dae6d138322cc9d847b728857cd4a1561d4504e0f988779fe6a3`
