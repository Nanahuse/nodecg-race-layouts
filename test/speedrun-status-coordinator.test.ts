import { describe, expect, it } from "vitest";

import type { IntegrationStatus } from "../src/domain";
import { SpeedrunOperationStatusCoordinator } from "../src/extension/application/speedrun-status-coordinator";
import { SpeedrunComNotFoundError } from "../src/extension/integrations/speedruncom/errors";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import { deferred } from "./support/speedrun-fakes";

function setup() {
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );
  const fakeLogger = createFakeLogger();
  const coordinator = new SpeedrunOperationStatusCoordinator({
    integrationStatus,
    log: fakeLogger.logger,
  });
  return { coordinator, integrationStatus, fakeLogger };
}

describe("SpeedrunOperationStatusCoordinator", () => {
  it("reports fetching then ready", async () => {
    const { coordinator, integrationStatus } = setup();
    const pending = deferred<string>();

    const promise = coordinator.run("op", () => pending.promise);
    expect(integrationStatus.value.speedrunCom.state).toBe("fetching");

    pending.resolve("ok");
    await promise;
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });

  it("reports error and recovers", async () => {
    const { coordinator, integrationStatus } = setup();

    await expect(
      coordinator.run("op", async () => {
        throw new SpeedrunComNotFoundError("nope");
      }),
    ).rejects.toBeInstanceOf(SpeedrunComNotFoundError);
    expect(integrationStatus.value.speedrunCom.state).toBe("error");

    await coordinator.run("op", async () => "ok");
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });

  it("keeps fetching while another operation is in flight", async () => {
    const { coordinator, integrationStatus } = setup();
    const first = deferred<string>();

    const firstPromise = coordinator.run("first", () => first.promise);
    const secondPromise = coordinator.run("second", async () => "second");
    await secondPromise;
    expect(integrationStatus.value.speedrunCom.state).toBe("fetching");

    first.resolve("first");
    await firstPromise;
    expect(integrationStatus.value.speedrunCom.state).toBe("ready");
  });

  it("tracks the in-flight count", async () => {
    const { coordinator } = setup();
    const pending = deferred<string>();
    const promise = coordinator.run("op", () => pending.promise);
    expect(coordinator.inFlightCount).toBe(1);
    pending.resolve("ok");
    await promise;
    expect(coordinator.inFlightCount).toBe(0);
  });
});
