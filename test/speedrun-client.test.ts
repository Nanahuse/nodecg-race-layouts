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
import {
  FakeFetch,
  collectionEnvelope,
  deferred,
  gameRecord,
  jsonResponse,
  paginationInfo,
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
