import "./styles.css";
import {
  formatMapScore,
  getScoreClasses,
  compareScores,
  normalizeKey,
  slugify,
  isEditableTarget,
  escapeHtml,
} from "./utils";
import { RoomClient } from "./api/room-client";
import { AuthoritativeStore } from "./state/authoritative-store";
import { CountdownPresentationClock } from "./state/countdown-clock";
import { canonicalConfigToLegacy, legacyConfigToCanonical, stableId } from "./state/config-adapter";
import type {
  AuthoritativeRuntime,
  AuthoritativeStatus,
  MatchNotificationEvent as AuthoritativeNotificationEvent,
} from "./state/protocol";
import { HeartbeatController } from "./sync/heartbeat";
import { deriveRoomViewPolicy, type RoomViewPolicy } from "./ui/room-view-policy";
import { NoticeCenter } from "./notice/notice";
import { prepareNotice } from "./notice/prepare-notice";
import { mapSelectNotice } from "./notice/map-select-notice";
import { playerSelectNotice } from "./notice/player-select-notice";
import { banSelectNotice } from "./notice/ban-select-notice";
import { scoreNotice } from "./notice/score-notice";
import { pauseNotice } from "./notice/pause-notice";
import { resultNotice } from "./notice/result-notice";
import { PopWindowRegistry, type PopWindowContext, type PopWindowView } from "./pop-window/pop-window";
import { createPrepareGateView, createPrepareRestView, prepareWindow } from "./pop-window/prepare";
import {
  createMapInteractiveRandomView,
  createMapSelectView,
  createSideSelectView,
  mapSelectWindow,
  type MapModeViewModel,
  type MapOptionViewModel,
} from "./pop-window/map-select";
import { createPlayerSelectView, playerSelectWindow, type LineupSlotViewModel, type LineupTeamViewModel } from "./pop-window/player-select";
import {
  banSelectWindow,
  createBanInteractiveRandomView,
  createBanSelectView,
  type BanHeroBoardViewModel,
  type BanHeroOptionViewModel,
  type BanLineupViewModel,
  type BanMainViewModel,
} from "./pop-window/ban-select";
import {
  createScoreView,
  scoreWindow,
  type ScoreInputViewModel,
  type ScoreMapSummaryViewModel,
  type ScoreTeamPauseViewModel,
} from "./pop-window/score";
import { createResultRestView, resultWindow } from "./pop-window/result";
import { confirmationWindow, createConfirmationView, createPauseView, pauseWindow } from "./pop-window/others";
import { renderBaseboard } from "./baseboard";
import { bindCopyLinkButtons, renderLandingPage } from "./landing";
import { RoomActionDispatcher } from "./room-app";
import { authoritativeTeamPause, lineupToLegacy, runtimeStructureSignature } from "./room-state";
import {
  getAppMode,
  getAppRoot,
  getGlobalAdminHashFromPath,
  getPortalConfig,
  getRoomTokenFromPath,
  getUnlimitedCreateHashFromPath,
} from "./app/routing";
import { defaultSettings, lineupSlots } from "./config/default-settings";
import { renderGlobalAdminPageMarkup } from "./features/admin/view";
import { getHeroRoleKeyFromText, getHeroRoleLabel } from "./features/heroes/roles";
import { createBlankMap, createFreshMatchState, getOppositeSide, pickRandomItem } from "./features/match/model";
import { createCatalogView } from "./features/match/catalog-view";
import { createMapRules } from "./features/match/map-rules";
import { createMatchProgress } from "./features/match/progress";
import { createLineupModel } from "./features/lineup/model";
import { createRosterParser } from "./features/roster/parser";
import { formatCountdown, formatDurationMs, normalizeRosterValue } from "./shared/format";
import {
  getMatchFormatLabel,
  getStageCountForMatchFormat,
  mergeSettings,
  resizeCheckpoints,
} from "./settings";
import {
  formatTimestamp,
  renderAdminSectionHeader,
  renderAdminSettingRow,
} from "./admin";

import type {
  Side,
  MapSelectionMode,
  PlayerInputMode,
  FirstBanPolicy,
  BanOrderChoice,
  ScoreReportMode,
  OverlayKind,
  CheckpointKey,
  MatchFormat,
  SidePolicy,
  OpeningSidePolicy,
  FirstMapPickerPolicy,
  MapPickerPolicy,
  FirstSideChoicePolicy,
  SubsequentSideChoicePolicy,
  MapTimeoutPolicy,
  LineupTimeoutPolicy,
  BanTimeoutPolicy,
  InitialPriorityPolicy,
  PriorityRelation,
  SideTimeoutPolicy,
  BanOrderTimeoutPolicy,
  BanActionTimeoutPolicy,
  InteractiveRandomPurpose,
  OperationCategory,
  TeamState,
  HeroBan,
  MatchMap,
  MatchState,
  StageSetting,
  SettingsState,
  HeroCatalogItem,
  CatalogRefreshJob,
  CatalogMaintenance,
  MapCatalogState,
  MapChoice,
  MapAvailability,
  MapSelectorState,
  LineupSlot,
  LineupSelectorState,
  BanSelectorState,
  ScoreSelectorState,
  SideSelectorState,
  TeamPauseState,
  SelectionConfirmationKind,
  SelectionConfirmationState,
  RestState,
  InteractiveRandomState,
  PauseState,
  ConfirmedLineups,
  RoomViewSnapshot,
  RoomOperation,
  RoomTokenResponse,
  RoomPresenceEntry,
  RoomPresenceState,
  AdminSettings,
  ConfigPreset,
  RoomConfigState,
  AdminRoom,
  RoomHistoryPage,
} from "./types";

const app = getAppRoot();
const appMode = getAppMode();
document.body.classList.toggle("landing-page-body", appMode === "landing");
document.body.classList.toggle("global-admin-page-body", appMode === "global-admin");
const roomToken = getRoomTokenFromPath();
const authoritativeStore = new AuthoritativeStore();
const countdownPresentationClock = new CountdownPresentationClock();
const roomClient = roomToken ? new RoomClient(roomToken) : null;
let heartbeatController: HeartbeatController | null = null;
const unlimitedCreateHash = getUnlimitedCreateHashFromPath();
const globalAdminHash = getGlobalAdminHashFromPath();
let portalConfig = getPortalConfig(appMode);
let roomStarted = false;
let currentState: MatchState | null = null;
let mapCatalogState: MapCatalogState = {
  modes: [], modeIcons: {}, roleIcons: {}, maps: {}, heroes: [], catalogHash: "", locale: "en",
  translation: { active: false, modes: {}, maps: {}, heroes: {} },
};
let settingsState: SettingsState = structuredClone(defaultSettings);
let settingsPanelOpen = false;
const openConfigSections = new Set<string>();
let mapSelectorState: MapSelectorState | null = null;
let sideSelectorState: SideSelectorState | null = null;
let lineupSelectorState: LineupSelectorState | null = null;
let banSelectorState: BanSelectorState | null = null;
let scoreSelectorState: ScoreSelectorState | null = null;
let matchTeamPauseTotals: Record<Side, number> = { left: 0, right: 0 };
let selectionConfirmationState: SelectionConfirmationState | null = null;
let restState: RestState | null = null;
let pauseState: PauseState = { active: false, startedAt: null, totalPausedMs: 0, matchTotalPausedMs: 0, collapsed: false };
let hiddenOverlay: OverlayKind | null = null;
let audienceExpandedOverlay: { phaseId: string; kind: "rest" | "score" } | null = null;
let firstMapPickerSide: Side = resolveSidePolicy(defaultSettings.firstMapPickerPolicy);
let interactiveRandomState: InteractiveRandomState | null = null;
let interactiveRandomResults: Partial<Record<string, Side>> = {};
let confirmedLineups: ConfirmedLineups = {};
let localLineupDrafts: Record<number, Partial<Record<Side, Record<string, string>>>> = {};
let localScoreDraft: { mapIndex: number; values: Record<Side, string> } | null = null;
let countdownTextTimerId: number | null = null;
let pauseDisplayTimerId: number | null = null;
let ownTeamNameDraft: string | null = null;
let roomPresence: RoomPresenceState = createDisconnectedPresence();
let adminSettings: AdminSettings | null = null;
let configPresets: ConfigPreset[] = [];
let roomConfigState: RoomConfigState | null = null;
let selectedGlobalPresetId: string | null = null;
let globalPresetDraftMeta: { name: string } | null = null;
let adminRooms: AdminRoom[] = [];
let adminRoomHistory: RoomHistoryPage = { items: [], total: 0, page: 1, pageSize: 20 };
let catalogMaintenance: CatalogMaintenance | null = null;
let catalogTranslationDraft = "";
let catalogTemplateDraft = "";
let catalogDialogNotice = "";
let lastRuntimeStructure = "";
let authoritativeHistory: Awaited<ReturnType<RoomClient["history"]>> = [];
let pendingAdminCloseRoomId: string | null = null;
let globalPresetDirty = false;

const {
  getAllCatalogMapChoices, findCatalogMapByName, getMapKey, getModeIconUrl,
  getDisplayMapName, getMapNameZh, getModeLabel, getHeroDisplayName,
  getHeroKey, getHeroRoleKey, getHeroesByRole, buildHeroPoolFromCatalog,
  findHeroByKey, createHeroBan, getRoleHeaderImageUrl,
} = createCatalogView(() => mapCatalogState);
const {
  getMapAvailability, isUsedMapChoice, getConfiguredModeOrder,
  parseFixedMapOrder, getSelectorModeOrder, getMapChoicesByMode,
  getLegalMapChoices, findMapChoiceByKey,
} = createMapRules({
  getState: () => currentState,
  getSettings: () => settingsState,
  getSelector: () => mapSelectorState,
  getCatalog: () => mapCatalogState,
  getMapKey,
  getModeIconUrl,
  getMapName: getMapNameZh,
  getModeLabel,
});
const {
  findTargetMapIndex, getMapPickerSide, getSeriesWinnerSide,
} = createMatchProgress({
  getState: () => currentState,
  getFormat: () => settingsState.matchFormat,
  getFirstPicker: () => firstMapPickerSide,
});
const {
  createInitialLineupValues, createLineupReadyState, createEmptyLineupValues,
  cloneLineupValues, isLineupComplete, isSideLineupComplete, getDuplicateLineupValues,
} = createLineupModel(lineupSlots, () => lineupSelectorState);
const { parsePresetRosters, getRosterOptions } = createRosterParser(
  () => settingsState.presetRosterText,
  getTeamName,
);

function settingsFromStoredConfig(value: unknown): SettingsState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const projected = raw.schemaVersion === 2 && raw.map && typeof raw.map === "object"
    ? canonicalConfigToLegacy(raw, resolveCanonicalMapName, resolveCanonicalModeName)
    : raw;
  return mergeSettings(defaultSettings, projected);
}
const noticeCenter = new NoticeCenter(
  [prepareNotice, mapSelectNotice, playerSelectNotice, banSelectNotice, scoreNotice, pauseNotice, resultNotice],
  { mapName: getMapNameZh, heroName: getHeroDisplayName },
);
const popWindowRegistry = new PopWindowRegistry(
  [prepareWindow, mapSelectWindow, playerSelectWindow, banSelectWindow, scoreWindow, resultWindow, pauseWindow, confirmationWindow],
);
const roomActions = new RoomActionDispatcher(
  roomClient,
  authoritativeStore,
  () => ({
    isAdmin: isAdminPortal(),
    awaitingAdminDecision: isAwaitingAdminDecision(),
    portalSide: portalConfig.side,
    interactiveRandom: interactiveRandomState,
    lineup: lineupSelectorState,
    confirmedLineups,
    score: scoreSelectorState,
    stableId,
  }),
  showLocalNotice,
);

authoritativeStore.addEventListener("change", (event) => {
  const kind = (event as CustomEvent<"full" | "runtime">).detail;
  const status = authoritativeStore.status;
  const runtime = authoritativeStore.runtime;
  if (!status || !runtime) return;
  if (kind === "full") {
    countdownPresentationClock.reset(runtime);
    applyAuthoritativeState(status, runtime, true);
    return;
  }
  const structure = runtimeStructureSignature(runtime);
  if (structure !== lastRuntimeStructure) {
    countdownPresentationClock.reset(runtime);
    applyAuthoritativeState(status, runtime, true);
  } else {
    const reconciliation = countdownPresentationClock.reconcile(runtime);
    applyAuthoritativeRuntime(runtime);
    updateCountdownDom(reconciliation);
    updateScorePauseDom();
  }
});
roomClient?.addEventListener("notifications", (event) => {
  const authoritativeEvents = (event as CustomEvent<AuthoritativeNotificationEvent[]>).detail;
  noticeCenter.ingest(authoritativeEvents);
});

