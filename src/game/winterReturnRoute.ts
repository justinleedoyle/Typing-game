import type { SaveCheckpoint } from "./saveState";

export type WinterReturnRoute = "crossing" | "bank";
export type WinterReturnPhase = "prepare" | "return";
export type WinterRouteAction = "seat" | "brace" | "cross" | "step" | "duck";

/** Optional, versioned history: a historical journey never acquires a route
 * merely because it has reached a later chapter checkpoint. */
export function winterReturnRoute(choices: Readonly<Record<string, string>>): WinterReturnRoute | null {
  return choices.returnRouteVersion === "1" && (choices.returnRoute === "crossing" || choices.returnRoute === "bank")
    ? choices.returnRoute : null;
}

export function winterRouteActions(route: WinterReturnRoute, phase: WinterReturnPhase): readonly WinterRouteAction[] {
  return phase === "prepare" ? route === "crossing" ? ["seat", "brace"] : []
    : route === "crossing" ? ["cross"] : ["step", "duck"];
}

export function winterRouteProgress(data: SaveCheckpoint["data"], length: number): { index: number; reading: boolean } {
  const index = typeof data.index === "number" && Number.isInteger(data.index)
    ? Math.max(0, Math.min(Math.max(0, length - 1), data.index)) : 0;
  return { index, reading: data.returnRouteVersion === 1 && data.reading === true };
}

export function winterReturnPending(choices: Readonly<Record<string, string>>): boolean {
  const route = winterReturnRoute(choices);
  return (route === "bank" || route === "crossing" && choices.returnPrepared === "1") && choices.returnRouteDone !== "1";
}

export function winterRouteMemory(choices: Readonly<Record<string, string>>): string {
  if (choices.returnRouteDone !== "1") return "";
  const route = winterReturnRoute(choices);
  return route === "crossing" && choices.returnPrepared === "1" ? "Wren prepared a pine crossing before the climb and used it on the way back."
    : route === "bank" ? "Wren left the crossing alone, then found firm footing and ducked along the bank on the way back." : "";
}

export const WINTER_ROUTE_REACTIONS: Record<WinterRouteAction, string> = {
  seat: "The pine spans the narrow ice. Its ends need bracing before you trust it on the way back.",
  brace: "You wedge both ends against the bank stones. The crossing is ready for your return; the climb continues upstream.",
  cross: "The pine still rests against the stones you set. Your earlier work carries you back across the stream.",
  step: "Your old footprints are gone. You find firm ground along the bank; the low pine bough is next.",
  duck: "You pass beneath the bough and rejoin the homeward trail. You found a way back without moving the pine.",
};
