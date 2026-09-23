import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../../src/domain";
import { makeSelection } from "./category-fakes";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../../src/replicants/defaults";
import type { NodeCG, MessageHandler, Replicant } from "../../src/types/nodecg";
import { setupGraphicsProjection } from "../../src/extension/setup";
import { RaceDraftService } from "../../src/extension/application/race-draft-service";
import { RaceSessionService } from "../../src/extension/application/race-session-service";
import { CategoryDraftService } from "../../src/extension/application/category-draft-service";
import { ParticipantDraftService } from "../../src/extension/application/participant-draft-service";
import { RacePresentationDraftService } from "../../src/extension/application/race-presentation-draft-service";
import { SpeedrunSnapshotService } from "../../src/extension/application/speedrun-snapshot-service";
import { SpeedrunOperationStatusCoordinator } from "../../src/extension/application/speedrun-status-coordinator";
import { BroadcastApplyService } from "../../src/extension/application/broadcast-apply-service";
import { registerRaceMessages } from "../../src/extension/messages/race-messages";
import { registerCategoryMessages } from "../../src/extension/messages/category-messages";
import { registerParticipantMessages } from "../../src/extension/messages/participant-messages";
import { registerRacePresentationMessages } from "../../src/extension/messages/race-presentation-messages";
import { registerSpeedrunSnapshotMessages } from "../../src/extension/messages/speedrun-snapshot-messages";
import { registerBroadcastMessages } from "../../src/extension/messages/broadcast-messages";
import {
  FakeRaceTimeClient,
  FakeScheduler,
  FakeWebSocketFactory,
  makeEntrantDto,
  makeRaceDto,
  flushPromises,
} from "./racetime-fakes";
import { FakeSpeedrunComClient, makeLeaderboardEntry } from "./speedrun-fakes";
import { FakeSpeedrunUserLookup } from "./speedrun-fakes";
import { createFakeLogger, TrackingReplicant } from "./fakes";
import type { RaceTimeRaceDto } from "../../src/extension/integrations/racetime/types";
import { leaderboardKeyFromSelection } from "../../src/domain";

const raceUrl = "https://racetime.gg/ootr/operator-flow";
const selection = makeSelection();
const entrants = Array.from({ length: 4 }, (_, index) =>
  makeEntrantDto({
    userId: "user-" + (index + 1),
    name: "Entrant " + (index + 1),
    twitchLogin: "twitch" + (index + 1),
  }),
);
function raceData(
  participantEntrants = entrants,
  overrides: Partial<RaceTimeRaceDto> = {},
): RaceTimeRaceDto {
  return makeRaceDto({
    name: "ootr/operator-flow",
    slug: "operator-flow",
    categorySlug: "ootr",
    categoryName: "Ocarina Randomizer",
    goal: "Defeat Ganon",
    url: "/ootr/operator-flow",
    dataUrl: "/ootr/operator-flow/data",
    websocketUrl: "/ws/race/ootr/operator-flow",
    entrants: participantEntrants,
    ...overrides,
  });
}

