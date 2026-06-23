# Mechanics Roadmap — The Portalwright's Almanac

**Design bar:** rival or exceed *Touch Type Tale* (TTT) in mechanics depth — **"depth, not ease."**
The engine already supports depth; this roadmap is the work to make the realms *use* it.

This file is the tier-level overview. For the full design see [`RESEARCH_AND_PLAN.md`](RESEARCH_AND_PLAN.md)
(§5 anti-goals, §5.5 realm specs). Per-PR working detail lives in the session sprint notes
(`.claude/sessions/…`, local/gitignored). Keep the status here current as PRs land.

## Status at a glance

| Tier | Theme | Status |
|------|-------|--------|
| **Tier 0** | Combat foundation | ✅ **Complete & live** |
| **Tier 1** | Realm signature mechanics made demanding | ✅ **Realms done (5/5)** — optional `Ctrl` follow-up remains |
| **Tier 2** | Shared enemy behaviors | ✅ **Complete** (#107–#110) |
| **Tier 3** | Strategic capstone (the finale) | ✅ **Complete** (#96–#100) |
| **Tier 4** | Relics live in combat | ✅ **Complete** (#101–#105) |

## The four design dimensions

The audit identified four gap dimensions; the user asked for all four. Rough progress:

| Dimension | Where it's addressed | Progress |
|-----------|----------------------|----------|
| Difficulty / ceiling | Tier 0 (miss-cost floor + speed-axis director) | ~mostly done |
| Per-realm variety / encounters | Tier 1 (signature mechanics) + Tier 2 (shared enemy types) | done |
| Input depth (modifiers) | Tier 0 Soul spells + Tier 1 case/modifier work | partial |
| Strategy / meta layer | Tier 0 Soul economy; Tier 3/4 finale + relics | partial |

---

## Tier 0 — combat foundation ✅ COMPLETE

The floor that everything else stands on: misses cost, speed is rewarded, and the difficulty
rises to meet a fast typist.

- ✅ Difficulty tiers (Forgiving / Standard / Purist), default **Standard** (misses cost progress) — **#84**
- ✅ Soul becomes a **spendable** spell-currency (speed + clean typing fills it; spent to cast modifier spells) + clean-streak **combo** — **#85**
- ✅ Boot-hang fix (cloud-load timeout/fallback) — **#86**
- ✅ **Speed-axis wave director** — escalate advance-speed / word-length / concurrency from live WPM, all bounded — **#87**

## Tier 1 — realm signature mechanics made demanding ✅ REALMS DONE (5 / 5)

Each realm's signature mechanic, once cosmetic vs its premise, now genuinely demanding.

- ✅ **Forge** — mixed-case mid-word commands (`reFORGE`) across every golem encounter + boss true-name `stand DOWN` — **#88**
- ✅ **Wood** — compass-warding: directional, mid-string, **masked** ward marks (player must know direction → mark from the compass; wrong ward misses) — **#90** _(plus a live soft-lock fix, **#89**)_
- ✅ **Bell** — tempo-scaled timing window (gate tightens as tempo doubles) + off-beat **de-sync** mid-word (hyphen beats must land or the word wipes) + an off-beat **antiphon** wave + an **air** stake (breath drains on stumbles → non-terminal gasp) + fork-1B `OPEN` Shift+on-beat fix — **#92** _(plus a live first-encounter soft-lock fix, same class as #89)_
- ✅ **Sky** — blur **eats** untyped letters (untyped suffix masked in the beam core → read-ahead pressure; was cosmetic alpha you could wait out) + multi-banner triage tint + a no-miss **sealed-scroll** temple (resets on any error) — **#93**
- ✅ **Winter** — activate the dormant **`Alt`** spell (frost-shatter, alongside the Shift thunderclap) + **case-sensitive** boss capitals (lowercase-first so Shift stays free) + **non-refilling** candle economy (lose-all relights to a floor; clean waves earn candles back) + a **circler** (flanking, vertically-weaving) wolf — **#94**
- ◻ **Forge follow-up** — `Ctrl` "true-name" modifier _(deferred — needs browser-shortcut handling; the one remaining Tier 1 tail)_

## Tier 2 — shared enemy behaviors ✅ COMPLETE

The advancing word-bearing enemy — re-implemented inline in four realms (Winter
`Wolf` / Bell `Ghost` / Forge `Golem` / Wood `HauntedGhost`) with the same
six-step lifecycle and the same two formulas — is now **one shared type**.

- ✅ **The type** — `src/game/movingWordEnemy.ts` (a Phaser wrapper, sibling to
  `ScrollingPhrase`) owns the spawn → entrance → attach `TextWordTarget` → idle-bob
  → advance (anchor + danger ramp) → defeat | reach-Wren (knock-back + retry)
  lifecycle on a realm-supplied container. The two formulas (advance duration,
  danger ramp) + the split geometry live in the pure, unit-tested
  `src/game/movingWordMath.ts`. Per-realm feel constants are options whose defaults
  are the shared values, so each migration changed no numbers.
- ✅ **Forge** — the cleanest core (straight advance, caseSensitive commands,
  spell/alt routing, retry-on-reach). Fixed a latent chain-spark word orphan — **#107**.
- ✅ **Winter** — adds the circler weave (`verticalOffset`), the Pack-Leader's ward
  (`manualAttach` + `attachWord`), the thunderclap's pack `knockBack`, the candle-loss
  `dismiss`, and `onRelease` (Wren's lean) — **#108**.
- ✅ **Wood** — the first diagonal close (Euclidean duration when `wrenY` is set) +
  the compass `maskMarks` warding + the mist's `setHidden` passthrough — **#109**.
- ✅ **Bell** — the declarative `split` capability (the splitting ghost's ebb/drift
  children, via `splitChildPositions`); the beat-gate + breath stay orthogonal
  (keystroke-level) — **#110**.

The conceptual TimedWord / MovingWord / SplittingWord / MultiWord collapse to one
type + facets: **MovingWord** is the type; **TimedWord** is its advance deadline;
**SplittingWord** is the `split` option; **MultiWord** is the controller's existing
first-letter triage (a wave of N enemies). The fork-pick-one + sequential-passage
helpers were deferred by design. Sky's `ScrollingPhrase` stays a sibling (the
scroll-across-and-miss flavour). Net ≈ −410 scene lines across the four realms.

## Tier 3 — strategic capstone (the finale) ✅ COMPLETE

The Great Battle, once an inverted capstone, is now the real climax:

- ✅ A real **fail state** — candles are a losable economy (breach/fumble snuff; clean waves relight); zero candles → the canon "we begin again" loss ending → hub (progress kept) — **#97**
- ✅ Satchel as a **counter-loadout** — the duel opens with one facet per cleared realm (Cold/Toll/Armor/Light/Grief); the right relic neutralizes it, a missing counter forces a timed defense (a candle at risk, never an auto-loss) — **#98**
- ✅ Force-vs-kindness as a real **mechanical fork** — force≥3 chains a deeper mixed-case counter (past the Forge boss) + cracks; kindness≥3 shrinks the Lord but a duel miss costs a candle (cleaner play) — **#99**
- ✅ **Phase-2 input depth** — the climax is a mixed-case case-sensitive counter (`unMAKE`), Forge-boss parity; force adds a second. (Mixed-case/Shift, not Alt — Alt+letter is dead-keyed on macOS) — **#99**
- ✅ The **"Again." period click-in** — the accumulating word completes when the period SNAPS in at the win seal (a discrete beat + a period-snap sting), §5.5.10 — **#100**

Throughout, the empty-satchel **"Walked Alone"** path stays a first-class, winnable outcome (asserted in tests at each step).

**Phase-0 bridge — ✅ DONE.** `src/game/relicEffects.ts` is the single source of
truth for relic semantics (alignment + companion-ness), consumed by BOTH the
finale (Tier 3) and relics-live-in-combat (Tier 4) so meaning is encoded once.
`getActiveRelicEffects(satchel)` resolves the per-phase counts/flags scenes
read. The canon §5.5.11 force/kindness lists (formerly hand-maintained in
`relicAlignment.ts`) are now DERIVED from this descriptor; a canon-match test
guards drift. Freeze-extensible — the counter-loadout's `countersFacet` and any
Tier-4 combat block get added to `RelicEffect` here, not re-encoded at call sites.

## Tier 4 — relics live ✅ COMPLETE

Fork relics now have **in-combat effects** so the CYOA layer doubles as a build choice
(before, relics only mattered in the finale). Realms run in a **fixed order** (Winter →
Bell → Forge → Sky → Wood), so a relic earned in realm *N* arms realms *N+1…5* —
collection became a forward-looking wager.

**The vocabulary — three effect KINDS, two bounding rules.** Every in-realm effect
is `passive` (always on), `oncePerRealm` (single-use, resets on re-enter), or
`perWaveProc` (≤ once per wave). The finale's lesson — *additive-only is
anticlimactic* — is enforced by two rules that live in **one place** (the resolver):
(1) same-effect passives diminish to a hard cap and a targeted passive *softens* a
realm's signature hazard, never cancels it; (2) defensive one-shots share a per-realm
**grace pool capped at 2**. So a relic-rich run is clearly helped but every realm
still bites.

- ✅ **Bridge** — `combat` block on `RelicEffect` + `resolveCombatLoadout(satchel, realmId)`
  (the bounded aggregator scenes read) + relic effects + a guard suite — **#101**. _Mirrors
  the #96 finale bridge: semantics in one module, behavior at the consumers._
- ✅ **Bell** — quiet-advance, warm-light (toll echo-dim), grace pool (air-gasp save) — **#102**.
- ✅ **Forge** — the soul economy (soul-banked / soul-thrift) + quiet-advance; folds in the
  **#99 cleanup** (bellows-hammer's inert finale Shift-cooldown plumbing → its real `soul-thrift`
  job; orphaned `finale_relic_pelt*` lines). Grace gated out (no losable economy) — **#103**.
- ✅ **Sky** — warm-light (lantern blur) + `unseal` (Master Key pardons sealed-scroll reseals,
  via a new `TextWordTarget.setForgiveResets`) + quiet-advance — **#104**.
- ✅ **Wood** — mist-clear (Wind-Phrase) + auto-ease (Etta's Ledger) + warm-light + quiet-advance;
  grace gated out — **#105**.

Soul effects are gated to the Forge (the only forward realm with a cast economy); grace to
Bell + Sky (the only realms with a losable economy). The empty-satchel run is unaffected — every
effect no-ops at zero.

- ✅ **Offensive one-shots** (`toll-strike` / `bind-beat` / `jam-foe`) — **COMPLETE across all three
  reachable realms.** They fire by the keyboard-native route signed off with the user: a
  **Soul-charged, TYPED invocation word** (no modifier — Alt dead-keys on macOS). When an offensive
  relic is owned and the Soul tank fills to `ONESHOT_SOUL_COST`, a charged word (e.g. `toll`) joins
  the combat field; typing it spends the Soul and fires once per realm. Pure vocabulary + "strongest
  foe" pick + charge gate in `src/game/oneShotInvocation.ts` (unit-tested); the charge widget in
  `src/game/oneShotInvoker.ts` (a realm-agnostic Phaser shell, sibling to `MovingWordEnemy`); the
  realm owns the consequence + eligibility (the boss, kept out of `this.golems`, is never one-shot).
  - ✅ **Forge** — `toll-strike` (bells-tongue, earned on the Bell's force fork) fells the strongest
    live golem with a bell toll — **#TBD**. (Forge is the only forward realm where an offensive
    one-shot is usable: Winter awards none, so the Bell can't fire one forward.)
  - ✅ **Sky** — adds `jam-foe` (sabotage-wrench, earned in the Forge) + `toll-strike`, both acting
    on the scrolling banners. New `ScrollingPhrase.strike()` (toll kill, counts as a clear) +
    `freeze()` (jam: halt the drift, keep the word typeable — a sitting duck you mop up). The
    stationary sealed-scroll temple is excluded (a precision puzzle, not an advancing foe) — **#TBD**.
  - ✅ **Wood** — adds `bind-beat` (tether-cord) + `jam-foe` + `toll-strike` (richest satchel — can
    hold all three). New `MovingWordEnemy.freeze(durationMs?)`: jam = permanent single-foe seize,
    bind = a timed room-wide hold that thaws + resumes; both keep the word typeable. toll reuses
    `defeat()`. The boss's every-punctuation capstone is a stationary passage (not in `this.ghosts`),
    so it stays untouchable — **#TBD**.
- ◻ **Companions in-realm** — snow-fox / glass-fish / brass-songbird / lantern-moth / wisp-cat.

---

## Notes

- **Feel-tuning is deferred to one pass near completion** — the tunable constants (wave-director WPM
  thresholds, `SPELL_COST`, difficulty floor) are "tune on live build" defaults. Not gated per-PR.
- **The real-time game can't be automated headlessly** (a backgrounded tab freezes Phaser's rAF loop),
  so PRs are verified via `tsc` + `vite build` + throwaway `npx tsx` logic harnesses against the real code.

_Last updated: 2026-06-22 — All four roadmap tiers + the finale done (Tier 0 + Tier 1 5/5 + Tier 2 #107–#110 + Tier 3 #96–#100 + Tier 4 relics-live #101–#105). **Tier 4 OFFENSIVE one-shots now COMPLETE too** — toll-strike / jam-foe / bind-beat fire by a **Soul-charged, typed invocation word** (no modifier; Alt dead-keys on macOS), settled with the user. Forge slice (#111) → Sky banners (#112) → Wood, the richest satchel (#TBD). Pure logic in `oneShotInvocation.ts` (tested); a realm-agnostic charge widget in `oneShotInvoker.ts`; `MovingWordEnemy.freeze()` + `ScrollingPhrase.strike()/freeze()` are the new enemy capabilities. Remaining tails: companions in-realm; the optional Forge `Ctrl` modifier; the deferred MultiWord fork/passage helpers. **The whole-arc feel-tuning playthrough is now the last thing gating "done."**_