renderShell(app);
app.addEventListener("click", handlePersistentAdminControlClick);
void loadInitialData();
window.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("beforeunload", (event) => {
  if (!globalPresetDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

function isAdminPortal(): boolean {
  return portalConfig.role === "admin";
}

function isBroadcastPortal(): boolean {
  return portalConfig.role === "broadcast";
}

function getRoomViewPolicy(): RoomViewPolicy | null {
  const status = authoritativeStore.status;
  const runtime = authoritativeStore.runtime;
  if (!status || !runtime) {
    return null;
  }
  const effectiveRuntime = status.phase.type === "score_entry" && runtime.scoreProposal === null
    ? { ...runtime, timedOut: false, awaitingAdminDecision: false }
    : runtime;
  return deriveRoomViewPolicy(status, effectiveRuntime, {
    role: isBroadcastPortal() ? "broadcast" : isAdminPortal() ? "admin" : "team",
    side: portalConfig.side,
  });
}

function isRoomActionLocked(): boolean {
  const policy = getRoomViewPolicy();
  return Boolean(policy && !policy.canMutateMatch);
}

function isAwaitingAdminDecision(): boolean {
  return Boolean(getRoomViewPolicy()?.awaitingAdminDecision);
}

function canMinimizeForeground(): boolean {
  return getRoomViewPolicy()?.canMinimize ?? true;
}

function isRollbackUnavailable(): boolean {
  const policy = getRoomViewPolicy();
  return Boolean(
    policy?.globalPaused
      || !settingsState.rollbackEnabled
      || (policy?.completed && !settingsState.allowRollbackAfterCompletion),
  );
}

function canUseSettings(): boolean {
  return isAdminPortal();
}

function canOperateMapSelection(): boolean {
  if (!mapSelectorState || interactiveRandomState || isRoomActionLocked() || (isAwaitingAdminDecision() && !isAdminPortal())) {
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
  if (!lineupSelectorState || isRoomActionLocked() || (isAwaitingAdminDecision() && !isAdminPortal())) {
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

function createRoomOperation(
  category: OperationCategory,
  action: string,
  details: Record<string, unknown> = {},
): RoomOperation {
  return { category, action, details };
}

function applyCatalogLocale(): void {
  const english = mapCatalogState.locale !== "zh-CN";
  document.body.classList.toggle("catalog-locale-en", english);
  document.documentElement.lang = english ? "en" : "zh-CN";
}

function dispatchRoomViewOperation(
  operation: RoomOperation = createRoomOperation("room", "snapshot_updated"),
): Promise<void> {
  if (!currentState || !roomToken || !roomClient) {
    return Promise.resolve();
  }
  return roomActions.dispatch(operation);
}

function showLocalNotice(message: string): void {
  noticeCenter.showLocal(message);
}

function applyRoomViewSnapshot(snapshot: RoomViewSnapshot, shouldRender = true): void {
  if (!snapshot?.currentState) {
    return;
  }

  const localMapState = mapSelectorState;
  const localSideState = sideSelectorState;
  const localLineupState = lineupSelectorState;
  const localBanState = banSelectorState;
  const localInteractiveRandomState = interactiveRandomState;
  const incomingLineupState = normalizeLineupSelectorState(snapshot.lineupSelectorState);

  roomStarted = Boolean(snapshot.roomStarted);
  currentState = snapshot.currentState;
  settingsState = mergeSettings(
    defaultSettings,
    !snapshot.roomStarted && roomConfigState?.value ? roomConfigState.value : snapshot.settingsState,
  );
  confirmedLineups = snapshot.confirmedLineups ?? {};
  mapSelectorState = snapshot.mapSelectorState
    ? { ...snapshot.mapSelectorState, selectedMapKey: null }
    : null;
  sideSelectorState = snapshot.sideSelectorState
    ? { ...snapshot.sideSelectorState, selectedSide: null }
    : null;
  lineupSelectorState = incomingLineupState;
  banSelectorState = snapshot.banSelectorState
    ? { ...snapshot.banSelectorState, selectedOrder: null, selectedHeroKey: null }
    : null;
  scoreSelectorState = normalizeScoreSelectorState(snapshot.scoreSelectorState);
  matchTeamPauseTotals = {
    left: Math.max(0, Number(snapshot.matchTeamPauseTotals?.left ?? 0)),
    right: Math.max(0, Number(snapshot.matchTeamPauseTotals?.right ?? 0)),
  };
  restState = snapshot.restState ?? null;
  pauseState = {
    active: Boolean(snapshot.pauseState?.active),
    startedAt: snapshot.pauseState?.startedAt ?? null,
    totalPausedMs: snapshot.pauseState?.totalPausedMs ?? 0,
    matchTotalPausedMs: snapshot.pauseState?.matchTotalPausedMs ?? snapshot.pauseState?.totalPausedMs ?? 0,
    collapsed: Boolean(snapshot.pauseState?.collapsed),
  };
  firstMapPickerSide = snapshot.firstMapPickerSide ?? resolveSidePolicy(settingsState.firstMapPickerPolicy);
  interactiveRandomState = snapshot.interactiveRandomState
    ? {
      ...snapshot.interactiveRandomState,
      submitted: snapshot.interactiveRandomState.submitted ?? {
        left: snapshot.interactiveRandomState.choices.left !== null,
        right: snapshot.interactiveRandomState.choices.right !== null,
      },
    }
    : null;
  interactiveRandomResults = snapshot.interactiveRandomResults ?? {};

  if (
    localMapState?.open
    && mapSelectorState?.open
    && localMapState.targetMapIndex === mapSelectorState.targetMapIndex
    && (isAdminPortal() || portalConfig.side === mapSelectorState.pickerSide)
  ) {
    mapSelectorState.selectedMapKey = localMapState.selectedMapKey;
  }

  if (
    localSideState?.open
    && sideSelectorState?.open
    && localSideState.mapIndex === sideSelectorState.mapIndex
    && (isAdminPortal() || portalConfig.side === sideSelectorState.pickerSide)
  ) {
    sideSelectorState.selectedSide = localSideState.selectedSide;
  }

  if (
    localBanState?.open
    && banSelectorState?.open
    && localBanState.mapIndex === banSelectorState.mapIndex
    && localBanState.step === banSelectorState.step
  ) {
    const ownsBanDraft = isAdminPortal()
      || (banSelectorState.step === "order-choice"
        ? portalConfig.side === banSelectorState.chooserSide
        : portalConfig.side === banSelectorState.activeSide);
    if (ownsBanDraft) {
      banSelectorState.selectedOrder = localBanState.selectedOrder;
      banSelectorState.selectedHeroKey = localBanState.selectedHeroKey;
    }
  }

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

  if (lineupSelectorState?.open) {
    const drafts = localLineupDrafts[lineupSelectorState.mapIndex];
    (["left", "right"] as Side[]).forEach((side) => {
      const draft = drafts?.[side];
      const ownsDraft = isAdminPortal() || portalConfig.side === side;
      if (draft && ownsDraft && !lineupSelectorState!.ready[side]) {
        lineupSelectorState!.values[side] = { ...lineupSelectorState!.values[side], ...draft };
      }
    });
  }

  if (
    localScoreDraft
    && scoreSelectorState?.open
    && !scoreSelectorState.submittedBy
    && localScoreDraft.mapIndex === scoreSelectorState.mapIndex
    && canEditScore()
  ) {
    scoreSelectorState.values = { ...localScoreDraft.values };
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
    interactiveRandomState.submitted[portalConfig.side] = true;
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

async function loadInitialData(): Promise<void> {
  try {
    if (appMode === "debug") {
      await loadDebugPage();
      return;
    }

    if (appMode === "landing") {
      renderLandingPage(app, unlimitedCreateHash);
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
      noticeCenter.setDuration(Number(roomPayload.notificationDurationSeconds ?? 20));
      document.body.classList.toggle("room-admin-page-body", portalConfig.role === "admin");
      roomConfigState = roomPayload.room.config ?? null;
      roomPresence = roomPayload.room.presence ?? createDisconnectedPresence();
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
    applyCatalogLocale();
    applyCatalogHeroPoolDefaults();

    if (roomPayload?.authoritativeState) {
      if (roomConfigState?.value || roomPayload.room.settings) {
        settingsState = settingsFromStoredConfig(roomConfigState?.value ?? roomPayload.room.settings ?? {});
      }
      roomClient?.initializeNotificationStream(roomPayload.authoritativeState.notificationStream);
      await authoritativeStore.apply(roomPayload.authoritativeState);
      if (isAdminPortal() && roomClient) {
        try {
          authoritativeHistory = await roomClient.history();
        } catch {
          authoritativeHistory = [];
        }
      }
      startCountdownTimer();
      heartbeatController = roomClient ? new HeartbeatController(
        roomClient,
        authoritativeStore,
        () => renderError("房间已经关闭或因不活跃而过期。"),
      ) : null;
      heartbeatController?.start();
      renderCurrent();
      return;
    }

    if (roomConfigState?.value) {
      settingsState = settingsFromStoredConfig(roomConfigState.value);
    } else if (roomPayload?.room.settings) {
      settingsState = mergeSettings(defaultSettings, roomPayload.room.settings);
    } else if (presetResponse.ok) {
      settingsState = mergeSettings(defaultSettings, getDefaultPresetFromPayload(await presetResponse.json()));
    }

    currentState = createFreshMatchState((await matchResponse.json()) as MatchState, settingsState);
    roomStarted = false;
    mapSelectorState = null;
    sideSelectorState = null;
    lineupSelectorState = null;
    banSelectorState = null;
    scoreSelectorState = null;
    matchTeamPauseTotals = { left: 0, right: 0 };
    restState = null;
    pauseState = { active: false, startedAt: null, totalPausedMs: 0, matchTotalPausedMs: 0, collapsed: false };
    hiddenOverlay = null;
    firstMapPickerSide = resolveSidePolicy(settingsState.firstMapPickerPolicy);
    interactiveRandomState = null;
    interactiveRandomResults = {};
    confirmedLineups = {};
    localLineupDrafts = {};
    localScoreDraft = null;
    dispatchRoomViewOperation(createRoomOperation("room", "initialized"));
    startCountdownTimer();
    renderCurrent();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "未知错误");
  }
}

async function loadDebugPage(): Promise<void> {
  const catalogResponse = await fetch("/api/maps/catalog", { headers: { Accept: "application/json" } });
  if (!catalogResponse.ok) {
    throw new Error(`Map catalog API returned ${catalogResponse.status}`);
  }
  mapCatalogState = (await catalogResponse.json()) as MapCatalogState;
  applyCatalogLocale();
  applyCatalogHeroPoolDefaults();
  startCountdownTimer();

  const canonicalConfig = legacyConfigToCanonical({
    ...structuredClone(defaultSettings),
    matchName: "OW Ban Pick UI Debug",
    teams: { left: "CR", right: "FAL" },
  }, stableId, stableId);
  const { startDebugPage } = await import("./debug/debug-page");
  startDebugPage({
    catalog: mapCatalogState,
    canonicalConfig,
    applyScenario: (status, runtime, portal) => {
      portalConfig = portal;
      settingsPanelOpen = portal.role === "admin" && ["configuring", "waiting_ready"].includes(status.phase.type);
      selectionConfirmationState = null;
      hiddenOverlay = null;
      localLineupDrafts = {};
      localScoreDraft = null;
      mapSelectorState = null;
      sideSelectorState = null;
      lineupSelectorState = null;
      banSelectorState = null;
      scoreSelectorState = null;
      interactiveRandomState = null;
      document.body.classList.toggle("room-admin-page-body", portal.role === "admin");
      authoritativeStore.status = Object.freeze(status);
      authoritativeStore.runtime = runtime;
      countdownPresentationClock.reset(runtime);
      applyAuthoritativeState(status, runtime, true);
    },
    showNotification: (event) => noticeCenter.ingest([event]),
  });
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) {
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
  const viewPolicy = getRoomViewPolicy();

  if (roomStarted && !viewPolicy?.completed) {
    syncMapSelectorTarget(true);
  }

  app.innerHTML = renderBaseboard({
    matchName: escapeHtml(currentState.matchName),
    matchFormat: escapeHtml(getMatchFormatLabel(settingsState.matchFormat)),
    phaseLabel: isBroadcastPortal()
      ? ""
      : viewPolicy?.completed
        ? authoritativeStore.status?.match.winnerSide
          ? `比赛已结束，${escapeHtml(getTeamName(authoritativeStore.status.match.winnerSide))}获胜`
          : "比赛已结束"
        : roomStarted
          ? "比赛进行阶段"
          : settingsState.startWithDefaultConfig
            ? "自动开始模式"
          : roomConfigState?.status === "ready"
            ? "确认配置阶段"
            : "待配置阶段",
    portalRole: portalConfig.role,
    portalLabel: isBroadcastPortal() ? "" : escapeHtml(portalConfig.label),
    leftTeam: renderTeamHeader("left", currentState.teams.left),
    rightTeam: renderTeamHeader("right", currentState.teams.right),
    mapRows: getVisibleMaps(currentState)
      .map(({ map, index }) => renderMapRow(map, index, currentState!.teams))
      .join(""),
    presence: isBroadcastPortal() ? "" : renderPresenceBar(),
    startGate: "",
    settings: canUseSettings() && (settingsPanelOpen || roomStarted) ? renderSettingsPanel() : "",
    popWindows: popWindowRegistry.render(createPopWindowContext()),
  });

  bindMapRowEvents();
  popWindowRegistry.bind(createPopWindowContext());
  bindSettingsEvents();
  updateCountdownDom();
}

function createPopWindowContext(): PopWindowContext {
  const phase = authoritativeStore.status?.phase.type ?? "configuring";
  const purpose = String(authoritativeStore.status?.phase.data.purpose ?? interactiveRandomState?.purpose ?? "") || null;
  const views: PopWindowContext["views"] = {
    pause: createPauseView(
      { active: pauseState.active, elapsed: formatElapsedPause(), admin: isAdminPortal() },
      {
        resume: resumeGlobalPause,
      },
    ),
    confirmation: createConfirmationView(
      {
        visible: Boolean(selectionConfirmationState),
        title: getSelectionConfirmationDisplayTitle(),
        summary: getSelectionConfirmationSummary(),
        inlineSummary: usesInlineSelectionConfirmationSummary(),
        headerDetails: getSelectionConfirmationHeaderDetails(),
      },
      { cancel: cancelSelectionConfirmation, accept: acceptSelectionConfirmation },
    ),
  };

  if (["configuring", "waiting_ready", "pre_start_rest"].includes(phase)) views.prepare = createPrepareStageView(phase);
  if (["map_pick", "side_pick"].includes(phase) || (phase === "interactive_random" && ["map_picker", "side_choice"].includes(purpose ?? ""))) views["map-select"] = createMapStageView(phase);
  if (phase === "lineup_pick") views["player-select"] = createLineupStageView();
  if (["ban_order", "ban_first", "ban_second"].includes(phase) || (phase === "interactive_random" && purpose === "opening_ban")) views["ban-select"] = createBanStageView(phase);
  if (phase === "score_entry") views.score = createScoreStageView();
  if (phase === "post_map_rest") views.result = createResultStageView();

  return { phase, purpose, audience: isBroadcastPortal(), countdown: getCountdownSnapshot(), views };
}

function isOverlayAutoMinimized(kind: "rest" | "score", audienceOnly = true): boolean {
  const phaseId = authoritativeStore.status?.phase.phaseId;
  return Boolean(
    (!audienceOnly || isBroadcastPortal())
      && phaseId
      && (audienceExpandedOverlay?.phaseId !== phaseId || audienceExpandedOverlay.kind !== kind),
  );
}

function minimizeAudienceOverlay(kind: "rest" | "score"): void {
  audienceExpandedOverlay = null;
  hiddenOverlay = kind;
  renderCurrent();
}

function restoreAudienceOverlay(kind: "rest" | "score"): void {
  const phaseId = authoritativeStore.status?.phase.phaseId;
  audienceExpandedOverlay = phaseId ? { phaseId, kind } : null;
  hiddenOverlay = null;
  renderCurrent();
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


async function loadGlobalAdminData(page = adminRoomHistory.page): Promise<void> {
  if (!globalAdminHash) {
    renderError("缺少全局管理哈希。");
    return;
  }

  const [settingsResponse, roomsResponse, historyResponse, presetsResponse, catalogResponse, maintenanceResponse] = await Promise.all([
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/settings`, { headers: { Accept: "application/json" } }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/rooms`, { headers: { Accept: "application/json" } }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/room-history?page=${page}&pageSize=20`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets`, { headers: { Accept: "application/json" } }),
    fetch("/api/maps/catalog", { headers: { Accept: "application/json" } }),
    fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/catalog-maintenance`, { headers: { Accept: "application/json" } }),
  ]);

  if (!settingsResponse.ok || !roomsResponse.ok || !historyResponse.ok || !presetsResponse.ok || !catalogResponse.ok || !maintenanceResponse.ok) {
    renderError("全局管理入口不存在。");
    return;
  }

  adminSettings = await settingsResponse.json() as AdminSettings;
  const roomsPayload = await roomsResponse.json() as { rooms: AdminRoom[] };
  adminRooms = roomsPayload.rooms;
  adminRoomHistory = await historyResponse.json() as RoomHistoryPage;
  configPresets = ((await presetsResponse.json()) as { items: ConfigPreset[] }).items;
  mapCatalogState = await catalogResponse.json() as MapCatalogState;
  catalogMaintenance = await maintenanceResponse.json() as CatalogMaintenance;
  applyCatalogLocale();
  applyCatalogHeroPoolDefaults();
  if (selectedGlobalPresetId && !configPresets.some((preset) => preset.id === selectedGlobalPresetId)) {
    selectedGlobalPresetId = null;
  }
}

function renderGlobalAdminPage(message = ""): void {
  if (!adminSettings) {
    return;
  }

  const selectedPreset = configPresets.find((preset) => preset.id === selectedGlobalPresetId);
  if (selectedPreset && !globalPresetDraftMeta) {
    settingsState = settingsFromStoredConfig(selectedPreset.config);
  } else if (selectedGlobalPresetId === "__new__" && !globalPresetDraftMeta) {
    settingsState = structuredClone(defaultSettings);
  }

  app.innerHTML = renderGlobalAdminPageMarkup({
    settings: adminSettings,
    rooms: adminRooms,
    history: adminRoomHistory,
    presets: configPresets,
    maintenance: catalogMaintenance,
    presetManager: renderConfigPresetManager(selectedPreset ?? null),
    adminHash: globalAdminHash ?? "",
    message,
    pendingCloseRoomId: pendingAdminCloseRoomId,
    catalogTemplateDraft,
    catalogTranslationDraft,
    catalogDialogNotice,
  });
  document.getElementById("saveGlobalSettings")?.addEventListener("click", saveGlobalSettings);
  bindGlobalPresetManagerEvents();
  app.querySelectorAll<HTMLButtonElement>(".close-admin-room").forEach((button) => {
    button.addEventListener("click", () => requestCloseAdminRoom(button.dataset.roomId ?? ""));
  });
  app.querySelectorAll<HTMLButtonElement>(".view-room-history").forEach((button) => {
    button.addEventListener("click", () => viewRoomHistory(button.dataset.archiveKey ?? ""));
  });
  document.getElementById("previousHistoryPage")?.addEventListener("click", () => changeHistoryPage(adminRoomHistory.page - 1));
  document.getElementById("nextHistoryPage")?.addEventListener("click", () => changeHistoryPage(adminRoomHistory.page + 1));
  document.getElementById("closeRoomHistoryDialog")?.addEventListener("click", () => {
    (document.getElementById("roomHistoryDialog") as HTMLDialogElement | null)?.close();
  });
  bindCatalogMaintenanceEvents();
  bindCopyLinkButtons(app);
  document.getElementById("cancelCloseAdminRoom")?.addEventListener("click", () => {
    pendingAdminCloseRoomId = null;
    (document.getElementById("closeAdminRoomDialog") as HTMLDialogElement | null)?.close();
  });
  document.getElementById("confirmCloseAdminRoom")?.addEventListener("click", () => void closeAdminRoom());
  if (pendingAdminCloseRoomId) {
    (document.getElementById("closeAdminRoomDialog") as HTMLDialogElement | null)?.showModal();
  }
}

function bindCatalogMaintenanceEvents(): void {
  document.getElementById("refreshEnglishCatalog")?.addEventListener("click", () => void startEnglishCatalogRefresh());
  document.getElementById("openCatalogTranslation")?.addEventListener("click", openCatalogTranslationDialog);
  document.getElementById("saveCatalogTranslation")?.addEventListener("click", () => void saveCatalogTranslation());
  document.getElementById("copyCatalogTemplate")?.addEventListener("click", () => void copyCatalogTemplate(false));
  document.querySelectorAll<HTMLButtonElement>(".close-catalog-dialog").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
}

async function startEnglishCatalogRefresh(): Promise<void> {
  if (!globalAdminHash || !catalogMaintenance) return;
  const button = document.getElementById("refreshEnglishCatalog") as HTMLButtonElement | null;
  if (button) button.disabled = true;

  try {
    const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/catalog-refresh`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (response.status !== 202 && response.status !== 409) {
      throw new Error(`HTTP ${response.status}`);
    }
    const job = await response.json() as CatalogRefreshJob;
    catalogMaintenance.job = job;
    renderGlobalAdminPage(response.status === 409 ? "已有英文目录更新任务正在运行。" : "英文目录更新已开始。关闭页面不会中断任务。");
    await pollCatalogRefresh(job.id);
  } catch {
    renderGlobalAdminPage("无法启动英文目录更新，请稍后重试。");
  }
}

async function pollCatalogRefresh(jobId: string): Promise<void> {
  if (!globalAdminHash) return;
  while (true) {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/catalog-refresh/${encodeURIComponent(jobId)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      renderGlobalAdminPage("无法读取英文目录更新进度。");
      return;
    }
    const job = await response.json() as CatalogRefreshJob;
    if (catalogMaintenance) catalogMaintenance.job = job;

    if (job.status === "queued" || job.status === "running") {
      renderGlobalAdminPage();
      continue;
    }
    if (job.status === "failed") {
      await loadGlobalAdminData();
      if (catalogMaintenance) catalogMaintenance.job = job;
      renderGlobalAdminPage(`英文目录更新失败，上一版数据未受影响：${job.error ?? "未知错误"}`);
      return;
    }

    catalogTemplateDraft = JSON.stringify(job.result?.translationTemplate ?? {}, null, 2);
    catalogDialogNotice = "";
    await loadGlobalAdminData();
    renderGlobalAdminPage("英文目录更新完成，映射模板已生成。");
    const dialog = document.getElementById("catalogTemplateDialog") as HTMLDialogElement | null;
    dialog?.showModal();
    await copyCatalogTemplate(true);
    return;
  }
}

async function copyCatalogTemplate(automatic: boolean): Promise<void> {
  const textarea = document.getElementById("catalogTemplateJson") as HTMLTextAreaElement | null;
  const status = document.getElementById("catalogTemplateCopyStatus");
  if (!textarea || !status) return;

  try {
    if (!navigator.clipboard) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(textarea.value);
    status.textContent = automatic ? "JSON 已自动复制到剪贴板。" : "JSON 已复制。";
  } catch {
    textarea.focus();
    textarea.select();
    status.textContent = "浏览器未允许复制，请按 Ctrl+C 手动复制。";
  }
}

function openCatalogTranslationDialog(): void {
  if (!catalogMaintenance) return;
  catalogTranslationDraft = JSON.stringify(catalogMaintenance.translation.document, null, 2);
  const textarea = document.getElementById("catalogTranslationJson") as HTMLTextAreaElement | null;
  if (textarea) textarea.value = catalogTranslationDraft;
  const status = document.getElementById("catalogTranslationStatus");
  if (status) status.textContent = "";
  (document.getElementById("catalogTranslationDialog") as HTMLDialogElement | null)?.showModal();
}

async function saveCatalogTranslation(): Promise<void> {
  if (!globalAdminHash) return;
  const textarea = document.getElementById("catalogTranslationJson") as HTMLTextAreaElement | null;
  const status = document.getElementById("catalogTranslationStatus");
  const button = document.getElementById("saveCatalogTranslation") as HTMLButtonElement | null;
  if (!textarea || !status || !button) return;

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(textarea.value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("root");
    payload = parsed as Record<string, unknown>;
  } catch {
    status.textContent = "JSON 格式错误，旧映射未被覆盖。";
    return;
  }

  button.disabled = true;
  status.textContent = "正在保存...";
  try {
    const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/catalog-translation`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json() as { active: boolean };
    await loadGlobalAdminData();
    renderGlobalAdminPage(result.active ? "中文映射已保存并启用。" : "中文映射已保存，但与当前目录不匹配；网站现统一显示英文。");
  } catch {
    button.disabled = false;
    status.textContent = "映射保存失败，旧映射未被覆盖。";
  }
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
  const notificationDurationSeconds = Number((document.getElementById("adminNotificationDuration") as HTMLInputElement | null)?.value || adminSettings.notificationDurationSeconds);
  const defaultPresetId = (document.getElementById("adminDefaultPreset") as HTMLSelectElement | null)?.value || null;

  try {
    const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomsPerHour, inactiveTimeoutMinutes, notificationDurationSeconds, defaultPresetId }),
    });

    if (response.ok) {
      adminSettings = await response.json() as AdminSettings;
      renderGlobalAdminPage("全局设置已保存。");
      return;
    }
    renderGlobalSettingsFailure(await getConfigErrorMessage(response));
  } catch (error) {
    renderGlobalSettingsFailure(error instanceof Error ? error.message : "网络请求失败");
  }
}

function renderGlobalSettingsFailure(message: string): void {
  const feedback = document.getElementById("globalSettingsSaveFeedback");
  if (feedback) {
    feedback.innerHTML = `<span>${escapeHtml(message)}</span><button id="retryGlobalSettingsSave" type="button">重试</button>`;
    document.getElementById("retryGlobalSettingsSave")?.addEventListener("click", () => void saveGlobalSettings());
  }
}

function requestCloseAdminRoom(roomId: string): void {
  if (!roomId) return;
  pendingAdminCloseRoomId = roomId;
  renderGlobalAdminPage();
}

async function closeAdminRoom(): Promise<void> {
  const roomId = pendingAdminCloseRoomId;
  if (!globalAdminHash || !roomId) {
    return;
  }

  pendingAdminCloseRoomId = null;
  const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/rooms/${encodeURIComponent(roomId)}/close`, {
    method: "POST",
  });

  if (response.ok) {
    await loadGlobalAdminData();
    renderGlobalAdminPage("房间已关闭。");
  }
}

function createPrepareStageView(phase: PopWindowContext["phase"]): PopWindowView {
  if (phase === "pre_start_rest") {
    const mapIndex = restState?.mapIndex ?? 0;
    return createPrepareRestView({
      visible: Boolean(currentState && restState?.open), minimized: hiddenOverlay === "rest" || isOverlayAutoMinimized("rest"), mapIndex, canMinimize: canMinimizeForeground(),
      broadcast: isBroadcastPortal(), canSkip: canSkipRestPeriod(), buttonLabel: getRestButtonLabel(),
    }, {
      minimize: () => minimizeAudienceOverlay("rest"),
      restore: () => restoreAudienceOverlay("rest"),
      skip: skipRestPeriod,
    });
  }
  const status = roomConfigState?.status ?? "draft";
  const preparationStatus = status === "draft" && settingsState.startWithDefaultConfig ? "ready" : status;
  const teamPortalCode = portalConfig.code === "A" || portalConfig.code === "B" ? portalConfig.code : null;
  const teamReady = teamPortalCode ? roomPresence[teamPortalCode].ready : false;
  const bothTeamsReady = areBothTeamsReady();
  const preparationOpen = status === "ready" || settingsState.startWithDefaultConfig;
  const ownSide = portalConfig.side;
  const ownTeamName = ownSide ? settingsState.teams[ownSide] : "";
  const displayedOwnTeamName = settingsState.teamsCanEditOwnName && !teamReady
    ? ownTeamNameDraft ?? ownTeamName
    : ownTeamName;
  return createPrepareGateView({
    visible: !roomStarted,
    status: preparationStatus,
    teamPortal: Boolean(teamPortalCode),
    teamReady,
    bothTeamsReady,
    preparationOpen,
    ownTeamName: displayedOwnTeamName,
    canEditTeamName: settingsState.teamsCanEditOwnName,
    settingsAccess: canUseSettings(),
    broadcast: isBroadcastPortal(),
    startWithDefaultConfig: settingsState.startWithDefaultConfig,
    minimized: hiddenOverlay === "prepare",
    canMinimize: true,
    teams: {
      left: { name: settingsState.teams.left, ready: roomPresence.A.ready, connected: roomPresence.A.connected },
      right: { name: settingsState.teams.right, ready: roomPresence.B.ready, connected: roomPresence.B.connected },
    },
  }, {
    minimize: () => {
      if (canUseSettings() && roomConfigState?.status === "draft" && settingsPanelOpen) {
        readSettingsFromForm();
      }
      hiddenOverlay = "prepare";
      renderCurrent();
    },
    restore: () => {
      if (canUseSettings() && roomConfigState?.status === "draft" && settingsPanelOpen) {
        readSettingsFromForm();
      }
      hiddenOverlay = null;
      renderCurrent();
    },
    openConfig: () => { settingsPanelOpen = true; renderCurrent(); },
    confirmConfig: () => { void confirmRoomConfig(); },
    start: (force) => { void startRoomMatch(force); },
    updateName: (value) => { ownTeamNameDraft = value; },
    setReady: (ready, teamName) => { void updateRoomPresence(ready, true, teamName); },
  });
}

function normalizeScoreSelectorState(state: ScoreSelectorState | null | undefined): ScoreSelectorState | null {
  if (!state) {
    return null;
  }

  return {
    ...state,
    teamPauses: {
      left: normalizeTeamPauseState(state.teamPauses?.left),
      right: normalizeTeamPauseState(state.teamPauses?.right),
    },
    countdownPauseStartedAt: typeof state.countdownPauseStartedAt === "number"
      ? state.countdownPauseStartedAt
      : null,
  };
}

function normalizeTeamPauseState(state: TeamPauseState | null | undefined): TeamPauseState {
  return {
    active: Boolean(state?.active),
    startedAt: typeof state?.startedAt === "number" ? state.startedAt : null,
    totalMs: Math.max(0, Number(state?.totalMs ?? 0)),
    count: Math.max(0, Math.floor(Number(state?.count ?? 0))),
  };
}

function createDisconnectedPresence(): RoomPresenceState {
  const disconnected = (): RoomPresenceEntry => ({ connected: false, ready: false, nameConfirmed: false, lastSeenAt: 0 });
  return { A: disconnected(), B: disconnected(), C: disconnected() };
}

function areBothTeamsReady(): boolean {
  return roomPresence.A.ready && roomPresence.B.ready;
}

function renderPresenceBar(): string {
  const completed = getRoomViewPolicy()?.completed ?? false;
  const items: Array<{ code: "A" | "B" | "C"; label: string; side: "left" | "center" | "right" }> = [
    { code: "A", label: settingsState.teams.left, side: "left" },
    { code: "C", label: completed ? "比赛已结束" : "管理员", side: "center" },
    { code: "B", label: settingsState.teams.right, side: "right" },
  ];

  return `
    <section class="room-presence-bar" aria-label="房间连接状态">
      ${items.map(({ code, label, side }) => {
        const presence = roomPresence[code];
        const isTeam = code !== "C";
        return `
          <article class="room-presence-item room-presence-${side} ${completed && code === "C" ? "match-completed" : ""} ${presence.connected ? "is-connected" : "is-disconnected"}" data-presence-code="${code}">
            <span class="room-presence-dot" aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(label)}</strong>
              <small class="room-presence-status">${completed && code === "C" ? `管理员${presence.connected ? "已连接" : "已断开"}` : presence.connected ? "已连接" : "已断开"}</small>
            </div>
            ${isTeam && !roomStarted ? `<em class="room-ready-status ${presence.ready ? "is-ready" : ""}">${presence.ready ? "已准备" : "未准备"}</em>` : ""}
          </article>
        `;
      }).join("")}
    </section>
  `;
}

async function updateRoomPresence(ready?: boolean, renderAfter = false, teamName?: string): Promise<void> {
  if (!roomToken || !roomClient) return;
  try {
    if (teamName !== undefined) {
      const expected = authoritativeStore.ref;
      if (expected) await authoritativeStore.apply(await roomClient.action(expected, "team_name_set", { name: teamName }));
    }
    if (ready !== undefined) {
      const expected = authoritativeStore.ref;
      if (expected) await authoritativeStore.apply(await roomClient.action(expected, "portal_ready_set", { ready }));
    }
    ownTeamNameDraft = null;
    if (renderAfter) renderCurrent();
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "更新准备状态失败");
  }
}

function getVisibleMaps(state: MatchState): Array<{ map: MatchMap; index: number }> {
  const initialCount = settingsState.matchFormat === "ft2" ? 3 : settingsState.matchFormat === "ft4" ? 7 : 5;
  const initialLastMap = state.maps[initialCount - 1];
  let visibleCount = Math.min(initialCount, state.maps.length);

  // 只在第 3 / 5 / 7 局完成且比赛仍未决出时，依序露出后续地图：
  // 先显示下一局；该局尚未结束时，再预先显示最后一局。
  if (initialLastMap?.status === "completed" && getSeriesWinnerSide(state) === null) {
    visibleCount = Math.min(initialCount + 1, state.maps.length);
    const extraMap = state.maps[initialCount];
    if (extraMap && extraMap.status !== "completed") {
      visibleCount = Math.min(initialCount + 2, state.maps.length);
    }
  }

  return state.maps.slice(0, visibleCount).map((map, index) => ({ map, index }));
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
  const mapTitle = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? "";
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
              ${
                sideSelectorState?.open && sideSelectorState.mapIndex === zeroBasedIndex
                  ? `<span class="map-pick-hint">${escapeHtml(getTeamName(sideSelectorState.pickerSide))} 正在选择${sideSelectorState.choiceKind === "attack_defense" ? "攻防" : "阵营"}</span>`
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
    <div class="ban-pointer ${active ? "ban-pointer-active" : ""}" aria-label="${active ? "先手禁用方" : ""}">
      ${active ? arrow : ""}
    </div>
  `;
}

function createMapStageView(phase: PopWindowContext["phase"]): PopWindowView {
  if (phase === "interactive_random") return createMapInteractiveRandomView(createInteractiveRandomModel(), {
    minimize: () => { hiddenOverlay = "map"; renderCurrent(); },
    restore: () => { hiddenOverlay = null; renderCurrent(); },
    choose: chooseInteractiveRandomValue,
    confirmAdminDecision: resolveInteractiveRandomAsAdmin,
  });
  if (phase === "side_pick") return createSideStageView();
  if (!currentState || !mapSelectorState?.open) throw new Error("map_pick phase is missing map selector state");
  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);
  const modes = getSelectorModeOrder();
  const minimized = Boolean(mapSelectorState.minimized || hiddenOverlay === "map");
  return createMapSelectView({
    visible: true, minimized, pickerSide: mapSelectorState.pickerSide, pickerName: getTeamName(mapSelectorState.pickerSide),
    mapIndex: mapSelectorState.targetMapIndex,
    canMinimize: canMinimizeForeground(), modes: modes.map(createMapModeViewModel),
    selectedMap: selectedChoice ? getDisplayMapName(selectedChoice.nameEn) : "", broadcast: isBroadcastPortal(),
    canConfirm: canConfirmMapSelection(), confirmLabel: getMapConfirmButtonLabel(), timedOut: mapSelectorState.timedOut,
    admin: isAdminPortal(), actionLocked: isRoomActionLocked(), inactive: getInactiveProgressClass(mapSelectorState.pickerSide).includes("progress-inactive"),
    extensionSeconds: settingsState.stageLimits.timeoutExtensionSeconds,
  }, {
    minimize: () => { mapSelectorState!.minimized = true; renderCurrent(); }, restore: () => { mapSelectorState!.minimized = false; hiddenOverlay = null; renderCurrent(); },
    confirm: () => requestSelectionConfirmation("map"), random: randomLegalMapChoice, extend: extendMapChoiceTime,
    forfeit: forfeitCurrentMapChoice, selectMap: selectMapChoice,
  });
}

function createSideStageView(): PopWindowView {
  if (!currentState || !sideSelectorState?.open) throw new Error("side_pick phase is missing side selector state");
  const map = currentState.maps[sideSelectorState.mapIndex];
  const mapName = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? `MAP ${sideSelectorState.mapIndex + 1}`;
  const canOperate = canOperateSideSelection();
  const firstSelected = sideSelectorState.selectedSide === sideSelectorState.pickerSide;
  const secondSelected = sideSelectorState.selectedSide === getOppositeSide(sideSelectorState.pickerSide);
  return createSideSelectView({
    visible: true, minimized: hiddenOverlay === "side", choiceKind: sideSelectorState.choiceKind, mapIndex: sideSelectorState.mapIndex,
    mapName, canMinimize: canMinimizeForeground(), pickerName: getTeamName(sideSelectorState.pickerSide),
    firstLabel: sideSelectorState.choiceKind === "attack_defense" ? "选择先防守" : "选择蓝色方",
    secondLabel: sideSelectorState.choiceKind === "attack_defense" ? "选择先进攻" : "选择红色方",
    firstSelected, secondSelected, broadcast: isBroadcastPortal(), canOperate, summary: getSideChoiceSummary(),
    inactive: getInactiveProgressClass(sideSelectorState.pickerSide).includes("progress-inactive"),
  }, {
    minimize: () => { hiddenOverlay = "side"; renderCurrent(); }, restore: () => { hiddenOverlay = null; renderCurrent(); },
    choose: (choice) => { if (!canOperateSideSelection()) return; sideSelectorState!.selectedSide = choice === "picker" ? sideSelectorState!.pickerSide : getOppositeSide(sideSelectorState!.pickerSide); renderCurrent(); },
    confirm: confirmSideSelection,
  });
}

function getInactiveProgressClass(activeSide: Side | null, alreadyCompleted = false): string {
  return portalConfig.side && (alreadyCompleted || (activeSide && portalConfig.side !== activeSide))
    ? " progress-inactive"
    : "";
}

function createMapModeViewModel(mode: string): MapModeViewModel {
  const choices = getMapChoicesByMode(mode);
  const availableCount = choices.filter((choice) => getMapAvailability(choice).available).length;
  const selectedChoice = findMapChoiceByKey(mapSelectorState?.selectedMapKey ?? null);
  return {
    key: mode, label: getModeLabel(mode), iconUrl: getModeIconUrl(mode) ?? "",
    active: selectedChoice?.mode === mode, locked: availableCount === 0,
    choices: choices.map(createMapOptionViewModel),
  };
}

function createMapOptionViewModel(choice: MapChoice): MapOptionViewModel {
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
  return {
    key: choice.key, modeLabel, name: getDisplayMapName(choice.nameEn), imageUrl: choice.imageUrl,
    selected, disabled, disabledClass, title, broadcast: isBroadcastPortal(),
  };
}

function createLineupStageView(): PopWindowView {
  if (!currentState || !lineupSelectorState?.open) throw new Error("lineup_pick phase is missing lineup selector state");

  const map = currentState.maps[lineupSelectorState.mapIndex];
  const mapName = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? `MAP ${lineupSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmLineupSelection();

  return createPlayerSelectView({
    visible: true,
    minimized: hiddenOverlay === "lineup",
    mapIndex: lineupSelectorState.mapIndex,
    mapName,
    canMinimize: canMinimizeForeground(),
    leftTeam: createLineupTeamViewModel("left"),
    rightTeam: createLineupTeamViewModel("right"),
    broadcast: isBroadcastPortal(),
    canConfirm,
    confirmLabel: getLineupConfirmButtonLabel(),
    timedOut: lineupSelectorState.timedOut,
    admin: isAdminPortal(),
    actionLocked: isRoomActionLocked(),
    extensionSeconds: settingsState.stageLimits.timeoutExtensionSeconds,
  }, {
    minimize: () => { hiddenOverlay = "lineup"; renderCurrent(); },
    restore: () => { hiddenOverlay = null; renderCurrent(); },
    confirm: () => requestSelectionConfirmation("lineup"),
    extend: extendLineupChoiceTime,
    forfeit: forfeitIncompleteLineup,
    update: updateLineupValue,
  });
}

function createLineupTeamViewModel(side: Side): LineupTeamViewModel {
  if (!lineupSelectorState) throw new Error("Missing lineup selector state");
  const team = currentState?.teams[side];
  const presetOptions = getRosterOptions(side);
  const ownSide = portalConfig.side;
  const canRevealValues = isBroadcastPortal()
    ? lineupSelectorState.ready.left && lineupSelectorState.ready.right
    : isAdminPortal()
    || ownSide === side
    || Boolean(ownSide && lineupSelectorState.ready[ownSide] && lineupSelectorState.ready[side]);
  const values = canRevealValues ? lineupSelectorState.values[side] : createEmptyLineupValues();
  const duplicateValues = getDuplicateLineupValues(values);
  const editable = canEditLineupSide(side);
  const ready = lineupSelectorState.ready[side];
  const accessLabel = ready
    ? isBroadcastPortal() ? "阵容已确认" : ownSide === side || isAdminPortal() ? "已确认" : "对方已确认"
    : editable
      ? isAdminPortal() ? "管理员可填写" : "本队可填写"
      : isBroadcastPortal() ? "等待阵容确认" : "对方填写";

  return {
    side, name: team?.name ?? "", editable, ready, accessLabel,
    slots: lineupSlots.map((slot) => createLineupSlotViewModel(side, slot, presetOptions, values, duplicateValues)),
  };
}

function createLineupSlotViewModel(
  side: Side,
  slot: LineupSlot,
  presetOptions: string[],
  values: Record<string, string>,
  duplicateValues: Set<string>,
): LineupSlotViewModel {
  const value = values[slot.id] ?? "";
  const completed = value.trim().length > 0;
  const duplicated = duplicateValues.has(normalizeRosterValue(value));
  const disabled = !canEditLineupSide(side);

  return {
    id: slot.id, role: slot.role, label: slot.label, iconUrl: getRoleHeaderImageUrl(slot.role), value, completed, duplicated,
    control: isBroadcastPortal()
      ? { kind: "readonly", disabled: true, text: value || "—" }
      : settingsState.rosterMode === "preset_only"
        ? { kind: "select", disabled, options: presetOptions }
        : { kind: "input", disabled, placeholder: presetOptions.length > 0 ? "输入或参考预设成员" : "输入成员名" },
  };
}

function createBanStageView(phase: PopWindowContext["phase"]): PopWindowView {
  if (phase === "interactive_random") return createBanInteractiveRandomView(createInteractiveRandomModel(), {
    minimize: () => { hiddenOverlay = "ban"; renderCurrent(); },
    restore: () => { hiddenOverlay = null; renderCurrent(); },
    choose: chooseInteractiveRandomValue,
    confirmAdminDecision: resolveInteractiveRandomAsAdmin,
  });
  if (!currentState || !banSelectorState?.open) throw new Error("ban phase is missing ban selector state");

  const map = currentState.maps[banSelectorState.mapIndex];
  const mapName = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? `MAP ${banSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmBanSelection();
  const hasLineups = Boolean(confirmedLineups[banSelectorState.mapIndex]);

  return createBanSelectView({
    visible: true,
    minimized: hiddenOverlay === "ban",
    mapIndex: banSelectorState.mapIndex,
    mapName,
    canMinimize: canMinimizeForeground(),
    hasLineups,
    orderStep: banSelectorState.step === "order-choice",
    leftLineup: createBanLineupViewModel("left"),
    main: createBanMainViewModel(),
    rightLineup: createBanLineupViewModel("right"),
    summary: getBanSelectionSummary(),
    broadcast: isBroadcastPortal(),
    canConfirm,
    confirmLabel: getBanConfirmButtonLabel(),
    timedOut: banSelectorState.timedOut,
    awaitingAdminDecision: isAwaitingAdminDecision(),
    admin: isAdminPortal(),
    actionLocked: isRoomActionLocked(),
    inactive: getInactiveProgressClass(banSelectorState.step === "order-choice" ? banSelectorState.chooserSide : banSelectorState.activeSide).includes("progress-inactive"),
    extensionSeconds: settingsState.stageLimits.timeoutExtensionSeconds,
  }, {
    minimize: () => { hiddenOverlay = "ban"; renderCurrent(); }, restore: () => { hiddenOverlay = null; renderCurrent(); },
    selectOrder: selectBanOrder, selectHero: selectHeroBan, confirm: confirmBanSelection,
    requestConfirm: () => requestSelectionConfirmation("ban"), random: randomLegalBanChoice,
    extend: extendBanChoiceTime, forfeit: forfeitCurrentBanChoice,
  });
}

function createBanMainViewModel(): BanMainViewModel {
  if (!banSelectorState) throw new Error("ban view model requires ban selector state");
  if (banSelectorState.step === "order-choice") {
    return {
      kind: "order",
      chooserName: getTeamName(banSelectorState.chooserSide),
      selectedOrder: banSelectorState.selectedOrder,
      disabled: !canOperateBanOrderChoice(),
      broadcast: isBroadcastPortal(),
    };
  }
  return createBanHeroBoardViewModel();
}

function createBanLineupViewModel(side: Side): BanLineupViewModel {
  const lineups = banSelectorState ? confirmedLineups[banSelectorState.mapIndex] : null;
  const lineup = lineups?.[side] ?? null;
  const active = banSelectorState?.activeSide === side && banSelectorState.step !== "order-choice";
  const sideBan = banSelectorState && currentState ? currentState.maps[banSelectorState.mapIndex].bans[side] : null;
  const orderLabel = banSelectorState?.firstBanSide
    ? side === banSelectorState.firstBanSide ? "先手禁用" : "后手禁用"
    : "";

  return {
    side,
    teamName: getTeamName(side),
    active,
    orderLabel,
    pickedHero: sideBan ? { imageUrl: sideBan.imageUrl, name: getHeroDisplayName(sideBan.nameEn) } : undefined,
    slots: lineup ? lineupSlots.map((slot) => ({
      role: slot.role,
      label: slot.label,
      iconUrl: getRoleHeaderImageUrl(slot.role),
      value: lineup[slot.id] ?? "",
    })) : undefined,
  };
}

function createBanHeroBoardViewModel(): BanHeroBoardViewModel {
  return {
    kind: "heroes",
    roles: ["Tank", "Damage", "Support"].map((role) => ({
      key: normalizeKey(role),
      label: getHeroRoleLabel(role),
      iconUrl: getRoleHeaderImageUrl(role),
      heroes: getHeroesByRole(role).map(createBanHeroOptionViewModel),
    })),
  };
}

function createBanHeroOptionViewModel(hero: HeroCatalogItem): BanHeroOptionViewModel {
  const heroKey = getHeroKey(hero.nameEn);
  const selected = banSelectorState?.selectedHeroKey === heroKey;
  const availability = getHeroBanAvailability(hero);
  const disabled = !canOperateHeroBan() || !availability.available || Boolean(banSelectorState?.timedOut && !isAdminPortal());
  const bannedEarlierBySide = banSelectorState ? hasSideBannedHero(banSelectorState.activeSide, heroKey, banSelectorState.mapIndex) : false;
  const opponentCurrentBan = banSelectorState && currentState
    ? currentState.maps[banSelectorState.mapIndex].bans[getOppositeSide(banSelectorState.activeSide)]
    : null;
  const bannedByOpponentThisRound = Boolean(opponentCurrentBan && getHeroKey(opponentCurrentBan.nameEn) === heroKey);
  const states: BanHeroOptionViewModel["states"] = [];
  if (bannedEarlierBySide) states.push({ kind: "own-history", label: "本方本场历史禁用英雄" });
  if (bannedByOpponentThisRound) states.push({ kind: "opponent-current", label: "对手本场禁用英雄" });
  const disabledClass = [
    bannedEarlierBySide ? "hero-option-own-history" : "",
    bannedByOpponentThisRound ? "hero-option-opponent-current" : "",
    !availability.available && !states.length ? "hero-option-unavailable" : "",
  ].filter(Boolean).join(" ");
  const title = states.length
    ? `${hero.nameEn}（${states.map((state) => state.label).join("、")}）`
    : availability.available ? hero.nameEn : availability.reason;
  return {
    key: heroKey,
    name: getHeroDisplayName(hero.nameEn),
    imageUrl: hero.imageUrl,
    selected,
    disabled,
    disabledClass,
    states,
    title,
    broadcast: isBroadcastPortal(),
  };
}

function createScoreStageView(): PopWindowView {
  if (!currentState || !scoreSelectorState?.open) throw new Error("score_entry phase is missing score selector state");

  const mapIndex = scoreSelectorState.mapIndex;
  const map = currentState.maps[mapIndex];
  const mapName = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? `MAP ${scoreSelectorState.mapIndex + 1}`;
  const canConfirm = canConfirmScoreSelection();

  return createScoreView({
    visible: true,
    minimized: hiddenOverlay === "score" || isOverlayAutoMinimized("score"),
    mapIndex: scoreSelectorState.mapIndex,
    mapName,
    canMinimize: canMinimizeForeground(),
    mapSummary: createScoreMapSummaryViewModel(mapIndex, map),
    counting: isScoreConfirmationCounting(),
    pauses: [createScoreTeamPauseViewModel("left"), createScoreTeamPauseViewModel("right")],
    inputs: [createScoreInputViewModel("left"), createScoreInputViewModel("right")],
    status: getScoreStatusText(),
    broadcast: isBroadcastPortal(),
    submitted: Boolean(scoreSelectorState.submittedBy),
    canConfirm,
    confirmLabel: getScoreConfirmButtonLabel(),
    canReject: canRejectScoreSelection(),
  }, {
    minimize: () => minimizeAudienceOverlay("score"), restore: () => restoreAudienceOverlay("score"),
    update: updateScoreValue, confirm: confirmScoreSelection, reject: rejectScoreSelection, togglePause: toggleScoreTeamPause,
  });
}

function createScoreMapSummaryViewModel(mapIndex: number, map: MatchMap): ScoreMapSummaryViewModel {
  const hasSideChoice = Boolean(map.sideChoiceKind && map.selectedSide);
  const lineups = confirmedLineups[mapIndex] ?? null;
  const createTeam = (side: Side) => {
    const ban = map.bans[side];
    const lineup: Record<string, string> = lineups?.[side] ?? {};
    const sideChoice = hasSideChoice
      ? map.sideChoiceKind === "attack_defense"
        ? side === map.selectedSide ? "防守方" : "进攻方"
        : side === map.selectedSide ? "蓝色方" : "红色方"
      : null;

    return {
      side,
      teamName: getTeamName(side),
      sideChoice: sideChoice ?? undefined,
      banName: ban ? getHeroDisplayName(ban.nameEn) : "未禁用英雄",
      lineup: lineupSlots.map((slot) => ({ label: slot.label, value: lineup[slot.id]?.trim() || "未填写" })),
    };
  };
  return { teams: [createTeam("left"), createTeam("right")] };
}

function createScoreInputViewModel(side: Side): ScoreInputViewModel {
  if (!scoreSelectorState) {
    throw new Error("score input view model requires score selector state");
  }
  return {
    side,
    teamName: getTeamName(side),
    value: scoreSelectorState.values[side],
    disabled: !canEditScore(),
    broadcast: isBroadcastPortal(),
  };
}

function createResultStageView(): PopWindowView {
  if (!currentState || !restState?.open) throw new Error("post_map_rest phase is missing rest state");
  const map = currentState.maps[restState.mapIndex];
  const mapName = map.nameEn ? getDisplayMapName(map.nameEn) : map.nameZh ?? `MAP ${restState.mapIndex + 1}`;
  const seriesWinnerDecision = isSeriesWinnerDecision();
  return createResultRestView({
    visible: true,
    minimized: hiddenOverlay === "rest" || isOverlayAutoMinimized("rest", false),
    mapIndex: restState.mapIndex,
    mapName,
    canMinimize: canMinimizeForeground(),
    broadcast: isBroadcastPortal(),
    canSkip: canSkipRestPeriod(),
    buttonLabel: getRestButtonLabel(),
    seriesWinnerDecision,
    admin: isAdminPortal(),
    leftTeamName: getTeamName("left"),
    rightTeamName: getTeamName("right"),
  }, {
    minimize: () => minimizeAudienceOverlay("rest"),
    restore: () => restoreAudienceOverlay("rest"),
    skip: skipRestPeriod,
    chooseSeriesWinner: (winnerSide) => dispatchRoomViewOperation(
      createRoomOperation("admin", "series_winner", { winnerSide }),
    ),
  });
}

function isSeriesWinnerDecision(): boolean {
  const phase = authoritativeStore.status?.phase;
  const decision = phase?.data.decision;
  return Boolean(
    authoritativeStore.runtime?.awaitingAdminDecision
      && decision
      && typeof decision === "object"
      && (decision as Record<string, unknown>).decisionKind === "series_winner",
  );
}

function renderSettingsPanel(): string {
  const status = roomConfigState?.status ?? "draft";
  const locked = roomConfigState?.status === "locked";
  const readOnly = status !== "draft";
  const completed = getRoomViewPolicy()?.completed ?? false;
  const rollbackDisabled = isRollbackUnavailable();
  const source = roomConfigState?.source.type === "preset"
    ? `来自模板：${roomConfigState.source.presetName ?? roomConfigState.source.presetId ?? "未知模板"}`
    : roomConfigState?.source.type === "json"
      ? "来自 JSON 导入"
      : "房间独立配置";
  const liveControls = locked
    ? `
      <section class="settings-panel admin-live-panel" aria-label="管理员入口">
        <div class="config-editor-heading">
          <div><h2>管理员入口</h2><p>比赛阶段控制与回退</p></div>
        </div>
        <div class="settings-actions settings-actions-top">
          <span class="global-pause-total">全局累计暂停 ${formatGlobalPause()}</span>
          <button id="toggleGlobalPause" type="button" ${completed || !settingsState.globalPauseEnabled ? "disabled" : ""}>${pauseState.active ? "恢复全局时间" : "全局暂停"}</button>
          <button id="rollbackToConfig" class="danger-button" type="button" ${rollbackDisabled ? "disabled" : ""}>回退到赛前配置</button>
        </div>
        <div class="checkpoint-table admin-checkpoint-panel">
          <h3>回退到比赛阶段</h3>
          ${roomClient ? renderAuthoritativeHistoryPanel() : renderCheckpointRows()}
        </div>
      </section>
    `
    : "";
  return `
    ${liveControls}
    <section class="settings-panel">
      <div class="config-editor-heading">
        <div>
          <h2>比赛配置</h2>
          <p>${escapeHtml(source)}${readOnly ? "，已确认，仅供查看" : ""}</p>
        </div>
      </div>
      ${roomStarted && !locked ? `
        <div class="settings-actions settings-actions-top">
          <span class="global-pause-total">全局累计暂停 ${formatGlobalPause()}</span>
          <button id="toggleGlobalPause" type="button">${pauseState.active ? "恢复全局时间" : "全局暂停"}</button>
        </div>
        <div class="checkpoint-table">${roomClient ? renderAuthoritativeHistoryPanel() : renderCheckpointRows()}</div>
      ` : ""}
      <fieldset class="config-editor-fields" ${readOnly ? "disabled" : ""}>
        ${renderRoomPresetChooser()}
        ${renderSharedConfigFields()}
      </fieldset>
    </section>
  `;
}

function renderAuthoritativeHistoryPanel(): string {
  const currentRevision = authoritativeStore.status?.revision ?? 0;
  const mapCount = authoritativeStore.status?.match.maps.length ?? currentState?.maps.length ?? 0;
  const history = authoritativeHistory.filter((item) => item.revision !== currentRevision);
  const latestRevision = (mapIndex: number, phaseTypes: string[]): number | null => {
    const matches = history.filter((item) => item.phase.mapIndex === mapIndex && phaseTypes.includes(item.phase.type));
    return matches.length ? Math.max(...matches.map((item) => item.revision)) : null;
  };
  const stageDefinitions: Array<{ label: string; phases: string[]; enabled: boolean; unavailable: string }> = [
    {
      label: "选图",
      phases: ["map_pick"],
      enabled: settingsState.mapSelectionMode !== "fixed_map_order",
      unavailable: settingsState.mapSelectionMode === "fixed_map_order" ? "固定地图顺序不可回退到选图" : "尚未到达此阶段",
    },
    {
      label: "确认上人",
      phases: ["lineup_pick"],
      enabled: settingsState.rosterMode !== "skip",
      unavailable: settingsState.rosterMode === "skip" ? "当前配置已跳过上人" : "尚未到达此阶段",
    },
    {
      label: "确认 Ban",
      phases: ["ban_order", "ban_first"],
      enabled: settingsState.banEnabled,
      unavailable: settingsState.banEnabled ? "尚未到达此阶段" : "当前配置已关闭英雄 Ban",
    },
    { label: "录入比赛得分", phases: ["score_entry"], enabled: true, unavailable: "尚未到达此阶段" },
  ];
  const options = Array.from({ length: mapCount }, (_, mapIndex) => {
    const items = stageDefinitions.map((stage) => {
      const revision = stage.enabled ? latestRevision(mapIndex, stage.phases) : null;
      const reason = revision === null ? stage.unavailable : "";
      return `<option value="${revision ?? ""}" ${revision === null ? "disabled" : ""}>第 ${mapIndex + 1} 张地图的${stage.label}${reason ? `（${escapeHtml(reason)}）` : ""}</option>`;
    }).join("");
    return `<optgroup label="第 ${mapIndex + 1} 张地图">${items}</optgroup>`;
  }).join("");
  const hasTarget = history.some((item) => ["map_pick", "lineup_pick", "ban_order", "ban_first", "score_entry"].includes(item.phase.type));
  const globallyPaused = getRoomViewPolicy()?.globalPaused ?? false;
  const rollbackDisabled = isRollbackUnavailable();
  return `
    <p>请选择业务阶段。系统会自动使用当前分支中最新的可回退记录，不显示内部版本号。</p>
    <div class="settings-actions authoritative-history-actions">
      <select id="authoritativeHistoryRevision" aria-label="恢复检查点" ${hasTarget && !rollbackDisabled ? "" : "disabled"}>
        ${options || `<option value="">暂无可回退阶段</option>`}
      </select>
      <button id="rollbackToHistoryRevision" class="danger-button" type="button" ${hasTarget && !rollbackDisabled ? "" : "disabled"}>确认回退</button>
      <button id="refreshAuthoritativeHistory" type="button" ${globallyPaused ? "disabled" : ""}>刷新阶段</button>
    </div>
  `;
}

function createInteractiveRandomModel() {
  if (!interactiveRandomState) {
    throw new Error("interactive_random phase is missing state");
  }

  const state = interactiveRandomState;
  const resolved = state.resolvedSide !== null;
  const purposeLabel = state.purpose === "map_picker"
    ? "首次地图选择"
    : state.purpose === "opening_ban"
      ? "禁用首次先手方"
      : "攻防选择方";
  const leftChoice = state.choices.left ?? 0;
  const rightChoice = state.choices.right ?? 0;

  const teamModel = (side: Side) => {
    const selected = state.choices[side];
    const submitted = state.submitted?.[side] ?? selected !== null;
    return {
      label: side === "left" ? "队伍1" : "队伍2",
      name: getTeamName(side),
      selected,
      submitted,
      editable: !state.resolvedSide && !submitted
        && (portalConfig.side === side || (isAdminPortal() && isAwaitingAdminDecision())),
      broadcast: isBroadcastPortal(),
      resolved,
      actionLocked: isRoomActionLocked(),
    };
  };
  return {
    visible: true,
    minimized: hiddenOverlay === (state.purpose === "opening_ban" ? "ban" : "map"),
    canMinimize: canMinimizeForeground(),
    purposeLabel,
    purpose: state.purpose,
    resolved,
    resolvedTeamName: state.resolvedSide ? getTeamName(state.resolvedSide) : "",
    leftChoice,
    rightChoice,
    leftTeam: teamModel("left"),
    rightTeam: teamModel("right"),
    adminDecision: isAdminPortal() && isAwaitingAdminDecision(),
    canConfirmAdminDecision: isAdminPortal()
      && isAwaitingAdminDecision()
      && (["left", "right"] as Side[]).every((side) => state.submitted[side] || state.choices[side] !== null),
  };
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
            <div><strong>${escapeHtml(preset.name)}</strong><span>版本 ${preset.revision}，更新于 ${formatTimestamp(preset.updatedAt)}</span></div>
            <div>
              <button class="edit-config-preset" data-preset-id="${escapeHtml(preset.id)}" type="button">GUI 编辑</button>
              <button class="duplicate-config-preset" data-preset-id="${escapeHtml(preset.id)}" type="button">复制模板</button>
              <button class="copy-config-preset-json" data-preset-id="${escapeHtml(preset.id)}" type="button">复制 JSON</button>
              <button class="delete-config-preset" data-preset-id="${escapeHtml(preset.id)}" type="button"
                ${adminSettings?.defaultPresetId === preset.id ? "disabled" : ""}
                title="${adminSettings?.defaultPresetId === preset.id ? "请先切换新房间默认模板" : "删除模板"}">删除</button>
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
    if (!confirmDiscardGlobalPresetChanges()) return;
    selectedGlobalPresetId = "__new__";
    globalPresetDraftMeta = { name: "" };
    settingsState = structuredClone(defaultSettings);
    globalPresetDirty = false;
    renderGlobalAdminPage();
  });
  document.getElementById("cancelGlobalPresetEdit")?.addEventListener("click", () => {
    if (!confirmDiscardGlobalPresetChanges()) return;
    selectedGlobalPresetId = null;
    globalPresetDraftMeta = null;
    globalPresetDirty = false;
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
      if (!confirmDiscardGlobalPresetChanges()) return;
      selectedGlobalPresetId = button.dataset.presetId ?? null;
      const preset = configPresets.find((item) => item.id === selectedGlobalPresetId);
      globalPresetDraftMeta = preset ? { name: preset.name } : null;
      if (preset) {
        settingsState = settingsFromStoredConfig(preset.config);
      }
      globalPresetDirty = false;
      renderGlobalAdminPage();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".delete-config-preset").forEach((button) => {
    button.addEventListener("click", () => void deleteGlobalPreset(button.dataset.presetId ?? ""));
  });
  app.querySelectorAll<HTMLButtonElement>(".duplicate-config-preset").forEach((button) => {
    button.addEventListener("click", () => void duplicateGlobalPreset(button.dataset.presetId ?? ""));
  });
  app.querySelectorAll<HTMLButtonElement>(".copy-config-preset-json").forEach((button) => {
    button.addEventListener("click", () => void copyGlobalPresetJson(button.dataset.presetId ?? ""));
  });

  if (selectedGlobalPresetId) {
    initializeConfigEditorControls();
    bindMapPoolDragEvents();
    bindModeOrderDragEvents();
    bindRosterEditorControls();
    ["matchFormat", "mapSelectionMode", "initialPriorityPolicy", "rosterMode", "fixedFirstMapEnabled", "firstMapSideChoiceEnabled", "symmetricSideChoiceEnabled", "banEnabled", "banOrderPolicy", "teamPauseEnabled", "rollbackEnabled"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        globalPresetDirty = true;
        captureGlobalPresetDraftMeta();
        readSettingsFromForm();
        renderGlobalAdminPage();
      });
    });
    app.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".global-preset-editor input, .global-preset-editor select, .global-preset-editor textarea")
      .forEach((control) => {
        control.addEventListener("input", () => { globalPresetDirty = true; });
        control.addEventListener("change", () => { globalPresetDirty = true; });
      });
  }
}

function confirmDiscardGlobalPresetChanges(): boolean {
  return !globalPresetDirty || window.confirm("当前模板有未保存的修改，确认放弃这些修改？");
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
    ["mapTimeoutPolicy", settingsState.mapTimeoutPolicy],
    ["firstSideChoicePolicy", settingsState.firstSideChoicePolicy],
    ["subsequentSideChoicePolicy", settingsState.subsequentSideChoicePolicy],
    ["rosterMode", settingsState.rosterMode],
    ["lineupTimeoutPolicy", settingsState.lineupTimeoutPolicy],
    ["firstBanPolicy", settingsState.firstBanPolicy],
    ["openingSidePolicy", settingsState.openingSidePolicy],
    ["banTimeoutPolicy", settingsState.banTimeoutPolicy],
    ["scoreReportMode", settingsState.scoreReportMode],
    ["initialPriorityPolicy", settingsState.initialPriorityPolicy],
    ["subsequentPriorityPolicy", settingsState.subsequentPriorityPolicy],
    ["mapPickTimeoutPolicy", settingsState.mapPickTimeoutPolicy],
    ["interactiveRandomMissingInputPolicy", settingsState.interactiveRandomMissingInputPolicy],
    ["sideChooserRelation", settingsState.sideChooserRelation],
    ["sideTimeoutPolicy", settingsState.sideTimeoutPolicy],
    ["banAdvantageRelation", settingsState.banAdvantageRelation],
    ["banOrderPolicy", settingsState.banOrderPolicy],
    ["banOrderTimeoutPolicy", settingsState.banOrderTimeoutPolicy],
    ["banActionTimeoutPolicy", settingsState.banActionTimeoutPolicy],
    ["scoreConfirmationTimeoutPolicy", settingsState.scoreConfirmationTimeoutPolicy],
  ];
  values.forEach(([id, value]) => {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) {
      select.value = value;
    }
  });
  bindAdminSwitchLabels();
}

function bindAdminSwitchLabels(): void {
  app.querySelectorAll<HTMLInputElement>(".admin-switch input[type=checkbox]").forEach((input) => {
    const switchLabel = input.closest<HTMLElement>(".admin-switch");
    const statusLabel = switchLabel?.querySelector<HTMLElement>("b");
    if (!switchLabel || !statusLabel) return;

    const updateStatusLabel = () => {
      statusLabel.textContent = input.checked
        ? (switchLabel.dataset.checkedLabel ?? "是")
        : (switchLabel.dataset.uncheckedLabel ?? "否");
    };
    input.addEventListener("change", updateStatusLabel);
    updateStatusLabel();
  });
}

function renderAdminSwitch(
  id: string,
  checked: boolean,
  checkedLabel: string,
  uncheckedLabel: string,
): string {
  return `<label class="admin-switch" data-checked-label="${escapeHtml(checkedLabel)}" data-unchecked-label="${escapeHtml(uncheckedLabel)}"><input id="${escapeHtml(id)}" type="checkbox" ${checked ? "checked" : ""} /><span></span><b>${escapeHtml(checked ? checkedLabel : uncheckedLabel)}</b></label>`;
}

function bindRosterEditorControls(): void {
  app.querySelectorAll<HTMLButtonElement>(".add-roster-member").forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.rosterSide as Side | undefined;
      const list = side ? app.querySelector<HTMLElement>(`.visual-roster-items[data-roster-side="${side}"]`) : null;
      if (side && list) {
        globalPresetDirty = true;
        list.insertAdjacentHTML("beforeend", renderRosterMemberInput(side, ""));
        list.lastElementChild?.querySelector<HTMLButtonElement>(".remove-roster-member")?.addEventListener("click", (event) => {
          globalPresetDirty = true;
          (event.currentTarget as HTMLElement).closest(".roster-member-row")?.remove();
        });
      }
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".remove-roster-member").forEach((button) => {
    button.addEventListener("click", () => {
      globalPresetDirty = true;
      button.closest(".roster-member-row")?.remove();
    });
  });
}

async function saveGlobalPresetFromForm(): Promise<void> {
  if (!globalAdminHash || !readSettingsFromForm()) {
    return;
  }
  const validationErrors = validateSettingsForSubmit();
  if (validationErrors.length > 0) {
    showLocalNotice(validationErrors.join("；"));
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
      body: JSON.stringify({ schemaVersion: 2, ...(id ? { id } : {}), name, config: legacyConfigToCanonical(settingsState as unknown as Record<string, unknown>, stableId, stableId) }),
    },
  );
  if (!response.ok) {
    showLocalNotice(await getConfigErrorMessage(response));
    return;
  }
  const preset = await response.json() as ConfigPreset;
  selectedGlobalPresetId = preset.id;
  globalPresetDraftMeta = null;
  globalPresetDirty = false;
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
  if (!confirmDiscardGlobalPresetChanges()) {
    return;
  }
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
  globalPresetDirty = false;
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

function getGlobalPresetCopyName(sourceName: string): string {
  const existingNames = new Set(configPresets.map((preset) => preset.name.trim().toLocaleLowerCase()));
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? " 副本" : ` 副本 ${index}`;
    const prefix = sourceName.trim().slice(0, Math.max(1, 80 - suffix.length)).trimEnd();
    const candidate = `${prefix}${suffix}`;
    if (!existingNames.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }
  return `模板副本 ${Date.now()}`.slice(0, 80);
}

async function duplicateGlobalPreset(presetId: string): Promise<void> {
  const source = configPresets.find((preset) => preset.id === presetId);
  if (!globalAdminHash || !source || !confirmDiscardGlobalPresetChanges()) {
    return;
  }
  const name = getGlobalPresetCopyName(source.name);
  const response = await fetch(`/api/admin/${encodeURIComponent(globalAdminHash)}/config-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 2,
      name,
      description: source.description,
      config: source.config,
    }),
  });
  if (!response.ok) {
    showLocalNotice(await getConfigErrorMessage(response));
    return;
  }
  const preset = await response.json() as ConfigPreset;
  selectedGlobalPresetId = preset.id;
  globalPresetDraftMeta = null;
  globalPresetDirty = false;
  await loadGlobalAdminData();
  renderGlobalAdminPage(`模板“${preset.name}”已复制，可继续编辑。`);
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
  const currentPresetId = roomConfigState?.source.type === "preset" ? roomConfigState.source.presetId ?? "" : "";
  return `
    <section class="settings-section preset-chooser">
      <h3>从默认模板开始</h3>
      <p>模板会复制到本房间，之后可以自由调整。</p>
      <div class="settings-actions">
        <select id="roomPresetSelect">
          ${configPresets.map((preset) => `<option value="${escapeHtml(preset.id)}" ${preset.id === currentPresetId ? "selected" : ""}>${escapeHtml(preset.name)}</option>`).join("")}
        </select>
        <button id="applyRoomPreset" type="button">应用模板</button>
        <button id="resetBuiltinConfig" type="button">恢复网站默认配置</button>
        <button id="showRoomJsonImport" type="button">从 JSON 导入模板</button>
      </div>
      <div class="room-json-import-inline" id="roomJsonImportInline" hidden>
        <textarea id="roomConfigJson" placeholder="粘贴完整模板 JSON"></textarea>
        <button id="importRoomConfigJson" type="button">校验并导入</button>
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
          "队伍能否修改自己队伍的名称",
          "开启后，队伍可在准备前确认自己的队伍名称。",
          renderAdminSwitch("teamsCanEditOwnName", settingsState.teamsCanEditOwnName, "是", "否"),
        )}
        ${renderAdminSettingRow(
          "以默认配置开始",
          "开启后，两支队伍均准备完毕时自动使用当前房间配置开始比赛。",
          renderAdminSwitch("startWithDefaultConfig", settingsState.startWithDefaultConfig, "是", "否"),
        )}
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
    ${renderPauseRuleSettingsPanel()}
    ${renderRollbackRuleSettingsPanel()}
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
  const showMapPool = true;
  const openAttribute = appMode === "global-admin" || openConfigSections.has("map") ? "open" : "";

  return `
    <details class="settings-section admin-config-section" data-config-section="map" ${openAttribute}>
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
        ${mode !== "fixed_map_order" ? renderFixedFirstMapSetting() : ""}
        ${renderAdminSettingRow(
          "初始优先选择方",
          "首次出现选图、主动选边或 Ban 优势方消费者时生成一次，并在系列赛内保持不变。",
          `<select id="initialPriorityPolicy">
            <option value="interactive_random">交互随机</option>
            <option value="system_random">系统随机</option>
            <option value="left">队伍1</option>
            <option value="right">队伍2</option>
          </select>`,
        )}
        ${renderAdminSettingRow(
          "后续优先选择方",
          "按最近一张非平局地图确定；此前全部平局时沿用初始优先选择方。",
          `<select id="subsequentPriorityPolicy">
            <option value="previous_loser">最近非平局地图败者</option>
            <option value="previous_winner">最近非平局地图胜者</option>
          </select>`,
        )}
        ${settingsState.initialPriorityPolicy === "interactive_random" ? renderAdminSettingRow(
          "交互随机缺席策略",
          "互动随机超时时如何补齐未提交方的输入。",
          `<select id="interactiveRandomMissingInputPolicy">
            <option value="use_zero">未提交方按 0</option>
            <option value="server_random">服务端随机 0/1</option>
            <option value="admin_decision">管理员裁定</option>
          </select>`,
        ) : ""}
        ${mode === "first_mode_then_unique_mode" ? renderFirstMapModeSetting() : ""}
        ${renderAdminSettingRow("地图选择时间", "固定地图顺序下保留该值但不生效。", `<input id="mapSelectSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.mapSelectSeconds}" ${settingsState.mapSelectionMode === "fixed_map_order" ? "disabled" : ""} />`)}
        ${mode !== "fixed_map_order" ? renderAdminSettingRow(
          "地图选择超时",
          "设置地图选择超时后的处理方式。",
          `<select id="mapPickTimeoutPolicy">
            <option value="retry_after_delay">延迟时间后再次选择</option>
            <option value="random_legal_map">随机合法地图</option>
            <option value="forfeit_map">本张地图判负</option>
            <option value="admin_decision">管理员裁定</option>
          </select>`,
        ) : ""}
        ${renderAdminSettingRow("交互随机时间", "双方提交交互随机输入的时限，单位为秒。", `<input id="interactiveRandomSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.interactiveRandomSeconds}" />`)}
        ${renderAdminSettingRow(
          "对称地图选择阵营",
          "开启后，占领要点、闪点作战和机动推进也会选择蓝色方与红色方；攻击/护送和运载目标始终选择攻防。",
          renderAdminSwitch("symmetricSideChoiceEnabled", settingsState.symmetricSideChoiceEnabled, "已开启", "已关闭"),
        )}
        ${renderAdminSettingRow(
          "首图允许选择攻防/红蓝方",
          "所有地图策略通用；关闭时队伍1固定蓝方/先防守，队伍2固定红方/先进攻。",
          renderAdminSwitch("firstMapSideChoiceEnabled", settingsState.firstMapSideChoiceEnabled, "已开启", "已关闭"),
        )}
        ${renderAdminSettingRow(
          "主动选边方",
          "发生主动选边时，由优先选择方或非优先选择方操作。",
          `<select id="sideChooserRelation">
            <option value="priority">优先选择方</option>
            <option value="non_priority">非优先选择方</option>
          </select>`,
        )}
        ${renderAdminSettingRow("选边时间", "选择攻防或红蓝方的时限，单位为秒。", `<input id="sidePickSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.sidePickSeconds}" />`)}
        ${renderAdminSettingRow(
          "选边超时策略",
          "选择蓝色/防守方为默认策略。",
          `<select id="sideTimeoutPolicy">
            <option value="random_legal_choice">随机合法选项</option>
            <option value="chooser_blue_defense">选择蓝色/防守方</option>
            <option value="chooser_red_attack">选择红色/进攻方</option>
            <option value="admin_decision">管理员裁定</option>
            <option value="retry_after_delay">延迟时间后再次选择</option>
            <option value="forfeit_map">本张地图判负</option>
          </select>`,
        )}
      </div>
      ${mode === "strict_mode_order" ? renderModeOrderSetting() : ""}
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
    </div>
  `;
}

function renderFixedFirstMapSetting(): string {
  const options = getAllCatalogMapChoices();
  return renderAdminSettingRow(
        "固定第一张地图",
        "首次地图为固定地图。",
        `<div class="fixed-first-map-control">${renderAdminSwitch("fixedFirstMapEnabled", settingsState.fixedFirstMapEnabled, "已开启", "已关闭")}<select id="fixedFirstMapName" ${settingsState.fixedFirstMapEnabled ? "" : "disabled"}>
          ${options.map((choice) => `<option value="${escapeHtml(choice.nameEn)}" ${normalizeKey(choice.nameEn) === normalizeKey(settingsState.fixedFirstMapName) ? "selected" : ""}>${escapeHtml(getModeLabel(choice.mode))} - ${escapeHtml(getMapNameZh(choice.nameEn))}</option>`).join("")}
        </select></div>`,
      );
}

function createScoreTeamPauseViewModel(side: Side): ScoreTeamPauseViewModel {
  if (!scoreSelectorState) {
    throw new Error("score pause view model requires score selector state");
  }

  const teamPause = scoreSelectorState.teamPauses[side];
  const canControl = !scoreSelectorState.submittedBy
    && !pauseState.active
    && (isAdminPortal() || portalConfig.side === side);
  return {
    side,
    active: teamPause.active,
    count: teamPause.count,
    mapTotal: formatDurationMs(getTeamPauseTotalMs(side)),
    matchTotal: formatDurationMs(getMatchTeamPauseTotalMs(side)),
    current: formatDurationMs(getTeamPauseCurrentMs(side)),
    broadcast: isBroadcastPortal(),
    canControl,
  };
}

function getSelectionConfirmationTitle(): string {
  const kind = selectionConfirmationState?.kind;
  return kind === "map"
    ? "确认选择地图"
    : kind === "lineup"
      ? "确认上场成员"
      : kind === "room-config-rollback"
        ? "回退到赛前配置"
        : kind === "room-preset-import"
          ? "导入房间模板"
      : banSelectorState?.step === "order-choice"
        ? "确认禁用顺序"
        : "确认禁用英雄";
}

function usesInlineSelectionConfirmationSummary(): boolean {
  return selectionConfirmationState?.kind === "map"
    || selectionConfirmationState?.kind === "lineup"
    || (selectionConfirmationState?.kind === "ban" && banSelectorState?.step !== "order-choice");
}

function getSelectionConfirmationDisplayTitle(): string {
  const kind = selectionConfirmationState?.kind;
  if (kind === "lineup") {
    const sides = isAdminPortal() ? (["left", "right"] as Side[]) : portalConfig.side ? [portalConfig.side] : [];
    return sides.length === 1 ? `${getTeamName(sides[0])}确认上场成员` : "确认上场成员";
  }
  const title = getSelectionConfirmationTitle();
  return usesInlineSelectionConfirmationSummary() ? `${title} ${getSelectionConfirmationSummary()}` : title;
}

function getSelectionConfirmationHeaderDetails(): string[] | undefined {
  if (selectionConfirmationState?.kind !== "lineup") return undefined;
  const lines = getSelectionConfirmationSummary().split("\n").filter(Boolean);
  return isAdminPortal() ? lines : lines.slice(1);
}

function getSelectionConfirmationSummary(): string {
  if (!selectionConfirmationState) return "";
  const kind = selectionConfirmationState.kind;
  let summary = "";

  if (kind === "room-config-rollback") {
    summary = "此操作会清空地图、阵容、英雄禁用、比分和比赛进度，并重新开放配置。";
  } else if (kind === "room-preset-import") {
    summary = "导入模板会替换当前房间配置草稿。";
  } else if (kind === "map") {
    const choice = findMapChoiceByKey(mapSelectorState?.selectedMapKey ?? null);
    summary = choice ? getDisplayMapName(choice.nameEn) : "尚未选择地图";
  } else if (kind === "ban") {
    if (banSelectorState?.step === "order-choice") {
      summary = getBanSelectionSummary();
    } else {
      const hero = findHeroByKey(banSelectorState?.selectedHeroKey ?? null);
      summary = hero ? getHeroDisplayName(hero.nameEn) : "尚未选择英雄";
    }
  } else if (lineupSelectorState) {
    const sides = isAdminPortal() ? (["left", "right"] as Side[]) : portalConfig.side ? [portalConfig.side] : [];
    summary = sides.map((side) => {
      const members = lineupSlots.map((slot) => `${slot.label}：${lineupSelectorState!.values[side][slot.id] || "未填写"}`);
      return `${getTeamName(side)}\n${members.join("\n")}`;
    }).join("\n\n");
  }

  return summary;
}

function cancelSelectionConfirmation(): void {
  selectionConfirmationState = null;
  renderCurrent();
}

function acceptSelectionConfirmation(): void {
  const pendingConfirmation = selectionConfirmationState;
  const kind = pendingConfirmation?.kind;
  selectionConfirmationState = null;
  if (kind === "map") confirmSelectedMap();
  if (kind === "lineup") confirmLineups();
  if (kind === "ban") confirmBanSelection();
  if (kind === "room-config-rollback") void performRollbackRoomToConfig();
  if (kind === "room-preset-import") void performApplyRoomPreset(pendingConfirmation?.presetId ?? "");
}

function requestSelectionConfirmation(kind: SelectionConfirmationKind): void {
  const allowed = kind === "room-config-rollback" || kind === "room-preset-import"
    ? isAdminPortal() && !isRoomActionLocked()
    : kind === "map"
    ? canOperateMapSelection()
    : kind === "lineup"
      ? canConfirmLineupSelection()
      : canConfirmBanSelection();
  if (!allowed || isRoomActionLocked()) return;
  selectionConfirmationState = { kind };
  renderCurrent();
}

function applyAuthoritativeState(status: AuthoritativeStatus, runtime: AuthoritativeRuntime, shouldRender: boolean): void {
  const legacyConfig = canonicalConfigToLegacy(
    status.config,
    resolveCanonicalMapName,
    resolveCanonicalModeName,
  ) as unknown as SettingsState;
  settingsState = mergeSettings(defaultSettings, legacyConfig);
  const autoConfigurationOpen = status.lifecycle === "preparing" && Boolean(status.config.startWithDefaultConfig);
  roomConfigState = {
    status: autoConfigurationOpen ? "draft" : status.phase.type === "configuring" ? "draft" : status.phase.type === "waiting_ready" ? "ready" : "locked",
    revision: status.revision,
    source: { type: "manual" },
    value: settingsState,
    confirmedAt: null,
    lockedAt: null,
  };

  const matchState: MatchState = {
    roomCode: status.roomId,
    matchName: String(status.config.matchName ?? ""),
    phase: status.lifecycle === "completed" ? "completed" : status.lifecycle === "running" ? "after" : "before",
    currentCountdownSeconds: Math.ceil(runtime.remainingTimeMs / 1000),
    currentOperation: status.phase.type,
    teams: {
      left: { ...status.match.teams.left },
      right: { ...status.match.teams.right },
    },
    maps: status.match.maps.map(authoritativeMapToLegacy),
  };

  const phase = status.phase;
  const index = phase.mapIndex ?? 0;
  const firstBanSide = index < status.match.maps.length ? status.match.maps[index].bans.firstBanSide : null;
  const lineupValues = {
    left: lineupToLegacy(runtime.lineupSubmissions.left ?? status.match.maps[index]?.lineups?.left ?? {}),
    right: lineupToLegacy(runtime.lineupSubmissions.right ?? status.match.maps[index]?.lineups?.right ?? {}),
  };
  const waitingForFirstScore = phase.type === "score_entry" && runtime.scoreProposal === null;
  const selectionTimedOut = !waitingForFirstScore && (
    runtime.awaitingAdminDecision
    || (runtime.timedOut && runtime.remainingTimeMs <= 0)
  );
  const viewSnapshot: RoomViewSnapshot = {
    roomStarted: status.lifecycle !== "preparing",
    currentState: matchState,
    settingsState,
    confirmedLineups: Object.fromEntries(status.match.maps.filter((map) => map.lineups).map((map) => [
      map.index,
      { left: lineupToLegacy(map.lineups!.left), right: lineupToLegacy(map.lineups!.right) },
    ])),
    mapSelectorState: phase.type === "map_pick" && phase.actorSide !== "both" && phase.actorSide
      ? { open: true, minimized: false, selectedMapKey: null, targetMapIndex: index, pickerSide: phase.actorSide, timedOut: selectionTimedOut }
      : null,
    sideSelectorState: phase.type === "side_pick"
      ? {
        open: true,
        mapIndex: index,
        pickerSide: String(phase.data.chooserSide ?? phase.actorSide) as Side,
        choiceKind: String(phase.data.choiceKind ?? "color") as "attack_defense" | "color",
        selectedSide: null,
      }
      : null,
    lineupSelectorState: phase.type === "lineup_pick"
      ? {
        open: true,
        mapIndex: index,
        values: lineupValues,
        ready: runtime.lineupSubmitted
          ? { ...runtime.lineupSubmitted }
          : { left: runtime.lineupSubmissions.left !== null, right: runtime.lineupSubmissions.right !== null },
        timedOut: selectionTimedOut,
      }
      : null,
    banSelectorState: ["ban_order", "ban_first", "ban_second"].includes(phase.type)
      ? {
        open: true,
        mapIndex: index,
        step: phase.type === "ban_order" ? "order-choice" : phase.type === "ban_first" ? "first-ban" : "second-ban",
        chooserSide: String(phase.data.chooserSide ?? phase.actorSide ?? firstBanSide ?? "left") as Side,
        activeSide: String(phase.actorSide ?? firstBanSide ?? "left") as Side,
        firstBanSide,
        selectedOrder: null,
        selectedHeroKey: null,
        timedOut: selectionTimedOut,
      }
      : null,
    scoreSelectorState: phase.type === "score_entry"
      ? {
        open: true,
        mapIndex: index,
        values: runtime.scoreProposal
          ? { left: String(runtime.scoreProposal.score.left), right: String(runtime.scoreProposal.score.right) }
          : { left: "", right: "" },
        submittedBy: runtime.scoreProposal?.submittedBy ?? null,
        rejectedBy: runtime.scoreProposal?.rejectedBy ?? null,
        timedOut: selectionTimedOut,
        teamPauses: {
          left: authoritativeTeamPause(runtime, "left", scoreSelectorState?.teamPauses.left),
          right: authoritativeTeamPause(runtime, "right", scoreSelectorState?.teamPauses.right),
        },
        countdownPauseStartedAt: null,
      }
      : null,
    matchTeamPauseTotals: {
      left: Math.max(0, runtime.pause.scoreTeams.left.matchTotalMs - runtime.pause.scoreTeams.left.phaseTotalMs),
      right: Math.max(0, runtime.pause.scoreTeams.right.matchTotalMs - runtime.pause.scoreTeams.right.phaseTotalMs),
    },
    restState: phase.type === "pre_start_rest" || phase.type === "post_map_rest"
      ? { open: true, mapIndex: index, skipReady: { ...runtime.restSkip } }
      : null,
    pauseState: {
      active: runtime.pause.global.active,
      startedAt: runtime.pause.global.active
        ? (pauseState.active && pauseState.startedAt ? pauseState.startedAt : Date.now())
        : null,
      totalPausedMs: runtime.pause.global.totalMs,
      matchTotalPausedMs: runtime.pause.global.totalMs,
      collapsed: pauseState.collapsed,
    },
    teamAckNotice: null,
    firstMapPickerSide: status.match.decisions.firstMapPickerSide ?? "left",
    interactiveRandomState: phase.type === "interactive_random"
      ? {
        purpose: String(phase.data.purpose) as InteractiveRandomPurpose,
        mapIndex: index,
        choices: {
          ...(runtime.interactiveRandom ?? {
            left: runtime.interactiveRandomResult?.left ?? null,
            right: runtime.interactiveRandomResult?.right ?? null,
          }),
        },
        submitted: runtime.interactiveRandomSubmitted ?? {
          left: (runtime.interactiveRandom?.left ?? runtime.interactiveRandomResult?.left ?? null) !== null,
          right: (runtime.interactiveRandom?.right ?? runtime.interactiveRandomResult?.right ?? null) !== null,
        },
        resolvedSide: runtime.interactiveRandomResult?.resultSide ?? null,
      }
      : null,
    interactiveRandomResults: {},
  };
  applyAuthoritativeRuntime(runtime);
  applyRoomViewSnapshot(viewSnapshot, shouldRender);
  lastRuntimeStructure = runtimeStructureSignature(runtime);
}

function applyAuthoritativeRuntime(runtime: AuthoritativeRuntime): void {
  roomPresence = {
    A: runtime.presence.A,
    B: runtime.presence.B,
    C: runtime.presence.C,
  };
  const globalPauseActive = runtime.pause.global.active;
  const globalPauseStartedAt = globalPauseActive
    ? (pauseState.active && pauseState.startedAt ? pauseState.startedAt : Date.now())
    : null;
  pauseState = {
    ...pauseState,
    active: globalPauseActive,
    startedAt: globalPauseStartedAt,
    totalPausedMs: runtime.pause.global.totalMs,
    matchTotalPausedMs: runtime.pause.global.totalMs,
  };
  matchTeamPauseTotals = {
    left: Math.max(0, runtime.pause.scoreTeams.left.matchTotalMs - runtime.pause.scoreTeams.left.phaseTotalMs),
    right: Math.max(0, runtime.pause.scoreTeams.right.matchTotalMs - runtime.pause.scoreTeams.right.phaseTotalMs),
  };
}

function authoritativeMapToLegacy(map: AuthoritativeStatus["match"]["maps"][number]): MatchMap {
  const catalog = map.mapId ? findCatalogMapByStableId(map.mapId) : null;
  const bans: Record<Side, HeroBan | null> = {
    left: map.bans.leftHeroId ? authoritativeHeroBan(map.bans.leftHeroId) : null,
    right: map.bans.rightHeroId ? authoritativeHeroBan(map.bans.rightHeroId) : null,
  };
  const score = map.resultType === "forfeit" && map.winnerSide
    ? map.winnerSide === "left"
      ? { left: "W" as const, right: "FF" as const }
      : { left: "FF" as const, right: "W" as const }
    : map.score
      ? { ...map.score }
      : { left: null, right: null };
  return {
    id: map.mapId ?? `tbd-${map.index + 1}`,
    mode: catalog?.mode ?? (map.modeId ? resolveCanonicalModeName(map.modeId) : null),
    modeIconUrl: catalog?.modeIconUrl ?? null,
    nameZh: catalog ? getMapNameZh(catalog.nameEn) : null,
    nameEn: catalog?.nameEn ?? null,
    status: map.status === "pending" ? "tbd" : map.status === "completed" || map.status === "forfeited" ? "completed" : "after",
    imageUrl: catalog?.imageUrl ?? "/static/placeholders/map-blank.svg",
    score,
    bans,
    firstBanSide: map.bans.firstBanSide,
    sideChoiceKind: map.sideChoice?.kind === "none" ? null : map.sideChoice?.kind ?? null,
    selectedSide: map.sideChoice?.selectedSide ?? null,
  };
}

function authoritativeHeroBan(heroId: string): HeroBan {
  const hero = mapCatalogState.heroes.find((entry) => stableId(entry.nameEn) === heroId);
  return hero ? createHeroBan(hero) : { hero: heroId, nameEn: heroId, role: "", imageUrl: "/static/placeholders/hero-blank.svg" };
}

function findCatalogMapByStableId(mapId: string): MapChoice | null {
  for (const [mode, maps] of Object.entries(mapCatalogState.maps)) {
    const item = maps.find((candidate) => stableId(candidate.nameEn) === mapId);
    if (item) return { ...item, mode, key: `${mode}:${item.nameEn}`, modeIconUrl: mapCatalogState.modeIcons[mode]?.imageUrl ?? null };
  }
  return null;
}

function resolveCanonicalMapName(mapId: string): string {
  return findCatalogMapByStableId(mapId)?.nameEn ?? mapId.replaceAll("_", " ");
}

function resolveCanonicalModeName(modeId: string): string {
  return mapCatalogState.modes.find((mode) => stableId(mode) === modeId) ?? modeId.replace(/^./, (value) => value.toUpperCase());
}

function renderFixedMapOrderSetting(): string {
  const fixedOrder = parseFixedMapOrder();
  const options = getAllCatalogMapChoices();

  return `
    <div class="fixed-map-order-setting">
      <span>固定地图顺序</span>
      ${fixedOrder.length < settingsState.stageCount ? `<p class="settings-hint settings-warning">当前仅配置 ${fixedOrder.length} 张地图；允许保存，但顺序耗尽且系列赛未结束时将进入管理员裁定系列赛胜方。</p>` : ""}
      ${Array.from({ length: settingsState.stageCount }, (_, index) => {
        const current = fixedOrder[index] ?? "";

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
  const openAttribute = appMode === "global-admin" || openConfigSections.has("roster") ? "open" : "";

  return `
    <details class="settings-section admin-config-section" data-config-section="roster" ${openAttribute}>
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
        ${renderAdminSettingRow("上场成员选择时间", "跳过上人时保留该值但不生效。", `<input id="playerSelectSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.playerSelectSeconds}" ${settingsState.rosterMode === "skip" ? "disabled" : ""} />`)}
        ${renderAdminSettingRow(
          "上场选择超时",
          "设置选择上场成员超时后的处理方式。",
          `<select id="lineupTimeoutPolicy" ${settingsState.rosterMode === "skip" ? "disabled" : ""}>
            <option value="retry_after_delay">延迟时间后再次选择</option>
            <option value="forfeit_map">本张地图判负</option>
            <option value="admin_decision">管理员裁定</option>
          </select>`,
        )}
      </div>
      ${settingsState.rosterMode === "preset_only" ? `<div class="visual-rosters">
        ${renderRosterListSetting("left", rosters.left)}
        ${renderRosterListSetting("right", rosters.right)}
      </div>` : ""}
    </details>
  `;
}

function renderBanRuleSettingsPanel(): string {
  const openAttribute = appMode === "global-admin" || openConfigSections.has("ban") ? "open" : "";

  return `
    <details class="settings-section admin-config-section" data-config-section="ban" ${openAttribute}>
      <summary>禁用规则</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "是否启用禁用规则",
          "关闭后将跳过全部英雄禁用步骤。",
          renderAdminSwitch("banEnabled", settingsState.banEnabled, "已开启", "已关闭"),
        )}
        <fieldset class="ban-rule-controls" ${settingsState.banEnabled ? "" : "disabled"}>
        ${renderAdminSettingRow(
          "Ban 优势方",
          "设置由优先选择方还是非优先选择方取得 Ban 顺序优势。",
          `<select id="banAdvantageRelation"><option value="priority">优先选择方</option><option value="non_priority">非优先选择方</option></select>`,
        )}
        ${renderAdminSettingRow(
          "Ban 顺序规则",
          "优势方可选择先后手，或固定由优势方自动先手。",
          `<select id="banOrderPolicy"><option value="advantage_chooses">优势方选择先后手</option><option value="advantage_must_first">优势方必须先手</option></select>`,
        )}
        ${renderAdminSettingRow("先后禁用选择时间", "优势方选择先后顺序的时间，单位为秒。", `<input id="firstBanChoiceSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.firstBanChoiceSeconds}" ${settingsState.banOrderPolicy === "advantage_chooses" ? "" : "disabled"} />`)}
        ${renderAdminSettingRow("先手禁用时间", "先手方完成禁用的时间，单位为秒。", `<input id="firstBanActionSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.firstBanActionSeconds}" />`)}
        ${renderAdminSettingRow("后手禁用时间", "后手方完成禁用的时间，单位为秒。", `<input id="secondBanActionSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.secondBanActionSeconds}" />`)}
        ${renderAdminSettingRow(
          "Ban 顺序选择超时",
          "优势方选择先后手超时后的处理方式，默认自动先手。",
          `<select id="banOrderTimeoutPolicy">
            <option value="random_legal_order">随机合法顺序</option>
            <option value="advantage_first">自动先手</option>
            <option value="advantage_second">自动后手</option>
            <option value="admin_decision">管理员裁定</option>
            <option value="retry_after_delay">延迟时间后再次选择</option>
            <option value="forfeit_map">本张地图判负</option>
          </select>`,
        )}
        ${renderAdminSettingRow(
          "英雄选择超时策略",
          "第一次和第二次英雄 Ban 共用此策略。",
          `<select id="banActionTimeoutPolicy">
            <option value="random_legal_hero">随机合法英雄</option>
            <option value="retry_after_delay">延迟时间后再次选择</option>
            <option value="forfeit_map">本张地图判负</option>
            <option value="admin_decision">管理员裁定</option>
          </select>`,
        )}
        </fieldset>
      </div>
    </details>
  `;
}

function renderScoreRuleSettingsPanel(): string {
  const openAttribute = appMode === "global-admin" || openConfigSections.has("score") ? "open" : "";

  return `
    <details class="settings-section admin-config-section" data-config-section="score" ${openAttribute}>
      <summary>比分规则</summary>
      <div class="admin-setting-list">
        ${renderAdminSettingRow(
          "比分确认超时策略",
          "任一队提交后由另一队确认或拒绝；管理员始终可以直接录入正式比分。",
          `<select id="scoreConfirmationTimeoutPolicy"><option value="auto_confirm">自动确认</option><option value="admin_decision">管理员裁定</option></select>`,
        )}
        ${renderAdminSettingRow("比分确认时间", "仅在已有比分提案、等待另一队确认时计时。", `<input id="scoreConfirmSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.scoreConfirmSeconds}" />`)}
      </div>
    </details>
  `;
}

function renderNullableLimit(id: string, value: number | null, unit: string): string {
  return `<div class="nullable-limit-control">${renderAdminSwitch(`${id}Unlimited`, value === null, "不限", "限制")}<input id="${id}" type="number" min="1" max="86400" value="${value ?? 1}" ${value === null ? "disabled" : ""} /><span class="nullable-limit-unit">${unit}</span></div>`;
}

function renderPauseRuleSettingsPanel(): string {
  return `<details class="settings-section admin-config-section" data-config-section="pause" ${appMode === "global-admin" || openConfigSections.has("pause") ? "open" : ""}>
    <summary>暂停设置</summary><div class="admin-setting-list">
      ${renderAdminSettingRow("管理员全局暂停", "允许管理员冻结当前活动倒计时。", renderAdminSwitch("globalPauseEnabled", settingsState.globalPauseEnabled, "允许", "关闭"))}
      ${renderAdminSettingRow("队伍暂停", "只允许在比分填写与比分确认阶段使用。", renderAdminSwitch("teamPauseEnabled", settingsState.teamPauseEnabled, "允许", "关闭"))}
      ${settingsState.teamPauseEnabled ? renderAdminSettingRow("每队每图暂停次数", "默认永久不限。", renderNullableLimit("teamPauseMaxCountPerMap", settingsState.teamPauseMaxCountPerMap, "次")) : ""}
      ${settingsState.teamPauseEnabled ? renderAdminSettingRow("单次暂停时长", "默认永久不限。", renderNullableLimit("teamPauseMaxSingleSeconds", settingsState.teamPauseMaxSingleSeconds, "秒")) : ""}
      ${settingsState.teamPauseEnabled ? renderAdminSettingRow("每队每图累计暂停", "默认永久不限。", renderNullableLimit("teamPauseMaxTotalSeconds", settingsState.teamPauseMaxTotalSeconds, "秒")) : ""}
    </div></details>`;
}

function renderRollbackRuleSettingsPanel(): string {
  return `<details class="settings-section admin-config-section" data-config-section="rollback" ${appMode === "global-admin" || openConfigSections.has("rollback") ? "open" : ""}>
    <summary>回退设置</summary><div class="admin-setting-list">
      ${renderAdminSettingRow("允许管理员回退", "只能回退到后端生成的合法检查点。", renderAdminSwitch("rollbackEnabled", settingsState.rollbackEnabled, "允许", "关闭"))}
      ${settingsState.rollbackEnabled ? renderAdminSettingRow("系列赛结束后允许回退", "默认不允许。", renderAdminSwitch("allowRollbackAfterCompletion", settingsState.allowRollbackAfterCompletion, "允许", "不允许")) : ""}
      ${renderAdminSettingRow("再次选择延迟时间", "地图、选边、阵容或 Ban 选择重试时使用的新倒计时。", `<input id="timeoutExtensionSeconds" type="number" min="1" max="3600" value="${settingsState.stageLimits.timeoutExtensionSeconds}" />`)}
    </div></details>`;
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


function bindSettingsEvents(): void {
  if (!canUseSettings() || (!settingsPanelOpen && !roomStarted)) {
    return;
  }

  app.querySelectorAll<HTMLDetailsElement>("details[data-config-section]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const section = details.dataset.configSection;
      if (!section) return;
      if (details.open) openConfigSections.add(section);
      else openConfigSections.delete(section);
    });
  });

  document.getElementById("copyRoomConfigJson")?.addEventListener("click", () => void copyRoomConfigJson());
  document.getElementById("toggleGlobalPause")?.addEventListener("click", toggleGlobalPause);
  bindCheckpointEvents();

  if (roomConfigState?.status !== "draft") {
    initializeConfigEditorControls();
    return;
  }

  const mapSelectionMode = document.getElementById("mapSelectionMode") as HTMLSelectElement | null;
  const matchFormat = document.getElementById("matchFormat") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const firstMapPickerPolicy = document.getElementById("firstMapPickerPolicy") as HTMLSelectElement | null;
  const mapPickerPolicy = document.getElementById("mapPickerPolicy") as HTMLSelectElement | null;
  const mapTimeoutPolicy = document.getElementById("mapTimeoutPolicy") as HTMLSelectElement | null;
  const firstSideChoicePolicy = document.getElementById("firstSideChoicePolicy") as HTMLSelectElement | null;
  const subsequentSideChoicePolicy = document.getElementById("subsequentSideChoicePolicy") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const lineupTimeoutPolicy = document.getElementById("lineupTimeoutPolicy") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const openingSidePolicy = document.getElementById("openingSidePolicy") as HTMLSelectElement | null;
  const banTimeoutPolicy = document.getElementById("banTimeoutPolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;
  const targetSelectValues: Array<[string, string]> = [
    ["initialPriorityPolicy", settingsState.initialPriorityPolicy],
    ["subsequentPriorityPolicy", settingsState.subsequentPriorityPolicy],
    ["mapPickTimeoutPolicy", settingsState.mapPickTimeoutPolicy],
    ["interactiveRandomMissingInputPolicy", settingsState.interactiveRandomMissingInputPolicy],
    ["sideChooserRelation", settingsState.sideChooserRelation],
    ["sideTimeoutPolicy", settingsState.sideTimeoutPolicy],
    ["banAdvantageRelation", settingsState.banAdvantageRelation],
    ["banOrderPolicy", settingsState.banOrderPolicy],
    ["banOrderTimeoutPolicy", settingsState.banOrderTimeoutPolicy],
    ["banActionTimeoutPolicy", settingsState.banActionTimeoutPolicy],
    ["scoreConfirmationTimeoutPolicy", settingsState.scoreConfirmationTimeoutPolicy],
  ];
  targetSelectValues.forEach(([id, value]) => {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (select) select.value = value;
  });

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

  app.querySelectorAll<HTMLSelectElement>(".fixed-map-order-select").forEach((select) => {
    select.addEventListener("change", () => {
      readSettingsFromForm();
      renderCurrent();
    });
  });

  if (firstMapMode) {
    firstMapMode.value = settingsState.firstMapMode;
  }

  if (firstMapPickerPolicy) {
    firstMapPickerPolicy.value = settingsState.firstMapPickerPolicy;
  }

  if (mapPickerPolicy) {
    mapPickerPolicy.value = settingsState.mapPickerPolicy;
  }

  if (mapTimeoutPolicy) {
    mapTimeoutPolicy.value = settingsState.mapTimeoutPolicy;
  }

  if (firstSideChoicePolicy) {
    firstSideChoicePolicy.value = settingsState.firstSideChoicePolicy;
  }
  if (subsequentSideChoicePolicy) {
    subsequentSideChoicePolicy.value = settingsState.subsequentSideChoicePolicy;
  }

  if (rosterMode) {
    rosterMode.value = settingsState.rosterMode;
  }

  if (lineupTimeoutPolicy) {
    lineupTimeoutPolicy.value = settingsState.lineupTimeoutPolicy;
  }

  if (firstBanPolicy) {
    firstBanPolicy.value = settingsState.firstBanPolicy;
  }

  if (openingSidePolicy) {
    openingSidePolicy.value = settingsState.openingSidePolicy;
  }

  if (banTimeoutPolicy) {
    banTimeoutPolicy.value = settingsState.banTimeoutPolicy;
  }

  if (scoreReportMode) {
    scoreReportMode.value = settingsState.scoreReportMode;
  }

  [rosterMode, firstBanPolicy, document.getElementById("startWithDefaultConfig"), document.getElementById("teamsCanEditOwnName"), document.getElementById("fixedFirstMapEnabled"), document.getElementById("firstMapSideChoiceEnabled"), document.getElementById("symmetricSideChoiceEnabled"), document.getElementById("banEnabled"), document.getElementById("banOrderPolicy"), document.getElementById("teamPauseEnabled"), document.getElementById("rollbackEnabled"), document.getElementById("initialPriorityPolicy"), document.getElementById("teamPauseMaxCountPerMapUnlimited"), document.getElementById("teamPauseMaxSingleSecondsUnlimited"), document.getElementById("teamPauseMaxTotalSecondsUnlimited")]
    .filter((control): control is HTMLElement => Boolean(control))
    .forEach((control) => control.addEventListener("change", () => {
      readSettingsFromForm();
      if (control.id === "startWithDefaultConfig") {
        void saveRoomConfigDraft();
        return;
      }
      renderCurrent();
    }));

  document.getElementById("applyRoomPreset")?.addEventListener("click", () => void applyRoomPreset());
  document.getElementById("resetBuiltinConfig")?.addEventListener("click", () => void importRoomConfig(
    legacyConfigToCanonical(structuredClone(defaultSettings) as unknown as Record<string, unknown>, stableId, stableId),
    "builtin",
  ));
  document.getElementById("showRoomJsonImport")?.addEventListener("click", () => {
    const panel = document.getElementById("roomJsonImportInline");
    if (panel) panel.hidden = !panel.hidden;
  });
  document.getElementById("importRoomConfigJson")?.addEventListener("click", () => void importRoomConfigFromJson());
  document.getElementById("startMatchFromSettings")?.addEventListener("click", () => void startRoomMatch(false));
  document.getElementById("forceStartMatchFromSettings")?.addEventListener("click", () => void startRoomMatch(true));

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

      if (!checkpoint || isRoomActionLocked()) {
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

function readSettingsFromForm(): boolean {
  const readNumber = (id: keyof StageSetting): number => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    return input ? Number(input.value) || 0 : settingsState.stageLimits[id];
  };

  settingsState.stageLimits = {
    preStartRestSeconds: readNumber("preStartRestSeconds"),
    interactiveRandomSeconds: readNumber("interactiveRandomSeconds"),
    mapSelectSeconds: readNumber("mapSelectSeconds"),
    sidePickSeconds: readNumber("sidePickSeconds"),
    playerSelectSeconds: readNumber("playerSelectSeconds"),
    firstBanChoiceSeconds: readNumber("firstBanChoiceSeconds"),
    firstBanActionSeconds: readNumber("firstBanActionSeconds"),
    secondBanActionSeconds: readNumber("secondBanActionSeconds"),
    scoreConfirmSeconds: readNumber("scoreConfirmSeconds"),
    postMatchRestSeconds: readNumber("postMatchRestSeconds"),
    timeoutExtensionSeconds: readNumber("timeoutExtensionSeconds"),
  };

  const mapSelectionMode = document.getElementById("mapSelectionMode") as HTMLSelectElement | null;
  const matchFormat = document.getElementById("matchFormat") as HTMLSelectElement | null;
  const firstMapMode = document.getElementById("firstMapMode") as HTMLSelectElement | null;
  const firstMapPickerPolicy = document.getElementById("firstMapPickerPolicy") as HTMLSelectElement | null;
  const mapPickerPolicy = document.getElementById("mapPickerPolicy") as HTMLSelectElement | null;
  const mapTimeoutPolicy = document.getElementById("mapTimeoutPolicy") as HTMLSelectElement | null;
  const firstSideChoicePolicy = document.getElementById("firstSideChoicePolicy") as HTMLSelectElement | null;
  const subsequentSideChoicePolicy = document.getElementById("subsequentSideChoicePolicy") as HTMLSelectElement | null;
  const rosterMode = document.getElementById("rosterMode") as HTMLSelectElement | null;
  const lineupTimeoutPolicy = document.getElementById("lineupTimeoutPolicy") as HTMLSelectElement | null;
  const firstBanPolicy = document.getElementById("firstBanPolicy") as HTMLSelectElement | null;
  const openingSidePolicy = document.getElementById("openingSidePolicy") as HTMLSelectElement | null;
  const banTimeoutPolicy = document.getElementById("banTimeoutPolicy") as HTMLSelectElement | null;
  const scoreReportMode = document.getElementById("scoreReportMode") as HTMLSelectElement | null;
  const fixedMapOrderText = document.getElementById("fixedMapOrderText") as HTMLTextAreaElement | null;
  const fixedMapOrderSelects = [...app.querySelectorAll<HTMLSelectElement>(".fixed-map-order-select")];
  const fixedFirstMapEnabled = document.getElementById("fixedFirstMapEnabled") as HTMLInputElement | null;
  const fixedFirstMapName = document.getElementById("fixedFirstMapName") as HTMLSelectElement | null;
  const symmetricSideChoiceEnabled = document.getElementById("symmetricSideChoiceEnabled") as HTMLInputElement | null;
  const banEnabled = document.getElementById("banEnabled") as HTMLInputElement | null;
  const startWithDefaultConfig = document.getElementById("startWithDefaultConfig") as HTMLInputElement | null;
  const teamsCanEditOwnName = document.getElementById("teamsCanEditOwnName") as HTMLInputElement | null;
  const matchName = document.getElementById("matchName") as HTMLInputElement | null;
  const leftTeamName = document.getElementById("leftTeamName") as HTMLInputElement | null;
  const rightTeamName = document.getElementById("rightTeamName") as HTMLInputElement | null;
  const readSelect = (id: string, fallback: string): string => (document.getElementById(id) as HTMLSelectElement | null)?.value ?? fallback;
  const readChecked = (id: string, fallback: boolean): boolean => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? fallback;
  const readNullable = (id: string, fallback: number | null): number | null => {
    if (readChecked(`${id}Unlimited`, fallback === null)) return null;
    const value = Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? fallback ?? 1);
    return Number.isInteger(value) && value > 0 ? value : 1;
  };

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
  if (settingsState.fixedFirstMapEnabled && settingsState.firstSideChoicePolicy === "map_picker") {
    settingsState.firstSideChoicePolicy = "left";
  }
  settingsState.fixedFirstMapName = fixedFirstMapName?.value ?? settingsState.fixedFirstMapName;
  settingsState.firstMapPickerPolicy = (firstMapPickerPolicy?.value ?? settingsState.firstMapPickerPolicy) as FirstMapPickerPolicy;
  settingsState.mapPickerPolicy = (mapPickerPolicy?.value ?? settingsState.mapPickerPolicy) as MapPickerPolicy;
  settingsState.mapTimeoutPolicy = (mapTimeoutPolicy?.value ?? settingsState.mapTimeoutPolicy) as MapTimeoutPolicy;
  settingsState.symmetricSideChoiceEnabled = symmetricSideChoiceEnabled?.checked ?? settingsState.symmetricSideChoiceEnabled;
  settingsState.firstSideChoicePolicy = (firstSideChoicePolicy?.value ?? settingsState.firstSideChoicePolicy) as FirstSideChoicePolicy;
  settingsState.subsequentSideChoicePolicy = (subsequentSideChoicePolicy?.value ?? settingsState.subsequentSideChoicePolicy) as SubsequentSideChoicePolicy;
  if (settingsState.fixedFirstMapEnabled && settingsState.firstSideChoicePolicy === "map_picker") {
    settingsState.firstSideChoicePolicy = "left";
  }
  settingsState.rosterMode = (rosterMode?.value ?? settingsState.rosterMode) as PlayerInputMode;
  settingsState.lineupTimeoutPolicy = (lineupTimeoutPolicy?.value ?? settingsState.lineupTimeoutPolicy) as LineupTimeoutPolicy;
  settingsState.banEnabled = banEnabled?.checked ?? settingsState.banEnabled;
  settingsState.startWithDefaultConfig = startWithDefaultConfig?.checked ?? settingsState.startWithDefaultConfig;
  settingsState.teamsCanEditOwnName = teamsCanEditOwnName?.checked ?? settingsState.teamsCanEditOwnName;
  settingsState.firstBanPolicy = (firstBanPolicy?.value ?? settingsState.firstBanPolicy) as FirstBanPolicy;
  settingsState.openingSidePolicy = (openingSidePolicy?.value ?? settingsState.openingSidePolicy) as OpeningSidePolicy;
  if (settingsState.fixedFirstMapEnabled && settingsState.openingSidePolicy === "follow_map_picker") {
    settingsState.openingSidePolicy = "random";
  }
  settingsState.banTimeoutPolicy = (banTimeoutPolicy?.value ?? settingsState.banTimeoutPolicy) as BanTimeoutPolicy;
  settingsState.scoreReportMode = (scoreReportMode?.value ?? settingsState.scoreReportMode) as ScoreReportMode;
  settingsState.initialPriorityPolicy = readSelect("initialPriorityPolicy", settingsState.initialPriorityPolicy) as InitialPriorityPolicy;
  settingsState.subsequentPriorityPolicy = readSelect("subsequentPriorityPolicy", settingsState.subsequentPriorityPolicy) as SettingsState["subsequentPriorityPolicy"];
  settingsState.mapPickTimeoutPolicy = readSelect("mapPickTimeoutPolicy", settingsState.mapPickTimeoutPolicy) as SettingsState["mapPickTimeoutPolicy"];
  settingsState.interactiveRandomMissingInputPolicy = readSelect("interactiveRandomMissingInputPolicy", settingsState.interactiveRandomMissingInputPolicy) as SettingsState["interactiveRandomMissingInputPolicy"];
  settingsState.firstMapSideChoiceEnabled = readChecked("firstMapSideChoiceEnabled", settingsState.firstMapSideChoiceEnabled);
  settingsState.sideChooserRelation = readSelect("sideChooserRelation", settingsState.sideChooserRelation) as PriorityRelation;
  settingsState.sideTimeoutPolicy = readSelect("sideTimeoutPolicy", settingsState.sideTimeoutPolicy) as SideTimeoutPolicy;
  settingsState.banAdvantageRelation = readSelect("banAdvantageRelation", settingsState.banAdvantageRelation) as PriorityRelation;
  settingsState.banOrderPolicy = readSelect("banOrderPolicy", settingsState.banOrderPolicy) as SettingsState["banOrderPolicy"];
  settingsState.banOrderTimeoutPolicy = readSelect("banOrderTimeoutPolicy", settingsState.banOrderTimeoutPolicy) as BanOrderTimeoutPolicy;
  settingsState.banActionTimeoutPolicy = readSelect("banActionTimeoutPolicy", settingsState.banActionTimeoutPolicy) as BanActionTimeoutPolicy;
  settingsState.scoreConfirmationTimeoutPolicy = readSelect("scoreConfirmationTimeoutPolicy", settingsState.scoreConfirmationTimeoutPolicy) as SettingsState["scoreConfirmationTimeoutPolicy"];
  settingsState.globalPauseEnabled = readChecked("globalPauseEnabled", settingsState.globalPauseEnabled);
  settingsState.teamPauseEnabled = readChecked("teamPauseEnabled", settingsState.teamPauseEnabled);
  settingsState.teamPauseMaxCountPerMap = readNullable("teamPauseMaxCountPerMap", settingsState.teamPauseMaxCountPerMap);
  settingsState.teamPauseMaxSingleSeconds = readNullable("teamPauseMaxSingleSeconds", settingsState.teamPauseMaxSingleSeconds);
  settingsState.teamPauseMaxTotalSeconds = readNullable("teamPauseMaxTotalSeconds", settingsState.teamPauseMaxTotalSeconds);
  settingsState.rollbackEnabled = readChecked("rollbackEnabled", settingsState.rollbackEnabled);
  settingsState.allowRollbackAfterCompletion = readChecked("allowRollbackAfterCompletion", settingsState.allowRollbackAfterCompletion);
  // Keep local legacy behavior paths aligned while the UI and API use target fields.
  settingsState.firstMapPickerPolicy = (settingsState.initialPriorityPolicy === "system_random" ? "random" : settingsState.initialPriorityPolicy) as FirstMapPickerPolicy;
  settingsState.mapTimeoutPolicy = (settingsState.mapPickTimeoutPolicy === "retry_after_delay" ? "warn_extend_30" : settingsState.mapPickTimeoutPolicy) as MapTimeoutPolicy;
  settingsState.firstSideChoicePolicy = settingsState.firstMapSideChoiceEnabled ? "map_picker" : "none";
  settingsState.subsequentSideChoicePolicy = settingsState.subsequentPriorityPolicy;
  settingsState.firstBanPolicy = settingsState.banOrderPolicy === "advantage_must_first" ? "loser_must_first" : "allow_loser_choose";
  settingsState.banTimeoutPolicy = (settingsState.banActionTimeoutPolicy === "retry_after_delay" ? "warn_extend_30" : settingsState.banActionTimeoutPolicy === "random_legal_hero" ? "random_legal_ban" : settingsState.banActionTimeoutPolicy) as BanTimeoutPolicy;
  settingsState.scoreReportMode = "team_submit_opponent_confirm";
  settingsState.fixedMapOrderText = fixedMapOrderSelects.length > 0
    ? fixedMapOrderSelects.map((select) => select.value).filter(Boolean).join("\n")
    : fixedMapOrderText?.value ?? settingsState.fixedMapOrderText;
  settingsState.mapPool = readVisualMapPool();
  const selectedMapKeys = new Set(Object.values(settingsState.mapPool).flat().map(normalizeKey));
  settingsState.fixedMapOrderText = settingsState.fixedMapOrderText
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name && selectedMapKeys.has(normalizeKey(name)))
    .join("\n");
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
    const pool = new Set(Object.values(settingsState.mapPool).flat().map(normalizeKey));
    fixedOrder.forEach((name, index) => {
      if (!pool.has(normalizeKey(name))) errors.push(`固定地图顺序第 ${index + 1} 项不属于本场地图池。`);
      const catalogMap = findCatalogMapByName(name);
      if (!catalogMap) errors.push(`固定地图顺序第 ${index + 1} 项不在当前地图目录中。`);
      else if (!["attack_defense", "red_blue", "none"].includes(catalogMap.sideSelectionKind)) {
        errors.push(`固定地图顺序第 ${index + 1} 项缺少有效的地图能力定义。`);
      }
    });
    if (fixedOrder.length === 0) {
      errors.push("固定地图顺序至少需要一张地图。");
    }
  }

  const selectedMapCount = new Set(Object.values(settingsState.mapPool).flat().map(normalizeKey)).size;
  if (selectedMapCount < requiredMaps) {
    errors.push(`${getMatchFormatLabel(settingsState.matchFormat)} 至少需要选择 ${requiredMaps} 张地图，以支持最多 2 场平局。`);
  }

  Object.entries(settingsState.mapPool).forEach(([mode, maps]) => {
    maps.forEach((name, index) => {
      const catalogMap = findCatalogMapByName(name);
      if (!catalogMap) {
        errors.push(`地图池 ${getModeLabel(mode)} 第 ${index + 1} 项不在当前锁定地图目录中。`);
      } else if (!["attack_defense", "red_blue", "none"].includes(catalogMap.sideSelectionKind)) {
        errors.push(`地图池中的 ${getDisplayMapName(name)} 缺少有效的地图能力定义。`);
      }
    });
  });

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
    if (settingsState.openingSidePolicy === "follow_map_picker") {
      errors.push("固定第一张地图时，禁用首次先手方不能跟随地图选图权。");
    }
  }

  return errors;
}

async function saveRoomConfigDraft(renderAfter = true): Promise<boolean> {
  if (!roomToken || !isAdminPortal() || roomConfigState?.status !== "draft") {
    return false;
  }
  if (document.getElementById("matchFormat") && !readSettingsFromForm()) {
    return false;
  }
  const validationErrors = validateSettingsForSubmit();
  if (validationErrors.length > 0) {
    showLocalNotice(validationErrors.join("；"));
    return false;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision: roomConfigState?.revision,
      config: legacyConfigToCanonical(settingsState as unknown as Record<string, unknown>, stableId, stableId),
      source: roomConfigState?.source ?? { type: "manual" },
    }),
  });
  if (!response.ok) {
    showLocalNotice(await getConfigErrorMessage(response));
    return false;
  }
  roomConfigState = adaptConfigResponse(await response.json() as RoomConfigState);
  settingsState = settingsFromStoredConfig(roomConfigState.value);
  if (roomClient) await authoritativeStore.apply(await roomClient.sync(null));
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
    showLocalNotice("请先选择一个默认模板。");
    return;
  }
  await performApplyRoomPreset(presetId);
}

