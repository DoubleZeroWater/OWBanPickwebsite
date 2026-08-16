import { bindInteractiveRandomChoices, createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";
import { escapeHtml } from "../utils";

export const mapSelectWindow = createPopWindowModule(
  "map-select",
  ({ phase, purpose }) => phase === "map_pick" || phase === "side_pick"
    || (phase === "interactive_random" && ["map_picker", "side_choice"].includes(purpose ?? "")),
);

type CommonActions = { minimize(): void; restore(): void };

export type MapOptionViewModel = {
  key: string; modeLabel: string; name: string; imageUrl: string; selected: boolean; disabled: boolean;
  disabledClass: string; title: string; broadcast: boolean;
};

export type MapModeViewModel = {
  key: string; label: string; iconUrl: string; active: boolean; locked: boolean; choices: MapOptionViewModel[];
};

export function createMapSelectView(model: {
  visible: boolean; minimized: boolean; pickerSide: string; pickerName: string; mapIndex: number;
  canMinimize: boolean; modes: MapModeViewModel[]; selectedMap: string; broadcast: boolean; canConfirm: boolean;
  confirmLabel: string; timedOut: boolean; admin: boolean; actionLocked: boolean; inactive: boolean; extensionSeconds: number;
}, actions: CommonActions & { confirm(): void; random(): void; extend(): void; forfeit(): void; selectMap(key: string | null): void }): PopWindowView {
  const title = `MAP ${model.mapIndex + 1} ${model.pickerName}选择地图`;
  const footerActions: PopWindowAction[] = model.broadcast ? [] : [
    { action: "confirm-map", label: model.confirmLabel, tone: "primary", disabled: !model.canConfirm, id: "confirmMapPick", className: "confirm-map-pick" },
  ];
  if (model.admin && model.timedOut && !model.actionLocked) {
    footerActions.push({ action: "extend-map", label: `警告并延长${model.extensionSeconds}秒`, tone: "secondary", id: "extendMap" });
    footerActions.push({ action: "random-map", label: "随机合法选择", tone: "secondary", id: "randomLegalMap" });
    footerActions.push({ action: "forfeit-map", label: "本张地图判负", tone: "danger", id: "forfeitMap" });
  }
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: model.minimized ? "已最小化的地图选择面板" : "地图选择面板", eyebrow: "选择地图",
      title,
      variant: model.minimized ? "minimized" : "stage", size: "wide", layer: 50, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "map-selector-overlay", panel: model.minimized ? "" : "map-selector-panel", header: model.minimized ? "" : "map-selector-header", progress: `${model.minimized ? "map-selector-progress-mini" : "map-selector-progress"}${model.inactive ? " progress-inactive" : ""}`, footer: model.minimized ? "" : "map-selector-footer" },
    },
    content: {
      body: `<div class="mode-strip" aria-label="地图类型">${model.modes.map(renderModeStripItem).join("")}</div><div class="map-option-board">${model.modes.map(renderModeColumn).join("")}</div>`,
      footerStatus: { label: "当前选择", value: model.selectedMap || "点击选择地图" },
      footerMessage: model.broadcast ? "直播只读，正在等待选图结果" : undefined,
      footerActions,
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelector('[data-pop-window-action="confirm-map"]')?.addEventListener("click", actions.confirm);
      root.querySelector('[data-pop-window-action="random-map"]')?.addEventListener("click", actions.random);
      root.querySelector('[data-pop-window-action="extend-map"]')?.addEventListener("click", actions.extend);
      root.querySelector('[data-pop-window-action="forfeit-map"]')?.addEventListener("click", actions.forfeit);
      root.querySelectorAll<HTMLButtonElement>(".map-option:not(:disabled)").forEach((button) => button.addEventListener("click", () => actions.selectMap(button.dataset.mapKey ?? null)));
    },
  };
}

