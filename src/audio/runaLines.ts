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
  | "ambient";

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

const OPENING_LINES: readonly RunaLine[] = [
  {
    id: "opening_beat1_intro",
    scene: "opening",
    trigger: "OpeningScene.beat1() — scene opens, 3 s hold",
    text: "In the kingdom of Holdfast — the last quiet place in the world — a child has been waiting all evening to be called downstairs.",
    tone: "reading",
  },
  {
    id: "opening_beat2_runa_descends",
    scene: "opening",
    trigger: "OpeningScene.beat2() — Runa fades in at the desk",
    text: "Runa — the royal cartographer — comes down the staircase. Ink-stained. Half-blind in one eye. She has been waiting, too.",
    tone: "reading",
  },
  {
    id: "opening_beat3_sibling_doorway",
    scene: "opening",
    trigger: "OpeningScene.beat3() — sibling fades in at the doorway",
    text: "At the doorway, a small figure in nightclothes holds a drawing against her chest.",
    tone: "tender",
  },
  {
    id: "opening_beat4_type_name",
    scene: "opening",
    trigger: "OpeningScene.beat4() — first typed word: 'Wren'",
    text: "Wren. Hands on the keys. Type your name.",
    tone: "intimate",
  },
  {
    id: "opening_beat5_type_typewriter",
    scene: "opening",
    trigger: "OpeningScene.beat5() — second typed word: 'Bjarn'",
    text: "Good. The typewriter has a name. It is a brass one, so the name is Bjarn. Type it.",
    tone: "intimate",
  },
  {
    id: "opening_beat6_almanac_speech",
    scene: "opening",
    trigger: "OpeningScene.beat6() — Quiet Lord foreshadow + Almanac reveal",
    text: "The Quiet Lord has been waking up. Across the Realms Beyond he is gathering an army that hates language and loves silence. This is the Almanac. It records everywhere you go, everyone you save, everything you bring home. It is yours now.",
    tone: "reading",
  },
  {
    id: "opening_beat7_portal_wakes",
    scene: "opening",
    trigger: "OpeningScene.beat7() — first portal flickers awake",
    text: "The nearest arch flickers. Pale cold light from beyond. A distant sound — wolves on a mountain.",
    tone: "reading",
  },
  {
    id: "opening_beat8_winter_woken",
    scene: "opening",
    trigger: "OpeningScene.beat8() — type 'Winter Mountain' to step through",
    text: "The Winter Mountain has woken. Type its name when you are ready.",
    tone: "intimate",
  },
  {
    id: "opening_beat9_sibling_farewell",
    scene: "opening",
    trigger: "OpeningScene.beat9() — sibling presses the drawing tighter",
    text: "At the doorway, she presses the drawing a little tighter. Wren. I made you something.",
    tone: "tender",
  },
  {
    id: "opening_beat10_bridge_to_hub",
    scene: "opening",
    trigger: "OpeningScene.beat10() — fade to Portal Chamber",
    text: "Runa rises and beckons. You follow her down the hall to the Portal Chamber.",
    tone: "reading",
  },
];

// ─── HUB (Portal Chamber) ─────────────────────────────────────────────────────

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
    text: "The Winter Mountain is the closest. Its arch is lit. Go when you are ready.",
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
    text: "The forge is breathing again. Whether that is Forn's work or yours, hard to tell.",
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
    text: "The pack leader rises. Type its name to fell it.",
    tone: "urgent",
  },
  {
    id: "winter_boss_defeated",
    scene: "winter",
    trigger: "WinterMountainScene.onBossDefeated()",
    text: "The old one slumps. The trail breathes again.",
    tone: "wonder",
  },

  // Wave failure
  {
    id: "winter_wave_reset",
    scene: "winter",
    trigger: "WinterMountainScene.resetWave() — all candles snuffed",
    text: "The dark presses in. Steady your hands and try again.",
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
    trigger: "SunkenBellScene.startWardenPhase2() — tempo doubles (wired)",
    text: "The tide rises. The tempo doubles.",
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
    text: "Three golems stir. Type their words to redirect them.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "forge_wave2_intro",
    scene: "forge",
    trigger:
      "ClockworkForgeScene.startWave2() — second wave; CAPITAL command enters rotation (wired)",
    text: "The golems press forward — one with a word that demands a command.",
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
// Phase 1 coverage for §5.5.8 Wood. The realm's mechanic is punctuation-as-
// direction; Runa's voice gets quieter here than elsewhere because the wood
// itself is quiet. More 'tender' tone than the other realms.

const WOOD_LINES: readonly RunaLine[] = [
  {
    id: "wood_intro_arrival",
    scene: "wood",
    trigger: "HauntedWoodScene — scene opens in fog",
    text: "The portal opens into fog. The wood has been haunted for two hundred years — not because anything bad lives here, but because no one told the ghosts they could go.",
    tone: "reading",
    isNew: true,
  },
  {
    id: "wood_inga_intro",
    scene: "wood",
    trigger: "HauntedWoodScene — Inga appears at the path",
    text: "A small ghost stands between paths. She does not remember her name. She hopes you can find it for her.",
    tone: "tender",
    isNew: true,
  },
  {
    id: "wood_crossroads1_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startCrossroads1() — first four-direction encounter",
    text: "Ghosts approach from four directions. Each direction is bound to a punctuation mark. Type the one that wards it.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "wood_crossroads2_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startCrossroads2() — second crossroads, more directions",
    text: "More crossroads. The marks know which way is open.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_fork1_intro",
    scene: "wood",
    trigger: "HauntedWoodScene — shrine fork (offering vs bone-flute)",
    text: "A crossroads shrine. Leave an offering — or take the bone-flute. Both are quiet choices.",
    tone: "instruction",
    isNew: true,
  },
  {
    id: "wood_ghost_king_rise",
    scene: "wood",
    trigger: "HauntedWoodScene.startBossFight() — Ghost-King rises",
    text: "The Ghost-King rises from the root-throne. Two phases. Listen carefully — the second one is built of every punctuation mark in the wood.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_ghost_king_phase2",
    scene: "wood",
    trigger: "HauntedWoodScene.startBossCapstone() — every-punctuation passage begins",
    text: "His last words are coming. Every mark you have learned is in them. Type them in order.",
    tone: "urgent",
    isNew: true,
  },
  {
    id: "wood_ghost_king_defeated",
    scene: "wood",
    trigger: "HauntedWoodScene.onFinalPassageComplete() — Ghost-King dissolves",
    text: "He smiles for the first and last time. The mist closes around the throne. The ghosts behind him bow their heads.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "wood_truename_intro",
    scene: "wood",
    trigger: "HauntedWoodScene.startFinalPassage() — true-name passage begins",
    text: "The wood speaks its name. Type it whole. The ghosts have somewhere to be, finally.",
    tone: "wonder",
    isNew: true,
  },
  {
    id: "wood_almanac_stamp",
    scene: "wood",
    trigger: "HauntedWoodScene — almanac stamps the page",
    text: "The almanac stamps a page. The wood is quiet, but it is not silent.",
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
