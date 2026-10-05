import { describe, expect, it } from "vitest";
import {
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

  it("uses default tab names when loading stored settings with only the spreadsheet ID", () => {
    expect(spreadsheetSettingsFromConfig({ spreadsheetId: "sheet-id" })).toEqual({
      spreadsheetId: "sheet-id",
      categoryMappingsSheet: "CategoryMappings",
      categoryPresentationSheet: "CategoryPresentation",
      raceHistorySheet: "RaceHistory",
    });
  });
});
