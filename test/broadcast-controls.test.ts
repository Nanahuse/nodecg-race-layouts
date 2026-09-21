import { describe, expect, it } from "vitest";
import { canApply, canRetryPersistence } from "../ui/dashboard/model/broadcast-controls";

describe("broadcast control gating", () => {
  it("allows apply only when broadcast is ready and idle", () => {
    expect(canApply("ready", false)).toBe(true);
    expect(canApply("ready", true)).toBe(false);
    expect(canApply("error", false)).toBe(false);
  });

  it("allows persistence retry only for an errored non-empty queue", () => {
    expect(canRetryPersistence("error", 1, false)).toBe(true);
    expect(canRetryPersistence("error", 0, false)).toBe(false);
    expect(canRetryPersistence("ready", 1, false)).toBe(false);
    expect(canRetryPersistence("error", 1, true)).toBe(false);
  });
});
