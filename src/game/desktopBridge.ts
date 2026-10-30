import type { SaveConflict, SaveImportPreview, SaveRecoverySnapshot, SaveState } from "./saveState";

export type DesktopSaveOperation = "load" | "save" | "getRecovery" | "startFreshAfterRecovery" | "resolveConflict" | "snapshotForTransfer" | "prepareImport" | "commitImport" | "chooseImport" | "exportJourney";
export interface DesktopSaveReply {
  ok: boolean;
  value?: SaveState | SaveRecoverySnapshot | SaveImportPreview | boolean | null;
  conflict: SaveConflict | null;
  error?: { name: string; message: string; version?: number };
}
export interface DesktopBridge {
  version: 1;
  platform: string;
  openSaveSession(): Promise<string>;
  requestSave(session: string, operation: DesktopSaveOperation, payload?: unknown): Promise<DesktopSaveReply>;
  onCloseRequest(listener: (id: number) => void): () => void;
  finishClose(id: number, saved: boolean): void;
}
declare global { interface Window { portalwrightsDesktop?: DesktopBridge } }

export function desktopBridge(): DesktopBridge | undefined {
  return typeof window !== "undefined" && window.portalwrightsDesktop?.version === 1 ? window.portalwrightsDesktop : undefined;
}
