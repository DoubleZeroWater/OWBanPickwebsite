import { createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";
import { escapeHtml } from "../utils";
import type { Side } from "../types";

export interface ScoreMapTeamViewModel {
  side: Side;
  teamName: string;
  sideChoice?: string;
  banName: string;
  lineup: Array<{ label: string; value: string }>;
}

export interface ScoreMapSummaryViewModel {
  teams: [ScoreMapTeamViewModel, ScoreMapTeamViewModel];
}

export interface ScoreTeamPauseViewModel {
  side: Side;
  active: boolean;
  count: number;
  mapTotal: string;
  matchTotal: string;
  current: string;
  broadcast: boolean;
  canControl: boolean;
}

export interface ScoreInputViewModel {
  side: Side;
  teamName: string;
  value: string;
  disabled: boolean;
  broadcast: boolean;
}

export const scoreWindow = createPopWindowModule("score", ({ phase }) => phase === "score_entry");

function renderMapSummary(model: ScoreMapSummaryViewModel): string {
  const renderTeam = (team: ScoreMapTeamViewModel) => `
    <section class="score-map-team-info score-map-team-info-${team.side}">
      <h3>${escapeHtml(team.teamName)}</h3>
      ${team.sideChoice ? `<p class="score-map-info-row score-map-side-choice"><span>地图选边</span><strong>${escapeHtml(team.sideChoice)}</strong></p>` : ""}
      <p class="score-map-info-row"><span>禁用英雄</span><strong>${escapeHtml(team.banName)}</strong></p>
      <dl class="score-map-lineup-list">${team.lineup.map((slot) => `<div><dt>${escapeHtml(slot.label)}</dt><dd>${escapeHtml(slot.value)}</dd></div>`).join("")}</dl>
    </section>`;
  return `
    <section class="score-map-summary" aria-label="本图比赛信息">
      <div class="score-map-team-info-grid">${model.teams.map(renderTeam).join("")}</div>
    </section>`;
}

function renderTeamPause(model: ScoreTeamPauseViewModel): string {
  const control = model.broadcast
    ? `<span class="phase-readonly-label">${model.active ? "队伍暂停中" : "队伍暂停未启用"}</span>`
    : `<button type="button" data-score-pause-side="${model.side}" ${model.canControl ? "" : "disabled"}>${model.active ? "取消暂停" : "暂停计时"}</button>`;
  return `
    <section class="score-team-pause-card score-team-pause-${model.side} ${model.active ? "is-paused" : ""}" data-score-pause-card="${model.side}">
      <dl>
        <div><dt>本小局暂停次数</dt><dd>${model.count}</dd></div>
        <div><dt>本小局累计暂停</dt><dd data-score-pause-total="${model.side}">${escapeHtml(model.mapTotal)}</dd></div>
        <div><dt>全局累计暂停</dt><dd data-score-pause-match-total="${model.side}">${escapeHtml(model.matchTotal)}</dd></div>
        <div><dt>本次暂停</dt><dd data-score-pause-current="${model.side}">${escapeHtml(model.current)}</dd></div>
      </dl>
      ${control}
    </section>`;
}

function renderScoreInput(model: ScoreInputViewModel): string {
  if (model.broadcast) {
    return `<div class="score-input-card score-input-${model.side} score-input-readonly"><span>${escapeHtml(model.teamName)}</span><output class="score-control">${escapeHtml(model.value || "-")}</output></div>`;
  }
  return `
    <label class="score-input-card score-input-${model.side}">
      <span>${escapeHtml(model.teamName)}</span>
      <input class="score-control" data-score-side="${model.side}" type="number" min="0" value="${escapeHtml(model.value)}" ${model.disabled ? "disabled" : ""} />
    </label>`;
}

export function createScoreView(model: {
  visible: boolean; minimized: boolean; mapIndex: number; mapName: string; canMinimize: boolean; counting: boolean;
  mapSummary: ScoreMapSummaryViewModel; pauses: [ScoreTeamPauseViewModel, ScoreTeamPauseViewModel]; inputs: [ScoreInputViewModel, ScoreInputViewModel]; status: string;
  broadcast: boolean; submitted: boolean; canConfirm: boolean; confirmLabel: string; canReject: boolean;
}, actions: { minimize(): void; restore(): void; update(control: HTMLInputElement): void; confirm(): void; reject(): void; togglePause(side: Side): void }): PopWindowView {
  const footerActions: PopWindowAction[] = model.broadcast ? [] : [
    { action: "confirm-score", label: model.confirmLabel, tone: "primary", disabled: !model.canConfirm, id: "confirmScorePick", className: "confirm-score-pick" },
  ];
  if (model.canReject) footerActions.push({ action: "reject-score", label: "申诉错误比分", tone: "danger", id: "rejectScorePick", className: "reject-score-pick" });
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "比分确认面板", eyebrow: model.broadcast ? "赛果确认" : model.submitted ? "确认比分" : "填写比分", title: model.minimized ? `MAP ${model.mapIndex + 1} 比分确认中` : `MAP ${model.mapIndex + 1} ${model.mapName}`,
      variant: model.minimized ? "minimized" : "stage", size: "wide", layer: 62, timing: model.counting ? "phase" : "none", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "score-selector-overlay", panel: model.minimized ? "" : "score-selector-panel", header: model.minimized ? "" : "score-selector-header", progress: model.minimized ? "map-selector-progress-mini" : "score-selector-progress", footer: model.minimized ? "" : "score-selector-footer" },
    },
    content: {
      body: model.broadcast
        ? `<section class="score-entry-panel score-entry-confirmation" aria-label="比分确认"><h3>等待比分确认</h3><div class="score-entry-grid">${model.inputs.map(renderScoreInput).join("")}</div></section>`
        : `<section class="score-entry-panel ${model.submitted ? "score-entry-confirmation" : ""}" aria-label="比分${model.submitted ? "确认" : "填写"}"><h3>${model.submitted ? "请核对比分" : "录入比分"}</h3><div class="score-entry-grid">${model.inputs.map(renderScoreInput).join("")}</div></section><section class="score-detail-panel" aria-label="本图信息"><h3>本图信息</h3><div class="score-detail-content">${renderMapSummary(model.mapSummary)}<div class="score-team-pause-grid" aria-label="队伍暂停计时">${model.pauses.map(renderTeamPause).join("")}</div></div></section>`,
      footerStatus: { value: model.status }, footerMessage: model.broadcast ? "直播只读，正在等待比分确认" : undefined, footerActions,
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelectorAll<HTMLInputElement>(".score-control").forEach((control) => control.addEventListener("input", () => actions.update(control)));
      root.querySelector('[data-pop-window-action="confirm-score"]')?.addEventListener("click", actions.confirm);
      root.querySelector('[data-pop-window-action="reject-score"]')?.addEventListener("click", actions.reject);
      root.querySelectorAll<HTMLButtonElement>("[data-score-pause-side]").forEach((button) => button.addEventListener("click", () => actions.togglePause(button.dataset.scorePauseSide as Side)));
    },
  };
}
