import { saveJourneySummary } from "./saveChoice";
import { encodeJourneyTransfer, journeyTransferFilename } from "./saveTransfer";
import { SaveConflictError, UnsupportedSaveVersionError, type SaveBackend, type SaveImportPreview, type SaveState } from "./saveState";
import { showRecoveryDialog, type RecoveryDialog } from "./ui/recoveryDialog";

export interface NativeJourneyFiles {
  chooseImport(): Promise<SaveState | null>;
  exportJourney(): Promise<boolean | null>;
}

/** A browser download is a request, not confirmation that a file reached disk. */
export function downloadJourneyTransfer(state: SaveState): void {
  const url = URL.createObjectURL(new Blob([encodeJourneyTransfer(state)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = journeyTransferFilename(state);
  try { document.body.append(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

function comparison(preview: SaveImportPreview): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  const row = document.createElement("div");
  Object.assign(row.style, { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(250px, 100%), 1fr))", gap: "18px", textAlign: "left", margin: "0 0 28px" });
  for (const [label, state] of [["On this computer", preview.current], ["From the journey file", preview.incoming]] as const) {
    const card = document.createElement("section");
    Object.assign(card.style, { border: "1px solid #9e7f3c", borderRadius: "8px", background: "#211c13", padding: "20px" });
    const heading = document.createElement("h2"); heading.textContent = label;
    Object.assign(heading.style, { color: "#e6c574", fontSize: "21px", fontWeight: "normal", margin: "0 0 12px" });
    const summary = document.createElement("p"); summary.textContent = state ? saveJourneySummary(state) : "No saved journey yet";
    Object.assign(summary.style, { whiteSpace: "pre-line", fontSize: "20px", lineHeight: "1.5", margin: "0" });
    card.append(heading, summary); row.append(card);
  }
  return row;
}

/** Only the explicit review action can commit. Choosing a file, cancelling,
 * downloading or closing a screen never replaces a journey. */
export function showJourneyTransfer(options: {
  backend: SaveBackend;
  native?: NativeJourneyFiles;
  onClose(): void;
  onImported(): void;
  showDialog?: typeof showRecoveryDialog;
  download?: (state: SaveState) => void;
}): { destroy(): void } {
  let dialog: RecoveryDialog | undefined;
  let destroyed = false, busy = false, generation = 0;
  const show = options.showDialog ?? showRecoveryDialog;
  const destroy = () => { destroyed = true; generation++; dialog?.destroy(); dialog = undefined; };
  const close = () => { if (busy || destroyed) return; destroy(); options.onClose(); };
  const render = (model: Parameters<typeof showRecoveryDialog>[0]) => { dialog?.destroy(); dialog = show(model); };
  const perform = async <T>(phase: "read" | "export" | "commit", work: () => Promise<T>, success: (result: T) => void) => {
    if (busy || destroyed) return;
    busy = true; const token = ++generation; dialog?.setBusy(true);
    try {
      const result = await work();
      if (destroyed || token !== generation) return;
      busy = false; success(result);
    } catch (error) {
      if (destroyed || token !== generation) return;
      busy = false;
      const newer = error instanceof UnsupportedSaveVersionError;
      const changed = error instanceof SaveConflictError;
      render({
        title: newer ? "This journey needs a newer game version" : changed ? "The saved journey needs a fresh review" : phase === "commit" ? "The import could not be confirmed" : phase === "export" ? "The journey file could not be saved" : "The journey file could not be opened",
        message: newer ? "Update the game before trying this file again. Your existing saved data has been kept." : changed ? "A saved journey changed, or there is an unresolved save choice. Return to the title and review the current journey before importing." : phase === "commit" ? "Return to the title to check which journey is current before trying again. If replacement began, the previous data was kept in a separate recovery copy." : phase === "export" ? "Check the save location and available space. If saved data needs attention, load the current journey and use Save & return to title before exporting. Your game progress has not been replaced." : "Choose a journey file exported from the game. Recovery files and damaged files cannot be played here. If this computer's saved data needs attention, load its current journey and use Save & return to title before transferring.",
        actions: [{ label: "Return to title · Esc", shortcut: "Escape", onSelect: close }, { label: "Back to transfer · B", shortcut: "b", onSelect: () => menu() }],
      });
    }
  };
  const exportFile = () => { void perform("export", async () => {
    if (options.native) return options.native.exportJourney();
    if (!options.backend.snapshotForTransfer) throw new Error("Journey export is unavailable.");
    const state = await options.backend.snapshotForTransfer();
    if (destroyed) return false;
    if (!state) return null;
    (options.download ?? downloadJourneyTransfer)(state); return true;
  }, result => menu(result === null ? "There is no saved journey to export yet. Begin playing, then save and return to the title." : result === false ? "The file dialog was cancelled. Your journey has not changed." : options.native ? "The journey file was saved. Keep it somewhere safe." : "Your browser has been asked to download the journey file. Check your Downloads before opening it in the desktop game.")); };
  const review = (preview: SaveImportPreview) => {
    render({
      title: "Review the journey before importing",
      message: preview.current ? "The file journey will become Continue on this computer. The current journey will first be kept in a separate recovery copy." : "The file journey will become Continue on this computer.",
      detail: "The file and the original browser journey stay unchanged. Nothing has been replaced yet.",
      content: comparison(preview),
      actions: [
        { label: "Keep this computer unchanged · Esc", shortcut: "Escape", onSelect: () => menu("The import was cancelled. This computer's journey has not changed.") },
        ...(preview.current ? [{ label: "Save current journey file · E", shortcut: "e", onSelect: exportFile }] : []),
        { label: "Import this journey · I", shortcut: "i", onSelect: () => { void perform("commit", async () => {
          if (!options.backend.commitImport) throw new Error("Journey import is unavailable.");
          return options.backend.commitImport(preview.token);
        }, () => render({ title: "The journey is ready on this computer", message: "The imported journey has been saved. Return to the title and press Enter to continue it.", actions: [{ label: "Return to title · Esc", shortcut: "Escape", onSelect: () => { destroy(); options.onImported(); } }] })); } },
      ],
    });
  };
  const chooseFile = () => { void perform("read", async () => {
    const incoming = await options.native?.chooseImport();
    if (destroyed) return null;
    if (!incoming) return null;
    if (!options.backend.prepareImport) throw new Error("Journey import is unavailable.");
    return options.backend.prepareImport(incoming);
  }, preview => preview ? review(preview) : menu("The file dialog was cancelled. Your journey has not changed.")); };
  const menu = (status?: string) => render({
    title: "Move a journey",
    message: status ?? (options.native ? "Keep a portable copy of this computer's journey, or bring a journey file here from the browser game." : "Save a portable copy of the journey on this device, then open that file in the desktop game."),
    detail: options.native ? "Importing is separate from Google sign-in and cloud saving. You will review the file before anything is replaced." : "In the desktop game, choose Move a journey, then Choose a journey file. This export does not move or delete your browser save.",
    actions: [
      { label: "Back to title · Esc", shortcut: "Escape", onSelect: close },
      { label: "Save a journey file · E", shortcut: "e", onSelect: exportFile },
      ...(options.native ? [{ label: "Choose a journey file · I", shortcut: "i", onSelect: chooseFile }] : []),
    ],
  });
  menu();
  return { destroy };
}
