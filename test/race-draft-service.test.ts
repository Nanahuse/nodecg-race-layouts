import { describe, expect, it } from "vitest";

import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../src/domain";
import { RaceDraftService } from "../src/extension/application/race-draft-service";
import { RaceSessionService } from "../src/extension/application/race-session-service";
import type { CategoryPresetProvider } from "../src/extension/application/category-preset-provider";
import type { PlayerIdFactory } from "../src/extension/application/player-resolution-service";
import {
  RaceNotFoundError,
  RaceTimeNetworkError,
} from "../src/extension/integrations/racetime/errors";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import { makeActivePlayer } from "./factories";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import {
  FakeCategoryPresetProvider,
  makeCategoryMapping,
  makePresentation,
} from "./support/category-fakes";
import {
  FakeRaceTimeClient,
  FakeScheduler,
  FakeWebSocketFactory,
  flushPromises,
  makeEntrantDto,
  makeRaceDto,
} from "./support/racetime-fakes";

const URL_A = "https://racetime.gg/ootr/race-a";
const URL_B = "https://racetime.gg/ootr/race-b";

function sequentialIds(prefix = "p"): PlayerIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-new-${next}`;
  };
}

function defaultHandler(canonical: { categorySlug: string; raceSlug: string }) {
  return makeRaceDto({
    categorySlug: canonical.categorySlug,
    slug: canonical.raceSlug,
    name: `${canonical.categorySlug}/${canonical.raceSlug}`,
  });
}

function setup(options: { categoryPresets?: CategoryPresetProvider } = {}) {
  const events: string[] = [];
  const broadcastStates: string[] = [];
  const client = new FakeRaceTimeClient();
  client.handler = async (canonical) => defaultHandler(canonical);

  const factory = new FakeWebSocketFactory();
  const scheduler = new FakeScheduler();
  const fakeLogger = createFakeLogger();

  const draftRaceSession = new TrackingReplicant<RaceSession>(
    "draft-race-session",
    createDefaultRaceSession(),
    events,
  );
  const activeRaceSession = new TrackingReplicant<RaceSession>(
    "active-race-session",
    createDefaultRaceSession(),
    events,
  );
  const playerDirectory = new TrackingReplicant<PlayerDirectory>("player-directory", {}, events);
  const draftConfig = new TrackingReplicant<DraftConfig>(
    "draft-config",
    createDefaultDraftConfig(),
    events,
  );
  const draftSpeedrunSnapshot = new TrackingReplicant<DraftSpeedrunSnapshot>(
    "draft-speedrun-snapshot",
    createDefaultDraftSpeedrunSnapshot(),
    events,
  );
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    events,
    (value) => broadcastStates.push(value.broadcast.state),
  );

  const raceSessions = new RaceSessionService({
    client,
    webSocketFactory: factory.create,
    scheduler,
    log: fakeLogger.logger,
    sessions: { draft: draftRaceSession, active: activeRaceSession },
    integrationStatus,
  });

  const raceDraft = new RaceDraftService({
    raceSessions,
    draftRaceSession,
    playerDirectory,
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    log: fakeLogger.logger,
    playerIdFactory: sequentialIds(),
    categoryPresets: options.categoryPresets,
  });

  raceSessions.setSessionChangeListener((role, session) => {
    if (role === "draft") {
      raceDraft.handleDraftSessionChange(session);
    }
  });

  return {
    raceDraft,
    raceSessions,
    client,
    factory,
    scheduler,
    fakeLogger,
    draftRaceSession,
    activeRaceSession,
    playerDirectory,
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    broadcastStates,
  };
}

describe("RaceDraftService.loadRace", () => {
  it("builds a draft from a loaded race", async () => {
    const { raceDraft, draftConfig } = setup();

    const result = await raceDraft.loadRace(URL_A);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.race?.raceId).toBe("ootr/race-a");
    expect(draftConfig.value.participants).toHaveLength(2);
    expect(draftConfig.value.raceScreenSlots).toEqual({
      1: "user-1",
      2: "user-2",
      3: null,
      4: null,
    });
    expect(draftConfig.value.commentatorPlayerIds).toEqual([]);
    expect(draftConfig.value.categorySelection).toEqual({
      selection: null,
      source: null,
      savedMappingState: "none",
    });
    expect(draftConfig.value.categoryPresentation).toBeNull();
    expect(draftConfig.value.revision).toBe(1);
  });

  it("rejects an invalid URL", async () => {
    const { raceDraft } = setup();
    const result = await raceDraft.loadRace("https://example.com/foo/bar");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_url");
    }
  });

  it("reports race_not_found for a 404", async () => {
    const { raceDraft, client } = setup();
    client.handler = async () => {
      throw new RaceNotFoundError("nope");
    };
    const result = await raceDraft.loadRace(URL_A);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("race_not_found");
    }
  });

  it("reports race_load_failed for a network error", async () => {
    const { raceDraft, client } = setup();
    client.handler = async () => {
      throw new RaceTimeNetworkError("down");
    };
    const result = await raceDraft.loadRace(URL_A);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("race_load_failed");
    }
  });

  it("keeps the existing draft when a load fails", async () => {
    const { raceDraft, client, draftConfig } = setup();
    await raceDraft.loadRace(URL_A);
    const before = draftConfig.value;

    client.handler = async () => {
      throw new RaceNotFoundError("nope");
    };
    const result = await raceDraft.loadRace(URL_B);

    expect(result.ok).toBe(false);
    expect(draftConfig.value).toBe(before);
    expect(draftConfig.value.race?.raceId).toBe("ootr/race-a");
  });

  it("reports draft_build_failed when resolution fails", async () => {
    const { raceDraft, playerDirectory, draftConfig } = setup();
    const a = makeActivePlayer("a");
    const b = makeActivePlayer("b", {
      racetime: {
        state: "linked",
        value: { userId: "rt-account-a", name: "Same", twitchLogin: null },
      },
    });
    playerDirectory.value = { a, b };

    const result = await raceDraft.loadRace(URL_A);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("draft_build_failed");
    }
    expect(draftConfig.value.revision).toBe(0);
  });

  it("resets the draft speedrun snapshot", async () => {
    const { raceDraft, draftSpeedrunSnapshot } = setup();
    draftSpeedrunSnapshot.value = {
      draftRevision: 0,
      state: "ready",
      snapshot: null,
      message: "stale",
    };

    await raceDraft.loadRace(URL_A);

    expect(draftSpeedrunSnapshot.value).toEqual({
      draftRevision: 1,
      state: "empty",
      snapshot: null,
      message: null,
    });
  });

  it("does not change the active race session", async () => {
    const { raceDraft, activeRaceSession } = setup();

    await raceDraft.loadRace(URL_A);

    expect(activeRaceSession.value).toEqual(createDefaultRaceSession());
  });

  it("moves the broadcast status through loading, resolving and resolution_required", async () => {
    const { raceDraft, broadcastStates, integrationStatus } = setup();

    await raceDraft.loadRace(URL_A);

    expect(broadcastStates).toContain("loading");
    expect(broadcastStates).toContain("resolving");
    expect(integrationStatus.value.broadcast.state).toBe("resolution_required");
    expect(integrationStatus.value.broadcast.draftRevision).toBe(1);
  });
});

describe("RaceDraftService reconciliation monitoring", () => {
  it("marks reconciliation_required on a structural RaceTime change without touching the draft", async () => {
    const { raceDraft, client, factory, draftConfig, integrationStatus } = setup();
    await raceDraft.loadRace(URL_A);
    factory.sockets[0]?.emitOpen();
    const draftBefore = draftConfig.value;

    client.handler = async (canonical) =>
      makeRaceDto({
        categorySlug: canonical.categorySlug,
        slug: canonical.raceSlug,
        entrants: [
          makeEntrantDto({ userId: "user-1", name: "Renamed", twitchLogin: "runner_one" }),
          makeEntrantDto({ userId: "user-2", name: "Runner Two", twitchLogin: null }),
        ],
      });
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();

    expect(integrationStatus.value.broadcast.state).toBe("reconciliation_required");
    expect(draftConfig.value).toBe(draftBefore);
  });

  it("ignores result-only changes", async () => {
    const { raceDraft, client, factory, draftConfig, integrationStatus } = setup();
    await raceDraft.loadRace(URL_A);
    factory.sockets[0]?.emitOpen();
    const draftBefore = draftConfig.value;

    client.handler = async (canonical) =>
      makeRaceDto({
        categorySlug: canonical.categorySlug,
        slug: canonical.raceSlug,
        entrants: [
          makeEntrantDto({
            userId: "user-1",
            name: "Runner One",
            twitchLogin: "runner_one",
            status: "done",
            finishTime: "PT1H",
            place: 1,
          }),
          makeEntrantDto({ userId: "user-2", name: "Runner Two", twitchLogin: null }),
        ],
      });
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();

    expect(integrationStatus.value.broadcast.state).not.toBe("reconciliation_required");
    expect(draftConfig.value).toBe(draftBefore);
  });
});

describe("RaceDraftService.reconcile", () => {
  it("rejects when no race is loaded", async () => {
    const { raceDraft } = setup();
    const result = await raceDraft.reconcile(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_race_loaded");
    }
  });

  it("rejects when the expected revision does not match", async () => {
    const { raceDraft } = setup();
    await raceDraft.loadRace(URL_A);
    const result = await raceDraft.reconcile(999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("draft_changed");
    }
  });

  it("applies structural changes and bumps the revision", async () => {
    const { raceDraft, client, factory, draftConfig } = setup();
    await raceDraft.loadRace(URL_A);
    factory.sockets[0]?.emitOpen();

    client.handler = async (canonical) =>
      makeRaceDto({
        categorySlug: canonical.categorySlug,
        slug: canonical.raceSlug,
        entrants: [
          makeEntrantDto({ userId: "user-1", name: "Renamed", twitchLogin: "runner_one" }),
          makeEntrantDto({ userId: "user-2", name: "Runner Two", twitchLogin: null }),
          makeEntrantDto({ userId: "user-3", name: "Runner Three", twitchLogin: "three" }),
        ],
      });
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();

    const result = await raceDraft.reconcile(draftConfig.value.revision);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changed).toBe(true);
      expect(result.draftRevision).toBe(2);
      expect(result.participantCount).toBe(3);
    }
    expect(draftConfig.value.participants.map((p) => p.racetimeUserId)).toEqual([
      "user-1",
      "user-2",
      "user-3",
    ]);
  });

  it("reports changed=false and keeps the revision when there is no difference", async () => {
    const { raceDraft, draftConfig } = setup();
    await raceDraft.loadRace(URL_A);

    const result = await raceDraft.reconcile(draftConfig.value.revision);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changed).toBe(false);
      expect(result.draftRevision).toBe(1);
    }
  });
});

describe("RaceDraftService category preset lookup", () => {
  it("applies a saved mapping and presentation", async () => {
    const provider = new FakeCategoryPresetProvider();
    provider.mapping = makeCategoryMapping();
    provider.presentation = makePresentation({ title: "Saved Title" });
    const { raceDraft, draftConfig } = setup({ categoryPresets: provider });

    const result = await raceDraft.loadRace(URL_A);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.categorySelection.source).toBe("saved_mapping");
    expect(draftConfig.value.categorySelection.savedMappingState).toBe("matches");
    expect(draftConfig.value.categoryPresentation?.title).toBe("Saved Title");
  });

  it("leaves the selection empty when there is no mapping", async () => {
    const provider = new FakeCategoryPresetProvider();
    const { raceDraft, draftConfig } = setup({ categoryPresets: provider });

    await raceDraft.loadRace(URL_A);

    expect(draftConfig.value.categorySelection).toEqual({
      selection: null,
      source: null,
      savedMappingState: "none",
    });
    expect(draftConfig.value.categoryPresentation).toBeNull();
  });

  it("still loads the race when the preset lookup fails", async () => {
    const provider = new FakeCategoryPresetProvider();
    provider.error = new Error("spreadsheet down");
    const { raceDraft, draftConfig } = setup({ categoryPresets: provider });

    const result = await raceDraft.loadRace(URL_A);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.race?.raceId).toBe("ootr/race-a");
    expect(draftConfig.value.categorySelection.selection).toBeNull();
    expect(draftConfig.value.categoryPresentation).toBeNull();
  });
});
