// The single source of truth for player progress. Every scene reads from
// and writes to a SaveState; the SaveBackend hides where it actually lives.
//
// Phase 1 slice 1 ships only the LocalStorageBackend. Phase 1 slice N
// adds a SupabaseBackend that implements the same interface, letting Aiden's
// progress follow him across devices. localStorage stays as an offline cache
// even after Supabase lands.

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
  keyStats: Record<string, KeyStat>;
  updatedAt: number;
}

export function emptySave(profileName = "Wren"): SaveState {
  return {
    profileName,
    typewriterAwakened: false,
    realms: {},
    keyStats: {},
    updatedAt: Date.now(),
  };
}

export interface SaveBackend {
  load(): Promise<SaveState | null>;
  save(state: SaveState): Promise<void>;
}

const STORAGE_KEY = "portalwrights-almanac.save.v1";

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
    const loaded = (await backend.load()) ?? emptySave();
    return new SaveStore(backend, loaded);
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
