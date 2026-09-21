import type { SpeedrunComClient } from "../../src/extension/integrations/speedruncom/client";
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
} from "../../src/extension/integrations/speedruncom/types";

export function singleEnvelope(data: unknown): unknown {
  return { data };
}

export function collectionEnvelope(data: unknown[], pagination?: unknown): unknown {
  return pagination === undefined ? { data } : { data, pagination };
}

export function paginationInfo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { offset: 0, max: 200, size: 0, links: [], ...overrides };
}

export function gameRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "game-1",
    names: { international: "Super Mario Sunshine", japanese: null },
    abbreviation: "sms",
    platforms: ["platform-1"],
    regions: ["region-1"],
    ruleset: { "run-times": ["realtime", "realtime_noloads"] },
    ...overrides,
  };
}

export function categoryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "category-1",
    name: "Any%",
    type: "per-game",
    miscellaneous: false,
    ...overrides,
  };
}

export function levelRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "level-1", name: "Bianco Hills", ...overrides };
}

export function variableRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "variable-1",
    name: "cc",
    mandatory: true,
    "user-defined": false,
    values: {
      values: {
        "value-1": { label: "150cc" },
        "value-2": { label: "200cc" },
      },
      default: "value-1",
    },
    ...overrides,
  };
}

export function platformRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "platform-1", name: "Nintendo GameCube", ...overrides };
}

export function regionRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "region-1", name: "USA / NTSC", ...overrides };
}

export function userRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "user-1",
    names: { international: "chewdiggy", japanese: null },
    twitch: { uri: "https://www.twitch.tv/chewdiggy" },
    ...overrides,
  };
}

export type FakeFetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;

export class FakeFetch {
  readonly calls: { url: string; init?: RequestInit }[] = [];
  private readonly handlers: FakeFetchHandler[] = [];

  queue(handler: FakeFetchHandler): void {
    this.handlers.push(handler);
  }

  queueJson(payload: unknown, status = 200): void {
    this.queue(() => jsonResponse(payload, status));
  }

  get fetchImpl(): typeof fetch {
    return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      this.calls.push({ url, init });
      const handler = this.handlers.shift();
      if (!handler) {
        throw new Error(`FakeFetch: no queued response for ${url}`);
      }
      return handler(url, init);
    }) as unknown as typeof fetch;
  }
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolveFn: (value: T) => void = () => undefined;
  let rejectFn: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

export function makeGameDetail(overrides: Partial<SpeedrunGameDetail> = {}): SpeedrunGameDetail {
  return {
    id: "game-1",
    name: "Super Mario Sunshine",
    abbreviation: "sms",
    platformIds: ["platform-1"],
    regionIds: ["region-1"],
    timingMethods: { realtime: true, realtimeNoLoads: true, ingame: false },
    ...overrides,
  };
}

export function makeUser(overrides: Partial<SpeedrunUserOption> = {}): SpeedrunUserOption {
  return { userId: "user-1", name: "chewdiggy", twitchLogin: "chewdiggy", ...overrides };
}

export class FakeSpeedrunComClient implements SpeedrunComClient {
  readonly calls: string[] = [];

  error: Error | null = null;

  searchGamesResult: SpeedrunGameSearchResult[] = [];
  gameResult: SpeedrunGameDetail = makeGameDetail();
  categoriesResult: SpeedrunCategoryOption[] = [];
  levelsResult: SpeedrunLevelOption[] = [];
  variablesResult: SpeedrunVariableOption[] = [];
  platformsResult: SpeedrunPlatformOption[] = [];
  regionsResult: SpeedrunRegionOption[] = [];
  usersResult: SpeedrunUserOption[] = [];
  userResult: SpeedrunUserOption = makeUser();

  gamePromise: Promise<SpeedrunGameDetail> | null = null;
  searchGamesPromise: Promise<SpeedrunGameSearchResult[]> | null = null;

  lastSearchGames: { query: string; limit: number } | null = null;
  lastSearchUsers: { query: string; mode: SpeedrunUserSearchMode; limit: number } | null = null;

  async searchGames(query: string, limit: number): Promise<SpeedrunGameSearchResult[]> {
    this.calls.push("searchGames");
    this.lastSearchGames = { query, limit };
    if (this.error) {
      throw this.error;
    }
    if (this.searchGamesPromise) {
      return this.searchGamesPromise;
    }
    return this.searchGamesResult;
  }

  async getGame(): Promise<SpeedrunGameDetail> {
    this.calls.push("getGame");
    if (this.error) {
      throw this.error;
    }
    if (this.gamePromise) {
      return this.gamePromise;
    }
    return this.gameResult;
  }

  async getCategories(): Promise<SpeedrunCategoryOption[]> {
    this.calls.push("getCategories");
    if (this.error) {
      throw this.error;
    }
    return this.categoriesResult;
  }

  async getLevels(): Promise<SpeedrunLevelOption[]> {
    this.calls.push("getLevels");
    if (this.error) {
      throw this.error;
    }
    return this.levelsResult;
  }

  async getCategoryVariables(): Promise<SpeedrunVariableOption[]> {
    this.calls.push("getCategoryVariables");
    if (this.error) {
      throw this.error;
    }
    return this.variablesResult;
  }

  async getPlatforms(): Promise<SpeedrunPlatformOption[]> {
    this.calls.push("getPlatforms");
    if (this.error) {
      throw this.error;
    }
    return this.platformsResult;
  }

  async getRegions(): Promise<SpeedrunRegionOption[]> {
    this.calls.push("getRegions");
    if (this.error) {
      throw this.error;
    }
    return this.regionsResult;
  }

  async searchUsers(
    query: string,
    mode: SpeedrunUserSearchMode,
    limit: number,
  ): Promise<SpeedrunUserOption[]> {
    this.calls.push("searchUsers");
    this.lastSearchUsers = { query, mode, limit };
    if (this.error) {
      throw this.error;
    }
    return this.usersResult;
  }

  async getUser(): Promise<SpeedrunUserOption> {
    this.calls.push("getUser");
    if (this.error) {
      throw this.error;
    }
    return this.userResult;
  }
}
