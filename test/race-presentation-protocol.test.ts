import { describe, expect, it } from "vitest";
import {
  COMMENTATORS_SET_MESSAGE,
  RACE_SCREEN_SET_SLOTS_MESSAGE,
} from "../src/protocol/race-presentation";

describe("race presentation protocol", () => {
  it("keeps presentation message names stable", () => {
    expect(RACE_SCREEN_SET_SLOTS_MESSAGE).toBe("race-screen.set-slots");
    expect(COMMENTATORS_SET_MESSAGE).toBe("commentators.set");
  });
});
