import { describe, expect, it, vi } from "vitest";
import type {
  ActiveConfig,
  DraftConfig,
  PlayerDirectory,
  PlayerMapping,
  PostApplyPersistenceState,
} from "../src/domain";
import type { NodeCG, MessageHandler, Replicant } from "../src/types/nodecg";
import { makeActiveConfig } from "./factories";
import { PlayerMappingManagementService } from "../src/extension/application/player-mapping-management-service";
import type { PlayerDirectoryService } from "../src/extension/application/player-directory-service";
import type { SpeedrunDiscoveryService } from "../src/extension/application/speedrun-discovery-service";
import { createDefaultDraftConfig } from "../src/replicants/defaults";
import { registerPlayerDirectoryMessages } from "../src/extension/messages/player-directory-messages";
import {
  PLAYER_DIRECTORY_CREATE_MESSAGE,
  PLAYER_DIRECTORY_DELETE_MESSAGE,
  PLAYER_DIRECTORY_RELOAD_MESSAGE,
  PLAYER_DIRECTORY_UPDATE_MESSAGE,
} from "../src/protocol/player-directory";

const player = (id = "p1"): PlayerMapping => ({
  playerId: id,
  manualDisplayName: "Player",
  racetime: { state: "none" },
  speedrunCom: { state: "none" },
  twitch: { state: "linked", value: { userId: null, login: id } },
});

function replicant<T>(value: T): Replicant<T> {
  return {
    name: "test",
    value,
    on: (_event, _listener) => undefined,
  };
}

