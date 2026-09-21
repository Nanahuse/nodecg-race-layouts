import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../domain";
import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";
import { AutomaticIdentityResolutionService } from "./application/automatic-identity-resolution-service";
import { CategoryDraftService } from "./application/category-draft-service";
import {
  nullCategoryPresetProvider,
  type CategoryPresetProvider,
} from "./application/category-preset-provider";
import { ParticipantDraftService } from "./application/participant-draft-service";
import { PlayerDirectoryService } from "./application/player-directory-service";
import { RaceDraftService } from "./application/race-draft-service";
import { RaceSessionService } from "./application/race-session-service";
import { SpeedrunDiscoveryService } from "./application/speedrun-discovery-service";
import { SpeedrunSnapshotService } from "./application/speedrun-snapshot-service";
import { SpeedrunOperationStatusCoordinator } from "./application/speedrun-status-coordinator";
import { parseBundleConfig } from "./config";
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
import { registerCategoryMessages } from "./messages/category-messages";
import { registerParticipantMessages } from "./messages/participant-messages";
import { registerRaceMessages } from "./messages/race-messages";
import { registerSpeedrunMessages } from "./messages/speedrun-messages";
import { registerSpeedrunSnapshotMessages } from "./messages/speedrun-snapshot-messages";

export type SpreadsheetIntegration = {
  playerDirectoryService: PlayerDirectoryService;
  categoryMappingsRepository: CategoryMappingsRepository;
  categoryPresentationRepository: CategoryPresentationRepository;
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

  const { spreadsheetId, playersSheet, categoryMappingsSheet, categoryPresentationSheet } =
    parsed.config.spreadsheet;

  const client = GoogleSheetsClient.create({ spreadsheetId });

  const playerDirectoryService = new PlayerDirectoryService({
    repository: new SpreadsheetPlayersRepository(client, { sheetName: playersSheet }),
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
    sheetName: playersSheet,
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
  };
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

export function setupRaceTimeIntegration(
  nodecg: NodeCG,
  spreadsheet: SpreadsheetIntegration | null,
  speedrunLookup: SpeedrunIntegration["discovery"],
): { raceDraft: RaceDraftService; categoryDraft: CategoryDraftService } {
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

  return { raceDraft, categoryDraft };
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

export function bootstrapExtension(nodecg: NodeCG): {
  raceDraft: RaceDraftService;
  categoryDraft: CategoryDraftService;
  speedrunDiscovery: SpeedrunDiscoveryService;
  speedrunSnapshot: SpeedrunSnapshotService;
  participantDraft: ParticipantDraftService;
} {
  declareReplicants(nodecg);
  const spreadsheet = setupSpreadsheetIntegration(nodecg);
  const { discovery: speedrunDiscovery, snapshot: speedrunSnapshot } =
    setupSpeedrunIntegration(nodecg);
  const { raceDraft, categoryDraft } = setupRaceTimeIntegration(
    nodecg,
    spreadsheet,
    speedrunDiscovery,
  );
  const participantDraft = setupParticipantDraftService(nodecg, speedrunDiscovery);
  registerRaceMessages(nodecg, raceDraft);
  registerCategoryMessages(nodecg, categoryDraft);
  registerSpeedrunMessages(nodecg, speedrunDiscovery);
  registerSpeedrunSnapshotMessages(nodecg, speedrunSnapshot);
  registerParticipantMessages(nodecg, participantDraft);
  return { raceDraft, categoryDraft, speedrunDiscovery, speedrunSnapshot, participantDraft };
}
