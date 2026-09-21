import { describe, expect, it, vi } from "vitest";
import type {
  ActiveConfig,
  DraftConfig,
  PlayerDirectory,
  PlayerMapping,
  PostApplyPersistenceState,
} from "../src/domain";
import { PlayerMappingManagementService } from "../src/extension/application/player-mapping-management-service";
import type { PlayerDirectoryService } from "../src/extension/application/player-directory-service";

const player = (id = "p1"): PlayerMapping => ({
  playerId: id,
  manualDisplayName: "Player",
  racetime: { state: "none" },
  speedrunCom: { state: "none" },
  twitch: { state: "linked", value: { userId: null, login: id } },
});

function replicant<T>(value: T) {
  return { name: "test", value, on: vi.fn() } as never;
}

function service(directory: PlayerDirectory = {}) {
  const directoryService = {
    reloadFromSpreadsheet: vi.fn(async () => ({ ok: true as const, playerCount: 0 })),
    savePlayers: vi.fn(async () => undefined),
    deletePlayer: vi.fn(async () => undefined),
  } as unknown as PlayerDirectoryService;
  const speedrun = { getUser: vi.fn() };
  const management = new PlayerMappingManagementService({
    directoryService,
    playerDirectory: replicant(directory),
    draftConfig: replicant({
      participants: [],
      commentatorPlayerIds: [],
    } as unknown as DraftConfig),
    activeConfig: replicant(null as ActiveConfig | null),
    persistence: replicant({ queue: [] } as unknown as PostApplyPersistenceState),
    speedrun: speedrun as never,
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn() },
  });
  return { management, directoryService };
}

const input = {
  manualDisplayName: " New Player ",
  racetime: { state: "none" as const },
  speedrunCom: { state: "none" as const },
  twitch: { state: "linked" as const, login: "new-player" },
};

describe("PlayerMappingManagementService", () => {
  it("creates a normalized player only after spreadsheet persistence", async () => {
    const { management, directoryService } = service();
    const result = await management.create(input);
    expect(result.ok).toBe(true);
    expect(directoryService.savePlayers).toHaveBeenCalledOnce();
    if (result.ok) expect(result.player.manualDisplayName).toBe("New Player");
  });

  it("rejects blank input and preserves the directory on persistence failure", async () => {
    const current = { p1: player() };
    const { management, directoryService } = service(current);
    vi.mocked(directoryService.savePlayers).mockRejectedValueOnce(new Error("sheet down"));
    const result = await management.create({
      ...input,
      manualDisplayName: "  ",
      twitch: { state: "none" },
    });
    expect(result.ok).toBe(false);
    expect(current.p1).toEqual(player());
  });

  it("guards stale updates and players used by draft", async () => {
    const current = { p1: player() };
    const { management } = service(current);
    const stale = await management.update("p1", { ...current.p1, manualDisplayName: "Old" }, input);
    expect(stale).toMatchObject({ ok: false, reason: "player_changed" });
  });

  it("rejects delete when the player is missing", async () => {
    const { management } = service();
    expect(await management.delete("missing", player("missing"))).toMatchObject({
      ok: false,
      reason: "player_not_found",
    });
  });
});
