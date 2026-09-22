import { describe, expect, it } from "vitest";
import {
  createEmptyPlayerInput,
  isEditInputEqual,
  isUsageBlockingEdit,
} from "../ui/dashboard/player-mapping/editor-model";

describe("player mapping editor model", () => {
  it("creates an empty input with all identities unlinked", () => {
    expect(createEmptyPlayerInput()).toEqual({
      manualDisplayName: "",
      racetime: { state: "none" },
      speedrunCom: { state: "none" },
      twitch: { state: "none" },
    });
  });
  it("detects dirty edits without normalizing user input", () => {
    const initial = createEmptyPlayerInput();
    expect(isEditInputEqual(initial, { ...initial, manualDisplayName: "Runner" })).toBe(false);
    expect(isEditInputEqual(initial, createEmptyPlayerInput())).toBe(true);
  });
  it("blocks edits for any active usage", () => {
    expect(isUsageBlockingEdit({ inDraft: true, onAir: false, pendingPersistence: false })).toBe(
      true,
    );
    expect(isUsageBlockingEdit({ inDraft: false, onAir: true, pendingPersistence: false })).toBe(
      true,
    );
    expect(isUsageBlockingEdit({ inDraft: false, onAir: false, pendingPersistence: true })).toBe(
      true,
    );
    expect(isUsageBlockingEdit({ inDraft: false, onAir: false, pendingPersistence: false })).toBe(
      false,
    );
  });
});
