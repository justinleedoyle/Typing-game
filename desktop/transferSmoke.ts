// Packaged transfer QA is selected only by the existing validated smoke mode.
// It never reads a normal player profile or opens paths supplied by a renderer.
import type { BrowserWindow } from "electron";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { emptySave, type LocalStorageBackend, type SaveBackend, type SaveRecoverySnapshot, type SaveState } from "../src/game/saveState";
import { decodeJourneyTransfer, encodeJourneyTransfer } from "../src/game/saveTransfer";
import { FileStoragePort } from "./fileStorage";
import { sendDesktopSmokeKey } from "./smoke";

interface TransferExpectation {
  version: 1;
  storageKey: string;
  incoming: SaveState;
  original: SaveState;
  sourceText: string;
  copies: SaveRecoverySnapshot["copies"];
}
function smokeProfile(profile: string): string {
  if (!isAbsolute(profile) || !existsSync(profile) || !lstatSync(profile).isDirectory() ||
      lstatSync(profile).isSymbolicLink() || !basename(profile).startsWith("portalwrights-desktop-smoke-")) {
    throw new Error("Transfer smoke requires an isolated smoke profile");
  }
  const child = relative(realpathSync(tmpdir()), realpathSync(profile));
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Transfer smoke profile must remain inside the OS temp folder");
  }
  return resolve(profile);
}
export function transferSmokePaths(profile: string): { input: string; output: string } {
  const root = smokeProfile(profile);
  return { input: join(root, "transfer-source.json"), output: join(root, "transfer-export.json") };
}
function expectedPath(profile: string): string { return join(smokeProfile(profile), "transfer-expected.json"); }
function copies(profile: string, key: string): SaveRecoverySnapshot["copies"] {
  const disk = new FileStoragePort(join(smokeProfile(profile), "journeys"));
  return { primary: disk.getItem(key), backup: disk.getItem(`${key}.lkg`),
    pendingDeviceChoice: disk.getItem(`${key}.device-conflict.pending`),
    previousDeviceChoice: disk.getItem(`${key}.device-conflict.previous`) };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sameProgress(a: SaveState, b: SaveState): boolean {
  const { updatedAt: _a, ...left } = a, { updatedAt: _b, ...right } = b;
  return stable(left) === stable(right);
}
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

/** Called once for seed, after its existing Winter fixture is durably written,
 * before Title loads. The imported run remains the original smoke run, so the
 * four existing startup/restart/crash phases keep their unchanged contract. */
export async function prepareTransferSmoke(backend: LocalStorageBackend, profile: string): Promise<void> {
  const paths = transferSmokePaths(profile);
  requireValue(backend.userId === null, "Transfer smoke must use its isolated offline guest slot");
  const incoming = await backend.load();
  requireValue(incoming?.profileName === "Synthetic Windows review" && incoming.checkpoint?.scene === "WinterMountainScene" &&
    incoming.checkpoint.step === "fork1", "Transfer smoke requires the existing synthetic Winter seed");
  const sourceText = encodeJourneyTransfer(incoming);
  await writeFile(paths.input, sourceText, { flag: "wx", mode: 0o600 });
  const original = emptySave("Synthetic desktop original");
  original.checkpoint = { scene: "OpeningScene", step: "arrival", data: {} };
  original.updatedAt = Math.max(Date.now(), incoming.updatedAt + 1);
  await backend.save(original);
  const durable = await backend.load();
  requireValue(durable && stable(durable) === stable(original), "Transfer smoke original was not durably written");
  const expectation: TransferExpectation = { version: 1, storageKey: backend.storageKey, incoming, original,
    sourceText, copies: copies(profile, backend.storageKey) };
  await writeFile(expectedPath(profile), JSON.stringify(expectation, null, 2), { flag: "wx", mode: 0o600 });
}

async function expectation(profile: string): Promise<TransferExpectation> {
  const value = JSON.parse(await readFile(expectedPath(profile), "utf8")) as TransferExpectation;
  requireValue(value.version === 1 && value.storageKey === "portalwrights-almanac.save.v1" &&
    value.incoming.profileName === "Synthetic Windows review" && value.original.profileName === "Synthetic desktop original" &&
    value.incoming.runId !== value.original.runId, "Transfer smoke expectations are not its isolated fixture");
  return value;
}

/** Revalidate actual exported/imported files and the immutable on-disk archive.
 * Also exercised by real-filesystem tests; no renderer state participates. */
export async function verifyTransferSmokeFiles(profile: string, current: SaveState) {
  const expected = await expectation(profile), paths = transferSmokePaths(profile);
  const sourceText = await readFile(paths.input, "utf8"), outputText = await readFile(paths.output, "utf8");
  requireValue(sourceText === expected.sourceText, "Transfer smoke changed the source journey file");
  const exported = decodeJourneyTransfer(outputText);
  requireValue(stable(exported) === stable(expected.original), "Transfer smoke did not export the actual original desktop journey");
  requireValue(sameProgress(current, expected.incoming), "Transfer smoke did not import the exact incoming run and checkpoint");
  const active = copies(profile, expected.storageKey);
  requireValue(active.primary !== null && active.backup !== null &&
    stable(JSON.parse(active.primary)) === stable(current) && stable(JSON.parse(active.backup)) === stable(current),
  "Transfer smoke did not acknowledge matching durable primary and backup copies");
  let matchingArchive = false;
  for (const file of await readdir(join(smokeProfile(profile), "journeys"))) {
    if (!/^[a-f0-9]{64}\.save$/.test(file)) continue;
    const archived = JSON.parse(await readFile(join(profile, "journeys", file), "utf8")) as Record<string, unknown>;
    if (archived.kind !== "journey-transfer") continue;
    if (stable(archived.copies) === stable(expected.copies) && archived.incoming &&
        stable(archived.incoming) === stable(current)) matchingArchive = true;
  }
  requireValue(matchingArchive, "Transfer smoke did not keep every original device copy in its immutable archive");
  return { sourceUnchanged: true, exportedOriginal: true, archivePreserved: true, runIdentity: true,
    incomingRunId: current.runId, originalRunId: expected.original.runId,
    sourceSha256: hash(sourceText), exportSha256: hash(outputText), importedStateSha256: hash(stable(current)),
  };
}

const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
async function screen(window: BrowserWindow, title: string, includes?: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  const predicate = `(() => {
    const overlay = Array.from(document.querySelectorAll('[data-recovery-dialog]')).at(-1);
    const dialog = overlay?.querySelector('[role="dialog"]');
    return dialog?.querySelector('h1')?.textContent === ${JSON.stringify(title)} && dialog?.getAttribute('aria-busy') !== 'true' &&
      ${includes ? `dialog?.textContent?.includes(${JSON.stringify(includes)})` : "true"};
  })()`;
  while (Date.now() < deadline) {
    if (window.isDestroyed()) throw new Error("Window closed during transfer smoke");
    if (await window.webContents.executeJavaScript(predicate, false)) return;
    await wait(100);
  }
  throw new Error(`Transfer smoke did not reach: ${title}`);
}

export async function runTransferSmoke(options: { window: BrowserWindow; backend: SaveBackend; profile: string }) {
  const { window, backend, profile } = options;
  const expected = await expectation(profile);
  requireValue(stable(await backend.load()) === stable(expected.original), "Transfer smoke must start on its different original desktop journey");
  await sendDesktopSmokeKey(window, "t");
  await screen(window, "Move a journey");
  const capture = async (name: string) => writeFile(join(smokeProfile(profile), `transfer-${name}.png`), (await window.webContents.capturePage()).toPNG());
  await capture("menu");
  await sendDesktopSmokeKey(window, "e");
  await screen(window, "Move a journey", "The journey file was saved.");
  requireValue(stable(decodeJourneyTransfer(await readFile(transferSmokePaths(profile).output, "utf8"))) === stable(expected.original),
    "Native export did not keep the current original journey");
  await sendDesktopSmokeKey(window, "i");
  await screen(window, "Review the journey before importing", "On this computer");
  await screen(window, "Review the journey before importing", "From the journey file");
  const comparison = await window.webContents.executeJavaScript(`(() => {
    const text = Array.from(document.querySelectorAll('[data-recovery-dialog]')).at(-1)?.textContent ?? '';
    return text.includes('Synthetic desktop original') && text.includes('Synthetic Windows review');
  })()`, false);
  requireValue(comparison, "Transfer review did not display both distinct journey summaries");
  const importControlVisible = await window.webContents.executeJavaScript(`(() => {
    const panel = Array.from(document.querySelectorAll('[data-recovery-dialog]')).at(-1)?.querySelector('[role="dialog"]');
    const button = Array.from(panel?.querySelectorAll('button') ?? []).find(item => item.textContent?.includes('Import this journey'));
    if (!panel || !button) return false;
    const p = panel.getBoundingClientRect(), b = button.getBoundingClientRect();
    return b.top >= p.top && b.bottom <= p.bottom && b.left >= p.left && b.right <= p.right;
  })()`, false);
  requireValue(importControlVisible, "Transfer confirmation needs scrolling in the review window");
  await capture("review");
  requireValue(stable(await backend.load()) === stable(expected.original), "Choosing a file replaced progress before explicit confirmation");
  await sendDesktopSmokeKey(window, "Escape");
  await screen(window, "Move a journey", "The import was cancelled.");
  await capture("cancel");
  requireValue(stable(await backend.load()) === stable(expected.original) &&
    stable(copies(profile, expected.storageKey)) === stable(expected.copies), "Cancelling transfer changed original device data");
  await sendDesktopSmokeKey(window, "i");
  await screen(window, "Review the journey before importing", "From the journey file");
  await sendDesktopSmokeKey(window, "i");
  await screen(window, "The journey is ready on this computer");
  await capture("success");
  const current = await backend.load();
  requireValue(current, "Confirmed transfer left no durable journey");
  const files = await verifyTransferSmokeFiles(profile, current);
  await sendDesktopSmokeKey(window, "Escape");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript("!document.querySelector('[data-recovery-dialog]') && document.querySelector('[data-active-scene]')?.getAttribute('data-active-scene') === 'TitleScene'", false)) {
      return { syntheticPicker: true, explicitReview: true, importControlVisible: true, cancelPreserved: true, ...files };
    }
    await wait(100);
  }
  throw new Error("Transfer smoke did not return to the actual Title");
}
