import Phaser from "phaser";
import { playChime } from "../audio/chime";
import { playClack } from "../audio/clack";
import { playClaim } from "../audio/claim";
import { NarrationManager } from "../game/narrationManager";
import { PALETTE_HEX } from "../game/palette";
import type { SaveStore } from "../game/saveState";
import { TypingInputController } from "../game/typingInput";
import { TextWordTarget } from "../game/wordTarget";
import {
  addAmbientDrift,
  addBackdropDrift,
  addIdleBreath,
  addLocalGroundShadow,
  addLivingLight,
  attachWordBodyAnchor,
  playActorAttention,
  playClaimLine,
  type WordBodyAnchorHandle,
} from "../game/livingScene";
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
const STUDY_RESPONSE = {
  name: { x: 960, y: 630, color: PALETTE_HEX.cream },
  typewriter: { x: 790, y: 770, color: PALETTE_HEX.brass },
  portal: { x: 1510, y: 610, color: PALETTE_HEX.frost },
} as const;
type StudyResponsePoint = (typeof STUDY_RESPONSE)[keyof typeof STUDY_RESPONSE];

interface StudyTargetOptions {
  word: string;
  x: number;
  y: number;
  fontSize: number;
  response: StudyResponsePoint;
  onComplete: () => void;
}

export class OpeningScene extends Phaser.Scene {
  private store!: SaveStore;
  private typingInput!: TypingInputController;
  private narration!: NarrationManager;

  // The Quiet Lord's first foreshadowing — faint silhouette during Beat 6.
  private quietLordSprite: Phaser.GameObjects.Image | null = null;
  private runaActor: Phaser.GameObjects.Container | null = null;
  private siblingActor: Phaser.GameObjects.Container | null = null;
  private siblingKeepsake: Phaser.GameObjects.Graphics | null = null;
  private studyTypingPulseTimes = new WeakMap<StudyResponsePoint, number>();
  private studyWordAnchorReleases: Array<() => void> = [];

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
    this.runaActor = null;
    this.siblingActor = null;
    this.siblingKeepsake = null;
    this.studyTypingPulseTimes = new WeakMap();
    this.studyWordAnchorReleases = [];
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
    const backdrop = this.add
      .image(0, 0, "opening-backdrop")
      .setOrigin(0)
      .setDisplaySize(width, this.scale.height)
      .setDepth(-100);
    addBackdropDrift(this, backdrop, { durationMs: 15000, driftX: -4, driftY: -3 });
    addAmbientDrift(this, {
      kind: "mote",
      count: 26,
      depth: -2,
      area: { x: 80, y: 90, width: this.scale.width - 160, height: 760 },
      alpha: 0.18,
      minSize: 1.5,
      maxSize: 3.5,
      driftX: 42,
      driftY: -75,
      minDurationMs: 8500,
      maxDurationMs: 15000,
    });
    addLivingLight(this, {
      x: 790,
      y: 740,
      width: 250,
      height: 160,
      color: 0xf0ad58,
      alpha: 0.09,
      durationMs: 2200,
    });
    addLivingLight(this, {
      x: 1510,
      y: 610,
      width: 300,
      height: 380,
      color: 0x9fd7ff,
      alpha: 0.065,
      durationMs: 3200,
      delayMs: 600,
      scale: 1.045,
    });

