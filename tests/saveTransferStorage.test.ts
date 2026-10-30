// Actual validated storage transactions with isolated byte ports. No browser
// storage, account credentials, downloads or real cloud requests are involved.
import { assert, assertEqual, suite } from "./_assert";
import {
  LocalStorageBackend, SyncedBackend, SaveStore, emptySave,
  InvalidSaveError, UnsupportedSaveVersionError, LocalSaveConflictError, SaveConflictError, CloudSaveError, CURRENT_SCHEMA_VERSION,
  type StoragePort, type SaveState, type CloudSaveBackend, type LocalSaveLock,
} from "../src/game/saveState";

class Bytes implements StoragePort {
  values = new Map<string, string>();
  writes: Array<{ key: string; value: string }> = [];
  deniedRead: string | null = null;
  beforeWrite?: (key: string, value: string) => void;
  afterWrite?: (key: string, value: string) => void;
  getItem(key: string): string | null {
    if (key === this.deniedRead) throw new Error("Storage cannot be read");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.beforeWrite?.(key, value);
    this.values.set(key, value); this.writes.push({ key, value });
    this.afterWrite?.(key, value);
  }
}
class Cloud implements CloudSaveBackend {
  user: string | null = null;
  offline = false;
  reads = 0; writes = 0;
  rows = new Map<string, SaveState>();
  async currentUserId(): Promise<string | null> { if (this.offline) throw new Error("offline"); return this.user; }
  async load(owner?: string): Promise<SaveState | null> { this.reads++; return owner ? this.rows.get(owner) ?? null : null; }
  async save(): Promise<void> { this.writes++; }
  async saveIfUnchanged(): Promise<boolean> { this.writes++; return true; }
}
async function fails(work: Promise<unknown>, kind: new (...args: any[]) => Error = Error): Promise<boolean> {
  try { await work; return false; } catch (error) { return error instanceof kind; }
}
function journey(name: string, updatedAt = 100): SaveState {
  const state = emptySave(name);
  state.updatedAt = updatedAt; state.typewriterAwakened = true; state.wrenGender = "boy";
  state.realms["winter-mountain"] = { cleared: false, choices: { fox: "spared", fork1: "firefly" } };
  state.checkpoint = { scene: "WinterMountainScene", step: "firefly", data: { index: 1, reading: true, candles: 2, statsSoul: 62.5, statsCombo: 8 } };
  state.satchel = ["snow-fox-cub"]; state.almanacLore = ["the-wounded-foxs-name"];
  return state;
}
function fixture(existing = true) {
  const bytes = new Bytes(), backend = new LocalStorageBackend(bytes), key = backend.storageKey;
  const current = journey("Existing desktop journey", 200), backup = journey("Earlier desktop checkpoint", 150), incoming = journey("Incoming browser journey", 300);
  if (existing) { bytes.values.set(key, JSON.stringify(current)); bytes.values.set(`${key}.lkg`, JSON.stringify(backup)); }
  return { bytes, backend, key, current, backup, incoming };
}
function archive(f: ReturnType<typeof fixture>, token: string): any {
  const raw = f.bytes.getItem(`${f.key}.transfer.${token}`);
  assert(raw !== null, "confirmed import has a separate durable archive");
  return JSON.parse(raw!);
}

await suite("Save transfer: previews and exports read durable data without writes or candidate authority", async () => {
  for (const existing of [false, true]) {
    const f = fixture(existing);
    f.bytes.values.set(`${f.key}.device-conflict.previous`, "historical bytes retained without interpretation");
    assertEqual(await f.backend.snapshotForTransfer(), existing ? f.current : null, "export reflects acknowledged bytes and distinguishes no saved journey");
    const preview = await f.backend.prepareImport(f.incoming);
    assertEqual(preview.current, existing ? f.current : null, "preview names the exact current durable journey");
    assertEqual(preview.incoming, f.incoming, "preview describes the selected validated browser journey");
    assertEqual(f.bytes.writes, [], "export and preparation create no backup, conflict record or new journey");
    preview.incoming.profileName = "tampered preview";
    preview.incoming.checkpoint!.data.statsSoul = 0;
    f.incoming.profileName = "tampered original object";
    if (preview.current) preview.current.profileName = "tampered current preview";
    const selected = await f.backend.commitImport(preview.token);
    assertEqual([selected.profileName, selected.checkpoint?.data.statsSoul], ["Incoming browser journey", 62.5], "commit uses its own isolated canonical candidate, not objects returned to or retained by the caller");
    assertEqual(f.bytes.getItem(`${f.key}.device-conflict.previous`), "historical bytes retained without interpretation", "previous device-choice data stays untouched");
  }
});