function handlePersistentAdminControlClick(event: Event): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
  if (!button || !app.contains(button) || button.disabled) return;
  if (button.id === "rollbackToConfig") void rollbackRoomToConfig();
  if (button.id === "refreshAuthoritativeHistory") void refreshAuthoritativeHistory();
  if (button.id === "rollbackToHistoryRevision") void rollbackToSelectedRevision();
}

async function performApplyRoomPreset(presetId: string): Promise<void> {
  if (!roomToken || !isAdminPortal() || !presetId || isRoomActionLocked()) return;
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config/apply-preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presetId }),
  });
  if (!response.ok) {
    showLocalNotice(await getConfigErrorMessage(response));
    return;
  }
  roomConfigState = adaptConfigResponse(await response.json() as RoomConfigState);
  settingsState = settingsFromStoredConfig(roomConfigState.value);
  if (roomClient) await authoritativeStore.apply(await roomClient.sync(null));
  renderCurrent();
}

function startInteractiveRandom(purpose: InteractiveRandomPurpose, mapIndex: number): void {
  const resolvedSide = interactiveRandomResults[getInteractiveRandomResultKey(purpose, mapIndex)] ?? null;
  interactiveRandomState = {
    purpose,
    mapIndex,
    choices: { left: null, right: null },
    submitted: { left: false, right: false },
    resolvedSide,
  };
  hiddenOverlay = null;
}

