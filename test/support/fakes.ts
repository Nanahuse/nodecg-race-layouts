import type {
  SpreadsheetClient,
  SpreadsheetValues,
} from "../../src/extension/integrations/spreadsheet/client";
import type { NodeCGLogger, Replicant, ReplicantChangeListener } from "../../src/types/nodecg";

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

export function sheetValuesWithHeader(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): SpreadsheetValues {
  return [[...header], ...rows.map((row) => [...row])];
}

export class TrackingReplicant<T> implements Replicant<T> {
  readonly name: string;
  readonly events: string[];
  private currentValue: T;
  private readonly onSet: ((value: T) => void) | undefined;
  private readonly changeListeners: ReplicantChangeListener<T>[] = [];

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
    const previous = this.currentValue;
    this.currentValue = next;
    this.events.push(`set:${this.name}`);
    this.onSet?.(next);
    for (const listener of this.changeListeners) listener(next, previous);
  }

  on(event: "change", listener: ReplicantChangeListener<T>): void {
    if (event === "change") this.changeListeners.push(listener);
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
