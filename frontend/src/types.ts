import type { SyncResponse } from "./state/protocol";

export type Side = "left" | "right";
export type MapStatus = "completed" | "after" | "tbd";
export type ScoreValue = number | string | null;
export type MapSelectionMode =
  | "unique_map"
  | "unique_mode_until_cycle"
  | "first_mode_then_unique_mode"
  | "strict_mode_order"
  | "fixed_map_order";
export type PlayerInputMode = "free_input" | "preset_only" | "skip";
export type FirstBanPolicy = "allow_loser_choose" | "loser_must_first";
export type LineupRole = "damage" | "tank" | "support";
export type PortalRole = "red-team" | "blue-team" | "admin" | "broadcast";
export type AppMode = "landing" | "room" | "global-admin" | "debug";
export type BanStep = "order-choice" | "first-ban" | "second-ban";
export type BanOrderChoice = "first" | "second";
export type ScoreReportMode = "admin_only" | "team_submit_opponent_confirm";
export type OverlayKind = "prepare" | "map" | "side" | "lineup" | "ban" | "score" | "rest";
export type CheckpointKey = keyof SettingsState["checkpoints"][number];
export type MatchFormat = "ft2" | "ft3" | "ft4";
export type SidePolicy = "random" | "interactive_random" | "left" | "right";
export type InitialPriorityPolicy = "system_random" | "interactive_random" | "left" | "right";
export type PriorityRelation = "priority" | "non_priority";
export type OpeningSidePolicy = SidePolicy | "follow_map_picker";
export type FirstMapPickerPolicy = SidePolicy;
export type MapPickerPolicy = "loser_choose";
export type FirstSideChoicePolicy = "none" | "map_picker" | "left" | "right" | "left_attack" | "left_defense";
export type SubsequentSideChoicePolicy = "previous_winner" | "previous_loser";
export type MapTimeoutPolicy = "warn_extend_30" | "random_legal_map" | "forfeit_map" | "admin_decision";
export type LineupTimeoutPolicy = "retry_after_delay" | "forfeit_map" | "admin_decision";
export type BanTimeoutPolicy = "warn_extend_30" | "random_legal_ban" | "forfeit_map" | "admin_decision";
export type SideTimeoutPolicy = "random_legal_choice" | "chooser_blue_defense" | "chooser_red_attack" | "admin_decision" | "retry_after_delay" | "forfeit_map";
export type BanOrderTimeoutPolicy = "random_legal_order" | "advantage_first" | "advantage_second" | "admin_decision" | "retry_after_delay" | "forfeit_map";
export type BanActionTimeoutPolicy = "random_legal_hero" | "retry_after_delay" | "forfeit_map" | "admin_decision";
export type InteractiveRandomPurpose = "map_picker" | "opening_ban" | "side_choice";
export type OperationCategory = "room" | "settings" | "map" | "lineup" | "ban" | "score" | "rest" | "pause" | "admin" | "notice" | "ui";

export interface TeamState {
  id: string;
  name: string;
  seriesScore: number;
  seed: number;
}

export interface HeroBan {
  hero: string;
  nameEn: string;
  role: string;
  imageUrl: string;
}

export interface MatchMap {
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
  sideChoiceKind: "attack_defense" | "color" | null;
  selectedSide: Side | null;
}

export interface MatchState {
  roomCode: string;
  matchName: string;
  phase: string;
  currentCountdownSeconds: number;
  currentOperation: string;
  teams: Record<Side, TeamState>;
  maps: MatchMap[];
}

export interface StageSetting {
  preStartRestSeconds: number;
  interactiveRandomSeconds: number;
  mapSelectSeconds: number;
  sidePickSeconds: number;
  playerSelectSeconds: number;
  firstBanChoiceSeconds: number;
  firstBanActionSeconds: number;
  secondBanActionSeconds: number;
  scoreConfirmSeconds: number;
  postMatchRestSeconds: number;
  timeoutExtensionSeconds: number;
}

export interface CheckpointConfig {
  enabled: boolean;
  label: string;
}

