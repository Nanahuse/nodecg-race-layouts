import type {
  CategoryMapping,
  CategoryPresentation,
  SpeedrunCategorySelection,
} from "../../src/domain";
import type { CategoryMappingsRepository } from "../../src/extension/integrations/spreadsheet/category-mappings-repository";
import type { CategoryPresentationRepository } from "../../src/extension/integrations/spreadsheet/category-presentation-repository";
import {
  CATEGORY_MAPPING_SHEET_COLUMNS,
  categoryMappingSheetRowToValues,
  emptyCategoryMappingSheetRow,
  type CategoryMappingSheetRow,
} from "../../src/extension/integrations/spreadsheet/category-mappings-row";
import {
  CATEGORY_PRESENTATION_SHEET_COLUMNS,
  categoryPresentationSheetRowToValues,
  emptyCategoryPresentationSheetRow,
  type CategoryPresentationSheetRow,
} from "../../src/extension/integrations/spreadsheet/category-presentation-row";
import type { SpreadsheetValues } from "../../src/extension/integrations/spreadsheet/client";
import type { CategoryPresetProvider } from "../../src/extension/application/category-preset-provider";

export function makeSelection(
  overrides: Partial<SpeedrunCategorySelection> = {},
): SpeedrunCategorySelection {
  return {
    gameId: "j1l9qz1g",
    gameName: "The Legend of Zelda",
    categoryId: "7dgrrxk4",
    categoryName: "Any%",
    levelId: null,
    variables: {},
    platformId: null,
    regionId: null,
    emulator: null,
    timingMethod: "realtime",
    ...overrides,
  };
}

export function makePresentation(
  overrides: Partial<CategoryPresentation> = {},
): CategoryPresentation {
  return {
    title: "Any%",
    subtitle: null,
    ruleHeading: "Rules",
    ruleLines: ["Rule one", "Rule two"],
    leaderboardHeading: "Leaderboard",
    ...overrides,
  };
}

export function makeCategoryMapping(overrides: Partial<CategoryMapping> = {}): CategoryMapping {
  return {
    racetime: {
      categorySlug: "ootr",
      categoryName: "Ocarina of Time Randomizer",
      goal: "Defeat Ganon",
    },
    speedrunCom: makeSelection(),
    ...overrides,
  };
}

export function makeMappingRow(
  overrides: Partial<CategoryMappingSheetRow> = {},
): CategoryMappingSheetRow {
  return {
    ...emptyCategoryMappingSheetRow(),
    racetime_category_slug: "ootr",
    racetime_category_name: "Ocarina of Time Randomizer",
    racetime_goal: "Defeat Ganon",
    src_game_id: "j1l9qz1g",
    src_game_name: "The Legend of Zelda",
    src_category_id: "7dgrrxk4",
    src_category_name: "Any%",
    src_variables: "{}",
    src_timing_method: "realtime",
    updated_at: "2026-09-21T05:30:00.000Z",
    ...overrides,
  };
}

export function makePresentationRow(
  overrides: Partial<CategoryPresentationSheetRow> = {},
): CategoryPresentationSheetRow {
  return {
    ...emptyCategoryPresentationSheetRow(),
    racetime_category_slug: "ootr",
    racetime_goal: "Defeat Ganon",
    display_title: "Any%",
    rule_heading: "Rules",
    rule_text: "Rule one\nRule two",
    leaderboard_heading: "Leaderboard",
    updated_at: "2026-09-21T05:30:00.000Z",
    ...overrides,
  };
}

export function mappingSheetValues(rows: readonly CategoryMappingSheetRow[]): SpreadsheetValues {
  return [[...CATEGORY_MAPPING_SHEET_COLUMNS], ...rows.map(categoryMappingSheetRowToValues)];
}

export function presentationSheetValues(
  rows: readonly CategoryPresentationSheetRow[],
): SpreadsheetValues {
  return [
    [...CATEGORY_PRESENTATION_SHEET_COLUMNS],
    ...rows.map(categoryPresentationSheetRowToValues),
  ];
}

export class FakeCategoryMappingsRepository implements CategoryMappingsRepository {
  mapping: CategoryMapping | null = null;
  findError: Error | null = null;
  upsertError: Error | null = null;
  readonly upserts: CategoryMapping[] = [];

  async find(): Promise<CategoryMapping | null> {
    if (this.findError) {
      throw this.findError;
    }
    return this.mapping;
  }

  async upsert(mapping: CategoryMapping): Promise<void> {
    if (this.upsertError) {
      throw this.upsertError;
    }
    this.upserts.push(mapping);
    this.mapping = mapping;
  }
}

export class FakeCategoryPresentationRepository implements CategoryPresentationRepository {
  presentation: CategoryPresentation | null = null;
  findError: Error | null = null;
  upsertError: Error | null = null;
  readonly upserts: { categorySlug: string; goal: string; presentation: CategoryPresentation }[] =
    [];

  async find(): Promise<CategoryPresentation | null> {
    if (this.findError) {
      throw this.findError;
    }
    return this.presentation;
  }

  async upsert(
    categorySlug: string,
    goal: string,
    presentation: CategoryPresentation,
  ): Promise<void> {
    if (this.upsertError) {
      throw this.upsertError;
    }
    this.upserts.push({ categorySlug, goal, presentation });
    this.presentation = presentation;
  }
}

export class FakeCategoryPresetProvider implements CategoryPresetProvider {
  mapping: CategoryMapping | null = null;
  presentation: CategoryPresentation | null = null;
  error: Error | null = null;

  async findMapping(): Promise<CategoryMapping | null> {
    if (this.error) {
      throw this.error;
    }
    return this.mapping;
  }

  async findPresentation(): Promise<CategoryPresentation | null> {
    if (this.error) {
      throw this.error;
    }
    return this.presentation;
  }
}
