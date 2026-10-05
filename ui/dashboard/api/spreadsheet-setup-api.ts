import {
  SPREADSHEET_SETUP_CONFIG_MESSAGE,
  SPREADSHEET_SETUP_CONNECT_MESSAGE,
  SPREADSHEET_SETUP_SAVE_MESSAGE,
  type SpreadsheetSetupConnectResponse,
  type SpreadsheetSetupConfigResponse,
  type SpreadsheetSetupSaveResponse,
} from "../../../src/protocol/spreadsheet-setup";
import { nodecg } from "./nodecg-client";

export const spreadsheetSetupApi = {
  getConfig: () =>
    nodecg.sendMessage<SpreadsheetSetupConfigResponse>(SPREADSHEET_SETUP_CONFIG_MESSAGE),
  connect: (spreadsheetUrl: string) =>
    nodecg.sendMessage<SpreadsheetSetupConnectResponse>(SPREADSHEET_SETUP_CONNECT_MESSAGE, {
      spreadsheetUrl,
    }),
  save: (settings: {
    spreadsheetUrl: string;
    categoryMappingsSheet: string;
    categoryPresentationSheet: string;
    raceHistorySheet: string;
  }) => nodecg.sendMessage<SpreadsheetSetupSaveResponse>(SPREADSHEET_SETUP_SAVE_MESSAGE, settings),
};
