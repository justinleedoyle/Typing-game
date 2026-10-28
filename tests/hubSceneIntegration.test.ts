import { readFileSync } from "node:fs";
import ts from "typescript";
import EventEmitter from "eventemitter3";
import { RELICS } from "../src/game/relics";
import { TypingInputController, type WordTarget } from "../src/game/typingInput";
import { navigationAction } from "../src/game/ui/navigationPolicy";
import { assert, assertClose, assertEqual, suite } from "./_assert";

const url = new URL("../src/scenes/PortalChamberScene.ts", import.meta.url);
const source = ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const owner = source.statements.find(ts.isClassDeclaration)!;
const names = ["drawRoom", "drawRuna", "drawWren", "drawArch", "renderArch", "drawPortalGlow", "drawArchLabels", "drawArchKeystone", "drawKeystoneGlyph", "drawArchStatusPlaque", "registerPortalZoneTargets", "registerRealmPortalTarget", "registerShelfZoneTargets", "registerPortalReturnTarget", "registerDeskAlmanacTarget", "registerNavTarget", "stageHubTarget", "drawDisplayShelf", "clearShelfDisplay", "stageShelfObject", "openAlmanac", "resumeAfterAlmanac", "enterZone", "clearZoneTargets", "onKeyDown"];
const constants = source.statements.filter(ts.isVariableStatement).map(node => node.getText(source)).join("\n");
const targetY = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "archTargetY")!;
const create = owner.members.find(node => node.name?.getText(source) === "create") as ts.MethodDeclaration;
const placeWren = create.body!.statements.find(node => ts.isExpressionStatement(node) && node.expression.getText(source).startsWith("this.wrenContainer = this.drawWren("))!;
const code = ts.transpileModule(`${constants}\n${targetY.getText(source)}\nclass Hub {
  static geometry = { ARCHES, ZONE_X, WREN_Y, SHELF_GRID, SHELF_STATION, RUNA_DESK_STATION, HUB_STATIONS };
  placeWren() { ${placeWren.getText(source)} }
  ${names.map(name => owner.members.find(node => node.name?.getText(source) === name)!.getText(source)).join("\n")}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const pngSize = (path: string) => { const bytes = readFileSync(new URL(path, import.meta.url)); return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; };
const backdrop = pngSize("../art/references/hub-portal-chamber-clean.png");
const runa = pngSize("../art/runa/runa-front.png");
const wren = pngSize("../art/wren/wren-front.png");
const wrenSource = ts.createSourceFile("wren.ts", readFileSync(new URL("../src/game/wren.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const wrenConstants = wrenSource.statements.filter(ts.isVariableStatement).filter(node => node.declarationList.declarations.some(decl => ["WREN_DISPLAY_HEIGHT", "TEXTURE"].includes(decl.name.getText(wrenSource))));
const makeWren = wrenSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "makeWrenSprite")!;
const makeWrenSprite = new Function("applySceneActorLighting", ts.transpileModule(`${wrenConstants.map(node => node.getText(wrenSource)).join("\n")}\n${makeWren.getText(wrenSource).replace(/^export /, "")}\nreturn makeWrenSprite;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(() => {});
const noop = () => {};
// Independent Iowan Old Style regular advances measured from the shipped macOS
// font at 1000px. These constrain neighboring nameplates, not just their centers.
const advances: Record<string, number> = { "Winter Mountain": 7.7884, "Sunken Bell": 5.3025, "Clockwork Forge": 7.6124, "Sky Island": 4.5527, "Haunted Wood": 6.8346 };
const wordSource = ts.createSourceFile("wordTarget.ts", readFileSync(new URL("../src/game/wordTarget.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const bannerConstant = (name: string) => Number(wordSource.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations).find(node => node.name.getText(wordSource) === name)!.initializer!.getText(wordSource));
const bannerPad = bannerConstant("BANNER_PAD_X"), bannerPadY = bannerConstant("BANNER_PAD_Y");
type DrawOp = { name: string; args: number[] };
function inkBounds(ops: DrawOp[]) {
  const points: number[][] = [];
  let halfStroke = 0;
  for (const { name, args: a } of ops) {
    if (name === "lineStyle") halfStroke = a[0] / 2;
    const point = (x: number, y: number, outset = halfStroke) => points.push([x-outset, y-outset], [x+outset, y+outset]);
    if (name === "moveTo" || name === "lineTo") point(a[0], a[1]);
    if (name === "lineBetween") { point(a[0], a[1]); point(a[2], a[3]); }
    if (name === "strokeCircle") { point(a[0]-a[2], a[1]-a[2]); point(a[0]+a[2], a[1]+a[2]); }
    if (name === "fillEllipse") { point(a[0]-a[2]/2, a[1]-a[3]/2, 0); point(a[0]+a[2]/2, a[1]+a[3]/2, 0); }
  }
  return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}
function glyphSignature(call: { ops: DrawOp[]; x: number; y: number }) {
  return JSON.stringify(call.ops.filter(op => op.name !== "lineStyle").map(({ name, args }) => ({ name, args: args.map((value, i) => {
    const coordinate = ["moveTo", "lineTo", "lineBetween"].includes(name) || (name === "strokeCircle" && i < 2);
    return Math.round((coordinate ? value - (i % 2 ? call.y : call.x) : value) * 10000) / 10000;
  }) })));
}

function fixture(satchel: string[] = [], cleared = 0) {
  let now = 0, paused = false;
  const scheduled: Array<{ at: number; next: () => void }> = [];
  const objects: any[] = [], tweens: any[] = [], masks: any[] = [], words: any[] = [], drifts: any[] = [], breaths: any[] = [], launches: any[] = [], stationFocus: any[] = [];
  const events = new EventEmitter();
  const state = { typewriterAwakened: true, satchel, realms: {} as Record<string, any> };
  function object(x = 0, y = 0, key = "") {
    const b: any = { x, y, key, scene: true, active: true, alpha: 1, scaleX: 1, scaleY: 1, children: [], ops: [], destroyed: 0,
      setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; },
      setDepth(depth: number) { this.depth = depth; return this; }, setAlpha(alpha: number) { this.alpha = alpha; return this; },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }, setVisible(visible: boolean) { this.visible = visible; return this; },
      setDisplaySize(width: number, height: number) { this.displayWidth = width; this.displayHeight = height; return this; },
      setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; },
      add(children: any) { this.children.push(...(Array.isArray(children) ? children : [children])); return this; },
      setMask(mask: any) { this.mask = mask; return this; }, clearMask() { this.mask = null; return this; },
      destroy() { if (!this.scene) return; this.destroyed++; this.scene = false; this.active = false; for (const child of this.children) child.destroy?.(); },
    };
    objects.push(b); return b;
  }
  function graphics() {
    const b = object();
    const proxy = new Proxy(b, { get(target, key) {
      if (key in target) return target[key];
      if (key === "createGeometryMask") return () => { const mask = { destroyed: 0, destroy() { this.destroyed++; } }; masks.push(mask); return mask; };
      return (...args: any[]) => { if (key === "clear") b.ops = []; else b.ops.push({ name: key, args }); return proxy; };
    } });
    return proxy;
  }
  function later(ms: number, next: () => void) { scheduled.push({ at: now + ms, next }); }
  class Target implements WordTarget {
    cursor = 0; destroyed = false; priority: number; width: number;
    constructor(readonly opts: any) { this.priority = opts.priority ?? 0; this.width = (advances[opts.word] ?? opts.word.length * 0.55) * opts.fontSize + (opts.frame === "banner" ? bannerPad : 0); words.push(this); }
    remaining() { return this.opts.word.toLowerCase().slice(this.cursor); }
    isComplete() { return this.cursor === this.opts.word.length; }
    advance() { this.cursor++; } miss() {} onClaim(mods: any) { this.opts.onClaim?.(mods); }
    onRelease() { this.cursor = 0; } setDimmed() {} setCandidate() {}
    onComplete() { later(320, () => { if (!this.destroyed) this.opts.onComplete(); }); }
    destroy() { this.destroyed = true; } playEntryWake() {} playIdleFloat() {}
    getAnchorX() { return this.opts.x; } getAnchorY() { return this.opts.y; }
  }
  const globals = {
    TextWordTarget: Target, RELICS, SERIF: "Iowan Old Style", UI_HEX: { panel: 0, brass: 0, frame: 0 }, PALETTE: { cream: "cream", brass: "brass" }, PALETTE_HEX: { brass: 0 },
    Phaser: { Scenes: { Events: { SHUTDOWN: "shutdown" } } }, navigationAction,
    isPuristToggleKey: () => false, playClack: noop, playChime: noop,
    addBackdropDrift: (_s: any, body: any) => drifts.push(body), addIdleBreath: (_s: any, body: any) => breaths.push(body),
    addAmbientDrift: noop, addLivingLight: noop, addGroundShadow: noop, addContainerWake: noop, applySceneActorLighting: noop,
    makeWrenSprite, addLocalGroundShadow: () => object(),
    satchelIconFor: (id: string) => ({ key: `icon-${id}` }),
  };
  const Hub = new Function(...Object.keys(globals), code + "; return Hub;")(...Object.values(globals));
  const hub = new Hub();
  for (const [i, arch] of Hub.geometry.ARCHES.entries()) state.realms[arch.id] = { cleared: i < cleared };
  const keyboard = new Set<unknown>(); keyboard.add(hub.onKeyDown);
  Object.assign(hub, {
    scale: { width: 1920, height: 1080 }, store: { get: () => state }, events,
    archGraphics: new Map(), archGlows: new Map(), archSprites: new Map(), portalInstructionObjects: [],
    shelfDisplayObjects: [], zoneTargets: [], portalWordAnchors: [], stationWordAnchorReleases: [],
    activeZone: "portals", showPortalRevisits: true, openingUtilityScene: false, almanacOverlayOpen: false,
    typingInput: new TypingInputController(), narration: { clear: noop, say: noop, clearAfter: noop },
    input: { keyboard: { on(_event: string, fn: unknown) { keyboard.add(fn); }, off(_event: string, fn: unknown) { keyboard.delete(fn); } } },
    scene: { launch(key: string, data: any) { launches.push({ key, data }); }, pause() { paused = true; }, isActive: () => !paused },
    add: {
      image(x: number, y: number, key: string) { return Object.assign(object(x, y, key), key === "runa-sprite" ? runa : key === "wren-front" ? wren : { width: 80, height: 120 }); },
      container: object, graphics,
      text(x: number, y: number, text: string, style: any) { return Object.assign(object(x, y), { text, style }); },
      sprite(x: number, y: number, key: string) { const b = object(x, y, key); b.anims = { isPlaying: false }; b.play = () => { b.anims.isPlaying = true; }; b.stop = () => { b.anims.isPlaying = false; }; b.clearTint = () => b; return b; },
    }, make: { graphics }, textures: { exists: (key: string) => !key.includes("missing-icon") },
    time: { delayedCall: later }, tweens: { add(options: any) { tweens.push(options); return options; }, killTweensOf(body: any) { for (const t of tweens) if (t.targets === body) t.cancelled = true; } },
    startHubForegroundLife: noop, drawHubStations: noop, walkWrenTo: noop, clearDeskDisplay: noop, clearAccountDisplay: noop,
    clearPortalFloorCallWake: noop, playShelfDisplayWake: noop, playHubActorAction: noop, pulseStation: noop, playUtilityStationExitWake: noop,
    attachStationWordAnchor: () => noop, attachPortalWordAnchor: () => noop, attachPortalFloorCallAnchor: () => noop, playPortalClaimLine: noop, focusPortalForScene: noop,
    pulsePortalTyping: noop, focusStation: (station: any) => stationFocus.push(station), pulseStationTyping: noop, showPortalFloorCallGlow: noop, showPortalFloorCallWake: noop,
    onEnterPortal: noop, registerAccountZoneTargets: noop,
    registerDeskZoneTargets() { this.registerDeskAlmanacTarget(); this.registerPortalReturnTarget(70); },
    chapterMenu: { handleKey: () => false },
  });
  return { hub, geometry: Hub.geometry, objects, masks, words, tweens, drifts, breaths, launches, state, keyboard, stationFocus,
    paused: () => paused,
    resumeBook() { paused = false; hub.resumeAfterAlmanac(); },
    tick(ms: number) { const end = now + ms; while (true) { scheduled.sort((a,b) => a.at-b.at); if (!scheduled[0] || scheduled[0].at > end) break; const t = scheduled.shift()!; now = t.at; t.next(); } now = end; },
    type(word: string) { if (paused) return; for (const key of word) for (const listener of keyboard) (listener as Function).call(hub, { key, ctrlKey: false, metaKey: false, repeat: false, preventDefault: noop }); },
  };
}

await suite("Hub integration: the painted architecture and every portal mask share one stationary coordinate frame", () => {
  const f = fixture(); f.hub.drawRoom();
  const room = f.objects.find(o => o.key === "hub-backdrop");
  assertEqual([room.x, room.y, room.displayWidth, room.displayHeight], [0, 0, 1920, 1080], "the fixed room preserves its original mapping to the source image");
  assertEqual(f.drifts, [], "the architecture cannot drift independently of its masks and stations");
  assert(!f.tweens.some(t => t.targets === room), "no direct architecture tween replaces the removed backdrop drift");
  // Measured inner apertures in the accepted1672x941 painting, independent of ARCHES.
  const centers = [401, 618, 836, 1053, 1271];
  for (const [i, arch] of f.geometry.ARCHES.entries()) {
    assertClose(arch.x / 1920 * backdrop.width, centers[i], 1.5, "the aperture is centered on its painted opening");
    assertClose(arch.baseY / 1080 * backdrop.height, 606, 1.5, "the threshold meets the same painted floor");
    assert(arch.width / 1920 * backdrop.width <= 126 && arch.height / 1080 * backdrop.height <= 279, "fill geometry cannot cover the stone surround");
    f.hub.drawArch(arch);
    const sprite = f.hub.archSprites.get(arch.id), glow = f.hub.archGlows.get(arch.id);
    assertEqual([sprite.x, sprite.y, sprite.originX, sprite.originY], [arch.x, arch.baseY, 0.5, 1], "the actual sprite is feet-anchored to its own aperture");
    assert(sprite.mask && sprite.mask === glow.mask, "the actual sprite and its living light share one aperture mask");
    f.hub.renderArch(arch, "cleared");
    assertEqual(f.hub.archGraphics.get(arch.id).ops, [], "a cleared portal cannot acquire an unrelated procedural second arch");
  }
  f.hub.events.emit("shutdown");
  assert(f.masks.every(mask => mask.destroyed === 1), "scene shutdown releases every actual aperture mask once");
});

await suite("Hub integration: above-arch names and carved realm glyphs stay on their painted architecture", () => {
  const expectedGlyphs = ["mountain", "bell", "cog", "lantern", "branch"];
  const stoneX = [402, 619, 836, 1053, 1270];
  let originalGlyphs: string[] | undefined;
  for (const cleared of [0, 1, 5]) {
    const f = fixture([], cleared); f.hub.registerPortalZoneTargets();
    f.hub.placeWren();
    const actorTop = f.hub.wrenContainer.y + f.hub.wrenSprite.y - f.hub.wrenSprite.height * f.hub.wrenSprite.scaleY;
    const labels = f.words.filter(word => f.geometry.ARCHES.some((arch: any) => arch.label === word.opts.word)).sort((a,b) => a.opts.x-b.opts.x);
    for (const word of labels) {
      const arch = f.geometry.ARCHES.find((arch: any) => arch.label === word.opts.word);
      assertEqual(word.opts.frame, "banner", "realm names have complete readable plates above their doors");
      assertEqual(word.opts.x, arch.x, "every nameplate shares its own painted door center");
      // A deliberately generous 1.5em text line plus the real banner padding
      // contains the full plate; reserve the existing four-pixel idle breath too.
      const halfHeight = (word.opts.fontSize * 1.5 + bannerPadY) / 2;
      assert(word.opts.y - halfHeight >= 250 && word.opts.y + halfHeight < 296 / backdrop.height * 1080 - 8, "the full plate stays below the caption lane and above the painted keystone");
      assert(actorTop - 4 > word.opts.y + halfHeight, "Wren's full head bounds stay below every nameplate, including the centered Forge revisit");
      assert(word.opts.y + halfHeight < 575 / backdrop.height * 1080, "the plate clears the measured chair crest instead of returning to its threshold overlap");
    }
    for (let i = 1; i < labels.length; i++) assert(labels[i-1].opts.x + labels[i-1].width/2 + 8 < labels[i].opts.x-labels[i].width/2, "measured complete titles leave a readable gap to the next nameplate");
    const carvings: any[] = [], calls: any[] = [];
    const drawStone = f.hub.drawArchKeystone.bind(f.hub), drawGlyph = f.hub.drawKeystoneGlyph.bind(f.hub);
    f.hub.drawArchKeystone = (arch: any, tone: string) => { const before = f.objects.length; drawStone(arch, tone); carvings.push({ arch, tone, g: f.objects[before] }); };
    f.hub.drawKeystoneGlyph = (g: any, glyph: string, x: number, y: number, color: number, alpha: number) => {
      const start = g.ops.length; drawGlyph(g, glyph, x, y, color, alpha); calls.push({ glyph, x, y, color, alpha, ops: g.ops.slice(start) });
    };
    f.hub.drawArchLabels();
    assertEqual(carvings.length, 5, "actual chapter-state rendering creates one keystone for every realm, including the next available one");
    assertEqual(calls.length, 10, "each carving has one recessed edge and one visible realm glyph");
    const faces = calls.filter((_: any, i: number) => i % 2);
    assertEqual(faces.map((call: any) => call.glyph), expectedGlyphs, "the five canonical realms keep their own symbols in every progress state");
    const signatures = faces.map(glyphSignature);
    assertEqual(new Set(signatures).size, 5, "realm identity is five distinct drawn shapes rather than a shared lock");
    if (originalGlyphs) assertEqual(signatures, originalGlyphs, "progress changes state treatment without replacing a realm's carved symbol");
    else originalGlyphs = signatures;
    for (const [i, { arch, tone, g }] of carvings.entries()) {
      const expectedTone = i < cleared ? "cleared" : i === cleared ? "next" : "locked";
      assertEqual(tone, expectedTone, "saved progress gives completed, available, and locked stones the correct treatment");
      assertEqual([faces[i].color, faces[i].alpha], tone === "cleared" ? [0xe0bf70, 0.96] : tone === "next" ? [0x9bdaed, 0.96] : [0x8b877d, 0.64], "finished brass, available blue, and locked muted gray remain distinct");
      assertClose(faces[i].x / 1920 * backdrop.width, stoneX[i], 2.5, "the glyph is horizontally carved into its independently measured stone");
      assertClose(faces[i].y / 1080 * backdrop.height, 309.5, 1.5, "the glyph face is centered on the painted keystone face");
      const bounds = inkBounds(g.ops);
      assert(bounds.left / 1920 * backdrop.width >= stoneX[i] - 15 && bounds.right / 1920 * backdrop.width <= stoneX[i] + 15 && bounds.top / 1080 * backdrop.height >= 295 && bounds.bottom / 1080 * backdrop.height <= 327, "all carved ink, completion chevron, and local light fit the painted keystone");
      assert(!g.ops.some((op: DrawOp) => ["arc", "fillCircle", "fillRoundedRect", "strokeRoundedRect"].includes(op.name)), "the stone never gains a generic lock or a detached badge surround");
      const afterFace = g.ops.slice(g.ops.indexOf(faces[i].ops.at(-1)) + 1);
      const completionPoints = afterFace.filter((op: DrawOp) => op.name === "moveTo" || op.name === "lineTo").map((op: DrawOp) => op.args);
      assertEqual(completionPoints.length, tone === "cleared" ? 3 : 0, "only completed realms add a separate completion mark after their unchanged symbol");
      if (tone === "cleared") assert(completionPoints[0][0] < completionPoints[1][0] && completionPoints[1][0] < completionPoints[2][0] && completionPoints[1][1] > completionPoints[0][1] && completionPoints[2][1] < completionPoints[0][1], "the completion stroke reads as a rising chevron instead of another lock or flat underline");
      assertEqual(g.ops.filter((op: DrawOp) => op.name === "fillEllipse").length, tone === "locked" ? 0 : 1, "the locked carving has no available/completed light wash");
    }
    const profile = f.words.find(word => word.opts.word === "profile");
    assert(profile.opts.x + profile.width/2 < 1920 && profile.opts.x-profile.width/2 > 1700 && profile.opts.y >= 85 && profile.opts.y < 140, "profile is a contained top-right utility below Pause");
    profile.onClaim({});
    assertEqual(f.stationFocus, [], "claiming the utility never lights an unrelated account object in the painting");
  }
  const f = fixture(); f.hub.drawRuna(); const figure = f.hub.runaSprite;
  assert(figure.x + figure.width*figure.scaleX/2 < f.geometry.ARCHES[0].x - (advances["Winter Mountain"]*24+bannerPad)/2, "foreground Runa clears the complete first nameplate");
  assert(f.geometry.RUNA_DESK_STATION.targetY > figure.y && f.geometry.RUNA_DESK_STATION.targetY < 1080, "Runa's command stays at her foreground feet inside the canvas");
  assert(f.geometry.HUB_STATIONS.almanac.x < 330 && f.geometry.HUB_STATIONS.almanac.y > 640 && f.geometry.HUB_STATIONS.almanac.y < 740, "the book action is on the painted desk rather than behind Runa");
});

await suite("Hub integration: empty and full shelves use the painted cabinet and clean every fixed display after leaving", () => {
  const ids = Object.keys(RELICS);
  for (const inventory of [[], ["unknown-item"], ["unknown-item", ...ids, "unknown-item"]]) {
    const f = fixture(inventory); f.hub.drawDisplayShelf();
    const count = inventory.filter(id => !!RELICS[id]).length;
    const tiles = f.hub.shelfDisplayObjects.filter((o: any) => o.children.length);
    assertEqual(tiles.length, Math.min(count, 16), "unknown ids cannot leave gaps or create off-cabinet rows");
    for (const tile of tiles) {
      // Actual cabinet door inset and shelf surfaces measured in the source painting.
      const x = tile.x/1920*backdrop.width, y = tile.y/1080*backdrop.height;
      assert(x >= 1510 && x <= 1605, "keepsakes remain inside the painted cabinet's narrow inset");
      assert([387, 462, 540, 604].some(surface => Math.abs(surface-y)<3), "each row rests on a real shelf surface");
    }
    assert(f.objects.some(o => typeof o.text === "string" && (count ? o.text.includes(`${count} keepsake`) : o.text.includes("empty"))), "a visible count or empty explanation identifies this station");
    assert(!f.objects.some(o => o.ops.some((op: any) => ["fillRoundedRect", "strokeRoundedRect"].includes(op.name))), "shelf contents do not create a floating interface grid over the cabinet");
    assertEqual(f.breaths, [], "shelf solids never idle-bob above their supporting wood");
    const old = [...f.hub.shelfDisplayObjects]; f.hub.clearShelfDisplay(); f.hub.clearShelfDisplay(); f.tick(2000);
    assert(old.every(o => o.destroyed === 1) && f.hub.shelfDisplayObjects.length === 0, "leaving destroys each displayed object exactly once");
    assertEqual(f.tweens.length, 0, "late alpha-entry callbacks cannot resurrect an already cleared shelf");
  }
  const live = fixture(ids); live.hub.drawDisplayShelf(); live.tick(2000);
  assert(live.tweens.length > 0 && live.tweens.every(t => !["x", "y", "scaleX", "scaleY"].some(key => key in t)), "settled shelf entrances change opacity only and leave physical support coordinates fixed");
});

await suite("Hub integration: shelf commands truly type, open the book once and restore input to the initiating station", () => {
  for (const zone of ["shelf", "desk"]) {
    const f = fixture(["hunters-horn"]); f.hub.enterZone(zone, false);
    const book = f.words.find(word => word.opts.word === "almanac");
    assert(book && f.hub.typingInput, "the initiating station registers a genuine book word");
    if (zone === "shelf") {
      const back = f.words.find(word => word.opts.word === "portals");
      assert(book.opts.x >= 1690 && back.opts.x >= 1690 && book.opts.y > 780 && back.opts.y < 980, "both real shelf actions are readable beside the cabinet");
    }
    f.type("almanac"); f.tick(320);
    assert(f.hub.openingUtilityScene && f.launches.length === 0, "native success starts the original short book-opening beat");
    f.hub.openAlmanac(); f.hub.resumeAfterAlmanac();
    assertEqual([f.hub.almanacReturnZone, f.hub.openingUtilityScene, f.launches.length], [zone, true, 0], "duplicate opens or an early pause-resume cannot redirect the station");
    f.tick(210);
    assertEqual([f.launches.length, f.launches[0].key, f.paused(), f.keyboard.size], [1, "AlmanacScene", true, 0], "the launched overlay takes exclusive typing ownership once");
    f.type("portals");
    assertEqual([f.hub.activeZone, f.hub.typingInput.getTypingBuffer()], [zone, ""], "book-overlay keystrokes cannot leak into the paused chamber");
    f.resumeBook();
    assertEqual([f.hub.activeZone, f.hub.openingUtilityScene, f.hub.almanacOverlayOpen, f.keyboard.size], [zone, false, false, 1], "closing restores the initiating desk or shelf and one input listener");
    f.type("portals"); f.tick(320);
    assertEqual(f.hub.activeZone, "portals", "the first full native return command works after closing the book");
    assertEqual(f.hub.typingInput.getTypingBuffer(), "", "replacing station targets leaves no invisible shared prefix");
  }
});
