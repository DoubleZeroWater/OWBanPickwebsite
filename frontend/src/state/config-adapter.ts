type Dictionary = Record<string, unknown>;

const asObject = (value: unknown): Dictionary => value && typeof value === "object" ? value as Dictionary : {};

export function canonicalConfigToLegacy(
  config: Dictionary,
  resolveMap: (id: string) => string,
  resolveMode: (id: string) => string,
): Dictionary {
  const map = asObject(config.map);
  const timing = asObject(config.timing);
  const sideChoice = asObject(config.sideChoice);
  const lineup = asObject(config.lineup);
  const ban = asObject(config.ban);
  const score = asObject(config.score);
  const pause = asObject(config.pause);
  const rollback = asObject(config.rollback);
  const mapPoolSource = (map.mapPool ?? config.mapPool ?? {}) as Record<string, string[]>;
  const mapPool = Object.fromEntries(Object.entries(mapPoolSource).map(
    ([mode, maps]) => [resolveMode(mode), maps.map(resolveMap)],
  ));
  const fixedOrder = ((map.fixedMapOrder ?? config.fixedMapOrder ?? []) as string[]).map(resolveMap);
  const rosters = (lineup.presetRosters ?? config.presetRosters) as Record<string, string[]> | undefined;
  const initialPriority = String(map.initialPriorityPolicy ?? config.firstMapPickerPolicy ?? "interactive_random");
  return {
    matchName: config.matchName,
    teams: config.teamNames ?? config.teams,
    matchFormat: config.matchFormat,
    startWithDefaultConfig: (config.startPolicy ?? "manual") === "auto_when_both_ready",
    teamsCanEditOwnName: config.teamsCanEditOwnName ?? false,
    stageLimits: {
      preStartRestSeconds: timing.preMatchRestSeconds ?? asObject(config.stageLimits).preStartRestSeconds,
      interactiveRandomSeconds: timing.interactiveRandomSeconds ?? 30,
      postMatchRestSeconds: timing.interMapRestSeconds ?? asObject(config.stageLimits).postMatchRestSeconds,
      mapSelectSeconds: timing.mapPickSeconds ?? asObject(config.stageLimits).mapSelectSeconds,
      sidePickSeconds: timing.sidePickSeconds ?? 30,
      playerSelectSeconds: timing.lineupSubmitSeconds ?? asObject(config.stageLimits).playerSelectSeconds,
      firstBanChoiceSeconds: timing.banOrderSeconds ?? asObject(config.stageLimits).firstBanChoiceSeconds,
      firstBanActionSeconds: timing.firstBanSeconds ?? asObject(config.stageLimits).firstBanActionSeconds,
      secondBanActionSeconds: timing.secondBanSeconds ?? asObject(config.stageLimits).secondBanActionSeconds,
      scoreConfirmSeconds: timing.scoreConfirmationSeconds ?? asObject(config.stageLimits).scoreConfirmSeconds,
      timeoutExtensionSeconds: timing.timeoutExtensionSeconds ?? 30,
    },
    mapPool,
    // The canonical public board intentionally omits the internal hero pool.
    // Preserve the catalog-derived frontend default instead of replacing it
    // with an empty pool whenever that private field is absent.
    ...(config.heroPool ? { heroPool: config.heroPool } : {}),
    mapSelectionMode: map.selectionPolicy ?? config.mapSelectionMode,
    firstMapMode: resolveMode(String(map.firstMapMode ?? config.firstMapMode ?? "")),
    modeOrder: ((map.modeOrder ?? config.modeOrder ?? []) as string[]).map(resolveMode),
    fixedMapOrderText: fixedOrder.join("\n"),
    fixedFirstMapEnabled: map.fixedFirstMapEnabled ?? config.fixedFirstMapEnabled ?? false,
    fixedFirstMapName: resolveMap(String(map.fixedFirstMapId ?? config.fixedFirstMapId ?? "")),
    initialPriorityPolicy: initialPriority === "random" ? "system_random" : initialPriority,
    subsequentPriorityPolicy: map.subsequentPriorityPolicy ?? "previous_loser",
    mapPickTimeoutPolicy: map.mapPickTimeoutPolicy ?? "retry_after_delay",
    interactiveRandomMissingInputPolicy: map.interactiveRandomMissingInputPolicy ?? "use_zero",
    firstMapSideChoiceEnabled: sideChoice.firstMapSideChoiceEnabled ?? false,
    symmetricSideChoiceEnabled: sideChoice.symmetricSideChoiceEnabled ?? config.symmetricSideChoiceEnabled ?? false,
    sideChooserRelation: sideChoice.chooserRelation ?? "priority",
    sideTimeoutPolicy: sideChoice.timeoutPolicy ?? "chooser_blue_defense",
    rosterMode: lineup.mode ?? config.rosterMode ?? "free_input",
    presetRosterText: [`left ${(rosters?.left ?? []).join(",")}`, `right ${(rosters?.right ?? []).join(",")}`].join("\n"),
    lineupTimeoutPolicy: lineup.timeoutPolicy ?? config.lineupTimeoutPolicy ?? "retry_after_delay",
    banEnabled: ban.enabled ?? config.banEnabled ?? true,
    banAdvantageRelation: ban.advantageRelation ?? "priority",
    banOrderPolicy: ban.orderPolicy ?? "advantage_chooses",
    banOrderTimeoutPolicy: ban.orderTimeoutPolicy ?? "advantage_first",
    banActionTimeoutPolicy: ban.actionTimeoutPolicy ?? "retry_after_delay",
    scoreConfirmationTimeoutPolicy: score.confirmationTimeoutPolicy ?? "auto_confirm",
    globalPauseEnabled: pause.globalPauseEnabled ?? true,
    teamPauseEnabled: pause.teamPauseEnabled ?? true,
    teamPauseMaxCountPerMap: pause.teamPauseMaxCountPerMap ?? null,
    teamPauseMaxSingleSeconds: pause.teamPauseMaxSingleSeconds ?? null,
    teamPauseMaxTotalSeconds: pause.teamPauseMaxTotalSeconds ?? null,
    rollbackEnabled: rollback.enabled ?? true,
    allowRollbackAfterCompletion: rollback.allowAfterCompletion ?? false,
    // Compatibility aliases for local legacy rendering paths.
    firstMapPickerPolicy: initialPriority === "system_random" ? "random" : initialPriority,
    mapPickerPolicy: "loser_choose",
    mapTimeoutPolicy: map.mapPickTimeoutPolicy === "retry_after_delay" ? "warn_extend_30" : map.mapPickTimeoutPolicy,
    firstSideChoicePolicy: sideChoice.firstMapSideChoiceEnabled ? "map_picker" : "none",
    subsequentSideChoicePolicy: map.subsequentPriorityPolicy ?? "previous_loser",
    firstBanPolicy: ban.orderPolicy === "advantage_must_first" ? "loser_must_first" : "allow_loser_choose",
    openingSidePolicy: "follow_map_picker",
    banTimeoutPolicy: ban.actionTimeoutPolicy === "retry_after_delay" ? "warn_extend_30" : ban.actionTimeoutPolicy === "random_legal_hero" ? "random_legal_ban" : ban.actionTimeoutPolicy,
    scoreReportMode: "team_submit_opponent_confirm",
  };
}