function renderModeStripItem(mode: MapModeViewModel): string {
  return `<div class="mode-strip-item ${mode.active ? "mode-strip-item-active" : ""} ${mode.locked ? "mode-strip-item-locked" : ""}" data-mode="${escapeHtml(mode.key)}"><span class="mode-strip-icon">${mode.iconUrl ? `<img src="${escapeHtml(mode.iconUrl)}" alt="${escapeHtml(mode.label)}" />` : ""}</span><span class="mode-strip-label">${escapeHtml(mode.label)}</span></div>`;
}

function renderModeColumn(mode: MapModeViewModel): string {
  if (mode.choices.length === 0) return "";
  return `<section class="map-mode-column" aria-label="${escapeHtml(mode.label)}">${mode.choices.map(renderMapOption).join("")}</section>`;
}

function renderMapOption(choice: MapOptionViewModel): string {
  const content = `<img src="${escapeHtml(choice.imageUrl)}" alt="${escapeHtml(choice.name)}" /><span class="map-option-shade"></span><span class="map-option-mode">${escapeHtml(choice.modeLabel)}</span><span class="map-option-name">${escapeHtml(choice.name)}</span>`;
  return choice.broadcast
    ? `<div class="map-option map-option-readonly ${choice.selected ? "map-option-selected" : ""}" title="${escapeHtml(choice.title)}">${content}</div>`
    : `<button class="map-option ${choice.selected ? "map-option-selected" : ""} ${escapeHtml(choice.disabledClass)}" type="button" data-map-key="${escapeHtml(choice.key)}" title="${escapeHtml(choice.title)}" ${choice.disabled ? "disabled" : ""}>${content}</button>`;
}

export function createSideSelectView(model: {
  visible: boolean; minimized: boolean; choiceKind: "attack_defense" | "color"; mapIndex: number; mapName: string;
  canMinimize: boolean; pickerName: string; firstLabel: string; secondLabel: string; firstSelected: boolean;
  secondSelected: boolean; broadcast: boolean; canOperate: boolean; summary: string; inactive: boolean;
}, actions: CommonActions & { choose(choice: "picker" | "opponent"): void; confirm(): void }): PopWindowView {
  const first = `<strong>${escapeHtml(model.firstLabel)}</strong>`;
  const second = `<strong>${escapeHtml(model.secondLabel)}</strong>`;
  const body = `<div class="side-selector-options">${model.broadcast
      ? `<div class="${model.firstSelected ? "is-selected" : ""}">${first}</div><div class="${model.secondSelected ? "is-selected" : ""}">${second}</div>`
      : `<button type="button" data-side-choice="picker" class="${model.firstSelected ? "is-selected" : ""}" ${model.canOperate ? "" : "disabled"}>${first}</button><button type="button" data-side-choice="opponent" class="${model.secondSelected ? "is-selected" : ""}" ${model.canOperate ? "" : "disabled"}>${second}</button>`}</div>`;
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "攻防与阵营选择面板", eyebrow: model.choiceKind === "attack_defense" ? "选择攻防" : "选择阵营",
      title: model.minimized
        ? `MAP ${model.mapIndex + 1} ${model.pickerName}选择${model.choiceKind === "attack_defense" ? "攻防" : "阵营"}`
        : `MAP ${model.mapIndex + 1} ${model.mapName} ${model.pickerName}选择`,
      variant: model.minimized ? "minimized" : "stage", size: "medium", layer: 54, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "side-selector-overlay", panel: model.minimized ? "" : "side-selector-panel", header: model.minimized ? "" : "score-selector-header", progress: `${model.minimized ? "map-selector-progress-mini" : "side-selector-progress"}${model.inactive ? " progress-inactive" : ""}`, footer: model.minimized ? "" : "side-selector-footer" },
    },
    content: {
      body,
      footerStatus: { label: "当前选择", value: model.summary },
      footerMessage: model.broadcast ? "直播只读，正在等待选边结果" : undefined,
      footerActions: model.broadcast ? [] : [{ action: "confirm-side", label: "确认选择", tone: "primary", disabled: !(model.canOperate && (model.firstSelected || model.secondSelected)), id: "confirmSideChoice" }],
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelectorAll<HTMLButtonElement>("[data-side-choice]:not(:disabled)").forEach((button) => button.addEventListener("click", () => actions.choose(button.dataset.sideChoice === "picker" ? "picker" : "opponent")));
      root.querySelector('[data-pop-window-action="confirm-side"]')?.addEventListener("click", actions.confirm);
    },
  };
}

