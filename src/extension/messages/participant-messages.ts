import type { NodeCG } from "../../types/nodecg";
import type { ParticipantDraftService } from "../application/participant-draft-service";

export const PARTICIPANT_SET_PLAYER_MESSAGE = "participant.set-player";
export const PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE = "participant.set-speedruncom";
export const PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE = "participant.set-speedruncom-none";
export const PARTICIPANT_SET_TWITCH_MESSAGE = "participant.set-twitch";
export const PARTICIPANT_SET_TWITCH_NONE_MESSAGE = "participant.set-twitch-none";
export const PARTICIPANT_SET_DISPLAY_NAME_MESSAGE = "participant.set-display-name";

export type ParticipantSetPlayerRequest = {
  expectedDraftRevision: number;
  racetimeUserId: string;
  playerId: string;
};

export type ParticipantSetSpeedrunComRequest = {
  expectedDraftRevision: number;
  racetimeUserId: string;
  speedrunComUserId: string;
};

export type ParticipantSetTwitchRequest = {
  expectedDraftRevision: number;
  racetimeUserId: string;
  login: string;
};

export type ParticipantSetDisplayNameRequest = {
  expectedDraftRevision: number;
  racetimeUserId: string;
  displayName: string | null;
};

export type ParticipantRacetimeRequest = {
  expectedDraftRevision: number;
  racetimeUserId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(data: unknown, key: string): string {
  return isRecord(data) && typeof data[key] === "string" ? data[key] : "";
}

function readRevision(data: unknown): number {
  return isRecord(data) && typeof data.expectedDraftRevision === "number"
    ? data.expectedDraftRevision
    : Number.NaN;
}

function readDisplayName(data: unknown): string | null {
  if (isRecord(data) && typeof data.displayName === "string") {
    return data.displayName;
  }
  return null;
}

/**
 * Register the participant draft-editing message handlers. Business logic lives
 * in `ParticipantDraftService`; these handlers only extract fields and ack.
 */
export function registerParticipantMessages(
  nodecg: NodeCG,
  service: ParticipantDraftService,
): void {
  nodecg.listenFor(PARTICIPANT_SET_PLAYER_MESSAGE, async (data, ack) => {
    const response = await service.setPlayer(
      readRevision(data),
      readString(data, "racetimeUserId"),
      readString(data, "playerId"),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE, async (data, ack) => {
    const response = await service.setSpeedrunCom(
      readRevision(data),
      readString(data, "racetimeUserId"),
      readString(data, "speedrunComUserId"),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE, async (data, ack) => {
    const response = await service.setSpeedrunComNone(
      readRevision(data),
      readString(data, "racetimeUserId"),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(PARTICIPANT_SET_TWITCH_MESSAGE, async (data, ack) => {
    const response = await service.setTwitch(
      readRevision(data),
      readString(data, "racetimeUserId"),
      readString(data, "login"),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(PARTICIPANT_SET_TWITCH_NONE_MESSAGE, async (data, ack) => {
    const response = await service.setTwitchNone(
      readRevision(data),
      readString(data, "racetimeUserId"),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(PARTICIPANT_SET_DISPLAY_NAME_MESSAGE, async (data, ack) => {
    const response = await service.setDisplayName(
      readRevision(data),
      readString(data, "racetimeUserId"),
      readDisplayName(data),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
