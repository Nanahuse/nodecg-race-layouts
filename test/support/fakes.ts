import type { PlayerDirectory, PlayerId, PlayerMapping } from "../../src/domain";
import type {
  SpreadsheetClient,
  SpreadsheetValues,
} from "../../src/extension/integrations/spreadsheet/client";
import type { PlayersRepository } from "../../src/extension/integrations/spreadsheet/players-repository";
import {
  emptyPlayerSheetRow,
  PLAYER_SHEET_COLUMNS,
  playerSheetRowToValues,
  type PlayerSheetRow,
} from "../../src/extension/integrations/spreadsheet/players-row";
import type { NodeCGLogger, Replicant } from "../../src/types/nodecg";

export class FakeSpreadsheetClient implements SpreadsheetClient {
  values: SpreadsheetValues;
  readError: Error | null = null;
  updates: { range: string; values: string[][] }[] = [];
  appends: { range: string; values: string[][] }[] = [];
  deleted: { sheetName: string; rowNumber: number }[] = [];

  constructor(values: SpreadsheetValues = []) {
    this.values = values;
  }

  async readValues(_range: string): Promise<SpreadsheetValues> {
    if (this.readError) {
      throw this.readError;
    }
    return this.values.map((row) => [...row]);
  }

  async updateValues(range: string, values: readonly (readonly string[])[]): Promise<void> {
    this.updates.push({ range, values: values.map((row) => [...row]) });
  }

  async appendValues(range: string, values: readonly (readonly string[])[]): Promise<void> {
    this.appends.push({ range, values: values.map((row) => [...row]) });
  }

  async deleteRow(sheetName: string, rowNumber: number): Promise<void> {
    this.deleted.push({ sheetName, rowNumber });
  }
}

export function makePlayerSheetRow(overrides: Partial<PlayerSheetRow> = {}): PlayerSheetRow {
  return {
    ...emptyPlayerSheetRow(),
    player_id: "player-1",
    racetime_state: "none",
    speedruncom_state: "none",
    twitch_state: "none",
    ...overrides,
  };
}

export function sheetValuesFromRows(rows: readonly PlayerSheetRow[]): SpreadsheetValues {
  return [[...PLAYER_SHEET_COLUMNS], ...rows.map((row) => playerSheetRowToValues(row))];
}

export function sheetValuesWithHeader(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): SpreadsheetValues {
  return [[...header], ...rows.map((row) => [...row])];
}

export class FakePlayersRepository implements PlayersRepository {
  readonly events: string[];
  loadAllResult: PlayerDirectory = {};
  loadAllError: Error | null = null;
  upsertError: Error | null = null;
  deleteError: Error | null = null;
  upserted: PlayerMapping[][] = [];
  deleted: PlayerId[] = [];

  constructor(events: string[] = []) {
    this.events = events;
  }

  async loadAll(): Promise<PlayerDirectory> {
    this.events.push("repository.loadAll");
    if (this.loadAllError) {
      throw this.loadAllError;
    }
    return this.loadAllResult;
  }

  async upsert(players: readonly PlayerMapping[]): Promise<void> {
    this.events.push("repository.upsert");
    if (this.upsertError) {
      throw this.upsertError;
    }
    this.upserted.push([...players]);
  }

  async delete(playerId: PlayerId): Promise<void> {
    this.events.push("repository.delete");
    if (this.deleteError) {
      throw this.deleteError;
    }
    this.deleted.push(playerId);
  }
}

export class TrackingReplicant<T> implements Replicant<T> {
  readonly name: string;
  readonly events: string[];
  private currentValue: T;
  private readonly onSet: ((value: T) => void) | undefined;

  constructor(name: string, value: T, events: string[] = [], onSet?: (value: T) => void) {
    this.name = name;
    this.currentValue = value;
    this.events = events;
    this.onSet = onSet;
  }

  get value(): T {
    return this.currentValue;
  }

  set value(next: T) {
    this.currentValue = next;
    this.events.push(`set:${this.name}`);
    this.onSet?.(next);
  }

  on(): void {
    // no-op for tests
  }
}

export type FakeLogger = {
  logger: NodeCGLogger;
  infoMessages: string[];
  warnMessages: string[];
  errorMessages: string[];
};

export function createFakeLogger(): FakeLogger {
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];
  const stringify = (args: unknown[]): string => args.map((arg) => String(arg)).join(" ");

  return {
    infoMessages,
    warnMessages,
    errorMessages,
    logger: {
      trace: () => undefined,
      debug: () => undefined,
      info: (...args: unknown[]) => {
        infoMessages.push(stringify(args));
      },
      warn: (...args: unknown[]) => {
        warnMessages.push(stringify(args));
      },
      error: (...args: unknown[]) => {
        errorMessages.push(stringify(args));
      },
    },
  };
}
