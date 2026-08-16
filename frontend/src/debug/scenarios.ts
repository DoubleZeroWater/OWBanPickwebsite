import { stableId } from "../state/config-adapter";
import type {
  AuthoritativeMap,
  AuthoritativeRuntime,
  AuthoritativeStatus,
} from "../state/protocol";
import type { InteractiveRandomPurpose, MapCatalogState } from "../types";

export const DEBUG_SCENARIO_IDS = [
  "configuring",
  "default-config-direct",
  "ready-none",
  "waiting-ready",
  "ready-right",
  "ready-both",
  "team-name-empty",
  "team-name-readonly",
  "team-offline",
  "auto-start",
  "pre-start-rest",
  "pre-countdown-final-five",
  "pre-countdown-paused",
  "random-map-picker",
  "map-pick-first",
  "map-pick",
  "map-pick-strict-mode",
  "map-pick-timeout-admin",
  "map-pick-retry",
  "random-side-choice",
  "side-pick",
  "lineup-pick",
  "random-opening-ban",
  "ban-order",
  "ban-first",
  "ban-second",
  "score-entry",
  "score-team-pause",
  "score-entry-timeout-empty",
  "score-confirm",
  "post-map-rest",
  "completed",
  "global-pause",
  "timeout-admin",
] as const;

export type DebugScenarioId = typeof DEBUG_SCENARIO_IDS[number];

export interface DebugScenario {
  id: DebugScenarioId;
  label: string;
  group: "配置" | "队伍准备" | "赛前倒计时" | "选图" | "阵容与 Ban" | "赛果" | "特殊状态";
  status: AuthoritativeStatus;
  runtime: AuthoritativeRuntime;
}

const PHASE_SCENARIOS = {
  configuring: "configuring",
  waiting_ready: "waiting-ready",
  pre_start_rest: "pre-start-rest",
  interactive_random: "random-map-picker",
  map_pick: "map-pick",
  side_pick: "side-pick",
  lineup_pick: "lineup-pick",
  ban_order: "ban-order",
  ban_first: "ban-first",
  ban_second: "ban-second",
  score_entry: "score-entry",
  score_confirmation: "score-entry",
  post_map_rest: "post-map-rest",
  admin_decision: "timeout-admin",
  completed: "completed",
} satisfies Record<AuthoritativeStatus["phase"]["type"], DebugScenarioId>;

const RANDOM_PURPOSE_SCENARIOS = {
  map_picker: "random-map-picker",
  side_choice: "random-side-choice",
  opening_ban: "random-opening-ban",
} satisfies Record<InteractiveRandomPurpose, DebugScenarioId>;

// These exports make phase coverage observable to the lightweight structure test.
export const DEBUG_PHASE_SCENARIOS: Readonly<Record<AuthoritativeStatus["phase"]["type"], DebugScenarioId>> = PHASE_SCENARIOS;
export const DEBUG_RANDOM_PURPOSE_SCENARIOS: Readonly<Record<InteractiveRandomPurpose, DebugScenarioId>> = RANDOM_PURPOSE_SCENARIOS;

type ScenarioDefinition = {
  id: DebugScenarioId;
  label: string;
  group: DebugScenario["group"];
  phase: AuthoritativeStatus["phase"]["type"];
  mapIndex: number | null;
  actorSide: AuthoritativeStatus["phase"]["actorSide"];
  data?: Record<string, unknown>;
  scoreProposal?: AuthoritativeRuntime["scoreProposal"];
  globalPaused?: boolean;
  teamPauseSide?: "left" | "right";
  timedOut?: boolean;
  awaitingAdminDecision?: boolean;
  config?: {
    startWithDefaultConfig?: boolean;
    teamsCanEditOwnName?: boolean;
    teams?: Partial<Record<"left" | "right", string>>;
    mapSelectionMode?: "unique_map" | "unique_mode_until_cycle" | "first_mode_then_unique_mode" | "strict_mode_order";
    firstMapMode?: string;
    modeOrder?: string[];
    mapTimeoutPolicy?: "warn_extend_30" | "random_legal_map" | "forfeit_map" | "admin_decision";
  };
  presence?: {
    left?: Partial<AuthoritativeRuntime["presence"]["A"]>;
    right?: Partial<AuthoritativeRuntime["presence"]["B"]>;
  };
  totalTimeMs?: number;
  remainingTimeMs?: number;
};

