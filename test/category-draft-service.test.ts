import { describe, expect, it } from "vitest";

import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  RaceSession,
} from "../src/domain";
import { CategoryDraftService } from "../src/extension/application/category-draft-service";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import {
  FakeCategoryMappingsRepository,
  FakeCategoryPresentationRepository,
  makeCategoryMapping,
  makePresentation,
  makeSelection,
} from "./support/category-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

function makeDraftConfig(overrides: Partial<DraftConfig> = {}): DraftConfig {
  return {
    ...createDefaultDraftConfig(),
    revision: 1,
    race: {
      canonicalUrl: "https://racetime.gg/ootr/race-a",
      raceId: "ootr/race-a",
      categorySlug: "ootr",
      categoryName: "Ocarina of Time Randomizer",
      goal: "Defeat Ganon",
    },
    ...overrides,
  };
}

function draftWithUnresolvedPlayer(): DraftConfig {
  const base = makeDraftConfig();
  return {
    ...base,
    participants: [{ racetimeUserId: "rt-1", playerId: "p1" }],
    players: {
      p1: {
        playerId: "p1",
        manualDisplayName: null,
        racetime: {
          state: "linked",
          value: { userId: "rt-1", name: "One", twitchLogin: null },
          source: "racetime",
        },
        speedrunCom: { state: "unresolved" },
        twitch: { state: "unresolved" },
      },
    },
  };
}

function setup(
  options: {
    draft?: DraftConfig;
    mappings?: FakeCategoryMappingsRepository;
    presentation?: FakeCategoryPresentationRepository;
    disableSpreadsheet?: boolean;
  } = {},
) {
  const events: string[] = [];
  const draftConfig = new TrackingReplicant<DraftConfig>(
    "draft-config",
    options.draft ?? makeDraftConfig(),
    events,
  );
  const draftSpeedrunSnapshot = new TrackingReplicant<DraftSpeedrunSnapshot>(
    "draft-speedrun-snapshot",
    createDefaultDraftSpeedrunSnapshot(),
    events,
  );
  const draftRaceSession = new TrackingReplicant<RaceSession>(
    "draft-race-session",
    createDefaultRaceSession(),
    events,
  );
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    events,
  );
  const fakeLogger = createFakeLogger();

  const mappings = options.mappings ?? new FakeCategoryMappingsRepository();
  const presentation = options.presentation ?? new FakeCategoryPresentationRepository();

  const service = new CategoryDraftService({
    draftConfig,
    draftSpeedrunSnapshot,
    draftRaceSession,
    integrationStatus,
    mappingsRepository: options.disableSpreadsheet ? null : mappings,
    presentationRepository: options.disableSpreadsheet ? null : presentation,
    log: fakeLogger.logger,
  });

  return {
    service,
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    fakeLogger,
    mappings,
    presentation,
  };
}