function submitInteractiveRandomChoice(value: 0 | 1): void {
  if (isRoomActionLocked() || !interactiveRandomState || interactiveRandomState.resolvedSide || !portalConfig.side) {
    return;
  }
  if (interactiveRandomState.submitted[portalConfig.side]) {
    return;
  }
  interactiveRandomState.choices[portalConfig.side] = value;
  interactiveRandomState.submitted[portalConfig.side] = true;
  if (interactiveRandomState.choices.left !== null && interactiveRandomState.choices.right !== null) {
    if (roomToken && roomClient) {
      dispatchRoomViewOperation(createRoomOperation("room", "interactive_random_submitted", {
        purpose: interactiveRandomState.purpose,
        side: portalConfig.side,
      }));
      renderCurrent();
      return;
    }
    finalizeInteractiveRandom(false);
    return;
  }
  dispatchRoomViewOperation(createRoomOperation("room", "interactive_random_submitted", {
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
  interactiveRandomState.submitted = { left: true, right: true };
  const resultSide: Side = (left ^ right) === 0 ? "left" : "right";
  interactiveRandomState.resolvedSide = resultSide;
  interactiveRandomResults[getInteractiveRandomResultKey(interactiveRandomState.purpose, interactiveRandomState.mapIndex)] = resultSide;
  if (interactiveRandomState.purpose === "map_picker") {
    firstMapPickerSide = resultSide;
    if (settingsState.openingSidePolicy === "follow_map_picker") {
    }
  } else if (interactiveRandomState.purpose === "opening_ban") {
  }
  dispatchRoomViewOperation(createRoomOperation("room", "interactive_random_resolved", {
    purpose: interactiveRandomState.purpose,
    mapIndex: interactiveRandomState.mapIndex,
    left,
    right,
    resultSide,
    timedOut,
  }));
  renderCurrent();
}

async function importRoomConfigFromJson(): Promise<void> {
  const textarea = document.getElementById("roomConfigJson") as HTMLTextAreaElement | null;
  if (!textarea?.value.trim()) {
    showLocalNotice("请先粘贴配置 JSON。");
    return;
  }
  try {
    const payload = JSON.parse(textarea.value) as { config?: unknown };
    await importRoomConfig(payload.config ?? payload, "json");
  } catch {
    showLocalNotice("粘贴的内容不是有效 JSON。");
  }
}

async function importRoomConfig(config: unknown, sourceType: "json" | "builtin"): Promise<void> {
  if (!roomToken || !isAdminPortal() || roomConfigState?.status !== "draft") {
    return;
  }
  const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomToken)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: roomConfigState?.revision, config, source: { type: sourceType } }),
  });
  if (!response.ok) {
    showLocalNotice(await getConfigErrorMessage(response));
    return;
  }
  roomConfigState = adaptConfigResponse(await response.json() as RoomConfigState);
  settingsState = settingsFromStoredConfig(roomConfigState.value);
  if (roomClient) await authoritativeStore.apply(await roomClient.sync(null));
  renderCurrent();
}

