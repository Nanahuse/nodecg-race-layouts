export const SPEEDRUN_GAMES_SEARCH_MESSAGE = "speedrun.games.search";
export const SPEEDRUN_GAME_GET_MESSAGE = "speedrun.game.get";
export const SPEEDRUN_GAME_OPTIONS_MESSAGE = "speedrun.game.options";
export const SPEEDRUN_CATEGORY_VARIABLES_MESSAGE = "speedrun.category.variables";
export type SpeedrunGamesSearchRequest = { query: string; limit?: number };
export type SpeedrunGameRequest = { gameId: string };
export type SpeedrunCategoryVariablesRequest = { categoryId: string };
export type SpeedrunGameSearchResult = { id: string; name: string; abbreviation: string };
export type SpeedrunCategoryOption = {
  id: string;
  name: string;
  type: "per-game" | "per-level";
  miscellaneous: boolean;
};
export type SpeedrunLevelOption = { id: string; name: string };
export type SpeedrunVariableOption = {
  id: string;
  name: string;
  mandatory: boolean;
  userDefined: boolean;
  values: { id: string; label: string }[];
};
export type SpeedrunGameOptions = {
  game: {
    id: string;
    name: string;
    abbreviation: string;
    platformIds: string[];
    regionIds: string[];
    timingMethods: { realtime: boolean; realtimeNoLoads: boolean; ingame: boolean };
  };
  categories: SpeedrunCategoryOption[];
  levels: SpeedrunLevelOption[];
  platforms: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  timingMethods: ("realtime" | "realtime_noloads" | "ingame")[];
};
export type SpeedrunFailure = { ok: false; reason: string; message: string };
export type SpeedrunGamesSearchResponse =
  { ok: true; games: SpeedrunGameSearchResult[] } | SpeedrunFailure;
export type SpeedrunGameOptionsResponse =
  { ok: true; options: SpeedrunGameOptions } | SpeedrunFailure;
export type SpeedrunCategoryVariablesResponse =
  { ok: true; variables: SpeedrunVariableOption[] } | SpeedrunFailure;
