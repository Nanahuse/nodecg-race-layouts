import type { NodeCG } from "../../types/nodecg";
import type { SpeedrunDiscoveryService } from "../application/speedrun-discovery-service";
import type { SpeedrunUserSearchMode } from "../integrations/speedruncom/types";

export const SPEEDRUN_GAMES_SEARCH_MESSAGE = "speedrun.games.search";
export const SPEEDRUN_GAME_GET_MESSAGE = "speedrun.game.get";
export const SPEEDRUN_GAME_OPTIONS_MESSAGE = "speedrun.game.options";
export const SPEEDRUN_CATEGORY_VARIABLES_MESSAGE = "speedrun.category.variables";
export const SPEEDRUN_USERS_SEARCH_MESSAGE = "speedrun.users.search";
export const SPEEDRUN_USER_GET_MESSAGE = "speedrun.user.get";

export type SpeedrunGamesSearchRequest = {
  query: string;
  limit?: number;
};

export type SpeedrunGameRequest = {
  gameId: string;
};

export type SpeedrunCategoryVariablesRequest = {
  categoryId: string;
};

export type SpeedrunUsersSearchRequest = {
  query: string;
  mode?: SpeedrunUserSearchMode;
  limit?: number;
};

export type SpeedrunUserGetRequest = {
  userId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(data: unknown, key: string): string {
  if (isRecord(data) && typeof data[key] === "string") {
    return data[key];
  }
  return "";
}

function readLimit(data: unknown): number | undefined {
  return isRecord(data) && typeof data.limit === "number" ? data.limit : undefined;
}

function readMode(data: unknown): SpeedrunUserSearchMode | undefined {
  const mode = isRecord(data) ? data.mode : undefined;
  return mode === "lookup" || mode === "twitch" || mode === "name" ? mode : undefined;
}

/**
 * Register the Speedrun.com discovery message handlers. Business logic lives in
 * `SpeedrunDiscoveryService`; these handlers only extract request fields and
 * acknowledge the structured result.
 */
export function registerSpeedrunMessages(nodecg: NodeCG, service: SpeedrunDiscoveryService): void {
  nodecg.listenFor(SPEEDRUN_GAMES_SEARCH_MESSAGE, async (data, ack) => {
    const response = await service.searchGames(readString(data, "query"), readLimit(data));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(SPEEDRUN_GAME_GET_MESSAGE, async (data, ack) => {
    const response = await service.getGame(readString(data, "gameId"));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(SPEEDRUN_GAME_OPTIONS_MESSAGE, async (data, ack) => {
    const response = await service.getGameOptions(readString(data, "gameId"));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(SPEEDRUN_CATEGORY_VARIABLES_MESSAGE, async (data, ack) => {
    const response = await service.getCategoryVariables(readString(data, "categoryId"));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(SPEEDRUN_USERS_SEARCH_MESSAGE, async (data, ack) => {
    const response = await service.searchUsers(
      readString(data, "query"),
      readMode(data),
      readLimit(data),
    );
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  nodecg.listenFor(SPEEDRUN_USER_GET_MESSAGE, async (data, ack) => {
    const response = await service.getUser(readString(data, "userId"));
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
