import { compareScores } from "../../utils";
import type { MatchFormat, MatchState, Side } from "../../types";

interface MatchProgressContext {
  getState: () => MatchState | null;
  getFormat: () => MatchFormat;
  getFirstPicker: () => Side;
}

export function createMatchProgress(context: MatchProgressContext) {
  const getWinsNeeded = (): number => ({ ft2: 2, ft3: 3, ft4: 4 })[context.getFormat()];

  const getSeriesWinnerSide = (state: MatchState | null = context.getState()): Side | null => {
    if (!state) return null;
    if (state.teams.left.seriesScore >= getWinsNeeded()) return "left";
    if (state.teams.right.seriesScore >= getWinsNeeded()) return "right";
    return null;
  };

  return {
    getWinsNeeded,
    getSeriesWinnerSide,
    findTargetMapIndex(state: MatchState): number {
      return getSeriesWinnerSide(state) === null
        ? state.maps.findIndex((map) => map.status === "tbd" || !map.nameEn)
        : -1;
    },
    getMapPickerSide(state: MatchState, targetMapIndex: number): Side {
      if (targetMapIndex === 0) return context.getFirstPicker();
      for (let index = targetMapIndex - 1; index >= 0; index -= 1) {
        const map = state.maps[index];
        const result = compareScores(map.score.left, map.score.right);
        if (result !== null && result !== 0) return result > 0 ? "right" : "left";
      }
      if (state.teams.left.seriesScore !== state.teams.right.seriesScore) {
        return state.teams.left.seriesScore > state.teams.right.seriesScore ? "right" : "left";
      }
      return state.teams.left.seed <= state.teams.right.seed ? "left" : "right";
    },
  };
}
