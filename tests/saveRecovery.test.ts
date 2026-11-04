// Recovery uses real backends with isolated byte stores. No player storage,
// browser session, credentials, downloads or provider calls are involved.
import { assert, assertEqual, suite } from './_assert';
import {
  LocalStorageBackend, SyncedBackend, SaveStore, emptySave,
  InvalidSaveError, UnsupportedSaveVersionError, CloudSaveError, CURRENT_SCHEMA_VERSION,
  type StoragePort, type SaveState, type SaveRecoverySnapshot, type CloudSaveBackend, type LocalSaveLock,
} from '../src/game/saveState';

class Bytes implements StoragePort {
  values = new Map<string, string>();
  writes: Array<{ key: string; value: string }> = [];
  deniedRead: string | null = null;
  deniedWrite: ((key: string) => boolean) | null = null;
  getItem(key: string): string | null {
    if (this.deniedRead === key) throw new Error('Device storage cannot be read');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.deniedWrite?.(key)) throw new Error('Device storage is full');
    this.writes.push({ key, value }); this.values.set(key, value);
  }
}
class Cloud implements CloudSaveBackend {
  user: string | null = null;
  offline = false;
  reads = 0; writes = 0;
  remote: SaveState | null = null;
  async currentUserId(): Promise<string | null> {
    if (this.offline) throw new Error('offline');
    return this.user;
  }
  async load(): Promise<SaveState | null> { this.reads++; return this.remote; }
  async save(): Promise<void> { this.writes++; }
  async saveIfUnchanged(): Promise<boolean> { this.writes++; return true; }
}
async function failure(work: Promise<unknown>, type: new (...args: any[]) => Error = Error): Promise<boolean> {
  try { await work; return false; } catch (error) { return error instanceof type; }
}
function damaged(userId: string | null = null) {
  const bytes = new Bytes(), backend = new LocalStorageBackend(bytes, userId), key = backend.storageKey;
  bytes.values.set(key, '{partial primary bytes');
  bytes.values.set(`${key}.lkg`, '{partial backup bytes');
  return { bytes, backend, key };
}
function archive(bytes: Bytes, snapshot: SaveRecoverySnapshot, key: string): SaveRecoverySnapshot {
  const raw = bytes.getItem(`${key}.damaged-recovery.${snapshot.token}`);
  assert(raw !== null, 'explicit recovery keeps an immutable local archive');
  return JSON.parse(raw!);
}

await suite('save recovery: malformed copies are exposed exactly without creating or modifying progress', async () => {
  const f = damaged();
  f.bytes.values.set(`${f.key}.device-conflict.pending`, '{partial pending choice');
  f.bytes.values.set(`${f.key}.device-conflict.previous`, '{historical archive bytes');
  assert(await failure(SaveStore.load(f.backend), InvalidSaveError), 'both invalid copies cannot silently create a player');
  const snapshot = await f.backend.getRecovery();
  assert(snapshot !== null, 'unreadable saves have reachable recovery information');
  assertEqual([snapshot!.reason, snapshot!.scope, snapshot!.canStartFresh], ['damaged', 'guest', true], 'only guest damage enables a deliberate new journey');
  assertEqual(snapshot!.copies, {
    primary: '{partial primary bytes', backup: '{partial backup bytes',
    pendingDeviceChoice: '{partial pending choice', previousDeviceChoice: '{historical archive bytes',
  }, 'JSON download can retain each exact raw string, including malformed metadata');
  assertEqual(await f.backend.getRecovery(), snapshot, 'retrying snapshot inspection is stable and read-only');
  assertEqual(f.bytes.writes, [], 'opening recovery never writes an empty save, backup or archive');
  const exported = JSON.parse(JSON.stringify(snapshot));
  assertEqual(exported, snapshot, 'download serialization preserves all original bytes');
});