describe("CategoryDraftService.select", () => {
  it("rejects when no race is loaded", async () => {
    const { service } = setup({ draft: makeDraftConfig({ race: null }) });
    const result = await service.select(1, makeSelection());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_race_loaded");
    }
  });

  it("rejects a revision mismatch", async () => {
    const { service } = setup();
    const result = await service.select(99, makeSelection());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("draft_changed");
    }
  });

  it("rejects an invalid selection", async () => {
    const { service } = setup();
    const result = await service.select(1, { gameId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_selection");
    }
  });

  it("sets a manual selection and invalidates the snapshot", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot } = setup();
    draftSpeedrunSnapshot.value = {
      draftRevision: 1,
      state: "ready",
      snapshot: null,
      message: "stale",
    };

    const result = await service.select(1, makeSelection());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.savedMappingState).toBe("none");
      expect(result.draftRevision).toBe(2);
    }
    expect(draftConfig.value.categorySelection.source).toBe("manual");
    expect(draftConfig.value.categorySelection.savedMappingState).toBe("none");
    expect(draftSpeedrunSnapshot.value).toEqual({
      draftRevision: 2,
      state: "empty",
      snapshot: null,
      message: null,
    });
  });

  it("reports matches when the saved mapping is leaderboard-equivalent", async () => {
    const { service, mappings } = setup();
    mappings.mapping = makeCategoryMapping({ speedrunCom: makeSelection({ gameName: "Old" }) });

    const result = await service.select(1, makeSelection({ gameName: "New" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.savedMappingState).toBe("matches");
    }
  });

  it("reports overridden when the saved mapping differs", async () => {
    const { service, mappings } = setup();
    mappings.mapping = makeCategoryMapping();

    const result = await service.select(1, makeSelection({ gameId: "other" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.savedMappingState).toBe("overridden");
    }
  });

  it("reports changed=false for an identical selection", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service } = setup({ draft });

    const result = await service.select(1, makeSelection());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changed).toBe(false);
      expect(result.draftRevision).toBe(1);
    }
  });

  it("does not invalidate the snapshot for a display-name-only change", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service, draftSpeedrunSnapshot } = setup({ draft });
    draftSpeedrunSnapshot.value = {
      draftRevision: 1,
      state: "ready",
      snapshot: null,
      message: "keep",
    };

    const result = await service.select(1, makeSelection({ gameName: "Renamed" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draftRevision).toBe(2);
    }
    expect(draftSpeedrunSnapshot.value.message).toBe("keep");
  });

  it("preserves reconciliation_required", async () => {
    const { service, integrationStatus } = setup();
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "reconciliation_required" },
    };

    await service.select(1, makeSelection());

    expect(integrationStatus.value.broadcast.state).toBe("reconciliation_required");
  });

  it("preserves resolution_required", async () => {
    const { service, integrationStatus } = setup({ draft: draftWithUnresolvedPlayer() });
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "resolution_required" },
    };

    await service.select(1, makeSelection());

    expect(integrationStatus.value.broadcast.state).toBe("resolution_required");
  });

  it("sets dirty when fully resolved", async () => {
    const { service, integrationStatus } = setup();

    await service.select(1, makeSelection());

    expect(integrationStatus.value.broadcast.state).toBe("dirty");
  });
});

describe("CategoryDraftService mapping operations", () => {
  it("returns spreadsheet_unavailable when there is no repository", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service } = setup({ draft, disableSpreadsheet: true });
    const result = await service.registerMapping(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("spreadsheet_unavailable");
    }
  });

  it("rejects register without a selection", async () => {
    const { service } = setup();
    const result = await service.registerMapping(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_selection");
    }
  });

  it("registers a new mapping and marks it as matching", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service, mappings, draftConfig } = setup({ draft });

    const result = await service.registerMapping(1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draftRevision).toBe(2);
    }
    expect(mappings.upserts).toHaveLength(1);
    expect(draftConfig.value.categorySelection.savedMappingState).toBe("matches");
  });

  it("rejects register when a mapping already exists", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service, mappings } = setup({ draft });
    mappings.mapping = makeCategoryMapping();

    const result = await service.registerMapping(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("mapping_already_exists");
    }
  });

  it("rejects update without a saved mapping", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service } = setup({ draft });
    const result = await service.updateMapping(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_saved_mapping");
    }
  });

  it("updates a saved mapping", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection({ gameId: "new" }),
        source: "manual",
        savedMappingState: "overridden",
      },
    });
    const { service, mappings, draftConfig } = setup({ draft });
    mappings.mapping = makeCategoryMapping();

    const result = await service.updateMapping(1);

    expect(result.ok).toBe(true);
    expect(mappings.upserts[0]?.speedrunCom.gameId).toBe("new");
    expect(draftConfig.value.categorySelection.savedMappingState).toBe("matches");
  });

  it("keeps the draft unchanged when saving fails", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection(),
        source: "manual",
        savedMappingState: "none",
      },
    });
    const { service, mappings, draftConfig, integrationStatus } = setup({ draft });
    mappings.upsertError = new Error("write failed");
    const before = draftConfig.value;

    const result = await service.registerMapping(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("save_failed");
    }
    expect(draftConfig.value).toBe(before);
    expect(integrationStatus.value.spreadsheet.state).toBe("error");
  });

  it("rejects revert without a saved mapping", async () => {
    const { service } = setup();
    const result = await service.revertMapping(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_saved_mapping");
    }
  });

  it("reverts to the saved mapping and invalidates the snapshot", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection({ gameId: "other" }),
        source: "manual",
        savedMappingState: "overridden",
      },
    });
    const { service, mappings, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    mappings.mapping = makeCategoryMapping();

    const result = await service.revertMapping(1);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.categorySelection.source).toBe("saved_mapping");
    expect(draftConfig.value.categorySelection.savedMappingState).toBe("matches");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(2);
  });

  it("does not invalidate the snapshot when only display names differ on revert", async () => {
    const draft = makeDraftConfig({
      categorySelection: {
        selection: makeSelection({ gameName: "Old" }),
        source: "manual",
        savedMappingState: "overridden",
      },
    });
    const { service, mappings, draftSpeedrunSnapshot } = setup({ draft });
    draftSpeedrunSnapshot.value = {
      draftRevision: 1,
      state: "ready",
      snapshot: null,
      message: "keep",
    };
    mappings.mapping = makeCategoryMapping({ speedrunCom: makeSelection({ gameName: "New" }) });

    await service.revertMapping(1);

    expect(draftSpeedrunSnapshot.value.message).toBe("keep");
  });
});

