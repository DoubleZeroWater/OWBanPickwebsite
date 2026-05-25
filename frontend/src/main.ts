import "./styles.css";

type Side = "left" | "right";
type MapStatus = "completed" | "after" | "tbd";
type ScoreValue = number | string | null;
type MapSelectionMode =
  | "unique_map"
  | "unique_mode_until_cycle"
  | "first_mode_then_unique_mode"
  | "strict_mode_order"
  | "fixed_map_order";
type PlayerInputMode = "free_input" | "preset_only" | "skip";
type FirstBanPolicy = "allow_loser_choose" | "loser_must_first" | "no_ban";
type LineupRole = "damage" | "tank" | "support";
type PortalRole = "red-team" | "blue-team" | "admin" | "broadcast";
type BanStep = "order-choice" | "first-ban" | "second-ban";
type BanOrderChoice = "first" | "second";
type ScoreReportMode = "admin_only" | "team_submit_opponent_confirm";
type OverlayKind = "map" | "lineup" | "ban" | "score" | "rest";
type CheckpointKey = keyof SettingsState["checkpoints"][number];
type MatchFormat = "ft2" | "ft3" | "ft4";
type OpeningSidePolicy = "random" | "red" | "blue";

interface TeamState {
  id: string;
  name: string;
  seriesScore: number;
  seed: number;
}

interface HeroBan {
  hero: string;
  nameEn: string;
  role: string;
  imageUrl: string;
}

interface MatchMap {
  id: string;
  mode: string | null;
  modeIconUrl: string | null;
  nameZh: string | null;
  nameEn: string | null;
  status: MapStatus;
  imageUrl: string;
  score: Record<Side, ScoreValue>;
  bans: Record<Side, HeroBan | null>;
  firstBanSide: Side | null;
}

interface MatchState {
  roomCode: string;
  matchName: string;
  phase: string;
  currentCountdownSeconds: number;
  currentOperation: string;
  teams: Record<Side, TeamState>;
  maps: MatchMap[];
}

interface StageSetting {
  preStartRestSeconds: number;
  mapSelectSeconds: number;
  playerSelectSeconds: number;
  firstBanChoiceSeconds: number;
  firstBanActionSeconds: number;
  secondBanActionSeconds: number;
  scoreConfirmSeconds: number;
  postMatchRestSeconds: number;
}

interface CheckpointConfig {
  enabled: boolean;
  label: string;
}

interface SettingsState {
  matchFormat: MatchFormat;
  stageCount: number;
  checkpoints: Array<{
    preCountdown: CheckpointConfig;
    mapPick: CheckpointConfig;
    lineupPick: CheckpointConfig;
    firstSecondBanChoice: CheckpointConfig;
    firstBan: CheckpointConfig;
    secondBan: CheckpointConfig;
    scorePick: CheckpointConfig;
  }>;
  stageLimits: StageSetting;
  mapPool: Record<string, string[]>;
  mapSelectionMode: MapSelectionMode;
  firstMapMode: string;
  fixedMapOrderText: string;
  rosterMode: PlayerInputMode;
  presetRosterText: string;
  firstBanPolicy: FirstBanPolicy;
  openingSidePolicy: OpeningSidePolicy;
  scoreReportMode: ScoreReportMode;
}

interface ModeIcon {
  mode: string;
  imageUrl: string;
}

interface MapCatalogItem {
  mode: string;
  nameEn: string;
  imageUrl: string;
  pageUrl?: string;
  fileName?: string;
}

interface HeroCatalogItem {
  nameEn: string;
  role: string;
  roleZh: string;
  imageUrl: string;
}

interface MapCatalogState {
  modes: string[];
  modeIcons: Record<string, ModeIcon>;
  maps: Record<string, MapCatalogItem[]>;
  heroes: HeroCatalogItem[];
}

interface MapChoice extends MapCatalogItem {
  key: string;
  modeIconUrl: string | null;
}

interface MapAvailability {
  available: boolean;
  reason: string;
}

interface MapSelectorState {
  open: boolean;
  minimized: boolean;
  selectedMapKey: string | null;
  targetMapIndex: number;
  pickerSide: Side;
  timedOut: boolean;
}

interface LineupSlot {
  id: string;
  role: LineupRole;
  label: string;
}

interface LineupSelectorState {
  open: boolean;
  mapIndex: number;
  values: Record<Side, Record<string, string>>;
  ready: Record<Side, boolean>;
  timedOut: boolean;
}

interface BanSelectorState {
  open: boolean;
  mapIndex: number;
  step: BanStep;
  chooserSide: Side;
  activeSide: Side;
  firstBanSide: Side | null;
  selectedOrder: BanOrderChoice | null;
  selectedHeroKey: string | null;
  timedOut: boolean;
}

interface ScoreSelectorState {
  open: boolean;
  mapIndex: number;
  values: Record<Side, string>;
  submittedBy: Side | null;
  rejectedBy: Side | null;
  timedOut: boolean;
}

interface RestState {
  open: boolean;
  mapIndex: number;
  skipReady: Record<Side, boolean>;
}

interface PauseState {
  active: boolean;
  startedAt: number | null;
  totalPausedMs: number;
  collapsed: boolean;
}

interface TeamAckNotice {
  message: string;
  acknowledged: Record<Side, boolean>;
}

type ConfirmedLineups = Record<number, Record<Side, Record<string, string>>>;

interface PortalConfig {
  code: string;
  role: PortalRole;
  label: string;
  side: Side | null;
}

interface SharedRoomSnapshot {
  roomStarted: boolean;
  currentState: MatchState;
  settingsState: SettingsState;
  confirmedLineups: ConfirmedLineups;
  mapSelectorState: MapSelectorState | null;
  lineupSelectorState: LineupSelectorState | null;
  banSelectorState: BanSelectorState | null;
  scoreSelectorState: ScoreSelectorState | null;
  restState: RestState | null;
  pauseState: PauseState;
  teamAckNotice: TeamAckNotice | null;
  adminNotice: string | null;
  openingSide: Side;
  countdownStartedAt: number;
  countdownStartSeconds: number;
}

const lineupSlots: LineupSlot[] = [
  { id: "damage-1", role: "damage", label: "输出" },
  { id: "damage-2", role: "damage", label: "输出" },
  { id: "tank-1", role: "tank", label: "坦克" },
  { id: "support-1", role: "support", label: "辅助" },
  { id: "support-2", role: "support", label: "辅助" },
];

const checkpointKeys: CheckpointKey[] = [
  "preCountdown",
  "mapPick",
  "lineupPick",
  "firstSecondBanChoice",
  "firstBan",
  "secondBan",
  "scorePick",
];
const defaultMatchFormat: MatchFormat = "ft3";

const defaultSettings: SettingsState = {
  matchFormat: defaultMatchFormat,
  stageCount: getStageCountForMatchFormat(defaultMatchFormat),
  checkpoints: createDefaultCheckpoints(getStageCountForMatchFormat(defaultMatchFormat)),
  stageLimits: {
    preStartRestSeconds: 30,
    mapSelectSeconds: 45,
    playerSelectSeconds: 60,
    firstBanChoiceSeconds: 25,
    firstBanActionSeconds: 25,
    secondBanActionSeconds: 25,
    scoreConfirmSeconds: 30,
    postMatchRestSeconds: 120,
  },
  mapPool: {
    Control: ["Lijiang Tower", "Ilios", "Oasis", "Antarctic Peninsula"],
    Escort: ["Circuit Royal", "Dorado", "Rialto"],
    Hybrid: ["Hollywood", "King's Row", "Numbani"],
    Push: ["Colosseo", "New Queen Street", "Runasapi"],
    Flashpoint: ["Suravasa", "New Junk City"],
  },
  mapSelectionMode: "unique_map",
  firstMapMode: "Control",
  fixedMapOrderText: "Lijiang Tower\nKing's Row\nDorado\nColosseo\nSuravasa",
  rosterMode: "free_input",
  presetRosterText: "蓝色方: A1,A2,A3,A4,A5\n红色方: B1,B2,B3,B4,B5",
  firstBanPolicy: "allow_loser_choose",
  openingSidePolicy: "random",
  scoreReportMode: "admin_only",
};

function createDefaultCheckpoints(stageCount: number): SettingsState["checkpoints"] {
  return Array.from({ length: stageCount }, (_, index) => ({
    preCountdown: { enabled: index > 0, label: "开始前倒计时" },
    mapPick: { enabled: true, label: "选择地图" },
    lineupPick: { enabled: true, label: "选择上场成员" },
    firstSecondBanChoice: { enabled: true, label: "选择先后Ban" },
    firstBan: { enabled: true, label: "先手Ban" },
    secondBan: { enabled: true, label: "后手Ban" },
    scorePick: { enabled: true, label: "比分录入" },
  }));
}

const mapNameZhByEn: Record<string, string> = {
  "Aatlis": "阿特利斯",
  "Antarctic Peninsula": "南极半岛",
  "Blizzard World": "暴雪世界",
  "Busan": "釜山",
  "Circuit Royal": "皇家赛道",
  "Colosseo": "斗兽场",
  "Dorado": "多拉多",
  "Eichenwalde": "艾兴瓦尔德",
  "Esperança": "埃斯佩兰萨",
  "Havana": "哈瓦那",
  "Hollywood": "好莱坞",
  "Ilios": "伊利奥斯",
  "Junkertown": "渣客镇",
  "King's Row": "国王大道",
  "Lijiang Tower": "漓江塔",
  "Midtown": "中城",
  "Nepal": "尼泊尔",
  "New Junk City": "新渣客城",
  "New Queen Street": "新皇后街",
  "Numbani": "努巴尼",
  "Oasis": "绿洲城",
  "Paraíso": "帕拉伊苏",
  "Rialto": "里阿尔托",
  "Route 66": "66号公路",
  "Runasapi": "鲁纳萨皮",
  "Samoa": "萨摩亚",
  "Shambali Monastery": "香巴里寺院",
  "Suravasa": "苏拉瓦萨",
  "Watchpoint: Gibraltar": "监测站：直布罗陀",
};

const modeNameZhByEn: Record<string, string> = {
  Control: "控制",
  Escort: "运载目标",
  Flashpoint: "闪点作战",
  Hybrid: "攻击/护送",
  Push: "机动推进",
};

const app = getAppRoot();
const portalConfig = getPortalConfig();
const roomStorageKey = "ow-ban-pick-room-default-v5";
const roomChannel = "BroadcastChannel" in window ? new BroadcastChannel(roomStorageKey) : null;
let roomStarted = false;
let currentState: MatchState | null = null;
let mapCatalogState: MapCatalogState = { modes: [], modeIcons: {}, maps: {}, heroes: [] };
let settingsState: SettingsState = structuredClone(defaultSettings);
let settingsPanelOpen = false;
let mapSelectorState: MapSelectorState | null = null;
let lineupSelectorState: LineupSelectorState | null = null;
let banSelectorState: BanSelectorState | null = null;
let scoreSelectorState: ScoreSelectorState | null = null;
let restState: RestState | null = null;
let pauseState: PauseState = { active: false, startedAt: null, totalPausedMs: 0, collapsed: false };
let teamAckNotice: TeamAckNotice | null = null;
let hiddenOverlay: OverlayKind | null = null;
let adminNotice: string | null = null;
let openingSide: Side = resolveOpeningSide();
let confirmedLineups: ConfirmedLineups = {};
let countdownStartedAt = Date.now();
let countdownStartSeconds = defaultSettings.stageLimits.mapSelectSeconds;
let countdownTimerId: number | null = null;

renderShell(app);
void loadInitialData();
window.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("storage", handleStorageEvent);
roomChannel?.addEventListener("message", (event: MessageEvent<SharedRoomSnapshot>) => applySharedRoomSnapshot(event.data));

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Missing #app root element");
  }

  return root;
}

function getPortalConfig(): PortalConfig {
  const code = window.location.pathname.replace("/", "").trim().toUpperCase() || "A";
  const configs: Record<string, PortalConfig> = {
    A: { code: "A", role: "red-team", label: "红色队入口", side: "right" },
    B: { code: "B", role: "blue-team", label: "蓝色队入口", side: "left" },
    C: { code: "C", role: "admin", label: "管理员入口", side: null },
    D: { code: "D", role: "broadcast", label: "直播入口", side: null },
  };

  return configs[code] ?? configs.A;
}

function isAdminPortal(): boolean {
  return portalConfig.role === "admin";
}

function isBroadcastPortal(): boolean {
  return portalConfig.role === "broadcast";
}

function canUseSettings(): boolean {
  return isAdminPortal();
}

function canOperateMapSelection(): boolean {
  if (!mapSelectorState) {
    return false;
  }

  return isAdminPortal() || portalConfig.side === mapSelectorState.pickerSide;
}

function canConfirmMapSelection(): boolean {
  if (!mapSelectorState) {
    return false;
  }

  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);

  return Boolean(
    selectedChoice
      && getMapAvailability(selectedChoice).available
      && canOperateMapSelection()
      && (!mapSelectorState.timedOut || isAdminPortal()),
  );
}

function canEditLineupSide(side: Side): boolean {
  if (!lineupSelectorState) {
    return false;
  }

  if (lineupSelectorState.ready[side]) {
    return false;
  }

  if (lineupSelectorState.timedOut && !isAdminPortal()) {
    return false;
  }

  return isAdminPortal() || portalConfig.side === side;
}

function readSharedRoomSnapshot(): SharedRoomSnapshot | null {
  try {
    const saved = window.localStorage.getItem(roomStorageKey);
    return saved ? (JSON.parse(saved) as SharedRoomSnapshot) : null;
  } catch {
    return null;
  }
}

function publishSharedRoomSnapshot(): void {
  if (!currentState) {
    return;
  }

  const snapshot: SharedRoomSnapshot = {
    roomStarted,
    currentState,
    settingsState,
    confirmedLineups,
    mapSelectorState,
    lineupSelectorState,
    banSelectorState,
    scoreSelectorState,
    restState,
    pauseState,
    teamAckNotice,
    adminNotice,
    openingSide,
    countdownStartedAt,
    countdownStartSeconds,
  };

  window.localStorage.setItem(roomStorageKey, JSON.stringify(snapshot));
  roomChannel?.postMessage(snapshot);
}

function applySharedRoomSnapshot(snapshot: SharedRoomSnapshot, shouldRender = true): void {
  if (!snapshot?.currentState) {
    return;
  }

  const localLineupState = lineupSelectorState;
  const incomingLineupState = normalizeLineupSelectorState(snapshot.lineupSelectorState);

  roomStarted = Boolean(snapshot.roomStarted);
  currentState = snapshot.currentState;
  settingsState = mergeSettings(defaultSettings, snapshot.settingsState);
  confirmedLineups = snapshot.confirmedLineups ?? {};
  mapSelectorState = snapshot.mapSelectorState;
  lineupSelectorState = incomingLineupState;
  banSelectorState = snapshot.banSelectorState ?? null;
  scoreSelectorState = snapshot.scoreSelectorState ?? null;
  restState = snapshot.restState ?? null;
  pauseState = snapshot.pauseState ?? { active: false, startedAt: null, totalPausedMs: 0, collapsed: false };
  teamAckNotice = snapshot.teamAckNotice ?? null;
  adminNotice = snapshot.adminNotice ?? null;
  openingSide = snapshot.openingSide ?? resolveOpeningSide();
  countdownStartedAt = snapshot.countdownStartedAt;
  countdownStartSeconds = snapshot.countdownStartSeconds;

  if (
    localLineupState?.open
    && lineupSelectorState?.open
    && localLineupState.mapIndex === lineupSelectorState.mapIndex
  ) {
    (["left", "right"] as Side[]).forEach((side) => {
      if (localLineupState.ready[side] && !lineupSelectorState!.ready[side]) {
        lineupSelectorState!.ready[side] = true;
        lineupSelectorState!.values[side] = { ...localLineupState.values[side] };
      }
    });

    if (
      portalConfig.side
      && !localLineupState.ready[portalConfig.side]
      && !lineupSelectorState.ready[portalConfig.side]
    ) {
      lineupSelectorState.values[portalConfig.side] = { ...localLineupState.values[portalConfig.side] };
    }
  }

  if (shouldRender) {
    renderCurrent();
  }
}

function normalizeLineupSelectorState(state: LineupSelectorState | null | undefined): LineupSelectorState | null {
  if (!state) {
    return null;
  }

  return {
    ...state,
    values: {
      left: { ...createEmptyLineupValues(), ...(state.values?.left ?? {}) },
      right: { ...createEmptyLineupValues(), ...(state.values?.right ?? {}) },
    },
    ready: {
      left: Boolean(state.ready?.left),
      right: Boolean(state.ready?.right),
    },
  };
}

