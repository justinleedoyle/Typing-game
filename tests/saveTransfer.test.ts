import { assert, assertEqual, suite } from "./_assert";
import { CURRENT_SCHEMA_VERSION, InvalidSaveError, UnsupportedSaveVersionError, emptySave, migrate, type SaveState } from "../src/game/saveState";
import { MAX_JOURNEY_TRANSFER_BYTES, decodeJourneyTransfer, encodeJourneyTransfer, journeyTransferFilename } from "../src/game/saveTransfer";
import { SessionStats } from "../src/game/sessionStats";
import { checkpointIndex } from "../src/game/chapterFlow";
import { bellIndex } from "../src/game/bellCheckpoint";
import { forgePassageIndex } from "../src/game/forgeCheckpoint";
import { woodIndex } from "../src/game/woodCheckpoint";
import { BreathMeter } from "../src/game/breathMeter";

function journey(): SaveState {
  return {
    ...emptySave("Wren — Élodie"), runId: "transfer-run-retained", updatedAt: 1793299488707,
    typewriterAwakened: true, wrenGender: "girl", difficulty: "purist", audioLevel: "quiet",
    textScale: "large", reducedMotion: true, reducedFlashes: true,
    realms: {
      "winter-mountain": { cleared: true, choices: { fox: "spared", fork1: "firefly" }, quietLordIntruded: true },
      "sunken-bell": { cleared: false, choices: { door: "quiet" }, quietLordFragmentRevealed: true },
    },
    satchel: ["firefly-lantern", "forns-hammer"], almanacLore: ["the-wounded-foxs-name", "the-firefly-trail"],
    keyStats: { s: { hits: 31, misses: 2 }, a: { hits: 7, misses: 0 } },
    checkpoint: { scene: "SunkenBellScene", step: "warden-defeated", data: { candles: 2, statsSoul: 62.5, statsCombo: 8, lockBarHeld: true, words: "hold fast", optional: null } },
  };
}
function fileWith(mutator: (file: any) => void): string {
  const file = JSON.parse(encodeJourneyTransfer(journey())); mutator(file); return JSON.stringify(file);
}
function rejected(text: string, Type: new (...args: any[]) => Error = InvalidSaveError): Error | undefined {
  try { decodeJourneyTransfer(text); return undefined; }
  catch (error) { assert(error instanceof Type, "rejected file uses the expected player-facing save error"); return error as Error; }
}

await suite("Journey transfer: canonical file roundtrip preserves every meaningful played field", () => {
  const state = journey(), original = structuredClone(state), text = encodeJourneyTransfer(state), file = JSON.parse(text);
  assertEqual(Object.keys(file), ["format", "version", "exportedAt", "state"], "the portable contract contains only format metadata and progress");
  assertEqual([file.format, file.version], ["portalwrights-journey", 1], "the transfer format is explicit and versioned");
  assertEqual(new Date(file.exportedAt).toISOString(), file.exportedAt, "export time is canonical ISO metadata");
  assertEqual(decodeJourneyTransfer(text), state, "run identity, choices, fractional resources, checkpoint data and presentation survive exactly");
  assertEqual(state, original, "export cannot mutate the source journey");
  assertEqual(decodeJourneyTransfer(`\ufeff${text}`), state, "a harmless UTF-8 BOM does not lose a Windows-transferred journey");
  const extra = { ...state, accountId: "not-progress", rawStorage: "not-progress", devicePath: "not-progress" };
  assertEqual(JSON.parse(encodeJourneyTransfer(extra)).state, migrate(state), "canonical export excludes account identity, raw storage and paths");
});

