import type { RaceSession, RaceSessionRace, RaceTimeEntrant } from "../../src/domain";

export function makeEntrant(overrides: Partial<RaceTimeEntrant> = {}): RaceTimeEntrant {
  return {
    userId: "user-1",
    name: "Runner One",
    twitchLogin: "runner_one",
    status: "ready",
    ...overrides,
  };
}

export function makeSessionRace(overrides: Partial<RaceSessionRace> = {}): RaceSessionRace {
  return {
    raceId: "ootr/race-a",
    categorySlug: "ootr",
    categoryName: "Ocarina of Time Randomizer",
    goal: "Defeat Ganon",
    status: "open",
    entrants: [makeEntrant()],
    results: [],
    ...overrides,
  };
}

export function makeSession(overrides: Partial<RaceSession> = {}): RaceSession {
  return {
    revision: 1,
    canonicalUrl: "https://racetime.gg/ootr/race-a",
    connection: { state: "connected", message: null },
    race: makeSessionRace(),
    ...overrides,
  };
}
