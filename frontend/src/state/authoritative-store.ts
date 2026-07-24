import { runtimeMatches, statusRef, verifyStatusHash } from "./protocol";
import type { AuthoritativeRuntime, AuthoritativeStatus, SyncResponse } from "./protocol";

export class AuthoritativeStore extends EventTarget {
  status: AuthoritativeStatus | null = null;
  runtime: AuthoritativeRuntime | null = null;

  get ref() {
    return this.status ? statusRef(this.status) : null;
  }

  async apply(response: SyncResponse): Promise<"full" | "runtime" | "ignored"> {
    if (response.kind === "full") {
      if (!await verifyStatusHash(response.status)) throw new Error("服务器 status hash 校验失败");
      if (!runtimeMatches(response.status, response.runtime)) throw new Error("runtime 与 status 不匹配");
      this.status = Object.freeze(response.status);
      this.runtime = response.runtime;
      this.dispatchEvent(new CustomEvent("change", { detail: "full" }));
      return "full";
    }
    if (!this.status || response.statusRef.epoch !== this.status.epoch
      || response.statusRef.revision !== this.status.revision
      || response.statusRef.hash !== this.status.hash
      || response.statusRef.phaseId !== this.status.phase.phaseId
      || !runtimeMatches(this.status, response.runtime)) return "ignored";

    this.runtime = response.runtime;
    this.dispatchEvent(new CustomEvent("change", { detail: "runtime" }));
    return "runtime";
  }
}