await suite("Journey transfer: arbitrary, raw-save, recovery and incomplete files cannot fabricate new progress", () => {
  for (const text of ["", "{broken", "null", "[]", "{}", JSON.stringify(journey()),
    fileWith(file => { file.state = {}; }), fileWith(file => { delete file.state.runId; }),
    fileWith(file => { file.state.runId = " "; }), fileWith(file => { delete file.state.checkpoint; }),
    fileWith(file => { file.state.realms = []; }), fileWith(file => { file.state.keyStats.s.hits = -1; }),
    fileWith(file => { file.state.keyStats.s.misses = 1.5; }), fileWith(file => { file.state.reducedMotion = "false"; }),
    fileWith(file => { file.state.unrecognizedProgress = true; }), fileWith(file => { file.accountId = "not-progress"; }),
    fileWith(file => { file.format = "another-game"; }), fileWith(file => { file.version = "1"; }),
    fileWith(file => { file.version = 0; }), fileWith(file => { file.version = 1.5; }),
    fileWith(file => { delete file.exportedAt; }), fileWith(file => { file.exportedAt = "yesterday"; }),
    fileWith(file => { file.exportedAt = "2026-02-30T00:00:00.000Z"; }),
  ]) assert(rejected(text) !== undefined, "malformed and foreign files are refused without returning a default journey");
  const recovery = rejected(JSON.stringify({ version: 1, reason: "damaged", copies: { primary: "broken" } }));
  assert(recovery?.message.includes("recovery copy"), "a recovery bundle explains that a playable export is needed");
  assert(!recovery?.message.includes("primary"), "raw recovery data never enters player-facing error copy");
});

await suite("Journey transfer: future contracts and checkpoint loss are refused explicitly", () => {
  assert(rejected(fileWith(file => { file.version = 2; delete file.state; }), UnsupportedSaveVersionError) !== undefined, "future transfer formats request a newer game before interpreting their shape");
  assert(rejected(fileWith(file => { file.state = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 }; }), UnsupportedSaveVersionError) !== undefined, "future game schema remains protected even if its fields changed");
  assert(rejected(fileWith(file => { file.state.schemaVersion = -1; })) !== undefined, "negative game schema is malformed");
  assert(rejected(fileWith(file => { file.state.schemaVersion = CURRENT_SCHEMA_VERSION + 0.5; }))?.message.includes("journey file"), "malformed numeric schema uses plain file guidance rather than exposing a raw field name");
  assert(rejected(fileWith(file => { file.state.checkpoint.scene = "WinterMountainScene"; })) !== undefined, "a marker in an already completed realm is not silently discarded");
  assert(rejected(fileWith(file => { file.state.typewriterAwakened = false; })) !== undefined, "an unawakened journey cannot silently lose a later-realm marker");
  const opening = { ...emptySave("New opening"), checkpoint: { scene: "OpeningScene" as const, step: "arrival", data: {} } };
  assertEqual(decodeJourneyTransfer(encodeJourneyTransfer(opening)), opening, "a valid ordinary opening checkpoint survives unchanged");
  const completed = journey(); completed.checkpoint = null;
  assertEqual(decodeJourneyTransfer(encodeJourneyTransfer(completed)), completed, "a legitimate journey without an unfinished marker is allowed");
  assert(rejected(fileWith(file => { file.state.checkpoint.scene = "UnknownScene"; })) !== undefined, "unknown scene cannot become an unsafe restart target");
  assert(rejected(fileWith(file => { file.state.checkpoint.data.candles = { nested: true }; })) !== undefined, "nested checkpoint payloads are not playable values");
});

await suite("Journey transfer: actual realm restart boundaries remain playable and unknown steps cannot restart a chapter", () => {
  const fixtures = [
    ["OpeningScene", "departure"], ["WinterMountainScene", "firefly"],
    ["SunkenBellScene", "warden-defeated"], ["ClockworkForgeScene", "peaceful-answer"],
    ["SkyIslandScene", "answer-kindly"], ["HauntedWoodScene", "capstone-answer"],
  ] as const;
  for (const [scene, step] of fixtures) {
    const state = journey();
    if (scene === "OpeningScene") state.typewriterAwakened = false;
    state.realms = {};
    state.checkpoint = { scene, step, data: { statsHits: "11010111", statsSoul: 62.5, statsCombo: 8, statsBestCombo: 20 } };
    assertEqual(decodeJourneyTransfer(encodeJourneyTransfer(state)), state, `the actual ${scene}/${step} restart remains exact`);
    const damaged = JSON.parse(encodeJourneyTransfer(state)); damaged.state.checkpoint.step = "unknown-edited-step";
    assert(rejected(JSON.stringify(damaged)) !== undefined, "an unknown marker must fail before the scene can fall back to arrival");
  }
});

