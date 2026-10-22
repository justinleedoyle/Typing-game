import { saveChoiceFocus, saveJourneySummary } from "../src/game/saveChoice";
import { emptySave } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

await suite("save choice: choosing focus is explicit and unrelated keys cannot select a save", () => {
  assertEqual(saveChoiceFocus("Enter", null), null, "Enter alone never defaults to overwriting either journey");
  assertEqual(saveChoiceFocus("a", null), null, "start-game keystroke cannot select a copy");
  assertEqual(saveChoiceFocus("l", null), "local", "L selects the device copy");
  assertEqual(saveChoiceFocus("C", null), "cloud", "C selects the cloud copy");
  assertEqual(saveChoiceFocus("ArrowRight", "local"), "cloud", "right arrow selects cloud");
  assertEqual(saveChoiceFocus("ArrowLeft", "cloud"), "local", "left arrow selects local");
  assertEqual(saveChoiceFocus("ArrowDown", "local"), "cloud", "vertical navigation also works");
  assertEqual(saveChoiceFocus("Enter", "cloud"), "cloud", "confirmation preserves the explicit focus");
});

await suite("save choice: journey summaries distinguish chapter checkpoints and completion", () => {
  const state = emptySave("Example player");
  assert(saveJourneySummary(state).includes("Opening in progress"), "fresh/unfinished opening is recognizable");
  state.typewriterAwakened = true;
  state.checkpoint = { scene: "WinterMountainScene", step: "heldur-answer", data: { index: 1 } };
  assert(saveJourneySummary(state).includes("Winter Mountain in progress"), "checkpoint has a player-facing location");
  assert(!saveJourneySummary(state).includes("heldur-answer"), "internal checkpoint key is not displayed");
  state.checkpoint = null;
  state.realms["winter-mountain"] = { cleared: true, choices: {} };
  state.realms["great-battle"] = { cleared: true, choices: {} };
  const summary = saveJourneySummary(state);
  assert(summary.includes("1 of 5 realms restored"), "finale is not miscounted as a sixth realm");
  assert(summary.includes("Final battle complete"), "completed ending is distinguished");
  assert(summary.includes("Example player"), "profile identity is visible before the decision");
});
