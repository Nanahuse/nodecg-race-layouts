import type {
  DraftConfig,
  DraftPlayer,
  DraftRaceParticipant,
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

export function makeDraftPlayer(
  playerId: string,
  overrides: Partial<DraftPlayer> = {},
): DraftPlayer {
  return {
    playerId,
    manualDisplayName: null,
    racetime: {
      state: "linked",
      value: { userId: `rt-${playerId}`, name: "One", twitchLogin: null },
      source: "racetime",
    },
    speedrunCom: { state: "unresolved" },
    twitch: { state: "unresolved" },
    ...overrides,
  };
}

export function makeParticipantDraft(options: {
  players: Record<string, DraftPlayer>;
  participants?: DraftRaceParticipant[];
  revision?: number;
}): DraftConfig {
  const participants =
    options.participants ??
    Object.keys(options.players).map((playerId) => ({
      racetimeUserId: `rt-${playerId}`,
      playerId,
    }));
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
    participants,
    players: options.players,
    categorySelection: { selection: makeSelection(), source: "manual", savedMappingState: "none" },
  };
}
