import { readFileSync } from "node:fs";
import ts from "typescript";
import { REALM_LORE, REALM_ORDER } from "../src/game/realmLore";
import { RELICS } from "../src/game/relics";
import { assert, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/AlmanacScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["addOverviewTitle", "renderOverviewPage"];
const constants = ["BOOK_X", "BOOK_Y", "BOOK_WIDTH", "BOOK_HEIGHT", "LEFT_PAGE_X", "RIGHT_PAGE_X", "TOP_TEXT_Y", "PAGE_TEXT_WIDTH", "COMPANION_IDS", "QUIET_LORD_FRAGMENTS", "PAGE_INK", "PAGE_INK_DIM"];
const code = ts.transpileModule(`${source.statements.filter(ts.isVariableStatement).flatMap(statement =>
  statement.declarationList.declarations.filter(declaration => constants.includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.getText(source)};`)).join("\n")}
class Almanac { ${names.map(name => owner.members.find(method => method.name?.getText(source) === name)!.getText(source)).join("\n")} }
return { Almanac, LEFT_PAGE_X, TOP_TEXT_Y, PAGE_TEXT_WIDTH };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { Almanac, LEFT_PAGE_X, TOP_TEXT_Y, PAGE_TEXT_WIDTH } = new Function("REALM_LORE", "REALM_ORDER", "RELICS", "UI_CSS", code)(REALM_LORE, REALM_ORDER, RELICS, { ink: "#2a1f12" });

// A measuring renderer double exercises the production method with unequal
// glyph advances. The browser screenshot separately checks the bundled font.
function fixture(profileName: string) {
  const state = Object.freeze({ profileName, realms: Object.freeze({}), satchel: Object.freeze([]), almanacLore: Object.freeze([]) });
  const before = JSON.stringify(state), records: any[] = [], rendered: string[] = [];
  const scene = new Almanac();
  const marks: any[] = [];
  Object.assign(scene, {
    store: { get: () => state }, clearedRealms: [],
    addPageText(x: number, y: number, text: string, style: any) {
      const record = { x, y, text, size: Number.parseInt(style.fontSize), style,
        get width() { return Math.ceil(Array.from(this.text).reduce((sum, point) => sum + (point === "W" ? 1.12 : point === "i" ? 0.22 : /[^\x00-\x7f]/u.test(point) ? 1.2 : 0.52), 0) * this.size); },
        get height() { return Math.ceil(this.size * 1.2) * this.text.split(/[\r\n\u2028\u2029]/u).length; },
        setFontSize(size: number) { this.size = size; return this; },
        setText(value: string) { rendered.push(value); this.text = value; return this; },
      };
      rendered.push(text); records.push(record); return record;
    },
    addOverviewRealmMark: (...args: any[]) => marks.push(args), addEmptyCompanionRack() {},
    addOverviewCompanionChip() {}, addOverviewQuietLordRecord() {}, addOverviewTallyPlaque() {}, renderPageFooter() {},
  });
  scene.renderOverviewPage();
  const title = records.find(record => record.x === LEFT_PAGE_X && record.y === TOP_TEXT_Y)!;
  const subtitle = records.find(record => record.x === LEFT_PAGE_X && record.y === TOP_TEXT_Y + 64)!;
  return { title, subtitle, state, before, rendered, records, marks };
}

await suite("Almanac title: normal names retain44px while a valid16-wide-letter name fits its existing page lane", () => {
  const normal = fixture("Wren");
  assertEqual([normal.title.text, normal.title.size], ["Wren's Almanac", 44], "ordinary overview title is unchanged");
  const narrow = fixture("i".repeat(16)), wide = fixture("W".repeat(16));
  assertEqual(narrow.title.size, 44, "fitting uses measured glyph width rather than a character-count rule");
  assert(wide.title.size < 44 && wide.title.size >= 24, "only the wide title reduces to a readable measured size");
  assertEqual(wide.title.text, `${"W".repeat(16)}'s Almanac`, "a normal editor-length name is kept complete");
  for (const f of [normal, narrow, wide]) {
    assert(f.title.width <= PAGE_TEXT_WIDTH, "title stays inside its original page width");
    assert(f.title.height + 8 <= f.subtitle.y - f.title.y, "one title line including page wake clears the unchanged subtitle");
    assertEqual([f.subtitle.style.fontSize, f.marks.length], ["22px", REALM_ORDER.length], "other overview text and realm rows retain their original layout");
    assertEqual(JSON.stringify(f.state), f.before, "rendering never modifies the saved profile");
  }
});

await suite("Almanac title: long and Unicode imported names are bounded before rendering and shortened only on screen", () => {
  for (const name of ["W".repeat(100_000), "🚀".repeat(20_000), "Zoë 大山 🦊", "North\nMountain\r\tWren\u2028Family\u2029Name"]) {
    const f = fixture(name);
    assert(f.title.width <= PAGE_TEXT_WIDTH && f.title.height + 8 <= 64, "measured title fits both original page and subtitle bounds");
    assert(f.title.size >= 24 && f.title.size <= 44, "display title remains readable");
    assert(f.title.text.endsWith("'s Almanac"), "only the displayed name can be shortened; the title suffix stays whole");
    assert(!/[\r\n\u2028\u2029]/u.test(f.title.text), "imported line breaks cannot create a second title line");
    assert(f.rendered.every(value => Array.from(value).length <= 75), "the renderer never receives the unbounded imported name");
    assert(f.rendered.every(value => value.isWellFormed()), "display truncation does not split Unicode surrogate pairs");
    assertEqual(f.state.profileName, name, "the complete imported profile name is preserved");
    assertEqual(JSON.stringify(f.state), f.before, "overview fitting has no save or inventory side effect");
    if (name.length > 1000) assert(f.title.text.includes("…"), "overlong displayed names visibly acknowledge truncation");
    else if (!/\s/u.test(name.replaceAll(" ", ""))) assertEqual(f.title.text, `${name}'s Almanac`, "short Unicode names keep their complete spelling");
  }
});
