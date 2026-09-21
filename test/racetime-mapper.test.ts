import { describe, expect, it } from "vitest";

import {
  mapRaceDetail,
  normalizeResultStatus,
} from "../src/extension/integrations/racetime/mapper";
import { makeEntrantDto, makeRaceDto } from "./support/racetime-fakes";

describe("normalizeResultStatus", () => {
  it("maps done to finished", () => {
    expect(normalizeResultStatus("done")).toBe("finished");
  });

  it("maps dnf and dq", () => {
    expect(normalizeResultStatus("dnf")).toBe("dnf");
    expect(normalizeResultStatus("dq")).toBe("dq");
  });

  it("maps anything else to other", () => {
    expect(normalizeResultStatus("ready")).toBe("other");
    expect(normalizeResultStatus("not_ready")).toBe("other");
    expect(normalizeResultStatus("in_progress")).toBe("other");
    expect(normalizeResultStatus("partitioned")).toBe("other");
  });
});

describe("mapRaceDetail", () => {
  it("maps category, goal and status", () => {
    const race = mapRaceDetail(
      makeRaceDto({ categorySlug: "ootr", categoryName: "OOTR", goal: "Ganon", status: "open" }),
    );

    expect(race.raceId).toBe("ootr/example-race-1234");
    expect(race.categorySlug).toBe("ootr");
    expect(race.categoryName).toBe("OOTR");
    expect(race.goal).toBe("Ganon");
    expect(race.status).toBe("open");
  });

  it("maps entrant identity and twitch login", () => {
    const race = mapRaceDetail(
      makeRaceDto({
        entrants: [
          makeEntrantDto({ userId: "u1", name: "One", twitchLogin: "one_tv", status: "ready" }),
          makeEntrantDto({ userId: "u2", name: "Two", twitchLogin: null, status: "not_ready" }),
        ],
      }),
    );

    expect(race.entrants).toEqual([
      { userId: "u1", name: "One", twitchLogin: "one_tv", status: "ready" },
      { userId: "u2", name: "Two", twitchLogin: null, status: "not_ready" },
    ]);
  });

  it("maps results from entrants including finish_time and place", () => {
    const race = mapRaceDetail(
      makeRaceDto({
        entrants: [
          makeEntrantDto({
            userId: "u1",
            name: "One",
            status: "done",
            finishTime: "PT1H2M3S",
            place: 1,
          }),
          makeEntrantDto({
            userId: "u2",
            name: "Two",
            status: "dnf",
            finishTime: null,
            place: null,
          }),
        ],
      }),
    );

    expect(race.results).toEqual([
      { userId: "u1", name: "One", place: 1, time: "PT1H2M3S", status: "finished" },
      { userId: "u2", name: "Two", place: null, time: null, status: "dnf" },
    ]);
  });

  it("preserves the API entrant order", () => {
    const race = mapRaceDetail(
      makeRaceDto({
        entrants: [
          makeEntrantDto({ userId: "z" }),
          makeEntrantDto({ userId: "a" }),
          makeEntrantDto({ userId: "m" }),
        ],
      }),
    );

    expect(race.entrants.map((entrant) => entrant.userId)).toEqual(["z", "a", "m"]);
  });
});
