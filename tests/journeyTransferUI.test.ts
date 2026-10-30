import { downloadJourneyTransfer, showJourneyTransfer } from "../src/game/journeyTransferUI";
import { decodeJourneyTransfer } from "../src/game/saveTransfer";
import { showRecoveryDialog } from "../src/game/ui/recoveryDialog";
import { emptySave, SaveConflictError, type SaveBackend, type SaveImportPreview } from "../src/game/saveState";
import { assert, assertEqual, suite } from "./_assert";

function fixture(options: { native?: boolean; current?: boolean } = {}) {
  let model: any, imported = 0, closed = 0, writes = 0, reads = 0, exports = 0;
  const current = options.current ? emptySave("Current desktop") : null;
  const incoming = emptySave("Browser journey"); incoming.checkpoint = { scene: "OpeningScene", step: "arrival", data: {} };
  const preview: SaveImportPreview = { token: "issued-preview", current, incoming };
  let release: (() => void) | undefined;
  let failCommit = false;
  const backend: SaveBackend = { async load() { return current; }, async save() { throw new Error("Ordinary save must not be used to import"); },
    async snapshotForTransfer() { exports++; return current; },
    async prepareImport(state) { reads++; assertEqual(state, incoming, "only the validated selected file is reviewed"); return structuredClone(preview); },
    async commitImport(token) { writes++; assertEqual(token, "issued-preview", "commit uses only the backend-issued token");
      await new Promise<void>(done => { release = done; }); if (failCommit) throw new SaveConflictError(); return incoming;
    },
  };
  const native = options.native ? { async chooseImport() { return incoming; }, async exportJourney() { exports++; return true; } } : undefined;
  const ui = showJourneyTransfer({ backend, native, onClose() { closed++; }, onImported() { imported++; },
    download() { exports++; }, showDialog(next) { model = next; return { destroy() {}, setMessage() {}, setBusy() {} }; } });
  const action = (shortcut: string) => model.actions.find((item: any) => item.shortcut === shortcut).onSelect();
  const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  return { backend, incoming, preview, ui, action, settle, model: () => model, counts: () => ({ imported, closed, writes, reads, exports }),
    release: () => release?.(), fail: () => { failCommit = true; } };
}

await suite("Journey transfer UI: choosing and cancelling never replace a current journey", async () => {
  const f = fixture({ native: true, current: true });
  f.action("i"); await f.settle();
  assertEqual([f.counts().reads, f.counts().writes], [1, 0], "file selection prepares a read-only review without ordinary saving");
  assert(f.model().message.includes("separate recovery copy"), "existing desktop progress has an explicit preservation explanation before consent");
  assertEqual(f.model().actions[0].shortcut, "Escape", "the initially focused review action safely keeps the computer unchanged");
  f.action("Escape");
  assertEqual(f.counts().writes, 0, "leaving the comparison never invokes commit");
  f.action("Escape"); assertEqual(f.counts().closed, 1, "back returns control to the title");
});

await suite("Journey transfer UI: explicit import waits for acknowledgement, suppresses repeats and refreshes Title", async () => {
  const f = fixture({ native: true });
  f.action("i"); await f.settle();
  const confirm = f.model().actions.find((item: any) => item.shortcut === "i");
  confirm.onSelect(); confirm.onSelect(); await f.settle();
  assertEqual([f.counts().writes, f.counts().imported], [1, 0], "repeated keys cannot duplicate a pending commit or acknowledge it early");
  f.release(); await f.settle();
  assert(f.model().title.includes("ready"), "success appears only after durable commit acknowledgement");
  f.action("Escape"); assertEqual([f.counts().imported, f.counts().closed], [1, 0], "Title is reloaded with the imported store, not the previous store");
});

