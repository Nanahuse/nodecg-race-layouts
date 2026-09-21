import { describe, expect, it } from "vitest";

import type {
  DraftConfig,
  DraftPlayer,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
} from "../src/domain";
import { leaderboardKeyFromSelection } from "../src/domain";
import { SpeedrunSnapshotService } from "../src/extension/application/speedrun-snapshot-service";
import { SpeedrunOperationStatusCoordinator } from "../src/extension/application/speedrun-status-coordinator";
import {
  SpeedrunComNetworkError,
  SpeedrunComRateLimitedError,
} from "../src/extension/integrations/speedruncom/errors";
import type { SpeedrunLeaderboard } from "../src/extension/integrations/speedruncom/leaderboard";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../src/replicants/defaults";
import { makeSelection } from "./support/category-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import {
  FakeSpeedrunComClient,
  deferred,
  makeLeaderboard,
  makeLeaderboardEntry,
  makePersonalBestEntry,
} from "./support/speedrun-fakes";

function makeDraftPlayer(
  playerId: string,
  userId: string,
  overrides: Partial<DraftPlayer> = {},
): DraftPlayer {
  return {
    playerId,
    manualDisplayName: null,
    racetime: {
      state: "linked",
      value: { userId: `rt-${playerId}`, name: "One", twitchLogin: null },
      source: "racetime",
    },
    speedrunCom: {
      state: "linked",
      value: { userId, name: "Runner One", twitchLogin: null },
      source: "spreadsheet",
    },
    twitch: { state: "linked", value: { userId: null, login: "one" }, source: "spreadsheet" },
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DraftConfig> = {}): DraftConfig {
  const base = createDefaultDraftConfig();
  return {
    ...base,
    revision: 10,
    race: {
      canonicalUrl: "https://racetime.gg/ootr/race-a",
      raceId: "ootr/race-a",
      categorySlug: "ootr",
      categoryName: "OOTR",
      goal: "Defeat Ganon",
    },
    participants: [{ racetimeUserId: "rt-p1", playerId: "p1" }],
    players: { p1: makeDraftPlayer("p1", "user-1") },
    categorySelection: { selection: makeSelection(), source: "manual", savedMappingState: "none" },
    ...overrides,
  };
}

function matchingLeaderboard(
  draft: DraftConfig,
  entries = [makeLeaderboardEntry()],
): SpeedrunLeaderboard {
  const selection = draft.categorySelection.selection;
  if (!selection) throw new Error("draft has no selection");
  return makeLeaderboard({
    gameId: selection.gameId,
    categoryId: selection.categoryId,
    levelId: selection.levelId,
    platformId: selection.platformId,
    regionId: selection.regionId,
    emulator: selection.emulator,
    timingMethod: selection.timingMethod,
    variables: selection.variables,
    entries,
  });
}

function setup(options: { draft?: DraftConfig; pbConcurrency?: number } = {}) {
  const draft = options.draft ?? makeDraft();
  const client = new FakeSpeedrunComClient();
  client.leaderboardResult = draft.categorySelection.selection
    ? matchingLeaderboard(draft)
    : makeLeaderboard();

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
  const fakeLogger = createFakeLogger();
  const status = new SpeedrunOperationStatusCoordinator({
    integrationStatus,
    log: fakeLogger.logger,
  });
  const service = new SpeedrunSnapshotService({
    client,
    status,
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    log: fakeLogger.logger,
    snapshotIdFactory: () => "snapshot-1",
    clock: () => new Date("2026-09-21T05:30:00.000Z"),
    pbConcurrency: options.pbConcurrency,
  });

  return {
    service,
    client,
    integrationStatus,
    draftConfig,
    draftSpeedrunSnapshot,
    fakeLogger,
    status,
  };
}

describe("SpeedrunSnapshotService.refresh validation", () => {
  it("rejects when no race is loaded", async () => {
    const { service } = setup({ draft: makeDraft({ race: null }) });
    const result = await service.refresh(10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_race_loaded");
  });

  it("rejects without a category selection", async () => {
    const { service } = setup({
      draft: makeDraft({
        categorySelection: { selection: null, source: null, savedMappingState: "none" },
      }),
    });
    const result = await service.refresh(10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("category_not_selected");
  });

  it("rejects a revision mismatch", async () => {
    const { service } = setup();
    const result = await service.refresh(99);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_changed");
  });

  it("rejects unresolved players", async () => {
    const { service } = setup({
      draft: makeDraft({
        players: { p1: makeDraftPlayer("p1", "user-1", { speedrunCom: { state: "unresolved" } }) },
      }),
    });
    const result = await service.refresh(10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("resolution_required");
  });
});

describe("SpeedrunSnapshotService.refresh success", () => {
  it("builds a ready snapshot and reuses the top20 entry for a participant PB", async () => {
    const draft = makeDraft();
    const { service, client, draftSpeedrunSnapshot, integrationStatus } = setup({ draft });

    const result = await service.refresh(10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshotId).toBe("snapshot-1");
      expect(result.leaderboardEntries).toBe(1);
      expect(result.participantPbCount).toBe(1);
      expect(result.participantPbFailures).toBe(0);
    }
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.snapshot?.fetchedAt).toBe("2026-09-21T05:30:00.000Z");
    expect(draftSpeedrunSnapshot.value.snapshot?.leaderboardKey).toEqual(
      leaderboardKeyFromSelection(draft.categorySelection.selection!),
    );
    expect(draftSpeedrunSnapshot.value.snapshot?.personalBests["user-1"]).toEqual({
      timeSeconds: 3600,
      formattedTime: "1:00:00.000",
      rank: 1,
    });
    // Snapshot is ready, but the draft has no race screen slots yet, so the
    // broadcast stays dirty until the slots are set.
    expect(integrationStatus.value.broadcast.state).toBe("dirty");
    expect(client.calls).not.toContain("getUserPersonalBests");
  });

  it("fetches a personal best outside the top20 with a safe rank", async () => {
    const selection = makeSelection({ timingMethod: null });
    const draft = makeDraft({
      categorySelection: { selection, source: "manual", savedMappingState: "none" },
    });
    const { service, client, draftSpeedrunSnapshot } = setup({ draft });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    client.personalBestsHandler = async () => [
      makePersonalBestEntry({
        gameId: selection.gameId,
        categoryId: selection.categoryId,
        place: 5,
      }),
    ];

    const result = await service.refresh(10);

    expect(result.ok).toBe(true);
    expect(client.calls).toContain("getUserPersonalBests");
    expect(draftSpeedrunSnapshot.value.snapshot?.personalBests["user-1"]).toEqual({
      timeSeconds: 3600,
      formattedTime: "1:00:00.000",
      rank: 5,
    });
  });

  it("sets rank to null when the leaderboard is filtered", async () => {
    const draft = makeDraft();
    const { service, client, draftSpeedrunSnapshot } = setup({ draft });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    client.personalBestsHandler = async () => [
      makePersonalBestEntry({ gameId: "j1l9qz1g", categoryId: "7dgrrxk4", place: 5 }),
    ];

    await service.refresh(10);

    expect(draftSpeedrunSnapshot.value.snapshot?.personalBests["user-1"]?.rank).toBeNull();
  });

  it("stores null when no personal best matches", async () => {
    const draft = makeDraft();
    const { service, client, draftSpeedrunSnapshot } = setup({ draft });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    client.personalBestsHandler = async () => [makePersonalBestEntry({ categoryId: "different" })];

    await service.refresh(10);

    expect(draftSpeedrunSnapshot.value.snapshot?.personalBests["user-1"]).toBeNull();
  });

  it("excludes multi-player runs but keeps them as world record holders", async () => {
    const draft = makeDraft();
    const { service, client, draftSpeedrunSnapshot } = setup({ draft });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({
        place: 1,
        players: [
          { userId: "a", name: "A" },
          { userId: "b", name: "B" },
        ],
      }),
      makeLeaderboardEntry({ place: 2, players: [{ userId: "c", name: "C" }] }),
    ]);

    await service.refresh(10);

    expect(draftSpeedrunSnapshot.value.snapshot?.leaderboard).toHaveLength(1);
    expect(draftSpeedrunSnapshot.value.snapshot?.worldRecord?.holders).toHaveLength(2);
    expect(draftSpeedrunSnapshot.value.message).toContain("multi-player");
  });
});