const DEFINITIONS: readonly ScenarioDefinition[] = [
  {
    id: "configuring", label: "配置未确认", group: "配置", phase: "configuring", mapIndex: null, actorSide: null,
    config: { startWithDefaultConfig: false, teamsCanEditOwnName: false },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "default-config-direct", label: "默认配置直启", group: "配置", phase: "configuring", mapIndex: null, actorSide: null,
    config: { startWithDefaultConfig: true, teamsCanEditOwnName: true },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "ready-none", label: "无人准备 0/2", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "waiting-ready", label: "仅左队准备 1/2", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true },
    presence: { left: { ready: true, nameConfirmed: true }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "ready-right", label: "仅右队准备 1/2", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: true, nameConfirmed: true } },
  },
  {
    id: "ready-both", label: "双方已准备 2/2", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true },
    presence: { left: { ready: true, nameConfirmed: true }, right: { ready: true, nameConfirmed: true } },
  },
  {
    id: "team-name-empty", label: "队伍名称为空", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true, teams: { left: "", right: "" } },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "team-name-readonly", label: "队伍名称只读", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: false },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "team-offline", label: "一支队伍离线", group: "队伍准备", phase: "waiting_ready", mapIndex: null, actorSide: null,
    config: { teamsCanEditOwnName: true },
    presence: { left: { ready: true, nameConfirmed: true }, right: { connected: false, ready: false, nameConfirmed: false, lastSeenAt: 0 } },
  },
  {
    id: "auto-start", label: "自动开始模式", group: "队伍准备", phase: "configuring", mapIndex: null, actorSide: null,
    config: { startWithDefaultConfig: true, teamsCanEditOwnName: true },
    presence: { left: { ready: false, nameConfirmed: false }, right: { ready: false, nameConfirmed: false } },
  },
  {
    id: "pre-start-rest", label: "正常倒计时", group: "赛前倒计时", phase: "pre_start_rest", mapIndex: 0, actorSide: null,
    totalTimeMs: 45_000, remainingTimeMs: 31_000,
  },
  {
    id: "pre-countdown-final-five", label: "最后 5 秒", group: "赛前倒计时", phase: "pre_start_rest", mapIndex: 0, actorSide: null,
    totalTimeMs: 45_000, remainingTimeMs: 4_200,
  },
  {
    id: "pre-countdown-paused", label: "全局暂停", group: "赛前倒计时", phase: "pre_start_rest", mapIndex: 0, actorSide: null,
    totalTimeMs: 45_000, remainingTimeMs: 31_000, globalPaused: true,
  },
  { id: "random-map-picker", label: "选图方随机", group: "选图", phase: "interactive_random", mapIndex: 0, actorSide: "both", data: { purpose: "map_picker" } },
  { id: "map-pick-first", label: "首图选择", group: "选图", phase: "map_pick", mapIndex: 0, actorSide: "right", data: { allowedModeIds: ["control"] } },
  { id: "map-pick", label: "后续选图", group: "选图", phase: "map_pick", mapIndex: 1, actorSide: "right", data: { allowedModeIds: ["escort", "hybrid", "push"] } },
  { id: "map-pick-strict-mode", label: "严格模式顺序", group: "选图", phase: "map_pick", mapIndex: 1, actorSide: "left", data: { allowedModeIds: ["push"] }, config: { mapSelectionMode: "strict_mode_order", modeOrder: ["control", "push", "hybrid", "escort", "flashpoint"] } },
  { id: "map-pick-timeout-admin", label: "选图超时待裁定", group: "选图", phase: "map_pick", mapIndex: 0, actorSide: "right", timedOut: true, awaitingAdminDecision: true, totalTimeMs: 45_000, remainingTimeMs: 0, config: { mapTimeoutPolicy: "admin_decision" } },
  { id: "map-pick-retry", label: "超时后重选", group: "选图", phase: "map_pick", mapIndex: 0, actorSide: "right", timedOut: true, totalTimeMs: 30_000, remainingTimeMs: 24_000, config: { mapTimeoutPolicy: "warn_extend_30" } },
  { id: "random-side-choice", label: "选边方随机", group: "选图", phase: "interactive_random", mapIndex: 1, actorSide: "both", data: { purpose: "side_choice" } },
  { id: "side-pick", label: "选边", group: "选图", phase: "side_pick", mapIndex: 1, actorSide: "right", data: { chooserSide: "right", choiceKind: "color" } },
  { id: "lineup-pick", label: "上人", group: "阵容与 Ban", phase: "lineup_pick", mapIndex: 1, actorSide: "both" },
  { id: "random-opening-ban", label: "先 Ban 方随机", group: "阵容与 Ban", phase: "interactive_random", mapIndex: 1, actorSide: "both", data: { purpose: "opening_ban" } },
  { id: "ban-order", label: "Ban 顺序", group: "阵容与 Ban", phase: "ban_order", mapIndex: 1, actorSide: "right", data: { chooserSide: "right" } },
  { id: "ban-first", label: "首 Ban", group: "阵容与 Ban", phase: "ban_first", mapIndex: 1, actorSide: "right", data: { firstBanSide: "right" } },
  { id: "ban-second", label: "次 Ban", group: "阵容与 Ban", phase: "ban_second", mapIndex: 1, actorSide: "left", data: { firstBanSide: "right" } },
  { id: "score-entry", label: "比分录入", group: "赛果", phase: "score_entry", mapIndex: 1, actorSide: "both" },
  { id: "score-team-pause", label: "队伍暂停计时", group: "赛果", phase: "score_entry", mapIndex: 1, actorSide: "both", teamPauseSide: "left" },
  { id: "score-entry-timeout-empty", label: "比分未填写超时", group: "赛果", phase: "score_entry", mapIndex: 1, actorSide: "both", timedOut: true, awaitingAdminDecision: true, totalTimeMs: 30_000, remainingTimeMs: 0 },
  { id: "score-confirm", label: "比分确认", group: "赛果", phase: "score_entry", mapIndex: 1, actorSide: "both", scoreProposal: { submittedBy: "left", score: { left: 3, right: 2 }, rejectedBy: null } },
  { id: "post-map-rest", label: "局间休息", group: "赛果", phase: "post_map_rest", mapIndex: 1, actorSide: "both" },
  { id: "completed", label: "完赛", group: "赛果", phase: "completed", mapIndex: null, actorSide: null, data: { winnerSide: "left" } },
  { id: "global-pause", label: "全局暂停", group: "特殊状态", phase: "map_pick", mapIndex: 1, actorSide: "right", globalPaused: true },
  { id: "timeout-admin", label: "超时待裁定", group: "特殊状态", phase: "ban_first", mapIndex: 1, actorSide: "right", data: { firstBanSide: "right" }, timedOut: true, awaitingAdminDecision: true },
] as const;

