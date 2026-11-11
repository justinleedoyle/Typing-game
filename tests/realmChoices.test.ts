import { assert, assertEqual, suite } from "./_assert";
import { emptySave } from "../src/game/saveState";
import {
  rememberRealmFork, resolveRealmFork, rememberCompanionDecision, resolveCompanionDecision,
  type LaterRealm, type RealmFork,
} from "../src/game/realmChoices";

// Explicit design cases: selecting a branch and restarting must never award its
// opposite. The simulated reward below occurs only after the saved decision.
const cases: Array<{ realm: LaterRealm; fork: RealmFork; options: readonly [readonly [string, string], readonly [string, string]] }> = [
  { realm: "sunken-bell", fork: "fork1", options: [["chant", "quiet-chant"], ["force", "lock-bar"]] },
  { realm: "sunken-bell", fork: "fork2", options: [["free-aurland", "trident-token"], ["claim-tongue", "bells-tongue"]] },
  { realm: "clockwork-forge", fork: "fork1", options: [["forn", "bellows-hammer"], ["cabal", "sabotage-wrench"]] },
  { realm: "clockwork-forge", fork: "fork2", options: [["peaceful", "master-key"], ["fought", "golem-heart"]] },
  { realm: "sky-island", fork: "fork1", options: [["help-etta", "ettas-ledger"], ["steal-flame", "beacon-spark"]] },
  { realm: "sky-island", fork: "fork2", options: [["answer-kindly", "wind-phrase"], ["cut-tether", "tether-cord"]] },
  { realm: "haunted-wood", fork: "fork1", options: [["offering", "shrine-token"], ["bone-flute", "bone-flute"]] },
  { realm: "haunted-wood", fork: "fork2", options: [["bargain", "ghost-kings-promise"], ["force", "ash-vial"]] },
];

await suite("Realm forks: choice is durable before rewards and cannot reverse on restart", () => {
  for (const { realm, fork, options } of cases) for (const [selected, reward] of options) {
    const state = emptySave();
    state.realms[realm] = { cleared: false, choices: { unrelated: "keep" }, quietLordIntruded: true, quietLordFragmentRevealed: true };
    assertEqual(rememberRealmFork(state, realm, fork, selected), selected, "first selection commits immediately");
    assertEqual(state.satchel, [], "committing does not grant a reward before its passage finishes");
    assertEqual(resolveRealmFork(realm, fork, state.realms[realm], []), selected, "restart restores a committed but unfinished passage");
    state.satchel.push(reward);
    const opposite = options.find(([value]) => value !== selected)!;
    const replay = rememberRealmFork(state, realm, fork, opposite[0]);
    assertEqual(replay, selected, "even a stale opposite button must route to the committed branch");
    const replayReward = options.find(([value]) => value === replay)![1];
    if (!state.satchel.includes(replayReward)) state.satchel.push(replayReward);
    assertEqual(state.satchel, [reward], "replaying grants neither duplicate nor opposite reward");
    assertEqual(state.realms[realm]!.choices.unrelated, "keep", "other story decisions retained");
    assert(state.realms[realm]!.quietLordIntruded && state.realms[realm]!.quietLordFragmentRevealed, "mystery flags retained");
    assert(!state.realms[realm]!.cleared, "fork completion does not clear the realm");
  }
});

