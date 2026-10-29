import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { LocalStorageBackend, migrate } from "../src/game/saveState";
import type { DesktopSaveReply, DesktopSaveOperation } from "../src/game/desktopBridge";
import { FileStoragePort } from "./fileStorage";
import { desktopReviewProfile } from "./reviewProfile";
import { parseDesktopSmokeArgs, prepareDesktopSmoke, runDesktopSmoke } from "./smoke";

const GAME_URL = "almanac://game/index.html";
const smoke = parseDesktopSmokeArgs(process.argv);
const reviewProfile = desktopReviewProfile(process.argv);
app.setName("Portalwrights Almanac");
if (smoke) app.setPath("userData", smoke.profile);
else if (reviewProfile) app.setPath("userData", reviewProfile);
protocol.registerSchemesAsPrivileged([{ scheme: "almanac", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let window: BrowserWindow | undefined;
let allowClose = false;
let closeRequest = 0;
let waitingForClose = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let nativeClosePrompt = false;
const saves = new Map<string, LocalStorageBackend>();
const unexpectedRequests: string[] = [];

function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return Boolean(window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === GAME_URL);
}

async function start(): Promise<void> {
  const contentRoot = resolve(app.getAppPath(), "desktop-dist/renderer");
  const disk = new FileStoragePort(join(app.getPath("userData"), "journeys"));
  const smokeBackend = new LocalStorageBackend(disk);
  if (smoke) await prepareDesktopSmoke(smokeBackend, smoke.phase);

  protocol.handle("almanac", request => {
    const url = new URL(request.url);
    if (url.host !== "game" || !["GET", "HEAD"].includes(request.method)) return new Response("Unavailable", { status: 404 });
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("Unavailable", { status: 400 }); }
    const file = resolve(contentRoot, `.${pathname}`);
    const child = relative(contentRoot, file);
    if (isAbsolute(child) || child === ".." || child.startsWith("../") || child.startsWith("..\\") || pathname.includes("\\") || pathname.includes("\0")) return new Response("Unavailable", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  // The installed edition is self-contained: no sign-in, remote pages or CDN
  // resources. IPC only accepts this exact packaged top-level document.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) => {
    unexpectedRequests.push(new URL(details.url).origin); callback({ cancel: true });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    "Content-Security-Policy": ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'"],
  } }));
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: "#0b0a0f",
    title: "The Portalwright's Almanac", autoHideMenuBar: true, show: false,
    webPreferences: { preload: join(app.getAppPath(), "desktop-dist/preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, devTools: !app.isPackaged },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => { if (url !== GAME_URL) event.preventDefault(); });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  const interruptedClose = async () => {
    if (!window || window.isDestroyed() || nativeClosePrompt || !waitingForClose) return;
    nativeClosePrompt = true;
    try {
      const result = await dialog.showMessageBox(window, {
        type: "warning", title: "The game is still trying to save",
        message: "The game has not confirmed the latest checkpoint. You can keep waiting, or close with the last saved checkpoint.",
        buttons: ["Keep waiting", "Close with last saved checkpoint"], defaultId: 0, cancelId: 0,
      });
      if (result.response === 1 && !window.isDestroyed()) { allowClose = true; window.close(); }
    } finally { nativeClosePrompt = false; }
  };
  window.webContents.on("render-process-gone", async () => {
    clearTimeout(closeTimer); waitingForClose = false; saves.clear();
    if (!window || window.isDestroyed() || smoke) return;
    const result = await dialog.showMessageBox(window, { type: "error", title: "The journey was interrupted", message: "The game stopped unexpectedly. Your last saved checkpoint has been kept.", buttons: ["Reopen the journey", "Close"], defaultId: 0, cancelId: 1 });
    if (window.isDestroyed()) return;
    if (result.response === 0) void window.loadURL(GAME_URL);
    else { allowClose = true; window.close(); }
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11" && !input.control && !input.meta && !input.alt) {
      event.preventDefault(); window?.setFullScreen(!window.isFullScreen());
    }
  });
  window.on("close", event => {
    if (allowClose) return;
    event.preventDefault();
    if (waitingForClose) { void interruptedClose(); return; }
    waitingForClose = true;
    window?.webContents.send("almanac:prepare-close", ++closeRequest);
    closeTimer = setTimeout(() => { void interruptedClose(); }, 8000);
  });
  ipcMain.handle("almanac:open-save", event => {
    if (!trusted(event)) throw new Error("Save access is unavailable.");
    const token = randomUUID(); saves.set(token, new LocalStorageBackend(disk)); return token;
  });
  ipcMain.handle("almanac:save", async (event, token: unknown, operation: DesktopSaveOperation, payload: unknown): Promise<DesktopSaveReply> => {
    if (!trusted(event) || typeof token !== "string" || !saves.has(token)) throw new Error("Save access is unavailable.");
    const backend = saves.get(token)!;
    try {
      let value;
      if (operation === "load") value = await backend.load();
      else if (operation === "save") { await backend.save(migrate(payload)); }
      else if (operation === "getRecovery") value = await backend.getRecovery();
      else if (operation === "startFreshAfterRecovery") value = await backend.startFreshAfterRecovery(payload as Parameters<typeof backend.startFreshAfterRecovery>[0]);
      else if (operation === "resolveConflict" && (payload === "local" || payload === "cloud")) value = await backend.resolveConflict(payload);
      else throw new Error("This save action is unavailable.");
      return { ok: true, value, conflict: backend.getConflict() };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("Device saving could not finish.");
      return { ok: false, conflict: backend.getConflict(), error: { name: failure.name, message: failure.message, version: "version" in failure ? Number(failure.version) : undefined } };
    }
  });
  ipcMain.on("almanac:close-result", (event, id: unknown, saved: unknown) => {
    if (!trusted(event) || !waitingForClose || id !== closeRequest) return;
    waitingForClose = false;
    clearTimeout(closeTimer);
    if (saved === true) { allowClose = true; window?.close(); }
  });
  await window.loadURL(GAME_URL);
  window.show();
  if (smoke) {
    await runDesktopSmoke({ ...smoke, window, backend: smokeBackend, unexpectedRequests });
    if (smoke.phase !== "crash") window.close();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.restore(); window?.focus(); });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(start).catch(error => {
    console.error("Desktop startup failed", error);
    if (!smoke) dialog.showErrorBox("The journey could not open", "The game could not open its installed files or save folder. Your existing progress has not been reset. Reopen the game after checking available storage.");
    app.exit(1);
  });
}
