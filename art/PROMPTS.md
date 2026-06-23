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
Seated scholar: chibi-proportioned adult woman in a deep navy-blue coat with
brass buttons, long wavy honey-blonde hair, fair skin with a warm tone,
light blue-green eyes, gentle warm expression, small round spectacles.
Seated at a heavy wooden desk, leaning slightly forward over an open book,
quill in hand, small oil lamp to one side casting warm amber glow. Same
flat stylized illustration style as attached reference. Full figure visible.
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

IMPORTANT: the arches must all be IDENTICAL and NEUTRAL and the desk must
be EMPTY. The game lights each arch dynamically (sealed / active portal /
cleared) and overlays the painted Runa sprite at her desk, so the backdrop
must not bake in any portal glow, per-arch state, numerals/annotations, or
any figure at the desk.

```
[STYLE ANCHOR]
Wide establishing shot, dark fantasy library portal chamber, side-view.
Stone floor with faint inlaid brass circle. Six tall wooden bookshelves
lining the back wall with books and candles. Five identical stone archways
in a row center-stage — all five sealed with dark empty stone, unlit, no
portal energy, no glow, no numerals or markings on them, every arch the
same. Far left: heavy wooden scholar's desk with an oil lamp, open books,
papers and a quill on it, an empty wooden chair pulled up — no character at
the desk, no figure present, no person, no scholar. Far right: tall glass
display cabinet with brass trim. Empty stone floor center where a traveler
would stand — no traveler figure present, no hooded character, empty
playfield.
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
standing with staff raised | flinching and recoiling as if struck, head
ducked, one arm raised | back view seen from behind>
Centered in frame, full body visible head to toe with no cropping, no shadow
on the magenta background. Same proportions and palette as attached
character reference sheet.
```

Required poses for v1 — each pose option above maps to one file:

- [ ] `wren-idle-right.png` — facing right standing idle (default at scene entry)
- [ ] `wren-walk-right.png` — walking right mid-stride
- [ ] `wren-cast.png` — standing with staff raised (Shift-thunderclap, spell mode)
- [ ] `wren-hurt.png` — flinching/recoiling as if struck (candle-snuff reaction)
- [ ] `wren-back.png` — back view from behind (used at typewriter, facing portals)

---

### NPC sprites — Runa & the sibling