async function confirmRoomConfig(): Promise<void> {
  if (!roomToken || !isAdminPortal()) {
    return;
  }
  if (!(await saveRoomConfigDraft(false))) {
    return;
  }
  if (!roomClient || !authoritativeStore.ref) return;
  try {
    await authoritativeStore.apply(await roomClient.action(authoritativeStore.ref, "config_confirm"));
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "确认配置失败");
  }
}

async function startRoomMatch(force = false): Promise<void> {
  if (!roomToken || !isAdminPortal()) {
    return;
  }
  const autoConfigurationOpen = roomConfigState?.status === "draft" && settingsState.startWithDefaultConfig;
  if (roomConfigState?.status !== "ready" && !autoConfigurationOpen) {
    showLocalNotice("请先保存并确认比赛配置。");
    return;
  }
  if (autoConfigurationOpen && !(await saveRoomConfigDraft(false))) {
    return;
  }
  if (!roomClient || !authoritativeStore.ref) return;
  try {
    await authoritativeStore.apply(await roomClient.action(authoritativeStore.ref, "match_start", { force }));
    settingsPanelOpen = false;
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "开始比赛失败");
  }
}

async function rollbackRoomToConfig(): Promise<void> {
  if (!roomToken || !isAdminPortal() || isRoomActionLocked()) {
    return;
  }
  selectionConfirmationState = { kind: "room-config-rollback" };
  renderCurrent();
}

