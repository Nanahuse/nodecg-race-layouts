import { nodecg } from "./nodecg-client";
import {
  COMMENTATORS_SET_MESSAGE,
  RACE_SCREEN_SET_SLOTS_MESSAGE,
  type RacePresentationResponse,
  type RacePresentationSlots,
  type SetCommentatorsRequest,
  type SetRaceScreenSlotsRequest,
} from "../../../src/protocol/race-presentation";

export function createRacePresentationApi(getRevision: () => number) {
  return {
    setSlots: (slots: RacePresentationSlots) =>
      nodecg.sendMessage<RacePresentationResponse>(RACE_SCREEN_SET_SLOTS_MESSAGE, {
        expectedDraftRevision: getRevision(),
        slots,
      } satisfies SetRaceScreenSlotsRequest),
    setCommentators: (playerIds: string[]) =>
      nodecg.sendMessage<RacePresentationResponse>(COMMENTATORS_SET_MESSAGE, {
        expectedDraftRevision: getRevision(),
        playerIds,
      } satisfies SetCommentatorsRequest),
  };
}
