import type { PlayerId, RaceTimeUserId } from "./ids";

/**
 * A participant is a RaceTime.gg entrant for one specific race. The draft
 * associates that entrant with a Player Manager person reference.
 */
export type DraftRaceParticipant = {
  racetimeUserId: RaceTimeUserId;
  personRef: string;
};

export type ActiveRaceParticipant = {
  racetimeUserId: RaceTimeUserId;
  playerId: PlayerId;
};