async function performRollbackRoomToConfig(): Promise<void> {
  if (!roomToken || !isAdminPortal() || isRoomActionLocked()) return;
  if (!roomClient) return;
  try {
    await authoritativeStore.apply(await roomClient.rollback(1));
    settingsPanelOpen = true;
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "回退失败");
  }
}

async function refreshAuthoritativeHistory(): Promise<void> {
  if (!roomClient || !isAdminPortal()) return;
  try {
    authoritativeHistory = await roomClient.history();
    renderCurrent();
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "读取状态历史失败");
  }
}

async function rollbackToSelectedRevision(): Promise<void> {
  if (!roomClient || !isAdminPortal()) return;
  const select = document.getElementById("authoritativeHistoryRevision") as HTMLSelectElement | null;
  const revision = Number(select?.value);
  if (isRollbackUnavailable() || !Number.isInteger(revision) || revision < 1) return;
  try {
    await authoritativeStore.apply(await roomClient.rollback(revision));
    authoritativeHistory = await roomClient.history();
    renderCurrent();
  } catch (error) {
    showLocalNotice(error instanceof Error ? error.message : "回退失败");
  }
}

function adaptConfigResponse(response: RoomConfigState): RoomConfigState {
  const value = canonicalConfigToLegacy(
    response.value as unknown as Record<string, unknown>,
    resolveCanonicalMapName,
    resolveCanonicalModeName,
  ) as unknown as SettingsState;
  return { ...response, value };
}

