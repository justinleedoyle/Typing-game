/**
 * Voiced-Runa script — Phase 1.
 *
 * Per the story canon ([RESEARCH_AND_PLAN.md §5.5.1]), Runa narrates
 * everything via the Almanac's magecraft. Every line here is delivered by
 * the same voice actor — a single warm-but-dry cartographer voice with a
 * range of tones rather than multiple narrators.
 *
 * IDs are stable. They become audio filenames (`runa_${id}.mp3`) and
 * lookup keys in the NarrationManager (see task #5). Editing an ID requires
 * regenerating that line's audio.
 *
 * Tones guide ElevenLabs delivery direction at generation time. They are
 * not consumed by the runtime — captions just use `text` verbatim.
 *
 *   intimate    — direct to Wren, warm and close. She's been waiting for him.
 *   reading     — descriptive, reading the world to Wren. Slight wonder.
 *   urgent      — calling out danger. Controlled, not shouted.
 *   instruction — game prompts (kindle, type its name). Slightly clinical.
 *   wonder      — moments of stillness and awe (the mountain speaks).
 *   tender      — the fox, the sibling, the lost knight. Soft.
 *
 * Lines marked `isNew: true` are added during the Connection Pass — they
 * didn't exist in the codebase before voicing began. They need to be wired
 * into their scenes in task #5.
 */

export type RunaTone =
  | "intimate"
  | "reading"
  | "urgent"
  | "instruction"
  | "wonder"
  | "tender";

export type RunaScene =
  | "title"
  | "opening"
  | "hub"
  | "winter"
  | "sunken"
  | "forge"
  | "sky"
  | "wood"
  | "ambient"
  | "finale";

export interface RunaLine {
  /** Stable ID; becomes `runa_${id}.mp3` filename. */
  id: string;
  /** Scene this line belongs to. */
  scene: RunaScene;
  /** What triggers this line — for documentation and debugging. */
  trigger: string;
  /** Spoken text. Also rendered verbatim as the caption. */
  text: string;
  /** Delivery direction. Drives ElevenLabs voice settings at generation. */
  tone: RunaTone;
  /** True if this line is added during the Connection Pass (didn't exist before). */
  isNew?: boolean;
}

// ─── TITLE ────────────────────────────────────────────────────────────────────

const TITLE_LINES: readonly RunaLine[] = [
  {
    id: "title_waking",
    scene: "title",
    trigger: "TitleScene — the prompt line on idle",
    text: "The cartographer is waking up.",
    tone: "intimate",
  },
];

// ─── OPENING ──────────────────────────────────────────────────────────────────
//
// §5.5.2 narration. 8 of these are WIRED into OpeningScene via
// narration.say(id) (Connection Pass).
//
// §5.5.8 PROSE PASS (done): beats 4, 5, 6, 7, 8, 10 had their `Runa: "…"` /
// `Narrator: …` speaker-tag styling stripped so the opening matches the
// prefix-less realm narration, and the bodies were lifted — anchored to the
// §5.5.2 canon, which the prior draft had drifted from and in places degraded
// (e.g. the beat-5 "brass → Bjarn" logic, and restored beats like "He will
// come here. Soon."). Because the beats are wired, editing `text` here updates
// the caption directly — these are no longer byte-identical to old `main`.
//
// 2 stay UNWIRED: opening_beat3_sibling_doorway and opening_beat9_sibling_farewell
// are gender-conditional (the scene shows a different caption for boy-Wren's
// sibling Saga vs girl-Wren's sibling Magnus), so one say(id) can't byte-match
// both branches. Their `text` mirrors the scene's boy-branch (Saga) narration
// as the canonical record; the scene (OpeningScene.beat3/beat9) is the source
// of truth for what actually renders. Beat 2.5 (the boy/girl gender prompt) has
// no line and stays setNarrator as a functional prompt.

const OPENING_LINES: readonly RunaLine[] = [
  {
    id: "opening_beat1_intro",
    scene: "opening",
    trigger: "OpeningScene.beat1() — scene opens, 3 s hold",
    text: "In the kingdom of Holdfast — the last quiet place in the world — a child has waited all evening to be called downstairs. Tonight, after a hundred years, someone calls.",
    tone: "reading",
  },
  {
    id: "opening_beat2_runa_descends",
    scene: "opening",
    trigger: "OpeningScene.beat2() — Runa fades in at the desk",
    text: "Runa — the royal cartographer — comes down the stair. Ink to the elbows, half-blind in one eye, the good eye already on you. She has been waiting, too.",
    tone: "reading",
  },
  {
    id: "opening_beat3_sibling_doorway",
    scene: "opening",
    trigger: "OpeningScene.beat3() — sibling fades in at the doorway",
    text: "At the doorway, a small figure in nightclothes hangs back, a drawing held to the chest like a shield.",
    tone: "tender",
  },
  {
    id: "opening_beat4_type_name",
    scene: "opening",
    trigger: "OpeningScene.beat4() — first typed word: 'Wren'",
    text: "The kingdom has gone a hundred years without a Portalwright. Tonight we find out if it has one again. Hands on the keys — and type your name.",
    tone: "intimate",
  },
  {
    id: "opening_beat5_type_typewriter",
    scene: "opening",
    trigger: "OpeningScene.beat5() — second typed word: 'Bjarn'",
    text: "Good. Now — the machine itself. Typewriters have names; you only have to listen for them. Yours is brass, and old, and a little stubborn. It answers to Bjarn. Type it.",
    tone: "intimate",
  },
  {
    id: "opening_beat6_almanac_speech",
    scene: "opening",
    trigger: "OpeningScene.beat6() — Quiet Lord foreshadow + Almanac reveal",
    text: "The Quiet Lord has been waking for some time. Across the Realms Beyond he gathers an army that hates language and loves silence. He will come here — soon. This is the Almanac. It remembers every place you go, every soul you save, everything you carry home. It is yours now.",
    tone: "reading",
  },
  {
    id: "opening_beat7_portal_wakes",
    scene: "opening",
    trigger: "OpeningScene.beat7() — first portal flickers awake",
    text: "The nearest arch stirs and fills with pale, cold light. From the far side of it, faint — wolves on a mountain.",
    tone: "reading",
  },
  {
    id: "opening_beat8_winter_woken",
    scene: "opening",
    trigger: "OpeningScene.beat8() — type 'Winter Mountain' to step through",
    text: "The Winter Mountain has woken, and it will take you first. Type its name when you are ready — and Wren: you are readier than you feel.",
    tone: "intimate",
  },
  {
    id: "opening_beat9_sibling_farewell",
    scene: "opening",
    trigger: "OpeningScene.beat9() — sibling presses the drawing tighter",
    text: "At the doorway, she holds the drawing out at last — both hands, no more hiding it. Wren. I made you something.",
    tone: "tender",
  },
  {
    id: "opening_beat10_bridge_to_hub",
    scene: "opening",
    trigger: "OpeningScene.beat10() — fade to Portal Chamber",
    text: "Runa gathers her maps and rises, and beckons you after her — down the long hall, to the Portal Chamber. The Almanac knows the way back.",
    tone: "reading",
  },
];

