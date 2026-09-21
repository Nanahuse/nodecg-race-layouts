import { describe, expect, it } from "vitest";

import type { LeaderboardKey } from "../src/domain";
import {
  canUsePersonalBestPlaceAsRank,
  leaderboardMatchesKey,
  leaderboardPath,
  leaderboardQuery,
} from "../src/extension/integrations/speedruncom/leaderboard";
import { makeLeaderboard } from "./support/speedrun-fakes";

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

describe("leaderboardPath", () => {
  it("builds a full-game path", () => {
    expect(leaderboardPath(makeKey())).toBe("/leaderboards/game-1/category/category-1");
  });

  it("builds an individual-level path", () => {
    expect(leaderboardPath(makeKey({ levelId: "level-1" }))).toBe(
      "/leaderboards/game-1/level/level-1/category-1",
    );
  });

  it("encodes path segments", () => {
    expect(leaderboardPath(makeKey({ gameId: "a b" }))).toBe(
      "/leaderboards/a%20b/category/category-1",
    );
  });
});

describe("leaderboardQuery", () => {
  it("always includes top and embed=players", () => {
    const query = leaderboardQuery(makeKey(), 20);
    expect(query.top).toBe(20);
    expect(query.embed).toBe("players");
  });

  it("omits null filters", () => {
    const query = leaderboardQuery(makeKey(), 20);
    expect(query).not.toHaveProperty("platform");
    expect(query).not.toHaveProperty("region");
    expect(query).not.toHaveProperty("emulators");
    expect(query).not.toHaveProperty("timing");
  });

  it("maps platform, region, emulator and timing", () => {
    const query = leaderboardQuery(
      makeKey({
        platformId: "platform-1",
        regionId: "region-1",
        emulator: false,
        timingMethod: "ingame",
      }),
      20,
    );
    expect(query.platform).toBe("platform-1");
    expect(query.region).toBe("region-1");
    expect(query.emulators).toBe(false);
    expect(query.timing).toBe("ingame");
  });

  it("maps emulator true and false", () => {
    expect(leaderboardQuery(makeKey({ emulator: true }), 20).emulators).toBe(true);
    expect(leaderboardQuery(makeKey({ emulator: false }), 20).emulators).toBe(false);
  });

  it("maps variables to var-<id>", () => {
    const query = leaderboardQuery(
      makeKey({ variables: { "var-1": "value-1", "var-2": "value-2" } }),
      20,
    );
    expect(query["var-var-1"]).toBe("value-1");
    expect(query["var-var-2"]).toBe("value-2");
  });
});

describe("canUsePersonalBestPlaceAsRank", () => {
  it("is true only without extra filters", () => {
    expect(canUsePersonalBestPlaceAsRank(makeKey())).toBe(true);
    expect(canUsePersonalBestPlaceAsRank(makeKey({ platformId: "p" }))).toBe(false);
    expect(canUsePersonalBestPlaceAsRank(makeKey({ regionId: "r" }))).toBe(false);
    expect(canUsePersonalBestPlaceAsRank(makeKey({ emulator: false }))).toBe(false);
    expect(canUsePersonalBestPlaceAsRank(makeKey({ timingMethod: "realtime" }))).toBe(false);
  });
});

describe("leaderboardMatchesKey", () => {
  it("accepts a matching leaderboard", () => {
    expect(leaderboardMatchesKey(makeLeaderboard(), makeKey())).toBe(true);
  });

  it("rejects a mismatched game or timing", () => {
    expect(leaderboardMatchesKey(makeLeaderboard({ gameId: "other" }), makeKey())).toBe(false);
    expect(
      leaderboardMatchesKey(
        makeLeaderboard({ timingMethod: "ingame" }),
        makeKey({ timingMethod: "realtime" }),
      ),
    ).toBe(false);
  });
});
