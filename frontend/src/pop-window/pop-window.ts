import "./pop-window.css";
import type { AuthoritativePhase } from "../state/protocol";
import { escapeHtml } from "../utils";

export type PopWindowId =
  | "prepare"
  | "map-select"
  | "player-select"
  | "ban-select"
  | "score"
  | "result"
  | "pause"
  | "confirmation";

export type PopWindowVariant = "stage" | "floating" | "confirmation" | "minimized";
export type PopWindowSize = "compact" | "medium" | "wide";

export interface PopWindowAction {
  action: string;
  label: string;
  tone: "primary" | "secondary" | "danger";
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
}

export interface PopWindowContent {
  body: string;
  omitBody?: boolean;
  footerMessage?: string;
  footerStatus?: { label?: string; value: string };
  footerActions?: PopWindowAction[];
}

export interface PopWindowDescriptor {
  ariaLabel: string;
  eyebrow?: string;
  title: string;
  headerDetails?: string[];
  meta?: string;
  variant: PopWindowVariant;
  size: PopWindowSize;
  layer: number;
  timing: "phase" | "none";
  minimizable: boolean;
  legacy?: {
    overlay?: string;
    panel?: string;
    header?: string;
    progress?: string;
    body?: string;
    footer?: string;
  };
}

export interface PopWindowView {
  visible: boolean;
  descriptor: PopWindowDescriptor;
  content: PopWindowContent;
  bind(root: HTMLElement): void;
}

export interface PopWindowContext {
  phase: AuthoritativePhase["type"];
  purpose: string | null;
  audience: boolean;
  countdown: { remaining: number; percent: number };
  views: Partial<Record<PopWindowId, PopWindowView>>;
}

export interface PopWindowModule {
  readonly id: PopWindowId;
  matches(context: PopWindowContext): boolean;
  describe(context: PopWindowContext): PopWindowDescriptor;
  render(context: PopWindowContext): PopWindowContent;
  bind(root: HTMLElement, context: PopWindowContext): void;
}

export function stageView(id: PopWindowId, context: PopWindowContext): PopWindowView {
  const view = context.views[id];
  if (!view) throw new Error(`Missing pop-window view: ${id}`);
  return view;
}

export function createPopWindowModule(
  id: PopWindowId,
  matches: (context: PopWindowContext) => boolean,
): PopWindowModule {
  return {
    id,
    matches: (context) => Boolean(matches(context) && stageView(id, context).visible),
    describe: (context) => stageView(id, context).descriptor,
    render: (context) => stageView(id, context).content,
    bind: (root, context) => stageView(id, context).bind(root),
  };
}

export function bindInteractiveRandomChoices(root: ParentNode, onChoice: (side: "left" | "right", value: 0 | 1) => void): void {
  root.querySelectorAll<HTMLButtonElement>(".interactive-random-choice:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => onChoice(button.dataset.randomSide === "right" ? "right" : "left", Number(button.dataset.randomValue) as 0 | 1));
  });
}

