import { describe, expect, it } from "vitest";
import {
  CATEGORY_SELECT_MESSAGE,
  CATEGORY_PRESENTATION_UPDATE_MESSAGE,
} from "../src/protocol/category";
import {
  SPEEDRUN_GAMES_SEARCH_MESSAGE,
  SPEEDRUN_GAME_OPTIONS_MESSAGE,
  SPEEDRUN_CATEGORY_VARIABLES_MESSAGE,
} from "../src/protocol/speedrun";
import { SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE } from "../src/protocol/speedrun-snapshot";

describe("category and snapshot protocols", () => {
  it("keeps dashboard message names stable", () => {
    expect([
      CATEGORY_SELECT_MESSAGE,
      CATEGORY_PRESENTATION_UPDATE_MESSAGE,
      SPEEDRUN_GAMES_SEARCH_MESSAGE,
      SPEEDRUN_GAME_OPTIONS_MESSAGE,
      SPEEDRUN_CATEGORY_VARIABLES_MESSAGE,
      SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE,
    ]).toEqual([
      "category.select",
      "category.presentation.update",
      "speedrun.games.search",
      "speedrun.game.options",
      "speedrun.category.variables",
      "speedrun.snapshot.refresh",
    ]);
  });
});
