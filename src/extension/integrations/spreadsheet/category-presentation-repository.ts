import type { CategoryPresentation } from "../../../domain";
import {
  sheetAppendRange,
  sheetReadRange,
  sheetRowRange,
  type SpreadsheetClient,
  type SpreadsheetValues,
} from "./client";
import {
  CATEGORY_PRESENTATION_ROW_ISSUE_CODES,
  CATEGORY_PRESENTATION_SHEET_COLUMNS,
  categoryPresentationSheetRowToEntry,
  categoryPresentationToSheetRow,
  validateCategoryPresentation,
  type CategoryPresentationEntry,
  type CategoryPresentationSheetColumn,
  type CategoryPresentationSheetRow,
} from "./category-presentation-row";
import { SheetValidationError, type SheetIssue } from "./errors";
import { buildColumnMap, valuesToRawRow, type ColumnMap } from "./sheet-columns";

export interface CategoryPresentationRepository {
  find(categorySlug: string, goal: string): Promise<CategoryPresentation | null>;
  upsert(categorySlug: string, goal: string, presentation: CategoryPresentation): Promise<void>;
}

export type SpreadsheetCategoryPresentationRepositoryOptions = {
  sheetName: string;
  now?: () => Date;
};

type CategoryPresentationRowEntry = CategoryPresentationEntry & {
  rowNumber: number;
  rawValues: string[];
};

type ParsedCategoryPresentationSheet = {
  map: ColumnMap<CategoryPresentationSheetColumn>;
  columnCount: number;
  entries: CategoryPresentationRowEntry[];
};

function presentationKey(categorySlug: string, goal: string): string {
  return `${categorySlug.trim()}\u0000${goal.trim()}`;
}

function isBlankRow(values: readonly string[]): boolean {
  return values.every((value) => (value ?? "").trim() === "");
}

function positionRow(
  row: CategoryPresentationSheetRow,
  rawValues: readonly string[],
  map: ColumnMap<CategoryPresentationSheetColumn>,
  columnCount: number,
): string[] {
  const width = Math.max(columnCount, CATEGORY_PRESENTATION_SHEET_COLUMNS.length);
  const output = new Array<string>(width).fill("");
  for (let index = 0; index < width; index += 1) {
    output[index] = rawValues[index] ?? "";
  }
  for (const column of CATEGORY_PRESENTATION_SHEET_COLUMNS) {
    output[map[column]] = row[column];
  }
  return output;
}

export class SpreadsheetCategoryPresentationRepository implements CategoryPresentationRepository {
  private readonly client: SpreadsheetClient;
  private readonly sheetName: string;
  private readonly now: () => Date;

  constructor(
    client: SpreadsheetClient,
    options: SpreadsheetCategoryPresentationRepositoryOptions,
  ) {
    this.client = client;
    this.sheetName = options.sheetName;
    this.now = options.now ?? (() => new Date());
  }

  async find(categorySlug: string, goal: string): Promise<CategoryPresentation | null> {
    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const parsed = this.parse(values);
    const key = presentationKey(categorySlug, goal);
    const entry = parsed.entries.find(
      (candidate) => presentationKey(candidate.categorySlug, candidate.goal) === key,
    );
    return entry?.presentation ?? null;
  }

  async upsert(
    categorySlug: string,
    goal: string,
    presentation: CategoryPresentation,
  ): Promise<void> {
    const incomingIssues = validateCategoryPresentation(presentation);
    if (incomingIssues.length > 0) {
      throw new SheetValidationError(
        this.sheetName,
        incomingIssues.map((issue) => ({ code: issue.code, message: issue.message, row: null })),
      );
    }

    const values = await this.client.readValues(sheetReadRange(this.sheetName));
    const parsed = this.parse(values);

    const row = categoryPresentationToSheetRow(
      categorySlug,
      goal,
      presentation,
      this.now().toISOString(),
    );
    const key = presentationKey(categorySlug, goal);
    const existing = parsed.entries.find(
      (candidate) => presentationKey(candidate.categorySlug, candidate.goal) === key,
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

  private parse(values: SpreadsheetValues): ParsedCategoryPresentationSheet {
    const headerResult = buildColumnMap(values[0] ?? [], CATEGORY_PRESENTATION_SHEET_COLUMNS);
    if (!headerResult.ok) {
      throw new SheetValidationError(this.sheetName, headerResult.issues);
    }

    const { map, columnCount } = headerResult;
    const entries: CategoryPresentationRowEntry[] = [];
    const issues: SheetIssue[] = [];
    const seenKeys = new Map<string, number>();

    for (let index = 1; index < values.length; index += 1) {
      const rawValues = values[index] ?? [];
      if (isBlankRow(rawValues)) {
        continue;
      }

      const rowNumber = index + 1;
      const row = valuesToRawRow(rawValues, map, CATEGORY_PRESENTATION_SHEET_COLUMNS);
      const conversion = categoryPresentationSheetRowToEntry(row);
      if (!conversion.ok) {
        for (const issue of conversion.issues) {
          issues.push({ code: issue.code, message: issue.message, row: rowNumber });
        }
        continue;
      }

      const key = presentationKey(conversion.entry.categorySlug, conversion.entry.goal);
      const previousRow = seenKeys.get(key);
      if (previousRow !== undefined) {
        issues.push({
          code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.duplicateKey,
          message: `Duplicate presentation key "${conversion.entry.categorySlug}" + "${conversion.entry.goal}" (also on row ${previousRow}).`,
          row: rowNumber,
        });
        continue;
      }
      seenKeys.set(key, rowNumber);
      entries.push({ ...conversion.entry, rowNumber, rawValues });
    }

    if (issues.length > 0) {
      throw new SheetValidationError(this.sheetName, issues);
    }

    return {
      map,
      columnCount: Math.max(columnCount, CATEGORY_PRESENTATION_SHEET_COLUMNS.length),
      entries,
    };
  }
}