export interface SettingsState {
  matchName: string;
  teams: Record<Side, string>;
  matchFormat: MatchFormat;
  startWithDefaultConfig: boolean;
  teamsCanEditOwnName: boolean;
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
  heroPool: Record<string, string[]>;
  mapSelectionMode: MapSelectionMode;
  firstMapMode: string;
  modeOrder: string[];
  fixedMapOrderText: string;
  fixedFirstMapEnabled: boolean;
  fixedFirstMapName: string;
  initialPriorityPolicy: InitialPriorityPolicy;
  subsequentPriorityPolicy: "previous_loser" | "previous_winner";
  mapPickTimeoutPolicy: "retry_after_delay" | "random_legal_map" | "forfeit_map" | "admin_decision";
  interactiveRandomMissingInputPolicy: "use_zero" | "server_random" | "admin_decision";
  firstMapSideChoiceEnabled: boolean;
  sideChooserRelation: PriorityRelation;
  sideTimeoutPolicy: SideTimeoutPolicy;
  firstMapPickerPolicy: FirstMapPickerPolicy;
  mapPickerPolicy: MapPickerPolicy;
  mapTimeoutPolicy: MapTimeoutPolicy;
  symmetricSideChoiceEnabled: boolean;
  firstSideChoicePolicy: FirstSideChoicePolicy;
  subsequentSideChoicePolicy: SubsequentSideChoicePolicy;
  rosterMode: PlayerInputMode;
  presetRosterText: string;
  lineupTimeoutPolicy: LineupTimeoutPolicy;
  banEnabled: boolean;
  banAdvantageRelation: PriorityRelation;
  banOrderPolicy: "advantage_chooses" | "advantage_must_first";
  banOrderTimeoutPolicy: BanOrderTimeoutPolicy;
  banActionTimeoutPolicy: BanActionTimeoutPolicy;
  firstBanPolicy: FirstBanPolicy;
  openingSidePolicy: OpeningSidePolicy;
  banTimeoutPolicy: BanTimeoutPolicy;
  scoreReportMode: ScoreReportMode;
  scoreConfirmationTimeoutPolicy: "auto_confirm" | "admin_decision";
  globalPauseEnabled: boolean;
  teamPauseEnabled: boolean;
  teamPauseMaxCountPerMap: number | null;
  teamPauseMaxSingleSeconds: number | null;
  teamPauseMaxTotalSeconds: number | null;
  rollbackEnabled: boolean;
  allowRollbackAfterCompletion: boolean;
}

export interface ModeIcon {
  mode: string;
  imageUrl: string;
}

export interface MapCatalogItem {
  mode: string;
  nameEn: string;
  sideSelectionKind: "attack_defense" | "red_blue" | "none";
  imageUrl: string;
  pageUrl?: string;
  fileName?: string;
}

export interface HeroCatalogItem {
  nameEn: string;
  role: string;
  roleZh: string;
  imageUrl: string;
}

export interface CatalogTranslation {
  active: boolean;
  modes: Record<string, string>;
  maps: Record<string, string>;
  heroes: Record<string, string>;
}

export interface TranslationDiagnostics {
  valid: boolean;
  versionMismatch: boolean;
  hashMismatch: boolean;
  missing: Record<"modes" | "maps" | "heroes", string[]>;
  extra: Record<"modes" | "maps" | "heroes", string[]>;
  blank: Record<"modes" | "maps" | "heroes", string[]>;
  typeErrors: string[];
}

export interface CatalogRefreshJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progress: number;
  message: string;
  error: string | null;
  result?: {
    counts: { modes: number; maps: number; heroes: number };
    catalogHash: string;
    translationTemplate: Record<string, unknown>;
  } | null;
}

export interface CatalogMaintenance {
  catalogHash: string;
  catalogSource: "runtime" | "bundled";
  sources: Record<string, string>;
  updatedAt: number | null;
  counts: { modes: number; maps: number; heroes: number };
  translation: {
    source: "runtime" | "bundled";
    active: boolean;
    diagnostics: TranslationDiagnostics;
    document: Record<string, unknown>;
  };
  translationTemplate: Record<string, unknown>;
  job: CatalogRefreshJob | null;
}

export interface MapCatalogState {
  modes: string[];
  modeIcons: Record<string, ModeIcon>;
  roleIcons: Record<string, ModeIcon>;
  maps: Record<string, MapCatalogItem[]>;
  heroes: HeroCatalogItem[];
  catalogHash: string;
  locale: "zh-CN" | "en";
  translation: CatalogTranslation;
}

export interface MapChoice extends MapCatalogItem {
  key: string;
  modeIconUrl: string | null;
}

export interface MapAvailability {
  available: boolean;
  reason: string;
}

export interface MapSelectorState {
  open: boolean;
  minimized: boolean;
  selectedMapKey: string | null;
  targetMapIndex: number;
  pickerSide: Side;
  timedOut: boolean;
}

export interface LineupSlot {
  id: string;
  role: LineupRole;
  label: string;
}

