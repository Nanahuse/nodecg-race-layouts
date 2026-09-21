import { describe, expect, it } from "vitest";
import { SpreadsheetOperationStatusCoordinator } from "../src/extension/application/spreadsheet-status-coordinator";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import { TrackingReplicant } from "./support/fakes";
import type { IntegrationStatus } from "../src/domain";

function make() {
  const status = new TrackingReplicant<IntegrationStatus>(
    "status",
    createDefaultIntegrationStatus(),
  );
  return { status, coordinator: new SpreadsheetOperationStatusCoordinator(status) };
}
describe("SpreadsheetOperationStatusCoordinator", () => {
  it("retains a failure until the concurrent batch ends", () => {
    const { status, coordinator } = make();
    const a = coordinator.begin("saving");
    const b = coordinator.begin("saving");
    a.failure("A failed");
    expect(status.value.spreadsheet.state).toBe("saving");
    b.success();
    expect(status.value.spreadsheet.state).toBe("error");
    expect(status.value.spreadsheet.message).toBe("A failed");
  });
  it("supports nested operations and recovery", () => {
    const { status, coordinator } = make();
    const outer = coordinator.begin("saving");
    const inner = coordinator.begin("saving");
    inner.success();
    expect(status.value.spreadsheet.state).toBe("saving");
    outer.success();
    expect(status.value.spreadsheet.state).toBe("saved");
    const next = coordinator.begin("saving");
    next.success();
    expect(status.value.spreadsheet.state).toBe("saved");
  });
  it("prioritizes saving over loading", () => {
    const { status, coordinator } = make();
    const loading = coordinator.begin("loading");
    const saving = coordinator.begin("saving");
    saving.success();
    expect(status.value.spreadsheet.state).toBe("loading");
    loading.success();
    expect(status.value.spreadsheet.state).toBe("saved");
  });
  it("ignores duplicate token completion", () => {
    const { status, coordinator } = make();
    const token = coordinator.begin("saving");
    token.success("done");
    token.failure("late");
    expect(status.value.spreadsheet.state).toBe("saved");
    expect(status.value.spreadsheet.message).toBe("done");
  });
});
