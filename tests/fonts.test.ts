import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GAME_FONT_FACES, GAME_FONT_FAMILY, loadGameFonts, type GameFontEnvironment } from "../src/game/fonts";
import { SERIF } from "../src/game/palette";
import { assert, assertEqual, suite } from "./_assert";

function fixture(baseUrl: string) {
  const calls: Array<{ family: string; url: string; style: string; weight: string }> = [];
  const registered: unknown[] = [], checked: string[] = [], applied: string[] = [];
  const environment: GameFontEnvironment = {
    baseUrl,
    async loadFace(family, url, descriptors) { calls.push({ family, url, ...descriptors }); return { family }; },
    registerFace(face) { registered.push(face); },
    async ready(font) { checked.push(font); return registered.length === 4; },
    applyFamily(family) { applied.push(family); },
  };
  return { environment, calls, registered, checked, applied };
}

await suite("Bundled fonts: all real normal/italic and regular/bold faces load locally before text can be measured", async () => {
  for (const base of ["/Typing-game/", "./", "app://game/"]) {
    const f = fixture(base);
    await loadGameFonts(f.environment);
    assertEqual(f.calls.map(c => [c.family, c.style, c.weight]), GAME_FONT_FACES.map(c => [GAME_FONT_FAMILY, c.style, c.weight]), "all four real faces are loaded rather than platform-synthesized");
    assert(f.calls.every(c => c.url.startsWith(`${base}fonts/source-serif-4/`)), "font URLs remain relative to the current packaged/web origin");
    assertEqual([f.registered.length, f.checked.length, f.applied], [4, 4, [SERIF]], "all faces are registered and checked before family is applied");
  }
  assertEqual(SERIF.split(",")[0], '"Source Serif 4"', "canvas text chooses the bundled face before system fallbacks");
});

await suite("Bundled fonts: missing or unavailable faces refuse fallback startup and a later retry can succeed", async () => {
  const missing = fixture("./");
  missing.environment.loadFace = async () => { throw new Error("missing local font"); };
  let rejected = false;
  try { await loadGameFonts(missing.environment); } catch { rejected = true; }
  assert(rejected, "a missing binary rejects before Phaser startup");
  assertEqual([missing.registered.length, missing.applied.length], [0, 0], "partial faces/fallback are not accepted as a usable loaded set");
  const unavailable = fixture("./"); unavailable.environment.ready = async () => false;
  rejected = false;
  try { await loadGameFonts(unavailable.environment); } catch { rejected = true; }
  assert(rejected, "registration without usable loaded text must still reject startup");
  assertEqual(unavailable.applied.length, 0, "font-face readiness failure cannot apply fallback metrics");
  const retry = fixture("./"); await loadGameFonts(retry.environment);
  assertEqual(retry.applied, [SERIF], "an explicit retry is independent of a previous failure");
});

await suite("Bundled fonts: a stalled face reaches a bounded failure and a late result cannot apply typography", async () => {
  const f = fixture("./"); let finish: (face: { family: string }) => void = () => {};
  const stalled = new Promise<{ family: string }>(resolve => { finish = resolve; });
  f.environment.loadFace = () => stalled;
  let message = "";
  try { await loadGameFonts(f.environment, 1); } catch (error) { message = (error as Error).message; }
  assert(message.includes("too long"), "stalled local transport has a player-readable timeout");
  finish({ family: GAME_FONT_FAMILY }); await Promise.resolve(); await Promise.resolve();
  assertEqual([f.registered.length, f.checked.length, f.applied.length], [0, 0, 0], "a late face cannot revive startup after timeout");
});

await suite("Bundled fonts: shipped WOFF2 bytes and redistribution license match the pinned upstream release", () => {
  const root = new URL("../public/fonts/source-serif-4/", import.meta.url);
  const source = JSON.parse(readFileSync(new URL("SOURCE.json", root), "utf8"));
  assertEqual([source.version, source.modified, source.files.length], ["4.005R", false, 4], "unmodified upstream release is recorded");
  for (const face of GAME_FONT_FACES) {
    const bytes = readFileSync(new URL(face.file, root));
    const recorded = source.files.find((file: { file: string }) => file.file === face.file);
    assertEqual(bytes.subarray(0, 4).toString(), "wOF2", "each shipped face is an actual WOFF2 binary");
    assertEqual(createHash("sha256").update(bytes).digest("hex"), recorded.sha256, "font byte identity is inspectable");
    assert(recorded.url.startsWith("https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/"), "each source points to official pinned upstream");
  }
  const license = readFileSync(new URL("LICENSE.md", root), "utf8");
  assert(license.includes("SIL OPEN FONT LICENSE Version 1.1") && license.includes("Adobe"), "full copyright/OFL redistributable license ships beside fonts");
});
