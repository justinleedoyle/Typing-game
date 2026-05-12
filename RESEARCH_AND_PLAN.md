# A Sequel to Touch Type Tale — Research & Plan

A research + design document for a kid-and-parent project: making a spiritual sequel to Pumpernickel Studio's **Touch Type Tale** (2023/2024), aimed at a young son who already loves the original.

This document captures (1) what makes the original tick, (2) what neighboring games do well, (3) a proposed design for the sequel, and (4) a phased implementation plan a parent could realistically ship over a few months of weekend work, ideally with the kid in the room.

---

## 0. Decisions locked in

These answers from the parent shape every section that follows; they're called out here so the rest of the document reads as a finalized plan rather than a survey of options.

- **Player profile**: Aiden, age 11 turning 12, fluent reader, **already touch-types** with reasonable speed. The home-row prologue collapses to a brief warmup (~60 seconds); the curriculum's center of gravity moves to speed under pressure, accuracy at speed, capitals/symbols, and reforming any leftover hunt-and-peck habits. Chapters lean harder and earlier than they would for a beginner.
- **Story direction**: same medieval fairy-tale storybook vibe as Touch Type Tale, **fresh world** — kingdom of Hearthward, original protagonist **Wren**, original Almanac fiction. Clean homage line.
- **Game shape**: a **hub (the Portal Chamber) + magic portals to wildly different realms + choose-your-own-adventure branching + a final battle** to defend the kingdom. The composition of the final battle is shaped by Aiden's choices across the realms, giving the game real replay value.
- **One cohesive game, not an anthology of mini-games.** Variety comes from realm settings, enemies, art, and narrative beats — not from swapping in different gameplay patterns per realm. The core verbs (type-to-act, type-to-battle, type-to-choose, type-to-cast-spells) stay consistent throughout so the experience plays as a single story-driven adventure, not a chapter book of disconnected mini-games.
- **Art direction**: stay close to **Touch Type Tale's look** — hand-drawn, painterly, fairy-tale-storybook, low-clutter maps with strong silhouettes. Aiden likes how TTT looks, so we anchor the style there rather than chasing a different reference. All assets sourced cleanly (CC0 / commissioned / original) so the homage stays homage.
- **Narrator voice**: someone *other* than the parent. Phase 1–3 can ship with a scratch track (free TTS or the parent recording placeholder lines) so development isn't blocked; for Phase 4 / Phase 5 we hire or recruit an outside voice — a grandparent, a friend, or a paid voice actor on Fiverr/Voices.com. Budget for ~5–10 minutes of finished audio per realm.
- **Build mode**: parent codes, Aiden watches and reacts as lead playtester. Phaser 3 + TypeScript.
- **Target platform**: **browser, hosted on GitHub Pages**. Phaser builds to a static bundle that GitHub Pages serves for free; the project ships to a URL Aiden can open from any browser on day one. If the scope ever grows past what a browser handles well, Phaser bundles cleanly into Electron or Tauri for a Steam/desktop release later — no rewrite needed.
- **Test environment**: **Windows PC with a standard US English keyboard.** The plan assumes a US layout for punctuation positioning, Shift behavior, and Alt-vs-AltGr semantics. We'll test in Chrome and Edge on Windows as the primary target; other browsers/OSes get casual passes.
- **Time budget**: heavy / active project. Phase 1 in roughly a week, Phase 2 in 3–4 weeks. Scope can be richer per phase without timeline slip.
- **Sharing intent**: might share publicly later. Asset licensing, font choices, and the homage line are handled cleanly from day one so there's no rework if it ever ships on itch.io, GitHub Pages, or eventually Steam.
- **PR workflow**: changes land via PRs against `main`.

## 1. Executive summary

**Touch Type Tale** is a hand-drawn, storybook-medieval RTS controlled entirely by typing. It is narrated by Jim Broadbent, scored warmly, and structured around short missions with frequent mini-game palette cleansers (a cook-off, a keyboard-shaped shooting gallery, a rhythm game, a naval bullet-hell, a Grand Strategy puzzle). It won the German Computer Game Award 2023 for Best Expert Game and sits at ~93% positive on Steam. Pumpernickel Studio is three people in Münster; the game took six years; there is no announced sequel and no DLC.

It is **not actually designed as a kids' typing tutor**. The strategic layer, the word bank, and the humor target reading-fluent teens and adults. That a young child loves it anyway is a strong signal: he is responding to the narrator's voice, the storybook art, the immediate "I type, things happen" feedback loop, and the mini-game variety — not to RTS depth.

That points straight at a real, unfilled market gap: a **kid-aimed, narrator-led, story-rich typing adventure with an honest touch-typing curriculum hidden inside the fiction**, and with the replay structure of a choose-your-own-adventure book — portals to different worlds, branching choices, a personalized final battle. Epistory and Nanotale occupy the adult side of the story-typing slot; TypingClub and KidzType occupy the curriculum-without-soul side. Nothing in the middle does CYOA, and nothing in CYOA games does typing-as-control.

