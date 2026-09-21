import { nodecg } from "./nodecg-client";
import {
  SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE,
  type SpeedrunSnapshotResponse,
} from "../../../src/protocol/speedrun-snapshot";
export function createSnapshotApi(getRevision: () => number) {
  return {
    refresh: () =>
      nodecg.sendMessage<SpeedrunSnapshotResponse>(SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE, {
        expectedDraftRevision: getRevision(),
      }),
  };
}
