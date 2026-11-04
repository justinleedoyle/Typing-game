import type { SaveConflict, SaveSource, SaveState } from "./saveState";

/** A second window and another device need different, truthful recovery copy. */
export function saveChoicePresentation(conflict: SaveConflict) {
  const device = conflict.kind === "device";
  return {
    explanation: device
      ? "Another window changed this device's save. Both journeys are kept."
      : "This device and the cloud have different progress. Both versions will be kept.",
    labels: {
      local: device ? "This window's journey  ·  L" : "This device  ·  L",
      cloud: device ? "Saved on this device  ·  C" : "Cloud save  ·  C",
    },
    actions: {
      local: device ? "Continue this window's journey" : "Use this device's save",
      cloud: device ? "Continue the saved journey" : "Use the cloud save",
    },
    retry: device
      ? "The saved journey changed again, or saving could not finish. Review these versions and choose again."
      : "The choice could not finish saving. Review these versions, then choose again when connected.",
  };
}

/** Keyboard focus never commits a save choice; Enter is a separate action. */
export function saveChoiceFocus(key: string, current: SaveSource | null): SaveSource | null {
  if (key === "ArrowLeft" || key.toLowerCase() === "l") return "local";
  if (key === "ArrowRight" || key.toLowerCase() === "c") return "cloud";
  if (key === "ArrowUp" || key === "ArrowDown") return current === "local" ? "cloud" : "local";
  return current;
}

/** Describe the journey without exposing internal checkpoint identifiers. */
export function saveJourneySummary(state: Readonly<SaveState>): string {
  const realms = ["winter-mountain", "sunken-bell", "clockwork-forge", "sky-island", "haunted-wood"];
  const cleared = realms.filter((id) => state.realms[id]?.cleared).length;
  const chapterNames: Record<string, string> = {
    OpeningScene: "Opening", WinterMountainScene: "Winter Mountain", SunkenBellScene: "Sunken Bell",
    ClockworkForgeScene: "Clockwork Forge", SkyIslandScene: "Sky Island", HauntedWoodScene: "Haunted Wood",
  };
  const chapter = state.checkpoint && chapterNames[state.checkpoint.scene];
  const stage = state.realms["great-battle"]?.cleared ? "Final battle complete" :
    chapter ? `${chapter} in progress` :
    !state.typewriterAwakened ? "Opening in progress" : "At the Portal Chamber";
  const name = state.profileName.length > 36 ? `${state.profileName.slice(0, 35)}…` : state.profileName;
  return `${name}\n${cleared} of 5 realms restored\n${stage}`;
}