await suite('save recovery: missing primary cannot hide a malformed or newer backup', async () => {
  const bytes = new Bytes(), backend = new LocalStorageBackend(bytes), key = backend.storageKey;
  bytes.values.set(`${key}.lkg`, 'not json');
  assert(await failure(backend.load(), InvalidSaveError), 'a missing primary plus damaged backup is not a new player');
  assertEqual((await backend.getRecovery())?.copies.primary, null, 'export distinguishes missing bytes from damaged strings');
  bytes.values.set(`${key}.lkg`, JSON.stringify({ ...emptySave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }));
  assert(await failure(backend.load(), UnsupportedSaveVersionError), 'future backup instructs update rather than reset');
  const future = await backend.getRecovery();
  assertEqual([future?.reason, future?.canStartFresh], ['newer-version', false], 'future recovery cannot offer destructive downgrade');
  assert(await failure(backend.startFreshAfterRecovery(future!), InvalidSaveError), 'direct API also refuses a future reset');
  assertEqual(bytes.writes, [], 'all future/missing-primary probes preserve bytes');
});

await suite('save recovery: valid backups still recover normally and storage refusal never means empty progress', async () => {
  const f = damaged(), good = emptySave('Recovered keepsakes'); good.typewriterAwakened = true;
  f.bytes.values.set(`${f.key}.lkg`, JSON.stringify(good));
  assertEqual(await f.backend.load(), good, 'valid last-good journey remains the normal fallback');
  assertEqual(await f.backend.getRecovery(), null, 'usable fallback does not trigger a new-journey screen');
  assertEqual(f.bytes.writes, [], 'backup fallback does not replace corrupt bytes as a side effect');
  f.bytes.deniedRead = `${f.key}.lkg`;
  assert(await failure(f.backend.load()), 'denied backup reads reject the load');
  assert(await failure(f.backend.getRecovery()), 'denied raw reads do not fabricate an export');
  assertEqual(f.bytes.writes, [], 'read refusal never authorizes a reset');
  const empty = new LocalStorageBackend(new Bytes());
  assertEqual(await empty.load(), null, 'genuinely absent primary and backup still create an ordinary new player');
  assertEqual(await empty.getRecovery(), null, 'empty new players do not have damage');
});

await suite('save recovery: explicit fresh journey archives every original before touching active copies', async () => {
  const f = damaged();
  f.bytes.values.set(`${f.key}.device-conflict.pending`, 'damaged pending');
  f.bytes.values.set(`${f.key}.device-conflict.previous`, 'previous choice retained');
  const snapshot = (await f.backend.getRecovery())!;
  const fresh = await f.backend.startFreshAfterRecovery(snapshot);
  assertEqual(archive(f.bytes, snapshot, f.key), snapshot, 'archive contains the exact confirmed raw copies');
  assert(f.bytes.writes[0].key.endsWith(`.damaged-recovery.${snapshot.token}`), 'first write is preservation, before clearing or replacing active data');
  assertEqual(fresh.typewriterAwakened, false, 'only explicit recovery creates a genuinely new journey');
  assertEqual(f.bytes.getItem(`${f.key}.lkg`), snapshot.copies.backup, 'unreadable last-good bytes are not deleted');
  assertEqual(f.bytes.getItem(`${f.key}.device-conflict.previous`), snapshot.copies.previousDeviceChoice, 'previous conflict archive is not overwritten');
  assertEqual(f.bytes.getItem(`${f.key}.device-conflict.pending`), 'null', 'archived malformed pending metadata no longer blocks the new player');
  assertEqual(await new LocalStorageBackend(f.bytes).load(), fresh, 'the new journey is actually loadable in a later backend');
  assertEqual(await f.backend.getRecovery(), null, 'successful recovery leaves no active damage gate');
  await f.backend.save({ ...fresh, profileName: 'Continued new journey', updatedAt: fresh.updatedAt + 1 });
  assertEqual(archive(f.bytes, snapshot, f.key), snapshot, 'ordinary autosaves cannot rotate away damaged originals');
  assertEqual(f.bytes.writes.filter(w => w.key.includes('.damaged-recovery.')).length, 1, 'autosaves never accumulate more recovery archives');
  assert(await failure(f.backend.startFreshAfterRecovery(snapshot), InvalidSaveError), 'the old confirmation cannot reset progress again');
});

await suite('save recovery: changed bytes, different instances and tampered snapshots cannot authorize a reset', async () => {
  const f = damaged();
  const snapshot = (await f.backend.getRecovery())!;
  assert(await failure(new LocalStorageBackend(f.bytes).startFreshAfterRecovery(snapshot), InvalidSaveError), 'a token must have been issued by this instance');
  assert(await failure(f.backend.startFreshAfterRecovery({ ...snapshot, canStartFresh: false }), InvalidSaveError), 'snapshot fields cannot be tampered with');
  f.bytes.values.set(f.key, JSON.stringify(emptySave('Another window recovered')));
  assert(await failure(f.backend.startFreshAfterRecovery(snapshot), InvalidSaveError), 'another window changing the slot invalidates confirmation');
  assertEqual((await f.backend.load())?.profileName, 'Another window recovered', 'changed progress stays playable');
  assertEqual(f.bytes.writes, [], 'no archive, backup or primary mutation occurs after a stale choice');
});