async function copyRoomConfigJson(): Promise<void> {
  if (!navigator.clipboard) {
    showLocalNotice("浏览器不支持复制到剪贴板。");
    return;
  }
  const payload = {
    schemaVersion: 1,
    id: "room-export",
    name: settingsState.matchName,
    description: "从比赛房间导出的配置",
    config: legacyConfigToCanonical(settingsState as unknown as Record<string, unknown>, stableId, stableId),
  };
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  showLocalNotice("当前配置 JSON 已复制。");
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
    teams_not_ready: "两支队伍尚未全部准备；请等待双方准备，或使用管理员强制开始。",
    forbidden: "当前入口没有修改配置的权限。",
  } as Record<string, string>)[payload.error ?? ""] ?? "配置操作失败。";
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
  selectionConfirmationState = null;
  localScoreDraft = null;
  interactiveRandomState = null;
  createTeamAckNotice(`管理员已回退到 MAP ${row + 1}：${settingsState.checkpoints[row][key].label}`);

  for (let index = row + 1; index < currentState.maps.length; index += 1) {
    currentState.maps[index] = createBlankMap(index);
    delete confirmedLineups[index];
  }

  lineupSelectorState = null;
  sideSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  restState = null;

  if (key === "preCountdown" || key === "mapPick" || !currentState.maps[row].nameEn) {
    currentState.maps[row] = createBlankMap(row);
    delete confirmedLineups[row];
    if (key === "preCountdown") {
      mapSelectorState = null;
      restState = { open: true, mapIndex: Math.max(0, row - 1), skipReady: createRestSkipReadyState() };
    } else {
      mapSelectorState = {
        open: true,
        minimized: false,
        selectedMapKey: null,
        targetMapIndex: row,
        pickerSide: getMapPickerSide(currentState, row),
        timedOut: false,
      };
    }
  } else if (key === "lineupPick") {
    mapSelectorState = null;
    delete confirmedLineups[row];
    currentState.maps[row].bans = { left: null, right: null };
    currentState.maps[row].firstBanSide = null;
    currentState.maps[row].score = { left: null, right: null };
    currentState.maps[row].status = "after";
    openLineupSelector(row);
  } else if (key === "firstSecondBanChoice" || key === "firstBan") {
    mapSelectorState = null;
    currentState.maps[row].bans = { left: null, right: null };
    currentState.maps[row].firstBanSide = null;
    currentState.maps[row].score = { left: null, right: null };
    currentState.maps[row].status = "after";
    openBanSelectorForMap(row);
  } else if (key === "secondBan") {
    mapSelectorState = null;
    const firstSide = currentState.maps[row].firstBanSide ?? getMapPickerSide(currentState, row);
    const secondSide = getOppositeSide(firstSide);
    currentState.maps[row].bans[secondSide] = null;
    currentState.maps[row].score = { left: null, right: null };
    currentState.maps[row].status = "after";
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
  }

  recalculateSeriesScoresFromCompletedMaps();
  dispatchRoomViewOperation(createRoomOperation("room", "stage_restored", { mapIndex: row, checkpoint: key }));
  renderCurrent();
}

function recalculateSeriesScoresFromCompletedMaps(): void {
  if (!currentState) {
    return;
  }

  currentState.teams.left.seriesScore = 0;
  currentState.teams.right.seriesScore = 0;
  currentState.maps.forEach((map) => {
    if (map.status !== "completed") {
      return;
    }
    const leftScore = Number(map.score.left);
    const rightScore = Number(map.score.right);
    if (Number.isFinite(leftScore) && Number.isFinite(rightScore) && leftScore !== rightScore) {
      currentState!.teams[leftScore > rightScore ? "left" : "right"].seriesScore += 1;
    }
  });
}

