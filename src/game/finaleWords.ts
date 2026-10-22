/** Shorten sabotage-wave labels without merging two distinct enemies' words.
 *  Earlier words win a shared shortened label; the other keeps its original.
 *  Reserve original labels too, so a later original can never be stolen. */
export function shortenFinaleWords(words: readonly string[]): string[] {
  const originals = new Set(words.map((word) => word.toLowerCase()));
  const used = new Set<string>();
  return words.map((word) => {
    const shortened = word.length > 2 ? word.slice(0, -1) : word;
    const key = shortened.toLowerCase();
    const canShorten = !used.has(key) &&
      (!originals.has(key) || key === word.toLowerCase());
    const result = canShorten ? shortened : word;
    used.add(result.toLowerCase());
    return result;
  });
}
