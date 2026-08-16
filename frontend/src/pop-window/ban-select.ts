import { createPopWindowModule, type PopWindowAction, type PopWindowView } from "./pop-window";
import { createInteractiveRandomView, type InteractiveRandomActions, type InteractiveRandomViewModel } from "./map-select";
import { escapeHtml } from "../utils";
import type { BanOrderChoice, Side } from "../types";

export interface BanLineupSlotViewModel {
  role: string;
  label: string;
  iconUrl: string;
  value: string;
}

export interface BanLineupViewModel {
  side: Side;
  teamName: string;
  active: boolean;
  orderLabel: string;
  pickedHero?: { imageUrl: string; name: string };
  slots?: BanLineupSlotViewModel[];
}

export interface BanOrderViewModel {
  kind: "order";
  chooserName: string;
  selectedOrder: BanOrderChoice | null;
  disabled: boolean;
  broadcast: boolean;
}

export interface BanHeroOptionViewModel {
  key: string;
  name: string;
  imageUrl: string;
  selected: boolean;
  disabled: boolean;
  disabledClass: string;
  states: Array<{
    kind: "own-history" | "opponent-current";
    label: string;
  }>;
  title: string;
  broadcast: boolean;
}

export interface BanHeroRoleViewModel {
  key: string;
  label: string;
  iconUrl: string;
  heroes: BanHeroOptionViewModel[];
}

export interface BanHeroBoardViewModel {
  kind: "heroes";
  roles: BanHeroRoleViewModel[];
}

export type BanMainViewModel = BanOrderViewModel | BanHeroBoardViewModel;

export const banSelectWindow = createPopWindowModule(
  "ban-select",
  ({ phase, purpose }) => ["ban_order", "ban_first", "ban_second"].includes(phase)
    || (phase === "interactive_random" && purpose === "opening_ban"),
);

export function createBanInteractiveRandomView(model: InteractiveRandomViewModel, actions: InteractiveRandomActions): PopWindowView {
  return createInteractiveRandomView(model, actions);
}

function renderBanLineup(model: BanLineupViewModel): string {
  const pickedHero = model.pickedHero
    ? `<div class="ban-lineup-picked-hero"><img src="${escapeHtml(model.pickedHero.imageUrl)}" alt="${escapeHtml(model.pickedHero.name)}" /><i class="ban-forbidden-icon"></i></div>`
    : model.orderLabel ? `<b class="ban-order-label">${escapeHtml(model.orderLabel)}</b>` : "";
  const slots = model.slots
    ? model.slots.map((slot) => `
        <div class="ban-lineup-slot ban-lineup-slot-${escapeHtml(slot.role)}">
          <img class="ban-lineup-role" src="${escapeHtml(slot.iconUrl)}" alt="${escapeHtml(slot.label)}" />
          <strong>${escapeHtml(slot.value || "-")}</strong>
        </div>`).join("")
    : "<strong>未提交阵容</strong>";
  return `
    <aside class="ban-lineup-side ban-lineup-${model.side} ${model.active ? "ban-lineup-active" : ""}">
      <header><div class="ban-lineup-heading">
        <div><h3>${escapeHtml(model.teamName)}</h3></div>
        ${pickedHero}
      </div></header>
      <div class="ban-lineup-list">${slots}</div>
    </aside>`;
}

function renderOrderChoice(model: BanOrderViewModel): string {
  const option = (order: BanOrderChoice, label: string) => {
    const content = `<strong>${label}</strong>`;
    return model.broadcast
      ? `<div class="${model.selectedOrder === order ? "ban-order-active" : ""}">${content}</div>`
      : `<button class="${model.selectedOrder === order ? "ban-order-active" : ""}" type="button" data-ban-order="${order}" ${model.disabled ? "disabled" : ""}>${content}</button>`;
  };
  return `
    <div class="ban-order-choice" aria-label="${model.broadcast ? "禁用顺序等待中" : "选择禁用顺序"}">
      <p>当前 <strong>${escapeHtml(model.chooserName)}</strong> 决定禁用先后手顺序</p>
      ${option("first", "选择先手")}
      ${option("second", "选择后手")}
    </div>`;
}

function renderHeroBoard(model: BanHeroBoardViewModel): string {
  return `<div class="hero-board">${model.roles.map((role) => `
    <section class="hero-role-column hero-role-${escapeHtml(role.key)}" aria-label="${escapeHtml(role.label)}">
      <header><img class="hero-role-image" src="${escapeHtml(role.iconUrl)}" alt="" /><h3>${escapeHtml(role.label)}</h3></header>
      <div class="hero-grid">${role.heroes.map(renderHeroOption).join("")}</div>
    </section>`).join("")}</div>`;
}

