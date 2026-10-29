// All storage/network work is injected. No browser globals, session, live
// Supabase client or player storage are involved in these regression cases.
import { assert, assertEqual, suite } from "./_assert";
import {
  emptySave, migrate, SaveStore, LocalStorageBackend, SyncedBackend,
  SupabaseBackend, InvalidSaveError, UnsupportedSaveVersionError,
  SaveConflictError, LocalSaveConflictError, CloudSaveError, CURRENT_SCHEMA_VERSION,
  type SaveState, type SaveBackend, type StoragePort, type CloudSaveBackend, type LocalSaveLock,
} from "../src/game/saveState";
import { resetSave } from "../src/game/resetSave";
import type { SupabaseClient } from "@supabase/supabase-js";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const state = (name: string, updatedAt: number): SaveState => ({ ...emptySave(name), runId: "test-run", updatedAt });
const sleep = (ms = 10): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function rejects(work: Promise<unknown>, type: new (...args: never[]) => Error): Promise<boolean> {
  try { await work; return false; } catch (error) { return error instanceof type; }
}
class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
class FakeCloud implements CloudSaveBackend {
  user: string | null = "account-a";
  rows = new Map<string, SaveState>();
  reads = 0;
  writes: { owner: string; state: SaveState }[] = [];
  readError: Error | null = null;
  writeError: Error | null = null;
  beforeWrite?: () => Promise<void>;
  async currentUserId(): Promise<string | null> { return this.user; }
  async load(owner = this.user ?? ""): Promise<SaveState | null> {
    this.reads++;
    if (this.readError) throw this.readError;
    return this.rows.has(owner) ? copy(this.rows.get(owner)!) : null;
  }
  async save(value: SaveState, owner = this.user ?? ""): Promise<void> {
    if (owner !== this.user) throw new CloudSaveError("Account changed");
    await this.beforeWrite?.();
    if (this.writeError) throw this.writeError;
    this.writes.push({ owner, state: copy(value) });
    this.rows.set(owner, copy(value));
  }
  async saveIfUnchanged(value: SaveState, observed: SaveState | null, owner = this.user ?? ""): Promise<boolean> {
    if (owner !== this.user) throw new CloudSaveError("Account changed");
    await this.beforeWrite?.();
    if (this.writeError) throw this.writeError;
    const current = this.rows.get(owner) ?? null;
    if (JSON.stringify(current && migrate(current)) !== JSON.stringify(observed && migrate(observed))) return false;
    this.writes.push({ owner, state: copy(value) });
    this.rows.set(owner, copy(value));
    return true;
  }
}

/** A minimal database port, not a game implementation. UPDATE checks the
 * server revision filter atomically; INSERT enforces the existing primary key. */
