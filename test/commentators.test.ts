import { describe, expect, it } from "vitest";

import { ACTIVE_CONFIG_ISSUE_CODES, hasValidationIssue, validateActiveConfig } from "../src/domain";
import { makeActiveConfig } from "./factories";

describe("commentators", () => {
  it("accepts zero commentators", () => {
    expect(validateActiveConfig(makeActiveConfig({ commentatorPlayerIds: [] }))).toEqual([]);
  });

  it("accepts between one and three commentators", () => {
    expect(validateActiveConfig(makeActiveConfig({ commentatorPlayerIds: ["player-1"] }))).toEqual(
      [],
    );
    expect(
      validateActiveConfig(
        makeActiveConfig({ commentatorPlayerIds: ["player-1", "player-2", "player-3"] }),
      ),
    ).toEqual([]);
  });

  it("rejects more than three commentators", () => {
    const config = makeActiveConfig({
      commentatorPlayerIds: ["player-1", "player-2", "player-3", "player-4"],
    });
    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.commentatorTooMany)).toBe(true);
  });

  it("rejects duplicate commentators", () => {
    const config = makeActiveConfig({ commentatorPlayerIds: ["player-1", "player-1"] });
    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.commentatorDuplicate)).toBe(true);
  });

  it("rejects a commentator that is not an active player", () => {
    const config = makeActiveConfig({ commentatorPlayerIds: ["ghost"] });
    const issues = validateActiveConfig(config);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.commentatorUnknownPlayer)).toBe(
      true,
    );
  });
});
