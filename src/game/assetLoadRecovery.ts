// Scene artwork must finish loading before create() can install gameplay,
// checkpoint writes or timers. This gate itself needs no artwork or Phaser UI.
import type Phaser from "phaser";
import { showRecoveryDialog } from "./ui/recoveryDialog";

export const ASSET_LOAD_TIMEOUT_MS = 30_000;

interface RecoveryHandle {
  destroy(): void;
  setBusy(busy: boolean): void;
  setMessage(message: string): void;
}
interface RecoveryOptions {
  title: string;
  message: string;
  detail?: string;
  actions: Array<{ label: string; shortcut?: string; onSelect: () => void }>;
}
/** Test ports let the real lifecycle be exercised without a browser or clock. */
export interface AssetLoadRecoveryEnvironment {
  schedule: (work: () => void, delayMs: number) => () => void;
  showDialog: (options: RecoveryOptions) => RecoveryHandle;
}
const browserEnvironment: AssetLoadRecoveryEnvironment = {
  schedule(work, delayMs) {
    const timer = setTimeout(work, delayMs);
    return () => clearTimeout(timer);
  },
  showDialog: showRecoveryDialog,
};
interface AssetLoadAttempt {
  blocked: boolean;
  dispose(): void;
}
const attempts = new WeakMap<Phaser.Scene, AssetLoadAttempt>();
const isArtwork = (type: string): boolean => type === "image" || type === "spritesheet";

/** Call first in preload(), before any direct or shared artwork preload. */
export function beginAssetLoad(
  scene: Phaser.Scene,
  environment: AssetLoadRecoveryEnvironment = browserEnvironment,
): void {
  attempts.get(scene)?.dispose();
  const keys = new Set<string>();
  const files = new Set<Phaser.Loader.File>();
  let disposed = false;
  let restarting = false;
  let dialog: RecoveryHandle | undefined;
  let cancelDeadline: (() => void) | undefined;
  const data = scene.sys.settings.data;
  const attempt: AssetLoadAttempt = {
    blocked: false,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelDeadline?.();
      // Phaser Loader.reset clears its sets without aborting their transports.
      // Detach both network and image-decode handlers before aborting: an old
      // response must never re-enter the same Loader reused by the next run.
      for (const file of files) {
        // ImageFile.addToCache transfers its HTMLImageElement to the texture
        // manager before pendingDestroy clears File.data. Never clear the src
        // of a successful cached image while some other request is pending.
        if (scene.textures.exists(file.key)) continue;
        const request = file.xhrLoader;
        if (request) {
          request.onload = null; request.onerror = null; request.onprogress = null;
          request.ontimeout = null; request.onabort = null;
          if (request.readyState !== 4) request.abort?.();
        }
        const image = file.data as HTMLImageElement | null;
        if (image && typeof image.removeAttribute === "function") {
          image.onload = null; image.onerror = null;
          if (image.src?.startsWith("blob:")) URL.revokeObjectURL(image.src);
          image.removeAttribute("src");
        }
      }
      files.clear();
      scene.load.off("addfile", onAdd);
      scene.load.off("loaderror", onError);
      scene.load.off("filecomplete", onFileComplete);
      scene.load.off("start", onStart);
      scene.load.off("complete", onComplete);
      scene.events.off("create", pauseBlockedScene);
      scene.events.off("shutdown", attempt.dispose);
      scene.events.off("destroy", attempt.dispose);
      dialog?.destroy();
      if (attempts.get(scene) === attempt) attempts.delete(scene);
    },
  };
  const pauseBlockedScene = (): void => {
    // Phaser overwrites status at the end of create(). Its CREATE event is the
    // first safe point to pause systems/update while keeping the DOM usable.
    if (!disposed && attempt.blocked) scene.sys.pause();
  };
  const block = (): void => {
    if (disposed || attempt.blocked) return;
    attempt.blocked = true;
    cancelDeadline?.();
    scene.events.once("create", pauseBlockedScene);
    dialog = environment.showDialog({
      title: "This part of the journey couldn’t open",
      message: "Some of the artwork couldn’t load. Your progress has not been reset.",
      detail: "Try again when you’re ready. If this keeps happening, reopening or updating the game may help.",
      actions: [{ label: "Try again · Enter", shortcut: "Enter", onSelect: () => {
        if (disposed || restarting) return;
        restarting = true;
        dialog?.setBusy(true);
        dialog?.setMessage("Opening this part of the journey again…");
        // Restart is an explicit user action. Shutdown releases the old gate
        // and transports, then preload receives the identical store/checkpoint
        // data. Successful cached textures remain available.
        scene.scene.restart(data);
      } }],
    });
  };
  const onAdd = (key: string, type: string, _loader: Phaser.Loader.LoaderPlugin, file: Phaser.Loader.File): void => {
    if (!disposed && isArtwork(type)) {
      keys.add(key);
      if (file) files.add(file);
    }
  };
  const onFileComplete = (key: string, type: string): void => {
    // Success hands image ownership to the shared texture cache. File.data may
    // still point at that live image until every other load has completed.
    for (const file of files) {
      if (file.key === key && file.type === type) files.delete(file);
    }
  };
  const onError = (file: { type: string }): void => {
    if (!disposed && isArtwork(file.type)) block();
  };
  const onStart = (): void => {
    if (disposed) return;
    cancelDeadline = environment.schedule(block, ASSET_LOAD_TIMEOUT_MS);
  };
  const onComplete = (): void => {
    if (disposed) return;
    cancelDeadline?.();
    // Phaser's image decode error is not a loaderror event. A queued image
    // without a cached texture must therefore also fail the gate at COMPLETE.
    if ([...keys].some(key => !scene.textures.exists(key))) block();
  };
  attempts.set(scene, attempt);
  scene.load.on("addfile", onAdd);
  scene.load.on("loaderror", onError);
  scene.load.on("filecomplete", onFileComplete);
  scene.load.once("start", onStart);
  scene.load.once("complete", onComplete);
  scene.events.once("shutdown", attempt.dispose);
  scene.events.once("destroy", attempt.dispose);
}

/** Call first in create(), before any image, handler, timer or save mutation. */
export function assetLoadBlocked(scene: Phaser.Scene): boolean {
  return attempts.get(scene)?.blocked ?? false;
}
