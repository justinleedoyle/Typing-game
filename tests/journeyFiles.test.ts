import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJourneyFileActions, type JourneyFileIO } from "../desktop/journeyFiles";
import { emptySave, UnsupportedSaveVersionError } from "../src/game/saveState";
import { decodeJourneyTransfer, encodeJourneyTransfer, MAX_JOURNEY_TRANSFER_BYTES } from "../src/game/saveTransfer";
import { assert, assertEqual, suite } from "./_assert";

function journey() {
  const state = emptySave("Wren Étoile");
  state.typewriterAwakened = true; state.wrenGender = "girl";
  state.realms = { "winter-mountain": { cleared: false, choices: { fox: "spared" } } };
  state.checkpoint = { scene: "WinterMountainScene", step: "fork1", data: { candles: 2, statsSoul: 62.5, statsCombo: 8 } };
  state.keyStats = { s: { hits: 1, misses: 0 } };
  return state;
}
async function failure(work: Promise<unknown>): Promise<Error> {
  try { await work; }
  catch (error) { return error instanceof Error ? error : new Error(String(error)); }
  throw new Error("Expected an operation to refuse the selected file");
}
async function fixture(work: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), "portalwrights-journey-files-"));
  try { await work(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
function actions(open: string | null, save: string | null, io?: JourneyFileIO) {
  return createJourneyFileActions({ chooseOpen: async () => open, chooseSave: async () => save, io });
}

await suite("Journey files: an actual exported UTF-8 file roundtrips every journey field without changing the source", async () => {
  await fixture(async root => {
    const state = journey(), before = structuredClone(state), file = join(root, "chosen-journey.json");
    let suggestion = "";
    const port = createJourneyFileActions({ chooseOpen: async () => file, chooseSave: async name => { suggestion = name; return file; } });
    assertEqual(await port.exportJourney(state), true, "native selected destination is written before export succeeds");
    assert(suggestion.startsWith("portalwrights-journey-wren-") && /^[A-Za-z0-9.-]+\.json$/.test(suggestion) && !suggestion.includes("/") && !suggestion.includes("\\"), "the suggested name contains no path and keeps a readable safe profile name");
    assertEqual(await port.chooseImport(), state, "the actual bounded native read returns the complete canonical journey");
    assertEqual(decodeJourneyTransfer(await fs.readFile(file, "utf8")), state, "the on-disk copy is the portable format rather than raw recovery or storage data");
    assertEqual(state, before, "export never updates game state or its revision");
    assertEqual((await fs.readdir(root)).sort(), ["chosen-journey.json"], "successful atomic export leaves no temporary file");
  });
});

await suite("Journey files: cancel and malformed local selections cannot become imported progress", async () => {
  await fixture(async root => {
    const empty = actions(null, null);
    assertEqual(await empty.chooseImport(), null, "canceling the native open dialog returns cancellation");
    assertEqual(await empty.exportJourney(journey()), false, "canceling native save never claims file delivery");
    assertEqual(await fs.readdir(root), [], "canceled dialogs do not create a copy or temp file");
    const badUtf8 = join(root, "invalid-utf8.json");
    await fs.writeFile(badUtf8, Buffer.from([0xc3, 0x28]));
    const utf8Error = await failure(actions(badUtf8, null).chooseImport());
    assert(!utf8Error.message.includes(root) && utf8Error.message.includes("current journey has not changed"), "fatal UTF-8 rejection gives safe player copy without exposing the selected path");
    const tooLarge = join(root, "oversized.json");
    const descriptor = await fs.open(tooLarge, "w"); await descriptor.truncate(MAX_JOURNEY_TRANSFER_BYTES + 1); await descriptor.close();
    const sizeError = await failure(actions(tooLarge, null).chooseImport());
    assert(sizeError.message.includes("too large"), "oversized actual file is refused from stat before a whole-file allocation");
    const future = join(root, "future.json"), envelope = JSON.parse(encodeJourneyTransfer(journey()));
    envelope.version = 999; await fs.writeFile(future, JSON.stringify(envelope));
    assert(await failure(actions(future, null).chooseImport()) instanceof UnsupportedSaveVersionError, "native reading retains the newer-format error for the game's update guidance");
    const directoryError = await failure(actions(root, null).chooseImport());
    assert(!directoryError.message.includes(root), "a directory selection is rejected without its OS path or low-level details");
    const missingError = await failure(actions(join(root, "missing.json"), null).chooseImport());
    assert(!missingError.message.includes("ENOENT") && !missingError.message.includes(root), "missing files never leak filesystem diagnostics into player copy");
  });
});

await suite("Journey files: a file that grows during reading stays bounded and cannot slip past the size check", async () => {
  await fixture(async root => {
    const path = join(root, "growing.json"); await fs.writeFile(path, encodeJourneyTransfer(journey()));
    let grew = false, largestRead = 0, totalRead = 0;
    const io: JourneyFileIO = { ...fs, async open(selected, flags, mode) {
      const handle = await fs.open(selected, flags, mode), original = handle.read.bind(handle);
      (handle as any).read = async (buffer: Buffer, offset: number, length: number, position: number | null) => {
        largestRead = Math.max(largestRead, length);
        const result = await original(buffer, offset, length, position); totalRead += result.bytesRead;
        if (!grew) { grew = true; await fs.truncate(path, MAX_JOURNEY_TRANSFER_BYTES + 4096); }
        return result;
      };
      return handle;
    } };
    const error = await failure(actions(path, null, io).chooseImport());
    assert(grew && error.message.includes("too large"), "growth after fstat is detected by the streaming byte limit");
    assert(largestRead <= 64 * 1024, "each real filesystem read has a fixed small upper bound");
    assert(totalRead <= MAX_JOURNEY_TRANSFER_BYTES + 1, "the reader stops at the limit plus one detection byte");
  });
});

await suite("Journey files: selected symbolic links are refused for both import and export", async () => {
  await fixture(async root => {
    const target = join(root, "original.json"), link = join(root, "linked.json"), original = encodeJourneyTransfer(journey());
    await fs.writeFile(target, original);
    try { await fs.symlink(target, link); }
    catch (error) {
      if (process.platform === "win32" && error !== null && typeof error === "object" && "code" in error && ["EPERM", "EACCES"].includes(String(error.code))) {
        assert(true, "this Windows host does not permit creating a symlink fixture; native symlink behavior remains unverified here"); return;
      }
      throw error;
    }
    const readError = await failure(actions(link, null).chooseImport());
    const writeError = await failure(actions(null, link).exportJourney(journey()));
    assert(!readError.message.includes(root) && !writeError.message.includes(root), "link refusal contains no selected or target path");
    assertEqual(await fs.readFile(target, "utf8"), original, "neither read nor failed export changes the linked target");
    assert((await fs.lstat(link)).isSymbolicLink(), "export does not replace a selected symbolic link");
  });
});

await suite("Journey files: partial writes and rename failures preserve an existing chosen file and clean only their temp", async () => {
  await fixture(async root => {
    for (const mode of ["partial", "rename"] as const) {
      const path = join(root, `${mode}.json`), previous = `original ${mode} file`;
      await fs.writeFile(path, previous);
      const unrelated = join(root, ".unrelated-export.tmp"); await fs.writeFile(unrelated, "keep unrelated temp");
      const io: JourneyFileIO = { ...fs,
        async open(selected, flags, permissions) {
          const handle = await fs.open(selected, flags, permissions);
          if (mode === "partial" && flags === "wx") {
            const original = handle.write.bind(handle); let first = true;
            (handle as any).write = async (buffer: Buffer, offset: number, length: number, position: number | null) => {
              if (!first) throw new Error("private fixture OS failure detail");
              first = false; return original(buffer, offset, Math.min(length, 16), position);
            };
          }
          return handle;
        },
        async rename(from, to) {
          if (mode === "rename") throw new Error("private fixture OS failure detail");
          await fs.rename(from, to);
        },
      };
      const error = await failure(actions(null, path, io).exportJourney(journey()));
      assert(error.message.includes("previous file has been kept") && !error.message.includes("private fixture") && !error.message.includes(root), `${mode} failure gives safe copy without private OS details`);
      assertEqual(await fs.readFile(path, "utf8"), previous, `${mode} failure never unlinks or modifies the chosen previous file`);
      assertEqual(await fs.readFile(unrelated, "utf8"), "keep unrelated temp", "cleanup cannot remove another attempt's temp");
      assert(!(await fs.readdir(root)).some(name => name.startsWith(".portalwrights-export-")), `${mode} failure removes only this attempt's incomplete temp`);
    }
  });
});

await suite("Journey files: a destination changed during preparation is never overwritten", async () => {
  await fixture(async root => {
    const path = join(root, "changed.json"); await fs.writeFile(path, "before preparation");
    let changed = false;
    const io: JourneyFileIO = { ...fs, async open(selected, flags, mode) {
      const handle = await fs.open(selected, flags, mode);
      if (flags === "wx") { changed = true; await fs.writeFile(path, "another writer's newer file with a different length"); }
      return handle;
    } };
    await failure(actions(null, path, io).exportJourney(journey()));
    assert(changed, "the fixture really changed the chosen destination while the export temp was open");
    assertEqual(await fs.readFile(path, "utf8"), "another writer's newer file with a different length", "the final exact-file guard retains the other writer's new bytes");
    assert(!(await fs.readdir(root)).some(name => name.startsWith(".portalwrights-export-")), "a changed-destination refusal cleans its own prepared temp");
  });
});
