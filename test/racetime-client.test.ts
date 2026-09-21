import { describe, expect, it } from "vitest";

import { HttpRaceTimeClient, parseRaceDetail } from "../src/extension/integrations/racetime/client";
import {
  RaceNotFoundError,
  RaceTimeAbortedError,
  RaceTimeHttpError,
  RaceTimePayloadError,
  RaceTimeTimeoutError,
} from "../src/extension/integrations/racetime/errors";
import { canonicalizeRaceUrl } from "../src/extension/integrations/racetime/url";

const CANONICAL = canonicalizeRaceUrl("https://racetime.gg/ootr/example-race-1234");

function makeRawPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 3,
    name: "ootr/example-race-1234",
    slug: "example-race-1234",
    status: { value: "open" },
    url: "/ootr/example-race-1234",
    data_url: "/ootr/example-race-1234/data",
    websocket_url: "/ws/race/example-race-1234",
    category: { name: "OOTR", slug: "ootr" },
    goal: { name: "Ganon" },
    entrants: [
      {
        user: { id: "u1", name: "One", twitch_name: "one_tv" },
        status: { value: "ready" },
        finish_time: null,
        place: null,
      },
      {
        user: { id: "u2", name: "Two", twitch_name: null },
        status: { value: "done" },
        finish_time: "PT1H2M3S",
        place: 1,
      },
    ],
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchReturning(response: Response): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

function fetchRejectingOnAbort(): typeof fetch {
  return ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    })) as unknown as typeof fetch;
}

describe("parseRaceDetail", () => {
  it("parses the fields we use", () => {
    const dto = parseRaceDetail(makeRawPayload());

    expect(dto.version).toBe(3);
    expect(dto.slug).toBe("example-race-1234");
    expect(dto.status).toBe("open");
    expect(dto.websocketUrl).toBe("/ws/race/example-race-1234");
    expect(dto.categorySlug).toBe("ootr");
    expect(dto.categoryName).toBe("OOTR");
    expect(dto.goal).toBe("Ganon");
    expect(dto.entrants).toEqual([
      {
        userId: "u1",
        name: "One",
        twitchLogin: "one_tv",
        status: "ready",
        finishTime: null,
        place: null,
      },
      {
        userId: "u2",
        name: "Two",
        twitchLogin: null,
        status: "done",
        finishTime: "PT1H2M3S",
        place: 1,
      },
    ]);
  });

  it("rejects a missing required field", () => {
    const payload = makeRawPayload();
    delete payload.version;
    expect(() => parseRaceDetail(payload)).toThrow(RaceTimePayloadError);
  });

  it("rejects a wrong type", () => {
    expect(() => parseRaceDetail(makeRawPayload({ version: "3" }))).toThrow(RaceTimePayloadError);
  });

  it("rejects entrants that are not an array", () => {
    expect(() => parseRaceDetail(makeRawPayload({ entrants: {} }))).toThrow(RaceTimePayloadError);
  });

  it("rejects an entrant without a user id", () => {
    expect(() =>
      parseRaceDetail(
        makeRawPayload({
          entrants: [{ user: { name: "One" }, status: { value: "ready" } }],
        }),
      ),
    ).toThrow(RaceTimePayloadError);
  });

  it("rejects a missing category", () => {
    const payload = makeRawPayload();
    delete payload.category;
    expect(() => parseRaceDetail(payload)).toThrow(RaceTimePayloadError);
  });

  it("rejects a missing websocket_url", () => {
    const payload = makeRawPayload();
    delete payload.websocket_url;
    expect(() => parseRaceDetail(payload)).toThrow(RaceTimePayloadError);
  });

  it("rejects a missing status value", () => {
    expect(() => parseRaceDetail(makeRawPayload({ status: {} }))).toThrow(RaceTimePayloadError);
  });
});

describe("HttpRaceTimeClient", () => {
  it("returns the parsed DTO for a successful response", async () => {
    const client = new HttpRaceTimeClient({
      fetchImpl: fetchReturning(jsonResponse(makeRawPayload())),
    });
    const dto = await client.fetchRaceDetail(CANONICAL);
    expect(dto.slug).toBe("example-race-1234");
  });

  it("maps 404 to not_found", async () => {
    const client = new HttpRaceTimeClient({ fetchImpl: fetchReturning(jsonResponse({}, 404)) });
    await expect(client.fetchRaceDetail(CANONICAL)).rejects.toBeInstanceOf(RaceNotFoundError);
  });

  it("maps other non-2xx responses to http_error", async () => {
    const client = new HttpRaceTimeClient({ fetchImpl: fetchReturning(jsonResponse({}, 500)) });
    const error = await client.fetchRaceDetail(CANONICAL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RaceTimeHttpError);
    if (error instanceof RaceTimeHttpError) {
      expect(error.status).toBe(500);
    }
  });

  it("maps invalid JSON to invalid_payload", async () => {
    const client = new HttpRaceTimeClient({
      fetchImpl: fetchReturning(new Response("<html>nope</html>", { status: 200 })),
    });
    await expect(client.fetchRaceDetail(CANONICAL)).rejects.toBeInstanceOf(RaceTimePayloadError);
  });

  it("maps a timeout to timeout", async () => {
    const client = new HttpRaceTimeClient({ fetchImpl: fetchRejectingOnAbort(), timeoutMs: 5 });
    await expect(client.fetchRaceDetail(CANONICAL)).rejects.toBeInstanceOf(RaceTimeTimeoutError);
  });

  it("maps an external abort to aborted", async () => {
    const client = new HttpRaceTimeClient({ fetchImpl: fetchRejectingOnAbort(), timeoutMs: 1000 });
    const controller = new AbortController();
    const promise = client.fetchRaceDetail(CANONICAL, controller.signal);
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(RaceTimeAbortedError);
  });
});
