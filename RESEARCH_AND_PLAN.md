# A Sequel to Touch Type Tale — Research & Plan

A research + design document for a kid-and-parent project: making a spiritual sequel to Pumpernickel Studio's **Touch Type Tale** (2023/2024), aimed at a young son who already loves the original.

This document captures (1) what makes the original tick, (2) what neighboring games do well, (3) a proposed design for the sequel, and (4) a phased implementation plan a parent could realistically ship over a few months of weekend work, ideally with the kid in the room.

---

## 0. Decisions locked in

These four answers from the parent shape every section that follows; they're called out here so the rest of the document reads as a finalized plan rather than a survey of options.

- **Player profile**: an 11-year-old, turning 12, already a fluent reader. The plan assumes he can handle multi-word prompts, narrator script with real vocabulary, and humor in the Hilda / Studio Ghibli / Over the Garden Wall register rather than a primary-color picture-book register. The home-row prologue stays, but it moves faster than it would for a six-year-old, and chapters introduce richer story content sooner.
- **Story direction**: same fairy-tale storybook vibe as Touch Type Tale, **fresh world** — not Paul's niece, not the same kingdom. This gives us creative freedom and keeps us cleanly on the right side of the homage line.
- **Build mode**: parent builds, son watches and reacts as the lead playtester. This pushes Phaser 3 + TypeScript clearly to the top of the stack list and demotes Construct 3 to a footnote.
- **PR workflow**: a draft PR opens against a new `main` baseline so changes land via PRs rather than direct pushes.

## 1. Executive summary

**Touch Type Tale** is a hand-drawn, storybook-medieval RTS controlled entirely by typing. It is narrated by Jim Broadbent, scored warmly, and structured around short missions with frequent mini-game palette cleansers (a cook-off, a keyboard-shaped shooting gallery, a rhythm game, a naval bullet-hell, a Grand Strategy puzzle). It won the German Computer Game Award 2023 for Best Expert Game and sits at ~93% positive on Steam. Pumpernickel Studio is three people in Münster; the game took six years; there is no announced sequel and no DLC.

It is **not actually designed as a kids' typing tutor**. The strategic layer, the word bank, and the humor target reading-fluent teens and adults. That a young child loves it anyway is a strong signal: he is responding to the narrator's voice, the storybook art, the immediate "I type, things happen" feedback loop, and the mini-game variety — not to RTS depth.

That points straight at a real, unfilled market gap: a **kid-aimed, narrator-led, story-rich typing adventure with an honest touch-typing curriculum hidden inside the fiction**. Epistory and Nanotale occupy the adult side of this slot; TypingClub and KidzType occupy the curriculum-without-soul side. Nothing serious lives in the middle.

This document proposes a sequel that:

- Keeps Touch Type Tale's storybook tone, narrator-as-companion, mini-game variety, and "typing as control, not as combat target" philosophy.
- Drops the RTS managerial layer in favor of a side-scrolling adventure structure a six-to-ten-year-old can follow.
- Bakes a real home-row-out curriculum into a fictional chapter progression.
- Targets the browser (Phaser 3 + TypeScript) so it runs on whatever computer the kid sits at, with no installs.
- Ships in three small playable milestones rather than one giant year-long push, so the kid sees real progress within a couple of weekends.

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

## 5. Design vision: *"The Apprentice's Almanac"* (working title)

A spiritual successor to Touch Type Tale: same hand-drawn fairy-tale tone, brand-new world, brand-new protagonist. The premise centers a child apprentice and a half-finished magical book of letters.

### Premise

In a windswept coastal town at the edge of an unmapped kingdom, an apprentice named **Wren** is bound to the village's old cartographer. The cartographer is going slowly blind, and the kingdom's roads, rivers, and creatures have begun to *fade out of his great Almanac* as he forgets them. Wren inherits the cartographer's ancient brass typewriter — a strange machine that can re-inscribe the world onto the Almanac's pages, one word at a time. Type a missing creature's name and it shows up. Type a missing road and it reappears under your feet. Type the wrong thing and... well, the typewriter is kind. It'll let you try again.

The Almanac is literally the curriculum. Each chapter is a section of the book; each section requires mastery of a row of the keyboard; each finished page unlocks a new region. Wren's story takes him from the coast inland, climbing toward a half-mythical northern library where, the cartographer thinks, the last missing pages might still exist.

This frames home-row-first as in-world rather than as a worksheet. A warm narrator (the cartographer himself, in voice-over) reads the world to Wren as he types it back into existence. For v1 the parent records the narration on a phone; the warmth matters more than studio quality.