function createFreshMatchState(baseState: MatchState): MatchState {
  return {
    ...baseState,
    phase: "waiting",
    currentOperation: "等待管理员开始",
    currentCountdownSeconds: settingsState.stageLimits.preStartRestSeconds,
    teams: {
      left: { ...baseState.teams.left, seriesScore: 0 },
      right: { ...baseState.teams.right, seriesScore: 0 },
    },
    maps: Array.from({ length: settingsState.stageCount }, (_, index) => createBlankMap(index)),
  };
}

function createBlankMap(index: number): MatchMap {
  return {
    id: `map-${index + 1}`,
    mode: null,
    modeIconUrl: null,
    nameZh: null,
    nameEn: null,
    status: "tbd",
    imageUrl: "/static/placeholders/map-blank.svg",
    score: { left: null, right: null },
    bans: { left: null, right: null },
    firstBanSide: null,
  };
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== roomStorageKey || !event.newValue) {
    return;
  }

  try {
    applySharedRoomSnapshot(JSON.parse(event.newValue) as SharedRoomSnapshot);
  } catch {
    // Ignore malformed snapshots from manual localStorage edits.
  }
}

async function loadInitialData(): Promise<void> {
  try {
    const [matchResponse, catalogResponse, presetResponse] = await Promise.all([
      fetch("/api/matches/default/state", { headers: { Accept: "application/json" } }),
      fetch("/api/maps/catalog", { headers: { Accept: "application/json" } }),
      fetch("/api/settings/preset", { headers: { Accept: "application/json" } }),
    ]);

    if (!matchResponse.ok) {
      throw new Error(`Match API returned ${matchResponse.status}`);
    }

    if (!catalogResponse.ok) {
      throw new Error(`Map catalog API returned ${catalogResponse.status}`);
    }

    mapCatalogState = (await catalogResponse.json()) as MapCatalogState;

    if (presetResponse.ok) {
      settingsState = mergeSettings(defaultSettings, getDefaultPresetFromPayload(await presetResponse.json()));
    }

    const savedSnapshot = readSharedRoomSnapshot();

    if (savedSnapshot) {
      applySharedRoomSnapshot(savedSnapshot, false);
      startCountdownTimer();
      renderCurrent();
      return;
    }

    currentState = createFreshMatchState((await matchResponse.json()) as MatchState);
    roomStarted = false;
    mapSelectorState = null;
    lineupSelectorState = null;
    banSelectorState = null;
    scoreSelectorState = null;
    restState = null;
    pauseState = { active: false, startedAt: null, totalPausedMs: 0, collapsed: false };
    teamAckNotice = null;
    hiddenOverlay = null;
    adminNotice = null;
    openingSide = resolveOpeningSide();
    confirmedLineups = {};
    resetCountdown();
    publishSharedRoomSnapshot();
    startCountdownTimer();
    renderCurrent();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "未知错误");
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "i") {
    if (!canUseSettings()) {
      return;
    }

    settingsPanelOpen = !settingsPanelOpen;
    renderCurrent();
    return;
  }

  if (event.key === "Escape" && mapSelectorState?.open && !mapSelectorState.minimized) {
    mapSelectorState.minimized = true;
    renderCurrent();
  }
}

function renderCurrent(): void {
  if (!currentState) {
    return;
  }

  if (roomStarted) {
    syncMapSelectorTarget(true);
  }

  app.innerHTML = `
    <main class="page-shell">
      <header class="match-header">
        ${renderTeamHeader("left", currentState.teams.left)}
        <div class="match-title">
          <h1>${escapeHtml(currentState.matchName)}</h1>
          <span>FT3</span>
          <b class="portal-badge portal-badge-${portalConfig.role}">${escapeHtml(portalConfig.label)}</b>
        </div>
        ${renderTeamHeader("right", currentState.teams.right)}
      </header>
      <section class="map-stack" aria-label="地图列表">
        ${currentState.maps.map((map, index) => renderMapRow(map, index, currentState!.teams)).join("")}
      </section>
      ${adminNotice ? `<div class="admin-notice">${escapeHtml(adminNotice)}</div>` : ""}
      ${roomStarted ? "" : renderStartGate()}
      ${settingsPanelOpen && canUseSettings() ? renderSettingsPanel() : ""}
      ${renderMapSelector()}
      ${renderLineupSelector()}
      ${renderBanSelector()}
      ${renderScoreSelector()}
      ${renderRestOverlay()}
      ${renderMinimizedOverlay()}
      ${renderPauseOverlay()}
      ${renderTeamAckNotice()}
    </main>
  `;

  bindStartGateEvents();
  bindMapRowEvents();
  bindMapSelectorEvents();
  bindLineupSelectorEvents();
  bindBanSelectorEvents();
  bindScoreSelectorEvents();
  bindRestEvents();
  bindPauseEvents();
  bindTeamAckEvents();
  bindOverlayNavigationEvents();
  bindSettingsEvents();
  updateCountdownDom();
}

function renderShell(root: HTMLDivElement): void {
  root.innerHTML = `
    <main class="page-shell">
      <section class="loading-card">
        <div class="loading-pulse"></div>
        <p>正在载入赛事页面...</p>
      </section>
    </main>
  `;
}

function renderStartGate(): string {
  const action = canUseSettings()
    ? `<button class="start-match-button" id="startMatchFromGate" type="button">开始比赛</button>`
    : `<strong>${isBroadcastPortal() ? "直播等待开始" : "等待管理员开始"}</strong>`;

  return `
    <section class="start-gate" aria-label="比赛未开始">
      <div>
        <span>${escapeHtml(portalConfig.label)}</span>
        <h2>比赛尚未开始</h2>
      </div>
      ${action}
    </section>
  `;
}

function renderTeamHeader(side: Side, team: TeamState): string {
  const score = `<b>${team.seriesScore}</b>`;
  const name = `<strong>${escapeHtml(team.name)}</strong>`;

  return `
    <div class="team-header team-header-${side}">
      ${side === "left" ? `${name}${score}` : `${score}${name}`}
    </div>
  `;
}

