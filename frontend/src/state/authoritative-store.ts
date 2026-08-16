import { commandContext } from "./protocol";
import type {
  AuthoritativePhase,
  AuthoritativeRuntime,
  AuthoritativeStatus,
  BaseboardSegment,
  MatchFactsSegment,
  PrivateContextSegment,
  StateCheck,
  SyncResponse,
} from "./protocol";

export class AuthoritativeStore extends EventTarget {
  status: AuthoritativeStatus | null = null;
  runtime: AuthoritativeRuntime | null = null;
  check: StateCheck | null = null;
  allowedActions: string[] = [];
  private board: BaseboardSegment | null = null;
  private facts: MatchFactsSegment | null = null;
  private phase: AuthoritativePhase | null = null;
  private privateContext: PrivateContextSegment = {};
  private presence: AuthoritativeRuntime["presence"] | null = null;

  get ref() {
    return this.check ? commandContext(this.check) : null;
  }

  async apply(response: SyncResponse): Promise<"full" | "runtime" | "ignored"> {
    if (response.board) this.board = response.board;
    if (response.facts) this.facts = response.facts;
    if (response.phase) this.phase = response.phase;
    if (response.presence) this.presence = response.presence;
    if (response.privateContext) this.privateContext = response.privateContext;
    this.check = response.check;
    this.allowedActions = [...response.allowedActions];

    const structural = Boolean(response.board || response.facts || response.phase);
    if (response.runtime) {
      this.runtime = {
        ...response.runtime,
        presence: this.presence ?? this.runtime?.presence ?? {} as AuthoritativeRuntime["presence"],
        lineupSubmissions: this.privateContext.lineupSubmissions
          ?? this.runtime?.lineupSubmissions
          ?? { left: null, right: null },
        interactiveRandom: this.privateContext.interactiveRandom
          ?? response.runtime.interactiveRandom,
      };
    } else if (this.runtime && response.presence) {
      this.runtime = { ...this.runtime, presence: response.presence };
    }

    if (!this.board || !this.facts || !this.phase || !this.runtime) return "ignored";
    const sourcePhase = this.phase.type === "admin_decision" && this.phase.data.sourcePhase && typeof this.phase.data.sourcePhase === "object"
      ? this.phase.data.sourcePhase as AuthoritativePhase
      : null;
    if (this.phase.type === "admin_decision" && this.phase.data.proposal && typeof this.phase.data.proposal === "object") {
      this.runtime = { ...this.runtime, scoreProposal: this.phase.data.proposal as AuthoritativeRuntime["scoreProposal"] };
    }
    const rawPresentationPhase = sourcePhase
      ? { ...sourcePhase, phaseId: this.phase.phaseId, data: { ...sourcePhase.data, authoritativeType: "admin_decision", decision: this.phase.data } }
      : this.phase;
    const presentationPhase: AuthoritativePhase = rawPresentationPhase.type === "score_confirmation"
      ? { ...rawPresentationPhase, type: "score_entry", data: { ...rawPresentationPhase.data, authoritativeType: this.phase.type === "admin_decision" ? "admin_decision" : "score_confirmation" } }
      : rawPresentationPhase;
    this.status = Object.freeze({
      schemaVersion: 2,
      roomId: this.board.roomId,
      epoch: this.facts.epoch,
      revision: this.facts.revision,
      hash: this.facts.factsHash,
      catalogHash: this.board.catalogHash,
      lifecycle: this.facts.lifecycle,
      config: this.board.config,
      match: this.facts.match,
      phase: presentationPhase,
    });
    const kind = structural || response.kind === "rebase" ? "full" : "runtime";
    this.dispatchEvent(new CustomEvent("change", { detail: kind }));
    return kind;
  }
}
