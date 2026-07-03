import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import {
  ALMANAC_LORE_PAGES,
  lorePageIdsForRealm,
} from "../game/almanacLorePages";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { UI_CSS, UI_HEX } from "../game/ui/uiTheme";
import { drawStaticQuietLordFragment } from "../game/quietLordIntrusion";
import { REALM_LORE, REALM_ORDER } from "../game/realmLore";
import { RELICS } from "../game/relics";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import {
  addAmbientDrift,
  addLivingLight,
  attachWordBodyAnchor,
  type WordBodyAnchorHandle,
} from "../game/livingScene";

/** Page-stack entry. The Almanac walks: overview → for each cleared realm,
 *  the realm summary page then each of that realm's stamped lore pages, in
 *  spec sequence. Index 0 is always the overview. */
type AlmanacPageEntry =
  | { kind: "overview" }
  | { kind: "realm"; realmId: string }
  | { kind: "lore"; loreId: string; realmId: string };

interface AlmanacSceneData {
  store: SaveStore;
}

const PAGE_INK = UI_CSS.ink; // "#2a1f12" — shared with the dialogue-card ink
const PAGE_INK_DIM = "#6a543a";

// Companion creature IDs, one per realm. Stored in `satchel` alongside relics
// but called out separately on the overview page (they're the kindness-gated
// collectibles, not just souvenirs). Order matches REALM_ORDER.
const COMPANION_IDS: readonly string[] = [
  "snow-fox-cub",
  "glass-fish",
  "brass-songbird",
  "lantern-moth",
  "wisp-cat",
];

