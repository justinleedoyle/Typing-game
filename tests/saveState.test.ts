// Save migration and validation tests use injected in-memory backends only.
import { assert, assertEqual, suite } from "./_assert";
import {
  SaveStore,
  emptySave,
  type SaveBackend,
  type SaveState,
  type Difficulty,
  CURRENT_SCHEMA_VERSION,
  migrate,
  InvalidSaveError,
  UnsupportedSaveVersionError,
  validateCheckpoint,
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


function rejectsSync(fn: () => unknown, type: new (...args: never[]) => Error): boolean {
  try { fn(); return false; } catch (error) { return error instanceof type; }
}

await suite("saveState.v2: historical saves gain checkpoint and presentation defaults", () => {
  const state = migrate({ ...legacySave(undefined), schemaVersion: 1 });
  assertEqual(state.schemaVersion, CURRENT_SCHEMA_VERSION, "version advances to current");
  assertEqual(state.checkpoint, null, "no invented checkpoint for existing progress");
  assertEqual(state.textScale, "standard", "standard text by default");
  assertEqual(state.reducedMotion, false, "motion default preserved");
  assertEqual(state.reducedFlashes, false, "flash default preserved");
});

await suite("saveState.validation: malformed nested progress is refused instead of erased", () => {
  for (const patch of [
    { satchel: null }, { satchel: [123] }, { realms: null },
    { realms: { winter: { cleared: true, choices: { fork: null } } } },
    { realms: { winter: { cleared: "yes", choices: {} } } },
    { keyStats: { a: { hits: -1, misses: 0 } } },
    { keyStats: { a: { hits: 1, misses: NaN } } },
    { difficulty: "impossible" }, { audioLevel: null }, { updatedAt: Infinity },
    { reducedMotion: "false" }, { textScale: "tiny" }, { schemaVersion: 1.5 },
  ]) {
    assert(rejectsSync(() => migrate({ ...emptySave(), ...patch }), InvalidSaveError), "invalid field refuses load");
  }
  assert(rejectsSync(() => migrate([]), InvalidSaveError), "array is not a save");
  assert(rejectsSync(() => migrate(null), InvalidSaveError), "null is not a save");
  assert(rejectsSync(() => migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }), UnsupportedSaveVersionError), "future progress is protected");
});

await suite("saveState.checkpoint: flat finite data round trips and stale routes clear", () => {
  const checkpoint = { scene: "WinterMountainScene", step: "wave", data: { idx: 2, foxSpared: true, choice: "huntress", last: null } };
  const state = migrate({ ...emptySave(), typewriterAwakened: true, checkpoint, textScale: "large", reducedMotion: true, reducedFlashes: true });
  assertEqual(state.checkpoint, checkpoint, "valid checkpoint preserved");
  assertEqual(state.textScale, "large", "text choice preserved");
  assertEqual(state.reducedMotion, true, "motion choice preserved");
  assertEqual(state.reducedFlashes, true, "flash choice preserved");
  assertEqual(migrate({ ...state, realms: { "winter-mountain": { cleared: true, choices: {} } } }).checkpoint, null, "cleared Winter never resumes stale combat");
  assertEqual(migrate({ ...state, typewriterAwakened: false }).checkpoint, null, "Winter checkpoint requires finished opening");
  assertEqual(migrate({ ...state, checkpoint: { scene: "OpeningScene", step: "name", data: {} } }).checkpoint, null, "finished opening does not reopen");
  for (const bad of [
    { scene: "GreatBattleScene", step: "wave", data: {} },
    { scene: "OpeningScene", step: "", data: {} },
    { scene: "OpeningScene", step: "name", data: { nested: {} } },
    { scene: "OpeningScene", step: "name", data: { idx: NaN } },
  ]) assert(rejectsSync(() => validateCheckpoint(bad), InvalidSaveError), "invalid checkpoint refused");
});
