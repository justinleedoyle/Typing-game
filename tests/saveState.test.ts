// Logic harness: save migration + merge (src/game/saveState.ts).
//
// The migration we care about is PURE-ish but lives inside SaveStore.load(),
// which awaits a SaveBackend. There is no standalone migrate() to import, so we
// drive the REAL SaveStore.load() through a tiny in-memory backend — that
// exercises the real merge (`{ ...emptySave(name), ...loaded }`) and the real
// legacy `purist: boolean` → difficulty mapping, with zero network/Supabase.
//
// Importing saveState transitively imports supabaseClient, which calls
// createClient() at module-eval — that needs global WebSocket/window/etc. under
// bare tsx. `./_setup` installs inert shims and MUST be the first import so its
// side effects run before the saveState import below is evaluated.
import "./_setup";
import { assert, assertEqual, suite } from "./_assert";
import {
  SaveStore,
  emptySave,
  type SaveBackend,
  type SaveState,
  type Difficulty,
} from "../src/game/saveState";

/** In-memory backend: returns whatever legacy/partial blob we hand it, with no
 *  cloud or window dependency. `save()` captures the last-written state so we
 *  can assert the in-memory shape SaveStore holds is what would persist. */
class FakeBackend implements SaveBackend {
  lastSaved: SaveState | null = null;
  constructor(private readonly stored: SaveState | null) {}
  async load(): Promise<SaveState | null> {
    // Hand back a defensive copy so the store can't mutate our fixture.
    return this.stored ? JSON.parse(JSON.stringify(this.stored)) : null;
  }
  async save(state: SaveState): Promise<void> {
    this.lastSaved = state;
  }
}

/** Build a legacy save blob the way old builds wrote it — note `purist` exists
 *  and the newer fields (satchel, almanacLore, difficulty, audioLevel) are
 *  ABSENT, so the merge has to fill them. Typed loosely on purpose. */
function legacySave(purist: boolean | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = {
    profileName: "Aiden",
    typewriterAwakened: true,
    wrenGender: "boy",
    realms: { "winter-mountain": { cleared: true, choices: {} } },
    keyStats: { a: { hits: 3, misses: 1 } },
    updatedAt: 123,
  };
  if (purist !== undefined) base.purist = purist;
  return base;
}

await suite("saveState.migrate: legacy purist:true → 'purist' tier", async () => {
  const store = await SaveStore.load(
    new FakeBackend(legacySave(true) as unknown as SaveState),
  );
  const s = store.get();
  assertEqual(s.difficulty, "purist" as Difficulty, "purist:true must map to the purist tier");
  // The dead field is dropped after migration.
  assert(!("purist" in (s as object)), "legacy `purist` field must be deleted post-migration");
  // Real player data survives the merge untouched.
  assertEqual(s.profileName, "Aiden", "profileName preserved");
  assertEqual(s.typewriterAwakened, true, "typewriterAwakened preserved");
  assertEqual(s.wrenGender, "boy", "wrenGender preserved");
  assertEqual(s.realms["winter-mountain"]?.cleared, true, "realm progress preserved");
  assertEqual(s.keyStats.a?.hits, 3, "key stats preserved");
});

await suite("saveState.migrate: legacy purist:false → 'standard' tier (raises the floor)", async () => {
  const store = await SaveStore.load(
    new FakeBackend(legacySave(false) as unknown as SaveState),
  );
  const s = store.get();
  // The old kid-friendly default (false) is intentionally remapped UP to
  // standard, not to forgiving.
  assertEqual(s.difficulty, "standard" as Difficulty, "purist:false must map to standard, not forgiving");
  assert(!("purist" in (s as object)), "legacy `purist` field must be deleted");
});

await suite("saveState.merge: missing newer fields get emptySave defaults", async () => {
  // A legacy save with NO purist and NO satchel/almanacLore/difficulty/audioLevel.
  const store = await SaveStore.load(
    new FakeBackend(legacySave(undefined) as unknown as SaveState),
  );
  const s = store.get();
  const defaults = emptySave();
  // Fields absent from the stored blob fall back to emptySave() values.
  assertEqual(s.satchel, defaults.satchel, "missing satchel → empty array default");
  assertEqual(s.almanacLore, defaults.almanacLore, "missing almanacLore → empty array default");
  assertEqual(s.difficulty, defaults.difficulty, "missing difficulty → 'standard' default");
  assertEqual(s.audioLevel, defaults.audioLevel, "missing audioLevel → 'medium' default");
  // ...but values the save DID have win over the defaults (merge order).
  assertEqual(s.profileName, "Aiden", "stored profileName overrides emptySave's 'Wren'");
  assertEqual(s.typewriterAwakened, true, "stored typewriterAwakened overrides default false");
});

await suite("saveState.merge: a brand-new player (no save) gets a clean emptySave", async () => {
  const store = await SaveStore.load(new FakeBackend(null));
  const s = store.get();
  assertEqual(s.profileName, "Wren", "no save → default profile 'Wren'");
  assertEqual(s.difficulty, "standard", "no save → standard difficulty");
  assertEqual(s.audioLevel, "medium", "no save → medium audio");
  assertEqual(s.satchel, [], "no save → empty satchel");
  assert(!("purist" in (s as object)), "fresh save never has a legacy purist field");
});

await suite("saveState.merge: an explicit difficulty already set is preserved", async () => {
  // A save written by a current build (already has `difficulty`, no `purist`).
  const modern: Record<string, unknown> = {
    ...legacySave(undefined),
    difficulty: "forgiving",
    audioLevel: "quiet",
    satchel: ["pelt-of-the-old-one"],
    almanacLore: ["winter-1"],
  };
  const store = await SaveStore.load(new FakeBackend(modern as unknown as SaveState));
  const s = store.get();
  assertEqual(s.difficulty, "forgiving", "explicit difficulty must NOT be overwritten by the merge");
  assertEqual(s.audioLevel, "quiet", "explicit audioLevel preserved");
  assertEqual(s.satchel, ["pelt-of-the-old-one"], "non-empty satchel preserved");
  assertEqual(s.almanacLore, ["winter-1"], "non-empty almanacLore preserved");
});
