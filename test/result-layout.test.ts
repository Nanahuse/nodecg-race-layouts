import { describe, expect, it } from "vitest";
import { getResultLayout } from "../ui/graphics/result/result-layout";

describe("getResultLayout", () => {
  it.each([
    [0, "expanded", 2, 0],
    [1, "expanded", 2, 1],
    [6, "expanded", 2, 3],
    [7, "compact", 2, 4],
    [12, "compact", 2, 6],
    [13, "dense", 3, 5],
    [18, "dense", 3, 6],
    [19, "extra-dense", 3, 7],
    [24, "extra-dense", 3, 8],
  ] as const)("returns the expected layout for %i results", (count, density, columns, rows) => {
    expect(getResultLayout(count)).toEqual({ density, columns, rows });
  });
});
