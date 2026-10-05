import { describe, expect, it, vi } from "vitest";
import { GoogleSheetsClient } from "../src/extension/integrations/spreadsheet/google-sheets-client";

describe("GoogleSheetsClient.listSheets", () => {
  it("returns tab names from spreadsheet metadata", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: "CategoryMappings" } },
          { properties: { title: "RaceHistory" } },
          { properties: {} },
        ],
      },
    });
    const client = new GoogleSheetsClient(
      { spreadsheets: { get } } as unknown as ConstructorParameters<typeof GoogleSheetsClient>[0],
      "sheet-id",
    );

    await expect(client.listSheets()).resolves.toEqual(["CategoryMappings", "RaceHistory"]);
    expect(get).toHaveBeenCalledWith({
      spreadsheetId: "sheet-id",
      fields: "sheets.properties.title",
    });
  });

  it("wraps metadata request failures", async () => {
    const client = new GoogleSheetsClient(
      {
        spreadsheets: { get: vi.fn().mockRejectedValue(new Error("denied")) },
      } as unknown as ConstructorParameters<typeof GoogleSheetsClient>[0],
      "sheet-id",
    );
    await expect(client.listSheets()).rejects.toThrow(
      "Failed to connect to the Google Spreadsheet.",
    );
  });
});