Generate the same way as the Wren poses: isolated, full-body, on solid
magenta (#ff00ff) for chroma keying. Pass `wren-character-sheet.png` as the
style reference so proportions and palette match. Save the results as
`references/runa-front.png` and `references/sibling-front.png`.

Runa:

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Chibi-proportioned adult royal cartographer,
a woman: deep navy-blue long coat with small brass buttons, long wavy
honey-blonde hair, fair skin with a warm tone, light blue-green eyes,
gentle warm expression, small round brass spectacles, one eye clouded
pale (half-blind), ink-stained hands, a small brass astrolabe at the belt.
Standing calmly facing forward, full body visible head to toe with no
cropping, no shadow on the magenta background. Same flat stylized
illustration style, proportions and palette as the attached character
reference sheet.
```

The sibling:

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Very small chibi-proportioned young child,
about three years old, much smaller than Wren: very platinum-blonde
straight hair slightly tousled, fair pale skin with rosy cheeks, bright
blue eyes, wide joyful smile. Wearing a simple pale cream nightgown, bare
feet, holding a folded paper drawing pressed to the chest with both hands.
Standing shyly facing forward, full body visible head to toe with no
cropping, no shadow on the magenta background. Same flat stylized
illustration style and palette as the attached character reference sheet.
```

---

### Villain sprite — The Quiet Lord

The big-bad of *The Portalwright's Almanac*. He doesn't need a face in
Phase 1 — by Phase 4 he needs a recognizable silhouette and a way of
"speaking." This sprite locks the silhouette so every realm can foreshadow
him consistently. First use: a faint fade-in behind Runa in the Opening
Scene when she names him.

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Chibi-proportioned but unusually tall, gaunt
robed figure — distinctly taller than Runa: long sweeping hooded robe in
deep midnight-charcoal with very dark muted-violet undertones, frayed
ragged hem, no skin or face visible — only impenetrable shadow inside the
deep hood where a face should be. Long sleeves hide his hands. Posture is
still, upright, expressionless, watchful, faintly imposing but not
overtly menacing — the embodiment of a quiet absence rather than active
threat. A faint dust of small dark scratched-out paper fragments drifts
near the hem of the robe, suggesting words being dissolved. Limited dark
palette, soft flat illustration. Full body visible head to hem with no
cropping, no shadow on the magenta background. Same flat stylized
illustration style and proportions as the attached character reference
sheet.
```

Save the keyed result as `art/quiet-lord/quiet-lord.png`. Run
`python3 scripts/key_quiet_lord.py` after dropping the raw render into
`art/references/quiet-lord.png`.

---

### NPC sprites — Winter Mountain (Heldur & the huntress)

Two narrative NPCs in Winter Mountain who are currently described only in
narration. Painting them gives Aiden a visual to anchor the typed dialogue.

Heldur the Wayshrine Knight (Act 1, frozen over a stone wayshrine, awakens
briefly when the player types the inscription):

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Chibi-proportioned old armored knight standing
guard, frozen mid-vigil: weathered iron plate armor with brass-rim edging,
heavy fur-trimmed cloak, simple closed helm with a narrow eye-slit, gloved
hands resting on the pommel of a long broadsword grounded point-down in
front of him. A pale blue-white frost rime crusts the shoulders, helm,
and cloak hem — clearly ancient, motionless, half-statue. Faint warm amber
glow visible through the helm's eye-slit (his consciousness, still there).
Full body visible head to toe with no cropping, no shadow on the magenta
background. Same flat stylized illustration style and palette as the
attached character reference sheet.
```

The trapped huntress (Act 3 CYOA, half-buried in a snowdrift, gives Wren
a spiral horn when freed):

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Chibi-proportioned young adult woman hunter
kneeling low in a snowdrift, one arm propped on the snow as if just lifting
her head: heavy fur-lined hooded cloak in muted forest-green and grey-brown,
braided dark-auburn hair, wind-burned cheeks, warm hazel eyes, a small
spiral antler horn at her belt. Snow caked along her cloak and one
shoulder. Posture is half-trapped but alert — looking up and toward the
viewer as if Wren has just arrived. Full body visible with no cropping,
no shadow on the magenta background. Same flat stylized illustration style
and palette as the attached character reference sheet.
```

Save the keyed results as `art/winter/heldur.png` and `art/winter/huntress.png`.
Run `python3 scripts/key_winter_npcs.py` after dropping the raw renders
into `art/references/heldur.png` and `art/references/huntress.png`.

---

### Enemy sprites — Winter Mountain wolves

The Winter Mountain Act 2 wolf pack: regular wolves (waves 1–3) and a
larger pack-leader boss in wave 3. In code: `WinterMountainScene.drawWolfInto`
and `drawBossInto`. They're drawn in side profile and mirrored to face left
when spawning on Wren's right, so the painted sprite faces right by default.

Pack wolf:

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Chibi-proportioned dire wolf in side profile
facing right: dark slate-grey fur with paler grey underbelly, lean predator
silhouette stalking low to the ground, ears pricked forward, single amber-
orange glinting eye visible, faint frost on the shoulders. Tail held low.
Full body visible nose to tail with no cropping, no shadow on the magenta
background. Same flat stylized illustration style and palette as the
attached character reference sheet.
```

Pack leader (the "old one"):

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. Larger older dire wolf — the pack leader —
in side profile facing right: scarred slate fur with grey muzzle and
matted ruff, weather-worn brass collar with rune-etched plates running
across the spine, glowing amber eye, hunched powerful frame, ancient and
watchful. Visibly bigger and heavier-built than a regular pack wolf, with
ice clinging to the brass plates. Full body visible nose to tail with no
cropping, no shadow on the magenta background. Same flat stylized
illustration style and palette as the attached character reference sheet.
```

Save the keyed results as `art/wolf/wolf-pack.png` and `art/wolf/wolf-leader.png`.
Run `python3 scripts/key_wolf.py` after dropping the raw renders into
`art/references/wolf-pack.png` and `art/references/wolf-leader.png`.

---

## Enemy sprites — the other four realms

The advancing foes in Bell / Forge / Sky / Wood are still drawn as flat procedural
shapes in code (`drawGolemInto`, `drawGhostInto`, the lantern-spirit, etc.). These
prompts give each a painted sprite that matches its current palette. Same workflow
as the wolves: isolated, full-body, on solid magenta `#ff00ff` for chroma keying,
`wren-character-sheet.png` as the style reference. Each faces/reads neutrally so it
can be mirrored per spawn side. Drop raw renders in `art/references/<name>.png`,
key them, save to the path noted under each.

### Clockwork Forge — command golem (enemy)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. Chibi-proportioned clockwork command-golem, squat and boxy:
dark iron-grey body (deep charcoal #282828) with thin brass trim lines (#c9a14a)
outlining a blocky chest plate and head, heavy stubby legs, broad simple
shoulders. A single round glowing amber-ember eye (#d6754a) set to one side of
the head. Industrial, geometric, built to be commanded; faint forge-soot on the
lower legs. Full body visible head to toe with no cropping, no shadow on the
magenta background. Same flat stylized illustration style and palette as the
attached character reference sheet.
```

Save the keyed result as `art/forge/golem.png` (raw → `references/forge-golem.png`).

### Sunken Bell — drowned-choir ghost (enemy)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A drowned-choir ghost: a translucent pale blue-white wraith
(#ddeeff), a softly glowing vertical teardrop body that frays into a wispy
trailing dissolve at the bottom (muted blue #aaccee), two small dark sorrowful
eyes. Ethereal and formless — a singing voice lost underwater — with a faint
bioluminescent edge glow. Full body visible with no cropping, no shadow on the
magenta background. Same flat stylized illustration style and palette as the
attached character reference sheet.
```

Save the keyed result as `art/bell/ghost.png` (raw → `references/bell-ghost.png`).

### Sky-Island — lantern-spirit (enemy)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A lantern-spirit: a small floating paper-lantern given life,
warm golden glow (core #fdedb0, soft amber shell), a gently rounded lantern body
with a brighter glowing heart inside, faint paper ribs and a little curl of wisp
beneath. No face — pure, gentle light; an ambient guardian of the island's
lanterns. Full shape visible with no cropping, no shadow on the magenta
background. Same flat stylized illustration style and palette as the attached
character reference sheet.
```

Save the keyed result as `art/sky/lantern-spirit.png` (raw → `references/sky-lantern-spirit.png`).

### Haunted Wood — ghost of the wood (enemy)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A ghost of the haunted wood: a translucent pale grey-green
wraith (#e8eee8), a tall soft floating ellipse with a gentle inner glow that
frays into mist at the bottom (#c8d8c8), two tiny dark eyes. Sorrowful, foggy,
lost — a spirit that remembers grief; cooler and mistier than the water or fire
ghosts. Full body visible with no cropping, no shadow on the magenta background.
Same flat stylized illustration style and palette as the attached character
reference sheet.
```

Save the keyed result as `art/wood/ghost.png` (raw → `references/wood-ghost.png`).

---

## Boss sprites

Each realm's capstone is a distinct character (not just a mechanic). Bigger and
more imposing than the regular foe, but the same palette. Isolated, full-figure,
magenta-keyed.

### Clockwork Forge — the Command-Golem (boss)

```
[STYLE ANCHOR]
Single boss creature sprite, isolated on solid bright magenta background
(#ff00ff) for chroma keying. A larger, heavier clockwork COMMAND-golem, clearly
the leader of the golems: dark iron body (#242424) with a broad brass crown
across the top of the head and a thick brass collar band (#c9a14a), much wider
shoulders than a regular golem, a massive imposing frame. A large bright
amber-gold eye (#d6754a) ringed with a glowing outline. The authority at the
heart of the Forge's hierarchy. Full body visible head to toe with no cropping,
no shadow on the magenta background. Same flat stylized illustration style and
palette as the attached character reference sheet.
```

Save the keyed result as `art/forge/command-golem.png` (raw → `references/command-golem.png`).

### Sunken Bell — the Bell-Warden (boss)

```
[STYLE ANCHOR]
Single boss sprite, isolated on solid bright magenta background (#ff00ff) for
chroma keying. The Bell-Warden: a stone-faced merfolk fused into a massive
barnacled bronze bell. The bell forms the body (dark blue-charcoal #2a2832,
aged bronze rim, encrusted); the merfolk head and shoulders emerge from the
bell's mouth — dark muted-violet skin (#3a3050), faint fin shapes at the sides
of the head — eyes closed and still (a thin dark line). Ancient, sorrowful,
immovable, the keeper of a hundred years of silence. Full figure visible with no
cropping, no shadow on the magenta background. Same flat stylized illustration
style and palette as the attached character reference sheet.
```

Save the keyed result as `art/bell/bell-warden.png` (raw → `references/bell-warden.png`).
*(Optional phase-2 variant: same figure with the eyes OPEN and glowing
cyan #8de8ff — save as `art/bell/bell-warden-awake.png`.)*

### Sky-Island — the Scholar-Spirit (boss)

```
[STYLE ANCHOR]
Single boss sprite, isolated on solid bright magenta background (#ff00ff) for
chroma keying. The Scholar-Spirit: an almost-human figure of warm amber light
(#d49020 with #f5c842 highlights), a softly glowing robed silhouette with
concentric rings of small amber dots and a few drifting open scrolls orbiting it
like turning pages, two bright amber eyes (#fff4b0). Wise, patient, imposing — a
guardian of preserved knowledge that poses riddles rather than attacks. Full
figure visible with no cropping, no shadow on the magenta background. Same flat
stylized illustration style and palette as the attached character reference sheet.
```

Save the keyed result as `art/sky/scholar-spirit.png` (raw → `references/scholar-spirit.png`).

### Haunted Wood — the Ghost-King (boss)

```
[STYLE ANCHOR]
Single boss sprite, isolated on solid bright magenta background (#ff00ff) for
chroma keying. The Ghost-King: a tall, formal, translucent pale grey-green royal
spirit (#d8e4d8) with a soft inner glow — a large dignified head wearing a simple
five-point crown of pale grey arcs (#b8c8b8), deep dark eyes, a long robe-like
lower body fraying into mist. Ancient nobility held in grief: imposing but not
cruel, a king who can be reasoned with. Full figure visible with no cropping, no
shadow on the magenta background. Same flat stylized illustration style and
palette as the attached character reference sheet.
```

Save the keyed result as `art/wood/ghost-king.png` (raw → `references/ghost-king.png`).
*(Optional: the dark gnarled root-throne #1e1208 he sits on, as a separate prop
`art/wood/ghost-king-throne.png`, if you want him enthroned.)*

---

## NPC sprites — the fork-givers (Bell / Forge / Sky)

The characters Wren talks to and chooses between, currently narration-only or a
rough procedural shape. Same treatment as Heldur/huntress: isolated, full-body,
magenta-keyed, `wren-character-sheet.png` as style reference.

### Smith Forn (Clockwork Forge)

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. Chibi-proportioned old forge smith, broad and sturdy: a
soot-darkened leather apron over a rolled-sleeve tunic, thick work gloves, grey
beard, a warm tired face lit by forge-fire, a brass-headed hammer held in one
hand. Burnt-orange and brass forge palette, soot-black hands. Steady, weathered,
keeper of the old order. Standing facing forward, full body visible head to toe
with no cropping, no shadow on the magenta background. Same flat stylized
illustration style and palette as the attached character reference sheet.
```

Save the keyed result as `art/forge/forn.png` (raw → `references/forn.png`).

### Old Olin (Sunken Bell)

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. Chibi-proportioned very old merfolk priest, hunched and
patient: faded deep-teal and blue-grey robes, a frail bowed posture leaning on a
simple worn staff, long thin white hair, half-deaf (one ear turned), kind clouded
eyes, webbed hands, an aged bronze pendant. Quiet and gentle — a survivor who
listens rather than speaks. Standing and leaning, full body visible with no
cropping, no shadow on the magenta background. Same flat stylized illustration
style and palette as the attached character reference sheet.
```

Save the keyed result as `art/bell/olin.png` (raw → `references/olin.png`).

### King Aurland (Sunken Bell)

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. Chibi-proportioned merfolk king, newly freed: regal but worn,
a deep teal-and-bronze scaled torso, a simple aged bronze crown, flowing dark
blue-green hair and beard, a trident-motif clasp, a calm grateful expression,
faint bioluminescent accents. Noble, oceanic, ancient. Standing tall facing
forward, full body visible with no cropping, no shadow on the magenta background.
Same flat stylized illustration style and palette as the attached character
reference sheet.
```

Save the keyed result as `art/bell/aurland.png` (raw → `references/aurland.png`).

### Scholar Etta (Sky-Island)

```
[STYLE ANCHOR]
Single character sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A small, gentle scholar-spirit child: a softly glowing
pale-amber translucent figure (#f5c842) cradling a single unburned book to her
chest, round spectacles, a kind quiet face, a faint halo of drifting paper scraps
and tiny lantern-light. Smaller and dimmer than the imposing Scholar-Spirit boss
— a tender of light and lost pages, not a riddle-asker. Full figure visible with
no cropping, no shadow on the magenta background. Same flat stylized illustration
style and palette as the attached character reference sheet.
```

Save the keyed result as `art/sky/etta.png` (raw → `references/etta.png`).

---

## Companion sprites — the five tamed creatures

The §5.5.9 companions: small, characterful creatures Wren can tame. Each now also
acts in combat (warm-light, the fox's trip) and pays off in the finale, but has no
art. Small sprites, isolated, magenta-keyed. A cropped/scaled version of each
doubles as its satchel/Almanac icon (so the companions are NOT in the relic-icon
list below).

### Snow-Fox Cub (Winter)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A tiny chibi snow-fox cub: fluffy white-and-pale-blue fur, big
dark eyes, oversized ears, a bushy tail curled around its paws, sitting alert and
sweet, with a faint frost sparkle on the fur. Small, silent, loyal. Full body
visible with no cropping, no shadow on the magenta background. Same flat stylized
illustration style and palette as the attached character reference sheet.
```

Save the keyed result as `art/companions/snow-fox.png` (raw → `references/snow-fox.png`).

### Glass-Fish (Sunken Bell)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A small translucent glass-fish: coin-sized, a see-through pale
blue-green body with faint glassy highlights and a softly glowing core, delicate
fins, entirely still. Quiet, delicate, sudden. Full body visible with no cropping,
no shadow on the magenta background. Same flat stylized illustration style and
palette as the attached character reference sheet.
```

Save the keyed result as `art/companions/glass-fish.png` (raw → `references/glass-fish.png`).

### Brass Songbird (Clockwork Forge)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A small clockwork brass songbird: a polished brass-and-copper
body with fine clockwork seams and a little wind-up key on its back, a bright bead
eye, wings slightly open as if about to sing. Mechanical made musical. Full body
visible with no cropping, no shadow on the magenta background. Same flat stylized
illustration style and palette as the attached character reference sheet.
```

Save the keyed result as `art/companions/brass-songbird.png` (raw → `references/brass-songbird.png`).

### Lantern-Moth (Sky-Island)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A large gentle lantern-moth: soft dusky wings lit from within
with a warm golden glow, a small round glowing lantern-body, feathery antennae,
faint trailing light motes. Ephemeral, guiding, beautiful in the dark. Full body
visible wings spread with no cropping, no shadow on the magenta background. Same
flat stylized illustration style and palette as the attached character reference
sheet.
```

Save the keyed result as `art/companions/lantern-moth.png` (raw → `references/lantern-moth.png`).

### Wisp-Cat (Haunted Wood)

```
[STYLE ANCHOR]
Single creature sprite, isolated on solid bright magenta background (#ff00ff)
for chroma keying. A slender ghostly wisp-cat: a softly glowing pale blue-green
semi-translucent cat with a long curling tail that trails into wisp, bright calm
eyes, a faint will-o-wisp light around it. Liminal, knowing — she always finds the
path out. Full body visible with no cropping, no shadow on the magenta background.
Same flat stylized illustration style and palette as the attached character
reference sheet.
```

Save the keyed result as `art/companions/wisp-cat.png` (raw → `references/wisp-cat.png`).

---

## Relic icons

Small collectible icons for the satchel + Almanac (text-only today). Different
shape from the character sprites — a single ISOLATED OBJECT, centered, square
framing — so they get their own short style line instead of the full Style Anchor.
22 icons (the 5 companions reuse their creature sprite as their icon).

### Relic icon style

Paste at the start of every relic-icon prompt (in place of `[STYLE ANCHOR]`).

```
[ICON STYLE]
Single game inventory icon — one object, centered and isolated on a solid bright
magenta background (#ff00ff) for chroma keying. Flat stylized illustration with
subtle soft shading, a limited muted earthy palette with a warm brass accent, a
clean silhouette readable at small scale, dark-fantasy cozy aesthetic. No text,
no border, no extra background elements. Square, 512x512.
```

Then one object per relic (prepend `[ICON STYLE]`). Save each to `art/relics/<id>.png`.

**Winter Mountain**
- `hunters-horn` — A spiral ivory hunting horn with a worn leather strap and a small brass band.
- `firefly-lantern` — A small folded-paper lantern glowing warm gold, three tiny fireflies inside.
- `cairn-token` — A flat grey river stone carved with a simple spiral, a dusting of snow.
- `pelt-of-the-old-one` — A folded heavy grey wolf pelt, frost glinting on the fur tips.

**Sunken Bell**
- `quiet-chant` — A small open hymn-scroll with faint glowing notation, washed in underwater blue.
- `lock-bar` — A heavy iron cross-bar with a simple keyhole plate, sea-rusted.
- `king-aurland` — A sealed letter in tide-worn bronze-green wax stamped with a trident crest.
- `trident-token` — A small three-pronged bronze trident charm on a cord.
- `bells-tongue` — A large worn iron bell-clapper (the tongue), faintly humming with light.

**Clockwork Forge**
- `bellows-hammer` — A brass-headed forge hammer, still warm, a faint ember glow on the head.
- `sabotage-wrench` — A bent brass wrench, slightly twisted, well-used.
- `master-key` — An ornate old brass key with forge-gear teeth.
- `golem-heart` — A pulsing brass clockwork core, gears visible, warm amber light within.

**Sky-Island**
- `ettas-ledger` — A small leather scholar's notebook open to a page of sky-island maps.
- `beacon-spark` — A bright shard of golden beacon-light in a tiny brass clip, still lit.
- `wind-phrase` — A rolled scroll of flowing sky-script with faint wind-curl lines around it.
- `tether-cord` — A cut mooring rope with a frayed end and a brass eyelet.
- `untethered-wind` — A swirl of pale wind made visible, a few drifting feathers and leaves.

**Haunted Wood**
- `ash-vial` — A small corked glass vial of soft grey grove-ash, faintly warm-glowing.
- `shrine-token` — A small carved wooden token with a simple shrine-and-leaf mark, mossy.
- `bone-flute` — A pale carved bone flute, ancient, fine cracks, eerie.
- `ghost-kings-promise` — A folded pale parchment bound with a thin grey ribbon and a faint ghostly seal.

---

## Keying the new sprites

All the character/creature/boss/NPC/companion prompts render on magenta `#ff00ff`,
same as the wolves/NPCs. The existing key scripts are per-batch
(`scripts/key_wolf.py`, `key_winter_npcs.py`, `key_quiet_lord.py`). For this larger
batch, a single generic `scripts/key_sprites.py` (reads `art/references/<name>.png`
→ writes the keyed PNG to its destination) is the cleanest — ask Claude to generate
it once the raw renders are in. Relic icons key the same way (the magenta drops out).

Wiring each finished PNG into its scene (replacing the procedural `drawXInto` with
a sprite + the chroma-key load, exactly as Winter does for the wolves) is a code
follow-up once the art exists.

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

### Enemy sprites (regenerate after backgrounds)

- [ ] `wolf-pack.png` — regular dire wolf, magenta-keyed, facing right
- [ ] `wolf-leader.png` — pack-leader boss, magenta-keyed, facing right

### NPC sprites (Winter Mountain)

- [ ] `heldur.png` — old armored knight, frost-rimed, sword grounded
- [ ] `huntress.png` — kneeling hunter in fur cloak, half-buried in snow

### Villain sprite

- [ ] `quiet-lord.png` — tall hooded figure, faceless, frayed robe — the big-bad

### Wren sprites (crop from sheet OR regenerate)

- [ ] `wren-idle-right.png`
- [ ] `wren-walk-right.png`
- [ ] `wren-cast.png`
- [ ] `wren-hurt.png`
- [ ] `wren-back.png`

### Enemy sprites — the other four realms

- [ ] `forge/golem.png` — clockwork command golem (grey + brass, amber eye)
- [ ] `bell/ghost.png` — drowned-choir ghost (pale blue-white wraith)
- [ ] `sky/lantern-spirit.png` — floating paper-lantern spirit (golden, faceless)
- [ ] `wood/ghost.png` — ghost of the wood (pale grey-green wraith)

### Boss sprites

- [ ] `forge/command-golem.png` — the Command-Golem (brass crown + collar)
- [ ] `bell/bell-warden.png` — merfolk fused into the bronze bell *(optional: `bell-warden-awake.png`)*
- [ ] `sky/scholar-spirit.png` — amber riddle-spirit with orbiting scrolls
- [ ] `wood/ghost-king.png` — crowned grey-green royal spirit *(optional: `ghost-king-throne.png`)*

### NPC sprites — Bell / Forge / Sky

- [ ] `forge/forn.png` — Smith Forn (old smith, apron, hammer)
- [ ] `bell/olin.png` — Old Olin (hunched half-deaf merfolk priest)
- [ ] `bell/aurland.png` — King Aurland (freed merfolk king, crown)
- [ ] `sky/etta.png` — Scholar Etta (small amber book-spirit child)

### Companion sprites (also serve as satchel icons)

- [ ] `companions/snow-fox.png`
- [ ] `companions/glass-fish.png`
- [ ] `companions/brass-songbird.png`
- [ ] `companions/lantern-moth.png`
- [ ] `companions/wisp-cat.png`

### Relic icons (22 — companions reuse their sprite)

- [ ] Winter: `hunters-horn` · `firefly-lantern` · `cairn-token` · `pelt-of-the-old-one`
- [ ] Bell: `quiet-chant` · `lock-bar` · `king-aurland` · `trident-token` · `bells-tongue`
- [ ] Forge: `bellows-hammer` · `sabotage-wrench` · `master-key` · `golem-heart`
- [ ] Sky: `ettas-ledger` · `beacon-spark` · `wind-phrase` · `tether-cord` · `untethered-wind`
- [ ] Wood: `ash-vial` · `shrine-token` · `bone-flute` · `ghost-kings-promise`
