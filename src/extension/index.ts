import type { IntegrationStatus, PlayerDirectory } from "../domain";
import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";
import { PlayerDirectoryService } from "./application/player-directory-service";
import { parseBundleConfig } from "./config";
import { GoogleSheetsClient } from "./integrations/spreadsheet/google-sheets-client";
import { SpreadsheetPlayersRepository } from "./integrations/spreadsheet/players-repository";

/**
 * NodeCG extension entry point.
 *
 * Declares the Replicants and, when the bundle is configured, starts a
 * spreadsheet reload. The reload is intentionally not awaited: a slow or
 * failing spreadsheet must never block extension startup.
 */
export = function extension(nodecg: NodeCG): void {
  declareReplicants(nodecg);

  const parsed = parseBundleConfig(nodecg.bundleConfig);
  if (!parsed.ok) {
    nodecg.log.warn(`[spreadsheet.config.invalid] ${parsed.issues.join("; ")}`);
    return;
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
};
