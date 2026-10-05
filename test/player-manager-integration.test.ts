import { describe, expect, it } from "vitest";

import type { IntegrationStatus } from "../src/domain";
import {
  applyResolutionToDraftPerson,
  createDraftPersonFromEntrant,
} from "../src/domain/draft-person";
import {
  bindPlayerToDraftPerson,
  playerToSnapshot,
} from "../src/extension/integrations/player-manager/mapper";
import {
  createPlayerManagerGateway,
  PlayerManagerIntegrationError,
  setupPlayerManagerIntegration,
} from "../src/extension/integrations/player-manager/client";
import type { Player, PlayerManagerAPI, Resolution } from "@nanahuse/player-manager-protocol";
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

function makeApi(overrides: Partial<PlayerManagerAPI> = {}): PlayerManagerAPI {
  return {
    apiVersion: 1,
    ready: Promise.resolve(),
    request: async (operation, request) => {
      const data =
        operation === "list"
          ? { schemaVersion: 1, revision: 4, players: [player] }
          : operation === "get"
            ? player
            : operation === "resolve"
              ? ({
                  status: "matched",
                  playerId: player.playerId,
                  input: {
                    manualDisplayName: null,
                    youtube: null,
                    racetime: null,
                    speedrunCom: null,
                    twitch: null,
                  },
                  candidates: [],
                  message: "Matched",
                  warnings: [],
                } satisfies Resolution)
              : operation === "beginRegistration"
                ? { registrationId: "reg-1", url: "https://example.test/reg-1" }
                : null;
      void request;
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
  it("connects to v1 and exposes the supported operations", async () => {
    const gateway = createPlayerManagerGateway(nodecg(makeApi()));
    await gateway.ready;
    expect(await gateway.list()).toEqual([player]);
    expect(await gateway.get("canonical-1")).toEqual(player);
    expect((await gateway.resolve({ racetime: { userId: "rt-1" } })).status).toBe("matched");
    expect(await gateway.beginRegistration({})).toEqual({
      registrationId: "reg-1",
      url: "https://example.test/reg-1",
    });
    expect(await gateway.getRegistration("reg-1")).toBeNull();
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
    const wrongVersion = createPlayerManagerGateway(nodecg({ ...makeApi(), apiVersion: 2 }));
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
      nodecg({ ...makeApi(), apiVersion: 2 }),
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

  it.each(["ambiguous", "conflict"] as const)("clears canonical id for %s resolution", (state) => {
    const person = {
      ...createDraftPersonFromEntrant({
        racetimeUserId: "rt",
        racetimeName: "Runner",
        twitchLogin: null,
        ref: "ref",
      }),
      playerId: "old",
      player: playerToSnapshot(player),
    };
    const resolution = {
      status: state,
      playerId: null,
      input: {
        manualDisplayName: null,
        youtube: null,
        racetime: null,
        speedrunCom: null,
        twitch: null,
      },
      candidates: [],
      message: "Needs review",
      warnings: [],
    } as Resolution;
    expect(applyResolutionToDraftPerson(person, resolution)).toMatchObject({
      playerId: null,
      player: null,
      resolution: state,
    });
  });
});
