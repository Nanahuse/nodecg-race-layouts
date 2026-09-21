import { describe, expect, it } from "vitest";

import {
  ACTIVE_CONFIG_ISSUE_CODES,
  hasValidationIssue,
  validateActiveConfig,
  type SpeedrunCategorySelection,
} from "../src/domain";
import { makeActiveConfig, sampleCategorySelection } from "./factories";

describe("category selection", () => {
  it("accepts an active config that has a category selection", () => {
    expect(validateActiveConfig(makeActiveConfig())).toEqual([]);
  });

  it("rejects an active config without a category selection", () => {
    const config = makeActiveConfig({
      categorySelection: null as unknown as SpeedrunCategorySelection,
    });
    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.categorySelectionMissing)).toBe(
      true,
    );
  });
});

describe("category presentation", () => {
  it("allows an active config without a presentation", () => {
    expect(validateActiveConfig(makeActiveConfig({ categoryPresentation: null }))).toEqual([]);
  });

  it("allows an active config with a presentation", () => {
    const config = makeActiveConfig({
      categoryPresentation: {
        title: "Any%",
        subtitle: "No Major Glitches",
        ruleHeading: "Rules",
        ruleLines: ["Rule one", "Rule two"],
        leaderboardHeading: "Leaderboard",
      },
    });
    expect(validateActiveConfig(config)).toEqual([]);
  });
});

describe("manual category selection", () => {
  it("is valid even when no saved mapping exists", () => {
    const config = makeActiveConfig({ categorySelection: sampleCategorySelection });
    expect(validateActiveConfig(config)).toEqual([]);
  });
});
