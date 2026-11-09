import type Phaser from "phaser";
import { getAudioContext, getMasterGain } from "./context";
import { needsInterruptionPause } from "../game/sceneInterruption";
import { SoundscapePlayer, type LoopSpec, type SoundscapeStatus } from "./soundscapePlayer";
import home from "../../art/audio/hearth-theme.mp3";
import winter from "../../art/audio/winter-theme.mp3";
import hearth from "../../art/audio/hearth.mp3";
import wind from "../../art/audio/wind.mp3";
import stream from "../../art/audio/stream.mp3";
import snow from "../../art/audio/snow.mp3";
import wood from "../../art/audio/wood.mp3";
import stone from "../../art/audio/stone.mp3";
import bough from "../../art/audio/bough.mp3";
import flame from "../../art/audio/flame.mp3";
import bellTheme from "../../art/audio/bell-theme.mp3";
import bellClearTheme from "../../art/audio/bell-clear-theme.mp3";
import bellWater from "../../art/audio/bell-water.mp3";
import bellMasonry from "../../art/audio/bell-masonry.mp3";
import bellLantern from "../../art/audio/bell-lantern.mp3";
import bellLatch from "../../art/audio/bell-latch.mp3";
import bellRubble from "../../art/audio/bell-rubble.mp3";
import bellRelease from "../../art/audio/bell-release.mp3";
import forgeTheme from "../../art/audio/forge-theme.mp3";
import forgeClearTheme from "../../art/audio/forge-clear-theme.mp3";
import forgeFurnace from "../../art/audio/forge-furnace.mp3";
import forgeMechanism from "../../art/audio/forge-mechanism.mp3";
import forgeWheel from "../../art/audio/forge-wheel.mp3";
import forgeLock from "../../art/audio/forge-lock.mp3";
import forgeGear from "../../art/audio/forge-gear.mp3";
import forgeFlame from "../../art/audio/forge-flame.mp3";

export type SoundscapeMood = "home" | "winter-trail" | "winter-glade" | "winter-threat" | "winter-rest" | "winter-return"
  | "bell-depths" | "bell-rhythm" | "bell-rest" | "bell-silence"
  | "forge-workshop" | "forge-workshop-slow" | "forge-threat" | "forge-threat-slow"
  | "forge-rest" | "forge-rest-slow" | "forge-still" | "forge-still-slow";
export type MaterialSound = "snow" | "wood" | "stone" | "bough" | "flame" | "bell-lantern" | "bell-latch" | "bell-rubble" | "bell-release"
  | "forge-wheel" | "forge-lock" | "forge-gear" | "forge-flame";
const materials: Record<MaterialSound, string> = { snow, wood, stone, bough, flame,
  "bell-lantern": bellLantern, "bell-latch": bellLatch, "bell-rubble": bellRubble, "bell-release": bellRelease,
  "forge-wheel": forgeWheel, "forge-lock": forgeLock, "forge-gear": forgeGear, "forge-flame": forgeFlame };