describe("SpeedrunSnapshotService failure handling", () => {
  it("marks the snapshot as error when the leaderboard fails", async () => {
    const { service, client, draftSpeedrunSnapshot } = setup();
    client.leaderboardError = new SpeedrunComNetworkError("down");

    const result = await service.refresh(10);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("leaderboard_fetch_failed");
    expect(draftSpeedrunSnapshot.value.state).toBe("error");
    expect(draftSpeedrunSnapshot.value.snapshot).toBeNull();
  });

  it("marks the snapshot as error when the leaderboard response does not match", async () => {
    const { service, client, draftSpeedrunSnapshot } = setup();
    client.leaderboardResult = makeLeaderboard({ gameId: "other" });

    const result = await service.refresh(10);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("leaderboard_fetch_failed");
    expect(draftSpeedrunSnapshot.value.state).toBe("error");
  });

  it("marks the snapshot as error on a leaderboard 429", async () => {
    const { service, client, draftSpeedrunSnapshot } = setup();
    client.leaderboardError = new SpeedrunComRateLimitedError("slow down", 1000);

    const result = await service.refresh(10);

    expect(result.ok).toBe(false);
    expect(draftSpeedrunSnapshot.value.state).toBe("error");
  });

  it("stays ready when a single personal best fails", async () => {
    const draft = makeDraft();
    const { service, client, draftSpeedrunSnapshot } = setup({ draft });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    client.personalBestsHandler = async () => {
      throw new SpeedrunComNetworkError("pb down");
    };

    const result = await service.refresh(10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.participantPbFailures).toBe(1);
    }
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.snapshot?.personalBests["user-1"]).toBeNull();
    expect(draftSpeedrunSnapshot.value.message).toContain("PB lookup failed");
  });

  it("stops fetching personal bests after a 429", async () => {
    const draft = makeDraft({
      participants: [
        { racetimeUserId: "rt-p1", playerId: "p1" },
        { racetimeUserId: "rt-p2", playerId: "p2" },
      ],
      players: {
        p1: makeDraftPlayer("p1", "user-1"),
        p2: makeDraftPlayer("p2", "user-2"),
      },
    });
    const { service, client, draftSpeedrunSnapshot } = setup({ draft, pbConcurrency: 1 });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    let handlerCalls = 0;
    client.personalBestsHandler = async () => {
      handlerCalls += 1;
      throw new SpeedrunComRateLimitedError("slow down", 1000);
    };

    const result = await service.refresh(10);

    expect(result.ok).toBe(true);
    expect(handlerCalls).toBe(1);
    if (result.ok) {
      expect(result.participantPbFailures).toBe(2);
    }
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
  });
});

