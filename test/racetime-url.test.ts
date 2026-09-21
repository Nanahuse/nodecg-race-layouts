import { describe, expect, it } from "vitest";

import {
  InvalidRaceUrlError,
  RaceTimeWebSocketError,
} from "../src/extension/integrations/racetime/errors";
import {
  canonicalizeRaceUrl,
  resolveWebSocketUrl,
} from "../src/extension/integrations/racetime/url";

const CANONICAL = "https://racetime.gg/ootr/example-race-1234";

describe("canonicalizeRaceUrl", () => {
  it("canonicalizes a plain race page URL", () => {
    const result = canonicalizeRaceUrl(CANONICAL);
    expect(result.canonicalUrl).toBe(CANONICAL);
    expect(result.categorySlug).toBe("ootr");
    expect(result.raceSlug).toBe("example-race-1234");
    expect(result.dataUrl).toBe(`${CANONICAL}/data`);
  });

  it("accepts trailing slash, query and fragment variants", () => {
    const variants = [
      `${CANONICAL}/`,
      `${CANONICAL}?foo=bar`,
      `${CANONICAL}#fragment`,
      `${CANONICAL}/?foo=bar#fragment`,
    ];
    for (const variant of variants) {
      expect(canonicalizeRaceUrl(variant).canonicalUrl).toBe(CANONICAL);
    }
  });

  it("rejects a missing category", () => {
    expect(() => canonicalizeRaceUrl("https://racetime.gg/example-race-1234")).toThrow(
      InvalidRaceUrlError,
    );
  });

  it("rejects a missing race", () => {
    expect(() => canonicalizeRaceUrl("https://racetime.gg/ootr")).toThrow(InvalidRaceUrlError);
  });

  it("rejects an extra path segment", () => {
    expect(() => canonicalizeRaceUrl(`${CANONICAL}/extra`)).toThrow(InvalidRaceUrlError);
  });

  it("rejects a different hostname", () => {
    expect(() => canonicalizeRaceUrl("https://example.com/ootr/race")).toThrow(InvalidRaceUrlError);
  });

  it("rejects http", () => {
    expect(() => canonicalizeRaceUrl("http://racetime.gg/ootr/race")).toThrow(InvalidRaceUrlError);
  });

  it("rejects a malformed URL", () => {
    expect(() => canonicalizeRaceUrl("not a url")).toThrow(InvalidRaceUrlError);
  });
});

describe("resolveWebSocketUrl", () => {
  it("resolves a relative URL against racetime.gg", () => {
    expect(resolveWebSocketUrl("/ws/race/example-race-1234")).toBe(
      "wss://racetime.gg/ws/race/example-race-1234",
    );
  });

  it("keeps an absolute wss URL", () => {
    expect(resolveWebSocketUrl("wss://racetime.gg/ws/race/example-race-1234")).toBe(
      "wss://racetime.gg/ws/race/example-race-1234",
    );
  });

  it("rejects a ws URL", () => {
    expect(() => resolveWebSocketUrl("ws://racetime.gg/ws/race/x")).toThrow(RaceTimeWebSocketError);
  });

  it("rejects a different hostname", () => {
    expect(() => resolveWebSocketUrl("wss://example.com/ws/race/x")).toThrow(
      RaceTimeWebSocketError,
    );
  });
});