// ─── HUB (Portal Chamber) ─────────────────────────────────────────────────────
//
// Voice-ready via NarrationManager (option (a)): the hub's Runa-narrator beats
// route through narration.say(id) as the top caption, like every other scene.
// The bottom `hint` keeps only functional prompts (arch name, shelf contents).
//
// WIRED (say-routed): hub_first_arrival (first visit, nothing cleared yet),
// hub_desk_{none,winter,sunken,forge,sky,wood} (desk reflections, keyed by
// last-cleared realm via DESK_LINE_IDS in PortalChamberScene), hub_all_cleared,
// hub_post_battle. The desk text is reconciled to the previously-shipped local
// map (warm contractions: "you're", "that's"), so it reads identically — only
// relocated to the top caption and de-prefixed (the old `Runa: "…"` tag is gone).
//
// NOT say-routed (kept as records): hub_portals_prompt is the functional bottom
// hint (functional prompts don't get say(id), per the wire rule); hub_portal_opens
// and hub_return_greeting_winter have no beat yet — candidates for a future portal
// send-off / per-realm return greeting.

const HUB_LINES: readonly RunaLine[] = [
  {
    id: "hub_first_arrival",
    scene: "hub",
    trigger: "PortalChamberScene first entry — replaces silent fade-in",
    text: "This is the Portal Chamber. Five arches. Five realms beyond. Light a portal when you are ready, Wren.",
    tone: "intimate",
    isNew: true,
  },
  {
    id: "hub_portals_prompt",
    scene: "hub",
    trigger: "PortalChamberScene — at the portals zone",
    text: "Type the glowing arch's name to step through. Backspace to cancel.",
    tone: "instruction",
  },
  {
    id: "hub_portal_opens",
    scene: "hub",
    trigger: "PortalChamberScene — between typing portal name and scene transition",
    text: "Step through. I will be with you.",
    tone: "intimate",
    isNew: true,
  },
  {
    id: "hub_return_greeting_winter",
    scene: "hub",
    trigger: "PortalChamberScene re-entry after Winter Mountain clear",
    text: "You came back. Sit a moment. The mountain travels with you, whether you noticed or not.",
    tone: "intimate",
    isNew: true,
  },
  {
    id: "hub_desk_none",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — no realm cleared yet",
    text: "The Winter Mountain is the closest. Its arch is lit. Go when you're ready.",
    tone: "intimate",
  },
  {
    id: "hub_desk_winter",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — Winter Mountain cleared",
    text: "You carried something home from the mountain. I can still see the snow in it.",
    tone: "intimate",
  },
  {
    id: "hub_desk_sunken",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — Sunken Bell cleared (Phase 2)",
    text: "The bell is quiet now. I hear its absence from here — the silence it left behind.",
    tone: "intimate",
  },
  {
    id: "hub_desk_forge",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — Clockwork Forge cleared (Phase 3)",
    text: "The forge is breathing again. Whether that's Forn's work or yours, hard to tell.",
    tone: "intimate",
  },
  {
    id: "hub_desk_sky",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — Sky-Island cleared (Phase 3)",
    text: "Every page that ever lit — nothing burned is truly gone. She was right, you know.",
    tone: "intimate",
  },
  {
    id: "hub_desk_wood",
    scene: "hub",
    trigger: "PortalChamberScene desk zone — Haunted Wood cleared (Phase 4)",
    text: "The wood remembers everything. I found the Ghost-King's name once, in the margin of an old atlas.",
    tone: "intimate",
  },
  {
    id: "hub_all_cleared",
    scene: "hub",
    trigger: "PortalChamberScene — all 5 realms cleared, Hearthward call",
    text: "All realms cleared. Hearthward needs you.",
    tone: "urgent",
  },
  {
    id: "hub_post_battle",
    scene: "hub",
    trigger: "PortalChamberScene — after Great Battle, New Game+ prompt",
    text: "The Almanac is complete. Type to begin a new run.",
    tone: "wonder",
  },
];

