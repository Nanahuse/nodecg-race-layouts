export const DEFAULT_PLAYERS_SHEET = "Players";
export const DEFAULT_CATEGORY_MAPPINGS_SHEET = "CategoryMappings";
export const DEFAULT_CATEGORY_PRESENTATION_SHEET = "CategoryPresentation";

export type SpreadsheetConfig = {
  spreadsheetId: string;
  playersSheet: string;
  categoryMappingsSheet: string;
  categoryPresentationSheet: string;
};

export type RaceLayoutsConfig = {
  spreadsheet: SpreadsheetConfig;
};

export type BundleConfigParseResult =
  { ok: true; config: RaceLayoutsConfig } | { ok: false; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSheetName(value: unknown, label: string, fallback: string, issues: string[]): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`"spreadsheet.${label}" must be a non-empty string when provided.`);
    return fallback;
  }
  return value.trim();
}

/**
 * Parse and validate the bundle config. Credentials are never part of the
 * config; only the spreadsheet id and sheet names are read here.
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

  const playersSheet = parseSheetName(
    spreadsheet.playersSheet,
    "playersSheet",
    DEFAULT_PLAYERS_SHEET,
    issues,
  );
  const categoryMappingsSheet = parseSheetName(
    spreadsheet.categoryMappingsSheet,
    "categoryMappingsSheet",
    DEFAULT_CATEGORY_MAPPINGS_SHEET,
    issues,
  );
  const categoryPresentationSheet = parseSheetName(
    spreadsheet.categoryPresentationSheet,
    "categoryPresentationSheet",
    DEFAULT_CATEGORY_PRESENTATION_SHEET,
    issues,
  );

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    config: {
      spreadsheet: {
        spreadsheetId,
        playersSheet,
        categoryMappingsSheet,
        categoryPresentationSheet,
      },
    },
  };
}