export type InteractiveRandomViewModel = {
  visible: boolean; minimized: boolean; canMinimize: boolean; purposeLabel: string; purpose: "map_picker" | "opening_ban" | "side_choice"; resolved: boolean;
  resolvedTeamName: string; leftChoice: 0 | 1; rightChoice: 0 | 1; leftTeam: InteractiveRandomTeamModel; rightTeam: InteractiveRandomTeamModel;
  adminDecision: boolean; canConfirmAdminDecision: boolean;
};
export type InteractiveRandomTeamModel = { label: string; name: string; selected: 0 | 1 | null; submitted: boolean; editable: boolean; broadcast: boolean; resolved: boolean; actionLocked: boolean };
export type InteractiveRandomActions = CommonActions & { choose(side: "left" | "right", value: 0 | 1): void; confirmAdminDecision(): void };

export function createMapInteractiveRandomView(model: InteractiveRandomViewModel, actions: InteractiveRandomActions): PopWindowView {
  return createInteractiveRandomView(model, actions);
}

export function createInteractiveRandomView(model: InteractiveRandomViewModel, actions: InteractiveRandomActions): PopWindowView {
  const resultLabel = model.purpose === "map_picker" ? "首次选图权" : model.purpose === "opening_ban" ? "禁用首次先手" : "攻防选择权";
  const team = (side: "left" | "right", item: InteractiveRandomTeamModel) => `<section class="interactive-random-team ${item.submitted ? "is-submitted" : ""}"><strong>${escapeHtml(item.name)}</strong>${item.broadcast ? `<div class="interactive-random-readonly-value">${item.resolved ? item.selected ?? 0 : "•"}</div>` : `<div>${([0, 1] as const).map((value) => `<button class="interactive-random-choice ${item.selected === value ? "is-selected" : ""}" type="button" data-random-side="${side}" data-random-value="${value}" ${item.editable && !item.actionLocked ? "" : "disabled"}>${value}</button>`).join("")}</div>`}<small>${item.resolved ? `选择 ${item.selected ?? 0}` : item.submitted ? "已提交" : item.editable ? "请选择" : "等待提交"}</small></section>`;
  return {
    visible: model.visible,
    descriptor: { ariaLabel: "交互随机", eyebrow: "交互随机", title: model.resolved ? "计算结果已公布" : "决定优先选择方", variant: model.minimized ? "minimized" : "stage", size: "medium", layer: 66, timing: "phase", minimizable: model.canMinimize, legacy: model.minimized ? { progress: "map-selector-progress-mini" } : { overlay: "interactive-random-overlay", panel: "interactive-random-panel", progress: "interactive-random-progress", body: "interactive-random-teams", footer: "interactive-random-footer" } },
    content: {
      body: `${team("left", model.leftTeam)}<div class="interactive-random-xor" aria-hidden="true">对比</div>${team("right", model.rightTeam)}`,
      footerStatus: { label: "", value: model.resolved ? `${model.resolvedTeamName}获得${resultLabel}` : "两队选择相同数字时队伍1先选，不同时队伍2先选" },
      footerMessage: model.adminDecision ? "请选择所有未提交方的随机值，再确认裁定" : undefined,
      footerActions: model.adminDecision ? [{ action: "confirm-interactive-random-ruling", label: "确认管理员裁定", tone: "primary", disabled: !model.canConfirmAdminDecision, id: "confirmInteractiveRandomRuling" }] : [],
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      bindInteractiveRandomChoices(root, actions.choose);
      root.querySelector('[data-pop-window-action="confirm-interactive-random-ruling"]')?.addEventListener("click", actions.confirmAdminDecision);
    },
  };
}
