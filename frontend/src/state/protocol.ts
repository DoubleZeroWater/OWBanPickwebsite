export type Side = "left" | "right";
export type PortalCode = "A" | "B" | "C" | "D";

export interface StateCheck {
  epoch: number;
  boardHash: string;
  factsRevision: number;
  factsHash: string;
  phaseId: string;
  runtimeId: string;
  runtimeSeq: number;
  presenceHash: string;
  privateHash: string;
}

export interface CommandContext {
  epoch: number;
  phaseId: string;
  runtimeId: string;
  check: StateCheck;
}

/** Compatibility shape used by history/notification rendering only. */
export interface StatusRef {
  epoch: number;
  revision: number;
  hash: string;
  phaseId: string;
}

export interface AuthoritativePhase {
  phaseId: string;
  type:
    | "configuring" | "waiting_ready" | "pre_start_rest" | "interactive_random"
    | "map_pick" | "side_pick" | "lineup_pick" | "ban_order" | "ban_first"
    | "ban_second" | "score_entry" | "score_confirmation" | "post_map_rest"
    | "admin_decision" | "completed";
  mapIndex: number | null;
  actorSide: Side | "both" | null;
  data: Record<string, unknown>;
}

export interface AuthoritativeMap {
  index: number;
  status: "pending" | "selected" | "completed" | "forfeited";
  mapId: string | null;
  modeId: string | null;
  pickerSide: Side | null;
  sideChoice: null | {
    kind: "attack_defense" | "color" | "none";
    chooserSide: Side;
    selectedSide: Side;
    automatic?: boolean;
  };
  lineups: null | Record<Side, Record<string, string>>;
  bans: { firstBanSide: Side | null; leftHeroId: string | null; rightHeroId: string | null };
  score: null | Record<Side, number>;
  resultType: "score" | "forfeit" | null;
  winnerSide: Side | null;
  forfeitSide: Side | null;
  forfeitReason: string | null;
}

export interface BaseboardSegment {
  schemaVersion: 1;
  roomId: string;
  catalogHash: string;
  configVersion: number;
  configHash: string;
  boardHash: string;
  config: Record<string, unknown>;
}

export interface MatchFactsSegment {
  epoch: number;
  revision: number;
  factsHash: string;
  lifecycle: "preparing" | "running" | "completed";
  match: {
    teams: Record<Side, { id: string; name: string; seed: number; seriesScore: number }>;
    decisions: {
      firstMapPickerSide: Side | null;
      firstMapSidePickerSide: Side | null;
      openingBanSide: Side | null;
      initialPrioritySide?: Side | null;
    };
    winnerSide: Side | null;
    maps: AuthoritativeMap[];
  };
}

/** Local projection assembled from independently checked network segments. */
export interface AuthoritativeStatus {
  schemaVersion: 2;
  roomId: string;
  epoch: number;
  revision: number;
  hash: string;
  catalogHash: string;
  lifecycle: "preparing" | "running" | "completed";
  config: Record<string, unknown>;
  match: MatchFactsSegment["match"];
  phase: AuthoritativePhase;
}

export interface AuthoritativeRuntime {
  baseStatusRevision: number;
  baseStatusHash: string;
  phaseId: string;
  runtimeId: string;
  runtimeSeq: number;
  totalTimeMs: number;
  remainingTimeMs: number;
  pause: {
    global: { active: boolean; totalMs: number };
    scoreTeams: Record<Side, { active: boolean; phaseTotalMs: number; matchTotalMs: number; count: number }>;
  };
  presence: Record<PortalCode, { connected: boolean; ready: boolean; nameConfirmed: boolean; lastSeenAt: number }>;
  interactiveRandom: Record<Side, 0 | 1 | null> | null;
  interactiveRandomSubmitted?: Record<Side, boolean> | null;
  interactiveRandomResult: { left: 0 | 1; right: 0 | 1; resultSide: Side } | null;
  lineupSubmissions: Record<Side, Record<string, string> | null>;
  lineupSubmitted?: Record<Side, boolean>;
  scoreProposal: null | { submittedBy: Side; score: Record<Side, number>; rejectedBy: Side | null };
  restSkip: Record<Side, boolean>;
  timedOut: boolean;
  awaitingAdminDecision: boolean;
}

export interface NotificationActor {
  kind: "portal" | "system";
  portalCode: PortalCode | null;
  role: string;
  side: Side | null;
}

export interface MatchNotificationEvent {
  eventId: string;
  sequence: number;
  eventType: string;
  actor: NotificationActor;
  payload: Record<string, unknown>;
  occurredAt: number;
  statusVersion: StatusRef;
}

export interface NotificationStream { cursor: number; events: MatchNotificationEvent[]; }

export interface PrivateContextSegment {
  lineupSubmissions?: Record<Side, Record<string, string> | null>;
  interactiveRandom?: Record<Side, 0 | 1 | null>;
}

export interface SyncResponse {
  kind: "ok" | "changed" | "rebase";
  check: StateCheck;
  board?: BaseboardSegment;
  facts?: MatchFactsSegment;
  phase?: AuthoritativePhase;
  runtime?: Omit<AuthoritativeRuntime, "presence" | "lineupSubmissions">;
  presence?: AuthoritativeRuntime["presence"];
  privateContext?: PrivateContextSegment;
  allowedActions: string[];
  notificationStream: NotificationStream;
}

export interface ActionRequest {
  commandId: string;
  epoch: number;
  phaseId: string;
  runtimeId: string;
  check: StateCheck;
  type: string;
  payload: Record<string, unknown>;
  notificationCursor: number | null;
}

export function commandContext(check: StateCheck): CommandContext {
  return { epoch: check.epoch, phaseId: check.phaseId, runtimeId: check.runtimeId, check };
}
