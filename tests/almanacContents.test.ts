import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";
import { ALMANAC_LORE_PAGES, lorePageIdsForRealm } from "../src/game/almanacLorePages";
import { REALM_LORE, REALM_ORDER, realmPathSummary, winterRealmSummary, winterLorePageBody, winterLorePageMatchesChoices } from "../src/game/realmLore";
import { RELICS } from "../src/game/relics";
import { emptySave, SaveStore, type SaveState } from "../src/game/saveState";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { navigationAction } from "../src/game/ui/navigationPolicy";

// The actual book, page-link implementation and typing controller run together.
// Only drawing, sound, the old footer word renderer and decorative clocks are
// inert; discovery gating and navigation callbacks are production code.
const path = new URL("../src/scenes/AlmanacScene.ts", import.meta.url);
const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const declarations = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations
  .filter(value => !["RELIC_ICON_URLS", "COMPANION_ICON_URLS"].includes(value.name.getText(source)))
  .map(value => `const ${value.getText(source)};`)).join("\n");
const code = ts.transpileModule(`${declarations}\nclass Almanac { ${owner.members.filter(value => !ts.isConstructorDeclaration(value)).map(value => value.getText(source)).join("\n")} }
return { Almanac, REALM_CONTENTS_COMMANDS, BOOK_X, BOOK_Y, BOOK_WIDTH, BOOK_HEIGHT, PAGE_BOTTOM_Y };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
class Display {
  scene = true; text = ""; width = 0; height = 0; fontSize = 22; x = 0; y = 0; originX = 0; originY = 0;
  destroyed = 0; alpha = 1; depth = 0;
  constructor(readonly style: any = {}) { this.fontSize = Number.parseFloat(style.fontSize ?? "22"); }
  setText(text: string) { this.text = text; this.measure(); return this; }
  setFontSize(size: number) { this.fontSize = size; this.measure(); return this; }
  measure() {
    const lines = this.text.split("\n");
    const naturalWidth = Math.max(...lines.map(line => Array.from(line).reduce((sum, point) => sum + (point === "W" ? 1.12 : point === "i" ? .22 : .52), 0) * this.fontSize));
    const wrap = this.style.wordWrap?.width ?? Infinity;
    this.width = Math.min(naturalWidth, wrap); this.height = Math.max(lines.length, Math.ceil(naturalWidth / wrap), 1) * this.fontSize * 1.2;
  }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setDepth(depth: number) { this.depth = depth; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  lineStyle() { return this; } lineBetween() { return this; }
  destroy() { this.scene = false; this.destroyed++; }
}
class FooterTarget implements WordTarget {
  cursor = 0; destroyed = 0;
  constructor(readonly opts: any) {}
  remaining() { return this.opts.word.toLowerCase().slice(this.cursor); }
  isComplete() { return this.cursor === this.opts.word.length; }
  advance() { this.cursor++; } reverse() { if (!this.cursor) return false; this.cursor--; return true; }
  resetCursor() { this.cursor = 0; } miss() {} onClaim() {} onRelease() { if (!this.isComplete()) this.cursor = 0; }
  onComplete() { this.opts.onComplete(); } setDimmed() {} setCandidate() {}
  getAnchorX() { return this.opts.x; } getAnchorY() { return this.opts.y; }
  playEntryWake() {} playIdleFloat() {} destroy() { this.destroyed++; }
}
const globals = {
  ALMANAC_LORE_PAGES, lorePageIdsForRealm, REALM_LORE, REALM_ORDER, realmPathSummary, winterRealmSummary,
  winterLorePageBody, winterLorePageMatchesChoices, RELICS, TypingInputController, navigationAction,
  TextWordTarget: FooterTarget, SERIF: "serif", UI_CSS: { ink: "#2a1f12" }, UI_HEX: { brass: 1 }, PALETTE_HEX: {},
  iconFor: () => null, playChime() {}, playClack() {},
  attachWordBodyAnchor: (scene: any, body: Display, point: () => unknown) => {
    const anchor = { body, point, destroyed: 0, destroy() { this.destroyed++; } }; scene.testAnchors.push(anchor); return anchor;
  },
};
const { Almanac, REALM_CONTENTS_COMMANDS, BOOK_X, BOOK_Y, BOOK_WIDTH, BOOK_HEIGHT, PAGE_BOTTOM_Y } =
  new Function(...Object.keys(globals), code)(...Object.values(globals));

// Independent advances from the shipped Source Serif 4 Regular WOFF2, measured
// with CoreText at 1000px. Read the real renderer's padding so this protects the
// complete plates, rather than checking only their command anchor points.
const footerAdvances: Record<string, number> = { contents: 3.833, overview: 4.044,
  "previous page": 6.188, "close the almanac": 7.985, "next page": 4.3 };
const wordSource = ts.createSourceFile("wordTarget.ts", readFileSync(new URL("../src/game/wordTarget.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const bannerPadX = Number(wordSource.statements.filter(ts.isVariableStatement).flatMap(value => value.declarationList.declarations)
  .find(value => value.name.getText(wordSource) === "BANNER_PAD_X")!.initializer!.getText(wordSource));
function footerBounds(target: FooterTarget) {
  const half = (footerAdvances[target.opts.word] * target.opts.fontSize + bannerPadX + 12) / 2;
  return { left: target.opts.x - half, right: target.opts.x + half };
}

function fixture(initial = emptySave()) {
  let persisted = structuredClone(initial);
  const store = new SaveStore({ async load() { return persisted; }, async save(state) { persisted = structuredClone(state); } }, initial, { saveDelayMs: 60_000 });
  const book = new Almanac(), displays: Display[] = [], footers: FooterTarget[] = [], starts: string[] = [];
  const backendChanges = { get persisted() { return persisted; } };
  book.init({ store, overlay: true });
  book.clearedRealms = REALM_ORDER.filter(id => initial.realms[id]?.cleared);
  book.pageStack = book.buildPageStack(initial.almanacLore);
  book.typingInput = new TypingInputController(store);
  const text = (x: number, y: number, value: string, style: any) => {
    const object = new Display(style).setPosition(x, y).setText(value); displays.push(object); return object;
  };
  Object.assign(book, {
    scale: { width: 1920, height: 1080 }, testAnchors: [],
    add: { text, graphics: () => { const object = new Display(); displays.push(object); return object; },
      zone: (x: number, y: number) => new Display().setPosition(x, y) },
    stagePageObject() {}, playPageTurn() {},
    renderOverviewPage() { this.addPageText(280, 200, "Original overview", { fontSize: "44px" }); this.renderPageFooter(); },
    time: { now: 0, delayedCall() {} }, tweens: { add() {}, killTweensOf() {} },
    scene: { stop() { starts.push("stop"); }, resume(key: string) { starts.push(`resume:${key}`); } },
  });
  // Capture old footer renderers without replacing page-link code.
  const register = book.typingInput.register.bind(book.typingInput);
  book.typingInput.register = (target: WordTarget) => { if (target instanceof FooterTarget) footers.push(target); register(target); };
  book.refreshBookPage();
  function key(value: string, extras: Record<string, unknown> = {}) {
    let prevented = 0, stopped = 0;
    book.onKeyDown({ key: value, repeat: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() { prevented++; }, stopPropagation() { stopped++; }, ...extras });
    return { prevented, stopped };
  }
  const type = (value: string) => { for (const point of value) key(point); };
  return { book, store, displays, footers, starts, backendChanges, key, type,
    async finish() { book.clearNavigationTargets(); book.typingInput.reset(); await store.flush(); } };
}
function fullSave(large = false) {
  const state = emptySave("Wren"); state.typewriterAwakened = true; state.textScale = large ? "large" : "standard";
  state.realms = Object.fromEntries(REALM_ORDER.map(id => [id, { cleared: true, choices: {} }]));
  state.almanacLore = Object.keys(ALMANAC_LORE_PAGES); state.satchel = ["ettas-ledger", "glass-fish"];
  return state;
}
function journey(state: Readonly<SaveState>) {
  return JSON.stringify([state.schemaVersion, state.runId, state.profileName, state.realms, state.satchel, state.almanacLore,
    state.checkpoint, state.difficulty, state.wrenGender]);
}

await suite("Almanac contents: empty and partial books expose only the original cleared and stamped destinations", async () => {
  const emptyState = emptySave(); emptyState.almanacLore = ["scholar-ettas-last-volume", "unknown-imported-page"];
  const empty = fixture(emptyState), emptyBefore = journey(empty.store.get());
  empty.type("contents");
  assert(empty.book.contentsOpen, "the visible typed command opens the in-book index");
  assertEqual([empty.book.pageStack.length, empty.book.directTargets.length], [1, 0], "early stamps and unknown ids cannot unlock an uncleared realm");
  assert(empty.displays.some(display => display.text === "No realm chapters stamped yet."), "empty contents explains why no chapter can be opened");
  empty.book.openPage(1); assert(empty.book.contentsOpen && empty.book.currentPage === 0, "an invalid direct destination cannot leave the safe index");
  empty.type("overview"); assert(!empty.book.contentsOpen && empty.book.currentPage === 0, "overview remains reachable without a cleared realm");
  assertEqual(journey(empty.store.get()), emptyBefore, "index navigation cannot alter the original journey or earned content");
  await empty.finish();
  const state = emptySave(); state.realms["winter-mountain"] = { cleared: true, choices: { fork1: "firefly", fox: "ignored" } };
  state.almanacLore = ["the-hundred-quiet-years", "the-firefly-trail", "the-huntress-song", "the-wounded-foxs-name", "scholar-ettas-last-volume", "unknown-page"];
  const f = fixture(state), before = journey(f.store.get());
  assertEqual(f.book.pageStack.map((entry: any) => entry.loreId ?? entry.realmId ?? entry.kind),
    ["overview", "winter-mountain", "the-hundred-quiet-years", "the-firefly-trail"], "existing Winter choice filters and cleared-realm gate retain their exact page order");
  f.type("contents"); assertEqual(f.book.directTargets.map((target: WordTarget) => target.remaining()), ["winter mountain"], "only the earned realm gets a typed index link");
  f.type("winter mountain"); assertEqual(f.book.currentPage, 1, "the realm command directly opens the original summary spread");
  assertEqual(f.book.directTargets.map((target: WordTarget) => target.remaining()), ["the hundred quiet years", "the firefly trail"], "the original earned canonical titles become direct discovery commands");
  f.type("the fi"); const current = f.book.currentPage;
  f.key("ArrowRight"); assertEqual(f.book.currentPage, current, "page keys do not steal a partially typed discovery");
  f.key("Backspace"); assertEqual(f.book.typingInput.peekClaimedNext(), "i", "printed discovery commands preserve ordinary per-character correction");
  f.type("i"); assertEqual(f.book.typingInput.peekClaimedNext(), "r", "the corrected character resumes the same canonical title");
  f.key("Escape"); assert(!f.book.closing && !f.book.typingInput.hasPendingInput(), "first Escape only cancels the existing typed command");
  f.type("The Firefly Trail"); assertEqual(f.book.currentPage, 3, "case-insensitive canonical title typing opens exactly its earned lore page");
  assert(f.displays.some(display => display.scene && display.text === winterLorePageBody("the-firefly-trail", ALMANAC_LORE_PAGES["the-firefly-trail"].body)), "the direct destination renders the existing canonical discovery prose");
  f.type("contents"); assert(f.book.contentsOpen && f.book.currentPage === 3, "returning to contents preserves the original reading position");
  f.type("overview"); f.key("ArrowRight"); assertEqual(f.book.currentPage, 1, "ordinary sequential navigation still starts at the same first realm page");
  assertEqual(journey(f.store.get()), before, "direct reading grants no reward and changes no recorded branch");
  await f.finish();
});

await suite("Almanac direct reading: every earned chapter and discovery keeps its original page number and sequential neighbors", async () => {
  const f = fixture(fullSave()), sequence = JSON.stringify(f.book.pageStack), before = journey(f.store.get());
  for (const realmId of REALM_ORDER) {
    f.type("contents"); f.type(REALM_CONTENTS_COMMANDS[realmId]);
    const summary = f.book.currentPage;
    assertEqual(f.book.pageStack[summary], { kind: "realm", realmId }, "each short typed realm name opens its existing chapter");
    const discoveries = f.book.pageStack.map((entry: any, index: number) => ({ ...entry, index })).filter((entry: any) => entry.kind === "lore" && entry.realmId === realmId);
    for (const entry of discoveries) {
      f.book.openPage(summary); f.type(ALMANAC_LORE_PAGES[entry.loreId].title);
      assertEqual(f.book.currentPage, entry.index, "canonical title typing reaches the exact existing discovery index");
      assert(f.displays.some(display => display.scene && display.text === `page ${entry.index + 1} of ${f.book.pageStack.length}`), "the original numbered footer remains truthful after a jump");
      f.key("PageUp"); assertEqual(f.book.currentPage, entry.index - 1, "sequential previous still follows the original book order");
      f.key("PageDown"); assertEqual(f.book.currentPage, entry.index, "sequential next returns to the same numbered discovery");
    }
  }
  assertEqual(JSON.stringify(f.book.pageStack), sequence, "contents is unnumbered front matter and cannot insert or reorder saved book pages");
  assertEqual(journey(f.store.get()), before, "reading the entire index cannot edit saves, inventory, canon or earned-page membership");
  assert(Object.keys(f.store.get().keyStats).length > 0, "new links use the same real typing controller and keystroke telemetry as existing book commands");
  await f.finish();
});

await suite("Almanac index layout: standard and large ink links fit actual page lanes above the original navigation", async () => {
  for (const large of [false, true]) {
    const f = fixture(fullSave(large)); f.type("contents");
    const links = f.displays.filter(display => display.scene && Object.values(REALM_CONTENTS_COMMANDS).includes(display.text));
    assertEqual(links.length, 5, "the completed index displays one printed command per recorded realm");
    for (const display of f.displays.filter(display => display.scene && display.text)) {
      const left = display.x - display.width * display.originX, right = left + display.width;
      assert(left >= BOOK_X + 40 && right <= BOOK_X + BOOK_WIDTH - 40, "new contents text stays within its real book margins");
      assert(display.y >= BOOK_Y + 40 && display.y + display.height < PAGE_BOTTOM_Y, "contents descriptions and chapter metadata stay above the book's bottom edge");
    }
    for (const realmId of REALM_ORDER) {
      f.type(REALM_CONTENTS_COMMANDS[realmId]);
      const texts = f.displays.filter(display => display.scene && Object.values(ALMANAC_LORE_PAGES).some(page => page.title === display.text));
      assert(texts.length > 0, "each completed realm presents its actual stamped discovery commands");
      for (const display of texts) {
        assert(display.x === 280 && display.width <= 520 && display.height <= 34, "measured discovery links fit the printed left-page lane");
        assert(display.y + display.height + 1 < PAGE_BOTTOM_Y - 70, "the complete title and underline clear the existing previous/next/close row");
        assert(display.fontSize >= 20 && display.fontSize <= (large ? 26 : 22), "long names fit without truncating their exact typed command");
      }
      f.type("contents");
    }
    await f.finish();
  }
});

await suite("Almanac footer: both index commands fit between the original controls without covering carried illustrations", async () => {
  for (const large of [false, true]) {
    const f = fixture(fullSave(large)); f.book.openPage(1);
    for (const word of ["contents", "overview"]) {
      const previous = f.book.prevTarget, index = f.book.contentsTarget, close = f.book.closeTarget, next = f.book.nextTarget;
      assertEqual([index.opts.word, index.opts.x, index.opts.y], [word, 730, 864], "the index command belongs to the original footer row, below carried book illustrations");
      assertEqual([previous.opts.x, close.opts.x, next.opts.x], [490, 960, 1450], "the original previous, close and next anchors remain unchanged");
      assert([previous, close, next].every(target => target.opts.y === index.opts.y), "the complete navigation stays on one footer row");
      assert(footerBounds(previous).right + 20 < footerBounds(index).left, "the measured complete index plate clears the original previous plate at either text scale");
      assert(footerBounds(index).right + 20 < footerBounds(close).left, "the measured complete index plate clears the original close plate at either text scale");
      assert(footerBounds(index).right < 1020, "the index plate cannot overlap a right-page keepsake or its painted icon, including Glass-Fish");
      f.type(word);
    }
    await f.finish();
  }
});

await suite("Almanac navigation lifetime: canceled commands, stale completions, removed discoveries and close cannot redirect the reader", async () => {
  const f = fixture(fullSave()); f.type("contents"); f.type("winter mountain");
  const oldLink = f.book.directTargets[0], oldNext = f.book.nextTarget;
  f.key("ArrowRight"); const afterArrow = f.book.currentPage;
  oldLink.onComplete(); oldNext.opts.onComplete();
  assertEqual(f.book.currentPage, afterArrow, "callbacks from replaced page controls cannot perform a second delayed jump");
  f.book.openPage(1); const pageIndex = f.book.pageStack.findIndex((entry: any) => entry.kind === "lore" && entry.realmId === "winter-mountain");
  const id = f.book.pageStack[pageIndex].loreId;
  f.store.update(state => { state.almanacLore = state.almanacLore.filter(value => value !== id); });
  f.book.openPage(pageIndex); assertEqual(f.book.currentPage, 1, "a stamp removed after link creation is rechecked before direct access");
  f.type("contents"); const close = f.book.closeTarget, index = f.book.contentsTarget;
  const event = f.key("Escape");
  assertEqual([event.stopped, f.starts, f.book.closing], [1, ["stop", "resume:PortalChamberScene"], true], "idle Escape closes the overlay once and returns exclusive input to its original chamber");
  close.opts.onComplete(); index.opts.onComplete(); oldLink.onComplete();
  assertEqual(f.starts, ["stop", "resume:PortalChamberScene"], "stale close or index callbacks cannot resume or reopen anything twice");
  assertEqual(f.book.directTargets.length, 0, "closing unregisters all direct printed links");
  assert(f.book.testAnchors.every((anchor: any) => anchor.destroyed === 1 && anchor.body.destroyed === 1), "every old navigation tether and source zone is released exactly once");
  assert(f.displays.every(display => display.destroyed <= 1), "direct links and original page content keep separate, nonduplicated ownership");
  await f.finish();
});
