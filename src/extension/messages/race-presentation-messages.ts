import type { NodeCG } from "../../types/nodecg";
import type { RacePresentationDraftService } from "../application/race-presentation-draft-service";

export const RACE_SCREEN_SET_SLOTS_MESSAGE = "race-screen.set-slots";
export const COMMENTATORS_SET_MESSAGE = "commentators.set";

export type SetRaceScreenSlotsRequest = {
  expectedDraftRevision: number;
  slots: {
    1: string | null;
    2: string | null;
    3: string | null;
    4: string | null;
  };
};

export type SetCommentatorsRequest = {
  expectedDraftRevision: number;
  playerIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRevision(data: unknown): number {
  return isRecord(data) && typeof data.expectedDraftRevision === "number"
    ? data.expectedDraftRevision
    : Number.NaN;
}

export function registerRacePresentationMessages(
  nodecg: NodeCG,
  service: RacePresentationDraftService,
): void {
  nodecg.listenFor(RACE_SCREEN_SET_SLOTS_MESSAGE, async (data, ack) => {
    const response = await service.setSlots(
      readRevision(data),
      isRecord(data) ? data.slots : undefined,
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(COMMENTATORS_SET_MESSAGE, async (data, ack) => {
    const response = await service.setCommentators(
      readRevision(data),
      isRecord(data) ? data.playerIds : undefined,
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