function renderHeroOption(hero: BanHeroOptionViewModel): string {
  const className = `hero-option ${hero.broadcast ? "hero-option-readonly" : ""} ${hero.selected ? "hero-option-selected" : ""} ${hero.disabledClass}`;
  const stateDescription = hero.states.map((state) => state.label).join("、");
  const stateDescriptionAttribute = stateDescription
    ? ` data-hero-state-description="${escapeHtml(stateDescription)}"`
    : "";
  const accessibleLabel = [hero.name, stateDescription].filter(Boolean).join("，");
  const content = `<img src="${escapeHtml(hero.imageUrl)}" alt="" /><span class="hero-option-name">${escapeHtml(hero.name)}</span>`;
  return hero.broadcast
    ? `<div class="${className}" role="img" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(hero.title)}"${stateDescriptionAttribute}>${content}</div>`
    : `<button class="${className}" type="button" data-hero-key="${escapeHtml(hero.key)}" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(hero.title)}"${stateDescriptionAttribute} ${hero.disabled ? "disabled" : ""}>${content}</button>`;
}

export function createBanSelectView(model: {
  visible: boolean; minimized: boolean; mapIndex: number; mapName: string; canMinimize: boolean; hasLineups: boolean;
  orderStep: boolean; leftLineup: BanLineupViewModel; main: BanMainViewModel; rightLineup: BanLineupViewModel; summary: string; broadcast: boolean;
  canConfirm: boolean; confirmLabel: string; timedOut: boolean; awaitingAdminDecision: boolean; admin: boolean; actionLocked: boolean; inactive: boolean; extensionSeconds: number;
}, actions: {
  minimize(): void; restore(): void; selectOrder(order: BanOrderChoice | undefined): void; selectHero(key: string | null): void;
  confirm(): void; requestConfirm(): void; random(): void; extend(): void; forfeit(): void;
}): PopWindowView {
  const footerActions: PopWindowAction[] = model.broadcast ? [] : [
    { action: "confirm-ban", label: model.confirmLabel, tone: "primary", disabled: !model.canConfirm, id: "confirmBanPick", className: "confirm-ban-pick" },
  ];
  if (model.admin && model.timedOut && !model.actionLocked) {
    footerActions.push({ action: "extend-ban", label: `警告并延长${model.extensionSeconds}秒`, tone: "secondary", id: "extendBan" });
    footerActions.push({ action: "random-ban", label: "随机合法选择", tone: "secondary", id: "randomLegalBan" });
    footerActions.push({ action: "forfeit-ban", label: "本张地图判负", tone: "danger", id: "forfeitBan" });
  }
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: "英雄禁用面板", eyebrow: "英雄禁用",
      title: model.minimized ? `MAP ${model.mapIndex + 1} 英雄禁用` : `MAP ${model.mapIndex + 1} ${model.mapName}`,
      variant: model.minimized ? "minimized" : "stage", size: "wide", layer: 58, timing: "phase", minimizable: model.canMinimize,
      legacy: { overlay: model.minimized ? "" : "ban-selector-overlay", panel: model.minimized ? "" : `ban-selector-panel ${model.awaitingAdminDecision ? "is-awaiting-ruling" : ""}`, header: model.minimized ? "" : "ban-selector-header", progress: `${model.minimized ? "map-selector-progress-mini" : "ban-selector-progress"}${model.inactive ? " progress-inactive" : ""}`, body: model.minimized ? "" : `ban-layout ${model.hasLineups ? "" : "ban-layout-no-lineups"} ${model.orderStep ? "ban-layout-order-only" : ""} ${model.awaitingAdminDecision ? "ban-layout-awaiting-ruling" : ""}`, footer: model.minimized ? "" : "ban-selector-footer" },
    },
    content: {
      body: `${model.awaitingAdminDecision ? `<section class="ruling-status-banner" role="alert"><span class="ruling-status-icon" aria-hidden="true">!</span><div><strong>选择已超时，等待管理员裁定</strong></div></section>` : ""}${model.hasLineups ? renderBanLineup(model.leftLineup) : ""}<div class="ban-main ${model.main.kind === "heroes" ? "ban-main-heroes" : "ban-main-order"}">${model.main.kind === "order" ? renderOrderChoice(model.main) : renderHeroBoard(model.main)}</div>${model.hasLineups ? renderBanLineup(model.rightLineup) : ""}`,
      footerStatus: { label: "当前选择", value: model.summary }, footerMessage: model.broadcast ? "直播只读，正在等待 Ban 结果" : undefined, footerActions,
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-control="minimize"]')?.addEventListener("click", actions.minimize);
      root.querySelector('[data-pop-window-control="restore"]')?.addEventListener("click", actions.restore);
      root.querySelectorAll<HTMLButtonElement>("[data-ban-order]").forEach((button) => button.addEventListener("click", () => actions.selectOrder(button.dataset.banOrder as BanOrderChoice | undefined)));
      root.querySelectorAll<HTMLButtonElement>(".hero-option:not(:disabled)").forEach((button) => button.addEventListener("click", () => actions.selectHero(button.dataset.heroKey ?? null)));
      root.querySelector('[data-pop-window-action="confirm-ban"]')?.addEventListener("click", model.orderStep ? actions.confirm : actions.requestConfirm);
      root.querySelector('[data-pop-window-action="random-ban"]')?.addEventListener("click", actions.random);
      root.querySelector('[data-pop-window-action="extend-ban"]')?.addEventListener("click", actions.extend);
      root.querySelector('[data-pop-window-action="forfeit-ban"]')?.addEventListener("click", actions.forfeit);
    },
  };
}
