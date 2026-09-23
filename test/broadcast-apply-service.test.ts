import { describe, expect, it } from "vitest";

import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
} from "../src/domain";
import { leaderboardKeyFromSelection } from "../src/domain";
import { BroadcastApplyService } from "../src/extension/application/broadcast-apply-service";
import type {
  RaceSessionLoadResult,
  RaceSessionService,
} from "../src/extension/application/race-session-service";
import {
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import { deferred } from "./support/speedrun-fakes";

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

function readyDraft(): DraftConfig {
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

function nodecgProxy<T>(value: T): T {
  if (Array.isArray(value)) {
    return new Proxy(value.map(nodecgProxy), {});
  }
  if (typeof value === "object" && value !== null) {
    const detached = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, nodecgProxy(child)]),
    );
    return new Proxy(detached, {} as ProxyHandler<typeof detached>) as T;
  }
  return value;
}

class FakeRaceSessions {
  readonly calls: { role: string; url: string }[] = [];
  result: RaceSessionLoadResult = { ok: true, session: createDefaultRaceSession() };
  pending: Promise<RaceSessionLoadResult> | null = null;

  async loadRace(role: string, url: string): Promise<RaceSessionLoadResult> {
    this.calls.push({ role, url });
    if (this.pending) {
      return this.pending;
    }
    return this.result;
  }
}

function setup(
  options: {
    draft?: DraftConfig;
    snapshot?: DraftSpeedrunSnapshot;
    activeConfig?: ActiveConfig | null;
    activeSnapshot?: ActiveSpeedrunSnapshot | null;
    raceSessions?: FakeRaceSessions;
  } = {},
) {
  const draft = options.draft ?? readyDraft();
  const snapshot = options.snapshot ?? readySnapshot(draft);
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );
  const draftConfig = new TrackingReplicant<DraftConfig>("draft-config", draft, []);
  const draftSpeedrunSnapshot = new TrackingReplicant<DraftSpeedrunSnapshot>(
    "draft-speedrun-snapshot",
    snapshot,
    [],
  );
  const activeConfig = new TrackingReplicant<ActiveConfig | null>(
    "active-config",
    options.activeConfig ?? null,
    [],
  );
  const activeSpeedrunSnapshot = new TrackingReplicant<ActiveSpeedrunSnapshot | null>(
    "active-speedrun-snapshot",
    options.activeSnapshot ?? null,
    [],
  );
  const playerDirectory = new TrackingReplicant<PlayerDirectory>("player-directory", {}, []);
  const raceSessions = options.raceSessions ?? new FakeRaceSessions();
  const fakeLogger = createFakeLogger();
  const service = new BroadcastApplyService({
    raceSessions: raceSessions as unknown as RaceSessionService,
    draftConfig,
    activeConfig,
    draftSpeedrunSnapshot,
    activeSpeedrunSnapshot,
    integrationStatus,
    log: fakeLogger.logger,
  });
  return {
    service,
    raceSessions,
    draftConfig,
    draftSpeedrunSnapshot,
    activeConfig,
    activeSpeedrunSnapshot,
    integrationStatus,
    playerDirectory,
    fakeLogger,
  };
}

describe("BroadcastApplyService success", () => {
  it("applies values read from NodeCG proxied Replicants", async () => {
    const draft = readyDraft();
    const snapshot = readySnapshot(draft);
    const { service, activeConfig, activeSpeedrunSnapshot } = setup({
      draft: nodecgProxy(draft),
      snapshot: nodecgProxy(snapshot),
    });

    const result = await service.apply(REVISION);

    expect(result.ok).toBe(true);
    expect(activeConfig.value?.revision).toBe(1);
    expect(activeSpeedrunSnapshot.value?.activeRevision).toBe(1);
  });

  it("promotes a ready draft to active revision 1", async () => {
    const { service, raceSessions, activeConfig, activeSpeedrunSnapshot } = setup();

    const result = await service.apply(REVISION);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedDraftRevision).toBe(REVISION);
      expect(result.activeRevision).toBe(1);
      expect(result.raceId).toBe("ootr/race-a");
      expect(result.snapshotId).toBe("s1");
    }
    expect(activeConfig.value?.revision).toBe(1);
    expect(activeSpeedrunSnapshot.value?.activeRevision).toBe(1);
    expect(raceSessions.calls).toEqual([
      { role: "active", url: "https://racetime.gg/ootr/race-a" },
    ]);
  });

  it("increments the active revision independently of the draft", async () => {
    const draft = readyDraft();
    const { service, activeConfig, activeSpeedrunSnapshot } = setup({
      draft,
      activeConfig: { ...readyActivePlaceholder(), revision: 4 },
      activeSnapshot: { activeRevision: 4, snapshot: readySnapshot(draft).snapshot! },
    });

    const result = await service.apply(REVISION);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.activeRevision).toBe(5);
    expect(activeConfig.value?.revision).toBe(5);
    expect(activeSpeedrunSnapshot.value?.activeRevision).toBe(5);
  });

  it("does not change the draft or player directory", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot, playerDirectory } = setup();
    const draftBefore = draftConfig.value;
    const snapshotBefore = draftSpeedrunSnapshot.value;

    await service.apply(REVISION);

    expect(draftConfig.value).toBe(draftBefore);
    expect(draftSpeedrunSnapshot.value).toBe(snapshotBefore);
    expect(playerDirectory.value).toEqual({});
  });

  it("keeps ready status and records the active revision", async () => {
    const { service, integrationStatus } = setup();
    await service.apply(REVISION);
    expect(integrationStatus.value.broadcast.state).toBe("ready");
    expect(integrationStatus.value.broadcast.activeRevision).toBe(1);
  });
});