export interface LineupSelectorState {
  open: boolean;
  mapIndex: number;
  values: Record<Side, Record<string, string>>;
  ready: Record<Side, boolean>;
  timedOut: boolean;
}

export interface BanSelectorState {
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

export interface ScoreSelectorState {
  open: boolean;
  mapIndex: number;
  values: Record<Side, string>;
  submittedBy: Side | null;
  rejectedBy: Side | null;
  timedOut: boolean;
  teamPauses: Record<Side, TeamPauseState>;
  countdownPauseStartedAt: number | null;
}

export interface SideSelectorState {
  open: boolean;
  mapIndex: number;
  pickerSide: Side;
  choiceKind: "attack_defense" | "color";
  selectedSide: Side | null;
}

export interface TeamPauseState {
  active: boolean;
  startedAt: number | null;
  totalMs: number;
  count: number;
}

export type SelectionConfirmationKind = "map" | "lineup" | "ban" | "room-config-rollback" | "room-preset-import";

export interface SelectionConfirmationState {
  kind: SelectionConfirmationKind;
  presetId?: string;
}

export interface RestState {
  open: boolean;
  mapIndex: number;
  skipReady: Record<Side, boolean>;
}

export interface InteractiveRandomState {
  purpose: InteractiveRandomPurpose;
  mapIndex: number;
  choices: Record<Side, 0 | 1 | null>;
  submitted: Record<Side, boolean>;
  resolvedSide: Side | null;
}

export interface PauseState {
  active: boolean;
  startedAt: number | null;
  totalPausedMs: number;
  matchTotalPausedMs: number;
  collapsed: boolean;
}

export interface TeamAckNotice {
  message: string;
  acknowledged: Record<Side, boolean>;
}

export type ConfirmedLineups = Record<number, Record<Side, Record<string, string>>>;

export interface PortalConfig {
  code: string;
  role: PortalRole;
  label: string;
  side: Side | null;
}

/** UI-facing projection of the authoritative room state; never persisted in the browser. */
export interface RoomViewSnapshot {
  roomStarted: boolean;
  currentState: MatchState;
  settingsState: SettingsState;
  confirmedLineups: ConfirmedLineups;
  mapSelectorState: MapSelectorState | null;
  sideSelectorState: SideSelectorState | null;
  lineupSelectorState: LineupSelectorState | null;
  banSelectorState: BanSelectorState | null;
  scoreSelectorState: ScoreSelectorState | null;
  matchTeamPauseTotals?: Record<Side, number>;
  restState: RestState | null;
  pauseState: PauseState;
  teamAckNotice: TeamAckNotice | null;
  firstMapPickerSide: Side;
  interactiveRandomState: InteractiveRandomState | null;
  interactiveRandomResults: Partial<Record<string, Side>>;
}

export interface RoomOperation {
  category: OperationCategory;
  action: string;
  details: Record<string, unknown>;
}

export interface RoomLinkInfo {
  hash: string;
  url: string;
  role: PortalRole;
  label: string;
  side: Side | null;
}

export interface CreatedRoomResponse {
  roomId: string;
  createdAt: number;
  lastActiveAt: number;
  links: Record<string, RoomLinkInfo>;
}

export interface RoomTokenResponse {
  room: {
    id: string;
    createdAt: number;
    lastActiveAt: number;
    closedAt: number | null;
    settings: unknown;
    config: RoomConfigState;
    presence?: RoomPresenceState;
  };
  portal: PortalConfig;
  authoritativeState: SyncResponse;
  notificationDurationSeconds?: number;
}

export interface RoomPresenceEntry {
  connected: boolean;
  ready: boolean;
  nameConfirmed: boolean;
  lastSeenAt: number;
}

export type RoomPresenceState = Record<"A" | "B" | "C", RoomPresenceEntry>;

export interface AdminSettings {
  roomsPerHour: number;
  inactiveTimeoutMinutes: number;
  notificationDurationSeconds: number;
  defaultSettings: unknown;
  defaultPresetId: string | null;
}

export type RoomConfigStatus = "draft" | "ready" | "locked";

export interface ConfigPreset {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  config: SettingsState;
}

export interface RoomConfigState {
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

export interface AdminRoom {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  closedAt: number | null;
  version: number;
  links: Record<string, RoomLinkInfo>;
}

export interface RoomHistorySummary {
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

export interface RoomHistoryPage {
  items: RoomHistorySummary[];
  total: number;
  page: number;
  pageSize: number;
}
