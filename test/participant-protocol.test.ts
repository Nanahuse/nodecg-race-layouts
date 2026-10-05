import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_REGISTRATION_START_MESSAGE,
  PARTICIPANT_SET_PLAYER_MESSAGE,
  PLAYER_MANAGER_LIST_MESSAGE,
} from "../src/protocol/participant";

describe("participant protocol", () => {
  it("keeps participant message names stable", () => {
    expect([
      PARTICIPANT_SET_PLAYER_MESSAGE,
      PARTICIPANT_REGISTRATION_START_MESSAGE,
      PLAYER_MANAGER_LIST_MESSAGE,
    ]).toEqual(["participant.set-player", "participant.registration.start", "player-manager.list"]);
  });
});
