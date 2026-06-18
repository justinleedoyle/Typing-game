// Minimal assertion helpers for the `npx tsx` logic harnesses.
//
// Deliberately dependency-free — no vitest/jest. The repo verifies PRs with
// "throwaway `npx tsx` logic harnesses against the real code"
// (MECHANICS_ROADMAP.md); these files make that pattern permanent. Each test
// file imports the REAL modules, asserts with these helpers, and the process
// exits non-zero on the first failure so `npm test` fails loudly in CI/locally.

let checks = 0;

/** Assert a condition; throw (and let the runner exit 1) with `msg` on failure. */
export function assert(cond: unknown, msg: string): void {
  checks += 1;
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/** Deep-ish structural equality for the small plain values these tests compare
 *  (primitives, arrays, flat/nested plain objects). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

/** Assert strict-ish equality, printing both sides on failure. */
export function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  checks += 1;
  if (!deepEqual(actual, expected)) {
    throw new Error(
      `Assertion failed: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

/** Assert two numbers are within `eps` (for sine/float math). */
export function assertClose(
  actual: number,
  expected: number,
  eps: number,
  msg: string,
): void {
  checks += 1;
  if (!(Math.abs(actual - expected) <= eps)) {
    throw new Error(
      `Assertion failed: ${msg}\n  expected ~${expected} (±${eps}), got ${actual}`,
    );
  }
}

/** Run a named suite; on throw (sync OR async rejection), print and exit(1). On
 *  success, log a pass line. Always `await` the call so async bodies settle
 *  before the next suite runs and before the process exits. */
export async function suite(
  name: string,
  body: () => void | Promise<void>,
): Promise<void> {
  const before = checks;
  try {
    await body();
  } catch (err) {
    console.error(`\n✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`✓ ${name} (${checks - before} checks)`);
}
