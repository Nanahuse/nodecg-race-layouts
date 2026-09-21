import { describe, expect, it } from "vitest";
import { GraphicsProjectionService } from "../src/extension/application/graphics-projection-service";
import { makeActiveConfig, makeRaceOverlayData, makeSpeedrunSnapshot } from "./factories";
import { TrackingReplicant, createFakeLogger } from "./support/fakes";
import type {
  ActiveSpeedrunSnapshot,
  ParticipantListData,
  LeaderboardPageData,
  RaceResultPageData,
  RaceSession,
  RaceOverlayData,
} from "../src/domain";

const event = { name: "Event", shortName: null, logoUrl: null };
function makeService(
  config: ReturnType<typeof makeActiveConfig> | null,
  snapshot: ActiveSpeedrunSnapshot | null,
  session: RaceSession,
) {
  const logger = createFakeLogger();
  const overlay = new TrackingReplicant<RaceOverlayData | null>("overlay", makeRaceOverlayData());
  const participants = new TrackingReplicant<ParticipantListData | null>("participants", null);
  const leaderboard = new TrackingReplicant<LeaderboardPageData | null>("leaderboard", null);
  const result = new TrackingReplicant<RaceResultPageData | null>("result", null);
  const service = new GraphicsProjectionService({
    activeConfig: new TrackingReplicant("active-config", config),
    activeSnapshot: new TrackingReplicant("active-speedrun-snapshot", snapshot),
    activeSession: new TrackingReplicant("active-race-session", session),
    overlay,
    participants,
    leaderboard,
    result,
    event,
    log: logger.logger,
  });
  return { service, logger, overlay, participants, leaderboard, result };
}

const emptySession: RaceSession = {
  revision: 1,
  canonicalUrl: null,
  connection: { state: "connected", message: null },
  race: null,
};

describe("GraphicsProjectionService", () => {
  it("updates all static VMs atomically after revision match", () => {
    const config = makeActiveConfig();
    const snapshot: ActiveSpeedrunSnapshot = {
      activeRevision: 1,
      snapshot: makeSpeedrunSnapshot(),
    };
    const { service, overlay, participants, leaderboard } = makeService(
      config,
      snapshot,
      emptySession,
    );
    service.rebuildStatic();
    expect(overlay.value?.activeRevision).toBe(1);
    expect(participants.value?.activeRevision).toBe(1);
    expect(leaderboard.value?.activeRevision).toBe(1);
  });

  it("preserves existing static VMs on mismatch", () => {
    const old = makeRaceOverlayData();
    const config = makeActiveConfig({ revision: 2 });
    const snapshot: ActiveSpeedrunSnapshot = {
      activeRevision: 1,
      snapshot: makeSpeedrunSnapshot(),
    };
    const { service, overlay } = makeService(config, snapshot, emptySession);
    service.rebuildStatic();
    expect(overlay.value).toEqual(old);
  });
});
