import { createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";
import { escapeHtml } from "../utils";

export const playerSelectWindow = createPopWindowModule("player-select", ({ phase }) => phase === "lineup_pick");

export type LineupSlotViewModel = {
  id: string; role: string; label: string; iconUrl: string; value: string; completed: boolean; duplicated: boolean;
  control: { kind: "readonly" | "input" | "select"; disabled: boolean; text?: string; placeholder?: string; options?: string[] };
};

export type LineupTeamViewModel = {
  side: "left" | "right"; name: string; editable: boolean; ready: boolean; accessLabel: string; slots: LineupSlotViewModel[];
};

export function createPlayerSelectView(model: {
  visible: boolean; minimized: boolean; mapIndex: number; mapName: string; canMinimize: boolean;
  leftTeam: LineupTeamViewModel; rightTeam: LineupTeamViewModel; broadcast: boolean; canConfirm: boolean; confirmLabel: string;
  timedOut: boolean; admin: boolean; actionLocked: boolean; extensionSeconds: number;
}, actions: { minimize(): void; restore(): void; confirm(): void; extend(): void; forfeit(): void; update(control: HTMLInputElement | HTMLSelectElement): void }): PopWindowView {
  const footerActions: PopWindowAction[] = model.broadcast ? [] : [
    { action: "confirm-lineup", label: model.confirmLabel, tone: "primary", disabled: !model.canConfirm, id: "confirmLineupPick", className: "confirm-lineup-pick" },
  ];
  if (model.admin && model.timedOut && !model.actionLocked) {
    footerActions.push({ action: "extend-lineup", label: `警告并延长${model.extensionSeconds}秒`, tone: "secondary", id: "extendLineup" });
    footerActions.push({ action: "forfeit-lineup", label: "本张地图判负", tone: "danger", id: "forfeitLineup" });
  }
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: model.minimized ? "已最小化的阵容确认面板" : "阵容确认面板", eyebrow: model.broadcast ? "双方阵容" : "选择上场成员",
      title: model.minimized ? `MAP ${model.mapIndex + 1} 阵容确认` : model.broadcast ? `MAP ${model.mapIndex + 1} 阵容确认中` : `MAP ${model.mapIndex + 1} ${model.mapName}`,
      variant: model.minimized ? "minimized" : "stage", size: "wide", layer: 55, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "lineup-selector-overlay", panel: model.minimized ? "" : "lineup-selector-panel", header: model.minimized ? "" : "lineup-selector-header", progress: model.minimized ? "map-selector-progress-mini" : "lineup-selector-progress", body: model.minimized ? "" : "lineup-team-grid", footer: model.minimized ? "" : "lineup-selector-footer" },
    },
    content: { body: `${renderLineupTeam(model.leftTeam, model.broadcast)}${renderLineupTeam(model.rightTeam, model.broadcast)}`, footerMessage: model.broadcast ? "直播只读，正在等待双方确认上场成员" : undefined, footerActions },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelector('[data-pop-window-action="confirm-lineup"]')?.addEventListener("click", actions.confirm);
      root.querySelector('[data-pop-window-action="extend-lineup"]')?.addEventListener("click", actions.extend);
      root.querySelector('[data-pop-window-action="forfeit-lineup"]')?.addEventListener("click", actions.forfeit);
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".lineup-control").forEach((control) => {
        control.addEventListener("input", () => actions.update(control)); control.addEventListener("change", () => actions.update(control));
      });
    },
  };
}

function renderLineupTeam(team: LineupTeamViewModel, broadcast: boolean): string {
  const slots = `<div class="lineup-slot-list">${team.slots.map((slot) => renderLineupSlot(team.side, slot)).join("")}</div>`;
  return `<section class="lineup-team-card lineup-team-${team.side} ${team.editable ? "" : "lineup-team-readonly"} ${broadcast ? "lineup-team-audience" : ""} ${team.ready ? "lineup-team-ready" : ""}" aria-label="${escapeHtml(team.name)} 上场成员"><header class="lineup-team-header"><h3>${escapeHtml(team.name)}</h3><b>${escapeHtml(team.accessLabel)}</b></header>${slots}</section>`;
}

function renderLineupSlot(side: "left" | "right", slot: LineupSlotViewModel): string {
  return `<label class="lineup-slot lineup-slot-${escapeHtml(slot.role)} ${slot.completed ? "lineup-slot-filled" : ""} ${slot.duplicated ? "lineup-slot-duplicate" : ""}" data-lineup-side="${side}" data-lineup-slot="${escapeHtml(slot.id)}"><img class="lineup-role-icon" src="${escapeHtml(slot.iconUrl)}" alt="${escapeHtml(slot.label)}" />${renderLineupControl(side, slot)}</label>`;
}

function renderLineupControl(side: "left" | "right", slot: LineupSlotViewModel): string {
  const common = `class="lineup-control" data-lineup-side="${side}" data-lineup-slot="${escapeHtml(slot.id)}"`;
  if (slot.control.kind === "readonly") return `<span class="lineup-control lineup-control-readonly" data-lineup-side="${side}" data-lineup-slot="${escapeHtml(slot.id)}">${escapeHtml(slot.control.text ?? "")}</span>`;
  if (slot.control.kind === "select") return `<select ${common} ${slot.control.disabled ? "disabled" : ""}><option value="">选择成员</option>${(slot.control.options ?? []).map((option) => `<option value="${escapeHtml(option)}" ${option === slot.value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
  return `<input ${common} type="text" value="${escapeHtml(slot.value)}" placeholder="${escapeHtml(slot.control.placeholder ?? "")}" ${slot.control.disabled ? "disabled" : ""} />`;
}
