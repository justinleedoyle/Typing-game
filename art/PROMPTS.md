# Art Direction & Image Prompts

The locked style, character, and scene prompts used to generate Touch Type Tale sequel art. Reference images live in `art/references/` — see "Reference image checklist" at the bottom.

## How to use this

1. **Upload `references/wren-character-sheet.png`** as a style/image reference in your generator (any tool that supports image reference, style reference, or img2img).
2. **Paste the Style Anchor first**, then the scene-specific prompt text.
3. Where a scene-specific prompt contains `[STYLE ANCHOR]` or `[WREN DESCRIPTION]`, substitute the matching block below.

---

## Style Anchor

Paste at the start of every prompt.

```
2D game background art, flat stylized illustration with subtle soft shading,
side-view perspective. Deep navy-dark backgrounds, muted earthy color palette
with warm accent lighting. Clean character silhouettes, chibi-proportioned
figures, simplified shapes. Art style matching the attached character reference:
soft flat illustration, limited palette, dark fantasy cozy aesthetic.
No photorealism. 16:9, 1920x1080.
```

## Wren description

Paste this anywhere Wren appears in a scene.

```
Small chibi-proportioned hooded traveler: muted sage-green cloak with subtle
cream leaf-pattern border at hem, small round brass clasp at chest, dark warm
skin barely visible under deep hood, brown trousers, simple leather shoes.
Strong clean silhouette, readable at small scale.
```

---

## Characters

### Wren — character sheet

Reference: `references/wren-character-sheet.png` *(the master style anchor — upload this in every generation)*

This sheet was generated separately and is the visual ground truth for Wren's proportions, palette, and silhouette. All scene prompts reference back to it.

### Runa

Reference: `references/runa-portrait.png`

Generate after Wren; pass the Wren sheet as style reference for consistency.

```
[STYLE ANCHOR]
Character design, single pose, isolated on deep navy background.
Seated scholar: chibi-proportioned figure in a deep navy-blue coat with
brass buttons, short dark hair, warm brown skin, small round spectacles.
Seated at a heavy wooden desk, leaning slightly forward over an open book,
quill in hand, small oil lamp to one side casting warm amber glow.
Same flat stylized illustration style as attached reference. Full figure visible.
```

---

## Locations

### Hub — Portal Chamber

Reference: `references/hub-portal-chamber.png`

```
[STYLE ANCHOR]
Wide establishing shot, dark fantasy library portal chamber, side-view.
Stone floor with faint inlaid brass circle. Six tall wooden bookshelves
lining the back wall with books and candles. Five stone archways in a row
center-stage: archway 1 filled with warm amber glow (cleared), archway 2
filled with swirling ice-blue portal energy (active, glowing brightly),
archways 3-5 sealed dark stone. Far left: heavy wooden scholar's desk,
seated scholar in navy coat (Runa), oil lamp. Far right: tall glass display
cabinet with brass trim. [WREN DESCRIPTION] standing center-floor facing
the arches. Deep navy background, warm brass and amber candlelight pools
on stone floor.
```

### Opening Scene — Typewriter Study

Reference: `references/opening-typewriter-study.png`

```
[STYLE ANCHOR]
Game background, intimate warm study at night, side-view.
Small wooden desk with an antique brass typewriter center-stage.
Single oil lamp casting warm amber circle of light. Bookshelves floor
to ceiling. Dark window showing night outside. Papers and inkwells on desk.
[WREN DESCRIPTION] seated or standing at the desk, looking at the typewriter.
Cozy but slightly mysterious. Color palette: warm amber lamplight,
deep shadow browns and blacks, cream paper. Quiet, personal.
```

### Winter Mountain

Reference: `references/winter-mountain.png`

```
[STYLE ANCHOR]
Game background scene, snowy mountain peak at night, side-view.
Stone ruins and old cairns partially buried in snow. Ancient pine forest
in mid-ground, branches heavy with ice. Blizzard wind sweeping left to right.
Faint aurora borealis in dark sky. Narrow mountain path winding through.
[WREN DESCRIPTION] small figure on the path, facing right.
Color palette: ice blue, snow white, deep charcoal grey, dark pine green,
faint aurora purple. Cold, vast, quiet.
```

### Sunken Bell

