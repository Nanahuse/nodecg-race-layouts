import { describe, expect, it } from "vitest";

import type { DraftConfig, DraftPerson } from "../src/domain";
import {
  buildActiveConfig,
  buildActiveSpeedrunSnapshot,
  ActiveConfigBuildError,
} from "../src/extension/application/active-config-builder";
import { createDefaultDraftSpeedrunSnapshot } from "../src/replicants/defaults";
import { makeDraftPerson, makeParticipantDraft } from "./support/draft-fakes";

function readyDraft(): DraftConfig {
  const persons = Object.fromEntries(
    [1, 2, 3, 4].map((index) => [`p${index}`, makeDraftPerson(`p${index}`, `rt-p${index}`)]),
  ) as Record<string, DraftPerson>;
  const draft = makeParticipantDraft({
    persons,
    participants: [1, 2, 3, 4].map((index) => ({
      racetimeUserId: `rt-p${index}`,
      personRef: `p${index}`,
    })),
  });
  draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" };
  return draft;
}

describe("buildActiveConfig", () => {
  it("builds a complete active config", () => {
    const result = buildActiveConfig(readyDraft(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.config;
    expect(config.revision).toBe(1);
    expect(config.race?.raceId).toBe("ootr/race-a");
    expect(config.participants.map((p) => p.playerId)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(Object.keys(config.players).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(config.raceScreenSlots).toEqual({ 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" });
    expect(config.categorySelection).not.toHaveProperty("source");
    expect(config.categorySelection).not.toHaveProperty("savedMappingState");
    expect(config.categoryPresentation).toBeNull();
  });

  it("keeps participant order", () => {
    const draft = readyDraft();
    draft.participants = [...draft.participants].reverse();
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.participants.map((p) => p.racetimeUserId)).toEqual([
        "rt-p4",
        "rt-p3",
        "rt-p2",
        "rt-p1",
      ]);
    }
  });

  it("includes only referenced players", () => {
    const draft = readyDraft();
    draft.persons["unused"] = makeDraftPerson("unused");
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.players["unused"]).toBeUndefined();
    }
  });

  it("includes a commentator-only player", () => {
    const draft = readyDraft();
    draft.commentators["commentator"] = makeDraftPerson("commentator").player!;
    draft.commentatorPlayerIds = ["commentator"];
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.players["commentator"]).toBeDefined();
      expect(result.config.commentatorPlayerIds).toEqual(["commentator"]);
    }
  });

  it("copies a non-null presentation", () => {
    const draft = readyDraft();
    draft.categoryPresentation = {
      title: "Any%",
      subtitle: null,
      ruleHeading: "Rules",
      ruleLines: ["one"],
      leaderboardHeading: "Leaderboard",
    };
    const result = buildActiveConfig(draft, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.categoryPresentation?.title).toBe("Any%");
    }
  });

  it("rejects unresolved identities", () => {
    const draft = readyDraft();
    draft.persons["p1"] = makeDraftPerson("p1", "rt-p1", "ambiguous");
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("participant_unresolved");
    }
  });

  it("rejects an unmapped participant", () => {
    const draft = readyDraft();
    draft.persons["p1"] = makeDraftPerson("p1", "rt-p1", "unresolved");
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("participant_unresolved");
    }
  });

  it("builds an active config with unassigned slots", () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: null };
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.raceScreenSlots).toEqual(draft.raceScreenSlots);
  });

  it("isolates the active config from later draft mutation", () => {
    const draft = readyDraft();
    const result = buildActiveConfig(draft, 1);
    if (!result.ok) throw new Error("expected ok");
    const before = structuredClone(result.config);
    draft.persons["p1"] = makeDraftPerson("p1", "rt-p1", "unresolved");
    draft.raceScreenSlots[1] = null;
    draft.categoryPresentation = null;
    expect(result.config).toEqual(before);
  });
});

describe("buildActiveSpeedrunSnapshot", () => {
  it("throws when the draft snapshot is not ready", () => {
    expect(() => buildActiveSpeedrunSnapshot(createDefaultDraftSpeedrunSnapshot(), 1)).toThrow(
      ActiveConfigBuildError,
    );
  });

  it("copies the snapshot and stamps the active revision", () => {
    const snapshot = {
      snapshotId: "s1",
      fetchedAt: "2026-09-21T05:30:00.000Z",
      leaderboardKey: {
        gameId: "g",
        categoryId: "c",
        levelId: null,
        variables: {},
        platformId: null,
        regionId: null,
        emulator: null,
        timingMethod: null,
      },
      worldRecord: null,
      leaderboard: [],
      personalBests: {},
    };
    const active = buildActiveSpeedrunSnapshot(
      { draftRevision: 5, state: "ready", snapshot, message: null },
      3,
    );
    expect(active.activeRevision).toBe(3);
    expect(active.snapshot.snapshotId).toBe("s1");
    expect(active.snapshot).not.toBe(snapshot);
  });
});
