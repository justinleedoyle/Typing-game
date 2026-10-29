// Explicit packaged-app QA mode. It is never selected by a game URL and can
// only use a disposable profile and report location inside the OS temp folder.
import type { BrowserWindow, Event, Input } from "electron";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { emptySave, type SaveBackend, type SaveState } from "../src/game/saveState";

export type DesktopSmokePhase = "seed" | "verify" | "crash" | "recover";
export interface DesktopSmokeOptions { phase: DesktopSmokePhase; profile: string; report: string }
const phases: readonly string[] = ["seed", "verify", "crash", "recover"];

function insideTemp(path: string): boolean {
  const root = realpathSync(tmpdir());
  const target = realpathSync(path);
  const child = relative(root, target);
  return child !== "" && child !== ".." && !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(child);
}

export function parseDesktopSmokeArgs(argv: readonly string[]): DesktopSmokeOptions | null {
  const values = (name: string) => argv.filter(value => value.startsWith(`${name}=`)).map(value => value.slice(name.length + 1));
  const phase = values("--desktop-smoke"), profile = values("--desktop-profile"), report = values("--desktop-report");
  if (!phase.length && !profile.length && !report.length) return null;
  if (phase.length !== 1 || profile.length !== 1 || report.length !== 1 || !phases.includes(phase[0])) throw new Error("Invalid desktop smoke arguments");
  if (!isAbsolute(profile[0]) || !isAbsolute(report[0]) || !existsSync(profile[0]) ||
      !lstatSync(profile[0]).isDirectory() || lstatSync(profile[0]).isSymbolicLink() ||
      !basename(profile[0]).startsWith("portalwrights-desktop-smoke-") ||
      !basename(dirname(report[0])).startsWith("portalwrights-desktop-evidence-") ||
      basename(report[0]) !== `${phase[0]}.json` || !insideTemp(profile[0]) || !insideTemp(dirname(report[0])) ||
      (existsSync(report[0]) && lstatSync(report[0]).isSymbolicLink())) throw new Error("Desktop smoke paths must be isolated inside the OS temp folder");
  return { phase: phase[0] as DesktopSmokePhase, profile: resolve(profile[0]), report: resolve(report[0]) };
}

/** The only seeded progress in this pass is an explicitly selected smoke
 * profile. Normal desktop launches use the ordinary real game entry point. */
export async function prepareDesktopSmoke(backend: SaveBackend, phase: DesktopSmokePhase): Promise<void> {
  const existing = await backend.load();
  if (phase === "seed") {
    if (existing !== null) throw new Error("Smoke seed requires an empty isolated profile");
    const state = emptySave("Synthetic Windows review");
    state.wrenGender = "boy";
    state.typewriterAwakened = true;
    state.realms["winter-mountain"] = { cleared: false, choices: { fox: "spared" } };
    state.checkpoint = { scene: "WinterMountainScene", step: "fork1", data: {
      candles: 2, soul: 63, statsHits: "111111111111111100001111", statsSoul: 62.5,
      statsCombo: 8, statsBestCombo: 20, foxDecided: true,
    } };
    state.almanacLore = ["the-wounded-foxs-name"];
    await backend.save(state); await backend.flush?.();
  } else {
    if (!existing || existing.profileName !== "Synthetic Windows review" || existing.checkpoint?.scene !== "WinterMountainScene") throw new Error("Smoke continuation requires its existing synthetic Winter journey");
    if (phase === "crash") {
      existing.realms["winter-mountain"].choices.fork1 = "firefly";
      existing.checkpoint = { scene: "WinterMountainScene", step: "firefly", data: { ...existing.checkpoint.data, index: 0, reading: true } };
      existing.updatedAt = Math.max(Date.now(), existing.updatedAt + 1);
      await backend.save(existing); await backend.flush?.();
    }
  }
}

