import { TypingInputController, type ClaimMods, type WordTarget } from "../src/game/typingInput";
import type { Difficulty, SaveStore } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

class Target implements WordTarget {
  cursor = 0;
  claims = 0;
  releases = 0;
  completions = 0;
  misses = 0;
  dimmed = false;
  mods: ClaimMods | null = null;
  constructor(readonly word: string, readonly priority = 0, private sensitive = false) {}
  remaining(): string { return this.rawRemaining().toLowerCase(); }
  rawRemaining(): string { return this.word.slice(this.cursor); }
  caseSensitive(): boolean { return this.sensitive; }
  isComplete(): boolean { return this.cursor === this.word.length; }
  advance(): void { this.cursor += 1; }
  reverse(): boolean {
    if (this.cursor === 0) return false;
    this.cursor -= 1;
    return true;
  }
  resetCursor(): void { this.cursor = 0; }
  miss(): void { this.misses += 1; }
  onClaim(mods: ClaimMods): void { this.claims += 1; this.mods = mods; }
  onRelease(): void { this.releases += 1; this.cursor = 0; }
  onComplete(): void { this.completions += 1; }
  setDimmed(dimmed: boolean): void { this.dimmed = dimmed; }
}

function type(input: TypingInputController, text: string): void {
  for (const char of text) assert(input.handleChar(char), `consumes ${char}`);
}

function recordingStore(difficulty: Difficulty = "forgiving") {
  const keys: Array<{ key: string; hit: boolean }> = [];
  const store = {
    get: () => ({ difficulty }),
    recordKeystroke: (key: string, hit: boolean) => keys.push({ key, hit }),
  } as unknown as SaveStore;
  return { keys, store };
}

await suite("typing input: identical labels complete one enemy at a time", () => {
  const input = new TypingInputController();
  const first = new Target("ic");
  const second = new Target("ic");
  input.register(first);
  input.register(second);
  type(input, "i");
  assertEqual(first.claims, 1, "earliest registered target owns the shared label");
  assertEqual(second.claims, 0, "other target remains unclaimed");
  type(input, "c");
  assertEqual([first.completions, second.completions], [1, 0], "only one enemy defeated");
  type(input, "ic");
  assertEqual([first.completions, second.completions], [1, 1], "remaining duplicate stays playable");
});

await suite("typing input: duplicate priority is stable; shared prefixes still disambiguate", () => {
  const input = new TypingInputController();
  const low = new Target("ice");
  const high = new Target("ice", 10);
  const other = new Target("icy");
  input.register(low);
  input.register(high);
  input.register(other);
  type(input, "ic");
  assert(!input.hasClaim(), "ice vs icy waits for a real distinction");
  type(input, "e");
  assertEqual(high.completions, 1, "exact duplicate label resolves by priority");
  type(input, "icyice");
  assertEqual([low.completions, other.completions], [1, 1], "both other actions remain reachable");
});

await suite("typing input: a word that prefixes another remains finishable", () => {
  const input = new TypingInputController();
  const short = new Target("ice");
  const long = new Target("iceberg");
  input.register(short);
  input.register(long);
  type(input, "ice");
  assertEqual(short.completions, 1, "full shorter word completes without impossible extra key");
  assertEqual(long.completions, 0, "longer label stays live");
  type(input, "iceberg");
  assertEqual(long.completions, 1, "longer label can then be completed");
});

await suite("typing input: case-sensitive overlapping labels never swallow the suffix", () => {
  const input = new TypingInputController();
  const ordinary = new Target("ice");
  const command = new Target("ICE", 5, true);
  input.register(ordinary);
  input.register(command);
  type(input, "ICE");
  assertEqual(command.completions, 1, "correct capitals select command by priority at full label");
  type(input, "ice");
  assertEqual(ordinary.completions, 1, "case-insensitive duplicate still completes");
});

await suite("typing input: Backspace reverses and Escape releases for reacquisition", () => {
  const input = new TypingInputController();
  const target = new Target("unMAKE", 0, true);
  input.register(target);
  type(input, "unM");
  assert(input.handleChar("Backspace"), "Backspace consumed");
  assertEqual(target.cursor, 2, "one matched character undone");
  type(input, "M");
  assert(input.handleChar("Escape"), "Escape consumed");
  assert(!input.hasClaim(), "claim released");
  assertEqual(target.releases, 1, "release callback fires once");
  type(input, "unMAKE");
  assertEqual(target.completions, 1, "word remains playable after cancel");
});

await suite("typing input: weak-key misses record expected key and respect difficulty", () => {
  for (const difficulty of ["forgiving", "standard", "purist"] as const) {
    const { store, keys } = recordingStore(difficulty);
    const input = new TypingInputController(store);
    const target = new Target("ak");
    input.register(target);
    type(input, "a");
    assert(input.handleChar("j"), "claimed mismatch consumed");
    assertEqual(keys.at(-1), { key: "k", hit: false }, "practice follows expected k, not pressed j");
    assertEqual(target.cursor, difficulty === "forgiving" ? 1 : 0, "difficulty controls reset");
    assertEqual(input.hasClaim(), difficulty !== "purist", "only Purist releases");
    type(input, difficulty === "forgiving" ? "k" : "ak");
    assertEqual(target.completions, 1, "correction completes in every difficulty");
  }
});

