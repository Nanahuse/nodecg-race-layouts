import type { PlayerDirectory, PlayerId, PlayerMapping } from "../../../domain";
import { PLAYER_DIRECTORY_ISSUE_CODES, validatePlayerDirectory } from "../../../domain";
import {
  sheetAppendRange,
  sheetReadRange,
  sheetRowRange,
  type SpreadsheetClient,
  type SpreadsheetValues,
} from "./client";
import { PlayersSheetValidationError, type PlayersSheetIssue } from "./errors";
import {
  buildHeaderMap,
  PLAYER_SHEET_COLUMNS,
  playerMappingToPlayerSheetRow,
  playerSheetRowToMapping,
  valuesToPlayerSheetRow,
  type HeaderMap,
  type PlayerSheetRow,
} from "./players-row";

export interface PlayersRepository {
  loadAll(): Promise<PlayerDirectory>;
  upsert(players: readonly PlayerMapping[]): Promise<void>;
  delete(playerId: PlayerId): Promise<void>;
}

export type SpreadsheetPlayersRepositoryOptions = {
  sheetName: string;
  /** Injectable clock, primarily for deterministic `updated_at` in tests. */
  now?: () => Date;
};

type PlayerSheetEntry = {
  rowNumber: number;
  player: PlayerMapping;
  rawValues: string[];
};

type ParsedPlayersSheet = {
  headerMap: HeaderMap;
  /** Effective row width, including any extra columns present in the sheet. */
  columnCount: number;
  entries: PlayerSheetEntry[];
  directory: PlayerDirectory;
};

function isBlankRow(values: readonly string[]): boolean {
  return values.every((value) => (value ?? "").trim() === "");
}

function positionRow(
  row: PlayerSheetRow,
  rawValues: readonly string[],
  headerMap: HeaderMap,
  columnCount: number,
): string[] {
  const width = Math.max(columnCount, PLAYER_SHEET_COLUMNS.length);
  const output = new Array<string>(width).fill("");
  for (let index = 0; index < width; index += 1) {
    output[index] = rawValues[index] ?? "";
  }
  for (const column of PLAYER_SHEET_COLUMNS) {
    output[headerMap[column]] = row[column];
  }
  return output;
}

function duplicatePlayerIdIssues(players: readonly PlayerMapping[]): PlayersSheetIssue[] {
  const seen = new Set<string>();
  const issues: PlayersSheetIssue[] = [];
  for (const player of players) {
    if (seen.has(player.playerId)) {
      issues.push({
        code: PLAYER_DIRECTORY_ISSUE_CODES.playerIdDuplicate,
        message: `Duplicate player_id "${player.playerId}".`,
        row: null,
        playerId: player.playerId,
      });
    } else {
      seen.add(player.playerId);
    }
  }
  return issues;
}

export class SpreadsheetPlayersRepository implements PlayersRepository {
  private readonly client: SpreadsheetClient;
  private readonly sheetName: string;
  private readonly now: () => Date;

  constructor(client: SpreadsheetClient, options: SpreadsheetPlayersRepositoryOptions) {
    this.client = client;
    this.sheetName = options.sheetName;
    this.now = options.now ?? (() => new Date());
  }

  async loadAll(): Promise<PlayerDirectory> {
    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    return this.parseDirectory(values).directory;
  }

  async upsert(players: readonly PlayerMapping[]): Promise<void> {
    const incomingIssues = duplicatePlayerIdIssues(players);
    if (incomingIssues.length > 0) {
      throw new PlayersSheetValidationError(this.sheetName, incomingIssues);
    }

    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const parsed = this.parseDirectory(values);

    // Validate the directory that would result from this upsert before writing
    // anything, so external-id conflicts are rejected up front.
    const merged = new Map<string, PlayerMapping>();
    for (const entry of parsed.entries) {
      merged.set(entry.player.playerId, entry.player);
    }
    for (const player of players) {
      merged.set(player.playerId, player);
    }
    const directoryIssues = validatePlayerDirectory([...merged.values()]);
    if (directoryIssues.length > 0) {
      throw new PlayersSheetValidationError(
        this.sheetName,
        directoryIssues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          row: null,
          playerId: issue.playerId,
        })),
      );
    }

    const existingByPlayerId = new Map(
      parsed.entries.map((entry) => [entry.player.playerId, entry]),
    );
    const updatedAt = this.now().toISOString();
    const appends: string[][] = [];

    for (const player of players) {
      const row = playerMappingToPlayerSheetRow(player, updatedAt);
      const existing = existingByPlayerId.get(player.playerId);
      if (existing) {
        await this.client.updateValues(
          sheetRowRange(this.sheetName, existing.rowNumber, parsed.columnCount),
          [positionRow(row, existing.rawValues, parsed.headerMap, parsed.columnCount)],
        );
      } else {
        appends.push(positionRow(row, [], parsed.headerMap, parsed.columnCount));
      }
    }

    if (appends.length > 0) {
      await this.client.appendValues(sheetAppendRange(this.sheetName), appends);
    }
  }

  async delete(playerId: PlayerId): Promise<void> {
    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const headerResult = buildHeaderMap(values[0] ?? []);
    if (!headerResult.ok) {
      throw new PlayersSheetValidationError(this.sheetName, headerResult.issues);
    }

    const playerIdColumn = headerResult.map.player_id;
    const rowsToDelete: number[] = [];
    for (let index = 1; index < values.length; index += 1) {
      const rawValues = values[index] ?? [];
      if ((rawValues[playerIdColumn] ?? "").trim() === playerId) {
        rowsToDelete.push(index + 1);
      }
    }

    // Delete from the bottom up so earlier row numbers stay valid.
    for (const rowNumber of rowsToDelete.sort((a, b) => b - a)) {
      await this.client.deleteRow(this.sheetName, rowNumber);
    }
  }

  private parseDirectory(values: SpreadsheetValues): ParsedPlayersSheet {
    const headerResult = buildHeaderMap(values[0] ?? []);
    if (!headerResult.ok) {
      throw new PlayersSheetValidationError(this.sheetName, headerResult.issues);
    }

    const { map, columnCount } = headerResult;
    const entries: PlayerSheetEntry[] = [];
    const issues: PlayersSheetIssue[] = [];

    for (let index = 1; index < values.length; index += 1) {
      const rawValues = values[index] ?? [];
      if (isBlankRow(rawValues)) {
        continue;
      }

      const rowNumber = index + 1;
      const row = valuesToPlayerSheetRow(rawValues, map);
      const conversion = playerSheetRowToMapping(row);
      if (!conversion.ok) {
        for (const issue of conversion.issues) {
          issues.push({
            code: issue.code,
            message: issue.message,
            row: rowNumber,
            playerId: row.player_id.trim() === "" ? null : row.player_id.trim(),
          });
        }
        continue;
      }

      entries.push({ rowNumber, player: conversion.player, rawValues });
    }

    for (const issue of validatePlayerDirectory(entries.map((entry) => entry.player))) {
      issues.push({
        code: issue.code,
        message: issue.message,
        row: null,
        playerId: issue.playerId,
      });
    }

    if (issues.length > 0) {
      throw new PlayersSheetValidationError(this.sheetName, issues);
    }

    const directory: PlayerDirectory = {};
    for (const entry of entries) {
      directory[entry.player.playerId] = entry.player;
    }

    return {
      headerMap: map,
      columnCount: Math.max(columnCount, PLAYER_SHEET_COLUMNS.length),
      entries,
      directory,
    };
  }
}
