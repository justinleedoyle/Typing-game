import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Exercise the actual readout methods with measured inert text and a fake
// clock. No canvas, game save or browser state is needed for these contracts.
const path = new URL("../src/game/ui/consoleBand.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["setObjective", "showNotice", "renderObjective", "fitObjectiveText",
  "objectiveTextFits", "redrawObjectivePlate"];
const code = ts.transpileModule(`class Harness { ${names.map((name) =>
  owner.members.find((member) => member.name?.getText(source) === name)!.getText(source)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const globals = {
  OBJECTIVE_FONT_SIZE: 17, OBJECTIVE_MIN_FONT_SIZE: 13, OBJECTIVE_MAX_TEXT_H: 24,
  OBJECTIVE_TEXT_X: 124, OBJECTIVE_H: 38, UI_HEX: { frame: 0 },
  noticeColorsFor: () => ({ labelColor: "", textColor: "" }),
};
const Band = new Function(...Object.keys(globals), `${code}; return Harness;`)(...Object.values(globals));

class Text {
  text = ""; fontSize = 17; width = 0; height = 20;
  setText(text: string) { this.text = text; this.measure(); return this; }
  setFontSize(size: number) { this.fontSize = size; this.measure(); return this; }
  setColor() { return this; }
  measure() { this.width = this.text.length * this.fontSize * 0.5; this.height = this.fontSize * 1.2; }
}
function createBand() {
  const timers: Array<{ run: () => void; removed: boolean; remove: () => void }> = [];
  const plateWidths: number[] = [];
  const band = new Band();
  const plate = { clear() { return this; }, fillStyle() { return this; }, lineStyle() { return this; },
    fillRoundedRect(_x: number, _y: number, width: number) { plateWidths.push(width); return this; },
    strokeRoundedRect() { return this; } };
  Object.assign(band, {
    objectiveValue: "", renderedReadoutKey: "", noticeActive: false, noticeGeneration: 0, noticeTimer: null,
    objectiveWidth: 1354, objectiveTextMaxWidth: 1212, objectiveBg: plate,
    objectiveText: new Text(), objectiveLabel: new Text(),
    objectiveContainer: { visible: false, setVisible(value: boolean) { this.visible = value; return this; }, setAlpha() { return this; } },
    playReadoutWake() {}, playNoticeSatchelWake() {}, clearAnsweringKeepsake() {},
    scene: { tweens: { killTweensOf() {}, add() {} }, time: {
      delayedCall(_ms: number, run: () => void) {
        const timer = { run, removed: false, remove() { this.removed = true; } };
        timers.push(timer); return timer;
      },
    } },
  });
  return { band, timers, plateWidths };
}

await suite("console readout: short plates fit content and long directions keep their established width", () => {
  const { band, plateWidths } = createBand();
  band.setObjective("Type TURN.");
  const shortWidth = band.objectiveWidth;
  assert(shortWidth < 400, "a short command no longer frames the empty full-width band");
  assert(shortWidth >= 124 + band.objectiveText.width + 18, "label, task and end padding fit inside the plate");
  band.setObjective("At · use the approach mark: above . / below ! / left , / right ?: type the other letters.");
  assert(band.objectiveWidth > shortWidth && band.objectiveWidth <= 1354, "long directions grow only within the original strip bounds");
  assertEqual(band.objectiveText.text, "At · use the approach mark: above . / below ! / left , / right ?: type the other letters.",
    "normal full directions remain intact");
  band.setObjective("A deliberately exceptional instruction ".repeat(30));
  assert(band.objectiveWidth <= 1354, "exceptional text never expands into other HUD anchors");
  assert(band.objectiveText.width <= band.objectiveTextMaxWidth, "existing font-fit/truncation still bounds exceptional lines");
  assertEqual(plateWidths.at(-1), band.objectiveWidth, "the drawn frame matches the actual fitted readout");
  band.setObjective("");
  assert(!band.objectiveContainer.visible, "an empty task leaves no empty task frame");
});

await suite("console readout: newer tasks preempt notices and stale timers cannot erase their successors", () => {
  const { band, timers } = createBand();
  band.setObjective("Read the arrival.");
  band.showNotice("The Hammer is ready.", { label: "relic" });
  assertEqual(band.objectiveText.text, "The Hammer is ready.", "a notice can still explain a keepsake in the current beat");
  band.setObjective("Read the arrival.");
  assert(band.noticeActive, "repeating the same task does not prematurely dismiss a current notice");
  band.setObjective("Type bound while the tether holds him.");
  assert(!band.noticeActive && timers[0]!.removed, "a new playable beat ends its predecessor's notice");
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "the new task appears immediately");
  timers[0]!.run();
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "a removed callback cannot resurrect old content");
  band.showNotice("A new keepsake answers.", { label: "relic" });
  timers[0]!.run();
  assert(band.noticeActive, "the older callback cannot clear a newer active notice");
  assertEqual(band.objectiveText.text, "A new keepsake answers.", "the newer notice retains ownership");
  timers[1]!.run();
  assertEqual(band.objectiveText.text, "Type bound while the tether holds him.", "normal notice expiry restores the latest task");
  band.showNotice("One more notice.");
  band.setObjective("");
  timers[2]!.run();
  assert(!band.objectiveContainer.visible, "emptying a finished beat cannot be undone by its old notice timer");
});
