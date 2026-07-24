import type {
  ActionRequest,
  AuthoritativeStatus,
  NotificationStream,
  StatusRef,
  SyncResponse,
} from "../state/protocol";

export class RoomApiError extends Error {
  constructor(public readonly status: number, public readonly payload: Record<string, unknown>) {
    super(String(payload.message ?? payload.error ?? `HTTP ${status}`));
  }
}

export class RoomClient extends EventTarget {
  private notificationCursor: number | null = null;

  constructor(private readonly token: string) {
    super();
  }

  initializeNotificationStream(stream: NotificationStream): void {
    this.ingestNotificationStream(stream);
  }

  async sync(status: Pick<StatusRef, "epoch" | "revision" | "hash"> | null): Promise<SyncResponse> {
    return this.request<SyncResponse>("sync", {
      status,
      notificationCursor: this.notificationCursor,
    });
  }

  async action(expected: StatusRef, type: string, payload: Record<string, unknown> = {}): Promise<SyncResponse> {
    const body: ActionRequest = {
      requestId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expected,
      type,
      payload,
      notificationCursor: this.notificationCursor,
    };
    return this.request<SyncResponse>("actions", body);
  }

  async rollback(revision: number): Promise<SyncResponse> {
    return this.request<SyncResponse>("rollback", {
      revision,
      notificationCursor: this.notificationCursor,
    });
  }

  async history(): Promise<Array<{ epoch: number; revision: number; hash: string; lifecycle: string; phase: AuthoritativeStatus["phase"] }>> {
    const response = await fetch(`${this.baseUrl()}/status-history`, { cache: "no-store" });
    if (!response.ok) throw await this.error(response);
    return ((await response.json()) as { items: Array<{ epoch: number; revision: number; hash: string; lifecycle: string; phase: AuthoritativeStatus["phase"] }> }).items;
  }

  private async request<T>(suffix: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl()}/${suffix}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await this.error(response);
    const payload = await response.json() as T;
    if (payload && typeof payload === "object" && "notificationStream" in payload) {
      this.ingestNotificationStream(
        (payload as unknown as { notificationStream: NotificationStream }).notificationStream,
      );
    }
    return payload;
  }

  private baseUrl(): string {
    return `/api/rooms/token/${encodeURIComponent(this.token)}`;
  }

  private async error(response: Response): Promise<RoomApiError> {
    let payload: Record<string, unknown> = { error: `http_${response.status}` };
    try { payload = await response.json() as Record<string, unknown>; } catch { /* keep fallback */ }
    return new RoomApiError(response.status, payload);
  }

  private ingestNotificationStream(stream: NotificationStream): void {
    this.notificationCursor = Math.max(0, Number(stream.cursor ?? 0));
    if (stream.events.length > 0) {
      this.dispatchEvent(new CustomEvent("notifications", { detail: stream.events }));
    }
  }
}
