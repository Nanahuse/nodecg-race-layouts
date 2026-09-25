import { describe, expect, it } from "vitest";

import type { PlayerDirectory, PlayerMapping } from "../src/domain";
import {
  PlayerResolutionError,
  resolveEntrants,
  resolvePlayers,
  type PlayerIdFactory,
} from "../src/extension/application/player-resolution-service";
import { makeActivePlayer } from "./factories";
import { makeEntrant } from "./support/draft-fakes";

function directory(...players: PlayerMapping[]): PlayerDirectory {
  const map: PlayerDirectory = {};
  for (const player of players) {
    map[player.playerId] = player;
  }
  return map;
}

function sequentialIds(prefix = "new"): PlayerIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

describe("resolveEntrants: RaceTime user id", () => {
  it("matches by exact RaceTime user id", () => {
    const p1 = makeActivePlayer("p1");
    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-account-p1", twitchLogin: null })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.playerId).toBe("p1");
    expect(result.resolved[0]?.matchedBy).toBe("racetime_id");
    expect(result.summary.matchedCount).toBe(1);
    expect(result.summary.newPlayerCount).toBe(0);
    const resolvedPlayer = result.resolved[0]?.player;
    expect(resolvedPlayer).toBeDefined();
    if (p1.speedrunCom.state === "linked" && resolvedPlayer?.speedrunCom.state === "linked") {
      expect(resolvedPlayer.speedrunCom.value).not.toBe(p1.speedrunCom.value);
    }
    if (p1.twitch.state === "linked" && resolvedPlayer?.twitch.state === "linked") {
      expect(resolvedPlayer.twitch.value).not.toBe(p1.twitch.value);
    }
  });

  it("creates a new player when the RaceTime id does not match", () => {
    const p1 = makeActivePlayer("p1");
    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-unknown", twitchLogin: null })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
    expect(result.summary.newPlayerCount).toBe(1);
  });

  it("prefers a RaceTime id match over a Twitch candidate", () => {
    const p1 = makeActivePlayer("p1", {
      twitch: { state: "linked", value: { userId: null, login: "other" } },
    });
    const p2 = makeActivePlayer("p2", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-account-p1", twitchLogin: "runner_one" })],
      directory: directory(p1, p2),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.playerId).toBe("p1");
    expect(result.resolved[0]?.matchedBy).toBe("racetime_id");
  });
});

describe("resolveEntrants: Twitch", () => {
  it("auto-links on an explicit exact Twitch login", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.playerId).toBe("p1");
    expect(result.resolved[0]?.matchedBy).toBe("twitch");
    expect(result.summary.autoLinkedCount).toBe(1);
  });

  it("matches Twitch logins case-insensitively", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "RUNNER_ONE" })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("twitch");
  });

  it("matches via Speedrun.com twitchLogin", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "none" },
      speedrunCom: {
        state: "linked",
        value: { userId: "src-1", name: "SRC One", twitchLogin: "runner_one" },
      },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.playerId).toBe("p1");
    expect(result.resolved[0]?.matchedBy).toBe("twitch");
  });

  it("does not perform partial matching", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner" })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
  });

  it("does not use the display name for matching", () => {
    const p1 = makeActivePlayer("p1", {
      manualDisplayName: "Runner One",
      racetime: { state: "none" },
      twitch: { state: "none" },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: null })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
  });

  it("creates a new player when there are no Twitch candidates", () => {
    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "nobody" })],
      directory: directory(),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
  });

  it("does not auto-link when there are multiple candidates", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });
    const p2 = makeActivePlayer("p2", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" })],
      directory: directory(p1, p2),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
    expect(result.issues.map((issue) => issue.code)).toContain("ambiguous_twitch_match");
  });

  it("does not auto-link a candidate that is linked to a different RaceTime id", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: {
        state: "linked",
        value: { userId: "rt-other", name: "Other", twitchLogin: null },
      },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" })],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.matchedBy).toBe("new");
  });

  it("does not reuse a player id for two entrants", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolveEntrants({
      entrants: [
        makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" }),
        makeEntrant({ userId: "rt-2", twitchLogin: "runner_one" }),
      ],
      directory: directory(p1),
      playerIdFactory: sequentialIds(),
    });

    expect(result.resolved[0]?.playerId).toBe("p1");
    expect(result.resolved[1]?.matchedBy).toBe("new");
    expect(result.resolved[1]?.playerId).not.toBe("p1");
  });

  it("throws when the directory links the same RaceTime id twice", () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2", {
      racetime: {
        state: "linked",
        value: { userId: "rt-account-p1", name: "Same", twitchLogin: null },
      },
    });

    expect(() =>
      resolveEntrants({
        entrants: [makeEntrant({ userId: "rt-account-p1", twitchLogin: null })],
        directory: directory(p1, p2),
        playerIdFactory: sequentialIds(),
      }),
    ).toThrow(PlayerResolutionError);
  });
});

describe("resolvePlayers: new draft players", () => {
  it("creates a new player with a linked Twitch login when available", () => {
    const result = resolvePlayers({
      entrants: [makeEntrant({ userId: "rt-1", name: "One", twitchLogin: "runner_one" })],
      directory: directory(),
      playerIdFactory: sequentialIds(),
    });

    const player = result.players["new-1"];
    expect(player?.racetime).toEqual({
      state: "linked",
      value: { userId: "rt-1", name: "One", twitchLogin: "runner_one" },
      source: "racetime",
    });
    expect(player?.speedrunCom).toEqual({ state: "unresolved" });
    expect(player?.twitch).toEqual({
      state: "linked",
      value: { userId: null, login: "runner_one" },
      source: "racetime",
    });
  });

  it("creates a new player with unresolved Twitch when there is no Twitch login", () => {
    const result = resolvePlayers({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: null })],
      directory: directory(),
      playerIdFactory: sequentialIds(),
    });

    expect(result.players["new-1"]?.twitch).toEqual({ state: "unresolved" });
  });

  it("keeps Twitch unresolved when the match was ambiguous", () => {
    const p1 = makeActivePlayer("p1", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });
    const p2 = makeActivePlayer("p2", {
      racetime: { state: "none" },
      twitch: { state: "linked", value: { userId: null, login: "runner_one" } },
    });

    const result = resolvePlayers({
      entrants: [makeEntrant({ userId: "rt-1", twitchLogin: "runner_one" })],
      directory: directory(p1, p2),
      playerIdFactory: sequentialIds(),
    });

    expect(result.players["new-1"]?.twitch).toEqual({ state: "unresolved" });
  });

  it("preserves the entrant order", () => {
    const result = resolvePlayers({
      entrants: [
        makeEntrant({ userId: "rt-z", twitchLogin: null }),
        makeEntrant({ userId: "rt-a", twitchLogin: null }),
      ],
      directory: directory(),
      playerIdFactory: sequentialIds(),
    });

    expect(result.participants.map((participant) => participant.racetimeUserId)).toEqual([
      "rt-z",
      "rt-a",
    ]);
  });

  it("throws when the player id factory collides", () => {
    const factory: PlayerIdFactory = () => "same";
    expect(() =>
      resolvePlayers({
        entrants: [
          makeEntrant({ userId: "rt-1", twitchLogin: null }),
          makeEntrant({ userId: "rt-2", twitchLogin: null }),
        ],
        directory: directory(),
        playerIdFactory: factory,
      }),
    ).toThrow(PlayerResolutionError);
  });
});
