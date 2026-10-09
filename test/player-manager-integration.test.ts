import { describe, expect, it } from "vitest";

import type { IntegrationStatus } from "../src/domain";
import { createDraftPersonFromEntrant } from "../src/domain/draft-person";
import {
  bindDraftPersonFromDirectory,
  bindPlayerToDraftPerson,
  createRaceTimePlayerIndex,
  playerToSnapshot,
} from "../src/extension/integrations/player-manager/mapper";
import {
  createPlayerManagerGateway,
  PlayerManagerIntegrationError,
  setupPlayerManagerIntegration,
} from "../src/extension/integrations/player-manager/client";
import type {
  MatchingInput,
  Player,
  PlayerManagerAPI,
  RequiredAccount,
} from "@nanahuse/player-manager-protocol";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import type { NodeCG, Replicant } from "../src/types/nodecg";

const player: Player = {
  playerId: "canonical-1",
  revision: 4,
  manualDisplayName: "Manual name",
  racetime: { userId: "rt-1", name: "Race Time", weblink: "https://racetime.gg/user/rt-1" },
  speedrunCom: { userId: "src-1", name: "Speedrun name" },
  twitch: { userId: "twitch-id", login: "twitch_login", displayName: "Twitch display" },
  youtube: "https://youtube.com/@runner",
};

function makeApi(
  overrides: Partial<PlayerManagerAPI> = {},
  requests: Array<{ operation: string; request: unknown }> = [],
): PlayerManagerAPI {
  return {
    apiVersion: 2,
    ready: Promise.resolve(),
    request: async (operation, request) => {
      requests.push({ operation, request });
      const data =
        operation === "list"
          ? { schemaVersion: 1, revision: 4, players: [player] }
          : operation === "get"
            ? player
            : operation === "beginRegistration"
              ? { registrationId: "reg-1", url: "https://example.test/reg-1" }
              : null;
      return { ok: true, data } as never;
    },
    ...overrides,
  };
}

function nodecg(api?: unknown): NodeCG {
  return {
    bundleVersion: "0.1.0",
    bundleConfig: {},
    extensions: api === undefined ? {} : { "player-manager": api },
    Replicant: (() => ({
      name: "integration-status",
      value: createDefaultIntegrationStatus(),
      on: () => {},
    })) as NodeCG["Replicant"],
    listenFor: () => {},
    log: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
  };
}

describe("Player Manager gateway", () => {
  it("connects to v2 and sends MatchingInput with requiredAccounts", async () => {
    const requests: Array<{ operation: string; request: unknown }> = [];
    const gateway = createPlayerManagerGateway(nodecg(makeApi({}, requests)));
    await gateway.ready;
    expect(await gateway.list()).toEqual([player]);
    expect(await gateway.get("canonical-1")).toEqual(player);
    const input: MatchingInput = { racetime: "rt-1" };
    const requiredAccounts: RequiredAccount[] = [{ service: "racetime", value: "rt-1" }];
    expect(await gateway.beginRegistration(input, requiredAccounts)).toEqual({
      registrationId: "reg-1",
      url: "https://example.test/reg-1",
    });
    expect(requests.at(-1)).toEqual({
      operation: "beginRegistration",
      request: { input, requiredAccounts },
    });
  });

  it("maps Player Manager response errors to a common integration error", async () => {
    const api = makeApi({
      request: async () =>
        ({
          ok: false,
          error: { code: "directory_unavailable", message: "Storage offline" },
        }) as never,
    });
    const gateway = createPlayerManagerGateway(nodecg(api));
    await expect(gateway.get("x")).rejects.toMatchObject({
      name: "PlayerManagerIntegrationError",
      code: "player_manager_error",
      message: "Storage offline",
    });
  });

  it("reports unavailable and version mismatch without throwing during bootstrap", async () => {
    const unavailable = createPlayerManagerGateway(nodecg());
    await expect(unavailable.ready).rejects.toMatchObject({ code: "unavailable" });
    const wrongVersion = createPlayerManagerGateway(nodecg({ ...makeApi(), apiVersion: 1 }));
    await expect(wrongVersion.ready).rejects.toMatchObject({ code: "version_mismatch" });
    expect(wrongVersion).toBeDefined();
  });

  it("records ready, unavailable, and error status without failing setup", async () => {
    const status = {
      value: createDefaultIntegrationStatus(),
      name: "integration-status",
      on() {},
    } as Replicant<IntegrationStatus>;
    const ready = setupPlayerManagerIntegration(nodecg(makeApi()), status);
    await ready.ready;
    await Promise.resolve();
    expect(status.value.playerManager).toEqual({ state: "ready", message: null });
    const unavailableStatus = { ...status, value: createDefaultIntegrationStatus() };
    setupPlayerManagerIntegration(nodecg(), unavailableStatus);
    await Promise.resolve();
    await Promise.resolve();
    expect(unavailableStatus.value.playerManager.state).toBe("unavailable");

    const errorStatus = { ...status, value: createDefaultIntegrationStatus() };
    const mismatch = setupPlayerManagerIntegration(
      nodecg({ ...makeApi(), apiVersion: 1 }),
      errorStatus,
    );
    await expect(mismatch.ready).rejects.toMatchObject({ code: "version_mismatch" });
    await Promise.resolve();
    expect(errorStatus.value.playerManager.state).toBe("error");
  });

  it("reports a rejected Player Manager initialization as unavailable", async () => {
    const gateway = createPlayerManagerGateway(
      nodecg(makeApi({ ready: Promise.reject(new Error("startup failed")) })),
    );
    await expect(gateway.ready).rejects.toMatchObject({ code: "unavailable" });
  });

  it("uses a typed integration error class", () => {
    expect(new PlayerManagerIntegrationError("request_failed", "failed")).toBeInstanceOf(Error);
  });
});