function readyActivePlaceholder(): ActiveConfig {
  return {
    revision: 0,
    race: {
      canonicalUrl: "x",
      raceId: "x",
      categorySlug: "x",
      categoryName: "x",
      goal: "x",
    },
    participants: [],
    players: {},
    raceScreenSlots: { 1: "a", 2: "b", 3: "c", 4: "d" },
    commentatorPlayerIds: [],
    categorySelection: {
      gameId: "g",
      gameName: "G",
      categoryId: "c",
      categoryName: "C",
      levelId: null,
      variables: {},
      platformId: null,
      regionId: null,
      emulator: null,
      timingMethod: null,
    },
    categoryPresentation: null,
  };
}

describe("BroadcastApplyService validation", () => {
  it("rejects a revision mismatch", async () => {
    const { service, activeConfig } = setup();
    const result = await service.apply(99);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_changed");
    expect(activeConfig.value).toBeNull();
  });

  it("rejects a draft that is not ready", async () => {
    const draft = readyDraft();
    draft.raceScreenSlots = { 1: "rt-p1", 2: "rt-p1", 3: "rt-p3", 4: "rt-p4" };
    const { service } = setup({ draft, snapshot: readySnapshot(readyDraft()) });
    const result = await service.apply(REVISION);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_not_ready");
  });

  it("rejects unresolved identities", async () => {
    const draft = readyDraft();
    draft.players["p1"] = makeDraftPlayer("p1");
    const { service } = setup({ draft, snapshot: readySnapshot(readyDraft()) });
    const result = await service.apply(REVISION);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_not_ready");
  });

  it("rejects an incompatible snapshot", async () => {
    const draft = readyDraft();
    const badSnapshot: DraftSpeedrunSnapshot = {
      draftRevision: draft.revision,
      state: "ready",
      snapshot: {
        ...readySnapshot(draft).snapshot!,
        leaderboardKey: { ...readySnapshot(draft).snapshot!.leaderboardKey, gameId: "other" },
      },
      message: null,
    };
    const { service } = setup({ draft, snapshot: badSnapshot });
    const result = await service.apply(REVISION);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("snapshot_not_ready");
  });

  it("rejects a snapshot with a stale revision", async () => {
    const draft = readyDraft();
    const stale: DraftSpeedrunSnapshot = { ...readySnapshot(draft), draftRevision: 9 };
    const { service } = setup({ draft, snapshot: stale });
    const result = await service.apply(REVISION);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("snapshot_not_ready");
  });

  it("rejects an empty snapshot", async () => {
    const draft = readyDraft();
    const { service } = setup({ draft, snapshot: createDefaultDraftSpeedrunSnapshot() });
    const result = await service.apply(REVISION);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("snapshot_not_ready");
  });
});

