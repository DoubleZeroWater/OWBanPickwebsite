import {
  renderAdminRoom,
  renderAdminSectionHeader,
  renderAdminSettingRow,
  renderRoomHistorySummary,
} from "../../admin";
import type {
  AdminRoom,
  AdminSettings,
  CatalogMaintenance,
  ConfigPreset,
  RoomHistoryPage,
  TranslationDiagnostics,
} from "../../types";
import { escapeHtml } from "../../utils";
import { formatTimestamp } from "../../admin";

export interface GlobalAdminViewModel {
  settings: AdminSettings;
  rooms: AdminRoom[];
  history: RoomHistoryPage;
  presets: ConfigPreset[];
  maintenance: CatalogMaintenance | null;
  presetManager: string;
  adminHash: string;
  message: string;
  pendingCloseRoomId: string | null;
  catalogTemplateDraft: string;
  catalogTranslationDraft: string;
  catalogDialogNotice: string;
}

export function renderGlobalAdminPageMarkup(model: GlobalAdminViewModel): string {
  const { settings, rooms, history, presets } = model;
  const pageCount = Math.max(1, Math.ceil(history.total / history.pageSize));
  return `
    <main class="page-shell global-admin-shell">
      <header class="global-admin-page-heading">
        <div><span>管理设置</span><h1>全局管理</h1><p>管理房间限制、默认配置模板和历史记录。</p></div>
      </header>
      ${model.message ? `<p class="admin-notice global-admin-notice">${escapeHtml(model.message)}</p>` : ""}
      <section class="global-admin-panel admin-settings-panel">
        ${renderAdminSectionHeader("常规设置", "创建房间时使用的全局规则。")}
        <div class="admin-setting-list">
          ${renderAdminSettingRow("每 IP 每小时创建数", "限制单个 IP 地址每小时最多可以创建的房间数量。", `<input id="adminRoomsPerHour" type="number" min="1" max="500" value="${settings.roomsPerHour}" />`)}
          ${renderAdminSettingRow("不活跃关闭分钟数", "房间在指定分钟内没有活动时自动关闭并归档。", `<input id="adminInactiveTimeout" type="number" min="1" max="43200" value="${settings.inactiveTimeoutMinutes}" />`)}
          ${renderAdminSettingRow("关键节点提示秒数", "右上角比赛动态提示自动关闭前的显示时间。", `<input id="adminNotificationDuration" type="number" min="1" max="300" value="${settings.notificationDurationSeconds}" />`)}
          ${renderAdminSettingRow("新房间默认模板", "选择新建房间时自动复制的配置模板。", `<select id="adminDefaultPreset"><option value="">网站内置默认配置</option>${presets.map((preset) => `<option value="${escapeHtml(preset.id)}" ${settings.defaultPresetId === preset.id ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}</select>`)}
        </div>
        <footer class="admin-section-footer">
          <button id="saveGlobalSettings" class="admin-primary-button" type="button">保存全局设置</button>
          <div id="globalSettingsSaveFeedback" class="admin-save-feedback" aria-live="polite"></div>
        </footer>
      </section>
      ${renderCatalogMaintenancePanel(model.maintenance)}
      ${model.presetManager}
      <section class="global-admin-panel">
        ${renderAdminSectionHeader("房间列表", "查看当前活动房间并复制各入口地址。", `${rooms.length} 间`)}
        <div class="admin-room-list">${rooms.map(renderAdminRoom).join("") || `<p class="empty-room-list">暂无房间</p>`}</div>
      </section>
      <section class="global-admin-panel">
        ${renderAdminSectionHeader("永久历史", "已归档房间的状态、时间和操作记录。", `${history.total} 份 JSON`)}
        <div class="history-list-heading" aria-hidden="true"><span>状态</span><span>房间</span><span>时间</span><span>版本与操作</span><span>操作</span></div>
        <div class="admin-room-list history-room-list">${history.items.map((item) => renderRoomHistorySummary(item, model.adminHash)).join("") || `<p class="empty-room-list">暂无历史记录</p>`}</div>
        <nav class="history-pagination" aria-label="历史分页">
          <button id="previousHistoryPage" type="button" ${history.page <= 1 ? "disabled" : ""}>上一页</button>
          <span>第 ${history.page} / ${pageCount} 页</span>
          <button id="nextHistoryPage" type="button" ${history.page >= pageCount ? "disabled" : ""}>下一页</button>
        </nav>
      </section>
      ${renderGlobalAdminDialogs(model)}
    </main>
  `;
}

function renderGlobalAdminDialogs(model: GlobalAdminViewModel): string {
  return `
    <dialog id="roomHistoryDialog" class="history-dialog">
      <header><strong id="roomHistoryDialogTitle">房间历史 JSON</strong><button id="closeRoomHistoryDialog" type="button" aria-label="关闭历史详情">关闭</button></header>
      <pre id="roomHistoryJson">正在载入...</pre>
    </dialog>
    <dialog id="closeAdminRoomDialog" class="history-dialog admin-confirm-dialog" aria-labelledby="closeAdminRoomDialogTitle">
      <header><strong id="closeAdminRoomDialogTitle">关闭房间</strong><button id="cancelCloseAdminRoom" type="button">取消</button></header>
      <p>关闭后房间会立即归档，所有比赛入口将停止使用。确认关闭房间 ${escapeHtml(model.pendingCloseRoomId ?? "")}？</p>
      <footer><button id="confirmCloseAdminRoom" class="danger-button" type="button">确认关闭</button></footer>
    </dialog>
    <dialog id="catalogTemplateDialog" class="history-dialog catalog-json-dialog" aria-labelledby="catalogTemplateDialogTitle">
      <header><strong id="catalogTemplateDialogTitle">英文到中文映射模板</strong><button class="close-catalog-dialog" type="button" aria-label="关闭映射模板">关闭</button></header>
      <p>已尝试自动复制。若浏览器拒绝，请使用下方的手动复制按钮。</p>
      <textarea id="catalogTemplateJson" readonly spellcheck="false">${escapeHtml(model.catalogTemplateDraft)}</textarea>
      <footer><span id="catalogTemplateCopyStatus">${escapeHtml(model.catalogDialogNotice)}</span><button id="copyCatalogTemplate" class="admin-secondary-button" type="button">手动复制</button></footer>
    </dialog>
    <dialog id="catalogTranslationDialog" class="history-dialog catalog-json-dialog" aria-labelledby="catalogTranslationDialogTitle">
      <header><strong id="catalogTranslationDialogTitle">更新中文映射</strong><button class="close-catalog-dialog" type="button" aria-label="关闭中文映射">关闭</button></header>
      <p>粘贴完整 JSON。键或目录哈希不匹配时会保存，但网站将统一显示英文。</p>
      <textarea id="catalogTranslationJson" spellcheck="false" placeholder="在此粘贴 JSON">${escapeHtml(model.catalogTranslationDraft)}</textarea>
      <footer><span id="catalogTranslationStatus"></span><button id="saveCatalogTranslation" class="admin-primary-button" type="button">保存映射</button></footer>
    </dialog>
  `;
}

function renderCatalogMaintenancePanel(maintenance: CatalogMaintenance | null): string {
  if (!maintenance) return "";
  const { counts, translation, job } = maintenance;
  const isRunning = job?.status === "queued" || job?.status === "running";
  const sourceLabel = maintenance.catalogSource === "runtime" ? "管理员爬取数据" : "内置数据";
  const updatedAt = maintenance.updatedAt ? formatTimestamp(maintenance.updatedAt) : "未知";
  const progress = isRunning
    ? `<div class="catalog-refresh-progress"><div style="width:${Math.max(0, Math.min(100, job?.progress ?? 0))}%"></div></div><p>${escapeHtml(job?.message ?? "正在更新")}</p>`
    : job?.status === "failed"
      ? `<p class="catalog-maintenance-error">${escapeHtml(job.message)}：${escapeHtml(job.error ?? "未知错误")}</p>`
      : "";
  return `
    <section class="global-admin-panel catalog-maintenance-panel">
      ${renderAdminSectionHeader("英雄与地图数据", "从英文 Fandom 更新正式英雄和五类标准比赛地图。", `${counts.heroes} 位英雄，${counts.maps} 张地图`)}
      <div class="catalog-maintenance-summary">
        <dl>
          <div><dt>当前目录</dt><dd>${escapeHtml(sourceLabel)}</dd></div>
          <div><dt>模式</dt><dd>${counts.modes}</dd></div>
          <div><dt>上次更新</dt><dd>${escapeHtml(updatedAt)}</dd></div>
          <div><dt>显示语言</dt><dd class="${translation.active ? "is-valid" : "is-invalid"}">${escapeHtml(translation.active ? "中文映射有效" : "映射不匹配，当前全英文")}</dd></div>
        </dl>
        ${renderTranslationDiagnostics(translation.diagnostics)}${progress}
      </div>
      <footer class="admin-section-footer">
        <button id="refreshEnglishCatalog" class="admin-primary-button" type="button" ${isRunning ? "disabled" : ""}>${isRunning ? "正在爬取..." : "爬取英文更新"}</button>
        <button id="openCatalogTranslation" class="admin-secondary-button" type="button">更新中文映射</button>
      </footer>
    </section>
  `;
}

function renderTranslationDiagnostics(diagnostics: TranslationDiagnostics): string {
  if (diagnostics.valid) return `<p class="catalog-diagnostics is-valid">目录哈希、键集合和全部中文值均匹配。</p>`;
  const lines: string[] = [];
  if (diagnostics.versionMismatch) lines.push("格式版本不匹配");
  if (diagnostics.hashMismatch) lines.push("目录哈希不匹配");
  if (diagnostics.typeErrors.length) lines.push(`字段类型错误：${diagnostics.typeErrors.join("、")}`);
  (["modes", "maps", "heroes"] as const).forEach((category) => {
    const label = { modes: "模式", maps: "地图", heroes: "英雄" }[category];
    if (diagnostics.missing[category].length) lines.push(`${label}缺少：${diagnostics.missing[category].join("、")}`);
    if (diagnostics.extra[category].length) lines.push(`${label}多出：${diagnostics.extra[category].join("、")}`);
    if (diagnostics.blank[category].length) lines.push(`${label}未填写：${diagnostics.blank[category].join("、")}`);
  });
  return `<details class="catalog-diagnostics"><summary>查看映射问题（${lines.length} 类）</summary><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details>`;
}
