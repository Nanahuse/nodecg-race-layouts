import { describe, expect, it } from "vitest";

import {
  PLAYER_DIRECTORY_ISSUE_CODES,
  validatePlayerDirectory,
  type PlayerMapping,
} from "../src/domain";
import { makeActivePlayer } from "./factories";

function codes(players: readonly PlayerMapping[]): string[] {
  return validatePlayerDirectory(players).map((issue) => issue.code);
}

describe("validatePlayerDirectory", () => {
  it("accepts a valid directory", () => {
    expect(validatePlayerDirectory([makeActivePlayer("p1"), makeActivePlayer("p2")])).toEqual([]);
  });

  it("does not treat null Twitch user ids as duplicates", () => {
    expect(codes([makeActivePlayer("p1"), makeActivePlayer("p2")])).not.toContain(
      PLAYER_DIRECTORY_ISSUE_CODES.twitchUserIdDuplicate,
    );
  });

  it("rejects duplicate player ids", () => {
    const first = makeActivePlayer("p1");
    const second = makeActivePlayer("p1", {
      racetime: {
        state: "linked",
        value: { userId: "rt-other", name: "Other", twitchLogin: null },
      },
    });
    expect(codes([first, second])).toContain(PLAYER_DIRECTORY_ISSUE_CODES.playerIdDuplicate);
  });

  it("rejects duplicate RaceTime user ids", () => {
    const first = makeActivePlayer("p1");
    const second = makeActivePlayer("p2", {
      racetime: {
        state: "linked",
        value: { userId: "rt-account-p1", name: "Same", twitchLogin: null },
      },
    });
    expect(codes([first, second])).toContain(PLAYER_DIRECTORY_ISSUE_CODES.racetimeUserIdDuplicate);
  });

  it("rejects duplicate Speedrun.com user ids", () => {
    const first = makeActivePlayer("p1");
    const second = makeActivePlayer("p2", {
      speedrunCom: {
        state: "linked",
        value: { userId: "src-account-p1", name: "Same", twitchLogin: null },
      },
    });
    expect(codes([first, second])).toContain(
      PLAYER_DIRECTORY_ISSUE_CODES.speedrunComUserIdDuplicate,
    );
  });

  it("rejects duplicate Twitch user ids", () => {
    const first = makeActivePlayer("p1", {
      twitch: { state: "linked", value: { userId: "tw-shared", login: "one" } },
    });
    const second = makeActivePlayer("p2", {
      twitch: { state: "linked", value: { userId: "tw-shared", login: "two" } },
    });
    expect(codes([first, second])).toContain(PLAYER_DIRECTORY_ISSUE_CODES.twitchUserIdDuplicate);
  });

  it("rejects duplicate Twitch logins case-insensitively", () => {
    const first = makeActivePlayer("p1", {
      twitch: { state: "linked", value: { userId: null, login: "Nanahuse" } },
    });
    const second = makeActivePlayer("p2", {
      twitch: { state: "linked", value: { userId: null, login: "nanahuse" } },
    });
    expect(codes([first, second])).toContain(PLAYER_DIRECTORY_ISSUE_CODES.twitchLoginDuplicate);
  });

  it("rejects a player whose display name cannot be resolved", () => {
    const player: PlayerMapping = {
      playerId: "p1",
      manualDisplayName: null,
      racetime: { state: "none" },
      speedrunCom: { state: "none" },
      twitch: { state: "none" },
    };
    expect(codes([player])).toContain(PLAYER_DIRECTORY_ISSUE_CODES.displayNameUnresolved);
  });
});
