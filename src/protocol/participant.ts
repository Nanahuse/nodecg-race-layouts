export const PARTICIPANT_REGISTRATION_START_MESSAGE = "participant.registration.start";
export const PLAYER_MANAGER_LIST_MESSAGE = "player-manager.list";
export type ParticipantMutationRequest = { expectedDraftRevision: number; racetimeUserId: string };
export type ParticipantFailureReason =
  "draft_changed" | "no_race_loaded" | "participant_not_found" | "operation_failed";
export type ParticipantMutationResponse =
  | { ok: true; changed: boolean; draftRevision: number; unresolvedPlayerCount: number }
  | { ok: false; reason: ParticipantFailureReason; message: string };
export type ParticipantRegistrationResponse =
  | { ok: true; registrationId: string; url: string }
  | { ok: false; reason: ParticipantFailureReason; message: string };
