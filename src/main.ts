import Phaser from "phaser";
import { installMobileKeyboardBridge } from "./mobileInput";
import { AlmanacScene } from "./scenes/AlmanacScene";
import { ClockworkForgeScene } from "./scenes/ClockworkForgeScene";
import { GreatBattleScene } from "./scenes/GreatBattleScene";
import { HauntedWoodScene } from "./scenes/HauntedWoodScene";
import { OpeningScene } from "./scenes/OpeningScene";
import { PortalChamberScene } from "./scenes/PortalChamberScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { SkyIslandScene } from "./scenes/SkyIslandScene";
import { SunkenBellScene } from "./scenes/SunkenBellScene";
import { TitleScene } from "./scenes/TitleScene";
import { WinterMountainScene } from "./scenes/WinterMountainScene";

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

// Lightweight production error visibility.
// Real-time play can't be automated (a backgrounded tab freezes Phaser's rAF),
// so a silent runtime error during actual play would otherwise leave no trace.
// Capture the last few uncaught errors / promise rejections into a localStorage
// ring buffer (and console.error) so they can be inspected after the fact.
// Dependency-free; does not touch game logic or scene boot.
const ERROR_LOG_KEY = "almanac:errorLog";
const ERROR_LOG_LIMIT = 20;

function recordError(kind: string, message: string, stack?: string): void {
  const entry = {
    kind,
    message,
    stack: stack ?? "",
    time: new Date().toISOString(),
    url: typeof location !== "undefined" ? location.href : "",
  };
  // Always surface to the console first, so it shows even if storage fails.
  // eslint-disable-next-line no-console
  console.error(`[${kind}]`, message, stack ?? "");
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY);
    const log: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(log) ? log : [];
    list.push(entry);
    while (list.length > ERROR_LOG_LIMIT) list.shift();
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable (private mode / quota); console.error above still fired.
  }
}

window.addEventListener("error", (event) => {
  const err = event.error as Error | undefined;
  const message =
    err?.message ??
    event.message ??
    (event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "Unknown error");
  recordError("error", message, err?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as unknown;
  const err = reason instanceof Error ? reason : undefined;
  const message = err?.message ?? (typeof reason === "string" ? reason : String(reason));
  recordError("unhandledrejection", message, err?.stack);
});

installMobileKeyboardBridge();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b0a0f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  scene: [TitleScene, OpeningScene, PortalChamberScene, WinterMountainScene, SunkenBellScene, ClockworkForgeScene, SkyIslandScene, HauntedWoodScene, GreatBattleScene, AlmanacScene, SettingsScene],
});
