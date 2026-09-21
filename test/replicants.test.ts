import { describe, expect, it } from "vitest";

import { declareReplicants } from "../src/replicants";
import { REPLICANT_NAMES } from "../src/replicants/names";
import { REPLICANT_SCHEMA_TYPES } from "../src/replicants/schema-types";
import type { NodeCG } from "../src/types/nodecg";

describe("declareReplicants", () => {
  it("declares every replicant with a default value", () => {
    const calls: { name: string; opts: unknown }[] = [];
    const nodecg = {
      Replicant: (name: string, opts?: unknown) => {
        calls.push({ name, opts });
        return { name, value: undefined, on: () => undefined };
      },
      log: {
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    } as unknown as NodeCG;

    declareReplicants(nodecg);

    expect(calls.map((call) => call.name)).toEqual([...REPLICANT_NAMES]);
    for (const call of calls) {
      expect(call.opts).toMatchObject({ persistent: expect.any(Boolean) });
      expect(call.opts).toHaveProperty("defaultValue");
    }
  });

  it("maps every replicant to a generated schema type", () => {
    for (const name of REPLICANT_NAMES) {
      expect(typeof REPLICANT_SCHEMA_TYPES[name]).toBe("string");
    }
  });
});
