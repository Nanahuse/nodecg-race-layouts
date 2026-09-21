import { describe, expect, it } from "vitest";

import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import { isValid } from "./helpers";

describe("integration-status schema", () => {
  it("accepts reconciliation_required as a broadcast state", () => {
    const status = createDefaultIntegrationStatus();
    status.broadcast = { ...status.broadcast, state: "reconciliation_required" };
    expect(isValid("integration-status", status)).toBe(true);
  });

  it("rejects an unknown broadcast state", () => {
    const status = createDefaultIntegrationStatus() as {
      broadcast: { state: string };
    };
    status.broadcast = { ...status.broadcast, state: "nonsense" };
    expect(isValid("integration-status", status)).toBe(false);
  });
});