await suite("typing input: same target registration and reset do not create stale matches", () => {
  const input = new TypingInputController();
  const target = new Target("snow");
  input.register(target);
  input.register(target);
  type(input, "s");
  input.reset();
  assert(!input.hasClaim(), "reset clears active claim");
  assertEqual(input.getTypingBuffer(), "", "reset clears pending prefix");
  assert(!input.handleChar("s"), "old target is not registered after reset");
  input.register(target);
  type(input, "snow");
  assertEqual(target.completions, 1, "new run can reuse the target");
});

await suite("typing input: an encounter ending inside miss callbacks leaves no stale claim", () => {
  for (const difficulty of ["forgiving", "standard", "purist"] as const) {
    for (const endFrom of ["target", "hook"] as const) {
      const { store, keys } = recordingStore(difficulty);
      const input = new TypingInputController(store);
      const target = new Target("unMAKE", 0, true);
      input.register(target);
      type(input, "u");
      if (endFrom === "target") target.miss = () => input.unregister(target);
      else input.setKeystrokeHooks({ onMiss: () => input.reset() });
      assert(input.handleChar("x"), `${difficulty}: ending miss is consumed`);
      assert(!input.hasClaim(), `${difficulty}: ended encounter stays unclaimed`);
      assertEqual(target.releases, 1, "ending releases the old target exactly once");
      assertEqual(keys.at(-1), { key: "n", hit: false }, "miss still records the requested key");
    }
  }
});

await suite("typing input: callbacks that acquire a replacement preserve its typed progress", () => {
  for (const difficulty of ["forgiving", "standard", "purist"] as const) {
    for (const replaceFrom of ["target-miss", "miss-hook", "correct-hook"] as const) {
      const { store } = recordingStore(difficulty);
      const input = new TypingInputController(store);
      const old = new Target("ab");
      const replacement = new Target("xy");
      input.register(old);
      type(input, "a");
      const replace = (): void => {
        input.setKeystrokeHooks({});
        input.unregister(old);
        input.register(replacement);
        input.handleChar("x");
      };
      if (replaceFrom === "target-miss") old.miss = replace;
      else if (replaceFrom === "miss-hook") input.setKeystrokeHooks({ onMiss: replace });
      else input.setKeystrokeHooks({ onCorrect: replace });
      assert(input.handleChar(replaceFrom === "correct-hook" ? "b" : "z"), "trigger consumed");
      assert(input.hasClaim(), `${difficulty}: callback's replacement remains claimed`);
      assertEqual(replacement.cursor, 1, "old input does not rewind the replacement");
      assertEqual(old.completions, 0, "invalidated claim has no delayed completion");
      type(input, "y");
      assertEqual(replacement.completions, 1, "replacement completes normally");
    }
  }
});

await suite("typing input: expired shared-prefix targets cannot block the following story choice", () => {
  for (const difficulty of ["forgiving", "standard", "purist"] as const) {
    const { store, keys } = recordingStore(difficulty);
    const input = new TypingInputController(store);
    const first = new Target("the lantern remembers");
    const second = new Target("the beacon waits");
    const unrelated = new Target("toll");
    input.register(first);
    input.register(second);
    input.register(unrelated);
    type(input, "th");
    assert(!input.hasClaim(), "shared scroll prefix is not yet a claim");
    input.unregister(first);
    assertEqual(input.getTypingBuffer(), "th", "remaining matching scroll preserves accepted prefix");
    input.unregister(second);
    assertEqual(input.getTypingBuffer(), "", "last matching expiry clears an orphaned prefix");
    assert(!input.hasPendingInput(), "an unrelated utility target does not keep a vanished scroll prefix alive");
    assert(!unrelated.dimmed, "remaining utility target is no longer dimmed by a vanished prefix");
    assertEqual(keys.length, 2, "expiry does not erase or invent keystroke telemetry");
    const choice = new Target("steal the flame");
    input.register(choice);
    type(input, choice.word);
    assertEqual(choice.completions, 1, `${difficulty}: next choice succeeds on the first full attempt without Escape`);
  }
});

await suite("typing input: partial candidate expiry preserves raw-case matching for the survivor", () => {
  const input = new TypingInputController();
  const expired = new Target("ABORT", 0, true);
  const remaining = new Target("ABOUT", 0, true);
  input.register(expired);
  input.register(remaining);
  type(input, "AB");
  input.unregister(expired);
  assertEqual(input.getTypingBuffer(), "ab", "normalized prefix remains while a matching target survives");
  type(input, "OUT");
  assertEqual(remaining.completions, 1, "raw capitals remain valid when continuing the survivor");
  const nextA = new Target("BEGIN", 0, true);
  const nextB = new Target("BELOW", 0, true);
  input.register(nextA);
  input.register(nextB);
  type(input, "BE");
  input.unregister(nextA);
  input.unregister(nextB);
  const choice = new Target("C", 0, true);
  input.register(choice);
  type(input, "C");
  assertEqual(choice.completions, 1, "last expiry clears both normalized and raw-case prefix buffers");
});
