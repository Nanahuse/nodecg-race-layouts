import { describe, expect, it } from "vitest";

import type { BroadcastStatusState, DraftConfig, DraftSpeedrunSnapshot } from "../src/domain";
import { leaderboardKeyFromSelection } from "../src/domain";
import { computeDraftBroadcastState } from "../src/extension/application/broadcast-status";
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

function readySnapshot(draft: DraftConfig): DraftSpeedrunSnapshot {
  const selection = draft.categorySelection.selection;
  if (!selection) throw new Error("draft has no selection");
  return {
    draftRevision: draft.revision,
    state: "ready",
    snapshot: {
      snapshotId: "s1",
      fetchedAt: "2026-09-21T05:30:00.000Z",
      leaderboardKey: leaderboardKeyFromSelection(selection),
      worldRecord: null,
      leaderboard: [],
      personalBests: {},
    },
    message: null,
  };
}

function state(
  draft: DraftConfig,
  snapshot: DraftSpeedrunSnapshot,
  current?: BroadcastStatusState,
): BroadcastStatusState {
  return computeDraftBroadcastState({ current, draft, snapshot });
}

describe("computeDraftBroadcastState", () => {
  it("keeps reconciliation_required first", () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: null, 2: null, 3: null, 4: null };
    expect(state(draft, readySnapshot(readyDraft()), "reconciliation_required")).toBe(
      "reconciliation_required",
    );
  });

  it("returns resolution_required for unresolved identities", () => {
    const draft = readyDraft();
    draft.players["p1"] = makeDraftPlayer("p1");
    expect(state(draft, readySnapshot(readyDraft()))).toBe("resolution_required");
  });

  it("remains ready when a slot is unassigned and the snapshot is compatible", () => {
    const draft = readyDraft();
    const snapshot = readySnapshot(draft);
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: null };
    expect(state(draft, snapshot)).toBe("ready");
  });

  it("returns ready when structurally ready and snapshot compatible", () => {
    const draft = readyDraft();
    expect(state(draft, readySnapshot(draft))).toBe("ready");
  });

  it("returns error when structurally ready but the snapshot errored", () => {
    const draft = readyDraft();
    const snapshot: DraftSpeedrunSnapshot = {
      draftRevision: draft.revision,
      state: "error",
      snapshot: null,
      message: "boom",
    };
    expect(state(draft, snapshot)).toBe("error");
  });

  it("keeps ready state as optional slots are cleared and restored", () => {
    const draft = readyDraft();
    const snapshot = readySnapshot(draft);
    expect(state(draft, snapshot)).toBe("ready");

    const cleared = { ...draft, raceScreenSlots: { ...draft.raceScreenSlots, 4: null } };
    expect(state(cleared, snapshot)).toBe("ready");

    expect(state(draft, snapshot)).toBe("ready");
  });

  it("preserves fetching while the snapshot is fetching", () => {
    const draft = readyDraft();
    const snapshot: DraftSpeedrunSnapshot = {
      draftRevision: draft.revision,
      state: "fetching",
      snapshot: null,
      message: null,
    };
    expect(state(draft, snapshot, "fetching")).toBe("fetching");
  });
});
