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
type FirstBanPolicy = "allow_loser_choose" | "loser_must_first";
type LineupRole = "damage" | "tank" | "support";
type PortalRole = "red-team" | "blue-team" | "admin" | "broadcast";
type AppMode = "landing" | "room" | "global-admin" | "legacy-room";
type BanStep = "order-choice" | "first-ban" | "second-ban";
type BanOrderChoice = "first" | "second";
type ScoreReportMode = "admin_only" | "team_submit_opponent_confirm";
type OverlayKind = "map" | "lineup" | "ban" | "score" | "rest";
type CheckpointKey = keyof SettingsState["checkpoints"][number];
type MatchFormat = "ft2" | "ft3" | "ft4";
type SidePolicy = "random" | "interactive_random" | "left" | "right";
type OpeningSidePolicy = SidePolicy;
type FirstMapPickerPolicy = SidePolicy;
type MapPickerPolicy = "loser_choose";
type InteractiveRandomPurpose = "map_picker" | "opening_ban";
type OperationCategory = "room" | "settings" | "map" | "lineup" | "ban" | "score" | "rest" | "pause" | "notice" | "ui";

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
  matchName: string;
  teams: Record<Side, string>;
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
  modeOrder: string[];
  fixedMapOrderText: string;
  fixedFirstMapEnabled: boolean;
  fixedFirstMapName: string;
  firstMapPickerPolicy: FirstMapPickerPolicy;
  mapPickerPolicy: MapPickerPolicy;
  rosterMode: PlayerInputMode;
  presetRosterText: string;
  banEnabled: boolean;
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

interface InteractiveRandomState {
  purpose: InteractiveRandomPurpose;
  mapIndex: number;
  choices: Record<Side, 0 | 1 | null>;
  resolvedSide: Side | null;
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
  firstMapPickerSide: Side;
  interactiveRandomState: InteractiveRandomState | null;
  interactiveRandomResults: Partial<Record<InteractiveRandomPurpose, Side>>;
  countdownStartedAt: number;
  countdownStartSeconds: number;
}

interface RoomOperation {
  category: OperationCategory;
  action: string;
  details: Record<string, unknown>;
}

interface PendingSnapshotPush {
  snapshot: SharedRoomSnapshot;
  operation: RoomOperation;
}

interface RoomLinkInfo {
  hash: string;
  url: string;
  role: PortalRole;
  label: string;
  side: Side | null;
}

interface CreatedRoomResponse {
  roomId: string;
  createdAt: number;
  lastActiveAt: number;
  links: Record<string, RoomLinkInfo>;
}

interface RoomTokenResponse {
  room: {
    id: string;
    createdAt: number;
    lastActiveAt: number;
    closedAt: number | null;
    settings: unknown;
    config: RoomConfigState;
  };
  portal: PortalConfig;
  version: number;
  snapshot: SharedRoomSnapshot | null;
}

interface AdminSettings {
  roomsPerHour: number;
  inactiveTimeoutMinutes: number;
  defaultSettings: unknown;
  defaultPresetId: string | null;
}

type RoomConfigStatus = "draft" | "ready" | "locked";

interface ConfigPreset {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  config: SettingsState;
}

interface RoomConfigState {
  status: RoomConfigStatus;
  revision: number;
  source: {
    type: "builtin" | "manual" | "json" | "preset";
    presetId?: string;
    presetName?: string;
    presetRevision?: number;
  };
  value: SettingsState;
  confirmedAt: number | null;
  lockedAt: number | null;
}

interface AdminRoom {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  closedAt: number | null;
  version: number;
  links: Record<string, RoomLinkInfo>;
}

interface RoomHistorySummary {
  archiveKey: string;
  roomId: string;
  tokens: Record<string, string>;
  status: "active" | "closed" | "expired";
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  closedAt: number | null;
  closeReason: string | null;
  currentVersion: number;
  operationCount: number;
}

interface RoomHistoryPage {
  items: RoomHistorySummary[];
  total: number;
  page: number;
  pageSize: number;
}

const lineupSlots: LineupSlot[] = [
  { id: "damage-1", role: "damage", label: "输出" },
  { id: "damage-2", role: "damage", label: "输出" },
  { id: "tank-1", role: "tank", label: "坦克" },
  { id: "support-1", role: "support", label: "辅助" },
  { id: "support-2", role: "support", label: "辅助" },
];

const defaultMatchFormat: MatchFormat = "ft3";

const defaultSettings: SettingsState = {
  matchName: "OW Ban Pick Invitational",
  teams: { left: "蓝色方", right: "红色方" },
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
  mapSelectionMode: "first_mode_then_unique_mode",
  firstMapMode: "Control",
  modeOrder: ["Control", "Push", "Hybrid", "Escort", "Flashpoint", "Control", "Push"],
  fixedMapOrderText: "Lijiang Tower\nKing's Row\nDorado\nColosseo\nSuravasa\nIlios\nRunasapi",
  fixedFirstMapEnabled: false,
  fixedFirstMapName: "",
  firstMapPickerPolicy: "random",
  mapPickerPolicy: "loser_choose",
  rosterMode: "free_input",
  presetRosterText: "蓝色方: A1,A2,A3,A4,A5\n红色方: B1,B2,B3,B4,B5",
  banEnabled: true,
  firstBanPolicy: "allow_loser_choose",
  openingSidePolicy: "random",
  scoreReportMode: "team_submit_opponent_confirm",
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
  Control: "占领要点（控制）",
  Escort: "运载目标",
  Flashpoint: "闪点作战",
  Hybrid: "攻击/护送",
  Push: "机动推进",
};

const app = getAppRoot();
const appMode = getAppMode();
document.body.classList.toggle("landing-page-body", appMode === "landing");
document.body.classList.toggle("global-admin-page-body", appMode === "global-admin");
const roomToken = getRoomTokenFromPath();
const globalAdminHash = getGlobalAdminHashFromPath();
let portalConfig = getPortalConfig();
let roomStorageKey = createRoomStorageKey();
let roomChannel: BroadcastChannel | null = createRoomChannel();
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
let firstMapPickerSide: Side = resolveSidePolicy(defaultSettings.firstMapPickerPolicy);
let interactiveRandomState: InteractiveRandomState | null = null;
let interactiveRandomResults: Partial<Record<InteractiveRandomPurpose, Side>> = {};
let confirmedLineups: ConfirmedLineups = {};
let countdownStartedAt = Date.now();
let countdownStartSeconds = defaultSettings.stageLimits.mapSelectSeconds;
let countdownTimerId: number | null = null;
let serverSnapshotVersion = 0;
let serverSnapshotPollTimerId: number | null = null;
let serverSnapshotPushInFlight = false;
let pendingServerSnapshot: PendingSnapshotPush | null = null;
let lastCreatedRoom: CreatedRoomResponse | null = null;
let landingJoinValue = "";
let adminSettings: AdminSettings | null = null;
let configPresets: ConfigPreset[] = [];
let roomConfigState: RoomConfigState | null = null;
let selectedGlobalPresetId: string | null = null;
let globalPresetDraftMeta: { name: string } | null = null;
let adminRooms: AdminRoom[] = [];
let adminRoomHistory: RoomHistoryPage = { items: [], total: 0, page: 1, pageSize: 20 };

renderShell(app);
void loadInitialData();
window.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("storage", handleStorageEvent);
bindRoomChannel();

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Missing #app root element");
  }

  return root;
}

function getAppMode(): AppMode {
  const path = window.location.pathname;

  if (path.startsWith("/r/")) {
    return "room";
  }

  if (path.startsWith("/admin/")) {
    return "global-admin";
  }

  if (/^\/[ABCD]$/i.test(path)) {
    return "legacy-room";
  }

  return "landing";
}

function getRoomTokenFromPath(): string | null {
  if (!window.location.pathname.startsWith("/r/")) {
    return null;
  }

  return decodeURIComponent(window.location.pathname.slice("/r/".length)).trim() || null;
}

function getGlobalAdminHashFromPath(): string | null {
  if (!window.location.pathname.startsWith("/admin/")) {
    return null;
  }

  return decodeURIComponent(window.location.pathname.slice("/admin/".length)).trim() || null;
}

function createRoomStorageKey(): string {
  return roomToken ? `ow-ban-pick-room-${roomToken}` : "ow-ban-pick-room-default-v5";
}

function createRoomChannel(): BroadcastChannel | null {
  return "BroadcastChannel" in window ? new BroadcastChannel(roomStorageKey) : null;
}

function bindRoomChannel(): void {
  roomChannel?.addEventListener("message", (event: MessageEvent<SharedRoomSnapshot>) => {
    applySharedRoomSnapshot(event.data);
  });
}

function getPortalConfig(): PortalConfig {
  if (appMode === "room") {
    return { code: "A", role: "red-team", label: "房间入口", side: "right" };
  }

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
  if (!mapSelectorState || interactiveRandomState) {
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

function createRoomOperation(
  category: OperationCategory,
  action: string,
  details: Record<string, unknown> = {},
): RoomOperation {
  return { category, action, details };
}

function publishSharedRoomSnapshot(
  operation: RoomOperation = createRoomOperation("room", "snapshot_updated"),
): void {
  if (!currentState) {
    return;
  }

  const snapshot = createSharedRoomSnapshot();

  window.localStorage.setItem(roomStorageKey, JSON.stringify(snapshot));
  roomChannel?.postMessage(snapshot);

  if (roomToken) {
    queueServerSnapshotPush(snapshot, operation);
  }
}

function createSharedRoomSnapshot(): SharedRoomSnapshot {
  if (!currentState) {
    throw new Error("Cannot create room snapshot before state is loaded");
  }

  return {
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
    firstMapPickerSide,
    interactiveRandomState,
    interactiveRandomResults,
    countdownStartedAt,
    countdownStartSeconds,
  };
}

function queueServerSnapshotPush(snapshot: SharedRoomSnapshot, operation: RoomOperation): void {
  if (serverSnapshotPushInFlight) {
    pendingServerSnapshot = { snapshot, operation };
    return;
  }

  void pushServerSnapshot(snapshot, operation);
}

async function pushServerSnapshot(snapshot: SharedRoomSnapshot, operation: RoomOperation): Promise<void> {
  if (!roomToken) {
    return;
  }

  serverSnapshotPushInFlight = true;

  try {
    const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: serverSnapshotVersion, snapshot, operation }),
    });

    if (response.status === 409) {
      const payload = await response.json();
      serverSnapshotVersion = Number(payload.version ?? serverSnapshotVersion);

      if (payload.snapshot) {
        applySharedRoomSnapshot(payload.snapshot as SharedRoomSnapshot);
      }

      return;
    }

    if (response.ok) {
      const payload = await response.json();
      serverSnapshotVersion = Number(payload.version ?? serverSnapshotVersion);
    }
  } finally {
    serverSnapshotPushInFlight = false;

    if (pendingServerSnapshot) {
      const pending = pendingServerSnapshot;
      pendingServerSnapshot = null;
      queueServerSnapshotPush(pending.snapshot, pending.operation);
    }
  }
}

function applySharedRoomSnapshot(snapshot: SharedRoomSnapshot, shouldRender = true): void {
  if (!snapshot?.currentState) {
    return;
  }

  const localLineupState = lineupSelectorState;
  const localInteractiveRandomState = interactiveRandomState;
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
  firstMapPickerSide = snapshot.firstMapPickerSide ?? resolveSidePolicy(settingsState.firstMapPickerPolicy);
  interactiveRandomState = snapshot.interactiveRandomState ?? null;
  interactiveRandomResults = snapshot.interactiveRandomResults ?? {};
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

  if (
    localInteractiveRandomState
    && interactiveRandomState
    && localInteractiveRandomState.purpose === interactiveRandomState.purpose
    && portalConfig.side
    && localInteractiveRandomState.choices[portalConfig.side] !== null
    && interactiveRandomState.choices[portalConfig.side] === null
  ) {
    interactiveRandomState.choices[portalConfig.side] = localInteractiveRandomState.choices[portalConfig.side];
  }

  if (
    interactiveRandomState
    && !interactiveRandomState.resolvedSide
    && interactiveRandomState.choices.left !== null
    && interactiveRandomState.choices.right !== null
  ) {
    finalizeInteractiveRandom(false);
    return;
  }

  if (shouldRender) {
    renderCurrent();
  }
}

