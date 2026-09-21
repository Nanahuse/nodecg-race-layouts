import type { CategoryPresentation, SpeedrunCategorySelection, TimingMethod } from "./category";

export type CategoryValidationIssue = {
  code: string;
  message: string;
};

const TIMING_METHODS: readonly TimingMethod[] = ["realtime", "realtime_noloads", "ingame"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function nullableString(
  value: unknown,
  code: string,
  label: string,
  issues: CategoryValidationIssue[],
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    issues.push({ code, message: `${label} must be a string or null.` });
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nullableBoolean(
  value: unknown,
  code: string,
  label: string,
  issues: CategoryValidationIssue[],
): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "boolean") {
    issues.push({ code, message: `${label} must be a boolean or null.` });
    return null;
  }
  return value;
}

function parseVariables(value: unknown, issues: CategoryValidationIssue[]): Record<string, string> {
  if (value === null || value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    issues.push({ code: "variables_invalid", message: "variables must be an object." });
    return {};
  }
  const variables: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      issues.push({
        code: "variables_value_invalid",
        message: `variables["${key}"] must be a string.`,
      });
      continue;
    }
    variables[key] = item;
  }
  return variables;
}

export type CategorySelectionValidationResult =
  | { ok: true; selection: SpeedrunCategorySelection }
  | { ok: false; issues: CategoryValidationIssue[] };

export function validateCategorySelection(value: unknown): CategorySelectionValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ code: "selection_invalid", message: "selection must be an object." }],
    };
  }

  const issues: CategoryValidationIssue[] = [];

  const gameId = isNonEmptyString(value.gameId) ? value.gameId.trim() : "";
  if (gameId === "") {
    issues.push({ code: "game_id_missing", message: "selection.gameId is required." });
  }
  const gameName = isNonEmptyString(value.gameName) ? value.gameName.trim() : "";
  if (gameName === "") {
    issues.push({ code: "game_name_missing", message: "selection.gameName is required." });
  }
  const categoryId = isNonEmptyString(value.categoryId) ? value.categoryId.trim() : "";
  if (categoryId === "") {
    issues.push({ code: "category_id_missing", message: "selection.categoryId is required." });
  }
  const categoryName = isNonEmptyString(value.categoryName) ? value.categoryName.trim() : "";
  if (categoryName === "") {
    issues.push({ code: "category_name_missing", message: "selection.categoryName is required." });
  }

  const timingMethodRaw = value.timingMethod;
  let timingMethod: TimingMethod | null = null;
  if (timingMethodRaw !== null && timingMethodRaw !== undefined) {
    if (
      typeof timingMethodRaw === "string" &&
      (TIMING_METHODS as readonly string[]).includes(timingMethodRaw)
    ) {
      timingMethod = timingMethodRaw as TimingMethod;
    } else {
      issues.push({
        code: "timing_method_invalid",
        message: `selection.timingMethod must be one of ${TIMING_METHODS.join(", ")} or null.`,
      });
    }
  }

  const variables = parseVariables(value.variables, issues);
  const levelId = nullableString(value.levelId, "level_id_invalid", "selection.levelId", issues);
  const platformId = nullableString(
    value.platformId,
    "platform_id_invalid",
    "selection.platformId",
    issues,
  );
  const regionId = nullableString(
    value.regionId,
    "region_id_invalid",
    "selection.regionId",
    issues,
  );
  const emulator = nullableBoolean(
    value.emulator,
    "emulator_invalid",
    "selection.emulator",
    issues,
  );

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    selection: {
      gameId,
      gameName,
      categoryId,
      categoryName,
      levelId,
      variables,
      platformId,
      regionId,
      emulator,
      timingMethod,
    },
  };
}

export type CategoryPresentationValidationResult =
  | { ok: true; presentation: CategoryPresentation }
  | { ok: false; issues: CategoryValidationIssue[] };

export function validateCategoryPresentation(value: unknown): CategoryPresentationValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ code: "presentation_invalid", message: "presentation must be an object." }],
    };
  }

  const issues: CategoryValidationIssue[] = [];

  const title = isNonEmptyString(value.title) ? value.title.trim() : "";
  if (title === "") {
    issues.push({ code: "title_missing", message: "presentation.title is required." });
  }
  const ruleHeading = isNonEmptyString(value.ruleHeading) ? value.ruleHeading.trim() : "";
  if (ruleHeading === "") {
    issues.push({
      code: "rule_heading_missing",
      message: "presentation.ruleHeading is required.",
    });
  }
  const leaderboardHeading = isNonEmptyString(value.leaderboardHeading)
    ? value.leaderboardHeading.trim()
    : "";
  if (leaderboardHeading === "") {
    issues.push({
      code: "leaderboard_heading_missing",
      message: "presentation.leaderboardHeading is required.",
    });
  }

  const subtitle = nullableString(
    value.subtitle,
    "subtitle_invalid",
    "presentation.subtitle",
    issues,
  );

  let ruleLines: string[] = [];
  if (value.ruleLines !== undefined) {
    if (!Array.isArray(value.ruleLines)) {
      issues.push({
        code: "rule_lines_invalid",
        message: "presentation.ruleLines must be an array.",
      });
    } else {
      ruleLines = value.ruleLines.map((line, index) => {
        if (typeof line !== "string") {
          issues.push({
            code: "rule_line_invalid",
            message: `presentation.ruleLines[${index}] must be a string.`,
          });
          return "";
        }
        return line;
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    presentation: { title, subtitle, ruleHeading, ruleLines, leaderboardHeading },
  };
}
