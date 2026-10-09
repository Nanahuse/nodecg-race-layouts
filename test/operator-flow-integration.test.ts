import { describe, expect, it } from "vitest";
import type { DraftConfig } from "../src/domain";
import type { Player } from "../src/extension/integrations/player-manager/types";
import type { PlayerManagerGateway } from "../src/extension/integrations/player-manager/types";
import {
  buildInitialDraft,
  RaceDraftService,
} from "../src/extension/application/race-draft-service";
import { ParticipantDraftService } from "../src/extension/application/participant-draft-service";
import { RacePresentationDraftService } from "../src/extension/application/race-presentation-draft-service";
import { makeSession } from "./support/draft-fakes";
import {
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../src/replicants/defaults";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

const player: Player = {
  playerId: "pm-1",
  revision: 1,
  manualDisplayName: "Runner One",
  racetime: { userId: "rt-1", name: "Runner One" },
  speedrunCom: { userId: "src-1", name: "Runner One SRC" },
  twitch: null,
  youtube: null,
};

const secondPlayer: Player = {
  ...player,
  playerId: "pm-2",
  revision: 1,
  manualDisplayName: "Runner Two",
  racetime: { userId: "rt-2", name: "Runner Two" },
  speedrunCom: { userId: "src-2", name: "Runner Two SRC" },
};

const runnerEntrants = [
  { userId: "rt-1", name: "Runner One", twitchLogin: null, status: "ready" as const },
  { userId: "rt-2", name: "Runner Two", twitchLogin: "runner_two", status: "ready" as const },
];

function services(draftValue: DraftConfig, playerManager: PlayerManagerGateway) {
  const draft = new TrackingReplicant("draft-config", draftValue);
  const speedrun = new TrackingReplicant(
    "draft-speedrun-snapshot",
    createDefaultDraftSpeedrunSnapshot(),
  );
  const integration = new TrackingReplicant("integration-status", createDefaultIntegrationStatus());
  const participants = new ParticipantDraftService({
    draftConfig: draft,
    draftSpeedrunSnapshot: speedrun,
    integrationStatus: integration,
    playerManager,
    log: createFakeLogger().logger,
  });
  return { draft, speedrun, integration, participants };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("Player Manager Directory participant binding", () => {
  it("loads the Directory once and matches RaceTime IDs exactly", async () => {
    let listCalls = 0;
    const twitchOnly: Player = {
      ...secondPlayer,
      playerId: "pm-twitch-only",
      racetime: null,
      twitch: { userId: "twitch-2", login: "runner_two" },
    };
    const gateway = {
      ready: Promise.resolve(),
      list: async () => {
        listCalls += 1;
        return [player, twitchOnly];
      },
      beginRegistration: async () => ({ registrationId: "reg-1", url: "https://pm.test/reg-1" }),
    };
    const session = makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } });
    const result = await buildInitialDraft({
      session,
      playerManager: gateway,
      revision: 1,
      personRefFactory: (() => {
        let id = 0;
        return () => `ref-${++id}`;
      })(),
    });

    expect(listCalls).toBe(1);
    expect(result.draft.persons["ref-1"]).toMatchObject({
      playerId: "pm-1",
      resolution: "matched",
      player: { displayName: "Runner One" },
    });
    expect(result.draft.persons["ref-2"]).toMatchObject({
      playerId: null,
      resolution: "unresolved",
      player: null,
    });
  });

  it("requires the RaceTime account and refreshes every participant from the completion Directory", async () => {
    let directory: Player[] = [player];
    const registrationCalls: unknown[] = [];
    const gateway = {
      ready: Promise.resolve(),
      list: async () => directory,
      beginRegistration: async (...args: unknown[]) => {
        registrationCalls.push(args);
        return { registrationId: "registration-2", url: "https://player-manager/register/2" };
      },
    };
    const initial = await buildInitialDraft({
      session: makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } }),
      playerManager: gateway,
      revision: 1,
      personRefFactory: (() => {
        let id = 0;
        return () => `person-${++id}`;
      })(),
    });
    const { draft, speedrun, integration, participants } = services(initial.draft, gateway);
    expect(await participants.beginRegistration(1, "rt-2")).toMatchObject({
      ok: true,
      registrationId: "registration-2",
    });
    expect(registrationCalls).toEqual([
      [{ racetime: "rt-2" }, [{ service: "racetime", value: "rt-2" }]],
    ]);

    const updatedPlayer = { ...player, manualDisplayName: "Updated One" };
    directory = [updatedPlayer, secondPlayer];
    await participants.refreshPlayerBindings();

    expect(draft.value.persons["person-1"]).toMatchObject({
      playerId: "pm-1",
      resolution: "matched",
      player: { displayName: "Updated One" },
    });
    expect(draft.value.persons["person-2"]).toMatchObject({
      playerId: "pm-2",
      resolution: "matched",
      player: { displayName: "Runner Two" },
    });
    expect(draft.value.revision).toBe(2);
    expect(speedrun.value.draftRevision).toBe(2);

    const presentation = new RacePresentationDraftService({
      draftConfig: draft,
      draftSpeedrunSnapshot: speedrun,
      integrationStatus: integration,
      playerManager: gateway,
      log: createFakeLogger().logger,
    });
    expect(await presentation.setCommentators(draft.value.revision, ["pm-2"])).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(draft.value.commentators["pm-2"]).toMatchObject({
      playerId: "pm-2",
      displayName: "Runner Two",
    });
  });

  it("reflects account moves, deletions, and account removal across the whole draft", async () => {
    let directory: Player[] = [player, secondPlayer];
    const gateway = {
      ready: Promise.resolve(),
      list: async () => directory,
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const initial = await buildInitialDraft({
      session: makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } }),
      playerManager: gateway,
      revision: 1,
      personRefFactory: (() => {
        let id = 0;
        return () => `person-${++id}`;
      })(),
    });
    const { draft, participants } = services(initial.draft, gateway);

    directory = [{ ...secondPlayer, playerId: "pm-1", manualDisplayName: "Moved Runner" }];
    await participants.refreshPlayerBindings();

    expect(draft.value.persons["person-1"]).toMatchObject({
      playerId: null,
      player: null,
      resolution: "unresolved",
    });
    expect(draft.value.persons["person-2"]).toMatchObject({
      playerId: "pm-1",
      player: { displayName: "Moved Runner", racetime: { userId: "rt-2" } },
      resolution: "matched",
    });
  });

  it("reconciles new entrants through the same RaceTime Directory index", async () => {
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: async () => {
        listCalls += 1;
        return [player, secondPlayer];
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const previousSession = makeSession({
      race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
    });
    const initial = await buildInitialDraft({
      session: previousSession,
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    listCalls = 0;
    const nextSession = makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } });
    const draft = new TrackingReplicant("draft-config", initial.draft);
    const service = new RaceDraftService({
      raceSessions: {} as never,
      draftRaceSession: new TrackingReplicant("draft-race-session", nextSession),
      playerManager: gateway,
      draftConfig: draft,
      draftSpeedrunSnapshot: new TrackingReplicant(
        "draft-speedrun-snapshot",
        createDefaultDraftSpeedrunSnapshot(),
      ),
      integrationStatus: new TrackingReplicant(
        "integration-status",
        createDefaultIntegrationStatus(),
      ),
      log: createFakeLogger().logger,
      personRefFactory: () => "person-2",
    });

    const result = await service.reconcile(initial.draft.revision);

    expect(result).toMatchObject({ ok: true, changed: true, participantCount: 2 });
    expect(listCalls).toBe(1);
    expect(draft.value.persons["person-2"]).toMatchObject({
      playerId: "pm-2",
      resolution: "matched",
      player: { displayName: "Runner Two" },
    });
  });

  it("refreshes against the latest Draft after the Directory request completes", async () => {
    const directoryRequest = deferred<Player[]>();
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: () => {
        listCalls += 1;
        return listCalls === 1 ? Promise.resolve([player]) : directoryRequest.promise;
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const initial = await buildInitialDraft({
      session: makeSession({
        race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
      }),
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    const { draft, participants } = services(initial.draft, gateway);

    const refreshing = participants.refreshPlayerBindings();
    await Promise.resolve();
    draft.value = {
      ...draft.value,
      revision: 2,
      raceScreenSlots: { ...draft.value.raceScreenSlots, 1: null },
    };
    directoryRequest.resolve([{ ...player, manualDisplayName: "Fresh from Directory" }]);
    const outcome = await refreshing;

    expect(outcome).toMatchObject({ ok: true, draftRevision: 3 });
    expect(draft.value.raceScreenSlots[1]).toBeNull();
    expect(draft.value.persons["person-1"]).toMatchObject({
      player: { displayName: "Fresh from Directory" },
    });
  });

  it("rejects reconciliation when the Draft changes during the Directory request", async () => {
    const directoryRequest = deferred<Player[]>();
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: () => {
        listCalls += 1;
        return listCalls === 1 ? Promise.resolve([player]) : directoryRequest.promise;
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const previousSession = makeSession({
      race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
    });
    const initial = await buildInitialDraft({
      session: previousSession,
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    const nextSession = makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } });
    const draft = new TrackingReplicant("draft-config", initial.draft);
    const draftRaceSession = new TrackingReplicant("draft-race-session", nextSession);
    const service = new RaceDraftService({
      raceSessions: {} as never,
      draftRaceSession,
      playerManager: gateway,
      draftConfig: draft,
      draftSpeedrunSnapshot: new TrackingReplicant(
        "draft-speedrun-snapshot",
        createDefaultDraftSpeedrunSnapshot(),
      ),
      integrationStatus: new TrackingReplicant(
        "integration-status",
        createDefaultIntegrationStatus(),
      ),
      log: createFakeLogger().logger,
      personRefFactory: () => "person-2",
    });

    const reconciling = service.reconcile(initial.draft.revision);
    await Promise.resolve();
    draft.value = {
      ...draft.value,
      revision: 2,
      raceScreenSlots: { ...draft.value.raceScreenSlots, 1: null },
    };
    directoryRequest.resolve([player, secondPlayer]);
    const outcome = await reconciling;

    expect(outcome).toMatchObject({ ok: false, reason: "draft_changed" });
    expect(draft.value.revision).toBe(2);
    expect(draft.value.raceScreenSlots[1]).toBeNull();
    expect(draft.value.participants).toHaveLength(1);
  });

  it("rejects reconciliation when the RaceTime session changes during the Directory request", async () => {
    const directoryRequest = deferred<Player[]>();
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: () => {
        listCalls += 1;
        return listCalls === 1 ? Promise.resolve([player]) : directoryRequest.promise;
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const previousSession = makeSession({
      race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
    });
    const initial = await buildInitialDraft({
      session: previousSession,
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    const nextSession = makeSession({ race: { ...makeSession().race!, entrants: runnerEntrants } });
    const draft = new TrackingReplicant("draft-config", initial.draft);
    const draftRaceSession = new TrackingReplicant("draft-race-session", nextSession);
    const service = new RaceDraftService({
      raceSessions: {} as never,
      draftRaceSession,
      playerManager: gateway,
      draftConfig: draft,
      draftSpeedrunSnapshot: new TrackingReplicant(
        "draft-speedrun-snapshot",
        createDefaultDraftSpeedrunSnapshot(),
      ),
      integrationStatus: new TrackingReplicant(
        "integration-status",
        createDefaultIntegrationStatus(),
      ),
      log: createFakeLogger().logger,
      personRefFactory: () => "person-2",
    });

    const reconciling = service.reconcile(initial.draft.revision);
    await Promise.resolve();
    draftRaceSession.value = { ...nextSession, revision: nextSession.revision + 1 };
    directoryRequest.resolve([player, secondPlayer]);
    const outcome = await reconciling;

    expect(outcome).toMatchObject({ ok: false, reason: "reconcile_failed" });
    if (!outcome.ok) expect(outcome.message).toContain("RaceTime session changed");
    expect(draft.value.revision).toBe(initial.draft.revision);
    expect(draft.value.participants).toHaveLength(1);
  });

  it("rejects commentator updates when the Draft changes during the Directory request", async () => {
    const directoryRequest = deferred<Player[]>();
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: () => {
        listCalls += 1;
        return listCalls === 1 ? Promise.resolve([player]) : directoryRequest.promise;
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const initial = await buildInitialDraft({
      session: makeSession({
        race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
      }),
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    const { draft, speedrun, integration } = services(initial.draft, gateway);
    const presentation = new RacePresentationDraftService({
      draftConfig: draft,
      draftSpeedrunSnapshot: speedrun,
      integrationStatus: integration,
      playerManager: gateway,
      log: createFakeLogger().logger,
    });

    const updating = presentation.setCommentators(initial.draft.revision, ["pm-1"]);
    await Promise.resolve();
    draft.value = {
      ...draft.value,
      revision: 2,
      raceScreenSlots: { ...draft.value.raceScreenSlots, 1: null },
    };
    directoryRequest.resolve([player]);
    const outcome = await updating;

    expect(outcome).toMatchObject({ ok: false, reason: "draft_changed" });
    expect(draft.value.revision).toBe(2);
    expect(draft.value.raceScreenSlots[1]).toBeNull();
    expect(draft.value.commentatorPlayerIds).toEqual([]);
  });

  it("rejects commentators absent from the single Directory snapshot", async () => {
    let listCalls = 0;
    const gateway = {
      ready: Promise.resolve(),
      list: async () => {
        listCalls += 1;
        return listCalls === 1 ? [player] : [];
      },
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
    };
    const initial = await buildInitialDraft({
      session: makeSession({
        race: { ...makeSession().race!, entrants: runnerEntrants.slice(0, 1) },
      }),
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "person-1",
    });
    const { draft, speedrun, integration } = services(initial.draft, gateway);
    const presentation = new RacePresentationDraftService({
      draftConfig: draft,
      draftSpeedrunSnapshot: speedrun,
      integrationStatus: integration,
      playerManager: gateway,
      log: createFakeLogger().logger,
    });

    expect(await presentation.setCommentators(draft.value.revision, ["pm-1"])).toMatchObject({
      ok: false,
      reason: "player_not_found",
    });
    expect(listCalls).toBe(2);
  });
});
