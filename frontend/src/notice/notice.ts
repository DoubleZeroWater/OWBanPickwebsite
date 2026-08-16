import "./notice.css";
import type { MatchNotificationEvent } from "../state/protocol";

export type NoticeSegment = { text: string; strong?: boolean };

export type NoticeContent = {
  segments: NoticeSegment[];
};

export type NoticeContext = {
  mapName: (value: string) => string;
  heroName: (value: string) => string;
};

export interface NoticeModule {
  readonly id: string;
  readonly eventTypes: readonly string[];
  matches(event: MatchNotificationEvent): boolean;
  format(event: MatchNotificationEvent, context: NoticeContext): NoticeContent;
}

type RenderedNotice = NoticeContent & { id: string; createdAt: number };

export function payloadText(event: MatchNotificationEvent, key: string): string {
  return String(event.payload[key] ?? "");
}

export function payloadTeam(event: MatchNotificationEvent): string {
  return payloadText(event, "teamName")
    || payloadText(event, "winnerTeam")
    || payloadText(event, "loserTeam");
}

export function payloadAction(event: MatchNotificationEvent, key: string): string {
  const value = payloadText(event, key);
  return value.endsWith("阶段") ? value.slice(0, -2) : value;
}

export function textNotice(text: string): NoticeContent {
  return { segments: [{ text }] };
}

export function matchesStageText(event: MatchNotificationEvent, needles: readonly string[]): boolean {
  const value = [
    payloadText(event, "selectionType"),
    payloadText(event, "decisionType"),
    payloadText(event, "rightLabel"),
  ].join(" ");
  return needles.some((needle) => value.includes(needle));
}

export class NoticeCenter {
  private readonly seenIds = new Set<string>();
  private readonly activeIds = new Set<string>();
  private readonly history: RenderedNotice[] = [];

  constructor(
    private readonly modules: readonly NoticeModule[],
    private readonly context: NoticeContext,
    private durationSeconds = 20,
  ) {}

  setDuration(seconds: number): void {
    this.durationSeconds = Math.max(1, Number(seconds) || 20);
  }

  ingest(events: readonly MatchNotificationEvent[]): void {
    for (const event of events) {
      if (!event.eventId || this.seenIds.has(event.eventId)) continue;
      this.seenIds.add(event.eventId);
      const module = this.resolve(event);
      const content = module
        ? module.format(event, this.context)
        : textNotice("比赛状态已更新");
      this.push({ id: event.eventId, createdAt: event.occurredAt, ...content });
    }
  }

  showLocal(message: string): void {
    this.push({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      ...textNotice(message),
    });
  }

  private resolve(event: MatchNotificationEvent): NoticeModule | null {
    const matches = this.modules.filter((module) => (
      module.eventTypes.includes(event.eventType) && module.matches(event)
    ));
    if (matches.length > 1) {
      throw new Error(`Notification ${event.eventType} matched multiple modules: ${matches.map((item) => item.id).join(", ")}`);
    }
    return matches[0] ?? null;
  }

  private push(notice: RenderedNotice): void {
    this.history.push(notice);
    if (this.history.length > 100) this.history.splice(0, this.history.length - 100);
    this.show(notice);
  }

  private ensureStack(): HTMLElement {
    let stack = document.getElementById("matchNotificationStack");
    if (!stack) {
      stack = document.createElement("section");
      stack.id = "matchNotificationStack";
      stack.className = "match-notification-stack";
      stack.setAttribute("aria-label", "比赛动态提示");
      document.body.append(stack);
    }
    return stack;
  }

  private close(id: string): void {
    const item = document.querySelector<HTMLElement>(`[data-notification-id="${CSS.escape(id)}"]`);
    if (!item) return;
    item.classList.add("is-closing");
    window.setTimeout(() => item.remove(), 180);
    this.activeIds.delete(id);
  }

  private show(notice: RenderedNotice): void {
    if (this.activeIds.has(notice.id)) return;
    this.activeIds.add(notice.id);
    const item = document.createElement("article");
    item.className = "match-notification";
    item.dataset.notificationId = notice.id;
    item.setAttribute("role", "status");
    item.style.setProperty("--notification-duration", `${this.durationSeconds}s`);

    const icon = document.createElement("span");
    icon.className = "match-notification-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "i";

    const content = document.createElement("p");
    notice.segments.forEach((segment) => {
      const element = document.createElement(segment.strong ? "strong" : "span");
      element.textContent = segment.text;
      content.append(element);
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "match-notification-close";
    closeButton.setAttribute("aria-label", "关闭提示");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.close(notice.id));

    const progress = document.createElement("span");
    progress.className = "match-notification-progress";
    progress.setAttribute("aria-hidden", "true");
    item.append(icon, content, closeButton, progress);
    this.ensureStack().append(item);
    window.setTimeout(() => this.close(notice.id), this.durationSeconds * 1000);
  }
}
