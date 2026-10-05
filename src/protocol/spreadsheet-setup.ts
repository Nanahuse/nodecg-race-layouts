export const SPREADSHEET_SETUP_CONFIG_MESSAGE = "spreadsheet.setup.config";
export const SPREADSHEET_SETUP_CONNECT_MESSAGE = "spreadsheet.setup.connect";

export type SpreadsheetSetupConfigResponse = {
  ok: true;
  config: unknown;
};

export type SpreadsheetSetupConnectRequest = {
  spreadsheetUrl: string;
};

export type SpreadsheetSetupConnectResponse =
  { ok: true; sheetNames: string[] } | { ok: false; message: string };

export const SPREADSHEET_SETUP_SAVE_MESSAGE = "spreadsheet.setup.save";

export type SpreadsheetSetupSaveRequest = {
  spreadsheetUrl: string;
  categoryMappingsSheet: string;
  categoryPresentationSheet: string;
  raceHistorySheet: string;
};

export type SpreadsheetSetupSaveResponse =
  { ok: true; configJson: string } | { ok: false; message: string };
