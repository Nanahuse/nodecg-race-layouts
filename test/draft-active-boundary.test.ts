import { describe, expect, it } from "vitest";
import type { DraftPerson } from "../src/domain";
import { buildActiveConfig } from "../src/extension/application/active-config-builder";
import { makeActiveConfig, makeDraftConfig } from "./factories";
import { makeDraftPerson } from "./support/draft-fakes";

describe("Player Manager snapshot boundary", () => {
  it("keeps canonical Player Manager ids separate from Race Layouts person refs", () => {
    const person: DraftPerson = {
      ...makeDraftPerson("draft-ref", "race-user"),
      playerId: "canonical-player",
      player: { ...makeDraftPerson("draft-ref").player!, playerId: "canonical-player" },
    };
    const draft = {
      ...makeDraftConfig(),
      race: makeActiveConfig().race,
      participants: [{ racetimeUserId: "race-user", personRef: "draft-ref" }],
      persons: { "draft-ref": person },
      categorySelection: {
        selection: makeActiveConfig().categorySelection,
        source: "manual" as const,
        savedMappingState: "none" as const,
      },
    };
    const built = buildActiveConfig(draft, 1);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.config.participants[0]?.playerId).toBe("canonical-player");
      expect(built.config.players["canonical-player"]?.playerId).toBe("canonical-player");
    }
  });
  it("does not accept unresolved DraftPerson values", () => {
    const draft = {
      ...makeDraftConfig(),
      race: makeActiveConfig().race,
      participants: [{ racetimeUserId: "race-user", personRef: "p" }],
      persons: {
        p: {
          ...makeDraftPerson("p", "race-user"),
          playerId: null,
          player: null,
          resolution: "ambiguous" as const,
        },
      },
      categorySelection: {
        selection: makeActiveConfig().categorySelection,
        source: "manual" as const,
        savedMappingState: "none" as const,
      },
    };
    expect(buildActiveConfig(draft, 1).ok).toBe(false);
  });
});
