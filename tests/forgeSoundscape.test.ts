import { forgeSoundscapeMood } from "../src/audio/forgeSoundscape";
import { FORGE_STEPS } from "../src/game/forgeCheckpoint";
import { assert, assertEqual, suite } from "./_assert";

await suite("Forge soundscape: future branch records cannot change the earlier catwalk, lessons or uncompleted valve", () => {
  assertEqual(forgeSoundscapeMood(), "forge-workshop", "fresh arrival starts with the working foundry atmosphere");
  for (const step of ["arrival", "catwalk", "catwalk-answer", "gregor", "gregor-lesson", "tutorial-move", "tutorial-command", "act2", "fork1", "forn", "cabal"]) {
    for (const first of [undefined, "forn", "cabal", "unknown"]) {
      assertEqual(forgeSoundscapeMood(step, first, "peaceful"), "forge-workshop", `${step} cannot inherit a later valve closure or stand-down from a future saved choice`);
    }
  }
  for (const index of [undefined, null, "1", -1, .5, NaN, Infinity]) {
    assertEqual(forgeSoundscapeMood("cabal", "cabal", "peaceful", { index, reading: true }), "forge-workshop", "missing or unsupported passage evidence cannot claim the valve has closed");
  }
  assertEqual(forgeSoundscapeMood("future-stage", "cabal", "peaceful"), "forge-workshop", "an unknown checkpoint cannot invent either completed action");
});

await suite("Forge soundscape: actual valve completion lowers the foundry and survives its held-response restoration", () => {
  assertEqual(forgeSoundscapeMood("cabal", "cabal", undefined, { index: 0, reading: false }), "forge-workshop", "the displayed first sabotage phrase has not closed the valve");
  assertEqual(forgeSoundscapeMood("cabal", "cabal", undefined, { index: 0, reading: true }), "forge-workshop-slow", "the first completed phrase's held response has closed the valve");
  for (const index of [1, 2, 3, 4]) {
    assertEqual(forgeSoundscapeMood("cabal", "cabal", undefined, { index }), "forge-workshop-slow", "later sabotage phrases retain the physically slower foundry");
  }
  assertEqual(forgeSoundscapeMood("cabal", "forn", undefined, { index: 1 }), "forge-workshop", "a passage-shaped value cannot override the actual canonical choice");
  assertEqual([forgeSoundscapeMood("fork1-reward", "forn"), forgeSoundscapeMood("fork1-reward", "cabal")], ["forge-workshop", "forge-workshop-slow"], "repair and sabotage retain different environmental consequences at the same story boundary");
});

await suite("Forge soundscape: threat and aftermath changes wait for their actual story phase", () => {
  for (const step of ["tutorial-fight", "wave1", "wave2"]) {
    assertEqual(forgeSoundscapeMood(step, "cabal", "peaceful"), "forge-threat", "a pre-choice moving-golem fight lowers the score without importing a future sabotage result");
  }
  for (const step of ["boss-intro", "boss1", "boss2", "boss3", "fight"]) {
    assertEqual([forgeSoundscapeMood(step, "forn", "peaceful"), forgeSoundscapeMood(step, "cabal", "peaceful")], ["forge-threat", "forge-threat-slow"], "later threats retain the valve consequence while reserving space for original fight feedback");
  }
  for (const step of ["boss-defeated", "fork2", "peaceful", "fight-answer"]) {
    assertEqual([forgeSoundscapeMood(step, "forn", "peaceful"), forgeSoundscapeMood(step, "cabal", "peaceful")], ["forge-rest", "forge-rest-slow"], "victory and an unfinished stand-down keep the normal aftermath, not an already obeyed order");
  }
  assertEqual([forgeSoundscapeMood("peaceful", "cabal", "peaceful"), forgeSoundscapeMood("peaceful-answer", "cabal", "peaceful")], ["forge-rest-slow", "forge-still-slow"], "only the completed stand-down response stills machinery");
});

await suite("Forge soundscape: completed endings and revisits honor known stand-down without inventing missing history", () => {
  for (const step of ["peaceful-answer", "fork2-reward", "companion-gate", "companion-answer", "true-name-intro", "true-name", "ending"]) {
    assertEqual([forgeSoundscapeMood(step, "forn", "peaceful"), forgeSoundscapeMood(step, "cabal", "peaceful")], ["forge-still", "forge-still-slow"], "the known obeyed order keeps mechanism sounds absent after either first choice");
    for (const second of [undefined, "fought", "unknown"]) {
      assertEqual([forgeSoundscapeMood(step, "forn", second), forgeSoundscapeMood(step, "cabal", second)], ["forge-rest", "forge-rest-slow"], "unknown and fought outcomes never invent resting guards or a completed peaceful command");
    }
  }
  const moods = ["forge-workshop", "forge-workshop-slow", "forge-threat", "forge-threat-slow", "forge-rest", "forge-rest-slow", "forge-still", "forge-still-slow"];
  for (const step of FORGE_STEPS) assert(moods.includes(forgeSoundscapeMood(step)), `${step} resolves to an owned Forge atmosphere rather than another realm's soundtrack`);
});
