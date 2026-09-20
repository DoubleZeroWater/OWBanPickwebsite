from __future__ import annotations

from typing import Literal, TypeAlias, TypedDict


JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
Side: TypeAlias = Literal["left", "right"]
PortalCode: TypeAlias = Literal["A", "B", "C", "D"]
RoomTokens: TypeAlias = dict[PortalCode, str]
HeroPool: TypeAlias = dict[str, list[str]]
MapCapabilities: TypeAlias = dict[str, str]
Lineup: TypeAlias = dict[str, str]
Score: TypeAlias = dict[Side, int]


class ValidationIssue(TypedDict):
    path: str
    message: str


class CheckpointRule(TypedDict):
    enabled: bool
    label: str


class LegacyMatchConfig(TypedDict):
    matchName: str
    teams: dict[Side, str]
    matchFormat: str
    startWithDefaultConfig: bool
    teamsCanEditOwnName: bool
    stageCount: int
    checkpoints: list[dict[str, CheckpointRule]]
    stageLimits: dict[str, int]
    mapPool: dict[str, list[str]]
    mapSelectionMode: str
    firstMapMode: str
    modeOrder: list[str]
    fixedMapOrderText: str
    fixedFirstMapEnabled: bool
    fixedFirstMapName: str
    firstMapPickerPolicy: str
    mapPickerPolicy: str
    mapTimeoutPolicy: str
    symmetricSideChoiceEnabled: bool
    firstSideChoicePolicy: str
    subsequentSideChoicePolicy: str
    rosterMode: str
    presetRosterText: str
    lineupTimeoutPolicy: str
    banEnabled: bool
    firstBanPolicy: str
    openingSidePolicy: str
    banTimeoutPolicy: str
    scoreReportMode: str


class Operation(TypedDict):
    category: str
    action: str
    details: JsonObject


class HistoryActor(TypedDict):
    type: str
    portalCode: PortalCode | None
    role: str


class CommandContext(TypedDict):
    epoch: int
    phaseId: str
    runtimeId: str


class CommandPayload(TypedDict, total=False):
    active: bool
    choice: str
    force: bool
    heroId: str
    lineup: Lineup
    lineups: dict[Side, Lineup]
    loserSide: Side
    mapId: str
    name: str
    ready: bool
    resolution: str
    reason: str
    score: Score
    selectedSide: Side
    side: Side
    value: int
    winnerSide: Side
    values: dict[Side, int]


class ClientCheck(TypedDict, total=False):
    epoch: int
    boardHash: str
    factsHash: str
    phaseId: str
    runtimeId: str
    runtimeSeq: int
    presenceHash: str
    privateHash: str


class StatusRef(TypedDict):
    epoch: int
    revision: int
    hash: str
    phaseId: str
    runtimeId: str


class NotificationActor(TypedDict):
    kind: str
    portalCode: PortalCode | None
    role: str
    side: Side | None


class NotificationEvent(TypedDict):
    eventId: str
    sequence: int
    eventType: str
    actor: NotificationActor
    payload: JsonObject
    occurredAt: int
    statusVersion: StatusRef


class TimingConfig(TypedDict):
    preMatchRestSeconds: int
    interMapRestSeconds: int
    interactiveRandomSeconds: int
    mapPickSeconds: int
    sidePickSeconds: int
    lineupSubmitSeconds: int
    banOrderSeconds: int
    firstBanSeconds: int
    secondBanSeconds: int
    scoreConfirmationSeconds: int
    timeoutExtensionSeconds: int


class MapConfig(TypedDict):
    mapPool: dict[str, list[str]]
    selectionPolicy: str
    firstMapMode: str
    modeOrder: list[str]
    fixedMapOrder: list[str]
    fixedFirstMapEnabled: bool
    fixedFirstMapId: str | None
    initialPriorityPolicy: str
    subsequentPriorityPolicy: str
    mapPickTimeoutPolicy: str
    interactiveRandomMissingInputPolicy: str


class SideChoiceConfig(TypedDict):
    firstMapSideChoiceEnabled: bool
    symmetricSideChoiceEnabled: bool
    chooserRelation: str
    timeoutPolicy: str


class LineupConfig(TypedDict):
    mode: str
    presetRosters: dict[Side, list[str]]
    timeoutPolicy: str


class BanConfig(TypedDict):
    enabled: bool
    advantageRelation: str
    orderPolicy: str
    orderTimeoutPolicy: str
    actionTimeoutPolicy: str


class ScoreConfig(TypedDict):
    confirmationTimeoutPolicy: str


class PauseConfig(TypedDict):
    globalPauseEnabled: bool
    teamPauseEnabled: bool
    teamPauseMaxCountPerMap: int | None
    teamPauseMaxSingleSeconds: int | None
    teamPauseMaxTotalSeconds: int | None


class RollbackConfig(TypedDict):
    enabled: bool
    defaultCheckpoints: list[str]
    mapOverrides: JsonObject
    allowAfterCompletion: bool


class MatchConfig(TypedDict):
    schemaVersion: int
    matchName: str
    teamNames: dict[Side, str]
    matchFormat: str
    startPolicy: str
    teamsCanEditOwnName: bool
    timing: TimingConfig
    map: MapConfig
    sideChoice: SideChoiceConfig
    lineup: LineupConfig
    ban: BanConfig
    score: ScoreConfig
    pause: PauseConfig
    rollback: RollbackConfig
    _heroPool: HeroPool
    _mapCapabilities: MapCapabilities


class TeamFacts(TypedDict):
    id: str
    name: str
    seed: int
    seriesScore: int


class MapBans(TypedDict):
    firstBanSide: Side | None
    leftHeroId: str | None
    rightHeroId: str | None


