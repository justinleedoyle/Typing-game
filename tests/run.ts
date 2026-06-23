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
await import("./pureMath.test.ts");
await import("./relicEffects.test.ts");
await import("./relicCombat.test.ts");
await import("./oneShotInvocation.test.ts");
await import("./wordTarget.test.ts");
await import("./movingWordEnemy.test.ts");
await import("./finaleFacets.test.ts");
await import("./saveState.test.ts");

console.log("\nAll logic test suites passed.");
// Force a clean exit: saveState.test imports the real supabase client, whose
// token-refresh timer otherwise keeps Node's event loop alive and hangs the
// process after the suites have already passed. (Failures exit(1) earlier.)
process.exit(0);
