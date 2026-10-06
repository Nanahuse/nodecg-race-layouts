import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_REGISTRATION_START_MESSAGE,
  PLAYER_MANAGER_LIST_MESSAGE,
} from "../src/protocol/participant";

describe("participant protocol", () => {
  it("keeps participant message names stable", () => {
    expect([
      PARTICIPANT_REGISTRATION_START_MESSAGE,
      PLAYER_MANAGER_LIST_MESSAGE,
    ]).toEqual(["participant.registration.start", "player-manager.list"]);
    expect(PARTICIPANT_REGISTRATION_START_MESSAGE).not.toBe("participant.set-player");
  });
});
