import { describe, expect, it } from "vitest";

import { resolveDisplayName } from "../src/domain";
import { makeActivePlayer, makeDraftPlayer } from "./factories";

describe("resolveDisplayName", () => {
  it("prefers manualDisplayName", () => {
    const player = makeActivePlayer("p1", { manualDisplayName: "Manual Name" });
    expect(resolveDisplayName(player)).toBe("Manual Name");
  });

  it("falls back to the Twitch login", () => {
    const player = makeActivePlayer("p1", {
      manualDisplayName: null,
      twitch: { state: "linked", value: { userId: null, login: "twitch_login" } },
    });
    expect(resolveDisplayName(player)).toBe("twitch_login");
  });

  it("falls back to the Speedrun.com name when Twitch is not linked", () => {
    const player = makeActivePlayer("p1", {
      manualDisplayName: null,
      twitch: { state: "none" },
      speedrunCom: {
        state: "linked",
        value: { userId: "src", name: "SRC Name", twitchLogin: null },
      },
      racetime: { state: "linked", value: { userId: "rt", name: "RT Name", twitchLogin: null } },
    });
    expect(resolveDisplayName(player)).toBe("SRC Name");
  });

  it("falls back to the RaceTime.gg name last", () => {
    const player = makeActivePlayer("p1", {
      manualDisplayName: null,
      twitch: { state: "none" },
      speedrunCom: { state: "none" },
      racetime: { state: "linked", value: { userId: "rt", name: "RT Name", twitchLogin: null } },
    });
    expect(resolveDisplayName(player)).toBe("RT Name");
  });

  it("returns null when no name can be produced", () => {
    const player = makeActivePlayer("p1", {
      manualDisplayName: null,
      twitch: { state: "none" },
      speedrunCom: { state: "none" },
      racetime: { state: "none" },
    });
    expect(resolveDisplayName(player)).toBeNull();
  });

  it("ignores a blank manual name and continues down the priority list", () => {
    const player = makeActivePlayer("p1", { manualDisplayName: "   " });
    expect(resolveDisplayName(player)).toBe("p1");
  });

  it("returns null for a draft player whose links are all unresolved", () => {
    const player = makeDraftPlayer("p1", {
      manualDisplayName: null,
      twitch: { state: "unresolved" },
      speedrunCom: { state: "unresolved" },
      racetime: { state: "unresolved" },
    });
    expect(resolveDisplayName(player)).toBeNull();
  });
});
