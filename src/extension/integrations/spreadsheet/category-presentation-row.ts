import type { CategoryPresentation } from "../../../domain";

export const CATEGORY_PRESENTATION_SHEET_COLUMNS = [
  "racetime_category_slug",
  "racetime_goal",
  "display_title",
  "display_subtitle",
  "rule_heading",
  "rule_text",
  "leaderboard_heading",
  "updated_at",
] as const;

export type CategoryPresentationSheetColumn = (typeof CATEGORY_PRESENTATION_SHEET_COLUMNS)[number];

export type CategoryPresentationSheetRow = {
  [K in CategoryPresentationSheetColumn]: string;
};

export const CATEGORY_PRESENTATION_ROW_ISSUE_CODES = {
  categorySlugMissing: "racetime_category_slug_missing",
  goalMissing: "racetime_goal_missing",
  titleMissing: "display_title_missing",
  ruleHeadingMissing: "rule_heading_missing",
  leaderboardHeadingMissing: "leaderboard_heading_missing",
  duplicateKey: "duplicate_key",
} as const;

export type CategoryPresentationIssue = {
  code: string;
  message: string;
};

export type CategoryPresentationEntry = {
  categorySlug: string;
  goal: string;
  presentation: CategoryPresentation;
};

export type CategoryPresentationConversionResult =
  | { ok: true; entry: CategoryPresentationEntry }
  | { ok: false; issues: CategoryPresentationIssue[] };

function normalizeCell(value: string | undefined): string {
  return (value ?? "").trim();
}

function nullableCell(value: string | undefined): string | null {
  const normalized = normalizeCell(value);
  return normalized === "" ? null : normalized;
}

/**
 * Split a multi-line rule text into lines. CRLF and LF are both handled and
 * empty lines are removed so a trailing newline never produces an empty rule.
 */
export function splitRuleLines(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, "\n");
  return normalized.split("\n").filter((line) => line.trim() !== "");
}

export function emptyCategoryPresentationSheetRow(): CategoryPresentationSheetRow {
  return Object.fromEntries(
    CATEGORY_PRESENTATION_SHEET_COLUMNS.map((column) => [column, ""]),
  ) as CategoryPresentationSheetRow;
}

export function categoryPresentationSheetRowToValues(row: CategoryPresentationSheetRow): string[] {
  return CATEGORY_PRESENTATION_SHEET_COLUMNS.map((column) => row[column]);
}

export function validateCategoryPresentation(
  presentation: CategoryPresentation,
): CategoryPresentationIssue[] {
  const issues: CategoryPresentationIssue[] = [];
  if (presentation.title.trim() === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.titleMissing,
      message: "display_title is required.",
    });
  }
  if (presentation.ruleHeading.trim() === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.ruleHeadingMissing,
      message: "rule_heading is required.",
    });
  }
  if (presentation.leaderboardHeading.trim() === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.leaderboardHeadingMissing,
      message: "leaderboard_heading is required.",
    });
  }
  return issues;
}

export function categoryPresentationToSheetRow(
  categorySlug: string,
  goal: string,
  presentation: CategoryPresentation,
  updatedAt: string,
): CategoryPresentationSheetRow {
  const row = emptyCategoryPresentationSheetRow();
  row.racetime_category_slug = categorySlug;
  row.racetime_goal = goal;
  row.display_title = presentation.title;
  row.display_subtitle = presentation.subtitle ?? "";
  row.rule_heading = presentation.ruleHeading;
  row.rule_text = presentation.ruleLines.join("\n");
  row.leaderboard_heading = presentation.leaderboardHeading;
  row.updated_at = updatedAt;
  return row;
}

export function categoryPresentationSheetRowToEntry(
  row: CategoryPresentationSheetRow,
): CategoryPresentationConversionResult {
  const issues: CategoryPresentationIssue[] = [];

  const categorySlug = normalizeCell(row.racetime_category_slug);
  if (categorySlug === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.categorySlugMissing,
      message: "racetime_category_slug is required.",
    });
  }
  const goal = normalizeCell(row.racetime_goal);
  if (goal === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.goalMissing,
      message: "racetime_goal is required.",
    });
  }

  const title = normalizeCell(row.display_title);
  if (title === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.titleMissing,
      message: "display_title is required.",
    });
  }
  const ruleHeading = normalizeCell(row.rule_heading);
  if (ruleHeading === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.ruleHeadingMissing,
      message: "rule_heading is required.",
    });
  }
  const leaderboardHeading = normalizeCell(row.leaderboard_heading);
  if (leaderboardHeading === "") {
    issues.push({
      code: CATEGORY_PRESENTATION_ROW_ISSUE_CODES.leaderboardHeadingMissing,
      message: "leaderboard_heading is required.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    entry: {
      categorySlug,
      goal,
      presentation: {
        title,
        subtitle: nullableCell(row.display_subtitle),
        ruleHeading,
        ruleLines: splitRuleLines(row.rule_text),
        leaderboardHeading,
      },
    },
  };
}
