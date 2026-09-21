import { describe, expect, it } from "vitest";

import { ACTIVE_CONFIG_ISSUE_CODES, hasValidationIssue, validateActiveConfig } from "../src/domain";
import { makeActiveConfig } from "./factories";

describe("race screen slots", () => {
  it("accepts four distinct slots that reference participants", () => {
    expect(validateActiveConfig(makeActiveConfig())).toEqual([]);
  });

  it("rejects an unset slot", () => {
    const config = makeActiveConfig();
    (config.raceScreenSlots as unknown as { 4: string | null })[4] = null;

    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotMissing)).toBe(true);
  });

  it("rejects duplicate slots", () => {
    const config = makeActiveConfig();
    config.raceScreenSlots[4] = config.raceScreenSlots[1];

    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotDuplicate)).toBe(
      true,
    );
  });

  it("rejects a slot referencing a RaceTime user that is not a participant", () => {
    const config = makeActiveConfig();
    config.raceScreenSlots[2] = "rt-unknown";

    const issues = validateActiveConfig(config);
    expect(
      hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotUnknownParticipant),
    ).toBe(true);
  });
});