### Structure

A side-scrolling, hand-drawn adventure with a hub-and-spokes map (think Mario World map + Hollow Knight bench-rest cadence, kid-pitched).

- **5–7 chapters**, each ~30–45 minutes of content, releasable independently.
- **A village hub** the player returns to between chapters — the scribe's workshop, where Mira customizes her satchel, looks at the Almanac, and revisits old levels.
- **Each chapter** is one biome, one new key-row introduced, one boss, two or three mini-games, and a story page that closes when the chapter is done.

### Curriculum, hidden in fiction

Pace is set for an 11-year-old fluent reader: the prologue moves quickly, capital letters and Shift are introduced earlier (he can already read mixed-case prose), and punctuation arrives mid-game rather than at the end.

| Chapter | New keys | In-fiction framing |
|---|---|---|
| Prologue | `fjdksla;` home row | "The Sleeping Letters" — Wren wakes the home row by typing eight glowing tiles on the cartographer's desk. Brief; mostly there to establish narrator, tone, and finger placement. |
| 1 | `e r u i` top-row anchors | "The Glade of Vowels" — vowel sprites are hiding among the trees outside town. |
| 2 | `t y g h` central column | "The Bridge of Two Hands" — two ferrymen, one for each hand, get the player alternating across a river. |
| 3 | `c v b n m` bottom row + Shift / capitals | "The Caverns of Hum" — bottom-row words are heavier, and the cavern's named *places* (capitalized) require Shift to enter. Mirrors TTT's case-sensitivity rule. |
| 4 | `q w o p` outer top | "The Owl's Library" — the outer top row is where the rarer words live; the library puzzles use uncommon vocabulary. |
| 5 | `z x . , ? !` punctuation & lone bottom | "The Punctuation Pirates" — a naval mini-game (echo of TTT's naval bullet-hell, slowed down). Punctuation is reframed as cannons. |
| 6 | Speed + accuracy under pressure | "The Capital City" — no new keys, but timed encounters and longer phrases. This is where WPM internally starts to matter, though it's never surfaced as a number. |
| 7 | Numbers & symbols (optional, late) | "The Royal Treasury" — opens after the main story; treats numbers as bonus content, not a gate. |

A new key is only introduced when the previous row's per-letter accuracy across a sliding window of, say, 100 attempts is above ~85%. The player never gets a "you failed the test" screen; they just get an Almanac page that hasn't yet glowed. The narrator handles the framing: *"Hmm, the letter K is still drowsy — let's wake it up properly before we go any further."*

### Core verbs

Three verbs, all typing-driven, all directly echoing Touch Type Tale's design:

1. **Address an in-world target.** A creature, plant, lantern, or door has a short word floating above it. Type the word and the thing happens (creature appears in the Almanac, plant gathered, lantern lit, door opened). The word is generated from the curriculum, not from the fiction — so a sleepy fox might have the word `fad` over it because the curriculum wants the player to practice `f`, `a`, `d`. The narrator never reads the word verbatim; he reads the *action* ("Oh, the fox is yawning — go say hello!").
2. **Inscribe a passage.** Some longer interactions open an inscription sub-screen — a short rhythm-friendly phrase or sentence the player types at their own pace, with the narrator reading it as it appears. This is where mid-length words, real sentences, and capitalization live; an 11-year-old fluent reader will enjoy this verb more than a younger kid would, so it's introduced from chapter 1 onward rather than gated late.
3. **Cast a spell.** Hold a modifier key (Shift for "big," Alt for "wild," Ctrl for "true") while typing a word to produce a stronger or different effect. Direct lift from TTT's modifier-as-magic design. Introduced gradually, never required until the player is comfortable.

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

- **Narrator**: warm, slightly dry, willing to be a goose. Read aloud to children for a living, if possible. The narrator should react to *what the kid does*, not just hand out approvals — surprised, delighted, occasionally bemused.
- **Art**: hand-drawn / watercolor-feeling, with strong silhouettes (Mira and her satchel always readable). Reference: Hilda (the Netflix show), Over the Garden Wall, Studio Ghibli, the Children's Book Council's recent picture-book illustrators. Avoid: bright primary "Fisher-Price" palettes, mascot grins, thumbs-ups.
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

### Phase 1 — The Sleeping Letters (2–4 weekends)

The prologue, end-to-end. Eight glowing tiles on the cartographer's desk. Type the letter on a tile to wake it. When all eight are awake, an Almanac page opens with the cartographer's introduction.

What ships:
- One scene (the cartographer's study) with a parallax background.
- A simple home-row tile interaction: 8 sprites, each with a letter overhead, each playing a "wake up" animation on correct keystroke and a "shake/no" animation + soft chime on incorrect.
- The first 30–60 seconds of the narrator's script, recorded by the parent on a phone — written for an 11-year-old's ear, with the cartographer's voice already established.
- A typewriter-clack SFX (free or hand-recorded), a "letter wakes" chime, an "Almanac page" sting.
- A `localStorage` profile picker (3 starting avatars, no passwords).
- Per-letter accuracy tracking, written to the profile but not yet surfaced.

What's deliberately *not* in Phase 1:
- Anything beyond home row.
- Movement.
- Mini-games.
- Co-op.

End of Phase 1, the son has a thing he can show his friends. The narrator says his name (he typed it). The project becomes real to him; from this point his reactions drive the design of every subsequent chapter.

### Phase 2 — The Glade of Vowels (4–6 weekends)

The first proper "chapter": a side-scrolling forest where vowel sprites hide. Wren walks left/right (arrow keys — kept off the typing fingers), encounters sprites with short curriculum-tuned words floating overhead, types to befriend them. Befriended sprites enter the Almanac and the satchel.

What ships:
- A side-scrolling scene with parallax forest art.
- The "address an in-world target" verb: short words floating over sprites, generated from the per-key error rate.
- A satchel UI: collected sprites visible, kid can name them.
- 5–10 minutes of narrator script for this chapter.
- The first **mini-game**: a "lantern relay" where the kid types a sequence of single letters in time to a slow rhythm. Two minutes long, replayable from the hub.
- A chapter-end Almanac page that unlocks.
- A hub-and-spokes village screen the kid returns to after the chapter.

This is the smallest possible end-to-end *game*. Phase 2 done, the project is shareable to relatives, posted to itch.io if you want, and stands on its own as a small thing.

### Phase 3 — Three more chapters and the family co-op (long horizon)

Repeat the Phase 2 template for chapters 2, 3, and 4: new biome art, new sprites, new mini-game, new Almanac page, new row of keys introduced.

In parallel, add:
- **The asymmetric family co-op mode.** Two profile slots active at once; targets divided by difficulty; shared victory screen.
- **A parent dashboard** at a hidden URL (long-press the title, or `?parent=1` in the URL): per-letter accuracy across the kid's last 30 days, a list of struggle letters, total time played, a simple weekly summary.
- **A "slow mode" toggle** for younger siblings or tired evenings.
- **Two more mini-games**: a cook-off (echo of TTT's cook-off, kid-pitched) and a naval mini-game (echo of TTT's bullet hell, slowed and softened).

End of Phase 3, you have a small but real game with maybe 2–3 hours of unique content, family co-op, and a curriculum that actually works.

### Phase 4 — Polish, publish, share (optional)

Only if Phases 1–3 stuck and the kid still cares:

- An end credits sequence with him named as co-designer.
- A trailer (60 seconds, narrator voiceover, screenshots).
- An itch.io page (free or pay-what-you-want).
- A short Reddit post in r/typing or r/parenting; the genuine market gap surfaced in research suggests there's an audience.
- A Pumpernickel Studio shoutout / link, framed as homage rather than competition.

If the project ever grows past this point, the question of replacing the recorded narration with a celebrity voice, of porting to Steam via Godot/Electron, of localizing into more languages — those are real options. But they are very far past the point where this is "a thing the parent and kid made together," and the original spec for this document is the latter, not the former.

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

The four big directional decisions are locked (see section 0). A handful of smaller calls still benefit from your input before Phase 0:

1. **Browser, desktop, or both?** Phaser-on-the-web is the default; an Electron or Tauri desktop wrapper is easy to add later if he plays mostly on a single laptop. The plan assumes browser unless you say otherwise.
2. **Narrator voice — you, or someone else?** Your voice in his ear, talking to him by name, is hard to beat for a personal gift; but if you'd rather an outside voice (a grandparent, a friend, a hired voice actor at a Phase 4 polish step), the recording pipeline is the same.
3. **Name preference for the protagonist.** The plan uses "Wren" as a placeholder. Easy to swap; worth picking a name your son will enjoy reading on screen.
4. **Mini-game preferences.** The current plan has lantern relay (Phase 2), naval cannons (Phase 3 / chapter 5), and an owl library word puzzle (Phase 3 / chapter 4). If your son already has typing mini-game patterns he loves from TTT or elsewhere, swapping one in for one of these is cheap.

None block Phase 0. Phase 0 just sets up the project and gets the title screen on a deploy URL.

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
