import { sheets as createSheetsApi } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";

import type { SpreadsheetClient, SpreadsheetValues } from "./client";
import { SpreadsheetClientError } from "./errors";

const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_TIMEOUT_MS = 30_000;

type SheetsApi = ReturnType<typeof createSheetsApi>;

export type GoogleSheetsClientOptions = {
  spreadsheetId: string;
  timeoutMs?: number;
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function normalizeValues(values: unknown[][] | null | undefined): SpreadsheetValues {
  if (!values) {
    return [];
  }
  return values.map((row) => (Array.isArray(row) ? row.map(cellToString) : [cellToString(row)]));
}

/**
 * Google Sheets implementation of {@link SpreadsheetClient}.
 *
 * Authentication uses Application Default Credentials via `GoogleAuth`; no
 * credentials are stored in the repository or bundle config.
 */
export class GoogleSheetsClient implements SpreadsheetClient {
  private readonly api: SheetsApi;
  private readonly spreadsheetId: string;

  constructor(api: SheetsApi, spreadsheetId: string) {
    this.api = api;
    this.spreadsheetId = spreadsheetId;
  }

  static create(options: GoogleSheetsClientOptions): GoogleSheetsClient {
    const auth = new GoogleAuth({ scopes: [SPREADSHEETS_SCOPE] });
    const api = createSheetsApi({
      version: "v4",
      auth,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    return new GoogleSheetsClient(api, options.spreadsheetId);
  }

  async readValues(range: string): Promise<SpreadsheetValues> {
    try {
      const response = await this.api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return normalizeValues(response.data.values);
    } catch (error) {
      throw new SpreadsheetClientError(`Failed to read range "${range}".`, { cause: error });
    }
  }

  async updateValues(range: string, values: readonly (readonly string[])[]): Promise<void> {
    try {
      await this.api.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: values.map((row) => [...row]) },
      });
    } catch (error) {
      throw new SpreadsheetClientError(`Failed to update range "${range}".`, { cause: error });
    }
  }

  async appendValues(range: string, values: readonly (readonly string[])[]): Promise<void> {
    try {
      await this.api.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: values.map((row) => [...row]) },
      });
    } catch (error) {
      throw new SpreadsheetClientError(`Failed to append to range "${range}".`, { cause: error });
    }
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    try {
      const sheetId = await this.findSheetId(sheetName);
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: rowNumber - 1,
                  endIndex: rowNumber,
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      if (error instanceof SpreadsheetClientError) {
        throw error;
      }
      throw new SpreadsheetClientError(`Failed to delete row ${rowNumber} from "${sheetName}".`, {
        cause: error,
      });
    }
  }

  private async findSheetId(sheetName: string): Promise<number> {
    const metadata = await this.api.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties",
    });
    const sheet = metadata.data.sheets?.find(
      (candidate) => candidate.properties?.title === sheetName,
    );
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      throw new SpreadsheetClientError(`Sheet "${sheetName}" was not found.`);
    }
    return sheetId;
  }
}