function startServerSnapshotPolling(): void {
  if (!roomToken || serverSnapshotPollTimerId !== null) {
    return;
  }

  serverSnapshotPollTimerId = window.setInterval(() => {
    void pullServerSnapshot();
  }, 1000);
}

async function pullServerSnapshot(): Promise<void> {
  if (!roomToken) {
    return;
  }

  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/snapshot`, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 410) {
    renderError("房间已经关闭或因不活跃而过期。");
    return;
  }

  if (!response.ok) {
    return;
  }

  const payload = await response.json() as { version: number; snapshot: SharedRoomSnapshot | null };
  const nextVersion = Number(payload.version ?? 0);

  if (nextVersion <= serverSnapshotVersion || !payload.snapshot) {
    return;
  }

  serverSnapshotVersion = nextVersion;
  applySharedRoomSnapshot(payload.snapshot);
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
    matchName: settingsState.matchName,
    phase: "waiting",
    currentOperation: "等待管理员开始",
    currentCountdownSeconds: settingsState.stageLimits.preStartRestSeconds,
    teams: {
      left: { ...baseState.teams.left, name: settingsState.teams.left, seriesScore: 0 },
      right: { ...baseState.teams.right, name: settingsState.teams.right, seriesScore: 0 },
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
    if (appMode === "landing") {
      renderLandingPage();
      return;
    }

    if (appMode === "global-admin") {
      await loadGlobalAdminData();
      renderGlobalAdminPage();
      return;
    }

    let roomPayload: RoomTokenResponse | null = null;

    if (roomToken) {
      const roomResponse = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}`, {
        headers: { Accept: "application/json" },
      });

      if (roomResponse.status === 410) {
        renderError("房间已经关闭或因不活跃而过期。");
        return;
      }

      if (!roomResponse.ok) {
        renderError("房间入口不存在。");
        return;
      }

      roomPayload = await roomResponse.json() as RoomTokenResponse;
      portalConfig = roomPayload.portal;
      serverSnapshotVersion = Number(roomPayload.version ?? 0);
      roomConfigState = roomPayload.room.config ?? null;
      if (portalConfig.role === "admin") {
        const presetsResponse = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config-presets`);
        if (presetsResponse.ok) {
          configPresets = ((await presetsResponse.json()) as { items: ConfigPreset[] }).items;
        }
        if (roomConfigState?.status !== "locked") {
          settingsPanelOpen = true;
        }
      }
    }

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

    if (roomConfigState?.value) {
      settingsState = mergeSettings(defaultSettings, roomConfigState.value);
    } else if (roomPayload?.room.settings) {
      settingsState = mergeSettings(defaultSettings, roomPayload.room.settings);
    } else if (presetResponse.ok) {
      settingsState = mergeSettings(defaultSettings, getDefaultPresetFromPayload(await presetResponse.json()));
    }

    const savedSnapshot = roomPayload?.snapshot ?? readSharedRoomSnapshot();

    if (savedSnapshot) {
      applySharedRoomSnapshot(savedSnapshot, false);
      startCountdownTimer();
      startServerSnapshotPolling();
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
    firstMapPickerSide = resolveSidePolicy(settingsState.firstMapPickerPolicy);
    interactiveRandomState = null;
    interactiveRandomResults = {};
    confirmedLineups = {};
    resetCountdown();
    publishSharedRoomSnapshot(createRoomOperation("room", "initialized"));
    startCountdownTimer();
    startServerSnapshotPolling();
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
          <span>${escapeHtml(getMatchFormatLabel(settingsState.matchFormat))}</span>
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
      ${renderInteractiveRandomOverlay()}
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
  bindInteractiveRandomEvents();
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

function renderLandingPage(errorMessage = ""): void {
  app.innerHTML = `
    <main class="page-shell landing-page-shell">
      <header class="landing-brand" aria-label="守望先锋赛事BP房间">
        <span class="landing-brand-mark" aria-hidden="true">OW</span>
        <h1 class="landing-site-title">守望先锋赛事BP房间</h1>
      </header>
      <div class="landing-layout ${lastCreatedRoom ? "landing-layout-created" : "landing-layout-initial"}">
        <section class="landing-panel landing-join-panel" aria-labelledby="joinRoomTitle">
          <div class="landing-panel-heading">
            <h2 id="joinRoomTitle">已有房间</h2>
            <p class="landing-description">输入代码进入房间页面</p>
          </div>
          <form id="joinRoomForm" class="landing-join-form" novalidate>
            <div class="landing-join-controls">
              <input
                id="joinRoomHash"
                name="roomHash"
                type="text"
                value="${escapeHtml(landingJoinValue)}"
                inputmode="text"
                pattern="[0-9a-z]{4}"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                placeholder="a7k2"
                aria-label="房间代码"
                aria-describedby="joinRoomStatus"
              />
              <button id="joinRoomButton" class="landing-primary-button" type="submit">进入房间</button>
            </div>
            <p id="joinRoomStatus" class="landing-status" aria-live="polite"></p>
          </form>
        </section>

        <section class="landing-panel landing-create-panel" aria-labelledby="createRoomTitle">
          <div class="landing-panel-heading">
            <h2 id="createRoomTitle">创建房间</h2>
            <p class="landing-description">生成进入房间的代码</p>
          </div>
          ${lastCreatedRoom
            ? renderCreatedRoomLinks(lastCreatedRoom)
            : `<button id="createRoomButton" class="landing-primary-button landing-create-button" type="button">创建房间</button>`}
          <p id="createRoomStatus" class="landing-status${errorMessage ? " landing-status-error" : ""}" aria-live="polite">${escapeHtml(errorMessage)}</p>
        </section>
      </div>
    </main>
  `;

  document.getElementById("createRoomButton")?.addEventListener("click", createRoomFromLanding);
  bindJoinRoomForm();
  bindRoomHashButtons();
}

function renderCreatedRoomLinks(room: CreatedRoomResponse): string {
  return `
    <div class="created-room-panel">
      <div class="created-room-header">
        <span>房间已创建</span>
      </div>
      <div class="room-link-grid">
        ${Object.entries(room.links).map(([code, link]) => {
          const landingLabel = getLandingPortalLabel(code);
          return `
            <article class="room-link-card room-link-card-${escapeHtml(code.toLowerCase())}">
              <div class="room-link-role">
                <span class="room-role-dot" aria-hidden="true"></span>
                <span>${escapeHtml(landingLabel)}</span>
              </div>
              <div class="room-link-actions">
                <button
                  class="copy-room-hash-button"
                  data-copy-hash="${escapeHtml(link.hash)}"
                  data-copy-label="${escapeHtml(landingLabel)}"
                  type="button"
                  aria-label="复制${escapeHtml(landingLabel)}哈希 ${escapeHtml(link.hash)}"
                >${escapeHtml(link.hash)}</button>
                <a class="enter-room-link" href="${escapeHtml(link.url)}">进入</a>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <p id="copyRoomHashStatus" class="landing-status landing-copy-status" aria-live="polite"></p>
    </div>
  `;
}

function getLandingPortalLabel(code: string): string {
  const labels: Record<string, string> = {
    A: "队伍1入口",
    B: "队伍2入口",
    C: "管理员入口",
    D: "直播入口",
  };

  return labels[code] ?? "房间入口";
}

function bindJoinRoomForm(): void {
  const form = document.getElementById("joinRoomForm") as HTMLFormElement | null;
  const input = document.getElementById("joinRoomHash") as HTMLInputElement | null;

  if (!form || !input) {
    return;
  }

  input.addEventListener("input", () => {
    const normalizedValue = normalizeRoomHash(input.value);
    input.value = normalizedValue;
    landingJoinValue = normalizedValue;
    setLandingJoinStatus("");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void enterRoomFromLanding();
  });
}

function normalizeRoomHash(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 4);
}

async function enterRoomFromLanding(): Promise<void> {
  const input = document.getElementById("joinRoomHash") as HTMLInputElement | null;
  const button = document.getElementById("joinRoomButton") as HTMLButtonElement | null;

  if (!input || !button) {
    return;
  }

  const roomHash = normalizeRoomHash(input.value);
  input.value = roomHash;
  landingJoinValue = roomHash;

  if (!/^[0-9a-z]{4}$/.test(roomHash)) {
    setLandingJoinStatus("请输入完整的 4 位数字或小写字母哈希。", true);
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "验证中...";
  setLandingJoinStatus("正在验证房间入口...");

  try {
    const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomHash)}`, {
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      window.location.assign(`/r/${encodeURIComponent(roomHash)}`);
      return;
    }

    if (response.status === 404) {
      setLandingJoinStatus("房间入口不存在，请检查哈希。", true);
      return;
    }

    if (response.status === 410) {
      setLandingJoinStatus("房间已经关闭或因不活跃而过期。", true);
      return;
    }

    setLandingJoinStatus("暂时无法验证房间，请稍后重试。", true);
  } catch {
    setLandingJoinStatus("网络连接失败，请稍后重试。", true);
  } finally {
    if (document.body.contains(button)) {
      button.disabled = false;
      button.textContent = "进入房间";
    }
  }
}

function setLandingJoinStatus(message: string, isError = false): void {
  const status = document.getElementById("joinRoomStatus");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("landing-status-error", isError);
}

async function createRoomFromLanding(): Promise<void> {
  const button = document.getElementById("createRoomButton") as HTMLButtonElement | null;

  if (button) {
    button.disabled = true;
    button.textContent = "创建中...";
  }

  try {
    const response = await fetch("/api/rooms", { method: "POST", headers: { Accept: "application/json" } });

    if (response.status === 429) {
      renderLandingPage("创建过于频繁，请稍后再试。");
      return;
    }

    if (!response.ok) {
      renderLandingPage("创建房间失败，请稍后重试。");
      return;
    }

    lastCreatedRoom = await response.json() as CreatedRoomResponse;
    renderLandingPage();
  } catch {
    renderLandingPage("网络连接失败，请稍后重试。");
  }
}

function bindRoomHashButtons(): void {
  app.querySelectorAll<HTMLButtonElement>(".copy-room-hash-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const roomHash = button.dataset.copyHash;
      const label = button.dataset.copyLabel;
      const status = document.getElementById("copyRoomHashStatus");

      if (!roomHash || !label || !status) {
        return;
      }

      try {
        if (!navigator.clipboard) {
          throw new Error("Clipboard API unavailable");
        }

        await navigator.clipboard.writeText(roomHash);
        status.textContent = `${label}哈希 ${roomHash} 已复制。`;
        status.classList.remove("landing-status-error");
        button.classList.add("is-copied");
        window.setTimeout(() => button.classList.remove("is-copied"), 1200);
      } catch {
        status.textContent = "复制失败，请手动选择哈希。";
        status.classList.add("landing-status-error");
      }
    });
  });
}

function bindCopyLinkButtons(): void {
  app.querySelectorAll<HTMLButtonElement>(".copy-link-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue;

      if (!value || !navigator.clipboard) {
        button.textContent = "复制失败";
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
    });
  });
}

async function loadGlobalAdminData(page = adminRoomHistory.page): Promise<void> {
  if (!globalAdminHash) {
    renderError("缺少全局管理哈希。");
    return;
  }

  const [settingsResponse, roomsResponse, historyResponse, presetsResponse, catalogResponse] = await Promise.all([
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/settings`, { headers: { Accept: "application/json" } }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/rooms`, { headers: { Accept: "application/json" } }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/room-history?page=${page}&pageSize=20`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets`, { headers: { Accept: "application/json" } }),
    fetch("/api/maps/catalog", { headers: { Accept: "application/json" } }),
  ]);

  if (!settingsResponse.ok || !roomsResponse.ok || !historyResponse.ok || !presetsResponse.ok || !catalogResponse.ok) {
    renderError("全局管理入口不存在。");
    return;
  }

  adminSettings = await settingsResponse.json() as AdminSettings;
  const roomsPayload = await roomsResponse.json() as { rooms: AdminRoom[] };
  adminRooms = roomsPayload.rooms;
  adminRoomHistory = await historyResponse.json() as RoomHistoryPage;
  configPresets = ((await presetsResponse.json()) as { items: ConfigPreset[] }).items;
  mapCatalogState = await catalogResponse.json() as MapCatalogState;
  if (selectedGlobalPresetId && !configPresets.some((preset) => preset.id === selectedGlobalPresetId)) {
    selectedGlobalPresetId = null;
  }
}

function renderGlobalAdminPage(message = ""): void {
  if (!adminSettings) {
    return;
  }

  const historyPageCount = Math.max(1, Math.ceil(adminRoomHistory.total / adminRoomHistory.pageSize));
  const selectedPreset = configPresets.find((preset) => preset.id === selectedGlobalPresetId);
  if (selectedPreset && !globalPresetDraftMeta) {
    settingsState = mergeSettings(defaultSettings, selectedPreset.config);
  } else if (selectedGlobalPresetId === "__new__" && !globalPresetDraftMeta) {
    settingsState = structuredClone(defaultSettings);
  }

  app.innerHTML = `
    <main class="page-shell global-admin-shell">
      <header class="global-admin-page-heading">
        <div>
          <span>管理设置</span>
          <h1>全局管理</h1>
          <p>管理房间限制、默认配置模板和历史记录。</p>
        </div>
      </header>
      ${message ? `<p class="admin-notice global-admin-notice">${escapeHtml(message)}</p>` : ""}
      <section class="global-admin-panel admin-settings-panel">
        ${renderAdminSectionHeader("常规设置", "创建房间时使用的全局规则。")}
        <div class="admin-setting-list">
          ${renderAdminSettingRow(
            "每 IP 每小时创建数",
            "限制单个 IP 地址每小时最多可以创建的房间数量。",
            `<input id="adminRoomsPerHour" type="number" min="1" max="500" value="${adminSettings.roomsPerHour}" />`,
          )}
          ${renderAdminSettingRow(
            "不活跃关闭分钟数",
            "房间在指定分钟内没有活动时自动关闭并归档。",
            `<input id="adminInactiveTimeout" type="number" min="1" max="43200" value="${adminSettings.inactiveTimeoutMinutes}" />`,
          )}
          ${renderAdminSettingRow(
            "新房间默认模板",
            "选择新建房间时自动复制的配置模板。",
            `<select id="adminDefaultPreset">
              <option value="">网站内置默认配置</option>
              ${configPresets.map((preset) => `<option value="${escapeHtml(preset.id)}" ${adminSettings!.defaultPresetId === preset.id ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}
            </select>`,
          )}
        </div>
        <footer class="admin-section-footer">
          <button id="saveGlobalSettings" class="admin-primary-button" type="button">保存全局设置</button>
        </footer>
      </section>
      ${renderConfigPresetManager(selectedPreset ?? null)}
      <section class="global-admin-panel">
        ${renderAdminSectionHeader("房间列表", "查看当前活动房间并复制各入口地址。", `${adminRooms.length} 间`)}
        <div class="admin-room-list">
          ${adminRooms.map(renderAdminRoom).join("") || `<p class="empty-room-list">暂无房间</p>`}
        </div>
      </section>
      <section class="global-admin-panel">
        ${renderAdminSectionHeader("永久历史", "已归档房间的状态、时间和操作记录。", `${adminRoomHistory.total} 份 JSON`)}
        <div class="history-list-heading" aria-hidden="true">
          <span>状态</span><span>房间</span><span>时间</span><span>版本与操作</span><span>操作</span>
        </div>
        <div class="admin-room-list history-room-list">
          ${adminRoomHistory.items.map(renderRoomHistorySummary).join("") || `<p class="empty-room-list">暂无历史记录</p>`}
        </div>
        <nav class="history-pagination" aria-label="历史分页">
          <button id="previousHistoryPage" type="button" ${adminRoomHistory.page <= 1 ? "disabled" : ""}>上一页</button>
          <span>第 ${adminRoomHistory.page} / ${historyPageCount} 页</span>
          <button id="nextHistoryPage" type="button" ${adminRoomHistory.page >= historyPageCount ? "disabled" : ""}>下一页</button>
        </nav>
      </section>
      <dialog id="roomHistoryDialog" class="history-dialog">
        <header>
          <strong id="roomHistoryDialogTitle">房间历史 JSON</strong>
          <button id="closeRoomHistoryDialog" type="button" aria-label="关闭历史详情">关闭</button>
        </header>
        <pre id="roomHistoryJson">正在载入...</pre>
      </dialog>
    </main>
  `;

  document.getElementById("saveGlobalSettings")?.addEventListener("click", saveGlobalSettings);
  bindGlobalPresetManagerEvents();
  app.querySelectorAll<HTMLButtonElement>(".close-admin-room").forEach((button) => {
    button.addEventListener("click", () => closeAdminRoom(button.dataset.roomId ?? ""));
  });
  app.querySelectorAll<HTMLButtonElement>(".view-room-history").forEach((button) => {
    button.addEventListener("click", () => viewRoomHistory(button.dataset.archiveKey ?? ""));
  });
  document.getElementById("previousHistoryPage")?.addEventListener("click", () => changeHistoryPage(adminRoomHistory.page - 1));
  document.getElementById("nextHistoryPage")?.addEventListener("click", () => changeHistoryPage(adminRoomHistory.page + 1));
  document.getElementById("closeRoomHistoryDialog")?.addEventListener("click", () => {
    (document.getElementById("roomHistoryDialog") as HTMLDialogElement | null)?.close();
  });
  bindCopyLinkButtons();
}

function renderAdminSectionHeader(title: string, description: string, count = ""): string {
  return `
    <header class="admin-section-header">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </div>
      ${count ? `<span>${escapeHtml(count)}</span>` : ""}
    </header>
  `;
}

function renderAdminSettingRow(title: string, description: string, control: string): string {
  return `
    <label class="admin-setting-row">
      <span class="admin-setting-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
      <span class="admin-setting-control">${control}</span>
    </label>
  `;
}

function renderAdminRoom(room: AdminRoom): string {
  const isClosed = Boolean(room.closedAt);

  return `
    <article class="admin-room-card active-admin-room-card">
      <header>
        <span class="room-status ${isClosed ? "room-status-closed" : "room-status-active"}">${isClosed ? "已关闭" : "活跃"}</span>
        <strong>房间 ${escapeHtml(room.id)}</strong>
        <button class="close-admin-room" data-room-id="${escapeHtml(room.id)}" type="button" ${isClosed ? "disabled" : ""}>关闭房间</button>
      </header>
      <p>创建：${formatTimestamp(room.createdAt)} · 最后活跃：${formatTimestamp(room.lastActiveAt)}${room.closedAt ? ` · 关闭：${formatTimestamp(room.closedAt)}` : ""}</p>
      <div class="admin-room-links">
        ${Object.entries(room.links).map(([code, link]) => `
          <div>
            <span>${escapeHtml(getLandingPortalLabel(code))}</span>
            <code>${escapeHtml(link.hash)}</code>
            <button class="copy-link-button" data-copy-value="${escapeHtml(link.url)}" type="button">复制</button>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderRoomHistorySummary(history: RoomHistorySummary): string {
  const statusLabels: Record<RoomHistorySummary["status"], string> = {
    active: "活跃",
    closed: "手动关闭",
    expired: "超时归档",
  };
  const historyBaseUrl = `/api/admin/${encodeURIComponent(globalAdminHash ?? "")}/room-history/${encodeURIComponent(history.archiveKey)}`;

  return `
    <article class="history-room-row">
      <span class="history-status history-status-${escapeHtml(history.status)}">${statusLabels[history.status] ?? history.status}</span>
      <div class="history-room-identity">
        <strong>房间 ${escapeHtml(history.roomId)}</strong>
        <code>${escapeHtml(history.archiveKey)}</code>
      </div>
      <div class="history-room-time">
        <span>创建：${formatTimestamp(history.createdAt)}</span>
        <span>更新：${formatTimestamp(history.updatedAt)}${history.closedAt ? ` · 关闭：${formatTimestamp(history.closedAt)}` : ""}</span>
      </div>
      <div class="history-room-stats">
        <span>版本 ${history.currentVersion} · ${history.operationCount} 条操作</span>
        ${history.closeReason ? `<small>${escapeHtml(history.closeReason)}</small>` : ""}
      </div>
      <div class="history-card-actions">
        <button class="view-room-history" data-archive-key="${escapeHtml(history.archiveKey)}" type="button">查看</button>
        <a class="download-room-history" href="${escapeHtml(`${historyBaseUrl}/download`)}" download="${escapeHtml(`${history.archiveKey}.json`)}">下载</a>
      </div>
    </article>
  `;
}

async function changeHistoryPage(page: number): Promise<void> {
  if (page < 1) {
    return;
  }

  await loadGlobalAdminData(page);
  renderGlobalAdminPage();
}

async function viewRoomHistory(archiveKey: string): Promise<void> {
  if (!globalAdminHash || !archiveKey) {
    return;
  }

  const dialog = document.getElementById("roomHistoryDialog") as HTMLDialogElement | null;
  const title = document.getElementById("roomHistoryDialogTitle");
  const output = document.getElementById("roomHistoryJson");

  if (!dialog || !title || !output) {
    return;
  }

  title.textContent = `${archiveKey}.json`;
  output.textContent = "正在载入...";

  if (!dialog.open) {
    dialog.showModal();
  }

  const response = await fetch(
    `/api/admin/${encodeURIComponent(globalAdminHash)}/room-history/${encodeURIComponent(archiveKey)}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    output.textContent = "历史文件载入失败。";
    return;
  }

  output.textContent = JSON.stringify(await response.json(), null, 2);
}

async function saveGlobalSettings(): Promise<void> {
  if (!globalAdminHash || !adminSettings) {
    return;
  }

  const roomsPerHour = Number((document.getElementById("adminRoomsPerHour") as HTMLInputElement | null)?.value || adminSettings.roomsPerHour);
  const inactiveTimeoutMinutes = Number((document.getElementById("adminInactiveTimeout") as HTMLInputElement | null)?.value || adminSettings.inactiveTimeoutMinutes);
  const defaultPresetId = (document.getElementById("adminDefaultPreset") as HTMLSelectElement | null)?.value || null;

  const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomsPerHour, inactiveTimeoutMinutes, defaultPresetId }),
  });

  if (response.ok) {
    adminSettings = await response.json() as AdminSettings;
    renderGlobalAdminPage("全局设置已保存。");
  }
}

async function closeAdminRoom(roomId: string): Promise<void> {
  if (!globalAdminHash || !roomId) {
    return;
  }

  const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/rooms/${encodeURIComponent(roomId)}/close`, {
    method: "POST",
  });

  if (response.ok) {
    await loadGlobalAdminData();
    renderGlobalAdminPage("房间已关闭。");
  }
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) {
    return "-";
  }

  const date = new Date(timestamp * 1000);
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderStartGate(): string {
  const status = roomConfigState?.status ?? "draft";
  const action = canUseSettings()
    ? `
      <div class="start-gate-actions">
        <button id="openRoomConfig" type="button">配置比赛</button>
        ${status === "ready"
          ? `<button class="start-match-button" id="startMatchFromGate" type="button">开始比赛</button>`
          : `<button class="start-match-button" id="confirmRoomConfigFromGate" type="button">确认配置</button>`}
      </div>
    `
    : `<strong>${isBroadcastPortal() ? "直播等待开始" : "等待管理员开始"}</strong>`;

  return `
    <section class="start-gate" aria-label="比赛未开始">
      <div>
        <span>${escapeHtml(portalConfig.label)}</span>
        <h2>比赛尚未开始</h2>
        <p>配置状态：${escapeHtml(getRoomConfigStatusLabel(status))}</p>
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
    : `MAP ${restState.mapIndex + 1} 准备时间`;

  return `
    <section class="rest-overlay" role="dialog" aria-modal="false" aria-label="休息倒计时">
      <div class="rest-panel">
        <header class="score-selector-header">
          <div>
            <span class="selector-eyebrow">场间设置</span>
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
  const locked = roomConfigState?.status === "locked";
  const source = roomConfigState?.source.type === "preset"
    ? `来自模板：${roomConfigState.source.presetName ?? roomConfigState.source.presetId ?? "未知模板"}（已复制为房间独立配置）`
    : roomConfigState?.source.type === "json"
      ? "来自 JSON 导入"
      : "房间独立配置";
  return `
    <section class="settings-panel">
      <div class="config-editor-heading">
        <div>
          <h2>${locked ? "比赛配置（已锁定）" : "比赛配置"}</h2>
          <p>${escapeHtml(source)} · ${escapeHtml(getRoomConfigStatusLabel(roomConfigState?.status ?? "draft"))}</p>
        </div>
        <button id="closeRoomConfig" type="button">收起</button>
      </div>
      <div class="settings-actions settings-actions-top">
        ${roomStarted ? `<button id="toggleGlobalPause" type="button">${pauseState.active ? "恢复全局时间" : "全局暂停"}</button>` : ""}
        ${locked ? `<button id="rollbackToConfig" class="danger-button" type="button">回退到赛前配置</button>` : ""}
      </div>
      ${roomStarted ? `<div class="checkpoint-table">${renderCheckpointRows()}</div>` : ""}
      <fieldset class="config-editor-fields" ${locked ? "disabled" : ""}>
        ${renderRoomPresetChooser()}
        ${renderSharedConfigFields()}
        <details class="settings-section config-json-import">
          <summary>高级：JSON 导入与导出</summary>
          <p>可以粘贴完整模板 JSON，导入前会由后端校验。导入只替换本房间草稿。</p>
          <textarea id="roomConfigJson" placeholder="在这里粘贴配置 JSON"></textarea>
          <div class="settings-actions">
            <button id="importRoomConfigJson" type="button">校验并导入</button>
            <button id="copyRoomConfigJson" type="button">复制当前配置 JSON</button>
          </div>
        </details>
        <div class="settings-actions config-primary-actions">
          <button id="saveRoomConfig" type="button">保存草稿</button>
          <button id="confirmRoomConfig" class="start-match-button" type="button">确认配置</button>
          ${roomConfigState?.status === "ready" ? `<button id="startMatchFromSettings" class="start-match-button" type="button">开始比赛</button>` : ""}
        </div>
      </fieldset>
    </section>
  `;
}

function renderInteractiveRandomOverlay(): string {
  if (!interactiveRandomState || isBroadcastPortal()) {
    return "";
  }

  const state = interactiveRandomState;
  const resolved = state.resolvedSide !== null;
  const purposeLabel = state.purpose === "map_picker" ? "首次地图选择" : "禁用首次先手方";
  const leftChoice = state.choices.left ?? 0;
  const rightChoice = state.choices.right ?? 0;

  return `
    <section class="interactive-random-overlay" role="dialog" aria-modal="false" aria-label="交互随机">
      <div class="interactive-random-panel">
        <header class="score-selector-header">
          <div>
            <span class="selector-eyebrow">交互随机 · ${escapeHtml(purposeLabel)}</span>
            <h2>${resolved ? "计算结果已公布" : "双方分别选择 0 或 1"}</h2>
          </div>
          ${resolved ? "" : `<div class="selector-header-actions"><strong>30 秒内选择，超时默认 0</strong></div>`}
        </header>
        ${resolved ? "" : renderCountdownProgress("interactive-random-progress")}
        <div class="interactive-random-teams">
          ${renderInteractiveRandomTeam("left")}
          <div class="interactive-random-xor" aria-hidden="true">XOR</div>
          ${renderInteractiveRandomTeam("right")}
        </div>
        <footer class="interactive-random-footer">
          ${resolved
            ? `<div class="interactive-random-result"><span>${leftChoice} XOR ${rightChoice} = ${leftChoice ^ rightChoice}</span><strong>${escapeHtml(getTeamName(state.resolvedSide!))}获得${state.purpose === "map_picker" ? "首次选图权" : "禁用首次先手"}</strong></div><button id="continueInteractiveRandom" type="button">继续</button>`
            : `<p>双方选择互不公开，提交或倒计时结束后统一公布计算结果。</p>`}
        </footer>
      </div>
    </section>
  `;
}

function renderInteractiveRandomTeam(side: Side): string {
  if (!interactiveRandomState) {
    return "";
  }
  const selected = interactiveRandomState.choices[side];
  const editable = !interactiveRandomState.resolvedSide && portalConfig.side === side;
  return `
    <section class="interactive-random-team ${selected !== null ? "is-submitted" : ""}">
      <span>${side === "left" ? "队伍1" : "队伍2"}</span>
      <strong>${escapeHtml(getTeamName(side))}</strong>
      <div>
        ${([0, 1] as const).map((value) => `<button class="interactive-random-choice ${selected === value ? "is-selected" : ""}" type="button" data-random-value="${value}" ${editable ? "" : "disabled"}>${value}</button>`).join("")}
      </div>
      <small>${interactiveRandomState.resolvedSide ? `选择 ${selected ?? 0}` : selected !== null ? "已提交" : editable ? "请选择" : "等待提交"}</small>
    </section>
  `;
}

function bindInteractiveRandomEvents(): void {
  app.querySelectorAll<HTMLButtonElement>(".interactive-random-choice:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => submitInteractiveRandomChoice(Number(button.dataset.randomValue) as 0 | 1));
  });
  document.getElementById("continueInteractiveRandom")?.addEventListener("click", continueAfterInteractiveRandom);
}

function renderConfigPresetManager(selectedPreset: ConfigPreset | null): string {
  const editing = Boolean(selectedPreset || selectedGlobalPresetId === "__new__");
  const editorMeta = globalPresetDraftMeta ?? {
    name: selectedPreset?.name ?? "",
  };
  return `
    <section class="global-admin-panel config-preset-manager">
      ${renderAdminSectionHeader("默认配置模板", "为新房间保存可重复使用的完整比赛配置。", `${configPresets.length} 个`)}
      <div class="config-preset-toolbar">
        <button id="newConfigPreset" class="admin-primary-button" type="button">新建模板</button>
        <button id="showPresetJsonImport" class="admin-secondary-button" type="button">粘贴 JSON 导入</button>
        <a href="/docs/config/match-config.example.json" target="_blank" rel="noreferrer">查看完整示例</a>
      </div>
      <div class="config-preset-list">
        ${configPresets.map((preset) => `
          <article class="config-preset-card ${preset.id === selectedGlobalPresetId ? "is-selected" : ""}">
            <div><strong>${escapeHtml(preset.name)}</strong><span>版本 ${preset.revision} · 更新于 ${formatTimestamp(preset.updatedAt)}</span></div>
            <div>
              <button class="edit-config-preset" data-preset-id="${escapeHtml(preset.id)}" type="button">GUI 编辑</button>
              <button class="copy-config-preset-json" data-preset-id="${escapeHtml(preset.id)}" type="button">复制 JSON</button>
              <button class="delete-config-preset" data-preset-id="${escapeHtml(preset.id)}" type="button">删除</button>
            </div>
          </article>
        `).join("") || `<div class="admin-empty-state"><strong>暂无模板</strong><p>可新建模板或导入完整 JSON。</p></div>`}
      </div>
      <div id="globalPresetImportPanel" class="config-import-panel" hidden>
        <header><strong>导入配置模板</strong><p>粘贴 match-config.example.json 格式的完整内容，保存前会进行校验。</p></header>
        <textarea id="globalPresetJson" aria-label="完整模板 JSON" placeholder="粘贴完整模板 JSON"></textarea>
        <button id="importGlobalPresetJson" class="admin-primary-button" type="button">校验并导入</button>
      </div>
      ${editing ? `
        <section class="global-preset-editor">
          <header class="global-preset-editor-heading">
            <div>
              <h3>${selectedPreset ? "编辑配置模板" : "新建配置模板"}</h3>
              <p>${selectedPreset ? `正在编辑“${escapeHtml(selectedPreset.name)}”` : "未保存"}</p>
            </div>
          </header>
          <div class="admin-setting-list preset-metadata-settings">
            ${renderAdminSettingRow(
              "模板名称",
              "用于模板列表和房间配置选择器中的显示名称。",
              `<input id="globalPresetName" type="text" value="${escapeHtml(editorMeta.name)}" placeholder="杯赛 A" />`,
            )}
          </div>
          ${renderSharedConfigFields()}
          <footer class="admin-section-footer global-preset-editor-actions">
            <button id="saveGlobalPreset" class="admin-primary-button" type="button">保存模板</button>
            <button id="cancelGlobalPresetEdit" class="admin-secondary-button" type="button">取消</button>
          </footer>
        </section>
      ` : ""}
    </section>
  `;
}

function bindGlobalPresetManagerEvents(): void {
  document.getElementById("newConfigPreset")?.addEventListener("click", () => {
    selectedGlobalPresetId = "__new__";
    globalPresetDraftMeta = { name: "" };
    settingsState = structuredClone(defaultSettings);
    renderGlobalAdminPage();
  });
  document.getElementById("cancelGlobalPresetEdit")?.addEventListener("click", () => {
    selectedGlobalPresetId = null;
    globalPresetDraftMeta = null;
    renderGlobalAdminPage();
  });
  document.getElementById("showPresetJsonImport")?.addEventListener("click", () => {
    const panel = document.getElementById("globalPresetImportPanel");
    if (panel) {
      panel.hidden = !panel.hidden;
    }
  });
  document.getElementById("importGlobalPresetJson")?.addEventListener("click", () => void importGlobalPresetJson());
  document.getElementById("saveGlobalPreset")?.addEventListener("click", () => void saveGlobalPresetFromForm());

  app.querySelectorAll<HTMLButtonElement>(".edit-config-preset").forEach((button) => {
    button.addEventListener("click", () => {
      selectedGlobalPresetId = button.dataset.presetId ?? null;
      const preset = configPresets.find((item) => item.id === selectedGlobalPresetId);
      globalPresetDraftMeta = preset ? { name: preset.name } : null;
      if (preset) {
        settingsState = mergeSettings(defaultSettings, preset.config);
      }
      renderGlobalAdminPage();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".delete-config-preset").forEach((button) => {
    button.addEventListener("click", () => void deleteGlobalPreset(button.dataset.presetId ?? ""));
  });
  app.querySelectorAll<HTMLButtonElement>(".copy-config-preset-json").forEach((button) => {
    button.addEventListener("click", () => void copyGlobalPresetJson(button.dataset.presetId ?? ""));
  });

  if (selectedGlobalPresetId) {
    initializeConfigEditorControls();
    bindMapPoolDragEvents();
    bindModeOrderDragEvents();
    bindRosterEditorControls();
    ["matchFormat", "mapSelectionMode", "rosterMode", "fixedFirstMapEnabled", "banEnabled"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        captureGlobalPresetDraftMeta();
        readSettingsFromForm();
        renderGlobalAdminPage();
      });
    });
  }
}

function captureGlobalPresetDraftMeta(): void {
  globalPresetDraftMeta = {
    name: (document.getElementById("globalPresetName") as HTMLInputElement | null)?.value.trim() ?? "",
  };
}

function initializeConfigEditorControls(): void {
  const values: Array<[string, string]> = [
    ["matchFormat", settingsState.matchFormat],
    ["mapSelectionMode", settingsState.mapSelectionMode],
    ["firstMapMode", settingsState.firstMapMode],
    ["firstMapPickerPolicy", settingsState.firstMapPickerPolicy],
    ["mapPickerPolicy", settingsState.mapPickerPolicy],
    ["rosterMode", settingsState.rosterMode],
    ["firstBanPolicy", settingsState.firstBanPolicy],
    ["openingSidePolicy", settingsState.openingSidePolicy],
    ["scoreReportMode", settingsState.scoreReportMode],
  ];
  values.forEach(([id, value]) => {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) {
      select.value = value;
    }
  });
}

function bindRosterEditorControls(): void {
  app.querySelectorAll<HTMLButtonElement>(".add-roster-member").forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.rosterSide as Side | undefined;
      const list = side ? app.querySelector<HTMLElement>(`.visual-roster-items[data-roster-side="${side}"]`) : null;
      if (side && list) {
        list.insertAdjacentHTML("beforeend", renderRosterMemberInput(side, ""));
        list.lastElementChild?.querySelector<HTMLButtonElement>(".remove-roster-member")?.addEventListener("click", (event) => {
          (event.currentTarget as HTMLElement).closest(".roster-member-row")?.remove();
        });
      }
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".remove-roster-member").forEach((button) => {
    button.addEventListener("click", () => button.closest(".roster-member-row")?.remove());
  });
}

async function saveGlobalPresetFromForm(): Promise<void> {
  if (!globalAdminHash || !readSettingsFromForm()) {
    return;
  }
  const validationErrors = validateSettingsForSubmit();
  if (validationErrors.length > 0) {
    alert(validationErrors.join("\n"));
    return;
  }
  const id = selectedGlobalPresetId && selectedGlobalPresetId !== "__new__" ? selectedGlobalPresetId : "";
  const name = (document.getElementById("globalPresetName") as HTMLInputElement | null)?.value.trim() ?? "";
  const existing = Boolean(id && configPresets.some((preset) => preset.id === id));
  const response = await fetch(
    existing
      ? `/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets/${encodeURIComponent(id)}`
      : `/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets`,
    {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, ...(id ? { id } : {}), name, config: settingsState }),
    },
  );
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  const preset = await response.json() as ConfigPreset;
  selectedGlobalPresetId = preset.id;
  globalPresetDraftMeta = null;
  await loadGlobalAdminData();
  renderGlobalAdminPage(`模板“${preset.name}”已保存。`);
}

