import {
  PARTICIPANT_REGISTRATION_START_MESSAGE,
  PLAYER_MANAGER_LIST_MESSAGE,
} from "../../../src/protocol/participant";
import { nodecg } from "./nodecg-client";
import type { PlayerSnapshot } from "../../../src/domain";
export function createParticipantApi(getRevision: () => number) {
  const request = (racetimeUserId: string) => ({
    expectedDraftRevision: getRevision(),
    racetimeUserId,
  });
  return {
    beginRegistration: (racetimeUserId: string) =>
      nodecg.sendMessage<{ ok: boolean; url?: string; message?: string }>(
        PARTICIPANT_REGISTRATION_START_MESSAGE,
        request(racetimeUserId),
      ),
    listPlayers: () =>
      nodecg.sendMessage<{ ok: boolean; players?: PlayerSnapshot[]; message?: string }>(
        PLAYER_MANAGER_LIST_MESSAGE,
      ),
  };
}
