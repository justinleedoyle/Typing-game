// Shared test setup — minimal global shims so importing modules that
// transitively pull in src/game/supabaseClient.ts (which calls createClient()
// at module-eval) doesn't throw under bare Node/tsx. Import this FIRST (before
// any src import) from any test that touches the save system.
//
// The shims are inert for the logic under test: the migration suites never open
// a socket or touch real storage — they just need createClient() to construct.

const g = globalThis as Record<string, unknown>;

// @supabase/realtime-js requires a WebSocket constructor at createClient() time
// on Node < 22 (no native WebSocket). The migration tests never subscribe, so an
// inert stub is enough to clear the constructor check.
if (typeof g.WebSocket === "undefined") {
  g.WebSocket = class {
    close(): void {}
    send(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  };
}

if (typeof g.localStorage === "undefined") {
  const mem = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
}

if (typeof g.window === "undefined") {
  g.window = {
    localStorage: g.localStorage,
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: "http://localhost/" },
  };
}

if (typeof g.document === "undefined") {
  g.document = { addEventListener: () => {}, removeEventListener: () => {} };
}