async function importGlobalPresetJson(): Promise<void> {
  if (!globalAdminHash) {
    return;
  }
  const textarea = document.getElementById("globalPresetJson") as HTMLTextAreaElement | null;
  let payload: { id?: string; name?: string };
  try {
    payload = JSON.parse(textarea?.value ?? "") as { id?: string; name?: string };
  } catch {
    alert("粘贴的内容不是有效 JSON。");
    return;
  }
  const id = payload.id ?? "";
  const existing = configPresets.some((preset) => preset.id === id);
  if (existing && !window.confirm(`模板 ${id} 已存在，是否覆盖？`)) {
    return;
  }
  const response = await fetch(
    existing
      ? `/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets/${encodeURIComponent(id)}`
      : `/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets`,
    { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  );
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  const preset = await response.json() as ConfigPreset;
  selectedGlobalPresetId = preset.id;
  globalPresetDraftMeta = null;
  await loadGlobalAdminData();
  renderGlobalAdminPage(`模板“${preset.name}”已导入。`);
}

async function deleteGlobalPreset(presetId: string): Promise<void> {
  if (!globalAdminHash || !presetId || !window.confirm(`确认删除模板 ${presetId}？已复制到房间的配置不会受影响。`)) {
    return;
  }
  const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets/${encodeURIComponent(presetId)}`, { method: "DELETE" });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  selectedGlobalPresetId = null;
  globalPresetDraftMeta = null;
  await loadGlobalAdminData();
  renderGlobalAdminPage("模板已删除。入房间的配置未发生变化。");
}

async function copyGlobalPresetJson(presetId: string): Promise<void> {
  const preset = configPresets.find((item) => item.id === presetId);
  if (!preset || !navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify({
    $schema: "./match-config.schema.json",
    schemaVersion: 1,
    id: preset.id,
    name: preset.name,
    config: preset.config,
  }, null, 2));
  alert("模板 JSON 已复制。");
}

function renderRoomPresetChooser(): string {
  return `
    <section class="settings-section preset-chooser">
      <h3>从默认模板开始</h3>
      <p>模板会复制到本房间，之后可以自由调整。</p>
      <div class="settings-actions">
        <select id="roomPresetSelect">
          <option value="">选择杯赛模板</option>
          ${configPresets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join("")}
        </select>
        <button id="applyRoomPreset" type="button">导入模板</button>
        <button id="resetBuiltinConfig" type="button">恢复网站默认配置</button>
      </div>
    </section>
  `;
}

function renderSharedConfigFields(): string {
  return `
    <details class="settings-section admin-config-section" open>
      <summary>比赛信息</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow("比赛名称", "显示在房间页面顶部的比赛名称。", `<input id="matchName" type="text" value="${escapeHtml(settingsState.matchName)}" />`)}
        ${renderAdminSettingRow("队伍1队名", "队伍1在比赛页面中的显示名称。", `<input id="leftTeamName" type="text" value="${escapeHtml(settingsState.teams.left)}" />`)}
        ${renderAdminSettingRow("队伍2队名", "队伍2在比赛页面中的显示名称。", `<input id="rightTeamName" type="text" value="${escapeHtml(settingsState.teams.right)}" />`)}
        ${renderAdminSettingRow(
          "比赛赛制",
          "FT2、FT3、FT4 分别准备 5、7、9 个地图槽位，允许最多出现 2 场平局。",
          `<select id="matchFormat">
            <option value="ft2">FT2</option>
            <option value="ft3">FT3</option>
            <option value="ft4">FT4</option>
          </select>`,
        )}
      </div>
    </details>
    <details class="settings-section admin-config-section" open>
      <summary>场间设置</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow("准备时间", "比赛开始前的准备时间，单位为秒；设置为 0 则禁用。", `<input id="preStartRestSeconds" type="number" min="0" max="3600" value="${settingsState.stageLimits.preStartRestSeconds}" />`)}
        ${renderAdminSettingRow("场间时间", "每张地图结束后的间隔时间，单位为秒；设置为 0 则禁用。", `<input id="postMatchRestSeconds" type="number" min="0" max="3600" value="${settingsState.stageLimits.postMatchRestSeconds}" />`)}
      </div>
    </details>
    ${renderMapSettingsPanel()}
    ${renderRosterSettingsPanel()}
    ${renderBanRuleSettingsPanel()}
    ${renderScoreRuleSettingsPanel()}
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
  const showFirstMapPicker = showMapPool && !settingsState.fixedFirstMapEnabled;
  const openAttribute = appMode === "global-admin" ? "open" : "";

  return `
    <details class="settings-section admin-config-section" ${openAttribute}>
      <summary>地图设置</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "地图选择模式",
          "控制地图是否可重复以及地图模式的轮换方式。",
          `<select id="mapSelectionMode">
          <option value="first_mode_then_unique_mode">首图指定模式，未选完所有模式前不可重复选择</option>
          <option value="unique_mode_until_cycle">首图任意模式，未选完所有模式前不可重复选择</option>
          <option value="strict_mode_order">指定模式顺序，已选择地图不可重复选择</option>
          <option value="unique_map">任意选择，已选择地图不可重复选择</option>
          <option value="fixed_map_order">固定地图顺序</option>
        </select>`,
        )}
        ${renderAdminSettingRow("地图选择时间", "每张地图的选择时间，单位为秒。", `<input id="mapSelectSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.mapSelectSeconds}" />`)}
      </div>
      ${mode === "first_mode_then_unique_mode" ? renderFirstMapModeSetting() : ""}
      ${mode === "strict_mode_order" ? renderModeOrderSetting() : ""}
      ${showMapPool ? renderFixedFirstMapSetting() : ""}
      ${showFirstMapPicker ? renderAdminSettingRow(
        "首次地图选择",
        "设置第一张地图由哪一方选择；交互随机由双方选择 0 或 1 后计算 XOR。",
        renderSidePolicySelect("firstMapPickerPolicy", settingsState.firstMapPickerPolicy),
      ) : ""}
      ${showMapPool ? renderAdminSettingRow(
        "地图选择队伍",
        "从第二张地图开始，由上一张非平局地图的败者选择。平局时继续向前寻找最近的非平局结果。",
        `<select id="mapPickerPolicy"><option value="loser_choose">败者选择</option></select>`,
      ) : ""}
      ${showMapPool ? `<div class="admin-config-subsection"><header><strong>地图池</strong><p>选择该模板允许使用的地图。</p></header><div class="visual-map-pool">${getVisualMapPoolMarkup()}</div></div>` : ""}
      ${mode === "fixed_map_order" ? renderFixedMapOrderSetting() : ""}
    </details>
  `;
}

