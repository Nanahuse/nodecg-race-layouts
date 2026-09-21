import { describe, expect, it } from "vitest";

import {
  categorySelectionFromMapping,
  computeSavedMappingState,
  isDisplayIdentical,
  isLeaderboardEquivalent,
} from "../src/domain";
import { makeCategoryMapping, makeSelection } from "./support/category-fakes";

describe("isLeaderboardEquivalent", () => {
  it("ignores display names", () => {
    const a = makeSelection({ gameName: "A", categoryName: "B" });
    const b = makeSelection({ gameName: "C", categoryName: "D" });
    expect(isLeaderboardEquivalent(a, b)).toBe(true);
  });

  it("detects leaderboard field differences", () => {
    expect(isLeaderboardEquivalent(makeSelection(), makeSelection({ gameId: "other" }))).toBe(
      false,
    );
    expect(isLeaderboardEquivalent(makeSelection(), makeSelection({ variables: { x: "1" } }))).toBe(
      false,
    );
    expect(
      isLeaderboardEquivalent(makeSelection(), makeSelection({ timingMethod: "ingame" })),
    ).toBe(false);
  });

  it("compares variables regardless of key order", () => {
    const a = makeSelection({ variables: { a: "1", b: "2" } });
    const b = makeSelection({ variables: { b: "2", a: "1" } });
    expect(isLeaderboardEquivalent(a, b)).toBe(true);
  });

  it("handles null", () => {
    expect(isLeaderboardEquivalent(null, null)).toBe(true);
    expect(isLeaderboardEquivalent(null, makeSelection())).toBe(false);
  });
});

describe("isDisplayIdentical", () => {
  it("is false when only display names differ", () => {
    expect(
      isDisplayIdentical(makeSelection({ gameName: "A" }), makeSelection({ gameName: "B" })),
    ).toBe(false);
  });

  it("is true when everything matches", () => {
    expect(isDisplayIdentical(makeSelection(), makeSelection())).toBe(true);
  });
});

describe("computeSavedMappingState", () => {
  it("is none without a saved mapping", () => {
    expect(computeSavedMappingState(makeSelection(), null)).toBe("none");
  });

  it("is matches for leaderboard-equivalent selections", () => {
    const saved = makeCategoryMapping({ speedrunCom: makeSelection({ gameName: "Old Name" }) });
    expect(computeSavedMappingState(makeSelection({ gameName: "New Name" }), saved)).toBe(
      "matches",
    );
  });

  it("is overridden when the leaderboard differs", () => {
    const saved = makeCategoryMapping();
    expect(computeSavedMappingState(makeSelection({ gameId: "other" }), saved)).toBe("overridden");
  });

  it("is overridden when there is no selection", () => {
    expect(computeSavedMappingState(null, makeCategoryMapping())).toBe("overridden");
  });
});

describe("categorySelectionFromMapping", () => {
  it("maps a saved mapping to a saved_mapping selection", () => {
    const mapping = makeCategoryMapping();
    expect(categorySelectionFromMapping(mapping)).toEqual({
      selection: mapping.speedrunCom,
      source: "saved_mapping",
      savedMappingState: "matches",
    });
  });

  it("returns an empty selection for null", () => {
    expect(categorySelectionFromMapping(null)).toEqual({
      selection: null,
      source: null,
      savedMappingState: "none",
    });
  });
});
