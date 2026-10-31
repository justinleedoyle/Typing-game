import { SERIF } from "./palette";

export const GAME_FONT_FAMILY = "Source Serif 4";
export const FONT_LOAD_TIMEOUT_MS = 30_000;
export const GAME_FONT_FACES = [
  { file: "SourceSerif4-Regular.otf.woff2", style: "normal", weight: "400" },
  { file: "SourceSerif4-It.otf.woff2", style: "italic", weight: "400" },
  { file: "SourceSerif4-Bold.otf.woff2", style: "normal", weight: "700" },
  { file: "SourceSerif4-BoldIt.otf.woff2", style: "italic", weight: "700" },
] as const;
const FONT_SAMPLE = "Wren · Winter Mountain — ‘Again.’ 0123456789";

interface LoadedFace { readonly family?: string }
export interface GameFontEnvironment {
  baseUrl: string;
  loadFace(family: string, url: string, descriptors: { style: string; weight: string }): Promise<LoadedFace>;
  registerFace(face: LoadedFace): void;
  ready(font: string, sample: string): Promise<boolean>;
  applyFamily(family: string): void;
}

/** Register every used face before Phaser measures narration and target labels.
 * A missing font is a load failure, not permission to freeze fallback metrics
 * into canvas text and silently differ between Windows and macOS. */
export async function loadGameFonts(environment: GameFontEnvironment, timeoutMs = FONT_LOAD_TIMEOUT_MS): Promise<void> {
  const base = environment.baseUrl.endsWith("/") ? environment.baseUrl : `${environment.baseUrl}/`;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The game's lettering took too long to open. Try again.")), timeoutMs);
  });
  try {
    const loaded = await Promise.race([Promise.all(GAME_FONT_FACES.map(face => environment.loadFace(
      GAME_FONT_FAMILY, `${base}fonts/source-serif-4/${face.file}`, { style: face.style, weight: face.weight },
    ))), deadline]);
    loaded.forEach(face => environment.registerFace(face));
    for (const face of GAME_FONT_FACES) {
      if (!await Promise.race([environment.ready(`${face.style} ${face.weight} 24px "${GAME_FONT_FAMILY}"`, FONT_SAMPLE), deadline])) {
        throw new Error("The game's lettering could not load. Try opening the game again.");
      }
    }
    environment.applyFamily(SERIF);
  } finally {
    clearTimeout(timer!);
  }
}

let pending: Promise<void> | undefined;
/** Only a complete successful load is cached. An explicit boot retry can load
 * repaired local files instead of keeping a rejected promise forever. */
export function ensureGameFonts(): Promise<void> {
  if (pending) return pending;
  pending = loadGameFonts({
    baseUrl: import.meta.env.BASE_URL,
    loadFace: (family, url, descriptors) => new FontFace(family, `url("${url}") format("woff2")`, descriptors).load(),
    registerFace: face => { document.fonts.add(face as FontFace); },
    ready: async (font, sample) => (await document.fonts.load(font, sample)).length > 0,
    applyFamily: family => { document.body.style.fontFamily = family; },
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
