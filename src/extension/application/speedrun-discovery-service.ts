import type { NodeCGLogger } from "../../types/nodecg";
import type { SpeedrunComClient } from "../integrations/speedruncom/client";
import {
  describeSpeedrunComError,
  SpeedrunComError,
  type SpeedrunComErrorCode,
} from "../integrations/speedruncom/errors";
import { toTimingMethodList } from "../integrations/speedruncom/mapper";
import type {
  SpeedrunGameDetail,
  SpeedrunGameOptions,
  SpeedrunGameSearchResult,
  SpeedrunPlatformOption,
  SpeedrunRegionOption,
  SpeedrunUserOption,
  SpeedrunUserSearchMode,
  SpeedrunVariableOption,
} from "../integrations/speedruncom/types";
import type { SpeedrunOperationStatusCoordinator } from "./speedrun-status-coordinator";

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;

export type SpeedrunDiscoveryFailureReason = SpeedrunComErrorCode | "invalid_request" | "unknown";

export type SpeedrunDiscoveryFailure = {
  ok: false;
  reason: SpeedrunDiscoveryFailureReason;
  message: string;
};

export type SpeedrunGamesSearchOutcome =
  { ok: true; games: SpeedrunGameSearchResult[] } | SpeedrunDiscoveryFailure;

export type SpeedrunGameGetOutcome =
  { ok: true; game: SpeedrunGameDetail } | SpeedrunDiscoveryFailure;

export type SpeedrunGameOptionsOutcome =
  { ok: true; options: SpeedrunGameOptions } | SpeedrunDiscoveryFailure;

export type SpeedrunCategoryVariablesOutcome =
  { ok: true; variables: SpeedrunVariableOption[] } | SpeedrunDiscoveryFailure;

export type SpeedrunUsersSearchOutcome =
  { ok: true; users: SpeedrunUserOption[] } | SpeedrunDiscoveryFailure;

export type SpeedrunUserGetOutcome =
  { ok: true; user: SpeedrunUserOption } | SpeedrunDiscoveryFailure;

export type SpeedrunDiscoveryServiceOptions = {
  client: SpeedrunComClient;
  status: SpeedrunOperationStatusCoordinator;
  log: NodeCGLogger;
};

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_SEARCH_LIMIT);
}

function toReason(error: unknown): SpeedrunDiscoveryFailureReason {
  if (error instanceof SpeedrunComError) {
    return error.code;
  }
  return "unknown";
}

function fail(reason: SpeedrunDiscoveryFailureReason, message: string): SpeedrunDiscoveryFailure {
  return { ok: false, reason, message };
}

/**
 * Read-only Speedrun.com discovery API used by the dashboard. It never mutates
 * the draft or any other replicant; `integration-status.speedrunCom` is managed
 * by the shared status coordinator.
 */
export class SpeedrunDiscoveryService {
  private readonly client: SpeedrunComClient;
  private readonly status: SpeedrunOperationStatusCoordinator;
  private readonly log: NodeCGLogger;

  constructor(options: SpeedrunDiscoveryServiceOptions) {
    this.client = options.client;
    this.status = options.status;
    this.log = options.log;
  }

  async searchGames(query: string, limit?: number): Promise<SpeedrunGamesSearchOutcome> {
    const normalized = typeof query === "string" ? query.trim() : "";
    if (normalized === "") {
      return fail("invalid_request", "A search query is required.");
    }
    const effectiveLimit = clampLimit(limit);

    return this.run("games.search", async () => {
      const games = await this.client.searchGames(normalized, effectiveLimit);
      this.logEvent("speedrun.games.search.completed", { resultCount: games.length });
      return { ok: true as const, games };
    });
  }

  async getGame(gameId: string): Promise<SpeedrunGameGetOutcome> {
    const id = typeof gameId === "string" ? gameId.trim() : "";
    if (id === "") {
      return fail("invalid_request", "A game id is required.");
    }

    return this.run("game.get", async () => {
      const game = await this.client.getGame(id);
      this.logEvent("speedrun.game.get.completed", { gameId: id });
      return { ok: true as const, game };
    });
  }

  async getGameOptions(gameId: string): Promise<SpeedrunGameOptionsOutcome> {
    const id = typeof gameId === "string" ? gameId.trim() : "";
    if (id === "") {
      return fail("invalid_request", "A game id is required.");
    }

    return this.run("game.options", async () => {
      const game = await this.client.getGame(id);
      const [categories, levels, platforms, regions] = await Promise.all([
        this.client.getCategories(id),
        this.client.getLevels(id),
        this.client.getPlatforms(),
        this.client.getRegions(),
      ]);

      const platformOptions = game.platformIds
        .map((platformId) => platforms.find((platform) => platform.id === platformId))
        .filter((platform): platform is SpeedrunPlatformOption => platform !== undefined);
      const regionOptions = game.regionIds
        .map((regionId) => regions.find((region) => region.id === regionId))
        .filter((region): region is SpeedrunRegionOption => region !== undefined);

      const options: SpeedrunGameOptions = {
        game,
        categories,
        levels,
        platforms: platformOptions,
        regions: regionOptions,
        timingMethods: toTimingMethodList(game.timingMethods),
      };

      this.logEvent("speedrun.game.options.completed", {
        gameId: id,
        categoryCount: categories.length,
        levelCount: levels.length,
      });
      return { ok: true as const, options };
    });
  }

  async getCategoryVariables(categoryId: string): Promise<SpeedrunCategoryVariablesOutcome> {
    const id = typeof categoryId === "string" ? categoryId.trim() : "";
    if (id === "") {
      return fail("invalid_request", "A category id is required.");
    }

    return this.run("category.variables", async () => {
      const variables = await this.client.getCategoryVariables(id);
      this.logEvent("speedrun.category.variables.completed", {
        categoryId: id,
        resultCount: variables.length,
      });
      return { ok: true as const, variables };
    });
  }

  async searchUsers(
    query: string,
    mode: SpeedrunUserSearchMode = "name",
    limit?: number,
  ): Promise<SpeedrunUsersSearchOutcome> {
    const normalized = typeof query === "string" ? query.trim() : "";
    if (normalized === "") {
      return fail("invalid_request", "A search query is required.");
    }
    const normalizedMode: SpeedrunUserSearchMode =
      mode === "lookup" || mode === "twitch" ? mode : "name";
    const effectiveLimit = clampLimit(limit);

    return this.run("users.search", async () => {
      const users = await this.client.searchUsers(normalized, normalizedMode, effectiveLimit);
      this.logEvent("speedrun.users.search.completed", { resultCount: users.length });
      return { ok: true as const, users };
    });
  }

  async getUser(userId: string): Promise<SpeedrunUserGetOutcome> {
    const id = typeof userId === "string" ? userId.trim() : "";
    if (id === "") {
      return fail("invalid_request", "A user id is required.");
    }

    return this.run("user.get", async () => {
      const user = await this.client.getUser(id);
      this.logEvent("speedrun.user.get.completed", { userId: id });
      return { ok: true as const, user };
    });
  }

  private async run<T extends object>(
    operation: string,
    body: () => Promise<T>,
  ): Promise<T | SpeedrunDiscoveryFailure> {
    try {
      return await this.status.run(operation, body);
    } catch (error) {
      return fail(toReason(error), describeSpeedrunComError(error));
    }
  }

  private logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
  ): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(
        `${key}=${value instanceof Error ? describeSpeedrunComError(value) : String(value)}`,
      );
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;

    if (level === "error") {
      this.log.error(message);
    } else if (level === "warn") {
      this.log.warn(message);
    } else {
      this.log.info(message);
    }
  }
}
