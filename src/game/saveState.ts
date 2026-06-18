// The single source of truth for player progress. Every scene reads from
// and writes to a SaveState; the SaveBackend hides where it actually lives.
//
// Three backends ship today:
// - LocalStorageBackend: device-local cache, works offline, always written.
// - SupabaseBackend: cross-device cloud sync, requires sign-in.
// - SyncedBackend: composes the two. Reads cloud when signed in (or pushes
//   local up on first sign-in), reads local when signed out, and writes to
//   both on save.

import { supabase } from "./supabaseClient";

export interface RealmProgress {
  cleared: boolean;
  choices: Record<string, string>;
  /** True once the §5.5.10 Quiet Lord intrusion has fired in this realm.
   *  Persisted so revisiting a cleared realm does not re-fire the moment. */
  quietLordIntruded?: boolean;
  /** True once the boss-defeat fragment flash has fired for this realm.
   *  Persisted so re-defeating a boss on revisit does not replay the reveal. */
  quietLordFragmentRevealed?: boolean;
}

export interface KeyStat {
  hits: number;
  misses: number;
}

export interface SaveState {
  /** Save-format version. Bump CURRENT_SCHEMA_VERSION and add a migrate()
   *  ladder step whenever the persisted shape changes. Versionless/legacy
   *  saves (written before this field existed) are treated as version 0 and
   *  migrated up. Always equals CURRENT_SCHEMA_VERSION on an in-memory state. */
  schemaVersion: number;
  profileName: string;
  typewriterAwakened: boolean;
  /** §5.5.2 — Wren is gender-selectable. "boy" → sibling is Saga (girl,
   *  holds drawing); "girl" → sibling is Magnus (older boy, leans in
   *  doorway). null until the player picks in OpeningScene; persisted
   *  through New Game+ so Wren's identity carries across runs. */
  wrenGender: "girl" | "boy" | null;
  realms: Record<string, RealmProgress>;
  satchel: string[];
  keyStats: Record<string, KeyStat>;
  almanacLore: string[];
  /** Difficulty tier — how harshly a mid-word typo is punished. Default
   *  "standard". Cycled in-game via Ctrl+Shift+P and set in Settings. */
  difficulty: Difficulty;
  /** Player-chosen audio level. Stored as a coarse step so the Settings UI
   *  can cycle through fixed labels; the actual volume scaling is wired
   *  separately in the audio modules. Defaults to "medium". */
  audioLevel: AudioLevel;
  updatedAt: number;
}

export type AudioLevel = "loud" | "medium" | "quiet" | "off";

/** Difficulty tiers — how harshly a mid-word typo is punished.
 *  forgiving: a wrong key is free (the next correct key just advances).
 *  standard:  a wrong key resets the current word's typed progress (default).
 *  purist:    progress resets AND the claim drops — re-acquire under pressure. */
export type Difficulty = "forgiving" | "standard" | "purist";

/** Current persisted save-format version. Increment by one and add a
 *  matching step to the migrate() ladder below whenever you add or reshape a
 *  persisted field. v1 is the first explicitly-versioned format; it captures
 *  the shape that previously had no version field at all. */
export const CURRENT_SCHEMA_VERSION = 1;

export function emptySave(profileName = "Wren"): SaveState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profileName,
    typewriterAwakened: false,
    wrenGender: null,
    realms: {},
    satchel: [],
    keyStats: {},
    almanacLore: [],
    difficulty: "standard",
    audioLevel: "medium",
    updatedAt: Date.now(),
  };
}

/** A raw, pre-migration save as it came off disk/cloud: an object of unknown
 *  shape that may be any historical version (including versionless v0). */
type RawSave = Record<string, unknown>;

/** Read a save's declared schema version, treating any save without a numeric
 *  `schemaVersion` (i.e. everything written before versioning existed) as v0. */
function readSchemaVersion(raw: RawSave): number {
  const v = raw.schemaVersion;
  return typeof v === "number" ? v : 0;
}

/**
 * Bring a raw loaded save up to CURRENT_SCHEMA_VERSION by walking an explicit
 * version ladder (v0 -> v1 -> ...). Each step is responsible only for the delta
 * between two adjacent versions and must set `schemaVersion` to its target.
 *
 * This replaces the previous implicit migration — a `{ ...emptySave, ...loaded }`
 * field-merge plus an ad-hoc `purist` -> `difficulty` fix-up — with the same
 * OUTCOMES, just made explicit and extensible. Behavior is preserved exactly:
 * the v0 -> v1 step reproduces that merge-and-fix-up byte for byte.
 *
 * `raw` must be a non-null parsed object (callers handle the "no save" case by
 * starting from emptySave()). Returns a fully-populated SaveState.
 */
