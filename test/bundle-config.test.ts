import { describe, expect, it } from "vitest";

import {
  DEFAULT_CATEGORY_MAPPINGS_SHEET,
  DEFAULT_CATEGORY_PRESENTATION_SHEET,
  DEFAULT_PLAYERS_SHEET,
  parseBundleConfig,
} from "../src/extension/config";

describe("parseBundleConfig", () => {
  it("parses a valid config", () => {
    const result = parseBundleConfig({
      spreadsheet: {
        spreadsheetId: "sheet-123",
        playersSheet: "Runners",
        categoryMappingsSheet: "Mappings",
        categoryPresentationSheet: "Presentation",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.spreadsheet).toEqual({
        spreadsheetId: "sheet-123",
        playersSheet: "Runners",
        categoryMappingsSheet: "Mappings",
        categoryPresentationSheet: "Presentation",
      });
    }
  });

  it("defaults the sheet names", () => {
    const result = parseBundleConfig({ spreadsheet: { spreadsheetId: "sheet-123" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.spreadsheet.playersSheet).toBe(DEFAULT_PLAYERS_SHEET);
      expect(result.config.spreadsheet.categoryMappingsSheet).toBe(DEFAULT_CATEGORY_MAPPINGS_SHEET);
      expect(result.config.spreadsheet.categoryPresentationSheet).toBe(
        DEFAULT_CATEGORY_PRESENTATION_SHEET,
      );
    }
  });

  it("rejects a missing spreadsheet object", () => {
    expect(parseBundleConfig({}).ok).toBe(false);
  });

  it("rejects a missing spreadsheetId", () => {
    expect(parseBundleConfig({ spreadsheet: { playersSheet: "Players" } }).ok).toBe(false);
  });

  it("rejects a blank spreadsheetId", () => {
    expect(parseBundleConfig({ spreadsheet: { spreadsheetId: "   " } }).ok).toBe(false);
  });

  it("rejects a blank playersSheet when provided", () => {
    expect(
      parseBundleConfig({ spreadsheet: { spreadsheetId: "sheet-123", playersSheet: "  " } }).ok,
    ).toBe(false);
  });

  it("rejects a non-object config", () => {
    expect(parseBundleConfig(undefined).ok).toBe(false);
    expect(parseBundleConfig("nope").ok).toBe(false);
  });
});
