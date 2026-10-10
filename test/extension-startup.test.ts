import { describe, expect, it } from "vitest";

import type { CategoryDraftService } from "../src/extension/application/category-draft-service";
import type { RaceDraftService } from "../src/extension/application/race-draft-service";
import type { SpeedrunDiscoveryService } from "../src/extension/application/speedrun-discovery-service";
import { registerCategoryMessages } from "../src/extension/messages/category-messages";
import { registerRaceMessages } from "../src/extension/messages/race-messages";
import { registerSpeedrunMessages } from "../src/extension/messages/speedrun-messages";
import { bootstrapExtension } from "../src/extension/setup";
import { registerParticipantMessages } from "../src/extension/messages/participant-messages";
import type { ParticipantDraftService } from "../src/extension/application/participant-draft-service";
import { REPLICANT_DEFINITIONS } from "../src/replicants/defaults";
import type { MessageHandler, NodeCG } from "../src/types/nodecg";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

function makeFakeNodeCG(bundleConfig: unknown) {
  const replicants = new Map<string, TrackingReplicant<unknown>>();
  const listened: string[] = [];
  const handlers = new Map<string, MessageHandler>();
  const eventBundles = new Map<string, string>();
  const fakeLogger = createFakeLogger();

  const nodecg = {
    Replicant: (name: string) => {
      let replicant = replicants.get(name);
      if (!replicant) {
        replicant = new TrackingReplicant<unknown>(
          name,
          REPLICANT_DEFINITIONS.find((definition) => definition.name === name)?.defaultValue,
        );
        replicants.set(name, replicant);
      }
      return replicant;
    },
    listenFor: (
      name: string,
      bundleOrHandler: string | MessageHandler,
      maybeHandler?: MessageHandler,
    ) => {
      listened.push(name);
      const handler = typeof bundleOrHandler === "string" ? maybeHandler! : bundleOrHandler;
      if (typeof bundleOrHandler === "string") eventBundles.set(name, bundleOrHandler);
      handlers.set(name, handler);
    },
    log: fakeLogger.logger,
    bundleConfig,
    bundleVersion: "0.0.0",
  } as unknown as NodeCG;

  return { nodecg, listened, handlers, eventBundles, fakeLogger };
}

describe("bootstrapExtension", () => {
  it("registers race messages without a spreadsheet config", () => {
    const { nodecg, listened } = makeFakeNodeCG(undefined);

    expect(() => bootstrapExtension(nodecg)).not.toThrow();
    expect(listened).toContain("race.load");
    expect(listened).toContain("race.reconcile");
    expect(listened).toContain("category.select");
    expect(listened).toContain("category.mapping.register");
    expect(listened).toContain("category.mapping.update");
    expect(listened).toContain("category.mapping.revert");
    expect(listened).toContain("category.presentation.update");
    expect(listened).toContain("category.presentation.save");
    expect(listened).toContain("category.presentation.revert");
    expect(listened).toContain("speedrun.games.search");
    expect(listened).toContain("speedrun.game.get");
    expect(listened).toContain("speedrun.game.options");
    expect(listened).toContain("speedrun.category.variables");
    expect(listened).toContain("speedrun.users.search");
    expect(listened).toContain("speedrun.user.get");
    expect(listened).toContain("speedrun.snapshot.refresh");
    expect(listened).not.toContain("participant.set-player");
    expect(listened).toContain("participant.registration.start");
    expect(listened).toContain("player-manager.list");
    expect(listened).toContain("player-manager.v2.registrationCompleted");
    expect(listened).toContain("player-manager.v2.directoryChanged");
    expect(listened).not.toContain("player-manager.v2.registrationCancelled");
    expect(listened).toContain("race-screen.set-slots");
    expect(listened).toContain("commentators.set");
    expect(listened).toContain("broadcast.apply");
  });

  it("registers messages with an invalid spreadsheet config", () => {
    const { nodecg, listened } = makeFakeNodeCG({ spreadsheet: {} });

    expect(() => bootstrapExtension(nodecg)).not.toThrow();
    expect(listened).toContain("race.load");
    expect(listened).toContain("category.select");
    expect(listened).toContain("speedrun.games.search");
  });
});

