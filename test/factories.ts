import type {
  ActiveConfig,
  ActivePlayer,
  ActiveRaceParticipant,
  ActiveRaceScreenSlots,
  DraftConfig,
  DraftPlayer,
  PlayerId,
  PlayerMapping,
  RaceOverlayData,
  RaceReference,
  SpeedrunCategorySelection,
  SpeedrunSnapshot,
} from "../src/domain";
import { createDefaultDraftConfig } from "../src/replicants/defaults";

export const sampleRace: RaceReference = {
  canonicalUrl: "https://racetime.gg/zelda/abc123",
  raceId: "abc123",
  categorySlug: "any-percent",
  categoryName: "Any%",
  goal: "Defeat Ganon",
};

export const sampleCategorySelection: SpeedrunCategorySelection = {
  gameId: "j1l9qz1g",
  gameName: "The Legend of Zelda",
  categoryId: "7dgrrxk4",
  categoryName: "Any%",
  levelId: null,
  variables: {},
  platformId: null,
  regionId: null,
  emulator: null,
  timingMethod: "realtime",
};

export function makeActivePlayer(
  playerId: PlayerId,
  overrides: Partial<ActivePlayer> = {},
): ActivePlayer {
  return {
    playerId,
    manualDisplayName: null,
    racetime: {
      state: "linked",
      value: { userId: `rt-account-${playerId}`, name: `${playerId}-racetime`, twitchLogin: null },
    },
    speedrunCom: {
      state: "linked",
      value: { userId: `src-account-${playerId}`, name: `${playerId}-src`, twitchLogin: null },
    },
    twitch: {
      state: "linked",
      value: { userId: null, login: `${playerId}` },
    },
    ...overrides,
  };
}

export function makeDraftPlayer(
  playerId: PlayerId,
  overrides: Partial<DraftPlayer> = {},
): DraftPlayer {
  return {
    playerId,
    manualDisplayName: null,
    racetime: {
      state: "linked",
      value: { userId: `rt-account-${playerId}`, name: `${playerId}-racetime`, twitchLogin: null },
      source: "racetime",
    },
    speedrunCom: {
      state: "linked",
      value: { userId: `src-account-${playerId}`, name: `${playerId}-src`, twitchLogin: null },
      source: "speedruncom",
    },
    twitch: {
      state: "linked",
      value: { userId: null, login: `${playerId}` },
      source: "racetime",
    },
    ...overrides,
  };
}

export function makeActiveConfig(overrides: Partial<ActiveConfig> = {}): ActiveConfig {
  const players: Record<PlayerId, PlayerMapping> = {};
  const participants: ActiveRaceParticipant[] = [];
  const slots = { 1: "", 2: "", 3: "", 4: "" } as ActiveRaceScreenSlots;

  for (let index = 1; index <= 4; index += 1) {
    const playerId = `player-${index}`;
    const racetimeUserId = `rt-${index}`;
    players[playerId] = makeActivePlayer(playerId);
    participants.push({ racetimeUserId, playerId });
    if (index === 1) slots[1] = racetimeUserId;
    if (index === 2) slots[2] = racetimeUserId;
    if (index === 3) slots[3] = racetimeUserId;
    if (index === 4) slots[4] = racetimeUserId;
  }

  return {
    revision: 1,
    race: sampleRace,
    participants,
    players,
    raceScreenSlots: slots,
    commentatorPlayerIds: [],
    categorySelection: sampleCategorySelection,
    categoryPresentation: null,
    ...overrides,
  };
}

export function makeDraftConfig(overrides: Partial<DraftConfig> = {}): DraftConfig {
  return {
    ...createDefaultDraftConfig(),
    ...overrides,
  };
}

export function makeSpeedrunSnapshot(overrides: Partial<SpeedrunSnapshot> = {}): SpeedrunSnapshot {
  return {
    snapshotId: "snapshot-1",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    leaderboardKey: {
      gameId: sampleCategorySelection.gameId,
      categoryId: sampleCategorySelection.categoryId,
      levelId: null,
      variables: {},
      platformId: null,
      regionId: null,
      emulator: null,
      timingMethod: "realtime",
    },
    worldRecord: null,
    leaderboard: [
      {
        rank: 1,
        speedrunComUserId: "src-1",
        speedrunComName: "Runner One",
        timeSeconds: 3600,
        formattedTime: "1:00:00",
      },
    ],
    personalBests: {},
    ...overrides,
  };
}

export function makeRaceOverlayData(overrides: Partial<RaceOverlayData> = {}): RaceOverlayData {
  const makePlayer = (slot: 1 | 2 | 3 | 4): RaceOverlayData["players"][number] => ({
    slot,
    displayName: `Player ${slot}`,
    twitchLogin: `player-${slot}`,
    personalBest: { time: "1:00:00", rank: slot },
  });

  return {
    activeRevision: 1,
    event: { name: "Test Event", shortName: "TE" },
    category: { name: "Any%" },
    worldRecord: null,
    commentators: [],
    players: [makePlayer(1), makePlayer(2), makePlayer(3), makePlayer(4)],
    ...overrides,
  };
}