await suite("Journey transfer UI: failed or stale commit never claims success or retries an unreviewed token", async () => {
  const f = fixture({ native: true, current: true });
  f.action("i"); await f.settle(); f.fail(); f.action("i"); await f.settle(); f.release(); await f.settle();
  assertEqual(f.counts().imported, 0, "a rejected save cannot silently become the active store");
  assert(f.model().title.includes("fresh review"), "changed saves require reloading and review");
  assert(!f.model().actions.some((item: any) => item.shortcut === "i"), "the failed confirmation cannot be blindly resubmitted");
  f.action("Escape"); assertEqual(f.counts().closed, 1, "the player can reopen current Title recovery");
});

await suite("Journey transfer UI: browser export is read-only and shutdown blocks late download/review", async () => {
  const f = fixture({ current: true });
  assert(!f.model().actions.some((item: any) => item.shortcut === "i"), "browser transfer does not expose desktop import");
  f.action("e"); await f.settle();
  assertEqual([f.counts().writes, f.counts().exports], [0, 2], "browser export reads its durable snapshot and requests a download without import writes");
  assert(f.model().message.includes("asked to download"), "requesting a browser download does not claim physical file delivery");
  let resolve: ((state: any) => void) | undefined, downloaded = false, models = 0;
  const ui = showJourneyTransfer({ backend: { async load() { return null; }, async save() {}, snapshotForTransfer() { return new Promise(done => { resolve = done; }); } },
    onClose() {}, onImported() {}, download() { downloaded = true; }, showDialog(model) { models++; (globalThis as any).__journeyModel = model; return { destroy() {}, setMessage() {}, setBusy() {} }; } });
  const model = (globalThis as any).__journeyModel; delete (globalThis as any).__journeyModel;
  model.actions.find((item: any) => item.shortcut === "e").onSelect(); ui.destroy(); resolve?.(emptySave());
  await f.settle(); assertEqual([downloaded, models], [false, 1], "a destroyed Title cannot download or reopen a transfer screen after a late read");
});