await suite('save recovery: failed archive writes and archive collisions leave active originals untouched', async () => {
  const f = damaged(), snapshot = (await f.backend.getRecovery())!, originals = new Map(f.bytes.values);
  f.bytes.deniedWrite = key => key.includes('.damaged-recovery.');
  assert(await failure(f.backend.startFreshAfterRecovery(snapshot)), 'storage full aborts preservation');
  assertEqual([...f.bytes.values], [...originals], 'failed archive cannot change primary, backup or metadata');
  f.bytes.deniedWrite = null;
  f.bytes.values.set(`${f.key}.damaged-recovery.${snapshot.token}`, 'an unrelated earlier archive');
  assert(await failure(f.backend.startFreshAfterRecovery(snapshot), InvalidSaveError), 'distinct archive at the chosen key is never overwritten');
  assertEqual(f.bytes.getItem(`${f.key}.damaged-recovery.${snapshot.token}`), 'an unrelated earlier archive', 'prior incident is preserved');
  assertEqual([f.bytes.getItem(f.key), f.bytes.getItem(`${f.key}.lkg`)], [snapshot.copies.primary, snapshot.copies.backup], 'collision cannot reset either active copy');
});

await suite('save recovery: later write failures retain the complete archive and remain retryable', async () => {
  for (const failPending of [false, true]) {
    const f = damaged();
    if (failPending) f.bytes.values.set(`${f.key}.device-conflict.pending`, 'broken pending bytes');
    const snapshot = (await f.backend.getRecovery())!;
    f.bytes.deniedWrite = key => key === (failPending ? `${f.key}.device-conflict.pending` : f.key);
    assert(await failure(f.backend.startFreshAfterRecovery(snapshot)), 'later full-storage failure is surfaced');
    assertEqual(archive(f.bytes, snapshot, f.key), snapshot, 'every original is still retained after the partial operation');
    assertEqual(f.bytes.getItem(f.key), snapshot.copies.primary, 'failed active write never pretends a new player exists');
    f.bytes.deniedWrite = null;
    const fresh = await f.backend.startFreshAfterRecovery(snapshot);
    assertEqual(await f.backend.load(), fresh, 'the same unchanged snapshot can retry a transient write refusal');
  }
});

await suite('save recovery: each explicit damage incident preserves earlier immutable archives', async () => {
  const f = damaged(), first = (await f.backend.getRecovery())!;
  await f.backend.startFreshAfterRecovery(first);
  f.bytes.values.set(f.key, 'a second damaged primary'); f.bytes.values.set(`${f.key}.lkg`, 'a second damaged backup');
  const second = (await f.backend.getRecovery())!;
  assert(first.token !== second.token, 'a different incident receives a separate identity');
  await f.backend.startFreshAfterRecovery(second);
  assertEqual(archive(f.bytes, first, f.key), first, 'later recovery cannot erase the first originals');
  assertEqual(archive(f.bytes, second, f.key), second, 'later recovery also retains the second originals');
});

