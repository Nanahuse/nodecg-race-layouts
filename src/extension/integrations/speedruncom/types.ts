import type { SpeedrunComIdentity, TimingMethod } from "../../../domain";

/**
 * Application-facing Speedrun.com discovery types. Provider-specific response
 * shapes are normalized into these before leaving the integration layer.
 */
export type SpeedrunGameSearchResult = {
  id: string;
  name: string;
  abbreviation: string;
};

export type SpeedrunTimingMethods = {
  realtime: boolean;
  realtimeNoLoads: boolean;
  ingame: boolean;
};

export type SpeedrunGameDetail = {
  id: string;
  name: string;
  abbreviation: string;

  platformIds: string[];
  regionIds: string[];

  timingMethods: SpeedrunTimingMethods;
};

export type SpeedrunCategoryType = "per-game" | "per-level";

export type SpeedrunCategoryOption = {
  id: string;
  name: string;
  type: SpeedrunCategoryType;
  miscellaneous: boolean;
};

export type SpeedrunLevelOption = {
  id: string;
  name: string;
};

export type SpeedrunVariableValueOption = {
  id: string;
  label: string;
};

export type SpeedrunVariableOption = {
  id: string;
  name: string;
  mandatory: boolean;
  userDefined: boolean;
  values: SpeedrunVariableValueOption[];
};

export type SpeedrunPlatformOption = {
  id: string;
  name: string;
};

export type SpeedrunRegionOption = {
  id: string;
  name: string;
};

/** Matches the domain `SpeedrunComIdentity` (userId / name / twitchLogin). */
export type SpeedrunUserOption = SpeedrunComIdentity;

export type SpeedrunGameOptions = {
  game: SpeedrunGameDetail;

  categories: SpeedrunCategoryOption[];
  levels: SpeedrunLevelOption[];

  platforms: SpeedrunPlatformOption[];
  regions: SpeedrunRegionOption[];

  timingMethods: TimingMethod[];
};

export type SpeedrunUserSearchMode = "name" | "lookup" | "twitch";