export function migrate(raw: RawSave): SaveState {
  let state = raw;
  // Walk one version at a time so every historical save converges on the
  // current shape regardless of how old it is.
  while (readSchemaVersion(state) < CURRENT_SCHEMA_VERSION) {
    switch (readSchemaVersion(state)) {
      case 0:
        // migrateV0ToV1 returns a typed SaveState; bridge it back to the loose
        // RawSave the ladder walks (an interface has no string index signature,
        // so the assignment needs the cast — structurally identical at runtime).
        state = migrateV0ToV1(state) as unknown as RawSave;
        break;
      default:
        // Unknown in-range version (should be unreachable): stop walking
        // rather than spin forever. The merge below still backfills fields.
        state = { ...state, schemaVersion: CURRENT_SCHEMA_VERSION };
        break;
    }
  }
  // Final safety net, identical in spirit to the old emptySave merge: guarantee
  // every current field is present (a forward-loaded or hand-edited save could
  // claim a high version yet still be missing keys). emptySave first so loaded
  // values win, then stamp the current version.
  const loaded = state as Partial<SaveState>;
  return {
    ...emptySave(loaded.profileName),
    ...loaded,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * v0 (versionless legacy) -> v1.
 *
 * Reproduces the original load-time migration outcomes exactly:
 *  1. `{ ...emptySave(loaded.profileName), ...loaded }` — backfill any field a
 *     pre-versioning save was missing (e.g. satchel) with sane defaults while
 *     letting saved values win.
 *  2. Legacy `purist: boolean` -> `difficulty` tier: true -> "purist";
 *     the old kid-friendly default (false) becomes "standard", raising the
 *     floor for existing saves. Then the dead `purist` field is dropped.
 *  3. Stamp schemaVersion = 1.
 */
function migrateV0ToV1(raw: RawSave): SaveState {
  const loaded = raw as Partial<SaveState>;
  const state: SaveState = { ...emptySave(loaded.profileName), ...loaded };
  const legacy = state as SaveState & { purist?: boolean };
  if (typeof legacy.purist === "boolean") {
    state.difficulty = legacy.purist ? "purist" : "standard";
    delete legacy.purist;
  }
  state.schemaVersion = 1;
  return state;
}

export interface SaveBackend {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
}

const STORAGE_KEY = "portalwrights-almanac.save.v1";
const SUPABASE_TABLE = "player_saves";

// A separate, device-local "last known good" snapshot. We copy the prior raw
// save here right before we overwrite it on a persisted write, and right
// before we run a migration. If a write is interrupted/corrupted or a future
// migration mangles a real child's save, this key still holds the previous
// good bytes, so recovery is possible without touching the live save slot.
// Intentionally dependency-free and best-effort: snapshotting must never throw
// into the save path, so every access is wrapped and failures are swallowed.
const LAST_KNOWN_GOOD_KEY = "portalwrights-almanac.save.v1.lkg";

/**
 * Copy whatever raw save currently lives at STORAGE_KEY into the last-known-good
 * slot. Call this *before* mutating STORAGE_KEY (a persisted write) or before
 * running a migration, so the pre-change bytes survive a bad outcome. No-op when
 * there is nothing to back up. Never throws — snapshotting is pure safety and
 * must not break the save it is protecting (e.g. localStorage unavailable or
 * over quota). Stores the raw string verbatim; no parse/serialize round-trip,
 * so it cannot itself corrupt the payload.
 */
export function snapshotLastKnownGood(): void {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current !== null) {
      localStorage.setItem(LAST_KNOWN_GOOD_KEY, current);
    }
  } catch {
    // Best-effort only; ignore quota/availability failures.
  }
}

/**
 * Read back the last-known-good snapshot as a parsed SaveState, or null if none
 * exists / it cannot be parsed. The returned value is intentionally *not*
 * migrated here — callers that want a usable state should pass it through
 * migrate(). Provided for recovery tooling; the normal load path does not need
 * it. Never throws.
 */
export function loadLastKnownGood(): SaveState | null {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_GOOD_KEY);
    return raw ? (JSON.parse(raw) as SaveState) : null;
  } catch {
    return null;
  }
}

// The cloud save-load is best-effort: if Supabase is slow, paused, unreachable,
// or the stored session token is stale, the boot must still proceed. After this
// long, SyncedBackend.load() gives up on the cloud and boots from the local
// save (guest/offline). Generous enough that a healthy cloud load wins easily.
const CLOUD_LOAD_TIMEOUT_MS = 4000;