export function createDebugScenarios(
  catalog: MapCatalogState,
  canonicalConfig: Record<string, unknown>,
): DebugScenario[] {
  return DEFINITIONS.map((definition, index) => {
    const phaseId = `debug:${definition.id}`;
    const statusHash = `debug-status:${definition.id}`;
    const status = createStatus(catalog, canonicalConfig, definition, index + 1, phaseId, statusHash);
    const runtime = createRuntime(definition, status, phaseId, statusHash);
    return { id: definition.id, label: definition.label, group: definition.group, status, runtime };
  });
}

function createStatus(
  catalog: MapCatalogState,
  canonicalConfig: Record<string, unknown>,
  definition: ScenarioDefinition,
  revision: number,
  phaseId: string,
  statusHash: string,
): AuthoritativeStatus {
  const scenarioConfig = structuredClone(canonicalConfig);
  if (definition.config) {
    const baseTeams = scenarioConfig.teams as Record<"left" | "right", string> | undefined;
    Object.assign(scenarioConfig, definition.config, {
      teams: definition.config.teams
        ? { ...(baseTeams ?? { left: "CR", right: "FAL" }), ...definition.config.teams }
        : baseTeams,
    });
  }
  const scenarioTeams = scenarioConfig.teams as Record<"left" | "right", string> | undefined;
  const maps = createMaps(catalog, definition);
  const completedMaps = maps.filter((map) => map.status === "completed");
  const leftWins = completedMaps.filter((map) => map.winnerSide === "left").length;
  const rightWins = completedMaps.filter((map) => map.winnerSide === "right").length;
  const completed = definition.phase === "completed";
  return {
    schemaVersion: 2,
    roomId: "debug",
    epoch: 1,
    revision,
    hash: statusHash,
    catalogHash: catalog.catalogHash,
    lifecycle: completed ? "completed" : ["configuring", "waiting_ready"].includes(definition.phase) ? "preparing" : "running",
    config: scenarioConfig,
    match: {
      teams: {
        left: { id: "debug-left", name: scenarioTeams?.left ?? "CR", seed: 1, seriesScore: leftWins },
        right: { id: "debug-right", name: scenarioTeams?.right ?? "FAL", seed: 2, seriesScore: rightWins },
      },
      decisions: {
        firstMapPickerSide: "left",
        firstMapSidePickerSide: "left",
        openingBanSide: "right",
      },
      winnerSide: completed ? "left" : null,
      maps,
    },
    phase: {
      phaseId,
      type: definition.phase,
      mapIndex: definition.mapIndex,
      actorSide: definition.actorSide,
      data: { ...(definition.data ?? {}) },
    },
  };
}

