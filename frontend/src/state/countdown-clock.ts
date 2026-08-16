import type { AuthoritativeRuntime } from "./protocol";

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function isRunning(runtime: AuthoritativeRuntime): boolean {
  return runtime.totalTimeMs > 0
    && runtime.remainingTimeMs > 0
    && !runtime.awaitingAdminDecision
    && !runtime.pause.global.active
    && !runtime.pause.scoreTeams.left.active
    && !runtime.pause.scoreTeams.right.active;
}

export class CountdownPresentationClock {
  private runtimeId: string | null = null;
  private phaseId: string | null = null;
  private totalTimeMs = 0;
  private anchorRemainingMs = 0;
  private anchorAtMs = 0;
  private correctionMs = 0;
  private correctionAtMs = 0;
  private previousServerRemainingMs: number | null = null;
  private running = false;

  reset(runtime: AuthoritativeRuntime, atMs = nowMs()): void {
    this.runtimeId = runtime.runtimeId;
    this.phaseId = runtime.phaseId;
    this.totalTimeMs = runtime.totalTimeMs;
    this.anchorRemainingMs = runtime.remainingTimeMs;
    this.anchorAtMs = atMs;
    this.correctionMs = 0;
    this.correctionAtMs = atMs;
    this.previousServerRemainingMs = runtime.remainingTimeMs;
    this.running = isRunning(runtime);
  }

  reconcile(runtime: AuthoritativeRuntime, atMs = nowMs()): "adjust" | "reset" {
    if (
      this.runtimeId !== runtime.runtimeId
      || this.phaseId !== runtime.phaseId
      || this.totalTimeMs !== runtime.totalTimeMs
      || this.previousServerRemainingMs === null
      || this.running !== isRunning(runtime)
    ) {
      this.reset(runtime, atMs);
      return "reset";
    }

    const predictedRemainingMs = this.remainingAt(atMs);
    const deviationMs = runtime.remainingTimeMs - predictedRemainingMs;
    const serverTimeDecreased = runtime.remainingTimeMs < this.previousServerRemainingMs;

    if (!this.running) {
      this.reset(runtime, atMs);
      return "reset";
    }

    // A duplicate or delayed heartbeat must not move the visual clock
    // backwards. Keep the current presentation anchor until the server clock
    // advances again.
    if (!serverTimeDecreased) {
      return "adjust";
    }

    // Start from the currently displayed value and distribute at most one
    // second of correction over the next second. Larger transport delays are
    // absorbed over subsequent heartbeats instead of visibly jumping the bar.
    this.anchorRemainingMs = predictedRemainingMs;
    this.anchorAtMs = atMs;
    this.correctionMs = Math.max(-999, Math.min(999, deviationMs));
    this.correctionAtMs = atMs;
    this.previousServerRemainingMs = runtime.remainingTimeMs;
    return "adjust";
  }

  snapshot(runtime: AuthoritativeRuntime, atMs = nowMs()): { remaining: number; percent: number } {
    if (this.runtimeId !== runtime.runtimeId || this.phaseId !== runtime.phaseId || this.totalTimeMs !== runtime.totalTimeMs) {
      this.reset(runtime, atMs);
    }
    const remainingMs = this.remainingAt(atMs);
    const totalMs = Math.max(1, this.totalTimeMs);
    return {
      remaining: remainingMs / 1000,
      percent: Math.max(0, Math.min(100, remainingMs / totalMs * 100)),
    };
  }

  millisecondsUntilNextSecond(runtime: AuthoritativeRuntime, atMs = nowMs()): number | null {
    if (!isRunning(runtime)) return null;
    const remainingMs = this.remainingAt(atMs);
    if (remainingMs <= 0) return null;

    const nextBoundaryMs = Math.max(0, (Math.ceil(remainingMs / 1000) - 1) * 1000);
    const distanceMs = remainingMs - nextBoundaryMs;
    const correctionTimeLeftMs = Math.max(0, this.correctionAtMs + 1000 - atMs);
    const currentDecreaseRate = correctionTimeLeftMs > 0
      ? Math.max(0.001, 1 - this.correctionMs / 1000)
      : 1;
    const decreaseBeforeCorrectionEnds = correctionTimeLeftMs * currentDecreaseRate;

    if (distanceMs <= decreaseBeforeCorrectionEnds) {
      return distanceMs / currentDecreaseRate;
    }
    return correctionTimeLeftMs + distanceMs - decreaseBeforeCorrectionEnds;
  }

  private remainingAt(atMs: number): number {
    const elapsedMs = this.running ? Math.max(0, atMs - this.anchorAtMs) : 0;
    const correctionProgress = Math.max(0, Math.min(1, (atMs - this.correctionAtMs) / 1000));
    return Math.max(
      0,
      Math.min(this.totalTimeMs, this.anchorRemainingMs - elapsedMs + this.correctionMs * correctionProgress),
    );
  }
}