// ─── WINTER MOUNTAIN ──────────────────────────────────────────────────────────
//
// §5.5.6 narration. 21 of these are now WIRED into WinterMountainScene via
// narration.say(id) (Connection Pass — the 5th and final realm). Their `text`
// is reconciled 1:1 to the caption the scene already displayed, so wiring is
// zero-regression. Most already byte-matched (these lines were written with the
// scene); the three lowercase "primal" beats — winter_boss_rise,
// winter_boss_defeated, winter_wave_reset — had their `text` lowercased here to
// match the scene's actual captions.
//
// 26 stay UNWIRED because their captions are dynamic (array-indexed or branch
// variables) — one setNarrator call serving many lines — which can't byte-match
// a single say(id) without refactoring the emit site (the same rule that left
// the other realms' dynamic captions as setNarrator):
//   • winter_idle_river — no idle hook exists in the scene (drafted-but-no-beat).
//   • winter_revisit_{bury,pelt,fallback} — startRevisit picks one by branch var.
//   • winter_river_{pine,ice,branch} — runRiverBeats uses a narrations[idx] array.
//   • winter_heldur_ask_{name,story,holdfast} — runHeldurExchange uses the
//     HELDUR_NARRATOR_PROMPTS[idx] array.
//   • winter_wave{1,2,3}_intro — startWave uses WAVES[idx].intro.
//   • winter_{huntress,firefly,bury,pelt}_passage{1,2} — runPassageChain emits
//     step.narrator from a per-branch array.
//   • winter_nearmiss_{no_fox,no_huntress,pelt} — startFoxGate picks one by branch.
//   • winter_truename_reaction_{1,2} — emitted from the TRUE_NAME_REACTIONS array.