const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
async function waitForWindow(window: BrowserWindow, predicate: string, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.isDestroyed()) throw new Error(`Window closed before ${label}`);
    if (await window.webContents.executeJavaScript(predicate, false)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function stableProgress(state: SaveState): string {
  const { updatedAt: _time, ...progress } = state;
  return JSON.stringify(progress);
}
function progressWithoutTyping(state: SaveState): string {
  const { updatedAt: _time, keyStats: _keys, ...progress } = state;
  return JSON.stringify(progress);
}
async function settledSave(backend: SaveBackend): Promise<SaveState> {
  // The renderer's actual SaveStore debounces for250ms. Let its checkpoint
  // normalization reach the filesystem, then require600ms of stable content.
  await wait(500);
  const deadline = Date.now() + 5000;
  let state = await backend.load(), fingerprint = state && stableProgress(state), stableSince = Date.now();
  while (Date.now() < deadline) {
    await wait(100);
    const next = await backend.load(), value = next && stableProgress(next);
    if (value !== fingerprint) { fingerprint = value; stableSince = Date.now(); }
    state = next;
    if (state && Date.now() - stableSince >= 600) return state;
  }
  throw new Error("Rendered checkpoint did not reach stable durable storage");
}
async function rendererFrames(window: BrowserWindow): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))", false),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Renderer did not advance between synthetic key events")), 2000); }),
    ]);
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
}

export async function sendDesktopSmokeKey(window: BrowserWindow, value: string, modifiers: Array<"shift" | "alt"> = [], settle: () => Promise<void> = () => rendererFrames(window)): Promise<void> {
  // Electron45 converts keyDown to rawKeyDown only after the converter's text
  // fields have been populated. Use rawKeyDown explicitly for printable input
  // so the event has both its DomKey and its intended character text.
  window.webContents.sendInputEvent({ type: value.length === 1 ? "rawKeyDown" : "keyDown", keyCode: value, modifiers });
  // Phaser's DOM event queue clears at POST_STEP. Separate down/up and the
  // next key across actual renderer frames rather than bursting a whole test
  // into one queue. This changes only QA event delivery, never the game clock.
  await settle();
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: value, modifiers });
  await settle();
}
const key = sendDesktopSmokeKey;

/** Deliberately keep this burst unpaced: it is the regression for the observed
 * Phaser queue replay when multiple native key events arrive before POST_STEP.
 * Ordinary navigation still uses the paced helper above. */
export function sendDesktopSmokePrefixBurst(window: BrowserWindow): void {
  const prefix: Array<[string, Array<"shift" | "alt">]> = [["S", ["shift"]], ["a", []], ["Backspace", []]];
  for (const [value, modifiers] of prefix) {
    window.webContents.sendInputEvent({ type: value.length === 1 ? "rawKeyDown" : "keyDown", keyCode: value, modifiers });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: value, modifiers });
  }
}

