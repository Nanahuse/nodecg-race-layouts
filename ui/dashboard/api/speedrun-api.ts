import { nodecg } from "./nodecg-client";
import {
  SPEEDRUN_CATEGORY_VARIABLES_MESSAGE,
  SPEEDRUN_GAME_OPTIONS_MESSAGE,
  SPEEDRUN_GAMES_SEARCH_MESSAGE,
} from "../../../src/protocol/speedrun";
import type {
  SpeedrunCategoryVariablesResponse,
  SpeedrunGameOptionsResponse,
  SpeedrunGamesSearchResponse,
} from "../../../src/protocol/speedrun";
export function createSpeedrunApi() {
  return {
    searchGames: (query: string) =>
      nodecg.sendMessage<SpeedrunGamesSearchResponse>(SPEEDRUN_GAMES_SEARCH_MESSAGE, { query }),
    gameOptions: (gameId: string) =>
      nodecg.sendMessage<SpeedrunGameOptionsResponse>(SPEEDRUN_GAME_OPTIONS_MESSAGE, { gameId }),
    categoryVariables: (categoryId: string) =>
      nodecg.sendMessage<SpeedrunCategoryVariablesResponse>(SPEEDRUN_CATEGORY_VARIABLES_MESSAGE, {
        categoryId,
      }),
  };
}
