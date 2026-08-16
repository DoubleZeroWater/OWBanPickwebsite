import { createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";

export const resultWindow = createPopWindowModule("result", ({ phase }) => phase === "post_map_rest");

export function createResultRestView(model: {
  visible: boolean; minimized: boolean; mapIndex: number; mapName: string; canMinimize: boolean; broadcast: boolean; canSkip: boolean; buttonLabel: string;
  seriesWinnerDecision: boolean; admin: boolean; leftTeamName: string; rightTeamName: string;
}, actions: { minimize(): void; restore(): void; skip(): void; chooseSeriesWinner(side: "left" | "right"): void }): PopWindowView {
  const footerActions: PopWindowAction[] = model.seriesWinnerDecision
    ? model.admin
      ? [
        { action: "series-winner-left", label: `${model.leftTeamName} 获胜`, tone: "primary" },
        { action: "series-winner-right", label: `${model.rightTeamName} 获胜`, tone: "primary" },
      ]
      : []
    : model.broadcast
      ? []
      : [{ action: "skip-rest", label: model.buttonLabel, tone: "primary", disabled: !model.canSkip, id: "skipRestPeriod", className: "confirm-score-pick" }];
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "场间休息倒计时", eyebrow: "场间", title: model.minimized ? `MAP ${model.mapIndex + 1} 休息中` : `MAP ${model.mapIndex + 1} ${model.mapName} 已结束`,
      variant: model.minimized ? "minimized" : "stage", size: "medium", layer: 61, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "rest-overlay", panel: model.minimized ? "" : "rest-panel", header: model.minimized ? "" : "score-selector-header", progress: model.minimized ? "map-selector-progress-mini" : "rest-progress", footer: model.minimized ? "" : "score-selector-footer" },
    },
    content: {
      body: model.seriesWinnerDecision
        ? `<section class="ruling-status-banner" role="alert"><span class="ruling-status-icon" aria-hidden="true">!</span><div><strong>地图顺序已耗尽，等待管理员裁定系列赛胜方</strong></div></section>`
        : "",
      footerStatus: { value: model.seriesWinnerDecision ? "管理员裁定后结束系列赛" : "休息结束后自动进入下一轮选图" },
      footerMessage: model.seriesWinnerDecision
        ? model.admin ? undefined : "等待管理员裁定系列赛胜方"
        : model.broadcast ? "直播只读，倒计时结束后将自动继续" : undefined,
      footerActions,
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelector('[data-pop-window-action="skip-rest"]')?.addEventListener("click", actions.skip);
      root.querySelector('[data-pop-window-action="series-winner-left"]')?.addEventListener("click", () => actions.chooseSeriesWinner("left"));
      root.querySelector('[data-pop-window-action="series-winner-right"]')?.addEventListener("click", () => actions.chooseSeriesWinner("right"));
    },
  };
}
