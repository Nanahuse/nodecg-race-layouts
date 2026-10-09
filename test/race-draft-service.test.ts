import { describe, expect, it } from "vitest";

import { RaceDraftService } from "../src/extension/application/race-draft-service";
import type { RaceSessionService } from "../src/extension/application/race-session-service";
import type { PlayerManagerGateway } from "../src/extension/integrations/player-manager/types";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import { makeCategoryMapping, makePresentation } from "./support/category-fakes";
import { makeSession } from "./support/draft-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

describe("RaceDraftService automatic snapshot", () => {
  it("refreshes the snapshot after loading a race with a saved category mapping", async () => {
    const session = makeSession({
      race: { ...makeSession().race!, entrants: [] },
    });
    const draftConfig = new TrackingReplicant("draft-config", createDefaultDraftConfig());
    const snapshotRefreshes: number[] = [];
    const service = new RaceDraftService({
      raceSessions: {
        loadRace: async () => ({ ok: true as const, session }),
      } as unknown as RaceSessionService,
      draftRaceSession: new TrackingReplicant("draft-race-session", createDefaultRaceSession()),
      playerManager: { list: async () => [] } as unknown as PlayerManagerGateway,
      draftConfig,
      draftSpeedrunSnapshot: new TrackingReplicant(
        "draft-speedrun-snapshot",
        createDefaultDraftSpeedrunSnapshot(),
      ),
      integrationStatus: new TrackingReplicant(
        "integration-status",
        createDefaultIntegrationStatus(),
      ),
      log: createFakeLogger().logger,
      categoryPresets: {
        findMapping: async () => makeCategoryMapping(),
        findPresentation: async () => makePresentation(),
      },
      refreshSnapshot: async (draftRevision) => {
        snapshotRefreshes.push(draftRevision);
        return { ok: true };
      },
    });

    const result = await service.loadRace(session.canonicalUrl ?? "");

    expect(result.ok).toBe(true);
    expect(draftConfig.value.categorySelection.source).toBe("saved_mapping");
    expect(snapshotRefreshes).toEqual([1]);
  });
});
