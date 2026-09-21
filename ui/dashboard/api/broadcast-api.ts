import { nodecg } from "./nodecg-client";
import {
  BROADCAST_APPLY_MESSAGE,
  type BroadcastApplyResponse,
} from "../../../src/protocol/broadcast";
export function createBroadcastApi(getRevision: () => number) {
  return {
    apply: () =>
      nodecg.sendMessage<BroadcastApplyResponse>(BROADCAST_APPLY_MESSAGE, {
        expectedDraftRevision: getRevision(),
      }),
  };
}
