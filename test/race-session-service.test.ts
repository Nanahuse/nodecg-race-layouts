import { describe, expect, it } from "vitest";

import type { IntegrationStatus, RaceSession } from "../src/domain";
import { RaceSessionService } from "../src/extension/application/race-session-service";
import { RaceNotFoundError } from "../src/extension/integrations/racetime/errors";
import type { RaceTimeRaceDto } from "../src/extension/integrations/racetime/types";
import {
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import {
  FakeRaceTimeClient,
  FakeScheduler,
  FakeWebSocketFactory,
  flushPromises,
  makeRaceDto,
} from "./support/racetime-fakes";

const URL_A = "https://racetime.gg/ootr/race-a";
const URL_B = "https://racetime.gg/ootr/race-b";

function dtoFor(canonical: { categorySlug: string; raceSlug: string }, status = "open") {
  return makeRaceDto({
    categorySlug: canonical.categorySlug,
    slug: canonical.raceSlug,
    name: `${canonical.categorySlug}/${canonical.raceSlug}`,
    status,
  });
}

function setup() {
  const client = new FakeRaceTimeClient();
  client.handler = async (canonical) => dtoFor(canonical);

  const factory = new FakeWebSocketFactory();
  const scheduler = new FakeScheduler();
  const fakeLogger = createFakeLogger();

  const draft = new TrackingReplicant<RaceSession>(
    "draft-race-session",
    createDefaultRaceSession(),
    [],
  );
  const active = new TrackingReplicant<RaceSession>(
    "active-race-session",
    createDefaultRaceSession(),
    [],
  );
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );

  const service = new RaceSessionService({
    client,
    webSocketFactory: factory.create,
    scheduler,
    log: fakeLogger.logger,
    sessions: { draft, active },
    integrationStatus,
  });

  return { service, client, factory, scheduler, fakeLogger, draft, active, integrationStatus };
}

describe("RaceSessionService load", () => {
  it("rejects an invalid URL without creating a session", async () => {
    const { service, draft } = setup();

    const ok = await service.loadRace("draft", "https://example.com/foo/bar");

    expect(ok).toBe(false);
    expect(draft.value.race).toBeNull();
    expect(draft.value.revision).toBe(0);
  });

  it("keeps the existing session when a new load fails", async () => {
    const { service, client, factory, draft } = setup();
    await service.loadRace("draft", URL_A);
    const before = draft.value;
    const socketsBefore = factory.sockets.length;

    client.handler = async () => {
      throw new RaceNotFoundError("nope");
    };
    const ok = await service.loadRace("draft", URL_B);

    expect(ok).toBe(false);
    expect(draft.value).toBe(before);
    expect(draft.value.race?.raceId).toBe("ootr/race-a");
    expect(factory.sockets).toHaveLength(socketsBefore);
  });

  it("switches races and stops the previous watcher", async () => {
    const { service, factory, draft } = setup();
    await service.loadRace("draft", URL_A);
    const revisionAfterA = draft.value.revision;
    const oldSocket = factory.sockets[0];

    await service.loadRace("draft", URL_B);

    expect(draft.value.race?.raceId).toBe("ootr/race-b");
    expect(draft.value.revision).toBeGreaterThan(revisionAfterA);
    expect(oldSocket?.closed).toBe(true);
  });
});

describe("RaceSessionService draft / active independence", () => {
  it("manages draft and active sessions separately", async () => {
    const { service, draft, active } = setup();

    await service.loadRace("draft", URL_A);
    await service.loadRace("active", URL_B);

    expect(draft.value.race?.raceId).toBe("ootr/race-a");
    expect(active.value.race?.raceId).toBe("ootr/race-b");
  });

  it("does not let a draft update change the active session", async () => {
    const { service, client, factory, draft, active } = setup();
    let draftStatus = "open";
    client.handler = async (canonical) =>
      dtoFor(canonical, canonical.raceSlug === "race-a" ? draftStatus : "open");

    await service.loadRace("draft", URL_A);
    await service.loadRace("active", URL_B);
    const activeBefore = active.value;

    draftStatus = "in_progress";
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();

    expect(draft.value.race?.status).toBe("in_progress");
    expect(active.value).toBe(activeBefore);
  });

  it("does not let a stale response overwrite the new session", async () => {
    const { service, client, factory, draft } = setup();
    await service.loadRace("draft", URL_A);

    let resolveStale: ((dto: RaceTimeRaceDto) => void) | undefined;
    client.handler = () =>
      new Promise<RaceTimeRaceDto>((resolve) => {
        resolveStale = resolve;
      });

    factory.sockets[0]?.emitMessage({ type: "race.data" });

    client.handler = async (canonical) => dtoFor(canonical);
    await service.loadRace("draft", URL_B);

    resolveStale?.(dtoFor({ categorySlug: "ootr", raceSlug: "race-a" }, "cancelled"));
    await flushPromises();

    expect(draft.value.race?.raceId).toBe("ootr/race-b");
    expect(draft.value.race?.status).toBe("open");
  });
});

describe("RaceSessionService connection recovery", () => {
  it("keeps the race and recovers to connected after a temporary error", async () => {
    const { service, factory, scheduler, draft, integrationStatus } = setup();
    await service.loadRace("draft", URL_A);

    factory.sockets[0]?.emitOpen();
    expect(integrationStatus.value.racetime.state).toBe("connected");

    factory.sockets[0]?.emitClose();
    expect(integrationStatus.value.racetime.state).toBe("connecting");
    expect(draft.value.race?.raceId).toBe("ootr/race-a");

    scheduler.runNext();
    await flushPromises();
    factory.last?.emitOpen();

    expect(draft.value.race?.raceId).toBe("ootr/race-a");
    expect(integrationStatus.value.racetime.state).toBe("connected");
  });

  it("aggregates integration status across roles", async () => {
    const { service, factory, integrationStatus } = setup();

    await service.loadRace("draft", URL_A);
    await service.loadRace("active", URL_B);
    expect(integrationStatus.value.racetime.state).toBe("connecting");

    factory.sockets[0]?.emitOpen();
    expect(integrationStatus.value.racetime.state).toBe("connected");
  });
});

describe("RaceSessionService revision", () => {
  it("increments the revision only when the normalized race changes", async () => {
    const { service, client, factory, draft } = setup();
    await service.loadRace("draft", URL_A);
    factory.sockets[0]?.emitOpen();
    const revision = draft.value.revision;

    // identical snapshot
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();
    expect(draft.value.revision).toBe(revision);

    // changed snapshot
    client.handler = async (canonical) => dtoFor(canonical, "in_progress");
    factory.sockets[0]?.emitMessage({ type: "race.data" });
    await flushPromises();
    expect(draft.value.revision).toBe(revision + 1);
  });
});
