import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import config from "../configschema.json";
import example from "../config.example.json";

describe("bundle config schema", () => {
  const validate = new Ajv({ useDefaults: true }).compile(config);
  it("accepts the example and race history sheet", () => {
    expect(validate(structuredClone(example))).toBe(true);
    expect(
      validate({ spreadsheet: { spreadsheetId: "sheet-id", raceHistorySheet: "RaceHistory" } }),
    ).toBe(true);
  });
  it("accepts a config without spreadsheet settings so the dashboard setup can be used", () => {
    expect(validate({ event: { name: "RTA Event" } })).toBe(true);
  });
  it("accepts the removed Player sheet key so the setup UI can replace old config", () => {
    expect(
      validate({
        spreadsheet: { spreadsheetId: "sheet-id", playersSheet: "Players" },
      }),
    ).toBe(true);
  });
  it("rejects unknown spreadsheet properties", () => {
    expect(validate({ spreadsheet: { spreadsheetId: "sheet-id", unknownSheet: "X" } })).toBe(false);
  });
});
