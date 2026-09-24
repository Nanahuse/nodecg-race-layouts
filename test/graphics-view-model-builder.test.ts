import { describe, expect, it } from "vitest";
import {
  buildLeaderboardPageData,
  buildParticipantListData,
  buildRaceOverlayData,
} from "../src/extension/application/graphics-view-model-builder";
import { makeActiveConfig, makeSpeedrunSnapshot } from "./factories";

const event = { name: "Event", shortName: null, logoUrl: "/logo.png" };
const snapshot = {
  activeRevision: 1,
  snapshot: makeSpeedrunSnapshot({
    personalBests: {
      "src-account-player-1": { timeSeconds: 1, formattedTime: "1:23:45", rank: 37 },
    },
    leaderboard: Array.from({ length: 6 }, (_, i) => ({
      rank: i < 2 ? 10 : i + 6,
      speedrunComUserId: `src-account-player-${i + 1}`,
      speedrunComName: `SRC ${i + 1}`,
      timeSeconds: 1,
      formattedTime: "0:01",
    })),
  }),
};

function nodecgProxy<T>(value: T): T {
  if (Array.isArray(value)) {
    return new Proxy(value.map(nodecgProxy), {}) as T;
  }
  if (typeof value === "object" && value !== null) {
    const detached = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, nodecgProxy(child)]),
    );
    return new Proxy(detached, {} as ProxyHandler<typeof detached>) as T;
  }
  return value;
}

describe("graphics view model builders", () => {
  it("preserves slots, event branding, PB policy and participant order", () => {
    const config = makeActiveConfig({
      raceScreenSlots: { 1: "rt-2", 2: "rt-1", 3: "rt-4", 4: "rt-3" },
    });
    const overlay = buildRaceOverlayData(config, snapshot, event);
    expect(overlay.ok).toBe(true);
    if (!overlay.ok) return;
    expect(overlay.value.players.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    expect(overlay.value.players[0].displayName).toBe("player-2");
    expect(overlay.value.players[0].personalBest).toEqual({ time: null, rank: null });
    expect(overlay.value.event.logoUrl).toBe("/logo.png");
    const list = buildParticipantListData(config, snapshot, event);
    expect(list.ok).toBe(true);
    if (list.ok)
      expect(list.value.participants.map((p) => p.racetimeUserId)).toEqual([
        "rt-1",
        "rt-2",
        "rt-3",
        "rt-4",
      ]);
  });

  it("projects an unassigned slot as an empty HUD without failing the overlay", () => {
    const config = makeActiveConfig({
      raceScreenSlots: { 1: "rt-1", 2: "rt-2", 3: null, 4: null },
    });
    const overlay = buildRaceOverlayData(config, snapshot, event);
    expect(overlay.ok).toBe(true);
    if (!overlay.ok) return;
    expect(overlay.value.players.map((player) => player.displayName)).toEqual([
      "player-1",
      "player-2",
      null,
      null,
    ]);
    expect(overlay.value.players[2].personalBest).toEqual({ time: null, rank: null });
  });

  it("uses the Category Presentation title for the Race overlay", () => {
    const withPresentation = buildRaceOverlayData(
      makeActiveConfig({
        categoryPresentation: {
          title: "Broadcast category title",
          subtitle: null,
          ruleHeading: "Rules",
          ruleLines: [],
          leaderboardHeading: "Leaderboard",
        },
      }),
      snapshot,
      event,
    );
    expect(withPresentation.ok).toBe(true);
    if (withPresentation.ok)
      expect(withPresentation.value.category.name).toBe("Broadcast category title");

    const blankPresentation = buildRaceOverlayData(
      makeActiveConfig({
        categoryPresentation: {
          title: "  ",
          subtitle: null,
          ruleHeading: "Rules",
          ruleLines: [],
          leaderboardHeading: "Leaderboard",
        },
      }),
      snapshot,
      event,
    );
    expect(blankPresentation.ok).toBe(true);
    if (blankPresentation.ok) expect(blankPresentation.value.category.name).toBe("Any%");
  });

  it("keeps all rank-10 ties and supports presentation fallback", () => {
    const result = buildLeaderboardPageData(makeActiveConfig(), snapshot, event);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.leaderboard.filter((entry) => entry.rank === 10)).toHaveLength(3);
    expect(result.value.leaderboard.map((entry) => entry.rank)).toEqual([10, 10, 8, 9, 10]);
    expect(result.value.leaderboard.map((entry) => entry.name)).toEqual([
      "player-1",
      "player-2",
      "player-3",
      "player-4",
      "SRC 5",
    ]);
    expect(result.value.presentation).toMatchObject({
      ruleHeading: null,
      ruleLines: [],
      leaderboardHeading: "Leaderboard",
      sourceLabel: "Speedrun.com",
    });
  });

  it("detaches proxied category rule lines in the leaderboard projection", () => {
    const config = nodecgProxy(
      makeActiveConfig({
        categoryPresentation: {
          title: "Title",
          subtitle: null,
          ruleHeading: "Rules",
          ruleLines: ["test"],
          leaderboardHeading: "Leaderboard",
        },
      }),
    );

    const result = buildLeaderboardPageData(config, snapshot, event);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.presentation.ruleLines).toEqual(["test"]);
      expect(() => structuredClone(result.value)).not.toThrow();
    }
  });

  it("rejects revision mismatch and invalid slots", () => {
    expect(buildRaceOverlayData(makeActiveConfig({ revision: 2 }), snapshot, event).ok).toBe(false);
    expect(
      buildRaceOverlayData(
        makeActiveConfig({ raceScreenSlots: { 1: "missing", 2: "rt-2", 3: "rt-3", 4: "rt-4" } }),
        snapshot,
        event,
      ).ok,
    ).toBe(false);
  });
});
