import type { MatchingInput, Player, RequiredAccount } from "@nanahuse/player-manager-protocol";

import type { PlayerManagerGateway } from "./types";

export type FakePlayerManagerOptions = {
  players?: Player[];
  registrationResult?: { registrationId: string; url: string };
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

  beginRegistration(
    input: MatchingInput,
    requiredAccounts?: RequiredAccount[],
  ): Promise<{ registrationId: string; url: string }> {
    return this.call(
      "beginRegistration",
      { input, requiredAccounts },
      this.options.registrationResult ?? {
        registrationId: "registration-1",
        url: "http://localhost/registration/registration-1",
      },
    );
  }
}
