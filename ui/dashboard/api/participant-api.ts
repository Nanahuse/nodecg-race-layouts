import { nodecg } from "./nodecg-client";
import {
  PARTICIPANT_SET_DISPLAY_NAME_MESSAGE,
  PARTICIPANT_SET_PLAYER_MESSAGE,
  PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE,
  PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE,
  PARTICIPANT_SET_TWITCH_MESSAGE,
  PARTICIPANT_SET_TWITCH_NONE_MESSAGE,
  type ParticipantMutationResponse,
  type ParticipantSetDisplayNameRequest,
  type ParticipantSetPlayerRequest,
  type ParticipantSetSpeedrunComRequest,
  type ParticipantSetTwitchRequest,
} from "../../../src/protocol/participant";

type Revision = () => number;
export function createParticipantApi(getRevision: Revision) {
  const send = <T extends object>(name: string, data: T) =>
    nodecg.sendMessage<ParticipantMutationResponse>(name, data);
  return {
    setPlayer: (racetimeUserId: string, playerId: string) =>
      send<ParticipantSetPlayerRequest>(PARTICIPANT_SET_PLAYER_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
        playerId,
      }),
    setSpeedrunCom: (racetimeUserId: string, speedrunComUserId: string) =>
      send<ParticipantSetSpeedrunComRequest>(PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
        speedrunComUserId,
      }),
    setSpeedrunComNone: (racetimeUserId: string) =>
      send(PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
      }),
    setTwitch: (racetimeUserId: string, login: string) =>
      send<ParticipantSetTwitchRequest>(PARTICIPANT_SET_TWITCH_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
        login,
      }),
    setTwitchNone: (racetimeUserId: string) =>
      send(PARTICIPANT_SET_TWITCH_NONE_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
      }),
    setDisplayName: (racetimeUserId: string, displayName: string | null) =>
      send<ParticipantSetDisplayNameRequest>(PARTICIPANT_SET_DISPLAY_NAME_MESSAGE, {
        expectedDraftRevision: getRevision(),
        racetimeUserId,
        displayName,
      }),
  };
}