function renderMapRow(map: MatchMap, zeroBasedIndex: number, teams: Record<Side, TeamState>): string {
  const index = zeroBasedIndex + 1;
  const isTbd = map.status === "tbd" || !map.nameEn;
  const firstBanSide = map.firstBanSide;
  const scoreClasses = getScoreClasses(map.score.left, map.score.right);
  const mapTitle = map.nameZh ?? map.nameEn ?? "";
  const isTargetSlot = mapSelectorState?.targetMapIndex === zeroBasedIndex;
  const canOpenPick = canOpenMapSlot(zeroBasedIndex);

  return `
    <article class="map-row map-row-${map.status} ${isTargetSlot ? "map-row-pick-target" : ""}">
      ${renderBanSlot("left", teams.left, map.bans.left)}
      ${renderBanPointer("left", firstBanSide)}
      <div class="map-card">
        <div class="map-image-wrap">
          ${isTbd ? "" : `<img src="${map.imageUrl}" alt="${escapeHtml(mapTitle)}" class="map-image" />`}
          <div class="map-score map-score-left ${scoreClasses.left}">${formatMapScore(map.score.left)}</div>
          <div class="map-score map-score-right ${scoreClasses.right}">${formatMapScore(map.score.right)}</div>
          <div class="map-meta">
            <div class="map-title-block">
              <span class="map-index">MAP ${index}</span>
              ${
                mapTitle
                  ? `
                    <h2>
                      ${renderModeIcon(map)}
                      <span>${escapeHtml(mapTitle)}</span>
                    </h2>
                    ${renderLineupSummary(zeroBasedIndex)}
                  `
                  : roomStarted
                    ? canOpenPick
                      ? `<button class="map-pick-open" type="button" data-target-index="${zeroBasedIndex}">选择地图</button>`
                      : `<span class="map-waiting-label">${escapeHtml(getMapSlotWaitingLabel(zeroBasedIndex))}</span>`
                    : `<span class="map-waiting-label">等待开始</span>`
              }
              ${
                isTargetSlot && mapSelectorState
                  ? `<span class="map-pick-hint">${escapeHtml(getTeamName(mapSelectorState.pickerSide))} 正在选图</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
      ${renderBanPointer("right", firstBanSide)}
      ${renderBanSlot("right", teams.right, map.bans.right)}
    </article>
  `;
}

function renderLineupSummary(mapIndex: number): string {
  void mapIndex;
  return "";
}

function renderModeIcon(map: MatchMap): string {
  if (!map.modeIconUrl) {
    return "";
  }

  return `<img class="mode-icon" src="${map.modeIconUrl}" alt="${escapeHtml(map.mode ?? "地图模式")}" />`;
}

function renderBanSlot(side: Side, team: TeamState, ban: HeroBan | null): string {
  const empty = !ban;

  return `
    <aside class="ban-column ban-column-${side}" aria-label="${escapeHtml(team.name)} 禁用英雄">
      <div class="ban-slot ${empty ? "ban-slot-empty" : ""}">
        ${ban ? `<img src="${ban.imageUrl}" alt="${escapeHtml(ban.hero)}" class="ban-hero-image" />` : ""}
        ${ban ? '<span class="ban-forbidden-icon" aria-hidden="true"></span>' : ""}
      </div>
    </aside>
  `;
}

function renderBanPointer(side: Side, firstBanSide: Side | null): string {
  const active = firstBanSide === side;
  const arrow = side === "left" ? "◀" : "▶";

  return `
    <div class="ban-pointer ${active ? "ban-pointer-active" : ""}" aria-label="${active ? "先手 Ban 方" : ""}">
      ${active ? arrow : ""}
    </div>
  `;
}

function renderMapSelector(): string {
  if (
    !currentState
    || !mapSelectorState?.open
    || isBroadcastPortal()
    || hiddenOverlay === "map"
  ) {
    return "";
  }

  return mapSelectorState.minimized ? renderMinimizedMapSelector() : renderExpandedMapSelector();
}

function renderExpandedMapSelector(): string {
  if (!currentState || !mapSelectorState) {
    return "";
  }

  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);
  const canConfirm = canConfirmMapSelection();
  const targetMapLabel = `MAP ${mapSelectorState.targetMapIndex + 1}`;

  return `
    <section class="map-selector-overlay" role="dialog" aria-modal="false" aria-label="地图选择面板">
      <div class="map-selector-panel">
        <header class="map-selector-header">
          <div class="selector-team-block selector-team-${mapSelectorState.pickerSide}">
            <span class="selector-eyebrow">选择地图</span>
            <h2>${escapeHtml(getTeamName(mapSelectorState.pickerSide))}</h2>
          </div>
          <div class="selector-stage-block">
            <span>${targetMapLabel}</span>
            <strong>${escapeHtml(getMapSelectionModeLabel(settingsState.mapSelectionMode))}</strong>
          </div>
          <button class="selector-icon-button" id="minimizeMapSelector" type="button" title="返回主页" aria-label="返回主页">↖</button>
        </header>
        ${renderCountdownProgress("map-selector-progress")}
        <div class="mode-strip" aria-label="地图类型">
          ${getSelectorModeOrder().map((mode) => renderModeStripItem(mode)).join("")}
        </div>
        <div class="map-option-board">
          ${getSelectorModeOrder().map((mode) => renderModeColumn(mode)).join("")}
        </div>
        <footer class="map-selector-footer">
          <div class="selected-map-summary">
            <span>当前选择</span>
            <strong>${selectedChoice ? escapeHtml(getDisplayMapName(selectedChoice.nameEn)) : "点击选择地图"}</strong>
          </div>
          <button class="confirm-map-pick" id="confirmMapPick" type="button" ${canConfirm ? "" : "disabled"}>
            ${getMapConfirmButtonLabel()}
          </button>
          ${renderAdminViolationControls("map")}
        </footer>
      </div>
    </section>
  `;
}

function renderMinimizedMapSelector(): string {
  if (!mapSelectorState) {
    return "";
  }

  return `
    <aside class="map-selector-minimized" aria-label="已最小化的地图选择面板">
      <button class="selector-icon-button" id="restoreMapSelector" type="button" title="展开" aria-label="展开地图选择面板">↖</button>
      <div class="mini-selector-copy">
        <span>${escapeHtml(getTeamName(mapSelectorState.pickerSide))}</span>
        <strong>MAP ${mapSelectorState.targetMapIndex + 1} 选图中</strong>
      </div>
      ${renderCountdownProgress("map-selector-progress-mini")}
    </aside>
  `;
}

function renderCountdownProgress(className: string): string {
  const { percent, remaining } = getCountdownSnapshot();

  return `
    <div class="${className}" style="--progress-width: ${percent}%">
      <span class="countdown-bar" id="${className}Bar"></span>
      <time class="countdown-time" id="${className}Time">${formatCountdown(remaining)}</time>
    </div>
  `;
}

function renderAdminViolationControls(kind: "map" | "ban"): string {
  const timedOut = kind === "map" ? mapSelectorState?.timedOut : banSelectorState?.timedOut;

  if (!isAdminPortal() || !timedOut) {
    return "";
  }

  const prefix = kind === "map" ? "Map" : "Ban";

  return `
    <div class="admin-violation-controls">
      <span>超时处理</span>
      <button id="randomLegal${prefix}" type="button">随机合法选择</button>
      <button id="manualLegal${prefix}" type="button">管理员手动选择</button>
      <button id="forfeit${prefix}" type="button">本小图判负</button>
    </div>
  `;
}

function renderModeStripItem(mode: string): string {
  const choices = getMapChoicesByMode(mode);
  const availableCount = choices.filter((choice) => getMapAvailability(choice).available).length;
  const selectedChoice = findMapChoiceByKey(mapSelectorState?.selectedMapKey ?? null);
  const active = selectedChoice?.mode === mode;
  const iconUrl = getModeIconUrl(mode);

  return `
    <div class="mode-strip-item ${active ? "mode-strip-item-active" : ""} ${availableCount === 0 ? "mode-strip-item-locked" : ""}" data-mode="${escapeHtml(mode)}">
      ${iconUrl ? `<img src="${iconUrl}" alt="${escapeHtml(getModeLabel(mode))}" />` : ""}
      <span>${escapeHtml(getModeLabel(mode))}</span>
    </div>
  `;
}

function renderModeColumn(mode: string): string {
  const choices = getMapChoicesByMode(mode);

  if (choices.length === 0) {
    return "";
  }

  return `
    <section class="map-mode-column" aria-label="${escapeHtml(getModeLabel(mode))}">
      ${choices.map((choice) => renderMapOption(choice)).join("")}
    </section>
  `;
}

function renderMapOption(choice: MapChoice): string {
  const availability = getMapAvailability(choice);
  const selected = mapSelectorState?.selectedMapKey === choice.key;
  const used = isUsedMapChoice(choice);
  const portalBlocked = !canOperateMapSelection();
  const timeoutBlocked = Boolean(mapSelectorState?.timedOut && !isAdminPortal());
  const disabled = !availability.available || portalBlocked || timeoutBlocked;
  const disabledClass = disabled
    ? used
      ? "map-option-used"
      : availability.available && portalBlocked
        ? "map-option-readonly"
        : "map-option-unavailable"
    : "";
  const modeLabel = getModeLabel(choice.mode);
  const title = disabled
    ? getMapDisabledReason(availability)
    : `${modeLabel} - ${getDisplayMapName(choice.nameEn)}`;

  return `
    <button
      class="map-option ${selected ? "map-option-selected" : ""} ${disabledClass}"
      type="button"
      data-map-key="${choice.key}"
      title="${escapeHtml(title)}"
      ${disabled ? "disabled" : ""}
    >
      <img src="${choice.imageUrl}" alt="${escapeHtml(getDisplayMapName(choice.nameEn))}" />
      <span class="map-option-shade"></span>
      <span class="map-option-mode">${escapeHtml(modeLabel)}</span>
      <span class="map-option-name">${escapeHtml(getDisplayMapName(choice.nameEn))}</span>
    </button>
  `;
}

function renderLineupSelector(): string {
  if (
    !currentState
    || !lineupSelectorState?.open
    || isBroadcastPortal()
    || hiddenOverlay === "lineup"
  ) {
    return "";
  }

  const map = currentState.maps[lineupSelectorState.mapIndex];
  const mapName = map.nameZh ?? map.nameEn ?? `MAP ${lineupSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmLineupSelection();

  return `
    <section class="lineup-selector-overlay" role="dialog" aria-modal="false" aria-label="上场成员选择面板">
      <div class="lineup-selector-panel">
        <header class="lineup-selector-header">
          <div>
            <span class="selector-eyebrow">选择上场成员</span>
            <h2>MAP ${lineupSelectorState.mapIndex + 1} ${escapeHtml(mapName)}</h2>
          </div>
          <div class="selector-header-actions">
            <strong>${escapeHtml(getRosterModeLabel(settingsState.rosterMode))}</strong>
            <button class="selector-icon-button return-home-button" type="button" data-overlay-kind="lineup" title="返回主页" aria-label="返回主页">↖</button>
          </div>
        </header>
        ${renderCountdownProgress("lineup-selector-progress")}
        <div class="lineup-team-grid">
          ${renderLineupTeam("left")}
          ${renderLineupTeam("right")}
        </div>
        <footer class="lineup-selector-footer">
          <div class="lineup-status">
            <span>阵容规则</span>
            <strong>${escapeHtml(getLineupStatusText())}</strong>
          </div>
          <button class="confirm-lineup-pick" id="confirmLineupPick" type="button" ${canConfirm ? "" : "disabled"}>
            ${getLineupConfirmButtonLabel()}
          </button>
        </footer>
      </div>
    </section>
  `;
}

function renderLineupTeam(side: Side): string {
  if (!lineupSelectorState) {
    return "";
  }

  const team = currentState?.teams[side];
  const presetOptions = getRosterOptions(side);
  const values = lineupSelectorState.values[side];
  const duplicateValues = getDuplicateLineupValues(values);
  const editable = canEditLineupSide(side);
  const ready = lineupSelectorState.ready[side];

  return `
    <section class="lineup-team-card lineup-team-${side} ${editable ? "" : "lineup-team-readonly"} ${ready ? "lineup-team-ready" : ""}" aria-label="${escapeHtml(team?.name ?? "")} 上场成员">
      <header class="lineup-team-header">
        <span>${side === "left" ? "蓝方" : "红方"}</span>
        <h3>${escapeHtml(team?.name ?? "")}</h3>
        <b>${ready ? "已确认" : editable ? "待确认" : "仅查看"}</b>
      </header>
      <div class="lineup-slot-list">
        ${lineupSlots.map((slot, index) => renderLineupSlot(side, slot, index, presetOptions, values, duplicateValues)).join("")}
      </div>
    </section>
  `;
}

function renderLineupSlot(
  side: Side,
  slot: LineupSlot,
  index: number,
  presetOptions: string[],
  values: Record<string, string>,
  duplicateValues: Set<string>,
): string {
  const value = values[slot.id] ?? "";
  const completed = value.trim().length > 0;
  const duplicated = duplicateValues.has(normalizeRosterValue(value));
  const disabled = !canEditLineupSide(side);

  return `
    <label
      class="lineup-slot lineup-slot-${slot.role} ${completed ? "lineup-slot-filled" : ""} ${duplicated ? "lineup-slot-duplicate" : ""}"
      data-lineup-side="${side}"
      data-lineup-slot="${slot.id}"
    >
      <img class="lineup-role-icon" src="${getRoleHeaderImageUrl(slot.role)}" alt="${escapeHtml(slot.label)}" />
      <span class="lineup-slot-label">${index + 1}</span>
      ${renderLineupControl(side, slot, value, presetOptions, disabled)}
    </label>
  `;
}

function renderLineupControl(
  side: Side,
  slot: LineupSlot,
  value: string,
  presetOptions: string[],
  disabled: boolean,
): string {
  if (settingsState.rosterMode === "preset_only") {
    return `
      <select class="lineup-control" data-lineup-side="${side}" data-lineup-slot="${slot.id}" ${disabled ? "disabled" : ""}>
        <option value="">选择成员</option>
        ${presetOptions
          .map(
            (option) => `
              <option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>
                ${escapeHtml(option)}
              </option>
            `,
          )
          .join("")}
      </select>
    `;
  }

  return `
    <input
      class="lineup-control"
      data-lineup-side="${side}"
      data-lineup-slot="${slot.id}"
      type="text"
      value="${escapeHtml(value)}"
      placeholder="${presetOptions.length > 0 ? "输入或参考预设成员" : "输入成员名"}"
      ${disabled ? "disabled" : ""}
    />
  `;
}

function renderBanSelector(): string {
  if (
    !currentState
    || !banSelectorState?.open
    || isBroadcastPortal()
    || hiddenOverlay === "ban"
  ) {
    return "";
  }

  const map = currentState.maps[banSelectorState.mapIndex];
  const mapName = map.nameZh ?? map.nameEn ?? `MAP ${banSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmBanSelection();
  const hasLineups = Boolean(confirmedLineups[banSelectorState.mapIndex]);

  return `
    <section class="ban-selector-overlay" role="dialog" aria-modal="false" aria-label="Ban 选面板">
      <div class="ban-selector-panel">
        <header class="ban-selector-header">
          <div>
            <span class="selector-eyebrow">英雄 Ban 选</span>
            <h2>MAP ${banSelectorState.mapIndex + 1} ${escapeHtml(mapName)}</h2>
          </div>
          <div class="selector-header-actions">
            <strong>${escapeHtml(getBanStepLabel())}</strong>
            <button class="selector-icon-button return-home-button" type="button" data-overlay-kind="ban" title="返回主页" aria-label="返回主页">↖</button>
          </div>
        </header>
        ${renderCountdownProgress("ban-selector-progress")}
        <div class="ban-layout ${hasLineups ? "" : "ban-layout-no-lineups"} ${banSelectorState.step === "order-choice" ? "ban-layout-order-only" : ""}">
          ${hasLineups ? renderBanLineupSide("left") : ""}
          <div class="ban-main">
            ${banSelectorState.step === "order-choice" ? renderBanOrderChoice() : renderHeroBoard()}
          </div>
          ${hasLineups ? renderBanLineupSide("right") : ""}
        </div>
        <footer class="ban-selector-footer">
          <div class="selected-ban-summary">
            <span>当前选择</span>
            <strong>${escapeHtml(getBanSelectionSummary())}</strong>
          </div>
          <button class="confirm-ban-pick" id="confirmBanPick" type="button" ${canConfirm ? "" : "disabled"}>
            ${escapeHtml(getBanConfirmButtonLabel())}
          </button>
          ${renderAdminViolationControls("ban")}
        </footer>
      </div>
    </section>
  `;
}

function renderHeroBoard(): string {
  return `
    <div class="hero-board">
      ${renderHeroRoleColumn("Tank")}
      ${renderHeroRoleColumn("Damage")}
      ${renderHeroRoleColumn("Support")}
    </div>
  `;
}

function renderBanOrderChoice(): string {
  if (!banSelectorState || banSelectorState.step !== "order-choice") {
    return "";
  }

  const disabled = !canOperateBanOrderChoice();

  return `
    <div class="ban-order-choice" aria-label="选择先后 Ban">
      <button
        class="${banSelectorState.selectedOrder === "first" ? "ban-order-active" : ""}"
        type="button"
        data-ban-order="first"
        ${disabled ? "disabled" : ""}
      >
        选择先 Ban
      </button>
      <button
        class="${banSelectorState.selectedOrder === "second" ? "ban-order-active" : ""}"
        type="button"
        data-ban-order="second"
        ${disabled ? "disabled" : ""}
      >
        选择后 Ban
      </button>
    </div>
  `;
}

function renderBanLineupSide(side: Side): string {
  const lineups = banSelectorState ? confirmedLineups[banSelectorState.mapIndex] : null;
  const lineup = lineups?.[side] ?? null;
  const active = banSelectorState?.activeSide === side && banSelectorState.step !== "order-choice";

  return `
    <aside class="ban-lineup-side ban-lineup-${side} ${active ? "ban-lineup-active" : ""}">
      <header>
        <span>${side === "left" ? "蓝方阵容" : "红方阵容"}</span>
        <h3>${escapeHtml(getTeamName(side))}</h3>
      </header>
      <div class="ban-lineup-list">
        ${lineup ? lineupSlots.map((slot) => renderBanLineupSlot(slot, lineup[slot.id] ?? "")).join("") : "<strong>未提交阵容</strong>"}
      </div>
    </aside>
  `;
}

function renderBanLineupSlot(slot: LineupSlot, value: string): string {
  return `
    <div class="ban-lineup-slot ban-lineup-slot-${slot.role}">
      <img class="ban-lineup-role" src="${getRoleHeaderImageUrl(slot.role)}" alt="${escapeHtml(slot.label)}" />
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function renderHeroRoleColumn(role: string): string {
  const heroes = getHeroesByRole(role);
  const label = getHeroRoleLabel(role);

  return `
    <section class="hero-role-column hero-role-${normalizeKey(role)}" aria-label="${escapeHtml(label)}">
      <header>
        <img class="hero-role-image" src="${getRoleHeaderImageUrl(role)}" alt="${escapeHtml(label)}" />
      </header>
      <div class="hero-grid">
        ${heroes.map((hero) => renderHeroOption(hero)).join("")}
      </div>
    </section>
  `;
}

function renderHeroOption(hero: HeroCatalogItem): string {
  const heroKey = getHeroKey(hero.nameEn);
  const selected = banSelectorState?.selectedHeroKey === heroKey;
  const availability = getHeroBanAvailability(hero);
  const disabled = !canOperateHeroBan() || !availability.available || Boolean(banSelectorState?.timedOut && !isAdminPortal());
  const bannedEarlierBySide = banSelectorState ? hasSideBannedHero(banSelectorState.activeSide, heroKey, banSelectorState.mapIndex) : false;
  const disabledClass = disabled ? (bannedEarlierBySide ? "hero-option-used" : "hero-option-unavailable") : "";

  return `
    <button
      class="hero-option ${selected ? "hero-option-selected" : ""} ${disabledClass}"
      type="button"
      data-hero-key="${heroKey}"
      title="${escapeHtml(availability.available ? hero.nameEn : availability.reason)}"
      ${disabled ? "disabled" : ""}
    >
      <img src="${hero.imageUrl}" alt="${escapeHtml(hero.nameEn)}" />
      <span>${escapeHtml(hero.nameEn)}</span>
    </button>
  `;
}

function renderScoreSelector(): string {
  if (
    !currentState
    || !scoreSelectorState?.open
    || isBroadcastPortal()
    || hiddenOverlay === "score"
  ) {
    return "";
  }

  const mapIndex = scoreSelectorState.mapIndex;
  const map = currentState.maps[mapIndex];
  const mapName = map.nameZh ?? map.nameEn ?? `MAP ${scoreSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmScoreSelection();

  return `
    <section class="score-selector-overlay" role="dialog" aria-modal="false" aria-label="比分确认面板">
      <div class="score-selector-panel">
        <header class="score-selector-header">
          <div>
            <span class="selector-eyebrow">填写比分</span>
            <h2>MAP ${scoreSelectorState.mapIndex + 1} ${escapeHtml(mapName)}</h2>
          </div>
          <div class="selector-header-actions">
            <strong>${escapeHtml(getScoreReportModeLabel(settingsState.scoreReportMode))}</strong>
            <button class="selector-icon-button return-home-button" type="button" data-overlay-kind="score" title="返回主页" aria-label="返回主页">↖</button>
          </div>
        </header>
        ${isScoreConfirmationCounting() ? renderCountdownProgress("score-selector-progress") : ""}
        <div class="score-entry-grid">
          ${renderScoreInput("left")}
          ${renderScoreInput("right")}
        </div>
        <footer class="score-selector-footer">
          <div class="score-status">
            <span>比分状态</span>
            <strong>${escapeHtml(getScoreStatusText())}</strong>
          </div>
          <button class="confirm-score-pick" id="confirmScorePick" type="button" ${canConfirm ? "" : "disabled"}>
            ${escapeHtml(getScoreConfirmButtonLabel())}
          </button>
          ${renderScoreRejectButton()}
        </footer>
      </div>
    </section>
  `;
}

function renderScoreRejectButton(): string {
  if (!canRejectScoreSelection()) {
    return "";
  }

  return `<button class="reject-score-pick" id="rejectScorePick" type="button">不确认</button>`;
}

function renderScoreInput(side: Side): string {
  if (!scoreSelectorState) {
    return "";
  }

  const disabled = !canEditScore();

  return `
    <label class="score-input-card score-input-${side}">
      <span>${escapeHtml(getTeamName(side))}</span>
      <input
        class="score-control"
        data-score-side="${side}"
        type="number"
        min="0"
        value="${escapeHtml(scoreSelectorState.values[side])}"
        ${disabled ? "disabled" : ""}
      />
    </label>
  `;
}

function renderRestOverlay(): string {
  if (!currentState || !restState?.open || isBroadcastPortal() || hiddenOverlay === "rest") {
    return "";
  }

  const map = currentState.maps[restState.mapIndex];
  const mapName = map.nameZh ?? map.nameEn ?? `MAP ${restState.mapIndex + 1}`;
  const restTitle = map.status === "completed"
    ? `MAP ${restState.mapIndex + 1} ${mapName} 已结束`
    : `MAP ${restState.mapIndex + 1} 开始前休息`;

  return `
    <section class="rest-overlay" role="dialog" aria-modal="false" aria-label="休息倒计时">
      <div class="rest-panel">
        <header class="score-selector-header">
          <div>
            <span class="selector-eyebrow">休息时间</span>
            <h2>${escapeHtml(restTitle)}</h2>
          </div>
          <div class="selector-header-actions">
            <strong>等待下一张地图</strong>
            <button class="selector-icon-button return-home-button" type="button" data-overlay-kind="rest" title="返回主页" aria-label="返回主页">↖</button>
          </div>
        </header>
        ${renderCountdownProgress("rest-progress")}
        <footer class="score-selector-footer">
          <div class="score-status">
            <span>休息状态</span>
            <strong>休息结束后自动进入下一轮选图</strong>
          </div>
          <button class="confirm-score-pick" id="skipRestPeriod" type="button" ${canSkipRestPeriod() ? "" : "disabled"}>
            ${getRestButtonLabel()}
          </button>
        </footer>
      </div>
    </section>
  `;
}

function renderPauseOverlay(): string {
  if (!pauseState.active) {
    return "";
  }

  return `
    <aside class="pause-overlay ${pauseState.collapsed ? "pause-overlay-collapsed" : ""}" aria-label="管理员暂停">
      <button class="selector-icon-button" id="togglePausePanel" type="button" title="收起/展开" aria-label="收起或展开暂停提示">
        ${pauseState.collapsed ? "↙" : "↖"}
      </button>
      <div class="pause-copy">
        <span>管理员已暂停</span>
        <strong class="pause-elapsed">${formatElapsedPause()}</strong>
      </div>
      ${isAdminPortal() ? `<button class="resume-button" id="resumeGlobalTimer" type="button">恢复时间</button>` : ""}
    </aside>
  `;
}

function renderTeamAckNotice(): string {
  if (!teamAckNotice || isAdminPortal() || isBroadcastPortal() || !portalConfig.side) {
    return "";
  }

  if (teamAckNotice.acknowledged[portalConfig.side]) {
    return "";
  }

  return `
    <section class="team-ack-overlay" role="dialog" aria-modal="false" aria-label="管理员处理通知">
      <div class="team-ack-panel">
        <span>管理员处理</span>
        <strong>${escapeHtml(teamAckNotice.message)}</strong>
        <button id="ackTeamNotice" type="button">确认</button>
      </div>
    </section>
  `;
}

function renderMinimizedOverlay(): string {
  const kind = getActiveOverlayKind();

  if (!kind || hiddenOverlay !== kind) {
    return "";
  }

  return `
    <aside class="map-selector-minimized active-overlay-minimized" aria-label="已返回主页的操作面板">
      <button class="selector-icon-button" id="restoreActiveOverlay" type="button" title="展开" aria-label="展开当前操作面板">↖</button>
      <div class="mini-selector-copy">
        <span>${escapeHtml(getOverlayKindLabel(kind))}</span>
        <strong>${escapeHtml(getActiveOverlaySummary(kind))}</strong>
      </div>
      ${renderCountdownProgress("map-selector-progress-mini")}
    </aside>
  `;
}

function renderSettingsPanel(): string {
  return `
    <section class="settings-panel">
      <h2>详细设置 (I)</h2>
      <p>点击检查点可回退并重做该步骤。</p>
      <div class="settings-actions settings-actions-top">
        <button id="toggleGlobalPause" type="button">${pauseState.active ? "恢复全局时间" : "全局暂停"}</button>
        <button id="startMatchFromSettings" type="button">从头开始</button>
        <button id="resetMatchToWaiting" type="button">重置到未开始</button>
      </div>
      <div class="checkpoint-table">
        ${renderCheckpointRows()}
      </div>
      <div class="settings-grid">
        <label>休息秒数<input id="preStartRestSeconds" type="number" value="${settingsState.stageLimits.preStartRestSeconds}" /></label>
        <label>选图时间<input id="mapSelectSeconds" type="number" value="${settingsState.stageLimits.mapSelectSeconds}" /></label>
        <label>选人时间<input id="playerSelectSeconds" type="number" value="${settingsState.stageLimits.playerSelectSeconds}" /></label>
        <label>先后Ban选择时间<input id="firstBanChoiceSeconds" type="number" value="${settingsState.stageLimits.firstBanChoiceSeconds}" /></label>
        <label>先Ban时间<input id="firstBanActionSeconds" type="number" value="${settingsState.stageLimits.firstBanActionSeconds}" /></label>
        <label>后Ban时间<input id="secondBanActionSeconds" type="number" value="${settingsState.stageLimits.secondBanActionSeconds}" /></label>
        <label>比分确认时间<input id="scoreConfirmSeconds" type="number" value="${settingsState.stageLimits.scoreConfirmSeconds}" /></label>
        <label>赛后休息秒数<input id="postMatchRestSeconds" type="number" value="${settingsState.stageLimits.postMatchRestSeconds}" /></label>
      </div>
      ${renderMapSettingsPanel()}
      ${renderRosterSettingsPanel()}
      ${renderBanRuleSettingsPanel()}
      ${renderScoreRuleSettingsPanel()}
      <div class="settings-actions">
        <input id="presetName" type="text" placeholder="预设名称" />
        <select id="presetSelect"></select>
        <button id="applyPreset" type="button">应用到当前页面</button>
        <button id="savePreset" type="button">保存命名预设</button>
        <button id="loadPreset" type="button">导入选择预设</button>
      </div>
    </section>
  `;
}

function renderCheckpointBtn(
  row: number,
  key: keyof SettingsState["checkpoints"][number],
  disabled = false,
): string {
  const checkpoint = settingsState.checkpoints[row]?.[key] ?? defaultSettings.checkpoints[row]?.[key];

  if (!checkpoint.enabled || row >= settingsState.stageCount || !isCheckpointCompleted(row, key)) {
    return "";
  }

  return `
    <button class="cp-btn ${checkpoint.enabled ? "" : "cp-off"}" data-row="${row}" data-key="${key}" ${disabled ? "disabled" : ""}>
      ${escapeHtml(checkpoint.label)}
    </button>
  `;
}

function renderCheckpointRows(): string {
  return settingsState.checkpoints
    .map((_, index) => {
      const buttons = [
        renderCheckpointBtn(index, "preCountdown", index === 0),
        renderCheckpointBtn(index, "mapPick"),
        renderCheckpointBtn(index, "lineupPick"),
        renderCheckpointBtn(index, "firstSecondBanChoice"),
        renderCheckpointBtn(index, "firstBan"),
        renderCheckpointBtn(index, "secondBan"),
        renderCheckpointBtn(index, "scorePick"),
      ].join("");

      if (!buttons.trim()) {
        return "";
      }

      return `
        <div class="cp-row">
          <span>地图${index + 1}</span>
          ${buttons}
        </div>
      `;
    })
    .join("");
}

function renderMapSettingsPanel(): string {
  const mode = settingsState.mapSelectionMode;
  const showMapPool = mode !== "fixed_map_order";

  return `
    <details class="settings-section">
      <summary>地图设置</summary>
      <label>
        地图选择模式
        <select id="mapSelectionMode">
          <option value="unique_map">已选地图不可重复</option>
          <option value="unique_mode_until_cycle">未轮完类别前不可重复类别</option>
          <option value="first_mode_then_unique_mode">第一张限定类别，其余轮完类别前不重复</option>
          <option value="strict_mode_order">按类别顺序选</option>
          <option value="fixed_map_order">固定地图顺序</option>
        </select>
      </label>
      ${mode === "first_mode_then_unique_mode" ? renderFirstMapModeSetting() : ""}
      ${mode === "strict_mode_order" ? renderModeOrderSetting() : ""}
      ${showMapPool ? `<div class="visual-map-pool">${getVisualMapPoolMarkup()}</div>` : ""}
      ${mode === "fixed_map_order" ? renderFixedMapOrderSetting() : ""}
    </details>
  `;
}

function renderFirstMapModeSetting(): string {
  return `
    <label>
      第一张地图类别
      <select id="firstMapMode">
        ${(mapCatalogState.modes.length ? mapCatalogState.modes : getConfiguredModeOrder())
          .map((mode) => `<option value="${escapeHtml(mode)}">${escapeHtml(getModeLabel(mode))}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function renderModeOrderSetting(): string {
  const orderedModes = getConfiguredModeOrder();
  const fallbackModes = mapCatalogState.modes.filter((mode) => !orderedModes.includes(mode));
  const modes = [...orderedModes, ...fallbackModes];

  return `
    <div class="mode-order-setting">
      <span>类别顺序</span>
      <div class="mode-order-list">
        ${modes
          .map(
            (mode) => `
              <div class="mode-order-item" draggable="true" data-mode-order="${escapeHtml(mode)}">
                ${escapeHtml(getModeLabel(mode))}
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderFixedMapOrderSetting(): string {
  const fixedOrder = parseFixedMapOrder();
  const options = getAllCatalogMapChoices();

  return `
    <div class="fixed-map-order-setting">
      <span>固定地图顺序</span>
      ${Array.from({ length: settingsState.stageCount }, (_, index) => {
        const current = fixedOrder[index] ?? options[index]?.nameEn ?? "";

        return `
          <label>
            MAP ${index + 1}
            <select class="fixed-map-order-select" data-fixed-map-index="${index}">
              <option value="">未选择</option>
              ${options
                .map(
                  (choice) => `
                    <option value="${escapeHtml(choice.nameEn)}" ${normalizeKey(choice.nameEn) === normalizeKey(current) ? "selected" : ""}>
                      ${escapeHtml(getModeLabel(choice.mode))} - ${escapeHtml(getDisplayMapName(choice.nameEn))}
                    </option>
                  `,
                )
                .join("")}
            </select>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderRosterSettingsPanel(): string {
  const rosters = parsePresetRosters();

  return `
    <details class="settings-section">
      <summary>上场设置</summary>
      <label>
        上场成员模式
        <select id="rosterMode">
          <option value="free_input">双方自由输入</option>
          <option value="preset_only">仅可从预设成员输入</option>
          <option value="skip">跳过该项</option>
        </select>
      </label>
      <div class="visual-rosters">
        ${renderRosterListSetting("left", rosters.left)}
        ${renderRosterListSetting("right", rosters.right)}
      </div>
    </details>
  `;
}

function renderBanRuleSettingsPanel(): string {
  return `
    <details class="settings-section">
      <summary>禁用规则</summary>
      <label>
        先后Ban规则
        <select id="firstBanPolicy">
          <option value="allow_loser_choose">允许败者选择</option>
          <option value="loser_must_first">败者必须先Ban（跳过选择先后）</option>
          <option value="no_ban">无Ban</option>
        </select>
      </label>
    </details>
  `;
}

function renderScoreRuleSettingsPanel(): string {
  return `
    <details class="settings-section">
      <summary>比分规则</summary>
      <label>
        比分录入模式
        <select id="scoreReportMode">
          <option value="admin_only">管理员填写比分</option>
          <option value="team_submit_opponent_confirm">任一队伍填写，另一方确认</option>
        </select>
      </label>
    </details>
  `;
}

function isCheckpointCompleted(row: number, key: CheckpointKey): boolean {
  const map = currentState?.maps[row];

  if (!map) {
    return false;
  }

  if (key === "preCountdown") {
    return row > 0 && currentState!.maps[row - 1]?.status === "completed";
  }

  if (key === "mapPick") {
    return Boolean(map.nameEn);
  }

  if (key === "lineupPick") {
    return Boolean(confirmedLineups[row]);
  }

  if (key === "firstSecondBanChoice") {
    return Boolean(map.firstBanSide);
  }

  if (key === "firstBan") {
    return Boolean(map.firstBanSide && map.bans[map.firstBanSide]);
  }

  if (key === "secondBan") {
    return Boolean(map.bans.left && map.bans.right);
  }

  if (key === "scorePick") {
    return map.status === "completed";
  }

  return false;
}

function getVisualMapPoolMarkup(): string {
  const modes = mapCatalogState.modes.length > 0 ? mapCatalogState.modes : getSelectorModeOrder();

  return modes
    .map(
      (mode) => `
        <section class="visual-mode-pool">
          <h3>${escapeHtml(getModeLabel(mode))}</h3>
          <div>
            ${(mapCatalogState.maps[mode] ?? [])
              .map((map) => {
                const checked = (settingsState.mapPool[mode] ?? []).some((name) => normalizeKey(name) === normalizeKey(map.nameEn));
                return `
                  <label class="map-pool-option" draggable="true" data-map-pool-key="${escapeHtml(getMapKey(mode, map.nameEn))}">
                    <input class="map-pool-checkbox" type="checkbox" data-map-mode="${escapeHtml(mode)}" value="${escapeHtml(map.nameEn)}" ${checked ? "checked" : ""} />
                    <img src="${map.imageUrl}" alt="${escapeHtml(getDisplayMapName(map.nameEn))}" />
                    <span>${escapeHtml(getDisplayMapName(map.nameEn))}</span>
                  </label>
                `;
              })
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderRosterListSetting(side: Side, members: string[]): string {
  return `
    <section class="visual-roster-list visual-roster-${side}">
      <h3>${side === "left" ? "蓝色方" : "红色方"}</h3>
      <div class="visual-roster-items" data-roster-side="${side}">
        ${members.map((member) => renderRosterMemberInput(side, member)).join("")}
      </div>
      <button class="add-roster-member" type="button" data-roster-side="${side}">增加成员</button>
    </section>
  `;
}

function renderRosterMemberInput(side: Side, value: string): string {
  return `
    <label class="roster-member-row">
      <input class="roster-member-input" data-roster-side="${side}" type="text" value="${escapeHtml(value)}" />
      <button class="remove-roster-member" type="button">移除</button>
    </label>
  `;
}

function bindStartGateEvents(): void {
  document.getElementById("startMatchFromGate")?.addEventListener("click", () => resetRoomToBeginning(true));
}

function bindMapRowEvents(): void {
  app.querySelectorAll<HTMLButtonElement>(".map-pick-open").forEach((button) => {
    button.addEventListener("click", () => {
      const targetIndex = Number(button.dataset.targetIndex);

      if (!Number.isNaN(targetIndex)) {
        openMapSelector(targetIndex);
      }
    });
  });
}

function bindMapSelectorEvents(): void {
  const minimizeButton = document.getElementById("minimizeMapSelector");
  const restoreButton = document.getElementById("restoreMapSelector");
  const confirmButton = document.getElementById("confirmMapPick");

  minimizeButton?.addEventListener("click", () => {
    if (mapSelectorState) {
      mapSelectorState.minimized = true;
      renderCurrent();
    }
  });

  restoreButton?.addEventListener("click", () => {
    if (mapSelectorState) {
      mapSelectorState.minimized = false;
      renderCurrent();
    }
  });

  confirmButton?.addEventListener("click", confirmSelectedMap);
  document.getElementById("randomLegalMap")?.addEventListener("click", randomLegalMapChoice);
  document.getElementById("manualLegalMap")?.addEventListener("click", enableManualMapViolationChoice);
  document.getElementById("forfeitMap")?.addEventListener("click", forfeitCurrentMapChoice);

  app.querySelectorAll<HTMLButtonElement>(".map-option:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => selectMapChoice(button.dataset.mapKey ?? null));
  });
}

function bindLineupSelectorEvents(): void {
  if (!lineupSelectorState?.open) {
    return;
  }

  document.getElementById("confirmLineupPick")?.addEventListener("click", confirmLineups);

  app.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".lineup-control").forEach((control) => {
    control.addEventListener("input", () => updateLineupValue(control));
    control.addEventListener("change", () => updateLineupValue(control));
  });
}

function bindBanSelectorEvents(): void {
  if (!banSelectorState?.open) {
    return;
  }

  app.querySelectorAll<HTMLButtonElement>("[data-ban-order]").forEach((button) => {
    button.addEventListener("click", () => selectBanOrder(button.dataset.banOrder as BanOrderChoice | undefined));
  });

  app.querySelectorAll<HTMLButtonElement>(".hero-option:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => selectHeroBan(button.dataset.heroKey ?? null));
  });

  document.getElementById("confirmBanPick")?.addEventListener("click", confirmBanSelection);
  document.getElementById("randomLegalBan")?.addEventListener("click", randomLegalBanChoice);
  document.getElementById("manualLegalBan")?.addEventListener("click", enableManualBanViolationChoice);
  document.getElementById("forfeitBan")?.addEventListener("click", forfeitCurrentBanChoice);
}

function bindScoreSelectorEvents(): void {
  if (!scoreSelectorState?.open) {
    return;
  }

  app.querySelectorAll<HTMLInputElement>(".score-control").forEach((control) => {
    control.addEventListener("input", () => updateScoreValue(control));
  });

  document.getElementById("confirmScorePick")?.addEventListener("click", confirmScoreSelection);
  document.getElementById("rejectScorePick")?.addEventListener("click", rejectScoreSelection);
}

function bindRestEvents(): void {
  document.getElementById("skipRestPeriod")?.addEventListener("click", () => {
    if (!canSkipRestPeriod()) {
      return;
    }

    skipRestPeriod();
  });
}

function bindPauseEvents(): void {
  document.getElementById("togglePausePanel")?.addEventListener("click", () => {
    pauseState.collapsed = !pauseState.collapsed;
    publishSharedRoomSnapshot();
    renderCurrent();
  });

  document.getElementById("resumeGlobalTimer")?.addEventListener("click", () => {
    if (isAdminPortal()) {
      resumeGlobalPause();
    }
  });
}

function bindTeamAckEvents(): void {
  document.getElementById("ackTeamNotice")?.addEventListener("click", () => {
    acknowledgeTeamNotice();
  });
}

function bindOverlayNavigationEvents(): void {
  app.querySelectorAll<HTMLButtonElement>(".return-home-button").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.overlayKind as OverlayKind | undefined;

      if (!kind) {
        return;
      }

      hiddenOverlay = kind;
      renderCurrent();
    });
  });

  document.getElementById("restoreActiveOverlay")?.addEventListener("click", () => {
    hiddenOverlay = null;
    renderCurrent();
  });
}

function bindSettingsEvents(): void {
  if (!settingsPanelOpen || !canUseSettings()) {
    return;
  }

  const mapSelectionMode = document.getElementById("mapSelectionMode") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;

  if (mapSelectionMode) {
    mapSelectionMode.value = settingsState.mapSelectionMode;
    mapSelectionMode.addEventListener("change", () => {
      settingsState.mapSelectionMode = mapSelectionMode.value as MapSelectionMode;
      renderCurrent();
    });
  }

  if (firstMapMode) {
    firstMapMode.value = settingsState.firstMapMode;
  }

  if (rosterMode) {
    rosterMode.value = settingsState.rosterMode;
  }

  if (firstBanPolicy) {
    firstBanPolicy.value = settingsState.firstBanPolicy;
  }

  if (scoreReportMode) {
    scoreReportMode.value = settingsState.scoreReportMode;
  }

  void populatePresetSelect();

  app.querySelectorAll<HTMLButtonElement>(".cp-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const row = Number(button.dataset.row);
      const key = button.dataset.key as CheckpointKey;
      const checkpoint = settingsState.checkpoints[row]?.[key];

      if (!checkpoint || !window.confirm(`确认回退到 MAP ${row + 1}：${checkpoint.label}？`)) {
        return;
      }

      restoreCheckpoint(row, key);
    });
  });

  document.getElementById("applyPreset")?.addEventListener("click", applySettingsFromForm);
  document.getElementById("savePreset")?.addEventListener("click", savePreset);
  document.getElementById("loadPreset")?.addEventListener("click", loadPreset);
  document.getElementById("startMatchFromSettings")?.addEventListener("click", () => resetRoomToBeginning(true));
  document.getElementById("resetMatchToWaiting")?.addEventListener("click", () => resetRoomToBeginning(false));
  document.getElementById("toggleGlobalPause")?.addEventListener("click", toggleGlobalPause);

  bindMapPoolDragEvents();
  bindModeOrderDragEvents();

  app.querySelectorAll<HTMLButtonElement>(".add-roster-member").forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.rosterSide as Side | undefined;
      const list = side ? app.querySelector<HTMLElement>(`.visual-roster-items[data-roster-side="${side}"]`) : null;
      list?.insertAdjacentHTML("beforeend", renderRosterMemberInput(side ?? "left", ""));
      list?.lastElementChild
        ?.querySelector<HTMLButtonElement>(".remove-roster-member")
        ?.addEventListener("click", (event) => {
          (event.currentTarget as HTMLElement).closest(".roster-member-row")?.remove();
        });
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".remove-roster-member").forEach((button) => {
    button.addEventListener("click", () => button.closest(".roster-member-row")?.remove());
  });
}