function renderFirstMapModeSetting(): string {
  return renderAdminSettingRow(
    "第一张地图模式",
    "指定系列赛首张地图必须使用的模式。",
    `<select id="firstMapMode">
        ${(mapCatalogState.modes.length ? mapCatalogState.modes : getConfiguredModeOrder())
          .map((mode) => `<option value="${escapeHtml(mode)}">${escapeHtml(getModeLabel(mode))}</option>`)
          .join("")}
      </select>`,
  );
}

function renderModeOrderSetting(): string {
  const modes = settingsState.modeOrder.length > 0 ? settingsState.modeOrder : getConfiguredModeOrder();

  return `
    <div class="mode-order-setting">
      <span>模式顺序</span>
      <div class="mode-order-list">
        ${modes
          .map(
            (mode, index) => `
              <div class="mode-order-item" draggable="true" data-mode-order="${escapeHtml(mode)}" data-mode-order-index="${index}">
                <span>${escapeHtml(getModeLabel(mode))}</span>
                <button class="remove-mode-order" type="button" aria-label="删除${escapeHtml(getModeLabel(mode))}" title="删除">×</button>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="mode-order-add-row">
        <select id="modeOrderAddSelect" aria-label="选择要增加的地图模式">
          ${(mapCatalogState.modes.length ? mapCatalogState.modes : Object.keys(settingsState.mapPool))
            .map((mode) => `<option value="${escapeHtml(mode)}">${escapeHtml(getModeLabel(mode))}</option>`)
            .join("")}
        </select>
        <button id="addModeOrder" type="button">＋ 增加模式</button>
      </div>
      <small>保存模板时会校验模式项数不少于 ${settingsState.stageCount}，并检查每种模式有足够的不重复地图。</small>
    </div>
  `;
}

function renderFixedFirstMapSetting(): string {
  const options = getAllCatalogMapChoices();
  return `
    <div class="fixed-first-map-setting">
      ${renderAdminSettingRow(
        "首图固定选择",
        "开启后，第一张地图只能使用指定地图；保存时会检查它是否符合首图模式规则。",
        `<label class="admin-switch"><input id="fixedFirstMapEnabled" type="checkbox" ${settingsState.fixedFirstMapEnabled ? "checked" : ""} /><span></span><b>${settingsState.fixedFirstMapEnabled ? "已开启" : "已关闭"}</b></label>`,
      )}
      ${renderAdminSettingRow(
        "固定首图",
        "开关开启后才能选择。",
        `<select id="fixedFirstMapName" ${settingsState.fixedFirstMapEnabled ? "" : "disabled"}>
          <option value="">请选择地图</option>
          ${options.map((choice) => `<option value="${escapeHtml(choice.nameEn)}" ${normalizeKey(choice.nameEn) === normalizeKey(settingsState.fixedFirstMapName) ? "selected" : ""}>${escapeHtml(getModeLabel(choice.mode))} - ${escapeHtml(getMapNameZh(choice.nameEn))}</option>`).join("")}
        </select>`,
      )}
    </div>
  `;
}

function renderSidePolicySelect(id: string, value: SidePolicy): string {
  return `<select id="${id}">
    <option value="random" ${value === "random" ? "selected" : ""}>系统随机</option>
    <option value="interactive_random" ${value === "interactive_random" ? "selected" : ""}>交互随机</option>
    <option value="left" ${value === "left" ? "selected" : ""}>队伍1先</option>
    <option value="right" ${value === "right" ? "selected" : ""}>队伍2先</option>
  </select>`;
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
                      ${escapeHtml(getModeLabel(choice.mode))} - ${escapeHtml(getMapNameZh(choice.nameEn))}
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
  const openAttribute = appMode === "global-admin" ? "open" : "";

  return `
    <details class="settings-section admin-config-section" ${openAttribute}>
      <summary>上场设置</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "上场成员模式",
          "设置双方填写上场成员时可使用的方式。",
          `<select id="rosterMode">
          <option value="free_input">双方自由输入</option>
          <option value="preset_only">仅可从预设成员输入</option>
          <option value="skip">跳过该项</option>
        </select>`,
        )}
        ${renderAdminSettingRow("上场成员选择时间", "双方确认上场成员的时间，单位为秒。", `<input id="playerSelectSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.playerSelectSeconds}" />`)}
      </div>
      ${settingsState.rosterMode === "preset_only" ? `<div class="visual-rosters">
        ${renderRosterListSetting("left", rosters.left)}
        ${renderRosterListSetting("right", rosters.right)}
      </div>` : ""}
    </details>
  `;
}

function renderBanRuleSettingsPanel(): string {
  const openAttribute = appMode === "global-admin" ? "open" : "";

  return `
    <details class="settings-section admin-config-section" ${openAttribute}>
      <summary>禁用规则</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "是否启用禁用规则",
          "关闭后将跳过全部英雄禁用步骤。",
          `<label class="admin-switch"><input id="banEnabled" type="checkbox" ${settingsState.banEnabled ? "checked" : ""} /><span></span><b>${settingsState.banEnabled ? "已开启" : "已关闭"}</b></label>`,
        )}
        ${settingsState.banEnabled ? `
        ${renderAdminSettingRow(
          "先后禁用选择规则",
          "设置每张地图开始前双方的禁用顺序。",
          `<select id="firstBanPolicy">
          <option value="allow_loser_choose">败者选择先后</option>
          <option value="loser_must_first">败者先手禁用</option>
        </select>`,
        )}
        ${renderAdminSettingRow(
          "禁用首次先手方",
          "交互随机时，双方各选 0 或 1，XOR 为 0 则队伍1先手，为 1 则队伍2先手。选择时间为 30 秒，超时默认 0。",
          renderSidePolicySelect("openingSidePolicy", settingsState.openingSidePolicy),
        )}
        ${renderAdminSettingRow("先后禁用选择时间", "败者选择先后顺序的时间，单位为秒。", `<input id="firstBanChoiceSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.firstBanChoiceSeconds}" />`)}
        ${renderAdminSettingRow("先手禁用时间", "先手方完成禁用的时间，单位为秒。", `<input id="firstBanActionSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.firstBanActionSeconds}" />`)}
        ${renderAdminSettingRow("后手禁用时间", "后手方完成禁用的时间，单位为秒。", `<input id="secondBanActionSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.secondBanActionSeconds}" />`)}
        ` : ""}
      </div>
    </details>
  `;
}

function renderScoreRuleSettingsPanel(): string {
  const openAttribute = appMode === "global-admin" ? "open" : "";

  return `
    <details class="settings-section admin-config-section" ${openAttribute}>
      <summary>比分规则</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "比分录入模式",
          "选择比分由管理员录入，或由队伍提交并确认。",
          `<select id="scoreReportMode">
          <option value="admin_only">管理员填写比分</option>
          <option value="team_submit_opponent_confirm">任一队伍填写，另一方确认</option>
        </select>`,
        )}
        ${renderAdminSettingRow("比分确认时间", "一方提交比分后，另一方确认的时间，单位为秒。", `<input id="scoreConfirmSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.scoreConfirmSeconds}" />`)}
      </div>
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
                    <img src="${map.imageUrl}" alt="${escapeHtml(getMapNameZh(map.nameEn))}" />
                    <span>${escapeHtml(getMapNameZh(map.nameEn))}</span>
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
      <h3>${side === "left" ? "队伍1" : "队伍2"}</h3>
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
  document.getElementById("openRoomConfig")?.addEventListener("click", () => {
    settingsPanelOpen = true;
    renderCurrent();
  });
  document.getElementById("confirmRoomConfigFromGate")?.addEventListener("click", () => void confirmRoomConfig());
  document.getElementById("startMatchFromGate")?.addEventListener("click", () => void startRoomMatch());
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
    publishSharedRoomSnapshot(createRoomOperation("ui", "pause_panel_toggled", { collapsed: pauseState.collapsed }));
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

  document.getElementById("closeRoomConfig")?.addEventListener("click", () => {
    settingsPanelOpen = false;
    renderCurrent();
  });
  document.getElementById("rollbackToConfig")?.addEventListener("click", () => void rollbackRoomToConfig());
  document.getElementById("copyRoomConfigJson")?.addEventListener("click", () => void copyRoomConfigJson());
  document.getElementById("toggleGlobalPause")?.addEventListener("click", toggleGlobalPause);
  bindCheckpointEvents();

  if (roomConfigState?.status === "locked") {
    return;
  }

  const mapSelectionMode = document.getElementById("mapSelectionMode") as HTMLSelectElement | null;
  const matchFormat = document.getElementById("matchFormat") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const firstMapPickerPolicy = document.getElementById("firstMapPickerPolicy") as HTMLSelectElement | null;
  const mapPickerPolicy = document.getElementById("mapPickerPolicy") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const openingSidePolicy = document.getElementById("openingSidePolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;

  if (matchFormat) {
    matchFormat.value = settingsState.matchFormat;
    matchFormat.addEventListener("change", () => {
      readSettingsFromForm();
      renderCurrent();
    });
  }

  if (mapSelectionMode) {
    mapSelectionMode.value = settingsState.mapSelectionMode;
    mapSelectionMode.addEventListener("change", () => {
      readSettingsFromForm();
      renderCurrent();
    });
  }

  if (firstMapMode) {
    firstMapMode.value = settingsState.firstMapMode;
  }

  if (firstMapPickerPolicy) {
    firstMapPickerPolicy.value = settingsState.firstMapPickerPolicy;
  }

  if (mapPickerPolicy) {
    mapPickerPolicy.value = settingsState.mapPickerPolicy;
  }

  if (rosterMode) {
    rosterMode.value = settingsState.rosterMode;
  }

  if (firstBanPolicy) {
    firstBanPolicy.value = settingsState.firstBanPolicy;
  }

  if (openingSidePolicy) {
    openingSidePolicy.value = settingsState.openingSidePolicy;
  }

  if (scoreReportMode) {
    scoreReportMode.value = settingsState.scoreReportMode;
  }

  [rosterMode, document.getElementById("fixedFirstMapEnabled"), document.getElementById("banEnabled")]
    .filter((control): control is HTMLElement => Boolean(control))
    .forEach((control) => control.addEventListener("change", () => {
      readSettingsFromForm();
      renderCurrent();
    }));

  document.getElementById("applyRoomPreset")?.addEventListener("click", () => void applyRoomPreset());
  document.getElementById("resetBuiltinConfig")?.addEventListener("click", () => void importRoomConfig(defaultSettings, "builtin"));
  document.getElementById("importRoomConfigJson")?.addEventListener("click", () => void importRoomConfigFromJson());
  document.getElementById("saveRoomConfig")?.addEventListener("click", () => void saveRoomConfigDraft());
  document.getElementById("confirmRoomConfig")?.addEventListener("click", () => void confirmRoomConfig());
  document.getElementById("startMatchFromSettings")?.addEventListener("click", () => void startRoomMatch());

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

function bindCheckpointEvents(): void {
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
      event.dataTransfer?.setData("text/plain", item.dataset.modeOrderIndex ?? "");
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
      const sourceIndex = event.dataTransfer?.getData("text/plain");
      const source = [...app.querySelectorAll<HTMLElement>(".mode-order-item")]
        .find((entry) => entry.dataset.modeOrderIndex === sourceIndex);

      if (!source || source === item || source.parentElement !== item.parentElement) {
        return;
      }

      item.parentElement?.insertBefore(source, item);
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".remove-mode-order").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".mode-order-item")?.remove();
      settingsState.modeOrder = [...app.querySelectorAll<HTMLElement>(".mode-order-item")]
        .map((item) => item.dataset.modeOrder)
        .filter((mode): mode is string => Boolean(mode));
      readSettingsFromForm();
      rerenderActiveConfigEditor();
    });
  });

  document.getElementById("addModeOrder")?.addEventListener("click", () => {
    const select = document.getElementById("modeOrderAddSelect") as HTMLSelectElement | null;
    readSettingsFromForm();
    if (select?.value) {
      settingsState.modeOrder.push(select.value);
    }
    rerenderActiveConfigEditor();
  });
}

