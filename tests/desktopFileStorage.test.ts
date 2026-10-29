import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { FileStorageError, FileStoragePort, MAX_STORAGE_KEY_BYTES, MAX_STORAGE_VALUE_BYTES, type FileStorageIO } from "../desktop/fileStorage";
import { emptySave, InvalidSaveError, LocalSaveConflictError, LocalStorageBackend } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

const worker = process.argv.indexOf("--desktop-storage-crash-worker");
if (worker >= 0) {
  const directory = process.argv[worker + 1], phase = process.argv[worker + 2];
  const interrupt = () => {
    fs.writeSync(1, `designated-crash-boundary:${phase}\n`);
    process.kill(process.pid, "SIGKILL");
  };
  const storage = new FileStoragePort(directory, { io: {
    ...fs,
    renameSync(from, to) {
      if (phase === "before") interrupt();
      fs.renameSync(from, to);
      if (phase === "after") interrupt();
    },
  } });
  storage.setItem("campaign", '{"checkpoint":"new-complete-chapter"}');
  process.exit(70); // A worker must be interrupted at its designated write boundary.
}

async function temporary(run: (directory: string, storage: FileStoragePort) => void | Promise<void>): Promise<void> {
  const directory = fs.mkdtempSync(join(tmpdir(), "portalwrights-file-storage-"));
  try { await run(directory, new FileStoragePort(directory)); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
function throws(work: () => unknown): FileStorageError {
  try { work(); } catch (error) {
    assert(error instanceof FileStorageError, "disk/storage failures have player-safe error messages");
    return error as FileStorageError;
  }
  throw new Error("Expected storage failure");
}
async function rejection(work: () => Promise<unknown>): Promise<unknown> {
  try { await work(); } catch (error) { return error; }
  throw new Error("Expected save rejection");
}
const saveKey = "portalwrights-almanac.save.v1";

await suite("Desktop disk storage: exact strings and hashed slots survive a new process adapter without path access", async () => {
  await temporary((directory, storage) => {
    assertEqual(storage.getItem("not-yet-saved"), null, "only an absent slot is a missing save");
    const values = new Map([["campaign", "winter · Rúna\n"], ["../outside", "kept inside"], ["C:\\escape:CON", "Windows-safe filename"], ["empty", ""]]);
    for (const [key, value] of values) storage.setItem(key, value);
    const reopened = new FileStoragePort(directory);
    for (const [key, value] of values) assertEqual(reopened.getItem(key), value, "UTF8 and empty strings roundtrip exactly through disk");
    const files = fs.readdirSync(directory);
    assertEqual(files.length, values.size, "normal writes leave only committed slots");
    assert(files.every(file => /^[a-f0-9]{64}\.save$/.test(file)), "renderer keys cannot create path separators, device names or arbitrary files");
    if (process.platform !== "win32") {
      assertEqual(fs.statSync(join(directory, files[0])).mode & 0o777, 0o600, "new POSIX save files are private to their owner");
    }
  });
});

await suite("Desktop disk storage: invalid keys, oversized values and invalid UTF8 refuse mutation", async () => {
  await temporary((directory, storage) => {
    storage.setItem("campaign", "original");
    for (const key of ["", "a".repeat(MAX_STORAGE_KEY_BYTES + 1), "bad\ud800key"]) throws(() => storage.setItem(key, "new"));
    for (const value of ["a".repeat(MAX_STORAGE_VALUE_BYTES + 1), "bad\ud800value"]) throws(() => storage.setItem("campaign", value));
    assertEqual(storage.getItem("campaign"), "original", "rejected values never replace the existing slot");
    assertEqual(fs.readdirSync(directory).length, 1, "rejected keys never create filesystem artifacts");
    const file = join(directory, fs.readdirSync(directory)[0]);
    fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
    throws(() => storage.getItem("campaign"));
    assertEqual([...fs.readFileSync(file)], [0xc3, 0x28], "invalid on-disk bytes remain exact rather than being silently replaced during decode");
    fs.truncateSync(file, MAX_STORAGE_VALUE_BYTES + 1);
    throws(() => storage.getItem("campaign"));
    throws(() => storage.setItem("campaign", "small replacement"));
    assertEqual(fs.statSync(file).size, MAX_STORAGE_VALUE_BYTES + 1, "unknown oversized existing data cannot be overwritten through a blind write");
  });
});

await suite("Desktop disk storage: denied reads and invalid roots never masquerade as a fresh save", async () => {
  await temporary((directory, storage) => {
    storage.setItem("campaign", "original");
    const denied = new FileStoragePort(directory, { io: { ...fs, readFileSync() { throw Object.assign(new Error("access denied"), { code: "EACCES" }); } } as FileStorageIO });
    throws(() => denied.getItem("campaign"));
    assertEqual(storage.getItem("campaign"), "original", "denied reads do not mutate existing files");
    const missingRoot = join(directory, "later-removed");
    const removed = new FileStoragePort(missingRoot); fs.rmdirSync(missingRoot);
    throws(() => removed.getItem("campaign"));
    const notDirectory = join(directory, "file-not-folder"); fs.writeFileSync(notDirectory, "not a folder");
    throws(() => new FileStoragePort(notDirectory));
    const file = join(directory, fs.readdirSync(directory).find(name => name.endsWith(".save"))!);
    fs.unlinkSync(file); fs.mkdirSync(file);
    throws(() => storage.getItem("campaign")); throws(() => storage.setItem("campaign", "new"));
  });
});

await suite("Desktop disk storage: partial writes, flush failures and rename refusal preserve the committed save", async () => {
  for (const phase of ["write", "fsync", "rename"] as const) await temporary((directory, storage) => {
    storage.setItem("campaign", "original-checkpoint");
    const originalFile = join(directory, fs.readdirSync(directory)[0]);
    const unrelated = join(directory, "unrelated.tmp"); fs.writeFileSync(unrelated, "leave this alone");
    let writes = 0;
    const faulted = new FileStoragePort(directory, { io: {
      ...fs,
      writeSync(fd, buffer: Uint8Array, offset: number, length: number, position: number | null) {
        writes++;
        if (phase === "write" && writes > 1) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        return fs.writeSync(fd, buffer, offset, phase === "write" ? Math.min(3, length) : length, position);
      },
      fsyncSync(fd) { if (phase === "fsync") throw new Error("flush failed"); fs.fsyncSync(fd); },
      renameSync(from, to) { if (phase === "rename") throw Object.assign(new Error("file in use"), { code: "EPERM" }); fs.renameSync(from, to); },
      unlinkSync(path) { assertEqual(path === originalFile, false, "target is never unlinked before rename, including on Windows refusal"); fs.unlinkSync(path); },
    } as FileStorageIO });
    const error = throws(() => faulted.setItem("campaign", "new-checkpoint-that-must-not-replace-old"));
    assertEqual(error.committed, false, "failure before rename does not claim a committed replacement");
    assertEqual(storage.getItem("campaign"), "original-checkpoint", "the previously committed journey remains readable");
    assertEqual(fs.readFileSync(unrelated, "utf8"), "leave this alone", "cleanup only touches the attempt's exclusive temporary file");
    assertEqual(fs.readdirSync(directory).filter(name => name.includes(".write-")).length, 0, "ordinary failure cleans its own partial attempt");
  });
});

await suite("Desktop disk storage: process interruption before or after rename yields only a complete old or new save", async () => {
  for (const phase of ["before", "after"]) await temporary((directory, storage) => {
    storage.setItem("campaign", '{"checkpoint":"old-complete-chapter"}');
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--desktop-storage-crash-worker", directory, phase], { encoding: "utf8", timeout: 15_000 });
    assert(result.signal === "SIGKILL" || (result.status !== null && result.status !== 0 && result.status !== 70), "child process was terminated at its designated write boundary");
    assertEqual(result.error, undefined, "crash worker itself started successfully");
    assertEqual(result.stdout, `designated-crash-boundary:${phase}\n`, "worker actually reached the requested crash point");
    assertEqual(result.stderr, "", "worker termination cannot hide an unrelated runtime exception");
    const reopened = new FileStoragePort(directory);
    assertEqual(JSON.parse(reopened.getItem("campaign")!).checkpoint, phase === "before" ? "old-complete-chapter" : "new-complete-chapter", "a crash cannot expose partial bytes as committed progress");
    const incomplete = fs.readdirSync(directory).filter(name => name.includes(".write-"));
    assertEqual(incomplete.length, phase === "before" ? 1 : 0, "pre-commit orphan is retained and ignored, never promoted automatically");
    reopened.setItem("campaign", '{"checkpoint":"next-explicit-write"}');
    assertEqual(JSON.parse(reopened.getItem("campaign")!).checkpoint, "next-explicit-write", "a later ordinary save works without relying on orphan contents");
    assertEqual(fs.readdirSync(directory).filter(name => name.includes(".write-")).length, incomplete.length, "new adapter cannot delete another process's unfinished file");
  });
});

await suite("Desktop disk storage: a post-rename flush error reports uncertain durability without claiming rollback", async () => {
  await temporary((directory, storage) => {
    storage.setItem("campaign", "old");
    let flushes = 0;
    const faulted = new FileStoragePort(directory, { io: {
      ...fs,
      fsyncSync(fd) { if (++flushes === 2) throw Object.assign(new Error("device flush failed"), { code: "EIO" }); fs.fsyncSync(fd); },
    } });
    if (process.platform === "win32") {
      faulted.setItem("campaign", "new");
      assertEqual(flushes, 1, "Windows flushes the file, without pretending to support Node directory fsync");
    } else {
      const error = throws(() => faulted.setItem("campaign", "new"));
      assertEqual(error.committed, true, "failure after rename explicitly reports that replacement occurred");
      assert(error.message.includes("could not be confirmed"), "player copy does not promise that a post-commit failure restored old data");
    }
    assertEqual(storage.getItem("campaign"), "new", "new complete bytes are visible after rename");
    assertEqual(fs.readdirSync(directory).filter(name => name.includes(".write-")).length, 0, "successful rename leaves no orphan for the committed attempt");
  });
});

await suite("Desktop disk storage: validated game checkpoints, last-good fallback and damaged recovery use real files", async () => {
  await temporary(async (directory, storage) => {
    const first = new LocalStorageBackend(storage); await first.load();
    const save = emptySave("Disk Wren"); save.typewriterAwakened = true; save.wrenGender = "boy";
    save.checkpoint = { scene: "WinterMountainScene", step: "fork1", data: { statsSoul: 62.5, candles: 2 } };
    await first.save(save);
    const reopened = new LocalStorageBackend(new FileStoragePort(directory));
    assertEqual((await reopened.load())?.checkpoint, save.checkpoint, "new backend restores exact chapter and fractional resources from disk");
    const later = { ...save, updatedAt: save.updatedAt + 1, profileName: "Continued disk Wren" }; await reopened.save(later);
    storage.setItem(saveKey, "{damaged-primary");
    const fallback = new LocalStorageBackend(new FileStoragePort(directory));
    assertEqual((await fallback.load())?.profileName, "Disk Wren", "valid last-good disk copy remains playable after primary damage");
    storage.setItem(`${saveKey}.lkg`, "{damaged-backup");
    const damaged = new LocalStorageBackend(new FileStoragePort(directory));
    assert(await rejection(() => damaged.load()) instanceof InvalidSaveError, "both damaged disk copies cannot become an automatic fresh game");
    const snapshot = (await damaged.getRecovery())!;
    const fresh = await damaged.startFreshAfterRecovery(snapshot);
    assertEqual(fresh.typewriterAwakened, false, "only explicit recovery opens an empty journey");
    const archive = JSON.parse(storage.getItem(`${saveKey}.damaged-recovery.${snapshot.token}`)!);
    assertEqual(archive.copies, snapshot.copies, "immutable on-disk archive retains both exact unreadable originals");
    assertEqual((await new LocalStorageBackend(new FileStoragePort(directory)).load())?.runId, fresh.runId, "explicit fresh journey itself survives reopen");
  });
});

await suite("Desktop disk storage: stale backend writers preserve two branches on disk for explicit choice", async () => {
  await temporary(async (directory, storage) => {
    const base = emptySave(); storage.setItem(saveKey, JSON.stringify(base));
    const a = new LocalStorageBackend(new FileStoragePort(directory)), b = new LocalStorageBackend(new FileStoragePort(directory));
    await a.load(); await b.load();
    const newer = { ...base, profileName: "Saved window", updatedAt: base.updatedAt + 1 };
    const stale = { ...base, profileName: "Other window", updatedAt: base.updatedAt + 2 };
    await a.save(newer);
    assert(await rejection(() => b.save(stale)) instanceof LocalSaveConflictError, "stale writer is refused by the same save rules on disk");
    assertEqual(JSON.parse(storage.getItem(saveKey)!).profileName, "Saved window", "stale branch cannot roll back committed primary");
    const next = new LocalStorageBackend(new FileStoragePort(directory));
    assert(await rejection(() => next.load()) instanceof LocalSaveConflictError, "pending choice survives a new backend/process adapter");
    assertEqual(next.getConflict()?.local.profileName, "Other window", "pending branch is durable too");
    const selected = await next.resolveConflict("cloud");
    assertEqual(selected.profileName, "Saved window", "explicit choice retains saved journey");
    assertEqual(next.getLastDeviceRecovery()?.local.profileName, "Other window", "unchosen branch is retained on disk after choice");
  });
});
