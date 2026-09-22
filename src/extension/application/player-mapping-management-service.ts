import { randomUUID } from "node:crypto";
import type {
  ActiveConfig,
  DraftConfig,
  PlayerDirectory,
  PlayerMapping,
  PostApplyPersistenceState,
} from "../../domain";
import { resolveDisplayName, validatePlayerDirectory } from "../../domain";
import type { SpeedrunDiscoveryService } from "./speedrun-discovery-service";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import type { PlayerDirectoryService } from "./player-directory-service";
import type {
  PlayerDirectoryCreateResponse,
  PlayerDirectoryDeleteResponse,
  PlayerMappingEditInput,
  PlayerDirectoryFailure,
  PlayerDirectoryReloadResponse,
  PlayerDirectoryUpdateResponse,
} from "../../protocol/player-directory";

export type PlayerMappingManagementOptions = {
  directoryService: PlayerDirectoryService;
  playerDirectory: { readonly value: PlayerDirectory };
  draftConfig: Replicant<DraftConfig>;
  activeConfig: Replicant<ActiveConfig | null>;
  persistence: Replicant<PostApplyPersistenceState>;
  speedrun: SpeedrunDiscoveryService;
  log: NodeCGLogger;
};

function failure(
  reason: PlayerDirectoryFailure["reason"],
  message: string,
): PlayerDirectoryFailure {
  return { ok: false, reason, message };
}

function normalizeInput(input: PlayerMappingEditInput): PlayerMappingEditInput {
  const manualDisplayName =
    typeof input.manualDisplayName === "string" ? input.manualDisplayName.trim() : null;
  const racetime =
    input.racetime.state === "linked"
      ? {
          state: "linked" as const,
          userId: input.racetime.userId.trim(),
          name: input.racetime.name.trim(),
          twitchLogin: input.racetime.twitchLogin?.trim() || null,
        }
      : { state: "none" as const };
  const twitch =
    input.twitch.state === "linked"
      ? { state: "linked" as const, login: input.twitch.login.trim() }
      : { state: "none" as const };
  return {
    manualDisplayName: manualDisplayName || null,
    racetime,
    speedrunCom:
      input.speedrunCom.state === "linked"
        ? { state: "linked" as const, userId: input.speedrunCom.userId.trim() }
        : { state: "none" as const },
    twitch,
  };
}

export class PlayerMappingManagementService {
  constructor(private readonly options: PlayerMappingManagementOptions) {}

  async create(input: PlayerMappingEditInput): Promise<PlayerDirectoryCreateResponse> {
    if (typeof input.manualDisplayName !== "string" || input.manualDisplayName.trim() === "")
      return failure("invalid_input", "A manual display name is required when creating a player.");
    const playerId = randomUUID();
    const built = await this.buildPlayer(playerId, input);
    if (!built.ok) return built;
    const validation = this.validateNext(built.player);
    if (validation) return validation;
    try {
      await this.options.directoryService.savePlayers([built.player]);
      return { ok: true, player: built.player };
    } catch (error) {
      return failure("operation_failed", error instanceof Error ? error.message : String(error));
    }
  }

  async update(
    playerId: string,
    expectedPlayer: PlayerMapping,
    input: PlayerMappingEditInput,
  ): Promise<PlayerDirectoryUpdateResponse> {
    const current = this.options.playerDirectory.value[playerId];
    if (!current) return failure("player_not_found", `Player "${playerId}" was not found.`);
    if (JSON.stringify(current) !== JSON.stringify(expectedPlayer))
      return failure("player_changed", `Player "${playerId}" changed on the server.`);
    const inUse = this.inUseReason(playerId);
    if (inUse) return failure("player_in_use", inUse);
    const built = await this.buildPlayer(playerId, input, current);
    if (!built.ok) return built;
    const validation = this.validateNext(built.player, playerId);
    if (validation) return validation;
    try {
      await this.options.directoryService.savePlayers([built.player]);
      return { ok: true, player: built.player };
    } catch (error) {
      return failure("operation_failed", error instanceof Error ? error.message : String(error));
    }
  }