describe("Player Manager mapping and Draft Person", () => {
  it("maps a Player into a snapshot without revision and uses the public display-name resolver", () => {
    expect(playerToSnapshot(player)).toEqual({
      playerId: "canonical-1",
      displayName: "Manual name",
      racetime: { userId: "rt-1", name: "Race Time" },
      speedrunCom: { userId: "src-1", name: "Speedrun name" },
      twitch: { userId: "twitch-id", login: "twitch_login", displayName: "Twitch display" },
      youtube: "https://youtube.com/@runner",
    });
    expect("revision" in playerToSnapshot(player)).toBe(false);
  });

  it("uses Twitch display fallback, preserves missing accounts as null, and leaves YouTube null", () => {
    expect(
      playerToSnapshot({
        ...player,
        manualDisplayName: null,
        racetime: null,
        speedrunCom: null,
        twitch: { userId: null, login: "fallback", displayName: "Twitch Name" },
        youtube: null,
      }),
    ).toMatchObject({
      displayName: "Twitch Name",
      racetime: null,
      speedrunCom: null,
      twitch: { userId: null, login: "fallback", displayName: "Twitch Name" },
      youtube: null,
    });
  });

  it("creates an unresolved person with a Race Layouts ref and binds only a canonical Player id", () => {
    const person = createDraftPersonFromEntrant({
      racetimeUserId: "rt-new",
      racetimeName: "Runner",
      twitchLogin: "runner",
      ref: "opaque-ref",
    });
    expect(person).toEqual({
      ref: "opaque-ref",
      playerId: null,
      identity: { racetimeUserId: "rt-new", twitchLogin: "runner", speedrunComUserId: null },
      player: null,
      resolution: "unresolved",
    });
    expect(bindPlayerToDraftPerson(person, player)).toMatchObject({
      playerId: "canonical-1",
      resolution: "matched",
      player: { playerId: "canonical-1" },
    });
  });

  it("binds only an exact RaceTime Directory match and clears removed accounts", () => {
    const person = {
      ...createDraftPersonFromEntrant({
        racetimeUserId: "rt-1",
        racetimeName: "Runner",
        twitchLogin: "twitch_login",
        ref: "ref",
      }),
      playerId: "old",
      player: playerToSnapshot(player),
      resolution: "matched" as const,
    };
    const twitchOnly: Player = { ...player, playerId: "twitch-only", racetime: null };
    const index = createRaceTimePlayerIndex([twitchOnly]);
    expect(bindDraftPersonFromDirectory(person, "rt-1", index)).toMatchObject({
      playerId: null,
      player: null,
      resolution: "unresolved",
    });
    expect(
      bindDraftPersonFromDirectory(person, "rt-1", createRaceTimePlayerIndex([player])),
    ).toMatchObject({
      playerId: "canonical-1",
      player: { playerId: "canonical-1" },
      resolution: "matched",
    });
  });
});
