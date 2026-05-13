// Single shared AudioContext. Browsers limit how many a tab can create, and
// every SFX in the game wants to live in the same one anyway so they can be
// scheduled relative to each other.

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}
