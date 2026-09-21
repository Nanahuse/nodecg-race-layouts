import type { IntegrationStatus, SpreadsheetStatusState } from "../../domain";
import { createDefaultIntegrationStatus } from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
export type SpreadsheetOperationKind = "loading" | "saving";
type Token = { success(message?: string | null): void; failure(message: string): void };
export class SpreadsheetOperationStatusCoordinator {
  private nextId = 0;
  private active = new Map<number, SpreadsheetOperationKind>();
  private batchFailure: string | null = null;
  private batchHadSaving = false;
  constructor(
    private readonly status: Replicant<IntegrationStatus>,
    private readonly log?: NodeCGLogger,
  ) {}
  begin(kind: SpreadsheetOperationKind): Token {
    const id = ++this.nextId;
    if (this.active.size === 0) {
      this.batchFailure = null;
      this.batchHadSaving = false;
    }
    if (kind === "saving") this.batchHadSaving = true;
    this.active.set(id, kind);
    this.publish(this.currentState(), null);
    let done = false;
    const finish = (message: string | null, failed: string | null) => {
      if (done) return;
      done = true;
      if (failed && !this.batchFailure) this.batchFailure = failed;
      this.active.delete(id);
      if (this.active.size) this.publish(this.currentState(), null);
      else
        this.publish(
          this.batchFailure ? "error" : this.batchHadSaving ? "saved" : "idle",
          this.batchFailure ?? message,
        );
    };
    return {
      success: (message = null) => finish(message, null),
      failure: (message) => finish(message, message),
    };
  }
  private currentState(): SpreadsheetStatusState {
    if ([...this.active.values()].some((op) => op === "saving")) return "saving";
    return "loading";
  }
  private publish(state: SpreadsheetStatusState, message: string | null): void {
    const current = this.status.value ?? createDefaultIntegrationStatus();
    this.status.value = { ...current, spreadsheet: { state, message } };
  }
}
