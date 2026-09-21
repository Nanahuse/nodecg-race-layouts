export const RACE_SCREEN_SET_SLOTS_MESSAGE = "race-screen.set-slots";
export const COMMENTATORS_SET_MESSAGE = "commentators.set";
export type RacePresentationSlots = {
  1: string | null;
  2: string | null;
  3: string | null;
  4: string | null;
};
export type SetRaceScreenSlotsRequest = {
  expectedDraftRevision: number;
  slots: RacePresentationSlots;
};
export type SetCommentatorsRequest = { expectedDraftRevision: number; playerIds: string[] };
export type RacePresentationFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "invalid_request"
  | "invalid_slots"
  | "slot_unknown_participant"
  | "duplicate_slot"
  | "player_not_found"
  | "too_many_commentators"
  | "duplicate_commentator"
  | "operation_failed";
export type RacePresentationResponse =
  | { ok: true; changed: boolean; draftRevision: number }
  | { ok: false; reason: RacePresentationFailureReason; message: string };
