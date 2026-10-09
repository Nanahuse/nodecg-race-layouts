import type {
  MatchingInput,
  Player,
  PlayerId,
  PlayerManagerAPI,
  RequiredAccount,
} from "@nanahuse/player-manager-protocol";

export type { MatchingInput, Player, PlayerId, RequiredAccount };

export interface PlayerManagerGateway {
  readonly ready: Promise<void>;
  list(): Promise<Player[]>;
  get(playerId: string): Promise<Player | null>;
  beginRegistration(
    input: MatchingInput,
    requiredAccounts?: RequiredAccount[],
  ): Promise<{ registrationId: string; url: string }>;
}

export type PlayerManagerExtension = PlayerManagerAPI;
