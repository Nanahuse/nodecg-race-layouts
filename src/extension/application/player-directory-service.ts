import type {
  IntegrationStatus,
  PlayerDirectory,
  PlayerId,
  PlayerMapping,
  SpreadsheetStatusState,
} from "../../domain";
import { createDefaultIntegrationStatus } from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import type { PlayersRepository } from "../integrations/spreadsheet/players-repository";
import type { SpreadsheetOperationStatusCoordinator } from "./spreadsheet-status-coordinator";

export type PlayerDirectoryServiceOptions = {
  repository: PlayersRepository;
  playerDirectory: Replicant<PlayerDirectory>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
  sheetName: string;
  statusCoordinator?: SpreadsheetOperationStatusCoordinator;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coordinates the spreadsheet repository and the `player-directory` replicant.
 *
 * Key invariant: a failed spreadsheet load never mutates `player-directory`.
 * The previously loaded (possibly persisted) directory is kept intact.
 */
export class PlayerDirectoryService {
  private readonly repository: PlayersRepository;
  private readonly playerDirectory: Replicant<PlayerDirectory>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;
  private readonly sheetName: string;
  private readonly coordinator: SpreadsheetOperationStatusCoordinator | null;

  constructor(options: PlayerDirectoryServiceOptions) {
    this.repository = options.repository;
    this.playerDirectory = options.playerDirectory;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
    this.sheetName = options.sheetName;
    this.coordinator = options.statusCoordinator ?? null;
  }

  getRepository(): PlayersRepository {
    return this.repository;
  }

  async reloadFromSpreadsheet(): Promise<void> {
    const operation = this.coordinator?.begin("loading");
    this.log.info(`[spreadsheet.players.load.started] sheet=${this.sheetName}`);

    try {
      const directory = await this.repository.loadAll();
      const playerCount = Object.keys(directory).length;
      this.playerDirectory.value = directory;
      operation?.success(`Loaded ${playerCount} player(s).`);
      if (!operation) this.setSpreadsheetStatus("idle", `Loaded ${playerCount} player(s).`);
      this.log.info(
        `[spreadsheet.players.load.completed] sheet=${this.sheetName} players=${playerCount}`,
      );
    } catch (error) {
      const message = describeError(error);
      operation?.failure(message);
      if (!operation) this.setSpreadsheetStatus("error", message);
      this.log.error(`[spreadsheet.players.load.failed] sheet=${this.sheetName} error=${message}`);
    }
  }

  async savePlayers(players: readonly PlayerMapping[]): Promise<void> {
    const operation = this.coordinator?.begin("saving");
    this.log.info(
      `[spreadsheet.players.upsert.started] sheet=${this.sheetName} count=${players.length}`,
    );

    try {
      await this.repository.upsert(players);

      const next: PlayerDirectory = { ...this.playerDirectory.value };
      for (const player of players) {
        next[player.playerId] = player;
      }
      this.playerDirectory.value = next;

      operation?.success(`Saved ${players.length} player(s).`);
      if (!operation) this.setSpreadsheetStatus("saved", `Saved ${players.length} player(s).`);
      this.log.info(
        `[spreadsheet.players.upsert.completed] sheet=${this.sheetName} count=${players.length}`,
      );
    } catch (error) {
      const message = describeError(error);
      operation?.failure(message);
      if (!operation) this.setSpreadsheetStatus("error", message);
      this.log.error(
        `[spreadsheet.players.upsert.failed] sheet=${this.sheetName} error=${message}`,
      );
      throw error;
    }
  }

  async deletePlayer(playerId: PlayerId): Promise<void> {
    this.setSpreadsheetStatus("saving", null);

    try {
      await this.repository.delete(playerId);

      const next: PlayerDirectory = { ...this.playerDirectory.value };
      delete next[playerId];
      this.playerDirectory.value = next;

      this.setSpreadsheetStatus("saved", `Deleted "${playerId}".`);
      this.log.info(
        `[spreadsheet.players.delete.completed] sheet=${this.sheetName} player=${playerId}`,
      );
    } catch (error) {
      const message = describeError(error);
      this.setSpreadsheetStatus("error", message);
      this.log.error(
        `[spreadsheet.players.delete.failed] sheet=${this.sheetName} player=${playerId} error=${message}`,
      );
      throw error;
    }
  }

  private setSpreadsheetStatus(state: SpreadsheetStatusState, message: string | null): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = {
      ...current,
      spreadsheet: { state, message },
    };
  }
}
