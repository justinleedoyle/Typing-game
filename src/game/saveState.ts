// Validated player progress, durable local autosaves and optional account-scoped
// cloud sync. Scene code only mutates SaveStore; storage and network failures
// never turn an existing save into a new, empty profile.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RealmProgress {
  cleared: boolean;
  choices: Record<string, string>;
  quietLordIntruded?: boolean;
  quietLordFragmentRevealed?: boolean;
}
export interface KeyStat { hits: number; misses: number }
export type Difficulty = "forgiving" | "standard" | "purist";
export type AudioLevel = "loud" | "medium" | "quiet" | "off";
export type CheckpointValue = string | number | boolean | null;
export interface SaveCheckpoint {
  scene: "OpeningScene" | keyof typeof CHECKPOINT_REALMS;
  step: string;
  data: Record<string, CheckpointValue>;
}
export interface SaveState {
  schemaVersion: number;
  /** Distinguishes deliberate new runs from conflicting branches of one run. */
  runId: string;
  profileName: string;
  typewriterAwakened: boolean;
  wrenGender: "girl" | "boy" | null;
  realms: Record<string, RealmProgress>;
  satchel: string[];
  keyStats: Record<string, KeyStat>;
  almanacLore: string[];
  difficulty: Difficulty;
  audioLevel: AudioLevel;
  checkpoint: SaveCheckpoint | null;
  textScale: "standard" | "large";
  reducedMotion: boolean;
  reducedFlashes: boolean;
  updatedAt: number;
}

