import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/SkyIslandScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["startEttaHelp", "showEttaBookCue", "moveEttaBook", "clearEttaBookCue", "onKeyDown"];
const code = ts.transpileModule(`class Sky { ${names.map(name => owner.members.find(m => m.name?.getText(source) === name)!.getText(source)).join("\n")} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const noop = () => {};
function prop(x = 0, y = 0, key = "") {
  return { x, y, key, scene: true, width: 1536, height: 1024, alpha: 1, angle: 0, depth: 0, children: [] as any[],
    setDepth(n: number) { this.depth = n; return this; }, setAlpha(n: number) { this.alpha = n; return this; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setAngle(n: number) { this.angle = n; return this; }, setOrigin() { return this; },
    setTexture(value: string) { this.key = value; return this; },
    setScale(value: number) { this.displayHeight = this.height * value; return this; },
    setDisplaySize(w: number, h: number) { return this; }, add(p: any) { this.children.push(p); return this; },
    destroy() { this.scene = false; },
  };
}
const globals = {
  ETTA_CHAIN_1: "lift the book", ETTA_CHAIN_2: "place it gently", ETTA_BOOK_WORD_Y: 500, ETTA_SPRITE_HEIGHT: 280,
  playChime: noop, playActorAttention: noop, applySceneActorLighting: noop, PALETTE_HEX: { brass: 0 },
  addLocalGroundShadow: () => prop(), reducedMotion: (s: any) => s.reduced,
  isPuristToggleKey: () => false, togglePuristMode: noop, playClack: noop,
};
const Sky = new Function(...Object.keys(globals), code + "; return Sky;")(...Object.values(globals));
function fixture(reduced = false) {
  const s = new Sky(), gates: Array<() => void> = [], targets: any[] = [], tweens: any[] = [];
  const captions: string[] = [], entered: number[] = [], keys: string[] = [], killed: any[] = [];
  const save = { realms: {} as Record<string, any>, almanacLore: [] as string[] };
  let task = "", hides = 0;
  Object.assign(s, {
    reduced, ettaBookCue: null, ettaBookShelf: null, ettaBookGroundShadow: null, ettaBookMoving: false,
    wrenContainer: { x: 960, y: 826 }, ettaSprite: prop(), ettaDone: false,
    add: { container: (x: number, y: number) => prop(x, y), image: (x: number, y: number, key: string) => prop(x, y, key) },
    tweens: { add: (t: any) => { tweens.push(t); }, killTweensOf: (p: any) => killed.push(p) },
    band: { setObjective: (text: string) => { task = text; } },
    setNarrator: (text: string) => captions.push(text), clearActiveTargets: noop, clearEttaBookWordAnchors: noop,
    makeEttaBookWord: (t: any) => t, registerActiveTarget: (t: any) => targets.push(t),
    readThen: (next: () => void) => gates.push(next),
    store: { update: (change: (state: typeof save) => void) => change(save) },
    hideEtta: () => { hides++; s.clearEttaBookCue(true); }, startTemple: (n: number) => entered.push(n),
    reading: { handleKey: () => false }, typingInput: { handleChar: (key: string) => keys.push(key) },
  });
  return { s, save, gates, targets, tweens, captions, entered, keys, killed, task: () => task, hides: () => hides,
    next() { const next = gates.shift(); assert(next, "the real scene offers Continue"); next!(); },
    settle() { const tween = tweens.findLast(t => t.duration === 520); assert(tween, "semantic book action exists");
      tween.targets.setPosition(tween.x, tween.y).setAngle(tween.angle); tween.onComplete(); return tween; },
  };
}

await suite("Sky book: actual native actions reach carried and shelved states before truthful held results", () => {
  for (const reduced of [false, true]) {
    const f = fixture(reduced); f.s.startEttaHelp(3);
    assertEqual(f.targets.length, 0, "approach still waits for the original Continue"); f.next();
    const book = f.s.ettaBookCue, shelf = f.s.ettaBookShelf, shadow = f.s.ettaBookGroundShadow;
    assertEqual([f.s.ettaSprite.key, f.s.ettaSprite.displayHeight], ["etta-empty", 280], "Etta has empty hands at the same actor height when the single world volume appears");
    assertEqual(book.children[0].key, "etta-volume", "book uses the new painted world prop");
    assertEqual(shelf.children[1].key, "etta-shelf", "the destination is visibly present before lifting");
    assertEqual(f.targets[0].word, "lift the book", "the native lift phrase is unchanged");
    f.targets[0].onAdvance(13, 13);
    f.s.onKeyDown({ key: " ", preventDefault: noop });
    assertEqual([f.s.ettaBookMoving, f.keys], [true, []], "input is guarded from the final letter through the word's completion fade");
    f.targets[0].onComplete();
    assertEqual(shelf.alpha, 1, "a quick lift cannot leave the shared entrance fade unfinished on the destination shelf");
    if (!reduced) {
      assertEqual(f.gates.length, 0, "no held-result gate appears while the book is still on the ground");
      assert(f.task().includes("Lifting"), "the temporary task describes the physical action"); f.settle();
    }
    assertEqual([book.x, book.y, book.angle], [898, 714, -8], "the same book visibly reaches Wren's near hand");
    assertEqual(shadow.alpha, 0, "the ground shadow does not travel through the air with the book");
    assert(f.task().includes("Book lifted"), "the received state precedes its acknowledgment");
    assertEqual(f.save.almanacLore, [], "lifting alone does not award the placement memory"); f.next();
    assertEqual([f.targets[1].word, f.targets[1].x, f.targets[1].y], ["place it gently", 870, 500], "the moving book never drags the next phrase across Wren");
    f.targets[1].onAdvance(15, 15);
    f.s.onKeyDown({ key: "a", preventDefault: noop });
    assertEqual([f.s.ettaBookMoving, f.keys], [true, []], "placement also guards the completion fade before movement begins");
    f.targets[1].onComplete();
    if (!reduced) { assertEqual(f.save.almanacLore, [], "memory waits until the book reaches the shelf"); f.settle(); }
    assertEqual([book.x, book.y, book.angle], [shelf.x, shelf.y - 94, 0], "the placed book settles on its visible shelf");
    assertEqual(f.save.almanacLore, ["scholar-ettas-last-volume"], "the original memory is earned once");
    assertEqual(f.save.realms["sky-island"].choices.ettaHelped, "yes", "the original help flag remains durable");
    assertEqual([f.hides(), f.entered.length], [0, 0], "Etta and the shelved book remain through reward reading"); f.next();
    assertEqual(f.entered, [3], "Continue returns to the original next temple");
    assertEqual([f.s.ettaBookCue, f.s.ettaBookShelf, f.s.ettaBookMoving], [null, null, false], "handoff cleanup drops prop ownership and movement guard");
    if (reduced) assert(!f.tweens.some(t => t.duration === 520), "reduced motion snaps both semantic actions without a movement delay");
  }
});

await suite("Sky book: cancellation invalidates late action callbacks without rewards or orphaned gates", () => {
  const f = fixture(); f.s.startEttaHelp(3); f.next(); f.targets[0].onComplete();
  const old = f.tweens.findLast(t => t.duration === 520), book = f.s.ettaBookCue;
  f.s.clearEttaBookCue(); old.onComplete();
  assertEqual([f.gates.length, f.save.almanacLore.length, f.s.ettaBookMoving], [0, 0, false], "a left scene cannot revive story/reward state");
  assert(!book.scene && f.killed.includes(book), "shutdown cleanup stops and destroys the old physical prop");
  f.s.showEttaBookCue(); old.onComplete();
  assertEqual(f.gates.length, 0, "a replacement prop cannot be mistaken for the old animation");
});

await suite("Sky book: early story keys wait for the physical action while pause and browser shortcuts remain usable", () => {
  const f = fixture(); f.s.ettaBookMoving = true;
  let prevented = 0, pauses = 0;
  f.s.chapterMenu = { handleKey: (e: any) => { if (e.key === "Escape") { pauses++; return true; } return false; } };
  for (const key of ["Enter", " ", "a"]) f.s.onKeyDown({ key, preventDefault: () => prevented++ });
  assertEqual([f.keys, prevented], [[], 3], "early keys cannot incur misses against a nonexistent target");
  f.s.onKeyDown({ key: "Escape" }); assertEqual(pauses, 1, "Escape still reaches the pause menu");
  f.s.onKeyDown({ key: "r", metaKey: true }); assertEqual(f.keys, [], "browser shortcuts stay outside gameplay");
  f.s.ettaBookMoving = false; f.s.onKeyDown({ key: "p" }); assertEqual(f.keys, ["p"], "native typing returns after settling");
});
