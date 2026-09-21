import type { NodeCG } from "../../types/nodecg";
import type {
  RaceDraftService,
} from "../application/race-draft-service";
export { RACE_LOAD_MESSAGE, RACE_RECONCILE_MESSAGE } from "../../protocol/race";
export type { RaceLoadRequest, RaceLoadSuccess, RaceLoadFailure, RaceLoadResponse, RaceReconcileRequest, RaceReconcileSuccess, RaceReconcileFailure, RaceReconcileResponse } from "../../protocol/race";

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