function rerenderActiveConfigEditor(): void {
  if (appMode === "global-admin") {
    captureGlobalPresetDraftMeta();
    renderGlobalAdminPage();
    return;
  }
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
  firstMapPickerSide = resolveSidePolicy(settingsState.firstMapPickerPolicy);
  interactiveRandomState = null;
  interactiveRandomResults = {};

  if (started) {
    if (settingsState.stageLimits.preStartRestSeconds > 0) {
      restState = { open: true, mapIndex: 0, skipReady: createRestSkipReadyState() };
      mapSelectorState = null;
    } else {
      restState = null;
      openNextMapSelector();
    }
    if (!settingsState.fixedFirstMapEnabled && settingsState.firstMapPickerPolicy === "interactive_random") {
      startInteractiveRandom("map_picker", 0);
      mapSelectorState = null;
    }
  } else {
    mapSelectorState = null;
  }

  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("room", started ? "started" : "reset"));
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
  const matchFormat = document.getElementById("matchFormat") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const firstMapPickerPolicy = document.getElementById("firstMapPickerPolicy") as HTMLSelectElement | null;
  const mapPickerPolicy = document.getElementById("mapPickerPolicy") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const openingSidePolicy = document.getElementById("openingSidePolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;
  const fixedMapOrderText = document.getElementById("fixedMapOrderText") as HTMLTextAreaElement | null;
  const fixedMapOrderSelects = [...app.querySelectorAll<HTMLSelectElement>(".fixed-map-order-select")];
  const fixedFirstMapEnabled = document.getElementById("fixedFirstMapEnabled") as HTMLInputElement | null;
  const fixedFirstMapName = document.getElementById("fixedFirstMapName") as HTMLSelectElement | null;
  const banEnabled = document.getElementById("banEnabled") as HTMLInputElement | null;
  const matchName = document.getElementById("matchName") as HTMLInputElement | null;
  const leftTeamName = document.getElementById("leftTeamName") as HTMLInputElement | null;
  const rightTeamName = document.getElementById("rightTeamName") as HTMLInputElement | null;

  const nextMatchFormat = (matchFormat?.value ?? settingsState.matchFormat) as MatchFormat;
  settingsState.matchFormat = nextMatchFormat;
  settingsState.stageCount = getStageCountForMatchFormat(nextMatchFormat);
  settingsState.checkpoints = resizeCheckpoints(settingsState.checkpoints, settingsState.stageCount);
  settingsState.mapSelectionMode = (mapSelectionMode?.value ?? settingsState.mapSelectionMode) as MapSelectionMode;
  if (settingsState.mapSelectionMode === "fixed_map_order") {
    settingsState.fixedFirstMapEnabled = false;
  }
  settingsState.firstMapMode = firstMapMode?.value ?? settingsState.firstMapMode;
  if (app.querySelector(".mode-order-item")) {
    settingsState.modeOrder = getVisualModeOrder();
  }
  settingsState.fixedFirstMapEnabled = settingsState.mapSelectionMode === "fixed_map_order"
    ? false
    : fixedFirstMapEnabled?.checked ?? settingsState.fixedFirstMapEnabled;
  settingsState.fixedFirstMapName = fixedFirstMapName?.value ?? settingsState.fixedFirstMapName;
  settingsState.firstMapPickerPolicy = (firstMapPickerPolicy?.value ?? settingsState.firstMapPickerPolicy) as FirstMapPickerPolicy;
  settingsState.mapPickerPolicy = (mapPickerPolicy?.value ?? settingsState.mapPickerPolicy) as MapPickerPolicy;
  settingsState.rosterMode = (rosterMode?.value ?? settingsState.rosterMode) as PlayerInputMode;
  settingsState.banEnabled = banEnabled?.checked ?? settingsState.banEnabled;
  settingsState.firstBanPolicy = (firstBanPolicy?.value ?? settingsState.firstBanPolicy) as FirstBanPolicy;
  settingsState.openingSidePolicy = (openingSidePolicy?.value ?? settingsState.openingSidePolicy) as OpeningSidePolicy;
  settingsState.scoreReportMode = (scoreReportMode?.value ?? settingsState.scoreReportMode) as ScoreReportMode;
  settingsState.fixedMapOrderText = fixedMapOrderSelects.length > 0
    ? fixedMapOrderSelects.map((select) => select.value).filter(Boolean).join("\n")
    : fixedMapOrderText?.value ?? settingsState.fixedMapOrderText;
  settingsState.mapPool = readVisualMapPool();
  if (settingsState.rosterMode === "preset_only") {
    settingsState.presetRosterText = readVisualRosters();
  }
  settingsState.matchName = matchName?.value.trim() || settingsState.matchName;
  settingsState.teams = {
    left: leftTeamName?.value.trim() || settingsState.teams.left,
    right: rightTeamName?.value.trim() || settingsState.teams.right,
  };

  return true;
}

