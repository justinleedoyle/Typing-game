# Competitive quality checklist

Updated: 2026-11-03. Owner: Justin and the game team.

The target is a beautiful, emotionally memorable typing adventure where words change places and relationships. Touch Type Tale is a benchmark for craft, interesting decisions and a finished product. Player preference and commercial success must be demonstrated; neither follows from a feature count or passing tests.

This is the durable checklist from the competitive review. Unchecked items are production goals and proposals, not all confirmed defects. Preserve the approved art, canon and existing journeys. Voices come last; human pacing and difficulty tuning remain deferred. Browser playtesting is the current priority.

## Current foundation to preserve

- Five distinct realms, signature typing mechanics, Soul spells, relics and companions already exist.
- Persistent branch choices affect aftermath, collected objects and the finale. The sibling opening has a homecoming payoff.
- Stable checkpoints, conflict/damaged-save recovery, pause/reading controls, comfort settings, typed Almanac navigation and quiet completed portals already exist.
- Browser and packaged desktop checks are evidence of their specific behavior, separate from physical hardware, manual file delivery, authenticated cloud and Steam acceptance.

## 1. Decisions inside encounters — highest priority

- [ ] Add encounters where players choose an action, order, route or use of an existing resource, then see a meaningful consequence.
- [ ] Keep the available action and its subject visually connected; players should understand what their word will do.
- [ ] Make branches offer understandable competing values rather than relying only on an obviously kind versus unkind label.
- [ ] Carry selected consequences forward into later problems, character responses or changed places.
- [ ] Verify every new interaction through cancellation, partial input, interruption, reload and revisit without duplicate rewards or reopened committed choices.

First contained slice: the wounded fox between Winter's first two wolf fights. Let Wren offer light or give the fox room before reassurance; preserve the original option to move on and the established kindness/companion outcome. This introduces narrative agency and physical cause/effect. It is a first step toward deeper encounter design, not proof of the entire tactical-depth goal.

## 2. Character performance and physical illustration

- [ ] Expand Wren's useful acting vocabulary: turns, grounded steps, kneeling/reaching, anticipation, effort, hesitation, relief and character-specific reactions.
- [ ] Give discoveries, threats, sacrifices and reunions distinct staging and visual emphasis.
- [ ] Coordinate bodies, hands, props, contact shadows, foreground occlusion and local light through motion, not just settled screenshots.
- [ ] Add appropriate surface reactions: disturbed snow, water movement, machinery steam and material/weight feedback.
- [ ] Refine conspicuously flat treatments, including the Winter log hollow, to match nearby painted material and depth.
- [ ] Audit motion, reduced motion, interruption and restoration separately; preserve earlier handoff and placement repairs.

## 3. Emotional story and visible consequences

- [ ] Give Wren a clear emotional development across the journey.
- [ ] Show the personal cost of the Quiet Lord's imposed silence through events and people.
- [ ] Distinguish comforting quiet from imposed silence through the story's actions.
- [ ] Let characters remember specific player decisions later.
- [ ] Show how places change after important decisions and revisit those changes where useful.
- [ ] Make the finale answer the story's emotional question while retaining truthful branch summaries and the sibling payoff.

## 4. Sound and music — before voices

- [ ] Finish environmental sound for wind/snow, distant bells/water, machinery/fire, Sky and Wood.
- [ ] Add music that supports locations, discoveries, tension and resolution, with clean scene transitions and volume controls.
- [ ] Reinforce action, material, contact and weight with sound.
- [ ] Verify pause/resume, muted audio, interruption and re-entry without overlapping or orphaned playback.
- [ ] Record and integrate voices only after gameplay, staging and text are stable. Preserve subtitles and deliberate reading controls.

Opening, the chamber bridge and Winter now have original music/environmental audio; the other realms' older ambient entry points remain silent. The full sound/music production goal stays open.

## 5. Almanac, progression and replay