export function legacyConfigToCanonical(
  settings: Dictionary,
  mapId: (name: string) => string,
  modeId: (name: string) => string,
): Dictionary {
  const mapPool = Object.fromEntries(Object.entries(settings.mapPool as Record<string, string[]> ?? {}).map(
    ([mode, maps]) => [modeId(mode), maps.map(mapId)],
  ));
  const rosterLines = String(settings.presetRosterText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rosters = { left: [] as string[], right: [] as string[] };
  for (const line of rosterLines) {
    const match = line.match(/^(left|right|队伍1|队伍2|蓝色方|红色方)\s*[:：]?\s*(.*)$/i);
    const side = match && ["right", "队伍2", "红色方"].includes(match[1]) ? "right" : "left";
    const values = (match?.[2] ?? line).split(",").map((item) => item.trim()).filter(Boolean);
    rosters[side].push(...values);
  }
  const limits = asObject(settings.stageLimits);
  const initialPriority = String(settings.initialPriorityPolicy ?? settings.firstMapPickerPolicy ?? "interactive_random");
  return {
    schemaVersion: 2,
    matchName: settings.matchName,
    teamNames: settings.teams,
    matchFormat: settings.matchFormat,
    startPolicy: settings.startWithDefaultConfig ? "auto_when_both_ready" : "manual",
    teamsCanEditOwnName: Boolean(settings.teamsCanEditOwnName),
    timing: {
      preMatchRestSeconds: limits.preStartRestSeconds,
      interMapRestSeconds: limits.postMatchRestSeconds,
      interactiveRandomSeconds: limits.interactiveRandomSeconds,
      mapPickSeconds: limits.mapSelectSeconds,
      sidePickSeconds: limits.sidePickSeconds,
      lineupSubmitSeconds: limits.playerSelectSeconds,
      banOrderSeconds: limits.firstBanChoiceSeconds,
      firstBanSeconds: limits.firstBanActionSeconds,
      secondBanSeconds: limits.secondBanActionSeconds,
      scoreConfirmationSeconds: limits.scoreConfirmSeconds,
      timeoutExtensionSeconds: limits.timeoutExtensionSeconds,
    },
    map: {
      mapPool,
      selectionPolicy: settings.mapSelectionMode,
      firstMapMode: modeId(String(settings.firstMapMode ?? "")),
      modeOrder: ((settings.modeOrder as string[] | undefined) ?? []).map(modeId),
      fixedMapOrder: String(settings.fixedMapOrderText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(mapId),
      fixedFirstMapEnabled: Boolean(settings.fixedFirstMapEnabled),
      fixedFirstMapId: settings.fixedFirstMapEnabled ? mapId(String(settings.fixedFirstMapName ?? "")) : null,
      initialPriorityPolicy: initialPriority === "random" ? "system_random" : initialPriority,
      subsequentPriorityPolicy: settings.subsequentPriorityPolicy ?? settings.subsequentSideChoicePolicy ?? "previous_loser",
      mapPickTimeoutPolicy: settings.mapPickTimeoutPolicy ?? (settings.mapTimeoutPolicy === "warn_extend_30" ? "retry_after_delay" : settings.mapTimeoutPolicy),
      interactiveRandomMissingInputPolicy: settings.interactiveRandomMissingInputPolicy ?? "use_zero",
    },
    sideChoice: {
      firstMapSideChoiceEnabled: Boolean(settings.firstMapSideChoiceEnabled),
      symmetricSideChoiceEnabled: Boolean(settings.symmetricSideChoiceEnabled),
      chooserRelation: settings.sideChooserRelation ?? "priority",
      timeoutPolicy: settings.sideTimeoutPolicy ?? "chooser_blue_defense",
    },
    lineup: { mode: settings.rosterMode, presetRosters: rosters, timeoutPolicy: settings.lineupTimeoutPolicy },
    ban: {
      enabled: Boolean(settings.banEnabled),
      advantageRelation: settings.banAdvantageRelation ?? "priority",
      orderPolicy: settings.banOrderPolicy ?? "advantage_chooses",
      orderTimeoutPolicy: settings.banOrderTimeoutPolicy ?? "advantage_first",
      actionTimeoutPolicy: settings.banActionTimeoutPolicy ?? "retry_after_delay",
    },
    score: { confirmationTimeoutPolicy: settings.scoreConfirmationTimeoutPolicy ?? "auto_confirm" },
    pause: {
      globalPauseEnabled: settings.globalPauseEnabled ?? true,
      teamPauseEnabled: settings.teamPauseEnabled ?? true,
      teamPauseMaxCountPerMap: settings.teamPauseMaxCountPerMap ?? null,
      teamPauseMaxSingleSeconds: settings.teamPauseMaxSingleSeconds ?? null,
      teamPauseMaxTotalSeconds: settings.teamPauseMaxTotalSeconds ?? null,
    },
    rollback: {
      enabled: settings.rollbackEnabled ?? true,
      defaultCheckpoints: ["pre_countdown", "map_pick", "lineup", "ban_order", "first_ban", "second_ban", "score_entry"],
      mapOverrides: {},
      allowAfterCompletion: settings.allowRollbackAfterCompletion ?? false,
    },
  };
}

export function stableId(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
