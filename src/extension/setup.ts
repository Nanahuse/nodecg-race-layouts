import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  RaceSession,
  SpreadsheetSettings,
} from "../domain";
import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";
import { BroadcastApplyService } from "./application/broadcast-apply-service";
import { CategoryDraftService } from "./application/category-draft-service";
import { type CategoryPresetProvider } from "./application/category-preset-provider";
import { ParticipantDraftService } from "./application/participant-draft-service";
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
import type { SpreadsheetClient } from "./integrations/spreadsheet/client";
import { registerBroadcastMessages } from "./messages/broadcast-messages";
import { registerCategoryMessages } from "./messages/category-messages";
import { registerParticipantMessages } from "./messages/participant-messages";
import { registerRaceMessages } from "./messages/race-messages";
import { registerRacePresentationMessages } from "./messages/race-presentation-messages";
import { registerSpeedrunMessages } from "./messages/speedrun-messages";
import { registerSpeedrunSnapshotMessages } from "./messages/speedrun-snapshot-messages";
import { registerPersistenceMessages } from "./messages/persistence-messages";
import { registerSpreadsheetSetupMessages } from "./messages/spreadsheet-setup-messages";
import { PostApplyPersistenceService } from "./application/post-apply-persistence-service";
import {
  SpreadsheetRaceHistoryRepository,
  type RaceHistoryRepository,
} from "./integrations/spreadsheet/race-history-repository";
import { SpreadsheetOperationStatusCoordinator } from "./application/spreadsheet-status-coordinator";
import { setupPlayerManagerIntegration } from "./integrations/player-manager/client";
import type { PlayerManagerGateway } from "./integrations/player-manager/types";

