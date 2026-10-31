# Forn after giving Wren his Hammer

- Created: 2026-10-28
- Tool: built-in imagegen, precise-object-edit, transparent background
- Edit target: `art/forge/forn.png`; original preserved
- Output: `art/forge/forn-empty-hands.png` (1118 × 1407 RGBA)
- Scene use: the completed third repair phrase and its following repair beat. The original 509 × 640 texture frame is retained by a runtime normalized texture. Measured alpha > 25 vertical bounds are original [6,634), alternate [10,1387); the runtime fit aligns those painted head/boot bounds exactly. Actor position, origin, scale, boots baseline, existing tweens, rewards and reading gates are unchanged. The original hammer-bearing pose remains before the gift.

Final prompt:

> Use case: precise-object-edit. Asset type: a received-item animation pose for an existing transparent 2D story game sprite. Image 1 is the exact edit target, not a style reference. Remove ONLY the gifted hammer from Forn's raised glove on the viewer's left. Remove the brass hammer head above the glove and every visible section of its wooden handle above and below the glove. Preserve the glove itself in exactly the same raised hand position, with fingers naturally relaxed or lightly curled after handing the hammer to Wren; the glove holds nothing. Keep every other part unchanged: identical kind elderly face, silver beard and hair, stocky body, clothing, apron ornament, belt tools, other gloved hand, stance, separated boots, proportions, brushwork, dark outlines, warm palette, shading, and original full-body silhouette except for the removed hammer. Preserve the original 508 by 640 canvas framing, exact actor size and position in that canvas, boot bottom baseline, and transparent alpha background. Do not move, resize, recenter, crop, redraw or redesign Forn. No hammer, handle, new tool, weapon, item, scenery, lettering, border or background. This alternate texture will replace the original at its exact existing game anchor and displayed height; only item ownership changes.

The prompt width was one pixel below the measured original (509). Imagegen returned a higher-resolution image with matching framing; runtime normalization uses the actual original dimensions, never the prompt value.
