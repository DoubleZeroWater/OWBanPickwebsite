import type {
  FirstSideChoicePolicy,
  MapSelectionMode,
  MatchFormat,
  PlayerInputMode,
  SettingsState,
  SidePolicy,
  SubsequentSideChoicePolicy,
} from "./types";

export function createDefaultCheckpoints(stageCount: number): SettingsState["checkpoints"] {
  return Array.from({ length: stageCount }, (_, index) => ({
    preCountdown: { enabled: index > 0, label: "开始前倒计时" },
    mapPick: { enabled: true, label: "选择地图" },
    lineupPick: { enabled: true, label: "选择上场成员" },
    firstSecondBanChoice: { enabled: true, label: "选择禁用顺序" },
    firstBan: { enabled: true, label: "先手禁用" },
    secondBan: { enabled: true, label: "后手禁用" },
    scorePick: { enabled: true, label: "比分录入" },
  }));
}

export function getRosterModeLabel(mode: PlayerInputMode): string {
  return { free_input: "自由输入成员", preset_only: "仅可选择预设成员", skip: "跳过成员选择" }[mode];
}

export function getMapSelectionModeLabel(mode: MapSelectionMode): string {
  return {
    unique_map: "任意选择，已选择地图不可重复选择",
    unique_mode_until_cycle: "首图任意模式，未选完所有模式前不可重复选择",
    first_mode_then_unique_mode: "首图指定模式，未选完所有模式前不可重复选择",
    strict_mode_order: "指定模式顺序，已选择地图不可重复选择",
    fixed_map_order: "固定地图顺序",
  }[mode];
}

export function getStageCountForMatchFormat(format: MatchFormat): number {
  return ({ ft2: 5, ft3: 7, ft4: 9 } satisfies Record<MatchFormat, number>)[format];
}

export function getMatchFormatLabel(format: MatchFormat): string {
  return ({ ft2: "FT2", ft3: "FT3", ft4: "FT4" } satisfies Record<MatchFormat, string>)[format];
}

export function resizeCheckpoints(
  checkpoints: SettingsState["checkpoints"],
  stageCount: number,
): SettingsState["checkpoints"] {
  const defaults = createDefaultCheckpoints(stageCount);
  return Array.from({ length: stageCount }, (_, index) => ({
    ...defaults[index],
    ...(checkpoints[index] ?? {}),
  }));
}

/** Merges persisted settings and preserves compatibility with backend legacy presets. */
export function mergeSettings(base: SettingsState, override: unknown): SettingsState {
  if (!override || typeof override !== "object") return structuredClone(base);

  const partial = override as Partial<SettingsState>;
  const merged = structuredClone(base);
  const matchFormat = partial.matchFormat ?? merged.matchFormat;
  const stageCount = getStageCountForMatchFormat(matchFormat);
  const checkpointOverrides = Array.isArray(partial.checkpoints) ? partial.checkpoints : [];
  const legacyFirstBanPolicy = (partial as { firstBanPolicy?: string }).firstBanPolicy;
  const legacySideChoicePolicy = (partial as { sideChoicePickerPolicy?: string }).sideChoicePickerPolicy;
  const normalizePolicy = (value: unknown, fallback: SidePolicy): SidePolicy => {
    if (value === "red") return "right";
    if (value === "blue") return "left";
    return (["random", "interactive_random", "left", "right"] as unknown[]).includes(value)
      ? value as SidePolicy
      : fallback;
  };

  return {
    ...merged,
    ...partial,
    matchFormat,
    stageCount,
    initialPriorityPolicy: partial.initialPriorityPolicy
      ?? (partial.firstMapPickerPolicy === "random" ? "system_random" : partial.firstMapPickerPolicy)
      ?? merged.initialPriorityPolicy,
    subsequentPriorityPolicy: partial.subsequentPriorityPolicy
      ?? partial.subsequentSideChoicePolicy
      ?? merged.subsequentPriorityPolicy,
    mapPickTimeoutPolicy: partial.mapPickTimeoutPolicy
      ?? (partial.mapTimeoutPolicy === "warn_extend_30" ? "retry_after_delay" : partial.mapTimeoutPolicy)
      ?? merged.mapPickTimeoutPolicy,
    firstMapSideChoiceEnabled: partial.firstMapSideChoiceEnabled
      ?? (partial.firstSideChoicePolicy != null && partial.firstSideChoicePolicy !== "none")
      ?? merged.firstMapSideChoiceEnabled,
    banOrderPolicy: partial.banOrderPolicy
      ?? (partial.firstBanPolicy === "loser_must_first" ? "advantage_must_first" : "advantage_chooses"),
    banActionTimeoutPolicy: partial.banActionTimeoutPolicy
      ?? (partial.banTimeoutPolicy === "warn_extend_30" ? "retry_after_delay" : partial.banTimeoutPolicy === "random_legal_ban" ? "random_legal_hero" : partial.banTimeoutPolicy)
      ?? merged.banActionTimeoutPolicy,
    modeOrder: Array.isArray(partial.modeOrder) && partial.modeOrder.length > 0 ? partial.modeOrder : merged.modeOrder,
    banEnabled: legacyFirstBanPolicy === "no_ban" ? false : partial.banEnabled ?? merged.banEnabled,
    firstBanPolicy: legacyFirstBanPolicy === "loser_must_first" ? "loser_must_first" : "allow_loser_choose",
    openingSidePolicy: partial.openingSidePolicy === "follow_map_picker"
      ? "follow_map_picker"
      : normalizePolicy(partial.openingSidePolicy, merged.openingSidePolicy === "follow_map_picker" ? "random" : merged.openingSidePolicy),
    firstMapPickerPolicy: normalizePolicy(partial.firstMapPickerPolicy, merged.firstMapPickerPolicy),
    symmetricSideChoiceEnabled: typeof partial.symmetricSideChoiceEnabled === "boolean"
      ? partial.symmetricSideChoiceEnabled
      : merged.symmetricSideChoiceEnabled,
    firstSideChoicePolicy: (["none", "map_picker", "left", "right", "left_attack", "left_defense"] as unknown[])
      .includes(partial.firstSideChoicePolicy)
      ? partial.firstSideChoicePolicy as FirstSideChoicePolicy
      : merged.firstSideChoicePolicy,
    subsequentSideChoicePolicy: (["previous_winner", "previous_loser"] as unknown[])
      .includes(partial.subsequentSideChoicePolicy)
      ? partial.subsequentSideChoicePolicy as SubsequentSideChoicePolicy
      : legacySideChoicePolicy === "previous_winner" ? "previous_winner" : merged.subsequentSideChoicePolicy,
    checkpoints: resizeCheckpoints(
      merged.checkpoints.map((checkpoint, index) => ({
        ...checkpoint,
        ...(checkpointOverrides[index] ?? {}),
      })),
      stageCount,
    ),
    stageLimits: { ...merged.stageLimits, ...(partial.stageLimits ?? {}) },
    mapPool: partial.mapPool ?? merged.mapPool,
  };
}
