type Dictionary = Record<string, unknown>;

export function canonicalConfigToLegacy(
  config: Dictionary,
  resolveMap: (id: string) => string,
  resolveMode: (id: string) => string,
): Dictionary {
  const mapPool = Object.fromEntries(Object.entries(config.mapPool as Record<string, string[]> ?? {}).map(
    ([mode, maps]) => [resolveMode(mode), maps.map(resolveMap)],
  ));
  const fixedOrder = ((config.fixedMapOrder as string[] | undefined) ?? []).map(resolveMap);
  const rosters = config.presetRosters as Record<string, string[]> | undefined;
  return {
    matchName: config.matchName,
    teams: config.teams,
    matchFormat: config.matchFormat,
    startWithDefaultConfig: config.startWithDefaultConfig,
    teamsCanEditOwnName: config.teamsCanEditOwnName,
    stageLimits: config.stageLimits,
    mapPool,
    heroPool: config.heroPool,
    mapSelectionMode: config.mapSelectionMode,
    firstMapMode: resolveMode(String(config.firstMapMode ?? "")),
    modeOrder: ((config.modeOrder as string[] | undefined) ?? []).map(resolveMode),
    fixedMapOrderText: fixedOrder.join("\n"),
    fixedFirstMapEnabled: config.fixedFirstMapEnabled,
    fixedFirstMapName: resolveMap(String(config.fixedFirstMapId ?? "")),
    firstMapPickerPolicy: config.firstMapPickerPolicy,
    firstSideChoicePolicy: config.firstSideChoicePolicy,
    mapPickerPolicy: config.mapPickerPolicy,
    mapTimeoutPolicy: config.mapTimeoutPolicy,
    symmetricSideChoiceEnabled: config.symmetricSideChoiceEnabled,
    subsequentSideChoicePolicy: config.subsequentSideChoicePolicy,
    rosterMode: config.rosterMode,
    presetRosterText: [
      `left ${(rosters?.left ?? []).join(",")}`,
      `right ${(rosters?.right ?? []).join(",")}`,
    ].join("\n"),
    lineupTimeoutPolicy: config.lineupTimeoutPolicy,
    banEnabled: config.banEnabled,
    firstBanPolicy: config.firstBanPolicy,
    openingSidePolicy: config.openingSidePolicy,
    banTimeoutPolicy: config.banTimeoutPolicy,
    scoreReportMode: config.scoreReportMode,
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
  const rosterText = String(settings.presetRosterText ?? "");
  const rosterLines = rosterText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rosterValues = rosterLines.flatMap((line) => line.replace(/^(left|right)\s+/i, "").split(",").map((item) => item.trim()).filter(Boolean));
  return {
    schemaVersion: 1,
    matchName: settings.matchName,
    teams: settings.teams,
    matchFormat: settings.matchFormat,
    drawMapReserve: 2,
    startWithDefaultConfig: settings.startWithDefaultConfig,
    teamsCanEditOwnName: settings.teamsCanEditOwnName,
    stageLimits: settings.stageLimits,
    mapPool,
    mapSelectionMode: settings.mapSelectionMode,
    firstMapMode: modeId(String(settings.firstMapMode ?? "")),
    modeOrder: ((settings.modeOrder as string[] | undefined) ?? []).map(modeId),
    fixedMapOrder: String(settings.fixedMapOrderText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(mapId),
    fixedFirstMapEnabled: settings.fixedFirstMapEnabled,
    fixedFirstMapId: mapId(String(settings.fixedFirstMapName ?? "")),
    firstMapPickerPolicy: settings.firstMapPickerPolicy,
    firstSideChoicePolicy: settings.firstSideChoicePolicy,
    mapPickerPolicy: settings.mapPickerPolicy,
    mapTimeoutPolicy: settings.mapTimeoutPolicy,
    symmetricSideChoiceEnabled: settings.symmetricSideChoiceEnabled,
    subsequentSideChoicePolicy: settings.subsequentSideChoicePolicy,
    heroPool: settings.heroPool ?? { tank: [], damage: [], support: [] },
    rosterMode: settings.rosterMode,
    lineupSlots: [
      { id: "damage_1", role: "damage", label: "输出 1" },
      { id: "damage_2", role: "damage", label: "输出 2" },
      { id: "tank_1", role: "tank", label: "重装" },
      { id: "support_1", role: "support", label: "支援 1" },
      { id: "support_2", role: "support", label: "支援 2" },
    ],
    presetRosters: { left: rosterValues, right: rosterValues },
    lineupTimeoutPolicy: settings.lineupTimeoutPolicy,
    banEnabled: settings.banEnabled,
    bansPerSide: 1,
    firstBanPolicy: settings.firstBanPolicy,
    openingSidePolicy: settings.openingSidePolicy,
    banTimeoutPolicy: settings.banTimeoutPolicy,
    scoreReportMode: settings.scoreReportMode,
    scoreTimeoutPolicy: "auto_confirm_submitted",
    history: { recordPolicy: "major_status_revision", rollbackPolicy: "any_recorded_revision" },
  };
}

export function stableId(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
