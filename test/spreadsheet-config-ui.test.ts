import { describe, expect, it } from "vitest";
import {
  configWithSpreadsheet,
  spreadsheetIdFromInput,
  spreadsheetSettingsFromConfig,
} from "../ui/dashboard/model/spreadsheet-config";

describe("spreadsheet setup config helpers", () => {
  it("accepts a spreadsheet URL or a raw ID", () => {
    expect(
      spreadsheetIdFromInput("https://docs.google.com/spreadsheets/d/abc_123/edit#gid=0"),
    ).toBe("abc_123");
    expect(spreadsheetIdFromInput("  sheet-id  ")).toBe("sheet-id");
  });

  it("uses default tab names when loading a config with only the spreadsheet ID", () => {
    expect(spreadsheetSettingsFromConfig({ spreadsheet: { spreadsheetId: "sheet-id" } })).toEqual({
      spreadsheetId: "sheet-id",
      googleCredentialsFile: "",
      categoryMappingsSheet: "CategoryMappings",
      categoryPresentationSheet: "CategoryPresentation",
      raceHistorySheet: "RaceHistory",
    });
  });

  it("updates spreadsheet values and preserves the rest of the loaded bundle config", () => {
    const result = JSON.parse(
      configWithSpreadsheet(
        { event: { name: "Local Final" }, oldSetting: true },
        {
          spreadsheetId: "https://docs.google.com/spreadsheets/d/sheet-id/edit",
          googleCredentialsFile: "C:/keys/sheets.json",
          categoryMappingsSheet: "Mappings",
          categoryPresentationSheet: "Presentation",
          raceHistorySheet: "History",
        },
      ),
    );
    expect(result).toEqual({
      event: { name: "Local Final" },
      oldSetting: true,
      spreadsheet: {
        spreadsheetId: "sheet-id",
        googleCredentialsFile: "C:/keys/sheets.json",
        categoryMappingsSheet: "Mappings",
        categoryPresentationSheet: "Presentation",
        raceHistorySheet: "History",
      },
    });
  });
});
