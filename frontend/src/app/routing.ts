import type { AppMode, PortalConfig } from "../types";


function roomHash(): string | null {
  if (!window.location.pathname.startsWith("/r/")) return null;
  return decodeURIComponent(window.location.pathname.slice(3)).trim() || null;
}

export function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Missing #app root element");
  return root;
}

export function getRoomTokenFromPath(): string | null {
  const hash = roomHash();
  return hash && /^[0-9a-z]{4}$/.test(hash) ? hash : null;
}

export function getUnlimitedCreateHashFromPath(): string | null {
  const hash = roomHash();
  return hash && hash.length > 4 ? hash : null;
}

export function getGlobalAdminHashFromPath(): string | null {
  if (!window.location.pathname.startsWith("/admin/")) return null;
  return decodeURIComponent(window.location.pathname.slice(7)).trim() || null;
}

export function getAppMode(): AppMode {
  const path = window.location.pathname;
  if (path === "/debug") return "debug";
  if (path.startsWith("/r/")) return getUnlimitedCreateHashFromPath() ? "landing" : "room";
  if (path.startsWith("/admin/")) return "global-admin";
  return "landing";
}

export function getPortalConfig(appMode: AppMode): PortalConfig {
  if (appMode === "room") {
    return { code: "A", role: "blue-team", label: "房间入口", side: "left" };
  }
  const code = window.location.pathname.replace("/", "").trim().toUpperCase() || "A";
  const configs: Record<string, PortalConfig> = {
    A: { code: "A", role: "blue-team", label: "队伍1入口", side: "left" },
    B: { code: "B", role: "red-team", label: "队伍2入口", side: "right" },
    C: { code: "C", role: "admin", label: "管理员入口", side: null },
    D: { code: "D", role: "broadcast", label: "直播入口", side: null },
  };
  return configs[code] ?? configs.A;
}