function bindMapPoolDragEvents(): void {
  app.querySelectorAll<HTMLElement>(".map-pool-option").forEach((option) => {
    option.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", option.dataset.mapPoolKey ?? "");
      event.dataTransfer?.setDragImage(option, 24, 24);
      option.classList.add("map-pool-dragging");
    });

    option.addEventListener("dragend", () => {
      option.classList.remove("map-pool-dragging");
      app.querySelectorAll<HTMLElement>(".map-pool-option").forEach((item) => item.classList.remove("map-pool-drag-over"));
    });

    option.addEventListener("dragover", (event) => {
      event.preventDefault();
      option.classList.add("map-pool-drag-over");
    });

    option.addEventListener("dragleave", () => {
      option.classList.remove("map-pool-drag-over");
    });

    option.addEventListener("drop", (event) => {
      event.preventDefault();
      option.classList.remove("map-pool-drag-over");
      const sourceKey = event.dataTransfer?.getData("text/plain");
      const source = [...app.querySelectorAll<HTMLElement>(".map-pool-option")]
        .find((item) => item.dataset.mapPoolKey === sourceKey);

      if (!source || source === option || source.parentElement !== option.parentElement) {
        return;
      }

      option.parentElement?.insertBefore(source, option);
    });
  });
}

function bindModeOrderDragEvents(): void {
  app.querySelectorAll<HTMLElement>(".mode-order-item").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", item.dataset.modeOrder ?? "");
      item.classList.add("map-pool-dragging");
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("map-pool-dragging");
      app.querySelectorAll<HTMLElement>(".mode-order-item").forEach((entry) => entry.classList.remove("map-pool-drag-over"));
    });

    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("map-pool-drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("map-pool-drag-over");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("map-pool-drag-over");
      const sourceMode = event.dataTransfer?.getData("text/plain");
      const source = [...app.querySelectorAll<HTMLElement>(".mode-order-item")]
        .find((entry) => entry.dataset.modeOrder === sourceMode);

      if (!source || source === item || source.parentElement !== item.parentElement) {
        return;
      }

      item.parentElement?.insertBefore(source, item);
    });
  });
}

