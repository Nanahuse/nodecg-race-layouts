import type { PlayerId, RaceTimeUserId } from "./ids";

/**
 * Race participants and player mappings are separate concepts. A participant is
 * a RaceTime.gg entrant for one specific race; a player mapping is a reusable
 * person master record.
 */
export type DraftRaceParticipant = {
  racetimeUserId: RaceTimeUserId;
  playerId: PlayerId | null;
};

export type ActiveRaceParticipant = {
  racetimeUserId: RaceTimeUserId;
  playerId: PlayerId;
};