await suite("Journey transfer: claimed typing stakes cannot be silently normalized during actual restoration", () => {
  for (const [field, value] of [
    ["statsSoul", null], ["statsSoul", "62.5"], ["statsSoul", -1], ["statsSoul", 101],
    ["statsCombo", false], ["statsCombo", 2.5], ["statsCombo", -1], ["statsCombo", Number.MAX_SAFE_INTEGER + 1],
    ["statsBestCombo", 1], ["statsBestCombo", -1], ["statsBestCombo", 20.5],
    ["statsHits", "1102"], ["statsHits", null], ["statsHits", "1".repeat(51)],
  ] as const) {
    assert(rejected(fileWith(file => { file.state.checkpoint.data[field] = value; })) !== undefined,
      "a resource value that real SessionStats would drop, round, clamp or truncate cannot be imported");
  }
  const state = journey();
  state.checkpoint!.data.statsHits = "11010111";
  const imported = decodeJourneyTransfer(encodeJourneyTransfer(state)), restored = new SessionStats();
  restored.restoreCheckpoint(imported.checkpoint!.data);
  assertEqual(restored.captureCheckpoint(), { statsHits: "11010111", statsSoul: 62.5, statsCombo: 8, statsBestCombo: 8 },
    "a valid partial historical checkpoint retains its explicitly saved exact values through the actual stats class");
});

await suite("Journey transfer: scene-owned checkpoint primitives reject silent index, resource and branch fallback", () => {
  const checkpointFile = (scene: NonNullable<SaveState["checkpoint"]>["scene"], step: string, data: Record<string, unknown>) => fileWith(file => {
    file.state.realms = {}; file.state.checkpoint = { scene, step, data };
    file.state.typewriterAwakened = scene !== "OpeningScene";
  });
  assertEqual(checkpointIndex(-7, 3), 0, "the real Winter helper demonstrates the negative-index fallback that transfer must refuse");
  for (const data of [{ index: -7, candles: 0, statsSoul: 62.5 }, { index: 3 }, { index: 0.5 }, { index: "1" },
    { index: null }, { candles: 0 }, { candles: 4 }, { candles: 2.5 }, { candles: "2" }, { soul: -1 }, { soul: 101 },
    { soul: "62.5" }, { foxDecided: "true" }, { reading: 1 }, { combatSatchel: false }]) {
    assert(rejected(checkpointFile("WinterMountainScene", "wave", data)) !== undefined, "malformed Winter primitives cannot silently become different live progress");
  }
  assertEqual(checkpointIndex(3, 3), 2, "Winter's out-of-range wave index would otherwise become its last encounter");
  assert(rejected(checkpointFile("WinterMountainScene", "firefly", { index: 2 })) !== undefined, "Winter passage index is exclusive at its authored length");
  for (const [scene, step, data] of [
    ["SunkenBellScene", "choir", { index: 4 }], ["SunkenBellScene", "chant", { index: 0, reading: true }],
    ["SunkenBellScene", "descent", { air: 101 }], ["SunkenBellScene", "descent", { air: "50" }],
    ["SunkenBellScene", "descent", { graceSaves: 1, combatSatchel: "" }], ["SunkenBellScene", "descent", { graceSaves: -1 }],
    ["ClockworkForgeScene", "boss3", { index: 2 }], ["ClockworkForgeScene", "forn", { index: 5 }],
    ["SkyIslandScene", "temple", { index: 5 }], ["SkyIslandScene", "help-etta", { index: 2, helpedBefore: true }],
    ["SkyIslandScene", "boss", { phase: 0 }], ["SkyIslandScene", "boss", { phase: "2" }],
    ["SkyIslandScene", "etta-book", { stage: "unknown" }], ["SkyIslandScene", "etta-book", { nextTemple: 4 }],
    ["HauntedWoodScene", "ward", { index: 5 }], ["HauntedWoodScene", "capstone", { index: 11 }],
    ["HauntedWoodScene", "inga", { index: 3 }],
    ["HauntedWoodScene", "final1", { index: 7 }], ["HauntedWoodScene", "flute", { index: 3 }],
  ] as const) assert(rejected(checkpointFile(scene, step, data)) !== undefined, "scene-specific invalid boundaries fail instead of choosing a fallback");
  assert(rejected(fileWith(file => {
    file.state.realms = { "sky-island": { cleared: false, choices: { ettaHelped: "yes" } } };
    file.state.checkpoint = { scene: "SkyIslandScene", step: "help-etta", data: { index: 2 } };
  })) !== undefined, "older Etta checkpoints derive the short passage from the actual saved help decision when its explicit flag is absent");
  const good = [
    ["WinterMountainScene", "wave", { index: 2, candles: 1, soul: 63, statsSoul: 62.5 }],
    ["SunkenBellScene", "chant", { index: bellIndex(4, 4), reading: true, air: 62.5, graceSaves: 0 }],
    ["ClockworkForgeScene", "forn", { index: forgePassageIndex(4, 4) }],
    ["ClockworkForgeScene", "true-name", { index: forgePassageIndex(3, 3) }],
    ["SkyIslandScene", "boss", { phase: 3 }], ["SkyIslandScene", "etta-book", { stage: "shelved", nextTemple: 3 }],
    ["SkyIslandScene", "help-etta", { index: 3, helpedBefore: false, reading: true }],
    ["HauntedWoodScene", "final1", { index: woodIndex(6, 6), begun: true }],
    ["HauntedWoodScene", "ward", { index: woodIndex(4, 4), response: false }],
  ] as const;
  for (const [scene, step, data] of good) {
    const text = checkpointFile(scene, step, data), decoded = decodeJourneyTransfer(text);
    assertEqual(decoded.checkpoint?.data, data, "authored inclusive completion boundaries and exact fractional stakes remain transferable");
  }
  const breath = new BreathMeter(); breath.restore(62.5);
  assertEqual(breath.getAir(), 62.5, "valid Bell fractional air is preserved by its real restore helper");
});

