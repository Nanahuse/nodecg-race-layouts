import { describe, expect, it } from "vitest";

import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  PlayerMapping,
} from "../src/domain";
import { leaderboardKeyFromSelection } from "../src/domain";
import { RacePresentationDraftService } from "../src/extension/application/race-presentation-draft-service";
import {
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../src/replicants/defaults";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

const REVISION = 10;

function linkedPlayer(playerId: string) {
  return makeDraftPlayer(playerId, {
    speedrunCom: {
      state: "linked" as const,
      value: { userId: `src-${playerId}`, name: `Player ${playerId}`, twitchLogin: null },
      source: "manual" as const,
    },
    twitch: { state: "none" as const, source: "manual" as const },
  });
}

function fourPlayerDraft(): DraftConfig {
  const players = Object.fromEntries(
    [1, 2, 3, 4].map((index) => [`p${index}`, linkedPlayer(`p${index}`)]),
  );
  const draft = makeParticipantDraft({
    players,
    participants: [1, 2, 3, 4].map((index) => ({
      racetimeUserId: `rt-p${index}`,
      playerId: `p${index}`,
    })),
    revision: REVISION,
  });
  draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p2", 3: "rt-p3", 4: "rt-p4" };
  return draft;
}

function makeDirectoryPlayer(
  playerId: string,
  overrides: Partial<PlayerMapping> = {},
): PlayerMapping {
  return {
    playerId,
    manualDisplayName: null,
    racetime: { state: "none" },
    speedrunCom: { state: "none" },
    twitch: { state: "none" },
    ...overrides,
  };
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

function setup(options: { draft?: DraftConfig; directory?: PlayerDirectory } = {}) {
  const draft = options.draft ?? fourPlayerDraft();
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );
  const draftConfig = new TrackingReplicant<DraftConfig>("draft-config", draft, []);
  const draftSpeedrunSnapshot = new TrackingReplicant<DraftSpeedrunSnapshot>(
    "draft-speedrun-snapshot",
    createDefaultDraftSpeedrunSnapshot(),
    [],
  );
  const playerDirectory = new TrackingReplicant<PlayerDirectory>(
    "player-directory",
    options.directory ?? {},
    [],
  );
  const fakeLogger = createFakeLogger();
  const service = new RacePresentationDraftService({
    draftConfig,
    draftSpeedrunSnapshot,
    playerDirectory,
    integrationStatus,
    log: fakeLogger.logger,
  });
  return {
    service,
    draftConfig,
    draftSpeedrunSnapshot,
    playerDirectory,
    integrationStatus,
    fakeLogger,
  };
}

describe("RacePresentationDraftService.setSlots", () => {
  it("sets four slots and retags the snapshot", async () => {
    const draft = fourPlayerDraft();
    draft.raceScreenSlots = { 1: null, 2: null, 3: null, 4: null };
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    draftSpeedrunSnapshot.value = readySnapshot(draft);

    const result = await service.setSlots(REVISION, {
      1: "rt-p1",
      2: "rt-p2",
      3: "rt-p3",
      4: "rt-p4",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draftRevision).toBe(11);
    expect(draftConfig.value.raceScreenSlots).toEqual({
      1: "rt-p1",
      2: "rt-p2",
      3: "rt-p3",
      4: "rt-p4",
    });
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(11);
  });

  it("allows null slots but is not ready", async () => {
    const { service, draftConfig, integrationStatus } = setup();
    const result = await service.setSlots(REVISION, {
      1: "rt-p1",
      2: "rt-p2",
      3: "rt-p3",
      4: null,
    });
    expect(result.ok).toBe(true);
    expect(draftConfig.value.raceScreenSlots[4]).toBeNull();
    expect(integrationStatus.value.broadcast.state).not.toBe("ready");
  });

  it("rejects an unknown participant", async () => {
    const { service, draftConfig } = setup();
    const before = draftConfig.value;
    const result = await service.setSlots(REVISION, {
      1: "rt-unknown",
      2: "rt-p2",
      3: "rt-p3",
      4: "rt-p4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("slot_unknown_participant");
    expect(draftConfig.value).toBe(before);
  });

  it("rejects duplicate slots", async () => {
    const { service } = setup();
    const result = await service.setSlots(REVISION, {
      1: "rt-p1",
      2: "rt-p1",
      3: "rt-p3",
      4: "rt-p4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("duplicate_slot");
  });

  it("swaps two slots atomically", async () => {
    const { service, draftConfig } = setup();
    const result = await service.setSlots(REVISION, {
      1: "rt-p2",
      2: "rt-p1",
      3: "rt-p3",
      4: "rt-p4",
    });
    expect(result.ok).toBe(true);
    expect(draftConfig.value.raceScreenSlots).toMatchObject({ 1: "rt-p2", 2: "rt-p1" });
  });

  it("is a no-op for identical slots", async () => {
    const draft = fourPlayerDraft();
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    const snapshot = readySnapshot(draft);
    draftSpeedrunSnapshot.value = snapshot;

    const result = await service.setSlots(REVISION, {
      1: "rt-p1",
      2: "rt-p2",
      3: "rt-p3",
      4: "rt-p4",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(false);
    expect(draftConfig.value.revision).toBe(REVISION);
    expect(draftSpeedrunSnapshot.value).toBe(snapshot);
  });

  it("rejects a malformed slots object", async () => {
    const { service } = setup();
    const result = await service.setSlots(REVISION, { 1: "rt-p1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_slots");
  });

  it("rejects a revision mismatch", async () => {
    const { service } = setup();
    const result = await service.setSlots(99, {
      1: "rt-p1",
      2: "rt-p2",
      3: "rt-p3",
      4: "rt-p4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_changed");
  });
});

describe("RacePresentationDraftService.setCommentators", () => {
  it("accepts zero commentators", async () => {
    const { service, draftConfig } = setup();
    const result = await service.setCommentators(REVISION, []);
    expect(result.ok).toBe(true);
    expect(draftConfig.value.commentatorPlayerIds).toEqual([]);
  });

  it("preserves commentator order", async () => {
    const { service, draftConfig } = setup();
    const result = await service.setCommentators(REVISION, ["p3", "p1", "p2"]);
    expect(result.ok).toBe(true);
    expect(draftConfig.value.commentatorPlayerIds).toEqual(["p3", "p1", "p2"]);
  });

  it("rejects more than three commentators", async () => {
    const { service } = setup();
    const result = await service.setCommentators(REVISION, ["p1", "p2", "p3", "p4"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_commentators");
  });

  it("rejects duplicate commentators", async () => {
    const { service } = setup();
    const result = await service.setCommentators(REVISION, ["p1", "p1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("duplicate_commentator");
  });

  it("rejects an unknown player", async () => {
    const { service } = setup();
    const result = await service.setCommentators(REVISION, ["ghost"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("player_not_found");
  });

  it("imports a persistent player from the directory", async () => {
    const directoryPlayer = makeDirectoryPlayer("dir-1", {
      speedrunCom: {
        state: "linked",
        value: { userId: "src-dir", name: "Director", twitchLogin: "director" },
      },
      twitch: { state: "linked", value: { userId: null, login: "director" } },
    });
    const { service, draftConfig } = setup({ directory: { "dir-1": directoryPlayer } });

    const result = await service.setCommentators(REVISION, ["dir-1"]);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.commentatorPlayerIds).toEqual(["dir-1"]);
    expect(draftConfig.value.players["dir-1"]?.speedrunCom.state).toBe("linked");
    expect(draftConfig.value.players["dir-1"]?.racetime.state).toBe("none");
  });

  it("allows a participant player as commentator without duplicating it", async () => {
    const { service, draftConfig } = setup();
    const result = await service.setCommentators(REVISION, ["p1"]);
    expect(result.ok).toBe(true);
    expect(draftConfig.value.commentatorPlayerIds).toEqual(["p1"]);
    expect(Object.keys(draftConfig.value.players)).toHaveLength(4);
  });

  it("prunes a commentator-only player on removal but keeps participant players", async () => {
    const directoryPlayer = makeDirectoryPlayer("dir-1", {
      manualDisplayName: "Director",
    });
    const { service, draftConfig } = setup({ directory: { "dir-1": directoryPlayer } });

    await service.setCommentators(REVISION, ["dir-1", "p1"]);
    expect(draftConfig.value.players["dir-1"]).toBeDefined();

    await service.setCommentators(draftConfig.value.revision, ["p1"]);
    expect(draftConfig.value.players["dir-1"]).toBeUndefined();
    expect(draftConfig.value.players["p1"]).toBeDefined();
  });

  it("retags the snapshot and keeps ready with valid commentators", async () => {
    const draft = fourPlayerDraft();
    const { service, draftSpeedrunSnapshot, integrationStatus } = setup({ draft });
    draftSpeedrunSnapshot.value = readySnapshot(draft);
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "ready", draftRevision: REVISION },
    };

    const result = await service.setCommentators(REVISION, ["p1", "p2"]);

    expect(result.ok).toBe(true);
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(11);
    expect(integrationStatus.value.broadcast.state).toBe("ready");
  });

  it("becomes resolution_required for an unresolved commentator", async () => {
    const draft = fourPlayerDraft();
    draft.players["temp"] = makeDraftPlayer("temp");
    const { service, draftConfig, integrationStatus } = setup({ draft });

    await service.setCommentators(REVISION, ["temp"]);

    expect(draftConfig.value.commentatorPlayerIds).toEqual(["temp"]);
    expect(integrationStatus.value.broadcast.state).toBe("resolution_required");
  });
});
