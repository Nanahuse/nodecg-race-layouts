import { describe, expect, it } from "vitest";

import type { CategoryDraftService } from "../src/extension/application/category-draft-service";
import type { RaceDraftService } from "../src/extension/application/race-draft-service";
import type { SpeedrunDiscoveryService } from "../src/extension/application/speedrun-discovery-service";
import { registerCategoryMessages } from "../src/extension/messages/category-messages";
import { registerRaceMessages } from "../src/extension/messages/race-messages";
import { registerSpeedrunMessages } from "../src/extension/messages/speedrun-messages";
import { bootstrapExtension } from "../src/extension/setup";
import type { MessageHandler, NodeCG } from "../src/types/nodecg";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

function makeFakeNodeCG(bundleConfig: unknown) {
  const replicants = new Map<string, TrackingReplicant<unknown>>();
  const listened: string[] = [];
  const handlers = new Map<string, MessageHandler>();
  const fakeLogger = createFakeLogger();

  const nodecg = {
    Replicant: (name: string) => {
      let replicant = replicants.get(name);
      if (!replicant) {
        replicant = new TrackingReplicant<unknown>(name, undefined);
        replicants.set(name, replicant);
      }
      return replicant;
    },
    listenFor: (name: string, handler: MessageHandler) => {
      listened.push(name);
      handlers.set(name, handler);
    },
    log: fakeLogger.logger,
    bundleConfig,
    bundleVersion: "0.0.0",
  } as unknown as NodeCG;

  return { nodecg, listened, handlers };
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
    expect(listened).toContain("participant.set-player");
    expect(listened).toContain("participant.set-speedruncom");
    expect(listened).toContain("participant.set-speedruncom-none");
    expect(listened).toContain("participant.set-twitch");
    expect(listened).toContain("participant.set-twitch-none");
    expect(listened).toContain("participant.set-display-name");
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
