import type {
  DraftConfig,
  DraftPerson,
  DraftRaceParticipant,
  PlayerSnapshot,
  RaceSession,
  RaceSessionRace,
  RaceTimeEntrant,
} from "../../src/domain";
import { createDefaultDraftConfig } from "../../src/replicants/defaults";
import { makeSelection } from "./category-fakes";
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
export function makeSnapshot(playerId: string): PlayerSnapshot {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    racetime: { userId: `rt-${playerId}`, name: `Runner ${playerId}` },
    speedrunCom: { userId: `src-${playerId}`, name: `SRC ${playerId}` },
    twitch: null,
    youtube: null,
  };
}
export function makeDraftPerson(
  ref: string,
  racetimeUserId = `rt-${ref}`,
  resolution: DraftPerson["resolution"] = "matched",
): DraftPerson {
  return {
    ref,
    playerId: resolution === "matched" ? ref : null,
    identity: { racetimeUserId, twitchLogin: null, speedrunComUserId: null },
    player: resolution === "matched" ? makeSnapshot(ref) : null,
    resolution,
  };
}
export function makeParticipantDraft(options: {
  persons: Record<string, DraftPerson>;
  participants?: DraftRaceParticipant[];
  revision?: number;
}): DraftConfig {
  return {
    ...createDefaultDraftConfig(),
    revision: options.revision ?? 10,
    race: {
      canonicalUrl: "https://racetime.gg/ootr/race-a",
      raceId: "ootr/race-a",
      categorySlug: "ootr",
      categoryName: "OOTR",
      goal: "Defeat Ganon",
    },
    participants:
      options.participants ??
      Object.values(options.persons).map((person) => ({
        racetimeUserId: person.identity.racetimeUserId ?? "",
        personRef: person.ref,
      })),
    persons: options.persons,
    categorySelection: { selection: makeSelection(), source: "manual", savedMappingState: "none" },
  };
}
