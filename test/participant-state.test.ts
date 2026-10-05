import { describe, expect, it } from "vitest";
import { makeDraftPerson } from "./support/draft-fakes";

describe("DraftPerson resolution states", () => {
  it.each(["unresolved", "ambiguous", "conflict"] as const)(
    "keeps %s identities without inventing a Player ID",
    (resolution) => {
      expect(makeDraftPerson("draft-ref", "rt-user", resolution)).toMatchObject({
        ref: "draft-ref",
        playerId: null,
        player: null,
        resolution,
      });
    },
  );
});