describe("registerRaceMessages", () => {
  it("requests Directory sync only after successful load or reconciliation without awaiting it", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    let syncRequests = 0;
    let releaseSync!: () => void;
    const syncPending = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const service = {
      loadRace: async (url: string) =>
        url
          ? {
              ok: true as const,
              draftRevision: 1,
              participantCount: 0,
              unresolvedPlayerCount: 0,
            }
          : { ok: false as const, reason: "invalid_url" as const, message: "bad" },
      reconcile: async (revision: number) =>
        revision === 1
          ? {
              ok: true as const,
              changed: false,
              draftRevision: 1,
              participantCount: 0,
              unresolvedPlayerCount: 0,
            }
          : { ok: false as const, reason: "no_race_loaded" as const, message: "none" },
    } as unknown as RaceDraftService;
    registerRaceMessages(nodecg, service, () => {
      syncRequests += 1;
      return syncPending;
    });

    const results: unknown[] = [];
    await handlers.get("race.load")?.({ url: "https://racetime.gg/ootr/race-a" }, (_e, value) => {
      results.push(value);
    });
    await handlers.get("race.load")?.({ url: "" }, (_e, value) => results.push(value));
    await handlers.get("race.reconcile")?.({ expectedDraftRevision: 1 }, (_e, value) => {
      results.push(value);
    });
    await handlers.get("race.reconcile")?.({ expectedDraftRevision: 2 }, (_e, value) => {
      results.push(value);
    });

    expect(syncRequests).toBe(2);
    expect(results).toHaveLength(4);
    releaseSync();
  });

  it("keeps successful race responses when the requested Directory sync fails", async () => {
    const { nodecg, handlers, fakeLogger } = makeFakeNodeCG(undefined);
    const service = {
      loadRace: async () => ({
        ok: true as const,
        draftRevision: 4,
        participantCount: 1,
        unresolvedPlayerCount: 0,
      }),
      reconcile: async () => ({
        ok: false as const,
        reason: "no_race_loaded" as const,
        message: "none",
      }),
    } as unknown as RaceDraftService;
    registerRaceMessages(nodecg, service, async () => {
      throw new Error("Directory unavailable");
    });
    let response: unknown;

    await handlers.get("race.load")?.({ url: "https://racetime.gg/ootr/race-a" }, (_e, value) => {
      response = value;
    });
    await Promise.resolve();

    expect(response).toMatchObject({ ok: true, draftRevision: 4 });
    expect(fakeLogger.errorMessages.join(" ")).toContain("Directory unavailable");
  });

  it("acknowledges race.load with the structured result", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    const service = {
      loadRace: async () => ({
        ok: true,
        draftRevision: 1,
        participantCount: 2,
        unresolvedPlayerCount: 2,
      }),
      reconcile: async () => ({ ok: false, reason: "no_race_loaded", message: "none" }),
    } as unknown as RaceDraftService;

    registerRaceMessages(nodecg, service);

    const results: unknown[] = [];
    await handlers.get("race.load")?.(
      { url: "https://racetime.gg/ootr/race-a" },
      (_error, result) => {
        results.push(result);
      },
    );

    expect(results[0]).toEqual({
      ok: true,
      draftRevision: 1,
      participantCount: 2,
      unresolvedPlayerCount: 2,
    });
  });

  it("acknowledges race.reconcile with the structured result", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    const service = {
      loadRace: async () => ({ ok: false, reason: "invalid_url", message: "bad" }),
      reconcile: async () => ({
        ok: true,
        changed: false,
        draftRevision: 1,
        participantCount: 0,
        unresolvedPlayerCount: 0,
      }),
    } as unknown as RaceDraftService;

    registerRaceMessages(nodecg, service);

    const results: unknown[] = [];
    await handlers.get("race.reconcile")?.({ expectedDraftRevision: 1 }, (_error, result) => {
      results.push(result);
    });

    expect(results[0]).toMatchObject({ ok: true, changed: false, draftRevision: 1 });
  });
});

