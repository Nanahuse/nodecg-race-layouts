import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_SET_DISPLAY_NAME_MESSAGE,
  PARTICIPANT_SET_PLAYER_MESSAGE,
  PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE,
  PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE,
  PARTICIPANT_SET_TWITCH_MESSAGE,
  PARTICIPANT_SET_TWITCH_NONE_MESSAGE,
} from "../src/protocol/participant";

describe("participant protocol", () => {
  it("keeps participant message names stable", () => {
    expect([
      PARTICIPANT_SET_PLAYER_MESSAGE,
      PARTICIPANT_SET_SPEEDRUNCOM_MESSAGE,
      PARTICIPANT_SET_SPEEDRUNCOM_NONE_MESSAGE,
      PARTICIPANT_SET_TWITCH_MESSAGE,
      PARTICIPANT_SET_TWITCH_NONE_MESSAGE,
      PARTICIPANT_SET_DISPLAY_NAME_MESSAGE,
    ]).toEqual([
      "participant.set-player",
      "participant.set-speedruncom",
      "participant.set-speedruncom-none",
      "participant.set-twitch",
      "participant.set-twitch-none",
      "participant.set-display-name",
    ]);
  });
});
