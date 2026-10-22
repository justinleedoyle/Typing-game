/** Navigation keys never count as typing practice or choose a story branch. */
export interface NavigationKey {
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}
export type NavigationSurface = "play" | "hub" | "hub-zone" | "settings" | "book";
export type NavigationAction = "cancel-typing" | "pause" | "back" | "close" | "previous-page" | "next-page" | "ignore";

export function navigationAction(
  event: NavigationKey,
  surface: NavigationSurface,
  typingActive: boolean,
): NavigationAction | null {
  const pageKey = ["ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(event.key);
  if (event.key !== "Escape" && !(surface === "book" && pageKey)) return null;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return "ignore";
  if (event.key === "Escape") {
    if (typingActive) return "cancel-typing";
    if (surface === "book") return "close";
    if (surface === "settings" || surface === "hub-zone") return "back";
    return "pause";
  }
  if (typingActive) return "ignore";
  return event.key === "ArrowLeft" || event.key === "PageUp" ? "previous-page" : "next-page";
}

export function cyclePreference<T>(values: readonly T[], value: T, direction: number): T {
  const index = values.indexOf(value);
  return values[(Math.max(0, index) + (direction < 0 ? -1 : 1) + values.length) % values.length];
}
