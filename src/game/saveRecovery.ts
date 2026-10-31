import { UnsupportedSaveVersionError, type SaveRecoverySnapshot } from "./saveState";

/** Keep raw save fields and storage implementation details out of player copy. */
export function saveRecoveryPresentation(error: unknown, snapshot?: SaveRecoverySnapshot | null, storageUnavailable = false) {
  if (snapshot?.reason === "newer-version" || error instanceof UnsupportedSaveVersionError) {
    return { title: "This journey needs a newer game version", message: "Update the game, then try loading again. Your saved journey has been kept.", detail: snapshot ? "You can keep a recovery copy of the device data while you update." : "Your saved progress will not be replaced by this game version." };
  }
  if (snapshot) {
    return {
      title: "Your saved journey needs attention",
      message: "The game could not read this device's saved progress. You can keep a recovery copy or try loading again.",
      detail: snapshot.canStartFresh
        ? "A new journey starts from the beginning. Before it opens, the unreadable data will be kept separately on this device. A recovery copy preserves the data; it does not repair the old journey."
        : "Your account's progress will not be replaced here. A recovery copy preserves this device's data; it does not repair the old journey.",
    };
  }
  return storageUnavailable
    ? { title: "Saved progress is unavailable", message: "This device would not let the game read its saved data. Allow storage access, then try again.", detail: "The game has not started a new journey or replaced your saved progress." }
    : { title: "Saved progress could not load", message: "Your saved progress has not been replaced. Try loading again.", detail: "If the problem continues, reopen the game after checking your connection and game version." };
}

/** Local download only: recovery data never goes through a server or clipboard. */
export function downloadSaveRecovery(snapshot: SaveRecoverySnapshot): void {
  const file = new Blob([JSON.stringify(snapshot, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portalwrights-recovery-${new Date(snapshot.capturedAt).toISOString().replace(/[:.]/g, "-")}.json`;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give browsers time to begin the file download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
