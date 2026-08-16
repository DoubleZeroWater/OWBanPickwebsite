import { createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";
import { escapeHtml } from "../utils";

export const prepareWindow = createPopWindowModule(
  "prepare",
  ({ phase }) => ["configuring", "waiting_ready", "pre_start_rest"].includes(phase),
);

export function createPrepareGateView(model: {
  visible: boolean;
  status: "draft" | "ready" | "locked";
  teamPortal: boolean;
  teamReady: boolean;
  bothTeamsReady: boolean;
  preparationOpen: boolean;
  ownTeamName: string;
  canEditTeamName: boolean;
  settingsAccess: boolean;
  broadcast: boolean;
  startWithDefaultConfig: boolean;
  minimized: boolean;
  canMinimize: boolean;
  teams: Record<"left" | "right", { name: string; ready: boolean; connected: boolean }>;
}, actions: {
  minimize(): void;
  restore(): void;
  openConfig(): void;
  confirmConfig(): void;
  start(force: boolean): void;
  updateName(value: string): void;
  setReady(ready: boolean, teamName?: string): void;
}): PopWindowView {
  const footerActions: PopWindowAction[] = [];
  let footerMessage = "";
  if (model.broadcast) {
    if (model.status !== "ready") {
      footerActions.push({
        action: "waiting-config",
        label: "等待管理员确认配置",
        tone: "secondary",
        disabled: true,
        className: "prepare-waiting-action",
      });
    } else if (!model.startWithDefaultConfig) {
      footerMessage = "配置已确认，正在等待双方准备";
    }
  } else if (model.settingsAccess) {
    if (model.status === "ready") {
      if (model.bothTeamsReady) {
        footerActions.push({ action: "start", label: "开始比赛", tone: "primary", id: "startMatchFromGate", className: "start-match-button" });
      } else {
        footerActions.push({ action: "force-start", label: "跳过等待并开始", tone: "primary", id: "forceStartMatchFromGate", className: "force-start-button force-start-risk-button" });
      }
    } else {
      footerActions.push({ action: "confirm-config", label: "确认配置", tone: "primary", id: "confirmRoomConfigFromGate", className: "start-match-button" });
    }
  } else if (model.teamPortal && model.preparationOpen) {
    if (model.teamReady) {
      footerActions.push({ action: "ready-status", label: "已准备", tone: "secondary", disabled: true, className: "prepare-status-action" });
    }
    else footerActions.push({ action: "ready", label: "确认准备", tone: "primary", disabled: !model.ownTeamName.trim(), className: "team-ready-button" });
  } else if (model.teamPortal) {
    footerActions.push({
      action: "waiting-config",
      label: "等待管理员确认",
      tone: "secondary",
      disabled: true,
      className: "prepare-waiting-action",
    });
  } else footerMessage = "等待管理员开始";

  const broadcastMinimalTitle = model.bothTeamsReady && !model.startWithDefaultConfig
    ? "等待管理员开始"
    : model.status === "ready" ? "等待双方准备" : "赛事准备中";

  const broadcastBody = `
    <div class="team-preparation-card team-preparation-waiting broadcast-preparation-baseline">
      <h3>${model.status === "ready" ? "配置已确认" : "完成赛前配置"}</h3>
      <p>${model.status === "ready" ? "正在等待双方队伍完成准备。" : "直播页面正在等待管理员确认赛事配置。"}</p>
    </div>
    <div class="broadcast-preparation-preview broadcast-preparation-focus" data-broadcast-preview="focus">
      <span class="broadcast-status-orbit" aria-hidden="true"><i></i></span>
      <div><span>赛前直播信号</span><h3>${model.status === "ready" ? "配置已确认" : "等待赛事配置"}</h3><p>${model.status === "ready" ? "双方队伍完成准备后，直播页将自动进入赛前倒计时。" : "赛事管理员正在确认规则、地图池与流程。"}</p></div>
    </div>
    <div class="broadcast-preparation-preview broadcast-preparation-minimal" data-broadcast-preview="minimal">
      <h3>${broadcastMinimalTitle}</h3>
    </div>
    <div class="broadcast-preparation-preview broadcast-preparation-ops" data-broadcast-preview="ops">
      <header><span>赛事流程</span><strong>只读</strong></header>
      <ol><li class="is-current"><i>01</i><div><strong>确认赛事配置</strong><span>${model.status === "ready" ? "已完成" : "进行中"}</span></div></li><li class="${model.status === "ready" ? "is-current" : ""}"><i>02</i><div><strong>双方队伍准备</strong><span>${model.status === "ready" ? "等待中" : "尚未开始"}</span></div></li><li><i>03</i><div><strong>赛前倒计时</strong><span>尚未开始</span></div></li></ol>
    </div>`;

  const body = model.broadcast
    ? broadcastBody
    : model.teamPortal && model.preparationOpen
      ? `<label class="team-name-confirmation"><strong>队伍名称</strong><input id="ownTeamNameInput" type="text" maxlength="60" value="${escapeHtml(model.ownTeamName)}" ${model.canEditTeamName && !model.teamReady ? "" : "disabled"} /></label>`
    : model.teamPortal
      ? ""
      : model.settingsAccess && model.status === "ready"
          ? `<div class="admin-preparation-status-grid">
              ${(["left", "right"] as const).map((side) => {
                const team = model.teams[side];
                const stateClass = team.ready ? "is-ready" : team.connected ? "is-waiting" : "is-offline";
                const stateLabel = team.ready ? "已准备" : team.connected ? "等待中" : "已离线";
                return `<div class="admin-preparation-status ${stateClass}"><span class="admin-preparation-dot" aria-hidden="true"></span><strong>${escapeHtml(team.name)}</strong><em>${stateLabel}</em></div>`;
              }).join("")}
            </div>
            ${model.bothTeamsReady ? "" : `<div class="admin-force-start-warning" role="status"><p>${model.startWithDefaultConfig ? "双方完成准备后将自动进入赛前倒计时，也可由管理员跳过等待" : "继续将跳过剩余准备状态并立即进入赛前倒计时"}</p></div>`}`
          : `<div class="team-preparation-card team-preparation-waiting"><h3>完成赛前配置</h3><p>${escapeHtml(footerMessage || "确认规则与地图池后，即可开放队伍准备。")}</p></div>`;

  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "赛前准备",
      eyebrow: "赛前准备",
      title: model.preparationOpen
        ? model.teamPortal
          ? "确认队伍信息"
          : model.bothTeamsReady ? "双方已准备" : "等待双方准备"
        : "待配置阶段",
      variant: model.minimized ? "minimized" : "stage",
      size: "compact",
      layer: 50,
      timing: "none",
      minimizable: model.canMinimize,
      legacy: model.minimized ? {} : {
        overlay: "start-gate start-gate-team-modal",
        panel: "team-preparation-modal-shell",
        footer: `prepare-gate-footer ${model.teamPortal && !model.preparationOpen ? "prepare-gate-footer-team-locked" : ""}`,
      },
    },
    content: {
      body,
      omitBody: (model.teamPortal || model.settingsAccess) && !model.preparationOpen,
      footerStatus: model.status === "ready" && model.startWithDefaultConfig
        ? { value: "双方准备后自动开始" }
        : undefined,
      footerMessage: footerMessage || undefined,
      footerActions,
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelector<HTMLInputElement>("#ownTeamNameInput")?.addEventListener("input", (event) => actions.updateName((event.currentTarget as HTMLInputElement).value));
      root.querySelector('[data-pop-window-action="confirm-config"]')?.addEventListener("click", actions.confirmConfig);
      root.querySelector('[data-pop-window-action="start"]')?.addEventListener("click", () => actions.start(false));
      root.querySelector('[data-pop-window-action="force-start"]')?.addEventListener("click", () => actions.start(true));
      root.querySelector('[data-pop-window-action="ready"]')?.addEventListener("click", () => {
        const teamName = model.canEditTeamName ? root.querySelector<HTMLInputElement>("#ownTeamNameInput")?.value.trim() : undefined;
        if (!model.canEditTeamName || teamName) actions.setReady(true, teamName);
      });
      root.querySelector('[data-pop-window-action="open-config"]')?.addEventListener("click", actions.openConfig);
    },
  };
}

export function createPrepareRestView(model: {
  visible: boolean;
  minimized: boolean;
  mapIndex: number;
  canMinimize: boolean;
  broadcast: boolean;
  canSkip: boolean;
  buttonLabel: string;
}, actions: { minimize(): void; restore(): void; skip(): void }): PopWindowView {
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "赛前准备倒计时", eyebrow: "赛前准备", title: model.minimized ? `MAP ${model.mapIndex + 1} 准备中` : `MAP ${model.mapIndex + 1} 准备时间`,
      variant: model.minimized ? "minimized" : "stage", size: "medium", layer: 61, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "rest-overlay", panel: model.minimized ? "" : "rest-panel", progress: model.minimized ? "map-selector-progress-mini" : "rest-progress", footer: model.minimized ? "" : "score-selector-footer prepare-rest-footer" },
    },
    content: {
      body: "",
      footerStatus: { value: "准备结束后开始首张地图" },
      footerActions: model.broadcast ? [] : [{ action: "skip-rest", label: model.buttonLabel, tone: "primary", disabled: !model.canSkip, id: "skipRestPeriod", className: "confirm-score-pick" }],
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelector('[data-pop-window-action="skip-rest"]')?.addEventListener("click", actions.skip);
    },
  };
}
