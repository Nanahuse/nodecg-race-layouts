import { describe, expect, it } from "vitest";

import type {
  LeaderboardPageData,
  ParticipantListData,
  RaceOverlayData,
  RaceResultPageData,
  SpeedrunCategorySelection,
} from "../src/domain";
import { REPLICANT_DEFINITIONS } from "../src/replicants/defaults";
import { REPLICANT_NAMES, type ReplicantName } from "../src/replicants/names";
import { isValid, loadSchema } from "./helpers";
import {
  makeActiveConfig,
  makeActivePlayer,
  makeDraftConfig,
  makeRaceOverlayData,
  makeSpeedrunSnapshot,
} from "./factories";
import {
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";

const defaultsByName = Object.fromEntries(
  REPLICANT_DEFINITIONS.map((definition) => [definition.name, definition.defaultValue]),
) as Record<ReplicantName, unknown>;

const validParticipantListData: ParticipantListData = {
  activeRevision: 1,
  event: { name: "Test Event", shortName: null },
  category: { name: "Any%" },
  commentators: [],
  participants: [
    {
      racetimeUserId: "rt-1",
      displayName: "Player One",
      speedrunComName: "SRC One",
      personalBest: { time: "1:00:00", rank: 1 },
    },
  ],
};

const validLeaderboardPageData: LeaderboardPageData = {
  activeRevision: 1,
  event: { name: "Test Event", shortName: null },
  category: { title: "Any%", subtitle: null },
  presentation: {
    ruleHeading: "Rules",
    ruleLines: ["Rule one"],
    leaderboardHeading: "Top 20",
    sourceLabel: "Speedrun.com",
  },
  leaderboard: [{ rank: 1, name: "Player One", secondaryName: null, time: "1:00:00" }],
};

const validRaceResultPageData: RaceResultPageData = {
  activeRevision: 1,
  event: { name: "Test Event", shortName: null },
  category: { name: "Any%" },
  results: [
    {
      racetimeUserId: "rt-1",
      place: 1,
      placeLabel: "1st",
      name: "Player One",
      secondaryName: null,
      time: "1:00:00",
      status: "finished",
    },
  ],
};

const validFixtures: Record<ReplicantName, unknown> = {
  "draft-race-session": createDefaultRaceSession(),
  "active-race-session": createDefaultRaceSession(),
  "player-directory": { "player-1": makeActivePlayer("player-1") },
  "draft-config": makeDraftConfig(),
  "active-config": makeActiveConfig(),
  "draft-speedrun-snapshot": createDefaultDraftSpeedrunSnapshot(),
  "active-speedrun-snapshot": { activeRevision: 1, snapshot: makeSpeedrunSnapshot() },
  "race-overlay-data": makeRaceOverlayData(),
  "participant-list-data": validParticipantListData,
  "leaderboard-page-data": validLeaderboardPageData,
  "race-result-page-data": validRaceResultPageData,
  "integration-status": createDefaultIntegrationStatus(),
};

const invalidFixtures: Record<ReplicantName, unknown> = {
  "draft-race-session": {},
  "active-race-session": {},
  "player-directory": [],
  "draft-config": {},
  "active-config": {},
  "draft-speedrun-snapshot": {},
  "active-speedrun-snapshot": {},
  "race-overlay-data": {},
  "participant-list-data": {},
  "leaderboard-page-data": {},
  "race-result-page-data": {},
  "integration-status": {},
};

describe.each(REPLICANT_NAMES)("replicant schema: %s", (name) => {
  it("has a schema file", () => {
    expect(loadSchema(name)).toBeTruthy();
  });

  it("accepts the declared default value", () => {
    expect(isValid(name, defaultsByName[name])).toBe(true);
  });

  it("accepts a valid fixture", () => {
    expect(isValid(name, validFixtures[name])).toBe(true);
  });

  it("rejects an invalid fixture", () => {
    expect(isValid(name, invalidFixtures[name])).toBe(false);
  });
});

describe("active-config schema constraints", () => {
  it("accepts null, representing an empty broadcast", () => {
    expect(isValid("active-config", null)).toBe(true);
  });

  it("rejects an active config with an empty race screen slot", () => {
    const config = makeActiveConfig();
    (config.raceScreenSlots as unknown as { 4: string | null })[4] = null;
    expect(isValid("active-config", config)).toBe(false);
  });

  it("rejects more than three commentators", () => {
    const config = makeActiveConfig({
      commentatorPlayerIds: ["player-1", "player-2", "player-3", "player-4"],
    });
    expect(isValid("active-config", config)).toBe(false);
  });

  it("rejects duplicate commentators", () => {
    const config = makeActiveConfig({ commentatorPlayerIds: ["player-1", "player-1"] });
    expect(isValid("active-config", config)).toBe(false);
  });

  it("rejects a null category selection", () => {
    const config = makeActiveConfig({
      categorySelection: null as unknown as SpeedrunCategorySelection,
    });
    expect(isValid("active-config", config)).toBe(false);
  });
});

describe("race-overlay-data schema", () => {
  it("rejects a player tuple that is not exactly four entries", () => {
    const config = makeRaceOverlayData();
    const players = config.players.slice(0, 3) as unknown as RaceOverlayData["players"];
    expect(
      isValid("race-overlay-data", {
        ...config,
        players,
      }),
    ).toBe(false);
  });
});
