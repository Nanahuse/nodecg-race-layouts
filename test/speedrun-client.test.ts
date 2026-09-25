import { describe, expect, it } from "vitest";

import {
  HttpSpeedrunComClient,
  type HttpSpeedrunComClientOptions,
} from "../src/extension/integrations/speedruncom/client";
import {
  SpeedrunComAbortedError,
  SpeedrunComHttpError,
  SpeedrunComInvalidJsonError,
  SpeedrunComNetworkError,
  SpeedrunComNotFoundError,
  SpeedrunComPayloadError,
  SpeedrunComRateLimitedError,
  SpeedrunComTimeoutError,
} from "../src/extension/integrations/speedruncom/errors";
import type { LeaderboardKey } from "../src/domain";
import {
  FakeFetch,
  collectionEnvelope,
  deferred,
  gameRecord,
  jsonResponse,
  paginationInfo,
  runRecord,
  singleEnvelope,
} from "./support/speedrun-fakes";

function makeClient(fetch: FakeFetch, options: HttpSpeedrunComClientOptions = {}) {
  return new HttpSpeedrunComClient({ fetchImpl: fetch.fetchImpl, ...options });
}

function abortingHandler(): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
}

describe("HttpSpeedrunComClient request handling", () => {
  it("returns mapped data for a normal response", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(singleEnvelope(gameRecord()));
    const client = makeClient(fetch);

    const game = await client.getGame("game-1");

    expect(game.id).toBe("game-1");
    expect(game.name).toBe("Super Mario Sunshine");
    expect(fetch.calls[0]?.url).toContain("/games/game-1");
  });

  it("sends the configured User-Agent and Accept headers", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(singleEnvelope(gameRecord()));
    const client = makeClient(fetch, { userAgent: "test-agent/1.0" });

    await client.getGame("game-1");

    const headers = fetch.calls[0]?.init?.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe("test-agent/1.0");
    expect(headers["accept"]).toBe("application/json");
  });

  it("maps a timeout", async () => {
    const fetch = new FakeFetch();
    fetch.queue(abortingHandler());
    const client = makeClient(fetch, { timeoutMs: 5 });
    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComTimeoutError);
  });

  it("maps an external abort", async () => {
    const fetch = new FakeFetch();
    fetch.queue(abortingHandler());
    const client = makeClient(fetch, { timeoutMs: 1000 });
    const controller = new AbortController();
    const promise = client.getGame("game-1", controller.signal);
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(SpeedrunComAbortedError);
  });

  it("maps a network error", async () => {
    const fetch = new FakeFetch();
    fetch.queue(() => {
      throw new Error("boom");
    });
    const client = makeClient(fetch);
    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComNetworkError);
  });

  it("maps 404 to not_found", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson({}, 404);
    const client = makeClient(fetch);
    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComNotFoundError);
  });

  it("maps 429 to rate_limited and keeps Retry-After", async () => {
    const fetch = new FakeFetch();
    fetch.queue(() => new Response("{}", { status: 429, headers: { "retry-after": "5" } }));
    const client = makeClient(fetch);

    const error = await client.getGame("game-1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeedrunComRateLimitedError);
    if (error instanceof SpeedrunComRateLimitedError) {
      expect(error.retryAfterMs).toBe(5000);
    }
  });

  it("maps other non-2xx responses to http_error", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson({}, 500);
    const client = makeClient(fetch);
    const error = await client.getGame("game-1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeedrunComHttpError);
    if (error instanceof SpeedrunComHttpError) {
      expect(error.status).toBe(500);
    }
  });

  it("maps invalid JSON to invalid_json", async () => {
    const fetch = new FakeFetch();
    fetch.queue(() => new Response("<html>nope</html>", { status: 200 }));
    const client = makeClient(fetch);
    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComInvalidJsonError);
  });

  it("maps an invalid payload to invalid_payload", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(singleEnvelope({ id: "game-1" }));
    const client = makeClient(fetch);
    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComPayloadError);
  });
});

