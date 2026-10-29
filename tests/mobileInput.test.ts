import { installMobileKeyboardBridge } from "../src/mobileInput";
import { assert, assertEqual, suite } from "./_assert";

// Exercise the installed bridge with native Web EventTarget listeners. Only
// the DOM elements/focus and input-to-window bubbling are supplied by the test.
class KeyEvent extends Event {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly repeat: boolean;
  constructor(type: string, options: KeyboardEventInit = {}) {
    super(type, options);
    this.key = options.key ?? "";
    this.shiftKey = options.shiftKey ?? false;
    this.ctrlKey = options.ctrlKey ?? false;
    this.metaKey = options.metaKey ?? false;
    this.altKey = options.altKey ?? false;
    this.isComposing = options.isComposing ?? false;
    this.repeat = options.repeat ?? false;
  }
}

function fixture(touch = true) {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { activeElement: null as unknown, hidden: false });
  const app = new EventTarget();
  const input = Object.assign(new EventTarget(), {
    value: "", focus() { documentTarget.activeElement = input; },
  });
  const observed: KeyEvent[] = [];
  windowTarget.addEventListener("keydown", event => observed.push(event as KeyEvent));
  const values: Record<string, unknown> = {
    window: windowTarget,
    document: Object.assign(documentTarget, { getElementById: (id: string) => id === "app" ? app : input }),
    navigator: { maxTouchPoints: touch ? 1 : 0 },
    KeyboardEvent: KeyEvent,
  };
  const originals = new Map(Object.keys(values).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true });
  installMobileKeyboardBridge();
  const key = (type: "keydown" | "keyup", value: string, options: KeyboardEventInit = {}) => {
    const event = new KeyEvent(type, { key: value, bubbles: true, cancelable: true, ...options });
    input.dispatchEvent(event);
    if (!event.cancelBubble) windowTarget.dispatchEvent(event);
    return event;
  };
  const text = (data: string | null, inputType = "insertText", isComposing = false) => {
    input.value = data ?? "";
    const event = Object.assign(new Event("input", { bubbles: true }), { data, inputType, isComposing });
    input.dispatchEvent(event);
    assertEqual(input.value, "", "every handled text event empties the hidden field");
  };
  return { input, observed, key, text, document: documentTarget,
    restore() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

await suite("Mobile input: physical typing on a touch browser reaches the game exactly once", () => {
  const f = fixture();
  try {
    assertEqual(f.document.activeElement, f.input, "the production bridge focuses its hidden field");
    const native: KeyEvent[] = [];
    for (const letter of "boy") {
      native.push(f.key("keydown", letter));
      f.text(letter);
      f.key("keyup", letter);
    }
    assertEqual(f.observed.map(event => event.key), ["b", "o", "y"], "a native key and its normal input event cannot become two game keys");
    assert(f.observed.every((event, index) => event === native[index]), "the original native events retain their identity and modifiers");
  } finally { f.restore(); }
});

await suite("Mobile input: repeats, capital commands and native shortcuts keep their original events", () => {
  const f = fixture();
  try {
    const upper = f.key("keydown", "B", { shiftKey: true }); f.text("B"); f.key("keyup", "B");
    const repeated = f.key("keydown", "o", { repeat: true }); f.text("o"); f.key("keyup", "o");
    const alt = f.key("keydown", "t", { altKey: true }); f.text("t"); f.key("keyup", "t");
    const enter = f.key("keydown", "Enter"); f.text(null, "insertLineBreak"); f.key("keyup", "Enter");
    const backspace = f.key("keydown", "Backspace"); f.text(null, "deleteContentBackward"); f.key("keyup", "Backspace");
    const escape = f.key("keydown", "Escape"); f.key("keyup", "Escape");
    const ctrl = f.key("keydown", "r", { ctrlKey: true }); f.key("keyup", "r");
    const meta = f.key("keydown", "v", { metaKey: true }); f.key("keyup", "v");
    const native = [upper, repeated, alt, enter, backspace, escape, ctrl, meta];
    assertEqual(f.observed.length, native.length, "text, line-break and deletion events add no second hardware action");
    assert(f.observed.every((event, index) => event === native[index]), "Shift, Alt, repeat, Backspace, Escape and browser shortcuts bubble unchanged");
    assert(upper.shiftKey && repeated.repeat && alt.altKey && ctrl.ctrlKey && meta.metaKey, "native key flags survive");
  } finally { f.restore(); }
});

await suite("Mobile input: input-only text, swipe words and composed characters still synthesize each character", () => {
  const f = fixture();
  try {
    f.text("tide");
    f.text("stand DOWN");
    f.key("keydown", "Unidentified"); f.text("salt"); f.key("keyup", "Unidentified");
    f.key("keydown", "Process", { isComposing: true }); f.text("é", "insertCompositionText", true); f.key("keyup", "Process");
    f.text(null, "insertLineBreak");
    assertEqual(f.observed.map(event => event.key), [
      ..."tidestand DOWN", "Unidentified", ..."salt", "Process", "é", "Enter",
    ], "software keyboard data remains available even without a printable native key");
  } finally { f.restore(); }
});

await suite("Mobile input: an unpaired native key cannot suppress later independent software input", () => {
  const f = fixture();
  try {
    f.key("keydown", "a"); f.key("keyup", "a"); f.text("a");
    f.key("keydown", "b"); f.text("c"); f.key("keyup", "b");
    f.key("keydown", "v", { metaKey: true }); f.text("v", "insertFromPaste"); f.key("keyup", "v");
    assertEqual(f.observed.map(event => event.key), ["a", "a", "b", "c", "v", "v"], "only the matching text event from the same active native key is deduplicated");
  } finally { f.restore(); }
});