function validateSettingsForSubmit(): string[] {
  const errors: string[] = [];
  const requiredMaps = settingsState.stageCount;

  if (settingsState.mapSelectionMode === "fixed_map_order") {
    const fixedOrder = parseFixedMapOrder();
    if (fixedOrder.length < requiredMaps) {
      errors.push(`${getMatchFormatLabel(settingsState.matchFormat)} 固定地图顺序至少需要 ${requiredMaps} 张地图。`);
    }
    if (new Set(fixedOrder.map(normalizeKey)).size !== fixedOrder.length) {
      errors.push("固定地图顺序中的地图不能重复。");
    }
    return errors;
  }

  const selectedMapCount = Object.values(settingsState.mapPool).reduce((count, names) => count + names.length, 0);
  if (selectedMapCount < requiredMaps) {
    errors.push(`${getMatchFormatLabel(settingsState.matchFormat)} 至少需要选择 ${requiredMaps} 张地图，以支持最多 2 场平局。`);
  }

  if (settingsState.mapSelectionMode === "strict_mode_order") {
    if (settingsState.modeOrder.length < requiredMaps) {
      errors.push(`模式顺序至少需要 ${requiredMaps} 项。`);
    } else {
      const requiredByMode = new Map<string, number>();
      settingsState.modeOrder.slice(0, requiredMaps).forEach((mode) => {
        requiredByMode.set(mode, (requiredByMode.get(mode) ?? 0) + 1);
      });
      requiredByMode.forEach((count, mode) => {
        const available = settingsState.mapPool[mode]?.length ?? 0;
        if (available < count) {
          errors.push(`${getModeLabel(mode)}在模式顺序中出现 ${count} 次，但地图池只有 ${available} 张。`);
        }
      });
    }
  }

  if (settingsState.fixedFirstMapEnabled) {
    const fixedChoice = findCatalogMapByName(settingsState.fixedFirstMapName);
    if (!fixedChoice || !(settingsState.mapPool[fixedChoice.mode] ?? []).some((name) => normalizeKey(name) === normalizeKey(fixedChoice.nameEn))) {
      errors.push("固定首图必须从当前地图池中选择。");
    } else if (settingsState.mapSelectionMode === "first_mode_then_unique_mode" && fixedChoice.mode !== settingsState.firstMapMode) {
      errors.push(`固定首图必须属于${getModeLabel(settingsState.firstMapMode)}模式。`);
    } else if (settingsState.mapSelectionMode === "strict_mode_order" && fixedChoice.mode !== settingsState.modeOrder[0]) {
      errors.push("固定首图的模式必须与模式顺序第一项一致。");
    }
  }

  return errors;
}