Reference: `references/sunken-bell.png`

```
[STYLE ANCHOR]
Game background scene, underwater stone chamber, side-view.
Ancient carved stone walls and columns submerged in deep water.
A massive bronze bell resting on the ocean floor, partially buried in sand,
encrusted with barnacles. Shafts of pale filtered light from far above.
Bioluminescent sea creatures drifting past. [WREN DESCRIPTION] small figure
standing near the bell, somehow breathing underwater (no explanation needed).
Color palette: deep teal, blue-green, aged bronze, pale bioluminescent
white-green. Still, heavy, ancient.
```

### Clockwork Forge

Reference: `references/clockwork-forge.png`

```
[STYLE ANCHOR]
Game background scene, underground mechanical forge, side-view.
Enormous gears and pistons filling the chamber walls, iron walkways,
glowing forge fires deep in background. Steam venting from pipes.
A massive clockwork heart mechanism visible at center background.
Coal-black walls with brass and copper fittings. [WREN DESCRIPTION]
small figure on an iron walkway, facing right.
Color palette: deep burnt orange, rust red, brass, dark iron grey,
white steam. Hot, industrial, alive with motion.
```

### Sky Island

Reference: `references/sky-island.png`

```
[STYLE ANCHOR]
Game background scene, floating stone island high above clouds, side-view.
Stone and grass platform with wooden posts and ropes strung with paper lanterns.
Clouds below and around the island. View of a tiny distant world far below.
Golden-hour warm sunset light. [WREN DESCRIPTION] small figure near the edge
looking out, facing right.
Color palette: warm golden yellow, pale blue sky, cloud white, soft amber.
Light, airy, open, hopeful.
```

### Haunted Wood

Reference: `references/haunted-wood.png`

```
[STYLE ANCHOR]
Game background scene, ancient haunted forest at night, side-view.
Massive gnarled trees with twisted roots, branches interlocking overhead
blocking most sky. Thick ground mist drifting between trunks at knee height.
Pale will-o-wisp lights floating in mid-distance. Old moss-covered stone
markers. Moonlight in thin shafts through canopy. [WREN DESCRIPTION]
small figure on a forest path, facing right.
Color palette: deep forest green, fog grey, pale moon-white, muted purple,
dark bark brown. Quiet, eerie, watching.
```

### Great Battle

Reference: `references/great-battle.png`

```
[STYLE ANCHOR]
Game background scene, dramatic night battlefield, side-view.
A stone fortress village (Hearthward) on a hill in the far background,
torch-lit windows, defensive walls. Open dark ground in foreground.
Turbulent dark sky with distant fire glow on horizon. A sense of an
approaching force, tension before a siege. No armies visible — just the
landscape holding its breath. [WREN DESCRIPTION] small figure standing
center, facing the fortress.
Color palette: deep navy, warm torch orange, ember red, shadow black.
Tense, vast, consequential.
```

---

## UI

### Almanac UI Overlay

Reference: `references/almanac-ui.png`

```
[STYLE ANCHOR]
Open leather-bound book floating on solid deep navy background, slight angle.
Aged cream-colored pages, slightly yellowed at edges. Dark leather cover
with brass corner fittings and a brass clasp on the right side.
Left page: faint illustrated header decoration (leaves and small linework).
Right page: aged handwritten-style ruled lines, no actual readable text.
A dark silk bookmark ribbon hanging below. Warm candlelight falling on pages.
Matches the cozy dark fantasy aesthetic of the attached style reference.
Isolated — no other background elements.
```

---

## Game-ready clean backgrounds (no Wren)

The scene prompts above produce beautiful concept art with Wren painted into the
foreground. That's a blocker for animation: in-game, Wren has to walk, advance,
take damage, and stand at different positions per beat — a painted-in figure
locks all of that.

These regenerations remove Wren so the scenes become *stages* he can walk into.
Wren is composited in at runtime as a sprite (cropped/exported from
`wren-character-sheet.png`) with a transparent background.

**Workflow is the same** — Style Anchor first, attach `wren-character-sheet.png`
as the style reference — but the scene text drops the `[WREN DESCRIPTION]` line
and explicitly calls out empty foreground space.

