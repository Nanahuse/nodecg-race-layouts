import { describe, expect, it } from "vitest";
import {
  parseRaceHistoryRow,
  raceHistoryPayloadToRow,
} from "../src/extension/integrations/spreadsheet/race-history-row";
const payload = {
  racetimeUrl: "https://racetime.gg/game/race",
  raceId: "race",
  categorySlug: "any",
  categoryName: "Any%",
  goal: "goal",
  participants: { "rt-1": "p1", "rt-2": "p2" },
  raceScreenSlots: { 1: "rt-1", 2: "rt-2", 3: "rt-3", 4: "rt-4" } as {
    1: string;
    2: string;
    3: string;
    4: string;
  },
  commentatorPlayerIds: ["commentator"],
};
describe("RaceHistory row validation", () => {
  it("accepts a valid row", () => {
    const row = raceHistoryPayloadToRow(payload, 2, "2026-01-01T00:00:00.000Z");
    row.participants_json = JSON.stringify({
      "rt-1": "p1",
      "rt-2": "p2",
      "rt-3": "p3",
      "rt-4": "p4",
    });
    expect(parseRaceHistoryRow(row).ok).toBe(true);
  });
  it.each([JSON.stringify([]), JSON.stringify({ "rt-1": 1 }), JSON.stringify({ "rt-1": "p1" })])(
    "rejects invalid participants %s",
    (json) => {
      const row = raceHistoryPayloadToRow(payload, 2, "2026-01-01T00:00:00.000Z");
      row.participants_json = json;
      expect(parseRaceHistoryRow(row).ok).toBe(false);
    },
  );
  it("rejects duplicate slots, unknown slot participants and invalid metadata", () => {
    const row = raceHistoryPayloadToRow(payload, 0, "bad");
    row.race_screen_slots_json = JSON.stringify({
      "1": "rt-1",
      "2": "rt-1",
      "3": "rt-3",
      "4": "rt-4",
    });
    expect(parseRaceHistoryRow(row).ok).toBe(false);
  });
});
