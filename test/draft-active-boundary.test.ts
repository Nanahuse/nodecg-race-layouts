import { describe, expect, it } from "vitest";

import {
  ACTIVE_CONFIG_ISSUE_CODES,
  hasValidationIssue,
  validateActiveConfig,
  type ActivePlayer,
  type DraftPlayer,
  type PlayerMapping,
  type RaceReference,
} from "../src/domain";
import { isValid } from "./helpers";
import { makeActiveConfig, makeActivePlayer, makeDraftConfig, makeDraftPlayer } from "./factories";

describe("draft / active type boundary", () => {
  it("allows unresolved links on a draft player", () => {
    const draftPlayer: DraftPlayer = {
      ...makeDraftPlayer("p1"),
      racetime: { state: "unresolved" },
    };
    expect(draftPlayer.racetime.state).toBe("unresolved");
  });

  it("does not allow unresolved links on an active player", () => {
    const activePlayer: ActivePlayer = {
      ...makeActivePlayer("p1"),
      // @ts-expect-error Active players cannot carry unresolved account links
      racetime: { state: "unresolved" },
    };
    expect(activePlayer.playerId).toBe("p1");
  });
});

describe("draft schema allows unresolved", () => {
  it("accepts a draft config with unresolved identities", () => {
    const draftConfig = makeDraftConfig({
      players: {
        "player-1": makeDraftPlayer("player-1", {
          twitch: { state: "unresolved" },
          speedrunCom: { state: "unresolved" },
          racetime: { state: "unresolved" },
        }),
      },
    });
    expect(isValid("draft-config", draftConfig)).toBe(true);
  });
});

describe("active schema rejects unresolved", () => {
  it("rejects an active config with an unresolved identity", () => {
    const base = makeActiveConfig();
    const activeConfig = makeActiveConfig({
      players: {
        ...base.players,
        "player-1": {
          ...base.players["player-1"],
          twitch: { state: "unresolved" },
        } as unknown as PlayerMapping,
      },
    });

    expect(isValid("active-config", activeConfig)).toBe(false);
    expect(
      hasValidationIssue(
        validateActiveConfig(activeConfig),
        ACTIVE_CONFIG_ISSUE_CODES.playerIdentityUnresolved,
      ),
    ).toBe(true);
  });

  it("rejects an active participant without a player", () => {
    const base = makeActiveConfig();
    const activeConfig = makeActiveConfig({
      participants: base.participants.map((participant, index) =>
        index === 0 ? { ...participant, playerId: null } : participant,
      ) as unknown as typeof base.participants,
    });

    expect(isValid("active-config", activeConfig)).toBe(false);
    expect(
      hasValidationIssue(
        validateActiveConfig(activeConfig),
        ACTIVE_CONFIG_ISSUE_CODES.participantPlayerUnresolved,
      ),
    ).toBe(true);
  });
});

describe("active config completeness", () => {
  it("rejects an active config without a race", () => {
    const activeConfig = makeActiveConfig({ race: null as unknown as RaceReference });
    expect(hasValidationIssue(validateActiveConfig(activeConfig), "race_missing")).toBe(true);
  });

  it("rejects an active player that cannot resolve a display name", () => {
    const base = makeActiveConfig();
    const activeConfig = makeActiveConfig({
      players: {
        ...base.players,
        "player-1": {
          playerId: "player-1",
          manualDisplayName: null,
          racetime: { state: "none" },
          speedrunCom: { state: "none" },
          twitch: { state: "none" },
        },
      },
    });

    const issues = validateActiveConfig(activeConfig);
    expect(hasValidationIssue(issues, ACTIVE_CONFIG_ISSUE_CODES.displayNameUnresolved)).toBe(true);
  });
});
