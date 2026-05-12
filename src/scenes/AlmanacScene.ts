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

    if (this.clearedRealms.length === 0) {
      this.renderEmptyPages();
      return;
    }

    const realmId = this.clearedRealms[this.currentPage];
    const lore = REALM_LORE[realmId];
    const state = this.store.get();
    const realmProgress = state.realms[realmId];
    if (!lore || !realmProgress) {
      this.renderEmptyPages();
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
    const endingKey = realmProgress.choices?.ending;
    const endingText =
      (endingKey && lore.endings[endingKey]) ?? "His path remains unwritten.";
    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y, "His path:", {
      fontSize: "30px",
      fontStyle: "italic",
      color: PAGE_INK_DIM,
    });
    this.addPageText(RIGHT_PAGE_X, TOP_TEXT_Y + 60, endingText, {
      fontSize: "26px",
      color: PAGE_INK,
      wordWrap: { width: PAGE_TEXT_WIDTH },
    });

    const realmRelics = state.satchel
      .map((id) => RELICS[id])
      .filter((r) => r?.realmId === realmId);

    if (realmRelics.length > 0) {
      this.addPageText(
        RIGHT_PAGE_X,
        TOP_TEXT_Y + 320,
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
          TOP_TEXT_Y + 360 + i * 40,
          `• ${r.name}`,
          { fontSize: "26px", color: PAGE_INK },
        );
      });
    }

    // Footer: page number
    const total = this.clearedRealms.length;
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

  private renderEmptyPages(): void {
    this.addPageText(
      LEFT_PAGE_X,
      TOP_TEXT_Y + 160,
      "The Almanac is still mostly empty. Step through a portal and write a new page.",
      {
        fontSize: "26px",
        color: PAGE_INK,
        fontStyle: "italic",
        wordWrap: { width: PAGE_TEXT_WIDTH },
      },
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
    const hasNext = this.currentPage < this.clearedRealms.length - 1;

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
