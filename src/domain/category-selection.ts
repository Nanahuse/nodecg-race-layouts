import type {
  CategoryMapping,
  CategorySelectionState,
  SpeedrunCategorySelection,
} from "./category";

function stableVariables(variables: Record<string, string>): string {
  return JSON.stringify(Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Compare the fields that identify a Speedrun.com leaderboard. Display names
 * (`gameName` / `categoryName`) are deliberately excluded.
 */
export function isLeaderboardEquivalent(
  a: SpeedrunCategorySelection | null,
  b: SpeedrunCategorySelection | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.gameId === b.gameId &&
    a.categoryId === b.categoryId &&
    a.levelId === b.levelId &&
    stableVariables(a.variables) === stableVariables(b.variables) &&
    a.platformId === b.platformId &&
    a.regionId === b.regionId &&
    a.emulator === b.emulator &&
    a.timingMethod === b.timingMethod
  );
}

/** Leaderboard-equivalent plus identical display names. */
export function isDisplayIdentical(
  a: SpeedrunCategorySelection | null,
  b: SpeedrunCategorySelection | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    isLeaderboardEquivalent(a, b) && a.gameName === b.gameName && a.categoryName === b.categoryName
  );
}

export function computeSavedMappingState(
  selection: SpeedrunCategorySelection | null,
  savedMapping: CategoryMapping | null,
): CategorySelectionState["savedMappingState"] {
  if (!savedMapping) {
    return "none";
  }
  if (selection !== null && isLeaderboardEquivalent(selection, savedMapping.speedrunCom)) {
    return "matches";
  }
  return "overridden";
}

/** Build the draft selection state for a saved mapping (or none). */
export function categorySelectionFromMapping(
  mapping: CategoryMapping | null,
): CategorySelectionState {
  if (!mapping) {
    return { selection: null, source: null, savedMappingState: "none" };
  }
  return { selection: mapping.speedrunCom, source: "saved_mapping", savedMappingState: "matches" };
}