- [ ] Enrich the existing readable Almanac with chapter vignettes, hand-drawn routes, distinctive stamps and marginal discoveries.
- [ ] Record the player's particular journey, including visual before/after memories and character notes where appropriate.
- [ ] Add selected optional encounters or chapter challenges that give revisits a meaningful purpose.
- [ ] If chapter replay is added, preserve the main journey and define exactly which progress can change.
- [ ] Verify replay appeal with players before expanding the realm count or adding new modes.
- [ ] If typing improvement is marketed, define and measure the claimed benefit; the existing adaptive-word heuristic alone does not establish learning gains.

## 6. Finished product and release

- [ ] Validate performance and presentation on representative hardware, resolutions and keyboard layouts.
- [ ] Complete physical desktop focus/fullscreen/IME/OS-file behavior and real manual browser-to-desktop delivery when desktop testing resumes.
- [ ] Verify the account/cloud experience separately if included in the release promise.
- [ ] Select the Steam features to promise; implement and verify those commitments. Achievements and Steam Cloud are candidates, not assumed requirements.
- [ ] Prepare a polished demo with a clear beginning, distinctive interaction and satisfying payoff.
- [ ] Produce a trailer, recognizable store artwork and concise positioning that show why this adventure is worth playing.
- [ ] Maintain art/audio/font provenance and credits, then complete the actual packaging and Steam review requirements.
- [ ] After the build is strong enough, use uncoached external playtests to establish clarity and appeal; human pacing/difficulty remain a later pass.

## Scope and sequencing

1. Complete one Winter interaction with decisions, character acting, world response and durable recovery.
2. Use the opening through Winter as the production-quality slice, with atmosphere and an emotional payoff.
3. Apply the proven standard across the five existing realms and finale.
4. Complete replay/product/release commitments and player acceptance. Voices remain last.

New realms, multiplayer, broad localization and an engine rewrite are not the first priorities. Keep them as separate scope decisions. Continue concrete bug fixes alongside the authored design work.

## Current work and evidence

