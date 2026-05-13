// Bridge an on-screen keyboard into the rest of the game on touch devices.
//
// Phaser's keyboard plugin listens for native `keydown` events on `window`.
// Mobile browsers never fire those for character keys unless a text input is
// focused, and there's no text input in the game itself -- the canvas takes
// `keydown` straight off the OS keyboard on desktop, which doesn't exist on
// a phone.
//
// Trick: keep a hidden, always-empty <input> in the DOM. Tap on the canvas
// focuses it, which pops the on-screen keyboard up. For every character the
// user types, synthesize a `KeyboardEvent('keydown')` on `window` with the
// matching `key` -- Phaser's pipeline picks it up unchanged, every scene's
// onKeyDown handler runs the same code path it does on desktop.

const isTouchDevice = (): boolean =>
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

export function installMobileKeyboardBridge(): void {
  if (!isTouchDevice()) return;

  const input = document.getElementById(
    "mobile-keyboard-bridge",
  ) as HTMLInputElement | null;
  if (!input) return;

  // The element is pointer-events:none so the focusing tap can pass through
  // to the canvas. We focus programmatically from a tap anywhere in #app.
  const focusInput = (): void => {
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  };

  const app = document.getElementById("app");
  if (app) {
    // pointerdown fires on both touch and mouse; safer than touchstart alone.
    app.addEventListener("pointerdown", focusInput);
    app.addEventListener("click", focusInput);
  }

  // Re-grab focus if anything in the page steals it. iOS Safari can drop
  // focus on rotation, app-switch, etc.
  window.addEventListener("focus", focusInput);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) focusInput();
  });

  const dispatchKey = (key: string): void => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  };

  // `input` events fire reliably on iOS Safari and Android Chrome for every
  // composed character. `keydown` does not (autocorrect, swipe-typing, etc.).
  input.addEventListener("input", (e) => {
    const ie = e as InputEvent;
    // Always clear so the field never accumulates -- otherwise iOS would
    // start trying to autocorrect and re-emit the whole word on next tap.
    input.value = "";

    if (ie.inputType === "insertLineBreak") {
      dispatchKey("Enter");
      return;
    }

    const data = ie.data;
    if (!data) return;
    for (const ch of data) {
      dispatchKey(ch);
    }
  });

  // Initial focus attempt (no-op until the user taps -- iOS requires a
  // user gesture to actually pop the keyboard, but a queued focus call
  // means the very first tap on the canvas will get there).
  focusInput();
}
