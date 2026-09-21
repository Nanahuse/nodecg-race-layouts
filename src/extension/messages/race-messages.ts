import type { NodeCG } from "../../types/nodecg";
import type {
  RaceDraftService,
  RaceLoadOutcome,
  RaceReconcileOutcome,
} from "../application/race-draft-service";

export const RACE_LOAD_MESSAGE = "race.load";
export const RACE_RECONCILE_MESSAGE = "race.reconcile";

export type RaceLoadRequest = {
  url: string;
};

export type RaceLoadSuccess = Extract<RaceLoadOutcome, { ok: true }>;
export type RaceLoadFailure = Extract<RaceLoadOutcome, { ok: false }>;
export type RaceLoadResponse = RaceLoadOutcome;

export type RaceReconcileRequest = {
  expectedDraftRevision: number;
};

export type RaceReconcileSuccess = Extract<RaceReconcileOutcome, { ok: true }>;
export type RaceReconcileFailure = Extract<RaceReconcileOutcome, { ok: false }>;
export type RaceReconcileResponse = RaceReconcileOutcome;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Register the race message handlers. Business logic lives in
 * `RaceDraftService`; these handlers only validate the request shape and
 * acknowledge the structured result.
 */
export function registerRaceMessages(nodecg: NodeCG, service: RaceDraftService): void {
  nodecg.listenFor(RACE_LOAD_MESSAGE, async (data, ack) => {
    const url = isRecord(data) && typeof data.url === "string" ? data.url : "";
    const response = await service.loadRace(url);
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(RACE_RECONCILE_MESSAGE, async (data, ack) => {
    const expectedDraftRevision =
      isRecord(data) && typeof data.expectedDraftRevision === "number"
        ? data.expectedDraftRevision
        : Number.NaN;
    const response = await service.reconcile(expectedDraftRevision);
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