async function saveRoomConfigDraft(renderAfter = true): Promise<boolean> {
  if (!roomToken || !isAdminPortal() || roomConfigState?.status === "locked") {
    return false;
  }
  if (document.getElementById("matchFormat") && !readSettingsFromForm()) {
    return false;
  }
  const validationErrors = validateSettingsForSubmit();
  if (validationErrors.length > 0) {
    alert(validationErrors.join("\n"));
    return false;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: roomConfigState?.revision,
      config: settingsState,
      source: roomConfigState?.source ?? { type: "manual" },
    }),
  });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return false;
  }
  roomConfigState = await response.json() as RoomConfigState;
  settingsState = mergeSettings(defaultSettings, roomConfigState.value);
  if (renderAfter) {
    renderCurrent();
  }
  return true;
}

async function applyRoomPreset(): Promise<void> {
  if (!roomToken || !isAdminPortal()) {
    return;
  }
  const select = document.getElementById("roomPresetSelect") as HTMLSelectElement | null;
  const presetId = select?.value;
  if (!presetId) {
    alert("请先选择一个默认模板。");
    return;
  }
  if (!window.confirm("导入模板会替换当前房间配置草稿，是否继续？")) {
    return;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config/apply-preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presetId }),
  });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  roomConfigState = await response.json() as RoomConfigState;
  settingsState = mergeSettings(defaultSettings, roomConfigState.value);
  renderCurrent();
}

function startInteractiveRandom(purpose: InteractiveRandomPurpose, mapIndex: number): void {
  const resolvedSide = interactiveRandomResults[purpose] ?? null;
  interactiveRandomState = {
    purpose,
    mapIndex,
    choices: { left: null, right: null },
    resolvedSide,
  };
  hiddenOverlay = null;
}

function submitInteractiveRandomChoice(value: 0 | 1): void {
  if (!interactiveRandomState || interactiveRandomState.resolvedSide || !portalConfig.side) {
    return;
  }
  interactiveRandomState.choices[portalConfig.side] = value;
  if (interactiveRandomState.choices.left !== null && interactiveRandomState.choices.right !== null) {
    finalizeInteractiveRandom(false);
    return;
  }
  publishSharedRoomSnapshot(createRoomOperation("room", "interactive_random_submitted", {
    purpose: interactiveRandomState.purpose,
    side: portalConfig.side,
  }));
  renderCurrent();
}

function finalizeInteractiveRandom(timedOut: boolean): void {
  if (!interactiveRandomState || interactiveRandomState.resolvedSide) {
    return;
  }
  const left = interactiveRandomState.choices.left ?? 0;
  const right = interactiveRandomState.choices.right ?? 0;
  interactiveRandomState.choices = { left, right };
  const resultSide: Side = (left ^ right) === 0 ? "left" : "right";
  interactiveRandomState.resolvedSide = resultSide;
  interactiveRandomResults[interactiveRandomState.purpose] = resultSide;
  if (interactiveRandomState.purpose === "map_picker") {
    firstMapPickerSide = resultSide;
  } else {
    openingSide = resultSide;
  }
  const message = `${left} XOR ${right} = ${left ^ right}，${getTeamName(resultSide)}获得${interactiveRandomState.purpose === "map_picker" ? "首次选图权" : "禁用首次先手"}。`;
  adminNotice = message;
  createTeamAckNotice(message);
  publishSharedRoomSnapshot(createRoomOperation("room", "interactive_random_resolved", {
    purpose: interactiveRandomState.purpose,
    left,
    right,
    resultSide,
    timedOut,
  }));
  renderCurrent();
}

function continueAfterInteractiveRandom(): void {
  if (!interactiveRandomState?.resolvedSide) {
    return;
  }
  const { purpose, mapIndex } = interactiveRandomState;
  interactiveRandomState = null;
  if (purpose === "map_picker") {
    if (!restState) {
      openNextMapSelector();
    }
  } else {
    openBanSelectorForMap(mapIndex);
  }
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("room", "interactive_random_continued", { purpose, mapIndex }));
  renderCurrent();
}

async function importRoomConfigFromJson(): Promise<void> {
  const textarea = document.getElementById("roomConfigJson") as HTMLTextAreaElement | null;
  if (!textarea?.value.trim()) {
    alert("请先粘贴配置 JSON。");
    return;
  }
  try {
    const payload = JSON.parse(textarea.value) as { config?: unknown };
    await importRoomConfig(payload.config ?? payload, "json");
  } catch {
    alert("粘贴的内容不是有效 JSON。");
  }
}

async function importRoomConfig(config: unknown, sourceType: "json" | "builtin"): Promise<void> {
  if (!roomToken || !isAdminPortal() || roomConfigState?.status === "locked") {
    return;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: roomConfigState?.revision, config, source: { type: sourceType } }),
  });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  roomConfigState = await response.json() as RoomConfigState;
  settingsState = mergeSettings(defaultSettings, roomConfigState.value);
  renderCurrent();
}

async function confirmRoomConfig(): Promise<void> {
  if (!roomToken || !isAdminPortal()) {
    return;
  }
  if (!(await saveRoomConfigDraft(false))) {
    return;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config/confirm`, { method: "POST" });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  roomConfigState = await response.json() as RoomConfigState;
  settingsState = mergeSettings(defaultSettings, roomConfigState.value);
  renderCurrent();
}

async function startRoomMatch(): Promise<void> {
  if (!roomToken || !isAdminPortal() || roomConfigState?.status !== "ready") {
    alert("请先保存并确认比赛配置。");
    return;
  }
  if (document.getElementById("matchFormat")) {
    if (!(await saveRoomConfigDraft(false))) {
      return;
    }
    const confirmResponse = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config/confirm`, { method: "POST" });
    if (!confirmResponse.ok) {
      alert(await getConfigErrorMessage(confirmResponse));
      return;
    }
    roomConfigState = await confirmResponse.json() as RoomConfigState;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/start`, { method: "POST" });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  const payload = await response.json() as { config: RoomConfigState; version: number };
  roomConfigState = payload.config;
  serverSnapshotVersion = Number(payload.version ?? serverSnapshotVersion);
  settingsState = mergeSettings(defaultSettings, roomConfigState.value);
  settingsPanelOpen = false;
  resetRoomToBeginning(true);
}

async function rollbackRoomToConfig(): Promise<void> {
  if (!roomToken || !isAdminPortal()) {
    return;
  }
  if (!window.confirm("回退会清空地图、阵容、Ban、比分和比赛进度，并重新开放配置。确认继续？")) {
    return;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/rollback-to-config`, { method: "POST" });
  if (!response.ok) {
    alert(await getConfigErrorMessage(response));
    return;
  }
  window.location.reload();
}

async function copyRoomConfigJson(): Promise<void> {
  if (!navigator.clipboard) {
    alert("浏览器不支持复制到剪贴板。");
    return;
  }
  const payload = {
    schemaVersion: 1,
    id: "room-export",
    name: settingsState.matchName,
    description: "从比赛房间导出的配置",
    config: settingsState,
  };
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  alert("当前配置 JSON 已复制。");
}

async function getConfigErrorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    message?: string;
    details?: Array<{ path?: string; message?: string }>;
  };
  if (payload.details?.length) {
    return payload.details.map((detail) => `${detail.path ?? "配置"}：${detail.message ?? "无效"}`).join("\n");
  }
  return payload.message ?? ({
    config_locked: "比赛已经开始，配置已锁定。",
    revision_conflict: "配置已在其他页面更新，请刷新后重试。",
    config_not_ready: "请先确认比赛配置。",
    forbidden: "当前入口没有修改配置的权限。",
  } as Record<string, string>)[payload.error ?? ""] ?? "配置操作失败。";
}

