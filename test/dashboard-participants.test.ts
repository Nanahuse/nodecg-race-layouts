import { describe, expect, it } from "vitest";
import {
  groupParticipants,
  isResolvedParticipant,
  participantAction,
} from "../ui/dashboard/model/participants";
import { makeDraftPerson, makeParticipantDraft } from "./support/draft-fakes";

describe("dashboard participant grouping", () => {
  it("places every unresolved state and incomplete matched snapshots under Needs attention", () => {
    const states = ["unresolved", "ambiguous", "conflict"] as const;
    for (const state of states) {
      expect(isResolvedParticipant(makeDraftPerson(state, `rt-${state}`, state))).toBe(false);
    }
    expect(
      isResolvedParticipant({
        ...makeDraftPerson("no-player-id"),
        playerId: null,
      }),
    ).toBe(false);
    expect(
      isResolvedParticipant({
        ...makeDraftPerson("no-snapshot"),
        player: null,
      }),
    ).toBe(false);
    expect(isResolvedParticipant(makeDraftPerson("complete"))).toBe(true);
    expect(participantAction(makeDraftPerson("incomplete", "rt-incomplete", "unresolved"))).toEqual(
      {
        label: "Resolve in Player Manager",
        style: "primary",
      },
    );
    expect(participantAction(makeDraftPerson("complete"))).toEqual({
      label: "Edit in Player Manager",
      style: "secondary",
    });
  });

  it("keeps RaceTime order within the Needs attention and Resolved groups", () => {
    const people = {
      firstResolved: makeDraftPerson("firstResolved", "rt-1"),
      firstNeedsAttention: makeDraftPerson("firstNeedsAttention", "rt-2", "unresolved"),
      secondResolved: makeDraftPerson("secondResolved", "rt-3"),
      secondNeedsAttention: makeDraftPerson("secondNeedsAttention", "rt-4", "conflict"),
    };
    const draft = makeParticipantDraft({
      persons: people,
      participants: [
        { racetimeUserId: "rt-1", personRef: "firstResolved" },
        { racetimeUserId: "rt-2", personRef: "firstNeedsAttention" },
        { racetimeUserId: "rt-3", personRef: "secondResolved" },
        { racetimeUserId: "rt-4", personRef: "secondNeedsAttention" },
      ],
    });

    const { needsAttention, resolved } = groupParticipants(draft);
    const ordered = [...needsAttention, ...resolved];
    expect(needsAttention.map((participant) => participant.racetimeUserId)).toEqual([
      "rt-2",
      "rt-4",
    ]);
    expect(resolved.map((participant) => participant.racetimeUserId)).toEqual(["rt-1", "rt-3"]);
    expect(ordered.map((participant) => participant.racetimeUserId)).toEqual([
      "rt-2",
      "rt-4",
      "rt-1",
      "rt-3",
    ]);
  });
});
