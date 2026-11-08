import { bellSoundscapeMood } from "../src/audio/bellSoundscape";
import { BELL_STEPS } from "../src/game/bellCheckpoint";
import { assert, assertEqual, suite } from "./_assert";

await suite("Bell soundscape: exploration and both untimed door routes keep the cathedral atmosphere", () => {
  assertEqual(bellSoundscapeMood(), "bell-depths", "fresh entry starts with the underwater story setting");
  for (const step of ["arrival", "descent", "olin", "olin-taught", "practice-done", "chamber", "chamber-read", "fork1", "chant", "force", "force-break", "fork1-reward", "corridor"]) {
    for (const choice of [undefined, "free-aurland", "claim-tongue"]) {
      assertEqual(bellSoundscapeMood(step, choice), "bell-depths", `${step} stays an untimed story phase even when a saved later fate is known`);
    }
  }
  assertEqual(bellSoundscapeMood("future-checkpoint", "claim-tongue"), "bell-depths", "an unsupported checkpoint cannot invent a completed clapper aftermath");
});

await suite("Bell soundscape: safe practice and live fight windows leave the existing beat tones in the foreground", () => {
  for (const step of ["practice", "choir", "choir-cleared", "warden", "warden1-cleared", "warden2", "warden3"]) {
    for (const choice of [undefined, "free-aurland", "claim-tongue", "unknown"]) {
      assertEqual(bellSoundscapeMood(step, choice), "bell-rhythm", `${step} reserves its mix for the original timing clock instead of an independent music pulse`);
    }
  }
  assertEqual([bellSoundscapeMood("practice"), bellSoundscapeMood("practice-done")], ["bell-rhythm", "bell-depths"], "finishing safe practice releases the timing mix without labeling the next reading as combat");
  assertEqual([bellSoundscapeMood("choir-cleared"), bellSoundscapeMood("chamber")], ["bell-rhythm", "bell-depths"], "the active choir bookend retains its original toll space until the clock-free side chamber");
  assertEqual([bellSoundscapeMood("warden3"), bellSoundscapeMood("warden-defeated")], ["bell-rhythm", "bell-rest"], "only actual Warden defeat begins the calmer aftermath");
});

await suite("Bell soundscape: known clapper aftermath stays music-free while free and unrecorded outcomes remain neutral", () => {
  const aftermath = ["warden-defeated", "fork2", "free-aurland", "claim-tongue", "fork2-reward", "fish", "companion-answer", "true-name", "ending"];
  for (const step of aftermath) {
    assertEqual(bellSoundscapeMood(step, "claim-tongue"), "bell-silence", `${step} honors an explicitly known clapper removal without bringing back musical or environmental tolls`);
    for (const choice of [undefined, "free-aurland", "unknown", "claim", "take-tongue"]) {
      assertEqual(bellSoundscapeMood(step, choice), "bell-rest", `${step} does not guess an irreversible clapper outcome from missing or unsupported history`);
    }
  }
  assertEqual(bellSoundscapeMood("claim-tongue"), "bell-rest", "a checkpoint name alone is not a replacement for the saved branch decision");
  assertEqual([bellSoundscapeMood("ending", "free-aurland"), bellSoundscapeMood("ending", "claim-tongue"), bellSoundscapeMood("ending")], ["bell-rest", "bell-silence", "bell-rest"], "completed realm revisits can reflect either canonical outcome without inventing a missing history");
  for (const step of BELL_STEPS) assert(["bell-depths", "bell-rhythm", "bell-rest", "bell-silence"].includes(bellSoundscapeMood(step)), `${step} resolves to one owned Bell mood rather than a different realm's soundtrack`);
});
