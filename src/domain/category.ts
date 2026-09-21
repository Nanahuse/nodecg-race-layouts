export type TimingMethod = "realtime" | "realtime_noloads" | "ingame";

/**
 * The Speedrun.com conditions used for the *current race*. This is a distinct
 * concept from a persisted Category Mapping: a broadcast can run with a manual
 * selection even when no saved mapping exists.
 */
export type SpeedrunCategorySelection = {
  gameId: string;
  gameName: string;

  categoryId: string;
  categoryName: string;

  levelId: string | null;

  variables: Record<string, string>;

  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;

  timingMethod: TimingMethod | null;
};

export type CategorySelectionSource = "saved_mapping" | "manual";

export type CategorySelectionState = {
  selection: SpeedrunCategorySelection | null;

  source: CategorySelectionSource | null;

  savedMappingState: "none" | "matches" | "overridden";
};

/** Broadcast content for the leaderboard graphic. Optional by design. */
export type CategoryPresentation = {
  title: string;
  subtitle: string | null;

  ruleHeading: string;
  ruleLines: string[];

  leaderboardHeading: string;
};

/** RaceTime.gg side of a reusable category mapping. */
export type RaceCategoryReference = {
  categorySlug: string;
  categoryName: string;
  goal: string;
};

/**
 * A reusable preset that maps a RaceTime.gg category + goal to a Speedrun.com
 * category selection. This is distinct from the selection currently used by a
 * race (`CategorySelectionState`): the mapping is persisted, the selection is
 * per-race.
 */
export type CategoryMapping = {
  racetime: RaceCategoryReference;
  speedrunCom: SpeedrunCategorySelection;
};
