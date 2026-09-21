import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../domain";
import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";
import { PlayerDirectoryService } from "./application/player-directory-service";
import { RaceDraftService } from "./application/race-draft-service";
import { RaceSessionService } from "./application/race-session-service";
import { parseBundleConfig } from "./config";
import { HttpRaceTimeClient } from "./integrations/racetime/client";
import { RaceTimeWebSocketError } from "./integrations/racetime/errors";
import type {
  RaceWatcherScheduler,
  WebSocketFactory,
  WebSocketLike,
} from "./integrations/racetime/watcher";
import { GoogleSheetsClient } from "./integrations/spreadsheet/google-sheets-client";
import { SpreadsheetPlayersRepository } from "./integrations/spreadsheet/players-repository";
import { registerRaceMessages } from "./messages/race-messages";

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
export function setupSpreadsheetIntegration(nodecg: NodeCG): PlayerDirectoryService | null {
  const parsed = parseBundleConfig(nodecg.bundleConfig);
  if (!parsed.ok) {
    nodecg.log.warn(`[spreadsheet.config.invalid] ${parsed.issues.join("; ")}`);
    return null;
  }

  const { spreadsheetId, playersSheet } = parsed.config.spreadsheet;
  const client = GoogleSheetsClient.create({ spreadsheetId });
  const repository = new SpreadsheetPlayersRepository(client, { sheetName: playersSheet });
  const service = new PlayerDirectoryService({
    repository,
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
    sheetName: playersSheet,
  });

  void service.reloadFromSpreadsheet();
  return service;
}

export function setupRaceTimeIntegration(nodecg: NodeCG): RaceDraftService {
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

  const raceDraft = new RaceDraftService({
    raceSessions,
    draftRaceSession: nodecg.Replicant<RaceSession>("draft-race-session"),
    playerDirectory: nodecg.Replicant<PlayerDirectory>("player-directory"),
    draftConfig: nodecg.Replicant<DraftConfig>("draft-config"),
    draftSpeedrunSnapshot: nodecg.Replicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot"),
    integrationStatus: nodecg.Replicant<IntegrationStatus>("integration-status"),
    log: nodecg.log,
  });

  raceSessions.setSessionChangeListener((role, session) => {
    if (role === "draft") {
      raceDraft.handleDraftSessionChange(session);
    }
  });

  return raceDraft;
}

export function bootstrapExtension(nodecg: NodeCG): { raceDraft: RaceDraftService } {
  declareReplicants(nodecg);
  setupSpreadsheetIntegration(nodecg);
  const raceDraft = setupRaceTimeIntegration(nodecg);
  registerRaceMessages(nodecg, raceDraft);
  return { raceDraft };
}