function createRuntime(
  definition: ScenarioDefinition,
  status: AuthoritativeStatus,
  phaseId: string,
  statusHash: string,
): AuthoritativeRuntime {
  const random = definition.phase === "interactive_random" ? { left: 0 as const, right: null } : null;
  const lineupPhaseReached = [
    "lineup_pick", "interactive_random", "ban_order", "ban_first", "ban_second",
    "score_entry", "post_map_rest", "completed",
  ].includes(definition.phase);
  const lineups = createLineups();
  const now = Date.now();
  const defaultTeamReady = !["configuring", "waiting_ready"].includes(definition.phase);
  const leftPresence = {
    connected: true,
    ready: defaultTeamReady,
    nameConfirmed: defaultTeamReady,
    lastSeenAt: now,
    ...(definition.presence?.left ?? {}),
  };
  const rightPresence = {
    connected: true,
    ready: defaultTeamReady,
    nameConfirmed: defaultTeamReady,
    lastSeenAt: now,
    ...(definition.presence?.right ?? {}),
  };
  return {
    baseStatusRevision: status.revision,
    baseStatusHash: statusHash,
    phaseId,
    runtimeId: `debug-runtime-${definition.id}`,
    runtimeSeq: 1,
    totalTimeMs: definition.totalTimeMs ?? 45_000,
    remainingTimeMs: definition.remainingTimeMs ?? 31_000,
    pause: {
      global: { active: Boolean(definition.globalPaused), totalMs: definition.globalPaused ? 92_000 : 0 },
      scoreTeams: {
        left: { active: definition.teamPauseSide === "left", phaseTotalMs: 12_000, matchTotalMs: 24_000, count: 1 },
        right: { active: definition.teamPauseSide === "right", phaseTotalMs: 0, matchTotalMs: 8_000, count: 1 },
      },
    },
    presence: {
      A: leftPresence,
      B: rightPresence,
      C: { connected: true, ready: true, nameConfirmed: true, lastSeenAt: now },
      D: { connected: true, ready: true, nameConfirmed: true, lastSeenAt: now },
    },
    interactiveRandom: random,
    interactiveRandomResult: null,
    lineupSubmissions: definition.phase === "lineup_pick"
      ? { left: lineups.left, right: null }
      : lineupPhaseReached
        ? { left: lineups.left, right: lineups.right }
        : { left: null, right: null },
    scoreProposal: definition.scoreProposal ?? null,
    restSkip: { left: definition.phase === "post_map_rest", right: false },
    timedOut: Boolean(definition.timedOut),
    awaitingAdminDecision: Boolean(definition.awaitingAdminDecision),
  };
}