function service(
  directory: PlayerDirectory = {},
  options: {
    draft?: Partial<DraftConfig>;
    active?: ActiveConfig | null;
    queue?: PostApplyPersistenceState["queue"];
  } = {},
) {
  const directoryService: Pick<
    PlayerDirectoryService,
    "reloadFromSpreadsheet" | "savePlayers" | "deletePlayer"
  > = {
    reloadFromSpreadsheet: vi.fn<PlayerDirectoryService["reloadFromSpreadsheet"]>(async () => ({
      ok: true,
      playerCount: 0,
    })),
    savePlayers: vi.fn<PlayerDirectoryService["savePlayers"]>(async () => undefined),
    deletePlayer: vi.fn<PlayerDirectoryService["deletePlayer"]>(async () => undefined),
  };
  const speedrun: Pick<SpeedrunDiscoveryService, "getUser"> = {
    getUser: vi.fn<SpeedrunDiscoveryService["getUser"]>(),
  };
  const playerDirectory = replicant(directory);
  const management = new PlayerMappingManagementService({
    directoryService,
    playerDirectory,
    draftConfig: replicant({ ...createDefaultDraftConfig(), ...options.draft }),
    activeConfig: replicant(options.active ?? null),
    persistence: replicant<PostApplyPersistenceState>({
      state: "idle",
      queue: options.queue ?? [],
      lastSavedActiveRevision: null,
      message: null,
    }),
    speedrun,
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn() },
  });
  return { management, directoryService, playerDirectory, speedrun };
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

  it("preserves existing Speedrun.com metadata and Twitch user id on unchanged update", async () => {
    const current: PlayerMapping = {
      ...player(),
      speedrunCom: {
        state: "linked",
        value: { userId: "src-1", name: "Original SRC", twitchLogin: "src-runner" },
      },
      twitch: { state: "linked", value: { userId: "tw-1", login: "Runner" } },
    };
    const { management, directoryService, speedrun } = service({ p1: current });
    const result = await management.update("p1", current, {
      manualDisplayName: "Renamed",
      racetime: { state: "none" },
      speedrunCom: { state: "linked", userId: " src-1 " },
      twitch: { state: "linked", login: " runner " },
    });
    expect(result).toMatchObject({ ok: true });
    expect(speedrun.getUser).not.toHaveBeenCalled();
    expect(directoryService.savePlayers).toHaveBeenCalledOnce();
    if (result.ok) {
      expect(result.player.speedrunCom).toEqual(current.speedrunCom);
      expect(result.player.twitch).toEqual({
        state: "linked",
        value: { userId: "tw-1", login: "runner" },
      });
    }
  });

  it("looks up new or changed Speedrun.com identities", async () => {
    const current = {
      p1: {
        ...player(),
        speedrunCom: {
          state: "linked" as const,
          value: { userId: "src-old", name: "Old", twitchLogin: null },
        },
      },
    };
    const changed = service(current);
    vi.mocked(changed.speedrun.getUser).mockResolvedValueOnce({
      ok: true,
      user: { userId: "src-new", name: "New", twitchLogin: "new" },
    });
    expect(
      await changed.management.update("p1", current.p1, {
        ...input,
        speedrunCom: { state: "linked", userId: "src-new" },
      }),
    ).toMatchObject({ ok: true });
    expect(changed.speedrun.getUser).toHaveBeenCalledWith("src-new");

    const absent = service({ p1: player() });
    vi.mocked(absent.speedrun.getUser).mockResolvedValueOnce({
      ok: true,
      user: { userId: "src-new", name: "New", twitchLogin: null },
    });
    expect(
      await absent.management.update("p1", player(), {
        ...input,
        speedrunCom: { state: "linked", userId: "src-new" },
      }),
    ).toMatchObject({ ok: true });
    expect(absent.speedrun.getUser).toHaveBeenCalledWith("src-new");
  });

  it("clears Twitch user id only when the login changes and supports none", async () => {
    const current: PlayerMapping = {
      ...player(),
      twitch: { state: "linked", value: { userId: "tw-1", login: "Runner" } },
    };
    const same = service({ p1: current });
    const sameResult = await same.management.update("p1", current, {
      ...input,
      twitch: { state: "linked", login: "runner" },
    });
    expect(sameResult).toMatchObject({ ok: true });
    if (sameResult.ok)
      expect(sameResult.player.twitch).toEqual({
        state: "linked",
        value: { userId: "tw-1", login: "runner" },
      });
    const changed = service({ p1: current });
    const changedResult = await changed.management.update("p1", current, {
      ...input,
      twitch: { state: "linked", login: "other" },
    });
    expect(changedResult).toMatchObject({ ok: true });
    if (changedResult.ok)
      expect(changedResult.player.twitch).toEqual({
        state: "linked",
        value: { userId: null, login: "other" },
      });
    const cleared = service({ p1: current });
    const clearedResult = await cleared.management.update("p1", current, {
      ...input,
      twitch: { state: "none" },
    });
    if (clearedResult.ok) expect(clearedResult.player.twitch).toEqual({ state: "none" });
  });

  it("creates a schema-shaped RaceTime identity and trims Speedrun.com lookup ids", async () => {
    const { management, directoryService, speedrun } = service();
    vi.mocked(speedrun.getUser).mockResolvedValueOnce({
      ok: true,
      user: { userId: "src-1", name: "SRC Name", twitchLogin: "runner" },
    });
    const result = await management.create({
      manualDisplayName: "Runner",
      racetime: { state: "linked", userId: " rt-1 ", name: " RaceTime ", twitchLogin: " rt " },
      speedrunCom: { state: "linked", userId: " src-1 " },
      twitch: { state: "none" },
    });
    expect(result).toMatchObject({ ok: true });
    expect(speedrun.getUser).toHaveBeenCalledWith("src-1");
    expect(directoryService.savePlayers).toHaveBeenCalledOnce();
    if (result.ok) {
      expect(result.player.racetime).toEqual({
        state: "linked",
        value: { userId: "rt-1", name: "RaceTime", twitchLogin: "rt" },
      });
      if (result.player.racetime.state === "linked") {
        expect(result.player.racetime.value).not.toHaveProperty("state");
      } else {
        throw new Error("Expected linked RaceTime identity");
      }
      expect(result.player.speedrunCom).toEqual({
        state: "linked",
        value: { userId: "src-1", name: "SRC Name", twitchLogin: "runner" },
      });
    }
  });

  it("rejects blank RaceTime and Speedrun.com ids without lookup", async () => {
    const { management, speedrun } = service();
    expect(
      await management.create({
        ...input,
        manualDisplayName: "Runner",
        racetime: { state: "linked", userId: " ", name: "Name", twitchLogin: null },
      }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(
      await management.create({ ...input, speedrunCom: { state: "linked", userId: " " } }),
    ).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(speedrun.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "speedrun_user_not_found"],
    ["network_error", "speedrun_lookup_failed"],
  ] as const)("maps Speedrun.com lookup %s", async (reason, expected) => {
    const { management, speedrun } = service();
    vi.mocked(speedrun.getUser).mockResolvedValueOnce({
      ok: false,
      reason,
      message: "lookup failed",
    });
    expect(
      await management.create({ ...input, speedrunCom: { state: "linked", userId: "src-1" } }),
    ).toMatchObject({ ok: false, reason: expected });
  });

  it("rejects blank input without calling persistence", async () => {
    const current = { p1: player() };
    const { management, directoryService } = service(current);
    const result = await management.create({
      ...input,
      manualDisplayName: "  ",
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(directoryService.savePlayers).not.toHaveBeenCalled();
    expect(current.p1).toEqual(player());
  });

  it("preserves the directory when a valid create cannot be saved", async () => {
    const current = { p1: player() };
    const { management, directoryService, playerDirectory } = service(current);
    vi.mocked(directoryService.savePlayers).mockRejectedValueOnce(new Error("sheet down"));
    const result = await management.create(input);
    expect(result).toMatchObject({ ok: false, reason: "operation_failed" });
    expect(directoryService.savePlayers).toHaveBeenCalledOnce();
    expect(playerDirectory.value).toBe(current);
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

  it("deletes through the directory service and preserves stale/in-use guards", async () => {
    const current = { p1: player() };
    const success = service(current);
    expect(await success.management.delete("p1", player())).toEqual({ ok: true, playerId: "p1" });
    expect(success.directoryService.deletePlayer).toHaveBeenCalledOnce();
    expect(success.playerDirectory.value).toBe(current);

    const stale = service(current);
    expect(
      await stale.management.delete("p1", { ...player(), manualDisplayName: "Changed" }),
    ).toMatchObject({ ok: false, reason: "player_changed" });
    const inUse = service(current, { draft: { commentatorPlayerIds: ["p1"] } });
    expect(await inUse.management.delete("p1", player())).toMatchObject({
      ok: false,
      reason: "player_in_use",
    });
    expect(inUse.directoryService.deletePlayer).not.toHaveBeenCalled();
  });

  it("rejects updates for every in-use location", async () => {
    const cases: {
      draft?: Partial<DraftConfig>;
      active?: ActiveConfig | null;
      queue?: PostApplyPersistenceState["queue"];
    }[] = [
      { draft: { participants: [{ playerId: "p1", racetimeUserId: "rt-p1" }] } },
      { draft: { commentatorPlayerIds: ["p1"] } },
      { active: makeActiveConfig({ participants: [{ playerId: "p1", racetimeUserId: "rt" }] }) },
      { active: makeActiveConfig({ commentatorPlayerIds: ["p1"] }) },
      {
        queue: [
          {
            activeRevision: 1,
            appliedAt: "2026-01-01T00:00:00.000Z",
            players: [player()],
            raceHistory: {
              racetimeUrl: "https://racetime.gg/race",
              raceId: "race",
              categorySlug: "category",
              categoryName: "Category",
              goal: "Goal",
              participants: {},
              raceScreenSlots: { 1: null, 2: null, 3: null, 4: null },
              commentatorPlayerIds: [],
            },
            attempts: 0,
            lastError: null,
          },
        ],
      },
    ];
    for (const options of cases) {
      const { management, directoryService } = service({ p1: player() }, options);
      const result = await management.update("p1", player(), input);
      expect(result).toMatchObject({ ok: false, reason: "player_in_use" });
      expect(directoryService.savePlayers).not.toHaveBeenCalled();
    }
  });

  it("updates through the directory service and leaves the replicant to its owner", async () => {
    const current = { p1: player() };
    const { management, directoryService, playerDirectory } = service(current);
    const result = await management.update("p1", player(), input);
    expect(result).toMatchObject({ ok: true });
    expect(directoryService.savePlayers).toHaveBeenCalledOnce();
    expect(playerDirectory.value).toBe(current);
  });

  it("maps update and delete persistence failures without mutating the directory", async () => {
    const current = { p1: player() };
    const update = service(current);
    vi.mocked(update.directoryService.savePlayers).mockRejectedValueOnce(new Error("update down"));
    expect(await update.management.update("p1", player(), input)).toMatchObject({
      ok: false,
      reason: "operation_failed",
    });
    expect(update.playerDirectory.value).toBe(current);

    const removal = service(current);
    vi.mocked(removal.directoryService.deletePlayer).mockRejectedValueOnce(
      new Error("delete down"),
    );
    expect(await removal.management.delete("p1", player())).toMatchObject({
      ok: false,
      reason: "operation_failed",
    });
    expect(removal.playerDirectory.value).toBe(current);
  });

  it("returns reload outcomes from PlayerDirectoryService", async () => {
    const success = service();
    vi.mocked(success.directoryService.reloadFromSpreadsheet).mockResolvedValueOnce({
      ok: true,
      playerCount: 3,
    });
    expect(await success.management.reload()).toEqual({ ok: true, playerCount: 3 });
    const failure = service();
    vi.mocked(failure.directoryService.reloadFromSpreadsheet).mockResolvedValueOnce({
      ok: false,
      message: "sheet down",
    });
    expect(await failure.management.reload()).toMatchObject({
      ok: false,
      reason: "operation_failed",
    });
  });

  it("keeps all handlers available when spreadsheet integration is unavailable", async () => {
    const handlers = new Map<string, MessageHandler>();
    const nodecg: NodeCG = {
      Replicant: <_T>() => {
        throw new Error("Replicant is not used in this test");
      },
      listenFor: (name, handler) => handlers.set(name, handler),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() },
      bundleConfig: undefined,
      bundleVersion: "test",
    };
    registerPlayerDirectoryMessages(nodecg, null);
    for (const name of [
      PLAYER_DIRECTORY_RELOAD_MESSAGE,
      PLAYER_DIRECTORY_CREATE_MESSAGE,
      PLAYER_DIRECTORY_UPDATE_MESSAGE,
      PLAYER_DIRECTORY_DELETE_MESSAGE,
    ]) {
      expect(handlers.has(name)).toBe(true);
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Handler ${name} was not registered`);
      const response = await new Promise<unknown>((resolve) => {
        void handler({}, (_error, value) => resolve(value));
      });
      expect(response).toMatchObject({ ok: false, reason: "player_directory_unavailable" });
    }
  });
});
