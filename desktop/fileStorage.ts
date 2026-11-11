import * as fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { StoragePort } from "../src/game/saveState";

export const MAX_STORAGE_KEY_BYTES = 4096;
export const MAX_STORAGE_VALUE_BYTES = 16 * 1024 * 1024;

/** Narrow injection port for disk fault tests; never exposed to the renderer. */
export type FileStorageIO = Pick<typeof fs,
  "mkdirSync" | "lstatSync" | "readFileSync" | "openSync" | "writeSync" |
  "fsyncSync" | "closeSync" | "renameSync" | "unlinkSync">;

export class FileStorageError extends Error {
  constructor(message: string, readonly committed = false, options?: ErrorOptions) {
    super(message, options);
    this.name = "FileStorageError";
  }
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

/** Main-process storage only. The fixed root comes from app.getPath('userData'),
 * not renderer input. Existing LocalStorageBackend validation, last-good copies,
 * conflict records and unreadable-save archives remain the source of save rules.
 *
 * A slot is committed only by rename of a fully written/fsynced same-directory
 * file. Never unlink a target first (not even if Windows refuses replacement).
 * Interrupted temporary files are ignored, never promoted or guessed at. They
 * are retained after process death; normal failure cleans only its own temp.
 *
 * Node cannot portably fsync directories on Windows. There we fsync the file
 * before atomic replacement; Windows/filesystem power-loss durability still
 * needs physical target validation. Unexpected post-rename POSIX flush errors
 * report uncertain durability, rather than falsely promising a rollback.
 */
export class FileStoragePort implements StoragePort {
  private readonly directory: string;
  private readonly io: FileStorageIO;

  constructor(directory: string, options: { io?: FileStorageIO } = {}) {
    this.directory = resolve(directory);
    this.io = options.io ?? fs;
    try {
      this.io.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      this.ensureDirectory();
    } catch (cause) {
      throw new FileStorageError("The device save folder could not be opened. Existing data has not been replaced.", false, { cause });
    }
  }

  private ensureDirectory(): void {
    const stat = this.io.lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Save root is not a regular directory.");
  }

  private filename(key: string): string {
    if (typeof key !== "string" || !key.length || Buffer.byteLength(key, "utf8") > MAX_STORAGE_KEY_BYTES ||
        Buffer.from(key, "utf8").toString("utf8") !== key) {
      throw new FileStorageError("The device save key is not supported. Existing data has not been replaced.");
    }
    return join(this.directory, `${createHash("sha256").update(key, "utf8").digest("hex")}.save`);
  }

  private ensureRegularSlot(filename: string): boolean {
    let stat: fs.Stats;
    try { stat = this.io.lstatSync(filename); }
    catch (error) { if (isMissing(error)) return false; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Save slot is not a regular file.");
    if (stat.size > MAX_STORAGE_VALUE_BYTES) throw new Error("Save slot exceeds the supported size.");
    return true;
  }

  getItem(key: string): string | null {
    const filename = this.filename(key);
    try {
      this.ensureDirectory();
      if (!this.ensureRegularSlot(filename)) return null;
      const bytes = this.io.readFileSync(filename);
      if (bytes.length > MAX_STORAGE_VALUE_BYTES) throw new Error("Save slot exceeds the supported size.");
      // Fatal decoding refuses corrupt bytes instead of silently substituting
      // replacement characters. The original file stays available on disk.
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new FileStorageError("The device save could not be read. Existing data has been kept; retry after checking storage access.", false, { cause });
    }
  }

  setItem(key: string, value: string): void {
    const filename = this.filename(key);
    if (typeof value !== "string") throw new FileStorageError("The device save is not supported. Existing data has not been replaced.");
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length > MAX_STORAGE_VALUE_BYTES || bytes.toString("utf8") !== value) {
      throw new FileStorageError("The device save is too large or cannot be encoded. Existing data has not been replaced.");
    }
    const temporary = `${filename}.write-${process.pid}-${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    let committed = false;
    try {
      this.ensureDirectory();
      this.ensureRegularSlot(filename);
      descriptor = this.io.openSync(temporary, "wx", 0o600);
      let offset = 0;
      while (offset < bytes.length) {
        const written = this.io.writeSync(descriptor, bytes, offset, bytes.length - offset, null);
        if (written <= 0) throw new Error("Save write made no progress.");
        offset += written;
      }
      this.io.fsyncSync(descriptor);
      this.io.closeSync(descriptor);
      descriptor = undefined;
      this.io.renameSync(temporary, filename);
      committed = true;
      this.syncDirectory();
    } catch (cause) {
      throw new FileStorageError(committed
        ? "The save was replaced, but its final disk flush could not be confirmed. Keep the game open and retry saving."
        : "The device save could not be written. Existing saved data has not been replaced; keep the game open and retry.", committed, { cause });
    } finally {
      if (descriptor !== undefined) {
        try { this.io.closeSync(descriptor); } catch { /* Preserve the original write failure. */ }
      }
      if (!committed) {
        try { this.io.unlinkSync(temporary); } catch { /* Only this attempt's unique temp may be removed. */ }
      }
    }
  }

  private syncDirectory(): void {
    if (process.platform === "win32") return;
    let descriptor: number | undefined;
    try {
      descriptor = this.io.openSync(this.directory, "r");
      this.io.fsyncSync(descriptor);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "EINVAL" && code !== "ENOTSUP") throw error;
      // Some POSIX filesystems do not support directory fsync. A fully synced
      // slot has still been atomically renamed, but power-loss proof is target-specific.
    } finally {
      if (descriptor !== undefined) this.io.closeSync(descriptor);
    }
  }
}
