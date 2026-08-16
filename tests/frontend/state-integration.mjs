import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

const { canonicalConfigToLegacy } = loadTypeScriptModule("frontend/src/state/config-adapter.ts");
const { mapOperationToActions } = loadTypeScriptModule("frontend/src/features/action-mapper.ts");
const { authoritativeTeamPause, runtimeStructureSignature } = loadTypeScriptModule("frontend/src/room-state.ts");
const { CountdownPresentationClock } = loadTypeScriptModule("frontend/src/state/countdown-clock.ts");
const { DEBUG_NOTIFICATION_EXPECTED_TEXT, DEBUG_NOTIFICATION_SCENARIOS } = loadTypeScriptModule("frontend/src/debug/notification-scenarios.ts");

const publicBoardConfig = {
  schemaVersion: 2,
  matchFormat: "ft2",
  timing: { preMatchRestSeconds: 0, interMapRestSeconds: 0 },
  map: { selectionPolicy: "fixed_map_order", fixedMapOrder: ["circuit_royal", "dorado"] },
};
const legacy = canonicalConfigToLegacy(publicBoardConfig, (value) => value, (value) => value);
assert.equal(Object.hasOwn(legacy, "heroPool"), false, "public board must preserve the catalog-derived hero pool");
assert.equal(legacy.fixedMapOrderText, "circuit_royal\ndorado");
assert.equal(legacy.stageLimits.preStartRestSeconds, 0);

const internalConfig = canonicalConfigToLegacy(
  { ...publicBoardConfig, heroPool: { tank: ["mauga"], damage: [], support: [] } },
  (value) => value,
  (value) => value,
);
assert.deepEqual(internalConfig.heroPool, { tank: ["mauga"], damage: [], support: [] });

const context = {
  isAdmin: true,
  awaitingAdminDecision: false,
  portalSide: null,
  interactiveRandom: null,
  lineup: {
    mapIndex: 0,
    ready: { left: false, right: false },
    values: {
      left: { "damage-1": "L1", "damage-2": "L2", tank: "L3", "support-1": "L4", "support-2": "L5" },
      right: { "damage-1": "R1", "damage-2": "R2", tank: "R3", "support-1": "R4", "support-2": "R5" },
    },
  },
  confirmedLineups: {},
  score: { values: { left: "3", right: "2" } },
  stableId: (value) => value.toLowerCase().replaceAll(" ", "_"),
};

assert.deepEqual(
  mapOperationToActions({ category: "lineup", action: "confirmed", details: { mapIndex: 0 } }, context),
  [
    { type: "lineup_submit", payload: { side: "left", lineup: { damage_1: "L1", damage_2: "L2", tank: "L3", support_1: "L4", support_2: "L5" } } },
    { type: "lineup_submit", payload: { side: "right", lineup: { damage_1: "R1", damage_2: "R2", tank: "R3", support_1: "R4", support_2: "R5" } } },
  ],
);

const runtimeBase = {
  phaseId: "phase:1",
  runtimeId: "runtime:1",
  totalTimeMs: 30_000,
  remainingTimeMs: 0,
  awaitingAdminDecision: false,
  pause: {
    global: { active: false, totalMs: 0 },
    scoreTeams: {
      left: { active: false, phaseTotalMs: 0, matchTotalMs: 0, count: 0 },
      right: { active: false, phaseTotalMs: 0, matchTotalMs: 0, count: 0 },
    },
  },
  presence: {},
  interactiveRandom: null,
  interactiveRandomSubmitted: null,
  lineupSubmissions: { left: null, right: null },
  scoreProposal: null,
  interactiveRandomResult: null,
  restSkip: { left: false, right: false },
  timedOut: false,
};
const retriedRuntime = { ...runtimeBase, runtimeId: "runtime:2", remainingTimeMs: 30_000 };
assert.notEqual(runtimeStructureSignature(runtimeBase), runtimeStructureSignature(retriedRuntime));
const clock = new CountdownPresentationClock();
clock.reset(runtimeBase, 0);
assert.equal(clock.reconcile(retriedRuntime, 100), "reset", "a new runtime must restart the countdown even in the same phase");
assert.equal(clock.snapshot(retriedRuntime, 100).remaining, 30);

