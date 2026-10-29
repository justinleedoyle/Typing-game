import Phaser from "phaser";
import { installMobileKeyboardBridge } from "./mobileInput";
import { AlmanacScene } from "./scenes/AlmanacScene";
import { ClockworkForgeScene } from "./scenes/ClockworkForgeScene";
import { GreatBattleScene } from "./scenes/GreatBattleScene";
import { HauntedWoodScene } from "./scenes/HauntedWoodScene";
import { HomecomingScene } from "./scenes/HomecomingScene";
import { OpeningScene } from "./scenes/OpeningScene";
import { PortalChamberScene } from "./scenes/PortalChamberScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { SkyIslandScene } from "./scenes/SkyIslandScene";
import { SunkenBellScene } from "./scenes/SunkenBellScene";
import { TitleScene } from "./scenes/TitleScene";
import { WinterMountainScene } from "./scenes/WinterMountainScene";
import { ensureGameFonts } from "./game/fonts";
import { installKeyboardQueueDrain } from "./game/keyboardQueue";
import { desktopBridge } from "./game/desktopBridge";
import { installDesktopLifecycle } from "./game/desktopBackend";
import { showRecoveryDialog, type RecoveryDialog } from "./game/ui/recoveryDialog";

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

if (!desktopBridge()) installMobileKeyboardBridge();

let game: Phaser.Game | undefined;
installDesktopLifecycle(() => {
  const current = game;
  const active = current?.scene.getScenes(true).map(scene => scene.scene.key) ?? [];
  const inputEnabled = current?.input.enabled ?? true;
  if (current) {
    current.input.enabled = false;
    active.forEach(key => current.scene.pause(key));
  }
  return () => {
    if (current && game === current) {
      current.input.enabled = inputEnabled;
      active.forEach(key => current.scene.resume(key));
    }
  };
});
let bootDialog: RecoveryDialog | undefined;
async function startGame(): Promise<void> {
  if (game) return;
  bootDialog?.destroy(); bootDialog = undefined;
  try { await ensureGameFonts(); }
  catch {
    bootDialog = showRecoveryDialog({
      title: "The lettering could not open",
      message: "The game's lettering could not load. Your saved journey has not changed.",
      detail: "Try again. If this continues, check that the game files are complete.",
      actions: [{ label: "Try again · Enter", shortcut: "Enter", onSelect: () => { void startGame(); } }],
    });
    return;
  }
  game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b0a0f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  scene: [TitleScene, OpeningScene, PortalChamberScene, WinterMountainScene, SunkenBellScene, ClockworkForgeScene, SkyIslandScene, HauntedWoodScene, GreatBattleScene, HomecomingScene, AlmanacScene, SettingsScene],
  });
  installKeyboardQueueDrain(game);
  if (desktopBridge()) {
    const appElement = document.querySelector<HTMLElement>("#app")!;
    appElement.dataset.desktopReady = "true";
    // DOM status lets packaged smoke checks observe the same scene stack a
    // player sees, including the ordinary pause overlay. No game-state API.
    game.events.on(Phaser.Core.Events.POST_STEP, () => {
      const scene = game?.scene.getScenes(true).at(-1)?.scene.key;
      if (scene && appElement.dataset.activeScene !== scene) appElement.dataset.activeScene = scene;
    });
  }
}
void startGame();
