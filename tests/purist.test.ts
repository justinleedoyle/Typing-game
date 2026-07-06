import type Phaser from "phaser";
import { difficultyLabel, togglePuristMode } from "../src/game/purist";
import type { Difficulty, SaveStore } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

function fakeStore(start: Difficulty): SaveStore {
  const state = { difficulty: start };
  return {
    get: () => state,
    update: (mutator: (s: { difficulty: Difficulty }) => void) => mutator(state),
  } as unknown as SaveStore;
}

await suite("purist: difficulty labels stay user-facing", () => {
  assertEqual(difficultyLabel("forgiving"), "Forgiving", "forgiving label");
  assertEqual(difficultyLabel("standard"), "Standard", "standard label");
  assertEqual(difficultyLabel("purist"), "Purist", "purist label");
});

await suite("togglePuristMode: can cycle silently for local scene feedback", () => {
  const store = fakeStore("standard");
  let noticeShown = false;
  const scene = {
    band: {
      showNotice: () => {
        noticeShown = true;
      },
    },
  } as unknown as Phaser.Scene;

  const next = togglePuristMode(scene, store, { announce: false });

  assertEqual(next, "purist", "returns the selected tier");
  assertEqual(store.get().difficulty, "purist", "updates the save store");
  assert(!noticeShown, "does not fire the generic notice when suppressed");
});

await suite("togglePuristMode: keeps the default console-band notice", () => {
  const store = fakeStore("purist");
  let noticeText = "";
  let noticeLabel = "";
  const scene = {
    band: {
      showNotice: (text: string, opts?: { label?: string }) => {
        noticeText = text;
        noticeLabel = opts?.label ?? "";
      },
    },
  } as unknown as Phaser.Scene;

  const next = togglePuristMode(scene, store);

  assertEqual(next, "forgiving", "cycles from purist back to forgiving");
  assertEqual(noticeText, "Difficulty set to Forgiving.", "shows the difficulty notice");
  assertEqual(noticeLabel, "difficulty", "uses the difficulty notice channel");
});
