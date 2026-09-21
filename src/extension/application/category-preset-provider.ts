import type { CategoryMapping, CategoryPresentation } from "../../domain";

export type CategoryPreset = {
  mapping: CategoryMapping | null;
  presentation: CategoryPresentation | null;
};

/**
 * Abstraction over the persisted category presets. RaceDraftService depends on
 * this rather than on spreadsheet repositories directly.
 */
export interface CategoryPresetProvider {
  findMapping(categorySlug: string, goal: string): Promise<CategoryMapping | null>;
  findPresentation(categorySlug: string, goal: string): Promise<CategoryPresentation | null>;
}

export const nullCategoryPresetProvider: CategoryPresetProvider = {
  findMapping: async () => null,
  findPresentation: async () => null,
};

export const EMPTY_CATEGORY_PRESET: CategoryPreset = { mapping: null, presentation: null };
