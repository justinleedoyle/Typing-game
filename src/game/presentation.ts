import type Phaser from "phaser";
import type { SaveStore } from "./saveState";

export const PRESENTATION_CHANGED = "chapter-presentation-changed";
const STORE_KEY = "chapter-presentation-store";

/** Bind the shared player preferences before a scene creates its artwork. */
export function installPresentation(scene: Phaser.Scene, store: SaveStore): void {
  scene.data.set(STORE_KEY, store);
}
export function chapterPreferences(scene: Phaser.Scene) {
  return (scene.data.get(STORE_KEY) as SaveStore | undefined)?.get();
}
export function reducedMotion(scene: Phaser.Scene): boolean {
  return chapterPreferences(scene)?.reducedMotion === true;
}
export function reducedFlashes(scene: Phaser.Scene): boolean {
  return chapterPreferences(scene)?.reducedFlashes === true;
}

/** Only decorative tweens belong here; enemy travel and timers stay playable. */
export function decorativeTween(scene: Phaser.Scene, tween: Phaser.Tweens.Tween): void {
  const apply = () => reducedMotion(scene) ? tween.pause() : tween.resume();
  apply();
  scene.events.on(PRESENTATION_CHANGED, apply);
  scene.events.once("shutdown", () => scene.events.off(PRESENTATION_CHANGED, apply));
}


const LOCAL_SAVE_NOTICE_KEY = "local-save-notice-until";
/** A non-blocking notice survives a scene change when only cloud sync failed. */
export function rememberLocalSaveNotice(scene: Phaser.Scene): void {
  scene.registry.set(LOCAL_SAVE_NOTICE_KEY, Date.now() + 8000);
}
export function localSaveNotice(scene: Phaser.Scene): string | null {
  const until = scene.registry.get(LOCAL_SAVE_NOTICE_KEY) as number | undefined;
  return until !== undefined && until > Date.now()
    ? "Saved on this device; cloud sync will retry" : null;
}
