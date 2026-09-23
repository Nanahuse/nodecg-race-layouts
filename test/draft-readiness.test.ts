import { describe, expect, it } from "vitest";

import type { DraftConfig } from "../src/domain";
import {
  DRAFT_READINESS_ISSUE_CODES,
  isDraftStructurallyReady,
  validateDraftReadiness,
} from "../src/extension/application/draft-readiness";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";

function readyDraft(): DraftConfig {
  const players = Object.fromEntries(
    [1, 2, 3, 4].map((index) => [
      `p${index}`,
      makeDraftPlayer(`p${index}`, {
        speedrunCom: {
          state: "linked" as const,
          value: { userId: `src-${index}`, name: `Player ${index}`, twitchLogin: null },
          source: "manual" as const,
        },
        twitch: { state: "none" as const, source: "manual" as const },
      }),
    ]),
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
  return validateDraftReadiness(draft).map((issue) => issue.code);
}

describe("validateDraftReadiness", () => {
  it("accepts a fully ready draft", () => {
    expect(validateDraftReadiness(readyDraft())).toEqual([]);
    expect(isDraftStructurallyReady(readyDraft())).toBe(true);
  });

  it("rejects a missing race", () => {
    const draft = readyDraft();
    draft.race = null;
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.raceMissing);
  });

  it("allows unassigned race screen slots", () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: null };
    expect(codes(draft)).not.toContain(DRAFT_READINESS_ISSUE_CODES.slotMissing);
    expect(isDraftStructurallyReady(draft)).toBe(true);
  });

  it("rejects a duplicate slot", () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p1", 3: "rt-p3", 4: "rt-p4" };
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.slotDuplicate);
  });

  it("rejects a slot referencing an unknown participant", () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: "rt-unknown", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" };
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.slotUnknownParticipant);
  });

  it("rejects too many, duplicate or unknown commentators", () => {
    const tooMany = readyDraft();
    tooMany.commentatorPlayerIds = ["p1", "p2", "p3", "p4"];
    expect(codes(tooMany)).toContain(DRAFT_READINESS_ISSUE_CODES.commentatorTooMany);

    const duplicate = readyDraft();
    duplicate.commentatorPlayerIds = ["p1", "p1"];
    expect(codes(duplicate)).toContain(DRAFT_READINESS_ISSUE_CODES.commentatorDuplicate);

    const unknown = readyDraft();
    unknown.commentatorPlayerIds = ["ghost"];
    expect(codes(unknown)).toContain(DRAFT_READINESS_ISSUE_CODES.commentatorUnknownPlayer);
  });

  it("rejects a missing category selection", () => {
    const draft = readyDraft();
    draft.categorySelection = { selection: null, source: null, savedMappingState: "none" };
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.categorySelectionMissing);
  });

  it("rejects an unresolvable display name", () => {
    const draft = readyDraft();
    draft.players["p1"] = makeDraftPlayer("p1", {
      manualDisplayName: null,
      racetime: { state: "none", source: "manual" },
      speedrunCom: { state: "none", source: "manual" },
      twitch: { state: "none", source: "manual" },
    });
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.displayNameUnresolved);
  });

  it("rejects an unresolved identity", () => {
    const draft = readyDraft();
    draft.players["p1"] = makeDraftPlayer("p1");
    expect(codes(draft)).toContain(DRAFT_READINESS_ISSUE_CODES.identityUnresolved);
  });
});