  async delete(
    playerId: string,
    expectedPlayer: PlayerMapping,
  ): Promise<PlayerDirectoryDeleteResponse> {
    const current = this.options.playerDirectory.value[playerId];
    if (!current) return failure("player_not_found", `Player "${playerId}" was not found.`);
    if (JSON.stringify(current) !== JSON.stringify(expectedPlayer))
      return failure("player_changed", `Player "${playerId}" changed on the server.`);
    const inUse = this.inUseReason(playerId);
    if (inUse) return failure("player_in_use", inUse);
    try {
      await this.options.directoryService.deletePlayer(playerId);
      return { ok: true, playerId };
    } catch (error) {
      return failure("operation_failed", error instanceof Error ? error.message : String(error));
    }
  }

  async reload(): Promise<PlayerDirectoryReloadResponse> {
    try {
      const result = await this.options.directoryService.reloadFromSpreadsheet();
      return result.ok ? result : failure("operation_failed", result.message);
    } catch (error) {
      return failure("operation_failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async buildPlayer(
    playerId: string,
    raw: PlayerMappingEditInput,
    current?: PlayerMapping,
  ): Promise<{ ok: true; player: PlayerMapping } | PlayerDirectoryFailure> {
    const input = normalizeInput(raw);
    if (
      input.manualDisplayName === null &&
      input.racetime.state === "none" &&
      input.speedrunCom.state === "none" &&
      input.twitch.state === "none"
    )
      return failure("invalid_input", "A display name or linked identity is required.");
    if (input.racetime.state === "linked" && (!input.racetime.userId || !input.racetime.name))
      return failure("invalid_input", "RaceTime user id and name are required.");
    if (input.twitch.state === "linked" && !input.twitch.login)
      return failure("invalid_input", "Twitch login is required.");
    let speedrunCom: PlayerMapping["speedrunCom"] = { state: "none" };
    if (input.speedrunCom.state === "linked") {
      if (!input.speedrunCom.userId)
        return failure("invalid_input", "Speedrun.com user id is required.");
      const currentSpeedrun = current?.speedrunCom;
      if (
        currentSpeedrun?.state === "linked" &&
        currentSpeedrun.value.userId === input.speedrunCom.userId
      ) {
        speedrunCom = currentSpeedrun;
      } else {
        const result = await this.options.speedrun.getUser(input.speedrunCom.userId);
        if (!result.ok)
          return failure(
            result.reason === "not_found" ? "speedrun_user_not_found" : "speedrun_lookup_failed",
            result.message,
          );
        speedrunCom = { state: "linked", value: result.user };
      }
    }
    const player: PlayerMapping = {
      playerId,
      manualDisplayName: input.manualDisplayName,
      racetime:
        input.racetime.state === "linked"
          ? {
              state: "linked",
              value: {
                userId: input.racetime.userId,
                name: input.racetime.name,
                twitchLogin: input.racetime.twitchLogin,
              },
            }
          : { state: "none" },
      speedrunCom,
      twitch:
        input.twitch.state === "linked"
          ? {
              state: "linked",
              value: {
                userId:
                  current?.twitch.state === "linked" &&
                  current.twitch.value.login.trim().toLowerCase() ===
                    input.twitch.login.toLowerCase()
                    ? current.twitch.value.userId
                    : null,
                login: input.twitch.login,
              },
            }
          : { state: "none" },
    };
    return resolveDisplayName(player) === null
      ? failure("invalid_input", "Player must have a resolvable display name.")
      : { ok: true, player };
  }

  private validateNext(player: PlayerMapping, replacing?: string): PlayerDirectoryFailure | null {
    const players = Object.values(this.options.playerDirectory.value).filter(
      (item) => item.playerId !== replacing,
    );
    const issue = validatePlayerDirectory([...players, player])[0];
    return issue ? failure("identity_conflict", issue.message) : null;
  }

  private inUseReason(playerId: string): string | null {
    const draft = this.options.draftConfig.value;
    if (draft.participants.some((item) => item.playerId === playerId))
      return "Player is used by Draft participants.";
    if (draft.commentatorPlayerIds.includes(playerId))
      return "Player is used by Draft commentators.";
    const active = this.options.activeConfig.value;
    if (active?.participants.some((item) => item.playerId === playerId))
      return "Player is used by Active participants.";
    if (active?.commentatorPlayerIds.includes(playerId))
      return "Player is used by Active commentators.";
    if (
      this.options.persistence.value.queue.some((item) =>
        item.players.some((player) => player.playerId === playerId),
      )
    )
      return "Player is pending persistence.";
    return null;
  }
}
