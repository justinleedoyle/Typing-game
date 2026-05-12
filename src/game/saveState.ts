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
}

export interface KeyStat {
  hits: number;
  misses: number;
}

export interface SaveState {
  profileName: string;
  typewriterAwakened: boolean;
  realms: Record<string, RealmProgress>;
  satchel: string[];
  keyStats: Record<string, KeyStat>;
  updatedAt: number;
}

export function emptySave(profileName = "Wren"): SaveState {
  return {
    profileName,
    typewriterAwakened: false,
    realms: {},
    satchel: [],
    keyStats: {},
    updatedAt: Date.now(),
  };
}

export interface SaveBackend {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
}

const STORAGE_KEY = "portalwrights-almanac.save.v1";
const SUPABASE_TABLE = "player_saves";

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
