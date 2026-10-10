import { describe, expect, it } from "vitest";
import { GraphicsProjectionService } from "../src/extension/application/graphics-projection-service";
import { makeActiveConfig, makeRaceOverlayData, makeSpeedrunSnapshot } from "./factories";
import { TrackingReplicant, createFakeLogger } from "./support/fakes";
import type { Player } from "../src/extension/integrations/player-manager/types";
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
  players: Player[] = [],
  listPlayers: () => Promise<Player[]> = async () => players,
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
    playerManager: { list: listPlayers } as never,
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

  it("updates resolved names from the directory without changing the SRC snapshot", async () => {
    const config = makeActiveConfig();
    const snapshot: ActiveSpeedrunSnapshot = {
      activeRevision: 1,
      snapshot: makeSpeedrunSnapshot({
        leaderboard: [
          {
            rank: 1,
            speedrunComUserId: "src-account-player-1",
            speedrunComName: "SRC Original",
            timeSeconds: 60,
            formattedTime: "1:00",
          },
        ],
      }),
    };
    let directory: Player[] = [
      {
        playerId: "pm-player-1",
        revision: 1,
        manualDisplayName: "First Name",
        racetime: null,
        speedrunCom: { userId: "src-account-player-1", name: "SRC Original" },
        twitch: null,
        youtube: null,
      },
    ];
    let listCalls = 0;
    const { service, leaderboard } = makeService(config, snapshot, emptySession, [], async () => {
      listCalls += 1;
      return directory;
    });

    await service.refreshPlayerManagerDirectory();
    expect(leaderboard.value?.leaderboard[0]?.name).toBe("First Name");
    directory = [{ ...directory[0]!, manualDisplayName: "Updated Name" }];
    await service.refreshPlayerManagerDirectory();

    expect(leaderboard.value?.leaderboard[0]).toMatchObject({
      name: "Updated Name",
      secondaryName: null,
    });
    expect(listCalls).toBe(2);
    expect(snapshot.snapshot.leaderboard[0]?.speedrunComName).toBe("SRC Original");
  });

  it("falls back to SRC names when Player Manager listing fails", async () => {
    const snapshot: ActiveSpeedrunSnapshot = {
      activeRevision: 1,
      snapshot: makeSpeedrunSnapshot({
        leaderboard: [
          {
            rank: 1,
            speedrunComUserId: "src-user",
            speedrunComName: "SRC Name",
            timeSeconds: 60,
            formattedTime: "1:00",
          },
        ],
      }),
    };
    let shouldFail = false;
    const { service, leaderboard, logger } = makeService(
      makeActiveConfig(),
      snapshot,
      emptySession,
      [],
      async () => {
        if (shouldFail) throw new Error("Directory unavailable");
        return [
          {
            playerId: "pm-player",
            revision: 1,
            manualDisplayName: "Player Manager Name",
            racetime: null,
            speedrunCom: { userId: "src-user", name: "SRC Name" },
            twitch: null,
            youtube: null,
          },
        ];
      },
    );

    await service.refreshPlayerManagerDirectory();
    expect(leaderboard.value?.leaderboard[0]?.name).toBe("Player Manager Name");
    shouldFail = true;
    await service.refreshPlayerManagerDirectory();

    expect(leaderboard.value?.leaderboard[0]).toMatchObject({
      name: "SRC Name",
      secondaryName: null,
    });
    expect(logger.warnMessages.join(" ")).toContain("Directory unavailable");
  });

  it("ignores stale directory responses", async () => {
    const snapshot: ActiveSpeedrunSnapshot = {
      activeRevision: 1,
      snapshot: makeSpeedrunSnapshot({
        leaderboard: [
          {
            rank: 1,
            speedrunComUserId: "src-account-player-1",
            speedrunComName: "SRC Original",
            timeSeconds: 60,
            formattedTime: "1:00",
          },
        ],
      }),
    };
    let resolveFirst!: (players: Player[]) => void;
    const first = new Promise<Player[]>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const { service, leaderboard } = makeService(
      makeActiveConfig(),
      snapshot,
      emptySession,
      [],
      async () => {
        calls += 1;
        if (calls === 1) return first;
        return [
          {
            playerId: "pm-player-1",
            revision: 2,
            manualDisplayName: "Newer Name",
            racetime: null,
            speedrunCom: { userId: "src-account-player-1", name: "SRC Original" },
            twitch: null,
            youtube: null,
          },
        ];
      },
    );

    const olderRequest = service.refreshPlayerManagerDirectory();
    await service.refreshPlayerManagerDirectory();
    resolveFirst([
      {
        playerId: "pm-player-1",
        revision: 1,
        manualDisplayName: "Stale Name",
        racetime: null,
        speedrunCom: { userId: "src-account-player-1", name: "SRC Original" },
        twitch: null,
        youtube: null,
      },
    ]);
    await olderRequest;

    expect(leaderboard.value?.leaderboard[0]?.name).toBe("Newer Name");
  });
});
