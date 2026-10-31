import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Run the actual caption component with only the canvas display objects faked.
const url = new URL("../src/game/narrationManager.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declarations = source.statements.filter(ts.isVariableStatement).map(statement => statement.getText(source)).join("\n");
const owner = source.statements.find(ts.isClassDeclaration)!;
const code = ts.transpileModule(`${declarations}\n${owner.getText(source).replace(/^export /, "")}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Narration = new Function("Phaser", "SERIF", "PALETTE", "UI_CSS", "UI_HEX", "PRESENTATION_CHANGED",
  `${code}; return NarrationManager;`)(
  { Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } }, "serif", {}, {}, {}, "preferences");

class Display {
  visible = true;
  text = "";
  width = 0;
  height = 0;
  x = 0;
  y = 0;
  fontSize = 17;
  readonly shapes: Array<{ x: number; y: number; width: number; height: number }> = [];
  constructor(readonly style: { wordWrap?: { width: number }; fontSize?: string } = {}) {
    this.fontSize = Number.parseFloat(style.fontSize ?? "17");
  }
  private measure() {
    const lines = this.text.split("\n");
    const naturalWidth = Math.max(...lines.map(line => line.length * this.fontSize * 0.6));
    const wrapWidth = this.style.wordWrap?.width ?? Infinity;
    this.width = Math.min(naturalWidth, wrapWidth);
    this.height = Math.max(lines.length, Math.ceil(naturalWidth / wrapWidth)) * this.fontSize * 1.2;
  }
  setText(text: string) { this.text = text; this.measure(); return this; }
  setFontSize(size: number) { this.fontSize = size; this.measure(); return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setY(y: number) { this.y = y; return this; }
  clear() { this.shapes.length = 0; return this; }
  fillRoundedRect(x: number, y: number, width: number, height: number) { this.shapes.push({ x, y, width, height }); return this; }
  setOrigin() { return this; }
  setAlpha() { return this; }
  setDepth() { return this; }
  fillStyle() { return this; }
  lineStyle() { return this; }
  strokeRoundedRect() { return this; }
  beginPath() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  strokePath() { return this; }
  add() { return this; }
  bringToTop() { return this; }
  destroy() {}
}

function caption(large = false) {
  const texts: Display[] = [];
  const graphics: Display[] = [];
  const scene = {
    scale: { width: 1920 }, events: { on() {}, once() {}, off() {} },
    tweens: { add() {}, killTweensOf() {} },
    add: {
      container: () => new Display(),
      graphics: () => { const display = new Display(); graphics.push(display); return display; },
      text: (_x: number, _y: number, text: string, style: ConstructorParameters<typeof Display>[0]) => {
        const display = new Display(style).setText(text); texts.push(display); return display;
      },
    },
  };
  const manager = new Narration(scene, {
    framed: true, store: { get: () => ({ textScale: large ? "large" : "standard", reducedMotion: true }) },
  });
  return { manager, speaker: texts[0], body: texts[1], card: graphics[0], badge: graphics[2] };
}

await suite("speaker badges: long names stay on one measured line above standard and large captions", () => {
  for (const large of [false, true]) {
    const { manager, speaker, body, card, badge } = caption(large);
    const dialogue = "The scholar-spirit guards the summit. It will ask you things. Answer carefully.";
    for (const name of ["Lantern-Lighter", "Scholar-Spirit", "Old Gregor", "Runa"]) {
      manager.sayRaw(dialogue, { speakerName: name });
      assertEqual(speaker.text, name, "authored speaker name is intact without an inserted line break");
      assertEqual(speaker.fontSize, 17, "long names retain the readable standard badge size");
      const tab = badge.shapes[0];
      assert(tab.width >= speaker.width + 30, "badge grows to the measured name with horizontal padding");
      assert(tab.y + tab.height <= -body.height / 2 - 6, "badge leaves six pixels above the dialogue text bounds");
      assert(tab.x + tab.width <= card.shapes[0].x + card.shapes[0].width - 28, "badge fits inside caption side margins");
      assertEqual(body.text, dialogue, "speaker sizing leaves dialogue content unchanged");
      assertEqual(body.style.wordWrap?.width, 920, "speaker sizing leaves dialogue wrap width unchanged");
      assertEqual(body.fontSize, large ? 37 : 30, "dialogue text preference remains independent");
    }
    manager.sayRaw(dialogue, { speakerName: null });
    assert(!speaker.visible && !badge.visible, "anonymous captions still suppress the speaker badge");
  }
});

await suite("speaker badges: exceptional names fit the normal caption width without wrapping", () => {
  const { manager, speaker, body, badge } = caption();
  manager.sayRaw("A short line.", { speakerName: "An exceptionally lengthy speaker name ".repeat(8) });
  assert(speaker.text.endsWith("…") && !speaker.text.includes("\n"), "oversized labels end with a single-line ellipsis");
  assert(badge.shapes[0].width <= 920, "badge cannot exceed the normal caption wrap width");
  assertEqual(body.text, "A short line.", "bounded label does not truncate the dialogue");
});
