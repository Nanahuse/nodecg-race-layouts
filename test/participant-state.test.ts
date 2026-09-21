import { describe, expect, it } from "vitest";
import { resetParticipantLocalState } from "../ui/dashboard/model/participant-state";

describe("participant local state", () => {
  it("resets editing fields when the mapped player changes", () => {
    expect(
      resetParticipantLocalState({
        playerId: "p2",
        manualDisplayName: "New Name",
        racetime: { state: "unresolved" },
        speedrunCom: { state: "unresolved" },
        twitch: { state: "unresolved" },
      }),
    ).toEqual({ displayName: "New Name", speedrunId: "", twitchLogin: "", error: null });
  });
});
