import { describe, expect, it } from "vitest";
import type { DraftConfig, PlayerMapping, PostApplyPersistenceState } from "../src/domain";
import {
  getPlayerUsage,
  searchPlayers,
  filterPlayers,
  sortPlayers,
} from "../ui/dashboard/player-mapping/model";

const makePlayer = (
  id: string,
  name: string,
  links: Partial<Pick<PlayerMapping, "racetime" | "speedrunCom" | "twitch">> = {},
): PlayerMapping => ({
  playerId: id,
  manualDisplayName: name,
  racetime: links.racetime ?? { state: "none" },
  speedrunCom: links.speedrunCom ?? { state: "none" },
  twitch: links.twitch ?? { state: "none" },
});
const draft = (overrides: Partial<DraftConfig> = {}) =>
  ({ participants: [], commentatorPlayerIds: [], ...overrides }) as DraftConfig;
const persistence = (players: PlayerMapping[] = []) =>
  ({ queue: players.length ? [{ players }] : [] }) as unknown as PostApplyPersistenceState;

describe("player mapping dashboard model", () => {
  const players = [
    makePlayer("p2", "Alice", {
      racetime: {
        state: "linked",
        value: { userId: "rt-alice", name: "Alice RT", twitchLogin: "alice" },
      },
    }),
    makePlayer("p1", "Alice"),
    makePlayer("p3", "Bob", {
      speedrunCom: {
        state: "linked",
        value: { userId: "src-bob", name: "Bob SRC", twitchLogin: null },
      },
    }),
  ];

  it("searches all identity fields case-insensitively and accepts empty query", () => {
    expect(searchPlayers(players, "rt-alice")).toHaveLength(1);
    expect(searchPlayers(players, "SRC-Bob")).toHaveLength(1);
    expect(searchPlayers(players, "p1")).toHaveLength(1);
    expect(searchPlayers(players, "")).toHaveLength(3);
  });

  it("filters missing identities and sorts by display name then player id", () => {
    expect(filterPlayers(players, "missing-racetime").map((player) => player.playerId)).toEqual([
      "p1",
      "p3",
    ]);
    expect(filterPlayers(players, "missing-speedruncom")).toHaveLength(2);
    expect(filterPlayers(players, "missing-twitch")).toHaveLength(3);
    expect(sortPlayers(players).map((player) => player.playerId)).toEqual(["p1", "p2", "p3"]);
  });

  it("tracks draft, active, and persistence usage independently", () => {
    const usage = getPlayerUsage(
      "p1",
      draft({ participants: [{ playerId: "p1", racetimeUserId: "rt" }] }),
      { participants: [], commentatorPlayerIds: ["p1"] } as never,
      persistence([makePlayer("p1", "Alice")]),
    );
    expect(usage).toEqual({ inDraft: true, onAir: true, pendingPersistence: true });
    expect(
      getPlayerUsage("p2", draft({ players: { p2: {} } } as never), null, persistence()),
    ).toEqual({ inDraft: false, onAir: false, pendingPersistence: false });
  });
});