function createMaps(catalog: MapCatalogState, definition: ScenarioDefinition): AuthoritativeMap[] {
  const refs = Object.entries(catalog.maps).flatMap(([mode, maps]) => maps.map((map) => ({
    mapId: stableId(map.nameEn),
    modeId: stableId(mode),
  })));
  const fallback = [
    { mapId: "lijiang_tower", modeId: "control" },
    { mapId: "dorado", modeId: "escort" },
    { mapId: "kings_row", modeId: "hybrid" },
  ];
  const mapRefs = refs.length >= 3 ? refs : fallback;
  const beforeMatch = ["configuring", "waiting_ready", "pre_start_rest"].includes(definition.phase);
  const targetSelected = !beforeMatch && !["map_pick"].includes(definition.phase)
    && !(definition.phase === "interactive_random" && definition.data?.purpose === "map_picker")
    && definition.id !== "global-pause";
  const lineups = createLineups();
  const heroIds = catalog.heroes.slice(0, 3).map((hero) => stableId(hero.nameEn));
  const firstHero = heroIds[0] ?? "ana";
  const secondHero = heroIds[1] ?? "tracer";
  const thirdHero = heroIds[2] ?? "mercy";

  return Array.from({ length: 7 }, (_, index): AuthoritativeMap => {
    if (!beforeMatch && index === 0 && definition.mapIndex !== 0) {
      const ref = mapRefs[0] ?? fallback[0];
      return {
        ...emptyMap(index),
        status: "completed",
        mapId: ref.mapId,
        modeId: ref.modeId,
        pickerSide: "left",
        sideChoice: { kind: "color", chooserSide: "left", selectedSide: "left" },
        lineups,
        bans: { firstBanSide: "left", leftHeroId: firstHero, rightHeroId: secondHero },
        score: { left: 2, right: 1 },
        winnerSide: "left",
      };
    }

    if (index === 1 && targetSelected) {
      const ref = mapRefs[1] ?? fallback[1];
      const afterLineup = ["ban_order", "ban_first", "ban_second", "score_entry", "post_map_rest", "completed"].includes(definition.phase)
        || (definition.phase === "interactive_random" && definition.data?.purpose === "opening_ban");
      const firstBanDone = definition.phase === "ban_second" || ["score_entry", "post_map_rest", "completed"].includes(definition.phase);
      const secondBanDone = ["score_entry", "post_map_rest", "completed"].includes(definition.phase);
      const mapCompleted = definition.phase === "post_map_rest" || definition.phase === "completed";
      return {
        ...emptyMap(index),
        status: mapCompleted ? "completed" : "selected",
        mapId: ref.mapId,
        modeId: ref.modeId,
        pickerSide: "right",
        sideChoice: ["side_pick"].includes(definition.phase)
          ? null
          : { kind: "color", chooserSide: "right", selectedSide: "right" },
        lineups: afterLineup ? lineups : null,
        bans: {
          firstBanSide: afterLineup ? "right" : null,
          leftHeroId: secondBanDone ? secondHero : null,
          rightHeroId: firstBanDone ? thirdHero : null,
        },
        score: mapCompleted ? { left: 3, right: 2 } : null,
        winnerSide: mapCompleted ? "left" : null,
      };
    }

    if (definition.phase === "completed" && index === 2) {
      const ref = mapRefs[2] ?? fallback[2];
      return {
        ...emptyMap(index),
        status: "completed",
        mapId: ref.mapId,
        modeId: ref.modeId,
        pickerSide: "right",
        sideChoice: { kind: "attack_defense", chooserSide: "left", selectedSide: "left" },
        lineups,
        bans: { firstBanSide: "left", leftHeroId: secondHero, rightHeroId: firstHero },
        score: { left: 1, right: 0 },
        winnerSide: "left",
      };
    }

    return emptyMap(index);
  });
}

function emptyMap(index: number): AuthoritativeMap {
  return {
    index,
    status: "pending",
    mapId: null,
    modeId: null,
    pickerSide: null,
    sideChoice: null,
    lineups: null,
    bans: { firstBanSide: null, leftHeroId: null, rightHeroId: null },
    score: null,
    resultType: null,
    winnerSide: null,
    forfeitSide: null,
    forfeitReason: null,
  };
}

function createLineups(): Record<"left" | "right", Record<string, string>> {
  return {
    left: { tank_1: "Blue Tank", damage_1: "Blue DPS 1", damage_2: "Blue DPS 2", support_1: "Blue Support 1", support_2: "Blue Support 2" },
    right: { tank_1: "Red Tank", damage_1: "Red DPS 1", damage_2: "Red DPS 2", support_1: "Red Support 1", support_2: "Red Support 2" },
  };
}
