import { describe, expect, it } from "vitest";

import type { IntegrationStatus } from "../src/domain";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  SpeedrunDiscoveryService,
} from "../src/extension/application/speedrun-discovery-service";
import { SpeedrunOperationStatusCoordinator } from "../src/extension/application/speedrun-status-coordinator";
import { SpeedrunComNotFoundError } from "../src/extension/integrations/speedruncom/errors";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import {
  FakeSpeedrunComClient,
  deferred,
  makeGameDetail,
  makeUser,
} from "./support/speedrun-fakes";

function setup() {
  const client = new FakeSpeedrunComClient();
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );
  const fakeLogger = createFakeLogger();
  const status = new SpeedrunOperationStatusCoordinator({
    integrationStatus,
    log: fakeLogger.logger,
  });
  const service = new SpeedrunDiscoveryService({
    client,
    status,
    log: fakeLogger.logger,
  });
  return { service, client, integrationStatus, status, fakeLogger };
}

describe("SpeedrunDiscoveryService.searchGames", () => {
  it("returns search results", async () => {
    const { service, client } = setup();
    client.searchGamesResult = [{ id: "g1", name: "Game", abbreviation: "g" }];

    const result = await service.searchGames("mario");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.games).toHaveLength(1);
    }
  });

  it("rejects an empty query without calling the client", async () => {
    const { service, client } = setup();
    const result = await service.searchGames("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_request");
    }
    expect(client.calls).toHaveLength(0);
  });

  it("applies the default and maximum search limits", async () => {
    const { service, client } = setup();
    await service.searchGames("mario");
    expect(client.lastSearchGames?.limit).toBe(DEFAULT_SEARCH_LIMIT);

    await service.searchGames("mario", 5000);
    expect(client.lastSearchGames?.limit).toBe(MAX_SEARCH_LIMIT);
  });

  it("maps a not_found error", async () => {
    const { service, client } = setup();
    client.error = new SpeedrunComNotFoundError("nope");
    const result = await service.searchGames("mario");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });
});

describe("SpeedrunDiscoveryService.getGameOptions", () => {
  it("returns game, categories, levels and only referenced platforms/regions", async () => {
    const { service, client } = setup();
    client.gameResult = makeGameDetail({
      platformIds: ["platform-1", "platform-2"],
      regionIds: ["region-1"],
      timingMethods: { realtime: true, realtimeNoLoads: false, ingame: true },
    });
    client.categoriesResult = [
      { id: "category-1", name: "Any%", type: "per-game", miscellaneous: false },
    ];
    client.levelsResult = [{ id: "level-1", name: "Level" }];
    client.platformsResult = [
      { id: "platform-1", name: "One" },
      { id: "platform-3", name: "Three" },
    ];
    client.regionsResult = [
      { id: "region-1", name: "USA" },
      { id: "region-2", name: "Japan" },
    ];

    const result = await service.getGameOptions("game-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options.platforms).toEqual([{ id: "platform-1", name: "One" }]);
      expect(result.options.regions).toEqual([{ id: "region-1", name: "USA" }]);
      expect(result.options.timingMethods).toEqual(["realtime", "ingame"]);
      expect(result.options.categories).toHaveLength(1);
    }
  });

  it("rejects an empty game id", async () => {
    const { service, client } = setup();
    const result = await service.getGameOptions("");
    expect(result.ok).toBe(false);
    expect(client.calls).toHaveLength(0);
  });
});

describe("SpeedrunDiscoveryService.getCategoryVariables", () => {
  it("returns an empty array as a success", async () => {
    const { service } = setup();
    const result = await service.getCategoryVariables("category-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.variables).toEqual([]);
    }
  });
});

describe("SpeedrunDiscoveryService users", () => {
  it("searches users with the requested mode", async () => {
    const { service, client } = setup();
    client.usersResult = [makeUser()];

    const result = await service.searchUsers("chewdiggy", "twitch");

    expect(result.ok).toBe(true);
    expect(client.lastSearchUsers).toEqual({
      query: "chewdiggy",
      mode: "twitch",
      limit: DEFAULT_SEARCH_LIMIT,
    });
  });

  it("gets a single user", async () => {
    const { service, client } = setup();
    client.userResult = makeUser({ userId: "user-9" });
    const result = await service.getUser("user-9");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.userId).toBe("user-9");
    }
  });
});

describe("SpeedrunDiscoveryService integration status", () => {
  it("reports fetching then ready", async () => {
    const { service, client, integrationStatus } = setup();
    const pending = deferred<{ id: string; name: string; abbreviation: string }[]>();
    client.searchGamesPromise = pending.promise;

    const promise = service.searchGames("mario");
    expect(integrationStatus.value.speedrunCom.state).toBe("fetching");

    pending.resolve([]);
    await promise;
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });

  it("reports error on failure and recovers on the next success", async () => {
    const { service, client, integrationStatus } = setup();
    client.error = new SpeedrunComNotFoundError("nope");
    await service.searchGames("mario");
    expect(integrationStatus.value.speedrunCom.state).toBe("error");

    client.error = null;
    await service.searchGames("mario");
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });

  it("keeps fetching while another request is still in flight", async () => {
    const { service, client, integrationStatus } = setup();
    const pendingGame = deferred<ReturnType<typeof makeGameDetail>>();
    client.gamePromise = pendingGame.promise;
    client.searchGamesResult = [];

    const first = service.getGame("game-1");
    const second = service.searchGames("mario");
    await second;
    expect(integrationStatus.value.speedrunCom.state).toBe("fetching");

    pendingGame.resolve(makeGameDetail());
    await first;
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });
});
