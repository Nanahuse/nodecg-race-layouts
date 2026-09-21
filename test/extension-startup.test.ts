import { describe, expect, it } from "vitest";

import type { RaceDraftService } from "../src/extension/application/race-draft-service";
import { registerRaceMessages } from "../src/extension/messages/race-messages";
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
  } as unknown as NodeCG;

  return { nodecg, listened, handlers };
}

describe("bootstrapExtension", () => {
  it("registers race messages without a spreadsheet config", () => {
    const { nodecg, listened } = makeFakeNodeCG(undefined);

    expect(() => bootstrapExtension(nodecg)).not.toThrow();
    expect(listened).toContain("race.load");
    expect(listened).toContain("race.reconcile");
  });

  it("registers race messages with an invalid spreadsheet config", () => {
    const { nodecg, listened } = makeFakeNodeCG({ spreadsheet: {} });

    expect(() => bootstrapExtension(nodecg)).not.toThrow();
    expect(listened).toContain("race.load");
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