const WINTER_LINES: readonly RunaLine[] = [
  // Arrival
  {
    id: "winter_intro_arrival",
    scene: "winter",
    trigger: "WinterMountainScene.startAct1() — scene opens",
    text: "The portal closes behind you. Snow muffles the world. The frozen river stretches ahead.",
    tone: "reading",
  },
  {
    id: "winter_idle_river",
    scene: "winter",
    trigger: "WinterMountainScene — idle pause >10s on the river (NEW ambient hook)",
    text: "Take your time. The river is not going anywhere.",
    tone: "intimate",
    isNew: true,
  },

  // Revisit (when Winter has already been cleared)
  {
    id: "winter_revisit_bury",
    scene: "winter",
    trigger: "WinterMountainScene revisit — fork 2 was 'bury'",
    text: "The cairn is still standing.",
    tone: "wonder",
  },
  {
    id: "winter_revisit_pelt",
    scene: "winter",
    trigger: "WinterMountainScene revisit — fork 2 was 'pelt'",
    text: "The mountain remembers the weight you carried.",
    tone: "wonder",
  },
  {
    id: "winter_revisit_fallback",
    scene: "winter",
    trigger: "WinterMountainScene revisit — no fork 2 choice on record",
    text: "The mountain is quieter than you left it.",
    tone: "wonder",
  },

  // River beats (Act 1)
  {
    id: "winter_river_pine",
    scene: "winter",
    trigger: "WinterMountainScene.runRiverBeats(0) — type 'lift'",
    text: "A fallen pine blocks the path.",
    tone: "reading",
  },
  {
    id: "winter_river_ice",
    scene: "winter",
    trigger: "WinterMountainScene.runRiverBeats(1) — type 'step'",
    text: "The ice looks thin here. Place your feet carefully.",
    tone: "reading",
  },
  {
    id: "winter_river_branch",
    scene: "winter",
    trigger: "WinterMountainScene.runRiverBeats(2) — type 'duck'",
    text: "A low branch catches the light. Duck under it.",
    tone: "reading",
  },

  // Wayshrine (Heldur)
  {
    id: "winter_wayshrine_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startHeldur() — Heldur fades in",
    text: "An old wayshrine. A knight stands frozen over it, armored in frost.",
    tone: "reading",
  },
  {
    id: "winter_heldur_ask_name",
    scene: "winter",
    trigger: "WinterMountainScene.runHeldurExchange(0) — type 'name'",
    text: "Ask his name.",
    tone: "instruction",
  },
  {
    id: "winter_heldur_ask_story",
    scene: "winter",
    trigger: "WinterMountainScene.runHeldurExchange(1) — type 'story'",
    text: "Ask his story.",
    tone: "instruction",
  },
  {
    id: "winter_heldur_ask_holdfast",
    scene: "winter",
    trigger: "WinterMountainScene.runHeldurExchange(2) — type 'Holdfast'",
    text: "Speak the name he last guarded.",
    tone: "intimate",
  },
  {
    id: "winter_heldur_eyes_open",
    scene: "winter",
    trigger: "WinterMountainScene — Heldur's eyes open after the third exchange",
    text: "His eyes open.",
    tone: "wonder",
  },

  // Cold decay → kindle (Act 1 → Act 2 transition)
  {
    id: "winter_cold_decay",
    scene: "winter",
    trigger: "WinterMountainScene — COLD_DECAY_NARRATOR fires when wolves draw near",
    text: "Wren — something moves in the trees. The cold is pressing in. Keep your candles lit.",
    tone: "urgent",
  },
  {
    id: "winter_kindle_prompt",
    scene: "winter",
    trigger: "WinterMountainScene.promptKindle() — candles dim, type 'kindle'",
    text: "The cold dims your light. Type 'kindle' to keep the candles burning.",
    tone: "urgent",
  },
  {
    id: "winter_kindle_steady",
    scene: "winter",
    trigger: "WinterMountainScene — 'kindle' completed, flames restored",
    text: "The flames steady. Press on.",
    tone: "intimate",
  },

  // Wave intros (Act 2)
  {
    id: "winter_wave1_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startWave(0) — first wolf wave",
    text: "Type the wolves' names to drive them back. Hold Shift on the first letter to call a thunderclap.",
    tone: "instruction",
  },
  {
    id: "winter_wave2_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startWave(1) — second wolf wave",
    text: "More eyes glint in the dark. The pack tightens.",
    tone: "urgent",
  },
  {
    id: "winter_wave3_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startWave(2) — third wolf wave (boss)",
    text: "The snow shifts. They come faster now. Something larger watches.",
    tone: "urgent",
  },

  // Boss
  {
    id: "winter_boss_rise",
    scene: "winter",
    trigger: "WinterMountainScene.spawnBoss() — pack leader appears",
    text: "the pack leader rises. type its name to fell it.",
    tone: "urgent",
  },
  {
    id: "winter_boss_defeated",
    scene: "winter",
    trigger: "WinterMountainScene.onBossDefeated()",
    text: "the old one slumps. the trail breathes again.",
    tone: "wonder",
  },

  // Wave failure
  {
    id: "winter_wave_reset",
    scene: "winter",
    trigger: "WinterMountainScene.resetWave() — all candles snuffed",
    text: "the dark presses in. steady your hands and try again.",
    tone: "tender",
  },

  // Fox encounter (between waves)
  {
    id: "winter_fox_intro",
    scene: "winter",
    trigger: "WinterMountainScene — small white fox appears in clearing",
    text: "A clearing. A small white fox curled in the snow — hurt. She watches you with one open eye.",
    tone: "tender",
  },
  {
    id: "winter_fox_spared_ear",
    scene: "winter",
    trigger: "WinterMountainScene — chose to spare the fox",
    text: "The fox's ear tilts. She watches you from the treeline as you move on.",
    tone: "tender",
  },
  {
    id: "winter_fox_dismissed",
    scene: "winter",
    trigger: "WinterMountainScene — chose not to engage the fox",
    text: "The fox vanishes into the snow. The trail is quiet.",
    tone: "reading",
  },

  // Fork 1 — huntress vs fireflies
  {
    id: "winter_fork1_intro",
    scene: "winter",
    trigger: "WinterMountainScene — trail forks before Act 3",
    text: "The trail forks. Someone calls from the drift to your left. A trail of fireflies hovers to your right.",
    tone: "reading",
  },
  {
    id: "winter_huntress_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startHuntressBranch() — huntress fades in",
    text: "A woman, half-buried in snow, lifts her head as you approach.",
    tone: "tender",
  },
  {
    id: "winter_huntress_passage1",
    scene: "winter",
    trigger: "WinterMountainScene huntress passage 1 — type 'free her hands'",
    text: "She speaks a few words in the wolf-tongue. The howls behind you fade.",
    tone: "wonder",
  },
  {
    id: "winter_huntress_passage2",
    scene: "winter",
    trigger: "WinterMountainScene huntress passage 2 — type 'she gives you her horn'",
    text: "She presses a spiral horn into your hand and gestures uphill.",
    tone: "tender",
  },
  {
    id: "winter_firefly_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startFireflyBranch() — fireflies dart up",
    text: "Three fireflies hover at eye level, then dart up the slope.",
    tone: "wonder",
  },
  {
    id: "winter_firefly_passage1",
    scene: "winter",
    trigger: "WinterMountainScene firefly passage 1 — type 'follow the lights'",
    text: "The lights bob between the pines, patient, waiting for you.",
    tone: "wonder",
  },
  {
    id: "winter_firefly_passage2",
    scene: "winter",
    trigger: "WinterMountainScene firefly passage 2 — type 'take the lantern'",
    text: "They settle inside a paper lantern hidden in a hollow tree.",
    tone: "tender",
  },

  // Fork 2 — bury vs pelt (aftermath of boss)
  {
    id: "winter_fork2_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startFork2() — pack leader still",
    text: "The pack leader is still. What do you do?",
    tone: "intimate",
  },
  {
    id: "winter_bury_passage1",
    scene: "winter",
    trigger: "WinterMountainScene bury passage 1 — type 'carry the stones'",
    text: "Stone by stone, you build the cairn. The mountain is quiet.",
    tone: "tender",
  },
  {
    id: "winter_bury_passage2",
    scene: "winter",
    trigger: "WinterMountainScene bury passage 2 — type 'let him rest here'",
    text: "The pack will not follow here again.",
    tone: "wonder",
  },
  {
    id: "winter_pelt_passage1",
    scene: "winter",
    trigger: "WinterMountainScene pelt passage 1 — type 'claim the pelt'",
    text: "The old one's pelt is heavy with winter. You roll it carefully.",
    tone: "reading",
  },
  {
    id: "winter_pelt_passage2",
    scene: "winter",
    trigger: "WinterMountainScene pelt passage 2 — type 'carry it home'",
    text: "It smells of frost and old forests. It will mean something at the battle.",
    tone: "intimate",
  },

  // Fox companion gate (kindness check)
  {
    id: "winter_fox_companion_accept",
    scene: "winter",
    trigger: "WinterMountainScene — all 3 kindness conditions met, fox returns",
    text: "The small white fox pads back into the clearing. She watches you steadily.",
    tone: "tender",
  },
  {
    id: "winter_fox_companion_yes",
    scene: "winter",
    trigger: "WinterMountainScene — player whispers to the fox, she comes",
    text: "She steps forward. Her nose brushes your hand. She is coming with you.",
    tone: "tender",
  },
  {
    id: "winter_fox_companion_no",
    scene: "winter",
    trigger: "WinterMountainScene — player doesn't whisper, fox leaves",
    text: "She holds your gaze a moment longer. Then she slips into the pines.",
    tone: "tender",
  },

  // Near-miss kindness lines (2 of 3 conditions met)
  {
    id: "winter_nearmiss_no_fox",
    scene: "winter",
    trigger: "WinterMountainScene — huntress + bury done, but fox never spared",
    text: "You made this place kinder than you found it. But there was a fox in the snow on the way up — she would have followed you home, if you had paused for her.",
    tone: "tender",
  },
  {
    id: "winter_nearmiss_no_huntress",
    scene: "winter",
    trigger: "WinterMountainScene — fox spared + bury done, but firefly fork taken",
    text: "The fox steps into the clearing, nose working. She looks past you — searching for something, or someone. She waits a long moment. Then turns back into the pines.",
    tone: "tender",
  },
  {
    id: "winter_nearmiss_pelt",
    scene: "winter",
    trigger: "WinterMountainScene — fox spared + huntress done, but pelt taken",
    text: "The fox pads to the clearing's edge. Her eye finds the pelt in your hands. She holds very still. Then she steps back. She is gone.",
    tone: "tender",
  },

  // True-name passage (realm clear)
  {
    id: "winter_truename_intro",
    scene: "winter",
    trigger: "WinterMountainScene.startTrueNamePassage() — final passage begins",
    text: "The mountain speaks. Type back what it says.",
    tone: "wonder",
  },
  {
    id: "winter_truename_reaction_1",
    scene: "winter",
    trigger: "WinterMountainScene — Runa's reaction after Wren types 'the winter mountain settles'",
    text: "The wind drops by half.",
    tone: "wonder",
  },
  {
    id: "winter_truename_reaction_2",
    scene: "winter",
    trigger: "WinterMountainScene — Runa's reaction after Wren types 'its old breath warms'",
    text: "Color creeps back into the stones.",
    tone: "wonder",
  },
  // (TRUE_NAME_REACTIONS[2] is an empty string in the code — third line has no narrator reaction by design.)

  // Almanac stamp (return to portal)
  {
    id: "winter_almanac_stamp",
    scene: "winter",
    trigger: "WinterMountainScene — return to portal, Almanac stamp fires",
    text: "You return to the portal. The Almanac stamps a new page.",
    tone: "wonder",
  },
];