await suite("Save transfer: explicit commit preserves every original before replacing primary and backup", async () => {
  const f = fixture();
  f.bytes.values.set(`${f.key}.device-conflict.pending`, "null");
  f.bytes.values.set(`${f.key}.device-conflict.previous`, "previous archive exact text");
  const originals = { primary: f.bytes.getItem(f.key), backup: f.bytes.getItem(`${f.key}.lkg`), pendingDeviceChoice: "null", previousDeviceChoice: "previous archive exact text" };
  const preview = await f.backend.prepareImport(f.incoming);
  const selected = await f.backend.commitImport(preview.token);
  const preserved = archive(f, preview.token);
  assertEqual(preserved.copies, originals, "immutable archive retains primary, last-good and both device-choice records exactly");
  assertEqual(preserved.incoming, selected, "archive also retains the exact planned imported journey");
  assert(f.bytes.writes[0].key.endsWith(`.transfer.${preview.token}`), "preservation is the first write");
  assertEqual(f.bytes.writes.slice(1).map(write => write.key), [f.key, `${f.key}.lkg`], "primary is acknowledged before the old backup can be replaced");
  assertEqual({ ...selected, updatedAt: f.incoming.updatedAt }, f.incoming, "run identity, checkpoint, fractional resources, rewards and presentation preferences survive unchanged");
  assert(selected.updatedAt > f.incoming.updatedAt && selected.updatedAt > f.current.updatedAt, "import timestamp advances both journeys monotonically");
  assertEqual(await new LocalStorageBackend(f.bytes).load(), selected, "import is durable in a new backend instance");
  assertEqual(JSON.parse(f.bytes.getItem(`${f.key}.lkg`)!), selected, "last-good recovery now belongs to the imported journey too");
  const writes = f.bytes.writes.length;
  assertEqual(await f.backend.commitImport(preview.token), selected, "repeating an acknowledged token returns the same result");
  assertEqual(f.bytes.writes.length, writes, "completed replay does not write, create another archive or advance its timestamp");
});

await suite("Save transfer: arbitrary, superseded and different-backend tokens cannot authorize replacement", async () => {
  const f = fixture();
  const preview = await f.backend.prepareImport(f.incoming);
  assert(await fails(f.backend.commitImport("not-issued"), InvalidSaveError), "arbitrary token is rejected");
  assert(await fails(new LocalStorageBackend(f.bytes).commitImport(preview.token), InvalidSaveError), "tokens are issued only within their backend session");
  const next = await f.backend.prepareImport(journey("Newly selected file", 400));
  assert(await fails(f.backend.commitImport(preview.token), InvalidSaveError), "a new selection invalidates an older confirmation");
  assertEqual(f.bytes.writes, [], "failed confirmation never mutates progress or creates a pending conflict");
  assertEqual((await f.backend.commitImport(next.token)).profileName, "Newly selected file", "only the latest reviewed candidate can be committed");
});

await suite("Save transfer: changes to any captured bytes require a new preview without fabricating conflicts", async () => {
  for (const suffix of ["", ".lkg", ".device-conflict.pending", ".device-conflict.previous"]) {
    const f = fixture(), preview = await f.backend.prepareImport(f.incoming);
    const changed = suffix === "" || suffix === ".lkg" ? JSON.stringify(journey("Changed elsewhere", 500)) : suffix.endsWith("pending") ? "null" : "changed history";
    f.bytes.values.set(f.key + suffix, changed);
    assert(await fails(f.backend.commitImport(preview.token), InvalidSaveError), "even semantically empty metadata changes invalidate the exact-byte confirmation");
    assertEqual(f.bytes.getItem(f.key + suffix), changed, "outside change remains untouched");
    assertEqual(f.bytes.writes, [], "stale preview cannot create a device conflict, archive or overwrite");
    assert(await fails(f.backend.commitImport(preview.token), InvalidSaveError), "stale token stays invalid instead of retrying an outdated candidate");
  }
});

