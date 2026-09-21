import { describe, expect, it } from "vitest";

import type { DraftConfig } from "../src/domain";
import { validateDraftIntegrity } from "../src/extension/application/race-draft-service";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";

function draftWithSlots(): DraftConfig {
  const players = Object.fromEntries(
    [1, 2, 3, 4].map((index) => [`p${index}`, makeDraftPlayer(`p${index}`)]),
  );
  const draft = makeParticipantDraft({
    players,
    participants: [1, 2, 3, 4].map((index) => ({
      racetimeUserId: `rt-p${index}`,
      playerId: `p${index}`,
    })),
  });
  draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" };
  return draft;
}

function codes(draft: DraftConfig): string[] {
  return validateDraftIntegrity(draft).map((issue) => issue.code);
}

describe("validateDraftIntegrity", () => {
  it("accepts a valid draft with null slots", () => {
    const draft = draftWithSlots();
    draft.raceScreenSlots = { 1: "rt-p1", 2: null, 3: null, 4: null };
    expect(validateDraftIntegrity(draft)).toEqual([]);
  });

  it("reports a duplicate slot", () => {
    const draft = draftWithSlots();
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p1", 3: "rt-p3", 4: "rt-p4" };
    expect(codes(draft)).toContain("slot_duplicate");
  });

  it("reports an unknown participant slot", () => {
    const draft = draftWithSlots();
    draft.raceScreenSlots = { 1: "rt-unknown", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" };
    expect(codes(draft)).toContain("slot_unknown_participant");
  });

  it("reports commentator issues", () => {
    const tooMany = draftWithSlots();
    tooMany.commentatorPlayerIds = ["p1", "p2", "p3", "p4"];
    expect(codes(tooMany)).toContain("commentator_too_many");

    const duplicate = draftWithSlots();
    duplicate.commentatorPlayerIds = ["p1", "p1"];
    expect(codes(duplicate)).toContain("commentator_duplicate");

    const unknown = draftWithSlots();
    unknown.commentatorPlayerIds = ["ghost"];
    expect(codes(unknown)).toContain("commentator_player_missing");
  });
});
