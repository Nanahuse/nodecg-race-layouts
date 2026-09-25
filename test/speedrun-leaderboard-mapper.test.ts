import { describe, expect, it } from "vitest";

import type { LeaderboardKey } from "../src/domain";
import { SpeedrunComPayloadError } from "../src/extension/integrations/speedruncom/errors";
import {
  formatRunTime,
  mapLeaderboard,
  mapPersonalBestEntry,
  mapWorldRecord,
  personalBestMatchesKey,
  personalBestToDomain,
  selectPersonalBest,
  toDomainLeaderboardEntry,
} from "../src/extension/integrations/speedruncom/leaderboard-mapper";
import {
  parseLeaderboard,
  parsePersonalBest,
} from "../src/extension/integrations/speedruncom/leaderboard-parser";
import { makePersonalBestEntry } from "./support/speedrun-fakes";

function makeKey(overrides: Partial<LeaderboardKey> = {}): LeaderboardKey {
  return {
    gameId: "game-1",
    categoryId: "category-1",
    levelId: null,
    variables: {},
    platformId: null,
    regionId: null,
    emulator: null,
    timingMethod: null,
    ...overrides,
  };
}

function parseRunRecord(overrides: Record<string, unknown> = {}) {
  const times = {
    primary: "PT1H",
    primary_t: 3600,
    realtime: "PT1H",
    realtime_t: 3600,
    realtime_noloads: "PT1H1S",
    realtime_noloads_t: 3601,
    ingame: "PT1H2S",
    ingame_t: 3602,
  };
  const run = {
    game: "game-1",
    category: "category-1",
    level: null,
    values: {},
    system: { platform: null, region: null, emulated: null },
    players: [{ rel: "user", id: "user-1", uri: "x" }],
    times,
    ...overrides,
  };
  return parseLeaderboard({
    game: "game-1",
    category: "category-1",
    level: null,
    platform: null,
    region: null,
    emulators: null,
    timing: "realtime",
    values: {},
    runs: [{ place: 1, run }],
    players: [{ rel: "user", id: "user-1", names: { international: "Runner One" } }],
  });
}

describe("formatRunTime", () => {
  it("formats sub-minute, minutes and hours", () => {
    expect(formatRunTime(59.123)).toBe("59.123");
    expect(formatRunTime(83.456)).toBe("1:23.456");
    expect(formatRunTime(3723.456)).toBe("1:02:03.456");
    expect(formatRunTime(3600)).toBe("1:00:00.000");
    expect(formatRunTime(0)).toBe("0.000");
  });

  it("truncates milliseconds", () => {
    expect(formatRunTime(1.9999)).toBe("1.999");
  });
});

describe("mapLeaderboard", () => {
  it("selects the time for each timing method", () => {
    const parsed = parseRunRecord();
    expect(mapLeaderboard(parsed, makeKey()).entries[0]?.timeSeconds).toBe(3600);
    expect(
      mapLeaderboard(parsed, makeKey({ timingMethod: "realtime" })).entries[0]?.timeSeconds,
    ).toBe(3600);
    expect(
      mapLeaderboard(parsed, makeKey({ timingMethod: "realtime_noloads" })).entries[0]?.timeSeconds,
    ).toBe(3601);
    expect(
      mapLeaderboard(parsed, makeKey({ timingMethod: "ingame" })).entries[0]?.timeSeconds,
    ).toBe(3602);
  });

  it("rejects a run without the selected timing", () => {
    const parsed = parseRunRecord({
      times: {
        primary: "PT1H",
        primary_t: 3600,
        realtime: "PT1H",
        realtime_t: 3600,
        realtime_noloads: null,
        realtime_noloads_t: 0,
        ingame: null,
        ingame_t: 0,
      },
    });
    expect(() => mapLeaderboard(parsed, makeKey({ timingMethod: "ingame" }))).toThrow(
      SpeedrunComPayloadError,
    );
  });

  it("resolves the user name from the embedded players list", () => {
    const mapped = mapLeaderboard(parseRunRecord(), makeKey());
    expect(mapped.entries[0]?.players).toEqual([{ userId: "user-1", name: "Runner One" }]);
  });

  it("keeps guest players", () => {
    const parsed = parseRunRecord({ players: [{ rel: "guest", name: "Guesty", uri: "x" }] });
    const mapped = mapLeaderboard(parsed, makeKey());
    expect(mapped.entries[0]?.players).toEqual([{ userId: null, name: "Guesty" }]);
  });
});

