import * as fs from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { SaveState } from "../src/game/saveState";
import { InvalidSaveError, UnsupportedSaveVersionError } from "../src/game/saveState";
import {
  MAX_JOURNEY_TRANSFER_BYTES, decodeJourneyTransfer, encodeJourneyTransfer, journeyTransferFilename,
} from "../src/game/saveTransfer";

/** A main-process-only fault injection boundary; paths never come from IPC. */
export type JourneyFileIO = Pick<typeof fs, "lstat" | "open" | "realpath" | "rename" | "unlink">;

interface FileStamp {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}
function stamp(stat: Stats): FileStamp {
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}
function sameFile(a: FileStamp | null, b: FileStamp | null): boolean {
  return a === null || b === null ? a === b :
    a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function missing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
function selectedPath(path: string): string {
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("Invalid file selection");
  return resolve(path);
}
async function regularFile(io: JourneyFileIO, path: string): Promise<Stats | null> {
  let stat: Stats;
  try { stat = await io.lstat(path); }
  catch (error) { if (missing(error)) return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("The selection is not a regular file");
  return stat;
}
function readFailure(): Error {
  return new Error("The journey file could not be opened. Choose a local journey file and check its storage access. Your current journey has not changed.");
}

/** Native dialogs supply the only file paths this adapter can read or write.
 * The renderer receives canonical progress or cancellation, never a path,
 * descriptor, filesystem API or the raw details of an operating-system error.
 */
export function createJourneyFileActions(options: {
  chooseOpen: () => Promise<string | null>;
  chooseSave: (suggestedName: string) => Promise<string | null>;
  io?: JourneyFileIO;
}): {
  chooseImport(): Promise<SaveState | null>;
  exportJourney(state: SaveState): Promise<boolean>;
} {
  const io = options.io ?? fs;
  return {
    async chooseImport() {
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
      try {
        const selection = await options.chooseOpen();
        if (selection === null) return null;
        const path = selectedPath(selection);
        const initial = await regularFile(io, path);
        if (!initial) throw new Error("The selected file disappeared");
        if (initial.size > MAX_JOURNEY_TRANSFER_BYTES) {
          throw new InvalidSaveError("This journey file is too large. Export a new copy from the game. Your current journey has not changed.");
        }
        // O_NOFOLLOW is unavailable on some platforms; lstat/fstat checks still
        // reject a replaced file rather than reading through a selected link.
        handle = await io.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened = await handle.stat();
        if (!opened.isFile() || !sameFile(stamp(initial), stamp(opened))) throw new Error("The selected file changed");
        if (opened.size > MAX_JOURNEY_TRANSFER_BYTES) throw new Error("The selected file grew");
        const chunks: Buffer[] = [];
        let total = 0;
        while (true) {
          // One extra byte detects growth without allocating an unbounded file.
          const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_JOURNEY_TRANSFER_BYTES + 1 - total));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
          if (!bytesRead) break;
          total += bytesRead;
          if (total > MAX_JOURNEY_TRANSFER_BYTES) throw new InvalidSaveError("This journey file is too large. Export a new copy from the game. Your current journey has not changed.");
          chunks.push(chunk.subarray(0, bytesRead));
        }
        const after = await handle.stat();
        const current = await regularFile(io, path);
        if (!current || !sameFile(stamp(opened), stamp(after)) || !sameFile(stamp(after), stamp(current))) throw new Error("The selected file changed");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
        return decodeJourneyTransfer(text);
      } catch (error) {
        if (error instanceof InvalidSaveError || error instanceof UnsupportedSaveVersionError) throw error;
        throw readFailure();
      } finally {
        try { await handle?.close(); } catch { /* Keep the original read result. */ }
      }
    },
    async exportJourney(state) {
      // Validate and encode before opening a dialog or creating a file.
      const text = encodeJourneyTransfer(state);
      const bytes = Buffer.from(text, "utf8");
      let temporary: string | undefined;
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
      let committed = false;
      try {
        const selection = await options.chooseSave(journeyTransferFilename(state));
        if (selection === null) return false;
        const selected = selectedPath(selection);
        const parent = await io.realpath(dirname(selected));
        const parentStat = await io.lstat(parent);
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error("The selected folder changed");
        const path = join(parent, basename(selected));
        const prior = await regularFile(io, path);
        const before = prior && stamp(prior);
        temporary = join(parent, `.portalwrights-export-${process.pid}-${randomUUID()}.tmp`);
        handle = await io.open(temporary, "wx", 0o600);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, null);
          if (bytesWritten <= 0) throw new Error("The file write made no progress");
          offset += bytesWritten;
        }
        await handle.sync(); await handle.close(); handle = undefined;
        // Do not overwrite a file that appeared/changed while the copy was
        // being prepared, or follow a newly substituted symbolic link.
        const currentParent = await io.lstat(parent);
        const currentFile = await regularFile(io, path);
        if (!currentParent.isDirectory() || currentParent.isSymbolicLink() ||
            currentParent.dev !== parentStat.dev || currentParent.ino !== parentStat.ino ||
            await io.realpath(dirname(selected)) !== parent ||
            !sameFile(before, currentFile && stamp(currentFile))) {
          throw new Error("The selected destination changed");
        }
        // Atomic replacement never unlinks the user's previous file first.
        await io.rename(temporary, path); committed = true;
        if (process.platform !== "win32") {
          let directory: Awaited<ReturnType<typeof fs.open>> | undefined;
          try { directory = await io.open(parent, "r"); await directory.sync(); }
          catch (error) {
            const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
            if (code !== "EINVAL" && code !== "ENOTSUP") throw error;
          } finally { await directory?.close(); }
        }
        return true;
      } catch {
        throw new Error(committed
          ? "The journey file was saved, but its final disk flush could not be confirmed. Export another copy after checking storage access. Your game progress has not changed."
          : "The journey file could not be saved. Any previous file has been kept. Choose a local folder with enough free space and try again. Your game progress has not changed.");
      } finally {
        try { await handle?.close(); } catch { /* Keep the original write failure. */ }
        if (temporary && !committed) {
          try { await io.unlink(temporary); } catch { /* Clean only this attempt's unique temporary file. */ }
        }
      }
    },
  };
}
