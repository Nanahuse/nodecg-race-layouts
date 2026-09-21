import type { NodeCG } from "../../types/nodecg";
import type { SpeedrunSnapshotService } from "../application/speedrun-snapshot-service";
import { SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE } from "../../protocol/speedrun-snapshot";
export * from "../../protocol/speedrun-snapshot";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedRevision(data: unknown): number {
  return isRecord(data) && typeof data.expectedDraftRevision === "number"
    ? data.expectedDraftRevision
    : Number.NaN;
}

export function registerSpeedrunSnapshotMessages(
  nodecg: NodeCG,
  service: SpeedrunSnapshotService,
): void {
  nodecg.listenFor(SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE, async (data, ack) => {
    const response = await service.refresh(expectedRevision(data));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
