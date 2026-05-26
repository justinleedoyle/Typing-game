import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { PALETTE, PALETTE_HEX, SERIF } from "../game/palette";
import { REALM_LORE, REALM_ORDER } from "../game/realmLore";
import { RELICS } from "../game/relics";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";

interface AlmanacSceneData {
  store: SaveStore;
}

const PAGE_INK = "#2a1f12";
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
  private pageTexts: Phaser.GameObjects.Text[] = [];
  private currentPage = 0;
  private clearedRealms: string[] = [];
  private nextTarget?: TextWordTarget;
  private prevTarget?: TextWordTarget;
  private closeTarget?: TextWordTarget;

  constructor() {
    super("AlmanacScene");
  }

  init(data: AlmanacSceneData): void {
    this.store = data.store;
    this.currentPage = 0;
    this.pageTexts = [];
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 15);

    // Dim backdrop so the chamber feels behind the book.
    const g = this.add.graphics();
    g.fillStyle(0x0b0a0f, 0.92);
    g.fillRect(0, 0, this.scale.width, this.scale.height);

    this.bookGraphics = this.add.graphics();
    this.drawBook();

    const state = this.store.get();
    this.clearedRealms = REALM_ORDER.filter(
      (id) => state.realms[id]?.cleared,
    );

    this.typingInput = new TypingInputController(this.store);
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    this.renderCurrentPage();
    this.placeNavigationTargets();
  }

  private renderCurrentPage(): void {
    for (const t of this.pageTexts) t.destroy();
    this.pageTexts = [];

    if (this.currentPage === 0) {
      this.renderOverviewPage();
      return;
    }

    const realmId = this.clearedRealms[this.currentPage - 1];
    const lore = realmId ? REALM_LORE[realmId] : undefined;
    const state = this.store.get();
    const realmProgress = realmId ? state.realms[realmId] : undefined;
    if (!lore || !realmProgress) {
      // Fell off the end of the realm list — clamp back to overview.
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
        this.addPageText(
          RIGHT_PAGE_X,
          relicsY + 40 + i * 40,
          `• ${r.name}`,
          { fontSize: "26px", color: PAGE_INK },
        );
      });
    }

    // Footer: page number. Overview is page 1; realm pages are 2..N+1.
    const total = this.clearedRealms.length + 1;
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
        this.addPageText(
          RIGHT_PAGE_X,
          TOP_TEXT_Y + 60 + i * 44,
          `✦  ${c.name}`,
          { fontSize: "26px", color: PAGE_INK },
        );
      });
    }

    // Quiet Lord fragment — scratched-style italic, low contrast.
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
    const fragmentText = fragment ? `~${fragment}~` : "...quiet, for now";
    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 410, fragmentText, {
      fontSize: fragment ? "44px" : "26px",
      fontStyle: "italic",
      color: fragment ? PAGE_INK : PAGE_INK_DIM,
    });

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

    // Footer: page number. Overview is page 1; realm pages are 2..N+1.
    const total = this.clearedRealms.length + 1;
    this.addPageText(
      this.scale.width / 2,
      PAGE_BOTTOM_Y - 30,
      `page 1 of ${total}`,
      {
        fontSize: "20px",
        fontStyle: "italic",
        color: PAGE_INK_DIM,
        align: "center",
      },
      { centerX: true },
    );
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
    const hasNext = this.currentPage < this.clearedRealms.length;

    if (hasPrev) {
      this.prevTarget = new TextWordTarget({
        scene: this,
        word: "previous page",
        x: LEFT_PAGE_X + 200,
        y: this.scale.height - 130,
        fontSize: 26,
        onComplete: () => {
          this.currentPage -= 1;
          this.renderCurrentPage();
          this.placeNavigationTargets();
        },
      });
      this.typingInput.register(this.prevTarget);
    }

    if (hasNext) {
      this.nextTarget = new TextWordTarget({
        scene: this,
        word: "next page",
        x: RIGHT_PAGE_X + 200,
        y: this.scale.height - 130,
        fontSize: 26,
        onComplete: () => {
          this.currentPage += 1;
          this.renderCurrentPage();
          this.placeNavigationTargets();
        },
      });
      this.typingInput.register(this.nextTarget);
    }

    this.closeTarget = new TextWordTarget({
      scene: this,
      word: "close the almanac",
      x: this.scale.width / 2,
      y: this.scale.height - 70,
      fontSize: 28,
      onComplete: () => this.closeBook(),
    });
    this.typingInput.register(this.closeTarget);
  }

  private clearNavigationTargets(): void {
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
    g.fillStyle(0xe6dcc0, 1);
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
