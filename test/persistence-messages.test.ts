import { describe, expect, it, vi } from "vitest";

import type { PostApplyPersistenceService } from "../src/extension/application/post-apply-persistence-service";
import { registerPersistenceMessages } from "../src/extension/messages/persistence-messages";
import { PERSISTENCE_RETRY_MESSAGE } from "../src/protocol/persistence";
import type { MessageHandler, NodeCG } from "../src/types/nodecg";

function register(service: PostApplyPersistenceService | null) {
  const handlers = new Map<string, MessageHandler>();
  const nodecg = {
    listenFor: (name: string, handler: MessageHandler) => handlers.set(name, handler),
  } as unknown as NodeCG;
  registerPersistenceMessages(nodecg, service);
  return handlers.get(PERSISTENCE_RETRY_MESSAGE)!;
}

function send(handler: MessageHandler): Promise<unknown> {
  return new Promise((resolve, reject) => {
    void handler(undefined, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

describe("registerPersistenceMessages", () => {
  it("flushes the service and acknowledges its result", async () => {
    const result = { ok: true as const, processed: 2, remaining: 0 };
    const flush = vi.fn(async () => result);
    const service = { flush } as unknown as PostApplyPersistenceService;
    const handler = register(service);

    await expect(send(handler)).resolves.toEqual(result);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("acknowledges persistence_unavailable when the service is absent", async () => {
    const handler = register(null);

    await expect(send(handler)).resolves.toEqual({
      ok: false,
      reason: "persistence_unavailable",
      message: "Persistence is unavailable.",
      remaining: 0,
    });
  });
});
