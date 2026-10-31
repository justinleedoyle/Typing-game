# Bell doorway art

Generated with the built-in imagegen tool on 2026-10-27. Runtime assets: `nave-doorway.png` and `nave-door-leaves.png`. Original chapter painting and character art are retained. Door leaves are fitted to the painted recess and clipped to their solid metal silhouette during texture preparation; no exterior aura is rendered.

## Nave doorway prompt

Use case: precise-object-edit. Asset type: final painterly 16:9 game background for a separate cathedral doorway encounter in the same underwater world. Reference image is the exact art style, palette, stone materials and atmosphere to preserve. Create a nearby view along this same cathedral wall: remove the giant fallen bell for this doorway encounter, retain teal underwater stone, worn bronze details, drifting fish, sparse jellyfish, faint light from above. Main feature ONE monumental OPEN Gothic arched doorway in the wall, roughly centered x=55% of frame, spanning x=42%-68%, crown y=25%, threshold y=78%. Opening is an empty dark passage with visible recessed jambs, receding stone corridor and a subtle blue distant light. NO door leaves: game will add animated closed bronze leaves in front. Surrounding masonry must connect continuously into the arch, no freestanding frame. Clear flat worn flagstone approach floor across bottom quarter, with slight silt and scattered rubble near edges, space for a child character at x=28%, feet y=82%. Keep upper 20% reasonably quiet for narration and bottom 12% quiet for UI. Beautiful hand-painted storybook atmosphere matching reference, softened irregular painted contours, believable perspective. No characters, no words, no UI, no symbols floating over the scene, no second door.

Reference: `../references/sunken-bell-clean.png`. Opaque background.

## Door leaf prompt

Use case: compositing. Asset type: isolated transparent 2D game sprite, CLOSED DOUBLE DOOR LEAVES ONLY to fit the main doorway in the reference painting. Reference is architectural style and underwater teal lighting. Paint one matched pair of aged bronze double door leaves, touching along one straight center seam, forming a tall softly pointed Gothic arch at top, flat bottom. Pair overall width to height approximately 0.65. Leaves have subtle embossed branching tree motifs, dark teal verdigris, worn muted bronze edges, two small ring handles near center at lower-middle. Soft painterly linework and restrained shading, same hand-painted storybook game art, face viewed straight on. Hinges at outer edges. NO surrounding masonry, NO sill, NO cast shadow outside silhouette, NO floor, NO background, NO crossbar, NO floating glyphs. Whole pair centered and fully visible with modest transparent padding, actual transparent alpha all around. Do not include any piece of the reference room. Need clean outer silhouette for cutting into left and right hinged halves at center.

Reference: `nave-doorway.png`. Transparency requested; generated exterior haze is excluded by the runtime silhouette clip.