describe("SpeedrunSnapshotService concurrency and revision race", () => {
  it("bounds personal best concurrency", async () => {
    const draft = makeDraft({
      participants: [1, 2, 3, 4].map((index) => ({
        racetimeUserId: `rt-p${index}`,
        playerId: `p${index}`,
      })),
      players: Object.fromEntries(
        [1, 2, 3, 4].map((index) => [`p${index}`, makeDraftPlayer(`p${index}`, `user-${index}`)]),
      ),
    });
    const { service, client } = setup({ draft, pbConcurrency: 2 });
    client.leaderboardResult = matchingLeaderboard(draft, [
      makeLeaderboardEntry({ place: 1, players: [{ userId: "other", name: "Other" }] }),
    ]);
    let active = 0;
    let maxActive = 0;
    client.personalBestsHandler = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return [];
    };

    await service.refresh(10);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("does not commit a snapshot when the draft revision changed", async () => {
    const draft = makeDraft();
    const { service, client, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    const pending = deferred<SpeedrunLeaderboard>();
    client.leaderboardPromise = pending.promise;

    const promise = service.refresh(10);
    draftConfig.value = { ...draft, revision: 11 };
    pending.resolve(matchingLeaderboard(draft));
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_changed");
    expect(draftSpeedrunSnapshot.value.state).not.toBe("ready");
  });
});
