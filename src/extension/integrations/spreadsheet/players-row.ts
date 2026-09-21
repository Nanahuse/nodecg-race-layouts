import type {
  PlayerMapping,
  RaceTimeAccountLink,
  SpeedrunComAccountLink,
  TwitchAccountLink,
} from "../../../domain";
import type { PlayersSheetIssue } from "./errors";

/**
 * Spreadsheet representation of a Player Mapping.
 *
 * The sheet stores only confirmed account states (`linked` / `none`); the draft
 * `unresolved` state never reaches the spreadsheet. `updated_at` is audit
 * metadata owned by the sheet and is intentionally not part of the domain.
 */
export const PLAYER_SHEET_COLUMNS = [
  "player_id",
  "manual_display_name",
  "racetime_state",
  "racetime_user_id",
  "racetime_name",
  "racetime_twitch_login",
  "speedruncom_state",
  "speedruncom_user_id",
  "speedruncom_name",
  "speedruncom_twitch_login",
  "twitch_state",
  "twitch_user_id",
  "twitch_login",
  "updated_at",
] as const;

export type PlayerSheetColumn = (typeof PLAYER_SHEET_COLUMNS)[number];

export type PlayerSheetRow = { [K in PlayerSheetColumn]: string };

export const PLAYER_ROW_ISSUE_CODES = {
  playerIdMissing: "player_id_missing",
  racetimeStateInvalid: "racetime_state_invalid",
  racetimeUserIdMissing: "racetime_user_id_missing",
  racetimeNameMissing: "racetime_name_missing",
  speedrunComStateInvalid: "speedruncom_state_invalid",
  speedrunComUserIdMissing: "speedruncom_user_id_missing",
  speedrunComNameMissing: "speedruncom_name_missing",
  twitchStateInvalid: "twitch_state_invalid",
  twitchLoginMissing: "twitch_login_missing",
} as const;

export const PLAYER_SHEET_HEADER_ISSUE_CODES = {
  headerMissingColumn: "header_missing_column",
} as const;

export type RowConversionIssue = {
  code: string;
  message: string;
};

export type RowConversionResult =
  { ok: true; player: PlayerMapping } | { ok: false; issues: RowConversionIssue[] };

export type HeaderMap = Record<PlayerSheetColumn, number>;

export type BuildHeaderMapResult =
  { ok: true; map: HeaderMap; columnCount: number } | { ok: false; issues: PlayersSheetIssue[] };

export function emptyPlayerSheetRow(): PlayerSheetRow {
  return Object.fromEntries(PLAYER_SHEET_COLUMNS.map((column) => [column, ""])) as PlayerSheetRow;
}

function normalizeCell(value: string | undefined): string {
  return (value ?? "").trim();
}

function nullableCell(value: string | undefined): string | null {
  const normalized = normalizeCell(value);
  return normalized === "" ? null : normalized;
}

export function playerSheetRowToValues(row: PlayerSheetRow): string[] {
  return PLAYER_SHEET_COLUMNS.map((column) => row[column]);
}

export function playerMappingToPlayerSheetRow(
  player: PlayerMapping,
  updatedAt: string,
): PlayerSheetRow {
  const row = emptyPlayerSheetRow();
  row.player_id = player.playerId;
  row.manual_display_name = player.manualDisplayName ?? "";

  if (player.racetime.state === "linked") {
    row.racetime_state = "linked";
    row.racetime_user_id = player.racetime.value.userId;
    row.racetime_name = player.racetime.value.name;
    row.racetime_twitch_login = player.racetime.value.twitchLogin ?? "";
  } else {
    row.racetime_state = "none";
  }

  if (player.speedrunCom.state === "linked") {
    row.speedruncom_state = "linked";
    row.speedruncom_user_id = player.speedrunCom.value.userId;
    row.speedruncom_name = player.speedrunCom.value.name;
    row.speedruncom_twitch_login = player.speedrunCom.value.twitchLogin ?? "";
  } else {
    row.speedruncom_state = "none";
  }

  if (player.twitch.state === "linked") {
    row.twitch_state = "linked";
    row.twitch_user_id = player.twitch.value.userId ?? "";
    row.twitch_login = player.twitch.value.login;
  } else {
    row.twitch_state = "none";
  }

  row.updated_at = updatedAt;
  return row;
}