export class PopWindowRegistry {
  constructor(private readonly modules: readonly PopWindowModule[]) {
    const ids = modules.map((module) => module.id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate pop-window module id");
  }

  render(context: PopWindowContext): string {
    const active = this.resolve(context);
    return active.map((module) => this.renderModule(module, context)).join("");
  }

  bind(context: PopWindowContext): void {
    this.resolve(context).forEach((module) => {
      const root = document.querySelector<HTMLElement>(`[data-pop-window-id="${module.id}"]`);
      if (root) module.bind(root, context);
    });
  }

  private resolve(context: PopWindowContext): PopWindowModule[] {
    const matches = this.modules.filter((module) => module.matches(context));
    const primary = matches.filter((module) => module.describe(context).variant === "stage");
    if (primary.length > 1) {
      throw new Error(`Phase ${context.phase} matched multiple primary pop windows: ${primary.map((item) => item.id).join(", ")}`);
    }
    const sorted = matches.sort((left, right) => left.describe(context).layer - right.describe(context).layer);
    const minimized = sorted.filter((module) => module.describe(context).variant === "minimized");
    const visibleMinimized = minimized[minimized.length - 1];
    return sorted.filter((module) => module.describe(context).variant !== "minimized" || module === visibleMinimized);
  }

  private renderModule(module: PopWindowModule, context: PopWindowContext): string {
    const descriptor = module.describe(context);
    const content = module.render(context);
    const legacy = descriptor.legacy ?? {};
    const timing = descriptor.timing === "phase" ? this.renderProgress(context, legacy.progress ?? "") : "";
    const footer = context.audience ? "" : this.renderFooter(content, legacy.footer ?? "");
    const body = content.omitBody
      ? ""
      : `<div class="pop-window-body ${escapeHtml(legacy.body ?? "")}">${content.body}</div>`;
    const controls = descriptor.variant === "minimized"
      ? `<button class="pop-window-control selector-icon-button" type="button" data-pop-window-control="restore" title="放大" aria-label="放大并展开当前操作面板"><svg class="pop-window-restore-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" /></svg></button>`
      : descriptor.minimizable
        ? `<button class="pop-window-control selector-icon-button minimize-window-button" type="button" data-pop-window-control="minimize" title="最小化" aria-label="最小化当前操作面板">−</button>`
        : "";
    const header = `
      <header class="pop-window-header ${escapeHtml(legacy.header ?? "")}">
        <div class="pop-window-heading">
          ${descriptor.eyebrow ? `<span class="selector-eyebrow">${escapeHtml(descriptor.eyebrow)}</span>` : ""}
          <h2>${escapeHtml(descriptor.title)}</h2>
          ${descriptor.headerDetails?.length ? `<div class="pop-window-heading-details">${descriptor.headerDetails.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="pop-window-header-actions">
          ${descriptor.meta ? `<strong>${escapeHtml(descriptor.meta)}</strong>` : ""}
          ${controls}
        </div>
      </header>`;

    if (descriptor.variant === "minimized") {
      return `
        <aside class="pop-window pop-window-minimized ${escapeHtml(legacy.overlay ?? "")}" data-pop-window-id="${module.id}" style="--pop-window-layer:${descriptor.layer}" aria-label="${escapeHtml(descriptor.ariaLabel)}">
          ${header}${timing}
        </aside>`;
    }

    const role = descriptor.variant === "floating" ? "status" : "dialog";
    const modal = descriptor.variant === "confirmation" ? "true" : "false";
    return `
      <section class="pop-window-overlay pop-window-${descriptor.variant} ${escapeHtml(legacy.overlay ?? "")}" data-pop-window-id="${module.id}" style="--pop-window-layer:${descriptor.layer}" role="${role}" aria-modal="${modal}" aria-label="${escapeHtml(descriptor.ariaLabel)}">
        <div class="pop-window-panel ${content.omitBody ? "pop-window-panel-no-body" : ""} pop-window-size-${descriptor.size} ${escapeHtml(legacy.panel ?? "")}">
          ${header}
          ${timing}
          ${body}
          ${footer}
        </div>
      </section>`;
  }

  private renderProgress(context: PopWindowContext, legacyClass: string): string {
    return `
      <div class="pop-window-progress ${escapeHtml(legacyClass)}" data-pop-window-progress style="--progress-width:${context.countdown.percent}%">
        <span class="countdown-bar"></span>
        <time class="countdown-time">${formatCountdown(context.countdown.remaining)}</time>
      </div>`;
  }

  private renderFooter(content: PopWindowContent, legacyClass: string): string {
    const actions = (content.footerActions ?? []).filter((action) => !action.hidden);
    const hasCopy = Boolean(content.footerMessage || content.footerStatus);
    if (!hasCopy && actions.length === 0) return "";
    const actionsMarkup = actions.length ? `<div class="pop-window-footer-actions">
      ${actions.map((action) => {
        const waitingStatus = action.disabled && /^(等待|直播只读)/.test(action.label);
        return `
        <button
          type="button"
          data-pop-window-action="${escapeHtml(action.action)}"
          class="pop-window-action pop-window-action-${action.tone} ${waitingStatus ? "pop-window-action-waiting" : ""} ${escapeHtml(action.className ?? "")}"
          ${action.id ? `id="${escapeHtml(action.id)}"` : ""}
          ${action.disabled ? "disabled" : ""}
          ${action.title ? `title="${escapeHtml(action.title)}"` : ""}
          ${action.ariaLabel ? `aria-label="${escapeHtml(action.ariaLabel)}"` : ""}
        >${escapeHtml(action.label)}</button>`;
      }).join("")}
    </div>` : "";

    if (!hasCopy) {
      return `<div class="pop-window-inline-actions">${actionsMarkup}</div>`;
    }

    return `
      <footer class="pop-window-footer ${actions.length ? "" : "pop-window-footer-copy-only"} ${escapeHtml(legacyClass)}">
        <div class="pop-window-footer-copy">
          ${content.footerStatus?.label ? `<span>${escapeHtml(content.footerStatus.label)}</span>` : ""}
          ${content.footerStatus ? `<strong>${escapeHtml(content.footerStatus.value)}</strong>` : ""}
          ${content.footerMessage ? `<span class="phase-readonly-label">${escapeHtml(content.footerMessage)}</span>` : ""}
        </div>
        ${actionsMarkup}
      </footer>`;
  }
}

function formatCountdown(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
