import { assert, assertEqual, suite } from "./_assert";
import { homecomingLines } from "../src/game/homecoming";

await suite("Homecoming resolves the sibling promise actually made in the opening", () => {
  const boy = homecomingLines("boy").map(line => line.text).join(" ");
  const girl = homecomingLines("girl").map(line => line.text).join(" ");
  assert(boy.includes("Saga") && boy.includes("drawing"), "boy Wren brings Saga's drawing home");
  assert(!boy.includes("Magnus"), "does not invent a second sibling");
  assert(girl.includes("Magnus") && girl.includes("promised"), "girl Wren returns to Magnus's promise");
  assert(!girl.includes("Saga") && !girl.includes("drawing"), "does not assign Saga's memento to the other opening");
  const legacy = homecomingLines(null).map(line => line.text).join(" ");
  assert(!legacy.includes("Saga") && !legacy.includes("Magnus"), "old saves without identity keep a neutral return");
  for (const gender of ["boy", "girl", null] as const) {
    const lines = homecomingLines(gender);
    assert(lines[0]?.text.includes("Holdfast"), "returns to the established home");
    assertEqual(lines.at(-1)?.speaker, "Runa", "Runa closes the journey");
  }
});
