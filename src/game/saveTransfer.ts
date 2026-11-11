import { CURRENT_SCHEMA_VERSION, InvalidSaveError, UnsupportedSaveVersionError, migrate, type SaveState } from "./saveState";
import { OPENING_STEPS, WINTER_STEPS } from "./chapterFlow";
import { BELL_STEPS } from "./bellCheckpoint";
import { FORGE_STEPS } from "./forgeCheckpoint";
import { SKY_STEPS } from "./skyCheckpoint";
import { WOOD_STEPS } from "./woodCheckpoint";
import { SessionStats } from "./sessionStats";
import { BreathMeter } from "./breathMeter";
import { resolveCombatLoadout } from "./relicEffects";

export const MAX_JOURNEY_TRANSFER_BYTES = 2 * 1024 * 1024;
const TRANSFER_FORMAT = "portalwrights-journey";
const TRANSFER_VERSION = 1;
const STATE_FIELDS = [
  "schemaVersion", "runId", "profileName", "typewriterAwakened", "wrenGender",
  "realms", "satchel", "keyStats", "almanacLore", "difficulty", "audioLevel",
  "checkpoint", "textScale", "reducedMotion", "reducedFlashes", "updatedAt",
] as const;
const damagedMessage = "This journey file could not be read. Export a new copy from the game. Your current journey has not changed.";
const CHECKPOINT_STEPS: Record<NonNullable<SaveState["checkpoint"]>["scene"], readonly string[]> = {
  OpeningScene: OPENING_STEPS,
  WinterMountainScene: WINTER_STEPS,
  SunkenBellScene: BELL_STEPS,
  ClockworkForgeScene: FORGE_STEPS,
  SkyIslandScene: SKY_STEPS,
  HauntedWoodScene: WOOD_STEPS,
};
// Current stable content bounds. Winter/Sky cursor helpers cap at length - 1;
// Bell/Forge/Wood also save an inclusive completed-chain boundary. These are
// file-format validation limits, never changed gameplay counters or timers.
const CHECKPOINT_INDEX_LAST: Partial<Record<NonNullable<SaveState["checkpoint"]>["scene"], Record<string, number>>> = {
  WinterMountainScene: { trail: 2, heldur: 2, "heldur-answer": 2, wave: 2, huntress: 1, firefly: 1, bury: 1, pelt: 1, "true-name": 2 },
  SunkenBellScene: { descent: 3, olin: 3, choir: 3, "choir-cleared": 3, chant: 4, "force-break": 4, "free-aurland": 3, "claim-tongue": 1 },
  ClockworkForgeScene: { catwalk: 2, "catwalk-answer": 2, boss1: 2, boss2: 2, boss3: 1, forn: 4, cabal: 4, "true-name": 3 },
  SkyIslandScene: { path: 2, temple: 4, "temple-cleared": 4, "steal-flame": 3, "cut-tether": 1 },
  HauntedWoodScene: { path: 3, inga: 2, ward: 4, offering: 1, flute: 2, bargain: 3, capstone: 10, final1: 6, final2: 5 },
};

