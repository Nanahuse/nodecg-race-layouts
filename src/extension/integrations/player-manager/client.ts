import type {
  MatchingInput,
  Operations,
  Player,
  PlayerManagerAPI,
  RequiredAccount,
} from "@nanahuse/player-manager-protocol";
import { API_VERSION } from "@nanahuse/player-manager-protocol";

import type { IntegrationStatus } from "../../../domain";
import { createDefaultIntegrationStatus } from "../../../replicants/defaults";
import type { NodeCG, Replicant } from "../../../types/nodecg";
import type { PlayerManagerGateway } from "./types";

export class PlayerManagerIntegrationError extends Error {
  constructor(
    readonly code: "unavailable" | "version_mismatch" | "request_failed" | "player_manager_error",
    message: string,
  ) {
    super(message);
    this.name = "PlayerManagerIntegrationError";
  }
}

function integrationError(error: unknown): PlayerManagerIntegrationError {
  if (error instanceof PlayerManagerIntegrationError) return error;
  return new PlayerManagerIntegrationError(
    "request_failed",
    error instanceof Error ? error.message : "Player Manager request failed.",
  );
}

function requestData<T>(
  response: { ok: true; data: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!response.ok) {
    throw new PlayerManagerIntegrationError("player_manager_error", response.error.message);
  }
  return response.data;
}

class ApiPlayerManagerGateway implements PlayerManagerGateway {
  readonly ready: Promise<void>;

  constructor(private readonly api: PlayerManagerAPI) {
    this.ready = Promise.resolve().then(async () => {
      if (api.apiVersion !== API_VERSION) {
        throw new PlayerManagerIntegrationError(
          "version_mismatch",
          `Unsupported Player Manager API version: ${String(api.apiVersion)} (expected ${API_VERSION}).`,
        );
      }
      try {
        await api.ready;
      } catch (error) {
        throw new PlayerManagerIntegrationError(
          "unavailable",
          `Player Manager failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private async request<K extends keyof Operations>(
    operation: K,
    payload: Operations[K]["request"],
  ): Promise<Operations[K]["response"]> {
    await this.ready;
    try {
      const response = await this.api.request(operation, payload);
      return requestData(response);
    } catch (error) {
      throw integrationError(error);
    }
  }

  async list(): Promise<Player[]> {
    const directory = await this.request("list", undefined);
    return directory.players;
  }

  beginRegistration(
    input: MatchingInput,
    requiredAccounts?: RequiredAccount[],
  ): Promise<{ registrationId: string; url: string }> {
    return this.request("beginRegistration", { input, requiredAccounts });
  }
}

class UnavailablePlayerManagerGateway implements PlayerManagerGateway {
  readonly ready: Promise<void>;

  constructor(error: PlayerManagerIntegrationError) {
    this.ready = Promise.reject(error);
  }

  private fail<T>(): Promise<T> {
    return this.ready.then(() => {
      throw new PlayerManagerIntegrationError("unavailable", "Player Manager is unavailable.");
    });
  }
  list(): Promise<Player[]> {
    return this.fail();
  }
  beginRegistration(
    _input: MatchingInput,
    _requiredAccounts?: RequiredAccount[],
  ): Promise<{ registrationId: string; url: string }> {
    return this.fail();
  }
}

export function createPlayerManagerGateway(nodecg: NodeCG): PlayerManagerGateway {
  const exposed: unknown = nodecg.extensions?.["player-manager"];
  if (!exposed || typeof exposed !== "object") {
    return new UnavailablePlayerManagerGateway(
      new PlayerManagerIntegrationError("unavailable", "Player Manager extension is not loaded."),
    );
  }
  const apiVersion = (exposed as { apiVersion?: unknown }).apiVersion;
  if (apiVersion !== API_VERSION) {
    return new UnavailablePlayerManagerGateway(
      new PlayerManagerIntegrationError(
        "version_mismatch",
        `Unsupported Player Manager API version: ${String(apiVersion)} (expected ${API_VERSION}).`,
      ),
    );
  }
  const api = exposed as PlayerManagerAPI;
  return new ApiPlayerManagerGateway(api);
}

export function setupPlayerManagerIntegration(
  nodecg: NodeCG,
  status: Replicant<IntegrationStatus>,
): PlayerManagerGateway {
  const gateway = createPlayerManagerGateway(nodecg);
  void gateway.ready.then(
    () => {
      const current = status.value ?? createDefaultIntegrationStatus();
      status.value = { ...current, playerManager: { state: "ready", message: null } };
    },
    (error: unknown) => {
      const integration = integrationError(error);
      const current = status.value ?? createDefaultIntegrationStatus();
      status.value = {
        ...current,
        playerManager: {
          state: integration.code === "unavailable" ? "unavailable" : "error",
          message: integration.message,
        },
      };
      nodecg.log.warn(`[player-manager.${integration.code}] ${integration.message}`);
    },
  );
  return gateway;
}
