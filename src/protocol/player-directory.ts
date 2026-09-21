import type { PlayerMapping, PlayerDirectory } from "../domain";

export const PLAYER_DIRECTORY_RELOAD_MESSAGE = "player-directory.reload";
export const PLAYER_DIRECTORY_CREATE_MESSAGE = "player-directory.create";
export const PLAYER_DIRECTORY_UPDATE_MESSAGE = "player-directory.update";
export const PLAYER_DIRECTORY_DELETE_MESSAGE = "player-directory.delete";

export type PlayerMappingEditInput = {
  manualDisplayName: string | null;
  racetime:
    | { state: "none" }
    | { state: "linked"; userId: string; name: string; twitchLogin: string | null };
  speedrunCom: { state: "none" } | { state: "linked"; userId: string };
  twitch: { state: "none" } | { state: "linked"; login: string };
};

export type PlayerDirectoryCreateRequest = { input: PlayerMappingEditInput };
export type PlayerDirectoryUpdateRequest = {
  playerId: string;
  expectedPlayer: PlayerMapping;
  input: PlayerMappingEditInput;
};
export type PlayerDirectoryDeleteRequest = { playerId: string; expectedPlayer: PlayerMapping };

export type PlayerDirectoryFailureReason =
  | "player_not_found"
  | "player_changed"
  | "player_in_use"
  | "identity_conflict"
  | "invalid_input"
  | "speedrun_user_not_found"
  | "speedrun_lookup_failed"
  | "player_directory_unavailable"
  | "operation_failed";

export type PlayerDirectoryFailure = {
  ok: false;
  reason: PlayerDirectoryFailureReason;
  message: string;
};
export type PlayerDirectoryCreateResponse =
  { ok: true; player: PlayerMapping } | PlayerDirectoryFailure;
export type PlayerDirectoryUpdateResponse =
  { ok: true; player: PlayerMapping } | PlayerDirectoryFailure;
export type PlayerDirectoryDeleteResponse = { ok: true; playerId: string } | PlayerDirectoryFailure;
export type PlayerDirectoryReloadResponse =
  { ok: true; playerCount: number } | PlayerDirectoryFailure;
export type PlayerDirectoryResponse = PlayerDirectory | PlayerDirectoryFailure;
