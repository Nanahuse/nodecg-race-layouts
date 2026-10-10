// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { playerEditUrl } from "@nanahuse/player-manager-protocol";
import { describe, expect, it, vi } from "vitest";
import {
  groupParticipants,
  isResolvedParticipant,
  participantAction,
} from "../ui/dashboard/model/participants";
import { makeDraftPerson, makeParticipantDraft } from "./support/draft-fakes";
import { ParticipantCard } from "../ui/dashboard/app";

const { beginRegistration } = vi.hoisted(() => ({
  beginRegistration: vi.fn().mockResolvedValue({ ok: true, url: "https://pm.test/register" }),
}));

vi.mock("../ui/dashboard/api/participant-api", () => ({
  createParticipantApi: () => ({ beginRegistration }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderParticipantCard(person: ReturnType<typeof makeDraftPerson>) {
  const racetimeUserId = person.identity.racetimeUserId ?? "rt-user";
  const draft = makeParticipantDraft({
    persons: { [person.ref]: person },
    participants: [{ racetimeUserId, personRef: person.ref }],
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(ParticipantCard, {
        draft,
        participant: draft.participants[0]!,
        entrantName: "Runner",
      }),
    ),
  );
  return {
    button: container.querySelector("button")!,
    unmount: () => act(() => root.unmount()),
  };
}

describe("dashboard participant grouping", () => {
  it("opens the matched Player edit URL without starting Registration", () => {
    beginRegistration.mockClear();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const participant = renderParticipantCard(makeDraftPerson("player-42"));

    act(() => participant.button.click());

    expect(open).toHaveBeenCalledExactlyOnceWith(
      playerEditUrl("player-42"),
      "_blank",
      "noopener,noreferrer",
    );
    expect(beginRegistration).not.toHaveBeenCalled();
    participant.unmount();
    open.mockRestore();
  });

  it("starts the existing Registration for an unresolved participant with its RaceTime ID", async () => {
    beginRegistration.mockClear();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const participant = renderParticipantCard(
      makeDraftPerson("unresolved", "rt-unresolved", "unresolved"),
    );

    await act(async () => participant.button.click());

    expect(beginRegistration).toHaveBeenCalledExactlyOnceWith("rt-unresolved");
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://pm.test/register",
      "_blank",
      "noopener,noreferrer",
    );
    participant.unmount();
    open.mockRestore();
  });

  it.each([
    ["mismatched", "player-id", "different-player"],
    ["empty", "", ""],
    ["whitespace", "   ", "   "],
  ])(
    "uses Registration for a %s Player ID instead of opening an edit URL",
    async (_case, playerId, snapshotPlayerId) => {
      beginRegistration.mockClear();
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      const person = makeDraftPerson("invalid", "rt-invalid");
      person.playerId = playerId;
      person.player = { ...person.player!, playerId: snapshotPlayerId };
      const participant = renderParticipantCard(person);

      await act(async () => participant.button.click());

      expect(open).toHaveBeenCalledExactlyOnceWith(
        "https://pm.test/register",
        "_blank",
        "noopener,noreferrer",
      );
      expect(beginRegistration).toHaveBeenCalledExactlyOnceWith("rt-invalid");
      participant.unmount();
      open.mockRestore();
    },
  );

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
    for (const playerId of ["", "   "]) {
      const person = makeDraftPerson("blank-player-id");
      person.playerId = playerId;
      person.player = { ...person.player!, playerId };
      expect(isResolvedParticipant(person)).toBe(false);
    }
    expect(
      isResolvedParticipant({
        ...makeDraftPerson("no-snapshot"),
        player: null,
      }),
    ).toBe(false);
    expect(
      isResolvedParticipant({
        ...makeDraftPerson("mismatched-snapshot"),
        player: { ...makeDraftPerson("different-player").player!, playerId: "different-player" },
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
