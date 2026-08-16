import type { AuthoritativeRuntime } from "./state/protocol";
import type { Side, TeamPauseState } from "./types";

export function runtimeStructureSignature(runtime: AuthoritativeRuntime): string {
  return JSON.stringify({
    runtimeId: runtime.runtimeId,
    phaseId: runtime.phaseId,
    presence: Object.fromEntries(Object.entries(runtime.presence).map(([code, value]) => [code, {
      connected: value.connected,
      ready: value.ready,
      nameConfirmed: value.nameConfirmed,
    }])),
    interactiveRandom: runtime.interactiveRandom,
    interactiveRandomSubmitted: runtime.interactiveRandomSubmitted,
    lineupSubmissions: runtime.lineupSubmissions,
    scoreProposal: runtime.scoreProposal,
    interactiveRandomResult: runtime.interactiveRandomResult,
    restSkip: runtime.restSkip,
    timedOut: runtime.timedOut,
    awaitingAdminDecision: runtime.awaitingAdminDecision,
    pauseActive: runtime.pause.global.active,
    teamPauseActive: {
      left: runtime.pause.scoreTeams.left.active,
      right: runtime.pause.scoreTeams.right.active,
    },
  });
}

export function lineupToLegacy(lineup: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(lineup).map(([key, value]) => [key.replaceAll("_", "-"), value]));
}

export function authoritativeTeamPause(
  runtime: AuthoritativeRuntime,
  side: Side,
  previous?: TeamPauseState | null,
): TeamPauseState {
  const value = runtime.pause.scoreTeams[side];
  const canAdvance = value.active && !runtime.pause.global.active;
  return {
    active: value.active,
    startedAt: canAdvance ? previous?.startedAt ?? Date.now() : null,
    totalMs: value.phaseTotalMs,
    count: value.count,
  };
}