// Painted satchel icons — bulk-imported so a new relic/companion art file is
// picked up without editing a list here. The relic id IS its icon filename
// (art/relics/<id>.png); companions reuse their creature sprite
// (art/companions/<file>.png), and only the snow-fox's file name differs from its
// id. Missing files just fall back to a text bullet, so partial art is fine.
const RELIC_ICON_URLS = import.meta.glob("../../art/relics/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const COMPANION_ICON_URLS = import.meta.glob("../../art/companions/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const COMPANION_ICON_FILE: Record<string, string> = {
  "snow-fox-cub": "snow-fox",
  "glass-fish": "glass-fish",
  "brass-songbird": "brass-songbird",
  "lantern-moth": "lantern-moth",
  "wisp-cat": "wisp-cat",
};

/** Resolve `<dir>/<name>.png` to its bundled URL from a glob map. */
function globUrl(urls: Record<string, string>, name: string): string | undefined {
  for (const [path, url] of Object.entries(urls)) {
    if (path.endsWith(`/${name}.png`)) return url;
  }
  return undefined;
}

/** The Phaser texture key + source URL for a satchel id's icon, or null if no
 *  art file exists for it yet. */
function iconFor(id: string): { key: string; url: string } | null {
  const file = COMPANION_ICON_FILE[id];
  const url = file
    ? globUrl(COMPANION_ICON_URLS, file)
    : globUrl(RELIC_ICON_URLS, id);
  return url ? { key: `almanac-icon-${id}`, url } : null;
}

// Quiet Lord's fragment per cleared-realm count, per §5.5.10. The period
// only clicks in at the finale, not at the 5th realm boss — so count=5 is
// "Again", not "Again."
const QUIET_LORD_FRAGMENTS: readonly string[] = [
  "",
  "A",
  "Ag",
  "Aga",
  "Agai",
  "Again",
];

export class AlmanacScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private bookGraphics!: Phaser.GameObjects.Graphics;
  private pageTexts: Phaser.GameObjects.GameObject[] = [];
  private currentPage = 0;
  private clearedRealms: string[] = [];
  /** The full ordered page sequence the player walks. Built in create();
   *  currentPage is an index into this array. */
  private pageStack: AlmanacPageEntry[] = [];
  private nextTarget?: TextWordTarget;
  private prevTarget?: TextWordTarget;
  private closeTarget?: TextWordTarget;
  private navAnchorReleases: Array<() => void> = [];
  private navTypingPulseTimes = new Map<string, number>();

  constructor() {
    super("AlmanacScene");
  }

  init(data: AlmanacSceneData): void {
    this.store = data.store;
    this.currentPage = 0;
    this.pageTexts = [];
    this.pageStack = [];
    this.navAnchorReleases = [];
    this.navTypingPulseTimes.clear();
  }

  preload(): void {
    // Load every satchel icon that has art (relics + companions). Keyed by id;
    // ids without a file are simply skipped (the row falls back to a bullet).
    for (const id of Object.keys(RELICS)) {
      const icon = iconFor(id);
      if (icon) this.load.image(icon.key, icon.url);
    }
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 15);

    // Dim backdrop so the chamber feels behind the book.
    const g = this.add.graphics();
    g.fillStyle(0x0b0a0f, 0.92);
    g.fillRect(0, 0, this.scale.width, this.scale.height);
    g.setDepth(-20);

    addAmbientDrift(this, {
      kind: "mote",
      count: 18,
      depth: -2,
      area: {
        x: 240,
        y: 120,
        width: this.scale.width - 480,
        height: this.scale.height - 230,
      },
      alpha: 0.16,
      minSize: 1.5,
      maxSize: 4,
      driftX: 62,
      driftY: -118,
      minDurationMs: 7200,
      maxDurationMs: 14500,
    });
    addAmbientDrift(this, {
      kind: "mote",
      count: 8,
      depth: -0.35,
      area: {
        x: BOOK_X + 60,
        y: BOOK_Y + 120,
        width: BOOK_WIDTH - 120,
        height: BOOK_HEIGHT - 210,
      },
      alpha: 0.12,
      minSize: 3,
      maxSize: 6.5,
      driftX: 32,
      driftY: -56,
      minDurationMs: 6600,
      maxDurationMs: 12200,
    });
    addLivingLight(this, {
      x: BOOK_X + 180,
      y: BOOK_Y + 150,
      width: 420,
      height: 210,
      color: UI_HEX.brass,
      alpha: 0.035,
      depth: -4,
      durationMs: 3100,
    });
    addLivingLight(this, {
      x: BOOK_X + BOOK_WIDTH - 210,
      y: BOOK_Y + 650,
      width: 380,
      height: 220,
      color: UI_HEX.parchment,
      alpha: 0.028,
      depth: -4,
      durationMs: 3700,
      delayMs: 600,
      scale: 1.035,
    });

    this.bookGraphics = this.add.graphics();
    this.drawBook();

    const state = this.store.get();
    this.clearedRealms = REALM_ORDER.filter(
      (id) => state.realms[id]?.cleared,
    );
    this.pageStack = this.buildPageStack(state.almanacLore);

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    this.renderCurrentPage();
    this.placeNavigationTargets();
    this.playBookEntryWake();
  }

  /** Walk cleared realms in REALM_ORDER and inline the lore pages the
   *  player has stamped for each one, in the spec sequence defined by
   *  almanacLorePages.ts. Hidden / unknown IDs in saveState.almanacLore are
   *  ignored so a stale save can't crash the reader. */
  private buildPageStack(stampedLoreIds: string[]): AlmanacPageEntry[] {
    const stack: AlmanacPageEntry[] = [{ kind: "overview" }];
    const stamped = new Set(stampedLoreIds);
    for (const realmId of this.clearedRealms) {
      stack.push({ kind: "realm", realmId });
      for (const loreId of lorePageIdsForRealm(realmId)) {
        if (stamped.has(loreId) && ALMANAC_LORE_PAGES[loreId]) {
          stack.push({ kind: "lore", loreId, realmId });
        }
      }
    }
    return stack;
  }

  private renderCurrentPage(): void {
    for (const t of this.pageTexts) t.destroy();
    this.pageTexts = [];

    const entry = this.pageStack[this.currentPage];
    if (!entry || entry.kind === "overview") {
      this.renderOverviewPage();
      return;
    }
    if (entry.kind === "lore") {
      this.renderLorePage(entry.loreId, entry.realmId);
      return;
    }

    const realmId = entry.realmId;
    const lore = REALM_LORE[realmId];
    const state = this.store.get();
    const realmProgress = state.realms[realmId];
    if (!lore || !realmProgress) {
      // Stale stack entry (cleared-realm flag flipped between create() and
      // now somehow) — clamp back to overview rather than rendering blank.
      this.currentPage = 0;
      this.renderOverviewPage();
      return;
    }

    // Left page: title + stamp + intro
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y,
      lore.title,
      { fontSize: "48px", color: PAGE_INK },
    );
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y + 70,
      "stamped in the almanac",
      {
        fontSize: "22px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      },
    );
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y + 160,
      lore.intro,
      {
        fontSize: "26px",
        color: PAGE_INK,
        wordWrap: { width: PAGE_TEXT_WIDTH },
      },
    );

    // Right page: ending + satchel
    const choices = realmProgress.choices as Record<string, string> | undefined;
    const primaryKey = this.resolveEndingKey(realmId, choices);
    const secondaryKey = this.resolveSecondaryEndingKey(realmId, choices);
    const primaryText =
      (primaryKey && lore.endings[primaryKey]) ?? "His path remains unwritten.";
    const secondaryText =
      secondaryKey ? (lore.endings[secondaryKey] ?? undefined) : undefined;

    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y, "His path:", {
      fontSize: "30px",
      fontStyle: "italic",
      color: PAGE_INK_DIM,
    });
    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 60, primaryText, {
      fontSize: "26px",
      color: PAGE_INK,
      wordWrap: { width: PAGE_TEXT_WIDTH },
    });

    if (secondaryText) {
      this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 180, secondaryText, {
        fontSize: "26px",
        color: PAGE_INK,
        wordWrap: { width: PAGE_TEXT_WIDTH },
      });
    }

    const relicsY = secondaryText ? TOP_TEXT_Y + 420 : TOP_TEXT_Y + 320;

    const realmRelics = state.satchel
      .map((id) => RELICS[id])
      .filter((r) => r?.realmId === realmId);

    if (realmRelics.length > 0) {
      this.addPageText(
        RIGHT_PAGE_X,
        relicsY,
        "He carried away:",
        {
          fontSize: "26px",
          fontStyle: "italic",
          color: PAGE_INK_DIM,
        },
      );
      realmRelics.forEach((r, i) => {
        this.addSatchelRow(RIGHT_PAGE_X, relicsY + 40 + i * 44, r.id, r.name);
      });
    }

    // Left page bottom — list any lore pages stamped for this realm. Each
    // title is rendered in italic; bodies live on their own sub-pages,
    // reachable by typing forward through the navigation.
    const stampedLoreIds = lorePageIdsForRealm(realmId).filter((id) =>
      state.almanacLore.includes(id),
    );
    if (stampedLoreIds.length > 0) {
      const loreY = TOP_TEXT_Y + 380;
      this.addPageText(
        LEFT_PAGE_X,
        loreY,
        `Pages stamped (${stampedLoreIds.length}):`,
        {
          fontSize: "22px",
          fontStyle: "italic",
          color: PAGE_INK_DIM,
        },
      );
      stampedLoreIds.forEach((loreId, i) => {
        const page = ALMANAC_LORE_PAGES[loreId];
        if (!page) return;
        this.addPageText(
          LEFT_PAGE_X,
          loreY + 40 + i * 32,
          `• ${page.title}`,
          { fontSize: "22px", color: PAGE_INK },
        );
      });
    }

    this.renderPageFooter();
  }

  /** Per-page footer line — same format across overview, realm, and lore
   *  sub-pages, indexed against the full pageStack so the player can see
   *  their position in the book. */
  private renderPageFooter(): void {
    const total = this.pageStack.length;
    this.addPageText(
      this.scale.width / 2,
      PAGE_BOTTOM_Y - 30,
      `page ${this.currentPage + 1} of ${total}`,
      {
        fontSize: "20px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
        align: "center",
      },
      { centerX: true },
    );
  }

  /** Render a single lore sub-page: title spread across the top of the left
   *  page; body wrapped across both pages. Mirrors the typographic feel of
   *  the realm-summary spreads but with no relics or path summary. */
  private renderLorePage(loreId: string, realmId: string): void {
    const page = ALMANAC_LORE_PAGES[loreId];
    const realm = REALM_LORE[realmId];
    if (!page) {
      // Stamped ID without a content entry — log to console (dev only) and
      // clamp back to overview so the reader doesn't render an empty spread.
      // eslint-disable-next-line no-console
      console.warn(`AlmanacScene: no content for lore page "${loreId}"`);
      this.currentPage = 0;
      this.renderOverviewPage();
      return;
    }

    // Left page: realm name (small caps feel via italic) + lore title large.
    if (realm) {
      this.addPageText(
        LEFT_PAGE_X,
        TOP_TEXT_Y,
        realm.title,
        {
          fontSize: "22px",
          fontStyle: "italic",
          color: PAGE_INK_DIM,
        },
      );
    }
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y + 40,
      page.title,
      { fontSize: "44px", color: PAGE_INK },
    );

    // Right page: body, wrapped within the page text width. Larger margin
    // from the top so the title-to-body relationship reads as page-spread,
    // not column-flow.
    this.addPageText(
      RIGHT_PAGE_X,
      TOP_TEXT_Y + 20,
      page.body,
      {
        fontSize: "26px",
        color: PAGE_INK,
        wordWrap: { width: PAGE_TEXT_WIDTH },
      },
    );

    this.renderPageFooter();
  }

  /** Returns the primary (fork1) lore ending key for a realm. */
  private resolveEndingKey(
    realmId: string,
    choices: Record<string, string> | undefined,
  ): string | undefined {
    if (!choices) return undefined;
    switch (realmId) {
      case "winter-mountain":
        // fork1: "huntress" | "firefly" — both match lore keys directly
        return choices["fork1"];
      case "sunken-bell":
        // fork1: "chant" | "force"; lore only has "chant" for this arm
        return choices["fork1"] === "chant" ? "chant" : undefined;
      case "clockwork-forge":
        // choices.ending is e.g. "forn-peaceful" — extract the fork1 part
        return choices["ending"]?.split("-")[0]; // "forn" | "cabal"
      case "sky-island":
        // fork1: "help-etta" → lore "help-etta"; "steal-flame" → lore "beacon"
        if (choices["fork1"] === "help-etta") return "help-etta";
        if (choices["fork1"] === "steal-flame") return "beacon";
        return choices["fork1"];
      case "haunted-wood":
        // fork1: "offering" | "bone-flute" — both match lore keys directly
        return choices["fork1"];
      default:
        return choices["ending"];
    }
  }

  /** Returns the secondary (fork2) lore ending key for a realm, or undefined if none. */
  private resolveSecondaryEndingKey(
    realmId: string,
    choices: Record<string, string> | undefined,
  ): string | undefined {
    if (!choices) return undefined;
    switch (realmId) {
      case "winter-mountain":
        // fork2: "bury" | "pelt" — both match lore keys directly
        return choices["fork2"];
      case "sunken-bell":
        // fork2: "free-aurland" → lore "free-king"; "claim-tongue" → lore "claim-tongue"
        if (choices["fork2"] === "free-aurland") return "free-king";
        return choices["fork2"]; // "claim-tongue"
      case "clockwork-forge":
        // choices.ending second part: "peaceful" | "fought" — both match lore keys
        return choices["ending"]?.split("-")[1];
      case "sky-island":
        // fork2: "answer-kindly" | "cut-tether" — both match lore keys directly
        return choices["fork2"];
      case "haunted-wood":
        // fork2: "bargain" → lore "bargain"; "force" → lore "light-grove"
        if (choices["fork2"] === "force") return "light-grove";
        return choices["fork2"]; // "bargain"
      default:
        return undefined;
    }
  }

  private renderOverviewPage(): void {
    const state = this.store.get();
    const cleared = this.clearedRealms.length;

    // ─── Left page — title + realm strip ────────────────────────────────────

    this.addPageText(LEFT_PAGE_X, TOP_TEXT_Y, `${state.profileName}'s Almanac`, {
      fontSize: "44px",
      color: PAGE_INK,
    });
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y + 64,
      `${cleared} of ${REALM_ORDER.length} realms beyond Holdfast`,
      {
        fontSize: "22px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      },
    );

    this.addPageText(LEFT_PAGE_X, TOP_TEXT_Y + 170, "Realms Beyond", {
      fontSize: "28px",
      fontStyle: "italic",
      color: PAGE_INK_DIM,
    });

    REALM_ORDER.forEach((realmId, i) => {
      const lore = REALM_LORE[realmId];
      const isCleared = state.realms[realmId]?.cleared === true;
      const y = TOP_TEXT_Y + 230 + i * 46;
      const glyph = isCleared ? "✦" : "·";
      const color = isCleared ? PAGE_INK : PAGE_INK_DIM;
      this.addPageText(LEFT_PAGE_X, y, `${glyph}  ${lore?.title ?? realmId}`, {
        fontSize: "26px",
        color,
        fontStyle: isCleared ? "normal" : "italic",
      });
      if (isCleared) {
        this.addPageText(LEFT_PAGE_X + 480, y, "stamped", {
          fontSize: "20px",
          fontStyle: "italic",
          color: PAGE_INK_DIM,
        });
      }
    });

    // ─── Right page — companions + Quiet Lord fragment + tally ──────────────

    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y, "Companions", {
      fontSize: "30px",
      fontStyle: "italic",
      color: PAGE_INK_DIM,
    });

    const collectedCompanions = COMPANION_IDS.map((id) => RELICS[id]).filter(
      (r): r is NonNullable<typeof r> => !!r && state.satchel.includes(r.id),
    );

    if (collectedCompanions.length === 0) {
      this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 60, "(none yet)", {
        fontSize: "24px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      });
    } else {
      collectedCompanions.forEach((c, i) => {
        this.addSatchelRow(
          RIGHT_PAGE_X,
          TOP_TEXT_Y + 60 + i * 48,
          c.id,
          c.name,
        );
      });
    }

    // Quiet Lord fragment — same scratched-out visual as the boss-defeat
    // reveal and the mid-realm intrusion (§5.5.10): cream serif with a dark
    // quill cross-out stroke. Static on the page — no animation.
    this.addPageText(
      RIGHT_PAGE_X,
      TOP_TEXT_Y + 360,
      "The Quiet Lord whispers",
      {
        fontSize: "26px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      },
    );
    const fragment = QUIET_LORD_FRAGMENTS[cleared] ?? "";
    if (fragment) {
      const { text: fragText, stroke: fragStroke } =
        drawStaticQuietLordFragment(this, {
          x: RIGHT_PAGE_X,
          y: TOP_TEXT_Y + 410,
          text: fragment,
          fontSize: 44,
          depth: 10,
        });
      this.pageTexts.push(fragText, fragStroke);
    } else {
      this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 410, "...quiet, for now", {
        fontSize: "26px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      });
    }

    // Tally — relics carried + lore pages stamped. Small, painterly-italic.
    const realmRelicCount = state.satchel.filter(
      (id) => !COMPANION_IDS.includes(id),
    ).length;
    this.addPageText(
      RIGHT_PAGE_X,
      TOP_TEXT_Y + 530,
      `${realmRelicCount} relics carried  ·  ${state.almanacLore.length} lore pages`,
      {
        fontSize: "22px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
      },
    );

    this.renderPageFooter();
  }

  /** A satchel collection row: the painted icon on the left, the name beside it.
   *  Falls back to a text bullet when the id has no art yet. Both objects join
   *  pageTexts so they're cleared on page turn. */
  private addSatchelRow(x: number, y: number, id: string, name: string): void {
    const icon = iconFor(id);
    if (icon && this.textures.exists(icon.key)) {
      const img = this.add.image(x + 17, y + 14, icon.key).setOrigin(0.5, 0.5);
      img.setScale(34 / Math.max(1, img.height));
      this.pageTexts.push(img);
      this.addPageText(x + 46, y, name, { fontSize: "26px", color: PAGE_INK });
    } else {
      this.addPageText(x, y, `•  ${name}`, {
        fontSize: "26px",
        color: PAGE_INK,
      });
    }
  }

  private addPageText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    opts: { centerX?: boolean } = {},
  ): void {
    const t = this.add.text(x, y, text, {
      fontFamily: SERIF,
      ...style,
    });
    if (opts.centerX) {
      t.setOrigin(0.5, 0);
    }
    this.pageTexts.push(t);
  }

  private placeNavigationTargets(): void {
    this.clearNavigationTargets();
    const hasPrev = this.currentPage > 0;
    const hasNext = this.currentPage < this.pageStack.length - 1;

    if (hasPrev) {
      this.prevTarget = new TextWordTarget({
        scene: this,
        word: "previous page",
        x: LEFT_PAGE_X + 200,
        y: this.scale.height - 130,
        fontSize: 26,
        outline: true,
        frame: "banner",
        onClaim: () => this.playPageFocus(-1),
        onAdvance: () => this.playPageTypingPulse(-1),
        onComplete: () => this.turnPage(-1),
      });
      this.attachNavigationAnchor(this.prevTarget, -1);
      this.typingInput.register(this.prevTarget);
    }

    if (hasNext) {
      this.nextTarget = new TextWordTarget({
        scene: this,
        word: "next page",
        x: RIGHT_PAGE_X + 200,
        y: this.scale.height - 130,
        fontSize: 26,
        outline: true,
        frame: "banner",
        onClaim: () => this.playPageFocus(1),
        onAdvance: () => this.playPageTypingPulse(1),
        onComplete: () => this.turnPage(1),
      });
      this.attachNavigationAnchor(this.nextTarget, 1);
      this.typingInput.register(this.nextTarget);
    }

    this.closeTarget = new TextWordTarget({
      scene: this,
      word: "close the almanac",
      x: this.scale.width / 2,
      y: this.scale.height - 70,
      fontSize: 28,
      outline: true,
      frame: "banner",
      onClaim: () => this.playCloseFocus(),
      onAdvance: () => this.playCloseTypingPulse(),
      onComplete: () => this.closeBook(),
    });
    this.attachNavigationAnchor(this.closeTarget, 0);
    this.typingInput.register(this.closeTarget);
  }

  private attachNavigationAnchor(
    target: TextWordTarget,
    kind: -1 | 0 | 1,
  ): void {
    const source =
      kind === 0
        ? {
            x: BOOK_X + BOOK_WIDTH / 2,
            y: BOOK_Y + BOOK_HEIGHT - 46,
          }
        : {
            x: kind > 0 ? BOOK_X + BOOK_WIDTH - 58 : BOOK_X + 58,
            y: BOOK_Y + BOOK_HEIGHT - 84,
          };
    const body = this.add.zone(source.x, source.y, 1, 1);
    const handle: WordBodyAnchorHandle = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: UI_HEX.brass,
        alpha: 0.12,
        depth: 24,
        sourceOffsetY: 0,
        targetOffsetY: kind === 0 ? -24 : -18,
      },
    );

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      handle.destroy();
      body.destroy();
      const idx = this.navAnchorReleases.indexOf(release);
      if (idx >= 0) this.navAnchorReleases.splice(idx, 1);
    };
    this.navAnchorReleases.push(release);
  }

  private turnPage(delta: -1 | 1): void {
    const nextPage = this.currentPage + delta;
    if (nextPage < 0 || nextPage >= this.pageStack.length) return;

    this.currentPage = nextPage;
    this.renderCurrentPage();
    this.placeNavigationTargets();
    this.playPageTurn(delta);
  }

  private playPageTurn(direction: -1 | 1): void {
    const pageTop = BOOK_Y + 34;
    const pageHeight = BOOK_HEIGHT - 68;
    const outerX =
      direction > 0 ? BOOK_X + BOOK_WIDTH - 68 : BOOK_X + 68;
    const spineX =
      direction > 0
        ? BOOK_X + BOOK_WIDTH / 2 + 18
        : BOOK_X + BOOK_WIDTH / 2 - 18;

    const shimmer = this.add.graphics().setDepth(30).setAlpha(0.62);
    shimmer.fillStyle(UI_HEX.parchment, 0.42);
    shimmer.fillRoundedRect(-24, 0, 48, pageHeight, 18);
    shimmer.lineStyle(2, UI_HEX.brass, 0.35);
    shimmer.lineBetween(0, 18, 0, pageHeight - 18);
    shimmer.setPosition(outerX, pageTop);

    this.tweens.add({
      targets: shimmer,
      x: spineX,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => shimmer.destroy(),
    });
  }

  private playPageFocus(direction: -1 | 1): void {
    const pageTop = BOOK_Y + 42;
    const pageHeight = BOOK_HEIGHT - 84;
    const edgeX =
      direction > 0 ? BOOK_X + BOOK_WIDTH - 58 : BOOK_X + 58;

    const focus = this.add.graphics().setDepth(29).setAlpha(0.76);
    focus.lineStyle(3, UI_HEX.brass, 0.8);
    focus.strokeRoundedRect(-18, 0, 36, pageHeight, 15);
    focus.lineStyle(1, UI_HEX.brass, 0.42);
    focus.lineBetween(0, 22, 0, pageHeight - 22);
    focus.setPosition(edgeX, pageTop);

    this.tweens.add({
      targets: focus,
      alpha: 0,
      scaleX: 1.18,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => focus.destroy(),
    });
  }

  private playPageTypingPulse(direction: -1 | 1): void {
    if (!this.shouldPlayNavigationPulse(`page-${direction}`)) return;

    const pageTop = BOOK_Y + 52;
    const pageHeight = BOOK_HEIGHT - 104;
    const edgeX =
      direction > 0 ? BOOK_X + BOOK_WIDTH - 58 : BOOK_X + 58;

    const pulse = this.add.graphics().setDepth(28).setAlpha(0.42);
    pulse.lineStyle(2, UI_HEX.brass, 0.42);
    pulse.strokeRoundedRect(-13, 0, 26, pageHeight, 12);
    pulse.lineStyle(1, UI_HEX.brass, 0.24);
    pulse.lineBetween(0, 28, 0, pageHeight - 28);
    pulse.setPosition(edgeX, pageTop);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.08,
      duration: 170,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private playCloseFocus(): void {
    const focus = this.add
      .graphics()
      .setDepth(29)
      .setAlpha(0.72)
      .setPosition(BOOK_X + BOOK_WIDTH / 2, BOOK_Y + BOOK_HEIGHT / 2);
    focus.lineStyle(3, UI_HEX.brass, 0.7);
    focus.strokeRoundedRect(
      -BOOK_WIDTH / 2 - 16,
      -BOOK_HEIGHT / 2 - 16,
      BOOK_WIDTH + 32,
      BOOK_HEIGHT + 32,
      24,
    );
    focus.lineStyle(2, UI_HEX.brass, 0.55);
    focus.lineBetween(0, -BOOK_HEIGHT / 2 + 32, 0, BOOK_HEIGHT / 2 - 32);

    this.tweens.add({
      targets: focus,
      alpha: 0,
      scaleX: 1.025,
      scaleY: 1.025,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => focus.destroy(),
    });
  }

  private playCloseTypingPulse(): void {
    if (!this.shouldPlayNavigationPulse("close")) return;

    const pulse = this.add
      .graphics()
      .setDepth(28)
      .setAlpha(0.42)
      .setPosition(this.scale.width / 2, this.scale.height - 70);
    pulse.fillStyle(UI_HEX.brass, 0.035);
    pulse.fillRoundedRect(-280, -30, 560, 60, 10);
    pulse.lineStyle(1, UI_HEX.brass, 0.32);
    pulse.strokeRoundedRect(-280, -30, 560, 60, 10);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.02,
      scaleY: 1.08,
      duration: 170,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private shouldPlayNavigationPulse(key: string): boolean {
    const now = this.time.now;
    const last = this.navTypingPulseTimes.get(key) ?? -Infinity;
    if (now - last < 90) return false;
    this.navTypingPulseTimes.set(key, now);
    return true;
  }

  private playBookEntryWake(): void {
    this.time.delayedCall(160, () => {
      const pageTop = BOOK_Y + 42;
      const pageHeight = BOOK_HEIGHT - 84;
      const spineX = BOOK_X + BOOK_WIDTH / 2;
      const outline = this.add
        .graphics()
        .setDepth(29)
        .setAlpha(0.46)
        .setPosition(spineX, BOOK_Y + BOOK_HEIGHT / 2);
      outline.lineStyle(2, UI_HEX.brass, 0.54);
      outline.strokeRoundedRect(
        -BOOK_WIDTH / 2 - 10,
        -BOOK_HEIGHT / 2 - 10,
        BOOK_WIDTH + 20,
        BOOK_HEIGHT + 20,
        22,
      );
      outline.lineStyle(2, UI_HEX.brass, 0.32);
      outline.lineBetween(0, -BOOK_HEIGHT / 2 + 32, 0, BOOK_HEIGHT / 2 - 32);

      this.tweens.add({
        targets: outline,
        alpha: 0,
        scaleX: 1.018,
        scaleY: 1.024,
        duration: 680,
        ease: "Sine.easeOut",
        onComplete: () => outline.destroy(),
      });

      for (const edgeX of [BOOK_X + 58, BOOK_X + BOOK_WIDTH - 58]) {
        const edge = this.add.graphics().setDepth(30).setAlpha(0.5);
        edge.lineStyle(3, UI_HEX.brass, 0.48);
        edge.lineBetween(0, 0, 0, pageHeight);
        edge.lineStyle(1, UI_HEX.parchment, 0.38);
        const innerOffsetX = edgeX < spineX ? 12 : -12;
        edge.lineBetween(innerOffsetX, 18, innerOffsetX, pageHeight - 18);
        edge.setPosition(edgeX, pageTop);
        this.tweens.add({
          targets: edge,
          x: edgeX + (edgeX < spineX ? 16 : -16),
          alpha: 0,
          duration: 560,
          delay: edgeX < spineX ? 40 : 100,
          ease: "Sine.easeOut",
          onComplete: () => edge.destroy(),
        });
      }
    });
  }

  private clearNavigationTargets(): void {
    for (const release of [...this.navAnchorReleases]) {
      release();
    }
    this.navAnchorReleases = [];
    for (const t of [this.prevTarget, this.nextTarget, this.closeTarget]) {
      if (t) {
        this.typingInput.unregister(t);
        t.destroy();
      }
    }
    this.prevTarget = undefined;
    this.nextTarget = undefined;
    this.closeTarget = undefined;
  }

  private closeBook(): void {
    playChime();
    this.cameras.main.fadeOut(350, 11, 10, 15);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.start("PortalChamberScene", { store: this.store });
      },
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  private drawBook(): void {
    const g = this.bookGraphics;
    g.clear();

    // Soft shadow under the book.
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(
      BOOK_X + 12,
      BOOK_Y + 16,
      BOOK_WIDTH,
      BOOK_HEIGHT,
      18,
    );

    // Leather cover, peeking around the page edges.
    g.fillStyle(0x3a2418, 1);
    g.fillRoundedRect(
      BOOK_X - 14,
      BOOK_Y - 14,
      BOOK_WIDTH + 28,
      BOOK_HEIGHT + 28,
      22,
    );

    // Page surface, two halves separated by a darker spine.
    g.fillStyle(PALETTE_HEX.cream, 1);
    g.fillRoundedRect(BOOK_X, BOOK_Y, BOOK_WIDTH, BOOK_HEIGHT, 14);
    g.fillStyle(UI_HEX.parchment, 1);
    // A faint "page is paper" wash on each side.
    g.fillRect(BOOK_X + 10, BOOK_Y + 10, BOOK_WIDTH / 2 - 30, BOOK_HEIGHT - 20);
    g.fillRect(
      BOOK_X + BOOK_WIDTH / 2 + 20,
      BOOK_Y + 10,
      BOOK_WIDTH / 2 - 30,
      BOOK_HEIGHT - 20,
    );
    // Spine
    g.fillStyle(0x8a6a4a, 1);
    g.fillRect(BOOK_X + BOOK_WIDTH / 2 - 4, BOOK_Y, 8, BOOK_HEIGHT);

    // Brass corner accents.
    g.fillStyle(PALETTE_HEX.brass, 0.9);
    const cornerSize = 24;
    for (const [cx, cy] of [
      [BOOK_X - 4, BOOK_Y - 4],
      [BOOK_X + BOOK_WIDTH - cornerSize + 4, BOOK_Y - 4],
      [BOOK_X - 4, BOOK_Y + BOOK_HEIGHT - cornerSize + 4],
      [BOOK_X + BOOK_WIDTH - cornerSize + 4, BOOK_Y + BOOK_HEIGHT - cornerSize + 4],
    ]) {
      g.fillRect(cx, cy, cornerSize, cornerSize);
    }

    // Faint header bar on each page.
    g.fillStyle(0xc0b394, 0.4);
    g.fillRect(BOOK_X + 40, BOOK_Y + 60, BOOK_WIDTH / 2 - 80, 2);
    g.fillRect(
      BOOK_X + BOOK_WIDTH / 2 + 40,
      BOOK_Y + 60,
      BOOK_WIDTH / 2 - 80,
      2,
    );

    void PALETTE.cream; // ensure import retained for future styling
  }
}

// Layout constants. The book fills the middle of a 1920x1080 canvas with
// generous margins so text is comfortably readable.
const BOOK_X = 200;
const BOOK_Y = 110;
const BOOK_WIDTH = 1520;
const BOOK_HEIGHT = 800;

const LEFT_PAGE_X = BOOK_X + 80;
const RIGHT_PAGE_X = BOOK_X + BOOK_WIDTH / 2 + 60;
const TOP_TEXT_Y = BOOK_Y + 90;
const PAGE_BOTTOM_Y = BOOK_Y + BOOK_HEIGHT;
const PAGE_TEXT_WIDTH = BOOK_WIDTH / 2 - 140;
