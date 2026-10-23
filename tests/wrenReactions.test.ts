import { readFileSync } from "node:fs";
import ts from "typescript";
import { assert, assertEqual, suite } from "./_assert";

// Run the complete, actual helper module. Only image imports and Phaser's
// display/tween surfaces are inert; reaction and restoration code is unchanged.
const source = readFileSync(new URL("../src/game/wren.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
interface WrenHelpers {
  bobWrenSprite(image: Image): void;
  playWrenFocus(image: Image): void;
  playWrenAction(image: Image): void;
  setWrenPose(image: Image, pose: string): void;
  playWrenHurt(image: Image, options: { onComplete: () => void }): void;
}
const exports = {} as WrenHelpers;
new Function("exports", "require", code)(exports, () => ({ default: "inert-image-asset" }));

interface Tween { targets: Image; onComplete?: () => void }
interface Timer { removed: boolean; callback: () => void; remove(): void }
function fixture() {
  const active: Tween[] = [];
  const timers: Timer[] = [];
  const scene = {
    tweens: {
      killTweensOf(image: Image) {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].targets === image) active.splice(index, 1);
        }
      },
      add(tween: Tween) { active.push(tween); return tween; },
    },
    time: {
      delayedCall(_delay: number, callback: () => void) {
        const timer = { removed: false, callback, remove() { this.removed = true; } };
        timers.push(timer);
        return timer;
      },
    },
  };
  const image = new Image(scene);
  return { image, active, timers,
    finish: () => { const tween = active.shift(); assert(tween, "a visual tween is active"); tween.onComplete?.(); },
  };
}

class Image {
  texture = { key: "wren-front" };
  height = 100;
  x = 0;
  y = 0;
  scaleX = -2.4;
  scaleY = 2.4;
  tinted = false;
  data = new Map<string, unknown>();
  constructor(readonly scene: { tweens: unknown; time: unknown }) {}
  setTexture(key: string) { this.texture.key = key; this.height = key === "wren-front" ? 100 : 150; return this; }
  setScale(scale: number) { this.scaleX = scale; this.scaleY = scale; return this; }
  getData(key: string) { return this.data.get(key); }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  setTintFill() { this.tinted = true; return this; }
  clearTint() { this.tinted = false; return this; }
}
const resting = (image: Image) => ({ key: image.texture.key, x: image.x, y: image.y,
  scaleX: image.scaleX, scaleY: image.scaleY });

await suite("Wren reactions: a keystroke interrupting focus cannot strand a raised walk frame", () => {
  const { image, finish } = fixture();
  const initial = resting(image);
  exports.playWrenFocus(image);
  image.x = -3; image.y = -2; // focus is halfway through its visual lift
  exports.bobWrenSprite(image);
  assertEqual(resting(image), initial, "typing restores the resting frame before starting its squash");
  image.scaleX *= 1.01; image.scaleY *= .97;
  exports.playWrenAction(image);
  image.y = -6;
  finish();
  assertEqual(resting(image), initial, "completion returns to the original pose, feet and facing");
});

await suite("Wren reactions: rapid repeated feedback never accumulates position or scale drift", () => {
  const { image, finish } = fixture();
  image.y = 12; image.scaleX = -3.2; image.scaleY = 3.2;
  const initial = resting(image);
  for (let press = 0; press < 20; press += 1) {
    exports.playWrenFocus(image);
    image.x -= 2; image.y -= 2;
    exports.bobWrenSprite(image);
    image.scaleX *= 1.01; image.scaleY *= .98;
  }
  finish();
  assertEqual(resting(image), initial, "all interrupted reactions share the scene's actual resting scale and offset");
});

await suite("Wren reactions: an intentional scene pose supersedes an old flourish", () => {
  const { image, active } = fixture();
  exports.playWrenFocus(image);
  const oldCompletion = active[0].onComplete!;
  image.x = -3; image.y = -2;
  exports.setWrenPose(image, "cast");
  const commanded = resting(image);
  oldCompletion();
  assertEqual(resting(image), commanded, "an old cancelled callback cannot restore over the commanded pose");
  assertEqual(image.y, 0, "the scene pose begins at the stable foot position");
  assertEqual(image.texture.key, "wren-cast", "the explicit cast pose remains selected");
});

await suite("Wren reactions: repeated damage restores the stable pose and guards its hurt window", () => {
  const { image, timers, active } = fixture();
  const initial = resting(image);
  let restored = 0;
  exports.playWrenHurt(image, { onComplete: () => { restored += 1; } });
  image.y = 5;
  const hurtTweenCount = active.length;
  exports.bobWrenSprite(image);
  exports.playWrenFocus(image);
  exports.playWrenAction(image);
  assertEqual(active.length, hurtTweenCount, "gentle typing feedback cannot cancel the hurt reaction");
  assertEqual(image.texture.key, "wren-hurt", "hurt pose stays visible during its timer");
  exports.playWrenHurt(image, { onComplete: () => { restored += 1; } });
  assert(timers[0].removed, "new damage cancels the previous recovery timer");
  timers[0].callback();
  assertEqual(restored, 0, "a stale recovery does not run scene hooks");
  image.y = 4;
  timers[1].callback();
  assertEqual(resting(image), initial, "the second damage reaction does not inherit the first knockback");
  assertEqual(restored, 1, "the current recovery runs its scene hook once");
  assert(!image.tinted && !image.getData("wrenHurtTimer"), "recovery clears tint and timer state");
});
