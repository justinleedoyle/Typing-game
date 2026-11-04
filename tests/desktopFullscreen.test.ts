import { readFileSync } from "node:fs";
import type { Input } from "electron";
import ts from "typescript";
import { assertEqual, suite } from "./_assert";

// Execute the registration from main.ts, rather than duplicating its shortcut
// logic. Only the Electron window boundary is replaced; no app or save opens.
const url = new URL("../desktop/main.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const start = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "start");
if (!start || !ts.isFunctionDeclaration(start) || !start.body) throw new Error("Desktop startup function is missing");
const registration = start.body.statements.find(statement => {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
  const call = statement.expression;
  return ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "on"
    && call.arguments.length === 2 && ts.isStringLiteral(call.arguments[0])
    && call.arguments[0].text === "before-input-event";
});
if (!registration) throw new Error("Desktop input registration is missing");
const install = new Function("window", ts.transpileModule(registration.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText);

function harness() {
  let fullScreen = false;
  const changes: boolean[] = [];
  let listener: ((event: { preventDefault(): void }, input: Input) => void) | undefined;
  install({
    webContents: { on(_event: string, callback: typeof listener) { listener = callback; } },
    isFullScreen() { return fullScreen; },
    setFullScreen(value: boolean) { fullScreen = value; changes.push(value); },
  });
  if (!listener) throw new Error("Desktop input handler was not installed");
  return {
    changes,
    send(overrides: Partial<Input> = {}) {
      let prevented = false;
      listener!({ preventDefault() { prevented = true; } }, {
        type: "keyDown", key: "F11", code: "F11", isAutoRepeat: false,
        isComposing: false, shift: false, control: false, alt: false, meta: false,
        location: 0, modifiers: [], ...overrides,
      });
      return prevented;
    },
  };
}

await suite("Desktop fullscreen: held F11 toggles once and a released new press toggles again", () => {
  const input = harness();
  assertEqual(input.send(), true, "the first F11 press is consumed");
  assertEqual(input.changes, [true], "the first press enters fullscreen");
  assertEqual(input.send({ isAutoRepeat: true }), true, "held shortcut repeats remain consumed");
  input.send({ isAutoRepeat: true });
  assertEqual(input.changes, [true], "repeated keyDown events cannot toggle fullscreen back and forth");
  assertEqual(input.send({ type: "keyUp" }), false, "release does not act as another shortcut");
  input.send();
  assertEqual(input.changes, [true, false], "a separate press exits fullscreen normally");
  input.send({ type: "keyUp" });
  input.send();
  assertEqual(input.changes, [true, false, true], "later separate presses retain normal toggle behavior");
});

await suite("Desktop fullscreen: modified shortcuts and other keys retain their existing behavior", () => {
  const input = harness();
  for (const modifier of ["control", "meta", "alt"] as const) {
    assertEqual(input.send({ [modifier]: true }), false, `${modifier}-F11 remains unhandled`);
    assertEqual(input.send({ [modifier]: true, isAutoRepeat: true }), false, `${modifier}-F11 repeat remains unhandled`);
  }
  assertEqual(input.send({ key: "F10", code: "F10" }), false, "other function keys remain unhandled");
  assertEqual(input.send({ key: "a", code: "KeyA", isAutoRepeat: true }), false, "typing repeat remains unhandled");
  assertEqual(input.send({ type: "keyUp", isAutoRepeat: true }), false, "keyup cannot toggle even with a repeat flag");
  assertEqual(input.changes, [], "ignored inputs never change fullscreen state");
  assertEqual(input.send({ shift: true, modifiers: ["shift"] }), true, "Shift-F11 remains accepted as before");
  assertEqual(input.changes, [true], "accepted Shift-F11 still toggles once");
});
