import type { MatchMap, MatchState, SettingsState, Side } from "../../types";

export function createFreshMatchState(baseState: MatchState, settings: SettingsState): MatchState {
  return {
    ...baseState,
    matchName: settings.matchName,
    phase: "waiting",
    currentOperation: "等待管理员开始",
    currentCountdownSeconds: settings.stageLimits.preStartRestSeconds,
    teams: {
      left: { ...baseState.teams.left, name: settings.teams.left, seriesScore: 0 },
      right: { ...baseState.teams.right, name: settings.teams.right, seriesScore: 0 },
    },
    maps: Array.from({ length: settings.stageCount }, (_, index) => createBlankMap(index)),
  };
}

export function createBlankMap(index: number): MatchMap {
  return {
    id: `map-${index + 1}`,
    mode: null,
    modeIconUrl: null,
    nameZh: null,
    nameEn: null,
    status: "tbd",
    imageUrl: "/static/placeholders/map-blank.svg",
    score: { left: null, right: null },
    bans: { left: null, right: null },
    firstBanSide: null,
    sideChoiceKind: null,
    selectedSide: null,
  };
}

export function getOppositeSide(side: Side): Side {
  return side === "left" ? "right" : "left";
}

export function pickRandomItem<T>(items: T[]): T | null {
  return items.length ? items[Math.floor(Math.random() * items.length)] ?? null : null;
}