// ─── SUNKEN BELL ──────────────────────────────────────────────────────────────
//
// §5.5.7 narration. 9 of these are now WIRED into SunkenBellScene via
// narration.say(id) (Connection Pass). Their `text` is reconciled 1:1 to the
// caption the scene already displayed, so wiring is zero-regression — the only
// change is that say(id) is now the playback path, so voice files drop in
// without touching the scene. Prose enrichment happens in a later review pass;
// because the lines are wired, enriching a `text` here auto-updates the
// caption. `sunken_olin_intro` stays UNWIRED: the scene has Olin speak
// directly with no Runa-narrator beat at his appearance.

const SUNKEN_LINES: readonly RunaLine[] = [
  {
    id: "sunken_intro_arrival",
    scene: "sunken",
    trigger: "SunkenBellScene.startArrival() — scene opens (wired)",
    text: "Wren, this place has been listening for a hundred years. Move slowly. The bell sets the pace.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "sunken_olin_intro",
    scene: "sunken",
    trigger:
      "SunkenBellScene.startOlinNPC() — UNWIRED: scene has Olin speak directly, no Runa-narrator beat at his appearance. Candidate for a future inserted beat.",
    text: "An old merfolk priest sits on a pew. Half-deaf — the only one who survived the silencing because he could not hear the command. He gestures you closer.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "sunken_olin_teach_activate",
    scene: "sunken",
    trigger: "SunkenBellScene.onOlinTeachComplete() — bell tolls, beat-lock engages (wired)",
    text: "The bell tolls once. And the world changes tempo.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "sunken_choir_wave1",
    scene: "sunken",
    trigger: "SunkenBellScene.startWave1() — the nave (wired)",
    text: "The nave stretches ahead. Shapes drift between the columns.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "sunken_antiphon_intro",
    scene: "sunken",
    trigger: "SunkenBellScene.startAntiphon() — off-beat call-and-response wave (wired)",
    text: "The choir answers back — between the tolls, not on them. Speak in the gaps.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "sunken_choir_wave2",
    scene: "sunken",
    trigger: "SunkenBellScene.startWave2() — escalation (wired)",
    text: "More come. One of them is different — restless, doubled.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "sunken_fork1_intro",
    scene: "sunken",
    trigger: "SunkenBellScene.startFork1() — Cathedral Doors fork (wired)",
    text: "The cathedral doors. Two ways through. Choose.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "sunken_warden_rise",
    scene: "sunken",
    trigger: "SunkenBellScene.startAct3() — Bell-Warden appears, eyes closed (wired)",
    text: "The Bell-Warden. Still. Waiting.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "sunken_warden_phase2",
    scene: "sunken",
    trigger: "SunkenBellScene.startWardenPhase2() — tempo doubles, mid-word de-sync (wired)",
    text: "The tide rises. The tempo doubles — hold every beat through the word, or it slips back.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "sunken_warden_defeated",
    scene: "sunken",
    trigger: "SunkenBellScene.onWardenDefeated() — the bell falls silent (wired)",
    text: "A long silence. The bell, for the first time in a hundred years, falls quiet.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "sunken_truename_intro",
    scene: "sunken",
    trigger: "SunkenBellScene.startTrueNamePassage() — true-name passage begins (wired)",
    text: "The realm speaks. Type back its name.",
    tone: "wonder",
    isNew: true,
  },
];

// ─── CLOCKWORK FORGE ──────────────────────────────────────────────────────────
//
// §5.5.8 narration. 8 of these are now WIRED into ClockworkForgeScene via
// narration.say(id) (Connection Pass). Their `text` is reconciled 1:1 to the
// caption the scene already displayed, so wiring is zero-regression — say(id)
// is now the playback path, so voice files drop in without touching the scene.
// Prose enrichment happens in a later review pass; because the lines are wired,
// enriching a `text` here auto-updates the caption.
//
// `forge_gregor_intro` and `forge_gregor_teach` stay UNWIRED: at those beats an
// NPC (Old Gregor) speaks directly, so they are not Runa-narrator lines — the
// same rule that left Sunken's `sunken_olin_intro` unwired. They are kept here
// as a record of the beat and a candidate for a future inserted Runa line.
//
// `forge_intro_arrival` retains the scene's `Runa: "…"` caption styling verbatim
// (Forge predates the prefix-less narration style); the speaker tag is stripped
// at voice-generation time. Harmonizing caption style is a §5.5.8 prose-pass job.