await suite("Realm forks: unique legacy rewards recover choices without guessing ambiguous history", () => {
  for (const { realm, fork, options } of cases) {
    for (const [selected, reward] of options) {
      const inventory = [reward, "unrelated-keepsake"];
      const before = JSON.stringify(inventory);
      assertEqual(resolveRealmFork(realm, fork, undefined, inventory), selected, "one side's old reward is bounded evidence of a branch");
      assertEqual(JSON.stringify(inventory), before, "recovery never edits old inventory");
    }
    assertEqual(resolveRealmFork(realm, fork, undefined, []), null, "empty inventory cannot invent a choice");
    assertEqual(resolveRealmFork(realm, fork, undefined, options.map(([, item]) => item)), null, "both legacy rewards leave the choice ambiguous");
    const state = emptySave();
    state.satchel = options.map(([, item]) => item);
    const original = [...state.satchel];
    assertEqual(rememberRealmFork(state, realm, fork, options[1][0]), options[1][0], "ambiguous legacy history is settled only by an explicit new selection");
    assertEqual(state.satchel, original, "grandfathered conflicting inventory is preserved rather than deleted");
    assertEqual(rememberRealmFork(state, realm, fork, options[0][0]), options[1][0], "the new explicit choice is now locked");
  }
  assertEqual(resolveRealmFork("sunken-bell", "fork2", undefined, ["king-aurland", "trident-token"]), "free-aurland", "two items from the same branch are not ambiguous");
  assertEqual(resolveRealmFork("sky-island", "fork2", undefined, ["untethered-wind"]), "cut-tether", "legacy ally token can recover its unique branch");
});

await suite("Realm forks: explicit choices and legacy encodings beat contradictory relics", () => {
  const state = emptySave();
  state.realms["clockwork-forge"] = { cleared: false, choices: { ending: "cabal-fought" } };
  assertEqual(resolveRealmFork("clockwork-forge", "fork1", state.realms["clockwork-forge"], ["bellows-hammer"]), "cabal", "combined historical ending outranks an opposite stale reward");
  assertEqual(resolveRealmFork("clockwork-forge", "fork2", state.realms["clockwork-forge"], []), "fought", "combined ending recovers both forks");
  rememberRealmFork(state, "clockwork-forge", "fork1", "forn");
  assertEqual(state.realms["clockwork-forge"]!.choices.fork1, "cabal", "recovered old ending is committed into the explicit fork");
  const aliases: Array<[LaterRealm, RealmFork, string, string]> = [
    ["sunken-bell", "fork2", "free-king", "free-aurland"],
    ["sky-island", "fork1", "beacon", "steal-flame"],
    ["haunted-wood", "fork2", "light-grove", "force"],
  ];
  for (const [realm, fork, alias, current] of aliases) {
    state.realms[realm] = { cleared: false, choices: { [fork]: alias } };
    assertEqual(rememberRealmFork(state, realm, fork, current), current, "known alias resolves to the current route");
    assertEqual(state.realms[realm]!.choices[fork], alias, "existing cloud choice spelling is preserved");
  }
});

await suite("Companion answers: restarting cannot reverse acceptance or refusal", () => {
  const companions: Array<[LaterRealm, string]> = [["sunken-bell", "glass-fish"], ["clockwork-forge", "brass-songbird"], ["sky-island", "lantern-moth"], ["haunted-wood", "wisp-cat"]];
  for (const [realm, item] of companions) {
    const state = emptySave();
    assertEqual(resolveCompanionDecision(realm, undefined, []), null, "no evidence leaves the offer undecided");
    assertEqual(rememberCompanionDecision(state, realm, "declined"), "declined", "refusal saved before leaving the gate");
    state.satchel.push(item);
    assertEqual(resolveCompanionDecision(realm, state.realms[realm], state.satchel), "declined", "explicit refusal outranks a stale inventory item");
    assertEqual(rememberCompanionDecision(state, realm, "accepted"), "declined", "a restarted offer cannot reverse refusal");
    const accepted = emptySave();
    accepted.satchel.push(item);
    assertEqual(rememberCompanionDecision(accepted, realm, "declined"), "accepted", "legacy carried creature is not silently abandoned");
    assertEqual(accepted.satchel, [item], "recovering a creature preserves inventory");
    assertEqual(accepted.realms[realm]!.choices.companion, "accepted", "legacy acceptance becomes durable");
    assertEqual(rememberCompanionDecision(accepted, realm, "declined"), "accepted", "acceptance cannot reverse on replay");
  }
  for (const alias of ["take", "call", "songbird", "let-go", "leave", "none"]) {
    const state = emptySave();
    state.realms["sky-island"] = { cleared: false, choices: { companion: alias } };
    rememberCompanionDecision(state, "sky-island", "accepted");
    assertEqual(state.realms["sky-island"]!.choices.companion, alias, "historical companion spelling is kept for sync compatibility");
  }
});