export class LocalStorageBackend implements SaveBackend {
  async load(): Promise<SaveState | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SaveState) : null;
    } catch {
      return null;
    }
  }

  async save(state: SaveState): Promise<void> {
    // Preserve the previous good bytes before we overwrite the live slot, so an
    // interrupted/corrupted write leaves a recoverable snapshot behind.
    snapshotLastKnownGood();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export class SupabaseBackend implements SaveBackend {
  async load(): Promise<SaveState | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("state")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.state as SaveState;
  }

  async save(state: SaveState): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    await supabase
      .from(SUPABASE_TABLE)
      .upsert({ user_id: userId, state }, { onConflict: "user_id" });
  }
}

/**
 * Local-first sync. The local cache is always written so the game stays
 * responsive offline; the cloud copy is the source of truth once Aiden
 * signs in, so the same save follows him across devices.
 *
 * First-sign-in upgrade path: if a signed-in user has no cloud row yet but
 * has a local save (he played as a guest before signing in), the local
 * save is pushed up to the cloud before being returned.
 */
export class SyncedBackend implements SaveBackend {
  constructor(
    private readonly local: LocalStorageBackend = new LocalStorageBackend(),
    private readonly cloud: SupabaseBackend = new SupabaseBackend(),
  ) {}

  async load(): Promise<SaveState | null> {
    // The cloud path must never hang the boot. supabase.auth.getSession() has no
    // internal timeout — it can stall or throw when the project is paused/
    // unreachable or the stored token is stale — and TitleScene awaits this
    // before it shows anything. Race the cloud path against a timeout; on either
    // a timeout OR an error, fall back to the local save so the game always
    // boots, online or off. (The `.catch` also keeps a late cloud rejection,
    // after the timeout already won, from surfacing as an unhandled rejection.)
    const FALLBACK = Symbol("local-fallback");
    const cloud = this.loadViaCloud().catch(() => FALLBACK);
    const timeout = new Promise<typeof FALLBACK>((resolve) =>
      window.setTimeout(() => resolve(FALLBACK), CLOUD_LOAD_TIMEOUT_MS),
    );
    const result = await Promise.race([cloud, timeout]);
    // typeof guard (not `=== FALLBACK`) so TS narrows the symbol out of the union.
    return typeof result === "symbol" ? this.local.load() : result;
  }

  private async loadViaCloud(): Promise<SaveState | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const signedIn = !!sessionData.session?.user;
    if (!signedIn) return this.local.load();

    const cloudState = await this.cloud.load();
    if (cloudState) return cloudState;

    const localState = await this.local.load();
    if (localState) {
      await this.cloud.save(localState);
    }
    return localState;
  }

  async save(state: SaveState): Promise<void> {
    await this.local.save(state);
    // Fire-and-forget cloud save; failures are not fatal since local has
    // the data and the next flush will retry implicitly.
    void this.cloud.save(state).catch(() => {});
  }
}

// A small in-memory cache + autosave debouncer, so scene code can mutate
// state freely without thinking about persistence calls on every keystroke.
export class SaveStore {
  private state: SaveState;
  private flushTimer: number | null = null;

  constructor(
    private readonly backend: SaveBackend,
    initial: SaveState,
  ) {
    this.state = initial;
  }

  static async load(backend: SaveBackend): Promise<SaveStore> {
    const loaded = await backend.load();
    // No save yet → fresh state. With a save, run it up the version ladder so
    // older saves missing newer fields (e.g. satchel) get sane defaults and the
    // legacy `purist` → difficulty fix-up still applies — see migrate().
    let state: SaveState;
    if (loaded) {
      // Snapshot the pre-migration bytes before transforming them, so a bad
      // migration of a real save stays recoverable from the last-known-good key.
      snapshotLastKnownGood();
      state = migrate(loaded as unknown as RawSave);
    } else {
      state = emptySave();
    }
    return new SaveStore(backend, state);
  }

  get(): Readonly<SaveState> {
    return this.state;
  }

  update(mutator: (s: SaveState) => void): void {
    mutator(this.state);
    this.state.updatedAt = Date.now();
    this.scheduleFlush();
  }

  recordKeystroke(key: string, hit: boolean): void {
    this.update((s) => {
      const stat = s.keyStats[key] ?? { hits: 0, misses: 0 };
      if (hit) stat.hits += 1;
      else stat.misses += 1;
      s.keyStats[key] = stat;
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.backend.save(this.state);
    }, 250);
  }
}
