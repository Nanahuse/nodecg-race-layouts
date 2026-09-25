import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RaceOverlayData } from "../src/domain";
import { RaceGraphic } from "../ui/graphics/race/race-graphic";

const data: RaceOverlayData = {
  activeRevision: 4,
  event: {
    name: "Summer Race Event",
    shortName: "Summer Race",
    logoUrl: "/event-logo.png",
  },
  category: { name: "Any%" },
  worldRecord: { time: "10:00", holders: ["Runner A", "Runner B"] },
  commentators: [{ playerId: "caster-1", displayName: "Caster", twitchLogin: "caster" }],
  players: [1, 2, 3, 4].map((slot) => ({
    slot: slot as 1 | 2 | 3 | 4,
    displayName: `Player ${slot}`,
    twitchLogin: slot === 1 ? "runner" : null,
    personalBest: { time: slot === 2 ? null : "12:34", rank: slot === 3 ? null : slot },
  })) as RaceOverlayData["players"],
};

function render(value: RaceOverlayData | null = data): string {
  return renderToStaticMarkup(createElement(RaceGraphic, { data: value }));
}

describe("RaceGraphic", () => {
  it("renders the fixed three-column macro layout and all player presentation regions", () => {
    const html = render();

    expect(html.match(/class="video-slot p\d"/g)).toHaveLength(4);
    expect(html.match(/class="video-frame"/g)).toHaveLength(4);
    expect(html.match(/class="slot-tag"/g)).toHaveLength(4);
    expect(html.match(/class="center-column"/g)).toHaveLength(1);
    expect(html.match(/class="event-header"/g)).toHaveLength(1);
    expect(html.match(/class="commentators"/g)).toHaveLength(1);
    expect(html.match(/class="player-pair /g)).toHaveLength(2);
    expect(html.match(/class="player-card player-card-/g)).toHaveLength(4);
    expect(html.match(/class="timer-frame"/g)).toHaveLength(4);
    expect(html.match(/class="player-name"/g)).toHaveLength(4);
    expect(html.match(/class="player-twitch"/g)).toHaveLength(4);
    expect(html.match(/class="player-stats"/g)).toHaveLength(4);
    expect(html.match(/class="category-wr"/g)).toHaveLength(1);
    expect(html.match(/class="category"/g)).toHaveLength(1);
    expect(html.match(/class="world-record"/g)).toHaveLength(1);
  });

  it("renders event branding in the center header and falls back to event text without a logo", () => {
    const html = render();
    const fallback = render({
      ...data,
      event: { name: "Summer Race Event", shortName: "Summer Race", logoUrl: null },
    });

    expect(html).toContain('class="event-logo" src="/event-logo.png" alt="Summer Race"');
    expect(fallback).toContain('<strong class="event-name">Summer Race</strong>');
    expect(html).toContain("Summer Race");
  });

  it("renders player name, optional Twitch, PB fallback, and optional World Rank", () => {
    const html = render();

    expect(html).toContain("Player 1");
    expect(html).toContain("@runner");
    expect(html).toContain("PERSONAL BEST");
    expect(html).toContain("12:34");
    expect(html).toContain("—");
    expect(html).toContain("#1");
    expect(html).not.toContain("#3");
    expect(html).not.toContain("Twitch:");
    expect(html).toContain('<span class="player-twitch"></span>');
  });

  it("renders the World Record label, time, holders, and empty fallback", () => {
    const html = render();
    const missing = render({ ...data, worldRecord: null });

    expect(html).toContain('<span class="world-record-label">WORLD RECORD</span>');
    expect(html).toContain('<strong class="world-record-time">10:00</strong>');
    expect(html).toContain("Runner A / Runner B");
    expect(missing).toContain('<strong class="world-record-time">—</strong>');
    expect(missing).not.toContain("world-record-holders");
  });

  it("keeps the header structure with zero, one, or three commentators", () => {
    const noCommentators = render({ ...data, commentators: [] });
    const oneCommentator = render({ ...data, commentators: [data.commentators[0]!] });
    const threeCommentators = render({
      ...data,
      commentators: ["Alice", "Bob", "Carol"].map((displayName, index) => ({
        playerId: `caster-${index}`,
        displayName,
        twitchLogin: `caster${index}`,
      })),
    });

    for (const html of [noCommentators, oneCommentator, threeCommentators]) {
      expect(html.match(/class="event-header"/g)).toHaveLength(1);
      expect(html.match(/class="commentators"/g)).toHaveLength(1);
    }
    expect(noCommentators).toContain("COMMENTARY");
    expect(oneCommentator).toContain("Caster");
    expect(threeCommentators).toContain("Carol");
    expect(threeCommentators.match(/class="commentator"/g)).toHaveLength(3);
  });

  it("shows rank 20, but keeps PB time without a rank badge when rank is hidden", () => {
    const withinLimit: RaceOverlayData = {
      ...data,
      players: data.players.map((player, index) =>
        index === 0 ? { ...player, personalBest: { time: "1:23:45", rank: 20 } } : player,
      ) as RaceOverlayData["players"],
    };
    const rank20Html = render(withinLimit);
    expect(rank20Html).toContain('<span class="personal-best-time">1:23:45</span>');
    expect(rank20Html).toContain('<span class="rank-badge">#20</span>');

    const beyondLimit: RaceOverlayData = {
      ...withinLimit,
      players: withinLimit.players.map((player, index) =>
        index === 0 ? { ...player, personalBest: { time: "1:23:45", rank: null } } : player,
      ) as RaceOverlayData["players"],
    };
    const noRankHtml = render(beyondLimit);
    expect(noRankHtml).toContain('<span class="personal-best-time">1:23:45</span>');
    expect(noRankHtml).not.toContain('<span class="rank-badge">#20</span>');
    expect(noRankHtml.match(/class="rank-badge"/g)).toHaveLength(2);
  });

  it("omits an unassigned slot's video and card content without compacting the fixed slots", () => {
    const partial: RaceOverlayData = {
      ...data,
      players: data.players.map((player, index) =>
        index === 2
          ? {
              ...player,
              displayName: null,
              twitchLogin: null,
              personalBest: { time: null, rank: null },
            }
          : player,
      ) as RaceOverlayData["players"],
    };
    const html = render(partial);

    expect(html).not.toContain('class="video-slot p3"');
    expect(html).toContain('class="player-card player-card-3 unassigned"');
    expect(html.match(/class="video-slot p\d"/g)).toHaveLength(3);
    expect(html.match(/class="player-card player-card-/g)).toHaveLength(4);
    expect(html.match(/class="timer-frame"/g)).toHaveLength(3);
    expect(html.match(/class="player-name"/g)).toHaveLength(3);
    expect(html).toContain('class="video-slot p1"');
    expect(html).toContain('class="video-slot p2"');
    expect(html).toContain('class="video-slot p4"');
    expect(html).toContain("Player 4");
    expect(html).not.toContain("Player 3");
  });

  it("retains long event, player, category, WR holder, and commentator text in the DOM", () => {
    const maximum: RaceOverlayData = {
      ...data,
      event: {
        name: "An extraordinarily long event name remains in the DOM",
        shortName: null,
        logoUrl: null,
      },
      category: { name: "An extraordinarily long category name remains in the DOM" },
      commentators: ["Alice", "Bob", "Carol"].map((displayName, index) => ({
        playerId: `caster-${index}`,
        displayName: `${displayName} has a very long commentator display name`,
        twitchLogin: `very-long-commentator-login-${index}`,
      })),
      players: data.players.map((player) => ({
        ...player,
        displayName: "A very long player display name that remains in the DOM",
        twitchLogin: "a-very-long-twitch-login-for-this-player",
      })) as RaceOverlayData["players"],
      worldRecord: {
        time: "10:00",
        holders: [
          "A very long World Record holder name remains in the DOM",
          "Another very long World Record holder name remains in the DOM",
        ],
      },
    };
    const html = render(maximum);

    expect(html).toContain("An extraordinarily long event name remains in the DOM");
    expect(html).toContain("A very long player display name that remains in the DOM");
    expect(html).toContain("a-very-long-twitch-login-for-this-player");
    expect(html).toContain("An extraordinarily long category name remains in the DOM");
    expect(html).toContain("Another very long World Record holder name remains in the DOM");
    expect(html).toContain("very-long-commentator-login-2");
  });

  it("renders no content while overlay data is unavailable", () => {
    expect(render(null)).toBe("");
  });
});
