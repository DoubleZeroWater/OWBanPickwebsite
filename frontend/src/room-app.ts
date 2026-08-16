import { RoomApiError, RoomClient } from "./api/room-client";
import { mapOperationToActions, type ActionMapperContext } from "./features/action-mapper";
import { AuthoritativeStore } from "./state/authoritative-store";
import type { SyncResponse } from "./state/protocol";
import type { RoomOperation } from "./types";

export class RoomActionDispatcher {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: RoomClient | null,
    private readonly store: AuthoritativeStore,
    private readonly getContext: () => ActionMapperContext,
    private readonly reportError: (message: string) => void,
  ) {}

  dispatch(operation: RoomOperation): Promise<void> {
    const specs = mapOperationToActions(operation, this.getContext());
    if (specs.length === 0 || !this.client) return Promise.resolve();
    this.queue = this.queue.then(async () => {
      for (const spec of specs) {
        const ref = this.store.ref;
        if (!ref) return;
        try {
          const response = await this.client!.action(ref, spec.type, spec.payload ?? {});
          await this.store.apply(response);
        } catch (error) {
          if (error instanceof RoomApiError) {
            const payload = error.payload as unknown as SyncResponse;
            if (error.status === 409 && ["changed", "rebase"].includes(payload.kind)) {
              this.client!.initializeNotificationStream(payload.notificationStream);
              await this.store.apply(payload);
            }
            this.reportError(error.message);
          } else {
            this.reportError(error instanceof Error ? error.message : "网络请求失败，请重试");
          }
        }
      }
    });
    return this.queue;
  }
}
