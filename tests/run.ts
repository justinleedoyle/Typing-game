// Test entry point for `npm test`. Imports each logic harness in sequence;
// each file runs its suites at import time and calls process.exit(1) on the
// first failed assertion (so a failure halts here with a non-zero code). If we
// reach the end, everything passed.
//
// Dependency-free by design — no vitest/jest. This makes the repo's existing
// "throwaway `npx tsx` logic harness" convention (MECHANICS_ROADMAP.md) a
// permanent, runnable suite. Add a new harness by importing it below.

console.log("Running logic test suites…\n");

await import("./runaLines.test.ts");
await import("./sayResolution.test.ts");
await import("./narrationLayout.test.ts");
await import("./pureMath.test.ts");
await import("./relicEffects.test.ts");
await import("./relicCombat.test.ts");
await import("./oneShotInvocation.test.ts");
await import("./devUnlock.test.ts");
await import("./purist.test.ts");
await import("./wordTarget.test.ts");
await import("./movingWordEnemy.test.ts");
await import("./winterWolfStaging.test.ts");
await import("./winterHornHandoff.test.ts");
await import("./winterTraversal.test.ts");
await import("./winterRetry.test.ts");
await import("./wrenReactions.test.ts");
await import("./finaleFacets.test.ts");
await import("./saveState.test.ts");
await import("./saveSync.test.ts");
await import("./typingInput.test.ts");
await import("./sceneLifecycle.test.ts");
await import("./pauseInput.test.ts");
await import("./finaleWords.test.ts");
await import("./finaleCompanionStaging.test.ts");
await import("./chapterFlow.test.ts");
await import("./consoleBand.test.ts");
await import("./guidedPractice.test.ts");
await import("./laterMechanicTeaching.test.ts");
await import("./forgePeacefulGuards.test.ts");
await import("./forgeHammerHandoff.test.ts");
await import("./skyStoryStaging.test.ts");
await import("./skyTraversalPaintings.test.ts");
await import("./skyBookActions.test.ts");
await import("./skyBeaconIntegration.test.ts");
await import("./bellTokenHandoff.test.ts");
await import("./woodStoryStaging.test.ts");
await import("./woodPropActions.test.ts");
await import("./woodCombatPresentation.test.ts");
await import("./bellWardenTiming.test.ts");
await import("./bellRhythmInput.test.ts");
await import("./bellRhythmCue.test.ts");
await import("./bellStoryFlow.test.ts");
await import("./bellLectern.test.ts");
await import("./completionDeadline.test.ts");
await import("./chamberNavigation.test.ts");
await import("./resetSave.test.ts");
await import("./saveChoice.test.ts");
await import("./realmLore.test.ts");
await import("./realmChoices.test.ts");
await import("./revisitStory.test.ts");
await import("./navigationPolicy.test.ts");
await import("./homecoming.test.ts");

console.log("\nAll logic test suites passed.");
// Force a clean exit: saveState.test imports the real supabase client, whose
// token-refresh timer otherwise keeps Node's event loop alive and hangs the
// process after the suites have already passed. (Failures exit(1) earlier.)
process.exit(0);
