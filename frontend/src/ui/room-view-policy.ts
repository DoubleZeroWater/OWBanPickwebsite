import type {
  AuthoritativeRuntime,
  AuthoritativeStatus,
  Side,
} from "../state/protocol";

export type RoomPortal = {
  role: "team" | "admin" | "broadcast";
  side: Side | null;
};

export type RoomForeground =
  | "none"
  | "map"
  | "side"
  | "lineup"
  | "ban"
  | "score"
  | "rest"
  | "interactive-random";

export type RoomViewMode = "interactive" | "readonly" | "acting-for-team";

export type RoomViewPolicy = {
  foreground: RoomForeground;
  mode: RoomViewMode;
  actingAs: Side | "both" | null;
  completed: boolean;
  globalPaused: boolean;
  awaitingAdminDecision: boolean;
  canMutateMatch: boolean;
  canActAsPhaseOwner: boolean;
  canResolveAdminDecision: boolean;
  primaryActionState: "enabled" | "disabled" | "waiting-admin" | "readonly" | "hidden";
  canMinimize: boolean;
};

function foregroundForPhase(type: AuthoritativeStatus["phase"]["type"]): RoomForeground {
  if (type === "map_pick") return "map";
  if (type === "side_pick") return "side";
  if (type === "lineup_pick") return "lineup";
  if (type === "ban_order" || type === "ban_first" || type === "ban_second") return "ban";
  if (type === "score_entry") return "score";
  if (type === "pre_start_rest" || type === "post_map_rest") return "rest";
  if (type === "interactive_random") return "interactive-random";
  return "none";
}

export function deriveRoomViewPolicy(
  status: AuthoritativeStatus,
  runtime: AuthoritativeRuntime,
  portal: RoomPortal,
): RoomViewPolicy {
  const completed = status.lifecycle === "completed" || status.phase.type === "completed";
  const foreground = completed ? "none" : foregroundForPhase(status.phase.type);
  const globalPaused = runtime.pause.global.active;
  const isBroadcast = portal.role === "broadcast";
  const canMutateMatch = !completed && !globalPaused && !isBroadcast;
  const actingAs = status.phase.actorSide;
  const ownsPhase = portal.role === "admin"
    || actingAs === "both"
    || (portal.role === "team" && portal.side !== null && actingAs === portal.side);
  const canResolveAdminDecision = canMutateMatch
    && portal.role === "admin"
    && runtime.awaitingAdminDecision;
  const canActAsPhaseOwner = canMutateMatch
    && ownsPhase
    && !runtime.awaitingAdminDecision;
  const primaryActionState = completed || foreground === "none"
    ? "hidden"
    : isBroadcast
      ? "readonly"
      : runtime.awaitingAdminDecision
        ? "waiting-admin"
        : canActAsPhaseOwner
          ? "enabled"
          : "disabled";

  return {
    foreground,
    mode: isBroadcast || globalPaused
      ? "readonly"
      : portal.role === "admin" && actingAs !== null
        ? "acting-for-team"
        : "interactive",
    actingAs,
    completed,
    globalPaused,
    awaitingAdminDecision: runtime.awaitingAdminDecision,
    canMutateMatch,
    canActAsPhaseOwner,
    canResolveAdminDecision,
    primaryActionState,
    canMinimize: !completed && foreground !== "none",
  };
}