const FORGE_LINES: readonly RunaLine[] = [
  {
    id: "forge_intro_arrival",
    scene: "forge",
    trigger: "ClockworkForgeScene.startAct1Arrival() — scene opens in the heat (wired)",
    text: "Runa: \"Wren. The air here bites. Brass and iron. Something older underneath.\"",
    tone: "reading",
    isNew: true,
  },
  {
    id: "forge_gregor_intro",
    scene: "forge",
    trigger:
      "ClockworkForgeScene.startGregorConversation() — UNWIRED: Gregor speaks directly (NPC), no Runa-narrator beat at his appearance. Candidate for a future inserted beat.",
    text: "An old smith at the workbench — Gregor. He waves you over with a soot-black hand.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "forge_gregor_teach",
    scene: "forge",
    trigger:
      "ClockworkForgeScene.gregorStep2() — UNWIRED: Gregor's lesson is NPC dialogue, left as sayRaw.",
    text: "Lowercase moves them. CAPITALS command them. Forge folk have known the difference for three centuries. Don't unlearn it.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "forge_wave1_intro",
    scene: "forge",
    trigger: "ClockworkForgeScene.startWave1() — first golems advance (wired)",
    text: "Three golems stir. Each name turns from soft to SHOUTED — hold Shift through the capitals, or the brass won't heed you.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "forge_wave2_intro",
    scene: "forge",
    trigger:
      "ClockworkForgeScene.startWave2() — second wave; every command is mixed-case (wired)",
    text: "More iron wakes. Every command runs the same way now — lowercase, then capitals under Shift. Don't drop it.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "forge_fork1_intro",
    scene: "forge",
    trigger: "ClockworkForgeScene.startFork1() — Smith Forn vs Apprentices' Cabal (wired)",
    text: "The bellows hang broken. Two paths open before you. Type a choice.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "forge_command_golem_rise",
    scene: "forge",
    trigger: "ClockworkForgeScene.startAct3() — Command-Golem rises from the steam (wired)",
    text: "The far end of the foundry shudders. Something massive rises from the steam.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "forge_command_golem_phase2",
    scene: "forge",
    trigger: "ClockworkForgeScene.startBossPhase2() — Shift-switching escalates (wired)",
    text: "The golem's eye blazes brass-gold. Hold Shift and command it.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "forge_command_golem_defeated",
    scene: "forge",
    trigger:
      "ClockworkForgeScene.bossDefeated() — the Command-Golem falls; doubles as the realm's true-name line (wired)",
    text: "the forge breathes. the brass remembers. its makers are remembered.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "forge_truename_intro",
    scene: "forge",
    trigger: "ClockworkForgeScene.startTrueNamePassage() — true-name passage begins (wired)",
    text: "One last passage. Type it to leave the forge behind.",
    tone: "wonder",
    isNew: true,
  },
];

// ─── SKY-ISLAND OF LANTERNS ───────────────────────────────────────────────────
//
// §5.5.8 narration. 7 of these are now WIRED into SkyIslandScene via
// narration.say(id) (Connection Pass). Their `text` is reconciled 1:1 to the
// caption the scene already displayed, so wiring is zero-regression — say(id)
// is now the playback path, so voice files drop in without touching the scene.
//
// 3 stay UNWIRED:
//   • sky_temple1_intro — the temple intros are a dynamic array (templeNames[idx]
//     in startTemple), one setNarrator call serving all five gates; wiring would
//     need per-temple lines (sky_temple1..5_intro), a future expansion.
//   • sky_temple5_complete — the scene has no "island lifts" beat; after the
//     fifth temple it goes straight to Fork 1. Drafted-but-no-beat.
//   • sky_scholar_spirit_phase2 — the boss-phase captions interpolate the live
//     riddle text (`The spirit asks again: "<riddle>"`), so there is no static
//     caption to byte-match. The riddle phases stay setNarrator.
// (Same rules that left Sunken's sunken_olin_intro and its dynamic passage text
// as setNarrator.)

const SKY_LINES: readonly RunaLine[] = [
  {
    id: "sky_intro_arrival",
    scene: "sky",
    trigger: "SkyIslandScene.startAct1() — scene opens in golden air (wired)",
    text: "Wren — careful. The island floats. The lanterns never go out here. Something tends them.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "sky_lantern_lighter_intro",
    scene: "sky",
    trigger:
      "SkyIslandScene.startLanternLighter() — Runa narrates the Lantern-Lighter's appearance before she speaks (wired); her LIGHTER_LINE_* dialogue stays sayRaw",
    text: "At the base of the great beacon tower, a child-spirit tends a cluster of lanterns.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "sky_temple1_intro",
    scene: "sky",
    trigger:
      "SkyIslandScene.startTemple() — UNWIRED: temple intros are a dynamic array (templeNames[idx]); one call serves all five gates. Future: split into sky_temple1..5_intro.",
    text: "A phrase is inscribed on the lantern's rim. Read it whole — the lanterns rise as you do.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "sky_temple5_complete",
    scene: "sky",
    trigger:
      "SkyIslandScene.onTempleCleared() — UNWIRED: no 'island lifts' beat exists; after the fifth temple the scene goes straight to Fork 1. Drafted-but-no-beat.",
    text: "Five temples lit. The island lifts a little higher. The wind warms.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "sky_fork1_intro",
    scene: "sky",
    trigger: "SkyIslandScene.startFork1() — Scholar Etta vs steal the flame (wired)",
    text: "The Library Tower. Two paths lead inside.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "sky_scholar_spirit_rise",
    scene: "sky",
    trigger: "SkyIslandScene.startAct3() — the Scholar-Spirit waits at the summit (wired)",
    text: "The summit. Scrolls orbit a shape that is almost human. The Scholar-Spirit waits.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "sky_scholar_spirit_phase2",
    scene: "sky",
    trigger:
      "SkyIslandScene.startBossPhase2() — UNWIRED: caption interpolates the live riddle (`The spirit asks again: \"<riddle>\"`), no static text to byte-match.",
    text: "She asks again. Each word matters. She is patient — but not infinitely.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "sky_scholar_spirit_defeated",
    scene: "sky",
    trigger:
      "SkyIslandScene.onBossDefeated() — the spirit dissolves; doubles as the realm's true-name line (wired)",
    text: "the sky remembers every page that ever lit. nothing burned is truly gone.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "sky_truename_intro",
    scene: "sky",
    trigger: "SkyIslandScene.startTrueNamePassage() — true-name passage begins (wired)",
    text: "The island speaks. Type back its name.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "sky_almanac_stamp",
    scene: "sky",
    trigger: "SkyIslandScene.startEnding() — almanac stamps the page (wired)",
    text: "You return to the portal. The Almanac stamps a new page.",
    tone: "intimate",
    isNew: true,
  },
];

