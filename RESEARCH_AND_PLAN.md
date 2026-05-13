# A Sequel to Touch Type Tale — Research & Plan

A research + design document for a kid-and-parent project: making a spiritual sequel to Pumpernickel Studio's **Touch Type Tale** (2023/2024), aimed at a young son who already loves the original.

This document captures (1) what makes the original tick, (2) what neighboring games do well, (3) a proposed design for the sequel, and (4) a phased implementation plan a parent could realistically ship over a few months of weekend work, ideally with the kid in the room.

---

## 0. Decisions locked in

These answers from the parent shape every section that follows; they're called out here so the rest of the document reads as a finalized plan rather than a survey of options.

- **Player profile**: Aiden, age 11 turning 12, fluent reader, **already touch-types** with reasonable speed. The home-row prologue collapses to a brief warmup (~60 seconds); the curriculum's center of gravity moves to speed under pressure, accuracy at speed, capitals/symbols, and reforming any leftover hunt-and-peck habits. Chapters lean harder and earlier than they would for a beginner.
- **Story direction**: same medieval fairy-tale storybook vibe as Touch Type Tale, **fresh world** — kingdom of Holdfast (Nordic-medieval, fjord-side, ancient library tower), original protagonist **Wren**, original Almanac fiction. Clean homage line.
- **Story canon (locked this round)**: cartographer **Runa**, faceless dark-armored antagonist **the Quiet Lord** whose only voiced word is `Again.` at the finale's end, gender-selectable Wren whose visual references the player's own children, **Saga** (younger sister, if boy Wren) or **Magnus** (older brother, if girl Wren) waiting at home. Five optional companion creatures, one per realm, gated by the realm's *kindness* fork choices. Realms run ~20 min each under a 3-act structure (Arrival / Path Splits / Boss & Aftermath). The Quiet Lord's signature word `Again.` builds one letter at a time across the five realm-boss defeats. Full story canon — characters, fork tables, finale composition matrix, the opening scene, and two realms (Winter Mountain and Sunken Bell) specced in full — is captured in §5.5.
- **Game shape**: a **hub (the Portal Chamber) + magic portals to wildly different realms + choose-your-own-adventure branching + a final battle** to defend the kingdom. The composition of the final battle is shaped by Aiden's choices across the realms, giving the game real replay value.
- **One cohesive game, not an anthology of mini-games.** Variety comes from realm settings, enemies, art, and narrative beats — not from swapping in different gameplay patterns per realm. The core verbs (type-to-act, type-to-battle, type-to-choose, type-to-cast-spells) stay consistent throughout so the experience plays as a single story-driven adventure, not a chapter book of disconnected mini-games.
- **Art direction**: stay close to **Touch Type Tale's look** — hand-drawn, painterly, fairy-tale-storybook, low-clutter maps with strong silhouettes. Aiden likes how TTT looks, so we anchor the style there rather than chasing a different reference. All assets sourced cleanly (CC0 / commissioned / original) so the homage stays homage.
- **Voice acting**: **AI voice generation** for the narrator, the Quiet Lord, and any other speaking characters. Default tool is ElevenLabs (consistent voices, decent emotion range, commercial-use license on the Creator/Pro tier as of 2026); alternatives are PlayHT, OpenAI TTS, or Murf. The big wins: zero recording schedule, easy iteration on lines as the script evolves, distinct voices per character without hiring multiple actors. We pick the narrator voice and the Quiet Lord voice in Phase 1, lock the cast, and reuse the same voices through Phase 4 so the characters stay recognizable.
- **Build mode**: parent codes, Aiden watches and reacts as lead playtester. Phaser 3 + TypeScript.
- **Target platform**: **browser, hosted on GitHub Pages**. Phaser builds to a static bundle that GitHub Pages serves for free; the project ships to a URL Aiden can open from any browser on day one. If the scope ever grows past what a browser handles well, Phaser bundles cleanly into Electron or Tauri for a Steam/desktop release later — no rewrite needed.
- **Cloud save**: progress syncs across devices and sessions via a small backend service (**Supabase** as the default — free tier covers our needs indefinitely, Postgres + auth in one). Aiden signs in once (Google OAuth, one click) and his save follows him to any computer or browser. `localStorage` still acts as a fast local cache and a fallback when offline; cloud is the source of truth. Backend stack: GitHub Pages (static frontend) ↔ Supabase (Postgres + Auth). Schema is tiny: one row per player profile, JSON columns for realm progress and satchel contents.
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

The kingdom of **Holdfast** is the last quiet place. An ancient enemy — the **Quiet Lord**, who hates language and loves silence — is gathering an army across the **Realms Beyond**. The realms drift in and out of Holdfast's reach through old, half-forgotten portals carved into the walls of the royal library.