function supabaseFixture() {
  let row: SaveState | null = null;
  let revision = 0;
  let readFailure = false;
  let writeFailure = false;
  const operations: string[] = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "account-a" } } }, error: null }) },
    from: () => {
      let operation = "read";
      let value: SaveState | null = null;
      const filters = new Map<string, unknown>();
      const query = {
        select: () => query,
        eq: (key: string, v: unknown) => { filters.set(key, v); return query; },
        abortSignal: () => query,
        insert: (payload: { state: SaveState }) => { operation = "insert"; value = payload.state; return query; },
        update: (payload: { state: SaveState }) => { operation = "update"; value = payload.state; return query; },
        maybeSingle: async () => {
          operations.push(operation);
          if ((operation === "read" && readFailure) || (operation !== "read" && writeFailure)) {
            return { data: null, error: { code: "test", message: "simulated refusal" } };
          }
          if (operation === "insert" && row) return { data: null, error: { code: "23505" } };
          if (operation === "update" && (!row || filters.get("updated_at") !== `server-${revision}`)) {
            return { data: null, error: null };
          }
          if (operation !== "read") { row = copy(value!); revision++; }
          return { data: row ? { state: copy(row), updated_at: `server-${revision}` } : null, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, operations, get: () => copy(row),
    set: (value: SaveState | null) => { row = copy(value); revision++; },
    failRead: (value: boolean) => { readFailure = value; },
    failWrite: (value: boolean) => { writeFailure = value; } };
}
function fixture() {
  const storage = new MemoryStorage();
  const local = new LocalStorageBackend(storage);
  const cloud = new FakeCloud();
  const synced = new SyncedBackend(local, cloud, { cloudDelayMs: 60_000 });
  return { storage, local, cloud, synced, account: local.forUser("account-a") };
}

await suite("saveSync: newer offline progress survives an older cloud row", async () => {
  const { account, cloud, synced } = fixture();
  await account.save(state("New offline", 200));
  cloud.rows.set("account-a", state("Old cloud", 100));
  assertEqual((await synced.load())?.profileName, "New offline", "newest whole snapshot selected");
  await synced.flush();
  assertEqual(cloud.writes[0].state.profileName, "New offline", "new progress synced upward");
});

await suite("saveSync: failed reads never mean an absent cloud save", async () => {
  const { account, cloud, synced } = fixture();
  await account.save(state("Old local", 100));
  cloud.rows.set("account-a", state("New cloud", 200));
  cloud.readError = new CloudSaveError();
  assertEqual((await synced.load())?.profileName, "Old local", "offline play loads safe local copy");
  await synced.save(state("Local play continued", 150));
  assert(await rejects(synced.flush(), CloudSaveError), "cloud failure visible to caller");
  assertEqual(cloud.writes.length, 0, "no upload after failed read");
  cloud.readError = null;
  assert(await rejects(synced.flush(), SaveConflictError), "newer cloud protected after reconnect");
  assertEqual(cloud.writes.length, 0, "newer cloud never overwritten by offline fallback");
  assertEqual((await account.load())?.profileName, "Local play continued", "local fallback retained");
});

await suite("saveSync: account caches are separate and guests require explicit import", async () => {
  const { local, account, cloud, synced } = fixture();
  await local.save(state("Unassigned legacy guest", 100));
  await account.save(state("Account A", 200));
  cloud.user = "account-b";
  assertEqual(await synced.load(), null, "new B account cannot inherit A or guest data");
  await synced.flush();
  assertEqual(cloud.writes.length, 0, "no automatic guest upload");
  const imported = await synced.importGuestSave();
  assertEqual(imported?.profileName, "Unassigned legacy guest", "explicit import succeeds for empty B");
  assertEqual(cloud.writes[0].owner, "account-b", "import bound to intended account");
  assertEqual((await account.load())?.profileName, "Account A", "A stays intact");
  assertEqual((await local.load())?.profileName, "Unassigned legacy guest", "legacy guest stays intact");
  assert(await rejects(synced.importGuestSave(), SaveConflictError), "cannot import over existing account progress");
});

await suite("saveSync: successful cloud read refreshes the account's offline copy", async () => {
  const { account, cloud, synced } = fixture();
  await account.save(state("Old local", 100));
  cloud.rows.set("account-a", state("New cloud", 200));
  assertEqual((await synced.load())?.profileName, "New cloud", "cloud wins when newer");
  assertEqual((await account.load())?.profileName, "New cloud", "new cloud cached durably");
  await synced.flush();
  assertEqual(cloud.writes.length, 0, "unchanged cloud is not rewritten");
});

await suite("saveSync: divergent branch choices preserve both saves", async () => {
  const { account, cloud, synced } = fixture();
  const local = { ...state("Local", 200), realms: { "winter-mountain": { cleared: false, choices: { fork1: "huntress" } } } };
  const remote = { ...state("Cloud", 100), realms: { "winter-mountain": { cleared: false, choices: { fork1: "firefly" } } } };
  await account.save(local); cloud.rows.set("account-a", remote);
  assert(await rejects(synced.load(), SaveConflictError), "incompatible choices require a decision");
  assertEqual((await account.load())?.realms, local.realms, "local branch intact");
  assertEqual(cloud.rows.get("account-a")?.realms, remote.realms, "cloud branch intact");
});

await suite("saveSync: cloud writes coalesce and await a serial network queue", async () => {
  const { account, cloud, synced } = fixture();
  await synced.load();
  await synced.save(state("One", 1)); await synced.save(state("Two", 2)); await synced.save(state("Three", 3));
  assertEqual(cloud.writes.length, 0, "keystrokes do not each upload");
  const gate = deferred(); let started = 0; let active = 0; let maxActive = 0;
  cloud.beforeWrite = async () => { started++; active++; maxActive = Math.max(maxActive, active); if (started === 1) await gate.promise; active--; };
  const first = synced.flush(); await sleep();
  await synced.save(state("Four", 4)); const second = synced.flush(); await sleep();
  assertEqual(started, 1, "second request waits for first");
  gate.resolve(); await Promise.all([first, second]);
  assertEqual(maxActive, 1, "no overlapping network writers");
  assertEqual(cloud.writes.map((v) => v.state.profileName), ["Three", "Four"], "latest state uploads in order");
  assertEqual((await account.load())?.profileName, "Four", "latest local already durable");
});

await suite("saveSync: account switches cannot upload old state to the new user", async () => {
  const { account, cloud, synced, local } = fixture();
  await synced.load(); await synced.save(state("A play", 100)); cloud.user = "account-b";
  assert(await rejects(synced.flush(), CloudSaveError), "changed account blocks pending write");
  assertEqual(cloud.writes.length, 0, "no cross-account upload");
  assertEqual((await account.load())?.profileName, "A play", "A has durable progress");
  assertEqual(await local.forUser("account-b").load(), null, "B local save untouched");
});

await suite("saveSync: corrupt primary recovers backup without copying corrupt bytes", async () => {
  const { local, storage } = fixture();
  await local.save(state("First", 100)); await local.save(state("Second", 200));
  const backup = storage.getItem(`${local.storageKey}.lkg`);
  storage.setItem(local.storageKey, "{broken");
  assertEqual((await local.load())?.profileName, "First", "last valid snapshot recovered");
  await local.save(state("Recovered", 300));
  assertEqual(storage.getItem(`${local.storageKey}.lkg`), backup, "good backup not replaced by corrupt primary");
  storage.setItem(local.storageKey, '{"satchel":null}'); storage.setItem(`${local.storageKey}.lkg`, "also broken");
  assert(await rejects(local.load(), InvalidSaveError), "unrecoverable corruption never becomes new game");
});

await suite("saveSync: future saves are refused on both load and write", async () => {
  const { local, storage } = fixture();
  const future = JSON.stringify({ ...emptySave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
  storage.setItem(local.storageKey, future);
  assert(await rejects(local.load(), UnsupportedSaveVersionError), "future primary blocks load");
  assert(await rejects(local.save(emptySave()), UnsupportedSaveVersionError), "old build cannot overwrite future save");
  assertEqual(storage.getItem(local.storageKey), future, "future bytes remain unchanged");
});

await suite("saveSync: auth timeout exposes only guest data and causes no late writes", async () => {
  const { local, account, cloud } = fixture();
  await account.save(state("Offline A", 100)); await local.save(state("Guest", 50));
  const gate = deferred(); cloud.currentUserId = async () => { await gate.promise; return "account-a"; };
  const synced = new SyncedBackend(local, cloud, { loadTimeoutMs: 1, cloudDelayMs: 60_000 });
  assertEqual((await synced.load())?.profileName, "Guest", "unknown identity never exposes an account cache");
  assertEqual((await account.load())?.profileName, "Offline A", "account cache preserved separately");
  gate.resolve(); await sleep();
  assertEqual(cloud.writes.length, 0, "late auth resolution does not mutate cloud");
});

await suite("saveSync: Supabase error results reject rather than pretending to save", async () => {
  const db = supabaseFixture();
  const backend = new SupabaseBackend(async () => db.client);
  db.failRead(true);
  assert(await rejects(backend.load(), CloudSaveError), "failed select differs from missing row");
  db.failRead(false);
  assertEqual(await backend.load(), null, "only successful empty select means no row");
  db.failWrite(true);
  assert(await rejects(backend.saveIfUnchanged(emptySave(), null), CloudSaveError), "returned insert error rejects");
  db.failWrite(false);
  await backend.save(emptySave());
});

await suite("saveStore: checkpoints clone inputs and flush pending writes before exit", async () => {
  const writes: SaveState[] = [];
  const backend: SaveBackend = { load: async () => null, save: async (value) => { writes.push(copy(value)); } };
  const store = new SaveStore(backend, emptySave(), { saveDelayMs: 60_000 });
  const checkpoint = { scene: "OpeningScene" as const, step: "identity", data: { idx: 1 } };
  store.setCheckpoint(checkpoint); checkpoint.data.idx = 99;
  assertEqual(store.get().checkpoint?.data.idx, 1, "caller cannot mutate checkpoint behind store");
  await store.flush();
  assertEqual(writes[0].checkpoint?.step, "identity", "checkpoint durable immediately on flush");
  store.clearCheckpoint(); await store.flush();
  assertEqual(writes[1].checkpoint, null, "clear durable");
});

await suite("saveStore: failed autosaves are surfaced, retained and retryable", async () => {
  let fail = true; let saved: SaveState | null = null; let notices = 0;
  const backend: SaveBackend = { load: async () => null, save: async (value) => { if (fail) throw new Error("Disk full"); saved = copy(value); } };
  const store = new SaveStore(backend, emptySave(), { saveDelayMs: 0, onError: () => { notices++; } });
  store.update((value) => { value.profileName = "Keep me"; });
  await sleep();
  assertEqual(store.getLastError()?.message, "Disk full", "autosave failure inspectable");
  assert(notices > 0, "UI receives error event");
  assertEqual(store.get().profileName, "Keep me", "in-memory progress kept");
  fail = false; await store.flush();
  assertEqual((saved as SaveState | null)?.profileName, "Keep me", "explicit retry saves retained state");
  assertEqual(store.getLastError(), null, "success clears failure");
});

await suite("saveStore: serialized immutable local writes cannot finish out of order", async () => {
  const gate = deferred(); let calls = 0; const writes: SaveState[] = [];
  const backend: SaveBackend = { load: async () => null, save: async (value) => { calls++; if (calls === 1) await gate.promise; writes.push(copy(value)); } };
  const store = new SaveStore(backend, emptySave(), { saveDelayMs: 60_000 });
  store.update((value) => { value.profileName = "One"; }); const first = store.flush(); await sleep();
  store.update((value) => { value.profileName = "Two"; }); const second = store.flush(); await sleep();
  assertEqual(calls, 1, "second local write waits"); gate.resolve(); await Promise.all([first, second]);
  assertEqual(writes.map((v) => v.profileName), ["One", "Two"], "snapshots immutable and ordered");
  assertEqual(migrate(writes[1]).schemaVersion, CURRENT_SCHEMA_VERSION, "saved state current and valid");
});


await suite("saveSync: explicit conflict choices preserve both originals and remain loadable", async () => {
  const { account, cloud, synced, storage } = fixture();
  const local = { ...state("Local branch", 200), realms: { "winter-mountain": { cleared: false, choices: { fork1: "huntress" } } } };
  const remote = { ...state("Cloud branch", 100), realms: { "winter-mountain": { cleared: false, choices: { fork1: "firefly" } } } };
  await account.save(local); cloud.rows.set("account-a", remote);
  assert(await rejects(synced.load(), SaveConflictError), "branch choice presented");
  const choice = synced.getConflict();
  assertEqual(choice?.local.profileName, "Local branch", "local summary accessible");
  assertEqual(choice?.cloud.profileName, "Cloud branch", "cloud summary accessible");
  choice!.local.profileName = "Mutated copy";
  assertEqual(synced.getConflict()?.local.profileName, "Local branch", "summary cannot mutate retained alternatives");
  const selected = await synced.resolveConflict("cloud");
  assertEqual(selected.profileName, "Cloud branch", "explicit selection used");
  assertEqual(synced.getConflict(), null, "choice cleared after success");
  const backups = [...storage.values.entries()].filter(([key]) => key.includes(".conflict."));
  assertEqual(backups.length, 2, "both original alternatives preserved permanently");
  assert(backups.some(([, raw]) => JSON.parse(raw).profileName === "Local branch"), "unchosen local recoverable");
  assertEqual((await synced.load())?.profileName, "Cloud branch", "next load does not re-enter conflict loop");
  await synced.flush();
});

await suite("saveSync: different runs on boot require an explicit choice despite local clocks", async () => {
  const { account, cloud, synced } = fixture();
  const old = { ...state("Old run", 100), realms: { "winter-mountain": { cleared: true, choices: { fork1: "huntress" } } } };
  const next = { ...state("New run", 200), runId: "new-run", realms: { "winter-mountain": { cleared: false, choices: { fork1: "firefly" } } } };
  await account.save(next); cloud.rows.set("account-a", old);
  assert(await rejects(synced.load(), SaveConflictError), "different runs do not auto-supersede each other by timestamp");
  assertEqual(cloud.rows.get("account-a")?.runId, old.runId, "cloud run is untouched before selection");
  assertEqual((await account.load())?.runId, next.runId, "device run remains available");
  await synced.resolveConflict("local");
  assertEqual(cloud.rows.get("account-a")?.runId, "new-run", "explicit local choice propagates");
});

await suite("saveSync: cloud failures retain newest progress for explicit retry", async () => {
  const { cloud, synced, account } = fixture();
  await synced.load();
  cloud.writeError = new CloudSaveError();
  await synced.save(state("First", 100));
  assert(await rejects(synced.flush(), CloudSaveError), "failed upload reaches caller");
  assert(synced.getLastError() instanceof CloudSaveError, "background status exposes cloud failure");
  assertEqual((await account.load())?.profileName, "First", "local commit survives failed upload");
  await synced.save(state("Newest", 200)); cloud.writeError = null;
  await synced.flush();
  assertEqual(cloud.writes.map((write) => write.state.profileName), ["Newest"], "retry coalesces to newest snapshot");
  assertEqual(synced.getLastError(), null, "successful retry clears cloud failure");
});

await suite("saveSync: an older failed in-flight write cannot be replayed after a newer success", async () => {
  const { cloud, synced } = fixture();
  await synced.load();
  const gate = deferred(); let started = 0;
  cloud.beforeWrite = async () => { started++; if (started === 1) { await gate.promise; throw new CloudSaveError(); } };
  await synced.save(state("Old", 100));
  const first = synced.flush().catch(() => {}); await sleep();
  await synced.save(state("New", 200)); const second = synced.flush(); await sleep();
  gate.resolve(); await Promise.all([first, second]);
  await synced.flush();
  assertEqual(cloud.writes.map((write) => write.state.profileName), ["New"], "old failure never requeued behind new success");
  assertEqual(cloud.rows.get("account-a")?.profileName, "New", "newest cloud retained");
});

await suite("saveSync: newer cloud formats never fall back to an overwriting local upload", async () => {
  const { account, cloud, synced } = fixture();
  await account.save(state("Older format", 100));
  cloud.rows.set("account-a", { ...state("Future", 200), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
  assert(await rejects(synced.load(), UnsupportedSaveVersionError), "unsupported cloud format blocks load safely");
  assertEqual(cloud.writes.length, 0, "future cloud untouched");
  assertEqual((await account.load())?.profileName, "Older format", "local remains available for recovery");
});

await suite("saveSync: undecided legacy chapter placeholders are not branch conflicts", async () => {
  const { account, cloud, synced } = fixture();
  const old = {
    ...state("Old checkpoint", 100), typewriterAwakened: true,
    realms: { "winter-mountain": { cleared: false, choices: { fox: "ignored", fork1: "none", fork2: "none" } } },
    checkpoint: { scene: "WinterMountainScene" as const, step: "fox", data: { foxDecided: false } },
  };
  const newer = {
    ...state("Made a choice", 200), typewriterAwakened: true,
    realms: { "winter-mountain": { cleared: false, choices: { fox: "spared", fork1: "huntress" } } },
  };
  await account.save(newer); cloud.rows.set("account-a", old);
  assertEqual((await synced.load())?.profileName, "Made a choice", "resolved choice supersedes explicit undecided placeholders");
  await synced.flush();
  assertEqual(cloud.rows.get("account-a")?.realms["winter-mountain"].choices.fox, "spared", "decided fox path retained");
});

await suite("saveSync: another device's progress after successful boot is never blindly overwritten", async () => {
  const { account, cloud, synced } = fixture();
  const original = state("Shared start", 100);
  await account.save(original); cloud.rows.set("account-a", original);
  await synced.load();
  const remote = { ...state("Other device", 200), realms: { "winter-mountain": { cleared: false, choices: { fork1: "firefly" } } } };
  cloud.rows.set("account-a", remote);
  const local = { ...state("Current device", 300), realms: { "winter-mountain": { cleared: false, choices: { fork1: "huntress" } } } };
  await synced.save(local);
  assert(await rejects(synced.flush(), SaveConflictError), "post-boot cloud advancement needs a choice");
  assertEqual(cloud.rows.get("account-a")?.profileName, "Other device", "remote advancement remains intact");
  assertEqual((await account.load())?.profileName, "Current device", "local advancement remains durable");
  assertEqual(synced.getConflict()?.cloud.profileName, "Other device", "updated alternative available to recovery UI");
});

await suite("saveSync: an old run with a later timestamp cannot replace a newer run", async () => {
  const { account, cloud, synced } = fixture();
  await account.save({ ...state("Stale device continued", 500), runId: "old-run" });
  const newRun = { ...state("New journey", 200), runId: "new-run" };
  cloud.rows.set("account-a", newRun);
  assert(await rejects(synced.load(), SaveConflictError), "clock recency does not establish run ancestry");
  assertEqual(cloud.rows.get("account-a")?.runId, "new-run", "new journey is not silently rolled back");
  assertEqual(cloud.writes.length, 0, "no automatic overwrite queued");
});

await suite("saveSync: later offline typing cannot roll back another device's completed chapter", async () => {
  const { account, cloud, synced } = fixture();
  const local = { ...state("Earlier checkpoint, later clock", 500), typewriterAwakened: true,
    checkpoint: { scene: "WinterMountainScene" as const, step: "trail", data: { index: 1 } } };
  const remote = { ...state("Realm completed elsewhere", 200), typewriterAwakened: true,
    realms: { "winter-mountain": { cleared: true, choices: { fork1: "huntress", fork2: "bury" } } },
    satchel: ["hunters-horn", "cairn-token"], almanacLore: ["wayshrine-runes"] };
  await account.save(local); cloud.rows.set("account-a", remote);
  assert(await rejects(synced.load(), SaveConflictError), "incomparable progress requires a choice even without contradictory answers");
  assertEqual(cloud.rows.get("account-a")?.realms["winter-mountain"].cleared, true, "completed realm and rewards remain in cloud");
  assertEqual((await account.load())?.checkpoint?.step, "trail", "offline chapter is preserved separately");
});

await suite("saveSync: reconnect from an unverified read also protects completed remote progress", async () => {
  const { account, cloud, synced } = fixture();
  const local = { ...state("Offline typing", 500), typewriterAwakened: true };
  await account.save(local);
  cloud.rows.set("account-a", { ...state("Remote finished", 200), typewriterAwakened: true,
    realms: { "winter-mountain": { cleared: true, choices: {} } } });
  cloud.readError = new CloudSaveError();
  await synced.load();
  await synced.save(local);
  cloud.readError = null;
  assert(await rejects(synced.flush(), SaveConflictError), "failed initial read does not authorize a progress rollback");
  assertEqual(cloud.writes.length, 0, "cloud completion not replaced by the later offline clock");
});

await suite("saveSync: explicit reset based on the unchanged observed cloud can start a new run", async () => {
  const { account, cloud, synced } = fixture();
  const original = state("Completed journey", 100);
  await account.save(original); cloud.rows.set("account-a", original);
  await synced.load();
  const fresh = { ...state("Fresh start", 200), runId: "deliberate-new-run" };
  await synced.save(fresh); await synced.flush();
  assertEqual(cloud.rows.get("account-a")?.runId, "deliberate-new-run", "intentional in-session reset remains supported");
  assertEqual(synced.getConflict(), null, "unchanged base needs no redundant choice");
});

await suite("saveSync: a race between remote comparison and write is caught atomically", async () => {
  const { account, cloud, synced } = fixture();
  const original = state("Shared start", 100);
  await account.save(original); cloud.rows.set("account-a", original);
  await synced.load();
  cloud.beforeWrite = async () => { cloud.rows.set("account-a", state("Concurrent winner", 250)); };
  await synced.save(state("Current device", 300));
  assert(await rejects(synced.flush(), SaveConflictError), "compare-and-write detects the interleaved remote write");
  assertEqual(cloud.rows.get("account-a")?.profileName, "Concurrent winner", "winner is not overwritten between read and update");
  assertEqual(cloud.writes.length, 0, "guard rejected this writer");
});

await suite("saveSync: concurrent first cloud creation cannot be overwritten by upsert", async () => {
  const { cloud, synced } = fixture();
  await synced.load();
  cloud.beforeWrite = async () => { cloud.rows.set("account-a", state("Other first save", 200)); };
  await synced.save(state("This first save", 300));
  assert(await rejects(synced.flush(), SaveConflictError), "new row creation has an absence guard");
  assertEqual(cloud.rows.get("account-a")?.profileName, "Other first save", "other device's newly created row survives");
});

await suite("Supabase guarded save: server revision rejects update after an intervening write", async () => {
  const db = supabaseFixture();
  db.set(state("Original", 100));
  const backend = new SupabaseBackend(async () => db.client);
  const observed = await backend.load("account-a");
  db.set(state("Another writer", 200));
  assertEqual(await backend.saveIfUnchanged(state("Stale writer", 300), observed, "account-a"), false,
    "UPDATE filter rejects the obsolete server revision");
  assertEqual(db.get()?.profileName, "Another writer", "conditional UPDATE leaves the existing state untouched");
  const latest = await backend.load("account-a");
  assert(await backend.saveIfUnchanged(state("Chosen continuation", 400), latest, "account-a"), "fresh revision can update");
  assertEqual(db.get()?.profileName, "Chosen continuation", "accepted state reaches the row");
});

await suite("Supabase guarded save: unique-key INSERT preserves a concurrently created row", async () => {
  const db = supabaseFixture();
  const backend = new SupabaseBackend(async () => db.client);
  const observed = await backend.load("account-a");
  assertEqual(observed, null, "initial observation is absent");
  db.set(state("Concurrent first save", 100));
  assertEqual(await backend.saveIfUnchanged(state("Later creator", 200), observed, "account-a"), false,
    "duplicate-key conflict becomes a recoverable choice");
  assertEqual(db.get()?.profileName, "Concurrent first save", "INSERT never replaces the concurrent row");
  assertEqual(db.operations, ["read", "insert"], "adapter uses INSERT, never a clobbering upsert");
});

await suite("Supabase direct save: legacy adapter use cannot replace a newer journey", async () => {
  const db = supabaseFixture();
  db.set({ ...state("New journey", 200), runId: "new-run" });
  const backend = new SupabaseBackend(async () => db.client);
  assert(await rejects(backend.save({ ...state("Old device", 500), runId: "old-run" }), SaveConflictError),
    "direct SaveBackend usage also requires a save choice");
  assertEqual(db.get()?.profileName, "New journey", "existing cloud state preserved");
});

await suite("device saves: a stale guest window cannot erase a completed chapter or its backup", async () => {
  const storage = new MemoryStorage(), cloud = new FakeCloud(); cloud.user = null;
  const seed = new LocalStorageBackend(storage), initial = state("Shared guest", 100);
  initial.typewriterAwakened = true; initial.realms["winter-mountain"] = { cleared: false, choices: {} };
  await seed.save(initial);
  const backendA = new SyncedBackend(new LocalStorageBackend(storage), cloud);
  const backendB = new SyncedBackend(new LocalStorageBackend(storage), cloud);
  const backendC = new SyncedBackend(new LocalStorageBackend(storage), cloud);
  const a = await SaveStore.load(backendA), b = await SaveStore.load(backendB), c = await SaveStore.load(backendC);
  a.update(s => { s.realms["winter-mountain"].cleared = true; s.realms["winter-mountain"].choices.fork1 = "huntress"; s.satchel.push("hunters-horn"); });
  await a.flush();
  const primary = storage.getItem(seed.storageKey), backup = storage.getItem(`${seed.storageKey}.lkg`);
  b.recordKeystroke("x", true);
  assert(await rejects(b.flush(), LocalSaveConflictError), "stale guest write becomes a recoverable device choice");
  assert(b.getLastError() instanceof LocalSaveConflictError, "SaveStore exposes the real conflict to pause/error UI");
  assertEqual([storage.getItem(seed.storageKey), storage.getItem(`${seed.storageKey}.lkg`)], [primary, backup], "neither primary nor last-known-good is touched by the first stale write");
  const choice = backendB.getConflict()!;
  assertEqual([choice.kind, choice.local.keyStats.x.hits, choice.cloud.realms["winter-mountain"].cleared, choice.cloud.satchel.includes("hunters-horn")], ["device", 1, true, true], "both the blocked session and earned durable chapter are recoverable");
  b.recordKeystroke("x", true);
  assert(await rejects(b.flush(), LocalSaveConflictError), "the stale window's second write is still blocked");
  assertEqual(backendB.getConflict()!.local.keyStats.x.hits, 2, "the same conflicting window updates only its bounded incoming recovery snapshot");
  assertEqual([storage.getItem(seed.storageKey), storage.getItem(`${seed.storageKey}.lkg`)], [primary, backup], "a second stale autosave cannot rotate away the earned chapter");
  const pair = storage.getItem(`${seed.storageKey}.device-conflict.pending`);
  c.update(s => { s.profileName = "Third window stays open"; });
  assert(await rejects(c.flush(), Error), "a third writer is visibly blocked while another pair awaits a choice");
  assert(!(c.getLastError() instanceof SaveConflictError), "third-window new progress is not falsely described as a durably preserved choice");
  assertEqual(c.get().profileName, "Third window stays open", "the third writer retains its new in-memory progress");
  assertEqual(storage.getItem(`${seed.storageKey}.device-conflict.pending`), pair, "the third writer cannot replace either existing recovery alternative");
  assertEqual(storage.values.size, 3, "repeated blocked writes create one fixed pending slot rather than timestamped history");
  assertEqual(cloud.writes, [], "guest conflict handling never calls cloud writes");
});

await suite("device saves: explicit recovery preserves both alternatives across reload and later autosaves", async () => {
  for (const source of ["local", "cloud"] as const) {
    const storage = new MemoryStorage(), a = new LocalStorageBackend(storage), b = new LocalStorageBackend(storage);
    await a.save(state("Base", 100)); await b.load();
    const current = { ...state("Earned on device", 200), satchel: ["hunters-horn"] };
    const incoming = { ...state("Blocked window", 300), satchel: ["lantern"] };
    await a.save(current);
    assert(await rejects(b.save(incoming), LocalSaveConflictError), "independent stale writer requires a decision");
    const titleBackend = new LocalStorageBackend(storage);
    assert(await rejects(titleBackend.load(), LocalSaveConflictError), "a genuine reload exposes the preserved choice instead of silently choosing primary");
    assertEqual(titleBackend.getConflict(), { kind: "device", local: incoming, cloud: current }, "incoming and device labels survive backend recreation");
    const selected = await titleBackend.resolveConflict(source);
    assertEqual(selected.profileName, source === "local" ? incoming.profileName : current.profileName, "only the explicitly selected journey becomes primary");
    assert(selected.updatedAt > incoming.updatedAt && selected.updatedAt > current.updatedAt, "chosen snapshot has a fresh monotonic timestamp");
    assertEqual(titleBackend.getLastDeviceRecovery(), { kind: "device", local: incoming, cloud: current }, "the nonselected alternative remains in a separate fixed recovery archive");
    assertEqual(titleBackend.getConflict(), null, "resolved choice no longer blocks loading");
    for (let i = 0; i < 3; i++) await titleBackend.save({ ...selected, profileName: `Continued ${i}`, updatedAt: selected.updatedAt + i + 1 });
    assertEqual(titleBackend.getLastDeviceRecovery(), { kind: "device", local: incoming, cloud: current }, "ordinary successful autosaves cannot rotate away the nonselected journey");
    assertEqual((await new LocalStorageBackend(storage).load())?.profileName, "Continued 2", "the selected journey remains normally loadable");
    assertEqual(storage.values.size, 4, "local conflict retention has a fixed primary, backup, pending and previous footprint");
  }
});

await suite("device saves: a changed primary refreshes recovery choices before any selected overwrite", async () => {
  const storage = new MemoryStorage(), a = new LocalStorageBackend(storage), b = new LocalStorageBackend(storage);
  await a.save(state("Base", 100)); await b.load(); await a.save(state("First device version", 200));
  await rejects(b.save(state("Blocked incoming", 300)), LocalSaveConflictError);
  const later = state("A later external write", 400);
  storage.setItem(a.storageKey, JSON.stringify(later));
  const backup = storage.getItem(`${a.storageKey}.lkg`);
  assert(await rejects(b.resolveConflict("local"), LocalSaveConflictError), "a write made while the modal was open requires another informed choice");
  assertEqual([storage.getItem(a.storageKey), storage.getItem(`${a.storageKey}.lkg`)], [JSON.stringify(later), backup], "the stale selection changes neither the new primary nor its backup");
  assertEqual([b.getConflict()!.local.profileName, b.getConflict()!.cloud.profileName], ["Blocked incoming", later.profileName], "refreshed choices preserve the incoming journey and show current device progress");
  assertEqual((await b.resolveConflict("cloud")).profileName, later.profileName, "a second explicit decision can safely keep the refreshed durable journey");
  assertEqual(b.getLastDeviceRecovery()!.local.profileName, "Blocked incoming", "the original incoming journey remains recoverable after the refreshed choice");
});

await suite("device saves: cooperating asynchronous writers share a per-slot critical section", async () => {
  const storage = new MemoryStorage(), tails = new Map<string, Promise<void>>();
  let active = 0, maximum = 0;
  const lock: LocalSaveLock = { run<T>(slot: string, work: () => T): Promise<T> {
    const task = (tails.get(slot) ?? Promise.resolve()).then(async () => {
      active++; maximum = Math.max(maximum, active);
      await sleep(1);
      try { return work(); } finally { active--; }
    });
    tails.set(slot, task.then(() => {}, () => {}));
    return task;
  } };
  // Independent port objects model separate windows over the same bytes. The
  // injected origin-wide lock models Web Locks, not a fake atomic setItem.
  const port = (): StoragePort => ({ getItem: key => storage.getItem(key), setItem: (key, value) => storage.setItem(key, value) });
  const a = new LocalStorageBackend(port(), null, lock), b = new LocalStorageBackend(port(), null, lock);
  await a.save(state("Base", 100)); await Promise.all([a.load(), b.load()]);
  const results = await Promise.allSettled([a.save(state("Writer A", 200)), b.save(state("Writer B", 300))]);
  assertEqual(maximum, 1, "no two origin-wide critical sections overlap");
  assertEqual(results.map(result => result.status), ["fulfilled", "rejected"], "the first writer succeeds and the second observes its changed revision");
  assertEqual(JSON.parse(storage.getItem(a.storageKey)!).profileName, "Writer A", "the first committed write is not lost to async scheduling");
  assertEqual(JSON.parse(storage.getItem(`${a.storageKey}.lkg`)!).profileName, "Base", "the rejected writer cannot replace the backup");
  assertEqual(b.getConflict()!.local.profileName, "Writer B", "the blocked simultaneous writer has a reachable recovery alternative");
});

await suite("device saves: legitimate serial writes, legacy migration and own reset keep working", async () => {
  const storage = new MemoryStorage(), backend = new LocalStorageBackend(storage);
  storage.setItem(backend.storageKey, JSON.stringify({ profileName: "Legacy", typewriterAwakened: true, realms: {}, updatedAt: 100 }));
  const own = await SaveStore.load(backend), stale = await SaveStore.load(new LocalStorageBackend(storage));
  own.recordKeystroke("a", true); await own.flush(); own.recordKeystroke("a", true); await own.flush();
  assertEqual((await backend.load())?.keyStats.a.hits, 2, "own successive writes do not conflict with themselves");
  assertEqual(JSON.parse(storage.getItem(backend.storageKey)!).schemaVersion, CURRENT_SCHEMA_VERSION, "legacy raw bytes migrate safely on a guarded first write");
  const oldRun = own.get().runId; resetSave(own); await own.flush();
  const resetRaw = storage.getItem(backend.storageKey), resetBackup = storage.getItem(`${backend.storageKey}.lkg`);
  assert(own.get().runId !== oldRun && !own.get().typewriterAwakened, "an intentional reset by the current writer establishes a fresh run");
  stale.recordKeystroke("b", true);
  assert(await rejects(stale.flush(), LocalSaveConflictError), "the old window cannot revive a pre-reset journey even with a later local timestamp");
  assertEqual([storage.getItem(backend.storageKey), storage.getItem(`${backend.storageKey}.lkg`)], [resetRaw, resetBackup], "both reset primary and backup survive the stale old run");
});

await suite("device saves: account isolation and selected recovery cannot upload an unselected queued branch", async () => {
  const storage = new MemoryStorage(), cloud = new FakeCloud(), root = new LocalStorageBackend(storage);
  const original = state("Account base", 100); await root.forUser("account-a").save(original); cloud.rows.set("account-a", original);
  await root.save(state("Unrelated guest", 90)); await root.forUser("account-b").save(state("Unrelated B", 80));
  const a = new SyncedBackend(new LocalStorageBackend(storage), cloud, { cloudDelayMs: 60_000 });
  const b = new SyncedBackend(new LocalStorageBackend(storage), cloud, { cloudDelayMs: 60_000 });
  await a.load(); await b.load();
  const current = state("Queued nonselected A", 200), incoming = state("Chosen incoming B", 300);
  await a.save(current);
  assert(await rejects(b.save(incoming), LocalSaveConflictError), "signed-in same-device writers get the same local protection");
  const account = root.forUser("account-a"), primary = storage.getItem(account.storageKey), pending = storage.getItem(`${account.storageKey}.device-conflict.pending`);
  cloud.user = "account-b";
  assert(await rejects(b.resolveConflict("local"), CloudSaveError), "account change prevents resolving into an earlier account's slot");
  assertEqual([storage.getItem(account.storageKey), storage.getItem(`${account.storageKey}.device-conflict.pending`)], [primary, pending], "changed-account attempts alter neither the old primary nor recovery record");
  cloud.user = "account-a";
  assertEqual((await b.resolveConflict("local")).profileName, incoming.profileName, "verified same-account choice selects only the requested local journey");
  await b.flush();
  assertEqual(cloud.writes, [], "resolving the device modal does not silently authorize a cloud overwrite");
  assert(await rejects(a.flush(), Error), "the other window's previously queued nonselected branch cannot upload after resolution");
  assertEqual(cloud.writes, [], "stale queued cloud work remains blocked after the device choice");
  assertEqual((await root.load())?.profileName, "Unrelated guest", "guest primary remains isolated");
  assertEqual((await root.forUser("account-b").load())?.profileName, "Unrelated B", "the other account's primary remains isolated");
  assertEqual(JSON.parse(storage.getItem(account.storageKey)!).profileName, incoming.profileName, "selected account journey stays primary");
});

await suite("device saves: failed recovery storage cannot claim a dirty session is safe to leave", async () => {
  const storage = new MemoryStorage(), a = new LocalStorageBackend(storage), b = new LocalStorageBackend(storage);
  await a.save(state("Base", 100)); await b.load(); await a.save(state("Durable A", 200));
  const primary = storage.getItem(a.storageKey), backup = storage.getItem(`${a.storageKey}.lkg`);
  const original = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { if (key.endsWith(".device-conflict.pending")) throw new Error("Simulated full storage"); original(key, value); };
  let error: unknown;
  try { await b.save(state("Still in memory", 300)); } catch (caught) { error = caught; }
  assert(error instanceof Error && !(error instanceof SaveConflictError), "failed durable recovery produces an honest storage failure, not a false recovery-safe conflict");
  assertEqual([storage.getItem(a.storageKey), storage.getItem(`${a.storageKey}.lkg`)], [primary, backup], "primary and backup stay untouched when conflict preservation fails");
});

await suite("device saves: guest recovery remains usable when authentication is offline", async () => {
  const storage = new MemoryStorage(), a = new LocalStorageBackend(storage), b = new LocalStorageBackend(storage);
  await a.save(state("Base guest", 100)); await b.load(); await a.save(state("Current guest", 200));
  await rejects(b.save(state("Blocked guest", 300)), LocalSaveConflictError);
  const cloud = new FakeCloud(); let identityChecks = 0;
  cloud.currentUserId = async () => { identityChecks++; throw new CloudSaveError(); };
  const reopened = new SyncedBackend(new LocalStorageBackend(storage), cloud);
  assert(await rejects(reopened.load(), LocalSaveConflictError), "an auth failure still exposes the safe guest-slot recovery choice");
  assertEqual((await reopened.resolveConflict("local")).profileName, "Blocked guest", "choosing guest progress works without a network-dependent account check");
  await reopened.flush();
  assertEqual([identityChecks, cloud.writes.length], [1, 0], "offline guest recovery neither rechecks auth nor queues an account upload");
});

await suite("device saves: damaged recovery metadata preserves progress without breaking the title error probe", async () => {
  const storage = new MemoryStorage(), backend = new LocalStorageBackend(storage);
  await backend.save(state("Current good journey", 100));
  const raw = storage.getItem(backend.storageKey);
  storage.setItem(`${backend.storageKey}.device-conflict.pending`, "broken recovery bytes");
  assert(await rejects(backend.load(), InvalidSaveError), "damaged recovery metadata refuses loading instead of silently discarding it");
  assertEqual(backend.getConflict(), null, "the title can safely ask whether its failed load has a renderable choice");
  assert(await rejects(backend.save(state("Must not replace", 200)), InvalidSaveError), "damaged recovery metadata also prevents blind writes");
  assertEqual(storage.getItem(backend.storageKey), raw, "valid primary progress remains untouched while recovery metadata needs attention");
});
