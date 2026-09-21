import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../domain";
import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";
import { AutomaticIdentityResolutionService } from "./application/automatic-identity-resolution-service";
import { BroadcastApplyService } from "./application/broadcast-apply-service";
import { CategoryDraftService } from "./application/category-draft-service";
import {
  nullCategoryPresetProvider,
  type CategoryPresetProvider,
} from "./application/category-preset-provider";
import { ParticipantDraftService } from "./application/participant-draft-service";
import { PlayerDirectoryService } from "./application/player-directory-service";
import { RaceDraftService } from "./application/race-draft-service";
import { RacePresentationDraftService } from "./application/race-presentation-draft-service";
import { RaceSessionService } from "./application/race-session-service";
import { SpeedrunDiscoveryService } from "./application/speedrun-discovery-service";
import { SpeedrunSnapshotService } from "./application/speedrun-snapshot-service";
import { SpeedrunOperationStatusCoordinator } from "./application/speedrun-status-coordinator";
import { parseBundleConfig, parseEventConfig } from "./config";
import { GraphicsProjectionService } from "./application/graphics-projection-service";
import { HttpSpeedrunComClient } from "./integrations/speedruncom/client";
import { HttpRaceTimeClient } from "./integrations/racetime/client";
import { RaceTimeWebSocketError } from "./integrations/racetime/errors";
import type {
  RaceWatcherScheduler,
  WebSocketFactory,
  WebSocketLike,
} from "./integrations/racetime/watcher";
import {
  SpreadsheetCategoryMappingsRepository,
  type CategoryMappingsRepository,
} from "./integrations/spreadsheet/category-mappings-repository";
import {
  SpreadsheetCategoryPresentationRepository,
  type CategoryPresentationRepository,
} from "./integrations/spreadsheet/category-presentation-repository";
import { GoogleSheetsClient } from "./integrations/spreadsheet/google-sheets-client";
import { SpreadsheetPlayersRepository } from "./integrations/spreadsheet/players-repository";
import { registerBroadcastMessages } from "./messages/broadcast-messages";
import { registerCategoryMessages } from "./messages/category-messages";
import { registerParticipantMessages } from "./messages/participant-messages";
import { registerRaceMessages } from "./messages/race-messages";
import { registerRacePresentationMessages } from "./messages/race-presentation-messages";
import { registerSpeedrunMessages } from "./messages/speedrun-messages";
import { registerSpeedrunSnapshotMessages } from "./messages/speedrun-snapshot-messages";
import { registerPersistenceMessages } from "./messages/persistence-messages";
import { PostApplyPersistenceService } from "./application/post-apply-persistence-service";
import { SpreadsheetRaceHistoryRepository } from "./integrations/spreadsheet/race-history-repository";
import { SpreadsheetOperationStatusCoordinator } from "./application/spreadsheet-status-coordinator";

export type SpreadsheetIntegration = {
  playerDirectoryService: PlayerDirectoryService;
  categoryMappingsRepository: CategoryMappingsRepository;
  categoryPresentationRepository: CategoryPresentationRepository;
  raceHistoryRepository: SpreadsheetRaceHistoryRepository;
  status: SpreadsheetOperationStatusCoordinator;
};

export const defaultScheduler: RaceWatcherScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type GlobalWithWebSocket = {
  WebSocket?: new (url: string) => WebSocketLike;
};

export function createDefaultWebSocketFactory(): WebSocketFactory {
  return (url) => {
    const ctor = (globalThis as GlobalWithWebSocket).WebSocket;
    if (!ctor) {
      throw new RaceTimeWebSocketError("Global WebSocket is not available.");
    }
    return new ctor(url);
  };
}

/**
 * Set up the spreadsheet integration. A missing or invalid spreadsheet config
 * only disables the spreadsheet integration; it never stops the extension.
 */
