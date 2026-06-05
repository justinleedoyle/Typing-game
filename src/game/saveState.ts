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

export function emptySave(profileName = "Wren"): SaveState {
  return {
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

export interface SaveBackend {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
}

const STORAGE_KEY = "portalwrights-almanac.save.v1";
const SUPABASE_TABLE = "player_saves";

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
    // Merge with emptySave so older saves missing newer fields (e.g. satchel,
    // added in slice 2) get sane defaults without a separate migration pass.
    const state: SaveState = loaded
      ? { ...emptySave(loaded.profileName), ...loaded }
      : emptySave();
    // Migrate legacy `purist: boolean` → difficulty tier. true → "purist";
    // the old kid-friendly default (false) becomes "standard", raising the
    // floor for existing saves. Then drop the dead field.
    const legacy = state as SaveState & { purist?: boolean };
    if (typeof legacy.purist === "boolean") {
      state.difficulty = legacy.purist ? "purist" : "standard";
      delete legacy.purist;
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
