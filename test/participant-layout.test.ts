import { describe, expect, it } from "vitest";
import { getParticipantLayout } from "../ui/graphics/participants/participant-layout";

describe("getParticipantLayout", () => {
  it.each([
    [0, "expanded", 2],
    [1, "expanded", 2],
    [6, "expanded", 2],
    [7, "compact", 2],
    [12, "compact", 2],
    [13, "dense", 3],
    [18, "dense", 3],
    [19, "extra-dense", 3],
    [24, "extra-dense", 3],
  ] as const)("returns the expected layout for %i participants", (count, density, columns) => {
    expect(getParticipantLayout(count)).toEqual({ density, columns });
  });
});
