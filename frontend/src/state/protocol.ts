export type Side = "left" | "right";
export type PortalCode = "A" | "B" | "C" | "D";

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
    | "ban_second" | "score_entry" | "post_map_rest" | "completed";
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
  sideChoice: null | { kind: "attack_defense" | "color"; chooserSide: Side; selectedSide: Side };
  lineups: null | Record<Side, Record<string, string>>;
  bans: { firstBanSide: Side | null; leftHeroId: string | null; rightHeroId: string | null };
  score: null | Record<Side, number>;
  winnerSide: Side | null;
  forfeitSide: Side | null;
  forfeitReason: string | null;
}

export interface AuthoritativeStatus {
  schemaVersion: 2;
  roomId: string;
  epoch: number;
  revision: number;
  hash: string;
  catalogHash: string;
  lifecycle: "preparing" | "running" | "completed";
  config: Record<string, unknown>;
  match: {
    teams: Record<Side, { id: string; name: string; seed: number; seriesScore: number }>;
    decisions: {
      firstMapPickerSide: Side | null;
      firstMapSidePickerSide: Side | null;
      openingBanSide: Side | null;
    };
    winnerSide: Side | null;
    maps: AuthoritativeMap[];
  };
  phase: AuthoritativePhase;
}

export interface AuthoritativeRuntime {
  baseStatusRevision: number;
  baseStatusHash: string;
  phaseId: string;
  totalTimeMs: number;
  remainingTimeMs: number;
  pause: {
    global: { active: boolean; totalMs: number };
    scoreTeams: Record<Side, { active: boolean; phaseTotalMs: number; matchTotalMs: number; count: number }>;
  };
  presence: Record<PortalCode, { connected: boolean; ready: boolean; nameConfirmed: boolean; lastSeenAt: number }>;
  interactiveRandom: Record<Side, 0 | 1 | null> | null;
  interactiveRandomResult: { left: 0 | 1; right: 0 | 1; resultSide: Side } | null;
  lineupSubmissions: Record<Side, Record<string, string> | null>;
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

export interface NotificationStream {
  cursor: number;
  events: MatchNotificationEvent[];
}

export type SyncResponse =
  | {
      kind: "full";
      status: AuthoritativeStatus;
      runtime: AuthoritativeRuntime;
      notificationStream: NotificationStream;
    }
  | {
      kind: "runtime";
      statusRef: StatusRef;
      runtime: AuthoritativeRuntime;
      notificationStream: NotificationStream;
    };

export interface ActionRequest {
  requestId: string;
  expected: StatusRef;
  type: string;
  payload: Record<string, unknown>;
  notificationCursor: number | null;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "hash")
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

export function canonicalStatusJson(status: AuthoritativeStatus): string {
  return JSON.stringify(sortValue(status));
}

export async function verifyStatusHash(status: AuthoritativeStatus): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return true;
  const bytes = new TextEncoder().encode(canonicalStatusJson(status));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  return status.hash === `sha256:${hex}`;
}

export function statusRef(status: AuthoritativeStatus): StatusRef {
  return { epoch: status.epoch, revision: status.revision, hash: status.hash, phaseId: status.phase.phaseId };
}

export function runtimeMatches(status: AuthoritativeStatus, runtime: AuthoritativeRuntime): boolean {
  return runtime.baseStatusRevision === status.revision
    && runtime.baseStatusHash === status.hash
    && runtime.phaseId === status.phase.phaseId;
}