// v0: unversioned; v1: difficulty; v2: first-chapter/presentation; v3: all realms.
export const CURRENT_SCHEMA_VERSION = 3;
export const CHECKPOINT_REALMS = {
  WinterMountainScene: "winter-mountain",
  SunkenBellScene: "sunken-bell",
  ClockworkForgeScene: "clockwork-forge",
  SkyIslandScene: "sky-island",
  HauntedWoodScene: "haunted-wood",
} as const;
export function emptySave(profileName = "Wren"): SaveState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION, runId: globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`, profileName,
    typewriterAwakened: false, wrenGender: null, realms: {}, satchel: [],
    keyStats: {}, almanacLore: [], difficulty: "standard", audioLevel: "medium",
    checkpoint: null, textScale: "standard", reducedMotion: false,
    reducedFlashes: false, updatedAt: Date.now(),
  };
}

export class InvalidSaveError extends Error {
  constructor(message = "This save is damaged. Your saved data has been preserved.") {
    super(message); this.name = "InvalidSaveError";
  }
}
export class UnsupportedSaveVersionError extends Error {
  constructor(readonly version: number) {
    super("This save was written by a newer game version. Update the game before loading it.");
    this.name = "UnsupportedSaveVersionError";
  }
}
export class SaveConflictError extends Error {
  constructor(message = "Local and cloud progress disagree. Both copies have been preserved; choose a save before syncing.") {
    super(message); this.name = "SaveConflictError";
  }
}
export class LocalSaveConflictError extends SaveConflictError {
  constructor(message = "Another window changed this device's save. Both journeys are preserved; choose one before continuing.") {
    super(message); this.name = "LocalSaveConflictError";
  }
}
export class CloudSaveError extends Error {
  constructor(message = "Cloud saving is unavailable. Your progress is still saved on this device.") {
    super(message); this.name = "CloudSaveError";
  }
}

type RawSave = Record<string, unknown>;
function record(value: unknown): value is RawSave {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
function invalid(field: string): never { throw new InvalidSaveError(`Invalid save field: ${field}. Your saved data has been preserved.`); }
function stringField(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return invalid(field);
  return value;
}
function booleanField(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") return invalid(field);
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string): T {
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) return invalid(field);
  return value as T;
}
function strings(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return invalid(field);
  return [...new Set(value as string[])];
}
export function validateCheckpoint(value: unknown): SaveCheckpoint | null {
  if (value === undefined || value === null) return null;
  if (!record(value) || (value.scene !== "OpeningScene" &&
      !(typeof value.scene === "string" && Object.hasOwn(CHECKPOINT_REALMS, value.scene))) ||
      typeof value.step !== "string" || !value.step.trim() || value.step.length > 100 || !record(value.data)) {
    return invalid("checkpoint");
  }
  const data: Record<string, CheckpointValue> = {};
  for (const [key, v] of Object.entries(value.data)) {
    if (!safeKey(key) || !(v === null || typeof v === "string" || typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)))) return invalid("checkpoint.data");
    data[key] = v;
  }
  return { scene: value.scene as SaveCheckpoint["scene"], step: value.step, data };
}

/** Validate before migration. Missing historical fields get defaults; malformed
 * existing fields and future versions are refused, never silently erased. */
export function migrate(raw: unknown): SaveState {
  if (!record(raw)) return invalid("root");
  const version = raw.schemaVersion === undefined ? 0 : raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return invalid("schemaVersion");
  if (version > CURRENT_SCHEMA_VERSION) throw new UnsupportedSaveVersionError(version);
  const defaults = emptySave();
  const realms: Record<string, RealmProgress> = {};
  if (raw.realms !== undefined) {
    if (!record(raw.realms)) return invalid("realms");
    for (const [id, progress] of Object.entries(raw.realms)) {
      if (!safeKey(id) || !record(progress) || typeof progress.cleared !== "boolean" || !record(progress.choices)) return invalid("realms");
      const choices: Record<string, string> = {};
      for (const [key, value] of Object.entries(progress.choices)) {
        if (!safeKey(key) || typeof value !== "string") return invalid("realms.choices");
        choices[key] = value;
      }
      realms[id] = { cleared: progress.cleared, choices };
      for (const flag of ["quietLordIntruded", "quietLordFragmentRevealed"] as const) {
        if (progress[flag] !== undefined) realms[id][flag] = booleanField(progress[flag], false, flag);
      }
    }
  }
  const keyStats: Record<string, KeyStat> = {};
  if (raw.keyStats !== undefined) {
    if (!record(raw.keyStats)) return invalid("keyStats");
    for (const [key, stat] of Object.entries(raw.keyStats)) {
      if (!safeKey(key) || !record(stat) || ![stat.hits, stat.misses].every((v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) return invalid("keyStats");
      keyStats[key] = { hits: stat.hits as number, misses: stat.misses as number };
    }
  }
  if (raw.wrenGender !== undefined && raw.wrenGender !== null && raw.wrenGender !== "boy" && raw.wrenGender !== "girl") return invalid("wrenGender");
  if (raw.updatedAt !== undefined && (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0)) return invalid("updatedAt");
  let difficulty = choice(raw.difficulty, ["forgiving", "standard", "purist"], "standard", "difficulty");
  if (version === 0 && raw.purist !== undefined) {
    if (typeof raw.purist !== "boolean") return invalid("purist");
    difficulty = raw.purist ? "purist" : "standard";
  }
  const state: SaveState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    runId: stringField(raw.runId, "legacy", "runId"),
    profileName: stringField(raw.profileName, defaults.profileName, "profileName"),
    typewriterAwakened: booleanField(raw.typewriterAwakened, false, "typewriterAwakened"),
    wrenGender: (raw.wrenGender ?? null) as SaveState["wrenGender"],
    realms, satchel: strings(raw.satchel, "satchel"), keyStats,
    almanacLore: strings(raw.almanacLore, "almanacLore"), difficulty,
    audioLevel: choice(raw.audioLevel, ["loud", "medium", "quiet", "off"], "medium", "audioLevel"),
    checkpoint: validateCheckpoint(raw.checkpoint),
    textScale: choice(raw.textScale, ["standard", "large"], "standard", "textScale"),
    reducedMotion: booleanField(raw.reducedMotion, false, "reducedMotion"),
    reducedFlashes: booleanField(raw.reducedFlashes, false, "reducedFlashes"),
    updatedAt: raw.updatedAt as number ?? defaults.updatedAt,
  };
  const cp = state.checkpoint;
  if (cp && ((cp.scene === "OpeningScene" && state.typewriterAwakened) ||
      (cp.scene !== "OpeningScene" && (!state.typewriterAwakened || state.realms[CHECKPOINT_REALMS[cp.scene]]?.cleared)))) state.checkpoint = null;
  return state;
}

export interface SaveConflict {
  local: SaveState;
  cloud: SaveState;
  /** For device conflicts, local is the blocked window and cloud is the
   * durable device copy. The historical field names keep existing callers. */
  kind?: "cloud" | "device";
}
export type SaveSource = "local" | "cloud";
export interface SaveBackend {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
  /** Drain optional remote work after the durable local write. */
  flush?(): Promise<void>;
  getLastError?(): Error | null;
  getConflict?(): SaveConflict | null;
  resolveConflict?(source: SaveSource): Promise<SaveState>;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface LocalSaveLock {
  run<T>(slot: string, work: () => T): Promise<T>;
}
const localWriteQueues = new Map<string, Promise<void>>();
const defaultLocalLock: LocalSaveLock = {
  run<T>(slot: string, work: () => T): Promise<T> {
    // Web Locks serialize cooperating documents, not merely promises in one
    // tab. The fallback is deliberately limited to this JavaScript process;
    // injected test ports and legacy browsers still get optimistic checks.
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request(`portalwrights-save:${slot}`, work);
    }
    const previous = localWriteQueues.get(slot) ?? Promise.resolve();
    const task = previous.then(work);
    const tail = task.then(() => {}, () => {});
    localWriteQueues.set(slot, tail);
    void tail.then(() => { if (localWriteQueues.get(slot) === tail) localWriteQueues.delete(slot); });
    return task;
  },
};
let localWriterSequence = 0;
interface DeviceConflictRecord {
  version: 1;
  writer: string;
  currentRaw: string | null;
  local: SaveState;
  cloud: SaveState;
}
const STORAGE_KEY = "portalwrights-almanac.save.v1";
function browserStorage(): StoragePort {
  // Resolve at use time: constructing a store never opens Supabase or accesses
  // player storage, and tests inject isolated storage instead.
  return { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
}
function parseSave(raw: string): SaveState {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new InvalidSaveError(); }
  return migrate(value);
}
function asError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }

export function snapshotLastKnownGood(storage: StoragePort = browserStorage(), key = STORAGE_KEY): void {
  try {
    const current = storage.getItem(key);
    if (current !== null) { parseSave(current); storage.setItem(`${key}.lkg`, current); }
  } catch { /* Never copy malformed/future bytes over a good backup. */ }
}
export function loadLastKnownGood(storage: StoragePort = browserStorage(), key = STORAGE_KEY): SaveState | null {
  try { const raw = storage.getItem(`${key}.lkg`); return raw === null ? null : parseSave(raw); } catch { return null; }
}

export class LocalStorageBackend implements SaveBackend {
  private observedRaw: string | null | undefined;
  private readonly writer = `${Date.now()}-${++localWriterSequence}-${Math.random().toString(36).slice(2)}`;
  constructor(private readonly storage: StoragePort = browserStorage(), readonly userId: string | null = null, private readonly lock: LocalSaveLock = defaultLocalLock) {}
  get storageKey(): string { return this.userId === null ? STORAGE_KEY : `${STORAGE_KEY}.user.${encodeURIComponent(this.userId)}`; }
  forUser(userId: string | null): LocalStorageBackend { return new LocalStorageBackend(this.storage, userId, this.lock); }
  private get pendingKey(): string { return `${this.storageKey}.device-conflict.pending`; }
  private get recoveryKey(): string { return `${this.storageKey}.device-conflict.previous`; }
  private readDeviceRecord(key: string): DeviceConflictRecord | null {
    const raw = this.storage.getItem(key);
    if (raw === null || raw === "null") return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new InvalidSaveError("Device save recovery data could not load. It has been preserved."); }
    if (!record(value) || value.version !== 1 || typeof value.writer !== "string" ||
        !(value.currentRaw === null || typeof value.currentRaw === "string")) return invalid("device conflict");
    return { version: 1, writer: value.writer, currentRaw: value.currentRaw, local: migrate(value.local), cloud: migrate(value.cloud) };
  }
  private deviceChoice(value: DeviceConflictRecord): SaveConflict {
    return { kind: "device", local: migrate(value.local), cloud: migrate(value.cloud) };
  }
  getConflict(): SaveConflict | null {
    // Loading/writing reports damaged recovery bytes. This UI probe must not
    // throw a second error while the title is already handling that failure.
    try {
      const pending = this.readDeviceRecord(this.pendingKey);
      return pending ? this.deviceChoice(pending) : null;
    } catch { return null; }
  }
  /** One bounded archive remains after an explicit choice; subsequent ordinary
   * autosaves never rotate away the nonselected journey. */
  getLastDeviceRecovery(): SaveConflict | null {
    const previous = this.readDeviceRecord(this.recoveryKey);
    return previous ? this.deviceChoice(previous) : null;
  }
  /** An older window must not upload its queued branch after another window
   * explicitly chose a different device journey. */
  async isCurrentWriter(): Promise<boolean> {
    return this.lock.run(this.storageKey, () => this.observedRaw !== undefined &&
      this.storage.getItem(this.storageKey) === this.observedRaw && !this.readDeviceRecord(this.pendingKey));
  }
  private currentState(raw: string | null): SaveState | null {
    if (raw !== null) {
      try { return parseSave(raw); }
      catch (error) {
        if (error instanceof UnsupportedSaveVersionError) throw error;
        const backup = loadLastKnownGood(this.storage, this.storageKey);
        if (backup) return backup;
        throw error;
      }
    }
    return loadLastKnownGood(this.storage, this.storageKey);
  }
  private keepDeviceConflict(state: SaveState, raw: string | null): never {
    const current = this.currentState(raw) ?? emptySave();
    const pending: DeviceConflictRecord = { version: 1, writer: this.writer, currentRaw: raw, local: migrate(state), cloud: current };
    // If this bounded recovery write fails, propagate the storage error instead
    // of claiming that the in-memory journey is safe to leave behind.
    this.storage.setItem(this.pendingKey, JSON.stringify(pending));
    throw new LocalSaveConflictError();
  }
  preserveConflict(source: SaveSource, state: SaveState): void {
    // Kept separately from the rotating last-known-good slot: choosing one
    // branch must not make the unchosen branch disappear on the next autosave.
    this.storage.setItem(`${this.storageKey}.conflict.${source}.${Date.now()}.${state.updatedAt}`, JSON.stringify(migrate(state)));
  }
  async load(): Promise<SaveState | null> {
    return this.lock.run(this.storageKey, () => {
      const raw = this.storage.getItem(this.storageKey);
      const current = this.currentState(raw);
      this.observedRaw = raw;
      const pending = this.readDeviceRecord(this.pendingKey);
      if (pending) {
        if (pending.currentRaw !== raw) {
          pending.currentRaw = raw; pending.cloud = current ?? emptySave();
          this.storage.setItem(this.pendingKey, JSON.stringify(pending));
        }
        throw new LocalSaveConflictError();
      }
      return current;
    });
  }
  async save(state: SaveState): Promise<void> {
    const valid = migrate(state);
    return this.lock.run(this.storageKey, () => {
      const raw = this.storage.getItem(this.storageKey);
      if (raw !== null) {
        try { parseSave(raw); }
        catch (error) { if (error instanceof UnsupportedSaveVersionError) throw error; }
      }
      const pending = this.readDeviceRecord(this.pendingKey);
      if (pending) {
        if (pending.writer === this.writer) this.keepDeviceConflict(valid, raw);
        throw new Error("Another window has an unresolved device-save choice. This window's new progress is still in this session; keep it open until that choice is resolved.");
      }
      if (raw !== this.observedRaw && !(this.observedRaw === undefined && raw === null)) {
        // An identical retry can simply adopt the current revision. Otherwise
        // even a new adapter must load first, not overwrite an existing slot.
        if (raw !== null && sameSave(valid, parseSave(raw))) { this.observedRaw = raw; return; }
        this.keepDeviceConflict(valid, raw);
      }
      this.writeValid(valid);
    });
  }
  private writeValid(valid: SaveState): void {
    snapshotLastKnownGood(this.storage, this.storageKey);
    const raw = JSON.stringify(valid);
    this.storage.setItem(this.storageKey, raw);
    this.observedRaw = raw;
  }
  async resolveConflict(source: SaveSource): Promise<SaveState> {
    return this.lock.run(this.storageKey, () => {
      const pending = this.readDeviceRecord(this.pendingKey);
      if (!pending) throw new LocalSaveConflictError("There is no pending device-save choice.");
      const raw = this.storage.getItem(this.storageKey);
      const current = this.currentState(raw);
      if (pending.currentRaw !== raw) {
        pending.currentRaw = raw; pending.cloud = current ?? emptySave();
        this.storage.setItem(this.pendingKey, JSON.stringify(pending));
        throw new LocalSaveConflictError("The device save changed while this choice was open. Review the refreshed journeys before continuing.");
      }
      // Preserve both alternatives before changing either the primary or its
      // rotating backup. Exactly one previous conflict is retained per slot.
      this.storage.setItem(this.recoveryKey, JSON.stringify(pending));
      const selected = migrate({ ...pending[source], updatedAt: Math.max(Date.now(), pending.local.updatedAt + 1, pending.cloud.updatedAt + 1) });
      this.writeValid(selected);
      this.storage.setItem(this.pendingKey, "null");
      return selected;
    });
  }
}

export interface CloudSaveBackend {
  currentUserId(): Promise<string | null>;
  load(userId?: string): Promise<SaveState | null>;
  save(state: SaveState, userId?: string): Promise<void>;
  /** Atomic compare-and-write against the observed row; false means another
   * writer changed/created it. Adapters without this cannot safely upload. */
  saveIfUnchanged?(state: SaveState, observed: SaveState | null, userId?: string): Promise<boolean>;
}
const CLOUD_TIMEOUT_MS = 4000;
async function deadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CloudSaveError()), timeoutMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function defaultClient(): Promise<SupabaseClient> {
  return (await import("./supabaseClient")).supabase;
}
export class SupabaseBackend implements CloudSaveBackend, SaveBackend {
  private observations = new Map<string, { state: SaveState | null; revision: string | null }>();
  constructor(private readonly client: () => Promise<SupabaseClient> = defaultClient, private readonly timeoutMs = CLOUD_TIMEOUT_MS) {}
  async currentUserId(): Promise<string | null> {
    const client = await this.client();
    const { data, error } = await deadline(client.auth.getSession(), this.timeoutMs);
    if (error) throw new CloudSaveError();
    return data.session?.user.id ?? null;
  }
  private async owner(expected?: string): Promise<string | null> {
    const actual = await this.currentUserId();
    if (expected !== undefined && actual !== expected) throw new CloudSaveError("The signed-in account changed. Your original account's local save is preserved; reopen the game before syncing.");
    return actual;
  }
  private async request<T>(work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try { return await work(controller.signal); }
    finally { clearTimeout(timer); }
  }
  async load(expected?: string): Promise<SaveState | null> {
    const userId = await this.owner(expected);
    if (!userId) return null;
    const client = await this.client();
    const { data, error } = await this.request((signal) => client.from("player_saves").select("state, updated_at").eq("user_id", userId).abortSignal(signal).maybeSingle());
    if (error) throw new CloudSaveError();
    const state = data === null ? null : migrate(data.state);
    if (data !== null && typeof data.updated_at !== "string") throw new CloudSaveError("Cloud save revision is unavailable. Device progress has been preserved.");
    this.observations.set(userId, { state, revision: data?.updated_at ?? null });
    return state;
  }
  async save(state: SaveState, expected?: string): Promise<void> {
    const observed = await this.load(expected);
    if (observed) {
      assertCompatible(state, observed);
      if (observed.updatedAt > state.updatedAt) throw new SaveConflictError();
    }
    if (!await this.saveIfUnchanged(state, observed, expected)) throw new SaveConflictError();
  }
  async saveIfUnchanged(state: SaveState, observed: SaveState | null, expected?: string): Promise<boolean> {
    const valid = migrate(state);
    const userId = await this.owner(expected);
    if (!userId) return false;
    const observation = this.observations.get(userId);
    if (!observation || !sameNullableSave(observation.state, observed)) return false;
    const client = await this.client();
    // Existing schema already supplies a server-controlled updated_at trigger.
    // Filtering the UPDATE by that revision makes the check and write one SQL
    // operation. A new row uses INSERT + the unique user_id key, never upsert.
    const result = observed === null
      ? await this.request((signal) => client.from("player_saves")
        .insert({ user_id: userId, state: valid }).select("state, updated_at").abortSignal(signal).maybeSingle())
      : await this.request((signal) => client.from("player_saves")
        .update({ state: valid }).eq("user_id", userId).eq("updated_at", observation.revision!)
        .select("state, updated_at").abortSignal(signal).maybeSingle());
    const { data, error } = result;
    if (error?.code === "23505") return false;
    if (error) throw new CloudSaveError();
    if (data === null) return false;
    if (typeof data.updated_at !== "string") throw new CloudSaveError();
    this.observations.set(userId, { state: migrate(data.state), revision: data.updated_at });
    return true;
  }
}

function resolvedChoice(state: SaveState, realmId: string, key: string, value: string): boolean {
  if ((key === "fork1" || key === "fork2") && value === "none") return false;
  if (realmId === "winter-mountain" && key === "fox" && value === "ignored" &&
      !state.realms[realmId]?.cleared && state.checkpoint?.scene === "WinterMountainScene" &&
      state.checkpoint.data.foxDecided === false) return false;
  return true;
}
function conflictingBranches(a: SaveState, b: SaveState): boolean {
  // A newer device clock does not prove that an old journey supersedes a new
  // run on another device. Reset is safe during a session only when its last
  // observed cloud row is still current; boot-time run differences need choice.
  if (a.runId !== b.runId) return true;
  if (a.wrenGender && b.wrenGender && a.wrenGender !== b.wrenGender) return true;
  for (const [id, realm] of Object.entries(a.realms)) {
    const other = b.realms[id];
    if (!other) continue;
    for (const [key, value] of Object.entries(realm.choices)) {
      if (other.choices[key] !== undefined && other.choices[key] !== value &&
          resolvedChoice(a, id, key, value) && resolvedChoice(b, id, key, other.choices[key])) return true;
    }
  }
  return false;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sameSave(a: SaveState, b: SaveState): boolean { return stableJson(a) === stableJson(b); }
function sameNullableSave(a: SaveState | null, b: SaveState | null): boolean {
  return a === null || b === null ? a === b : sameSave(a, b);
}
function retainsProgress(candidate: SaveState, previous: SaveState): boolean {
  if (previous.typewriterAwakened && !candidate.typewriterAwakened) return false;
  if (previous.wrenGender && candidate.wrenGender !== previous.wrenGender) return false;
  for (const [id, realm] of Object.entries(previous.realms)) {
    const next = candidate.realms[id];
    if (realm.cleared && !next?.cleared) return false;
    for (const [key, value] of Object.entries(realm.choices)) {
      if (resolvedChoice(previous, id, key, value) && next?.choices[key] !== value) return false;
    }
  }
  if (previous.satchel.some((id) => !candidate.satchel.includes(id)) ||
    previous.almanacLore.some((id) => !candidate.almanacLore.includes(id))) return false;
  for (const [key, stat] of Object.entries(previous.keyStats)) {
    const next = candidate.keyStats[key];
    if (!next || next.hits < stat.hits || next.misses < stat.misses) return false;
  }
  return true;
}
function assertCompatible(a: SaveState, b: SaveState): void {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const older = newer === a ? b : a;
  if (conflictingBranches(a, b) || (a.updatedAt === b.updatedAt && !sameSave(a, b)) ||
    !retainsProgress(newer, older)) throw new SaveConflictError();
}
interface SyncOptions { cloudDelayMs?: number; loadTimeoutMs?: number }

export class SyncedBackend implements SaveBackend {
  private scoped: LocalStorageBackend;
  private owner: string | null = null;
  private bound = false;
  private observedCloud: SaveState | null | undefined;
  private pendingCloud: SaveState | null = null;
  private cloudTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudChain: Promise<void> = Promise.resolve();
  private cloudError: Error | null = null;
  private cloudSequence = 0;
  private conflict: SaveConflict | null = null;
  constructor(private readonly local = new LocalStorageBackend(), private readonly cloud: CloudSaveBackend = new SupabaseBackend(), private readonly options: SyncOptions = {}) {
    this.scoped = local;
  }
  getLastError(): Error | null { return this.cloudError; }
  getConflict(): SaveConflict | null {
    const device = this.scoped.getConflict();
    if (device) return device;
    return this.conflict ? { local: migrate(this.conflict.local), cloud: migrate(this.conflict.cloud) } : null;
  }
  private checkCompatibility(local: SaveState, cloud: SaveState): void {
    try { assertCompatible(local, cloud); }
    catch (error) { this.conflict = { local: migrate(local), cloud: migrate(cloud) }; throw error; }
  }
  private bind(owner: string | null): void {
    this.owner = owner; this.scoped = this.local.forUser(owner); this.bound = true;
  }
  async load(): Promise<SaveState | null> {
    this.observedCloud = undefined;
    try {
      this.bind(await deadline(this.cloud.currentUserId(), this.options.loadTimeoutMs ?? CLOUD_TIMEOUT_MS));
    } catch (error) {
      this.cloudError = asError(error);
      // Without verified identity, never expose another account's cached save.
      // Guest progress remains playable; account caches stay untouched.
      this.bind(null);
      return this.scoped.load();
    }
    const local = await this.scoped.load();
    if (this.owner === null) return local;
    let remote: SaveState | null;
    try { remote = await deadline(this.cloud.load(this.owner), this.options.loadTimeoutMs ?? CLOUD_TIMEOUT_MS); }
    catch (error) {
      // Invalid/newer cloud data is protected just like local data. Network
      // failure permits local play but NEVER implies there is no cloud row.
      if (error instanceof InvalidSaveError || error instanceof UnsupportedSaveVersionError) throw error;
      this.cloudError = asError(error); return local;
    }
    this.cloudError = null;
    const cloud = remote === null ? null : migrate(remote);
    this.observedCloud = cloud;
    if (cloud && local) this.checkCompatibility(local, cloud);
    if (cloud && (!local || cloud.updatedAt > local.updatedAt)) {
      await this.scoped.save(cloud); return cloud;
    }
    if (local && (!cloud || !sameSave(local, cloud))) this.queueCloud(local);
    return local ?? cloud;
  }
  async save(state: SaveState): Promise<void> {
    if (!this.bound) await this.load();
    const valid = migrate(state);
    await this.scoped.save(valid);
    if (this.owner !== null) this.queueCloud(valid);
  }
  private queueCloud(state: SaveState): void {
    this.pendingCloud = migrate(state);
    this.cloudSequence++;
    // Coalesce frequent keystroke saves with a bounded wait (continuous typing
    // cannot postpone sync forever). One network writer preserves ordering.
    if (this.cloudTimer !== null) return;
    this.cloudTimer = setTimeout(() => {
      this.cloudTimer = null;
      void this.drainCloud().catch(() => { /* surfaced through getLastError/flush */ });
    }, this.options.cloudDelayMs ?? 2000);
  }
  private drainCloud(): Promise<void> {
    if (!this.pendingCloud || this.owner === null) return this.cloudChain;
    const snapshot = this.pendingCloud;
    const sequence = this.cloudSequence;
    const owner = this.owner;
    this.pendingCloud = null;
    const write = this.cloudChain.then(async () => {
      if (!await this.scoped.isCurrentWriter()) throw new Error("The device save changed in another window. Reopen or resolve its device-save choice before syncing; pending cloud work has been retained.");
      const remote = await this.cloud.load(owner);
      const current = remote === null ? null : migrate(remote);
      if (this.observedCloud !== undefined) {
        if (!sameNullableSave(current, this.observedCloud)) {
          // An uncertain previous request may already have written exactly this
          // snapshot. Recognize that success without rewriting someone else.
          if (current && sameSave(current, snapshot)) {
            this.observedCloud = current;
            this.cloudError = null;
            return;
          }
          this.cloudChanged(snapshot, current);
        }
      } else if (current) {
        this.checkCompatibility(snapshot, current);
        if (current.updatedAt > snapshot.updatedAt) this.cloudChanged(snapshot, current);
      }
      this.observedCloud = current;
      if (!await this.scoped.isCurrentWriter()) throw new Error("The device save changed in another window. Reopen or resolve its device-save choice before syncing; pending cloud work has been retained.");
      if (!this.cloud.saveIfUnchanged) throw new CloudSaveError("This cloud adapter cannot protect simultaneous saves. Your device progress is preserved.");
      if (!await this.cloud.saveIfUnchanged(snapshot, current, owner)) {
        const latest = await this.cloud.load(owner);
        this.cloudChanged(snapshot, latest === null ? null : migrate(latest));
      }
      this.observedCloud = migrate(snapshot);
      this.cloudError = null;
    }).catch((error: unknown) => {
      this.cloudError = asError(error);
      // Retain the newest unsynced snapshot for an explicit retry. A failed
      // old write must never replace an already pending newer snapshot.
      if (sequence === this.cloudSequence && (!this.pendingCloud || this.pendingCloud.updatedAt < snapshot.updatedAt)) this.pendingCloud = snapshot;
      throw error;
    });
    this.cloudChain = write.catch(() => {});
    return write;
  }
  private cloudChanged(local: SaveState, cloud: SaveState | null): never {
    if (cloud) {
      this.conflict = { local: migrate(local), cloud: migrate(cloud) };
      throw new SaveConflictError("The cloud save changed on another device. Both journeys are preserved; choose which to continue.");
    }
    throw new CloudSaveError("The cloud copy changed while you were playing. Your device progress is preserved; reopen the game before syncing.");
  }
  async flush(): Promise<void> {
    if (this.cloudTimer !== null) { clearTimeout(this.cloudTimer); this.cloudTimer = null; }
    await this.cloudChain;
    while (this.pendingCloud) {
      if (this.cloudTimer !== null) { clearTimeout(this.cloudTimer); this.cloudTimer = null; }
      await this.drainCloud();
    }
    if (this.cloudError) throw this.cloudError;
  }
  async resolveConflict(source: SaveSource): Promise<SaveState> {
    if (this.scoped.getConflict()?.kind === "device") {
      // Guest recovery touches only the guest slot and needs no network or
      // verified account. Account-scoped recovery must still verify its owner.
      if (this.owner !== null && await this.cloud.currentUserId() !== this.owner) throw new CloudSaveError("The signed-in account changed. Reopen the game before choosing a device save.");
      // This choice only authorizes replacing the device slot. Do not replay a
      // previously queued, potentially nonselected branch to an account.
      if (this.cloudTimer !== null) { clearTimeout(this.cloudTimer); this.cloudTimer = null; }
      this.pendingCloud = null; this.cloudSequence++;
      await this.cloudChain;
      const selected = await this.scoped.resolveConflict(source);
      this.observedCloud = undefined; this.cloudError = null; this.conflict = null;
      return selected;
    }
    const conflict = this.getConflict();
    if (!conflict || this.owner === null) throw new SaveConflictError("There is no pending account-save choice.");
    if (await this.cloud.currentUserId() !== this.owner) throw new CloudSaveError("The signed-in account changed. Reopen the game before choosing a save.");
    const latest = await this.cloud.load(this.owner);
    if (latest && !sameSave(migrate(latest), conflict.cloud)) {
      this.conflict = { local: conflict.local, cloud: migrate(latest) };
      throw new SaveConflictError("The cloud save changed while this choice was open. Review the refreshed choices before continuing.");
    }
    this.scoped.preserveConflict("local", conflict.local);
    this.scoped.preserveConflict("cloud", conflict.cloud);
    const selected = migrate({ ...conflict[source], updatedAt: Math.max(Date.now(), conflict.local.updatedAt + 1, conflict.cloud.updatedAt + 1) });
    this.observedCloud = latest === null ? null : migrate(latest);
    await this.save(selected);
    await this.flush();
    this.conflict = null;
    return selected;
  }
  /** Explicit opt-in only. Legacy/guest saves remain untouched; they are never
   * silently uploaded when another person signs into a shared computer. */
  async importGuestSave(): Promise<SaveState | null> {
    if (!this.bound) await this.load();
    if (this.owner === null) throw new CloudSaveError("Sign in before importing device-local guest progress.");
    const existing = await this.scoped.load();
    const remote = await this.cloud.load(this.owner);
    if (existing || remote) throw new SaveConflictError("This account already has progress. Guest progress has been preserved separately.");
    const guest = await this.local.forUser(null).load();
    if (!guest) return null;
    const imported = migrate({ ...guest, updatedAt: Math.max(Date.now(), guest.updatedAt + 1) });
    this.observedCloud = null;
    await this.save(imported); await this.flush();
    return imported;
  }
}

interface StoreOptions { saveDelayMs?: number; onError?: (error: Error) => void }
export class SaveStore {
  private state: SaveState;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private generation = 0;
  private persistedGeneration = 0;
  private inFlight: Promise<void> | null = null;
  private queuedGeneration = -1;
  private lastError: Error | null = null;
  constructor(private readonly backend: SaveBackend, initial: SaveState, private readonly options: StoreOptions = {}) {
    this.state = migrate(initial);
  }
  static async load(backend: SaveBackend, options: StoreOptions = {}): Promise<SaveStore> {
    const loaded = await backend.load();
    return new SaveStore(backend, loaded === null ? emptySave() : migrate(loaded), options);
  }
  get(): Readonly<SaveState> { return this.state; }
  getLastError(): Error | null { return this.lastError ?? this.backend.getLastError?.() ?? null; }
  update(mutator: (state: SaveState) => void): void {
    mutator(this.state);
    this.state.updatedAt = Math.max(Date.now(), this.state.updatedAt + 1);
    this.generation++;
    this.scheduleFlush();
  }
  setCheckpoint(checkpoint: SaveCheckpoint): void {
    const valid = validateCheckpoint(checkpoint);
    this.update((state) => { state.checkpoint = valid; });
  }
  clearCheckpoint(): void { this.update((state) => { state.checkpoint = null; }); }
  recordKeystroke(key: string, hit: boolean): void {
    this.update((state) => {
      const stat = state.keyStats[key] ?? { hits: 0, misses: 0 };
      if (hit) stat.hits++; else stat.misses++;
      state.keyStats[key] = stat;
    });
  }
  private reportError(error: unknown): void {
    this.lastError = asError(error);
    try { this.options.onError?.(this.lastError); } catch { /* UI callbacks cannot break save recovery. */ }
  }
  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.writeCurrent().catch(() => { /* reported by the write queue */ });
    }, this.options.saveDelayMs ?? 250);
  }
  private writeCurrent(): Promise<void> {
    if (this.persistedGeneration >= this.generation) return this.writeChain;
    if (this.inFlight && this.queuedGeneration === this.generation) return this.inFlight;
    const generation = this.generation;
    let snapshot: SaveState;
    try { snapshot = migrate(this.state); }
    catch (error) { this.reportError(error); return Promise.reject(error); }
    const write = this.writeChain.then(async () => {
      await this.backend.save(snapshot);
      this.persistedGeneration = generation; this.lastError = null;
    }).catch((error: unknown) => { this.reportError(error); throw error; });
    this.writeChain = write.catch(() => {});
    this.queuedGeneration = generation; this.inFlight = write;
    void write.finally(() => { if (this.inFlight === write) this.inFlight = null; }).catch(() => {});
    return write;
  }
  /** Call before pause/quit/navigation. Awaits local durability and drains
   * optional cloud work; rejects visibly while retaining data for retry. */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    try { await this.writeCurrent(); await this.backend.flush?.(); this.lastError = null; }
    catch (error) { this.reportError(error); throw error; }
  }
}
