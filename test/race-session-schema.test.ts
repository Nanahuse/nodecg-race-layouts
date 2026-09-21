import { describe, expect, it } from "vitest";

import { isValid } from "./helpers";

function validSession(): unknown {
  return {
    revision: 1,
    canonicalUrl: "https://racetime.gg/ootr/example-race-1234",
    connection: { state: "connected", message: null },
    race: {
      raceId: "ootr/example-race-1234",
      categorySlug: "ootr",
      categoryName: "Ocarina of Time Randomizer",
      goal: "Defeat Ganon",
      status: "in_progress",
      entrants: [
        { userId: "user-1", name: "Runner One", twitchLogin: "runner_one", status: "ready" },
        { userId: "user-2", name: "Runner Two", twitchLogin: null, status: "done" },
      ],
      results: [
        { userId: "user-1", name: "Runner One", place: null, time: null, status: "other" },
        { userId: "user-2", name: "Runner Two", place: 1, time: "PT1H2M3S", status: "finished" },
      ],
    },
  };
}

describe("race session schema", () => {
  it("accepts a valid draft race session", () => {
    expect(isValid("draft-race-session", validSession())).toBe(true);
  });

  it("accepts a valid active race session", () => {
    expect(isValid("active-race-session", validSession())).toBe(true);
  });

  it("accepts a null Twitch login", () => {
    const session = validSession() as {
      race: { entrants: { twitchLogin: string | null }[] };
    };
    session.race.entrants[1] = { ...session.race.entrants[1], twitchLogin: null };
    expect(isValid("draft-race-session", session)).toBe(true);
  });

  it("rejects an invalid result status", () => {
    const session = validSession() as { race: { results: { status: string }[] } };
    session.race.results[0] = { ...session.race.results[0], status: "weird" };
    expect(isValid("draft-race-session", session)).toBe(false);
  });

  it("rejects an entrant missing the Twitch login field", () => {
    const session = validSession() as {
      race: { entrants: Record<string, unknown>[] };
    };
    const { twitchLogin: _twitchLogin, ...withoutTwitch } = session.race.entrants[0] ?? {};
    session.race.entrants[0] = withoutTwitch;
    expect(isValid("draft-race-session", session)).toBe(false);
  });

  it("rejects an entrant missing the user id", () => {
    const session = validSession() as { race: { entrants: Record<string, unknown>[] } };
    const { userId: _userId, ...withoutUserId } = session.race.entrants[0] ?? {};
    session.race.entrants[0] = withoutUserId;
    expect(isValid("draft-race-session", session)).toBe(false);
  });
});