describe("CategoryDraftService presentation operations", () => {
  it("updates the presentation without invalidating the snapshot", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot } = setup();
    draftSpeedrunSnapshot.value = {
      draftRevision: 1,
      state: "ready",
      snapshot: null,
      message: "keep",
    };

    const result = await service.updatePresentation(1, makePresentation({ title: "New" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draftRevision).toBe(2);
    }
    expect(draftConfig.value.categoryPresentation?.title).toBe("New");
    expect(draftSpeedrunSnapshot.value.message).toBe("keep");
  });

  it("allows clearing the presentation with null", async () => {
    const draft = makeDraftConfig({ categoryPresentation: makePresentation() });
    const { service, draftConfig } = setup({ draft });

    const result = await service.updatePresentation(1, null);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.categoryPresentation).toBeNull();
  });

  it("rejects an invalid presentation", async () => {
    const { service } = setup();
    const result = await service.updatePresentation(1, { title: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_presentation");
    }
  });

  it("rejects saving a null presentation", async () => {
    const { service } = setup();
    const result = await service.savePresentation(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_presentation");
    }
  });

  it("saves the presentation", async () => {
    const draft = makeDraftConfig({ categoryPresentation: makePresentation() });
    const { service, presentation } = setup({ draft });

    const result = await service.savePresentation(1);

    expect(result.ok).toBe(true);
    expect(presentation.upserts).toHaveLength(1);
    expect(presentation.upserts[0]?.categorySlug).toBe("ootr");
  });

  it("reports save_failed and keeps the draft unchanged", async () => {
    const draft = makeDraftConfig({ categoryPresentation: makePresentation() });
    const { service, presentation, draftConfig, integrationStatus } = setup({ draft });
    presentation.upsertError = new Error("write failed");
    const before = draftConfig.value;

    const result = await service.savePresentation(1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("save_failed");
    }
    expect(draftConfig.value).toBe(before);
    expect(integrationStatus.value.spreadsheet.state).toBe("error");
  });

  it("reverts to the saved presentation", async () => {
    const { service, presentation, draftConfig } = setup();
    presentation.presentation = makePresentation({ title: "Saved" });

    const result = await service.revertPresentation(1);

    expect(result.ok).toBe(true);
    expect(draftConfig.value.categoryPresentation?.title).toBe("Saved");
  });

  it("rejects revert without a saved presentation", async () => {
    const { service } = setup();
    const result = await service.revertPresentation(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_saved_presentation");
    }
  });
});

describe("CategoryDraftService snapshot retag / reset", () => {
  function readySnapshot(draftRevision: number) {
    return {
      draftRevision,
      state: "ready" as const,
      snapshot: {
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
      },
      message: null,
    };
  }

  it("retags the snapshot on a non-invalidating presentation change", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot } = setup();
    const ready = readySnapshot(1);
    draftSpeedrunSnapshot.value = ready;

    await service.updatePresentation(1, makePresentation());

    expect(draftConfig.value.revision).toBe(2);
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(2);
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.snapshot).toBe(ready.snapshot);
  });

  it("resets the snapshot on a leaderboard-invalidating selection change", async () => {
    const { service, draftConfig, draftSpeedrunSnapshot } = setup();
    draftSpeedrunSnapshot.value = readySnapshot(1);

    await service.select(1, makeSelection({ gameId: "other" }));

    expect(draftConfig.value.revision).toBe(2);
    expect(draftSpeedrunSnapshot.value).toEqual({
      draftRevision: 2,
      state: "empty",
      snapshot: null,
      message: null,
    });
  });
});