export function setupSpreadsheetIntegration(nodecg: NodeCG): SpreadsheetIntegration | null {
  const parsed = parseBundleConfig(nodecg.bundleConfig);
  if (!parsed.ok) {
    nodecg.log.warn(`[spreadsheet.config.invalid] ${parsed.issues.join("; ")}`);
    return null;
  }

  const {
    spreadsheetId,
    playersSheet,
    categoryMappingsSheet,
    categoryPresentationSheet,
    raceHistorySheet,
  } = parsed.config.spreadsheet;

  const client = GoogleSheetsClient.create({ spreadsheetId });
  const status = new SpreadsheetOperationStatusCoordinator(nodecg.Replicant("integration-status"), nodecg.log);

  const playerDirectoryService = new PlayerDirectoryService({
    repository: new SpreadsheetPlayersRepository(client, { sheetName: playersSheet }),
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
    sheetName: playersSheet,
    statusCoordinator: status,
  });
  void playerDirectoryService.reloadFromSpreadsheet();

  return {
    playerDirectoryService,
    categoryMappingsRepository: new SpreadsheetCategoryMappingsRepository(client, {
      sheetName: categoryMappingsSheet,
    }),
    categoryPresentationRepository: new SpreadsheetCategoryPresentationRepository(client, {
      sheetName: categoryPresentationSheet,
    }),
    raceHistoryRepository: new SpreadsheetRaceHistoryRepository(client, raceHistorySheet),
    status,
  };
}

export function setupGraphicsProjection(nodecg: NodeCG): GraphicsProjectionService | null {
  const parsed = parseEventConfig(nodecg.bundleConfig);
  if (!parsed.ok) {
    nodecg.log.warn(`[graphics.config.invalid] ${parsed.issues.join("; ")}`);
    return null;
  }
  const service = new GraphicsProjectionService({
    activeConfig: nodecg.Replicant("active-config"),
    activeSnapshot: nodecg.Replicant("active-speedrun-snapshot"),
    activeSession: nodecg.Replicant("active-race-session"),
    overlay: nodecg.Replicant("race-overlay-data"),
    participants: nodecg.Replicant("participant-list-data"),
    leaderboard: nodecg.Replicant("leaderboard-page-data"),
    result: nodecg.Replicant("race-result-page-data"),
    event: parsed.config,
    log: nodecg.log,
  });
  nodecg.Replicant("active-config").on("change", () => {
    service.rebuildStatic();
    service.rebuildResult();
  });
  nodecg.Replicant("active-speedrun-snapshot").on("change", () => service.rebuildStatic());
  nodecg.Replicant("active-race-session").on("change", () => service.rebuildResult());
  service.rebuildAll();
  return service;
}

function categoryPresetProviderFor(
  spreadsheet: SpreadsheetIntegration | null,
): CategoryPresetProvider {
  if (!spreadsheet) {
    return nullCategoryPresetProvider;
  }
  return {
    findMapping: (categorySlug, goal) =>
      spreadsheet.categoryMappingsRepository.find(categorySlug, goal),
    findPresentation: (categorySlug, goal) =>
      spreadsheet.categoryPresentationRepository.find(categorySlug, goal),
  };
}

export type RaceTimeIntegration = {
  raceSessions: RaceSessionService;
  raceDraft: RaceDraftService;
  categoryDraft: CategoryDraftService;
};

export function setupRaceTimeIntegration(
  nodecg: NodeCG,
  spreadsheet: SpreadsheetIntegration | null,
  speedrunLookup: SpeedrunIntegration["discovery"],
): RaceTimeIntegration {
  const raceSessions = new RaceSessionService({
    client: new HttpRaceTimeClient(),
    webSocketFactory: createDefaultWebSocketFactory(),
    scheduler: defaultScheduler,
    log: nodecg.log,
    sessions: {
      draft: nodecg.Replicant<RaceSession>("draft-race-session"),
      active: nodecg.Replicant<RaceSession>("active-race-session"),
    },
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
  });

  const draftConfig = nodecg.Replicant<DraftConfig>("draft-config");
  const draftSpeedrunSnapshot = nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot");
  const draftRaceSession = nodecg.Replicant<RaceSession>("draft-race-session");
  const integrationStatus = nodecg.Replicant<IntegrationStatus>("integration-status");

  const automaticIdentityResolver = new AutomaticIdentityResolutionService({
    lookup: speedrunLookup,
    log: nodecg.log,
  });

  const raceDraft = new RaceDraftService({
    raceSessions,
    draftRaceSession,
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    log: nodecg.log,
    categoryPresets: categoryPresetProviderFor(spreadsheet),
    automaticIdentityResolver,
  });

  const categoryDraft = new CategoryDraftService({
    draftConfig,
    draftSpeedrunSnapshot,
    draftRaceSession,
    integrationStatus,
    mappingsRepository: spreadsheet?.categoryMappingsRepository ?? null,
    presentationRepository: spreadsheet?.categoryPresentationRepository ?? null,
    log: nodecg.log,
  });

  raceSessions.setSessionChangeListener((role, session) => {
    if (role === "draft") {
      raceDraft.handleDraftSessionChange(session);
    }
  });

  return { raceSessions, raceDraft, categoryDraft };
}