    // ── Narrator text ────────────────────────────────────────────────────────
    this.narration = new NarrationManager(this, {
      y: 120,
      framed: true,
      onSpeak: (speakerName) => this.attendSpeaker(speakerName),
    });

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
      this.clearStudyWordAnchors();
      this.siblingKeepsake = null;
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
    // 2.8 s (was 2 s): the richer Runa-introduction caption needs room to read.
    this.time.delayedCall(2800, () => next());
  }

  /** Beat 2.5 — §5.5.2 gender choice. Runa asks who Wren is; player types
   *  "boy" or "girl". Persisted to saveState so the rest of the opening
   *  (sibling sprite, dialogue, farewell) branches correctly and so future
   *  revisits skip the prompt. */
  private beat2_5(): void {
    this.setNarrator(
      "Before we begin, I should know who I am calling down into all of this. Type 'boy' or 'girl'.",
      "Runa",
    );

    const pick = (gender: "boy" | "girl") => {
      // Clear the unpicked target; the picked one self-destroys via its
      // own burst+fade tween.
      for (const t of this.beat2_5Targets) {
        this.typingInput.unregister(t);
        t.destroy();
      }
      this.beat2_5Targets = [];
      this.clearStudyWordAnchors();
      this.wrenGender = gender;
      this.store.update((s) => {
        s.wrenGender = gender;
      });
      playChime();
      this.playStudyPulse(STUDY_RESPONSE.name);
      this.time.delayedCall(700, () => this.beat3());
    };

    const boy = this.makeStudyTarget({
      word: "boy",
      x: TYPE_TARGET.x - 220,
      y: TYPE_TARGET.y,
      fontSize: 52,
      response: STUDY_RESPONSE.name,
      onComplete: () => pick("boy"),
    });
    const girl = this.makeStudyTarget({
      word: "girl",
      x: TYPE_TARGET.x + 220,
      y: TYPE_TARGET.y,
      fontSize: 52,
      response: STUDY_RESPONSE.name,
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
        ? "At the doorway, a small figure in nightclothes hangs back, a drawing held to the chest like a shield. “Are the portals really real, Runa?”"
        : "At the doorway, a taller figure leans in the frame, arms folded over a worry they are trying to wear as a joke. “You don’t have to do this. There has to be another way.”",
      isBoy ? "Saga" : "Magnus",
    );
    this.drawSibling();
    this.time.delayedCall(2000, () => this.beat4());
  }

  /** Beat 4 — Type your name. */
  private beat4(): void {
    this.narration.say("opening_beat4_type_name");

    const target = this.makeStudyTarget({
      word: "Wren",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 48,
      response: STUDY_RESPONSE.name,
      onComplete: () => this.onBeat4Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat4Complete(): void {
    playChime();
    this.playStudyPulse(STUDY_RESPONSE.name);
    this.time.delayedCall(500, () => this.beat5());
  }

  /** Beat 5 — Type the typewriter's name. */
  private beat5(): void {
    this.narration.say("opening_beat5_type_typewriter");

    const target = this.makeStudyTarget({
      word: "Bjarn",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 48,
      response: STUDY_RESPONSE.typewriter,
      onComplete: () => this.onBeat5Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat5Complete(): void {
    playChime();
    this.playStudyPulse(STUDY_RESPONSE.typewriter);
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
    this.playStudyPulse(STUDY_RESPONSE.portal, { scale: 1.3, durationMs: 980 });
    this.time.delayedCall(2400, () => this.beat8());
  }

  /** Beat 8 — Type the portal name. */
  private beat8(): void {
    this.narration.say("opening_beat8_winter_woken");

    const target = this.makeStudyTarget({
      word: "Winter Mountain",
      x: TYPE_TARGET.x,
      y: TYPE_TARGET.y,
      fontSize: 44,
      response: STUDY_RESPONSE.portal,
      onComplete: () => this.onBeat8Complete(),
    });
    this.typingInput.register(target);
  }

  private onBeat8Complete(): void {
    playChime();
    this.playStudyPulse(STUDY_RESPONSE.portal, { scale: 1.45, durationMs: 900 });
    this.beat9();
  }

  /** Beat 9 — Sibling farewell. Spec-locked dialogue per §5.5.2: Saga keeps
   *  the drawing line; Magnus says he'll be here, don't take long. */
  private beat9(): void {
    const isBoy = this.wrenGender === "boy";
    this.setNarrator(
      isBoy
        ? "At the doorway, she holds the drawing out at last — both hands, no more hiding it. ‘Wren. I made you something.’"
        : "At the doorway, the joke finally leaves his face. ‘Wren. I’ll be here. Don’t take long.’",
      isBoy ? "Saga" : "Magnus",
    );
    this.playSiblingFarewell();
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

  private setNarrator(text: string, speakerName: string | null = null): void {
    this.narration.sayRaw(text, { speakerName });
  }

  private attendSpeaker(speakerName: string | null): void {
    if (speakerName === "Runa") {
      playActorAttention(this, this.runaActor, { scale: 1.015, durationMs: 190 });
    } else if (speakerName === "Saga" || speakerName === "Magnus") {
      playActorAttention(this, this.siblingActor, { scale: 1.025, durationMs: 190 });
      if (speakerName === "Saga") this.pulseSiblingKeepsake();
    }
  }

  private playSiblingFarewell(): void {
    playActorAttention(this, this.siblingActor, {
      scale: 1.03,
      durationMs: 260,
    });
    this.pulseSiblingKeepsake();
  }

  private pulseSiblingKeepsake(): void {
    const prop = this.siblingKeepsake;
    if (!prop?.scene) return;
    const baseScaleX = prop.scaleX;
    const baseScaleY = prop.scaleY;
    prop.setScale(baseScaleX * 1.12, baseScaleY * 1.12);
    prop.setAlpha(Math.min(1, prop.alpha + 0.16));
    this.tweens.add({
      targets: prop,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      alpha: 0.92,
      duration: 260,
      ease: "Sine.easeOut",
    });
  }

  private makeStudyTarget(opts: StudyTargetOptions): TextWordTarget {
    let target!: TextWordTarget;
    let releaseAnchor = (): void => {};
    target = new TextWordTarget({
      scene: this,
      word: opts.word,
      x: opts.x,
      y: opts.y,
      fontSize: opts.fontSize,
      outline: true,
      frame: "banner",
      onClaim: () => {
        this.playStudyClaimLine(opts.response, target);
        this.playStudyClaimPulse(opts.response);
      },
      onAdvance: () => this.playStudyTypingPulse(opts.response),
      onComplete: () => {
        releaseAnchor();
        opts.onComplete();
      },
    });
    releaseAnchor = this.attachStudyWordAnchor(target, opts.response);
    return target;
  }

  private attachStudyWordAnchor(
    target: TextWordTarget,
    point: StudyResponsePoint,
  ): () => void {
    const body = this.add.zone(point.x, point.y, 1, 1);
    const handle: WordBodyAnchorHandle = attachWordBodyAnchor(
      this,
      body,
      () => ({ x: target.getAnchorX(), y: target.getAnchorY() }),
      {
        color: point.color,
        alpha: 0.13,
        depth: -2,
        targetOffsetY: 24,
      },
    );

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      handle.destroy();
      body.destroy();
      const idx = this.studyWordAnchorReleases.indexOf(release);
      if (idx >= 0) this.studyWordAnchorReleases.splice(idx, 1);
    };
    this.studyWordAnchorReleases.push(release);
    return release;
  }

  private clearStudyWordAnchors(): void {
    for (const release of [...this.studyWordAnchorReleases]) {
      release();
    }
    this.studyWordAnchorReleases = [];
  }

  private playStudyClaimLine(
    point: StudyResponsePoint,
    target: TextWordTarget,
  ): void {
    playClaimLine(
      this,
      point.x,
      point.y,
      target.getAnchorX(),
      target.getAnchorY(),
      {
        color: point.color,
        depth: -1,
        durationMs: 300,
      },
    );
  }

  private playStudyClaimPulse(point: StudyResponsePoint): void {
    this.studyTypingPulseTimes.set(point, this.time.now);
    this.playStudyPulse(point, {
      scale: 1.45,
      durationMs: 420,
      alpha: 0.42,
      flecks: 4,
    });
  }

  private playStudyTypingPulse(point: StudyResponsePoint): void {
    const now = this.time.now;
    const last = this.studyTypingPulseTimes.get(point) ?? -Infinity;
    if (now - last < 95) return;
    this.studyTypingPulseTimes.set(point, now);

    const pulse = this.add
      .graphics()
      .setPosition(point.x, point.y)
      .setDepth(-2)
      .setAlpha(0.32);
    pulse.lineStyle(1, point.color, 0.34);
    pulse.strokeCircle(0, 0, 28);
    pulse.lineStyle(1, point.color, 0.2);
    pulse.strokeCircle(0, 0, 44);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 210,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private playStudyPulse(
    point: StudyResponsePoint,
    opts: {
      scale?: number;
      durationMs?: number;
      alpha?: number;
      flecks?: number;
    } = {},
  ): void {
    const duration = opts.durationMs ?? 620;
    const alpha = opts.alpha ?? 0.7;
    const pulse = this.add
      .graphics()
      .setPosition(point.x, point.y)
      .setDepth(-3)
      .setAlpha(alpha);
    pulse.lineStyle(3, point.color, alpha);
    pulse.strokeCircle(0, 0, 44);
    pulse.lineStyle(1, point.color, alpha * 0.58);
    pulse.strokeCircle(0, 0, 70);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: opts.scale ?? 2.2,
      scaleY: opts.scale ?? 2.2,
      duration,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });

    const fleckCount = opts.flecks ?? 10;
    for (let i = 0; i < fleckCount; i++) {
      const angle =
        (i / fleckCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const fleck = this.add
        .graphics()
        .setPosition(point.x, point.y)
        .setDepth(-2)
        .setAlpha(alpha + 0.06);
      fleck.fillStyle(point.color, Math.min(0.84, alpha + 0.08));
      fleck.fillCircle(0, 0, Phaser.Math.FloatBetween(2, 4));
      this.tweens.add({
        targets: fleck,
        x: point.x + Math.cos(angle) * Phaser.Math.Between(80, 180),
        y: point.y + Math.sin(angle) * Phaser.Math.Between(40, 110),
        alpha: 0,
        duration: duration + Phaser.Math.Between(-80, 120),
        ease: "Sine.easeOut",
        onComplete: () => fleck.destroy(),
      });
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  /** Runa — the painted royal cartographer, steps down into the lamplight in
   *  front of the desk on the left. Positioned left of the painted chair
   *  (which sits at ≈x=900) so she doesn't appear to stand on it. */
  private drawRuna(): void {
    const actor = this.add.container(430, 900).setAlpha(0).setDepth(-1);
    this.runaActor = actor;
    actor.add(addLocalGroundShadow(this, 180, 28, { y: 7, alpha: 0.32 }));
    const img = this.add
      .image(0, 0, "runa-sprite")
      .setOrigin(0.5, 1);
    // 420px tall — matches painted desk + chair proportions in this study.
    img.setScale(420 / img.height);
    actor.add(img);
    this.tweens.add({
      targets: actor,
      x: 480,
      y: 945,
      alpha: 1,
      duration: 850,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, actor, { dy: -4, durationMs: 2200 }),
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
    const actor = this.add.container(isBoy ? 1240 : 1260, 950).setAlpha(0).setDepth(-1);
    this.siblingActor = actor;

    const doorway = this.add.graphics().setPosition(isBoy ? 10 : -4, -142);
    doorway.fillStyle(isBoy ? 0xeedec0 : 0x8fa4bc, isBoy ? 0.07 : 0.1);
    doorway.fillEllipse(0, 0, isBoy ? 128 : 154, isBoy ? 248 : 290);
    doorway.lineStyle(2, isBoy ? 0xc9a14a : 0x8fa4bc, isBoy ? 0.12 : 0.16);
    doorway.strokeEllipse(0, 0, isBoy ? 104 : 126, isBoy ? 220 : 252);
    actor.add(doorway);

    actor.add(addLocalGroundShadow(this, isBoy ? 110 : 136, 22, { y: 7, alpha: 0.28 }));
    const img = this.add
      .image(0, 0, "sibling-sprite")
      .setOrigin(0.5, 1);
    // Magnus reads taller (older sibling) than Saga; both still sit below
    // doorway height so the painted portal stays legible past them.
    img.setScale((isBoy ? 260 : 300) / img.height);
    // Tint multipliers soften the bright nightgown+pale skin against the
    // dim study palette. Saga gets a warm cream cast (sits in lamplight);
    // Magnus gets a cool blue-gray (reads as older + a beat more distant).
    img.setTint(isBoy ? 0xbfb0a0 : 0xa0aebf);
    actor.add(img);

    if (isBoy) {
      const drawing = this.add.graphics().setPosition(24, -116).setAlpha(0.92);
      drawing.fillStyle(0xf0dfbd, 0.92);
      drawing.fillRoundedRect(-22, -24, 44, 36, 4);
      drawing.lineStyle(2, 0xb98f49, 0.72);
      drawing.strokeRoundedRect(-22, -24, 44, 36, 4);
      drawing.lineStyle(1, 0x7b623d, 0.44);
      drawing.lineBetween(-14, -5, -3, -14);
      drawing.lineBetween(-3, -14, 10, 3);
      drawing.lineBetween(-10, 6, 14, 6);
      actor.add(drawing);
      this.siblingKeepsake = drawing;
    } else {
      const doorShadow = this.add.graphics().setPosition(-18, -130).setAlpha(0.68);
      doorShadow.fillStyle(0x273241, 0.32);
      doorShadow.fillRoundedRect(-42, -138, 84, 260, 34);
      actor.addAt(doorShadow, 0);
      this.siblingKeepsake = null;
    }

    this.tweens.add({
      targets: actor,
      x: isBoy ? 1180 : 1198,
      alpha: 1,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => addIdleBreath(this, actor, { dy: -3, durationMs: 2100 }),
    });
  }
}
