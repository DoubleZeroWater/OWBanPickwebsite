import { createPopWindowModule, type PopWindowView } from "./pop-window";
import { escapeHtml } from "../utils";

export const pauseWindow = createPopWindowModule("pause", () => true);
export const confirmationWindow = createPopWindowModule("confirmation", () => true);

export function createPauseView(model: { active: boolean; elapsed: string; admin: boolean }, actions: { resume(): void }): PopWindowView {
  return {
    visible: model.active,
    descriptor: {
      ariaLabel: "比赛已全局暂停", eyebrow: "全局暂停", title: "暂停中", meta: model.elapsed,
      variant: "floating", size: "compact", layer: 80, timing: "none", minimizable: false,
      legacy: { overlay: "pause-overlay", panel: "pause-panel", body: "pause-copy", footer: "pause-footer" },
    },
    content: {
      body: "",
      omitBody: true,
      footerActions: model.admin ? [{ action: "resume-pause", label: "恢复时间", tone: "primary", id: "resumeGlobalTimer", className: "resume-button" }] : [],
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-action="resume-pause"]')?.addEventListener("click", actions.resume);
    },
  };
}

export function createConfirmationView(model: {
  visible: boolean; title: string; summary: string; inlineSummary?: boolean; headerDetails?: string[];
}, actions: { cancel(): void; accept(): void }): PopWindowView {
  return {
    visible: model.visible,
    descriptor: {
      ariaLabel: model.title || "确认操作", eyebrow: model.inlineSummary ? "等待确认" : "请确认", title: model.title || "确认操作", headerDetails: model.headerDetails,
      variant: "confirmation", size: "compact", layer: 100, timing: "none", minimizable: false,
      legacy: { overlay: "selection-confirmation-overlay", panel: `selection-confirmation-panel${model.inlineSummary ? " selection-confirmation-inline-panel" : ""}` },
    },
    content: {
      body: model.inlineSummary ? "" : `<pre>${escapeHtml(model.summary)}</pre>`,
      omitBody: model.inlineSummary,
      footerActions: [
        { action: "cancel-confirmation", label: "返回修改", tone: "secondary", id: "cancelSelectionConfirmation" },
        { action: "accept-confirmation", label: "确认", tone: "primary", id: "acceptSelectionConfirmation", className: "start-match-button" },
      ],
    },
    bind: (root) => {
      root.querySelector('[data-pop-window-action="cancel-confirmation"]')?.addEventListener("click", actions.cancel);
      root.querySelector('[data-pop-window-action="accept-confirmation"]')?.addEventListener("click", actions.accept);
    },
  };
}
