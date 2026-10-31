import { desktopBridge, type DesktopBridge, type DesktopSaveOperation } from "./desktopBridge";
import {
  CloudSaveError, InvalidSaveError, LocalSaveConflictError, SaveConflictError, UnsupportedSaveVersionError,
  SyncedBackend, type SaveBackend, type SaveConflict, type SaveImportPreview, type SaveRecoverySnapshot, type SaveSource, type SaveState, type SaveStore,
} from "./saveState";
import { showRecoveryDialog, type RecoveryDialog } from "./ui/recoveryDialog";

let activeStore: SaveStore | undefined;
const pendingWrites = new Set<Promise<unknown>>();
let lifecycleInstalled = false;

/** The renderer receives save operations only, never Node, a path or raw IPC. */
export class DesktopSaveBackend implements SaveBackend {
  private readonly session: Promise<string>;
  private conflict: SaveConflict | null = null;
  constructor(private readonly bridge: DesktopBridge) { this.session = bridge.openSaveSession(); }
  onStoreReady(store: SaveStore): void { activeStore = store; }
  getConflict(): SaveConflict | null { return this.conflict && structuredClone(this.conflict); }
  private async call(operation: DesktopSaveOperation, payload?: unknown): Promise<SaveState | SaveRecoverySnapshot | SaveImportPreview | boolean | null | undefined> {
    const session = await this.session;
    // Close must await interpreted failures as well as IPC delivery. A reply
    // with ok:false acknowledges transport, not a durable storage operation.
    const work = (async () => {
      const reply = await this.bridge.requestSave(session, operation, payload);
      this.conflict = reply.conflict;
      if (!reply.ok) {
        const error = reply.error;
        if (error?.name === "UnsupportedSaveVersionError") throw new UnsupportedSaveVersionError(error.version ?? 0);
        const constructors = { InvalidSaveError, LocalSaveConflictError, SaveConflictError, CloudSaveError };
        const Constructor = error && constructors[error.name as keyof typeof constructors];
        throw Constructor ? new Constructor(error?.message) : new Error(error?.message ?? "Device saving could not finish. Your previous save has been kept.");
      }
      return reply.value;
    })();
    pendingWrites.add(work);
    try { return await work; }
    finally { pendingWrites.delete(work); }
  }
  async load(): Promise<SaveState | null> { return await this.call("load") as SaveState | null; }
  async save(state: SaveState): Promise<void> { await this.call("save", state); }
  async getRecovery(): Promise<SaveRecoverySnapshot | null> { return await this.call("getRecovery") as SaveRecoverySnapshot | null; }
  async startFreshAfterRecovery(snapshot: SaveRecoverySnapshot): Promise<SaveState> { return await this.call("startFreshAfterRecovery", snapshot) as SaveState; }
  async resolveConflict(source: SaveSource): Promise<SaveState> { return await this.call("resolveConflict", source) as SaveState; }
  async snapshotForTransfer(): Promise<SaveState | null> { return await this.call("snapshotForTransfer") as SaveState | null; }
  async prepareImport(state: SaveState): Promise<SaveImportPreview> { return await this.call("prepareImport", state) as SaveImportPreview; }
  async commitImport(token: string): Promise<SaveState> { return await this.call("commitImport", token) as SaveState; }
  async chooseImport(): Promise<SaveState | null> { return await this.call("chooseImport") as SaveState | null; }
  async exportJourney(): Promise<boolean | null> { return await this.call("exportJourney") as boolean | null; }
}

export function defaultSaveBackend(): SaveBackend {
  const bridge = desktopBridge();
  return bridge ? new DesktopSaveBackend(bridge) : new SyncedBackend();
}

/** Normal window close waits for the actual current SaveStore, including its
 *250ms autosave debounce. Force termination can only retain acknowledged writes. */
export function installDesktopLifecycle(freeze: () => () => void): void {
  const bridge = desktopBridge();
  if (!bridge || lifecycleInstalled) return;
  lifecycleInstalled = true;
  bridge.onCloseRequest(createDesktopCloseHandler({ bridge, freeze }));
}

/** A testable close coordinator: freeze before sampling any debounced state. */
export function createDesktopCloseHandler(options: {
  bridge: Pick<DesktopBridge, "finishClose">;
  freeze: () => () => void;
  store?: () => SaveStore | undefined;
  waitForWrites?: () => Promise<unknown>;
  showDialog?: typeof showRecoveryDialog;
}): (id: number) => void {
  let dialog: RecoveryDialog | undefined;
  let closing = false;
  let resume: (() => void) | undefined;
  return id => {
    if (closing) return;
    resume ??= options.freeze();
    const finish = async () => {
      closing = true;
      dialog?.destroy();
      dialog = (options.showDialog ?? showRecoveryDialog)({ title: "Keeping your place", message: "Saving your latest checkpoint before closing…", actions: [] });
      dialog.setBusy(true);
      try {
        await (options.store?.() ?? activeStore)?.flush();
        await (options.waitForWrites?.() ?? Promise.all([...pendingWrites]));
        dialog?.destroy(); dialog = undefined;
        options.bridge.finishClose(id, true);
      } catch {
        closing = false; dialog?.destroy();
        dialog = (options.showDialog ?? showRecoveryDialog)({
          title: "Your journey could not finish saving",
          message: "The game will stay open so you can retry. Your last saved checkpoint has been kept.",
          actions: [
            { label: "Keep playing · Esc", shortcut: "Escape", onSelect: () => { dialog?.destroy(); dialog = undefined; resume?.(); resume = undefined; options.bridge.finishClose(id, false); } },
            { label: "Try saving and close · R", shortcut: "r", onSelect: () => { void finish(); } },
          ],
        });
      }
    };
    void finish();
  };
}
