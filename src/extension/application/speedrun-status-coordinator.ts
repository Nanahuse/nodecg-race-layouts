import type { IntegrationStatus } from "../../domain";
import { createDefaultIntegrationStatus } from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { describeSpeedrunComError } from "../integrations/speedruncom/errors";

export type SpeedrunStatusCoordinatorOptions = {
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
};

/**
 * Shared in-flight tracking for `integration-status.speedrunCom`.
 *
 * Any number of services (discovery, snapshot) can run operations through the
 * same coordinator; the status only returns to `ready` once every in-flight
 * operation has finished successfully.
 */
export class SpeedrunOperationStatusCoordinator {
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;

  private inFlight = 0;
  private lastError: string | null = null;

  constructor(options: SpeedrunStatusCoordinatorOptions) {
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
  }

  get inFlightCount(): number {
    return this.inFlight;
  }

  async run<T>(operation: string, body: () => Promise<T>): Promise<T> {
    this.inFlight += 1;
    this.setStatus("fetching");
    this.logEvent("speedrun.request.started", { operation });

    try {
      const result = await body();
      this.lastError = null;
      this.logEvent("speedrun.request.completed", { operation });
      return result;
    } catch (error) {
      this.lastError = describeSpeedrunComError(error);
      this.logEvent("speedrun.request.failed", { operation, error }, "error");
      throw error;
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      if (this.inFlight > 0) {
        this.setStatus("fetching");
      } else {
        this.setStatus(this.lastError === null ? "ready" : "error");
      }
    }
  }

  private setStatus(state: "fetching" | "ready" | "error"): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const message = state === "error" ? this.lastError : null;
    if (current.speedrunCom.state === state && current.speedrunCom.message === message) {
      return;
    }
    this.integrationStatus.value = { ...current, speedrunCom: { state, message } };
  }

  private logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
  ): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(
        `${key}=${value instanceof Error ? describeSpeedrunComError(value) : String(value)}`,
      );
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;

    if (level === "error") {
      this.log.error(message);
    } else if (level === "warn") {
      this.log.warn(message);
    } else {
      this.log.info(message);
    }
  }
}