function getRoomConfigStatusLabel(status: RoomConfigStatus): string {
  return { draft: "草稿，可修改", ready: "已确认，等待开始", locked: "比赛中，已锁定" }[status];
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

  if (settingsState.mapSelectionMode === "fixed_map_order" && fixedOrderSelects.length > 0) {
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

  const orderedModes = [...new Set(getVisualModeOrder())];
  orderedModes.forEach((mode) => {
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

  return orderedModes.length > 0 ? orderedModes : [...new Set(checkboxModes)];
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
  publishSharedRoomSnapshot(createRoomOperation("room", "stage_restored", { mapIndex: row, checkpoint: key }));
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
  publishSharedRoomSnapshot(createRoomOperation("map", "selector_opened", { mapIndex: targetMapIndex }));
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
  publishSharedRoomSnapshot(createRoomOperation("map", "choice_selected", {
    mapIndex: mapSelectorState.targetMapIndex,
    mapKey,
  }));
  updateSelectedMapDom();
}

function randomLegalMapChoice(): void {
  if (!isAdminPortal() || !mapSelectorState) {
    return;
  }

  const choice = pickRandomItem(getLegalMapChoices());

  if (!choice) {
    adminNotice = "没有可随机选择的合法地图，请手动处理或判负。";
    publishSharedRoomSnapshot(createRoomOperation("map", "random_failed", { mapIndex: mapSelectorState.targetMapIndex }));
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
  publishSharedRoomSnapshot(createRoomOperation("map", "manual_override_enabled", { mapIndex: mapSelectorState.targetMapIndex }));
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
    publishSharedRoomSnapshot(createRoomOperation("map", "forfeited", { mapIndex, loserSide, matchFinished: true }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("map", "forfeited", { mapIndex, loserSide, matchFinished: false }));
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
  publishSharedRoomSnapshot(createRoomOperation("map", "confirmed", {
    mapIndex: selectedMapIndex,
    mapKey: choice.key,
    mapName: choice.nameEn,
  }));
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

  publishSharedRoomSnapshot(createRoomOperation("lineup", "ready", { side }));
  renderCurrent();
}

function openBanSelectorForMap(mapIndex: number): void {
  if (!currentState || !settingsState.banEnabled) {
    banSelectorState = null;
    openScoreSelectorForMap(mapIndex);
    return;
  }

  if (
    mapIndex === 0
    && settingsState.openingSidePolicy === "interactive_random"
    && !interactiveRandomResults.opening_ban
  ) {
    banSelectorState = null;
    startInteractiveRandom("opening_ban", mapIndex);
    resetCountdown();
    return;
  }

  const chooserSide = mapIndex === 0 ? openingSide : getMapPickerSide(currentState, mapIndex);
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
  publishSharedRoomSnapshot(createRoomOperation("ban", "choice_selected", {
    mapIndex: banSelectorState.mapIndex,
    heroKey,
  }));
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
    publishSharedRoomSnapshot(createRoomOperation("ban", "random_failed", {
      mapIndex: banSelectorState.mapIndex,
      step: banSelectorState.step,
    }));
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
  publishSharedRoomSnapshot(createRoomOperation("ban", "manual_override_enabled", {
    mapIndex: banSelectorState.mapIndex,
    step: banSelectorState.step,
  }));
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
    publishSharedRoomSnapshot(createRoomOperation("ban", "forfeited", { mapIndex, loserSide, matchFinished: true }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("ban", "forfeited", { mapIndex, loserSide, matchFinished: false }));
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
    publishSharedRoomSnapshot(createRoomOperation("ban", "order_confirmed", {
      mapIndex: banSelectorState.mapIndex,
      firstBanSide,
    }));
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
    publishSharedRoomSnapshot(createRoomOperation("ban", "hero_confirmed", {
      mapIndex: banSelectorState.mapIndex,
      side,
      hero: hero.nameEn,
      phase: "first",
    }));
    renderCurrent();
    return;
  }

  const mapIndex = banSelectorState.mapIndex;
  banSelectorState = null;
  openScoreSelectorForMap(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("ban", "hero_confirmed", {
    mapIndex,
    side,
    hero: hero.nameEn,
    phase: "second",
  }));
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
  publishSharedRoomSnapshot(createRoomOperation("score", "edited", {
    mapIndex: scoreSelectorState.mapIndex,
    side,
  }));
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
      publishSharedRoomSnapshot(createRoomOperation("score", "submitted", {
        mapIndex: scoreSelectorState.mapIndex,
        side,
      }));
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
  publishSharedRoomSnapshot(createRoomOperation("score", "rejected", {
    mapIndex: scoreSelectorState.mapIndex,
    side,
  }));
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
    publishSharedRoomSnapshot(createRoomOperation("score", "confirmed", {
      mapIndex,
      leftScore,
      rightScore,
      matchFinished: true,
    }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("score", "confirmed", {
    mapIndex,
    leftScore,
    rightScore,
    matchFinished: false,
  }));
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
  if (settingsState.stageLimits.postMatchRestSeconds === 0) {
    restState = null;
    openNextMapSelector();
    return;
  }
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

  publishSharedRoomSnapshot(createRoomOperation("rest", "skip_requested", {
    mapIndex: restState.mapIndex,
    side,
  }));
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

  const mapIndex = restState.mapIndex;

  if (finishMatchIfSeriesWon()) {
    resetCountdown();
    publishSharedRoomSnapshot(createRoomOperation("rest", "finished", { mapIndex, matchFinished: true }));
    renderCurrent();
    return;
  }

  restState = null;
  openNextMapSelector();
  resetCountdown();
  publishSharedRoomSnapshot(createRoomOperation("rest", "finished", { mapIndex, matchFinished: false }));
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
  publishSharedRoomSnapshot(createRoomOperation("lineup", "edited", {
    mapIndex: lineupSelectorState.mapIndex,
    side,
    slotId,
  }));
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
  publishSharedRoomSnapshot(createRoomOperation("lineup", "confirmed", { mapIndex }));
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
  if (targetMapIndex === 0) {
    return firstMapPickerSide;
  }

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
  return { ft2: 2, ft3: 3, ft4: 4 }[settingsState.matchFormat];
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

  if (
    mapSelectorState.targetMapIndex === 0
    && settingsState.fixedFirstMapEnabled
    && normalizeKey(choice.nameEn) !== normalizeKey(settingsState.fixedFirstMapName)
  ) {
    return { available: false, reason: `首图固定为 ${getMapNameZh(settingsState.fixedFirstMapName)}` };
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
  const modeOrder = settingsState.modeOrder.length > 0 ? settingsState.modeOrder : getConfiguredModeOrder();
  const configuredModes = [...new Set(modeOrder)];
  const currentCycle = new Set<string>();

  currentState?.maps.slice(0, mapSelectorState?.targetMapIndex ?? 0).forEach((map) => {
    if (!map.mode || !configuredModes.includes(map.mode)) {
      return;
    }
    currentCycle.add(map.mode);
    if (currentCycle.size === configuredModes.length) {
      currentCycle.clear();
    }
  });

  return currentCycle.has(mode);
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

  const modeOrder = settingsState.modeOrder.length > 0 ? settingsState.modeOrder : getConfiguredModeOrder();

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
    unique_map: "任意选择，已选择地图不可重复选择",
    unique_mode_until_cycle: "首图任意模式，未选完所有模式前不可重复选择",
    first_mode_then_unique_mode: "首图指定模式，未选完所有模式前不可重复选择",
    strict_mode_order: "指定模式顺序，已选择地图不可重复选择",
    fixed_map_order: "固定地图顺序",
  };

  return labels[mode];
}

function getStageCountForMatchFormat(format: MatchFormat): number {
  const stageCounts: Record<MatchFormat, number> = {
    ft2: 5,
    ft3: 7,
    ft4: 9,
  };

  return stageCounts[format] ?? stageCounts.ft3;
}

function getMatchFormatLabel(format: MatchFormat): string {
  const labels: Record<MatchFormat, string> = {
    ft2: "FT2",
    ft3: "FT3",
    ft4: "FT4",
  };

  return labels[format] ?? labels.ft3;
}

function resizeCheckpoints(checkpoints: SettingsState["checkpoints"], stageCount: number): SettingsState["checkpoints"] {
  const defaults = createDefaultCheckpoints(stageCount);

  return Array.from({ length: stageCount }, (_, index) => ({
    ...defaults[index],
    ...(checkpoints[index] ?? {}),
  }));
}

function resolveOpeningSide(): Side {
  return resolveSidePolicy(settingsState.openingSidePolicy);
}

function resolveSidePolicy(policy: SidePolicy): Side {
  if (policy === "right") {
    return "right";
  }
  if (policy === "left") {
    return "left";
  }
  return Math.random() < 0.5 ? "left" : "right";
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
  if (interactiveRandomState && !interactiveRandomState.resolvedSide) {
    return 30;
  }

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
      ".map-selector-progress, .map-selector-progress-mini, .lineup-selector-progress, .ban-selector-progress, .score-selector-progress, .rest-progress, .interactive-random-progress",
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
    if (interactiveRandomState && !interactiveRandomState.resolvedSide) {
      finalizeInteractiveRandom(true);
    } else if (banSelectorState?.open) {
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
    publishSharedRoomSnapshot(createRoomOperation("ban", "timed_out", {
      mapIndex: banSelectorState.mapIndex,
      step: banSelectorState.step,
    }));
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
  publishSharedRoomSnapshot(createRoomOperation("map", "timed_out", { mapIndex: mapSelectorState.targetMapIndex }));
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
    publishSharedRoomSnapshot(createRoomOperation("lineup", "timed_out", { mapIndex: lineupSelectorState.mapIndex }));
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
  publishSharedRoomSnapshot(createRoomOperation("lineup", "timed_out", { mapIndex: lineupSelectorState.mapIndex }));
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
  publishSharedRoomSnapshot(createRoomOperation("pause", "started"));
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
  publishSharedRoomSnapshot(createRoomOperation("pause", "resumed"));
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

  publishSharedRoomSnapshot(createRoomOperation("notice", "acknowledged", { side: portalConfig.side }));
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
  const matchFormat = partial.matchFormat ?? merged.matchFormat;
  const stageCount = getStageCountForMatchFormat(matchFormat);
  const checkpointOverrides = Array.isArray(partial.checkpoints) ? partial.checkpoints : [];
  const legacyFirstBanPolicy = (partial as { firstBanPolicy?: string }).firstBanPolicy;
  const normalizePolicy = (value: unknown, fallback: SidePolicy): SidePolicy => {
    if (value === "red") return "right";
    if (value === "blue") return "left";
    return (["random", "interactive_random", "left", "right"] as unknown[]).includes(value) ? value as SidePolicy : fallback;
  };

  return {
    ...merged,
    ...partial,
    matchFormat,
    stageCount,
    modeOrder: Array.isArray(partial.modeOrder) && partial.modeOrder.length > 0 ? partial.modeOrder : merged.modeOrder,
    banEnabled: legacyFirstBanPolicy === "no_ban" ? false : partial.banEnabled ?? merged.banEnabled,
    firstBanPolicy: legacyFirstBanPolicy === "loser_must_first" ? "loser_must_first" : "allow_loser_choose",
    openingSidePolicy: normalizePolicy(partial.openingSidePolicy, merged.openingSidePolicy),
    firstMapPickerPolicy: normalizePolicy(partial.firstMapPickerPolicy, merged.firstMapPickerPolicy),
    checkpoints: resizeCheckpoints(
      merged.checkpoints.map((checkpoint, index) => ({
        ...checkpoint,
        ...(checkpointOverrides[index] ?? {}),
      })),
      stageCount,
    ),
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