The portals only work for a Portalwright: a scribe trained to type a realm's true name and pull it close enough to step through. The kingdom has not had a Portalwright in a hundred years. The royal cartographer — old, half-blind, kind — has trained an apprentice (**Wren**, working title) on the kingdom's last brass typewriter, and now hands the apprentice the **Almanac**: a book that records each realm Wren visits, each ally won, and each artifact reclaimed. Holdfast will not survive the Quiet Lord's army on its own. Wren must travel through the realms, gather strength, and bring it home in time for the great battle.

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

A warm narrator (the cartographer, in voice-over) reads the world to Wren as he types. All voices are AI-generated via ElevenLabs; we lock the narrator's voice in Phase 1 and reuse it through Phase 4, so the cartographer stays recognizable across the whole story.

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
| 6 | **The Great Battle of Holdfast** | Everything | Holdfast's walls and great hall. A three-phase finale: skirmish, boss duel with the Quiet Lord, and a final-phrase climax where Aiden types a long sentence to seal him. | The composition of his army, the boss's weaknesses, and the available final-phrase choices are all determined by his earlier realm choices. |

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

## 5.5. Story canon (locked)

After §5's design vision, a focused design pass with the parent settled the canon for the game's story. **This section is the source of truth** for naming, character, and per-realm content. The high-level realm table in §5 stands as the original sketch; the detailed structure below supersedes it where they conflict.

### 5.5.1 — The cast and the world

- **Holdfast** (kingdom name). A Nordic-medieval royal seat at the head of a fjord, with stone-and-timber halls, dragon-prow eaves, rune-inscribed lintels, and pine forests rising on one side. The Winter Mountain itself is visible from the castle walls — the closest of the Realms Beyond, the first portal to wake. The royal library is a domed tower at the back of the castle, converted from an old observatory; three storeys of shelves circle a central well, and the five portal arches are carved into the well's walls.
- **Wren** (apprentice scribe, protagonist). The player picks Wren's gender at game start. Visual reference: drawn from the parent's two children — one becomes Wren, the other becomes the sibling at home.
- **The sibling at home**:
  - Boy Wren → **younger sister Saga**. Old Norse for "story" — literally what the Quiet Lord is trying to silence. Curious, small, holds something handmade.
  - Girl Wren → **older brother Magnus**. Latin/Old Norse for "great" — the protective elder. Half-amused, half-worried.
