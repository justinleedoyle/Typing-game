// Scene-flow fixtures keep Phaser display inert. The complete grip's ordering,
// transforms, fingers, rapid input and lifetime run in wrenReactions.test.ts.
// This adapter records the receiving hand while allowing each scene's actual
// transfer/reward/restore code to run without importing browser-only Phaser.
export function attachWrenHeldPropFixture(
  _scene: unknown, owner: any, sprite: any, prop: any, point: { x: number; y: number },
): void {
  owner.addAt(prop, owner.getIndex(sprite) + 1);
  prop.x = point.x; prop.y = point.y;
  prop.receivingHand = { ...point };
}