This document proposes a sequel that:

- Keeps Touch Type Tale's medieval-storybook tone, narrator-as-companion, mini-game variety, hand-drawn art, and "typing as control" philosophy.
- Replaces the RTS managerial layer with a **hub + magic portals + choose-your-own-adventure** structure: Aiden's apprentice opens portals to wildly different realms, makes branching choices inside each, gathers allies and relics, and brings them home for a **final battle** to defend the kingdom.
- Bakes a real touch-typing curriculum into the realms — each realm trains a different skill (alternation, capitals, punctuation, speed) without ever naming the skill.
- Targets the browser (Phaser 3 + TypeScript) so it runs on whatever computer Aiden sits at, with no installs.
- Ships in small playable milestones rather than one giant push, so Aiden sees real progress within the first week.

---

## 2. What Touch Type Tale gets uniquely right

These are the design pillars to preserve in any sequel.

**Typing as a control scheme, not as a combat target.** In most typing games (Z-Type, Typing of the Dead) a word floats over an enemy and the enemy dies when you type it. In Touch Type Tale, words are **addresses for actions**: type the word over a building to enter it, over a road to send units, over a unit to select. Typing is the verb of the entire game world. This is the most original design idea in the game and the one most worth keeping.

**Words are decoupled from semantics and refresh per use.** The word over a farm is not "farm" — it is whatever short word the difficulty model wants you to practice next. This is a clean abstraction: the **fiction** decides what kind of action a target represents; the **curriculum** decides what letters are in the word. A sequel can change the fiction completely and reuse this abstraction unchanged.

**Storybook art with adult craft.** Hand-drawn, painterly, low-clutter, readable at a glance. Production value the parent enjoys is permission for the kid to take the game seriously, and avoids the "rounded primary-color edutainment" tell that older-end kids reject.

**A celebrity-grade narrator carrying the connective tissue.** Jim Broadbent voices everyone with several accents and is reviewed as the single best part of the package. The narrator is functionally the kid's companion — a kindly grandfather reading them a bedtime story while they play.

**Mini-game variety as a dopamine pump.** Cook-off, shooting gallery, rhythm game, naval shoot-'em-up, Grand Strategy puzzle. Each is a different framing of the same typing input. This prevents the core loop from feeling like a drill even when, mechanically, it is one.

**Case sensitivity and modifier keys as fictional powers.** Capitals enter buildings; lowercase moves units; Ctrl selects unit types; Alt casts spells. Shift, Ctrl, and Alt are not extra menus — they are diegetic abilities. This is a really elegant way to teach the modifier keys without ever saying "now we will learn the Shift key."

**Thirteen-language support from day one.** Built in, not retrofitted. For a kids' game this is high-leverage.

---

## 3. What Touch Type Tale doesn't do that a kid-aimed sequel should

These are the gaps the research surfaced — each one is a sequel design opportunity.

**No real touch-typing pedagogy.** The game throws a varied word bank at the player and assumes improvement happens organically. There is no home-row-first introduction, no per-key adaptive difficulty, no struggle-letter tracking. For a learner, this is a missed opportunity; the abstraction "words are decoupled from fiction" actually makes it easy to add this layer without breaking anything.

**Strategic complexity above a young child's head.** Worker assignment, unit-type matchups, flanking bonuses, branching map paths — the kid likely enjoys the mini-games and ignores the strategy. A sequel should either replace the RTS layer with something age-appropriate (a side-scrolling adventure, a hub-and-spokes story) or strip it down to two or three legible verbs.

**Tutorial is criticized.** Reviewers (including GameTyrant) called out that the on-ramp doesn't teach the RTS layer well. For a kids' game this is fatal; the tutorial has to be delightful, patient, and unmissable.

**No progress dashboard for parents.** TypingClub and Nessy Fingers do this and parents value it. A simple weekly view ("here are the letters they've mastered, here's where they're struggling") is cheap to build and earns a lot of trust.

**Error feedback is too quiet.** PC Gamer flagged this explicitly. For a child still building habits, error feedback should be unmistakable, kind, and easy to recover from — not a barely-audible buzz buried in music.

**No mouse fallback, no speed-up, no accessibility considerations.** A sequel built for a learner needs a slow-mode, an optional one-finger fallback for very young siblings, and respectful UX for kids who haven't yet learned home-row position.

**Pacing is slow with no speed-up option.** Early-loop repetition (workers → farms → barracks) was a common criticism. A kids' sequel should keep core loops to 30–90 seconds, with save points every 2–3 minutes and a natural "stop for today" beat around 15 minutes.

**Humor is gently adult.** The toenail-collection gag, the political-scheming framing — these read for a teen-and-up audience. A sequel should keep the warmth and dry wit but tune the references for a younger sibling.

---

## 4. What the neighboring games teach us

A condensed map of the genre, organized by what to borrow:

