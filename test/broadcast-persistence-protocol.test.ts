import { describe, expect, it } from "vitest";
import { BROADCAST_APPLY_MESSAGE } from "../src/protocol/broadcast";
import { PERSISTENCE_RETRY_MESSAGE } from "../src/protocol/persistence";
describe("broadcast persistence protocols", () => {
  it("keeps command names stable", () => {
    expect(BROADCAST_APPLY_MESSAGE).toBe("broadcast.apply");
    expect(PERSISTENCE_RETRY_MESSAGE).toBe("broadcast.persistence.retry");
  });
});
