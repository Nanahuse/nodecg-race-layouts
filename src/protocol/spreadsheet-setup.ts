export const SPREADSHEET_SETUP_CONFIG_MESSAGE = "spreadsheet.setup.config";
export const SPREADSHEET_SETUP_CONNECT_MESSAGE = "spreadsheet.setup.connect";

export type SpreadsheetSetupConfigResponse = {
  ok: true;
  config: unknown;
};

export type SpreadsheetSetupConnectRequest = {
  spreadsheetUrl: string;
  googleCredentialsFile?: string;
};

export type SpreadsheetSetupConnectResponse =
  { ok: true; sheetNames: string[] } | { ok: false; message: string };