describe("BroadcastApplyService active race load", () => {
  it("fails without changing the existing active state", async () => {
    const draft = readyDraft();
    const raceSessions = new FakeRaceSessions();
    raceSessions.result = { ok: false, reason: "not_found", message: "nope" };
    const { service, activeConfig, activeSpeedrunSnapshot, integrationStatus } = setup({
      draft,
      raceSessions,
      activeConfig: { ...readyActivePlaceholder(), revision: 4 },
      activeSnapshot: { activeRevision: 4, snapshot: readySnapshot(draft).snapshot! },
    });

    const result = await service.apply(REVISION);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("active_race_load_failed");
    expect(activeConfig.value?.revision).toBe(4);
    expect(activeSpeedrunSnapshot.value?.activeRevision).toBe(4);
    expect(integrationStatus.value.broadcast.state).toBe("error");
    expect(integrationStatus.value.broadcast.message).toContain("Active RaceTime load failed");
  });

  it("allows a retry after a failure", async () => {
    const raceSessions = new FakeRaceSessions();
    raceSessions.result = { ok: false, reason: "timeout", message: "slow" };
    const { service, activeConfig } = setup({ raceSessions });

    const first = await service.apply(REVISION);
    expect(first.ok).toBe(false);

    raceSessions.result = { ok: true, session: createDefaultRaceSession() };
    const second = await service.apply(REVISION);
    expect(second.ok).toBe(true);
    expect(activeConfig.value?.revision).toBe(1);
  });
});

describe("BroadcastApplyService freeze semantics", () => {
  it("applies the frozen draft even if the draft changes during the load", async () => {
    const raceSessions = new FakeRaceSessions();
    const pending = deferred<RaceSessionLoadResult>();
    raceSessions.pending = pending.promise;
    const { service, draftConfig, activeConfig } = setup({ raceSessions });

    const promise = service.apply(REVISION);
    draftConfig.value = { ...draftConfig.value, revision: 11 };
    pending.resolve({ ok: true, session: createDefaultRaceSession() });
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.appliedDraftRevision).toBe(REVISION);
    expect(activeConfig.value?.revision).toBe(1);
    expect(activeConfig.value?.race?.raceId).toBe("ootr/race-a");
    expect(draftConfig.value.revision).toBe(11);
  });

  it("reports applying during the active race load", async () => {
    const raceSessions = new FakeRaceSessions();
    const pending = deferred<RaceSessionLoadResult>();
    raceSessions.pending = pending.promise;
    const { service, integrationStatus } = setup({ raceSessions });

    const promise = service.apply(REVISION);
    expect(integrationStatus.value.broadcast.state).toBe("applying");
    pending.resolve({ ok: true, session: createDefaultRaceSession() });
    await promise;
  });

  it("isolates the active state from later draft mutation", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot, activeConfig, activeSpeedrunSnapshot } =
      setup();
    await service.apply(REVISION);
    const activeConfigBefore = activeConfig.value;
    const activeSnapshotBefore = activeSpeedrunSnapshot.value;

    draftConfig.value = {
      ...draftConfig.value,
      revision: 11,
      raceScreenSlots: { 1: null, 2: null, 3: null, 4: null },
    };
    draftSpeedrunSnapshot.value = createDefaultDraftSpeedrunSnapshot();

    expect(activeConfig.value).toBe(activeConfigBefore);
    expect(activeSpeedrunSnapshot.value).toBe(activeSnapshotBefore);
  });

  it("serializes concurrent applies", async () => {
    const raceSessions = new FakeRaceSessions();
    const pending = deferred<RaceSessionLoadResult>();
    raceSessions.pending = pending.promise;
    const { service, activeConfig } = setup({ raceSessions });

    const first = service.apply(REVISION);
    const second = await service.apply(REVISION);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("apply_in_progress");

    pending.resolve({ ok: true, session: createDefaultRaceSession() });
    await first;
    expect(activeConfig.value?.revision).toBe(1);
  });

  it("recomputes dirty when the draft changed during apply", async () => {
    const raceSessions = new FakeRaceSessions();
    const pending = deferred<RaceSessionLoadResult>();
    raceSessions.pending = pending.promise;
    const { service, draftConfig, draftSpeedrunSnapshot, integrationStatus } = setup({
      raceSessions,
    });

    const promise = service.apply(REVISION);
    draftConfig.value = { ...draftConfig.value, revision: 11 };
    draftSpeedrunSnapshot.value = createDefaultDraftSpeedrunSnapshot();
    pending.resolve({ ok: true, session: createDefaultRaceSession() });
    await promise;

    expect(integrationStatus.value.broadcast.state).toBe("dirty");
    expect(integrationStatus.value.broadcast.activeRevision).toBe(1);
  });

  it("preserves reconciliation_required during apply", async () => {
    const raceSessions = new FakeRaceSessions();
    const pending = deferred<RaceSessionLoadResult>();
    raceSessions.pending = pending.promise;
    const { service, integrationStatus } = setup({ raceSessions });

    const promise = service.apply(REVISION);
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "reconciliation_required" },
    };
    pending.resolve({ ok: true, session: createDefaultRaceSession() });
    await promise;

    expect(integrationStatus.value.broadcast.state).toBe("reconciliation_required");
  });
});
