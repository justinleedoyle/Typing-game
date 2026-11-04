# Old Gregor sprite

- Generated: 2026-10-22 with the built-in image generation tool; no CLI/API fallback.
- Asset: `art/forge/gregor.png` (1024 × 1536 RGBA PNG).
- Canon: `RESEARCH_AND_PLAN.md:465` identifies Old Gregor as a retired smith who teaches lowercase movement and capital commands. He is a separate person from Smith Forn.
- Style references inspected: `art/forge/forn.png` and `art/wren/wren-front.png`. Both were provided as style references during the final refinement and remain unchanged.
- Identity draft: `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-abdf2510-ed10-4f02-a8c3-2248e1eac7cf.png`.
- Selected refinement: `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-29af8108-95df-46e9-a55e-02f32770d035.png`. Copied into the project without editing the generated alpha.
- Visual review: one full-body elderly human, swept silver hair, short gray beard, worn gray shirt and plain leather apron, empty teaching hand, clean boot silhouettes; compact painted proportions distinguish the retired teacher from broad, hammer-bearing Forn. The first draft was rejected for more realistic proportions.
- Alpha inspection: all four corner alpha values are 0; 1,003,456 of 1,572,864 pixels are fully transparent. Sampled empty background at (100, 300), (100, 800), and (900, 500) also has alpha 0.
- Art direction choices: the existing canon defines age/role, not precise hair, clothes or gesture. Those details were selected to make him readable and distinct.

## Identity prompt

```text
Use case: illustration-story
Asset type: one full-body transparent NPC sprite for Portalwright, a hand-painted storybook fantasy typing adventure.
Primary request: Create Old Gregor, a retired human smith who patiently teaches a young traveler how to command clockwork golems. He is a DISTINCT new older character, not a golem and not the game's broad hammer-bearing Smith Forn.
Subject: One lean, slightly stooped elderly human man, visibly in his seventies, narrow weathered face, deep gray eyebrows, swept-back silver-gray hair receding at the temples and a short trimmed gray beard. Intelligent, kindly, dryly amused expression. His left hand rests naturally at his side and his right empty soot-blackened hand makes a small open-palmed teaching gesture. Both hands clearly human and anatomically sound.
Clothing: worn slate-gray long-sleeved work shirt with sleeves rolled at the forearms; simple faded brown leather smith's apron with a narrow waist belt; charcoal trousers and worn brown work boots. A retired working craftsman, modest and practical. No ornate buckles, patterned heraldry or leafy embroidery.
Style/medium: polished 2D hand-painted storybook game sprite, stylized humane proportions, readable shape and face at small game scale. Soft textured brushwork with crisp dark brown irregular contour outlines, painterly cel-shaded planes, restrained parchment-cream highlights and warm earthy shadows. Muted gray, charcoal, faded brown and tan palette; subtle forge-warm edge lighting. Not photorealistic, not 3D, not pixel art, not glossy anime.
Composition/framing: one centered standing character, full body from head to both boot soles, front three-quarter pose turned very slightly toward the viewer's right as if teaching someone nearby, stable feet at a common ground baseline. Entire silhouette including hands and boots comfortably inside frame. Tall portrait composition, generous transparent margin, no cropping.
Scene/backdrop: genuinely transparent alpha background; no environment, no floor plane, no shadow painted beyond his silhouette.
Constraints: only this one man. Empty hands, NO hammer, no sword, no weapon, no typewriter, no anvil, no robot components, no companions, no props, no caption, no letters, no watermark, no white or checkerboard background. Keep his stance calm and his silhouette slender so he is clearly distinct from a stocky active blacksmith.
```

## Final refinement prompt

```text
Use case: style-transfer.
Asset type: final transparent full-body NPC game sprite.
Image 1 is the EDIT TARGET: Old Gregor, an elderly retired human smith. Keep his distinct kindly narrow face, swept silver-gray hair and short beard, slate-gray rolled-sleeve shirt, plain worn brown apron, charcoal trousers, empty human hands with one small open-palmed teaching gesture, and both boots. He must remain a slender older retired teacher, not the other smith.
Image 2 is STYLE REFERENCE ONLY: Forn, the broad active smith. Do not copy his face, body, hammer, glove, decorative apron or accessories. Image 3 is STYLE REFERENCE ONLY: Wren. Do not copy the hood or protagonist. Preserve both reference files unchanged.
Change only Gregor's rendering and proportions to fit these existing storybook sprites: visibly larger readable head, compact four-to-five-head-tall full-body stylized anatomy, simpler broad hand-painted shade planes, slightly irregular dark ink contours, opaque watercolor/gouache cloth texture, muted earth palette and gentle even light. Face should be expressive and drawn, not realistically rendered. Make his head-to-body proportion close to Forn's but retain Gregor's visibly slimmer silhouette and short beard. Plain medieval slip-on work boots with no conspicuous modern laces.
Remove the brown diffuse aura/glow and any cast shadow around the character. Background must be genuine transparent alpha everywhere outside a crisp clean silhouette, no haze, no stage, no floor, no gradient, no checkerboard, no white matte. Full body including hands and soles inside the frame with clear transparent margins. One character only, no tool, no weapon, no props, no text or watermark.
```
