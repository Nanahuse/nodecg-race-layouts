import { describe, expect, it } from "vitest";
import { RACE_LOAD_MESSAGE, RACE_RECONCILE_MESSAGE } from "../src/protocol/race";
import { statusTone } from "../ui/dashboard/model/status";

describe("dashboard foundation protocol", () => {
  it("uses stable race message names", () => {
    expect(RACE_LOAD_MESSAGE).toBe("race.load");
    expect(RACE_RECONCILE_MESSAGE).toBe("race.reconcile");
  });

  it("maps status values to presentation tones", () => {
    expect(statusTone("connected")).toBe("success");
    expect(statusTone("reconciliation_required")).toBe("warning");
    expect(statusTone("error")).toBe("error");
    expect(statusTone("unknown")).toBe("neutral");
  });
});
