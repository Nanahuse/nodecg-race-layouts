import { describe, expect, it } from "vitest";
import type {
  PostApplyPersistenceItem,
  PostApplyPersistenceState,
  RaceHistoryPayload,
} from "../src/domain";
import { persistenceItemFromConfig } from "../src/domain";
import { PostApplyPersistenceService } from "../src/extension/application/post-apply-persistence-service";
import type { RaceHistoryRepository } from "../src/extension/integrations/spreadsheet/race-history-repository";
import type { Replicant } from "../src/types/nodecg";
import { makeActiveConfig } from "./factories";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

class History implements RaceHistoryRepository {
  readonly saved: RaceHistoryPayload[] = [];
  failure: Error | null = null;
  async upsert(payload: RaceHistoryPayload): Promise<void> {
    if (this.failure) throw this.failure;
    this.saved.push(payload);
  }
}
function item(revision: number): PostApplyPersistenceItem {
  return persistenceItemFromConfig(
    makeActiveConfig({ revision }),
    `2026-10-05T00:00:0${revision}.000Z`,
  );
}
function state(queue: PostApplyPersistenceItem[] = []): PostApplyPersistenceState {
  return {
    state: queue.length ? "pending" : "idle",
    queue,
    lastSavedActiveRevision: null,
    message: null,
  };
}
function setup(queue: PostApplyPersistenceItem[] = []) {
  const replicant = new TrackingReplicant("post-apply-persistence", state(queue));
  const history = new History();
  const service = new PostApplyPersistenceService(
    replicant as Replicant<PostApplyPersistenceState>,
    history,
    createFakeLogger().logger,
  );
  return { replicant, history, service };
}
describe("PostApplyPersistenceService", () => {
  it("persists only RaceHistory and clears the queue", async () => {
    const { replicant, history, service } = setup([item(2)]);
    expect(await service.flush()).toMatchObject({ ok: true, processed: 1, remaining: 0 });
    expect(history.saved).toHaveLength(1);
    expect(replicant.value).toMatchObject({ state: "idle", queue: [], lastSavedActiveRevision: 2 });
  });
  it("retains failed RaceHistory writes for retry", async () => {
    const { replicant, history, service } = setup([item(3)]);
    history.failure = new Error("offline");
    expect(await service.flush()).toMatchObject({ ok: false, reason: "persistence_failed" });
    expect(replicant.value.queue[0]).toMatchObject({ attempts: 1, lastError: "offline" });
    history.failure = null;
    expect(await service.flush()).toMatchObject({ ok: true, remaining: 0 });
  });
});