export async function runDesktopSmoke(options: DesktopSmokeOptions & {
  window: BrowserWindow;
  backend: SaveBackend;
  unexpectedRequests: readonly string[];
}): Promise<void> {
  const { window, backend, phase, profile, report, unexpectedRequests } = options;
  const screenshot = join(dirname(report), `${phase}.png`);
  let beforeTyping: SaveState | undefined;
  let actualSave: SaveState | undefined;
  const inputEvents: Array<Pick<Input, "type" | "key" | "code" | "shift" | "control" | "alt" | "meta" | "isAutoRepeat">> = [];
  const observeInput = (_event: Event, input: Input) => {
    if (inputEvents.length >= 64) return;
    inputEvents.push({ type: input.type, key: input.key, code: input.code, shift: input.shift,
      control: input.control, alt: input.alt, meta: input.meta, isAutoRepeat: input.isAutoRepeat });
  };
  // Only this explicitly selected synthetic QA profile is observed. These are
  // Electron's public input events; no Phaser state is read or changed.
  window.webContents.on("before-input-event", observeInput);
  try {
    await waitForWindow(window, "Boolean(document.querySelector('[data-desktop-ready=\"true\"]'))", "actual desktop startup");
    await waitForWindow(window, "Boolean(document.querySelector('[data-active-scene=\"TitleScene\"]'))", "actual Title creation");
    await key(window, "Enter");
    await waitForWindow(window, "Boolean(document.querySelector('[data-active-scene=\"WinterMountainScene\"]'))", "saved Winter checkpoint");
    if (phase === "seed") {
      beforeTyping = await settledSave(backend);
      // Claim only a safe prefix of "save the huntress". All three native
      // down/up pairs are intentionally sent together to retain the real
      // same-frame replay regression; exactly one s/a hit must be persisted.
      sendDesktopSmokePrefixBurst(window);
      await rendererFrames(window);
      await key(window, "Escape");
    }
    // This dispatch checks Electron's own keyboard path. It is synthetic input,
    // not evidence about a physical Windows keyboard/layout or human pacing.
    await key(window, "Escape");
    await waitForWindow(window, "Boolean(document.querySelector('[data-active-scene=\"ChapterPauseMenu\"]'))", "ordinary pause menu");
    await wait(220); // Original menu's180ms input guard remains unchanged.
    await key(window, "Escape");
    await waitForWindow(window, "Boolean(document.querySelector('[data-active-scene=\"WinterMountainScene\"]'))", "ordinary pause resume");
    await key(window, "Shift"); await key(window, "Alt");
    const renderer = await window.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('canvas');
      const fonts = Array.from(document.fonts).map(font => ({family:font.family,status:font.status,style:font.style,weight:font.weight}));
      return {canvas:Boolean(canvas && canvas.width > 0 && canvas.height > 0),fontsReady:document.fonts.status==='loaded' && fonts.some(font=>font.status==='loaded'),fonts,activeScene:document.querySelector('[data-active-scene]')?.getAttribute('data-active-scene')};
    })()`, false);
    const save = await settledSave(backend);
    actualSave = save;
    if (beforeTyping) {
      if (save.keyStats.s?.hits !== 1 || save.keyStats.s?.misses !== 0 ||
          save.keyStats.a?.hits !== 1 || save.keyStats.a?.misses !== 0 ||
          Object.keys(save.keyStats).length !== 2 ||
          progressWithoutTyping(save) !== progressWithoutTyping(beforeTyping)) {
        throw new Error("Synthetic uppercase/prefix-release input did not preserve checkpoint resources and story progress");
      }
    }
    await writeFile(screenshot, (await window.webContents.capturePage()).toPNG());
    const result = { version: 1, phase, ok: true, profileIsolated: insideTemp(profile), offline: true,
      unexpectedRequests: [...unexpectedRequests], renderer, keyboard: { source: "Electron synthetic input", pauseAndResume: true, shiftAndAltReleased: true,
        delivery: "Navigation down/up events use separate renderer frames; seed's S+a+Backspace deliberately uses one unpaced native burst.",
        ...(beforeTyping ? { uppercaseAndRelease: true, backspaceDispatched: true, sameFramePrefixBurst: true,
          evidence: "Unpaced uppercase S and plain A each recorded exactly one correct hit; Backspace dispatched in the same burst; paced Escape released the partial claim before ordinary pause. Checkpoint/resources/choices stayed unchanged. Cursor reversal is separately covered by the controller unit test." } : {}),
      },
      durable: true, save, inputEvents };
    const temporary = `${report}.tmp`;
    await writeFile(temporary, JSON.stringify(result, null, 2)); await rename(temporary, report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { if (!window.isDestroyed()) await writeFile(screenshot, (await window.webContents.capturePage()).toPNG()); } catch { /* Keep the first failure. */ }
    await writeFile(report, JSON.stringify({ version: 1, phase, ok: false, error: message, unexpectedRequests: [...unexpectedRequests],
      // These full snapshots are safe synthetic test data, useful to distinguish
      // wrong native characters from a real persistence/checkpoint regression.
      diagnostics: { beforeTyping, save: actualSave, inputEvents },
    }, null, 2));
    throw error;
  } finally {
    if (!window.isDestroyed()) window.webContents.off("before-input-event", observeInput);
  }
}
