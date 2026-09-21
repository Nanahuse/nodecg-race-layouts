import type { NodeCG } from "../../types/nodecg";
import type { BroadcastApplyService } from "../application/broadcast-apply-service";

export const BROADCAST_APPLY_MESSAGE = "broadcast.apply";

export type BroadcastApplyRequest = {
  expectedDraftRevision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRevision(data: unknown): number {
  return isRecord(data) && typeof data.expectedDraftRevision === "number"
    ? data.expectedDraftRevision
    : Number.NaN;
}

export function registerBroadcastMessages(nodecg: NodeCG, service: BroadcastApplyService): void {
  nodecg.listenFor(BROADCAST_APPLY_MESSAGE, async (data, ack) => {
    const response = await service.apply(readRevision(data));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