export type SpreadsheetIntegration = {
  categoryMappingsRepository: CategoryMappingsRepository;
  categoryPresentationRepository: CategoryPresentationRepository;
  raceHistoryRepository: RaceHistoryRepository;
  status: SpreadsheetOperationStatusCoordinator;
  configure(settings: SpreadsheetSettings): void;
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
export function setupSpreadsheetIntegration(
  nodecg: NodeCG,
  createClient: (options: {
    spreadsheetId: string;
    googleCredentialsFile?: string;
  }) => SpreadsheetClient = (options) => GoogleSheetsClient.create(options),
): SpreadsheetIntegration {
  const settingsReplicant = nodecg.Replicant<SpreadsheetSettings>("spreadsheet-settings");
  const status = new SpreadsheetOperationStatusCoordinator(
    nodecg.Replicant("integration-status"),
    nodecg.log,
  );
  let active: Omit<SpreadsheetIntegration, "configure"> | null = null;
  const requireActive = () => {
    if (!active) throw new Error("Spreadsheet integration is not configured.");
    return active;
  };
  const integration: SpreadsheetIntegration = {
    categoryMappingsRepository: {
      find: (categorySlug, goal) =>
        requireActive().categoryMappingsRepository.find(categorySlug, goal),
      upsert: (mapping) => requireActive().categoryMappingsRepository.upsert(mapping),
    },
    categoryPresentationRepository: {
      find: (categorySlug, goal) =>
        requireActive().categoryPresentationRepository.find(categorySlug, goal),
      upsert: (categorySlug, goal, presentation) =>
        requireActive().categoryPresentationRepository.upsert(categorySlug, goal, presentation),
    },
    raceHistoryRepository: {
      upsert: (history, activeRevision, appliedAt) =>
        requireActive().raceHistoryRepository.upsert(history, activeRevision, appliedAt),
    },
    status,
    configure: (settings) => {
      const spreadsheetId = settings.spreadsheetId.trim();
      if (!spreadsheetId) {
        active = null;
        return;
      }
      const client = createClient({
        spreadsheetId,
        googleCredentialsFile: googleCredentialsFileFromConfig(nodecg.bundleConfig),
      });
      active = {
        categoryMappingsRepository: new SpreadsheetCategoryMappingsRepository(client, {
          sheetName: settings.categoryMappingsSheet,
        }),
        categoryPresentationRepository: new SpreadsheetCategoryPresentationRepository(client, {
          sheetName: settings.categoryPresentationSheet,
        }),
        raceHistoryRepository: new SpreadsheetRaceHistoryRepository(
          client,
          settings.raceHistorySheet,
        ),
        status,
      };
    },
  };

  const legacy = parseBundleConfig(nodecg.bundleConfig);
  const current = settingsReplicant.value;
  if (!current.spreadsheetId.trim() && legacy.ok) {
    const oldSettings = legacy.config.spreadsheet;
    settingsReplicant.value = {
      spreadsheetId: oldSettings.spreadsheetId,
      categoryMappingsSheet: oldSettings.categoryMappingsSheet,
      categoryPresentationSheet: oldSettings.categoryPresentationSheet,
      raceHistorySheet: oldSettings.raceHistorySheet,
    };
  }
  integration.configure(settingsReplicant.value);
  settingsReplicant.on("change", (settings) => integration.configure(settings));
  return integration;
}

function googleCredentialsFileFromConfig(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const config = raw as Record<string, unknown>;
  if (typeof config.googleCredentialsFile === "string" && config.googleCredentialsFile.trim()) {
    return config.googleCredentialsFile.trim();
  }
  const spreadsheet = config.spreadsheet;
  if (
    typeof spreadsheet === "object" &&
    spreadsheet !== null &&
    !Array.isArray(spreadsheet) &&
    typeof (spreadsheet as Record<string, unknown>).googleCredentialsFile === "string"
  ) {
    return (
      ((spreadsheet as Record<string, string>).googleCredentialsFile ?? "").trim() || undefined
    );
  }
  return undefined;
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

function categoryPresetProviderFor(spreadsheet: SpreadsheetIntegration): CategoryPresetProvider {
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
  spreadsheet: SpreadsheetIntegration,
  playerManager: PlayerManagerGateway,
  speedrunSnapshot: SpeedrunSnapshotService,
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

  const raceDraft = new RaceDraftService({
    raceSessions,
    draftRaceSession,
    playerManager,
    draftConfig,
    draftSpeedrunSnapshot,
    integrationStatus,
    log: nodecg.log,
    categoryPresets: categoryPresetProviderFor(spreadsheet),
  });

  const categoryDraft = new CategoryDraftService({
    draftConfig,
    draftSpeedrunSnapshot,
    draftRaceSession,
    integrationStatus,
    mappingsRepository: spreadsheet?.categoryMappingsRepository ?? null,
    presentationRepository: spreadsheet?.categoryPresentationRepository ?? null,
    spreadsheetStatus: spreadsheet?.status ?? null,
    log: nodecg.log,
    refreshSnapshot: (draftRevision) => speedrunSnapshot.refresh(draftRevision),
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
  playerManager: PlayerManagerGateway,
): ParticipantDraftService {
  return new ParticipantDraftService({
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    playerManager,
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
  });
}

export function setupRacePresentationDraftService(
  nodecg: NodeCG,
  playerManager: PlayerManagerGateway,
): RacePresentationDraftService {
  return new RacePresentationDraftService({
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    playerManager,
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
  const playerManager = setupPlayerManagerIntegration(
    nodecg,
    nodecg.Replicant<IntegrationStatus>("integration-status"),
  );
  const spreadsheet = setupSpreadsheetIntegration(nodecg);
  const { discovery: speedrunDiscovery, snapshot: speedrunSnapshot } =
    setupSpeedrunIntegration(nodecg);
  const { raceSessions, raceDraft, categoryDraft } = setupRaceTimeIntegration(
    nodecg,
    spreadsheet,
    playerManager,
    speedrunSnapshot,
  );
  const participantDraft = setupParticipantDraftService(nodecg, playerManager);
  const racePresentationDraft = setupRacePresentationDraftService(nodecg, playerManager);
  const postApplyPersistence = new PostApplyPersistenceService(
    nodecg.Replicant("post-apply-persistence"),
    spreadsheet.raceHistoryRepository,
    nodecg.log,
    () => new Date(),
    spreadsheet.status,
  );
  const broadcastApplyWithPersistence = setupBroadcastApplyService(
    nodecg,
    raceSessions,
    postApplyPersistence,
  );
  registerPersistenceMessages(nodecg, postApplyPersistence);
  nodecg.Replicant<SpreadsheetSettings>("spreadsheet-settings").on("change", () => {
    postApplyPersistence.resume();
  });
  registerSpreadsheetSetupMessages(nodecg);
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
