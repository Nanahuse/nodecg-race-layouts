import { describe, expect, it } from "vitest";

import type { PlayerMapping } from "../src/domain";
import {
  buildHeaderMap,
  PLAYER_ROW_ISSUE_CODES,
  PLAYER_SHEET_COLUMNS,
  playerMappingToPlayerSheetRow,
  playerSheetRowToMapping,
  valuesToPlayerSheetRow,
} from "../src/extension/integrations/spreadsheet/players-row";
import { makeActivePlayer } from "./factories";
import { makePlayerSheetRow } from "./support/fakes";

const UPDATED_AT = "2026-09-21T05:30:00.000Z";

function convert(row: ReturnType<typeof makePlayerSheetRow>) {
  const result = playerSheetRowToMapping(row);
  if (!result.ok) {
    throw new Error(`expected conversion to succeed: ${JSON.stringify(result.issues)}`);
  }
  return result.player;
}

describe("playerSheetRowToMapping", () => {
  it("converts a linked RaceTime account", () => {
    const player = convert(
      makePlayerSheetRow({
        player_id: "p1",
        racetime_state: "linked",
        racetime_user_id: "rt-1",
        racetime_name: "RT One",
        racetime_twitch_login: "rt_twitch",
      }),
    );

    expect(player.racetime).toEqual({
      state: "linked",
      value: { userId: "rt-1", name: "RT One", twitchLogin: "rt_twitch" },
    });
  });

  it("converts a none RaceTime account", () => {
    const player = convert(makePlayerSheetRow({ racetime_state: "none" }));
    expect(player.racetime).toEqual({ state: "none" });
  });

  it("converts a linked Speedrun.com account and nulls a blank twitch login", () => {
    const player = convert(
      makePlayerSheetRow({
        speedruncom_state: "linked",
        speedruncom_user_id: "src-1",
        speedruncom_name: "SRC One",
        speedruncom_twitch_login: "",
      }),
    );

    expect(player.speedrunCom).toEqual({
      state: "linked",
      value: { userId: "src-1", name: "SRC One", twitchLogin: null },
    });
  });

  it("converts a none Speedrun.com account", () => {
    const player = convert(makePlayerSheetRow({ speedruncom_state: "none" }));
    expect(player.speedrunCom).toEqual({ state: "none" });
  });

  it("converts a linked Twitch account with a null user id", () => {
    const player = convert(
      makePlayerSheetRow({
        twitch_state: "linked",
        twitch_user_id: "",
        twitch_login: "LoginName",
      }),
    );

    expect(player.twitch).toEqual({
      state: "linked",
      value: { userId: null, login: "LoginName" },
    });
  });

  it("treats a whitespace-only manual display name as null", () => {
    const player = convert(makePlayerSheetRow({ manual_display_name: "   " }));
    expect(player.manualDisplayName).toBeNull();
  });

  it("keeps a manual display name", () => {
    const player = convert(makePlayerSheetRow({ manual_display_name: "Manual" }));
    expect(player.manualDisplayName).toBe("Manual");
  });

  it("rejects an unknown account state", () => {
    const result = playerSheetRowToMapping(makePlayerSheetRow({ racetime_state: "unresolved" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        PLAYER_ROW_ISSUE_CODES.racetimeStateInvalid,
      );
    }
  });

  it("rejects a linked RaceTime account missing user id or name", () => {
    const result = playerSheetRowToMapping(
      makePlayerSheetRow({ racetime_state: "linked", racetime_user_id: "", racetime_name: "" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain(PLAYER_ROW_ISSUE_CODES.racetimeUserIdMissing);
      expect(codes).toContain(PLAYER_ROW_ISSUE_CODES.racetimeNameMissing);
    }
  });

  it("rejects a linked Speedrun.com account missing user id or name", () => {
    const result = playerSheetRowToMapping(
      makePlayerSheetRow({
        speedruncom_state: "linked",
        speedruncom_user_id: "",
        speedruncom_name: "",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain(PLAYER_ROW_ISSUE_CODES.speedrunComUserIdMissing);
      expect(codes).toContain(PLAYER_ROW_ISSUE_CODES.speedrunComNameMissing);
    }
  });

  it("rejects a linked Twitch account missing login", () => {
    const result = playerSheetRowToMapping(
      makePlayerSheetRow({ twitch_state: "linked", twitch_login: "" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        PLAYER_ROW_ISSUE_CODES.twitchLoginMissing,
      );
    }
  });

  it("rejects a missing player_id", () => {
    const result = playerSheetRowToMapping(makePlayerSheetRow({ player_id: "  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        PLAYER_ROW_ISSUE_CODES.playerIdMissing,
      );
    }
  });
});

describe("playerMappingToPlayerSheetRow", () => {
  it("serializes linked accounts and nullable fields", () => {
    const player: PlayerMapping = {
      ...makeActivePlayer("p1"),
      manualDisplayName: "Manual",
      racetime: {
        state: "linked",
        value: { userId: "rt-1", name: "RT One", twitchLogin: "rt_twitch" },
      },
      speedrunCom: {
        state: "linked",
        value: { userId: "src-1", name: "SRC One", twitchLogin: null },
      },
      twitch: { state: "linked", value: { userId: null, login: "LoginName" } },
    };

    const row = playerMappingToPlayerSheetRow(player, UPDATED_AT);

    expect(row.player_id).toBe("p1");
    expect(row.manual_display_name).toBe("Manual");
    expect(row.racetime_state).toBe("linked");
    expect(row.racetime_user_id).toBe("rt-1");
    expect(row.racetime_name).toBe("RT One");
    expect(row.racetime_twitch_login).toBe("rt_twitch");
    expect(row.speedruncom_state).toBe("linked");
    expect(row.speedruncom_twitch_login).toBe("");
    expect(row.twitch_state).toBe("linked");
    expect(row.twitch_user_id).toBe("");
    expect(row.twitch_login).toBe("LoginName");
    expect(row.updated_at).toBe(UPDATED_AT);
  });

  it("serializes none accounts as blank cells", () => {
    const player: PlayerMapping = {
      playerId: "p2",
      manualDisplayName: null,
      racetime: { state: "none" },
      speedrunCom: { state: "none" },
      twitch: { state: "none" },
    };

    const row = playerMappingToPlayerSheetRow(player, UPDATED_AT);

    expect(row.racetime_state).toBe("none");
    expect(row.racetime_user_id).toBe("");
    expect(row.racetime_name).toBe("");
    expect(row.speedruncom_state).toBe("none");
    expect(row.twitch_state).toBe("none");
    expect(row.twitch_login).toBe("");
  });
});

describe("round trip", () => {
  it("preserves all fields including twitchLogin on RaceTime and Speedrun.com", () => {
    const player: PlayerMapping = {
      playerId: "p1",
      manualDisplayName: "Manual",
      racetime: {
        state: "linked",
        value: { userId: "rt-1", name: "RT One", twitchLogin: "rt_twitch" },
      },
      speedrunCom: {
        state: "linked",
        value: { userId: "src-1", name: "SRC One", twitchLogin: "src_twitch" },
      },
      twitch: { state: "linked", value: { userId: "tw-1", login: "LoginName" } },
    };

    const restored = convert(playerMappingToPlayerSheetRow(player, UPDATED_AT));
    expect(restored).toEqual(player);
  });

  it("preserves none accounts", () => {
    const player: PlayerMapping = {
      playerId: "p2",
      manualDisplayName: null,
      racetime: { state: "none" },
      speedrunCom: { state: "none" },
      twitch: { state: "none" },
    };

    const restored = convert(playerMappingToPlayerSheetRow(player, UPDATED_AT));
    expect(restored).toEqual(player);
  });
});

describe("buildHeaderMap", () => {
  it("maps columns by name regardless of order", () => {
    const reordered = [...PLAYER_SHEET_COLUMNS].reverse();
    const result = buildHeaderMap(reordered);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.map.player_id).toBe(reordered.indexOf("player_id"));
      expect(result.columnCount).toBe(reordered.length);
    }
  });

  it("reports missing columns", () => {
    const header = PLAYER_SHEET_COLUMNS.filter((column) => column !== "twitch_login");
    const result = buildHeaderMap(header);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("header_missing_column");
    }
  });

  it("reads values using the header positions", () => {
    const reordered = ["twitch_login", "player_id", ...PLAYER_SHEET_COLUMNS].filter(
      (column, index, all) => all.indexOf(column) === index,
    );
    const result = buildHeaderMap(reordered);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const values = reordered.map((column) =>
      column === "player_id" ? "p1" : column === "twitch_login" ? "LoginName" : "",
    );
    const row = valuesToPlayerSheetRow(values, result.map);
    expect(row.player_id).toBe("p1");
    expect(row.twitch_login).toBe("LoginName");
  });
});
