export const PARTICIPANT_SET_PLAYER_MESSAGE = "participant.set-player";
export const PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE = "participant.set-speedruncom";
export const PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE = "participant.set-speedruncom-none";
export const PARTICIPANT_SET_TWITCH_MESSAGE = "participant.set-twitch";
export const PARTICIPANT_SET_TWITCH_NONE_MESSAGE = "participant.set-twitch-none";
export const PARTICIPANT_SET_DISPLAY_NAME_MESSAGE = "participant.set-display-name";

export type ParticipantMutationRequest = { expectedDraftRevision: number; racetimeUserId: string };
export type ParticipantSetPlayerRequest = ParticipantMutationRequest & { playerId: string };
export type ParticipantSetSpeedrunComRequest = ParticipantMutationRequest & {
  speedrunComUserId: string;
};
export type ParticipantSetTwitchRequest = ParticipantMutationRequest & { login: string };
export type ParticipantSetDisplayNameRequest = ParticipantMutationRequest & {
  displayName: string | null;
};
export type ParticipantFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "participant_not_found"
  | "player_not_found"
  | "player_in_use"
  | "racetime_conflict"
  | "identity_conflict"
  | "invalid_twitch_login"
  | "speedrun_user_not_found"
  | "speedrun_lookup_failed"
  | "operation_failed";
export type ParticipantMutationResponse =
  | { ok: true; changed: boolean; draftRevision: number; unresolvedPlayerCount: number }
  | { ok: false; reason: ParticipantFailureReason; message: string };
