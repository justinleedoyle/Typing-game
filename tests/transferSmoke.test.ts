import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, assertEqual, suite } from "./_assert";
import { LocalStorageBackend } from "../src/game/saveState";
import { decodeJourneyTransfer, encodeJourneyTransfer } from "../src/game/saveTransfer";
import { FileStoragePort } from "../desktop/fileStorage";
import { createJourneyFileActions } from "../desktop/journeyFiles";
import { prepareDesktopSmoke } from "../desktop/smoke";
import { prepareTransferSmoke, transferSmokePaths, verifyTransferSmokeFiles } from "../desktop/transferSmoke";

async function fixture() {
  const profile = await mkdtemp(join(tmpdir(), "portalwrights-desktop-smoke-transfer-"));
  const storage = new FileStoragePort(join(profile, "journeys")), backend = new LocalStorageBackend(storage);
  await prepareDesktopSmoke(backend, "seed");
  const incoming = (await backend.load())!;
  await prepareTransferSmoke(backend, profile);
  const original = (await backend.load())!, paths = transferSmokePaths(profile);
  const native = createJourneyFileActions({ chooseOpen: async () => paths.input, chooseSave: async () => paths.output });
  return { profile, storage, backend, incoming, original, paths, native };
}
async function fails(work: Promise<unknown>): Promise<boolean> {
  try { await work; return false; } catch { return true; }
}
async function importedFixture() {
  const f = await fixture();
  await f.native.exportJourney(f.original);
  const selected = await f.native.chooseImport();
  assert(selected !== null, "the real main-process file adapter reads the selected synthetic incoming file");
  const preview = await f.backend.prepareImport(selected!);
  const current = await f.backend.commitImport(preview.token);
  return { ...f, current };
}

await suite("Packaged transfer fixture: two distinct real disk runs preserve the four-phase Windows identity", async () => {
  const f = await fixture();
  try {
    assertEqual(decodeJourneyTransfer(await readFile(f.paths.input, "utf8")), f.incoming, "input is the original exact Winter run used by later smoke phases");
    assert(f.original.runId !== f.incoming.runId, "desktop starts with genuinely different progress rather than an identical import no-op");
    assertEqual([f.original.profileName, f.original.checkpoint], ["Synthetic desktop original", { scene: "OpeningScene", step: "arrival", data: {} }], "the pre-import desktop save is actually an opening journey");
    assertEqual(await new LocalStorageBackend(new FileStoragePort(join(f.profile, "journeys"))).load(), f.original, "a separate backend/process reader sees the actual durable original");
    assertEqual(f.paths.input, join(f.profile, "transfer-source.json"), "synthetic picker input stays inside the validated disposable profile");
    assertEqual(f.paths.output, join(f.profile, "transfer-export.json"), "synthetic picker export cannot select a normal player path");
    assert(await fails(prepareTransferSmoke(f.backend, f.profile)), "a second preparation cannot overwrite the existing transfer source or active state");
    assertEqual(await f.backend.load(), f.original, "refused repeated preparation preserves current progress");
  } finally { await rm(f.profile, { recursive: true, force: true }); }
});

await suite("Packaged transfer evidence: real export, read-only comparison, cancellation and archived replacement retain exact files", async () => {
  const f = await fixture();
  try {
    const bytes = await readFile(f.paths.input, "utf8"), originalRaw = f.storage.getItem(f.backend.storageKey);
    assertEqual(await f.native.exportJourney(f.original), true, "actual native file adapter writes the original export");
    assertEqual(decodeJourneyTransfer(await readFile(f.paths.output, "utf8")), f.original, "the exported file is the original desktop journey, not the incoming candidate");
    const candidate = await f.native.chooseImport();
    const cancelled = await f.backend.prepareImport(candidate!);
    assertEqual(cancelled.current, f.original, "comparison shows the original currently on the desktop");
    assertEqual(cancelled.incoming, f.incoming, "comparison shows the distinct file journey");
    assertEqual(f.storage.getItem(f.backend.storageKey), originalRaw, "reading/comparing and abandoning a confirmation leave exact active bytes unchanged");
    const preview = await f.backend.prepareImport((await f.native.chooseImport())!);
    const current = await f.backend.commitImport(preview.token);
    const evidence = await verifyTransferSmokeFiles(f.profile, current);
    assertEqual([evidence.sourceUnchanged, evidence.exportedOriginal, evidence.archivePreserved, evidence.runIdentity], [true, true, true, true], "disk validation requires every promised transfer property");
    assertEqual([evidence.incomingRunId, evidence.originalRunId], [f.incoming.runId, f.original.runId], "evidence distinguishes both actual journey identities");
    assert(/^[a-f0-9]{64}$/.test(evidence.sourceSha256) && /^[a-f0-9]{64}$/.test(evidence.exportSha256), "report hashes refer to the actual local input and output files");
    assertEqual(await readFile(f.paths.input, "utf8"), bytes, "confirmed import leaves the source file byte-identical");
    assertEqual((await f.backend.load())?.runId, f.incoming.runId, "the imported run becomes the actual continued disk journey");
    assert(await fails(f.backend.commitImport(cancelled.token)), "abandoned review token cannot replace the newly selected journey");
  } finally { await rm(f.profile, { recursive: true, force: true }); }
});

await suite("Packaged transfer evidence: altered source, wrong export or missing archive cannot report success", async () => {
  const f = await importedFixture();
  try {
    const source = await readFile(f.paths.input, "utf8"), output = await readFile(f.paths.output, "utf8");
    await writeFile(f.paths.input, source + " ");
    assert(await fails(verifyTransferSmokeFiles(f.profile, f.current)), "even a parseable source-file byte change invalidates source-preservation evidence");
    await writeFile(f.paths.input, source);
    await writeFile(f.paths.output, encodeJourneyTransfer(f.incoming));
    assert(await fails(verifyTransferSmokeFiles(f.profile, f.current)), "exporting the incoming file cannot masquerade as preserving the original desktop journey");
    await writeFile(f.paths.output, output);
    assert(await fails(verifyTransferSmokeFiles(f.profile, { ...f.current, profileName: "changed after import" })), "a different post-import state cannot claim exact imported progress");
    const directory = join(f.profile, "journeys");
    let archive: string | undefined;
    for (const file of await readdir(directory)) {
      const parsed = JSON.parse(await readFile(join(directory, file), "utf8"));
      if (parsed.kind === "journey-transfer") archive = join(directory, file);
    }
    assert(archive !== undefined, "real backend created an immutable transfer archive on disk");
    const archiveBytes = await readFile(archive!, "utf8"), changed = JSON.parse(archiveBytes);
    changed.copies.primary = null;
    await writeFile(archive!, JSON.stringify(changed));
    assert(await fails(verifyTransferSmokeFiles(f.profile, f.current)), "an archive that drops original active bytes is not accepted");
    await writeFile(archive!, archiveBytes);
    const good = await verifyTransferSmokeFiles(f.profile, f.current);
    assertEqual(good.archivePreserved, true, "restoring exact expected synthetic files makes the complete evidence valid again");
  } finally { await rm(f.profile, { recursive: true, force: true }); }
});

await suite("Packaged transfer isolation: ordinary or nonexistent profile paths are refused before file access", async () => {
  let refused = false;
  try { transferSmokePaths(tmpdir()); } catch { refused = true; }
  assert(refused, "the OS temp root itself cannot be selected as a smoke profile");
  refused = false;
  try { transferSmokePaths(join(tmpdir(), "an-ordinary-game-profile")); } catch { refused = true; }
  assert(refused, "a nonexistent or ordinary directory cannot select synthetic native file paths");
});
