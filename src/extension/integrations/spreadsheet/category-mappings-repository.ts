import type { CategoryMapping } from "../../../domain";
import {
  sheetAppendRange,
  sheetReadRange,
  sheetRowRange,
  type SpreadsheetClient,
  type SpreadsheetValues,
} from "./client";
import {
  CATEGORY_MAPPING_ROW_ISSUE_CODES,
  CATEGORY_MAPPING_SHEET_COLUMNS,
  categoryMappingSheetRowToMapping,
  categoryMappingToSheetRow,
  validateCategoryMapping,
  type CategoryMappingSheetColumn,
  type CategoryMappingSheetRow,
} from "./category-mappings-row";
import { SheetValidationError, type SheetIssue } from "./errors";
import { buildColumnMap, valuesToRawRow, type ColumnMap } from "./sheet-columns";

export interface CategoryMappingsRepository {
  find(categorySlug: string, goal: string): Promise<CategoryMapping | null>;
  upsert(mapping: CategoryMapping): Promise<void>;
}

export type SpreadsheetCategoryMappingsRepositoryOptions = {
  sheetName: string;
  now?: () => Date;
};

type CategoryMappingEntry = {
  rowNumber: number;
  mapping: CategoryMapping;
  rawValues: string[];
};

type ParsedCategoryMappingsSheet = {
  map: ColumnMap<CategoryMappingSheetColumn>;
  columnCount: number;
  entries: CategoryMappingEntry[];
};

function mappingKey(categorySlug: string, goal: string): string {
  return `${categorySlug.trim()}\u0000${goal.trim()}`;
}

function isBlankRow(values: readonly string[]): boolean {
  return values.every((value) => (value ?? "").trim() === "");
}

function positionRow(
  row: CategoryMappingSheetRow,
  rawValues: readonly string[],
  map: ColumnMap<CategoryMappingSheetColumn>,
  columnCount: number,
): string[] {
  const width = Math.max(columnCount, CATEGORY_MAPPING_SHEET_COLUMNS.length);
  const output = new Array<string>(width).fill("");
  for (let index = 0; index < width; index += 1) {
    output[index] = rawValues[index] ?? "";
  }
  for (const column of CATEGORY_MAPPING_SHEET_COLUMNS) {
    output[map[column]] = row[column];
  }
  return output;
}

export class SpreadsheetCategoryMappingsRepository implements CategoryMappingsRepository {
  private readonly client: SpreadsheetClient;
  private readonly sheetName: string;
  private readonly now: () => Date;

  constructor(client: SpreadsheetClient, options: SpreadsheetCategoryMappingsRepositoryOptions) {
    this.client = client;
    this.sheetName = options.sheetName;
    this.now = options.now ?? (() => new Date());
  }

  async find(categorySlug: string, goal: string): Promise<CategoryMapping | null> {
    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const parsed = this.parse(values);
    const key = mappingKey(categorySlug, goal);
    const entry = parsed.entries.find(
      (candidate) =>
        mappingKey(candidate.mapping.racetime.categorySlug, candidate.mapping.racetime.goal) ===
        key,
    );
    return entry?.mapping ?? null;
  }

  async upsert(mapping: CategoryMapping): Promise<void> {
    const incomingIssues = validateCategoryMapping(mapping);
    if (incomingIssues.length > 0) {
      throw new SheetValidationError(
        this.sheetName,
        incomingIssues.map((issue) => ({ code: issue.code, message: issue.message, row: null })),
      );
    }

    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const parsed = this.parse(values);

    const row = categoryMappingToSheetRow(mapping, this.now().toISOString());
    const key = mappingKey(mapping.racetime.categorySlug, mapping.racetime.goal);
    const existing = parsed.entries.find(
      (candidate) =>
        mappingKey(candidate.mapping.racetime.categorySlug, candidate.mapping.racetime.goal) ===
        key,
    );

    if (existing) {
      await this.client.updateValues(
        sheetRowRange(this.sheetName, existing.rowNumber, parsed.columnCount),
        [positionRow(row, existing.rawValues, parsed.map, parsed.columnCount)],
      );
      return;
    }

    await this.client.appendValues(sheetAppendRange(this.sheetName), [
      positionRow(row, [], parsed.map, parsed.columnCount),
    ]);
  }

  private parse(values: SpreadsheetValues): ParsedCategoryMappingsSheet {
    const headerResult = buildColumnMap(values[0] ?? [], CATEGORY_MAPPING_SHEET_COLUMNS);
    if (!headerResult.ok) {
      throw new SheetValidationError(this.sheetName, headerResult.issues);
    }

    const { map, columnCount } = headerResult;
    const entries: CategoryMappingEntry[] = [];
    const issues: SheetIssue[] = [];
    const seenKeys = new Map<string, number>();

    for (let index = 1; index < values.length; index += 1) {
      const rawValues = values[index] ?? [];
      if (isBlankRow(rawValues)) {
        continue;
      }

      const rowNumber = index + 1;
      const row = valuesToRawRow(rawValues, map, CATEGORY_MAPPING_SHEET_COLUMNS);
      const conversion = categoryMappingSheetRowToMapping(row);
      if (!conversion.ok) {
        for (const issue of conversion.issues) {
          issues.push({ code: issue.code, message: issue.message, row: rowNumber });
        }
        continue;
      }

      const key = mappingKey(
        conversion.mapping.racetime.categorySlug,
        conversion.mapping.racetime.goal,
      );
      const previousRow = seenKeys.get(key);
      if (previousRow !== undefined) {
        issues.push({
          code: CATEGORY_MAPPING_ROW_ISSUE_CODES.duplicateKey,
          message: `Duplicate mapping key "${conversion.mapping.racetime.categorySlug}" + "${conversion.mapping.racetime.goal}" (also on row ${previousRow}).`,
          row: rowNumber,
        });
        continue;
      }
      seenKeys.set(key, rowNumber);
      entries.push({ rowNumber, mapping: conversion.mapping, rawValues });
    }

    if (issues.length > 0) {
      throw new SheetValidationError(this.sheetName, issues);
    }

    return {
      map,
      columnCount: Math.max(columnCount, CATEGORY_MAPPING_SHEET_COLUMNS.length),
      entries,
    };
  }
}
