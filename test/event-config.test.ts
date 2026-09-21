import { describe, expect, it } from "vitest";
import { parseBundleConfig, parseEventConfig } from "../src/extension/config";

describe("parseEventConfig", () => {
  it("normalizes optional values and is independent of spreadsheet parsing", () => {
    expect(parseEventConfig({ event: { name: " Event ", shortName: "", logoUrl: "" } })).toEqual({
      ok: true,
      config: { name: "Event", shortName: null, logoUrl: null },
    });
    expect(parseEventConfig({ event: { name: "Event", logoUrl: "/logo.png" } })).toEqual({
      ok: true,
      config: { name: "Event", shortName: null, logoUrl: "/logo.png" },
    });
    expect(parseBundleConfig({ event: { name: "Event" }, spreadsheet: {} }).ok).toBe(false);
    expect(parseEventConfig({ event: { name: "Event" }, spreadsheet: {} }).ok).toBe(true);
  });

  it.each([
    undefined,
    {},
    { event: {} },
    { event: { name: "" } },
    { event: { name: "Event", shortName: 1 } },
    { event: { name: "Event", logoUrl: 1 } },
  ])("rejects invalid config %#", (raw) => {
    expect(parseEventConfig(raw).ok).toBe(false);
  });
});