function canOpenMapSlot(targetMapIndex: number): boolean {
  if (!currentState || !roomStarted || isBroadcastPortal() || getRoomViewPolicy()?.completed || getSeriesWinnerSide() !== null) {
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
  if (getRoomViewPolicy()?.completed || getSeriesWinnerSide() !== null) {
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
    sideSelectorState?.open
      || lineupSelectorState?.open
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
  dispatchRoomViewOperation(createRoomOperation("map", "selector_opened", { mapIndex: targetMapIndex }));
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
  updateSelectedMapDom();
}

function randomLegalMapChoice(automatic = false): void {
  if ((!automatic && !isAdminPortal()) || !mapSelectorState) {
    return;
  }

  const choice = pickRandomItem(getLegalMapChoices());

  if (!choice) {
    dispatchRoomViewOperation(createRoomOperation("map", "random_failed", { mapIndex: mapSelectorState.targetMapIndex }));
    renderCurrent();
    return;
  }

  mapSelectorState.selectedMapKey = choice.key;
  if (!automatic) {
    updateSelectedMapDom();
    return;
  }
  const resultMessage = automatic
    ? `${getTeamName(mapSelectorState.pickerSide)}地图选择超时，随机选择结果为${getDisplayMapName(choice.nameEn)}。`
    : `管理员已随机选择地图：${getDisplayMapName(choice.nameEn)}`;
  createTeamAckNotice(resultMessage);
  confirmSelectedMap(automatic ? "timeout_random" : "admin_random");
}

function extendMapChoiceTime(automatic = false): void {
  if (!mapSelectorState || (!automatic && !isAdminPortal())) return;
  mapSelectorState.timedOut = false;
  dispatchRoomViewOperation(createRoomOperation("map", "timeout_extended", {
    mapIndex: mapSelectorState.targetMapIndex,
    side: mapSelectorState.pickerSide,
    seconds: settingsState.stageLimits.timeoutExtensionSeconds,
  }));
  renderCurrent();
}

function forfeitCurrentMapChoice(automatic = false): void {
  if (!currentState || !mapSelectorState || (!automatic && !isAdminPortal())) {
    return;
  }

  const loserSide = mapSelectorState.pickerSide;
  const mapIndex = mapSelectorState.targetMapIndex;
  applyForfeitMapLoss(mapIndex, loserSide, "地图选择超时/犯规");
  mapSelectorState = null;
  sideSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  if (finishMatchIfSeriesWon()) {
    dispatchRoomViewOperation(createRoomOperation("map", "forfeited", { mapIndex, loserSide, matchFinished: true }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("map", "forfeited", { mapIndex, loserSide, matchFinished: false }));
  renderCurrent();
}

async function confirmSelectedMap(selectionSource: "manual" | "timeout_random" | "admin_random" = "manual"): Promise<void> {
  selectionConfirmationState = null;
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
  const pickerSide = mapSelectorState.pickerSide;
  if (roomClient && authoritativeStore.status) {
    await dispatchRoomViewOperation(createRoomOperation("map", "confirmed", {
      mapIndex: selectedMapIndex,
      mapKey: choice.key,
      mapName: choice.nameEn,
      pickerSide,
      selectionSource,
    }));
    return;
  }
  currentState.maps[selectedMapIndex] = updatedMap;
  if (isAdminPortal()) {
    const message = `管理员已为 MAP ${selectedMapIndex + 1} 选择地图：${getDisplayMapName(choice.nameEn)}`;
    createTeamAckNotice(message);
  }
  mapSelectorState = null;
  openSideSelectorForMap(selectedMapIndex);
  dispatchRoomViewOperation(createRoomOperation("map", "confirmed", {
    mapIndex: selectedMapIndex,
    mapKey: choice.key,
    mapName: choice.nameEn,
    pickerSide,
    selectionSource,
  }));
  renderCurrent();
}

function shouldSelectSideForMap(mapIndex: number): boolean {
  const mode = currentState?.maps[mapIndex]?.mode;
  return mode === "Escort" || mode === "Hybrid" || settingsState.symmetricSideChoiceEnabled;
}

function getSideChoiceKind(mapIndex: number): "attack_defense" | "color" {
  const mode = currentState?.maps[mapIndex]?.mode;
  return mode === "Escort" || mode === "Hybrid" ? "attack_defense" : "color";
}

function getInteractiveRandomResultKey(purpose: InteractiveRandomPurpose, mapIndex: number): string {
  return purpose === "side_choice" ? `${purpose}_${mapIndex}` : purpose;
}

function resolveSideChoicePicker(mapIndex: number): Side {
  if (mapIndex <= 0) {
    const policy = settingsState.firstSideChoicePolicy;
    if (policy === "map_picker") return firstMapPickerSide;
    if (policy === "right") return "right";
    return "left";
  }
  if (!currentState) return firstMapPickerSide;
  const loser = getMapPickerSide(currentState, mapIndex);
  return settingsState.subsequentSideChoicePolicy === "previous_winner" ? getOppositeSide(loser) : loser;
}

function getDirectFirstSideAssignment(mapIndex: number): Side | null {
  if (mapIndex !== 0) return null;
  const policy = settingsState.firstSideChoicePolicy;
  if (policy !== "left_attack" && policy !== "left_defense") return null;
  if (policy === "left_attack") return "right";
  return "left";
}

function openSideSelectorForMap(mapIndex: number): void {
  if (
    !currentState
    || (mapIndex === 0 && settingsState.firstSideChoicePolicy === "none")
    || !shouldSelectSideForMap(mapIndex)
  ) {
    sideSelectorState = null;
    openLineupSelector(mapIndex);
    return;
  }
  const directSide = getDirectFirstSideAssignment(mapIndex);
  if (directSide) {
    currentState.maps[mapIndex].sideChoiceKind = getSideChoiceKind(mapIndex);
    currentState.maps[mapIndex].selectedSide = directSide;
    sideSelectorState = null;
    openLineupSelector(mapIndex);
    return;
  }
  sideSelectorState = {
    open: true,
    mapIndex,
    pickerSide: resolveSideChoicePicker(mapIndex),
    choiceKind: getSideChoiceKind(mapIndex),
    selectedSide: null,
  };
  hiddenOverlay = null;
}

function canOperateSideSelection(): boolean {
  return Boolean(
    sideSelectorState
      && !isRoomActionLocked()
      && (isAdminPortal() || portalConfig.side === sideSelectorState.pickerSide),
  );
}

function getSideChoiceSummary(): string {
  if (!sideSelectorState?.selectedSide) return "尚未选择";
  const selectedName = getTeamName(sideSelectorState.selectedSide);
  const otherName = getTeamName(getOppositeSide(sideSelectorState.selectedSide));
  return sideSelectorState.choiceKind === "attack_defense"
    ? `${selectedName}防守，${otherName}进攻`
    : `${selectedName}为蓝色方，${otherName}为红色方`;
}

async function confirmSideSelection(selectionSource: "manual" | "timeout_random" = "manual"): Promise<void> {
  if (!currentState || !sideSelectorState?.selectedSide || !canOperateSideSelection()) return;
  const { mapIndex, choiceKind, selectedSide, pickerSide } = sideSelectorState;
  if (roomClient && authoritativeStore.status) {
    await dispatchRoomViewOperation(createRoomOperation("map", "side_choice_confirmed", {
      mapIndex,
      choiceKind,
      selectedSide,
      pickerSide,
      selectionSource,
    }));
    return;
  }
  currentState.maps[mapIndex].sideChoiceKind = choiceKind;
  currentState.maps[mapIndex].selectedSide = selectedSide;
  sideSelectorState = null;
  openLineupSelector(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("map", "side_choice_confirmed", {
    mapIndex,
    choiceKind,
    selectedSide,
    pickerSide,
    selectionSource,
  }));
  renderCurrent();
}

function openLineupSelector(mapIndex: number): void {
  selectionConfirmationState = null;
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
  selectionConfirmationState = null;
  if (!lineupSelectorState || !canConfirmLineupSelection()) {
    return;
  }

  if (isAdminPortal()) {
    const message = `管理员已确认 MAP ${lineupSelectorState.mapIndex + 1} 上场人员`;
    createTeamAckNotice(message);
    finalizeLineupSelection(true);
    return;
  }

  const side = portalConfig.side;

  if (!side) {
    return;
  }

  lineupSelectorState.ready[side] = true;
  delete localLineupDrafts[lineupSelectorState.mapIndex]?.[side];

  if (isLineupReadyToFinalize()) {
    finalizeLineupSelection();
    return;
  }

  dispatchRoomViewOperation(createRoomOperation("lineup", "ready", { side }));
  renderCurrent();
}

function openBanSelectorForMap(mapIndex: number): void {
  selectionConfirmationState = null;
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
    return;
  }

  const chooserSide = mapIndex === 0 ? resolveOpeningSide() : getMapPickerSide(currentState, mapIndex);
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
  renderCurrent();
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
  renderCurrent();
}

function randomLegalBanChoice(automatic = false): void {
  if (!banSelectorState || (!automatic && !isAdminPortal())) {
    return;
  }

  if (banSelectorState.step === "order-choice") {
    banSelectorState.selectedOrder = pickRandomItem<BanOrderChoice>(["first", "second"]);
    if (!automatic) {
      renderCurrent();
      return;
    }
    createTeamAckNotice("管理员已随机选择禁用顺序。");
    confirmBanSelection({ selectionSource: automatic ? "timeout_random" : "admin_random" });
    return;
  }

  if (!automatic && isAdminPortal() && isAwaitingAdminDecision()) {
    dispatchRoomViewOperation(createRoomOperation("ban", "random_legal_hero", {
      mapIndex: banSelectorState.mapIndex,
      side: banSelectorState.activeSide,
    }));
    return;
  }

  const hero = pickRandomItem(getLegalBanHeroes());

  if (!hero) {
    dispatchRoomViewOperation(createRoomOperation("ban", "random_failed", {
      mapIndex: banSelectorState.mapIndex,
      step: banSelectorState.step,
    }));
    renderCurrent();
    return;
  }

  banSelectorState.selectedHeroKey = getHeroKey(hero.nameEn);
  if (!automatic) {
    renderCurrent();
    return;
  }
  const resultMessage = automatic
    ? `${getTeamName(banSelectorState.activeSide)}英雄禁用选择超时，随机选择结果为${getHeroDisplayName(hero.nameEn)}。`
    : `管理员已随机禁用：${getHeroDisplayName(hero.nameEn)}`;
  createTeamAckNotice(resultMessage);
  confirmBanSelection({ selectionSource: automatic ? "timeout_random" : "admin_random" });
}

function extendBanChoiceTime(automatic = false): void {
  if (!banSelectorState || (!automatic && !isAdminPortal())) return;
  banSelectorState.timedOut = false;
  dispatchRoomViewOperation(createRoomOperation("ban", "timeout_extended", {
    mapIndex: banSelectorState.mapIndex,
    side: banSelectorState.step === "order-choice" ? banSelectorState.chooserSide : banSelectorState.activeSide,
    seconds: settingsState.stageLimits.timeoutExtensionSeconds,
  }));
  renderCurrent();
}

function forfeitCurrentBanChoice(automatic = false): void {
  if (!currentState || !banSelectorState || (!automatic && !isAdminPortal())) {
    return;
  }

  const loserSide = banSelectorState.step === "order-choice" ? banSelectorState.chooserSide : banSelectorState.activeSide;
  const mapIndex = banSelectorState.mapIndex;
  applyForfeitMapLoss(mapIndex, loserSide, "英雄禁用超时或犯规");
  mapSelectorState = null;
  sideSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  if (finishMatchIfSeriesWon()) {
    dispatchRoomViewOperation(createRoomOperation("ban", "forfeited", { mapIndex, loserSide, matchFinished: true }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("ban", "forfeited", { mapIndex, loserSide, matchFinished: false }));
  renderCurrent();
}

async function confirmBanSelection(context: Record<string, unknown> = {}): Promise<void> {
  selectionConfirmationState = null;
  if (!banSelectorState || !canConfirmBanSelection()) {
    return;
  }

  if (banSelectorState.step === "order-choice") {
    const firstBanSide =
      banSelectorState.selectedOrder === "first" ? banSelectorState.chooserSide : getOppositeSide(banSelectorState.chooserSide);
    if (roomClient && authoritativeStore.status) {
      await dispatchRoomViewOperation(createRoomOperation("ban", "order_confirmed", {
        mapIndex: banSelectorState.mapIndex,
        firstBanSide,
        chooserSide: banSelectorState.chooserSide,
        ...context,
      }));
      return;
    }

    banSelectorState.firstBanSide = firstBanSide;
    banSelectorState.activeSide = firstBanSide;
    banSelectorState.step = "first-ban";
    banSelectorState.selectedOrder = null;
    currentState!.maps[banSelectorState.mapIndex].firstBanSide = firstBanSide;
    if (isAdminPortal()) {
      const message = `管理员已确认先手禁用方：${getTeamName(firstBanSide)}`;
      createTeamAckNotice(message);
    }
    dispatchRoomViewOperation(createRoomOperation("ban", "order_confirmed", {
      mapIndex: banSelectorState.mapIndex,
      firstBanSide,
      chooserSide: banSelectorState.chooserSide,
      ...context,
    }));
    renderCurrent();
    return;
  }

  const hero = findHeroByKey(banSelectorState.selectedHeroKey);

  if (!hero || !currentState) {
    return;
  }

  const side = banSelectorState.activeSide;
  const mapIndex = banSelectorState.mapIndex;
  const phase = banSelectorState.step === "first-ban" ? "first" : "second";
  if (roomClient && authoritativeStore.status) {
    await dispatchRoomViewOperation(createRoomOperation("ban", "hero_confirmed", {
      mapIndex,
      side,
      hero: hero.nameEn,
      phase,
      ...context,
    }));
    return;
  }
  currentState.maps[banSelectorState.mapIndex].bans[side] = createHeroBan(hero);

  if (banSelectorState.step === "first-ban") {
    banSelectorState.step = "second-ban";
    banSelectorState.activeSide = getOppositeSide(side);
    banSelectorState.selectedHeroKey = null;
    dispatchRoomViewOperation(createRoomOperation("ban", "hero_confirmed", {
      mapIndex: banSelectorState.mapIndex,
      side,
      hero: hero.nameEn,
      phase: "first",
      ...context,
    }));
    renderCurrent();
    return;
  }

  banSelectorState = null;
  openScoreSelectorForMap(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("ban", "hero_confirmed", {
    mapIndex,
    side,
    hero: hero.nameEn,
    phase: "second",
    ...context,
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
    teamPauses: {
      left: normalizeTeamPauseState(null),
      right: normalizeTeamPauseState(null),
    },
    countdownPauseStartedAt: null,
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
  localScoreDraft = { mapIndex: scoreSelectorState.mapIndex, values: { ...scoreSelectorState.values } };
  const confirmButton = document.getElementById("confirmScorePick") as HTMLButtonElement | null;
  if (confirmButton) confirmButton.disabled = !canConfirmScoreSelection();
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
      stopAllScoreTeamPauses();
      scoreSelectorState.submittedBy = side;
      scoreSelectorState.rejectedBy = null;
      localScoreDraft = null;
      dispatchRoomViewOperation(createRoomOperation("score", "submitted", {
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
  localScoreDraft = null;
  dispatchRoomViewOperation(createRoomOperation("score", "rejected", {
    mapIndex: scoreSelectorState.mapIndex,
    side,
  }));
  renderCurrent();
}

async function finalizeScoreSelection(): Promise<void> {
  if (!currentState || !scoreSelectorState) {
    return;
  }

  const leftScore = Number(scoreSelectorState.values.left);
  const rightScore = Number(scoreSelectorState.values.right);
  const mapIndex = scoreSelectorState.mapIndex;
  const map = currentState.maps[mapIndex];

  if (roomClient && authoritativeStore.status) {
    await dispatchRoomViewOperation(createRoomOperation("score", "confirmed", {
      mapIndex,
      leftScore,
      rightScore,
    }));
    return;
  }

  stopAllScoreTeamPauses();
  (["left", "right"] as Side[]).forEach((side) => {
    matchTeamPauseTotals[side] += scoreSelectorState!.teamPauses[side].totalMs;
  });

  map.score = { left: leftScore, right: rightScore };
  map.status = "completed";

  if (isAdminPortal()) {
    const message = `管理员已确认 MAP ${mapIndex + 1} 比分：${leftScore}-${rightScore}`;
    createTeamAckNotice(message);
  }

  if (leftScore !== rightScore) {
    const winnerSide: Side = leftScore > rightScore ? "left" : "right";
    currentState.teams[winnerSide].seriesScore += 1;
  }

  scoreSelectorState = null;
  localScoreDraft = null;
  if (finishMatchIfSeriesWon()) {
    dispatchRoomViewOperation(createRoomOperation("score", "confirmed", {
      mapIndex,
      leftScore,
      rightScore,
      matchFinished: true,
    }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("score", "confirmed", {
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
  sideSelectorState = null;
  lineupSelectorState = null;
  banSelectorState = null;
  scoreSelectorState = null;
  restState = null;
  hiddenOverlay = null;
  currentState.phase = "completed";
  currentState.currentOperation = `比赛结束：${getTeamName(winnerSide)}获胜`;

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
  return Boolean(restState && !isRoomActionLocked() && (isAdminPortal() || portalConfig.side));
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

  dispatchRoomViewOperation(createRoomOperation("rest", "skip_requested", {
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
    dispatchRoomViewOperation(createRoomOperation("rest", "finished", { mapIndex, matchFinished: true }));
    renderCurrent();
    return;
  }

  restState = null;
  if (mapIndex === 0 && !settingsState.fixedFirstMapEnabled && settingsState.firstMapPickerPolicy === "interactive_random") {
    startInteractiveRandom("map_picker", 0);
    mapSelectorState = null;
  } else {
    openNextMapSelector();
  }
  dispatchRoomViewOperation(createRoomOperation("rest", "finished", {
    mapIndex,
    matchFinished: false,
    pickerSide: mapSelectorState?.pickerSide,
  }));
  renderCurrent();
}

function openNextMapSelector(): void {
  if (!currentState || getSeriesWinnerSide() !== null) {
    mapSelectorState = null;
    return;
  }

  const nextTargetIndex = findTargetMapIndex(currentState);
  if (nextTargetIndex === 0 && settingsState.fixedFirstMapEnabled) {
    const choice = findCatalogMapByName(settingsState.fixedFirstMapName);
    if (choice) {
      currentState.maps[0] = {
        ...currentState.maps[0],
        id: slugify(`${choice.mode}-${choice.nameEn}`),
        mode: choice.mode,
        modeIconUrl: getModeIconUrl(choice.mode),
        nameZh: getMapNameZh(choice.nameEn),
        nameEn: choice.nameEn,
        status: "after",
        imageUrl: choice.imageUrl,
      };
      mapSelectorState = null;
      openSideSelectorForMap(0);
      hiddenOverlay = null;
      return;
    }
  }
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
  localLineupDrafts[lineupSelectorState.mapIndex] ??= {};
  localLineupDrafts[lineupSelectorState.mapIndex][side] = {
    ...lineupSelectorState.values[side],
  };
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


function canConfirmLineupSelection(): boolean {
  if (!lineupSelectorState || isBroadcastPortal() || isRoomActionLocked() || (isAwaitingAdminDecision() && !isAdminPortal())) {
    return false;
  }

  if (isAdminPortal()) {
    return (["left", "right"] as Side[]).every(
      (side) => lineupSelectorState!.ready[side] || isSideLineupComplete(lineupSelectorState!.values[side]),
    );
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

async function finalizeLineupSelection(setByAdmin = false): Promise<void> {
  if (!lineupSelectorState) {
    return;
  }

  const mapIndex = lineupSelectorState.mapIndex;
  confirmedLineups[mapIndex] = cloneLineupValues(lineupSelectorState.values);
  delete localLineupDrafts[mapIndex];
  if (roomClient && authoritativeStore.status) {
    await dispatchRoomViewOperation(createRoomOperation("lineup", "confirmed", { mapIndex, setByAdmin }));
    return;
  }
  dispatchRoomViewOperation(createRoomOperation("lineup", "confirmed", { mapIndex, setByAdmin }));
  lineupSelectorState = null;
  openBanSelectorForMap(mapIndex);
  renderCurrent();
}

function chooseInteractiveRandomValue(side: Side, value: 0 | 1): void {
  if (!interactiveRandomState || interactiveRandomState.resolvedSide) return;
  if (isAdminPortal() && isAwaitingAdminDecision()) {
    if (interactiveRandomState.submitted[side]) return;
    interactiveRandomState.choices[side] = value;
    renderCurrent();
    return;
  }
  if (portalConfig.side !== side) return;
  submitInteractiveRandomChoice(value);
}

function resolveInteractiveRandomAsAdmin(): void {
  if (!interactiveRandomState || !isAdminPortal() || !isAwaitingAdminDecision()) return;
  const values = Object.fromEntries(
    (["left", "right"] as Side[])
      .filter((side) => !interactiveRandomState!.submitted[side])
      .map((side) => [side, interactiveRandomState!.choices[side]]),
  );
  if (Object.values(values).some((value) => value !== 0 && value !== 1)) return;
  void dispatchRoomViewOperation(createRoomOperation("admin", "interactive_random", { values }));
}


function canOperateBanOrderChoice(): boolean {
  if (!banSelectorState || banSelectorState.step !== "order-choice" || isRoomActionLocked() || (isAwaitingAdminDecision() && !isAdminPortal())) {
    return false;
  }

  if (banSelectorState.timedOut && !isAdminPortal()) {
    return false;
  }

  return isAdminPortal() || portalConfig.side === banSelectorState.chooserSide;
}

function canOperateHeroBan(): boolean {
  if (!banSelectorState || banSelectorState.step === "order-choice" || isRoomActionLocked() || (isAwaitingAdminDecision() && !isAdminPortal())) {
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
  if (!scoreSelectorState || (scoreSelectorState.timedOut && !isAdminPortal()) || isRoomActionLocked()) {
    return false;
  }

  if (isAdminPortal()) {
    return true;
  }
  if (isAwaitingAdminDecision()) return false;

  return Boolean(
    settingsState.scoreReportMode === "team_submit_opponent_confirm"
      && portalConfig.side
      && !scoreSelectorState.submittedBy,
  );
}

function canConfirmScoreSelection(): boolean {
  if (!scoreSelectorState || !isScoreComplete() || isBroadcastPortal() || isRoomActionLocked()) {
    return false;
  }

  if (isAdminPortal()) {
    return true;
  }
  if (isAwaitingAdminDecision()) return false;

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
      && !isRoomActionLocked()
      && !isAwaitingAdminDecision()
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


function syncMapSelectorTarget(keepExisting: boolean): void {
  if (!currentState || !roomStarted) {
    mapSelectorState = null;
    return;
  }

  if (getRoomViewPolicy()?.completed || getSeriesWinnerSide() !== null) {
    mapSelectorState = null;
    return;
  }

  if (sideSelectorState?.open || lineupSelectorState?.open || banSelectorState?.open || scoreSelectorState?.open || restState?.open) {
    return;
  }

  const targetMapIndex = findTargetMapIndex(currentState);

  if (targetMapIndex < 0) {
    mapSelectorState = null;
    return;
  }

  const pickerSide = getMapPickerSide(currentState, targetMapIndex);

  if (keepExisting && mapSelectorState?.targetMapIndex === targetMapIndex) {
    // The authoritative phase already names the acting team. Re-deriving it
    // from legacy match history can disagree during a timeout retry, especially
    // on MAP 1, and silently transfers the selector to the wrong portal.
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




function getBanSelectionSummary(): string {
  if (!banSelectorState) {
    return "";
  }

  if (banSelectorState.step === "order-choice") {
    return banSelectorState.selectedOrder === "first"
      ? `${getTeamName(banSelectorState.chooserSide)}选择先手禁用`
      : banSelectorState.selectedOrder === "second"
        ? `${getTeamName(banSelectorState.chooserSide)}选择后手禁用`
        : "请选择先手禁用或后手禁用";
  }

  const hero = findHeroByKey(banSelectorState.selectedHeroKey);
  return hero ? getHeroDisplayName(hero.nameEn) : "点击选择要禁用的英雄";
}

function getBanConfirmButtonLabel(): string {
  if (!banSelectorState) {
    return "确认";
  }

  if (isAwaitingAdminDecision()) {
    return "等待管理员裁定";
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

  return banSelectorState.step === "order-choice" ? "确认禁用顺序" : "确认禁用";
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

  if (isAwaitingAdminDecision() && !isAdminPortal()) {
    return "等待管理员裁定";
  }

  if (isAdminPortal()) {
    return isAwaitingAdminDecision() ? "管理员裁定并记录比分" : "确认并记录比分";
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


function applyCatalogHeroPoolDefaults(): void {
  const heroPool = buildHeroPoolFromCatalog();
  if (Object.values(heroPool).some((heroes) => heroes.length > 0)) {
    defaultSettings.heroPool = heroPool;
    if (!roomConfigState?.value && !currentState) {
      settingsState.heroPool = structuredClone(heroPool);
    }
  }
}

function toggleScoreTeamPause(side: Side): void {
  if (
    !scoreSelectorState
    || scoreSelectorState.submittedBy
    || pauseState.active
    || (!isAdminPortal() && portalConfig.side !== side)
  ) {
    return;
  }

  const scoreBodyScrollTop = document.querySelector<HTMLElement>('[data-pop-window-id="score"] .pop-window-body')?.scrollTop ?? 0;
  const now = Date.now();
  const teamPause = scoreSelectorState.teamPauses[side];
  const wasAnyPaused = isAnyScoreTeamPaused();

  if (teamPause.active) {
    teamPause.totalMs += teamPause.startedAt ? now - teamPause.startedAt : 0;
    teamPause.active = false;
    teamPause.startedAt = null;

    if (!isAnyScoreTeamPaused() && scoreSelectorState.countdownPauseStartedAt !== null) {
      scoreSelectorState.countdownPauseStartedAt = null;
    }
  } else {
    teamPause.active = true;
    teamPause.startedAt = now;
    teamPause.count += 1;
    if (!wasAnyPaused) {
      scoreSelectorState.countdownPauseStartedAt = now;
    }
  }

  dispatchRoomViewOperation(createRoomOperation("pause", teamPause.active ? "score_team_started" : "score_team_resumed", {
    mapIndex: scoreSelectorState.mapIndex,
    side,
    totalMs: teamPause.totalMs,
    count: teamPause.count,
  }));
  renderCurrent();
  const scoreBody = document.querySelector<HTMLElement>('[data-pop-window-id="score"] .pop-window-body');
  if (scoreBody) scoreBody.scrollTop = scoreBodyScrollTop;
}

function stopAllScoreTeamPauses(): void {
  if (!scoreSelectorState) {
    return;
  }
  const now = Date.now();
  (["left", "right"] as Side[]).forEach((side) => {
    const teamPause = scoreSelectorState!.teamPauses[side];
    if (!teamPause.active) {
      return;
    }
    teamPause.totalMs += teamPause.startedAt ? now - teamPause.startedAt : 0;
    teamPause.active = false;
    teamPause.startedAt = null;
  });
  scoreSelectorState.countdownPauseStartedAt = null;
}

function isAnyScoreTeamPaused(): boolean {
  return Boolean(scoreSelectorState?.teamPauses.left.active || scoreSelectorState?.teamPauses.right.active);
}

function getTeamPauseTotalMs(side: Side): number {
  if (!scoreSelectorState) {
    return 0;
  }
  const state = scoreSelectorState.teamPauses[side];
  return state.totalMs + (state.active && state.startedAt ? Date.now() - state.startedAt : 0);
}

function getTeamPauseCurrentMs(side: Side): number {
  const state = scoreSelectorState?.teamPauses[side];
  return state?.active && state.startedAt ? Date.now() - state.startedAt : 0;
}

function getMatchTeamPauseTotalMs(side: Side): number {
  return matchTeamPauseTotals[side] + getTeamPauseTotalMs(side);
}

function updateScorePauseDom(): void {
  if (!scoreSelectorState) {
    return;
  }
  (["left", "right"] as Side[]).forEach((side) => {
    const total = document.querySelector<HTMLElement>(`[data-score-pause-total="${side}"]`);
    const matchTotal = document.querySelector<HTMLElement>(`[data-score-pause-match-total="${side}"]`);
    const current = document.querySelector<HTMLElement>(`[data-score-pause-current="${side}"]`);
    if (total) total.textContent = formatDurationMs(getTeamPauseTotalMs(side));
    if (matchTotal) matchTotal.textContent = formatDurationMs(getMatchTeamPauseTotalMs(side));
    if (current) current.textContent = formatDurationMs(getTeamPauseCurrentMs(side));
  });
}


function getLegalBanHeroes(): HeroCatalogItem[] {
  return mapCatalogState.heroes.filter((hero) => getHeroBanAvailability(hero).available);
}

function getHeroBanAvailability(hero: HeroCatalogItem): MapAvailability {
  if (!currentState || !banSelectorState) {
    return { available: false, reason: "当前没有英雄禁用步骤" };
  }

  const heroKey = getHeroKey(hero.nameEn);
  const activeSide = banSelectorState.activeSide;
  const heroPool = Object.values(settingsState.heroPool ?? {}).flat().map(getHeroKey);

  if (!heroPool.includes(heroKey)) {
    return { available: false, reason: "该英雄不在本场禁用英雄池" };
  }

  if (hasSideBannedHero(activeSide, heroKey, banSelectorState.mapIndex)) {
    return { available: false, reason: `${getTeamName(activeSide)}本场已禁用过` };
  }

  const opponentBan = currentState.maps[banSelectorState.mapIndex].bans[getOppositeSide(activeSide)];
  if (opponentBan && getHeroKey(opponentBan.nameEn) === heroKey) {
    return { available: false, reason: "对手本轮已禁用" };
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

  const message = `${reason}，${getTeamName(loserSide)}本张地图判负。`;
  createTeamAckNotice(message);
}

function getMapConfirmButtonLabel(): string {
  if (!mapSelectorState) {
    return "确认选择";
  }

  if (isAwaitingAdminDecision()) {
    return "等待管理员裁定";
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

  if (isAwaitingAdminDecision()) {
    return "等待管理员裁定";
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

  return `确认${side === "left" ? "队伍1" : "队伍2"}阵容`;
}

function getTeamName(side: Side): string {
  return currentState?.teams[side].name ?? (side === "left" ? "左侧队伍" : "右侧队伍");
}


function resolveOpeningSide(): Side {
  if (settingsState.openingSidePolicy === "follow_map_picker") {
    return firstMapPickerSide;
  }
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
  if (countdownTextTimerId !== null) {
    window.clearTimeout(countdownTextTimerId);
    countdownTextTimerId = null;
  }
  updateCountdownDom();
}

function getCountdownSnapshot(): { remaining: number; percent: number } {
  return authoritativeStore.runtime
    ? countdownPresentationClock.snapshot(authoritativeStore.runtime)
    : { remaining: 0, percent: 0 };
}

function updateCountdownDom(authoritativeMode: "adjust" | "reset" = "reset"): void {
  const { remaining, percent } = getCountdownSnapshot();
  restartAuthoritativeCountdownAnimation(percent, remaining * 1000, authoritativeMode);
  scheduleAuthoritativeCountdownText();
  updateAuthoritativePauseDom();
  ensurePauseDisplayTimer();
}

function ensurePauseDisplayTimer(): void {
  if (pauseDisplayTimerId !== null || (!pauseState.active && !isAnyScoreTeamPaused())) {
    return;
  }

  pauseDisplayTimerId = window.setInterval(() => {
    if (!pauseState.active && !isAnyScoreTeamPaused()) {
      if (pauseDisplayTimerId !== null) {
        window.clearInterval(pauseDisplayTimerId);
        pauseDisplayTimerId = null;
      }
      return;
    }

    updateAuthoritativePauseDom();
  }, 250);
}

function isAuthoritativeCountdownRunning(runtime: AuthoritativeRuntime): boolean {
  return runtime.totalTimeMs > 0
    && runtime.remainingTimeMs > 0
    && !runtime.awaitingAdminDecision
    && !runtime.pause.global.active
    && !runtime.pause.scoreTeams.left.active
    && !runtime.pause.scoreTeams.right.active;
}

function restartAuthoritativeCountdownAnimation(
  startPercent: number,
  displayedRemainingMs: number,
  _mode: "adjust" | "reset",
): void {
  const runtime = authoritativeStore.runtime;
  if (!runtime) return;
  const durationMs = Math.max(0, displayedRemainingMs);
  const shouldRun = isAuthoritativeCountdownRunning(runtime) && durationMs > 0;

  document
    .querySelectorAll<HTMLElement>("[data-pop-window-progress]")
    .forEach((element) => {
      element.classList.remove("countdown-progress-ready");
      element.style.setProperty("--progress-width", `${startPercent}%`);
      const bar = element.querySelector<HTMLElement>(".countdown-bar");
      if (!bar) return;
      bar.getAnimations().forEach((animation) => animation.cancel());
      bar.style.width = `${startPercent}%`;
      if (shouldRun) {
        bar.animate(
          [{ width: `${startPercent}%` }, { width: "0%" }],
          { duration: durationMs, easing: "linear", fill: "forwards" },
        );
      }
    });
}

function scheduleAuthoritativeCountdownText(): void {
  if (countdownTextTimerId !== null) {
    window.clearTimeout(countdownTextTimerId);
    countdownTextTimerId = null;
  }
  const runtime = authoritativeStore.runtime;
  if (!runtime) return;

  const remainingMs = countdownPresentationClock.snapshot(runtime).remaining * 1000;
  document
    .querySelectorAll<HTMLTimeElement>(".countdown-time")
    .forEach((element) => {
      element.textContent = formatCountdown(remainingMs / 1000);
    });

  if (!isAuthoritativeCountdownRunning(runtime) || remainingMs <= 0) return;
  const delayMs = countdownPresentationClock.millisecondsUntilNextSecond(runtime);
  if (delayMs !== null) {
    countdownTextTimerId = window.setTimeout(
      scheduleAuthoritativeCountdownText,
      Math.max(16, delayMs + 5),
    );
  }
}

function updateAuthoritativePauseDom(): void {
  document
    .querySelectorAll<HTMLElement>(".pause-elapsed")
    .forEach((element) => {
      element.textContent = formatElapsedPause();
    });
  document
    .querySelectorAll<HTMLElement>(".pause-total-elapsed")
    .forEach((element) => {
      element.textContent = formatGlobalPause();
    });
  updateScorePauseDom();
}

function updateSelectedMapDom(): void {
  if (!mapSelectorState) {
    return;
  }

  app.querySelectorAll<HTMLButtonElement>(".map-option").forEach((button) => {
    button.classList.toggle("map-option-selected", button.dataset.mapKey === mapSelectorState?.selectedMapKey);
  });

  const selectedChoice = findMapChoiceByKey(mapSelectorState.selectedMapKey);
  const summary = document.querySelector<HTMLElement>('[data-pop-window-id="map-select"] .pop-window-footer-copy strong');
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

function extendLineupChoiceTime(): void {
  if (!lineupSelectorState) {
    return;
  }

  lineupSelectorState.timedOut = false;
  dispatchRoomViewOperation(createRoomOperation("lineup", "timeout_extended", {
    mapIndex: lineupSelectorState.mapIndex,
    seconds: settingsState.stageLimits.timeoutExtensionSeconds,
    incompleteSide: lineupSelectorState.ready.left ? "right" : "left",
  }));
  renderCurrent();
}

function forfeitIncompleteLineup(): void {
  if (!currentState || !lineupSelectorState) {
    return;
  }

  const loserSide: Side | null = lineupSelectorState.ready.left && !lineupSelectorState.ready.right
    ? "right"
    : lineupSelectorState.ready.right && !lineupSelectorState.ready.left
      ? "left"
      : null;

  if (!loserSide) {
    lineupSelectorState.values = createInitialLineupValues();
    lineupSelectorState.ready = createLineupReadyState();
    lineupSelectorState.timedOut = false;
    dispatchRoomViewOperation(createRoomOperation("lineup", "both_sides_restarted", {
      mapIndex: lineupSelectorState.mapIndex,
      seconds: settingsState.stageLimits.playerSelectSeconds,
    }));
    renderCurrent();
    return;
  }

  const mapIndex = lineupSelectorState.mapIndex;
  applyForfeitMapLoss(mapIndex, loserSide, "上场成员选择超时");
  lineupSelectorState = null;
  selectionConfirmationState = null;
  if (finishMatchIfSeriesWon()) {
    dispatchRoomViewOperation(createRoomOperation("lineup", "forfeited", { mapIndex, loserSide, matchFinished: true }));
    renderCurrent();
    return;
  }
  openRestPeriod(mapIndex);
  dispatchRoomViewOperation(createRoomOperation("lineup", "forfeited", { mapIndex, loserSide, matchFinished: false }));
  renderCurrent();
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
    matchTotalPausedMs: pauseState.matchTotalPausedMs,
    collapsed: false,
  };
  dispatchRoomViewOperation(createRoomOperation("pause", "started"));
  renderCurrent();
}

function resumeGlobalPause(): void {
  if (!pauseState.active) {
    return;
  }

  const elapsedMs = pauseState.startedAt ? Date.now() - pauseState.startedAt : 0;
  pauseState = {
    active: false,
    startedAt: null,
    totalPausedMs: pauseState.totalPausedMs + elapsedMs,
    matchTotalPausedMs: pauseState.matchTotalPausedMs + elapsedMs,
    collapsed: false,
  };
  dispatchRoomViewOperation(createRoomOperation("pause", "resumed"));
  renderCurrent();
}

function createTeamAckNotice(message: string): void {
  void message;
}

function formatElapsedPause(): string {
  const elapsedMs = pauseState.totalPausedMs + (pauseState.active && pauseState.startedAt ? Date.now() - pauseState.startedAt : 0);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatGlobalPause(): string {
  const elapsedMs = pauseState.matchTotalPausedMs
    + (pauseState.active && pauseState.startedAt ? Date.now() - pauseState.startedAt : 0);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