class MapFacts(TypedDict):
    index: int
    status: str
    mapId: str | None
    modeId: str | None
    pickerSide: Side | None
    sideChoice: JsonObject | None
    lineups: dict[Side, Lineup] | None
    bans: MapBans
    score: Score | None
    resultType: str | None
    winnerSide: Side | None
    forfeitSide: Side | None
    forfeitReason: str | None


class MatchDecisions(TypedDict):
    initialPrioritySide: Side | None
    firstMapPickerSide: Side | None
    firstMapSidePickerSide: Side | None
    openingBanSide: Side | None


class MatchFacts(TypedDict):
    teams: dict[Side, TeamFacts]
    decisions: MatchDecisions
    winnerSide: Side | None
    maps: list[MapFacts]


class PhaseState(TypedDict):
    phaseId: str
    type: str
    mapIndex: int | None
    actorSide: Side | Literal["both"] | None
    data: JsonObject


class RoomStatusData(TypedDict):
    schemaVersion: int
    roomId: str
    epoch: int
    revision: int
    hash: str
    catalogHash: str
    lifecycle: str
    config: MatchConfig
    match: MatchFacts
    phase: PhaseState


class PresenceEntry(TypedDict, total=False):
    connected: bool
    lastSeenAt: int
    nameConfirmed: bool
    ready: bool
    role: str
    side: Side | None


PresenceMap: TypeAlias = dict[PortalCode, PresenceEntry]


class TeamPause(TypedDict):
    active: bool
    phaseTotalMs: int
    matchTotalMs: int
    count: int


class GlobalPause(TypedDict):
    active: bool
    totalMs: int


RuntimePause = TypedDict("RuntimePause", {"global": GlobalPause, "scoreTeams": dict[Side, TeamPause]})


class RoomRuntimeData(TypedDict):
    baseStatusRevision: int
    baseStatusHash: str
    phaseId: str
    runtimeId: str
    runtimeSeq: int
    totalTimeMs: int
    remainingTimeMs: int
    pause: RuntimePause
    presence: dict[PortalCode, PresenceEntry]
    interactiveRandom: JsonObject | None
    interactiveRandomResult: JsonObject | None
    lineupSubmissions: dict[Side, Lineup | None]
    scoreProposal: JsonObject | None
    restSkip: dict[Side, bool]
    timedOut: bool
    awaitingAdminDecision: bool


class RoomConfigState(TypedDict, total=False):
    schemaVersion: int
    revision: int
    status: str
    value: MatchConfig
    source: JsonObject
    confirmedAt: int | None
    lockedAt: int | None
    events: list[JsonObject]


class ConfigSource(TypedDict, total=False):
    type: str
    presetId: str
    presetName: str
    presetRevision: int


class RoomRecord(TypedDict, total=False):
    id: str
    tokens: RoomTokens
    archiveKey: str
    status: str
    createdAt: int
    lastActiveAt: int
    closedAt: int | None
    closeReason: str | None
    version: int
    snapshot: JsonObject | None
    settings: MatchConfig
    config: RoomConfigState
    presence: PresenceMap


class GlobalSettings(TypedDict, total=False):
    roomsPerHour: int
    inactiveTimeoutMinutes: int
    notificationDurationSeconds: int
    defaultSettings: JsonObject | None
    defaultPresetId: str | None


class RoomStore(TypedDict):
    schemaVersion: int
    adminHash: str
    globalSettings: GlobalSettings
    createLog: dict[str, list[int]]
    rooms: list[RoomRecord]


class ConfigPreset(TypedDict, total=False):
    schemaVersion: int
    id: str
    name: str
    description: str
    revision: int
    createdAt: int
    updatedAt: int
    config: MatchConfig
    migration: JsonObject


class HistoryEvent(TypedDict, total=False):
    sequence: int
    timestamp: int
    version: int
    actor: HistoryActor
    operation: Operation
    snapshot: JsonObject | None
    config: RoomConfigState


class HistoryDocument(TypedDict, total=False):
    schemaVersion: int
    archiveKey: str
    roomId: str
    tokens: RoomTokens
    status: str
    createdAt: int
    updatedAt: int
    lastActiveAt: int
    closedAt: int | None
    closeReason: str | None
    currentVersion: int
    currentSnapshot: JsonObject | None
    currentConfig: RoomConfigState
    history: list[HistoryEvent]


class HistorySummary(TypedDict, total=False):
    archiveKey: str
    roomId: str
    tokens: RoomTokens
    status: str
    createdAt: int
    updatedAt: int
    lastActiveAt: int
    closedAt: int | None
    closeReason: str | None
    currentVersion: int
    operationCount: int


class HistoryIndex(TypedDict):
    schemaVersion: int
    items: dict[str, HistorySummary]


class CatalogMap(TypedDict, total=False):
    mode: str
    nameEn: str
    sideSelectionKind: str
    imageUrl: str
    pageUrl: str
    fileName: str


class CatalogHero(TypedDict, total=False):
    nameEn: str
    role: str
    roleZh: str
    imageUrl: str


class CatalogAssets(TypedDict, total=False):
    modes: list[str]
    modeIcons: dict[str, JsonObject]
    roleIcons: dict[str, JsonObject]
    maps: dict[str, list[CatalogMap]]
    heroes: list[CatalogHero]
    sources: JsonObject
    updatedAt: int


class CatalogRefreshJob(TypedDict, total=False):
    id: str
    status: str
    stage: str
    progress: int
    message: str
    createdAt: int
    startedAt: int | None
    finishedAt: int | None
    error: str | None
    result: JsonObject | None