const activePauseRuntime = {
  ...retriedRuntime,
  pause: {
    ...retriedRuntime.pause,
    scoreTeams: {
      ...retriedRuntime.pause.scoreTeams,
      left: { active: true, phaseTotalMs: 2_000, matchTotalMs: 7_000, count: 1 },
    },
  },
};
const activePause = authoritativeTeamPause(activePauseRuntime, "left");
assert.equal(activePause.active, true);
assert.equal(typeof activePause.startedAt, "number");
assert.equal(authoritativeTeamPause(activePauseRuntime, "left", activePause).startedAt, activePause.startedAt);
const globallyFrozenPause = authoritativeTeamPause({
  ...activePauseRuntime,
  pause: { ...activePauseRuntime.pause, global: { active: true, totalMs: 1_000 } },
}, "left", activePause);
assert.equal(globallyFrozenPause.startedAt, null);
assert.deepEqual(
  mapOperationToActions({ category: "ban", action: "hero_confirmed", details: { hero: "Mauga" } }, context),
  [{ type: "hero_ban_select", payload: { heroId: "mauga" } }],
);
assert.deepEqual(
  mapOperationToActions({ category: "score", action: "submitted", details: {} }, context),
  [{ type: "score_submit", payload: { score: { left: 3, right: 2 } } }],
);
assert.deepEqual(
  mapOperationToActions({ category: "admin", action: "series_winner", details: { winnerSide: "right" } }, context),
  [{ type: "timeout_resolve", payload: { resolution: "series_winner", winnerSide: "right" } }],
);

const dispatcherSource = fs.readFileSync("frontend/src/room-app.ts", "utf8");
assert.match(dispatcherSource, /dispatch\(operation: RoomOperation\): Promise<void>/);
assert.match(dispatcherSource, /return this\.queue;/);

const mainSource = fs.readFileSync("frontend/src/main.ts", "utf8");
assert.match(
  mainSource,
  /settingsState = settingsFromStoredConfig\(selectedPreset\.config\)/,
  "saved canonical presets must be projected back to editable numeric fields instead of falling through to UI defaults",
);
assert.match(mainSource, /class="duplicate-config-preset"/, "each preset card needs a direct duplicate action");
assert.match(mainSource, /async function duplicateGlobalPreset\(presetId: string\)/, "preset duplication needs an API-backed handler");
assert.match(
  mainSource,
  /resetBuiltinConfig"\)\?\.addEventListener[\s\S]*?legacyConfigToCanonical\(structuredClone\(defaultSettings\)/,
  "restoring the built-in configuration must send the canonical schema expected by the backend",
);
assert.match(mainSource, /await performApplyRoomPreset\(presetId\)/, "applying a room preset must execute instead of opening an unreachable confirmation state");
for (const functionName of ["confirmSelectedMap", "confirmSideSelection", "confirmBanSelection", "finalizeScoreSelection", "finalizeLineupSelection"]) {
  assert.match(mainSource, new RegExp(`async function ${functionName}\\b`), `${functionName} must await the authoritative transition`);
}
assert.ok(
  (mainSource.match(/await dispatchRoomViewOperation\(/g) ?? []).length >= 5,
  "authoritative phase transitions must finish before local fallback rendering",
);

const playerNoticeSource = fs.readFileSync("frontend/src/notice/player-select-notice.ts", "utf8");
assert.match(playerNoticeSource, /"LINEUPS_SUBMITTED"/);
assert.match(playerNoticeSource, /双方已提交阵容/);
const noticeCenterSource = fs.readFileSync("frontend/src/notice/notice.ts", "utf8");
assert.doesNotMatch(noticeCenterSource, /event\.actor\.role.*event\.eventType/);

assert.equal(DEBUG_NOTIFICATION_SCENARIOS.length, 50, "each supported notification variant needs a browser fixture");
assert.equal(
  new Set(DEBUG_NOTIFICATION_SCENARIOS.map(({ id }) => id)).size,
  DEBUG_NOTIFICATION_SCENARIOS.length,
  "notification fixture ids must be unique",
);
assert.deepEqual(
  Object.keys(DEBUG_NOTIFICATION_EXPECTED_TEXT).sort(),
  DEBUG_NOTIFICATION_SCENARIOS.map(({ id }) => id).sort(),
  "every browser notification fixture needs one exact full-sentence expectation",
);
for (const [id, expectedText] of Object.entries(DEBUG_NOTIFICATION_EXPECTED_TEXT)) {
  assert.ok(expectedText.length >= 6, `${id} needs a concrete full-sentence expectation`);
  assert.doesNotMatch(expectedText, /\u00b7|blue-team|red-team|LINEUPS_SUBMITTED|\bleft\b|\bright\b/);
}
const coveredNotificationTypes = new Set(DEBUG_NOTIFICATION_SCENARIOS.map(({ event }) => event.eventType));
for (const file of fs.readdirSync("frontend/src/notice").filter((name) => name.endsWith("-notice.ts"))) {
  const source = fs.readFileSync(`frontend/src/notice/${file}`, "utf8");
  const declaredTypes = [...source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]);
  for (const eventType of declaredTypes) {
    assert.ok(coveredNotificationTypes.has(eventType), `${file} event ${eventType} needs a browser fixture`);
  }
}
assert.doesNotMatch(
  JSON.stringify(DEBUG_NOTIFICATION_SCENARIOS.map(({ event }) => event.payload)),
  /\u00b7/,
  "notification fixture payloads must not contain the disallowed separator",
);

console.log("Frontend state integration contract passed.");