export function playerSheetRowToMapping(row: PlayerSheetRow): RowConversionResult {
  const issues: RowConversionIssue[] = [];

  const playerId = normalizeCell(row.player_id);
  if (playerId === "") {
    issues.push({
      code: PLAYER_ROW_ISSUE_CODES.playerIdMissing,
      message: "player_id is required.",
    });
  }

  const racetimeState = normalizeCell(row.racetime_state);
  let racetime: RaceTimeAccountLink;
  if (racetimeState === "linked") {
    const userId = normalizeCell(row.racetime_user_id);
    const name = normalizeCell(row.racetime_name);
    if (userId === "") {
      issues.push({
        code: PLAYER_ROW_ISSUE_CODES.racetimeUserIdMissing,
        message: "racetime_user_id is required when racetime_state is linked.",
      });
    }
    if (name === "") {
      issues.push({
        code: PLAYER_ROW_ISSUE_CODES.racetimeNameMissing,
        message: "racetime_name is required when racetime_state is linked.",
      });
    }
    racetime = {
      state: "linked",
      value: { userId, name, twitchLogin: nullableCell(row.racetime_twitch_login) },
    };
  } else if (racetimeState === "none") {
    racetime = { state: "none" };
  } else {
    issues.push({
      code: PLAYER_ROW_ISSUE_CODES.racetimeStateInvalid,
      message: `Unknown racetime_state "${racetimeState}".`,
    });
    racetime = { state: "none" };
  }

  const speedrunComState = normalizeCell(row.speedruncom_state);
  let speedrunCom: SpeedrunComAccountLink;
  if (speedrunComState === "linked") {
    const userId = normalizeCell(row.speedruncom_user_id);
    const name = normalizeCell(row.speedruncom_name);
    if (userId === "") {
      issues.push({
        code: PLAYER_ROW_ISSUE_CODES.speedrunComUserIdMissing,
        message: "speedruncom_user_id is required when speedruncom_state is linked.",
      });
    }
    if (name === "") {
      issues.push({
        code: PLAYER_ROW_ISSUE_CODES.speedrunComNameMissing,
        message: "speedruncom_name is required when speedruncom_state is linked.",
      });
    }
    speedrunCom = {
      state: "linked",
      value: { userId, name, twitchLogin: nullableCell(row.speedruncom_twitch_login) },
    };
  } else if (speedrunComState === "none") {
    speedrunCom = { state: "none" };
  } else {
    issues.push({
      code: PLAYER_ROW_ISSUE_CODES.speedrunComStateInvalid,
      message: `Unknown speedruncom_state "${speedrunComState}".`,
    });
    speedrunCom = { state: "none" };
  }

  const twitchState = normalizeCell(row.twitch_state);
  let twitch: TwitchAccountLink;
  if (twitchState === "linked") {
    const login = normalizeCell(row.twitch_login);
    if (login === "") {
      issues.push({
        code: PLAYER_ROW_ISSUE_CODES.twitchLoginMissing,
        message: "twitch_login is required when twitch_state is linked.",
      });
    }
    twitch = {
      state: "linked",
      value: { userId: nullableCell(row.twitch_user_id), login },
    };
  } else if (twitchState === "none") {
    twitch = { state: "none" };
  } else {
    issues.push({
      code: PLAYER_ROW_ISSUE_CODES.twitchStateInvalid,
      message: `Unknown twitch_state "${twitchState}".`,
    });
    twitch = { state: "none" };
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    player: {
      playerId,
      manualDisplayName: nullableCell(row.manual_display_name),
      racetime,
      speedrunCom,
      twitch,
    },
  };
}

export function buildHeaderMap(header: readonly string[]): BuildHeaderMapResult {
  const normalizedHeader = header.map((value) => value.trim());
  const map = {} as HeaderMap;
  const issues: PlayersSheetIssue[] = [];

  for (const column of PLAYER_SHEET_COLUMNS) {
    const index = normalizedHeader.indexOf(column);
    if (index === -1) {
      issues.push({
        code: PLAYER_SHEET_HEADER_ISSUE_CODES.headerMissingColumn,
        message: `Missing column "${column}" in the Players sheet header.`,
        row: 1,
        playerId: null,
      });
    } else {
      map[column] = index;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, map, columnCount: normalizedHeader.length };
}

export function valuesToPlayerSheetRow(
  values: readonly string[],
  headerMap: HeaderMap,
): PlayerSheetRow {
  const row = emptyPlayerSheetRow();
  for (const column of PLAYER_SHEET_COLUMNS) {
    const index = headerMap[column];
    row[column] = normalizeCell(values[index]);
  }
  return row;
}
