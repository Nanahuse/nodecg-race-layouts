import { describe, expect, it } from "vitest";
import type { Player, Resolution } from "../src/extension/integrations/player-manager/types";
import { buildInitialDraft } from "../src/extension/application/race-draft-service";
import { ParticipantDraftService } from "../src/extension/application/participant-draft-service";
import { RacePresentationDraftService } from "../src/extension/application/race-presentation-draft-service";
import { makeSession } from "./support/draft-fakes";
import { reconcileDraft } from "../src/extension/application/race-draft-reconciliation";
import { makeDraftPerson } from "./support/draft-fakes";
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
function resolution(status: Resolution["status"], playerId: string | null): Resolution {
  return {
    status,
    playerId,
    input: {
      manualDisplayName: null,
      racetime: null,
      speedrunCom: null,
      twitch: null,
      youtube: null,
    },
    candidates: [],
    message: "",
    warnings: [],
  };
}
describe("Player Manager race load", () => {
  it("resolves entrants, stores snapshots and retains unresolved people without generating Player ids", async () => {
    const calls: unknown[] = [];
    const gateway = {
      ready: Promise.resolve(),
      list: async () => [player],
      get: async (id: string) => (id === player.playerId ? player : null),
      resolve: async (input: { racetime?: { userId: string } }) => {
        calls.push(input);
        return input.racetime?.userId === "rt-1"
          ? resolution("matched", player.playerId)
          : resolution("ambiguous", null);
      },
      beginRegistration: async () => ({
        registrationId: "reg-1",
        url: "https://player-manager/register/reg-1",
      }),
      getRegistration: async () => null,
    };
    const session = makeSession({
      race: {
        ...makeSession().race!,
        entrants: [
          { userId: "rt-1", name: "Runner One", twitchLogin: null, status: "ready" },
          { userId: "rt-2", name: "Runner Two", twitchLogin: null, status: "ready" },
        ],
      },
    });
    const result = await buildInitialDraft({
      session,
      playerManager: gateway,
      revision: 1,
      personRefFactory: (() => {
        let id = 0;
        return () => `ref-${++id}`;
      })(),
    });
    expect(calls).toHaveLength(2);
    expect(result.draft.participants).toEqual([
      { racetimeUserId: "rt-1", personRef: "ref-1" },
      { racetimeUserId: "rt-2", personRef: "ref-2" },
    ]);
    expect(result.draft.persons["ref-1"]).toMatchObject({
      playerId: "pm-1",
      resolution: "matched",
      player: { displayName: "Runner One" },
    });
    expect(result.draft.persons["ref-2"]).toMatchObject({
      playerId: null,
      resolution: "ambiguous",
      player: null,
    });
  });

  it("starts Player Manager registration, applies its result to the DraftPerson, and snapshots commentators", async () => {
    const registeredPlayer: Player = {
      ...player,
      playerId: "pm-2",
      racetime: { userId: "rt-2", name: "Runner Two" },
      twitch: { userId: null, login: "runner_two" },
    };
    const unresolvedSession = makeSession({
      race: {
        ...makeSession().race!,
        entrants: [
          { userId: "rt-2", name: "Runner Two", twitchLogin: "runner_two", status: "ready" },
        ],
      },
    });
    const playerManager = {
      ready: Promise.resolve(),
      list: async () => [registeredPlayer],
      get: async () => registeredPlayer,
      resolve: async () => resolution("unresolved", null),
      beginRegistration: async () => ({
        registrationId: "registration-2",
        url: "https://player-manager/register/2",
      }),
      getRegistration: async () => null,
    };
    const initial = await buildInitialDraft({
      session: unresolvedSession,
      playerManager,
      revision: 1,
      personRefFactory: () => "person-2",
    });
    const draft = new TrackingReplicant("draft-config", initial.draft);
    const speedrun = new TrackingReplicant(
      "draft-speedrun-snapshot",
      createDefaultDraftSpeedrunSnapshot(),
    );
    const integration = new TrackingReplicant(
      "integration-status",
      createDefaultIntegrationStatus(),
    );
    const log = createFakeLogger().logger;
    const participants = new ParticipantDraftService({
      draftConfig: draft,
      draftSpeedrunSnapshot: speedrun,
      integrationStatus: integration,
      playerManager,
      log,
    });
    const started = await participants.beginRegistration(1, "rt-2");
    expect(started).toEqual({
      ok: true,
      registrationId: "registration-2",
      url: "https://player-manager/register/2",
    });
    await participants.registrationCompleted({
      registrationId: "registration-2",
      player: registeredPlayer,
    });
    expect(draft.value.persons["person-2"]).toMatchObject({
      playerId: "pm-2",
      resolution: "matched",
      player: { displayName: "Runner One" },
    });
    const presentation = new RacePresentationDraftService({
      draftConfig: draft,
      draftSpeedrunSnapshot: speedrun,
      integrationStatus: integration,
      playerManager,
      log,
    });
    expect(await presentation.setCommentators(draft.value.revision, ["pm-2"])).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(draft.value.commentators["pm-2"]).toMatchObject({
      playerId: "pm-2",
      displayName: "Runner One",
    });
  });

  it("reconciles new entrants through resolved DraftPerson values and preserves existing person refs", async () => {
    const session = makeSession();
    const gateway = {
      ready: Promise.resolve(),
      list: async () => [player],
      get: async () => player,
      resolve: async () => resolution("matched", player.playerId),
      beginRegistration: async () => ({ registrationId: "r", url: "https://example.test" }),
      getRegistration: async () => null,
    };
    const initial = await buildInitialDraft({
      session,
      playerManager: gateway,
      revision: 1,
      personRefFactory: () => "existing-ref",
    });
    initial.draft.persons["orphaned-person"] = makeDraftPerson("orphaned-person");
    const nextSession = makeSession({
      race: {
        ...makeSession().race!,
        entrants: [
          ...makeSession().race!.entrants,
          { userId: "rt-new", name: "New runner", twitchLogin: null, status: "ready" },
        ],
      },
    });
    const addedPerson = makeDraftPerson("new-ref", "rt-new", "unresolved");
    const result = reconcileDraft({
      draft: initial.draft,
      session: nextSession,
      resolvedNewPersons: new Map([["rt-new", addedPerson]]),
    });
    expect(result.draft.participants.map((participant) => participant.personRef)).toEqual([
      "existing-ref",
      "new-ref",
    ]);
    expect(result.draft.persons["existing-ref"]).toEqual(initial.draft.persons["existing-ref"]);
    expect(result.draft.persons).not.toHaveProperty("orphaned-person");
  });
});