export function createOperatorFlowHarness() {
  const logger = createFakeLogger();
  const replicants = new Map<string, TrackingReplicant<unknown>>();
  const handlers = new Map<string, MessageHandler>();
  const playerDirectory = Object.fromEntries(
    entrants.map((entrant, index) => {
      const playerId = "player-" + (index + 1);
      return [
        playerId,
        {
          playerId,
          manualDisplayName: "Operator Runner " + (index + 1),
          racetime: {
            state: "linked" as const,
            value: { userId: entrant.userId, name: entrant.name, twitchLogin: entrant.twitchLogin },
          },
          speedrunCom: {
            state: "linked" as const,
            value: {
              userId: "src-" + (index + 1),
              name: "SRC Runner " + (index + 1),
              twitchLogin: null,
            },
          },
          twitch: {
            state: "linked" as const,
            value: { userId: null, login: "twitch" + (index + 1) },
          },
        },
      ];
    }),
  ) as PlayerDirectory;
  const defaults: Record<string, unknown> = {
    "draft-config": createDefaultDraftConfig(),
    "active-config": null,
    "draft-speedrun-snapshot": createDefaultDraftSpeedrunSnapshot(),
    "active-speedrun-snapshot": null,
    "integration-status": createDefaultIntegrationStatus(),
    "player-directory": playerDirectory,
    "draft-race-session": createDefaultRaceSession(),
    "active-race-session": createDefaultRaceSession(),
    "race-overlay-data": null,
    "participant-list-data": null,
    "leaderboard-page-data": null,
    "race-result-page-data": null,
  };
  const nodecg: NodeCG = {
    Replicant<T>(name: string): Replicant<T> {
      let value = replicants.get(name);
      if (!value) {
        value = new TrackingReplicant(name, defaults[name] as unknown, []);
        replicants.set(name, value);
      }
      return value as Replicant<T>;
    },
    listenFor(name, handler) {
      if (handlers.has(name)) throw new Error("Duplicate test message handler: " + name);
      handlers.set(name, handler);
    },
    log: logger.logger,
    bundleConfig: { event: { name: "Operator Flow Event", shortName: "OFE", logoUrl: null } },
    bundleVersion: "test",
  };
  const send = async <T>(name: string, data: unknown): Promise<T> => {
    const handler = handlers.get(name);
    if (!handler) throw new Error("No message handler registered for " + name);
    return new Promise<T>((resolve, reject) => {
      const ack = ((error: Error | null, result?: unknown) =>
        error ? reject(error) : resolve(result as T)) as Parameters<MessageHandler>[1];
      void Promise.resolve(handler(data, ack)).catch(reject);
    });
  };
  const get = <T>(name: string): TrackingReplicant<T> =>
    nodecg.Replicant<T>(name) as TrackingReplicant<T>;
  const raceClient = new FakeRaceTimeClient();
  let currentRace = raceData();
  let failNextFetch = false;
  raceClient.handler = async () => {
    if (failNextFetch) {
      failNextFetch = false;
      throw new Error("Fake RaceTime fetch failure");
    }
    return currentRace;
  };
  const sockets = new FakeWebSocketFactory();
  const scheduler = new FakeScheduler();
  const integrationStatus = get<IntegrationStatus>("integration-status");
  const draftSession = get<RaceSession>("draft-race-session");
  const activeSession = get<RaceSession>("active-race-session");
  const raceSessions = new RaceSessionService({
    client: raceClient,
    webSocketFactory: sockets.create,
    scheduler,
    log: logger.logger,
    sessions: { draft: draftSession, active: activeSession },
    integrationStatus,
  });
  const draftConfig = get<DraftConfig>("draft-config");
  const draftSnapshot = get<DraftSpeedrunSnapshot>("draft-speedrun-snapshot");
  const raceDraft = new RaceDraftService({
    raceSessions,
    draftRaceSession: draftSession,
    playerDirectory: get<PlayerDirectory>("player-directory"),
    draftConfig,
    draftSpeedrunSnapshot: draftSnapshot,
    integrationStatus,
    log: logger.logger,
    playerIdFactory: (() => {
      let id = 0;
      return () => "generated-" + ++id;
    })(),
  });
  raceSessions.setSessionChangeListener((role, session) => {
    if (role === "draft") raceDraft.handleDraftSessionChange(session);
  });
  const categoryDraft = new CategoryDraftService({
    draftConfig,
    draftSpeedrunSnapshot: draftSnapshot,
    draftRaceSession: draftSession,
    integrationStatus,
    mappingsRepository: null,
    presentationRepository: null,
    log: logger.logger,
  });
  const lookup = new FakeSpeedrunUserLookup();
  const participantDraft = new ParticipantDraftService({
    draftConfig,
    draftSpeedrunSnapshot: draftSnapshot,
    playerDirectory: get<PlayerDirectory>("player-directory"),
    integrationStatus,
    lookup,
    log: logger.logger,
  });
  const racePresentation = new RacePresentationDraftService({
    draftConfig,
    draftSpeedrunSnapshot: draftSnapshot,
    playerDirectory: get<PlayerDirectory>("player-directory"),
    integrationStatus,
    log: logger.logger,
  });
  const speedrunClient = new FakeSpeedrunComClient();
  speedrunClient.leaderboardResult = {
    ...speedrunClient.leaderboardResult,
    ...leaderboardKeyFromSelection(selection),
    entries: entrants.map((_, index) =>
      makeLeaderboardEntry({
        place: index + 1,
        players: [{ userId: "src-" + (index + 1), name: "SRC Runner " + (index + 1) }],
        timeSeconds: 3600 + index,
        formattedTime: "1:00:" + String(index).padStart(2, "0"),
      }),
    ),
  };
  const speedrunStatus = new SpeedrunOperationStatusCoordinator({
    integrationStatus,
    log: logger.logger,
  });
  const snapshot = new SpeedrunSnapshotService({
    client: speedrunClient,
    status: speedrunStatus,
    draftConfig,
    draftSpeedrunSnapshot: draftSnapshot,
    integrationStatus,
    log: logger.logger,
    snapshotIdFactory: () => "operator-flow-snapshot",
    clock: () => new Date("2026-09-23T00:00:00.000Z"),
  });
  const persistenceQueue: ActiveConfig[] = [];
  const persistenceSink = { enqueue: (config: ActiveConfig) => persistenceQueue.push(config) };
  const broadcast = new BroadcastApplyService({
    raceSessions,
    draftConfig,
    activeConfig: get<ActiveConfig | null>("active-config"),
    draftSpeedrunSnapshot: draftSnapshot,
    activeSpeedrunSnapshot: get<ActiveSpeedrunSnapshot | null>("active-speedrun-snapshot"),
    integrationStatus,
    log: logger.logger,
    postApplyPersistence: persistenceSink,
  });
  setupGraphicsProjection(nodecg);
  registerRaceMessages(nodecg, raceDraft);
  registerCategoryMessages(nodecg, categoryDraft);
  registerParticipantMessages(nodecg, participantDraft);
  registerRacePresentationMessages(nodecg, racePresentation);
  registerSpeedrunSnapshotMessages(nodecg, snapshot);
  registerBroadcastMessages(nodecg, broadcast);
  return {
    send,
    get,
    sockets,
    raceClient,
    speedrunClient,
    persistenceQueue,
    setRace(next: RaceTimeRaceDto) {
      currentRace = next;
    },
    failNextRaceFetch() {
      failNextFetch = true;
    },
    flush: flushPromises,
    selection,
    raceUrl,
  };
}