describe("mapWorldRecord", () => {
  it("returns null for an empty leaderboard", () => {
    expect(mapWorldRecord([])).toBeNull();
  });

  it("builds a single-holder WR", () => {
    const mapped = mapLeaderboard(parseRunRecord(), makeKey());
    expect(mapWorldRecord(mapped.entries)).toMatchObject({
      timeSeconds: 3600,
      holders: [{ userId: "user-1", name: "Runner One" }],
    });
  });

  it("includes all holders for a tie", () => {
    const entries = [
      {
        place: 1,
        players: [{ userId: "user-1", name: "One" }],
        timeSeconds: 3600,
        formattedTime: "1:00:00.000",
      },
      {
        place: 1,
        players: [{ userId: "user-2", name: "Two" }],
        timeSeconds: 3600,
        formattedTime: "1:00:00.000",
      },
    ];
    expect(mapWorldRecord(entries)?.holders).toEqual([
      { userId: "user-1", name: "One" },
      { userId: "user-2", name: "Two" },
    ]);
  });

  it("keeps guest holders and deduplicates", () => {
    const entries = [
      {
        place: 1,
        players: [{ userId: null, name: "Guesty" }],
        timeSeconds: 10,
        formattedTime: "10.000",
      },
      {
        place: 1,
        players: [{ userId: null, name: "Guesty" }],
        timeSeconds: 10,
        formattedTime: "10.000",
      },
    ];
    expect(mapWorldRecord(entries)?.holders).toEqual([{ userId: null, name: "Guesty" }]);
  });
});

describe("toDomainLeaderboardEntry", () => {
  it("converts a single-player entry", () => {
    const mapped = mapLeaderboard(parseRunRecord(), makeKey());
    const entry = mapped.entries[0];
    if (!entry) throw new Error("missing entry");
    expect(toDomainLeaderboardEntry(entry)).toEqual({
      rank: 1,
      speedrunComUserId: "user-1",
      speedrunComName: "Runner One",
      timeSeconds: 3600,
      formattedTime: "1:00:00.000",
    });
  });

  it("returns null for a multi-player entry", () => {
    expect(
      toDomainLeaderboardEntry({
        place: 1,
        players: [
          { userId: "a", name: "A" },
          { userId: "b", name: "B" },
        ],
        timeSeconds: 10,
        formattedTime: "10.000",
      }),
    ).toBeNull();
  });
});

