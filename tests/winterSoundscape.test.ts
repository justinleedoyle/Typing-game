import { WINTER_STEPS } from "../src/game/chapterFlow";
import { winterSoundscapeMood } from "../src/audio/winterSoundscape";
import { assert, assertEqual, suite } from "./_assert";

await suite("Winter soundscape: saved story phases retain their physical setting and emotional aftermath", () => {
  assertEqual(winterSoundscapeMood(), "winter-trail", "fresh entry has stream and pine atmosphere");
  for (const step of ["arrival", "trail", "return-plan", "return-prep"]) {
    assertEqual(winterSoundscapeMood(step), "winter-trail", `${step} stays beside the painted stream`);
  }
  for (const step of ["wave", "boss"]) assertEqual(winterSoundscapeMood(step), "winter-threat", `${step} makes room for danger feedback`);
  for (const step of ["boss-defeated", "fork2", "bury", "pelt", "fox-gate", "companion-answer", "true-name", "ending"]) {
    assertEqual(winterSoundscapeMood(step), "winter-rest", `${step} keeps the warm aftermath motif on either original ending branch`);
  }
  assertEqual(winterSoundscapeMood("return-trail"), "winter-return", "return to the physical stream retains the warmer motif");
  for (const step of WINTER_STEPS.filter(step => !["arrival", "trail", "return-plan", "return-prep", "return-trail"].includes(step))) {
    assert(!["winter-trail", "winter-return"].includes(winterSoundscapeMood(step)), `${step} cannot add running water behind the frozen glade`);
  }
  assertEqual(winterSoundscapeMood("heldur"), "winter-glade", "the frozen waterfall remains wind-only");
});
