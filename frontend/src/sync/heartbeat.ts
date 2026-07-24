import { RoomClient } from "../api/room-client";
import { AuthoritativeStore } from "../state/authoritative-store";

export class HeartbeatController {
  private timer: number | null = null;
  private inFlight = false;
  private stopped = true;
  private failureIndex = 0;
  private readonly delays = [1000, 2000, 5000];

  constructor(
    private readonly client: RoomClient,
    private readonly store: AuthoritativeStore,
    private readonly onClosed: () => void,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.wake);
    window.addEventListener("focus", this.wake);
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    window.removeEventListener("online", this.wake);
    window.removeEventListener("focus", this.wake);
  }

  wake = (): void => {
    if (this.stopped || this.inFlight) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  };

  async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;
    try {
      const ref = this.store.ref;
      const response = await this.client.sync(ref ? { epoch: ref.epoch, revision: ref.revision, hash: ref.hash } : null);
      await this.store.apply(response);
      this.failureIndex = 0;
    } catch (error) {
      if (typeof error === "object" && error && "status" in error && (error as { status: number }).status === 410) {
        this.stop();
        this.onClosed();
        return;
      }
      this.failureIndex = Math.min(this.failureIndex + 1, this.delays.length - 1);
    } finally {
      this.inFlight = false;
    }
    if (!this.stopped) {
      this.timer = window.setTimeout(() => void this.tick(), this.delays[this.failureIndex]);
    }
  }
}