- [x] First contained milestone: Winter wounded-fox encounter. Offer light or give space produces distinct spacing, a matching kneeling pose and palm-linked feedback before the original reassurance/move-on decision. Final choices retain the established companion and lore outcomes.
- [x] Verify the milestone through ordinary earned Winter entry, approach reload, committed-answer recovery and return to the next fight; separately review alternate approach, correction/release, move-on, historical answers, malformed metadata and large-text/reduced-motion cases in an explicitly synthetic RAM-only fixture.
- Final local validation: 629 logic groups, browser production build and desktop build. The screenshot gallery retains earlier working bundles, transitions and an artwork retry separately; this is a bounded encounter review, not a new full campaign or Steam acceptance.
- New pose: `art/wren/wren-kneel-right-v1.png`; exact image-edit prompt: `art/wren/wren-kneel-right-v1.prompt.md`.
- [x] Second contained milestone: Winter return-route preparation. After either original trail branch, choose to seat/brace the pine before the climb or leave it and take the bank. The later return uses the prepared crossing or separate step/duck actions, with route-specific Almanac memory. This is a work-order/route decision, not resource or risk strategy proof.
- [x] Verify ordinary earned Huntress-to-plan entry, normal reload, route choice/preparation and continuation into the existing pack encounter. Separately review both later returns, committed-response restoration, true-name boundary, large text/reduced motion, historical checkpoints and completed memories in an explicitly synthetic RAM-only fixture. Ordinary later combat and a fresh full campaign are outside this bounded pass.
- Return-route regression validation: 642 logic groups (including actual scene/SaveStore/stage movement, saved final-character decisions, old-history neutrality and temporary actor-layer restoration), browser production build and desktop build. Screenshot review repaired bank support contact, crossing-foot height and Wren's foreground bank layering. Voices and human pacing/difficulty remain deferred.
- Return-route source: `src/game/winterReturnRoute.ts`, `src/game/winterReturnStage.ts`, `src/scenes/WinterMountainScene.ts`; local sprint `.claude/sessions/2026-11-02-winter-return-route.md` and screenshot audit `.claude/playthrough-audit/2026-11-02-winter-return-route/`.
- [x] Third contained milestone: Runa remembers a completed Winter return at her desk. A prepared crossing receives a reflection about leaving something sound behind; the bank receives one about trusting Wren's footing. Historical clears, unfinished returns, unknown route versions and unprepared crossing records retain the original general reflection. Later completed chapters keep their existing priority. Neither response changes rewards or saves.
- [x] Play a fresh ordinary Opening-to-Winter journey through the fox approach, Huntress, route preparation, later combat, burial, accepted companion, true name, return crossing and Runa's reflection. Normal reloads restore the earned return checkpoint and held crossing response; a completed-chapter reload retains Runa's response. This was a browser-only review of one earned route, not every branch or a new full campaign.
- The continuous review exposed a companion placement defect: the accepted fox retained its old glade position beneath the return log and disappeared on checkpoint restoration. The fox now joins Wren on the actual trail bank, follows the supported crossing or bank route, and restores beside him after held responses. Declined or merely inferred companions are not added.
- Reflection/companion regression validation: 648 logic groups and 171,930 checks, typecheck, browser production build and desktop build. Separately labeled RAM-only fixtures review both reflections, older/incomplete history, later-chapter priority, large text/reduced motion, real SaveStore capture/restore and alternate bank companion staging. A desktop build is not physical desktop acceptance.
- Reflection source: `src/scenes/PortalChamberScene.ts`, `src/audio/runaLines.ts`; companion repair: `src/scenes/WinterMountainScene.ts`. Local sprint `.claude/sessions/2026-11-03-winter-reflection-continuous-playthrough.md`; unchanged screenshot originals and exact provenance: `.claude/playthrough-audit/2026-11-03-winter-reflection-continuous/`.
- Opening/Winter audio milestone: two original96-second instrumental themes share a home/return motif; room/lamp texture, mountain wind and trail-only water ground the location. Completed pine, snow, bough, stone and kindle actions have material sounds. Source and sample provenance are retained in `scripts/render-opening-winter-audio.mjs` and `art/audio/README.md`; no voices or third-party recordings.
- Scene-owned sources retain playheads on pause, stop on shutdown/destroy and cannot resume merely because focus returns or a sound preference changes. Pending asset loads cannot resurrect old scenes. Browser autoplay unlock requires deliberate trusted input; audio failure never blocks a journey. Calm aftermath remains calm across burial, pelt, fox reunion, true name and return checkpoints.
- Audio verification:662 logic groups /172,081 checks, typecheck and browser/desktop builds. All10MP3s decode at exact authored lengths without clipped/invalid samples; original browser scenes separately verify actual decoded loop lengths, live output, muted resume, frozen pause positions and deliberate resume. Screenshots document visual flow; meters/asset checks establish their technical scope, while artistic listening acceptance remains separate.
- Audio local sprint `.claude/sessions/2026-11-03-opening-winter-audio.md`; screenshot, actual audio-meter and preview evidence `.claude/playthrough-audit/2026-11-03-opening-winter-audio/`. Fresh ordinary Opening→Winter trail/Heldur and recovery remain separate from synthetic later-phase fixture entries. Broad realm-wide audio work and voices remain open.
- A checkbox closes only when its stated scope is implemented and verified. Partial milestones should link their evidence without checking the whole broad goal.
- Local sprint: `.claude/sessions/2026-11-02-winter-fox-encounter.md`.
- Screenshot audit: `.claude/playthrough-audit/2026-11-02-winter-fox-encounter/`.

## Benchmark references

- [Touch Type Tale official Steam listing](https://store.steampowered.com/app/909470/Touch_Type_Tale_Strategic_Typing/?l=english)
- [Developer's gameplay description](https://www.pumpernickel-studio.com/press/sheet.php?p=touch_type_tale)

The comparison used current source, representative screenshots and official competitor information. It was not a complete head-to-head player-preference study.