await suite("Journey transfer: unsafe map keys and oversized UTF-8 input never reach gameplay", () => {
  for (const field of ["__proto__", "constructor", "prototype"]) {
    for (const target of ["choices", "keyStats", "data", "realms"]) {
      const text = fileWith(file => {
        const object = target === "choices" ? file.state.realms["sunken-bell"].choices : target === "data" ? file.state.checkpoint.data : file.state[target];
        Object.defineProperty(object, field, { value: target === "keyStats" ? { hits: 1, misses: 0 } : target === "realms" ? { cleared: false, choices: {} } : "unsafe", enumerable: true });
      });
      assert(rejected(text) !== undefined, "prototype-like keys are rejected by the actual save validator");
    }
  }
  assertEqual(({} as Record<string, unknown>).polluted, undefined, "untrusted map keys cannot pollute ordinary objects");
  assert(rejected(" ".repeat(MAX_JOURNEY_TRANSFER_BYTES + 1))?.message.includes("too large"), "oversized text is rejected before JSON parsing");
  const utf8 = fileWith(file => { file.state.profileName = "🌌".repeat(MAX_JOURNEY_TRANSFER_BYTES / 3); });
  assert(utf8.length < MAX_JOURNEY_TRANSFER_BYTES, "the multibyte fixture fits the character limit");
  assert(rejected(utf8)?.message.includes("too large"), "the actual UTF-8 limit also catches multibyte files");
  const huge = journey(); huge.profileName = "x".repeat(MAX_JOURNEY_TRANSFER_BYTES);
  let exportError: unknown;
  try { encodeJourneyTransfer(huge); } catch (error) { exportError = error; }
  assert(exportError instanceof InvalidSaveError, "an export too large for the importer is never offered as a valid journey file");
});

await suite("Journey transfer: suggested filenames are bounded ASCII names rather than paths", () => {
  for (const profileName of ["../../Wren: /save\\copy?", "CON", "Élodie 🌌", "🌌", "a".repeat(1000), ""]) {
    const name = journeyTransferFilename({ ...journey(), profileName });
    assert(/^[A-Za-z0-9-]+\.json$/.test(name), "filename contains only ordinary ASCII letters, digits, hyphens and its extension");
    assert(name.startsWith("portalwrights-journey-"), "a fixed prefix prevents reserved Windows names");
    assert(name.length <= 105, "long player names cannot produce an unbounded filename");
    assert(!/[\\/:]/.test(name), "a suggested filename never chooses a filesystem path");
  }
});