function applySettingsFromForm(): void {
  if (!canUseSettings()) {
    return;
  }

  if (!readSettingsFromForm()) {
    return;
  }

  syncMapSelectorTarget(true);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function resetRoomToBeginning(started: boolean): void {
  if (!currentState || !canUseSettings()) {
    return;
  }

  roomStarted = started;
  currentState = createFreshMatchState(currentState);
  currentState.phase = started ? "map-pick" : "waiting";
  currentState.currentOperation = started ? "选择地图" : "等待管理员开始";
  confirmedLineups = {};
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  restState = null;
  pauseState = { active: false, startedAt: null, totalPausedMs: 0, collapsed: false };
  teamAckNotice = null;
  hiddenOverlay = null;
  adminNotice = null;
  openingSide = resolveOpeningSide();

  if (started) {
    restState = { open: true, mapIndex: 0, skipReady: createRestSkipReadyState() };
    mapSelectorState = null;
  } else {
    mapSelectorState = null;
  }

  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function readSettingsFromForm(): boolean {
  const readNumber = (id: keyof StageSetting): number => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    return input ? Number(input.value) || 0 : settingsState.stageLimits[id];
  };

  settingsState.stageLimits = {
    preStartRestSeconds: readNumber("preStartRestSeconds"),
    mapSelectSeconds: readNumber("mapSelectSeconds"),
    playerSelectSeconds: readNumber("playerSelectSeconds"),
    firstBanChoiceSeconds: readNumber("firstBanChoiceSeconds"),
    firstBanActionSeconds: readNumber("firstBanActionSeconds"),
    secondBanActionSeconds: readNumber("secondBanActionSeconds"),
    scoreConfirmSeconds: readNumber("scoreConfirmSeconds"),
    postMatchRestSeconds: readNumber("postMatchRestSeconds"),
  };

  const mapSelectionMode = document.getElementById("mapSelectionMode") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;
  const fixedMapOrderText = document.getElementById("fixedMapOrderText") as HTMLTextAreaElement | null;
  const fixedMapOrderSelects = [...app.querySelectorAll<HTMLSelectElement>(".fixed-map-order-select")];

  settingsState.mapSelectionMode = (mapSelectionMode?.value ?? settingsState.mapSelectionMode) as MapSelectionMode;
  settingsState.firstMapMode = firstMapMode?.value ?? settingsState.firstMapMode;
  settingsState.rosterMode = (rosterMode?.value ?? settingsState.rosterMode) as PlayerInputMode;
  settingsState.firstBanPolicy = (firstBanPolicy?.value ?? settingsState.firstBanPolicy) as FirstBanPolicy;
  settingsState.scoreReportMode = (scoreReportMode?.value ?? settingsState.scoreReportMode) as ScoreReportMode;
  settingsState.fixedMapOrderText = fixedMapOrderSelects.length > 0
    ? fixedMapOrderSelects.map((select) => select.value).filter(Boolean).join("\n")
    : fixedMapOrderText?.value ?? settingsState.fixedMapOrderText;
  settingsState.mapPool = readVisualMapPool();
  settingsState.presetRosterText = readVisualRosters();

  return true;
}

async function savePreset(): Promise<void> {
  if (!canUseSettings()) {
    return;
  }

  if (!readSettingsFromForm()) {
    return;
  }

  const nameInput = document.getElementById("presetName") as HTMLInputElement | null;
  const name = nameInput?.value.trim() || "默认预设";
  const response = await fetch("/api/settings/preset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, settings: settingsState }),
  });

  syncMapSelectorTarget(true);
  resetCountdown();
  publishSharedRoomSnapshot();
  alert(response.ok ? `已保存预设：${name}` : "保存失败");
  await populatePresetSelect();
  renderCurrent();
}

async function loadPreset(): Promise<void> {
  if (!canUseSettings()) {
    return;
  }

  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;
  const selectedName = presetSelect?.value;
  const response = await fetch("/api/settings/preset");

  if (!response.ok) {
    alert("载入失败");
    return;
  }

  const payload = await response.json();
  const presets = getPresetMapFromPayload(payload);
  const selectedPreset = selectedName ? presets[selectedName] : payload;

  if (!selectedPreset) {
    alert("请选择要导入的预设");
    return;
  }

  settingsState = mergeSettings(defaultSettings, selectedPreset);
  syncMapSelectorTarget(true);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

async function populatePresetSelect(): Promise<void> {
  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;

  if (!presetSelect) {
    return;
  }

  try {
    const response = await fetch("/api/settings/preset");

    if (!response.ok) {
      return;
    }

    const presets = getPresetMapFromPayload(await response.json());
    presetSelect.innerHTML = Object.keys(presets)
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");
  } catch {
    presetSelect.innerHTML = "";
  }
}

function getPresetMapFromPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const maybePresets = (payload as { presets?: unknown }).presets;

  if (maybePresets && typeof maybePresets === "object") {
    return maybePresets as Record<string, unknown>;
  }

  return { 默认预设: payload };
}

function readVisualMapPool(): Record<string, string[]> {
  const mapPool: Record<string, string[]> = {};
  const fixedOrderSelects = [...app.querySelectorAll<HTMLSelectElement>(".fixed-map-order-select")];

  if (fixedOrderSelects.length > 0) {
    fixedOrderSelects.forEach((select) => {
      const map = findCatalogMapByName(select.value);

      if (!map) {
        return;
      }

      mapPool[map.mode] = mapPool[map.mode] ?? [];
      mapPool[map.mode].push(map.nameEn);
    });

    return Object.keys(mapPool).length > 0 ? mapPool : settingsState.mapPool;
  }

  getVisualModeOrder().forEach((mode) => {
    app.querySelectorAll<HTMLInputElement>(`.map-pool-checkbox[data-map-mode="${cssEscape(mode)}"]`).forEach((checkbox) => {
      if (!checkbox.checked) {
        return;
      }

      mapPool[mode] = mapPool[mode] ?? [];
      mapPool[mode].push(checkbox.value);
    });
  });

  return Object.keys(mapPool).length > 0 ? mapPool : settingsState.mapPool;
}