export type SpeedrunIntegration = {
  discovery: SpeedrunDiscoveryService;
  snapshot: SpeedrunSnapshotService;
};

/**
 * Set up the Speedrun.com integrations. Both discovery and snapshot share one
 * status coordinator so `integration-status.speedrunCom` cannot be clobbered
 * when their requests overlap.
 */
export function setupSpeedrunIntegration(nodecg: NodeCG): SpeedrunIntegration {
  const client = new HttpSpeedrunComClient({
    userAgent: `nodecg-race-layouts/${nodecg.bundleVersion}`,
  });
  const integrationStatus = nodecg.Replicant<IntegrationStatus>("integration-status");
  const status = new SpeedrunOperationStatusCoordinator({
    integrationStatus,
    log: nodecg.log,
  });

  const discovery = new SpeedrunDiscoveryService({ client, status, log: nodecg.log });
  const snapshot = new SpeedrunSnapshotService({
    client,
    status,
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    integrationStatus,
    log: nodecg.log,
  });

  return { discovery, snapshot };
}

export function setupParticipantDraftService(
  nodecg: NodeCG,
  speedrunLookup: SpeedrunIntegration["discovery"],
): ParticipantDraftService {
  return new ParticipantDraftService({
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    lookup: speedrunLookup,
    log: nodecg.log,
  });
}

export function setupRacePresentationDraftService(nodecg: NodeCG): RacePresentationDraftService {
  return new RacePresentationDraftService({
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
  });
}

export function setupBroadcastApplyService(
  nodecg: NodeCG,
  raceSessions: RaceSessionService,
  postApplyPersistence: PostApplyPersistenceService | null = null,
): BroadcastApplyService {
  return new BroadcastApplyService({
    raceSessions,
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    activeConfig: nodecg.Replicant<ActiveConfig | null>("active-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    activeSpeedrunSnapshot: nodecg.Replicant<ActiveSpeedrunSnapshot | null>(
      "active-speedrun-snapshot",
    ),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
    postApplyPersistence,
  });
}

export function bootstrapExtension(nodecg: NodeCG): {
  raceDraft: RaceDraftService;
  categoryDraft: CategoryDraftService;
  speedrunDiscovery: SpeedrunDiscoveryService;
  speedrunSnapshot: SpeedrunSnapshotService;
  participantDraft: ParticipantDraftService;
  racePresentationDraft: RacePresentationDraftService;
  broadcastApply: BroadcastApplyService;
  graphicsProjection: GraphicsProjectionService | null;
} {
  declareReplicants(nodecg);
  const spreadsheet = setupSpreadsheetIntegration(nodecg);
  const { discovery: speedrunDiscovery, snapshot: speedrunSnapshot } =
    setupSpeedrunIntegration(nodecg);
  const { raceSessions, raceDraft, categoryDraft } = setupRaceTimeIntegration(
    nodecg,
    spreadsheet,
    speedrunDiscovery,
  );
  const participantDraft = setupParticipantDraftService(nodecg, speedrunDiscovery);
  const racePresentationDraft = setupRacePresentationDraftService(nodecg);
  const postApplyPersistence = spreadsheet
    ? new PostApplyPersistenceService(
        nodecg.Replicant("post-apply-persistence"),
        spreadsheet.playerDirectoryService,
        spreadsheet.raceHistoryRepository,
        nodecg.log,
        () => new Date(),
        spreadsheet.status,
      )
    : null;
  const broadcastApplyWithPersistence = setupBroadcastApplyService(
    nodecg,
    raceSessions,
    postApplyPersistence,
  );
  registerPersistenceMessages(nodecg, postApplyPersistence);
  postApplyPersistence?.resume();
  const graphicsProjection = setupGraphicsProjection(nodecg);
  registerRaceMessages(nodecg, raceDraft);
  registerCategoryMessages(nodecg, categoryDraft);
  registerSpeedrunMessages(nodecg, speedrunDiscovery);
  registerSpeedrunSnapshotMessages(nodecg, speedrunSnapshot);
  registerParticipantMessages(nodecg, participantDraft);
  registerRacePresentationMessages(nodecg, racePresentationDraft);
  registerBroadcastMessages(nodecg, broadcastApplyWithPersistence);
  return {
    raceDraft,
    categoryDraft,
    speedrunDiscovery,
    speedrunSnapshot,
    participantDraft,
    racePresentationDraft,
    broadcastApply: broadcastApplyWithPersistence,
    graphicsProjection,
  };
}
