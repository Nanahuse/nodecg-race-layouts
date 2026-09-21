import { AsyncResourceCache } from "./cache";
import {
  SpeedrunComAbortedError,
  SpeedrunComError,
  SpeedrunComHttpError,
  SpeedrunComInvalidJsonError,
  SpeedrunComNetworkError,
  SpeedrunComNotFoundError,
  SpeedrunComRateLimitedError,
  SpeedrunComTimeoutError,
} from "./errors";
import {
  mapCategory,
  mapGameDetail,
  mapGameSearchResult,
  mapLevel,
  mapPlatform,
  mapRegion,
  mapUser,
  mapVariable,
} from "./mapper";
import { parseCollectionEnvelope, parseSingleEnvelope } from "./parser";
import type {
  SpeedrunCategoryOption,
  SpeedrunGameDetail,
  SpeedrunGameSearchResult,
  SpeedrunLevelOption,
  SpeedrunPlatformOption,
  SpeedrunRegionOption,
  SpeedrunUserOption,
  SpeedrunUserSearchMode,
  SpeedrunVariableOption,
} from "./types";
import { buildSpeedrunComUrl, type QueryValue } from "./url";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 5;
const LARGE_COLLECTION_LIMIT = 1000;

export interface SpeedrunComClient {
  searchGames(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<SpeedrunGameSearchResult[]>;
  getGame(gameId: string, signal?: AbortSignal): Promise<SpeedrunGameDetail>;

  getCategories(gameId: string, signal?: AbortSignal): Promise<SpeedrunCategoryOption[]>;
  getLevels(gameId: string, signal?: AbortSignal): Promise<SpeedrunLevelOption[]>;
  getCategoryVariables(categoryId: string, signal?: AbortSignal): Promise<SpeedrunVariableOption[]>;

  getPlatforms(signal?: AbortSignal): Promise<SpeedrunPlatformOption[]>;
  getRegions(signal?: AbortSignal): Promise<SpeedrunRegionOption[]>;

  searchUsers(
    query: string,
    mode: SpeedrunUserSearchMode,
    limit: number,
    signal?: AbortSignal,
  ): Promise<SpeedrunUserOption[]>;
  getUser(userId: string, signal?: AbortSignal): Promise<SpeedrunUserOption>;
}

export type HttpSpeedrunComClientOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
  cache?: AsyncResourceCache;
  pageSize?: number;
  maxPages?: number;
};

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function parseRetryAfterMs(header: string | null): number | null {
  if (header === null || header.trim() === "") {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return null;
}

export class HttpSpeedrunComClient implements SpeedrunComClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly cache: AsyncResourceCache;
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(options: HttpSpeedrunComClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? "nodecg-race-layouts";
    this.cache = options.cache ?? new AsyncResourceCache();
    this.pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), 200);
    this.maxPages = Math.max(options.maxPages ?? DEFAULT_MAX_PAGES, 1);
  }

  searchGames(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<SpeedrunGameSearchResult[]> {
    return this.fetchCollection("/games", { name: query }, limit, signal, mapGameSearchResult);
  }

  getGame(gameId: string, signal?: AbortSignal): Promise<SpeedrunGameDetail> {
    return this.cache.get(`game:${gameId}`, () =>
      this.fetchSingle(`/games/${encodeURIComponent(gameId)}`, signal, mapGameDetail),
    );
  }

  getCategories(gameId: string, signal?: AbortSignal): Promise<SpeedrunCategoryOption[]> {
    return this.cache.get(`categories:${gameId}`, () =>
      this.fetchCollection(
        `/games/${encodeURIComponent(gameId)}/categories`,
        {},
        LARGE_COLLECTION_LIMIT,
        signal,
        mapCategory,
      ),
    );
  }

  getLevels(gameId: string, signal?: AbortSignal): Promise<SpeedrunLevelOption[]> {
    return this.cache.get(`levels:${gameId}`, () =>
      this.fetchCollection(
        `/games/${encodeURIComponent(gameId)}/levels`,
        {},
        LARGE_COLLECTION_LIMIT,
        signal,
        mapLevel,
      ),
    );
  }

  getCategoryVariables(
    categoryId: string,
    signal?: AbortSignal,
  ): Promise<SpeedrunVariableOption[]> {
    return this.cache.get(`variables:${categoryId}`, () =>
      this.fetchCollection(
        `/categories/${encodeURIComponent(categoryId)}/variables`,
        {},
        LARGE_COLLECTION_LIMIT,
        signal,
        mapVariable,
      ),
    );
  }

  getPlatforms(signal?: AbortSignal): Promise<SpeedrunPlatformOption[]> {
    return this.cache.get("platforms", () =>
      this.fetchCollection("/platforms", {}, LARGE_COLLECTION_LIMIT, signal, mapPlatform),
    );
  }

  getRegions(signal?: AbortSignal): Promise<SpeedrunRegionOption[]> {
    return this.cache.get("regions", () =>
      this.fetchCollection("/regions", {}, LARGE_COLLECTION_LIMIT, signal, mapRegion),
    );
  }

  searchUsers(
    query: string,
    mode: SpeedrunUserSearchMode,
    limit: number,
    signal?: AbortSignal,
  ): Promise<SpeedrunUserOption[]> {
    const parameter = mode === "lookup" ? "lookup" : mode === "twitch" ? "twitch" : "name";
    return this.fetchCollection("/users", { [parameter]: query }, limit, signal, mapUser);
  }

  getUser(userId: string, signal?: AbortSignal): Promise<SpeedrunUserOption> {
    return this.cache.get(`user:${userId}`, () =>
      this.fetchSingle(`/users/${encodeURIComponent(userId)}`, signal, mapUser),
    );
  }

  private async fetchSingle<T>(
    path: string,
    signal: AbortSignal | undefined,
    mapItem: (value: unknown) => T,
  ): Promise<T> {
    const payload = await this.request(path, {}, signal);
    return mapItem(parseSingleEnvelope(payload));
  }

  private async fetchCollection<T>(
    path: string,
    query: Record<string, QueryValue>,
    limit: number,
    signal: AbortSignal | undefined,
    mapItem: (value: unknown) => T,
  ): Promise<T[]> {
    const effectiveLimit = Math.max(1, Math.floor(limit));
    const pageSize = Math.min(this.pageSize, 200, effectiveLimit);
    const items: T[] = [];
    let offset = 0;
    let pages = 0;

    while (items.length < effectiveLimit && pages < this.maxPages) {
      const payload = await this.request(path, { ...query, max: pageSize, offset }, signal);
      const collection = parseCollectionEnvelope(payload);
      for (const record of collection.data) {
        items.push(mapItem(record));
      }
      pages += 1;

      const size = collection.pagination?.size ?? collection.data.length;
      if (size < pageSize || collection.pagination === null) {
        break;
      }
      offset += pageSize;
    }

    return items.slice(0, effectiveLimit);
  }

  private async request(
    path: string,
    query: Record<string, QueryValue>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = buildSpeedrunComUrl(path, query);
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": this.userAgent },
        signal: controller.signal,
      });

      if (response.status === 404) {
        throw new SpeedrunComNotFoundError(`Speedrun.com resource not found: ${path}`);
      }
      if (response.status === 429) {
        throw new SpeedrunComRateLimitedError(
          "Speedrun.com rate limit reached.",
          parseRetryAfterMs(response.headers.get("retry-after")),
        );
      }
      if (!response.ok) {
        throw new SpeedrunComHttpError(
          response.status,
          `Speedrun.com returned HTTP ${response.status} for ${path}.`,
        );
      }

      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new SpeedrunComInvalidJsonError("Speedrun.com response was not valid JSON.");
      }
    } catch (error) {
      if (error instanceof SpeedrunComError) {
        throw error;
      }
      if (isAbortLike(error)) {
        if (signal?.aborted) {
          throw new SpeedrunComAbortedError("Speedrun.com request was aborted.");
        }
        throw new SpeedrunComTimeoutError(
          `Speedrun.com request timed out after ${this.timeoutMs}ms.`,
        );
      }
      throw new SpeedrunComNetworkError(`Failed to reach Speedrun.com for ${path}.`, {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