// ─── HAUNTED WOOD ─────────────────────────────────────────────────────────────
//
// §5.5.8 narration. 9 of these are now WIRED into HauntedWoodScene via
// narration.say(id) (Connection Pass). Their `text` is reconciled 1:1 to the
// caption the scene already displayed, so wiring is zero-regression — say(id)
// is now the playback path, so voice files drop in without touching the scene.
//
// wood_inga_intro stays UNWIRED: at her appearance Inga (an NPC) speaks first
// ("i don't know my name."), with no Runa-narrator beat — the same rule that
// left Sunken's sunken_olin_intro unwired. Kept here as a record of the beat.

const WOOD_LINES: readonly RunaLine[] = [
  {
    id: "wood_intro_arrival",
    scene: "wood",
    trigger: "HauntedWoodScene.startArrival() — scene opens in fog (wired)",
    text: "Wren. This place remembers everything. Move carefully. Speak only when spoken to.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "wood_inga_intro",
    scene: "wood",
    trigger:
      "HauntedWoodScene.startIngaNPC() — UNWIRED: Inga (an NPC) speaks first at her appearance, no Runa-narrator beat. Kept as a record / future inserted beat.",
    text: "A small ghost stands between paths. She does not remember her name. She hopes you can find it for her.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "wood_crossroads1_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startCrossroads1() — first crossroads encounter (wired)",
    text: "Ghosts come from every side now. Each name hides one ward — the mark of the side it drifts from. Read the compass, and strike it in.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "wood_crossroads2_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startCrossroads2() — second crossroads (wired)",
    text: "The cold deepens. The shrine pulses faintly.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_fork1_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startFork1() — shrine fork (offering vs bone-flute) (wired)",
    text: "The shrine glows at the crossroads. Two ways forward. The offering bowl is empty. A flute-bone catches your eye.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "wood_ghost_king_rise",
    scene: "wood",
    trigger: "HauntedWoodScene.startAct3() — the throne reveals; the Ghost-King appears (wired)",
    text: "The trees part. A wider clearing. A throne of tangled roots.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_ghost_king_phase2",
    scene: "wood",
    trigger: "HauntedWoodScene.startBossCapstone() — every-punctuation passage begins (wired)",
    text: "The Ghost-King speaks his last words.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_ghost_king_defeated",
    scene: "wood",
    trigger: "HauntedWoodScene.onFinalPassageComplete() — Ghost-King dissolves (wired)",
    text: "The Ghost-King dissolves into the mist.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "wood_truename_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startFinalPassage() — true-name passage begins (wired)",
    text: "Type the realm's true name — word by word.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "wood_almanac_stamp",
    scene: "wood",
    trigger: "HauntedWoodScene.startEnding() — almanac stamps the page (wired)",
    text: "You return to the portal. The Almanac stamps a new page.",
    tone: "intimate",
    isNew: true,
  },
];

// ─── AMBIENT (realm-agnostic combat support) ──────────────────────────────────
//
// These fire from any realm when the player needs gentle support — currently
// the Heart meter sustained low. Tender by design; never urgent. Cycled at
// random so the same line doesn't repeat across realms in one session.

const AMBIENT_LINES: readonly RunaLine[] = [
  {
    id: "ambient_low_heart_steady",
    scene: "ambient",
    trigger: "Heart meter sustained below threshold during combat",
    text: "Steady your hands, Wren. The letters will wait for you.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "ambient_low_heart_breathe",
    scene: "ambient",
    trigger: "Heart meter sustained below threshold during combat",
    text: "Breathe. There is time.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "ambient_low_heart_kind",
    scene: "ambient",
    trigger: "Heart meter sustained below threshold during combat",
    text: "Easy now. Even Runa was new to the keys once.",
    tone: "tender",
    isNew: true,
  },
];

// ─── EXPORT ───────────────────────────────────────────────────────────────────

// ─── GREAT BATTLE OF HOLDFAST (finale) ────────────────────────────────────────
//
// §5.5.11 narration. These lines were AUTHORED during the Connection Pass — the
// finale had no runaLines entries before, only inline setNarrator() captions.
// Each line's `text` byte-matches the caption GreatBattleScene already displayed
// (verified against origin/main), so wiring is zero-regression — say(id) is now
// the voice-ready path. The finale's narration is heavily satchel-conditional
// (per-ally, per-relic, per-companion §5.5.11 branches); each branch is its own
// static caption, so each is its own line.
//
// 5 captions stay UNWIRED because they are dynamic (template literals /
// variables): the per-wave `The ${waveDef.label} pour over the wall.`,
// `waveDef.companionLine`, the relic `descLine`, and the two
// `Hold Shift … ${spellWord}` prompts.

