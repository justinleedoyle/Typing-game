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
| **Tier 2** | Shared enemy behaviors | ◻ Planned |
| **Tier 3** | Strategic capstone (the finale) | ✅ **Complete** (#96–#100) |
| **Tier 4** | Relics live in combat | 🔨 **In progress** — bridge landed; wiring realm by realm |

## The four design dimensions

The audit identified four gap dimensions; the user asked for all four. Rough progress:

| Dimension | Where it's addressed | Progress |
|-----------|----------------------|----------|
| Difficulty / ceiling | Tier 0 (miss-cost floor + speed-axis director) | ~mostly done |
| Per-realm variety / encounters | Tier 1 (signature mechanics) | in progress |
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

## Tier 2 — shared enemy behaviors ◻ PLANNED

Promote `TimedWordTarget` / `MovingWordTarget` / `SplittingWordTarget` / `MultiWordTarget`
into reusable target types shared across realms.

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

## Tier 4 — relics live 🔨 IN PROGRESS

Give fork relics **in-combat effects** so the CYOA layer doubles as a build choice
(today relics only matter in the finale, never inside the five realms). Realms run
in a **fixed order** (Winter → Bell → Forge → Sky → Wood), so a relic earned in
realm *N* arms realms *N+1…5* — collection becomes a forward-looking wager.

**The vocabulary — three effect KINDS, two bounding rules.** Every in-realm effect
is `passive` (always on), `oncePerRealm` (single-use, resets on re-enter), or
`perWaveProc` (≤ once per wave). The finale's lesson — *additive-only is
anticlimactic* — is enforced by two rules that live in **one place** (the resolver):
(1) same-effect passives diminish to a hard cap and a targeted passive *softens* a
realm's signature hazard, never cancels it; (2) defensive one-shots share a per-realm
**grace pool capped at 2**. So a relic-rich run is clearly helped but every realm
still bites.

- ✅ **Bridge** — `combat` block on `RelicEffect` + `resolveCombatLoadout(satchel, realmId)`
  (the bounded aggregator scenes read) + 18 relic effects + a 12-suite guard. Pure module,
  no scene wiring yet. _Mirrors the #96 finale bridge: semantics in one module, behavior at the consumers._
- ◻ **Bell / Forge / Sky / Wood** — each realm consumes the loadout (≈ one PR per realm,
  mirroring Tier 1). Folds in the #99 cleanup (bellows-hammer's inert finale Shift-cooldown
  plumbing → its real in-realm job `soul-thrift`; orphaned `finale_relic_pelt*` lines).
- ◻ **Companions in-realm** — optional later layer (snow-fox / glass-fish / brass-songbird /
  lantern-moth / wisp-cat); relics-only for the core.

---

## Notes

- **Feel-tuning is deferred to one pass near completion** — the tunable constants (wave-director WPM
  thresholds, `SPELL_COST`, difficulty floor) are "tune on live build" defaults. Not gated per-PR.
- **The real-time game can't be automated headlessly** (a backgrounded tab freezes Phaser's rAF loop),
  so PRs are verified via `tsc` + `vite build` + throwaway `npx tsx` logic harnesses against the real code.

_Last updated: 2026-06-22 — Tier 0 + Tier 1 (5/5) + **Tier 3 finale rebuild COMPLETE** (#96–#100). **Tier 4 STARTED** — the relics-live bridge landed (`combat` block + bounded `resolveCombatLoadout`); realms wired next, one PR each. Then the **Tier 2** shared-target refactor. Optional Forge `Ctrl` follow-up still open._
