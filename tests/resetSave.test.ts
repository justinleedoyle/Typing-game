import { resetSave } from "../src/game/resetSave";
import { emptySave, SaveStore, type SaveBackend, type SaveState } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

function completedSave(): SaveState {
  return {
    ...emptySave("Test player"), typewriterAwakened: true, wrenGender: "girl",
    realms: {
      "winter-mountain": { cleared: true, choices: { fork1: "huntress", fork2: "bury" },
        quietLordIntruded: true, quietLordFragmentRevealed: true },
      "great-battle": { cleared: true, choices: {} },
    },
    satchel: ["snow-fox-cub", "hunters-horn"], almanacLore: ["wayshrine-runes"],
    keyStats: { k: { hits: 10, misses: 3 } }, difficulty: "purist", audioLevel: "quiet",
    textScale: "large", reducedMotion: true, reducedFlashes: true,
  };
}

function memoryBackend() {
  let saved: SaveState | null = null;
  let fail = false;
  const backend: SaveBackend = {
    load: async () => saved,
    save: async (state) => {
      if (fail) throw new Error("test storage unavailable");
      saved = structuredClone(state);
    },
  };
  return { backend, saved: () => saved, fail: (value: boolean) => { fail = value; } };
}

await suite("reset save: full reset clears checkpoint, chapter flags, preferences and future state", async () => {
  const memory = memoryBackend();
  const store = new SaveStore(memory.backend, completedSave());
  const previousRunId = store.get().runId;
  store.setCheckpoint({ scene: "WinterMountainScene", step: "boss", data: { wave: 2 } });
  store.update((state) => {
    (state as SaveState & { futureChapter?: string }).futureChapter = "must not survive";
  });
  resetSave(store);
  const { updatedAt: _time, runId: _runId, ...actual } = store.get();
  const { updatedAt: _defaultTime, runId: _defaultRunId, ...expected } = emptySave();
  assertEqual(actual, expected, "every schema field resets to its current default");
  assert(!!store.get().runId && store.get().runId !== previousRunId, "full reset creates a fresh run identity");
  assert(!("futureChapter" in store.get()), "unrecognized transient state is cleared too");
  await store.flush();
  assertEqual(memory.saved()?.checkpoint, null, "fresh start is persisted without old checkpoint");
});

await suite("reset save: Begin Again preserves identity and comfort, never story progress", async () => {
  const memory = memoryBackend();
  const previous = completedSave();
  const store = new SaveStore(memory.backend, previous);
  store.setCheckpoint({ scene: "WinterMountainScene", step: "fork2", data: { fox: true } });
  resetSave(store, true);
  const state = store.get();
  assert(!!state.runId && state.runId !== previous.runId, "Begin Again creates a fresh run identity");
  for (const key of ["profileName", "wrenGender", "keyStats", "difficulty", "audioLevel",
    "textScale", "reducedMotion", "reducedFlashes"] as const) {
    assertEqual(state[key], previous[key], `${key} is preserved for the returning player`);
  }
  assertEqual({ checkpoint: state.checkpoint, realms: state.realms, satchel: state.satchel,
    almanacLore: state.almanacLore, typewriterAwakened: state.typewriterAwakened },
  { checkpoint: null, realms: {}, satchel: [], almanacLore: [], typewriterAwakened: false },
  "new run starts the opening without a former realm marker or rewards");
  await store.flush();
  assertEqual(memory.saved()?.typewriterAwakened, false, "new opening state is durable");
});

await suite("reset save: failed storage preserves the in-session fresh start for explicit retry", async () => {
  const memory = memoryBackend();
  const store = new SaveStore(memory.backend, completedSave());
  memory.fail(true);
  resetSave(store);
  let rejected = false;
  try { await store.flush(); } catch { rejected = true; }
  assert(rejected, "caller is told persistence failed");
  assertEqual(memory.saved(), null, "failure is not mistaken for a durable local reset");
  assertEqual(store.get().checkpoint, null, "in-session reset never resurrects an old checkpoint");
  memory.fail(false);
  await store.flush();
  assertEqual(memory.saved()?.realms, {}, "explicit retry persists the same fresh start");
});