const loop = (id: string, url: string, gain: number): LoopSpec => ({ id, url, gain });
const moods: Record<SoundscapeMood, readonly LoopSpec[]> = {
  home: [loop("home-theme", home, .65), loop("hearth", hearth, .6)],
  "winter-trail": [loop("winter-theme", winter, .55), loop("wind", wind, .48), loop("stream", stream, .43)],
  "winter-glade": [loop("winter-theme", winter, .55), loop("wind", wind, .35)],
  "winter-threat": [loop("winter-theme", winter, .28), loop("wind", wind, .58)],
  "winter-rest": [loop("home-theme", home, .42), loop("wind", wind, .23)],
  "winter-return": [loop("home-theme", home, .42), loop("wind", wind, .28), loop("stream", stream, .4)],
  "bell-depths": [loop("bell-theme", bellTheme, .48), loop("bell-water", bellWater, .55), loop("bell-masonry", bellMasonry, .3)],
  // Existing tolls are the timing instruction. No competing musical pulse.
  "bell-rhythm": [loop("bell-water", bellWater, .35)],
  "bell-rest": [loop("bell-clear-theme", bellClearTheme, .4), loop("bell-water", bellWater, .35)],
  // Taking the clapper leaves the place hollow: no score or recurring toll.
  "bell-silence": [loop("bell-water", bellWater, .28)],
  "forge-workshop": [loop("forge-theme", forgeTheme, .45), loop("forge-furnace", forgeFurnace, .48), loop("forge-mechanism", forgeMechanism, .32)],
  "forge-workshop-slow": [loop("forge-theme", forgeTheme, .38), loop("forge-furnace", forgeFurnace, .24), loop("forge-mechanism", forgeMechanism, .13)],
  "forge-threat": [loop("forge-theme", forgeTheme, .22), loop("forge-furnace", forgeFurnace, .34), loop("forge-mechanism", forgeMechanism, .18)],
  "forge-threat-slow": [loop("forge-theme", forgeTheme, .2), loop("forge-furnace", forgeFurnace, .18), loop("forge-mechanism", forgeMechanism, .08)],
  "forge-rest": [loop("forge-clear-theme", forgeClearTheme, .4), loop("forge-furnace", forgeFurnace, .3), loop("forge-mechanism", forgeMechanism, .15)],
  "forge-rest-slow": [loop("forge-clear-theme", forgeClearTheme, .36), loop("forge-furnace", forgeFurnace, .16), loop("forge-mechanism", forgeMechanism, .07)],
  // The peaceful order stills the golems; the furnace can keep breathing.
  "forge-still": [loop("forge-clear-theme", forgeClearTheme, .35), loop("forge-furnace", forgeFurnace, .18)],
  "forge-still-slow": [loop("forge-clear-theme", forgeClearTheme, .32), loop("forge-furnace", forgeFurnace, .09)],
};
// Failed requests are evicted so deliberate re-entry can recover. No asset can
// stall a scene's artwork gate or prevent a saved journey from loading.
const decoded = new Map<string, Promise<AudioBuffer>>();
function load(url: string): Promise<AudioBuffer> {
  let pending = decoded.get(url);
  if (!pending) {
    pending = fetch(url).then(response => {
      if (!response.ok) throw new Error("Sound asset unavailable");
      return response.arrayBuffer();
    }).then(bytes => getAudioContext().decodeAudioData(bytes)).catch(error => { decoded.delete(url); throw error; });
    decoded.set(url, pending);
  }
  return pending;
}
export interface SceneSoundscape {
  setMood(mood: SoundscapeMood): void;
  cue(material: MaterialSound): void;
  stop(): void;
  status(): SoundscapeStatus & { mood: SoundscapeMood; scene: string };
}
let current: SceneSoundscape | undefined;

/** Read-only engineering evidence, also used by the local audio review page.
 * Contains no save, identity, text input or account data. */
export function soundscapeStatus(): ReturnType<SceneSoundscape["status"]> | null { return current?.status() ?? null; }

export function installSoundscape(scene: Phaser.Scene, initial: SoundscapeMood): SceneSoundscape {
  current?.stop();
  let mood = initial, disposed = false;
  const player = new SoundscapePlayer(getAudioContext(), getMasterGain(), load,
    needsInterruptionPause(scene.game) || scene.sys.isPaused());
  const pause = (): void => player.pause();
  const resume = (): void => { if (!needsInterruptionPause(scene.game)) player.resume(); };
  const hidden = (): void => { if (document.hidden) pause(); };
  const stop = (): void => {
    if (disposed) return;
    disposed = true; player.stop();
    scene.events.off("pause", pause); scene.events.off("sleep", pause);
    scene.events.off("resume", resume); scene.events.off("wake", resume);
    scene.events.off("shutdown", stop); scene.events.off("destroy", stop);
    scene.game.events.off("blur", pause); scene.game.events.off("hidden", pause);
    window.removeEventListener("pagehide", pause); document.removeEventListener("visibilitychange", hidden);
    if (current === handle) current = undefined;
  };
  const handle: SceneSoundscape = {
    setMood(next) { if (!disposed) { mood = next; player.setLayers(moods[next]); } },
    cue(material) { if (!disposed) player.cue(materials[material]); }, stop,
    status: () => ({ ...player.status(), mood, scene: scene.scene.key }),
  };
  current = handle;
  scene.events.on("pause", pause); scene.events.on("sleep", pause);
  scene.events.on("resume", resume); scene.events.on("wake", resume);
  scene.events.once("shutdown", stop); scene.events.once("destroy", stop);
  scene.game.events.on("blur", pause); scene.game.events.on("hidden", pause);
  window.addEventListener("pagehide", pause); document.addEventListener("visibilitychange", hidden);
  handle.setMood(initial);
  // Warm small material samples in the background so a first physical action
  // has the same timing as later ones. Failure remains optional and recoverable.
  const samples = initial.startsWith("forge-") ? [forgeWheel, forgeLock, forgeGear, forgeFlame]
    : initial.startsWith("bell-") ? [bellLantern, bellLatch, bellRubble, bellRelease]
    : initial === "home" ? [] : [snow, wood, stone, bough, flame];
  for (const url of samples) void load(url).catch(() => {});
  return handle;
}
