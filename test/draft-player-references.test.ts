import { describe, expect, it } from "vitest";

import {
  pruneUnreferencedDraftPlayers,
  referencedDraftPlayerIds,
} from "../src/extension/application/draft-player-references";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";

describe("referencedDraftPlayerIds", () => {
  it("includes participants and commentators", () => {
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2"),
        p3: makeDraftPlayer("p3"),
      },
      participants: [{ racetimeUserId: "rt-p1", playerId: "p1" }],
    });
    draft.commentatorPlayerIds = ["p2"];

    const ids = referencedDraftPlayerIds(draft);
    expect([...ids].sort()).toEqual(["p1", "p2"]);
    expect(ids.has("p3")).toBe(false);
  });

  it("ignores a null participant player id", () => {
    const draft = makeParticipantDraft({
      players: { p1: makeDraftPlayer("p1") },
      participants: [{ racetimeUserId: "rt-p1", playerId: null }],
    });
    expect(referencedDraftPlayerIds(draft).size).toBe(0);
  });
});

describe("pruneUnreferencedDraftPlayers", () => {
  it("keeps participant-only, commentator-only and shared players", () => {
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2"),
        p3: makeDraftPlayer("p3"),
        p4: makeDraftPlayer("p4"),
      },
      participants: [
        { racetimeUserId: "rt-p1", playerId: "p1" },
        { racetimeUserId: "rt-p3", playerId: "p3" },
      ],
    });
    draft.commentatorPlayerIds = ["p2", "p3"];

    const pruned = pruneUnreferencedDraftPlayers(draft);
    expect(Object.keys(pruned.players).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("drops every player when nothing is referenced", () => {
    const draft = makeParticipantDraft({
      players: { p1: makeDraftPlayer("p1") },
      participants: [],
    });
    expect(pruneUnreferencedDraftPlayers(draft).players).toEqual({});
  });
});
