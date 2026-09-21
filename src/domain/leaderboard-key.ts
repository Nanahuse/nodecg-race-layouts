import type { SpeedrunCategorySelection, TimingMethod } from "./category";

/**
 * Identity of a Speedrun.com leaderboard. Only fields that affect which
 * leaderboard is being read are included; display names are deliberately
 * excluded so snapshots remain comparable across renames.
 */
export type LeaderboardKey = {
  gameId: string;
  categoryId: string;
  levelId: string | null;

  variables: Record<string, string>;

  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;

  timingMethod: TimingMethod | null;
};

function stableVariables(variables: Record<string, string>): string {
  return JSON.stringify(Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Build the leaderboard key for a category selection. Display names
 * (`gameName` / `categoryName`) are intentionally dropped.
 */
export function leaderboardKeyFromSelection(selection: SpeedrunCategorySelection): LeaderboardKey {
  return {
    gameId: selection.gameId,
    categoryId: selection.categoryId,
    levelId: selection.levelId,
    variables: { ...selection.variables },
    platformId: selection.platformId,
    regionId: selection.regionId,
    emulator: selection.emulator,
    timingMethod: selection.timingMethod,
  };
}

export function leaderboardKeysEqual(a: LeaderboardKey, b: LeaderboardKey): boolean {
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