// DOM plumbing only: the production dialog, event handlers, Blob encoding and
// object URL ownership run unchanged. Browser delivery is verified separately.
function downloadDOM() {
  type Listener = { callback: (event: any) => void; capture: boolean };
  const blobs = new Map<string, Blob>(), revoked: string[] = [], requests: string[] = [];
  let sequence = 0;
  class Element {
    readonly tagName: string;
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    attributes = new Map<string, string>();
    children: Element[] = [];
    parent: Element | undefined;
    listeners = new Map<string, Listener[]>();
    textContent = "";
    download = "";
    type = "";
    disabled = false;
    constructor(tag: string) { this.tagName = tag.toUpperCase(); }
    get href() { return this.getAttribute("href") ?? ""; }
    set href(value: string) { this.setAttribute("href", value); }
    get tabIndex() { return Number(this.getAttribute("tabindex") ?? (this.tagName === "BUTTON" || (this.tagName === "A" && this.href) ? "0" : "-1")); }
    get isConnected() { return document.body.contains(this); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    append(...elements: Element[]) { for (const element of elements) { element.remove(); this.children.push(element); element.parent = this; } }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = undefined; }
    contains(element: Element | null): boolean { return element === this || this.children.some(child => child.contains(element)); }
    querySelectorAll(selector: string): Element[] & { item(index: number): Element | null } {
      const matches = (element: Element) => selector.split(",").some(part => {
        switch (part.trim()) {
          case "[data-recovery-dialog]": return Object.hasOwn(element.dataset, "recoveryDialog");
          case "a[href]": return element.tagName === "A" && element.getAttribute("href") !== null;
          case "button": return element.tagName === "BUTTON";
          default: throw new Error(`Unexpected test DOM selector: ${part}`);
        }
      });
      const elements: Element[] = [];
      const visit = (element: Element) => { for (const child of element.children) { if (matches(child)) elements.push(child); visit(child); } };
      visit(this);
      return Object.assign(elements, { item(index: number) { return elements[index] ?? null; } });
    }
    addEventListener(name: string, callback: (event: any) => void, capture = false) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), { callback, capture }]); }
    focus() {
      const old = document.activeElement;
      document.activeElement = this;
      for (const { callback } of old?.listeners.get("blur") ?? []) callback({ target: old });
      for (const { callback } of this.listeners.get("focus") ?? []) callback({ target: this });
    }
    click() {
      if (this.disabled) return;
      const ancestors: Element[] = [];
      for (let parent = this.parent; parent; parent = parent.parent) ancestors.push(parent);
      const event = { target: this, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      const notify = (element: Element, capture: boolean) => {
        for (const listener of element.listeners.get("click") ?? []) {
          if (event.stopped) return;
          if (listener.capture === capture) listener.callback(event);
        }
      };
      for (const ancestor of [...ancestors].reverse()) notify(ancestor, true);
      notify(this, true); notify(this, false);
      for (const ancestor of ancestors) notify(ancestor, false);
      if (this.tagName === "A" && this.href && !event.defaultPrevented) requests.push(this.href);
    }
  }
  const document = { body: new Element("body"), activeElement: null as Element | null,
    createElement(tag: string) { return new Element(tag); }, querySelectorAll(selector: string) { return this.body.querySelectorAll(selector); } };
  const window = new EventTarget();
  const values = { document, window, HTMLElement: Element };
  const originals = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  URL.createObjectURL = value => { const url = `blob:journey-transfer-${++sequence}`; blobs.set(url, value as Blob); return url; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  const key = (value: string, shiftKey = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: value, shiftKey, ctrlKey: false, metaKey: false, altKey: false, repeat: false });
    window.dispatchEvent(event); return event;
  };
  return { document, blobs, revoked, requests, key,
    links: () => document.body.querySelectorAll("a[href]"),
    buttons: () => document.body.querySelectorAll("button"),
    restore() {
      URL.createObjectURL = create; URL.revokeObjectURL = revoke;
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

await suite("Journey transfer download: a real JSON link survives the automatic request and disposes explicitly", async () => {
  const f = downloadDOM();
  try {
    const state = emptySave("Browser journey");
    state.checkpoint = { scene: "OpeningScene", step: "arrival", data: {} };
    const download = downloadJourneyTransfer(state);
    const url = download.link.href;
    assertEqual(f.requests, [url], "the initial request uses the same actual link that remains available");
    assert(download.link.isConnected && download.link.textContent === "Download journey file", "the returned download is a visible named anchor");
    assert(download.link.download.endsWith(".json"), "the actual link requests a journey JSON filename");
    assertEqual(decodeJourneyTransfer(await f.blobs.get(url)!.text()), state, "the link payload round-trips the durable journey without any recovery or account data");
    assertEqual(f.revoked, [], "the URL has no short expiry while the player still needs the link");
    download.link.click(); assertEqual(f.requests, [url, url], "manual activation retries the same encoded file without reading or writing the save");
    download.dispose(); download.dispose(); download.link.click();
    assertEqual(f.revoked, [url], "disposal releases the URL once");
    assert(!download.link.isConnected && download.link.getAttribute("href") === null, "the disposed anchor is removed and has no live target");
    assertEqual(f.requests.length, 2, "a retained old anchor cannot request a stale download after disposal");
  } finally { f.restore(); }
});

await suite("Journey transfer dialog: retained link is read-only, replaced per export and released on shutdown", async () => {
  const f = downloadDOM(); let ui: ReturnType<typeof showJourneyTransfer> | undefined;
  try {
    const state = emptySave("Durable browser journey");
    let reads = 0, writes = 0, release: ((state: ReturnType<typeof emptySave>) => void) | undefined;
    const backend: SaveBackend = { async load() { return state; }, async save() { writes++; },
      snapshotForTransfer() { reads++; return reads === 1 ? Promise.resolve(state) : new Promise(done => { release = done; }); } };
    ui = showJourneyTransfer({ backend, onClose() {}, onImported() {} });
    f.buttons().find(button => button.textContent.includes("Save a journey"))!.click();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const first = f.links()[0], firstURL = first.href;
    assertEqual([reads, writes, f.requests.length], [1, 0, 1], "browser export only reads its durable snapshot and requests a file");
    assertEqual(f.links().length, 1, "the export result contains one persistent actual download anchor");
    assertEqual(decodeJourneyTransfer(await f.blobs.get(firstURL)!.text()), state, "the dialog link contains the exported saved journey");
    assert(f.buttons()[0] === f.document.activeElement, "Back remains the safe initial focused action after export");
    f.key("Tab", true); assertEqual(f.document.activeElement, first, "Shift+Tab from Back reaches the actual content link");
    assert(!f.key("Enter").defaultPrevented, "Enter on the focused link retains its native download action");
    f.key("Tab"); assertEqual(f.document.activeElement, f.buttons()[0], "Tab returns from the link to Back within the dialog");
    f.buttons().find(button => button.textContent.includes("Save a journey"))!.click();
    assertEqual(f.revoked, [firstURL], "requesting a newer copy disposes the previous URL immediately");
    first.click(); assertEqual(f.requests.length, 1, "the old retained anchor cannot request a superseded export");
    release!(state); for (let i = 0; i < 8; i++) await Promise.resolve();
    const second = f.links()[0], secondURL = second.href;
    assert(secondURL !== firstURL && second.isConnected, "the new snapshot receives its own visible link");
    ui.destroy(); second.click();
    assertEqual(f.revoked, [firstURL, secondURL], "scene exit disposes the remaining URL");
    assertEqual([writes, f.requests.length, f.links().length], [0, 2, 0], "exit never writes the save or leaves a usable stale download");
  } finally { ui?.destroy(); f.restore(); }
});

await suite("Recovery dialog: content links join the focus trap and cannot activate while busy", () => {
  const f = downloadDOM(); let dialog: ReturnType<typeof showRecoveryDialog> | undefined;
  try {
    const link = f.document.createElement("a"); link.href = "blob:focus-test";
    dialog = showRecoveryDialog({ title: "Transfer", message: "A file request is ready", content: link as unknown as HTMLElement,
      actions: [{ label: "Back", onSelect() {} }, { label: "Save", onSelect() {} }] });
    const buttons = f.buttons();
    assertEqual(f.document.activeElement, buttons[0], "safe Back receives initial focus rather than the download");
    f.key("Tab"); assertEqual(f.document.activeElement, buttons[1], "Tab advances through the normal controls");
    f.key("Tab"); assertEqual(f.document.activeElement, link, "the focus trap wraps to the content anchor");
    assert(!f.key("Enter").defaultPrevented, "native Enter activation is permitted for the anchor");
    link.click(); assertEqual(f.requests.length, 1, "an available content link keeps its normal download behavior");
    dialog.setBusy(true);
    assertEqual([link.tabIndex, link.getAttribute("aria-disabled")], [-1, "true"], "busy links are marked unavailable and excluded from keyboard focus");
    assert(f.key("Enter").defaultPrevented && f.key("Tab").defaultPrevented, "busy keyboard input cannot activate or focus a link");
    link.click(); assertEqual(f.requests.length, 1, "busy pointer activation is prevented too");
    dialog.setBusy(false);
    assertEqual([link.tabIndex, link.getAttribute("aria-disabled"), f.document.activeElement], [0, null, buttons[0]], "ready state restores link semantics and safe Back focus");
    link.click(); assertEqual(f.requests.length, 2, "the content link works again after the operation settles");
  } finally { dialog?.destroy(); f.restore(); }
});

await suite("Journey transfer dialog: a late snapshot after exit never creates a file URL or anchor", async () => {
  const f = downloadDOM(); let ui: ReturnType<typeof showJourneyTransfer> | undefined;
  try {
    let release: ((state: ReturnType<typeof emptySave>) => void) | undefined;
    ui = showJourneyTransfer({ backend: { async load() { return null; }, async save() { throw new Error("Export must not save"); },
      snapshotForTransfer() { return new Promise(done => { release = done; }); } }, onClose() {}, onImported() {} });
    f.buttons().find(button => button.textContent.includes("Save a journey"))!.click();
    ui.destroy(); release!(emptySave());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assertEqual([f.blobs.size, f.requests.length, f.links().length], [0, 0, 0], "a pending export cannot recreate a download after its scene is gone");
  } finally { ui?.destroy(); f.restore(); }
});