| Game | What to take |
|---|---|
| **Epistory: Typing Chronicles** | World literally unfolds from origami pages as you approach. Adaptive difficulty as a two-axis system: slow "skill score" + fast "WPM multiplier." Words grouped by world theme (wood objects spawn wood-themed words). |
| **Nanotale** | Free movement during combat; SPACE locks onto a target before typing — solves Epistory's "stand still and type" feel. Spell modifiers as elemental layers on the core typing verb. |
| **Z-Type** | The "first-letter lock" UX trick: as soon as you type the first letter of a word, that target is claimed and other words starting with the same letter are visually deprioritized. Critical for chaotic screens. |
| **Typing of the Dead** | Per-letter projectile defense — single keys can interrupt incoming threats. A great "interrupt" verb to layer on top of the main word verb. |
| **Cliffhanger (JumpStart)** | Typing as physical traversal — every keystroke moves the character. Strong stimulus-response for young players. |
| **Letter Quest** | Compose words from a tile grid (Scrabble-meets-RPG). Could appear as a late-game mini-game where the kid is "spelling spells" rather than echoing words. |
| **Icarus Proudbottom Teaches Typing** | A strong, idiosyncratic narrator beats a faceless tutor. Twin meters ("Heart" for accuracy, "Soul" for speed) translate abstract metrics into in-fiction feedback. |
| **Mavis Beacon / TypingClub / KidzType** | The pedagogical canon: home-row first, frequency-ordered key introduction, multi-sensory cueing, accuracy before speed, per-letter struggle tracking. This is the curriculum we hide in the fiction. |

The full survey is the input to the design that follows.

---

## 5. Design vision: *"The Portalwright's Almanac"* (working title)

A spiritual successor to Touch Type Tale: same hand-drawn medieval-fairy-tale tone, brand-new world, brand-new protagonist. The premise centers a child apprentice, a magical typewriter that punches open **portals to other realms**, and a story that builds toward a final battle to defend the home kingdom.

### Premise

The kingdom of **Hearthward** is the last quiet place. An ancient enemy — the **Quiet Lord**, who hates language and loves silence — is gathering an army across the **Realms Beyond**. The realms drift in and out of Hearthward's reach through old, half-forgotten portals carved into the walls of the royal library.

The portals only work for a Portalwright: a scribe trained to type a realm's true name and pull it close enough to step through. The kingdom has not had a Portalwright in a hundred years. The royal cartographer — old, half-blind, kind — has trained an apprentice (**Wren**, working title) on the kingdom's last brass typewriter, and now hands the apprentice the **Almanac**: a book that records each realm Wren visits, each ally won, and each artifact reclaimed. Hearthward will not survive the Quiet Lord's army on its own. Wren must travel through the realms, gather strength, and bring it home in time for the great battle.

### Structure: hub + portals + final battle

- **Hub: the Portal Chamber** in the royal library. A circular room with portal arches set into the walls and Wren's desk at the center. Between realms, Wren returns here to write in the Almanac, talk to the cartographer, and choose the next portal.
- **5 portal realms**, each a distinct world (medieval-fairy-tale-shaped but visually wildly different: a winter mountain, a sunken city, a clockwork forge, a sky-island temple, a haunted forest). Each realm is ~30–45 minutes of content for a touch-typer at speed.
- **Choose-your-own-adventure branching** inside each realm. Each realm has 2–3 decision points that fork the path — different encounters, different allies/relics earned, different glimpses of the realm's story. Realms can be replayed and play differently each time.
- **The great battle** as the climactic chapter. The allies and relics Wren gathered across the realms appear on the battlefield. The shape of the battle — who's standing next to you, what you can call on — is determined by Aiden's choices across the playthrough. This is the realization of the CYOA replay loop: a different run produces a meaningfully different finale.

### How the typewriter works (the diegetic mechanic)

This is the load-bearing detail, lifted carefully from Touch Type Tale.

