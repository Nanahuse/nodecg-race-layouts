import { nodecg } from "./nodecg-client";
import {
  SPEEDRUN_CATEGORY_VARIABLES_MESSAGE,
  SPEEDRUN_GAME_OPTIONS_MESSAGE,
  SPEEDRUN_GAMES_SEARCH_MESSAGE,
} from "../../../src/protocol/speedrun";
export function createSpeedrunApi() {
  return {
    searchGames: (query: string) =>
      nodecg.sendMessage<{ ok: boolean; games?: unknown[]; message?: string }>(
        SPEEDRUN_GAMES_SEARCH_MESSAGE,
        { query },
      ),
    gameOptions: (gameId: string) =>
      nodecg.sendMessage<{ ok: boolean; options?: unknown; message?: string }>(
        SPEEDRUN_GAME_OPTIONS_MESSAGE,
        { gameId },
      ),
    categoryVariables: (categoryId: string) =>
      nodecg.sendMessage<{ ok: boolean; variables?: unknown[]; message?: string }>(
        SPEEDRUN_CATEGORY_VARIABLES_MESSAGE,
        { categoryId },
      ),
  };
}
