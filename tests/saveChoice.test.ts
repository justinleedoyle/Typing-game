import { saveChoiceFocus, saveChoicePresentation, saveJourneySummary } from "../src/game/saveChoice";
import { emptySave, type SaveCheckpoint } from "../src/game/saveState";
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

await suite("save choice: two windows are described separately from device versus cloud", () => {
  const local = emptySave(), cloud = emptySave();
  const device = saveChoicePresentation({ kind: "device", local, cloud });
  assert(device.explanation.includes("Another window"), "the cause names this device's other window");
  assert(device.labels.local.includes("window") && device.labels.cloud.includes("Saved on this device"), "the two actual snapshots have truthful labels");
  assert(![device.explanation, ...Object.values(device.labels), ...Object.values(device.actions), device.retry].join(" ").toLowerCase().includes("cloud"), "device-only recovery promises no network or cloud copy");
  assert(device.actions.local.includes("window") && device.actions.cloud.includes("saved journey"), "actions describe the selected branch");
  const remote = saveChoicePresentation({ local, cloud });
  assert(remote.labels.local.includes("This device") && remote.labels.cloud.includes("Cloud"), "legacy cloud conflict keeps its actual origins");
  assert(remote.retry.includes("connected"), "only cloud recovery asks for a connection");
});

await suite("save choice: journey summaries distinguish chapter checkpoints and completion", () => {
  const state = emptySave("Example player");
  assert(saveJourneySummary(state).includes("Opening in progress"), "fresh/unfinished opening is recognizable");
  state.typewriterAwakened = true;
  state.checkpoint = { scene: "WinterMountainScene", step: "heldur-answer", data: { index: 1 } };
  assert(saveJourneySummary(state).includes("Winter Mountain in progress"), "checkpoint has a player-facing location");
  assert(!saveJourneySummary(state).includes("heldur-answer"), "internal checkpoint key is not displayed");
  for (const [scene, label] of [["SunkenBellScene", "Sunken Bell"], ["ClockworkForgeScene", "Clockwork Forge"],
    ["SkyIslandScene", "Sky Island"], ["HauntedWoodScene", "Haunted Wood"]] as const) {
    state.checkpoint = { scene, step: "fork1", data: {} } satisfies SaveCheckpoint;
    const chapter = saveJourneySummary(state);
    assert(chapter.includes(`${label} in progress`) && !chapter.includes("At the Portal Chamber"), "later chapter recovery identifies the real location");
    assert(!chapter.includes("fork1"), "internal stage names remain outside the recovery screen");
  }
  state.checkpoint = null;
  state.realms["winter-mountain"] = { cleared: true, choices: {} };
  state.realms["great-battle"] = { cleared: true, choices: {} };
  const summary = saveJourneySummary(state);
  assert(summary.includes("1 of 5 realms restored"), "finale is not miscounted as a sixth realm");
  assert(summary.includes("Final battle complete"), "completed ending is distinguished");
  assert(summary.includes("Example player"), "profile identity is visible before the decision");
});
