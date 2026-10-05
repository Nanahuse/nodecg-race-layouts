import type { NodeCG } from "../../types/nodecg";
import {
  SPREADSHEET_SETUP_CONFIG_MESSAGE,
  SPREADSHEET_SETUP_CONNECT_MESSAGE,
  SPREADSHEET_SETUP_SAVE_MESSAGE,
  type SpreadsheetSetupConnectRequest,
  type SpreadsheetSetupSaveRequest,
} from "../../protocol/spreadsheet-setup";
import { GoogleSheetsClient } from "../integrations/spreadsheet/google-sheets-client";
import type { GoogleSheetsClientOptions } from "../integrations/spreadsheet/google-sheets-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function spreadsheetId(value: string): string {
  const match = value.trim().match(/\/spreadsheets\/d\/([\w-]+)/);
  return match?.[1] ?? value.trim();
}

export function registerSpreadsheetSetupMessages(
  nodecg: NodeCG,
  createClient: (options: GoogleSheetsClientOptions) => Pick<GoogleSheetsClient, "listSheets"> = (
    options,
  ) => GoogleSheetsClient.create(options),
): void {
  nodecg.listenFor(SPREADSHEET_SETUP_CONFIG_MESSAGE, (_data, ack) => {
    const config = isRecord(nodecg.bundleConfig) ? nodecg.bundleConfig : {};
    const currentSpreadsheet = isRecord(config.spreadsheet) ? config.spreadsheet : {};
    const { googleCredentialsFile: _hiddenPath, ...spreadsheet } = currentSpreadsheet;
    if (ack && !ack.handled) ack(null, { ok: true, config: { ...config, spreadsheet } });
  });

  nodecg.listenFor(SPREADSHEET_SETUP_CONNECT_MESSAGE, async (data, ack) => {
    const request = (isRecord(data) ? data : {}) as Partial<SpreadsheetSetupConnectRequest>;
    const id =
      typeof request.spreadsheetUrl === "string" ? spreadsheetId(request.spreadsheetUrl) : "";
    const currentConfig = isRecord(nodecg.bundleConfig) ? nodecg.bundleConfig : {};
    const currentSpreadsheet = isRecord(currentConfig.spreadsheet) ? currentConfig.spreadsheet : {};
    const credentialsFile =
      typeof currentSpreadsheet.googleCredentialsFile === "string"
        ? currentSpreadsheet.googleCredentialsFile.trim()
        : "";
    if (!id) {
      if (ack && !ack.handled) ack(null, { ok: false, message: "Enter a spreadsheet URL or ID." });
      return;
    }

    try {
      const client = createClient({
        spreadsheetId: id,
        ...(credentialsFile ? { googleCredentialsFile: credentialsFile } : {}),
      });
      const sheetNames = await client.listSheets();
      if (ack && !ack.handled) ack(null, { ok: true, sheetNames });
    } catch (error) {
      nodecg.log.warn(
        "[spreadsheet.setup.connect.failed] Could not read spreadsheet metadata.",
        error,
      );
      if (ack && !ack.handled) {
        ack(null, {
          ok: false,
          message:
            "Could not connect. Check the spreadsheet URL, sharing permissions, and server-side Google authentication settings.",
        });
      }
    }
  });

  nodecg.listenFor(SPREADSHEET_SETUP_SAVE_MESSAGE, (data, ack) => {
    const request = (isRecord(data) ? data : {}) as Partial<SpreadsheetSetupSaveRequest>;
    const id =
      typeof request.spreadsheetUrl === "string" ? spreadsheetId(request.spreadsheetUrl) : "";
    const names = [
      request.categoryMappingsSheet,
      request.categoryPresentationSheet,
      request.raceHistorySheet,
    ];
    if (!id || names.some((name) => typeof name !== "string" || !name.trim())) {
      if (ack && !ack.handled) {
        ack(null, { ok: false, message: "Connect first and choose all three tabs." });
      }
      return;
    }
    const config = isRecord(nodecg.bundleConfig) ? nodecg.bundleConfig : {};
    const currentSpreadsheet = isRecord(config.spreadsheet) ? config.spreadsheet : {};
    const spreadsheet = {
      spreadsheetId: id,
      ...(typeof currentSpreadsheet.googleCredentialsFile === "string" &&
      currentSpreadsheet.googleCredentialsFile.trim()
        ? { googleCredentialsFile: currentSpreadsheet.googleCredentialsFile.trim() }
        : {}),
      categoryMappingsSheet: request.categoryMappingsSheet!.trim(),
      categoryPresentationSheet: request.categoryPresentationSheet!.trim(),
      raceHistorySheet: request.raceHistorySheet!.trim(),
    };
    const { spreadsheet: _oldSpreadsheet, ...otherConfig } = config;
    const configJson = `${JSON.stringify({ ...otherConfig, spreadsheet }, null, 2)}\n`;
    if (ack && !ack.handled) ack(null, { ok: true, configJson });
  });
}
