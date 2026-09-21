import type {
  ActiveConfig,
  PostApplyPersistenceItem,
  PostApplyPersistenceState,
} from "../../domain";
import { persistenceItemFromConfig } from "../../domain";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import type { PlayerDirectoryService } from "./player-directory-service";
import type { RaceHistoryRepository } from "../integrations/spreadsheet/race-history-repository";
import type { SpreadsheetOperationStatusCoordinator } from "./spreadsheet-status-coordinator";

export type PostApplyPersistenceFlushResult =
  | { ok: true; processed: number; remaining: number }
  | {
      ok: false;
      reason: "persistence_unavailable" | "persistence_in_progress" | "persistence_failed";
      message: string;
      remaining: number;
    };
export interface PostApplyPersistenceSink {
  enqueue(config: ActiveConfig): void;
}
export class PostApplyPersistenceService implements PostApplyPersistenceSink {
  private flushing = false;
  constructor(
    private readonly state: Replicant<PostApplyPersistenceState>,
    private readonly players: PlayerDirectoryService,
    private readonly history: RaceHistoryRepository,
    private readonly log: NodeCGLogger,
    private readonly now: () => Date = () => new Date(),
    private readonly coordinator: SpreadsheetOperationStatusCoordinator | null = null,
  ) {}
  enqueue(config: ActiveConfig): void {
    const item = persistenceItemFromConfig(config, this.now().toISOString());
    const current = this.state.value;
    if (current.queue.some((queued) => queued.activeRevision === item.activeRevision)) return;
    this.state.value = {
      ...current,
      state: this.flushing ? "saving" : "pending",
      queue: [...current.queue, item],
      message: null,
    };
    this.log.info(
      `[broadcast.persistence.enqueued] activeRevision=${item.activeRevision} queueLength=${this.state.value.queue.length}`,
    );
    void this.flush();
  }
  async flush(): Promise<PostApplyPersistenceFlushResult> {
    if (this.flushing)
      return {
        ok: false,
        reason: "persistence_in_progress",
        message: "Persistence is already in progress.",
        remaining: this.state.value.queue.length,
      };
    this.flushing = true;
    let processed = 0;
    try {
      while (this.state.value.queue.length) {
        const item = this.state.value.queue[0];
        if (!item) break;
        this.updateItem(item.activeRevision, { attempts: item.attempts + 1 }, "saving");
        const operation = this.coordinator?.begin("saving");
        try {
          await this.players.savePlayers(item.players);
          await this.history.upsert(item.raceHistory, item.activeRevision, item.appliedAt);
          const current = this.state.value;
          this.state.value = {
            ...current,
            state: current.queue.length > 1 ? "pending" : "idle",
            queue: current.queue.filter(
              (candidate) => candidate.activeRevision !== item.activeRevision,
            ),
            lastSavedActiveRevision: item.activeRevision,
            message: null,
          };
          processed += 1;
          operation?.success();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.updateItem(item.activeRevision, { lastError: message }, "error", message);
          operation?.failure(message);
          return {
            ok: false,
            reason: "persistence_failed",
            message,
            remaining: this.state.value.queue.length,
          };
        }
      }
      return { ok: true, processed, remaining: this.state.value.queue.length };
    } finally {
      this.flushing = false;
    }
  }
  resume(): void {
    if (this.state.value.queue.length) {
      this.state.value = { ...this.state.value, state: "pending", message: null };
      this.log.info(`[broadcast.persistence.resumed] queueLength=${this.state.value.queue.length}`);
      void this.flush();
    }
  }
  private updateItem(
    revision: number,
    patch: Partial<PostApplyPersistenceItem>,
    state: PostApplyPersistenceState["state"],
    message: string | null = null,
  ): void {
    const current = this.state.value;
    this.state.value = {
      ...current,
      state,
      message,
      queue: current.queue.map((item) =>
        item.activeRevision === revision ? { ...item, ...patch } : item,
      ),
    };
  }
}
