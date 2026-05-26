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

  constructor() {
    super("OpeningScene");
  }

  init(data: OpeningSceneData): void {
    this.store = data.store;
    // Stale sprite reference from a previous run; clear before Beat 6.
    this.quietLordSprite = null;
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
    this.setNarrator(
      "In the kingdom of Holdfast — the last quiet place in the world — a child has been waiting all evening to be called downstairs.",
    );
    this.time.delayedCall(3000, () => this.beat2());
  }

  /** Beat 2 — Runa descends the staircase (2 s). */
  private beat2(): void {
    this.setNarrator(
      "Runa — the royal cartographer — comes down the staircase. Ink-stained. Half-blind in one eye. She has been waiting, too.",
    );
    this.drawRuna();
    this.time.delayedCall(2000, () => this.beat3());
  }

  /** Beat 3 — Sibling appears in doorway (2 s). */
  private beat3(): void {
    this.setNarrator(
      "At the doorway, a small figure in nightclothes holds a drawing against her chest.",
    );
    this.drawSibling();
    this.time.delayedCall(2000, () => this.beat4());
  }

  /** Beat 4 — Type your name. */
  private beat4(): void {
    this.setNarrator('Runa: "Wren. Hands on the keys. Type your name."');

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
    this.setNarrator(
      'Runa: "Good. The typewriter has a name. It is a brass one, so the name is Bjarn. Type it."',
    );

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
    this.setNarrator(
      'Runa: "The Quiet Lord has been waking up. Across the Realms Beyond he is gathering an army that hates language and loves silence. This is the Almanac. It records everywhere you go, everyone you save, everything you bring home. It is yours now."',
    );
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
    this.setNarrator(
      "Narrator: The nearest arch flickers. Pale cold light from beyond. A distant sound — wolves on a mountain.",
    );
    this.time.delayedCall(2400, () => this.beat8());
  }

  /** Beat 8 — Type the portal name. */
  private beat8(): void {
    this.setNarrator(
      'Runa: "The Winter Mountain has woken. Type its name when you are ready."',
    );

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

  /** Beat 9 — Sibling farewell. */
  private beat9(): void {
    this.setNarrator(
      "Narrator: At the doorway, she presses the drawing a little tighter. ‘Wren. I made you something.’",
    );
    this.time.delayedCall(2400, () => this.beat10());
  }

  /** Beat 10 — Bridge to the Portal Chamber. Frames the hub as the next room
   *  Wren walks into, not a redundant second scene. */
  private beat10(): void {
    this.setNarrator(
      "Narrator: Runa rises and beckons. You follow her down the hall to the Portal Chamber.",
    );
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
   *  ≈x=1521; she sits at x=1180 so the doorway frame, the painted portal
   *  through it, and the Quiet Lord (Beat 6) all stay visible past her. */
  private drawSibling(): void {
    const img = this.add
      .image(1180, 950, "sibling-sprite")
      .setOrigin(0.5, 1);
    img.setScale(260 / img.height);
    // Tint multiplier to soften the bright nightgown+pale skin against the
    // dim study palette. 0xbfb0a0 ≈ 75% brightness with a warm bias so she
    // sits in the lamplight rather than glowing in it.
    img.setTint(0xbfb0a0);
    img.setAlpha(0);
    this.tweens.add({
      targets: img,
      alpha: 1,
      duration: 500,
      ease: "Sine.easeOut",
    });
  }
}
