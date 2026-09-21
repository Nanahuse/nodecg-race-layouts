import type { RaceHistoryPayload } from "../../../domain";
import { sheetAppendRange, sheetReadRange, sheetRowRange, type SpreadsheetClient } from "./client";
import { buildColumnMap, valuesToRawRow } from "./sheet-columns";
import { RACE_HISTORY_COLUMNS, raceHistoryPayloadToRow } from "./race-history-row";
export interface RaceHistoryRepository {
  upsert(history: RaceHistoryPayload, activeRevision: number, appliedAt: string): Promise<void>;
}
export class SpreadsheetRaceHistoryRepository implements RaceHistoryRepository {
  constructor(
    private readonly client: SpreadsheetClient,
    private readonly sheetName: string,
  ) {}
  async upsert(
    history: RaceHistoryPayload,
    activeRevision: number,
    appliedAt: string,
  ): Promise<void> {
    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const header = buildColumnMap(values[0] ?? [], RACE_HISTORY_COLUMNS);
    if (!header.ok) throw new Error("Invalid RaceHistory header");
    const entries = values
      .slice(1)
      .map((raw, i) => ({
        raw,
        row: i + 2,
        parsed: valuesToRawRow(raw, header.map, RACE_HISTORY_COLUMNS),
      }))
      .filter((e) => e.parsed.racetime_url);
    const matches = entries.filter((e) => e.parsed.racetime_url === history.racetimeUrl);
    if (matches.length > 1) throw new Error("Duplicate RaceHistory canonical URL");
    const existing = matches[0];
    const row = raceHistoryPayloadToRow(
      history,
      activeRevision,
      appliedAt,
      existing?.parsed.first_applied_at || appliedAt,
    );
    const output = Array.from(
      { length: Math.max(header.columnCount, RACE_HISTORY_COLUMNS.length) },
      (_, i) => existing?.raw[i] ?? "",
    );
    for (const column of RACE_HISTORY_COLUMNS) output[header.map[column]] = row[column];
    if (existing)
      await this.client.updateValues(
        sheetRowRange(this.sheetName, existing.row, header.columnCount),
        [output],
      );
    else await this.client.appendValues(sheetAppendRange(this.sheetName), [output]);
  }
}
