import type { RaceHistoryPayload } from "../../../domain";
import { sheetAppendRange, sheetReadRange, sheetRowRange, type SpreadsheetClient } from "./client";
import { buildColumnMap, valuesToRawRow } from "./sheet-columns";
import { RACE_HISTORY_COLUMNS, raceHistoryPayloadToRow } from "./race-history-row";
import { parseRaceHistoryRow } from "./race-history-row";
import { RaceHistorySheetValidationError, type SheetIssue } from "./errors";
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
    if (!header.ok) throw new RaceHistorySheetValidationError(this.sheetName, header.issues);
    const issues: SheetIssue[] = [];
    const entries = values
      .slice(1)
      .map((raw, i) => ({
        raw,
        row: i + 2,
        parsed: valuesToRawRow(raw, header.map, RACE_HISTORY_COLUMNS),
      }))
      .filter((e) => Object.values(e.parsed).some((value) => value.trim() !== ""))
      .flatMap((entry) => {
        const result = parseRaceHistoryRow(entry.parsed);
        if (!result.ok) {
          issues.push({
            code: "race_history_row_invalid",
            message: `Row ${entry.row}: ${result.message}`,
            row: entry.row,
          });
          return [];
        }
        return [entry];
      });
    if (issues.length) throw new RaceHistorySheetValidationError(this.sheetName, issues);
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