function getVisualModeOrder(): string[] {
  const orderedModes = [...app.querySelectorAll<HTMLElement>(".mode-order-item")]
    .map((item) => item.dataset.modeOrder)
    .filter((mode): mode is string => Boolean(mode));
  const checkboxModes = [...app.querySelectorAll<HTMLInputElement>(".map-pool-checkbox")]
    .map((checkbox) => checkbox.dataset.mapMode)
    .filter((mode): mode is string => Boolean(mode));

  return [...new Set([...orderedModes, ...checkboxModes])];
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function readVisualRosters(): string {
  const rosters: Record<Side, string[]> = { left: [], right: [] };

  app.querySelectorAll<HTMLInputElement>(".roster-member-input").forEach((input) => {
    const side = input.dataset.rosterSide as Side | undefined;
    const value = input.value.trim();

    if (side && value) {
      rosters[side].push(value);
    }
  });

  return `蓝色方: ${rosters.left.join(",")}\n红色方: ${rosters.right.join(",")}`;
}

function getDefaultPresetFromPayload(payload: unknown): unknown {
  const presets = getPresetMapFromPayload(payload);
  const last = payload && typeof payload === "object" ? (payload as { last?: unknown }).last : null;

  if (typeof last === "string" && presets[last]) {
    return presets[last];
  }

  return Object.values(presets)[0] ?? {};
}

function restoreCheckpoint(row: number, key: CheckpointKey): void {
  if (!currentState || !canUseSettings() || Number.isNaN(row) || !settingsState.checkpoints[row]?.[key]?.enabled) {
    return;
  }

  roomStarted = true;
  hiddenOverlay = null;
  adminNotice = `管理员已回退到 MAP ${row + 1}：${settingsState.checkpoints[row][key].label}`;
  createTeamAckNotice(`管理员已回退到 MAP ${row + 1}：${settingsState.checkpoints[row][key].label}`);

  for (let index = row + 1; index < currentState.maps.length; index += 1) {
    currentState.maps[index] = createBlankMap(index);
    delete confirmedLineups[index];
  }

  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  restState = null;

  if (key === "mapPick" || !currentState.maps[row].nameEn) {
    currentState.maps[row] = createBlankMap(row);
    delete confirmedLineups[row];
    mapSelectorState = {
      open: true,
      minimized: false,
      selectedMapKey: null,
      targetMapIndex: row,
      pickerSide: getMapPickerSide(currentState, row),
      timedOut: false,
    };
  } else if (key === "lineupPick") {
    mapSelectorState = null;
    delete confirmedLineups[row];
    openLineupSelector(row);
  } else if (key === "firstSecondBanChoice" || key === "firstBan") {
    mapSelectorState = null;
    currentState.maps[row].bans = { left: null, right: null };
    currentState.maps[row].firstBanSide = null;
    openBanSelectorForMap(row);
  } else if (key === "secondBan") {
    mapSelectorState = null;
    const firstSide = currentState.maps[row].firstBanSide ?? getMapPickerSide(currentState, row);
    const secondSide = getOppositeSide(firstSide);
    currentState.maps[row].bans[secondSide] = null;
    banSelectorState = {
      open: true,
      mapIndex: row,
      step: "second-ban",
      chooserSide: firstSide,
      activeSide: secondSide,
      firstBanSide: firstSide,
      selectedOrder: null,
      selectedHeroKey: null,
      timedOut: false,
    };
  } else if (key === "scorePick") {
    mapSelectorState = null;
    currentState.maps[row].score = { left: null, right: null };
    currentState.maps[row].status = "after";
    openScoreSelectorForMap(row);
  } else {
    mapSelectorState = null;
    restState = { open: true, mapIndex: Math.max(0, row - 1), skipReady: createRestSkipReadyState() };
  }

  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function canOpenMapSlot(targetMapIndex: number): boolean {
  if (!currentState || !roomStarted || isBroadcastPortal() || getSeriesWinnerSide() !== null) {
    return false;
  }

  if (targetMapIndex !== findTargetMapIndex(currentState)) {
    return false;
  }

  if (hasActiveBlockingStageForMapOpen()) {
    return false;
  }

  return !mapSelectorState || mapSelectorState.targetMapIndex === targetMapIndex;
}

function getMapSlotWaitingLabel(targetMapIndex: number): string {
  if (getSeriesWinnerSide() !== null) {
    return "比赛结束";
  }

  if (!currentState || targetMapIndex !== findTargetMapIndex(currentState)) {
    return "等待前置流程";
  }

  if (hasActiveBlockingStageForMapOpen()) {
    return "等待当前流程";
  }

  return "等待选图";
}

function hasActiveBlockingStageForMapOpen(): boolean {
  return Boolean(
    lineupSelectorState?.open
      || banSelectorState?.open
      || scoreSelectorState?.open
      || restState?.open,
  );
}

function openMapSelector(targetMapIndex: number): void {
  if (!currentState || !roomStarted || isBroadcastPortal()) {
    return;
  }

  if (!canOpenMapSlot(targetMapIndex)) {
    return;
  }

  if (mapSelectorState?.targetMapIndex === targetMapIndex) {
    mapSelectorState.open = true;
    mapSelectorState.minimized = false;
    hiddenOverlay = null;
    renderCurrent();
    return;
  }

  mapSelectorState = {
    open: true,
    minimized: false,
    selectedMapKey: null,
    targetMapIndex,
    pickerSide: getMapPickerSide(currentState, targetMapIndex),
    timedOut: false,
  };
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function selectMapChoice(mapKey: string | null): void {
  if (!mapSelectorState || !mapKey || !canOperateMapSelection()) {
    return;
  }

  const choice = findMapChoiceByKey(mapKey);

  if (!choice || !getMapAvailability(choice).available || (mapSelectorState.timedOut && !isAdminPortal())) {
    return;
  }

  mapSelectorState.selectedMapKey = mapKey;
  publishSharedRoomSnapshot();
  updateSelectedMapDom();
}

function randomLegalMapChoice(): void {
  if (!isAdminPortal() || !mapSelectorState) {
    return;
  }

  const choice = pickRandomItem(getLegalMapChoices());

  if (!choice) {
    adminNotice = "没有可随机选择的合法地图，请手动处理或判负。";
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  mapSelectorState.selectedMapKey = choice.key;
  adminNotice = `管理员已随机选择地图：${getDisplayMapName(choice.nameEn)}`;
  createTeamAckNotice(`管理员已随机选择地图：${getDisplayMapName(choice.nameEn)}`);
  confirmSelectedMap();
}

function enableManualMapViolationChoice(): void {
  if (!isAdminPortal() || !mapSelectorState) {
    return;
  }

  adminNotice = "请选择一个合法地图并点击确认。";
  publishSharedRoomSnapshot();
  renderCurrent();
}

function forfeitCurrentMapChoice(): void {
  if (!currentState || !mapSelectorState || !isAdminPortal()) {
    return;
  }

  const loserSide = mapSelectorState.pickerSide;
  const mapIndex = mapSelectorState.targetMapIndex;
  applyForfeitMapLoss(mapIndex, loserSide, "地图选择超时/犯规");
  mapSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  if (finishMatchIfSeriesWon()) {
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function confirmSelectedMap(): void {
  if (!currentState || !mapSelectorState?.selectedMapKey || !canConfirmMapSelection()) {
    return;
  }

  const choice = findMapChoiceByKey(mapSelectorState.selectedMapKey);

  if (!choice || !getMapAvailability(choice).available) {
    return;
  }

  const targetMap = currentState.maps[mapSelectorState.targetMapIndex];
  const updatedMap: MatchMap = {
    ...targetMap,
    id: slugify(`${choice.mode}-${choice.nameEn}`),
    mode: choice.mode,
    modeIconUrl: choice.modeIconUrl,
    nameZh: getMapNameZh(choice.nameEn),
    nameEn: choice.nameEn,
    status: "after",
    imageUrl: choice.imageUrl,
  };

  const selectedMapIndex = mapSelectorState.targetMapIndex;
  currentState.maps[selectedMapIndex] = updatedMap;
  if (isAdminPortal()) {
    const message = `管理员已为 MAP ${selectedMapIndex + 1} 选择地图：${getDisplayMapName(choice.nameEn)}`;
    adminNotice = message;
    createTeamAckNotice(message);
  }
  mapSelectorState = null;
  openLineupSelector(selectedMapIndex);

  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function openLineupSelector(mapIndex: number): void {
  if (settingsState.rosterMode === "skip") {
    lineupSelectorState = null;
    openBanSelectorForMap(mapIndex);
    return;
  }

  lineupSelectorState = {
    open: true,
    mapIndex,
    values: createInitialLineupValues(),
    ready: createLineupReadyState(),
    timedOut: false,
  };
  hiddenOverlay = null;
}

function confirmLineups(): void {
  if (!lineupSelectorState || !canConfirmLineupSelection()) {
    return;
  }

  if (isAdminPortal()) {
    lineupSelectorState.ready = { left: true, right: true };
    const message = `管理员已确认 MAP ${lineupSelectorState.mapIndex + 1} 上场人员`;
    adminNotice = message;
    createTeamAckNotice(message);
    finalizeLineupSelection();
    return;
  }

  const side = portalConfig.side;

  if (!side) {
    return;
  }

  lineupSelectorState.ready[side] = true;

  if (isLineupReadyToFinalize()) {
    finalizeLineupSelection();
    return;
  }

  publishSharedRoomSnapshot();
  renderCurrent();
}

function openBanSelectorForMap(mapIndex: number): void {
  if (!currentState || settingsState.firstBanPolicy === "no_ban") {
    banSelectorState = null;
    openScoreSelectorForMap(mapIndex);
    return;
  }

  const chooserSide = getMapPickerSide(currentState, mapIndex);
  const firstBanSide = settingsState.firstBanPolicy === "loser_must_first" ? chooserSide : null;

  if (firstBanSide) {
    currentState.maps[mapIndex].firstBanSide = firstBanSide;
  }

  banSelectorState = {
    open: true,
    mapIndex,
    step: firstBanSide ? "first-ban" : "order-choice",
    chooserSide,
    activeSide: firstBanSide ?? chooserSide,
    firstBanSide,
    selectedOrder: null,
    selectedHeroKey: null,
    timedOut: false,
  };
  hiddenOverlay = null;
}

function selectBanOrder(order: BanOrderChoice | undefined): void {
  if (!banSelectorState || !order || !canOperateBanOrderChoice()) {
    return;
  }

  banSelectorState.selectedOrder = order;
  confirmBanSelection();
}

function selectHeroBan(heroKey: string | null): void {
  if (!banSelectorState || !heroKey || !canOperateHeroBan()) {
    return;
  }

  const hero = findHeroByKey(heroKey);

  if (!hero || !getHeroBanAvailability(hero).available) {
    return;
  }

  banSelectorState.selectedHeroKey = heroKey;
  publishSharedRoomSnapshot();
  renderCurrent();
}

function randomLegalBanChoice(): void {
  if (!banSelectorState || !isAdminPortal()) {
    return;
  }

  if (banSelectorState.step === "order-choice") {
    banSelectorState.selectedOrder = pickRandomItem<BanOrderChoice>(["first", "second"]);
    adminNotice = "管理员已随机选择先后 Ban。";
    createTeamAckNotice("管理员已随机选择先后 Ban。");
    confirmBanSelection();
    return;
  }

  const hero = pickRandomItem(getLegalBanHeroes());

  if (!hero) {
    adminNotice = "没有可随机选择的合法英雄，请手动处理或判负。";
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  banSelectorState.selectedHeroKey = getHeroKey(hero.nameEn);
  adminNotice = `管理员已随机 Ban：${hero.nameEn}`;
  createTeamAckNotice(`管理员已随机 Ban：${hero.nameEn}`);
  confirmBanSelection();
}

function enableManualBanViolationChoice(): void {
  if (!isAdminPortal() || !banSelectorState) {
    return;
  }

  adminNotice = banSelectorState.step === "order-choice" ? "请选择先 Ban 或后 Ban 并点击确认。" : "请选择一个合法英雄并点击确认。";
  publishSharedRoomSnapshot();
  renderCurrent();
}

function forfeitCurrentBanChoice(): void {
  if (!currentState || !banSelectorState || !isAdminPortal()) {
    return;
  }

  const loserSide = banSelectorState.step === "order-choice" ? banSelectorState.chooserSide : banSelectorState.activeSide;
  const mapIndex = banSelectorState.mapIndex;
  applyForfeitMapLoss(mapIndex, loserSide, "Ban 选择超时/犯规");
  mapSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  if (finishMatchIfSeriesWon()) {
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function confirmBanSelection(): void {
  if (!banSelectorState || !canConfirmBanSelection()) {
    return;
  }

  if (banSelectorState.step === "order-choice") {
    const firstBanSide =
      banSelectorState.selectedOrder === "first" ? banSelectorState.chooserSide : getOppositeSide(banSelectorState.chooserSide);

    banSelectorState.firstBanSide = firstBanSide;
    banSelectorState.activeSide = firstBanSide;
    banSelectorState.step = "first-ban";
    banSelectorState.selectedOrder = null;
    currentState!.maps[banSelectorState.mapIndex].firstBanSide = firstBanSide;
    if (isAdminPortal()) {
      const message = `管理员已确认先手 Ban：${getTeamName(firstBanSide)}`;
      adminNotice = message;
      createTeamAckNotice(message);
    }
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  const hero = findHeroByKey(banSelectorState.selectedHeroKey);

  if (!hero || !currentState) {
    return;
  }

  const side = banSelectorState.activeSide;
  currentState.maps[banSelectorState.mapIndex].bans[side] = createHeroBan(hero);
  if (isAdminPortal()) {
    const message = `管理员已为${getTeamName(side)}确认 Ban：${hero.nameEn}`;
    adminNotice = message;
    createTeamAckNotice(message);
  }

  if (banSelectorState.step === "first-ban") {
    banSelectorState.step = "second-ban";
    banSelectorState.activeSide = getOppositeSide(side);
    banSelectorState.selectedHeroKey = null;
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  const mapIndex = banSelectorState.mapIndex;
  banSelectorState = null;
  openScoreSelectorForMap(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function openScoreSelectorForMap(mapIndex: number): void {
  scoreSelectorState = {
    open: true,
    mapIndex,
    values: { left: "", right: "" },
    submittedBy: null,
    rejectedBy: null,
    timedOut: false,
  };
  hiddenOverlay = null;
}

function updateScoreValue(control: HTMLInputElement): void {
  if (!scoreSelectorState || !canEditScore()) {
    return;
  }

  const side = control.dataset.scoreSide as Side | undefined;

  if (!side) {
    return;
  }

  scoreSelectorState.values[side] = control.value;
  publishSharedRoomSnapshot();
  renderCurrent();
}

function confirmScoreSelection(): void {
  if (!scoreSelectorState || !canConfirmScoreSelection()) {
    return;
  }

  if (settingsState.scoreReportMode === "team_submit_opponent_confirm" && !isAdminPortal()) {
    const side = portalConfig.side;

    if (!side) {
      return;
    }

    if (!scoreSelectorState.submittedBy) {
      scoreSelectorState.submittedBy = side;
      scoreSelectorState.rejectedBy = null;
      resetCountdown();
      publishSharedRoomSnapshot();
      renderCurrent();
      return;
    }
  }

  finalizeScoreSelection();
}

function rejectScoreSelection(): void {
  if (!scoreSelectorState || !canRejectScoreSelection()) {
    return;
  }

  const side = portalConfig.side;

  if (!side) {
    return;
  }

  scoreSelectorState.rejectedBy = side;
  adminNotice = `${getTeamName(side)}未确认比分，等待管理员处理。`;
  publishSharedRoomSnapshot();
  renderCurrent();
}

function finalizeScoreSelection(): void {
  if (!currentState || !scoreSelectorState) {
    return;
  }

  const leftScore = Number(scoreSelectorState.values.left);
  const rightScore = Number(scoreSelectorState.values.right);
  const mapIndex = scoreSelectorState.mapIndex;
  const map = currentState.maps[mapIndex];

  map.score = { left: leftScore, right: rightScore };
  map.status = "completed";

  if (isAdminPortal()) {
    const message = `管理员已确认 MAP ${mapIndex + 1} 比分：${leftScore}-${rightScore}`;
    adminNotice = message;
    createTeamAckNotice(message);
  }

  if (leftScore !== rightScore) {
    const winnerSide: Side = leftScore > rightScore ? "left" : "right";
    currentState.teams[winnerSide].seriesScore += 1;
  }

  scoreSelectorState = null;
  if (finishMatchIfSeriesWon()) {
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function finishMatchIfSeriesWon(): boolean {
  if (!currentState) {
    return false;
  }

  const winnerSide = getSeriesWinnerSide(currentState);

  if (!winnerSide) {
    return false;
  }

  mapSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  restState = null;
  hiddenOverlay = null;
  currentState.phase = "completed";
  currentState.currentOperation = `比赛结束：${getTeamName(winnerSide)}获胜`;
  adminNotice = `比赛结束：${getTeamName(winnerSide)}以 ${currentState.teams[winnerSide].seriesScore}-${currentState.teams[getOppositeSide(winnerSide)].seriesScore} 获胜`;

  return true;
}

function openRestPeriod(mapIndex: number): void {
  restState = {
    open: true,
    mapIndex,
    skipReady: createRestSkipReadyState(),
  };
  hiddenOverlay = null;
}

function createRestSkipReadyState(): Record<Side, boolean> {
  return {
    left: false,
    right: false,
  };
}

function canSkipRestPeriod(): boolean {
  return Boolean(restState && (isAdminPortal() || portalConfig.side));
}

function skipRestPeriod(): void {
  if (!restState) {
    return;
  }

  if (isAdminPortal()) {
    finishRestPeriod();
    return;
  }

  const side = portalConfig.side;

  if (!side) {
    return;
  }

  restState.skipReady[side] = true;

  if (restState.skipReady.left && restState.skipReady.right) {
    finishRestPeriod();
    return;
  }

  publishSharedRoomSnapshot();
  renderCurrent();
}

function getRestButtonLabel(): string {
  if (!restState) {
    return "跳过休息";
  }

  if (isAdminPortal()) {
    return "跳过休息";
  }

  const side = portalConfig.side;

  if (side && restState.skipReady[side]) {
    return "等待对方跳过";
  }

  return "跳过休息";
}

function finishRestPeriod(): void {
  if (!restState) {
    return;
  }

  if (finishMatchIfSeriesWon()) {
    resetCountdown();
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  restState = null;
  openNextMapSelector();
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function openNextMapSelector(): void {
  if (!currentState || getSeriesWinnerSide() !== null) {
    mapSelectorState = null;
    return;
  }

  const nextTargetIndex = findTargetMapIndex(currentState);
  mapSelectorState =
    nextTargetIndex >= 0
      ? {
          open: true,
          minimized: true,
          selectedMapKey: null,
          targetMapIndex: nextTargetIndex,
          pickerSide: getMapPickerSide(currentState, nextTargetIndex),
          timedOut: false,
        }
      : null;
  hiddenOverlay = null;
}

function updateLineupValue(control: HTMLInputElement | HTMLSelectElement): void {
  if (!lineupSelectorState) {
    return;
  }

  const side = control.dataset.lineupSide as Side | undefined;
  const slotId = control.dataset.lineupSlot;

  if (!side || !slotId || !lineupSelectorState.values[side] || !canEditLineupSide(side)) {
    return;
  }

  lineupSelectorState.values[side][slotId] = control.value.trim();
  publishSharedRoomSnapshot();
  updateLineupDom();
}

function updateLineupDom(): void {
  if (!lineupSelectorState) {
    return;
  }

  (["left", "right"] as Side[]).forEach((side) => {
    const values = lineupSelectorState!.values[side];
    const duplicateValues = getDuplicateLineupValues(values);

    lineupSlots.forEach((slot) => {
      const element = app.querySelector<HTMLElement>(
        `.lineup-slot[data-lineup-side="${side}"][data-lineup-slot="${slot.id}"]`,
      );
      const value = values[slot.id] ?? "";
      element?.classList.toggle("lineup-slot-filled", value.length > 0);
      element?.classList.toggle("lineup-slot-duplicate", duplicateValues.has(normalizeRosterValue(value)));
    });
  });

  const confirmButton = document.getElementById("confirmLineupPick") as HTMLButtonElement | null;

  if (confirmButton) {
    confirmButton.disabled = !canConfirmLineupSelection();
    confirmButton.textContent = getLineupConfirmButtonLabel();
  }
}

function createInitialLineupValues(): Record<Side, Record<string, string>> {
  return {
    left: createEmptyLineupValues(),
    right: createEmptyLineupValues(),
  };
}

function createLineupReadyState(): Record<Side, boolean> {
  return {
    left: false,
    right: false,
  };
}

function createEmptyLineupValues(): Record<string, string> {
  return Object.fromEntries(lineupSlots.map((slot) => [slot.id, ""]));
}

function cloneLineupValues(values: Record<Side, Record<string, string>>): Record<Side, Record<string, string>> {
  return {
    left: { ...values.left },
    right: { ...values.right },
  };
}

function isLineupComplete(): boolean {
  if (!lineupSelectorState) {
    return false;
  }

  return (["left", "right"] as Side[]).every((side) => isSideLineupComplete(lineupSelectorState!.values[side]));
}

function canConfirmLineupSelection(): boolean {
  if (!lineupSelectorState || isBroadcastPortal()) {
    return false;
  }

  if (isAdminPortal()) {
    return isLineupComplete();
  }

  const side = portalConfig.side;

  if (!side || lineupSelectorState.ready[side] || lineupSelectorState.timedOut) {
    return false;
  }

  return isSideLineupComplete(lineupSelectorState.values[side]);
}

function isLineupReadyToFinalize(): boolean {
  return Boolean(
    lineupSelectorState
      && lineupSelectorState.ready.left
      && lineupSelectorState.ready.right
      && isLineupComplete(),
  );
}

function finalizeLineupSelection(): void {
  if (!lineupSelectorState) {
    return;
  }

  const mapIndex = lineupSelectorState.mapIndex;
  confirmedLineups[mapIndex] = cloneLineupValues(lineupSelectorState.values);
  lineupSelectorState = null;
  openBanSelectorForMap(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot();
  renderCurrent();
}

function isSideLineupComplete(values: Record<string, string>): boolean {
  const duplicateValues = getDuplicateLineupValues(values);

  return lineupSlots.every((slot) => (values[slot.id] ?? "").trim().length > 0) && duplicateValues.size === 0;
}

function canOperateBanOrderChoice(): boolean {
  if (!banSelectorState || banSelectorState.step !== "order-choice") {
    return false;
  }

  if (banSelectorState.timedOut && !isAdminPortal()) {
    return false;
  }

  return isAdminPortal() || portalConfig.side === banSelectorState.chooserSide;
}

function canOperateHeroBan(): boolean {
  if (!banSelectorState || banSelectorState.step === "order-choice") {
    return false;
  }

  if (banSelectorState.timedOut && !isAdminPortal()) {
    return false;
  }

  return isAdminPortal() || portalConfig.side === banSelectorState.activeSide;
}

function canConfirmBanSelection(): boolean {
  if (!banSelectorState || isBroadcastPortal()) {
    return false;
  }

  if (banSelectorState.step === "order-choice") {
    return Boolean(banSelectorState.selectedOrder && canOperateBanOrderChoice());
  }

  const hero = findHeroByKey(banSelectorState.selectedHeroKey);
  return Boolean(hero && getHeroBanAvailability(hero).available && canOperateHeroBan());
}

function canEditScore(): boolean {
  if (!scoreSelectorState || scoreSelectorState.timedOut) {
    return false;
  }

  if (isAdminPortal()) {
    return true;
  }

  return Boolean(
    settingsState.scoreReportMode === "team_submit_opponent_confirm"
      && portalConfig.side
      && !scoreSelectorState.submittedBy,
  );
}

function canConfirmScoreSelection(): boolean {
  if (!scoreSelectorState || !isScoreComplete() || isBroadcastPortal()) {
    return false;
  }

  if (isAdminPortal()) {
    return true;
  }

  if (settingsState.scoreReportMode !== "team_submit_opponent_confirm" || !portalConfig.side) {
    return false;
  }

  if (scoreSelectorState.rejectedBy) {
    return false;
  }

  if (!scoreSelectorState.submittedBy) {
    return true;
  }

  return scoreSelectorState.submittedBy !== portalConfig.side;
}

function canRejectScoreSelection(): boolean {
  return Boolean(
    scoreSelectorState
      && settingsState.scoreReportMode === "team_submit_opponent_confirm"
      && portalConfig.side
      && scoreSelectorState.submittedBy
      && scoreSelectorState.submittedBy !== portalConfig.side
      && !scoreSelectorState.rejectedBy,
  );
}

function isScoreConfirmationCounting(): boolean {
  return Boolean(
    scoreSelectorState?.open
      && settingsState.scoreReportMode === "team_submit_opponent_confirm"
      && scoreSelectorState.submittedBy
      && !scoreSelectorState.rejectedBy,
  );
}

function isScoreComplete(): boolean {
  if (!scoreSelectorState) {
    return false;
  }

  return (["left", "right"] as Side[]).every((side) => {
    const value = scoreSelectorState!.values[side].trim();
    return value !== "" && Number.isFinite(Number(value));
  });
}

function getDuplicateLineupValues(values: Record<string, string>): Set<string> {
  const counts = new Map<string, number>();

  lineupSlots.forEach((slot) => {
    const normalized = normalizeRosterValue(values[slot.id] ?? "");

    if (normalized) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  });

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value));
}

function syncMapSelectorTarget(keepExisting: boolean): void {
  if (!currentState || !roomStarted) {
    mapSelectorState = null;
    return;
  }

  if (getSeriesWinnerSide() !== null) {
    mapSelectorState = null;
    return;
  }

  if (lineupSelectorState?.open || banSelectorState?.open || scoreSelectorState?.open || restState?.open) {
    return;
  }

  const targetMapIndex = findTargetMapIndex(currentState);

  if (targetMapIndex < 0) {
    mapSelectorState = null;
    return;
  }

  const pickerSide = getMapPickerSide(currentState, targetMapIndex);

  if (keepExisting && mapSelectorState?.targetMapIndex === targetMapIndex) {
    mapSelectorState.pickerSide = pickerSide;
    return;
  }

  mapSelectorState = {
    open: true,
    minimized: false,
    selectedMapKey: null,
    targetMapIndex,
    pickerSide,
    timedOut: false,
  };
}

function findTargetMapIndex(state: MatchState): number {
  if (getSeriesWinnerSide(state) !== null) {
    return -1;
  }

  return state.maps.findIndex((map) => map.status === "tbd" || !map.nameEn);
}

function getMapPickerSide(state: MatchState, targetMapIndex: number): Side {
  for (let index = targetMapIndex - 1; index >= 0; index -= 1) {
    const map = state.maps[index];
    const result = compareScores(map.score.left, map.score.right);

    if (result !== null && result !== 0) {
      return result > 0 ? "right" : "left";
    }
  }

  if (state.teams.left.seriesScore !== state.teams.right.seriesScore) {
    return state.teams.left.seriesScore > state.teams.right.seriesScore ? "right" : "left";
  }

  return state.teams.left.seed <= state.teams.right.seed ? "left" : "right";
}

function getSeriesWinnerSide(state: MatchState | null = currentState): Side | null {
  if (!state) {
    return null;
  }

  const winsNeeded = getWinsNeeded();

  if (state.teams.left.seriesScore >= winsNeeded) {
    return "left";
  }

  if (state.teams.right.seriesScore >= winsNeeded) {
    return "right";
  }

  return null;
}

function getWinsNeeded(): number {
  return Math.floor(settingsState.stageCount / 2) + 1;
}

function getMapAvailability(choice: MapChoice): MapAvailability {
  if (!mapSelectorState) {
    return { available: false, reason: "当前没有选图步骤" };
  }

  if (!isMapInConfiguredPool(choice)) {
    return { available: false, reason: "未加入地图池" };
  }

  const usedMapNames = getUsedMapNames();

  if (usedMapNames.has(normalizeKey(choice.nameEn))) {
    return { available: false, reason: "本场已使用" };
  }

  if (settingsState.mapSelectionMode === "fixed_map_order") {
    return getFixedOrderAvailability(choice);
  }

  if (settingsState.mapSelectionMode === "strict_mode_order") {
    const requiredMode = getRequiredStrictMode();

    if (requiredMode && choice.mode !== requiredMode) {
      return { available: false, reason: `本轮限定${getModeLabel(requiredMode)}` };
    }
  }

  if (settingsState.mapSelectionMode === "first_mode_then_unique_mode") {
    if (mapSelectorState.targetMapIndex === 0 && choice.mode !== settingsState.firstMapMode) {
      return { available: false, reason: `首图限定${getModeLabel(settingsState.firstMapMode)}` };
    }

    if (mapSelectorState.targetMapIndex > 0 && isModeBlockedBeforeCycle(choice.mode)) {
      return { available: false, reason: "需先轮完地图类型" };
    }
  }

  if (settingsState.mapSelectionMode === "unique_mode_until_cycle") {
    if (isModeBlockedBeforeCycle(choice.mode)) {
      return { available: false, reason: "需先轮完地图类型" };
    }
  }

  return { available: true, reason: "" };
}

function isModeBlockedBeforeCycle(mode: string): boolean {
  const usedModes = getUsedModes();
  const modeOrder = getConfiguredModeOrder();

  if (usedModes.size < modeOrder.length && usedModes.has(mode)) {
    return true;
  }

  return false;
}

function getFixedOrderAvailability(choice: MapChoice): MapAvailability {
  if (!mapSelectorState) {
    return { available: false, reason: "当前没有选图步骤" };
  }

  const fixedOrder = parseFixedMapOrder();
  const requiredMap = fixedOrder[mapSelectorState.targetMapIndex];

  if (!requiredMap) {
    return { available: false, reason: `未配置第 ${mapSelectorState.targetMapIndex + 1} 张` };
  }

  if (normalizeKey(choice.nameEn) !== normalizeKey(requiredMap)) {
    return { available: false, reason: `固定为 ${requiredMap}` };
  }

  return { available: true, reason: "" };
}

function getUsedMapNames(): Set<string> {
  const usedNames = new Set<string>();

  if (!currentState || !mapSelectorState) {
    return usedNames;
  }

  currentState.maps.forEach((map, index) => {
    if (index !== mapSelectorState?.targetMapIndex && map.nameEn) {
      usedNames.add(normalizeKey(map.nameEn));
    }
  });

  return usedNames;
}

function isUsedMapChoice(choice: MapChoice): boolean {
  return getUsedMapNames().has(normalizeKey(choice.nameEn));
}

function getUsedModes(): Set<string> {
  const usedModes = new Set<string>();

  if (!currentState || !mapSelectorState) {
    return usedModes;
  }

  currentState.maps.forEach((map, index) => {
    if (index < mapSelectorState!.targetMapIndex && map.mode) {
      usedModes.add(map.mode);
    }
  });

  return usedModes;
}

function isMapInConfiguredPool(choice: MapChoice): boolean {
  const configuredNames = settingsState.mapPool[choice.mode] ?? [];

  if (configuredNames.length === 0) {
    return false;
  }

  const normalizedChoice = normalizeKey(choice.nameEn);
  return configuredNames.some((name) => normalizeKey(name) === normalizedChoice);
}

function getRequiredStrictMode(): string | null {
  if (!mapSelectorState) {
    return null;
  }

  const modeOrder = getConfiguredModeOrder();

  if (modeOrder.length === 0) {
    return null;
  }

  return modeOrder[mapSelectorState.targetMapIndex % modeOrder.length];
}

function getConfiguredModeOrder(): string[] {
  return Object.entries(settingsState.mapPool)
    .filter(([, maps]) => Array.isArray(maps) && maps.length > 0)
    .map(([mode]) => mode);
}

function parseFixedMapOrder(): string[] {
  return settingsState.fixedMapOrderText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getSelectorModeOrder(): string[] {
  return getConfiguredModeOrder();
}

function getMapChoicesByMode(mode: string): MapChoice[] {
  const configuredNames = settingsState.mapPool[mode] ?? [];
  const configuredNameKeys = new Set(configuredNames.map((name) => normalizeKey(name)));

  return (mapCatalogState.maps[mode] ?? [])
    .filter((map) => configuredNameKeys.has(normalizeKey(map.nameEn)))
    .map((map) => ({
      ...map,
      key: getMapKey(map.mode, map.nameEn),
      modeIconUrl: getModeIconUrl(map.mode),
    }));
}

function getLegalMapChoices(): MapChoice[] {
  return getSelectorModeOrder()
    .flatMap((mode) => getMapChoicesByMode(mode))
    .filter((choice) => getMapAvailability(choice).available);
}

function getAllCatalogMapChoices(): MapCatalogItem[] {
  return (mapCatalogState.modes.length ? mapCatalogState.modes : Object.keys(mapCatalogState.maps))
    .flatMap((mode) => mapCatalogState.maps[mode] ?? []);
}

function findCatalogMapByName(nameEn: string): MapCatalogItem | null {
  if (!nameEn) {
    return null;
  }

  const normalizedName = normalizeKey(nameEn);
  return getAllCatalogMapChoices().find((map) => normalizeKey(map.nameEn) === normalizedName) ?? null;
}

function findMapChoiceByKey(mapKey: string | null): MapChoice | null {
  if (!mapKey) {
    return null;
  }

  return getSelectorModeOrder()
    .flatMap((mode) => getMapChoicesByMode(mode))
    .find((choice) => choice.key === mapKey) ?? null;
}

function getMapKey(mode: string, nameEn: string): string {
  return `${normalizeKey(mode)}:${normalizeKey(nameEn)}`;
}

function getModeIconUrl(mode: string): string | null {
  return mapCatalogState.modeIcons[mode]?.imageUrl ?? null;
}

function getRosterOptions(side: Side): string[] {
  return parsePresetRosters()[side];
}

function parsePresetRosters(): Record<Side, string[]> {
  const rosters: Record<Side, string[]> = { left: [], right: [] };

  settingsState.presetRosterText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const members = parseRosterMembers(line);

      if (members.length === 0) {
        return;
      }

      if (matchesRosterSide(line, "left")) {
        rosters.left = members;
        return;
      }

      if (matchesRosterSide(line, "right")) {
        rosters.right = members;
        return;
      }

      if (rosters.left.length === 0) {
        rosters.left = members;
      } else if (rosters.right.length === 0) {
        rosters.right = members;
      }
    });

  return rosters;
}

function parseRosterMembers(line: string): string[] {
  const memberText = line.includes(":")
    ? line.split(":").slice(1).join(":")
    : line.includes("：")
      ? line.split("：").slice(1).join("：")
      : line;

  return memberText
    .split(/[,，、\s]+/)
    .map((member) => member.trim())
    .filter(Boolean);
}

function matchesRosterSide(line: string, side: Side): boolean {
  const normalizedLine = normalizeKey(line);
  const teamName = normalizeKey(getTeamName(side));

  if (line.includes(getTeamName(side))) {
    return true;
  }

  if (teamName && normalizedLine.includes(teamName)) {
    return true;
  }

  return side === "left" ? /蓝|blue|left|teama/i.test(line) : /红|red|right|teamb/i.test(line);
}

function getBanStepLabel(): string {
  if (!banSelectorState) {
    return "Ban 选";
  }

  if (banSelectorState.step === "order-choice") {
    return `${getTeamName(banSelectorState.chooserSide)} 选择先后 Ban`;
  }

  return `${getTeamName(banSelectorState.activeSide)} ${banSelectorState.step === "first-ban" ? "先手 Ban" : "后手 Ban"}`;
}

function getBanSelectionSummary(): string {
  if (!banSelectorState) {
    return "";
  }

  if (banSelectorState.step === "order-choice") {
    return banSelectorState.selectedOrder === "first"
      ? `${getTeamName(banSelectorState.chooserSide)} 选择先 Ban`
      : banSelectorState.selectedOrder === "second"
        ? `${getTeamName(banSelectorState.chooserSide)} 选择后 Ban`
        : "点击选择先 Ban 或后 Ban";
  }

  const hero = findHeroByKey(banSelectorState.selectedHeroKey);
  return hero ? hero.nameEn : "点击选择要禁用的英雄";
}

function getBanConfirmButtonLabel(): string {
  if (!banSelectorState) {
    return "确认";
  }

  if (!isAdminPortal() && portalConfig.side !== banSelectorState.activeSide && banSelectorState.step !== "order-choice") {
    return `等待${getTeamName(banSelectorState.activeSide)}操作`;
  }

  if (!isAdminPortal() && banSelectorState.step === "order-choice" && portalConfig.side !== banSelectorState.chooserSide) {
    return `等待${getTeamName(banSelectorState.chooserSide)}选择`;
  }

  if (banSelectorState.timedOut) {
    return isAdminPortal() ? "管理员确认" : "等待管理员处理";
  }

  return banSelectorState.step === "order-choice" ? "确认先后 Ban" : "确认 Ban";
}

function getScoreStatusText(): string {
  if (!scoreSelectorState) {
    return "";
  }

  if (settingsState.scoreReportMode === "admin_only") {
    return "等待管理员填写比分";
  }

  if (!scoreSelectorState.submittedBy) {
    return "等待任一队伍提交比分";
  }

  if (scoreSelectorState.rejectedBy) {
    return `${getTeamName(scoreSelectorState.rejectedBy)}未确认比分，等待管理员修改或确认`;
  }

  return `${getTeamName(scoreSelectorState.submittedBy)} 已提交，等待${getTeamName(getOppositeSide(scoreSelectorState.submittedBy))}确认`;
}

function getScoreConfirmButtonLabel(): string {
  if (!scoreSelectorState) {
    return "确认比分";
  }

  if (isAdminPortal()) {
    return "确认比分";
  }

  if (settingsState.scoreReportMode === "admin_only") {
    return "等待管理员填写";
  }

  if (!scoreSelectorState.submittedBy) {
    return "提交比分";
  }

  if (scoreSelectorState.rejectedBy) {
    return "等待管理员处理";
  }

  return scoreSelectorState.submittedBy === portalConfig.side ? "等待对方确认" : "确认对方比分";
}

function getScoreReportModeLabel(mode: ScoreReportMode): string {
  const labels: Record<ScoreReportMode, string> = {
    admin_only: "管理员填写比分",
    team_submit_opponent_confirm: "队伍提交，对方确认",
  };

  return labels[mode];
}

function getHeroesByRole(role: string): HeroCatalogItem[] {
  const roleKey = getHeroRoleKeyFromText(role);
  return mapCatalogState.heroes.filter((hero) => getHeroRoleKey(hero) === roleKey);
}

function getHeroKey(nameEn: string): string {
  return normalizeKey(nameEn);
}

function findHeroByKey(heroKey: string | null): HeroCatalogItem | null {
  if (!heroKey) {
    return null;
  }

  return mapCatalogState.heroes.find((hero) => getHeroKey(hero.nameEn) === heroKey) ?? null;
}

function getLegalBanHeroes(): HeroCatalogItem[] {
  return mapCatalogState.heroes.filter((hero) => getHeroBanAvailability(hero).available);
}

function getHeroBanAvailability(hero: HeroCatalogItem): MapAvailability {
  if (!currentState || !banSelectorState) {
    return { available: false, reason: "当前没有 Ban 选步骤" };
  }

  const heroKey = getHeroKey(hero.nameEn);
  const activeSide = banSelectorState.activeSide;

  if (hasSideBannedHero(activeSide, heroKey, banSelectorState.mapIndex)) {
    return { available: false, reason: `${getTeamName(activeSide)}本场已禁用过` };
  }

  if (banSelectorState.step === "second-ban") {
    const firstBanSide = banSelectorState.firstBanSide;
    const firstBan = firstBanSide ? currentState.maps[banSelectorState.mapIndex].bans[firstBanSide] : null;

    if (firstBan && getHeroRoleKeyFromText(firstBan.role) === getHeroRoleKey(hero)) {
      return { available: false, reason: "需与先手禁用英雄职责不同" };
    }
  }

  return { available: true, reason: "" };
}

function hasSideBannedHero(side: Side, heroKey: string, currentMapIndex: number): boolean {
  if (!currentState) {
    return false;
  }

  return currentState.maps.some((map, index) => {
    if (index === currentMapIndex) {
      return false;
    }

    const ban = map.bans[side];
    return Boolean(ban && getHeroKey(ban.nameEn) === heroKey);
  });
}

function createHeroBan(hero: HeroCatalogItem): HeroBan {
  return {
    hero: hero.nameEn,
    nameEn: hero.nameEn,
    role: getHeroRoleLabel(hero.role),
    imageUrl: hero.imageUrl,
  };
}

function getHeroRoleKey(hero: HeroCatalogItem): string {
  return getHeroRoleKeyFromText(hero.role || hero.roleZh);
}

function getHeroRoleKeyFromText(role: string): string {
  const normalized = normalizeKey(role);

  if (normalized.includes("tank") || role.includes("重装") || role.includes("坦克")) {
    return "tank";
  }

  if (normalized.includes("damage") || normalized.includes("offense") || role.includes("输出")) {
    return "damage";
  }

  if (normalized.includes("support") || role.includes("支援") || role.includes("辅助")) {
    return "support";
  }

  return normalized;
}

function getHeroRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    tank: "Tank",
    damage: "Damage",
    support: "Support",
  };

  return labels[normalizeKey(role)] ?? role;
}

function getRoleHeaderImageUrl(role: string): string {
  const urls: Record<string, string> = {
    tank: "/static/role-icons/tank-header.png",
    damage: "/static/role-icons/offense-header.png",
    support: "/static/role-icons/support-header.png",
  };

  return urls[getHeroRoleKeyFromText(role)] ?? urls.damage;
}

function getOppositeSide(side: Side): Side {
  return side === "left" ? "right" : "left";
}

function pickRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function applyForfeitMapLoss(mapIndex: number, loserSide: Side, reason: string): void {
  if (!currentState) {
    return;
  }

  const winnerSide = getOppositeSide(loserSide);
  const map = currentState.maps[mapIndex];
  const alreadyScored = map.status === "completed" && compareScores(map.score.left, map.score.right) !== null;

  currentState.maps[mapIndex] = {
    ...map,
    status: "completed",
    score: {
      left: winnerSide === "left" ? 1 : 0,
      right: winnerSide === "right" ? 1 : 0,
    },
  };

  if (!alreadyScored) {
    currentState.teams[winnerSide].seriesScore += 1;
  }

  const message = `${reason}，${getTeamName(loserSide)}本小图判负。`;
  adminNotice = message;
  createTeamAckNotice(message);
}

function getMapConfirmButtonLabel(): string {
  if (!mapSelectorState) {
    return "确认选择";
  }

  if (isBroadcastPortal()) {
    return "直播只读";
  }

  if (!canOperateMapSelection()) {
    return `等待${getTeamName(mapSelectorState.pickerSide)}选择`;
  }

  if (mapSelectorState.timedOut) {
    return isAdminPortal() ? "管理员确认" : "等待管理员处理";
  }

  return "确认选择";
}

function getMapDisabledReason(availability: MapAvailability): string {
  if (!mapSelectorState) {
    return "当前没有选图步骤";
  }

  if (!availability.available) {
    return availability.reason;
  }

  if (!canOperateMapSelection()) {
    return `等待${getTeamName(mapSelectorState.pickerSide)}选择`;
  }

  return "等待管理员处理";
}

function getLineupConfirmButtonLabel(): string {
  if (!lineupSelectorState) {
    return "确认阵容";
  }

  if (isBroadcastPortal()) {
    return "直播只读";
  }

  if (isAdminPortal()) {
    return lineupSelectorState.timedOut ? "管理员确认" : "确认双方阵容";
  }

  const side = portalConfig.side;

  if (!side) {
    return "确认阵容";
  }

  if (lineupSelectorState.ready[side]) {
    return "等待对方确认";
  }

  if (lineupSelectorState.timedOut) {
    return "等待管理员处理";
  }

  return `确认${side === "left" ? "蓝方" : "红方"}阵容`;
}

function getLineupStatusText(): string {
  if (!lineupSelectorState) {
    return "输出 / 输出 / 坦克 / 辅助 / 辅助";
  }

  const getSideStatus = (side: Side): string => `${side === "left" ? "蓝方" : "红方"}${
    lineupSelectorState!.ready[side] ? "已确认" : "待确认"
  }`;

  return `输出 / 输出 / 坦克 / 辅助 / 辅助 · ${getSideStatus("left")} / ${getSideStatus("right")}`;
}

function getRosterModeLabel(mode: PlayerInputMode): string {
  const labels: Record<PlayerInputMode, string> = {
    free_input: "自由输入成员",
    preset_only: "仅可选择预设成员",
    skip: "跳过成员选择",
  };

  return labels[mode];
}

function normalizeRosterValue(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function getTeamName(side: Side): string {
  return currentState?.teams[side].name ?? (side === "left" ? "左侧队伍" : "右侧队伍");
}

function getDisplayMapName(nameEn: string): string {
  const zh = getMapNameZh(nameEn);
  return zh === nameEn ? nameEn : `${zh} / ${nameEn}`;
}

function getMapNameZh(nameEn: string): string {
  const exact = mapNameZhByEn[nameEn];

  if (exact) {
    return exact;
  }

  const normalizedName = normalizeKey(nameEn);
  const matchedEntry = Object.entries(mapNameZhByEn).find(([name]) => normalizeKey(name) === normalizedName);

  return matchedEntry?.[1] ?? nameEn;
}

function getModeLabel(mode: string): string {
  return modeNameZhByEn[mode] ?? mode;
}

function getMapSelectionModeLabel(mode: MapSelectionMode): string {
  const labels: Record<MapSelectionMode, string> = {
    unique_map: "已选地图不可重复",
    unique_mode_until_cycle: "先轮完地图类型",
    first_mode_then_unique_mode: "首图限定类别，之后轮完类别前不重复",
    strict_mode_order: "按地图类型顺序",
    fixed_map_order: "固定地图顺序",
  };

  return labels[mode];
}

function startCountdownTimer(): void {
  if (countdownTimerId !== null) {
    window.clearInterval(countdownTimerId);
  }

  countdownTimerId = window.setInterval(updateCountdownDom, 50);
}

function resetCountdown(): void {
  const totalSeconds = getActiveCountdownTotalSeconds();
  countdownStartSeconds = totalSeconds;
  countdownStartedAt = Date.now();
  pauseState = {
    ...pauseState,
    startedAt: pauseState.active ? Date.now() : null,
    totalPausedMs: 0,
  };
}

function getCountdownSnapshot(): { remaining: number; percent: number } {
  const totalSeconds = getActiveCountdownTotalSeconds();
  const pausedMs = pauseState.totalPausedMs + (pauseState.active && pauseState.startedAt ? Date.now() - pauseState.startedAt : 0);
  const elapsedSeconds = Math.max(0, Date.now() - countdownStartedAt - pausedMs) / 1000;
  const remaining = Math.max(0, countdownStartSeconds - elapsedSeconds);
  const percent = (remaining / totalSeconds) * 100;

  return { remaining, percent: Math.max(0, Math.min(100, percent)) };
}

function getActiveCountdownTotalSeconds(): number {
  if (banSelectorState?.open) {
    if (banSelectorState.step === "order-choice") {
      return Math.max(1, settingsState.stageLimits.firstBanChoiceSeconds);
    }

    return Math.max(
      1,
      banSelectorState.step === "first-ban"
        ? settingsState.stageLimits.firstBanActionSeconds
        : settingsState.stageLimits.secondBanActionSeconds,
    );
  }

  if (lineupSelectorState?.open) {
    return Math.max(1, settingsState.stageLimits.playerSelectSeconds);
  }

  if (scoreSelectorState?.open) {
    return isScoreConfirmationCounting() ? Math.max(1, settingsState.stageLimits.scoreConfirmSeconds) : 1;
  }

  if (restState?.open) {
    const map = currentState?.maps[restState.mapIndex];
    return Math.max(
      1,
      map?.status === "completed"
        ? settingsState.stageLimits.postMatchRestSeconds
        : settingsState.stageLimits.preStartRestSeconds,
    );
  }

  if (!roomStarted) {
    return Math.max(1, settingsState.stageLimits.postMatchRestSeconds);
  }

  return Math.max(1, settingsState.stageLimits.mapSelectSeconds);
}

function getActiveOverlayKind(): OverlayKind | null {
  if (mapSelectorState?.open) {
    return "map";
  }

  if (lineupSelectorState?.open) {
    return "lineup";
  }

  if (banSelectorState?.open) {
    return "ban";
  }

  if (scoreSelectorState?.open) {
    return "score";
  }

  if (restState?.open) {
    return "rest";
  }

  return null;
}

function getOverlayKindLabel(kind: OverlayKind): string {
  const labels: Record<OverlayKind, string> = {
    map: "地图选择",
    lineup: "上场成员",
    ban: "英雄 Ban 选",
    score: "比分确认",
    rest: "休息时间",
  };

  return labels[kind];
}

function getActiveOverlaySummary(kind: OverlayKind): string {
  if (kind === "map" && mapSelectorState) {
    return `MAP ${mapSelectorState.targetMapIndex + 1} ${getTeamName(mapSelectorState.pickerSide)}选图中`;
  }

  if (kind === "lineup" && lineupSelectorState) {
    return `MAP ${lineupSelectorState.mapIndex + 1} 阵容确认中`;
  }

  if (kind === "ban" && banSelectorState) {
    return getBanStepLabel();
  }

  if (kind === "score" && scoreSelectorState) {
    return `MAP ${scoreSelectorState.mapIndex + 1} 比分确认中`;
  }

  if (kind === "rest" && restState) {
    return `MAP ${restState.mapIndex + 1} 休息中`;
  }

  return "";
}

function updateCountdownDom(): void {
  const { remaining, percent } = getCountdownSnapshot();

  document
    .querySelectorAll<HTMLElement>(
      ".map-selector-progress, .map-selector-progress-mini, .lineup-selector-progress, .ban-selector-progress, .score-selector-progress, .rest-progress",
    )
    .forEach((element) => element.style.setProperty("--progress-width", `${percent}%`));

  document
    .querySelectorAll<HTMLTimeElement>(".countdown-time")
    .forEach((element) => {
      element.textContent = formatCountdown(remaining);
    });

  document
    .querySelectorAll<HTMLElement>(".pause-elapsed")
    .forEach((element) => {
      element.textContent = formatElapsedPause();
    });

  if (pauseState.active) {
    return;
  }

  if (remaining <= 0) {
    if (banSelectorState?.open) {
      handleBanSelectionTimeout();
    } else if (lineupSelectorState?.open) {
      handleLineupSelectionTimeout();
    } else if (scoreSelectorState?.open && isScoreConfirmationCounting()) {
      finalizeScoreSelection();
    } else if (mapSelectorState?.open) {
      handleMapSelectionTimeout();
    } else if (restState?.open) {
      finishRestPeriod();
    }
  }
}

function updateSelectedMapDom(): void {
  if (!mapSelectorState) {
    return;
  }

  app.querySelectorAll<HTMLButtonElement>(".map-option").forEach((button) => {
    button.classList.toggle("map-option-selected", button.dataset.mapKey === mapSelectorState?.selectedMapKey);
  });

  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);
  const summary = document.querySelector<HTMLElement>(".selected-map-summary strong");
  const confirmButton = document.getElementById("confirmMapPick") as HTMLButtonElement | null;

  if (summary) {
    summary.textContent = selectedChoice ? getDisplayMapName(selectedChoice.nameEn) : "点击选择地图";
  }

  if (confirmButton) {
    confirmButton.disabled = !canConfirmMapSelection();
    confirmButton.textContent = getMapConfirmButtonLabel();
  }

  const selectedMode = selectedChoice?.mode ?? null;
  app.querySelectorAll<HTMLElement>(".mode-strip-item").forEach((element) => {
    element.classList.toggle(
      "mode-strip-item-active",
      Boolean(selectedMode && element.dataset.mode === selectedMode),
    );
  });
}

function handleBanSelectionTimeout(): void {
  if (!banSelectorState || banSelectorState.timedOut || isBroadcastPortal()) {
    return;
  }

  const canOperateCurrentStep =
    banSelectorState.step === "order-choice" ? canOperateBanOrderChoice() : canOperateHeroBan();

  if (!canOperateCurrentStep) {
    return;
  }

  if (!canConfirmBanSelection()) {
    banSelectorState.timedOut = true;
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  confirmBanSelection();
}

function handleMapSelectionTimeout(): void {
  if (!mapSelectorState || mapSelectorState.timedOut || isBroadcastPortal() || !canOperateMapSelection()) {
    return;
  }

  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);

  if (selectedChoice && getMapAvailability(selectedChoice).available && canConfirmMapSelection()) {
    confirmSelectedMap();
    return;
  }

  mapSelectorState.timedOut = true;
  publishSharedRoomSnapshot();
  renderCurrent();
}

function handleLineupSelectionTimeout(): void {
  if (!lineupSelectorState || lineupSelectorState.timedOut || isBroadcastPortal()) {
    return;
  }

  if (isAdminPortal()) {
    if (isLineupComplete()) {
      finalizeLineupSelection();
      return;
    }

    lineupSelectorState.timedOut = true;
    publishSharedRoomSnapshot();
    renderCurrent();
    return;
  }

  const side = portalConfig.side;

  if (!side) {
    return;
  }

  if (!lineupSelectorState.ready[side] && isSideLineupComplete(lineupSelectorState.values[side])) {
    lineupSelectorState.ready[side] = true;
  }

  if (isLineupReadyToFinalize()) {
    finalizeLineupSelection();
    return;
  }

  lineupSelectorState.timedOut = true;
  publishSharedRoomSnapshot();
  renderCurrent();
}

function formatCountdown(seconds: number): string {
  const wholeSeconds = Math.ceil(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function toggleGlobalPause(): void {
  if (!isAdminPortal()) {
    return;
  }

  if (pauseState.active) {
    resumeGlobalPause();
    return;
  }

  pauseState = {
    active: true,
    startedAt: Date.now(),
    totalPausedMs: pauseState.totalPausedMs,
    collapsed: false,
  };
  publishSharedRoomSnapshot();
  renderCurrent();
}

function resumeGlobalPause(): void {
  if (!pauseState.active) {
    return;
  }

  pauseState = {
    active: false,
    startedAt: null,
    totalPausedMs: pauseState.totalPausedMs + (pauseState.startedAt ? Date.now() - pauseState.startedAt : 0),
    collapsed: false,
  };
  publishSharedRoomSnapshot();
  renderCurrent();
}

function createTeamAckNotice(message: string): void {
  teamAckNotice = {
    message,
    acknowledged: {
      left: false,
      right: false,
    },
  };
}

function acknowledgeTeamNotice(): void {
  if (!teamAckNotice || !portalConfig.side) {
    return;
  }

  teamAckNotice.acknowledged[portalConfig.side] = true;

  if (teamAckNotice.acknowledged.left && teamAckNotice.acknowledged.right) {
    teamAckNotice = null;
  }

  publishSharedRoomSnapshot();
  renderCurrent();
}

function formatElapsedPause(): string {
  const elapsedMs = pauseState.totalPausedMs + (pauseState.active && pauseState.startedAt ? Date.now() - pauseState.startedAt : 0);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function mergeSettings(base: SettingsState, override: unknown): SettingsState {
  if (!override || typeof override !== "object") {
    return structuredClone(base);
  }

  const partial = override as Partial<SettingsState>;
  const merged = structuredClone(base);
  const checkpointOverrides = Array.isArray(partial.checkpoints) ? partial.checkpoints : [];

  return {
    ...merged,
    ...partial,
    checkpoints: merged.checkpoints.map((checkpoint, index) => ({
      ...checkpoint,
      ...(checkpointOverrides[index] ?? {}),
    })),
    stageLimits: {
      ...merged.stageLimits,
      ...(partial.stageLimits ?? {}),
    },
    mapPool: partial.mapPool ?? merged.mapPool,
  };
}

function renderError(message: string): void {
  app.innerHTML = `
    <main class="page-shell">
      <section class="error-card">
        <p class="eyebrow">加载失败</p>
        <h1>无法打开赛事方页面</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  `;
}

function formatMapScore(score: ScoreValue): string {
  if (score === null || score === "") {
    return "";
  }

  return score.toString();
}

function getScoreClasses(leftScore: ScoreValue, rightScore: ScoreValue): Record<Side, string> {
  const comparison = compareScores(leftScore, rightScore);

  if (comparison === null) {
    return { left: "", right: "" };
  }

  if (comparison === 0) {
    return { left: "map-score-even", right: "map-score-even" };
  }

  return comparison > 0
    ? { left: "map-score-leading", right: "map-score-trailing" }
    : { left: "map-score-trailing", right: "map-score-leading" };
}

function compareScores(leftScore: ScoreValue, rightScore: ScoreValue): number | null {
  const left = normalizeScore(leftScore);
  const right = normalizeScore(rightScore);

  if (left === null || right === null) {
    return null;
  }

  if (left.type === "result" || right.type === "result") {
    if (left.type !== "result" || right.type !== "result") {
      return null;
    }

    return left.value - right.value;
  }

  return left.value - right.value;
}

function normalizeScore(score: ScoreValue): { type: "number" | "result"; value: number } | null {
  if (score === null || score === "") {
    return null;
  }

  if (typeof score === "number") {
    return { type: "number", value: score };
  }

  const normalized = score.trim().toUpperCase();

  if (normalized === "W") {
    return { type: "result", value: 1 };
  }

  if (normalized === "L") {
    return { type: "result", value: 0 };
  }

  const numericText = normalized.replace(/[^\d.-]/g, "");
  const value = Number.parseFloat(numericText);

  if (Number.isNaN(value)) {
    return null;
  }

  return { type: "number", value };
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function escapeHtml(value: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(/[&<>"']/g, (character) => escapeMap[character]);
}
