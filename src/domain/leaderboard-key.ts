import type { TimingMethod } from "./category";

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