- **Opening a portal**: in the hub, type the realm's name (a multi-word phrase that grows in difficulty across the campaign — e.g. "The Sunken Bell," "The Sky-Island of Lanterns"). The portal hums to life.
- **Inside a realm**: words attach to in-world targets — creatures, doors, allies, traps. Type a word to address it. Words are generated from the curriculum, not the fiction (TTT's design), so the difficulty model is independent of the story.
- **Battles**: typing-combat in the TTT lineage. Words float above enemies; longer or punctuated words for tougher foes; modifier-key spells (Shift / Alt / Ctrl) for special attacks. Each realm's battles have a unique twist — see the realm table below.
- **Decision points**: a CYOA branch is presented as two or three short phrases at the bottom of the screen. Aiden types the *first letter* of the choice to commit, then types the full choice phrase to seal it. (Letter-lock from Z-Type: as soon as he commits a first letter, the other choices fade out, so the input never gets ambiguous.)
- **The Almanac**: every realm Wren clears stamps a page. The page illustration is determined by the choices he made in that realm. By the time he reaches the final battle, the Almanac is a personalized record of the run.

A warm narrator (the cartographer, in voice-over) reads the world to Wren as he types. For v1 the parent records the narration on a phone; the warmth matters more than studio quality.

### Structure

A side-scrolling, hand-drawn adventure with a hub-and-spokes map (think Mario World map + Hollow Knight bench-rest cadence, kid-pitched).

- **5–7 chapters**, each ~30–45 minutes of content, releasable independently.
- **A village hub** the player returns to between chapters — the scribe's workshop, where Mira customizes her satchel, looks at the Almanac, and revisits old levels.
- **Each chapter** is one biome, one new key-row introduced, one boss, two or three mini-games, and a story page that closes when the chapter is done.

### Realms & curriculum, hidden in fiction

Each realm pulls double duty: a self-contained CYOA episode *and* a focused chunk of typing curriculum. Aiden never sees the curriculum framing — the narrator and the realm names do all the framing work. He just plays the realm; the typing skill it trains is what the realm happens to require.

**The gameplay is the same across every realm.** Wren walks, addresses targets, fights enemies, casts spells, and chooses paths using the same core verbs throughout. What changes between realms is the **setting, the enemies, the encounters, the bosses, and the narrative beats** — not the game mechanics. The Winter Mountain feels different from the Sunken Bell because the world looks and sounds different and the enemies behave differently, not because Aiden has to learn a new control scheme.

Realms can be played in different orders after the first (the hub gradually unlocks more portal arches), which is part of the replay loop. The order in the table below is the **recommended first run**.

| # | Realm | Typing focus | Setting & signature encounters | CYOA hook |
|---|---|---|---|---|
| 0 | **The Portal Chamber** (hub) | Home-row warmup + typing the typewriter's name | The royal library at night. Tutorial encounter against a paper effigy of the Quiet Lord. | Choose which portal to open first (only one available at start). |
| 1 | **The Winter Mountain** | All lowercase letters; per-letter slowness diagnostic | Snowy slopes, parallax pines, a huntress's cabin. Signature encounter: wolf pack circling Wren in the dark. | Save the trapped huntress, or follow the firefly trail to the summit. |
| 2 | **The Sunken Bell** | Alternation, rhythm, bigrams | An underwater cathedral whose great bell still tolls. The toll sets the encounter's tempo — enemies move on the beat. | Free the merfolk king, or claim the Bell's tongue as a weapon. |
| 3 | **The Clockwork Forge** | Shift / capitals + modifier-key spells | A subterranean foundry full of clockwork golems. The boss responds to commands — Capitalized words order the golems, lowercase moves them. Direct lift of TTT's case-sensitivity verb. | Repair the forge for the smith, or steal the master-key for the rebels. |
| 4 | **The Sky-Island of Lanterns** | Longer words, dictionary expansion, full phrases | A floating temple lit by paper lanterns. Encounters feature longer phrases inscribed on lanterns and scrolls; the boss is a riddling scholar-spirit. | Light the great beacon, or rescue the island's last scholar. |
| 5 | **The Haunted Wood** | Punctuation `. , ? ! ; :` + speed under pressure | A misty wood where ghosts approach from every direction. Punctuation marks function as warding glyphs against them. | Bargain with the ghost-king, or burn the cursed grove. |
| 6 | **The Great Battle of Hearthward** | Everything | Hearthward's walls and great hall. A three-phase finale: skirmish, boss duel with the Quiet Lord, and a final-phrase climax where Aiden types a long sentence to seal him. | The composition of his army, the boss's weaknesses, and the available final-phrase choices are all determined by his earlier realm choices. |

### How the CYOA branching works

- **2–3 decision points per realm.** Each is a fork in the path, not a paragraph of dialogue. Aiden types to commit; the narrator reads the consequence aloud.
- **Branches diverge briefly, then reconverge** at a realm-end scene. This keeps the content tractable (a realm has ~1.5x the assets of a linear realm, not 4x) while feeling meaningfully different.
- **Each branch leaves a different stamp on the Almanac page** and a different ally or relic in Wren's satchel. The relics aren't power-ups in the RPG sense — they're flavor that pays off in the final battle.
- **The Quiet Lord's final form changes** depending on which realms Aiden completed and how. A different run produces a different final phrase to type.

### Curriculum mechanics (under the hood)

A realm advances when its focus skill is comfortable, not when Aiden passes a test. The per-letter error tracker is repurposed from "which letter is new" to "which letter slows him down" — those letters get seeded into the next realm's word bank silently. The narrator handles framing for any slowdowns: *"Hmm — the letter K still wants a longer pause. Let's give it one."* Aiden never sees a fail screen.

### Core verbs

Four verbs, all typing-driven, all directly echoing Touch Type Tale's design:

1. **Address an in-world target.** A creature, ally, door, lantern, or trap has a short word floating above it. Type the word to act on it. The word is generated from the curriculum, not from the fiction — a sleepy fox might have the word `fad` over it because the curriculum wants Aiden to practice `f`, `a`, `d`. The narrator never reads the word verbatim; he reads the *action* ("Oh, the fox is yawning — go say hello!").
2. **Battle.** Words float above enemies; longer/punctuated words for tougher foes. Z-Type's first-letter-lock means typing the first letter claims an enemy and visually deprioritizes the rest. Each realm puts a different spin on combat (rhythm in the Sunken Bell, bullet-hell in the Haunted Wood, command-and-control in the Clockwork Forge).
3. **Choose a path** at a CYOA fork. Two or three short phrases appear; type the first letter to lock the choice, then complete the phrase. The narrator reads the consequence aloud.
4. **Cast a spell.** Hold a modifier key (Shift for "big," Alt for "wild," Ctrl for "true") while typing a word for a stronger or special effect. Direct lift from TTT's modifier-as-magic design. Introduced gradually in the Clockwork Forge; never required until Aiden is comfortable.

### Reward loops

- **Per keystroke**: a soft typewriter-clack sound + a gentle character animation per correct letter; a low warm "no, try again" chime for incorrect (loud enough — addresses TTT's quiet-error criticism).
- **Per word**: a small visual celebration; the target completes its action.
- **Per encounter (30–90s)**: a creature joins the kid's satchel, a plant blooms, a page on the Almanac unlocks.
- **Per session (~15 min)**: a story page completes; the narrator gives a short reading-aloud beat.
- **Cross-session**: new biomes, new companions in the satchel (Pokémon-light collection), new outfits for Mira, more Almanac pages.

The collected creatures are the cosmetic-first economy: they ride in Wren's satchel, occasionally pop their heads out, can be named by the player. They don't fight; they exist to be collected and to look cute. Nitro Type's enduring appeal is largely garage-cosmetics; this is the same principle, age-corrected.

### Family / co-op mode

The differentiator vs the entire competitive set: **asymmetric family co-op**.

- Same screen, two profiles loaded.
- Parent's targets get longer / rarer / faster words; player's targets get shorter / curriculum-tuned words.
- Shared victory — both contribute to the same chapter completion.
- A "read aloud" mode where the parent reads the narrator's lines and the player types responses — useful even with an 11-year-old fluent reader because it turns a solo activity into a shared one.
- No required network play, no strangers, no chat.

This isn't headline-feature-zero — Phase 2 of the roadmap stays single-player for sanity — but it's the design feature most likely to differentiate the game if it ever grows beyond a personal gift.

### Tone & art

- **Narrator**: warm, slightly dry, willing to be a goose. Read aloud to children for a living, if possible. The narrator should react to *what Aiden does*, not just hand out approvals — surprised, delighted, occasionally bemused.
- **Art**: anchored to **Touch Type Tale's look** — hand-drawn, painterly, fairy-tale-storybook with strong silhouettes and low-clutter maps (Wren and his satchel always readable). Same family as Hilda, Over the Garden Wall, and the recent picture-book-illustrator-in-games tradition, but the immediate reference point is TTT itself. Avoid bright primary "Fisher-Price" palettes, mascot grins, thumbs-ups. All assets must be CC0, commissioned, or original — no direct copying of TTT's art.
- **Music**: small-ensemble — strings, piano, recorder, harp. Quiet enough that the narrator and the typewriter sounds carry.
- **Sound design**: the typewriter clack is the most important asset; it should be mechanical, warm, and physically satisfying. Layered with a chime on word completion and a longer flourish on Almanac unlock.

### Anti-goals (things the sequel will *not* be)

- Not an RTS. The strategy layer goes.
- Not a competitive timed test. WPM is tracked privately; it never headlines the UI.
- Not a punishment game. Mistypes lose progress at most; they never end runs.
- Not a paywalled subscription. One-time purchase or free, no daily-streak guilt.
- Not voice-mascot edutainment. Nobody says "Good job!" after every correct letter.
- Not online multiplayer with strangers. Family co-op only, local or invite-link.

---

## 6. Tech stack recommendation

The research strongly supports **Phaser 3 + TypeScript** as the default for a browser-playable story typing game with multiple scenes, dialogue, light platforming, and mini-games. It is roughly 500 KB of runtime, has a deep tutorial ecosystem, ships with scene/input/audio scaffolding, and has the largest example library of any 2D web engine. A parent doing weekends and evenings will not spend the first month writing a tween engine.

Honest alternatives and when to choose them:

- **Construct 3 (no-code)** if the explicit goal is for the *kid to participate in building it*. Genuinely usable by 8-year-olds, browser-based, no install. The free tier caps at 25 events per project, which prototypes but does not ship.
- **Vanilla TypeScript + Canvas** if the parent already enjoys writing engines and the scope is a single-screen typing arcade — Z-Type proves this works. Probably too austere for an Apprentice's Almanac-shaped game.
- **Godot 4 HTML5** if cross-platform desktop release matters long-term, accepting that browser load times start around 40 MB even for an empty project.
- **PixiJS + Howler + GSAP** if the parent is comfortable wiring their own engine and visual fidelity is the headline. Overkill for a kid project.

Supporting choices:

- **Vite** for dev server and bundling. Fast HMR is worth its weight for kid-in-the-room iteration.
- **Howler.js** for audio routing (Phaser's audio is fine; Howler is better at multi-track mixing for narrator + music + SFX).
- **A simple JSON content format** for word lists, level data, narrator lines, and curriculum state. Avoid a database — keep the whole game data-driven from text files the parent can hand-edit.
- **Static hosting** on Netlify, Vercel, or Cloudflare Pages. No backend in v1.
- **Profile data in `localStorage`** — keyed by a kid-picked avatar/animal, no passwords.

---

## 7. Phased implementation roadmap

Each phase is a few weekends of work, ends in something playable, and could stand alone if the project paused.

### Phase 0 — Foundation (1 weekend)

A static-hosted "hello world" with no game in it yet. The goal is to remove the friction so future weekends are about content, not setup.

- Initialize a Vite + TypeScript + Phaser 3 project.
- Scaffold a single scene that shows the title "The Apprentice's Almanac" in placeholder type, plays one typewriter-clack sound on any keystroke, and shows the letter typed.
- Deploy to Netlify (or chosen static host) at a URL the kid can visit.
- Save the deploy URL; the kid sees it work on his own computer the first weekend.

This is mostly DX setup. It exists so the kid sees the loop close.

### Phase 1 — The Portal Chamber + a tutorial realm (~1 week at heavy pace)

The hub + the very first realm, end-to-end. The Portal Chamber loads as Aiden's home base. The cartographer's voice introduces him to the typewriter. He types the typewriter's name to wake it, then types the name of the first available portal — **The Winter Mountain** — and steps through.

The Winter Mountain in Phase 1 is a short, mostly-linear realm with **one CYOA branch** and **one battle encounter** (a small wolf pack). The branch is "save the trapped huntress, or follow the firefly trail" — two short paths that reconverge at the realm-end scene. Either way Wren returns to the Portal Chamber, the realm is stamped into the Almanac, and the narrator teases the next portal.

What ships:
- **Two scenes**: the Portal Chamber hub (a circular library room with portal arches) and the Winter Mountain realm (snowy slope, parallax pines, a small cabin).
- **The typewriter-name and portal-name typing interactions** — short multi-word phrases.
- **One CYOA branch** with the first-letter-lock UI and the typed-to-confirm verb.
- **One battle encounter** (3–4 wolves, word-over-enemy combat with first-letter-lock).
- **The Almanac UI**: a book in the corner of the Portal Chamber that opens to show stamped realm pages.
- **The first 60–90 seconds of narration**, recorded by you on a phone (or via the WebAudio Recorder API — easy to add later).
- A typewriter-clack SFX, a "claim word" chime, a battle-victory sting, an Almanac-stamp sound.
- A `localStorage` profile picker (avatar + name; no passwords).
- Per-letter accuracy tracking, written silently to the profile.

What's deliberately *not* in Phase 1:
- The other four realms.
- Modifier-key spells.
- The final battle.
- Family co-op.

End of Phase 1, Aiden has a thing he can show his friends. The narrator says his name. He's run his first portal, made his first choice, and the Almanac has its first stamp. Every subsequent realm reuses this Phase 1 scaffolding.

### Phase 2 — The Sunken Bell + the Clockwork Forge (~3–4 weeks at heavy pace)

Two more portal realms, deeper branching, and the introduction of beat-driven encounters and modifier-key spells. By the end of Phase 2 the realm-template is locked: any future realm is content authoring against a stable engine.

What ships:
- **The Sunken Bell** realm: underwater encounters where enemies move on the beat of a tolling bell. Two CYOA branches (free the merfolk king *or* claim the Bell's tongue). Practices alternation / rhythm / bigrams.
- **The Clockwork Forge** realm: introduces Shift / capitals and the first modifier-key spells. Boss fight where Capitalized commands order golems and lowercase moves them. Two CYOA branches (repair the forge *or* steal the master-key).
- **Realm-selection UI** on the Portal Chamber's portal arches: the second arch lights up when the Winter Mountain is cleared; the third lights up after the Sunken Bell.
- **Allies and relics**: the satchel system. Each branch awards a different ally or relic. They appear cosmetically in the hub and will pay off in Phase 4's final battle.
- **The narrator script** for both realms (5–10 min of audio per realm).
- **A "replay realm" option** from the hub — Aiden can re-enter any cleared realm to take the other branch.

End of Phase 2, the project is shareable as a small but real game with three realms and meaningful replay value. Standalone milestone.

### Phase 3 — The Sky-Island & the Haunted Wood (~3–4 weeks at heavy pace)

The last two adventure realms, broadening the kind of encounters Wren faces while keeping the same core gameplay.

- **The Sky-Island of Lanterns**: longer phrases and full sentences inscribed on lit lanterns and scrolls. The boss is a riddling scholar-spirit who tests Wren with longer passages. Practices longer words and phrases.
- **The Haunted Wood**: punctuation as warding glyphs against ghosts that approach from all sides. The last realm before the finale.
- Both realms ship with two CYOA branches and unique allies/relics.
- **Parent dashboard** added at this point (hidden behind `?parent=1` or a long-press on the title): per-letter accuracy across the last 30 days, struggle letters, time played, weekly summary.
- **Slow mode toggle** in settings for tired evenings.

End of Phase 3, five realms are playable, the Almanac is filling up with stamps, and the final battle is the only remaining content.

### Phase 4 — The Great Battle of Hearthward (~2–3 weeks at heavy pace)

The climax. This is the realization of the CYOA replay loop: a different run produces a meaningfully different finale.

What ships:
- **A three-phase final battle**: (1) a defensive skirmish on the kingdom's walls; (2) a boss duel with the Quiet Lord, whose form is shaped by which realms Aiden completed; (3) a final-phrase climax where Aiden types a long sentence to seal the Quiet Lord — the available phrases depend on the allies in his satchel.
- **The allies show up**: the merfolk king (if freed) sends a wave of reinforcements, the smith (if helped) forges a new typewriter ribbon, etc. Each is a short animated cameo + a mechanical effect.
- **End credits** with Aiden named as co-designer and lead playtester.
- **A "New Game+" option** that preserves nothing but lets him replay with full knowledge of the branches.

After Phase 4, the game stands on its own as a complete experience.

### Phase 5 — Polish, family co-op, publish (optional)

Only if Phases 1–4 stuck and Aiden still cares:

- **Asymmetric family co-op mode**: two profile slots, parent gets harder words, kid gets curriculum-tuned words, shared realm clears. Easy to add now that the realm engine is stable.
- **A trailer** (60 seconds, narrator voiceover, realm montage, the final battle teased).
- **An itch.io page** (free or pay-what-you-want). The market gap surfaced in research suggests there's a genuine audience.
- **A Pumpernickel Studio shoutout** in credits, framed as homage rather than competition.
- **Localization scaffolding** if there's interest — the word lists and narrator captions are already data-driven.

If the project ever grows past this, replacing recorded narration with a hired voice, porting to Steam via Electron/Tauri, and broader localization are all real options. But Phase 4 is already a complete game.

---

## 8. Risks and how to handle them

**The kid loses interest after Phase 1.** Most likely failure mode. Mitigation: each phase ends in a playable, shareable thing. Even if Phase 1 is all that ever ships, it is a complete tiny experience the kid co-built. No phase is contingent on a later phase shipping.

**The narrator recording is bad.** Don't perfect this — a parent-on-a-phone recording is fine for v1. Worry about replacing it only if the project actually grows.

**The art is too ambitious.** Hand-drawn fairy-tale art is real work. Mitigation: start with simple silhouettes on watercolor backgrounds; commission or buy one polished hero asset (Mira herself) and let the world be lower-fi around her. Many indie games ship with this exact look.

**Pedagogy doesn't actually work for the kid.** Mitigation: watch him play. The per-letter accuracy data is for *you*, not for him — use it to tweak the curriculum, the word lists, the difficulty curve, between sessions. A weekend's worth of word-list adjustment is more valuable than any amount of theorizing.

**Scope creep.** The single highest risk. Mitigation: every phase document above is a hard scope cap. Cut content; do not extend timelines. Phase 2 ships with one mini-game even if you have ideas for three.

**Copyright / homage line.** Touch Type Tale is a clearly inspirational property. A spiritual sequel with different art, different name, different protagonist, and different fiction is well within homage territory. Avoid using Pumpernickel's character names, copying art directly, or implying official endorsement. A note in the credits ("Inspired by Touch Type Tale by Pumpernickel Studio") is the right gesture.

---

## 9. Remaining open questions

All directional decisions are now locked (see section 0). A handful of smaller calls are worth thinking about before they land, but none block Phase 0:

1. **The Quiet Lord's voice and design.** The final villain doesn't need a face in Phase 1, but by Phase 4 he needs a recognizable silhouette and a way of "speaking" (does he hiss in scratched-out text? appear as a hooded figure with no mouth? whisper through other characters?). Worth sketching early since it shapes every realm's foreshadowing.
2. **Narrator casting.** Outside-voice is locked, but the *who* is open: a relative, a friend, or a hired voice actor on Fiverr/Voices.com. The hired-actor path is ~$50–200 per realm for studio-quality audio. Decide before Phase 4; Phases 1–3 can ship with a scratch track.
3. **Save-game scope.** Plan currently assumes `localStorage`-only saves (single computer). If Aiden ever wants to play on a different machine, we'd add a free cloud-save backend (Firebase / Supabase / Cloudflare KV). Not needed until Phase 5.
4. **Resolution targets.** Phaser scales fine across screens, but the storybook art has a natural resolution. We'll lock a 16:9 design res (1920×1080 is the safe bet for a Windows desktop in 2026) and let it scale up/down.

Phase 0 just sets up the project, the GitHub Pages deploy, and gets a title screen with a typewriter clack live on a URL Aiden can open. Ready to start whenever you say go.

---

## 10. References

Research drew on the following sources. Every claim should be verifiable by following the links.

### Touch Type Tale primary
- [Touch Type Tale — Pumpernickel Studio (official site)](https://www.pumpernickel-studio.com/touchtypetale)
- [Touch Type Tale on Steam](https://store.steampowered.com/app/909470/Touch_Type_Tale__Strategic_Typing/)
- [Touch Type Tale Demo on Steam](https://store.steampowered.com/app/1327500/Touch_Type_Tale__Strategic_Typing_Demo/)
- [Touch Type Tale on Epic Games Store](https://store.epicgames.com/en-US/p/touch-type-tale)
- [Touch Type Tale — Mythwright (publisher)](https://mythwright.com/games/touch-type-tale)
- [Pumpernickel Studio YouTube](https://www.youtube.com/@pumpernickelstudio634)

### Touch Type Tale reviews & coverage
- [PC Gamer: Controlling this RTS by typing works better than it has any right to](https://www.pcgamer.com/controlling-this-rts-by-typing-works-better-than-it-has-any-right-to/)
- [Big Boss Battle review](https://bigbossbattle.com/touch-type-tale-review/)
- [GameTyrant first impression](https://gametyrant.com/news/touch-type-tale-first-impression-a-unique-type-of-game)
- [GameTyrant full review](https://gametyrant.com/news/touch-type-tale-review-an-rts-game-with-new-mechanics)
- [GameLuster preview](https://gameluster.com/touch-type-tale-preview/)
- [Shacknews hands-on](https://www.shacknews.com/article/134253/touch-type-tale-hands-on-preview)
- [TheGamer preview](https://www.thegamer.com/touch-type-tale-preview-gorgeous-art-killer-gameplay-loop/)
- [ScreenRant preview](https://screenrant.com/touch-type-tale-pc-preview/)
- [Thumb Culture review (Silver Award)](https://www.thumbculture.co.uk/touch-type-tale-pc-review)
- [Pixelkin family review](https://pixelkin.org/2024/11/05/expand-your-kingdom-and-improve-your-typing-skills-with-touch-type-tale/)
- [Mini Bunnies: a 130 WPM typist plays the demo](https://www.minibunnies.com/blog/a-really-good-typists-130-wpm-experience-with-the-touch-type-tale-demo-a-typing-game-where-speed-doesnt-always-matter)
- [Press Play developer interview](https://pressplaynews.net/2023/03/28/developer-interview-touch-type-tale/)
- [SteamDB stats](https://steamdb.info/app/909470/)
- [German Computer Game Awards 2023](https://www.game.de/en/game-the-german-games-industry-association-congratulates-all-winners-of-the-german-computer-game-awards-2023/)

### Reference games — design patterns
- [Epistory: Typing Chronicles on Steam](https://store.steampowered.com/app/398850/Epistory__Typing_Chronicles/)
- [Nanotale: Typing Chronicles on Steam](https://store.steampowered.com/app/944920/Nanotale__Typing_Chronicles/)
- [Z-Type (Phoboslab)](https://zty.pe/) and [PhobosLab post](https://phoboslab.org/log/2011/02/game-on-spotlight-z-type)
- [Icarus Proudbottom Teaches Typing](https://www.holywowstudios.com/teachestyping/)
- [Icarus Proudbottom's Typing Party](https://www.holywowstudios.com/typingparty/)
- [Letter Quest: Grimm's Journey Remastered on Steam](https://store.steampowered.com/app/373970/Letter_Quest_Grimms_Journey_Remastered/)
- [JumpStart Cliffhanger (wiki)](https://jstart.fandom.com/wiki/Cliffhanger)
- [Mavis Beacon Teaches Typing (Wikipedia)](https://en.wikipedia.org/wiki/Mavis_Beacon_Teaches_Typing)
- [Dance Mat Typing / KidzType](https://www.kidztype.com/)
- [Nessy Fingers](https://www.nessy.com/en-us/product/nessy-fingers-touch-typing-home)
- [TypingClub](https://www.typingclub.com/)

### Pedagogy & design research
- [Read & Spell on multi-sensory typing](https://www.readandspell.com/teaching-kids-to-type)
- [Ratatype teacher guide](https://www.ratatype.com/faq/The-ultimate-Guide-for-Teachers-to-teach-touch-typing-to-children/)
- [Typing Agent Keyboarding Foundations](https://help.typingagent.com/en/articles/4005192-keyboarding-foundations-3-general)
- [Brain Balance: normal attention spans by age](https://www.brainbalancecenters.com/blog/normal-attention-span-expectations-by-age)
- [Drill-based vs game-based typing software (Springer)](https://link.springer.com/chapter/10.1007/978-3-642-11245-4_5)

### Tech stack
- [Making your first Phaser 3 game](https://phaser.io/tutorials/making-your-first-phaser-3-game/part1)
- [LogRocket: best JS/HTML5 game engines (2025)](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)
- [Construct 3 Capterra reviews](https://www.capterra.com/p/201543/Construct-3/reviews/)
- [Godot HTML5 export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
