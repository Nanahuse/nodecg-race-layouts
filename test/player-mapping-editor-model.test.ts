import { describe, expect, it } from "vitest";
import {
  createEmptyPlayerInput,
  isEditInputEqual,
  isPlayerMappingEqual,
  isUsageBlockingEdit,
  playerMappingToEditInput,
} from "../ui/dashboard/player-mapping/editor-model";
import type { PlayerMapping } from "../src/domain";

const linkedPlayer = (): PlayerMapping => ({
  playerId: "p1",
  manualDisplayName: "Runner",
  racetime: { state: "linked", value: { userId: "rt1", name: "Race Runner", twitchLogin: "rt" } },
  speedrunCom: {
    state: "linked",
    value: { userId: "src1", name: "SRC Runner", twitchLogin: "src" },
  },
  twitch: { state: "linked", value: { userId: "tw1", login: "runner" } },
});

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
  it("converts linked identities to editable fields", () => {
    expect(playerMappingToEditInput(linkedPlayer())).toEqual({
      manualDisplayName: "Runner",
      racetime: { state: "linked", userId: "rt1", name: "Race Runner", twitchLogin: "rt" },
      speedrunCom: { state: "linked", userId: "src1" },
      twitch: { state: "linked", login: "runner" },
    });
  });
  it("compares complete player mappings", () => {
    const player = linkedPlayer();
    expect(isPlayerMappingEqual(player, { ...player, manualDisplayName: "Other" })).toBe(false);
    expect(isPlayerMappingEqual(player, linkedPlayer())).toBe(true);
  });
  it("marks each identity edit dirty", () => {
    const input = playerMappingToEditInput(linkedPlayer());
    expect(
      isEditInputEqual(input, { ...input, racetime: { ...input.racetime, state: "none" } }),
    ).toBe(false);
    expect(
      isEditInputEqual(input, { ...input, speedrunCom: { state: "linked", userId: "other" } }),
    ).toBe(false);
    expect(isEditInputEqual(input, { ...input, twitch: { state: "linked", login: "other" } })).toBe(
      false,
    );
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