const FINALE_LINES: readonly RunaLine[] = [
  {
    id: "finale_phase1_arrival",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase1() — Hearthward at dusk (wired)",
    text: "Hearthward. The last wall, and the light failing. They are coming.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "finale_phase1_walked_alone",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase1() — zero-allies 'Walked Alone' branch (wired)",
    text: "Runa's voice, steady in the dark. No one beside you but the keys. You stand alone — and that is enough.",
    tone: "intimate",
    isNew: true,
  },
  {
    id: "finale_ally_untethered_wind",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase1() — Untethered Wind ally modifier (wired)",
    text: "Enemy banners fall in a wind from nowhere. It is with you.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "finale_phase1_lord_arrives",
    scene: "finale",
    trigger: "GreatBattleScene.runNextWave() — the Quiet Lord arrives (wired)",
    text: "He is here.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_ally_etta_ledger",
    scene: "finale",
    trigger: "GreatBattleScene — Etta's Ledger ally auto-complete (wired)",
    text: "Etta's Ledger — she marks one down.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "finale_ally_ghost_king",
    scene: "finale",
    trigger: "GreatBattleScene — Ghost-King ally column (wired)",
    text: "A column of ghosts closes around one of his own.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "finale_relic_bells_tongue",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase2a() — Bell's Tongue one-shot (wired)",
    text: "Bell's Tongue — one toll rings across the courtyard. He staggers.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_relic_sabotage_wrench",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase2a() — Sabotage-Wrench jam (wired)",
    text: "The Wrench jams his armor. He speaks half a word and stops.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_phase2_unmake",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase2a() — default duel open (wired)",
    text: "He speaks to unmake. Answer him.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_relic_tether_cord",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase2b() — Tether-Cord bind (wired)",
    text: "The Tether Cord pulls taut. He is bound — one beat.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_phase2_breaks_free",
    scene: "finale",
    trigger: "GreatBattleScene.startPhase2b() — Lord breaks the bind (wired)",
    text: "He breaks free. Answer him again.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_relic_master_key",
    scene: "finale",
    trigger: "GreatBattleScene.runPhase2bRounds() — Master-Key corridor (wired)",
    text: "The Master Key clicks open a hidden corridor. An opening —",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_companion_glass_fish",
    scene: "finale",
    trigger: "GreatBattleScene — Glass-fish lights the passage (wired)",
    text: "The glass-fish lights the dark passage. A moment —",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "finale_companion_lantern_moth",
    scene: "finale",
    trigger: "GreatBattleScene — Lantern-moth lights the throne (wired)",
    text: "The lantern-moth opens wide. The throne is lit.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "finale_relic_windphrase_chant",
    scene: "finale",
    trigger: "GreatBattleScene.runWhirlwindAttack() — Wind-Phrase + Quiet Chant cancel (wired)",
    text: "Wind-Phrase and Quiet Chant intertwine. The air goes still — his whirlwind dies before it rises.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "finale_phase2_whirlwind",
    scene: "finale",
    trigger: "GreatBattleScene.runWhirlwindAttack() — whirlwind rises (uncanceled) (wired)",
    text: "He raises a whirlwind. Plant your feet.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_companion_wisp_cat",
    scene: "finale",
    trigger: "GreatBattleScene — Wisp-cat flank (wired)",
    text: "The wisp-cat finds a path around him. Take it.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "finale_phase2_wavers",
    scene: "finale",
    trigger: "GreatBattleScene — the Lord wavers (wired)",
    text: "He wavers.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "finale_relic_pelt",
    scene: "finale",
    trigger: "GreatBattleScene — Pelt of the Old One survives a cold strike (wired)",
    text: "The Pelt wraps you. One cold strike will not move you.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "finale_phase3_word_burns",
    scene: "finale",
    trigger: "GreatBattleScene — the final word lands (wired)",
    text: "The word on him burns.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "finale_relic_pelt_retry",
    scene: "finale",
    trigger: "GreatBattleScene — Pelt absorbs a miss, retry (wired)",
    text: "The Pelt holds. Try again.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "finale_companion_songbird",
    scene: "finale",
    trigger: "GreatBattleScene — Brass songbird hint on stall (wired)",
    text: "The songbird sings ahead. Listen —",
    tone: "tender",
    isNew: true,
  },
  {
    id: "finale_loss_we_begin_again",
    scene: "finale",
    trigger: "GreatBattleScene.runLossEnding() — candles out, the canon loss ending (wired)",
    text: "The last candle gutters out. He is still standing. Runa's voice, quiet and unbroken: we begin again, then.",
    tone: "intimate",
    isNew: true,
  },
];

export const RUNA_LINES: readonly RunaLine[] = [
  ...TITLE_LINES,
  ...OPENING_LINES,
  ...HUB_LINES,
  ...WINTER_LINES,
  ...SUNKEN_LINES,
  ...FORGE_LINES,
  ...SKY_LINES,
  ...WOOD_LINES,
  ...AMBIENT_LINES,
  ...FINALE_LINES,
];

/** Pick a random low-Heart ambient line, for the scene to render as a caption. */
export function pickLowHeartLine(): RunaLine {
  const pool = AMBIENT_LINES.filter((l) =>
    l.id.startsWith("ambient_low_heart_"),
  );
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Lookup a Runa line by ID. Returns undefined if not found. */
export function getRunaLine(id: string): RunaLine | undefined {
  return RUNA_LINES.find((line) => line.id === id);
}

/** All lines in a given scene, in declaration order. */
export function getRunaLinesForScene(scene: RunaScene): readonly RunaLine[] {
  return RUNA_LINES.filter((line) => line.scene === scene);
}
