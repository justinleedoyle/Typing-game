import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../src/game/desktopBridge";

const bridge: DesktopBridge = {
  version: 1,
  platform: process.platform,
  openSaveSession: () => ipcRenderer.invoke("almanac:open-save"),
  requestSave: (session, operation, payload) => ipcRenderer.invoke("almanac:save", session, operation, payload),
  onCloseRequest(listener) {
    const handle = (_event: Electron.IpcRendererEvent, id: number) => { if (Number.isSafeInteger(id)) listener(id); };
    ipcRenderer.on("almanac:prepare-close", handle);
    return () => ipcRenderer.removeListener("almanac:prepare-close", handle);
  },
  finishClose: (id, saved) => ipcRenderer.send("almanac:close-result", id, saved),
};
contextBridge.exposeInMainWorld("portalwrightsDesktop", bridge);