await suite('save recovery: newer pending choices and future primaries preserve progress without reset', async () => {
  const f = damaged();
  const newer = { ...emptySave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
  f.bytes.values.set(f.key, JSON.stringify(newer));
  assert(await failure(f.backend.load(), UnsupportedSaveVersionError), 'newer primary stays refused even with bad backup');
  let snapshot = (await f.backend.getRecovery())!;
  assertEqual([snapshot.reason, snapshot.canStartFresh], ['newer-version', false], 'future primary never enables reset');
  const good = emptySave('Existing journey'); f.bytes.values.set(f.key, JSON.stringify(good));
  f.bytes.values.set(`${f.key}.device-conflict.pending`, JSON.stringify({ version: 1, writer: 'newer writer', currentRaw: JSON.stringify(good), local: newer, cloud: good }));
  assert(await failure(f.backend.load(), UnsupportedSaveVersionError), 'newer pending journey is also protected');
  snapshot = (await f.backend.getRecovery())!;
  assertEqual(snapshot.reason, 'newer-version', 'metadata cannot hide a newer-format choice');
  assert(await failure(f.backend.startFreshAfterRecovery(snapshot), InvalidSaveError), 'newer pending branch cannot be cleared by fresh recovery');
  f.bytes.values.set(`${f.key}.device-conflict.pending`, JSON.stringify({ version: 2, opaque: 'newer recovery format' }));
  assert(await failure(f.backend.load(), UnsupportedSaveVersionError), 'newer recovery-record format cannot be treated as disposable damage');
  snapshot = (await f.backend.getRecovery())!;
  assertEqual([snapshot.reason, snapshot.canStartFresh], ['newer-version', false], 'unknown newer recovery metadata requires an update');
  assertEqual(f.bytes.writes, [], 'future byte protection is read-only');
});

await suite('save recovery: account exports are scoped, account reset is refused, and remote progress is untouched', async () => {
  const f = damaged('account-a'), cloud = new Cloud(); cloud.user = 'account-a'; cloud.remote = emptySave('Remote journey');
  f.bytes.values.set(new LocalStorageBackend(f.bytes, 'account-b').storageKey, 'private account-b bytes');
  f.bytes.values.set(new LocalStorageBackend(f.bytes).storageKey, 'separate guest bytes');
  const backend = new SyncedBackend(new LocalStorageBackend(f.bytes), cloud);
  assert(await failure(backend.load(), InvalidSaveError), 'damaged account cache refuses load before touching remote');
  const snapshot = (await backend.getRecovery())!;
  assertEqual([snapshot.scope, snapshot.reason, snapshot.canStartFresh], ['account', 'damaged', false], 'signed-in screen exposes download/retry only');
  assertEqual(snapshot.copies.primary, '{partial primary bytes', 'only this account raw copies are exported');
  assert(!JSON.stringify(snapshot).includes('private account-b bytes') && !JSON.stringify(snapshot).includes('separate guest bytes'), 'export cannot include other user/guest slots');
  assert(await failure(backend.startFreshAfterRecovery(snapshot), InvalidSaveError), 'direct signed-in reset API is refused');
  assertEqual([cloud.reads, cloud.writes], [0, 0], 'account recovery cannot choose or overwrite the remote journey');
  assertEqual(f.bytes.writes, [], 'account recovery makes no local changes');
  cloud.user = 'account-b';
  assert(await failure(backend.getRecovery(), CloudSaveError), 'switched account cannot export the old cache');
  assert(await failure(backend.startFreshAfterRecovery(snapshot), CloudSaveError), 'switched account cannot confirm an old recovery');
});

await suite('save recovery: offline guests can recover while a newly signed-in account invalidates confirmation', async () => {
  const f = damaged(), cloud = new Cloud(); cloud.offline = true;
  const backend = new SyncedBackend(f.backend, cloud);
  assert(await failure(backend.load(), InvalidSaveError), 'offline identity fallback still reports damaged guest bytes');
  const snapshot = (await backend.getRecovery())!;
  assertEqual([snapshot.scope, snapshot.canStartFresh], ['guest', true], 'offline guest can preserve and deliberately restart without network');
  const fresh = await backend.startFreshAfterRecovery(snapshot);
  assertEqual(await new LocalStorageBackend(f.bytes).load(), fresh, 'recovered guest journey is durable');
  assertEqual([cloud.reads, cloud.writes], [0, 0], 'offline recovery never accesses or writes a cloud row');
  const other = damaged(), live = new Cloud(), synced = new SyncedBackend(other.backend, live);
  await failure(synced.load()); const pending = (await synced.getRecovery())!;
  live.user = 'account-a';
  assert(await failure(synced.startFreshAfterRecovery(pending), CloudSaveError), 'sign-in during the panel invalidates guest confirmation');
  assertEqual(other.bytes.writes, [], 'newly signed-in account leaves original guest bytes intact');
});

await suite('save recovery: a malformed remote save cannot authorize a local reset', async () => {
  const bytes = new Bytes(), local = new LocalStorageBackend(bytes), cloud = new Cloud(); cloud.user = 'account-a';
  const account = local.forUser('account-a'); bytes.values.set(account.storageKey, JSON.stringify(emptySave('Valid device')));
  cloud.remote = { ...emptySave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
  const synced = new SyncedBackend(local, cloud);
  assert(await failure(synced.load(), UnsupportedSaveVersionError), 'newer cloud format rejects normal loading');
  assertEqual(await synced.getRecovery(), null, 'healthy device bytes do not invent a damaged-local reset for a remote error');
  assertEqual(cloud.writes, 0, 'remote-only failure is never overwritten');
});

await suite('save recovery: simultaneous explicit recoveries serialize and cannot overwrite the first new journey', async () => {
  const f = damaged(), second = new LocalStorageBackend(f.bytes);
  const a = (await f.backend.getRecovery())!, b = (await second.getRecovery())!;
  const results = await Promise.allSettled([f.backend.startFreshAfterRecovery(a), second.startFreshAfterRecovery(b)]);
  assertEqual(results.map(r => r.status), ['fulfilled', 'rejected'], 'one confirmed recovery wins the shared critical section');
  const written = results[0].status === 'fulfilled' ? results[0].value : null;
  assertEqual(await new LocalStorageBackend(f.bytes).load(), written, 'the stale second confirmation cannot replace the newly recovered journey');
  assertEqual(f.bytes.writes.filter(w => w.key.includes('.damaged-recovery.')).length, 1, 'the losing confirmation performs no writes');
  assertEqual(archive(f.bytes, a, f.key), a, 'the winning archive still contains the damaged originals');
});

await suite('save recovery: future backups are protected beside valid primaries and if introduced after load', async () => {
  const bytes = new Bytes(), backend = new LocalStorageBackend(bytes), key = backend.storageKey;
  const good = emptySave('Current device journey');
  bytes.values.set(key, JSON.stringify(good));
  await backend.load();
  const futureRaw = JSON.stringify({ ...good, profileName: 'Newer build progress', schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
  bytes.values.set(`${key}.lkg`, futureRaw);
  assert(await failure(backend.save({ ...good, updatedAt: good.updatedAt + 1 }), UnsupportedSaveVersionError), 'a future backup introduced after load cannot be rotated away by autosave');
  assertEqual([bytes.getItem(key), bytes.getItem(`${key}.lkg`)], [JSON.stringify(good), futureRaw], 'write refusal preserves both active copies');
  assert(await failure(new LocalStorageBackend(bytes).load(), UnsupportedSaveVersionError), 'valid older primary does not hide a future backup during next load');
  const snapshot = (await backend.getRecovery())!;
  assertEqual([snapshot.reason, snapshot.canStartFresh], ['newer-version', false], 'the player can download or update without a downgrade-reset option');
  assertEqual(bytes.writes, [], 'future backup protection performs no mutation');
});


await suite('save recovery: account identity and cache binding are rechecked after a delayed storage lock', async () => {
  for (const rebind of [false, true]) {
    let hold = false;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const waiting = new Promise<void>(done => { entered = done; });
    const lock: LocalSaveLock = {
      async run<T>(_slot: string, work: () => T): Promise<T> {
        if (hold) { hold = false; entered(); await gate; }
        return work();
      },
    };
    const bytes = new Bytes(), cloud = new Cloud(); cloud.user = 'account-a';
    const local = new LocalStorageBackend(bytes, null, lock);
    bytes.values.set(local.forUser('account-a').storageKey, 'unreadable account-a bytes');
    bytes.values.set(local.forUser('account-b').storageKey, JSON.stringify(emptySave('Account B journey')));
    const synced = new SyncedBackend(local, cloud);
    assert(await failure(synced.load(), InvalidSaveError), 'account A first reaches the actual damaged-cache flow');
    hold = true;
    const pending = synced.getRecovery();
    await waiting;
    cloud.user = 'account-b';
    if (rebind) {
      cloud.remote = JSON.parse(bytes.values.get(local.forUser('account-b').storageKey)!);
      await synced.load();
    }
    release();
    assert(await failure(pending, CloudSaveError), rebind
      ? 'an intervening account-B load cannot make a late account-A snapshot look correctly scoped'
      : 'an account switch during the raw storage read refuses export after the lock releases');
    assertEqual(bytes.values.get(local.forUser('account-a').storageKey), 'unreadable account-a bytes', 'refused export preserves account A originals');
    assertEqual(cloud.writes, 0, 'delayed recovery never uploads an account journey');
  }
});
