import type { DraftPlayer } from "../../../src/domain";

export type ParticipantLocalState = {
  displayName: string;
  speedrunId: string;
  twitchLogin: string;
  error: string | null;
};

export function resetParticipantLocalState(player: DraftPlayer | undefined): ParticipantLocalState {
  return {
    displayName: player?.manualDisplayName ?? "",
    speedrunId: "",
    twitchLogin: "",
    error: null,
  };
}
