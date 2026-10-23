// All storage/network work is injected. No browser globals, session, live
// Supabase client or player storage are involved in these regression cases.
import { assert, assertEqual, suite } from "./_assert";
import {
  emptySave, migrate, SaveStore, LocalStorageBackend, SyncedBackend,
  SupabaseBackend, InvalidSaveError, UnsupportedSaveVersionError,
  SaveConflictError, CloudSaveError, CURRENT_SCHEMA_VERSION,
  type SaveState, type SaveBackend, type StoragePort, type CloudSaveBackend,
} from "../src/game/saveState";
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