await suite("Save transfer: damage, newer formats and denied reads must resolve before transfer", async () => {
  for (const suffix of ["", ".lkg", ".device-conflict.pending"]) for (const future of [false, true]) {
    const f = fixture();
    f.bytes.values.set(f.key + suffix, future
      ? JSON.stringify(suffix.includes("pending") ? { version: 99 } : { ...f.current, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }) : "{damaged");
    const kind = future ? UnsupportedSaveVersionError : InvalidSaveError;
    assert(await fails(f.backend.prepareImport(f.incoming), kind), "active damaged/future bytes are never hidden by an otherwise usable copy");
    assert(await fails(f.backend.snapshotForTransfer(), kind), "export cannot present damaged or unsupported device data as playable progress");
    assertEqual(f.bytes.writes, [], "refusal is read-only");
  }
  const f = fixture(); f.bytes.deniedRead = `${f.key}.lkg`;
  assert(await fails(f.backend.prepareImport(f.incoming)), "unreadable backup is not an empty current journey");
  assert(await fails(f.backend.snapshotForTransfer()), "unreadable data cannot be exported");
  assertEqual(f.bytes.writes, [], "denied access never replaces data");
  const futureCandidate = { ...f.incoming, schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
  assert(await fails(f.backend.prepareImport(futureCandidate), UnsupportedSaveVersionError), "a future incoming file is refused before storage is touched");
});

await suite("Save transfer: unresolved device choices and account destinations cannot be bypassed", async () => {
  const f = fixture(); const a = new LocalStorageBackend(f.bytes), b = new LocalStorageBackend(f.bytes);
  await a.load(); await b.load(); await a.save({ ...f.current, profileName: "First window", updatedAt: 500 });
  assert(await fails(b.save({ ...f.current, profileName: "Second window", updatedAt: 600 }), LocalSaveConflictError), "fixture earns an actual pending device choice");
  f.bytes.writes.length = 0;
  assert(await fails(f.backend.prepareImport(f.incoming), LocalSaveConflictError), "import cannot erase unresolved branches");
  assert(await fails(f.backend.snapshotForTransfer(), LocalSaveConflictError), "export cannot silently choose a conflicting branch");
  assertEqual(f.bytes.writes, [], "probes do not refresh or alter the pending record");
  const account = new LocalStorageBackend(f.bytes, "account-a");
  f.bytes.values.set(account.storageKey, JSON.stringify(journey("Scoped account journey")));
  assert(await fails(account.prepareImport(f.incoming), InvalidSaveError), "account progress cannot be an import destination");
  assert(await fails(account.commitImport("anything"), InvalidSaveError), "direct account commit is protected too");
  assertEqual((await account.snapshotForTransfer())?.profileName, "Scoped account journey", "validated account export reads only its own durable slot");
});

await suite("Save transfer: archive capacity and immutable archive collisions block all active replacement", async () => {
  const f = fixture(), preview = await f.backend.prepareImport(f.incoming);
  const original = f.bytes.getItem(f.key), backup = f.bytes.getItem(`${f.key}.lkg`);
  f.bytes.beforeWrite = key => { if (key.includes(".transfer.")) throw new Error("archive full"); };
  assert(await fails(f.backend.commitImport(preview.token)), "archive must acknowledge storage before import can replace progress");
  assertEqual([f.bytes.getItem(f.key), f.bytes.getItem(`${f.key}.lkg`)], [original, backup], "archive failure leaves primary and backup exact");
  f.bytes.beforeWrite = undefined;
  const selected = await f.backend.commitImport(preview.token);
  assertEqual(selected.profileName, f.incoming.profileName, "same issued choice can retry a storage failure");
  const collision = fixture(), other = await collision.backend.prepareImport(collision.incoming);
  collision.bytes.values.set(`${collision.key}.transfer.${other.token}`, "existing archive must not change");
  assert(await fails(collision.backend.commitImport(other.token), InvalidSaveError), "a distinct immutable record is not overwritten");
  assertEqual(collision.bytes.writes, [], "archive collision does not alter any active copy");
});

await suite("Save transfer: uncertain archive, primary and backup failures retry one unchanged transaction", async () => {
  for (const phase of ["archive-after", "primary-before", "primary-after", "backup-before", "backup-after"]) {
    const f = fixture(), preview = await f.backend.prepareImport(f.incoming);
    const original = f.bytes.getItem(f.key), oldBackup = f.bytes.getItem(`${f.key}.lkg`);
    let failed = false;
    const fail = (key: string, after: boolean) => {
      const match = phase === "archive-after" ? key.includes(".transfer.") && after :
        phase.startsWith("primary") ? key === f.key && after === phase.endsWith("after") : key === `${f.key}.lkg` && after === phase.endsWith("after");
      if (!failed && match) { failed = true; throw new Error("write outcome uncertain"); }
    };
    f.bytes.beforeWrite = key => fail(key, false); f.bytes.afterWrite = key => fail(key, true);
    assert(await fails(f.backend.commitImport(preview.token)), "selected write failure is reported rather than pretending success");
    if (phase.startsWith("primary") || phase === "archive-after") assertEqual(f.bytes.getItem(`${f.key}.lkg`), oldBackup, "backup is not rotated ahead of an acknowledged primary");
    if (phase === "archive-after" || phase === "primary-before") assertEqual(f.bytes.getItem(f.key), original, "pre-primary failure keeps current progress unchanged");
    const heldArchive = archive(f, preview.token);
    assertEqual([heldArchive.copies.primary, heldArchive.copies.backup], [original, oldBackup], "all originals remain separately preserved after failure");
    f.bytes.beforeWrite = undefined; f.bytes.afterWrite = undefined;
    const recovered = await f.backend.commitImport(preview.token);
    assertEqual(recovered, heldArchive.incoming, "retry retains the exact first planned time and candidate");
    assertEqual(f.bytes.getItem(f.key), f.bytes.getItem(`${f.key}.lkg`), "both active copies finish on the same imported journey");
    assertEqual(f.bytes.getItem(`${f.key}.transfer.${preview.token}`), JSON.stringify(heldArchive), "retry never changes archive content");
    if (phase === "archive-after") assertEqual(f.bytes.writes.filter(write => write.key.includes(".transfer.")).length, 2, "an unacknowledged archive is re-acknowledged before any active change");
    const writes = f.bytes.writes.length;
    assertEqual(await f.backend.commitImport(preview.token), recovered, "completed transaction replay is idempotent");
    assertEqual(f.bytes.writes.length, writes, "completed retry cannot make extra active writes");
  }
});

await suite("Save transfer: outside progress after a partial or completed import cannot be rolled back", async () => {
  for (const partial of [false, true]) {
    const f = fixture(), preview = await f.backend.prepareImport(f.incoming);
    if (partial) {
      f.bytes.beforeWrite = key => { if (key === `${f.key}.lkg`) throw new Error("backup unavailable"); };
      assert(await fails(f.backend.commitImport(preview.token)), "partial fixture stops after primary acknowledgement");
      f.bytes.beforeWrite = undefined;
    } else await f.backend.commitImport(preview.token);
    const next = journey("Later earned progress", Date.now() + 100);
    f.bytes.values.set(f.key, JSON.stringify(next));
    const writes = f.bytes.writes.length;
    assert(await fails(f.backend.commitImport(preview.token), InvalidSaveError), "old import confirmation cannot roll back a newer save");
    assertEqual(JSON.parse(f.bytes.getItem(f.key)!).profileName, next.profileName, "later progress remains intact");
    assertEqual(f.bytes.writes.length, writes, "stale retry does not write a conflict or another archive");
  }
  const f = fixture(), preview = await f.backend.prepareImport(f.incoming);
  await f.backend.commitImport(preview.token); f.bytes.values.delete(`${f.key}.transfer.${preview.token}`);
  assert(await fails(f.backend.commitImport(preview.token), InvalidSaveError), "lost or altered preservation records cannot silently count as a successful replay");
});

await suite("Save transfer: identical progress and invalid timestamp metadata remain explicit and safe", async () => {
  const f = fixture(), preview = await f.backend.prepareImport(f.current);
  const same = await f.backend.commitImport(preview.token);
  assertEqual({ ...same, updatedAt: f.current.updatedAt }, f.current, "same-save import changes no story, run or checkpoint data");
  assert(same.updatedAt > f.current.updatedAt, "explicit import still records a monotonic write");
  const bad = fixture(), candidate = { ...bad.incoming, updatedAt: Number.MAX_VALUE };
  const invalid = await bad.backend.prepareImport(candidate);
  assert(await fails(bad.backend.commitImport(invalid.token), InvalidSaveError), "unadvanceable time cannot create an unsafe imported revision");
  assertEqual(bad.bytes.writes, [], "bad revision metadata cannot cause partial preservation/replacement writes");
});

await suite("Save transfer export: an unsaved store cannot replace the durable account snapshot or trigger cloud work", async () => {
  const bytes = new Bytes(), cloud = new Cloud(), local = new LocalStorageBackend(bytes);
  cloud.user = "account-a"; const durable = journey("Acknowledged account journey");
  bytes.values.set(local.forUser(cloud.user).storageKey, JSON.stringify(durable)); cloud.rows.set(cloud.user, durable);
  const synced = new SyncedBackend(local, cloud, { cloudDelayMs: 60_000, loadTimeoutMs: 50 });
  await synced.load(); const store = new SaveStore(synced, durable, { saveDelayMs: 60_000 });
  store.update(state => { state.profileName = "Unflushed in-memory change"; });
  const before = { reads: cloud.reads, writes: cloud.writes, deviceWrites: bytes.writes.length };
  try {
    assertEqual(await synced.snapshotForTransfer(), durable, "export reads the validated acknowledged device snapshot, not the in-memory store");
    assertEqual({ reads: cloud.reads, writes: cloud.writes, deviceWrites: bytes.writes.length }, before, "export does not read cloud rows, flush, upload or mutate local bytes");
  } finally { await store.flush(); }
  const guestCloud = new Cloud(), guestBytes = new Bytes(), guestLocal = new LocalStorageBackend(guestBytes);
  const guest = journey("Offline guest"); guestBytes.values.set(guestLocal.storageKey, JSON.stringify(guest));
  const offline = new SyncedBackend(guestLocal, guestCloud, { loadTimeoutMs: 50 }); await offline.load(); guestCloud.offline = true;
  assertEqual(await offline.snapshotForTransfer(), guest, "offline guest export remains scoped to guest bytes");
  assertEqual([guestCloud.reads, guestCloud.writes, guestBytes.writes.length], [0, 0, 0], "offline guest export needs no account/cloud writes");
});

await suite("Save transfer export: cloud conflicts and identity changes before or after lock waits refuse exposure", async () => {
  const conflictBytes = new Bytes(), conflictCloud = new Cloud(), conflictLocal = new LocalStorageBackend(conflictBytes);
  conflictCloud.user = "account-a";
  conflictBytes.values.set(conflictLocal.forUser("account-a").storageKey, JSON.stringify(journey("Device branch")));
  conflictCloud.rows.set("account-a", journey("Cloud different run"));
  const conflicted = new SyncedBackend(conflictLocal, conflictCloud, { loadTimeoutMs: 50 });
  assert(await fails(conflicted.load(), SaveConflictError), "fixture has an actual unresolved cloud branch");
  assert(await fails(conflicted.snapshotForTransfer(), SaveConflictError), "export cannot silently choose one of those versions");
  for (const rebind of [false, true]) {
    const bytes = new Bytes(), cloud = new Cloud(); let hold = false;
    const queue: Array<() => void> = [];
    const lock: LocalSaveLock = { run<T>(_slot: string, work: () => T): Promise<T> {
      return hold ? new Promise<T>((resolve, reject) => queue.push(() => { try { resolve(work()); } catch (error) { reject(error); } })) : Promise.resolve().then(work);
    } };
    const local = new LocalStorageBackend(bytes, null, lock);
    for (const owner of ["account-a", "account-b"]) { const state = journey(owner); bytes.values.set(local.forUser(owner).storageKey, JSON.stringify(state)); cloud.rows.set(owner, state); }
    cloud.user = "account-a"; const synced = new SyncedBackend(local, cloud, { loadTimeoutMs: 50 }); await synced.load();
    hold = true; const pending = synced.snapshotForTransfer();
    for (let i = 0; i < 12 && !queue.length; i++) await Promise.resolve();
    assertEqual(queue.length, 1, "export actually waits on the original account's storage lock");
    cloud.user = "account-b";
    if (rebind) { hold = false; await synced.load(); }
    queue.shift()!();
    assert(await fails(pending, CloudSaveError), "neither switched identity nor cache rebinding can expose the old account snapshot");
    assertEqual(cloud.writes, 0, "guarding the export never uploads a journey");
  }
});
