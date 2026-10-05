import {
  SPREADSHEET_SETUP_CONFIG_MESSAGE,
  SPREADSHEET_SETUP_CONNECT_MESSAGE,
  type SpreadsheetSetupConnectResponse,
  type SpreadsheetSetupConfigResponse,
} from "../../../src/protocol/spreadsheet-setup";
import { nodecg } from "./nodecg-client";

export const spreadsheetSetupApi = {
  getConfig: () =>
    nodecg.sendMessage<SpreadsheetSetupConfigResponse>(SPREADSHEET_SETUP_CONFIG_MESSAGE),
  connect: (spreadsheetUrl: string, googleCredentialsFile: string) =>
    nodecg.sendMessage<SpreadsheetSetupConnectResponse>(SPREADSHEET_SETUP_CONNECT_MESSAGE, {
      spreadsheetUrl,
      googleCredentialsFile,
    }),
};
