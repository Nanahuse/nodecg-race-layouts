import type { NodeCG } from "../../types/nodecg";
import type { PostApplyPersistenceService } from "../application/post-apply-persistence-service";
import { PERSISTENCE_RETRY_MESSAGE } from "../../protocol/persistence";
export * from "../../protocol/persistence";
export function registerPersistenceMessages(
  nodecg: NodeCG,
  service: PostApplyPersistenceService | null,
): void {
  nodecg.listenFor(PERSISTENCE_RETRY_MESSAGE, async (_data, ack) => {
    if (!service) {
      ack(null, {
        ok: false,
        reason: "persistence_unavailable",
        message: "Persistence is unavailable.",
        remaining: 0,
      });
      return;
    }
    ack(null, await service.flush());
  });
}
