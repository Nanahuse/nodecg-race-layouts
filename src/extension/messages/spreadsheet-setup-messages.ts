import type { NodeCG } from "../../types/nodecg";
import {
  SPREADSHEET_SETUP_CONFIG_MESSAGE,
  SPREADSHEET_SETUP_CONNECT_MESSAGE,
  type SpreadsheetSetupConnectRequest,
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
    if (ack && !ack.handled) ack(null, { ok: true, config: nodecg.bundleConfig ?? {} });
  });

  nodecg.listenFor(SPREADSHEET_SETUP_CONNECT_MESSAGE, async (data, ack) => {
    const request = (isRecord(data) ? data : {}) as Partial<SpreadsheetSetupConnectRequest>;
    const id =
      typeof request.spreadsheetUrl === "string" ? spreadsheetId(request.spreadsheetUrl) : "";
    const credentialsFile =
      typeof request.googleCredentialsFile === "string" ? request.googleCredentialsFile.trim() : "";
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
    } catch {
      if (ack && !ack.handled) {
        ack(null, {
          ok: false,
          message:
            "Could not connect. Check the spreadsheet URL, sharing permissions, and Google credentials file path.",
        });
      }
    }
  });
}
