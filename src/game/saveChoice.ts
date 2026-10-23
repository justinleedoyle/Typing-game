import type { SaveSource, SaveState } from "./saveState";

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
  const stage = state.realms["great-battle"]?.cleared ? "Final battle complete" :
    state.checkpoint?.scene === "WinterMountainScene" ? "Winter Mountain in progress" :
    !state.typewriterAwakened ? "Opening in progress" : "At the Portal Chamber";
  const name = state.profileName.length > 36 ? `${state.profileName.slice(0, 35)}…` : state.profileName;
  return `${name}\n${cleared} of 5 realms restored\n${stage}`;
}
