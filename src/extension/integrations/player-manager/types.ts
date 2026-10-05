import type {
  IdentityResolutionInput,
  Player,
  PlayerId,
  PlayerManagerAPI,
  RegistrationSession,
  Resolution,
} from "@nanahuse/player-manager-protocol";

export type { IdentityResolutionInput, Player, PlayerId, RegistrationSession, Resolution };

export interface PlayerManagerGateway {
  readonly ready: Promise<void>;
  list(): Promise<Player[]>;
  get(playerId: string): Promise<Player | null>;
  resolve(input: IdentityResolutionInput): Promise<Resolution>;
  beginRegistration(
    input: IdentityResolutionInput,
  ): Promise<{ registrationId: string; url: string }>;
  getRegistration(registrationId: string): Promise<RegistrationSession | null>;
}

export type PlayerManagerExtension = PlayerManagerAPI;
