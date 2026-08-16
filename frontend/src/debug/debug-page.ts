import "./debug-page.css";
import type { AuthoritativeRuntime, AuthoritativeStatus, MatchNotificationEvent } from "../state/protocol";
import type { MapCatalogState, PortalConfig } from "../types";
import { DEBUG_NOTIFICATION_SCENARIOS } from "./notification-scenarios";
import { createDebugScenarios, DEBUG_SCENARIO_IDS, type DebugScenarioId } from "./scenarios";

export interface DebugPageHost {
  catalog: MapCatalogState;
  canonicalConfig: Record<string, unknown>;
  applyScenario: (
    status: AuthoritativeStatus,
    runtime: AuthoritativeRuntime,
    portal: PortalConfig,
  ) => void;
  showNotification: (event: MatchNotificationEvent) => void;
}

const PORTALS = {
  left: { code: "A", role: "blue-team", label: "左队入口", side: "left" },
  right: { code: "B", role: "red-team", label: "右队入口", side: "right" },
  admin: { code: "C", role: "admin", label: "管理员入口", side: null },
  broadcast: { code: "D", role: "broadcast", label: "直播入口", side: null },
} as const satisfies Record<string, PortalConfig>;

type DebugPortalId = keyof typeof PORTALS;
const PORTAL_IDS = Object.keys(PORTALS) as DebugPortalId[];
const DEFAULT_PORTAL: DebugPortalId = "admin";
const DEFAULT_SCENARIO: DebugScenarioId = "map-pick";
const APPROVED_PRESENTATION_CLASSES = [
  "preview-waiting-text",
  "preview-confirm-green",
  "preview-broadcast-minimal",
] as const;

export function startDebugPage(host: DebugPageHost): void {
  const scenarios = createDebugScenarios(host.catalog, host.canonicalConfig);
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const query = new URLSearchParams(window.location.search);
  const requestedPortal = query.get("portal");
  const requestedScenario = query.get("phase");
  const requestedNotification = query.get("notification");
  let activePortal: DebugPortalId = isPortalId(requestedPortal) ? requestedPortal : DEFAULT_PORTAL;
  let activeScenario: DebugScenarioId = isScenarioId(requestedScenario) ? requestedScenario : DEFAULT_SCENARIO;

  document.title = "OW Ban Pick Debug";
  document.body.classList.add("debug-page-body", ...APPROVED_PRESENTATION_CLASSES);
  document.querySelector("[data-debug-toolbar]")?.remove();

  const toolbar = document.createElement("aside");
  toolbar.className = "debug-toolbar";
  toolbar.dataset.debugToolbar = "true";
  toolbar.setAttribute("aria-label", "前端阶段调试工具栏");
  toolbar.innerHTML = `
    <div class="debug-toolbar-heading">
      <strong>UI DEBUG</strong>
      <span>本地状态，不连接房间</span>
    </div>
    <div class="debug-toolbar-row" role="group" aria-label="入口视角">
      <span class="debug-toolbar-label">入口</span>
      <div class="debug-toolbar-scroll">
        ${PORTAL_IDS.map((id) => `<button type="button" data-debug-portal="${id}">${portalLabel(id)}</button>`).join("")}
      </div>
    </div>
    <div class="debug-toolbar-row" role="group" aria-label="阶段场景">
      <span class="debug-toolbar-label">阶段</span>
      <div class="debug-toolbar-scroll">
        ${scenarios.map((scenario, index) => {
          const previous = scenarios[index - 1];
          const group = !previous || previous.group !== scenario.group
            ? `<span class="debug-toolbar-group">${scenario.group}</span>`
            : "";
          return `${group}<button type="button" data-debug-scenario="${scenario.id}">${scenario.label}</button>`;
        }).join("")}
      </div>
    </div>`;
  document.body.prepend(toolbar);

  function render(): void {
    const scenario = scenarioById.get(activeScenario) ?? scenarioById.get(DEFAULT_SCENARIO);
    if (!scenario) throw new Error("Debug scenario registry is empty");
    activeScenario = scenario.id;
    toolbar.querySelectorAll<HTMLButtonElement>("[data-debug-portal]").forEach((button) => {
      const selected = button.dataset.debugPortal === activePortal;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    toolbar.querySelectorAll<HTMLButtonElement>("[data-debug-scenario]").forEach((button) => {
      const selected = button.dataset.debugScenario === activeScenario;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const nextQuery = new URLSearchParams(window.location.search);
    nextQuery.set("portal", activePortal);
    nextQuery.set("phase", activeScenario);
    nextQuery.delete("waiting");
    nextQuery.delete("confirm");
    nextQuery.delete("broadcast");
    window.history.replaceState(null, "", `${window.location.pathname}?${nextQuery.toString()}`);
    host.applyScenario(
      structuredClone(scenario.status),
      structuredClone(scenario.runtime),
      { ...PORTALS[activePortal] },
    );
    const notification = DEBUG_NOTIFICATION_SCENARIOS.find(({ id }) => id === requestedNotification);
    if (notification) {
      host.showNotification({
        ...structuredClone(notification.event),
        eventId: `${notification.event.eventId}-${Date.now()}`,
        occurredAt: Date.now(),
      });
    }
  }

  toolbar.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    const portal = button.dataset.debugPortal;
    const scenario = button.dataset.debugScenario;
    if (isPortalId(portal)) activePortal = portal;
    if (isScenarioId(scenario)) activeScenario = scenario;
    render();
  });

  render();
}

function isPortalId(value: string | undefined | null): value is DebugPortalId {
  return Boolean(value && PORTAL_IDS.includes(value as DebugPortalId));
}

function isScenarioId(value: string | undefined | null): value is DebugScenarioId {
  return Boolean(value && DEBUG_SCENARIO_IDS.includes(value as DebugScenarioId));
}

function portalLabel(id: DebugPortalId): string {
  if (id === "left") return "左队";
  if (id === "right") return "右队";
  if (id === "broadcast") return "直播";
  return "管理员";
}
