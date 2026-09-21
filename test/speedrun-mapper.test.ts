import { describe, expect, it } from "vitest";

import { SpeedrunComPayloadError } from "../src/extension/integrations/speedruncom/errors";
import {
  extractTwitchLogin,
  mapCategory,
  mapGameDetail,
  mapGameSearchResult,
  mapLevel,
  mapPlatform,
  mapRegion,
  mapUser,
  mapVariable,
} from "../src/extension/integrations/speedruncom/mapper";
import {
  categoryRecord,
  gameRecord,
  levelRecord,
  platformRecord,
  regionRecord,
  userRecord,
  variableRecord,
} from "./support/speedrun-fakes";

describe("mapGameSearchResult", () => {
  it("maps id, name and abbreviation", () => {
    expect(mapGameSearchResult(gameRecord())).toEqual({
      id: "game-1",
      name: "Super Mario Sunshine",
      abbreviation: "sms",
    });
  });

  it("rejects a missing international name", () => {
    expect(() => mapGameSearchResult(gameRecord({ names: {} }))).toThrow(SpeedrunComPayloadError);
  });

  it("rejects a wrong abbreviation type", () => {
    expect(() => mapGameSearchResult(gameRecord({ abbreviation: 5 }))).toThrow(
      SpeedrunComPayloadError,
    );
  });
});

describe("mapGameDetail", () => {
  it("maps platform ids, region ids and timing methods", () => {
    const detail = mapGameDetail(gameRecord());
    expect(detail.platformIds).toEqual(["platform-1"]);
    expect(detail.regionIds).toEqual(["region-1"]);
    expect(detail.timingMethods).toEqual({
      realtime: true,
      realtimeNoLoads: true,
      ingame: false,
    });
  });

  it("maps ingame", () => {
    const detail = mapGameDetail(gameRecord({ ruleset: { "run-times": ["ingame"] } }));
    expect(detail.timingMethods).toEqual({
      realtime: false,
      realtimeNoLoads: false,
      ingame: true,
    });
  });

  it("ignores unsupported timing methods", () => {
    const detail = mapGameDetail(gameRecord({ ruleset: { "run-times": ["realtime", "weird"] } }));
    expect(detail.timingMethods.realtime).toBe(true);
    expect(detail.timingMethods.realtimeNoLoads).toBe(false);
  });

  it("tolerates a missing ruleset", () => {
    const detail = mapGameDetail(gameRecord({ ruleset: undefined }));
    expect(detail.timingMethods).toEqual({
      realtime: false,
      realtimeNoLoads: false,
      ingame: false,
    });
  });
});

describe("mapCategory", () => {
  it("maps per-game and per-level with miscellaneous", () => {
    expect(mapCategory(categoryRecord())).toEqual({
      id: "category-1",
      name: "Any%",
      type: "per-game",
      miscellaneous: false,
    });
    expect(mapCategory(categoryRecord({ type: "per-level", miscellaneous: true }))).toEqual({
      id: "category-1",
      name: "Any%",
      type: "per-level",
      miscellaneous: true,
    });
  });

  it("rejects a malformed type", () => {
    expect(() => mapCategory(categoryRecord({ type: "other" }))).toThrow(SpeedrunComPayloadError);
  });
});

describe("mapLevel", () => {
  it("maps id and name", () => {
    expect(mapLevel(levelRecord())).toEqual({ id: "level-1", name: "Bianco Hills" });
  });

  it("rejects a malformed entry", () => {
    expect(() => mapLevel({ id: "level-1" })).toThrow(SpeedrunComPayloadError);
  });
});

describe("mapVariable", () => {
  it("maps mandatory, userDefined and values", () => {
    const variable = mapVariable(variableRecord());
    expect(variable.mandatory).toBe(true);
    expect(variable.userDefined).toBe(false);
    expect(variable.values).toEqual([
      { id: "value-1", label: "150cc" },
      { id: "value-2", label: "200cc" },
    ]);
  });

  it("maps an optional user-defined variable", () => {
    const variable = mapVariable(
      variableRecord({
        mandatory: false,
        "user-defined": true,
        values: { values: {}, default: null },
      }),
    );
    expect(variable.mandatory).toBe(false);
    expect(variable.userDefined).toBe(true);
    expect(variable.values).toEqual([]);
  });

  it("falls back to the value id when the label is missing", () => {
    const variable = mapVariable(variableRecord({ values: { values: { "value-1": {} } } }));
    expect(variable.values).toEqual([{ id: "value-1", label: "value-1" }]);
  });

  it("rejects a malformed value entry", () => {
    expect(() =>
      mapVariable(variableRecord({ values: { values: { "value-1": "nope" } } })),
    ).toThrow(SpeedrunComPayloadError);
  });
});

describe("mapPlatform / mapRegion", () => {
  it("maps id and name", () => {
    expect(mapPlatform(platformRecord())).toEqual({ id: "platform-1", name: "Nintendo GameCube" });
    expect(mapRegion(regionRecord())).toEqual({ id: "region-1", name: "USA / NTSC" });
  });
});

describe("mapUser / extractTwitchLogin", () => {
  it("maps a user with Twitch", () => {
    expect(mapUser(userRecord())).toEqual({
      userId: "user-1",
      name: "chewdiggy",
      twitchLogin: "chewdiggy",
    });
  });

  it("maps a user without Twitch", () => {
    expect(mapUser(userRecord({ twitch: null }))).toEqual({
      userId: "user-1",
      name: "chewdiggy",
      twitchLogin: null,
    });
  });

  it("returns null for a malformed social URI", () => {
    expect(mapUser(userRecord({ twitch: { uri: "https://example.com/not-twitch" } }))).toEqual({
      userId: "user-1",
      name: "chewdiggy",
      twitchLogin: null,
    });
  });

  it("rejects a missing user id", () => {
    expect(() => mapUser(userRecord({ id: undefined }))).toThrow(SpeedrunComPayloadError);
  });

  it("extracts the login from common URL shapes", () => {
    expect(extractTwitchLogin("https://www.twitch.tv/chewdiggy")).toBe("chewdiggy");
    expect(extractTwitchLogin("https://twitch.tv/chewdiggy/")).toBe("chewdiggy");
    expect(extractTwitchLogin("https://example.com/chewdiggy")).toBeNull();
    expect(extractTwitchLogin("not a url")).toBeNull();
    expect(extractTwitchLogin(null)).toBeNull();
  });
});
