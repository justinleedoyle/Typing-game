import { emptySave, type SaveState, type SaveStore } from "./saveState";

/** Use the complete schema so newly added story state cannot survive a reset. */
export function resetSave(store: SaveStore, beginAgain = false): void {
  const previous = store.get();
  const fresh = emptySave();
  if (beginAgain) {
    fresh.profileName = previous.profileName;
    fresh.keyStats = previous.keyStats;
    fresh.wrenGender = previous.wrenGender;
    fresh.audioLevel = previous.audioLevel;
    fresh.difficulty = previous.difficulty;
    fresh.textScale = previous.textScale;
    fresh.reducedMotion = previous.reducedMotion;
    fresh.reducedFlashes = previous.reducedFlashes;
  }
  store.update(state => {
    for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
    Object.assign(state, fresh satisfies SaveState);
  });
}
