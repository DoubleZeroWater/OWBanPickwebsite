import { getLandingPortalLabel } from "./landing";
import type { AdminRoom, RoomHistorySummary } from "./types";
import { escapeHtml } from "./utils";

export function renderAdminSectionHeader(title: string, description: string, count = ""): string {
  return `
    <header class="admin-section-header">
      <div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
      ${count ? `<span>${escapeHtml(count)}</span>` : ""}
    </header>`;
}

export function renderAdminSettingRow(title: string, description: string, control: string): string {
  return `
    <label class="admin-setting-row">
      <span class="admin-setting-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
      <span class="admin-setting-control">${control}</span>
    </label>`;
}

export function renderAdminRoom(room: AdminRoom): string {
  const isClosed = Boolean(room.closedAt);
  return `
    <article class="admin-room-card active-admin-room-card">
      <header>
        <span class="room-status ${isClosed ? "room-status-closed" : "room-status-active"}">${isClosed ? "已关闭" : "活跃"}</span>
        <strong>房间 ${escapeHtml(room.id)}</strong>
        <button class="close-admin-room" data-room-id="${escapeHtml(room.id)}" type="button" ${isClosed ? "disabled" : ""}>关闭房间</button>
      </header>
      <p>创建：${formatTimestamp(room.createdAt)}，最后活跃：${formatTimestamp(room.lastActiveAt)}${room.closedAt ? `，关闭：${formatTimestamp(room.closedAt)}` : ""}</p>
      <div class="admin-room-links">
        ${Object.entries(room.links).map(([code, link]) => `
          <div>
            <span>${escapeHtml(getLandingPortalLabel(code))}</span><code>${escapeHtml(link.hash)}</code>
            <button class="copy-link-button" data-copy-value="${escapeHtml(link.url)}" type="button">复制</button>
          </div>`).join("")}
      </div>
    </article>`;
}

export function renderRoomHistorySummary(history: RoomHistorySummary, globalAdminHash: string): string {
  const statusLabels: Record<RoomHistorySummary["status"], string> = {
    active: "活跃",
    closed: "手动关闭",
    expired: "超时归档",
  };
  const historyBaseUrl = `/api/admin/${encodeURIComponent(globalAdminHash)}/room-history/${encodeURIComponent(history.archiveKey)}`;
  return `
    <article class="history-room-row">
      <span class="history-status history-status-${escapeHtml(history.status)}">${statusLabels[history.status]}</span>
      <div class="history-room-identity"><strong>房间 ${escapeHtml(history.roomId)}</strong><code>${escapeHtml(history.archiveKey)}</code></div>
      <div class="history-room-time">
        <span>创建：${formatTimestamp(history.createdAt)}</span>
        <span>更新：${formatTimestamp(history.updatedAt)}${history.closedAt ? `，关闭：${formatTimestamp(history.closedAt)}` : ""}</span>
      </div>
      <div class="history-room-stats"><span>版本 ${history.currentVersion}，共 ${history.operationCount} 条操作</span>${history.closeReason ? `<small>${escapeHtml(history.closeReason)}</small>` : ""}</div>
      <div class="history-card-actions">
        <button class="view-room-history" data-archive-key="${escapeHtml(history.archiveKey)}" type="button">查看</button>
        <a class="download-room-history" href="${escapeHtml(`${historyBaseUrl}/download`)}" download="${escapeHtml(`${history.archiveKey}.json`)}">下载</a>
      </div>
    </article>`;
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
