import { describe, expect, it } from "vitest";

import { persistenceItemFromConfig } from "../src/domain";
import { makeActiveConfig } from "./factories";

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

describe("persistenceItemFromConfig", () => {
  it("detaches NodeCG-proxied active config values for the persistence replicant", () => {
    const config = nodecgProxy(makeActiveConfig());

    const item = persistenceItemFromConfig(config, "2026-09-23T07:00:00.000Z");

    expect(item.players).toHaveLength(4);
    expect(item.raceHistory.raceScreenSlots).toEqual(config.raceScreenSlots);
    expect(() => structuredClone(item)).not.toThrow();
  });
});