**For the Hub:** Runa stays painted in at her desk (she's a fixed NPC, never
moves). Only Wren is removed. Same for the Almanac UI — no character, unchanged.

### Hub — Portal Chamber (clean)

Reference (when generated): `references/hub-portal-chamber-clean.png`

```
[STYLE ANCHOR]
Wide establishing shot, dark fantasy library portal chamber, side-view.
Stone floor with faint inlaid brass circle. Six tall wooden bookshelves
lining the back wall with books and candles. Five stone archways in a row
center-stage: archway 1 filled with warm amber glow (cleared), archway 2
filled with swirling ice-blue portal energy (active, glowing brightly),
archways 3-5 sealed dark stone. Far left: heavy wooden scholar's desk,
seated scholar in navy coat (Runa), oil lamp. Far right: tall glass display
cabinet with brass trim. Empty stone floor center where a traveler would
stand — no traveler figure present, no hooded character, empty playfield.
Deep navy background, warm brass and amber candlelight pools on stone floor.
```

### Opening Scene — Typewriter Study (clean)

Reference (when generated): `references/opening-typewriter-study-clean.png`

```
[STYLE ANCHOR]
Game background, intimate warm study at night, side-view.
Small wooden desk with an antique brass typewriter center-stage.
Single oil lamp casting warm amber circle of light. Bookshelves floor
to ceiling. Dark window showing night outside. Papers and inkwells on desk.
Empty wooden stool beside the desk — no character figure in scene, no
hooded traveler, empty playfield. Cozy but slightly mysterious.
Color palette: warm amber lamplight, deep shadow browns and blacks,
cream paper. Quiet, personal.
```

### Winter Mountain (clean)

Reference (when generated): `references/winter-mountain-clean.png`

```
[STYLE ANCHOR]
Game background scene, snowy mountain peak at night, side-view.
Stone ruins and old cairns partially buried in snow. Ancient pine forest
in mid-ground, branches heavy with ice. Blizzard wind sweeping left to right.
Faint aurora borealis in dark sky. Narrow mountain path winding through
empty foreground — no traveler figure on the path, no hooded character,
empty playfield ready for a sprite to walk in from the left.
Color palette: ice blue, snow white, deep charcoal grey, dark pine green,
faint aurora purple. Cold, vast, quiet.
```

### Sunken Bell (clean)

Reference (when generated): `references/sunken-bell-clean.png`

```
[STYLE ANCHOR]
Game background scene, underwater stone chamber, side-view.
Ancient carved stone walls and columns submerged in deep water.
A massive bronze bell resting on the ocean floor, partially buried in sand,
encrusted with barnacles. Shafts of pale filtered light from far above.
Bioluminescent sea creatures drifting past. Empty sandy floor in the
foreground beside the bell — no character figure, no hooded traveler,
empty playfield.
Color palette: deep teal, blue-green, aged bronze, pale bioluminescent
white-green. Still, heavy, ancient.
```

### Clockwork Forge (clean)

Reference (when generated): `references/clockwork-forge-clean.png`

```
[STYLE ANCHOR]
Game background scene, underground mechanical forge, side-view.
Enormous gears and pistons filling the chamber walls, iron walkways,
glowing forge fires deep in background. Steam venting from pipes.
A massive clockwork heart mechanism visible at center background.
Coal-black walls with brass and copper fittings. Empty iron walkway in
the foreground — no character figure, no hooded traveler, empty playfield
ready for a sprite to walk in from the left.
Color palette: deep burnt orange, rust red, brass, dark iron grey,
white steam. Hot, industrial, alive with motion.
```

### Sky Island (clean)

Reference (when generated): `references/sky-island-clean.png`

```
[STYLE ANCHOR]
Game background scene, floating stone island high above clouds, side-view.
Stone and grass platform with wooden posts and ropes strung with paper lanterns.
Clouds below and around the island. View of a tiny distant world far below.
Golden-hour warm sunset light. Empty stone-and-grass platform — no character
figure near the edge, no hooded traveler, empty playfield.
Color palette: warm golden yellow, pale blue sky, cloud white, soft amber.
Light, airy, open, hopeful.
```

### Haunted Wood (clean)

Reference (when generated): `references/haunted-wood-clean.png`

