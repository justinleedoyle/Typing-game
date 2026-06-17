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
| **Tier 3** | Strategic capstone (the finale) | ◻ Planned |
| **Tier 4** | Relics live in combat | ◻ Planned |

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

## Tier 3 — strategic capstone (the finale) ◻ PLANNED

Turn the Great Battle from an inverted capstone into a real climax:

- A real **fail state** (canon "we begin again") — today candles never decrement.
- Satchel as a **counter-loadout** vs telegraphed Phase-2 facets — today relics are strictly additive (more relics = easier).
- Force-vs-kindness as a real **mechanical fork** — today it's cosmetic flash-vs-shrink; some relics should *raise* intensity so collecting is a wager.

## Tier 4 — relics live ◻ PLANNED

Give fork relics **in-combat effects** so the CYOA layer doubles as a build choice
(today relics only matter in the finale, never inside the five realms).

---

## Notes

- **Feel-tuning is deferred to one pass near completion** — the tunable constants (wave-director WPM
  thresholds, `SPELL_COST`, difficulty floor) are "tune on live build" defaults. Not gated per-PR.
- **The real-time game can't be automated headlessly** (a backgrounded tab freezes Phaser's rAF loop),
  so PRs are verified via `tsc` + `vite build` + throwaway `npx tsx` logic harnesses against the real code.

_Last updated: 2026-06-17 — Tier 0 complete; Tier 1 realms ALL done (5/5: Forge, Wood, Bell, Sky, Winter). Remaining before Tier 2: optional Forge `Ctrl` follow-up. Next major: Tier 2 (shared enemy behaviors)._
