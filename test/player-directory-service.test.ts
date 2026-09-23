import { describe, expect, it } from "vitest";

import type { IntegrationStatus, PlayerDirectory } from "../src/domain";
import { PlayerDirectoryService } from "../src/extension/application/player-directory-service";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import { makeActivePlayer } from "./factories";
import { createFakeLogger, FakePlayersRepository, TrackingReplicant } from "./support/fakes";

function createService(options: {
  repository: FakePlayersRepository;
  playerDirectory: TrackingReplicant<PlayerDirectory>;
  integrationStatus: TrackingReplicant<IntegrationStatus>;
  events: string[];
}) {
  const fakeLogger = createFakeLogger();
  const service = new PlayerDirectoryService({
    repository: options.repository,
    playerDirectory: options.playerDirectory,
    integrationStatus: options.integrationStatus,
    log: fakeLogger.logger,
    sheetName: "Players",
  });
  return { service, fakeLogger };
}

function setup(initialDirectory: PlayerDirectory = {}) {
  const events: string[] = [];
  const repository = new FakePlayersRepository(events);
  const playerDirectory = new TrackingReplicant<PlayerDirectory>(
    "player-directory",
    initialDirectory,
    events,
  );
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    events,
  );
  const { service, fakeLogger } = createService({
    repository,
    playerDirectory,
    integrationStatus,
    events,
  });
  return { service, repository, playerDirectory, integrationStatus, fakeLogger, events };
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

describe("PlayerDirectoryService.reloadFromSpreadsheet", () => {
  it("replaces the directory and reports success", async () => {
    const { service, repository, playerDirectory, integrationStatus } = setup();
    const p1 = makeActivePlayer("p1");
    repository.loadAllResult = { p1 };

    await service.reloadFromSpreadsheet();

    expect(playerDirectory.value).toEqual({ p1 });
    expect(integrationStatus.value.spreadsheet.state).toBe("idle");
    expect(integrationStatus.value.spreadsheet.message).toContain("1");
  });

  it("keeps the previous directory when the spreadsheet load fails", async () => {
    const p1 = makeActivePlayer("p1");
    const existing: PlayerDirectory = { p1 };
    const { service, repository, playerDirectory, integrationStatus, events } = setup(existing);
    repository.loadAllError = new Error("spreadsheet unavailable");

    await service.reloadFromSpreadsheet();

    expect(playerDirectory.value).toBe(existing);
    expect(integrationStatus.value.spreadsheet.state).toBe("error");
    expect(integrationStatus.value.spreadsheet.message).toBe("spreadsheet unavailable");
    expect(events.filter((event) => event === "set:player-directory")).toHaveLength(0);
  });
});

describe("PlayerDirectoryService.savePlayers", () => {
  it("writes to the spreadsheet before updating the replicant", async () => {
    const { service, repository, playerDirectory, integrationStatus, events } = setup();
    const p1 = makeActivePlayer("p1");

    await service.savePlayers([p1]);

    expect(repository.upserted).toEqual([[p1]]);
    expect(playerDirectory.value).toEqual({ p1 });
    expect(integrationStatus.value.spreadsheet.state).toBe("saved");
    expect(events.indexOf("repository.upsert")).toBeLessThan(
      events.indexOf("set:player-directory"),
    );
  });

  it("detaches players received from another proxied Replicant", async () => {
    const { service, repository, playerDirectory, integrationStatus } = setup();
    const player = nodecgProxy(makeActivePlayer("p1"));

    await service.savePlayers([player]);

    expect(repository.upserted).toHaveLength(1);
    expect(playerDirectory.value.p1).toEqual(player);
    expect(() => structuredClone(playerDirectory.value)).not.toThrow();
    expect(integrationStatus.value.spreadsheet.state).toBe("saved");
  });

  it("does not update the replicant when the spreadsheet write fails", async () => {
    const p1 = makeActivePlayer("p1");
    const existing: PlayerDirectory = { p1 };
    const { service, repository, playerDirectory, integrationStatus, events } = setup(existing);
    repository.upsertError = new Error("write failed");

    await expect(service.savePlayers([makeActivePlayer("p2")])).rejects.toThrow("write failed");

    expect(playerDirectory.value).toBe(existing);
    expect(integrationStatus.value.spreadsheet.state).toBe("error");
    expect(events.filter((event) => event === "set:player-directory")).toHaveLength(0);
  });
});

describe("PlayerDirectoryService.deletePlayer", () => {
  it("deletes from the spreadsheet and removes the player from the replicant", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2");
    const { service, repository, playerDirectory, integrationStatus } = setup({ p1, p2 });

    await service.deletePlayer("p1");

    expect(repository.deleted).toEqual(["p1"]);
    expect(playerDirectory.value).toEqual({ p2 });
    expect(integrationStatus.value.spreadsheet.state).toBe("saved");
  });

  it("keeps the replicant unchanged when the spreadsheet delete fails", async () => {
    const p1 = makeActivePlayer("p1");
    const existing: PlayerDirectory = { p1 };
    const { service, repository, playerDirectory, integrationStatus } = setup(existing);
    repository.deleteError = new Error("delete failed");

    await expect(service.deletePlayer("p1")).rejects.toThrow("delete failed");

    expect(playerDirectory.value).toBe(existing);
    expect(integrationStatus.value.spreadsheet.state).toBe("error");
  });
});
