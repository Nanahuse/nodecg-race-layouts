import { describe, expect, it } from "vitest";

import { SpeedrunComPayloadError } from "../src/extension/integrations/speedruncom/errors";
import {
  parseLeaderboard,
  parsePersonalBest,
} from "../src/extension/integrations/speedruncom/leaderboard-parser";
import {
  leaderboardRecord,
  leaderboardRunRecord,
  personalBestRecord,
  runRecord,
} from "./support/speedrun-fakes";

describe("parseLeaderboard", () => {
  it("parses an empty leaderboard", () => {
    const parsed = parseLeaderboard(leaderboardRecord({ runs: [] }));
    expect(parsed.runs).toEqual([]);
    expect(parsed.gameId).toBe("game-1");
  });

  it("parses a single run", () => {
    const parsed = parseLeaderboard(leaderboardRecord());
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0]?.place).toBe(1);
    expect(parsed.runs[0]?.run.times.primarySeconds).toBe(3600);
    expect(parsed.runs[0]?.run.players).toEqual([{ userId: "user-1", name: null }]);
  });

  it("parses multiple runs and ties", () => {
    const parsed = parseLeaderboard(
      leaderboardRecord({
        runs: [leaderboardRunRecord(1), leaderboardRunRecord(2), leaderboardRunRecord(2)],
      }),
    );
    expect(parsed.runs.map((run) => run.place)).toEqual([1, 2, 2]);
  });

  it("keeps more than 20 runs for a 20th-place tie", () => {
    const runs = Array.from({ length: 20 }, (_value, index) => leaderboardRunRecord(index + 1));
    runs.push(leaderboardRunRecord(20), leaderboardRunRecord(20));
    const parsed = parseLeaderboard(leaderboardRecord({ runs }));
    expect(parsed.runs).toHaveLength(22);
  });

  it("parses a guest player", () => {
    const parsed = parseLeaderboard(
      leaderboardRecord({
        runs: [
          leaderboardRunRecord(
            1,
            runRecord({ players: [{ rel: "guest", name: "Guesty", uri: "x" }] }),
          ),
        ],
      }),
    );
    expect(parsed.runs[0]?.run.players).toEqual([{ userId: null, name: "Guesty" }]);
  });

  it("parses the embedded players list", () => {
    const parsed = parseLeaderboard(leaderboardRecord());
    expect(parsed.players).toEqual([{ userId: "user-1", name: "Runner One" }]);
  });

  it("parses the current Speedrun.com embedded players data envelope", () => {
    const parsed = parseLeaderboard(
      leaderboardRecord({
        players: {
          data: [
            { rel: "user", id: "user-1", names: { international: "Runner One" } },
            { rel: "guest", name: "Guest Runner" },
          ],
        },
      }),
    );

    expect(parsed.players).toEqual([
      { userId: "user-1", name: "Runner One" },
      { userId: null, name: "Guest Runner" },
    ]);
  });

  it("rejects a malformed place", () => {
    expect(() =>
      parseLeaderboard(leaderboardRecord({ runs: [{ place: "first", run: runRecord() }] })),
    ).toThrow(SpeedrunComPayloadError);
  });

  it("rejects a malformed time", () => {
    const times = {
      ...(runRecord().times as Record<string, unknown>),
      primary: null,
      primary_t: 0,
    };
    expect(() =>
      parseLeaderboard(
        leaderboardRecord({ runs: [leaderboardRunRecord(1, runRecord({ times }))] }),
      ),
    ).toThrow(SpeedrunComPayloadError);
  });

  it("rejects a malformed player", () => {
    expect(() =>
      parseLeaderboard(
        leaderboardRecord({
          runs: [leaderboardRunRecord(1, runRecord({ players: [{ rel: "team" }] }))],
        }),
      ),
    ).toThrow(SpeedrunComPayloadError);
  });

  it("rejects malformed filter metadata", () => {
    expect(() => parseLeaderboard(leaderboardRecord({ emulators: "yes" }))).toThrow(
      SpeedrunComPayloadError,
    );
  });
});

describe("parsePersonalBest", () => {
  it("parses a personal best entry", () => {
    const parsed = parsePersonalBest(personalBestRecord(5));
    expect(parsed.place).toBe(5);
    expect(parsed.run.categoryId).toBe("category-1");
  });

  it("rejects a missing run", () => {
    expect(() => parsePersonalBest({ place: 5 })).toThrow(SpeedrunComPayloadError);
  });
});