- **Runa** (royal cartographer, mentor, narrator). Old Norse for "rune" or "secret lore." Deep blue coat over scribe's robes, brass astrolabe at belt, ink-stained fingertips, a rune burned into the back of her left hand (royal cartographer's mark). Half-blind in one eye from a lifetime of candlelight reading. Warm but dry. Her voice carries through every realm via the Almanac's magecraft — she is not present in body, but always present in narration.
- **The Quiet Lord** (antagonist). Heavily armored in dark metal. Big. Faceless. A slit of cold blue light where the eyes should be. Never voiced or shown in full until the finale. Speaks throughout the campaign as scratched-out text on screen and as fragments whispered through his minions across the realms. His only audible word is **`Again.`**, voiced as a whisper at the moment he is sealed — the period clicks audibly into place. (If Wren fails, he still whispers `Again.`; Runa's voice closes the game with "we begin again, then." A loss is its own ending, not a game over.)
- **Bjarn** (the brass typewriter, working name). A named artifact. The first thing Wren types in the opening scene is its name. *The typewriter's name is open to renaming by Aiden.*

### 5.5.2 — The opening scene

A 2–3 minute cold-open in Holdfast's library tower at night that teaches the typing mechanic at zero stakes and plants the Quiet Lord's mystery from minute one.

**Setting**: Night. Snow falling outside leaded windows. Five great archways carved into the library walls, dark and silent. A writing desk at the center of the room holds a brass typewriter in an open case and a heavy leather-bound book — the Almanac — with brass clasps.

**Beat 1 — A child carries a typewriter.** Wren (boy or girl per player choice) walks into frame holding the brass typewriter. Sets it on the desk.
> RUNA *(narrator, before we see her)*: "In the kingdom of Holdfast — the last quiet place in the world — a child has been waiting all evening to be called downstairs."

**Beat 2 — Runa enters.** She comes down a spiral staircase: deep blue coat, brass astrolabe, ink-stained fingertips, rune on the back of her hand.
> RUNA: "Wren. Hands on the keys."

**Beat 3 — The sibling appears at the doorway.**
> *If boy Wren:* SAGA *(small, curious, in nightclothes, holding a small drawing)*: "Are the portals really real, Runa?"
> *If girl Wren:* MAGNUS *(leaning in the doorway, half-amused, half-worried)*: "You don't have to do this. There has to be another way."

Runa doesn't answer them. She speaks to Wren.

**Beat 4 — Type your name.** *(Teaches the typing mechanic. Stakes zero.)*
> RUNA: "The kingdom has not had a Portalwright in a hundred years. Tonight we find out if it has one now. Type your name."
> *Player types*: `Wren`

The typewriter clicks. A soft chime. A page in the Almanac stirs on its own.

> RUNA *(warm)*: "Good. Now — the typewriter's name. They have names, you know. Yours is a brass one, so the name will be Bjarn. Type it."
> *Player types*: `Bjarn`

Brass hums. Candles flicker. The air warms.

**Beat 5 — The Almanac.**
> RUNA: "The Quiet Lord has been waking up for some time. Across the Realms Beyond he has been gathering an army that hates language and loves silence. He will come here. Soon. This is the Almanac. It will record everywhere you go and everyone you save and everything you bring home. It is yours now."

**Beat 6 — The first arch wakes.** The arch nearest the desk flickers. Pale cold light from beyond. A distant sound — wolves on a mountain. Snow blows through.
> RUNA: "The Winter Mountain has woken. It will take you first. Type its name when you are ready."
> *Player types*: `The Winter Mountain`

The arch opens fully.

**Beat 7 — The sibling's farewell.**
> *If Saga*: "Wren. I made you something." *(holds up a small drawing, pressed against her chest)*
> *If Magnus*: "Wren. I'll be here. Don't take long."

> RUNA *(gently, to Wren)*: "Go. The Almanac knows the way back."

**Beat 8 — Wren steps through.** As Wren crosses the arch, the Almanac on the desk behind him opens to its first blank page. For a fraction of a second, scratched-out text appears in the margin — `~~A~~` — then vanishes. *(See §5.5.10 for the full mechanic.)*

Smash cut to the Winter Mountain. Snow. Wolves. The portal closes behind Wren.

### 5.5.3 — The 3-act realm template

Every realm follows the same shape. Target length: **~20 minutes per realm**. Across 5 realms + finale this gives a first-run campaign of roughly 2 hours, with real replay value via the CYOA branches.

- **Act 1 — Arrival (~5 min)**: Wren walks into the realm, meets a non-boss NPC, picks up an Almanac lore page. The realm's curriculum focus is introduced gently with short typed obstacles on small environmental beats. No combat yet.
- **Act 2 — The Path Splits (~7 min)**: Escalating encounters specific to the realm's curriculum focus. The realm's **mid-fork** happens here. Both branches lead through a short branch-specific sequence (3–4 typed passages) before reconverging at the entrance to the boss area.
- **Act 3 — The Boss & The Aftermath (~8 min)**: The realm boss is a multi-stage encounter, typically three phases each tightening one mechanic. The realm's **end-fork** happens after the boss falls. The creature companion gate is evaluated. A long-form 60–80 char "true name of the realm" passage is the realm's climax, sung back to Wren by the realm itself. Almanac stamps. Portal home opens.

**Content categories beyond combat** (introduced across the realms):

- **Exploration beats**: short scrolling-walk sections with typed obstacles (`lift` a log, `step` across ice). Builds rhythm at low stakes.
- **NPC mini-encounters**: 1–2 named non-boss characters per realm, each with a short typed conversation (3–6 lines) that unlocks an Almanac lore page.
- **Long-form realm passages**: a 60–80 char passage at the realm's climax, the "true name" of the realm spoken back to Wren.
- **Skill micro-challenges**: short gated sequences with a specific failure rule (no-miss ice bridge; beat-locked rhythm passage; fast-decay snow drift).
- **Almanac lore pages**: 3–5 collectible per realm. Some auto-unlock; some require optional choices or hidden inputs.

**New encounter mechanics** (one or two per realm, layered over the existing word-target system):

- **Words that grow**: an enemy's word adds a letter every few seconds (pressure to commit fast).
- **Environmental decay / sensory mechanic**: each realm has its own — Winter's snow drift, Bell's bell-echo dimming + beat-locked claiming, Forge's heat shimmer, Sky-Island's lantern blur, Wood's mist roll.
- **Multi-target switching**: late realms force Wren to track 2 simultaneous claimable words requiring different first letters.

### 5.5.4 — Realm summary

| Realm | Curriculum focus | Sensory mechanic | Boss | Creature gate |
|---|---|---|---|---|
| **Winter Mountain** | lowercase + accuracy | snow drift (1s word-obscuring) | Pack-Leader | Snow-fox cub |
| **Sunken Bell** | rhythm, alternation, bigrams | bell-echo dimming + beat-locked claiming | Bell-Warden | Glass-fish |
| **Clockwork Forge** | Shift / capitals, modifier-key spells | heat shimmer | Command-Golem | Brass songbird |
| **Sky-Island of Lanterns** | longer phrases, full sentences | lantern blur | Scholar-Spirit | Lantern-moth |
| **Haunted Wood** | punctuation, speed under pressure | mist roll | Ghost-King | Wisp-cat |

### 5.5.5 — CYOA fork tables

Each realm has **two forks** (one mid-realm, one at the end). Each option awards an ally and/or a relic. The creature companion is gated separately by specific *kindness* choices within the realm.

#### Winter Mountain

**Fork 1 — The Trail Splits**:
- A. Save Sigrid the Huntress → Ally: *Sigrid* · Relic: *Hunter's Horn*
- B. Follow the Firefly Drift → Ally: *the Firefly Drift* · Relic: *Firefly Lantern*

**Fork 2 — After the Pack Leader Falls**:
- A. Bury the pack leader under cairn stones → Relic: *Cairn-Token*
- B. Take the pack leader's pelt → Relic: *Pelt of the Old One*

**Snow-fox unlock**: Fork 1A + Fork 2A.

#### Sunken Bell

**Fork 1 — The Cathedral Doors**:
- A. Open them slowly with the bell-keeper's quiet chant → Ally: *Old Olin* · Relic: *Quiet Chant*
- B. Force them open with thunderclap → Relic: *Lock-Bar*

**Fork 2 — Beneath the Bell**:
- A. Free King Aurland of the merfolk → Ally: *King Aurland* · Relic: *Trident-Token*
- B. Claim the bell's tongue as a weapon → Relic: *Bell's Tongue*

**Glass-fish unlock**: Fork 2A.

#### Clockwork Forge

**Fork 1 — The Foundry Floor**:
- A. Help Smith Forn repair the broken bellows → Ally: *Smith Forn* · Relic: *Bellows-Hammer*
- B. Side with the rebel apprentices → Ally: *the Apprentices' Cabal* · Relic: *Sabotage-Wrench*

**Fork 2 — The Golem Boss**:
- A. Capitalized commands to order the golem to stand down → Relic: *Master-Key*
- B. Defeat the golem in direct combat → Relic: *Golem-Heart*

**Brass songbird unlock**: Fork 1A + Fork 2A.

#### Sky-Island of Lanterns

**Fork 1 — The Library Tower**:
- A. Help Scholar Etta re-shelve her last unburned book → Ally: *Scholar Etta* · Relic: *Etta's Ledger*
- B. Steal a flame from the great beacon → Relic: *Beacon-Spark*

**Fork 2 — The Riddling Wind**:
- A. Answer the scholar-spirit's riddle with the longest, kindest phrase → Relic: *Wind-Phrase*
- B. Cut the spirit's tether → Ally: *the Untethered Wind* · Relic: *Tether-Cord*

**Lantern-moth unlock**: Fork 1A.

#### Haunted Wood

**Fork 1 — The Crossroads Shrine**:
- A. Leave an offering of words → Ally: *the Shrine-Tender* · Relic: *Shrine-Token*
- B. Take the shrine's bone-flute → Relic: *Bone-Flute*

**Fork 2 — The Ghost-King's Hall**:
- A. Bargain with the Ghost-King (speak his true name) → Ally: *the Ghost-King* · Relic: *Ghost-King's Promise*
- B. Burn the cursed grove → Relic: *Ash-Vial*

**Wisp-cat unlock**: Fork 2A.

### 5.5.6 — Winter Mountain (full spec)

#### Act 1 — Down the Foothills (~5 min)

- **Arrival**. Portal closes, snow muffles the world. Wren walks into frame on a frozen river path. Runa narrates from "back in the library" — her voice slightly distant.
- **The Frozen River**. Three short typed exploration beats as Wren walks: `lift` a fallen log, `step` across thin ice, `duck` under a low pine branch. Each is one short word.
- **The Wayshrine Knight**. Wren reaches an old wayshrine with a frozen knight (named **Heldur**) standing over it. A line is inscribed on the shrine: `i am called heldur. i held this pass once. tell me of holdfast.` Wren types it. The knight thaws briefly, tells Wren one fragment of Holdfast's history, then refreezes. Almanac lore page 1: *"The Hundred Quiet Years."*
- **The Edge of the Dark Wood**. Runa: "Wren — something is moving in the trees. Be ready." The **cold-decay mechanic** begins: Wren's three candles slowly dim from cold. Typing `kindle` once per minute keeps them lit.

#### Act 2 — Through the Pack (~7 min)

- **Wave 1** (3 wolves, 14s advance — already built).
- **The Wounded Fox**. A clearing. A small white fox curled in the snow, hurt. Wren can type one of two short phrases:
  - `i mean no harm` → the fox watches Wren from the trees for the rest of the realm. *(First half of the snow-fox companion gate.)*
  - `i don't have time` → the fox vanishes; no companion this run.
- **Wave 2** (3 wolves, 11s advance — already built).
- **The Trail Fork** (Fork 1: save Sigrid OR follow the Firefly Drift — already built).
- **Branch-specific sequence (4 short typed passages each)**:
  - *Huntress branch*: `free her hands` → `she gives you her horn` → `together now` → `the pack scatters behind us`.
  - *Firefly branch*: `bright` → `kindle` → `hold steady` → `the summit waits`.
- **Reconvergence: The Approach**. Both branches end at the summit pass.

#### Act 3 — The Pack Leader (~8 min)

- **Wave 3** (4 wolves + pack-leader boss — already built).
- **Snow-drift sensory beat**: when Wren defeats two regular wolves, the screen briefly fills with falling snow obscuring words for 2s. Hold position.
- **Pack-leader released** when all regulars fall (ward mechanic — already built). His phrase remains `the old one, stirring.`.
- **The boss falls**. Scratched-out text flashes on screen: ~~A~~. The Almanac, back in Holdfast, ripples.
- **The Aftermath Fork** (Fork 2: bury under cairn stones OR take the pelt).
- **Snow-fox gate**. If Wren picked Fork 1A + Fork 2A, the fox returns. Wren can `whisper to her` or `let her go`.
- **The Realm's True Name**: 70-char long-form passage: `the winter mountain settles. its old breath warms. the snow rests.`
- **Almanac stamp**. The Winter Mountain page fills in with whichever choices Wren made. The scratched ~~A~~ sits in the margin.

**Lore pages collectible** (5): *The Hundred Quiet Years*, *The Wounded Fox's Name*, *The Huntress's Song* OR *The Firefly Trail*, *The Pack Leader's True Name*, *Wayshrine Runes* (hidden).

### 5.5.7 — Sunken Bell (full spec)

#### Act 1 — Down to the Cathedral (~6 min)

- **Arrival**. Portal opens onto a flooded nave. Wren can breathe here — the realm is half-real, half-memory. Runa: "Wren, this place has been listening for a hundred years. Move slowly. The bell sets the pace."
- **The Descent**. Three short typed exploration beats as Wren swims down: `swim`, `glow`, `breathe`. Each word floats on a hanging lantern that lights as the word is completed; lanterns pulse to the bell's beat.
- **Old Olin the Bell-Tender**. Wren finds an aged merfolk priest sitting on a pew, half-deaf — survived the drowning because he couldn't hear the Lord's command. Typed conversation:
  > Olin: `tell me your name, child.` → Wren: `Wren.`
  > Olin: `you are listening for the bell. it tolls slow. on its toll, you may speak. between tolls, you cannot.`
  > Olin: `i taught the bell its name. i can teach you if you let me.` → Wren: `teach me.`

  The bell tolls once. The **beat-locked mechanic** activates. Almanac lore page 1: *"The Drowned Choir."*
- **First Drowned Choir encounter**. Three slow ghosts approach in tempo (one toll every 2s). Wren must type each ghost's first letter on the toll. Words short and rhythm-friendly: `tide`, `salt`, `still`. As a ghost falls, scratched text whispers ~~quiet them~~ across the screen.

#### Act 2 — Through the Cathedral (~8 min)

- **The Nave**. Two escalating Drowned Choir encounters. Wave 1: four ghosts, tighter tempo, bigram-heavy words (`hush`, `swell`, `creep`, `linger`). Wave 2: five ghosts; one splits into two smaller ghosts when defeated.
- **The Bell-Keeper's Chamber**. Side room. The sensory mechanic introduces itself: each toll, the screen dims for one second. Wren learns to type *before* the dimming. Almanac lore page 2 (*"Old Olin's Memory"*) is sitting on a stand — Wren can `read it`.
- **The Cathedral Doors mid-fork** (Fork 1):
  - **A. The Quiet Chant.** Four typed passages, each on a single toll: `slow.` → `the doors remember weight.` → `we knew them once.` → `they part with grace.`
  - **B. Thunderclap-force.** Single target: `OPEN` — must be typed with Shift held AND on-beat. One attempt; failure costs a candle. Then four rapid passages as the doors break: `crash` → `crack` → `clear` → `we pass`.
- **The Approach to the Bell**. Brief walk in tightening corridor. Runa: "Wren — be ready. The Warden has been waiting."

#### Act 3 — The Bell-Warden (~8 min)

A three-phase boss. Each phase tightens the tempo.

- **Phase 1 — The Tolling**. The Warden is a stone-faced merfolk fused into the bell, eyes closed. Three short words on-beat at slow tempo (~2s): `weight`, `silence`, `deep`.
- **Phase 2 — The Tide Rises**. Tempo doubles (~1s). Three bigram-rich hyphenated words requiring two consecutive beats each: `tide-and-toll`, `deep-and-dark`, `still-and-stir`. The Warden's eyes open. Scratched fragment leaks: ~~A_~~.
- **Phase 3 — The Bell Sings**. The Warden's true name as a long-form on-beat passage. Each *word* must be claimed on a toll; letters within a word flow freely. Eight words, two sentences:
  > `i am the bell. i drink the sea.`

  If Wren stumbles, the Warden re-tolls and the phrase resets to the last completed sentence (not the start).

- **The Warden falls**. A long silence. The scratched fragment resolves to ~~Ag~~. The bell, for the first time in a hundred years, falls quiet on its own beat.
- **The End-Fork** (Fork 2):
  - **A. Free King Aurland**. Three short typed passages free him from chains of solidified silence: `break the silence` → `you are remembered` → `swim free, king.` Ally: *King Aurland*. Relic: *Trident-Token*. Almanac lore page 3: *"King Aurland's Promise."*
  - **B. Claim the bell's tongue**. Wren wrenches the bronze clapper free; the bell will never toll again. Relic: *Bell's Tongue*. Almanac lore page 3 instead: *"The Bell's Tongue (a song)."*

- **Glass-fish gate**. If Wren freed Aurland, a single small glass-fish leads Wren up through the dark water. Wren can `take her with you` or `let her go`.
- **The Realm's True Name**: 53-char long-form passage: `the bell remembers. the deep listens. the kingdom holds.`
- **Almanac stamp**. The Sunken Bell page fills in. The scratched ~~Ag~~ sits beside ~~A~~ from Winter Mountain.

**Lore pages collectible** (5): *The Drowned Choir*, *Old Olin's Memory*, *King Aurland's Promise* OR *The Bell's Tongue (a song)*, *The Warden's True Name*, *Notes from a Half-Deaf Priest* (hidden).

### 5.5.8 — Three remaining realms (sketches)

Full specs deferred until just before each enters build. Pattern is locked: 3-act structure, two forks, multi-phase boss, creature gate, realm's true-name passage, scratched fragment reveal.

**Clockwork Forge** *(~22 min)*: Wren descends into a vast foundry. Meets **Old Gregor**, a retired smith who teaches the difference between lowercase commands (golems move) and CAPITALIZED commands (golems obey orders). Three escalating golem encounters that demand Shift-switching mid-word. Mid-fork: help Smith Forn repair the bellows OR side with the rebel apprentices. Boss: the Command-Golem, whose name must be typed half-lowercase, half-capitalized (`stand DOWN` repeated). End-fork: peaceful Capitalized order to stand down OR direct combat. True-name passage: `the forge breathes. the brass remembers. its makers are remembered.` Scratched fragment: ~~Aga~~.

**Sky-Island of Lanterns** *(~25 min — longest realm)*: Wren arrives on a floating island lit by paper lanterns. Meets **the Lantern-Lighter**, a child-spirit who tends the great beacon. Five lantern-temples each pose a longer-phrase encounter (sentences inscribed on lanterns and scrolls). Mid-fork: help Scholar Etta re-shelve her last unburned book OR steal beacon-flame for the library. Boss: the Scholar-Spirit, who poses three riddles each requiring a full-sentence typed answer. End-fork: answer kindly OR cut the spirit's tether. True-name passage: `the sky remembers every page that ever lit. nothing burned is truly gone.` Scratched fragment: ~~Agai~~.

**Haunted Wood** *(~22 min)*: Wren enters a misty wood. Meets **Inga**, a small lost ghost who can't remember her name. Wren can help her by typing her name once a clue is found. Three crossroads encounters where ghosts approach from all sides; punctuation marks `. , ? ! ; :` function as warding glyphs. Mid-fork: leave an offering at the shrine OR take the bone-flute. Boss: the Ghost-King in two phases — phase 1 typed dialogue/bargain, phase 2 a final passage including every punctuation mark. End-fork: bargain (speak his true name) OR burn the grove. True-name passage: `we are remembered. we are quiet. but we are not silent.` (deliberately ironic against the villain). Scratched fragment: ~~Again~~ — no period yet; the period waits for the finale.

### 5.5.9 — Companion creatures

Optional. One per realm, gated by *kindness* choices within that realm. Once Wren has tamed one, the option doesn't appear at later realms — but Wren can refuse a creature and gamble on a later one (the narrator asks "Take this one home, or wait?"). It is possible to finish the game with no creature; this triggers a unique "Walked Alone" ending beat in §5.5.11.

| Realm | Creature | Tame condition | Finale payoff |
|---|---|---|---|
| Winter Mountain | Snow-fox cub | Saved the huntress *and* buried the pack-leader | Phase 1 — darts in and trips a Quiet Lord minion mid-charge |
| Sunken Bell | Glass-fish | Freed King Aurland branch | Phase 2 — lights a dark corridor when the Lord teleports |
| Clockwork Forge | Brass songbird | Helped Smith Forn *and* gave the peaceful order | Phase 3 — sings the next 3 letters of the final phrase if Wren stalls >4s |
| Sky-Island | Lantern-moth | Saved Scholar Etta branch | Phase 2 — lights the throne room when shadow falls (extra hit window) |
| Haunted Wood | Wisp-cat | Bargained with the Ghost-King branch | Phase 2 — opens a hidden flank around the Lord |
| *(no creature)* | — | *(no kindness gate hit)* | Phase 3 — music drops out completely for the final phrase; just typewriter and Runa breathing |

### 5.5.10 — The Quiet Lord's signature mechanic

Core principle: **he doesn't appear in person until the finale. But his words leak through.**

**The accumulating word**: each realm boss carries one fragment of his final word. When the boss falls, scratched-out text flashes on screen revealing one more letter:

| Realm | Boss | Fragment revealed |
|---|---|---|
| Winter Mountain | Pack-Leader | ~~A~~ |
| Sunken Bell | Bell-Warden | ~~Ag~~ |
| Clockwork Forge | Command-Golem | ~~Aga~~ |
| Sky-Island | Scholar-Spirit | ~~Agai~~ |
| Haunted Wood | Ghost-King | ~~Again~~ *(no period)* |
| **Finale** | The Quiet Lord himself | **`Again.`** *(voiced; the period clicks in)* |

The Almanac records the fragments on a hidden page that updates each realm. By realm 3 most kids will start guessing the word; the payoff at the finale is the **period** snapping into place — the moment they realize that's been the word the whole time.

**Realm intrusions**: besides the boss reveal, each realm has one brief moment where the Lord's language intrudes on the realm's diegesis. Music drops to silence; screen darkens slightly.

- **Winter Mountain**: a wolf's floating word, mid-claim, briefly scratches into something else before snapping back.
- **Sunken Bell**: the bell tolls — and for one peal, instead of resonance, the cathedral fills with a low scratched whisper of the Lord's text running across the screen.
- **Clockwork Forge**: a golem's CAPITALIZED command comes out as scratched-out capitals once.
- **Sky-Island**: a lantern's inscription flickers between two readings — one beautiful, one his.
- **Haunted Wood**: the ghosts speak his fragment instead of their own grievances for a few seconds, then return to their own grief.

**Visual rules**: scratched-out text is the same serif font as the rest of the game's text, in cream-on-ink, with bold dark cross-out strokes drawn over it. Cross-out marks animate in (like a quill stroking through). The Lord's text is the **only** scratched-out text in the game; when the player sees it, they know who it's from.

**Optional later add — the Herald**: a faceless armored figure appears at the edge of one scene per realm, watches Wren without engaging. By Haunted Wood the Herald stands beside the Ghost-King during the boss fight. At the finale, the Herald removes his helm and reveals he was the Quiet Lord all along (the helm is empty). Cut from v1 to avoid over-explaining; revisit if it lands.

### 5.5.11 — The Great Battle of Holdfast (finale composition matrix)

Three phases. Each phase reads from Wren's satchel and reshapes accordingly.

**Phase 1 — The Wall Skirmish.** Density and shape of the defending force is the sum of allies gathered.

| Ally present | Adds to Phase 1 |
|---|---|
| Sigrid | a wolf-pack flanks for Wren (extra interrupts) |
| Firefly Drift | dusk becomes dawn — enemy words read brighter |
| Old Olin / Bell-Keeper | merfolk skirmishers, beat-driven enemy spawning |
| King Aurland | full merfolk army; +1 spell charge per wave |
| Smith Forn | spear-tips reforged mid-fight; Shift-spell cooldown halved |
| Apprentices' Cabal | siege engines sabotaged; enemy words shortened by 1 char |
| Scholar Etta | her Ledger auto-completes the easiest enemy each wave |
| Untethered Wind | enemy banners fall, slowing advance |
| Shrine-Tender | first letter miss in any wave is forgiven |
| Ghost-King | a column of ghosts intercepts Quiet Lord minions |

**Zero allies** → "Walked Alone" tone — Runa's narration steadies; no chorus; quiet music. This is its own ending shape, not a failure state.

**Phase 2 — The Duel.** The Lord channels facets of the minions Wren overcame. Relics counter facets.

Big-shape rules (effects that change the duel's *shape*, not micro-tweaks):

- **Bell's Tongue** → one-shot massive hit available, single-use.
- **Master-Key** → unlocks a hidden corridor; Wren can outflank for a free hit window.
- **Sabotage-Wrench** → the Lord's armor jams; duel is shorter but the Lord's `Again.` is angrier.
- **Pelt of the Old One** → Wren survives one Cold attack instead of being knocked back.
- **Tether-Cord** → Wren can bind the Lord for one beat (an extra free phrase).
- **Wind-Phrase + Quiet Chant** (both present) → the Lord's whirlwind attack is permanently canceled.
- **≥3 "force" relics** (Bell's Tongue, Lock-Bar, Sabotage-Wrench, Pelt, Ash-Vial, Beacon-Spark, Golem-Heart, Bone-Flute, Tether-Cord) → the duel goes louder; music swells; the Lord visually cracks open.
- **≥3 "kindness" relics** (Hunter's Horn, Firefly Lantern, Cairn-Token, Quiet Chant, Trident-Token, Bellows-Hammer, Master-Key, Etta's Ledger, Wind-Phrase, Shrine-Token, Ghost-King's Promise) → the duel goes quieter; Runa's voice carries over the fight; the Lord shrinks rather than cracks.

**Phase 3 — The Final Phrase.** Wren types the phrase to seal the Lord. Which phrases are available depends on the satchel.

| Condition | Final phrase Wren types |
|---|---|
| Bell's Tongue + Hunter's Horn | `by horn and toll, the old silence breaks.` |
| Master-Key + Quiet Chant | `by chant and key, you are kept.` |
| Any creature companion + Ghost-King's Promise | `by friend and ghost, you are sealed.` |
| ≥3 kindness relics | `by mercy alone, you are answered.` |
| ≥3 force relics | `by force you came; by force you go.` |
| Walked Alone (no allies, no creature) | `i came alone. i speak alone. you end.` |
| Default | `by word and breath, you are bound.` |

After Wren types the final phrase correctly, the Quiet Lord whispers **`Again.`** as scratched-out text and credits roll.

If Wren fails (runs out of attempts) → the Lord still whispers `Again.`, but Runa's voice closes the game with "we begin again, then." A losing run is its own kind of ending, not a game-over.

### 5.5.12 — Naming and visual references still open

These are flagged for the next design pass with Aiden:

- **Bjarn the typewriter** — confirm the name, or pick another. *(Open to Aiden.)*
- **Wren's visual** — the parent will provide photos of his two children as reference for the character art. The boy reference and the girl reference become Wren and the sibling depending on player choice.
- **Runa's specific voice (ElevenLabs ID)** — to be chosen when narration is generated. Lock the voice before any realm goes into Phase 1 narrator-audio production so she's recognizable across the whole campaign.
- **Quiet Lord's voiced `Again.`** — single line, ElevenLabs, low and metallic; lock in alongside Runa.
- **The five companion names** — Snow-fox, Glass-fish, Brass songbird, Lantern-moth, Wisp-cat are descriptive working titles. Aiden can name each one when he tames it in-game (carried over to the Almanac and the finale's narration).

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
- **The first 60–90 seconds of narration**, generated via ElevenLabs using the locked narrator voice.
- A typewriter-clack SFX, a "claim word" chime, a battle-victory sting, an Almanac-stamp sound.
- **Sign-in + cloud save wiring**: Google OAuth via Supabase Auth, profile row created on first sign-in, save state written to Postgres after every realm scene. `localStorage` serves as a fast local cache for offline play.
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

### Phase 4 — The Great Battle of Holdfast (~2–3 weeks at heavy pace)

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

All directional decisions are locked (see §0). All story canon is locked (see §5.5). The remaining open items are production-side and naming, and none of them block the current Phase 1/2 build:

1. **ElevenLabs voice IDs**. Lock specific voices for **Runa** (narrator across all realms) and **the Quiet Lord** (single voiced word `Again.`) before any realm enters narrator-audio production. Both voices reused unchanged through Phase 4.
2. **Bjarn the typewriter — confirm or rename**. Aiden's call.
3. **Wren's visual**. Parent will supply photos of his children as reference for the character art (boy and girl reference, mapped to Wren and the sibling depending on player choice).
4. **Companion names**. Snow-fox / Glass-fish / Brass songbird / Lantern-moth / Wisp-cat are working titles. Aiden names each in-game when tamed; the name carries to the Almanac and the finale's narration.
5. **The Herald (optional)**. The recurring armored figure that turns out to be the Quiet Lord. Cut from v1 to avoid over-explaining; revisit during Phase 4 if the scratched-word mechanic alone reads as too quiet.

Phase 0 / Phase 1 are already live (combat stakes, escalating waves, adaptive word-bank, pack-leader boss). Phase 2's first realm (Sunken Bell) is fully specced in §5.5.7 and ready to enter build.

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
