import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { NarrationManager } from "../game/narrationManager";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import openingBackdrop from "../../art/references/opening-typewriter-study-clean.png";
import { makeQuietLordSprite, preloadQuietLord } from "../game/quietLord";
import runaSprite from "../../art/runa/runa-front.png";
import siblingSprite from "../../art/sibling/sibling-front.png";

interface OpeningSceneData {
  store: SaveStore;
}

// Where the typed words float — centered above the action, between Runa
// on the left and the sibling on the right. Keeps the eye on the centre
// of the screen rather than tucked over the typewriter.
const TYPE_TARGET = { x: 960, y: 540 };

export class OpeningScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;

  // The Quiet Lord's first foreshadowing — faint silhouette during Beat 6.
  private quietLordSprite: Phaser.GameObjects.Image | null = null;

  // §5.5.2 — Wren is gender-selectable. Cached from saveState in init(); set
  // by Beat 2.5 on first run; used by beat3 (sibling appearance + dialogue),
  // drawSibling() (sprite tint + scale), and beat9 (sibling farewell).
  private wrenGender: "girl" | "boy" | null = null;

  // Beat 2.5 spawns two simultaneous targets; track them so the unpicked
  // target can be cleared when its sibling is claimed.
  private beat2_5Targets: TextWordTarget[] = [];

  constructor() {
    super("OpeningScene");
  }

  init(data: OpeningSceneData): void {
    this.store = data.store;
    // Stale sprite reference from a previous run; clear before Beat 6.
    this.quietLordSprite = null;
    // Honor an existing gender choice on revisit / New Game+; null on a
    // truly fresh save so Beat 2.5 will prompt.
    this.wrenGender = this.store.get().wrenGender;
    this.beat2_5Targets = [];
  }

  preload(): void {
    this.load.image("opening-backdrop", openingBackdrop);
    this.load.image("runa-sprite", runaSprite);
    this.load.image("sibling-sprite", siblingSprite);
    preloadQuietLord(this);
  }

  create(): void {
    const { width } = this.scale;

    // ── Painted study backdrop ───────────────────────────────────────────────
    this.add
      .image(0, 0, "opening-backdrop")
      .setOrigin(0)
      .setDisplaySize(width, this.scale.height)
      .setDepth(-100);

    // ── Narrator text ────────────────────────────────────────────────────────
    this.narration = new NarrationManager(this, { y: 120 });

    // ── Input ────────────────────────────────────────────────────────────────
    this.typingInput = new TypingInputController(this.store);
    // No Wren in the opening study; miss feedback is camera-only.
    this.typingInput.setKeystrokeHooks({
      onMiss: () => this.cameras.main.shake(80, 0.002),
      onClaim: () => playClaim(),
    });
    this.input.keyboard?.on("keydown", this.onKeyDown, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.typingInput.reset();
      this.input.keyboard?.off("keydown", this.onKeyDown, this);
    });

    // ── Beat sequence ────────────────────────────────────────────────────────
    this.beat1();
  }

  // ── Beats ──────────────────────────────────────────────────────────────────

  /** Beat 1 — Narrator intro, 3 s delay, no input. */
  private beat1(): void {
    this.narration.say("opening_beat1_intro");
    this.time.delayedCall(3000, () => this.beat2());
  }

  /** Beat 2 — Runa descends the staircase (2 s). Branches forward: if Wren's
   *  gender is already in saveState (revisit / New Game+), skip the identity
   *  prompt and go straight to the sibling appearance; otherwise route through
   *  Beat 2.5 to capture the choice. */
  private beat2(): void {
    this.narration.say("opening_beat2_runa_descends");
    this.drawRuna();
    const next = this.wrenGender === null ? () => this.beat2_5() : () => this.beat3();
    this.time.delayedCall(2000, () => next());
  }

  /** Beat 2.5 — §5.5.2 gender choice. Runa asks who Wren is; player types
   *  "boy" or "girl". Persisted to saveState so the rest of the opening
   *  (sibling sprite, dialogue, farewell) branches correctly and so future
   *  revisits skip the prompt. */
  private beat2_5(): void {
    this.setNarrator(
      "Runa: \"Before we begin — type 'boy' or 'girl'. I want to know who I'm calling.\"",
    );

    const pick = (gender: "boy" | "girl") => {
      // Clear the unpicked target; the picked one self-destroys via its
      // own burst+fade tween.
      for (const t of this.beat2_5Targets) {
        this.typingInput.unregister(t);
        t.destroy();
      }
      this.beat2_5Targets = [];
      this.wrenGender = gender;
      this.store.update((s) => {
        s.wrenGender = gender;
      });
      playChime();
      this.time.delayedCall(700, () => this.beat3());
    };

    const boy = new TextWordTarget({
      scene: this,
      word: "boy",
      x: TYPE_TARGET.x - 220,
      y: TYPE_TARGET.y,
      fontSize: 52,
      onComplete: () => pick("boy"),
    });
    const girl = new TextWordTarget({
      scene: this,
      word: "girl",
      x: TYPE_TARGET.x + 220,
      y: TYPE_TARGET.y,
      fontSize: 52,
      onComplete: () => pick("girl"),
    });
    this.typingInput.register(boy);
    this.typingInput.register(girl);
    this.beat2_5Targets = [boy, girl];
  }

  /** Beat 3 — Sibling appears in the doorway (2 s). Branches on wrenGender:
   *  boy Wren → Saga (small, curious, drawing); girl Wren → Magnus (taller,
   *  half-amused, half-worried). Dialogue lines are spec-locked per §5.5.2. */
  private beat3(): void {
    const isBoy = this.wrenGender === "boy";
    this.setNarrator(
      isBoy
        ? "At the doorway, a small figure in nightclothes holds a drawing against her chest. “Are the portals really real, Runa?”"
        : "At the doorway, a taller figure leans against the frame, half-amused, half-worried. “You don’t have to do this. There has to be another way.”",
    );
    this.drawSibling();
    this.time.delayedCall(2000, () => this.beat4());
  }

  /** Beat 4 — Type your name. */
  private beat4(): void {
    this.narration.say("opening_beat4_type_name");

    const target = new TextWordTarget({
      scene: this,
      word: "Wren",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 48,
      onComplete: () => this.onBeat4Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat4Complete(): void {
    playChime();
    this.time.delayedCall(500, () => this.beat5());
  }

  /** Beat 5 — Type the typewriter's name. */
  private beat5(): void {
    this.narration.say("opening_beat5_type_typewriter");

    const target = new TextWordTarget({
      scene: this,
      word: "Bjarn",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 48,
      onComplete: () => this.onBeat5Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat5Complete(): void {
    playChime();
    // Warm gold camera flash.
    this.cameras.main.flash(320, 201, 161, 74); // PALETTE_HEX.brass split to r/g/b
    this.time.delayedCall(400, () => this.beat6());
  }

  /** Beat 6 — The Almanac speech. Quiet Lord lingers visibly through the
   *  doorway so the player has time to notice him while reading the line. */
  private beat6(): void {
    this.narration.say("opening_beat6_almanac_speech");
    this.fadeInQuietLord();
    // Hold him at peak longer (2.4s) so he registers, then fade out cleanly.
    this.time.delayedCall(4200, () => this.fadeOutQuietLord());
    this.time.delayedCall(5400, () => this.beat7());
  }

  /** First foreshadowing — a faint silhouette through the open doorway as
   *  Runa names him. Slower fade-in so the eye catches the change. */
  private fadeInQuietLord(): void {
    if (this.quietLordSprite) return;
    this.quietLordSprite = makeQuietLordSprite(this)
      .setPosition(1500, 980)
      .setDepth(-10)
      .setAlpha(0);
    this.tweens.add({
      targets: this.quietLordSprite,
      alpha: 0.55,
      duration: 1800,
      ease: "Sine.easeOut",
    });
  }

  private fadeOutQuietLord(): void {
    if (!this.quietLordSprite) return;
    const sprite = this.quietLordSprite;
    this.quietLordSprite = null;
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: 1100,
      ease: "Sine.easeIn",
      onComplete: () => sprite.destroy(),
    });
  }

  /** Beat 7 — First portal wakes. The doorway already paints a glowing
   *  portal, so the narrator beat sells the awakening on its own — no
   *  extra overlay circles. */
  private beat7(): void {
    this.narration.say("opening_beat7_portal_wakes");
    this.time.delayedCall(2400, () => this.beat8());
  }

  /** Beat 8 — Type the portal name. */
  private beat8(): void {
    this.narration.say("opening_beat8_winter_woken");

    const target = new TextWordTarget({
      scene: this,
      word: "Winter Mountain",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 44,
      onComplete: () => this.onBeat8Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat8Complete(): void {
    playChime();
    this.beat9();
  }

  /** Beat 9 — Sibling farewell. Spec-locked dialogue per §5.5.2: Saga keeps
   *  the drawing line; Magnus says he'll be here, don't take long. */
  private beat9(): void {
    const isBoy = this.wrenGender === "boy";
    this.setNarrator(
      isBoy
        ? "Narrator: At the doorway, she presses the drawing a little tighter. ‘Wren. I made you something.’"
        : "Narrator: At the doorway, he steadies himself against the frame. ‘Wren. I’ll be here. Don’t take long.’",
    );
    this.time.delayedCall(2400, () => this.beat10());
  }

  /** Beat 10 — Bridge to the Portal Chamber. Frames the hub as the next room
   *  Wren walks into, not a redundant second scene. */
  private beat10(): void {
    this.narration.say("opening_beat10_bridge_to_hub");
    this.time.delayedCall(2400, () => {
      this.store.update((s) => {
        s.typewriterAwakened = true;
      });
      this.cameras.main.fadeOut(700, 11, 10, 15);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start("PortalChamberScene", { store: this.store });
        },
      );
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key.length === 1 || event.key === " ") {
      playClack();
    }
    this.typingInput.handleChar(event.key);
  }

  // ── Narrator helper ────────────────────────────────────────────────────────

  private setNarrator(text: string): void {
    this.narration.sayRaw(text);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  /** Runa — the painted royal cartographer, fades in in front of the desk
   *  on the left. Positioned left of the painted chair (which sits at ≈x=900)
   *  so she doesn't appear to stand on it. */
  private drawRuna(): void {
    const img = this.add
      .image(480, 945, "runa-sprite")
      .setOrigin(0.5, 1);
    // 420px tall — matches painted desk + chair proportions in this study.
    img.setScale(420 / img.height);
    img.setAlpha(0);
    this.tweens.add({
      targets: img,
      alpha: 1,
      duration: 500,
      ease: "Sine.easeOut",
    });
  }

  /** The sibling — fades in just left of the doorway. Doorway center is
   *  ≈x=1521; the sprite sits at x=1180 so the doorway frame, the painted
   *  portal through it, and the Quiet Lord (Beat 6) all stay visible past it.
   *
   *  The sprite asset is the same in both branches (Saga reference); Magnus
   *  is rendered as a programmatic placeholder via cooler tint + larger
   *  scale to read as the older sibling. Real Magnus art is locked open per
   *  §5.5.12 pending parent's reference photo.
   */
  private drawSibling(): void {
    const isBoy = this.wrenGender === "boy";
    const img = this.add
      .image(1180, 950, "sibling-sprite")
      .setOrigin(0.5, 1);
    // Magnus reads taller (older sibling) than Saga; both still sit below
    // doorway height so the painted portal stays legible past them.
    img.setScale((isBoy ? 260 : 300) / img.height);
    // Tint multipliers soften the bright nightgown+pale skin against the
    // dim study palette. Saga gets a warm cream cast (sits in lamplight);
    // Magnus gets a cool blue-gray (reads as older + a beat more distant).
    img.setTint(isBoy ? 0xbfb0a0 : 0xa0aebf);
    img.setAlpha(0);
    this.tweens.add({
      targets: img,
      alpha: 1,
      duration: 500,
      ease: "Sine.easeOut",
    });
  }
}
