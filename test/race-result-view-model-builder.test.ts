import { describe, expect, it } from "vitest";
import { buildRaceResultPageData } from "../src/extension/application/race-result-view-model-builder";
import { makeActiveConfig, sampleRace } from "./factories";
import type { RaceSession } from "../src/domain";

const event = { name: "Event", shortName: null, logoUrl: null };
const session: RaceSession = {
  revision: 1,
  canonicalUrl: null,
  connection: { state: "connected", message: null },
  race: {
    raceId: sampleRace.raceId,
    categorySlug: "any",
    categoryName: "Any%",
    goal: "goal",
    status: "finished",
    entrants: [],
    results: [
      { userId: "rt-1", name: "Changed", place: 2, time: "PT1M2.5S", status: "finished" },
      { userId: "rt-2", name: "two", place: null, time: null, status: "dnf" },
      { userId: "rt-3", name: "three", place: 1, time: null, status: "finished" },
    ],
  },
};

describe("buildRaceResultPageData", () => {
  it("uses active names, live competitive data and stable participant ordering", () => {
    const built = buildRaceResultPageData(makeActiveConfig(), session, event);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.results.map((r) => r.racetimeUserId)).toEqual([
      "rt-3",
      "rt-1",
      "rt-2",
      "rt-4",
    ]);
    expect(built.value.results[1]).toMatchObject({
      name: "player-1",
      time: "1:02.5",
      placeLabel: "2",
    });
    expect(built.value.results[2]).toMatchObject({ placeLabel: "DNF", time: null });
    expect(built.value.results[3]).toMatchObject({ status: "other", placeLabel: "" });
  });

  it("fails for race mismatch and missing players", () => {
    expect(
      buildRaceResultPageData(
        makeActiveConfig(),
        { ...session, race: { ...session.race!, raceId: "other" } },
        event,
      ).ok,
    ).toBe(false);
    expect(buildRaceResultPageData(makeActiveConfig({ players: {} }), session, event).ok).toBe(
      false,
    );
  });
});
