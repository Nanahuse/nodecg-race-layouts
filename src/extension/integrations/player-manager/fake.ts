import type {
  IdentityResolutionInput,
  Player,
  RegistrationSession,
  Resolution,
} from "@nanahuse/player-manager-protocol";

import type { PlayerManagerGateway } from "./types";

export type FakePlayerManagerOptions = {
  players?: Player[];
  resolveResult?: Resolution;
  registrationResult?: { registrationId: string; url: string };
  registration?: RegistrationSession | null;
  failure?: Error;
  readyFailure?: Error;
};

export class FakePlayerManagerGateway implements PlayerManagerGateway {
  readonly ready: Promise<void>;
  readonly calls: Array<{ operation: string; value?: unknown }> = [];

  constructor(private readonly options: FakePlayerManagerOptions = {}) {
    this.ready = options.readyFailure ? Promise.reject(options.readyFailure) : Promise.resolve();
  }

  private async call<T>(operation: string, value: unknown, result: T): Promise<T> {
    await this.ready;
    this.calls.push({ operation, value });
    if (this.options.failure) throw this.options.failure;
    return result;
  }

  list(): Promise<Player[]> {
    return this.call("list", undefined, this.options.players ?? []);
  }

  get(playerId: string): Promise<Player | null> {
    return this.call(
      "get",
      playerId,
      this.options.players?.find((player) => player.playerId === playerId) ?? null,
    );
  }

  resolve(input: IdentityResolutionInput): Promise<Resolution> {
    return this.call(
      "resolve",
      input,
      this.options.resolveResult ?? {
        status: "unresolved",
        playerId: null,
        input: {
          manualDisplayName: null,
          youtube: null,
          racetime: null,
          speedrunCom: null,
          twitch: null,
        },
        candidates: [],
        message: "No matching player.",
        warnings: [],
      },
    );
  }

  beginRegistration(
    input: IdentityResolutionInput,
  ): Promise<{ registrationId: string; url: string }> {
    return this.call(
      "beginRegistration",
      input,
      this.options.registrationResult ?? {
        registrationId: "registration-1",
        url: "http://localhost/registration/registration-1",
      },
    );
  }

  getRegistration(registrationId: string): Promise<RegistrationSession | null> {
    return this.call("getRegistration", registrationId, this.options.registration ?? null);
  }
}