function checkpointState(state: SaveState): void {
  if (!state.checkpoint) return;
  const { scene, step, data } = state.checkpoint;
  const present = (field: string) => Object.hasOwn(data, field);
  const fail = (): never => { throw new InvalidSaveError(damagedMessage); };
  const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (present("index")) {
    let last = CHECKPOINT_INDEX_LAST[scene]?.[step] ?? Number.MAX_SAFE_INTEGER;
    if (scene === "HauntedWoodScene") last = Math.min(last, 100); // resumeWood's outer woodIndex bound.
    if (scene === "SkyIslandScene" && step === "help-etta") {
      const helpedBefore = typeof data.helpedBefore === "boolean" ? data.helpedBefore :
        state.realms["sky-island"]?.choices.ettaHelped === "yes" || state.almanacLore.includes("scholar-ettas-last-volume");
      last = helpedBefore ? 1 : 3;
    }
    if (!integer(data.index, last)) fail();
  }
  for (const field of ["reading", "intro", "accepted", "spell", "foxDecided", "skipped", "helpedBefore", "typing", "response", "begun"]) {
    if (present(field) && typeof data[field] !== "boolean") fail();
  }
  for (const field of ["combatSatchel", "spentOneShots", "usedOneShots"]) {
    if (present(field) && typeof data[field] !== "string") fail();
  }
  if (scene === "WinterMountainScene") {
    // Winter init rounds/clamps candles to 1..3, while its legacy Soul path
    // banks a 0..100 fraction. Reject an edited value before either changes it.
    if (present("candles") && (!integer(data.candles, 3) || data.candles === 0)) fail();
    if (present("soul") && !(typeof data.soul === "number" && Number.isFinite(data.soul) && data.soul >= 0 && data.soul <= 100)) fail();
  }
  if (scene === "SunkenBellScene") {
    if (present("air")) {
      if (typeof data.air !== "number") fail();
      const breath = new BreathMeter(); breath.restore(data.air as number);
      if (breath.getAir() !== data.air) fail();
    }
    if (present("graceSaves")) {
      const satchel = typeof data.combatSatchel === "string" ? data.combatSatchel.split(",").filter(Boolean) : state.satchel;
      if (!integer(data.graceSaves, resolveCombatLoadout(satchel, "sunken-bell").gracePool)) fail();
    }
    if (["chant", "free-aurland", "claim-tongue"].includes(step) && data.reading === true && data.index === 0) fail();
  }
  if (scene === "SkyIslandScene") {
    if (step === "boss" && present("phase") && data.phase !== 1 && data.phase !== 2 && data.phase !== 3) fail();
    if (step === "etta-book") {
      if (present("stage") && !["intro", "lift", "carried", "place", "shelved"].includes(data.stage as string)) fail();
      if (present("nextTemple") && data.nextTemple !== 3) fail();
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(value, field));
}
function checkSize(text: string): void {
  // The character check avoids allocating an oversized byte array for a file
  // that already exceeds the limit before UTF-8 encoding.
  if (text.length > MAX_JOURNEY_TRANSFER_BYTES || new TextEncoder().encode(text).byteLength > MAX_JOURNEY_TRANSFER_BYTES) {
    throw new InvalidSaveError("This journey file is too large. Export a new copy from the game. Your current journey has not changed.");
  }
}
function canonicalState(value: unknown, strictFields: boolean): SaveState {
  if (!record(value)) throw new InvalidSaveError(damagedMessage);
  // Preserve the established newer-version error even when a future format
  // changes its required fields. Missing fields can never create a new player.
  if (typeof value.schemaVersion === "number" && Number.isInteger(value.schemaVersion) && value.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSaveVersionError(value.schemaVersion);
  }
  if ((strictFields && !exactFields(value, STATE_FIELDS)) ||
      !STATE_FIELDS.every(field => Object.hasOwn(value, field)) ||
      typeof value.runId !== "string" || !value.runId.trim() ||
      typeof value.profileName !== "string") throw new InvalidSaveError(damagedMessage);
  try {
    const state = migrate(value);
    // Ordinary migration discards obsolete markers after a realm is complete.
    // An imported file must not silently lose its claimed restart location.
    if (value.checkpoint !== null && state.checkpoint === null) throw new InvalidSaveError(damagedMessage);
    if (state.checkpoint) {
      const { scene, step, data } = state.checkpoint;
      // Scene routing intentionally falls back to arrival for an unknown
      // marker. A transfer must refuse that loss rather than promise a resume.
      if (!CHECKPOINT_STEPS[scene].includes(step)) throw new InvalidSaveError(damagedMessage);
      const stats = new SessionStats();
      stats.restoreCheckpoint(data);
      const restored = stats.captureCheckpoint();
      for (const field of ["statsHits", "statsSoul", "statsCombo", "statsBestCombo"] as const) {
        if (Object.hasOwn(data, field) && data[field] !== restored[field]) throw new InvalidSaveError(damagedMessage);
      }
      checkpointState(state);
    }
    return state;
  } catch (error) {
    if (error instanceof UnsupportedSaveVersionError) throw error;
    throw new InvalidSaveError(damagedMessage);
  }
}

/** A portable copy contains canonical progress only: never account identity,
 * raw storage, recovery metadata, credentials or device paths. */
export function encodeJourneyTransfer(state: SaveState): string {
  const canonical = canonicalState(state, false);
  const text = JSON.stringify({
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    state: canonical,
  }, null, 2) + "\n";
  checkSize(text);
  return text;
}

/** Only files made by the journey export flow are import candidates. Raw
 * saves and damage-recovery bundles deliberately use different contracts. */
export function decodeJourneyTransfer(text: string): SaveState {
  if (typeof text !== "string") throw new InvalidSaveError(damagedMessage);
  checkSize(text);
  let value: unknown;
  try { value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); }
  catch { throw new InvalidSaveError(damagedMessage); }
  if (!record(value)) throw new InvalidSaveError(damagedMessage);
  if (Object.hasOwn(value, "copies")) {
    throw new InvalidSaveError("This is a recovery copy, not a transferable journey. Export a journey file from the game. Your current journey has not changed.");
  }
  if (value.format !== TRANSFER_FORMAT) {
    throw new InvalidSaveError("Choose a journey file exported from the game. Your current journey has not changed.");
  }
  if (typeof value.version === "number" && Number.isInteger(value.version) && value.version > TRANSFER_VERSION) {
    throw new UnsupportedSaveVersionError(value.version);
  }
  if (value.version !== TRANSFER_VERSION || !exactFields(value, ["format", "version", "exportedAt", "state"]) ||
      typeof value.exportedAt !== "string" || value.exportedAt.length > 27 ||
      !Number.isFinite(Date.parse(value.exportedAt))) throw new InvalidSaveError(damagedMessage);
  if (new Date(value.exportedAt).toISOString() !== value.exportedAt) throw new InvalidSaveError(damagedMessage);
  return canonicalState(value.state, true);
}

/** A suggested name, not a path. The full journey stays inside the JSON. */
export function journeyTransferFilename(state: SaveState): string {
  const profile = typeof state.profileName === "string" ? state.profileName : "";
  const name = profile.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "") || "wren";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `portalwrights-journey-${name}-${timestamp}.json`;
}
