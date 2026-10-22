import { assertEqual, suite } from "./_assert";
import { navigationAction, cyclePreference, type NavigationSurface } from "../src/game/ui/navigationPolicy";

await suite("navigation: Esc cancels typing before performing a surface action", () => {
  const surfaces: NavigationSurface[] = ["play", "hub", "hub-zone", "settings", "book"];
  for (const surface of surfaces) {
    assertEqual(navigationAction({ key: "Escape" }, surface, true), "cancel-typing", `${surface}: partial words are preserved until explicitly canceled`);
  }
  assertEqual(navigationAction({ key: "Escape" }, "play", false), "pause", "idle combat pauses instead of restarting");
  assertEqual(navigationAction({ key: "Escape" }, "hub", false), "pause", "idle chamber exposes shared options");
  assertEqual(navigationAction({ key: "Escape" }, "hub-zone", false), "back", "desk/profile/shelf return to chamber");
  assertEqual(navigationAction({ key: "Escape" }, "settings", false), "back", "settings exits only after canceling a partial action");
  assertEqual(navigationAction({ key: "Escape" }, "book", false), "close", "idle book closes");
});

await suite("navigation: holding Esc and browser chords cannot trigger multiple exits", () => {
  for (const surface of ["play", "settings", "book", "hub-zone"] as const) {
    for (const modifiers of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      assertEqual(navigationAction({ key: "Escape", ...modifiers }, surface, false), "ignore", "repeated/modified navigation is inert");
      assertEqual(navigationAction({ key: "Escape", ...modifiers }, surface, true), "ignore", "modifier cannot cancel a story word");
    }
  }
});

await suite("navigation: book shortcuts stay within reading context and preserve typed commands", () => {
  for (const [key, action] of [["ArrowLeft", "previous-page"], ["PageUp", "previous-page"], ["ArrowRight", "next-page"], ["PageDown", "next-page"]]) {
    assertEqual(navigationAction({ key }, "book", false), action, "idle book supports both page-key families");
    assertEqual(navigationAction({ key }, "book", true), "ignore", "page navigation never steals a partial typed command");
    assertEqual(navigationAction({ key, repeat: true }, "book", false), "ignore", "held arrow cannot race past several pages");
    assertEqual(navigationAction({ key }, "play", false), null, "book shortcuts do not create combat actions");
  }
  for (const key of ["n", "b", "r", "Enter", " ", "Backspace"]) {
    assertEqual(navigationAction({ key }, "book", false), null, "ordinary command/correction keys keep their existing meaning");
  }
});

await suite("navigation: difficulty and sound adjust in both directions with wrapping", () => {
  const difficulty = ["forgiving", "standard", "purist"] as const;
  assertEqual(cyclePreference(difficulty, "purist", 1), "forgiving", "right wraps difficulty");
  assertEqual(cyclePreference(difficulty, "forgiving", -1), "purist", "left wraps difficulty");
  assertEqual(cyclePreference(difficulty, "standard", -1), "forgiving", "left selects easier tier");
  assertEqual(cyclePreference(["off", "quiet", "medium", "loud"], "off", -1), "loud", "sound wraps independently");
});