describe("HttpSpeedrunComClient pagination", () => {
  it("parses and maps a verified run resource with real system and variable fields", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(
      collectionEnvelope([
        runRecord({
          game: "game-1",
          category: "category-1",
          values: { "optional-var": "value-b" },
          system: { platform: "platform-gc", emulated: false, region: null },
          times: {
            primary: "PT40M",
            primary_t: 2400,
            realtime: "PT40M",
            realtime_t: 2400,
            realtime_noloads: null,
            realtime_noloads_t: 0,
            ingame: null,
            ingame_t: 0,
          },
        }),
      ]),
    );
    const client = makeClient(fetch);
    const key: LeaderboardKey = {
      gameId: "game-1",
      categoryId: "category-1",
      levelId: null,
      variables: {},
      platformId: null,
      regionId: null,
      emulator: null,
      timingMethod: null,
    };

    const runs = await client.getUserRuns("user-1", key);
    const requestUrl = new URL(fetch.calls[0]!.url);

    expect(requestUrl.pathname).toBe("/api/v1/runs");
    expect(requestUrl.searchParams.get("user")).toBe("user-1");
    expect(requestUrl.searchParams.get("game")).toBe("game-1");
    expect(requestUrl.searchParams.get("category")).toBe("category-1");
    expect(requestUrl.searchParams.get("status")).toBe("verified");
    expect(runs[0]).toMatchObject({
      place: null,
      gameId: "game-1",
      categoryId: "category-1",
      platformId: "platform-gc",
      regionId: null,
      emulator: false,
      variables: { "optional-var": "value-b" },
      times: { primarySeconds: 2400, realtimeSeconds: 2400 },
    });
  });

  it("passes selected run filters to the /runs endpoint", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(collectionEnvelope([]));
    const client = makeClient(fetch);
    const key: LeaderboardKey = {
      gameId: "game-1",
      categoryId: "category-1",
      levelId: "level-1",
      variables: { varA: "value1" },
      platformId: "platform-gc",
      regionId: "region-us",
      emulator: false,
      timingMethod: "realtime",
    };

    await client.getUserRuns("user-1", key);

    const query = new URL(fetch.calls[0]!.url).searchParams;
    expect(query.get("level")).toBe("level-1");
    expect(query.get("platform")).toBe("platform-gc");
    expect(query.get("region")).toBe("region-us");
    expect(query.get("emulated")).toBe("false");
    expect(query.get("status")).toBe("verified");
    expect(query.has("var-varA")).toBe(false);
    expect(query.has("timing")).toBe(false);
  });

  it("fetches multiple pages until the limit is reached", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(
      collectionEnvelope(
        [gameRecord({ id: "g1" }), gameRecord({ id: "g2" })],
        paginationInfo({ size: 2, max: 2, links: [{ rel: "next", uri: "next" }] }),
      ),
    );
    fetch.queueJson(
      collectionEnvelope([gameRecord({ id: "g3" })], paginationInfo({ size: 1, max: 2 })),
    );
    const client = makeClient(fetch, { pageSize: 2 });

    const games = await client.searchGames("mario", 3);

    expect(games.map((game) => game.id)).toEqual(["g1", "g2", "g3"]);
    expect(fetch.calls).toHaveLength(2);
  });

  it("stops once the limit is reached", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(
      collectionEnvelope(
        [gameRecord({ id: "g1" }), gameRecord({ id: "g2" })],
        paginationInfo({ size: 2, max: 2, links: [{ rel: "next", uri: "next" }] }),
      ),
    );
    const client = makeClient(fetch, { pageSize: 2 });

    const games = await client.searchGames("mario", 2);
    expect(games).toHaveLength(2);
    expect(fetch.calls).toHaveLength(1);
  });

  it("stops when the page is not full", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(
      collectionEnvelope([gameRecord({ id: "g1" })], paginationInfo({ size: 1, max: 2 })),
    );
    const client = makeClient(fetch, { pageSize: 2 });

    const games = await client.searchGames("mario", 10);
    expect(games).toHaveLength(1);
    expect(fetch.calls).toHaveLength(1);
  });

  it("does not loop on malformed pagination", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(collectionEnvelope([gameRecord({ id: "g1" }), gameRecord({ id: "g2" })]));
    const client = makeClient(fetch, { pageSize: 2 });

    const games = await client.searchGames("mario", 10);
    expect(games).toHaveLength(2);
    expect(fetch.calls).toHaveLength(1);
  });
});

describe("HttpSpeedrunComClient cache and coalescing", () => {
  it("caches game detail and category variables", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(singleEnvelope(gameRecord()));
    fetch.queueJson(collectionEnvelope([]));
    const client = makeClient(fetch);

    await client.getGame("game-1");
    await client.getGame("game-1");
    await client.getCategoryVariables("category-1");
    await client.getCategoryVariables("category-1");

    expect(fetch.calls).toHaveLength(2);
  });

  it("uses a separate request for a different id", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson(singleEnvelope(gameRecord({ id: "game-1" })));
    fetch.queueJson(singleEnvelope(gameRecord({ id: "game-2" })));
    const client = makeClient(fetch);

    await client.getGame("game-1");
    await client.getGame("game-2");

    expect(fetch.calls).toHaveLength(2);
  });

  it("does not cache a failed request", async () => {
    const fetch = new FakeFetch();
    fetch.queueJson({}, 500);
    fetch.queueJson(singleEnvelope(gameRecord()));
    const client = makeClient(fetch);

    await expect(client.getGame("game-1")).rejects.toBeInstanceOf(SpeedrunComHttpError);
    await client.getGame("game-1");

    expect(fetch.calls).toHaveLength(2);
  });

  it("coalesces concurrent requests for the same resource", async () => {
    const fetch = new FakeFetch();
    const response = deferred<Response>();
    fetch.queue(() => response.promise);
    const client = makeClient(fetch);

    const first = client.getGame("game-1");
    const second = client.getGame("game-1");
    response.resolve(jsonResponse(singleEnvelope(gameRecord())));

    const [a, b] = await Promise.all([first, second]);
    expect(a.id).toBe("game-1");
    expect(b.id).toBe("game-1");
    expect(fetch.calls).toHaveLength(1);
  });
});