describe("personal best mapping", () => {
  const key = makeKey();

  it("matches on leaderboard identity", () => {
    const entry = makePersonalBestEntry();
    expect(personalBestMatchesKey(entry, key)).toBe(true);
    expect(personalBestMatchesKey(entry, makeKey({ categoryId: "other" }))).toBe(false);
    expect(personalBestMatchesKey(entry, makeKey({ levelId: "level-1" }))).toBe(false);
    expect(personalBestMatchesKey(entry, makeKey({ variables: { v: "1" } }))).toBe(false);
    expect(personalBestMatchesKey(entry, makeKey({ platformId: "p" }))).toBe(false);
    expect(personalBestMatchesKey(entry, makeKey({ regionId: "r" }))).toBe(false);
    expect(personalBestMatchesKey(entry, makeKey({ emulator: false }))).toBe(false);
  });

  it("treats omitted platform, region, and emulator as unconstrained", () => {
    const entry = makePersonalBestEntry({
      platformId: "platform-gc",
      regionId: "region-us",
      emulator: false,
      variables: { optional: "value-b" },
    });
    expect(personalBestMatchesKey(entry, makeKey())).toBe(true);
  });

  it.each([
    { field: "platformId" as const, selection: "gc", actual: "gc", other: "pc" },
    { field: "regionId" as const, selection: "us", actual: "us", other: "jp" },
  ])(
    "constrains explicit $field and accepts exact match",
    ({ field, selection, actual, other }) => {
      expect(
        personalBestMatchesKey(
          makePersonalBestEntry({ [field]: actual }),
          makeKey({ [field]: selection }),
        ),
      ).toBe(true);
      expect(
        personalBestMatchesKey(
          makePersonalBestEntry({ [field]: other }),
          makeKey({ [field]: selection }),
        ),
      ).toBe(false);
    },
  );

  it("constrains emulator only when explicitly selected", () => {
    expect(
      personalBestMatchesKey(
        makePersonalBestEntry({ emulator: false }),
        makeKey({ emulator: false }),
      ),
    ).toBe(true);
    expect(
      personalBestMatchesKey(
        makePersonalBestEntry({ emulator: true }),
        makeKey({ emulator: false }),
      ),
    ).toBe(false);
  });

  it("matches only the selected variable subset", () => {
    const superset = makePersonalBestEntry({ variables: { a: "1", b: "2" } });
    expect(personalBestMatchesKey(superset, makeKey({ variables: { a: "1" } }))).toBe(true);
    expect(
      personalBestMatchesKey(
        makePersonalBestEntry({ variables: { a: "2", b: "2" } }),
        makeKey({ variables: { a: "1" } }),
      ),
    ).toBe(false);
  });

  it("selects the fastest matching PB regardless of response order and selected timing", () => {
    const candidates = [
      makePersonalBestEntry({
        times: {
          primarySeconds: 2400,
          realtimeSeconds: 2400,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
      makePersonalBestEntry({
        times: {
          primarySeconds: 2280,
          realtimeSeconds: 2280,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
      makePersonalBestEntry({
        times: {
          primarySeconds: 2520,
          realtimeSeconds: 2520,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
    ];
    expect(selectPersonalBest(candidates, makeKey())).toMatchObject({ timeSeconds: 2280 });
    const timingCandidates = [
      makePersonalBestEntry({
        times: {
          primarySeconds: 1800,
          realtimeSeconds: 2100,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
      makePersonalBestEntry({
        times: {
          primarySeconds: 1860,
          realtimeSeconds: 1980,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
    ];
    expect(
      selectPersonalBest(timingCandidates, makeKey({ timingMethod: "realtime" })),
    ).toMatchObject({
      timeSeconds: 1980,
    });
  });

  it("ignores candidates that do not have the selected timing", () => {
    const candidates = [
      makePersonalBestEntry({
        times: {
          primarySeconds: 1800,
          realtimeSeconds: null,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
      makePersonalBestEntry({
        times: {
          primarySeconds: 1860,
          realtimeSeconds: 1980,
          realtimeNoLoadsSeconds: null,
          ingameSeconds: null,
        },
      }),
    ];

    expect(selectPersonalBest(candidates, makeKey({ timingMethod: "realtime" }))).toMatchObject({
      timeSeconds: 1980,
    });
  });

  it("maps a PB to the domain with a safe rank", () => {
    const entry = makePersonalBestEntry({ place: 5 });
    expect(personalBestToDomain(entry, makeKey())).toEqual({
      timeSeconds: 3600,
      formattedTime: "1:00:00.000",
      rank: 5,
    });
  });

  it("sets rank to null when the leaderboard is filtered", () => {
    const entry = makePersonalBestEntry({ place: 5 });
    expect(personalBestToDomain(entry, makeKey({ timingMethod: "realtime" }))?.rank).toBeNull();
  });

  it("returns null when the selected timing is missing", () => {
    const entry = makePersonalBestEntry({
      times: {
        primarySeconds: 3600,
        realtimeSeconds: null,
        realtimeNoLoadsSeconds: null,
        ingameSeconds: null,
      },
    });
    expect(personalBestToDomain(entry, makeKey({ timingMethod: "ingame" }))).toBeNull();
  });

  it("maps a parsed personal best entry", () => {
    const parsed = parsePersonalBest({
      place: 3,
      run: {
        game: "game-1",
        category: "category-1",
        level: null,
        values: {},
        system: { platform: null, region: null, emulated: null },
        players: [{ rel: "user", id: "user-1", uri: "x" }],
        times: {
          primary: "PT1H",
          primary_t: 3600,
          realtime: "PT1H",
          realtime_t: 3600,
          realtime_noloads: null,
          realtime_noloads_t: 0,
          ingame: null,
          ingame_t: 0,
        },
      },
    });
    expect(mapPersonalBestEntry(parsed).place).toBe(3);
  });
});
