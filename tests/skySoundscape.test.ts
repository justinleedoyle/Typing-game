import { skySoundscapeMood } from "../src/audio/skySoundscape";
import { SKY_STEPS } from "../src/game/skyCheckpoint";
import { assert, assertEqual, suite } from "./_assert";

await suite("Sky soundscape: future saved choices cannot alter an earlier path or claim an unfinished action", () => {
  assertEqual(skySoundscapeMood(), "sky-terrace", "fresh arrival owns the open-air terrace");
  for (const step of ["arrival", "path"]) {
    for (const first of [undefined, "help-etta", "steal-flame", "unknown"]) {
      assertEqual(skySoundscapeMood(step, first, "answer-kindly"), "sky-terrace", "a future branch is not evidence of light already changed");
    }
  }
  assertEqual(skySoundscapeMood("future-stage", "steal-flame", "cut-tether"), "sky-terrace", "unknown history cannot invent a completed theft or freed wind");
  for (const index of [undefined, null, "2", -1, .5, NaN, Infinity]) {
    assertEqual(skySoundscapeMood("steal-flame", "steal-flame", undefined, { index, reading: true }), "sky-library", "unsupported passage data cannot dim a beacon");
  }
  assertEqual(skySoundscapeMood("steal-flame", "steal-flame", undefined, { index: 1, reading: false }), "sky-library", "the currently displayed dimming phrase has not finished");
  assertEqual(skySoundscapeMood("answer-kindly", "help-etta", "answer-kindly", { reading: false }), "sky-rest", "choosing kindness alone cannot brighten every lantern");
  assertEqual(skySoundscapeMood("cut-tether", "help-etta", "cut-tether", { index: 1, reading: false }), "sky-rest", "the currently displayed tether-falls phrase has not freed the wind");
});

await suite("Sky soundscape: temple threats leave space for timed typing while the sealed scroll stays untimed", () => {
  assertEqual([skySoundscapeMood("first-spirits"), skySoundscapeMood("first-spirits", null, null, { reading: true })], ["sky-threat", "sky-library"], "live spirits and their held cleared response have distinct sound needs");
  for (const index of [0, 1, 3, 4]) assertEqual(skySoundscapeMood("temple", null, null, { index }), "sky-threat", "scrolling temple play uses the reserved threat mix");
  assertEqual([skySoundscapeMood("temple", null, null, { index: 2 }), skySoundscapeMood("temple", null, null, { index: 2, reading: true })], ["sky-library", "sky-library"], "the untimed precision scroll and held answer do not gain a musical timer");
  for (const step of ["lighter", "temple-intro", "temple-cleared", "etta", "etta-book", "fork1"]) assertEqual(skySoundscapeMood(step, "steal-flame", "answer-kindly"), "sky-library", "a quiet earlier scene does not borrow a future theft or summit result");
  for (const step of ["boss-intro", "boss"]) assertEqual(skySoundscapeMood(step, "steal-flame", "answer-kindly"), "sky-threat", "boss phases reserve room for their existing feedback");
});

await suite("Sky soundscape: branch changes require the actual beacon phrase and restore their completed response", () => {
  for (const helpedBefore of [false, true]) {
    const last = helpedBefore ? 1 : 3;
    assertEqual(skySoundscapeMood("help-etta", "help-etta", null, { index: last, reading: false, helpedBefore }), "sky-library", "the final displayed help phrase has not brightened the beacon");
    assertEqual(skySoundscapeMood("help-etta", "help-etta", null, { index: last, reading: true, helpedBefore }), "sky-rest", "only the completed last phrase receives its warmer beacon response");
    for (let index = 0; index < last; index++) assertEqual(skySoundscapeMood("help-etta", "help-etta", null, { index, reading: true, helpedBefore }), "sky-library", "carrying, shelving and gratitude cannot prematurely claim beacon brightness");
  }
  assertEqual(skySoundscapeMood("steal-flame", "steal-flame", null, { index: 0, reading: true }), "sky-library", "reaching toward the flame does not dim it yet");
  assertEqual(skySoundscapeMood("steal-flame", "steal-flame", null, { index: 1, reading: true }), "sky-dim", "the completed dimming response removes lantern atmosphere");
  for (const index of [2, 3]) assertEqual(skySoundscapeMood("steal-flame", "steal-flame", null, { index }), "sky-dim", "later spark phrases retain the dimmed environmental consequence");
  assertEqual(skySoundscapeMood("steal-flame", "help-etta", null, { index: 2, reading: true }), "sky-library", "passage data cannot override the actual canonical first choice");
});

await suite("Sky soundscape: summit answers and cleared memories retain only known completed outcomes", () => {
  for (const step of ["boss-defeated", "fork2", "answer-kindly", "cut-tether"]) assertEqual(skySoundscapeMood(step, "steal-flame", null), "sky-rest-dim", "post-boss rest retains a known completed theft without inventing either final answer");
  assertEqual(skySoundscapeMood("answer-kindly", "steal-flame", "answer-kindly", { reading: true }), "sky-kind", "the native kind answer brightens the summit independently of earlier theft");
  assertEqual(skySoundscapeMood("cut-tether", "steal-flame", "cut-tether", { index: 0, reading: true }), "sky-rest-dim", "pulling the thread alone has not released it");
  assertEqual(skySoundscapeMood("cut-tether", "steal-flame", "cut-tether", { index: 1, reading: true }), "sky-freed-dim", "the held completed tether result releases wind while keeping the stolen beacon dark");
  for (const step of ["moth", "moth-answer", "true-name", "ending"]) {
    assertEqual([skySoundscapeMood(step, "help-etta", "answer-kindly"), skySoundscapeMood(step, "steal-flame", "answer-kindly")], ["sky-kind", "sky-kind"], "known completed kindness receives the same bright summit after either first choice");
    assertEqual([skySoundscapeMood(step, "help-etta", "cut-tether"), skySoundscapeMood(step, "steal-flame", "cut-tether")], ["sky-freed", "sky-freed-dim"], "freed wind preserves the independent earlier beacon consequence");
    for (const second of [undefined, "unknown"]) assertEqual(skySoundscapeMood(step, undefined, second), "sky-rest", "missing history cannot fabricate kindness or tether cutting");
  }
  const moods = ["sky-terrace", "sky-library", "sky-dim", "sky-threat", "sky-rest", "sky-rest-dim", "sky-kind", "sky-freed", "sky-freed-dim"];
  for (const step of SKY_STEPS) assert(moods.includes(skySoundscapeMood(step)), "every declared Sky checkpoint stays in its owned soundscape family");
});
