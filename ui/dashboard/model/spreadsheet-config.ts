import {
  DEFAULT_CATEGORY_MAPPINGS_SHEET,
  DEFAULT_CATEGORY_PRESENTATION_SHEET,
  DEFAULT_RACE_HISTORY_SHEET,
} from "../../../src/extension/config";

export type SpreadsheetSettings = {
  spreadsheetId: string;
  categoryMappingsSheet: string;
  categoryPresentationSheet: string;
  raceHistorySheet: string;
};

export function spreadsheetIdFromInput(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([\w-]+)/);
  return match?.[1] ?? trimmed;
}

export function spreadsheetSettingsFromConfig(raw: unknown): SpreadsheetSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return defaultSpreadsheetSettings();
  }
  const spreadsheet = (raw as Record<string, unknown>).spreadsheet;
  if (typeof spreadsheet !== "object" || spreadsheet === null || Array.isArray(spreadsheet)) {
    return defaultSpreadsheetSettings();
  }
  const value = spreadsheet as Record<string, unknown>;
  return {
    spreadsheetId: typeof value.spreadsheetId === "string" ? value.spreadsheetId : "",
    categoryMappingsSheet:
      typeof value.categoryMappingsSheet === "string"
        ? value.categoryMappingsSheet
        : DEFAULT_CATEGORY_MAPPINGS_SHEET,
    categoryPresentationSheet:
      typeof value.categoryPresentationSheet === "string"
        ? value.categoryPresentationSheet
        : DEFAULT_CATEGORY_PRESENTATION_SHEET,
    raceHistorySheet:
      typeof value.raceHistorySheet === "string"
        ? value.raceHistorySheet
        : DEFAULT_RACE_HISTORY_SHEET,
  };
}

export function defaultSpreadsheetSettings(): SpreadsheetSettings {
  return {
    spreadsheetId: "",
    categoryMappingsSheet: DEFAULT_CATEGORY_MAPPINGS_SHEET,
    categoryPresentationSheet: DEFAULT_CATEGORY_PRESENTATION_SHEET,
    raceHistorySheet: DEFAULT_RACE_HISTORY_SHEET,
  };
}
