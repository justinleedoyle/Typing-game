# Forge apprentice speaker

- Generated 2026-10-23 with the built-in image generation tool; no CLI/API fallback.
- Asset: `art/forge/apprentice.png`, 1024 × 1536 RGBA PNG, copied without modifying generated alpha.
- Original: `/Users/justin/.codex/generated_images/01a16461-b3e6-7c92-8b18-d7e50122e2f8/exec-05a60d4c-e2d7-4f90-b25b-da166ea147bc.png`.
- Canon: `RESEARCH_AND_PLAN.md` identifies rebel apprentices and their Cabal. `src/game/almanacLorePages.ts` records their established wish to choose their own orders and fires. No personal name or new plot was added.
- Existing style references inspected: `art/forge/forn.png`, `art/forge/gregor.png`, `art/wren/wren-front.png`. All remain unchanged. A new young adult worker provides a distinct speaker rather than reusing either older smith.
- Art direction choices: canon did not specify the speaker's gender, complexion, hair or clothes. These details distinguish the unnamed representative. One full-body worker, empty open hand, practical clothes, no weapon.
- Visual inspection: complete hands and boots, readable drawn face, clean isolated silhouette. All four corner alpha values and four sampled background points are 0; 1,097,550 of 1,572,864 pixels are fully transparent.
- The game renders a head-and-shoulders HUD crop from the same texture at runtime; no second generated identity or edited image file is used.

## Prompt

```text
Use case: illustration-story.
Asset type: one full-body transparent NPC game sprite for Portalwright, a hand-painted storybook fantasy typing adventure. A distinct young adult foundry apprentice who speaks for the rebel apprentices; no personal name added.
Primary request: one human woman in her early twenties, compact stylized four-and-a-half-head-tall proportions, warm brown skin, dark curly hair tied in a short practical puff, expressive dark eyebrows, resolute but welcoming face. One soot-marked hand rests on her hip; the other empty hand is loosely open as if explaining a plan. Clear eyes and readable face suitable for a small HUD portrait crop. She must be recognizably different from the existing older bearded smiths.
Clothing: practical faded russet rolled-sleeve work shirt, plain worn dark-brown waist apron with one modest tool loop but no dangling tools, muted charcoal trousers, sturdy low medieval brown work boots. Small cream cloth wrist wrap. No armor or heraldry.
Style: match the established Forn, Gregor and hooded Wren game sprites: polished 2D hand-painted storybook/gouache, compact humane proportions and a readable larger head, irregular dark brown contour lines, broad painterly shaded planes, parchment-cream edge highlights, restrained warm earth colors. Soft even light with a faint forge-warm edge. Not photographic, not 3D, not anime, not pixel art.
Composition: centered full standing body from hair to both boot soles; front three-quarter angle facing slightly toward the viewer's left so she can stand on the right of Wren; both hands, boots, and entire silhouette comfortably inside a portrait frame with generous transparent margins.
Background: genuine transparent alpha everywhere outside the figure; no environment, floor, cast shadow, vignette, haze or glow.
Constraints: exactly one apprentice, empty hands, no weapon, no hammer, no wrench, no robot parts, no extra people, no scenery, no lettering, no caption, no watermark. Preserve clean separated silhouette for a side-view game actor and a head-and-shoulders crop.
```