describe("Player Manager v2 registration completion", () => {
  it("triggers a fresh Directory sync and ignores the event players payload", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    const refreshArguments: unknown[][] = [];
    const service = {
      listPlayers: async () => [],
      beginRegistration: async () => ({ ok: true }),
      refreshPlayerBindings: async (...args: unknown[]) => {
        refreshArguments.push(args);
        return { ok: true, changed: false, draftRevision: 1, unresolvedPlayerCount: 0 };
      },
    } as unknown as ParticipantDraftService;

    registerParticipantMessages(nodecg, service);
    await handlers.get("player-manager.v2.registrationCompleted")?.(
      {
        registrationId: "reg-1",
        directoryRevision: 2,
        players: [{ playerId: "untrusted-payload" }],
      },
      () => {},
    );

    expect(refreshArguments).toEqual([[]]);
  });

  it("subscribes to both Player Manager events from the player-manager bundle", () => {
    const { nodecg, eventBundles, listened } = makeFakeNodeCG(undefined);
    registerParticipantMessages(nodecg, {
      refreshPlayerBindings: async () => ({
        ok: true,
        changed: false,
        draftRevision: 1,
        unresolvedPlayerCount: 0,
      }),
    } as unknown as ParticipantDraftService);

    expect([...eventBundles.values()]).toEqual(["player-manager", "player-manager"]);
    expect(listened).toContain("player-manager.v2.registrationCompleted");
    expect(listened).toContain("player-manager.v2.directoryChanged");
  });

  it("resynchronizes on directoryChanged as well as registrationCompleted", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    let refreshes = 0;
    let directoryNotifications = 0;
    registerParticipantMessages(
      nodecg,
      {
        refreshPlayerBindings: async () => {
          refreshes += 1;
          return { ok: true, changed: false, draftRevision: 1, unresolvedPlayerCount: 0 };
        },
      } as unknown as ParticipantDraftService,
      () => {
        directoryNotifications += 1;
      },
    );

    await handlers.get("player-manager.v2.directoryChanged")?.(undefined, () => {});
    await handlers.get("player-manager.v2.registrationCompleted")?.(undefined, () => {});

    expect(refreshes).toBe(2);
    expect(directoryNotifications).toBe(2);
  });

  it("logs returned refresh failures as warnings and thrown failures as errors", async () => {
    const returnedFailure = makeFakeNodeCG(undefined);
    registerParticipantMessages(returnedFailure.nodecg, {
      refreshPlayerBindings: async () => ({
        ok: false,
        reason: "operation_failed",
        message: "Directory unavailable",
      }),
    } as unknown as ParticipantDraftService);
    await returnedFailure.handlers.get("player-manager.v2.registrationCompleted")?.(
      undefined,
      () => {},
    );
    expect(returnedFailure.fakeLogger.warnMessages.join(" ")).toContain(
      "[participant.directory.refresh_failed] reason=operation_failed message=Directory unavailable",
    );

    const thrownFailure = makeFakeNodeCG(undefined);
    registerParticipantMessages(thrownFailure.nodecg, {
      refreshPlayerBindings: async () => {
        throw new Error("Directory read failed");
      },
    } as unknown as ParticipantDraftService);
    await thrownFailure.handlers.get("player-manager.v2.registrationCompleted")?.(
      undefined,
      () => {},
    );
    expect(thrownFailure.fakeLogger.errorMessages.join(" ")).toContain(
      "[participant.directory.refresh_failed] Directory read failed",
    );
  });

  it("does not report a missing Race as a synchronization error", async () => {
    const { nodecg, handlers, fakeLogger } = makeFakeNodeCG(undefined);
    registerParticipantMessages(nodecg, {
      refreshPlayerBindings: async () => ({
        ok: false,
        reason: "no_race_loaded",
        message: "No race is loaded.",
      }),
    } as unknown as ParticipantDraftService);
    await handlers.get("player-manager.v2.registrationCompleted")?.(undefined, () => {});
    expect(fakeLogger.warnMessages).toEqual([]);
    expect(fakeLogger.errorMessages).toEqual([]);
  });
});

describe("registerCategoryMessages", () => {
  it("acknowledges category.select with the structured result", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    const service = {
      select: async () => ({
        ok: true,
        changed: true,
        draftRevision: 2,
        savedMappingState: "none",
      }),
      registerMapping: async () => ({ ok: false, reason: "spreadsheet_unavailable", message: "x" }),
      updateMapping: async () => ({ ok: false, reason: "no_saved_mapping", message: "x" }),
      revertMapping: async () => ({ ok: false, reason: "no_saved_mapping", message: "x" }),
      updatePresentation: async () => ({ ok: true, changed: false, draftRevision: 2 }),
      savePresentation: async () => ({ ok: false, reason: "no_presentation", message: "x" }),
      revertPresentation: async () => ({
        ok: false,
        reason: "no_saved_presentation",
        message: "x",
      }),
    } as unknown as CategoryDraftService;

    registerCategoryMessages(nodecg, service);

    const results: unknown[] = [];
    await handlers.get("category.select")?.(
      { expectedDraftRevision: 1, selection: {} },
      (_e, r) => {
        results.push(r);
      },
    );

    expect(results[0]).toEqual({
      ok: true,
      changed: true,
      draftRevision: 2,
      savedMappingState: "none",
    });
  });
});

describe("registerSpeedrunMessages", () => {
  it("acknowledges speedrun.games.search with the structured result", async () => {
    const { nodecg, handlers } = makeFakeNodeCG(undefined);
    const service = {
      searchGames: async () => ({
        ok: true,
        games: [{ id: "g1", name: "Game", abbreviation: "g" }],
      }),
      getGame: async () => ({ ok: false, reason: "not_found", message: "x" }),
      getGameOptions: async () => ({ ok: false, reason: "not_found", message: "x" }),
      getCategoryVariables: async () => ({ ok: true, variables: [] }),
      searchUsers: async () => ({ ok: true, users: [] }),
      getUser: async () => ({ ok: false, reason: "not_found", message: "x" }),
    } as unknown as SpeedrunDiscoveryService;

    registerSpeedrunMessages(nodecg, service);

    const results: unknown[] = [];
    await handlers.get("speedrun.games.search")?.({ query: "mario" }, (_e, r) => {
      results.push(r);
    });

    expect(results[0]).toEqual({
      ok: true,
      games: [{ id: "g1", name: "Game", abbreviation: "g" }],
    });
  });
});