```
[STYLE ANCHOR]
Game background scene, ancient haunted forest at night, side-view.
Massive gnarled trees with twisted roots, branches interlocking overhead
blocking most sky. Thick ground mist drifting between trunks at knee height.
Pale will-o-wisp lights floating in mid-distance. Old moss-covered stone
markers. Moonlight in thin shafts through canopy. Empty forest path in the
foreground — no character figure, no hooded traveler, empty playfield.
Color palette: deep forest green, fog grey, pale moon-white, muted purple,
dark bark brown. Quiet, eerie, watching.
```

### Great Battle (clean)

Reference (when generated): `references/great-battle-clean.png`

```
[STYLE ANCHOR]
Game background scene, dramatic night battlefield, side-view.
A stone fortress village (Hearthward) on a hill in the far background,
torch-lit windows, defensive walls. Open dark ground in foreground.
Turbulent dark sky with distant fire glow on horizon. A sense of an
approaching force, tension before a siege. No armies visible, no character
figure standing in the foreground — just the empty landscape holding its
breath, ready for a sprite to walk in.
Color palette: deep navy, warm torch orange, ember red, shadow black.
Tense, vast, consequential.
```

---

## Wren game sprites

For the in-game Wren sprite (composited over clean backgrounds), the existing
`wren-character-sheet.png` is the source. Two options:

1. **Crop the existing sheet.** Cut out each pose (4 poses + backpack detail)
   and key out the dark navy background to transparent. Fastest, no regeneration
   needed. Quality depends on how cleanly the navy keys out.

2. **Regenerate as isolated sprite frames** (recommended if cropping looks rough).
   Use the prompt below per-pose to get each pose on a pure transparent or
   solid-color background, then key out.

```
[STYLE ANCHOR]
Single Wren sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. [WREN DESCRIPTION]
Pose: <PICK ONE: facing right standing idle | walking right mid-stride |
standing with staff raised | facing camera straight-on | back view from behind>
Centered in frame, full body visible head to toe with no cropping, no shadow
on the magenta background. Same proportions and palette as attached
character reference sheet.
```

Required poses for v1:

- [ ] `wren-idle-right.png` — standing facing right (default at scene entry)
- [ ] `wren-walk-right.png` — mid-walking-stride facing right
- [ ] `wren-cast.png` — staff raised (Shift-thunderclap, spell mode)
- [ ] `wren-hurt.png` — flinch / candle-snuff reaction
- [ ] `wren-back.png` — back view (used at typewriter, looking at portals)

---

## Reference image checklist

Drop these files into `art/references/` (filenames are what `PROMPTS.md` expects above):

- [ ] `wren-character-sheet.png` — 4-pose Wren turnaround + backpack detail *(the master style anchor)*
- [ ] `runa-portrait.png` — seated scholar with quill, lamp, navy coat
- [ ] `hub-portal-chamber.png` — 5 archways, Runa at desk, Wren center
- [ ] `opening-typewriter-study.png` — Wren at typewriter desk
- [ ] `winter-mountain.png` — aurora + ruined arch + cairns
- [ ] `sunken-bell.png` — massive bronze bell + jellyfish + columns
- [ ] `clockwork-forge.png` — gear-heart mechanism + walkway
- [ ] `sky-island.png` — floating stone platform at sunset with lanterns
- [ ] `haunted-wood.png` — gnarled trees + will-o-wisps + stone markers
- [ ] `great-battle.png` — Wren on dark ground facing castle on hill
- [ ] `almanac-ui.png` — open leather book on navy background

### Game-ready clean backgrounds (regenerate next)

- [ ] `hub-portal-chamber-clean.png` — Hub with Wren removed (Runa stays)
- [ ] `opening-typewriter-study-clean.png` — Study with Wren removed
- [ ] `winter-mountain-clean.png`
- [ ] `sunken-bell-clean.png`
- [ ] `clockwork-forge-clean.png`
- [ ] `sky-island-clean.png`
- [ ] `haunted-wood-clean.png`
- [ ] `great-battle-clean.png`

### Wren sprites (crop from sheet OR regenerate)

- [ ] `wren-idle-right.png`
- [ ] `wren-walk-right.png`
- [ ] `wren-cast.png`
- [ ] `wren-hurt.png`
- [ ] `wren-back.png`
