import { describe, expect, it } from "vitest";
import { formatRaceTimeDuration } from "../src/extension/application/racetime-duration";

describe("formatRaceTimeDuration", () => {
  it.each([
    ["PT45S", "0:45"],
    ["PT45.123S", "0:45.123"],
    ["PT1M23S", "1:23"],
    ["PT1H2M3S", "1:02:03"],
    ["PT1H2M3.456S", "1:02:03.456"],
    ["PT1H0M5S", "1:00:05"],
  ])("formats %s", (input, expected) => expect(formatRaceTimeDuration(input)).toBe(expected));
  it.each(["", "abc", "P1D", "PT"])("rejects %s", (input) =>
    expect(formatRaceTimeDuration(input)).toBeNull(),
  );
});
