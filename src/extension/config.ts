export const DEFAULT_PLAYERS_SHEET = "Players";

export type SpreadsheetConfig = {
  spreadsheetId: string;
  playersSheet: string;
};

export type RaceLayoutsConfig = {
  spreadsheet: SpreadsheetConfig;
};

export type BundleConfigParseResult =
  { ok: true; config: RaceLayoutsConfig } | { ok: false; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse and validate the bundle config. Credentials are never part of the
 * config; only the spreadsheet id and sheet name are read here.
 */
export function parseBundleConfig(raw: unknown): BundleConfigParseResult {
  if (!isRecord(raw)) {
    return { ok: false, issues: ["Bundle config is missing or is not an object."] };
  }

  const spreadsheet = raw.spreadsheet;
  if (!isRecord(spreadsheet)) {
    return { ok: false, issues: ['Bundle config must contain a "spreadsheet" object.'] };
  }

  const issues: string[] = [];

  const spreadsheetIdRaw = spreadsheet.spreadsheetId;
  const spreadsheetId = typeof spreadsheetIdRaw === "string" ? spreadsheetIdRaw.trim() : "";
  if (spreadsheetId === "") {
    issues.push('"spreadsheet.spreadsheetId" is required and must be a non-empty string.');
  }

  let playersSheet = DEFAULT_PLAYERS_SHEET;
  const playersSheetRaw = spreadsheet.playersSheet;
  if (playersSheetRaw !== undefined) {
    if (typeof playersSheetRaw !== "string" || playersSheetRaw.trim() === "") {
      issues.push('"spreadsheet.playersSheet" must be a non-empty string when provided.');
    } else {
      playersSheet = playersSheetRaw.trim();
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    config: {
      spreadsheet: {
        spreadsheetId,
        playersSheet,
      },
    },
  };
}
